// New game and campaign choice. The kernel CLI creates the campaign; the
// server checks every field of the browser's request against the world
// package first, so the CLI only ever sees ids and numbers it can trust.
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { CAMPAIGN_ROOT, CAMPAIGNS_DIR, ID_RE, ROOT } from './config.mjs';
import { playerOf } from './campaigns.mjs';
import { readPostJson, sendIssues, sendJson, serverIssue } from './http.mjs';
import { parseCli, runCli } from './kernel.mjs';
import { DEFAULT_DIFFICULTY, SEED_MAX, findWorld } from './worlds.mjs';

const FIELDS = new Set(['world', 'seed', 'people', 'rivals', 'difficulty', 'language', 'id']);
const bad = (path, message, params) => serverIssue('format', message, { path, params });
const off = (path, message, params) => serverIssue('target', message, { path, params });

/**
 * The CLI arguments of a new game, or { issues } for a request that names
 * anything the package does not offer. Defaults: rivals all other templates,
 * difficulty normal, language the package's own locale.
 */
export async function newGameArgs(body) {
  const issues = [];
  for (const k of Object.keys(body)) if (!FIELDS.has(k)) issues.push(bad(`/${k}`, `unknown field "${k}"`, { reason: 'unknown-field', field: k }));
  if (typeof body.world !== 'string' || !ID_RE.test(body.world)) return { issues: [...issues, bad('/world', 'world must be a world package id', { reason: 'id' })] };
  const world = await findWorld(body.world);
  if (!world) return { issues: [...issues, off('/world', `world package "${body.world}" not found`, { reason: 'unknown-world', world: body.world })] };

  if (!Number.isSafeInteger(body.seed) || body.seed < 0 || body.seed > SEED_MAX) {
    issues.push(bad('/seed', `seed must be an integer from 0 to ${SEED_MAX}`, { reason: 'seed-range', min: 0, max: SEED_MAX }));
  }
  const templateIds = world.templates.map((t) => t.id);
  const people = body.people;
  if (typeof people !== 'string' || !templateIds.includes(people)) {
    issues.push(off('/people', 'people must be a start template of the world', { reason: 'unknown-template', choices: templateIds }));
  }
  const others = templateIds.filter((t) => t !== people);
  let rivals = others;
  if (body.rivals !== undefined) {
    const r = body.rivals;
    if (!Array.isArray(r) || r.length < 1 || r.length > others.length || r.some((x) => typeof x !== 'string')) {
      issues.push(bad('/rivals', `rivals must list 1 to ${others.length} start templates`, { reason: 'rivals-count', min: 1, max: others.length }));
    } else if (new Set(r).size !== r.length) {
      issues.push(bad('/rivals', 'rivals must not repeat a template', { reason: 'rivals-duplicate' }));
    } else {
      r.forEach((x, i) => {
        if (!others.includes(x)) issues.push(off(`/rivals/${i}`, `"${x}" is no rival template of this game`, { reason: x === people ? 'rival-is-player' : 'unknown-template', choices: others }));
      });
      rivals = templateIds.filter((t) => r.includes(t));
    }
  }
  const difficulty = body.difficulty ?? DEFAULT_DIFFICULTY;
  if (!world.difficulties.includes(difficulty)) {
    issues.push(off('/difficulty', 'unknown difficulty', { reason: 'unknown-difficulty', choices: world.difficulties }));
  }
  const language = body.language ?? world.languages[0];
  if (typeof language !== 'string' || !world.languages.includes(language)) {
    issues.push(off('/language', 'the world has no labels in this language', { reason: 'unknown-language', choices: world.languages }));
  }
  if (body.id !== undefined && (typeof body.id !== 'string' || !ID_RE.test(body.id))) {
    issues.push(bad('/id', `campaign id must match ${ID_RE.source}`, { reason: 'id' }));
  }
  if (issues.length) return { issues };
  const args = ['new', world.id, '--seed', String(body.seed), '--as', people, '--difficulty', difficulty, '--lang', language];
  // All rivals is the CLI default; the flag goes along only for a narrower choice.
  if (rivals.length !== others.length) args.push('--rivals', rivals.join(','));
  return { args, world: world.id, id: body.id ?? null };
}

// Windows folds case and trailing dots, as engine/cli.mjs new does.
const fold = (name) => name.toLowerCase().replace(/[. ]+$/, '');

async function takenIds() {
  const names = await readdir(CAMPAIGNS_DIR).catch(() => []);
  return new Set(names.map(fold));
}

/** "<world>-<n>" with the smallest free n, cut so the id stays within the pattern. */
function freeId(world, taken) {
  for (let n = 1; ; n++) {
    const suffix = `-${n}`;
    const id = `${world.slice(0, 41 - suffix.length)}${suffix}`;
    if (!taken.has(id)) return id;
  }
}

// One creation at a time, so two requests never pick the same free id.
let creating = Promise.resolve();

/** POST /api/campaigns { world, seed, people, rivals?, difficulty?, language?, id? } -> 201 { id }. */
export async function handleCreate(req, res) {
  const body = await readPostJson(req, res);
  if (!body) return;
  const plan = await newGameArgs(body);
  if (plan.issues) return sendIssues(res, 400, plan.issues);
  const job = creating.then(async () => {
    const taken = await takenIds();
    if (plan.id && taken.has(plan.id)) return { status: 409, issues: [serverIssue('duplicate', `campaign "${plan.id}" already exists`, { path: '/id', params: { id: plan.id } })] };
    const id = plan.id ?? freeId(plan.world, taken);
    const out = parseCli(await runCli(id, [...plan.args, '--id', id, '--json']));
    if (!out) return { status: 500, issues: [serverIssue('server.cli', 'new produced no result')] };
    if (out.exit === 0) return { status: 201, body: { id } };
    const issues = Array.isArray(out.issues) && out.issues.length ? out.issues : [serverIssue('server.cli', `new failed with exit ${out.exit}`)];
    const status = issues.some((i) => i?.code === 'duplicate') ? 409 : out.exit === 1 ? 500 : 400;
    return { status, issues };
  });
  creating = job.catch(() => {});
  const r = await job;
  return r.body ? sendJson(res, r.status, r.body) : sendIssues(res, r.status, r.issues);
}

/** POST /api/campaigns/<cid>/activate {}: records the campaign as the player's choice for /zug. */
export async function handleActivate(req, res, [cid]) {
  const body = await readPostJson(req, res);
  if (!body) return;
  if (!ID_RE.test(cid) || !(await playerOf(cid))) {
    return sendIssues(res, 404, [serverIssue('server.unknown_campaign', 'unknown campaign', { path: '/campaign', params: { campaign: cid } })]);
  }
  execFile(process.execPath, ['tools/harness/active-campaign.mjs', '--set', cid, '--root', CAMPAIGN_ROOT], {
    cwd: ROOT, windowsHide: true, timeout: 30_000,
  }, (err, stdout) => {
    let out = null;
    try {
      out = JSON.parse(stdout);
    } catch {
      // no JSON: reported below
    }
    if (out?.campaign) return sendJson(res, 200, out.campaign === cid ? { id: cid, active: true, via: out.via } : { id: cid, active: false, current: out.campaign, via: out.via });
    // A parsed answer without a campaign is a refusal of the tool, anything else a failure.
    sendIssues(res, out ? 409 : 500, [serverIssue('server.cli', out?.reason ?? `activate produced no result${err ? ` (${err.code})` : ''}`)]);
  });
}

// Realm drafts and previews are pure. Only an explicit start installs an
// immutable package and asks the kernel CLI to create and open a campaign.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, isAbsolute, sep } from 'node:path';
import { CREATION_VERSION, compileRealm, creationDraft, normalizeCreation } from '../engine/creation/realm.js';
import { validateWorldPackage, kernelLabelKeys } from '../engine/content/validate.js';
import { makeEnv } from '../engine/core/env.js';
import { hashValue } from '../engine/core/hash.js';
import { canon } from '../engine/core/canon.js';
import { createCampaign, emptyDraft, open, preview } from '../engine/core/turn.js';
import { projectFor } from '../engine/core/project.js';
import { parseKey, tileAt } from '../engine/world/index.js';
import { readJson, renameWithRetry, withLock, writeJsonAtomic } from '../engine/harness/io.js';
import { CAMPAIGN_ROOT, CAMPAIGNS_DIR, ROOT } from './config.mjs';
import { readPostJson, sendIssues, sendJson, serverIssue } from './http.mjs';
import { parseCli, runCli } from './kernel.mjs';

const FILES = {
  welt: 'welt.json', regeln: 'regeln.json', labels: 'labels.json', style: 'style.json',
  entwicklungen: 'content/entwicklungen.json', ereignisse: 'content/ereignisse.json', bestimmungen: 'content/bestimmungen.json',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{16}$/;
const bad = (path, reason) => serverIssue('format', reason, { path, params: { reason } });
const inside = (parent, child) => {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep));
};
const failure = (status, issues) => ({ status, issues });

function fields(body, allowed) {
  return Object.keys(body).filter((key) => !allowed.includes(key)).map((key) => bad('/' + key, 'unknown-field'));
}

function trustedBase() {
  const base = join(ROOT, 'welten', 'hochland');
  const pack = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, JSON.parse(readFileSync(join(base, file), 'utf8'))]));
  pack.labelsEn = JSON.parse(readFileSync(join(base, 'labels.en.json'), 'utf8'));
  return pack;
}

function planRealm(value) {
  const normalized = normalizeCreation(value);
  if (normalized.issues.length) return { issues: normalized.issues };
  const draft = normalized.draft;
  const pack = compileRealm(draft, trustedBase());
  const issues = validateWorldPackage(pack, { labelKeys: kernelLabelKeys() }).filter((issue) => issue.severity === 'error');
  if (issues.length) return { issues };
  const env = makeEnv({ welt: pack.welt, regeln: pack.regeln, labels: pack.labels, content: pack });
  const player = pack.regeln.peopleTemplates[0].id;
  let created;
  try {
    created = createCampaign(env, { id: 'realm-preview', seed: draft.seed, player, difficulty: draft.difficulty, language: draft.language });
  } catch (error) {
    if (/no start tile|not enough start tiles/.test(error.message)) return { issues: [serverIssue('target', 'No valid starting position was found for this seed and landscape', { path: '/seed', params: { reason: 'no-start-tile' } })] };
    throw error;
  }
  const opened = open(created.state, env);
  if (!opened.ok) return { issues: opened.issues };
  const view = projectFor(opened.state, env, player);
  const forecast = preview(view, env, emptyDraft(view, player), { as: player });
  const world = env.world(draft.seed);
  const tiles = Object.keys(view.map.known[player]).map((key) => {
    const { q, r } = parseKey(key);
    return { key, ...tileAt(world, q, r) };
  });
  const fingerprint = hashValue({ version: CREATION_VERSION, draft, pack });
  return { draft, fingerprint, view, tiles, pack, forecast };
}

export async function handleRealmDraft(req, res) {
  const body = await readPostJson(req, res);
  if (!body) return;
  const issues = fields(body, ['world', 'people', 'language', 'seed']);
  for (const key of ['world', 'people']) {
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 3000) issues.push(bad('/' + key, 'description'));
  }
  if (body.language !== undefined && !['de', 'en'].includes(body.language)) issues.push(bad('/language', 'language'));
  if (body.seed !== undefined && (!Number.isInteger(body.seed) || body.seed < 0 || body.seed > 0xffffffff)) issues.push(bad('/seed', 'seed-range'));
  if (issues.length) return sendIssues(res, 400, issues);
  try {
    const normalized = normalizeCreation(creationDraft(body));
    if (normalized.issues.length) return sendIssues(res, 400, normalized.issues);
    return sendJson(res, 200, { ok: true, draft: normalized.draft });
  } catch (error) {
    return sendIssues(res, error.issues ? 400 : 500, error.issues ?? [serverIssue('server.cli', 'Realm draft could not be prepared')]);
  }
}

export async function handleRealmPreview(req, res) {
  const body = await readPostJson(req, res);
  if (!body) return;
  const issues = fields(body, ['draft']);
  if (issues.length) return sendIssues(res, 400, issues);
  try {
    const plan = planRealm(body.draft);
    if (plan.issues) return sendIssues(res, 400, plan.issues);
    return sendJson(res, 200, { ok: true, ...plan });
  } catch (error) {
    return sendIssues(res, error.issues ? 400 : 500, error.issues ?? [serverIssue('server.cli', 'Realm preview could not be prepared')]);
  }
}

/** Check every existing path segment before writing through it on Windows. */
function ownedDirectory(...parts) {
  const root = realpathSync(CAMPAIGN_ROOT);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    mkdirSync(current, { recursive: true });
    current = realpathSync(current);
    if (!inside(root, current)) throw new Error('Authoring directory escapes campaign root');
  }
  return current;
}

function readPack(dir) {
  const real = realpathSync(dir);
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => {
    const target = realpathSync(join(real, file));
    if (!inside(real, target) || !statSync(target).isFile()) throw new Error('Invalid installed package file');
    return [key, JSON.parse(readFileSync(target, 'utf8'))];
  }));
}

function installPack(pack) {
  const base = ownedDirectory('welten');
  return withLock(base, 'realm-install', () => {
    const target = join(base, pack.welt.id);
    if (existsSync(target)) {
      if (!inside(base, realpathSync(target)) || canon(readPack(target)) !== canon(pack)) throw new Error('Immutable Realm package differs');
      return;
    }
    const stage = mkdtempSync(join(base, '.realm-'));
    try {
      mkdirSync(join(stage, 'content'));
      for (const [key, file] of Object.entries(FILES)) writeFileSync(join(stage, file), JSON.stringify(pack[key], null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
      renameWithRetry(stage, target);
    } finally {
      if (existsSync(stage) && inside(base, realpathSync(stage))) rmSync(stage, { recursive: true, force: true });
    }
  });
}

// The offline reset rotates this token so retries cannot recreate deleted games.
function libraryGeneration() {
  const generation = readJson(join(CAMPAIGNS_DIR, 'index.json'), { fallback: null })?.generation ?? null;
  if (generation !== null && (typeof generation !== 'string' || !/^[0-9a-f]{32}$/.test(generation))) throw new Error('Invalid campaign library generation');
  return generation;
}

function receiptFor(key, plan) {
  const dir = ownedDirectory('authoring', 'receipts');
  const path = join(dir, key + '.json');
  return withLock(dir, 'realm-start', () => {
    if (existsSync(path)) {
      if (!inside(dir, realpathSync(path))) throw new Error('Invalid start receipt path');
      const existing = JSON.parse(readFileSync(path, 'utf8'));
      if (existing.format !== 'realmcraft-start' || existing.version !== 1 || existing.startKey !== key || existing.fingerprint !== plan.fingerprint || existing.draftHash !== hashValue(plan.draft) || existing.id !== 'realm-' + key.replaceAll('-', '') || existing.world !== plan.pack.welt.id || !['reserved', 'ready'].includes(existing.state)) {
        return failure(409, [bad('/startKey', 'start-key-conflict')]);
      }
      if ((existing.generation ?? null) !== libraryGeneration()) return failure(409, [bad('/startKey', 'library-reset')]);
      return { path, receipt: existing };
    }
    const receipt = {
      format: 'realmcraft-start', version: 1, startKey: key, fingerprint: plan.fingerprint,
      generation: libraryGeneration(), draftHash: hashValue(plan.draft), id: 'realm-' + key.replaceAll('-', ''), world: plan.pack.welt.id, state: 'reserved',
    };
    writeJsonAtomic(path, receipt);
    return { path, receipt };
  });
}

async function startRealm(plan, startKey) {
  const reserved = receiptFor(startKey, plan);
  if (reserved.issues) return reserved;
  const { path, receipt } = reserved;
  installPack(plan.pack);
  const lockPath = join(CAMPAIGNS_DIR, receipt.id, 'world.lock.json');
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    if (lock.id !== receipt.world || lock.campaign !== receipt.id) return failure(409, [bad('/startKey', 'campaign-conflict')]);
  } else {
    if (existsSync(join(CAMPAIGNS_DIR, receipt.id))) return failure(409, [bad('/startKey', 'incomplete-campaign')]);
    const made = parseCli(await runCli(receipt.id, ['new', receipt.world, '--seed', String(plan.draft.seed), '--as', plan.pack.regeln.peopleTemplates[0].id,
      '--difficulty', plan.draft.difficulty, '--lang', plan.draft.language, '--id', receipt.id, '--json']));
    if (!made || made.exit !== 0) return failure(500, made?.issues ?? [serverIssue('server.cli', 'Realm campaign could not be created')]);
  }
  let status = parseCli(await runCli(receipt.id, ['status', '--campaign', receipt.id, '--json']));
  if (!status || status.exit !== 0) return failure(500, status?.issues ?? [serverIssue('server.cli', 'Realm campaign status could not be read')]);
  if (status.phase === 'agents' && status.turn === 0 && status.rev === 0) {
    const opened = parseCli(await runCli(receipt.id, ['open', '--campaign', receipt.id, '--json']));
    if (!opened || opened.exit !== 0) return failure(500, opened?.issues ?? [serverIssue('server.cli', 'Realm campaign could not be opened')]);
    status = opened;
  }
  if (receipt.state !== 'ready' && status.phase !== 'planning') return failure(409, [bad('/startKey', 'campaign-not-ready')]);
  writeJsonAtomic(path, { ...receipt, state: 'ready' });
  return { status: 201, body: { ok: true, id: receipt.id, world: receipt.world } };
}

/** A confirmed start remains findable after the trusted compiler or base changes. */
async function recoverReadyStart(key, draft, fingerprint) {
  const root = realpathSync(CAMPAIGN_ROOT);
  const path = join(root, 'authoring', 'receipts', key + '.json');
  if (!existsSync(path)) return null;
  if (!inside(root, realpathSync(path))) throw new Error('Invalid start receipt path');
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  if (receipt.format !== 'realmcraft-start' || receipt.version !== 1 || receipt.startKey !== key || receipt.fingerprint !== fingerprint
    || receipt.draftHash !== hashValue(draft) || receipt.id !== 'realm-' + key.replaceAll('-', '')
    || typeof receipt.world !== 'string' || !/^realm-[0-9a-f]{16}$/.test(receipt.world) || !['reserved', 'ready'].includes(receipt.state)) {
    return failure(409, [bad('/startKey', 'start-key-conflict')]);
  }
  if ((receipt.generation ?? null) !== libraryGeneration()) return failure(409, [bad('/startKey', 'library-reset')]);
  if (receipt.state !== 'ready') return null;
  const lockPath = join(CAMPAIGNS_DIR, receipt.id, 'world.lock.json');
  if (!existsSync(lockPath) || !inside(root, realpathSync(lockPath))) return failure(409, [bad('/startKey', 'campaign-not-readable')]);
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  if (lock.id !== receipt.world || lock.campaign !== receipt.id) return failure(409, [bad('/startKey', 'campaign-conflict')]);
  const status = parseCli(await runCli(receipt.id, ['status', '--campaign', receipt.id, '--json']));
  if (!status || status.exit !== 0 || status.campaign !== receipt.id) return failure(409, [bad('/startKey', 'campaign-not-readable')]);
  return { status: 201, body: { ok: true, id: receipt.id, world: receipt.world } };
}
let starting = Promise.resolve();
export async function handleRealmStart(req, res) {
  const body = await readPostJson(req, res);
  if (!body) return;
  const issues = fields(body, ['draft', 'fingerprint', 'startKey']);
  if (!body.draft || typeof body.draft !== 'object' || Array.isArray(body.draft)) issues.push(bad('/draft', 'object'));
  if (typeof body.fingerprint !== 'string' || !HASH.test(body.fingerprint)) issues.push(bad('/fingerprint', 'fingerprint'));
  if (typeof body.startKey !== 'string' || !UUID.test(body.startKey)) issues.push(bad('/startKey', 'start-key'));
  if (issues.length) return sendIssues(res, 400, issues);
  try {
    const job = starting.then(async () => {
      const key = body.startKey.toLowerCase();
      const recovered = await recoverReadyStart(key, body.draft, body.fingerprint);
      if (recovered) return recovered;
      const plan = planRealm(body.draft);
      if (plan.issues) return failure(400, plan.issues);
      if (body.fingerprint !== plan.fingerprint) return failure(409, [bad('/fingerprint', 'stale-preview')]);
      return startRealm(plan, key);
    });
    starting = job.catch(() => {});
    const result = await job;
    return result.body ? sendJson(res, result.status, result.body) : sendIssues(res, result.status, result.issues);
  } catch (error) {
    return sendIssues(res, error.issues ? 400 : 500, error.issues ?? [serverIssue('server.cli', 'Realm start could not be completed; retry with the same start key')]);
  }
}

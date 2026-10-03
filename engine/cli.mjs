#!/usr/bin/env node
// Command line of the rules kernel and the only writer of campaigns/<cid>/state.json.
//
//   node engine/cli.mjs <command> [args] [--campaign <cid>] [--json]
//
//   new <worldId> --seed <n> --as <template> --id <cid> [--from-state <file>]
//   status [--as <people>]            preview --as <people> [--draft <file>]
//   roll <probeId> <1-10>             seal            apply [--expect-rev <n>]
//   open                              tasks [--agent <name>]
//   ingest [<proposalFile>] [--consent <proposalId>]
//   validate <path> [--campaign <cid> | --world <id>]       budget <file>
//   replay [--to <turn>]              schema <name>
//
// Exit codes: 0 ok, 2 rejected or invalid, 3 missing input (player roll,
// file, campaign), 4 phase, revision or tamper conflict, 5 replay mismatch.
// Root: REALMCRAFT_ROOT or the working directory; campaigns/<cid> and
// welten/<worldId> below it (worlds fall back to the repository's welten/).
//
// Every transition (new, seal, apply, open, ingest) appends to
// log/journal.json { op, turn, revAfter, hashAfter, input }. The journal is
// the replay source and the tamper anchor: a transition on a state.json whose
// hash differs from the last journal entry is refused.

import { copyFileSync, existsSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMAS } from './schemas/index.js';
import { validate as schemaIssues } from './content/schema.js';
import { issue, hasErrors } from './core/issues.js';
import { bareCode, kissue } from './core/codes.js';
import { makeEnv } from './core/env.js';
import { calendarOf } from './core/calendar.js';
import { peopleIds } from './core/state.js';
import { checkDraft } from './core/orders.js';
import { resolveProbe, calculation } from './core/probes.js';
import { projectFor, projectEvents } from './core/project.js';
import { apply, createCampaign, emptyDraft, open, preview, seal, stateHash } from './core/turn.js';
import { appendToLibrary, createLibrary, resolveRef } from './content/library.js';
import {
  validateBestimmung, validateCampaign, validateDraft, validateEntwicklung, validateEreignis, validateProposal, validateWorldPackage,
} from './content/validate.js';
import { scoreEntwicklungStandalone, scoreEreignis } from './content/budget.js';
import {
  LAYOUT, campaignDir, ensureLayout, readJson, turnStem, withLock, writeJsonAtomic, writeState,
} from './harness/io.js';
import { initTurnStatus, recordVerdict } from './harness/status.js';
import { buildJudgeTask, buildTasks } from './harness/tasks.js';
import { ingestProposal } from './harness/ingest.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOOLEAN_FLAGS = new Set(['json']);
const PACK_FILES = ['welt', 'regeln', 'labels', 'style'];
const CONTENT = ['entwicklungen', 'ereignisse', 'bestimmungen'];

// --- small helpers -----------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (BOOLEAN_FLAGS.has(name)) flags[name] = true;
      else (flags[name] ??= []).push(argv[++i]);
    } else positional.push(a);
  }
  return { positional, flags };
}

const flag = (a, name) => a.flags[name]?.at(-1);
const parseSeed = (s) => (/^-?\d+$/.test(String(s)) ? Number(s) : String(s));

const norm = (i) => ({ code: bareCode(i), severity: i.severity ?? 'error', path: i.path ?? '', message: i.message ?? '', ...(i.refs ? { refs: i.refs } : {}) });
const fail = (code, issues, extra = {}) => ({ code, issues, ...extra });
const ok = (data = {}, text = '') => ({ code: 0, issues: [], data, text });
const cliIssue = (code, path, message, severity = 'error') => issue(code, path, message, { severity });
const errorsOf = (issues) => issues.filter((i) => i.severity === 'error');

// Exit code of kernel issues: phase, revision and tamper conflicts are 4, a
// missing player roll alone is 3, everything else 2.
function exitFor(issues) {
  const errors = errorsOf(issues).map(bareCode);
  if (!errors.length) return 0;
  if (errors.some((c) => ['phase', 'finished', 'tamper', 'cli.stale_rev'].includes(c))) return 4;
  if (errors.every((c) => c === 'roll_missing')) return 3;
  return 2;
}

function readText(path) {
  return readFileSync(path, 'utf8');
}

function tryJson(path) {
  try {
    return { value: JSON.parse(readText(path)) };
  } catch (err) {
    return { error: err.code === 'ENOENT' ? `${path} not found` : err.message, missing: err.code === 'ENOENT' };
  }
}

function listJson(dir) {
  try {
    return readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

function moveFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch {
    copyFileSync(from, to);
    unlinkSync(from);
  }
}

// --- worlds and campaigns ----------------------------------------------------

const rootOf = () => resolve(process.env.REALMCRAFT_ROOT ?? process.cwd());

function worldDirFor(root, worldId) {
  for (const base of [join(root, 'welten'), join(REPO, 'welten')]) {
    const dir = join(base, worldId);
    if (existsSync(join(dir, 'welt.json'))) return dir;
  }
  return null;
}

function loadPack(dir) {
  const pack = {};
  const problems = [];
  const read = (key, file) => {
    const r = tryJson(join(dir, file));
    if (r.error) problems.push(issue('schema.required', `/${key}`, r.missing ? `${file} is missing` : r.error));
    else pack[key] = r.value;
  };
  for (const k of PACK_FILES) read(k, `${k}.json`);
  for (const k of CONTENT) read(k, join('content', `${k}.json`));
  return { pack, problems };
}

function packLibrary(pack) {
  let lib = createLibrary();
  for (const k of CONTENT) for (const data of pack[k]?.items ?? []) lib = appendToLibrary(lib, data, { turn: 0, source: 'world' }).library;
  return lib;
}

// The env reads agent content through holder.library, so a library that
// grows during ingest or replay is seen without rebuilding the env.
function buildEnv(pack, holder) {
  return makeEnv({
    welt: pack.welt,
    regeln: pack.regeln,
    labels: pack.labels,
    content: { entwicklungen: pack.entwicklungen, ereignisse: pack.ereignisse, bestimmungen: pack.bestimmungen },
    resolve: (ref) => resolveRef(holder.library, ref),
  });
}

function loadCampaign(root, cid) {
  if (!cid) return { error: fail(3, [cliIssue('cli.missing_input', '/campaign', 'a command needs --campaign <cid>')]) };
  const dir = campaignDir(root, cid);
  if (!existsSync(join(dir, LAYOUT.state))) return { error: fail(3, [cliIssue('cli.no_campaign', '/campaign', `no campaign "${cid}" under ${join(root, 'campaigns')}`)]) };
  const state = readJson(join(dir, LAYOUT.state));
  const library = readJson(join(dir, LAYOUT.library), { fallback: createLibrary() });
  const lock = readJson(join(dir, LAYOUT.worldLock), { fallback: null });
  const worldId = lock?.id ?? state.campaign.world.id;
  const lockedDir = lock?.worldDir ? (isAbsolute(lock.worldDir) ? lock.worldDir : join(root, lock.worldDir)) : null;
  const worldDir = lockedDir && existsSync(join(lockedDir, 'welt.json')) ? lockedDir : worldDirFor(root, worldId);
  if (!worldDir) return { error: fail(3, [cliIssue('cli.no_world', '/world', `world package "${worldId}" not found`)]) };
  const { pack, problems } = loadPack(worldDir);
  if (problems.length) return { error: fail(2, problems) };
  const holder = { library };
  const env = buildEnv(pack, holder);
  const warnings = [];
  if ((lock?.hash ?? state.campaign.world.hash) !== env.hash) warnings.push(cliIssue('cli.world_drift', '/world', `world package "${worldId}" differs from the one the campaign was created with`, 'warning'));
  return { c: { root, cid, dir, state, library, lock, pack, env, holder, worldDir, warnings } };
}

// --- journal, views, index ---------------------------------------------------

const journalPath = (dir) => join(dir, LAYOUT.log, 'journal.json');
const readJournal = (dir) => readJson(journalPath(dir), { fallback: null });

function appendJournal(c, entry) {
  const journal = readJournal(c.dir) ?? [];
  writeJsonAtomic(journalPath(c.dir), [...journal, entry]);
}

function guard(c) {
  const journal = readJournal(c.dir);
  const last = journal?.at(-1);
  if (!last) return [kissue('tamper', '/state', 'the campaign has no journal, its state cannot be verified')];
  if (stateHash(c.state) !== last.hashAfter) return [kissue('tamper', '/state', 'state.json was changed outside the kernel (hash differs from the journal)')];
  return [];
}

function writeViews(c, state) {
  for (const pid of peopleIds(state)) writeJsonAtomic(join(c.dir, LAYOUT.view, `${pid}.json`), projectFor(state, c.env, pid));
}

// Events of each turn per people, merged by entry id so seal and apply, which
// both report the sealed season, do not duplicate. The file belongs to one
// people, so every entry names it in visibleTo.
function writeEventViews(c, state, events) {
  const byTurn = new Map();
  for (const e of events) byTurn.set(e.turn, [...(byTurn.get(e.turn) ?? []), e]);
  for (const pid of peopleIds(state)) {
    for (const [turn, list] of byTurn) {
      const path = join(c.dir, LAYOUT.view, pid, 'events', `${turnStem(turn)}.json`);
      const old = readJson(path, { fallback: [] });
      const seen = new Set(old.map((e) => e.id));
      const add = projectEvents(list, pid).filter((e) => !seen.has(e.id)).map((e) => ({ ...e, visibleTo: e.visibleTo.includes(pid) ? e.visibleTo : [pid] }));
      if (add.length || !old.length) writeJsonAtomic(path, [...old, ...add]);
    }
  }
}

function upsertIndex(c, state) {
  const dir = join(c.root, 'campaigns');
  withLock(dir, 'index', () => {
    const path = join(dir, 'index.json');
    const cur = readJson(path, { fallback: { format: 'realmcraft-campaigns', version: 1, campaigns: [] } });
    const row = {
      id: state.campaign.id, world: state.campaign.world.id, player: state.campaign.player, turn: state.turn,
      status: state.status, updatedAt: new Date().toISOString(),
    };
    const campaigns = [...cur.campaigns.filter((r) => r.id !== row.id), row].sort((a, b) => (a.id < b.id ? -1 : 1));
    writeJsonAtomic(path, { ...cur, campaigns });
  });
}

function writeTasks(c, state, phase = state.phase) {
  for (const { path, task } of buildTasks(state, c.env, { library: c.library, phase })) writeJsonAtomic(join(c.dir, path), task);
}

// State, journal, views and bookkeeping of one transition.
function commit(c, { op, next, input, events, library = c.library, extraFiles }) {
  const w = writeState(c.dir, next, { expectRev: c.state.rev });
  if (!w.ok) return w.issues;
  if (library !== c.library) writeJsonAtomic(join(c.dir, LAYOUT.library), library);
  for (const f of extraFiles ?? []) f();
  appendJournal(c, { op, turn: c.state.turn, revAfter: next.rev, hashAfter: stateHash(next), input });
  writeViews(c, next);
  writeEventViews(c, next, events ?? []);
  upsertIndex(c, next);
  return [];
}

const draftsOf = (dir) => Object.fromEntries(listJson(join(dir, LAYOUT.drafts)).map((n) => [n.slice(0, -5), readJson(join(dir, LAYOUT.drafts, n))]));
const draftPath = (c, pid) => join(c.dir, LAYOUT.drafts, `${pid}.json`);

const outcome = (res, extra = {}) => ({ code: res.code, issues: res.issues, data: res.data ?? {}, text: res.text ?? '', ...extra });

// --- new ---------------------------------------------------------------------

function cmdNew(a) {
  const root = rootOf();
  const [worldId] = a.positional;
  const cid = flag(a, 'id');
  if (!worldId || !cid) return fail(3, [cliIssue('cli.missing_input', '', 'usage: new <worldId> --seed <n> --as <template> --id <cid>')]);
  const worldDir = worldDirFor(root, worldId);
  if (!worldDir) return fail(3, [cliIssue('cli.no_world', '/world', `world package "${worldId}" not found`)]);
  const { pack, problems } = loadPack(worldDir);
  const checked = [...problems, ...validateWorldPackage(pack)];
  if (hasErrors(checked)) return fail(2, checked);

  const dir = campaignDir(root, cid);
  if (existsSync(join(dir, LAYOUT.state))) return fail(2, [cliIssue('duplicate', '/id', `campaign "${cid}" already exists`)]);
  const holder = { library: packLibrary(pack) };
  const env = buildEnv(pack, holder);
  const seedArg = flag(a, 'seed');
  const fromState = flag(a, 'from-state');

  let state;
  let seed;
  let player;
  if (fromState) {
    const r = tryJson(resolve(fromState));
    if (r.error) return fail(3, [cliIssue('cli.missing_input', '/from-state', r.error)]);
    state = { ...r.value, campaign: { ...r.value.campaign, id: cid } };
    const bad = schemaIssues(SCHEMAS.campaign, state);
    if (bad.length) return fail(2, bad);
    seed = state.map.seed;
    player = state.campaign.player;
  } else {
    if (seedArg === undefined) return fail(3, [cliIssue('cli.missing_input', '/seed', 'new needs --seed <n>')]);
    seed = parseSeed(seedArg);
    player = flag(a, 'as') ?? null;
    try {
      state = createCampaign(env, { id: cid, seed, player }).state;
    } catch (err) {
      return fail(2, [cliIssue('format', '/as', err.message)]);
    }
    player = state.campaign.player;
  }

  ensureLayout(dir);
  const c = { root, cid, dir, state, library: holder.library, pack, env, holder, worldDir };
  const w = writeState(dir, state);
  if (!w.ok) return fail(2, w.issues);
  writeJsonAtomic(join(dir, LAYOUT.worldLock), {
    campaign: cid, id: env.welt.id, version: env.welt.version, hash: env.hash, seed, player,
    worldDir: relative(root, worldDir).startsWith('..') ? worldDir : relative(root, worldDir).split('\\').join('/'),
    rulesVersion: state.rulesVersion,
  });
  writeJsonAtomic(join(dir, LAYOUT.library), holder.library);
  if (fromState) writeJsonAtomic(join(dir, 'anchor.json'), state);
  appendJournal(c, { op: 'new', turn: state.turn, revAfter: state.rev, hashAfter: stateHash(state), input: fromState ? { anchor: 'anchor.json' } : {} });
  writeViews(c, state);
  writeEventViews(c, state, state.chronicle);
  upsertIndex(c, state);
  writeTasks(c, state);
  initTurnStatus(dir, state.turn);
  return ok({ campaign: cid, world: worldId, player, turn: state.turn, phase: state.phase, rev: state.rev, dir }, `campaign ${cid} created at turn ${state.turn}, phase ${state.phase}`);
}

// --- reading commands --------------------------------------------------------

function playerOf(c, a) {
  return flag(a, 'as') ?? c.state.campaign.player;
}

function openProbes(c, pid) {
  const { state } = c;
  if (!['planning', 'agents'].includes(state.phase) || pid !== state.campaign.player) return [];
  const stored = tryJson(draftPath(c, pid)).value;
  const draft = stored && stored.turn === state.turn ? stored : emptyDraft(state, pid);
  const chk = checkDraft(state, c.env, draft, { as: pid, mode: 'preview' });
  return chk.probes.filter((p) => p.roller === 'player' && !draft.rolls[p.id]).map((p) => p.id);
}

function cmdStatus(c, a) {
  const { state } = c;
  const pid = playerOf(c, a);
  if (!state.peoples[pid]) return fail(2, [cliIssue('target', '/as', `no people "${pid}"`)]);
  const view = projectFor(state, c.env, pid);
  const p = view.peoples[pid];
  const cal = calendarOf(c.env.regeln, state.turn);
  const taskDir = join(c.dir, LAYOUT.tasks, turnStem(state.turn));
  const tasks = listJson(taskDir).map((n) => readJson(join(taskDir, n))).map((t) => ({ agent: t.agent, people: t.people, proposalId: t.respondAs.proposalId }));
  const waiting = listJson(join(c.dir, LAYOUT.proposals)).map((n) => n.slice(0, -5));
  const data = {
    campaign: state.campaign.id,
    turn: state.turn,
    phase: state.phase,
    rev: state.rev,
    status: state.status,
    result: state.result ?? null,
    season: cal.season,
    year: cal.year,
    player: { id: p.id, name: p.name, resources: p.resources, meters: p.meters, population: p.population, standing: p.standing, lebensweise: p.lebensweise },
    probes: openProbes(c, pid),
    tasks,
    proposals: waiting,
  };
  return ok(data, `${state.campaign.id}: turn ${state.turn} (${cal.season} ${cal.year}), phase ${state.phase}, rev ${state.rev}, ${state.status}`);
}

function previewResult(c, pid, draft) {
  const pv = preview(c.state, c.env, draft, { as: pid });
  const errors = errorsOf(pv.issues);
  const rollsMissing = (pv.unresolved ?? []).some((u) => u.probe);
  let code = 0;
  if (errors.length) code = exitFor(pv.issues);
  else if (rollsMissing) code = 3;
  return { code, issues: pv.issues, data: { ...pv, issues: undefined } };
}

function cmdPreview(c, a) {
  const { state } = c;
  const pid = flag(a, 'as') ?? state.campaign.player;
  if (!state.peoples[pid]) return fail(2, [cliIssue('target', '/as', `no people "${pid}"`)]);
  const file = flag(a, 'draft');
  let draft;
  if (file) {
    const r = tryJson(resolve(file));
    if (r.error) return fail(3, [cliIssue('cli.missing_input', '/draft', r.error)]);
    draft = { ...r.value, sealed: false };
    if (pid !== state.campaign.player) return fail(2, [cliIssue('target', '/as', 'only the player people stores a draft')]);
    if (!['planning', 'agents'].includes(state.phase) || state.status === 'ended') {
      return fail(4, [cliIssue('phase', '/phase', `drafts are accepted in planning or agents, the campaign is in ${state.phase}`)]);
    }
    // A draft that does not parse as a draft or names another turn is not stored.
    const shape = errorsOf(checkDraft(state, c.env, draft, { as: pid, mode: 'preview' }).issues);
    if (shape.some((i) => i.code.startsWith('schema.') || ['format', 'stale'].includes(i.code))) return fail(2, shape);
  } else {
    const stored = tryJson(draftPath(c, pid)).value;
    draft = stored && stored.turn === state.turn ? stored : emptyDraft(state, pid);
  }
  const res = previewResult(c, pid, draft);
  if (file) {
    withLock(c.dir, 'drafts', () => writeJsonAtomic(draftPath(c, pid), draft));
    res.data.stored = true;
  }
  return outcome(res, { text: `preview for ${pid}: ${res.data.probes.length} probes, ${errorsOf(res.issues).length} errors` });
}

function cmdRoll(c, a) {
  const { state } = c;
  const [probeId, raw] = a.positional;
  const value = Number(raw);
  if (!probeId || raw === undefined) return fail(3, [cliIssue('cli.missing_input', '', 'usage: roll <probeId> <1-10>')]);
  if (!Number.isInteger(value) || value < 1 || value > 10) return fail(2, [cliIssue('format', '/value', 'a roll is an integer from 1 to 10')]);
  if (!['planning', 'agents'].includes(state.phase) || state.status === 'ended') {
    return fail(4, [cliIssue('phase', '/phase', `rolls are accepted in planning or agents, the campaign is in ${state.phase}`)]);
  }
  const pid = state.campaign.player;
  return withLock(c.dir, 'drafts', () => {
    const stored = tryJson(draftPath(c, pid)).value;
    const draft = stored && stored.turn === state.turn ? stored : emptyDraft(state, pid);
    const chk = checkDraft(state, c.env, draft, { as: pid, mode: 'preview' });
    const probe = chk.probes.find((p) => p.id === probeId && p.roller === 'player');
    if (!probe) return fail(2, [cliIssue('target', '/probe', `no probe "${probeId}" the player rolls in the current draft`)]);
    const held = draft.rolls[probeId];
    if (held && held.fingerprint === probe.fingerprint) return fail(2, [cliIssue('duplicate', '/probe', `probe ${probeId} was already rolled (${held.value})`)]);
    const next = { ...draft, sealed: false, rolls: { ...draft.rolls, [probeId]: { value, fingerprint: probe.fingerprint } } };
    writeJsonAtomic(draftPath(c, pid), next);
    const resolved = resolveProbe(probe, value);
    return ok({ probe: { ...resolved, calculation: calculation(resolved) }, band: resolved.band, natural: resolved.natural, margin: resolved.margin }, calculation(resolved));
  });
}

// --- transitions -------------------------------------------------------------

function transition(c, fn) {
  return withLock(c.dir, 'campaign', () => {
    const fresh = loadCampaign(c.root, c.cid);
    if (fresh.error) return fresh.error;
    const cc = fresh.c;
    const t = guard(cc);
    if (t.length) return fail(4, t);
    const r = fn(cc);
    return { ...r, issues: [...cc.warnings, ...(r.issues ?? [])] };
  });
}

function cmdSeal(c) {
  return transition(c, (cc) => {
    const drafts = draftsOf(cc.dir);
    const res = seal(cc.state, cc.env, drafts);
    if (!res.ok) return fail(exitFor(res.issues), res.issues);
    const files = () => {
      for (const [pid, d] of Object.entries(res.drafts)) writeJsonAtomic(draftPath(cc, pid), d);
      writeTasks(cc, res.state);
    };
    const bad = commit(cc, { op: 'seal', next: res.state, input: { drafts }, events: res.events, extraFiles: [files] });
    if (bad.length) return fail(2, bad);
    return ok({ turn: res.state.turn, phase: res.state.phase, rev: res.state.rev, substitutions: res.substitutions, draws: res.state.eventDraws }, `sealed turn ${res.state.turn}, rev ${res.state.rev}`);
  });
}

function cmdApply(c, a) {
  return transition(c, (cc) => {
    const expect = flag(a, 'expect-rev');
    if (expect !== undefined && Number(expect) !== cc.state.rev) {
      return fail(4, [cliIssue('cli.stale_rev', '/rev', `state is at revision ${cc.state.rev}, expected ${expect}`)]);
    }
    if (cc.state.status === 'ended') return fail(4, [cliIssue('finished', '', 'the campaign has ended')]);
    if (cc.state.phase !== 'resolving') return fail(4, [cliIssue('phase', '/phase', `apply needs resolving, the campaign is in ${cc.state.phase}`)]);
    const drafts = draftsOf(cc.dir);
    const res = apply(cc.state, cc.env, drafts);
    if (!res.ok) return fail(exitFor(res.issues), res.issues);
    const resolved = cc.state.turn;
    const files = () => {
      writeJsonAtomic(join(cc.dir, LAYOUT.log, `${turnStem(resolved)}.json`), res.report);
      for (const n of listJson(join(cc.dir, LAYOUT.drafts))) unlinkSync(join(cc.dir, LAYOUT.drafts, n));
      writeTasks(cc, res.state);
      initTurnStatus(cc.dir, res.state.turn);
    };
    const bad = commit(cc, { op: 'apply', next: res.state, input: { drafts }, events: res.events, extraFiles: [files] });
    if (bad.length) return fail(2, bad);
    const data = {
      resolved, turn: res.state.turn, phase: res.state.phase, rev: res.state.rev, status: res.state.status, result: res.state.result ?? null,
      orders: res.report.sections.orders, probes: res.report.sections.probes,
    };
    return ok(data, `resolved turn ${resolved}, now turn ${res.state.turn} in phase ${res.state.phase}, rev ${res.state.rev}`);
  });
}

function cmdOpen(c) {
  return transition(c, (cc) => {
    const res = open(cc.state, cc.env);
    if (!res.ok) return fail(exitFor(res.issues), res.issues);
    const bad = commit(cc, { op: 'open', next: res.state, input: {}, events: res.events });
    if (bad.length) return fail(2, bad);
    return ok({ turn: res.state.turn, phase: res.state.phase, rev: res.state.rev }, `turn ${res.state.turn} is open for planning`);
  });
}

// --- tasks and ingest --------------------------------------------------------

function cmdTasks(c, a) {
  const { state } = c;
  const agent = flag(a, 'agent');
  const wanted = agent?.startsWith('judge-') ? [buildJudgeTask(state, c.env, agent)] : buildTasks(state, c.env, { library: c.library });
  const tasks = [];
  for (const { path, task } of wanted) {
    const full = join(c.dir, path);
    const held = tryJson(full).value;
    if (!held) writeJsonAtomic(full, task);
    tasks.push(held ?? task);
  }
  const list = agent ? tasks.filter((t) => t.agent === agent) : tasks;
  return ok({ tasks: list }, list.map((t) => `${t.agent}${t.people ? ` ${t.people}` : ''}: ${t.respondAs.path}`).join('\n'));
}

function taskFor(c, proposal, state) {
  const agent = proposal?.agent;
  const turn = proposal?.turn;
  if (typeof agent !== 'string' || !Number.isInteger(turn)) return null;
  const file = join(c.dir, LAYOUT.tasks, turnStem(turn), `${agent}-${proposal.people ?? 'all'}.json`);
  const held = tryJson(file).value;
  if (held) return held;
  if (turn !== state.turn) return null;
  const wanted = agent.startsWith('judge-') ? [buildJudgeTask(state, c.env, agent)] : buildTasks(state, c.env, { library: c.library });
  return wanted.find((w) => w.task.agent === agent && w.task.people === (proposal.people ?? null))?.task ?? null;
}

function cmdIngest(c, a) {
  return transition(c, (cc) => {
    const consent = (a.flags.consent ?? []).flatMap((s) => String(s).split(','));
    const propDir = join(cc.dir, LAYOUT.proposals);
    const files = a.positional.length ? a.positional.map((f) => resolve(f)) : listJson(propDir).map((n) => join(propDir, n));
    const reports = [];
    const issues = [];
    let state = cc.state;
    let library = cc.library;
    for (const file of files) {
      const id = file.split(/[\\/]/).pop().replace(/\.json$/, '');
      const read = tryJson(file);
      if (read.error) {
        issues.push(cliIssue('cli.missing_input', `/${id}`, read.error));
        reports.push({ proposalId: id, verdict: read.missing ? 'missing' : 'rejected', issues: [cliIssue('format', '', read.error)] });
        if (!read.missing) moveFile(file, join(cc.dir, 'agents', 'rejected', `${id}.json`));
        continue;
      }
      const proposal = read.value;
      const task = taskFor({ ...cc, library }, proposal, state);
      cc.holder.library = library;
      const res = ingestProposal(state, cc.env, proposal, { task, library, consent });
      const report = { proposalId: id, agent: proposal?.agent ?? null, verdict: res.verdict, issues: res.issues.map(norm), items: res.items.map((i) => ({ index: i.index, type: i.type, title: i.title, verdict: i.verdict, budget: i.budget, issues: i.issues.map(norm) })) };
      if (res.verdict === 'deferred') {
        reports.push(report);
        issues.push(...res.issues);
        continue;
      }
      const dest = res.verdict === 'rejected' ? 'rejected' : 'ingested';
      if (res.verdict === 'accepted' || res.verdict === 'partial') {
        const task2 = task;
        const extra = () => {
          for (const [pid, d] of Object.entries(res.drafts)) writeJsonAtomic(draftPath(cc, pid), d);
          for (const t of res.texts) {
            const full = join(cc.dir, t.path);
            mkdirSync(dirname(full), { recursive: true });
            writeFileSync(full, t.text);
          }
        };
        const bad = commit({ ...cc, state, library }, { op: 'ingest', next: res.state, library: res.library, input: { proposal, task: task2, consent: consent.includes(proposal.proposalId) ? [proposal.proposalId] : [] }, events: res.events, extraFiles: [extra] });
        if (bad.length) {
          issues.push(...bad);
          reports.push({ ...report, verdict: 'rejected', issues: bad.map(norm) });
          continue;
        }
        state = res.state;
        library = res.library;
        cc.state = state;
      }
      writeJsonAtomic(join(cc.dir, LAYOUT.verdicts, `${id}.json`), report);
      moveFile(file, join(cc.dir, 'agents', dest, `${id}.json`));
      if (res.verdict !== 'duplicate') {
        initTurnStatus(cc.dir, state.turn);
        const step = `${proposal.agent}-${proposal.people ?? 'all'}`;
        for (const it of res.items) {
          recordVerdict(cc.dir, step, {
            proposalId: proposal.proposalId, kind: it.type, title: it.title || it.type, verdict: it.verdict === 'accepted' ? 'accepted' : 'rejected',
            budget: it.budget, reason: it.issues.find((i) => i.severity === 'error')?.message ?? null,
          });
        }
      }
      if (res.verdict === 'rejected') issues.push(...res.issues);
      reports.push(report);
    }
    const hasRejected = reports.some((r) => r.verdict === 'rejected');
    const hasDeferred = reports.some((r) => r.verdict === 'deferred');
    const hasMissing = reports.some((r) => r.verdict === 'missing');
    const code = hasRejected ? 2 : hasDeferred ? 4 : hasMissing ? 3 : 0;
    return { code, issues: issues.length ? issues : [], data: { proposals: reports, rev: state.rev }, text: reports.map((r) => `${r.proposalId}: ${r.verdict}`).join('\n') || 'no proposals' };
  });
}

// --- validate, budget, schema ------------------------------------------------

function contextFor(a) {
  const root = rootOf();
  const cid = flag(a, 'campaign');
  if (cid) {
    const r = loadCampaign(root, cid);
    if (!r.error) return { regeln: r.c.pack.regeln, welt: r.c.pack.welt, library: r.c.library, state: r.c.state };
  }
  const worldId = flag(a, 'world');
  const dir = worldId ? worldDirFor(root, worldId) : null;
  if (dir) {
    const { pack } = loadPack(dir);
    return { regeln: pack.regeln, welt: pack.welt, library: packLibrary(pack) };
  }
  return {};
}

function cmdValidate(a) {
  const target = a.positional[0];
  if (!target) return fail(3, [cliIssue('cli.missing_input', '', 'usage: validate <path>')]);
  const path = resolve(target);
  if (!existsSync(path)) return fail(3, [cliIssue('cli.missing_input', '/path', `${target} not found`)]);
  if (statSync(path).isDirectory()) {
    const { pack, problems } = loadPack(path);
    const issues = [...problems, ...validateWorldPackage(pack)];
    return { code: hasErrors(issues) ? 2 : 0, issues, data: { kind: 'world', path }, text: `world package ${target}` };
  }
  const r = tryJson(path);
  if (r.error) return fail(2, [cliIssue('format', '', r.error)]);
  const doc = r.value;
  const ctx = contextFor(a);
  let kind;
  let res;
  if (doc?.format === 'realmcraft-entwicklung') [kind, res] = ['entwicklung', validateEntwicklung(doc, ctx)];
  else if (doc?.format === 'realmcraft-proposal') [kind, res] = ['proposal', validateProposal(doc, ctx)];
  else if (doc?.format === 'realmcraft-draft') [kind, res] = ['draft', validateDraft(doc, ctx)];
  else if (doc?.format === 'realmcraft-campaign') [kind, res] = ['campaign', validateCampaign(doc)];
  else if (Array.isArray(doc?.milestones)) [kind, res] = ['bestimmung', validateBestimmung(doc, ctx)];
  else if (Number.isInteger(doc?.band)) [kind, res] = ['ereignis', validateEreignis(doc, ctx)];
  else return fail(2, [cliIssue('format', '', 'unknown document: no known format, band or milestones')]);
  const issues = res.issues ?? [];
  const items = res.items?.flatMap((i) => i.issues) ?? [];
  const all = [...issues, ...items];
  return { code: hasErrors(all) || res.ok === false ? 2 : 0, issues: all, data: { kind, budget: res.budget ?? null, items: res.items ?? undefined }, text: `${kind} ${target}` };
}

function cmdBudget(a) {
  const target = a.positional[0];
  if (!target) return fail(3, [cliIssue('cli.missing_input', '', 'usage: budget <file>')]);
  const r = tryJson(resolve(target));
  if (r.error) return fail(r.missing ? 3 : 2, [cliIssue('cli.missing_input', '/file', r.error)]);
  const ctx = contextFor(a);
  const doc = r.value;
  if (Number.isInteger(doc?.band) && !doc.format) {
    const score = scoreEreignis(doc, ctx);
    return { code: hasErrors(score.issues) ? 2 : 0, issues: score.issues, data: { ...score, N: score.net, issues: undefined }, text: `event card ${doc.id}: net ${score.net}` };
  }
  if (doc?.format !== 'realmcraft-entwicklung') return fail(2, [cliIssue('format', '', 'budget needs an Entwicklung or an event card')]);
  const score = scoreEntwicklungStandalone(doc, ctx.regeln);
  return { code: hasErrors(score.issues) ? 2 : 0, issues: score.issues, data: { ...score, N: score.net, issues: undefined }, text: `${doc.id}: effect ${score.effect}, price ${score.price}, net ${score.net}` };
}

function cmdSchema(a) {
  const name = a.positional[0];
  if (!name || !SCHEMAS[name]) return fail(2, [cliIssue('target', '/name', `schema name one of ${Object.keys(SCHEMAS).join(', ')}`)]);
  return ok({ name, schema: SCHEMAS[name] }, JSON.stringify(SCHEMAS[name], null, 2));
}

// --- replay ------------------------------------------------------------------

function cmdReplay(c, a) {
  const journal = readJournal(c.dir);
  if (!journal?.length) return fail(5, [cliIssue('replay.mismatch', '/journal', 'the campaign has no journal')]);
  const to = flag(a, 'to') === undefined ? undefined : Number(flag(a, 'to'));
  const lock = c.lock;
  if (!lock) return fail(5, [cliIssue('replay.mismatch', '/world.lock', 'world.lock.json is missing')]);
  let library = packLibrary(c.pack);
  c.holder.library = library;
  let state = null;
  const steps = [];
  const mismatch = (i, e, why) => fail(5, [cliIssue('replay.mismatch', `/journal/${i}`, `${e.op} at turn ${e.turn}: ${why}`)], { data: { steps } });
  for (const [i, e] of journal.entries()) {
    if (to !== undefined && state && state.turn >= to) break;
    try {
      if (e.op === 'new') {
        state = e.input?.anchor ? readJson(join(c.dir, e.input.anchor)) : createCampaign(c.env, { id: lock.campaign, seed: lock.seed, player: lock.player }).state;
      } else if (e.op === 'open') state = open(state, c.env).state;
      else if (e.op === 'seal') state = seal(state, c.env, e.input.drafts).state;
      else if (e.op === 'apply') state = apply(state, c.env, e.input.drafts).state;
      else if (e.op === 'ingest') {
        const res = ingestProposal(state, c.env, e.input.proposal, { task: e.input.task, library, consent: e.input.consent });
        state = res.state;
        library = res.library;
        c.holder.library = library;
      } else return mismatch(i, e, 'unknown operation');
    } catch (err) {
      return mismatch(i, e, `kernel error ${err.message}`);
    }
    const h = stateHash(state);
    steps.push({ op: e.op, turn: e.turn, rev: state.rev, hash: h });
    if (h !== e.hashAfter) return mismatch(i, e, `hash ${h} differs from the journal ${e.hashAfter}`);
  }
  if (to === undefined && stateHash(state) !== stateHash(c.state)) return mismatch(journal.length - 1, journal.at(-1), 'the replayed state differs from state.json');
  return ok({ steps: steps.length, turn: state.turn, rev: state.rev, hash: stateHash(state) }, `replayed ${steps.length} transitions to turn ${state.turn}, rev ${state.rev}`);
}

// --- main --------------------------------------------------------------------

const NEEDS_CAMPAIGN = new Set(['status', 'preview', 'roll', 'seal', 'apply', 'open', 'tasks', 'ingest', 'replay']);

function run(argv) {
  const a = parseArgs(argv);
  const cmd = a.positional.shift();
  switch (cmd) {
    case 'new': return cmdNew(a);
    case 'validate': return cmdValidate(a);
    case 'budget': return cmdBudget(a);
    case 'schema': return cmdSchema(a);
    default:
  }
  if (!NEEDS_CAMPAIGN.has(cmd)) return fail(2, [cliIssue('cli.unknown_command', '', `unknown command "${cmd ?? ''}"`)]);
  const loaded = loadCampaign(rootOf(), flag(a, 'campaign'));
  if (loaded.error) return loaded.error;
  const c = loaded.c;
  const r = (() => {
    switch (cmd) {
      case 'status': return cmdStatus(c, a);
      case 'preview': return cmdPreview(c, a);
      case 'roll': return cmdRoll(c, a);
      case 'seal': return cmdSeal(c);
      case 'apply': return cmdApply(c, a);
      case 'open': return cmdOpen(c);
      case 'tasks': return cmdTasks(c, a);
      case 'ingest': return cmdIngest(c, a);
      default: return cmdReplay(c, a);
    }
  })();
  return r;
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  let r;
  try {
    r = run(argv);
  } catch (err) {
    r = fail(1, [cliIssue('cli.error', '', err.stack ?? String(err))]);
  }
  const issues = (r.issues ?? []).map(norm);
  const code = r.code ?? 0;
  const data = r.data ?? {};
  if (json) {
    process.stdout.write(`${JSON.stringify({ ok: code === 0, exit: code, ...data, issues })}\n`);
  } else {
    if (r.text) process.stdout.write(`${r.text}\n`);
    for (const i of issues) process.stderr.write(`${i.severity} ${i.code} ${i.path}: ${i.message}\n`);
  }
  process.exitCode = code;
}

main();

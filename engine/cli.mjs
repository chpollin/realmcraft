#!/usr/bin/env node
// Command line of the rules kernel and the only writer of campaigns/<cid>/state.json.
//
//   node engine/cli.mjs <command> [args] [--campaign <cid>] [--json]
//
//   new <worldId> --seed <n> --as <template> --id <cid> [--from-state <file>]
//       [--rivals <template,template>] [--difficulty easy|normal|hard] [--lang <xx>]
//   status [--as <people>]            preview --as <people> [--draft <file>]
//   roll <probeId> <1-10>             seal            apply [--expect-rev <n>]
//   open                              tasks [--agent <name>]
//   ingest [<proposalFile>] [--consent <proposalId>]
//   validate <path> [--campaign <cid> | --world <id>]       budget <file>
//   replay [--to <turn>]              schema <name>
//   repin                             pin the campaign to the current world package
//   save --name <label>               saves                 load --slot <slot>
//
// Exit codes: 0 ok, 1 internal error (an exception the kernel did not turn
// into an issue; the output carries its stack as cli.error), 2 rejected or
// invalid, 3 missing input (player roll, file, campaign), 4 phase, revision,
// world or tamper conflict, 5 replay mismatch.
// Root: REALMCRAFT_ROOT or the working directory; campaigns/<cid> and
// welten/<worldId> below it (worlds fall back to the repository's welten/).
//
// Every transition (new, seal, apply, open, ingest) appends to
// log/journal.json. Entries of format 2 form a hash chain: each carries the
// hash of its predecessor and its own hash, and anchors next to the state
// hash the library prefix, the drafts it leaves and the world package. A
// transition on files that do not match the last entry is refused.
// The chain detects edits made outside the kernel; whoever rewrites the whole
// chain can forge it, and replay is the full proof of a campaign.
//
// A world package that changed since the campaign was pinned refuses every
// transition until `repin` validates the package and pins the campaign to it.
// repin is itself a journalled transition with an anchor of the repinned
// state, and replay starts from the last such anchor, because the steps
// before it ran on a package that no longer exists.
//
// One campaign lock serialises transitions, rolls and stored previews. A
// commit writes library, journal and state in this order, then its own files
// (drafts, reports, texts), then the views; an interrupted commit is rolled
// forward from its journal entry by the next transition.
//
// Rolls live in the player's draft. Its rolls and withdrawn list hold every
// value rolled in the turn: a probe keeps the first value rolled for its
// fingerprint, and a roll whose probe left the draft or changed is listed as
// withdrawn. A rolls.json ledger of an older kernel is ignored.
//
// A save copies the campaign folder (without saves/, lock files and the run
// marker) to saves/<slot>/campaign/ next to saves/<slot>/manifest.json. load
// checks the copy like a campaign, saves the current files as
// autosave-<rev>, stages the copy in .restore/new and swaps it in: the
// current entries move to .restore/old, the staged ones into the campaign.
// .restore/step.json marks the swap as begun; a load interrupted before it is
// dropped, one interrupted after it is completed by the next command.

import { copyFileSync, cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMAS } from './schemas/index.js';
import { validate as schemaIssues } from './content/schema.js';
import { issue, hasErrors } from './core/issues.js';
import { bareCode, kissue } from './core/codes.js';
import { hashValue } from './core/hash.js';
import { reservedKeyPaths } from './core/canon.js';
import { makeEnv } from './core/env.js';
import { calendarOf } from './core/calendar.js';
import { DEFAULT_SETTINGS, peopleIds, settingsOf } from './core/state.js';
import { checkDraft } from './core/orders.js';
import { resolveProbe, calculation } from './core/probes.js';
import { projectFor, projectEvents } from './core/project.js';
import { apply, createCampaign, creationProblem, emptyDraft, open, preview, repin, seal, stateHash } from './core/turn.js';
import { appendToLibrary, createLibrary, resolveRef } from './content/library.js';
import {
  validateBestimmung, validateCampaign, validateDraft, validateEntwicklung, validateEreignis, validateProposal, validateWorldPackage,
} from './content/validate.js';
import { scoreEntwicklungStandalone, scoreEreignis } from './content/budget.js';
import {
  LAYOUT, LockError, campaignDir, ensureLayout, readJson, renameWithRetry, turnStem, withLock, writeJsonAtomic, writeState,
} from './harness/io.js';
import { followState, initTurnStatus, recordFinding, recordVerdict } from './harness/status.js';
import { buildJudgeTask, buildTasks } from './harness/tasks.js';
import { changesState, ingestProposal } from './harness/ingest.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BOOLEAN_FLAGS = new Set(['json']);
const PACK_FILES = ['welt', 'regeln', 'labels', 'style'];
const CONTENT = ['entwicklungen', 'ereignisse', 'bestimmungen'];
// Same pattern the dev server accepts; it keeps a campaign id from naming a
// path outside campaigns/ or a Windows alias of another folder.
const CID = /^[a-z][a-z0-9-]{1,40}$/;
const JOURNAL_FORMAT = 2;
const NEW_USAGE = 'new <worldId> --seed <n> --as <template> --id <cid> [--rivals a,b] [--difficulty easy|normal|hard] [--lang de]';

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

const norm = (i) => ({
  code: bareCode(i), severity: i.severity ?? 'error', path: i.path ?? '', message: i.message ?? '', ...(i.params ? { params: i.params } : {}), ...(i.refs ? { refs: i.refs } : {}),
});
const fail = (code, issues, extra = {}) => ({ code, issues, ...extra });
const ok = (data = {}, text = '') => ({ code: 0, issues: [], data, text });
// params: the values the message interpolates and, for a generic code, the reason key.
const cliIssue = (code, path, message, params = null, severity = 'error') => issue(code, path, message, { severity, params });
const errorsOf = (issues) => issues.filter((i) => i.severity === 'error');

// Exit code of kernel issues: phase, revision, world and tamper conflicts are
// 4, a missing player roll alone is 3, everything else 2.
function exitFor(issues) {
  const errors = errorsOf(issues).map(bareCode);
  if (!errors.length) return 0;
  if (errors.some((c) => ['phase', 'finished', 'tamper', 'cli.stale_rev', 'cli.world_drift', 'cli.interrupted'].includes(c))) return 4;
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

// Files after the state are bookkeeping a later command can redo; their
// failure becomes a warning instead of undoing a committed transition.
function soft(issues, what, fn) {
  try {
    fn();
  } catch (err) {
    issues.push(cliIssue('cli.downstream', '', `${what} not written: ${err.message}`, { what, error: err.message }, 'warning'));
  }
}

// --- worlds and campaigns ----------------------------------------------------

const rootOf = () => resolve(process.env.REALMCRAFT_ROOT ?? process.cwd());

function worldDirFor(root, worldId) {
  if (!CID.test(String(worldId))) return null;
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
    if (r.error) problems.push(issue('schema.required', `/${key}`, r.missing ? `${file} is missing` : r.error, { params: { file, missing: Boolean(r.missing) } }));
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

// `at` other than the campaign folder: a save being checked before a load.
function loadCampaign(root, cid, at = null) {
  if (!cid) return { error: fail(3, [cliIssue('cli.missing_input', '/campaign', 'a command needs --campaign <cid>', { flag: 'campaign' })]) };
  if (!CID.test(cid)) return { error: fail(2, [cliIssue('format', '/campaign', `campaign id "${cid}" must match ${CID.source}`, { reason: 'campaign-id', campaign: cid, pattern: CID.source })]) };
  const dir = at ?? campaignDir(root, cid);
  if (!existsSync(join(dir, LAYOUT.state))) return { error: fail(3, [cliIssue('cli.no_campaign', '/campaign', `no campaign "${cid}" under ${join(root, 'campaigns')}`, { campaign: cid })]) };
  const state = readJson(join(dir, LAYOUT.state));
  const library = readJson(join(dir, LAYOUT.library), { fallback: createLibrary() });
  const lock = readJson(join(dir, LAYOUT.worldLock), { fallback: null });
  const worldId = lock?.id ?? state.campaign.world.id;
  const lockedDir = lock?.worldDir ? (isAbsolute(lock.worldDir) ? lock.worldDir : join(root, lock.worldDir)) : null;
  const worldDir = lockedDir && existsSync(join(lockedDir, 'welt.json')) ? lockedDir : worldDirFor(root, worldId);
  if (!worldDir) return { error: fail(3, [cliIssue('cli.no_world', '/world', `world package "${worldId}" not found`, { world: worldId })]) };
  const { pack, problems } = loadPack(worldDir);
  if (problems.length) return { error: fail(2, problems) };
  const holder = { library };
  const env = buildEnv(pack, holder);
  const warnings = [];
  const drift = (lock?.hash ?? state.campaign.world.hash) !== env.hash;
  if (drift) warnings.push(cliIssue('cli.world_drift', '/world', `world package "${worldId}" differs from the one the campaign was created with`, { world: worldId }, 'warning'));
  return { c: { root, cid, dir, state, library, lock, pack, env, holder, worldDir, warnings, drift } };
}

// --- journal -----------------------------------------------------------------

const journalPath = (dir) => join(dir, LAYOUT.log, 'journal.json');
const readJournal = (dir) => readJson(journalPath(dir), { fallback: null });
// Entries before format 2 carry no hash of their own and hash as a whole.
const entryHash = (e) => e.hash ?? hashValue(e);
const libraryAnchor = (library, count = library.entries.length) => hashValue(library.entries.slice(0, count));

/** A format-2 journal entry chained to the last entry of `journal`. */
function chainEntry(journal, c, fields, { library, drafts }) {
  const prev = journal.at(-1);
  const body = {
    ...fields,
    kernel: JOURNAL_FORMAT,
    prev: prev ? entryHash(prev) : null,
    libraryCount: library.entries.length,
    libraryHash: libraryAnchor(library),
    draftsHash: hashValue(drafts),
    worldHash: c.env.hash,
  };
  return { ...body, hash: hashValue(body) };
}

/** Problems of the chain itself: an edited entry, a broken link, a revision that does not rise. */
function chainIssues(journal) {
  const bad = (i, why) => [kissue('tamper', `/journal/${i}`, `log/journal.json entry ${i} ${why}`, { params: { reason: 'journal-chain', entry: i } })];
  for (let i = 0; i < journal.length; i++) {
    const e = journal[i];
    if (i > 0 && Number.isInteger(journal[i - 1].revAfter) && !(e.revAfter > journal[i - 1].revAfter)) return bad(i, 'does not raise the revision');
    if (e.kernel === undefined) {
      if (i > 0 && journal[i - 1].kernel !== undefined) return bad(i, 'drops the hash chain');
      continue;
    }
    const { hash, ...body } = e;
    if (hash !== hashValue(body)) return bad(i, 'was edited after it was written');
    if (body.prev !== (i ? entryHash(journal[i - 1]) : null)) return bad(i, 'does not follow its predecessor');
  }
  return [];
}

// --- rolls -------------------------------------------------------------------

const isRollValue = (v) => Number.isInteger(v) && v >= 1 && v <= 10;
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The player's draft with rolls and withdrawn settled against `stored`, the
 * stored draft of the turn, whose rolls and withdrawn list hold the values
 * rolled so far. A probe keeps the value held for its id and fingerprint, so
 * an order removed and added again gets its first roll back. An incoming
 * value counts only for a probe with no held roll, and only when `adopt` is
 * set (a draft the player submits). An incoming roll whose probe left the
 * draft or changed stays as it is, so the check reports it as roll_stale
 * until the player drops it; a held roll no longer in the draft is listed as
 * withdrawn. Returns { draft, kept } (kept: probes whose incoming value was
 * ignored for the held one).
 */
function settleRolls(view, env, draft, pid, stored, { adopt = false } = {}) {
  const chk = checkDraft(view, env, { ...draft, rolls: {}, withdrawn: [] }, { as: pid, mode: 'preview' });
  const probes = new Map(chk.probes.filter((x) => x.roller === 'player').map((p) => [p.id, p]));
  // The stored file is read back from disk, so its shape is checked before use.
  const mine = [
    ...(Array.isArray(stored.withdrawn) ? stored.withdrawn : []),
    ...Object.entries(isRecord(stored.rolls) ? stored.rolls : {}).map(([probe, r]) => isRecord(r) && { ...r, probe }),
  ].filter(isRecord);
  const offered = isRecord(draft.rolls) ? draft.rolls : {};
  const rolls = {};
  const added = [];
  const kept = [];
  for (const p of probes.values()) {
    const held = mine.find((r) => r.probe === p.id && r.fingerprint === p.fingerprint);
    const inc = Object.hasOwn(offered, p.id) ? offered[p.id] : null;
    if (held) {
      rolls[p.id] = { value: held.value, fingerprint: p.fingerprint };
      if (inc && inc.fingerprint === p.fingerprint && inc.value !== held.value) kept.push(p.id);
    } else if (adopt && inc && inc.fingerprint === p.fingerprint && isRollValue(inc.value)) {
      rolls[p.id] = { value: inc.value, fingerprint: p.fingerprint };
      added.push({ probe: p.id, fingerprint: p.fingerprint, value: inc.value });
    }
  }
  for (const [id, r] of Object.entries(offered)) {
    if (Object.hasOwn(rolls, id) || !r || typeof r !== 'object') continue;
    if (!probes.has(id) || probes.get(id).fingerprint !== r.fingerprint) rolls[id] = { value: r.value, fingerprint: r.fingerprint };
  }
  const usedKey = new Set(Object.entries(rolls).map(([id, r]) => `${id}|${r.fingerprint}`));
  const seen = new Set();
  const withdrawn = [];
  for (const r of [...mine, ...added]) {
    const k = `${r.probe}|${r.fingerprint}`;
    if (usedKey.has(k) || seen.has(k)) continue;
    seen.add(k);
    withdrawn.push({ probe: r.probe, value: r.value, fingerprint: r.fingerprint });
  }
  return { draft: { ...draft, rolls, withdrawn: withdrawn.slice(-16) }, kept };
}

// --- views, index, tasks -----------------------------------------------------

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

// Judges' findings reach the next tasks for two turns.
const FINDING_TURNS = 2;
const INGESTED = 'agents/ingested';

/**
 * Accepted items of earlier proposals that later tasks carry (see
 * engine/harness/tasks.js, notes): judges' findings of the recent turns and
 * the stances of every rival before this turn. Only items the verdict
 * accepted count; a file without its verdict is skipped.
 */
function agentNotes(c, turn) {
  const findings = [];
  const stances = {};
  for (const n of listJson(join(c.dir, INGESTED))) {
    const m = /^(judge-[a-z]+|rival)\.(?:([a-z0-9-]+)\.)?T(\d+)\.json$/.exec(n);
    if (!m) continue;
    const [, agent, people, t] = m;
    const at = Number(t);
    if (agent === 'rival' ? !people || at >= turn : at < turn - FINDING_TURNS || at > turn) continue;
    const proposal = tryJson(join(c.dir, INGESTED, n)).value;
    const verdict = tryJson(join(c.dir, LAYOUT.verdicts, n)).value;
    if (!proposal || !Array.isArray(proposal.items) || !Array.isArray(verdict?.items)) continue;
    for (const v of verdict.items) {
      const item = v.verdict === 'accepted' ? proposal.items[v.index] : null;
      if (item?.type === 'finding') findings.push({ id: item.id, judge: agent, turn: at, severity: item.severity, for: item.for, text: item.text });
      if (item?.type === 'stance' && agent === 'rival') (stances[people] ??= []).push({ turn: at, text: item.text });
    }
  }
  findings.sort((a, b) => a.turn - b.turn || (a.judge < b.judge ? -1 : a.judge > b.judge ? 1 : 0));
  for (const list of Object.values(stances)) list.sort((a, b) => a.turn - b.turn);
  return { findings, stances };
}

function writeTasks(c, state, phase = state.phase) {
  const notes = agentNotes(c, state.turn);
  for (const { path, task } of buildTasks(state, c.env, { library: c.library, phase, notes })) writeJsonAtomic(join(c.dir, path), task);
}

// --- transitions -------------------------------------------------------------

const draftPath = (c, pid) => join(c.dir, LAYOUT.drafts, `${pid}.json`);

/** Stored drafts of the current turn; drafts of an earlier turn are left over and ignored. */
function draftsOf(c, turn = c.state.turn) {
  const out = {};
  for (const n of listJson(join(c.dir, LAYOUT.drafts))) {
    const d = tryJson(join(c.dir, LAYOUT.drafts, n)).value;
    if (d && d.turn === turn) out[n.slice(0, -5)] = d;
  }
  return out;
}

// The files a transition writes besides the state, per operation. They run
// after the state is written and again when an interrupted commit is rolled
// forward, so each must be repeatable.
const POST = {
  open: () => {},
  repin(cc) {
    const lock = readJson(join(cc.dir, LAYOUT.worldLock), { fallback: {} });
    writeJsonAtomic(join(cc.dir, LAYOUT.worldLock), { ...lock, id: cc.env.welt.id, version: cc.env.welt.version, hash: cc.env.hash });
  },
  seal(cc, res) {
    for (const [pid, d] of Object.entries(res.drafts)) writeJsonAtomic(draftPath(cc, pid), d);
  },
  apply(cc, res, entry) {
    writeJsonAtomic(join(cc.dir, LAYOUT.log, `${turnStem(entry.turn)}.json`), res.report);
    for (const n of listJson(join(cc.dir, LAYOUT.drafts))) unlinkSync(join(cc.dir, LAYOUT.drafts, n));
  },
  ingest(cc, res) {
    for (const [pid, d] of Object.entries(res.drafts)) writeJsonAtomic(draftPath(cc, pid), d);
    // Texts of several proposals (or several items) for one file add up.
    for (const t of res.texts) {
      const full = join(cc.dir, t.path);
      mkdirSync(dirname(full), { recursive: true });
      const old = existsSync(full) ? readText(full) : '';
      writeFileSync(full, old ? `${old.replace(/\s*$/, '')}\n\n${t.text}` : t.text);
    }
  },
};

/** Drafts on disk once the transition's own files are written. */
function draftsAfter(cc, op, res) {
  if (op === 'apply') return {};
  if (op === 'seal' || op === 'ingest') return { ...draftsOf(cc), ...res.drafts };
  return draftsOf(cc);
}

/** Views, index, tasks and status: rebuilt from the state, never fatal. */
function downstream(cc, next, events, issues, { op }) {
  soft(issues, 'views', () => writeViews(cc, next));
  soft(issues, 'event views', () => writeEventViews(cc, next, events ?? []));
  soft(issues, 'campaign index', () => upsertIndex(cc, next));
  if (op !== 'ingest') soft(issues, 'tasks', () => writeTasks({ ...cc, library: cc.holder.library }, next));
  soft(issues, 'status', () => followState(cc.dir, next));
}

/**
 * Library, journal, state, own files, views. Nothing is written when the new
 * state fails its schema; a state write that fails after the journal entry
 * takes the entry back. Returns { issues, entry }.
 */
function commit(cc, { op, next, input, res, events, library = cc.library }) {
  const bad = schemaIssues(SCHEMAS.campaign, next);
  if (bad.length) return { issues: bad };
  const journal = readJournal(cc.dir) ?? [];
  // The first chained entry after a journal of an older kernel anchors the
  // state it starts from: the older steps need not replay on this kernel.
  const fields = { op, turn: cc.state.turn, revAfter: next.rev, hashAfter: stateHash(next), input };
  if (journal.length && journal.at(-1).kernel === undefined) {
    fields.base = { anchor: `anchors/kernel${JOURNAL_FORMAT}-r${cc.state.rev}.json`, libraryCount: cc.library.entries.length };
    writeJsonAtomic(join(cc.dir, fields.base.anchor), cc.state);
  }
  if (library !== cc.library) writeJsonAtomic(join(cc.dir, LAYOUT.library), library);
  const entry = chainEntry(journal, cc, fields, { library, drafts: draftsAfter(cc, op, res) });
  writeJsonAtomic(journalPath(cc.dir), [...journal, entry]);
  const w = writeState(cc.dir, next, { expectRev: cc.state.rev, validate: false });
  if (!w.ok) {
    writeJsonAtomic(journalPath(cc.dir), journal);
    return { issues: w.issues };
  }
  cc.holder.library = library;
  const issues = [];
  soft(issues, `${op} files`, () => POST[op](cc, res, entry));
  downstream(cc, next, events, issues, { op });
  return { issues, entry };
}

/** One journal step from a state: { state, library, res }. Shared by replay and roll-forward. */
function runStep(state, env, e, library, holder) {
  if (e.op === 'open') {
    const res = open(state, env);
    return { state: res.state, library, res };
  }
  if (e.op === 'seal') {
    const res = seal(state, env, e.input.drafts);
    return { state: res.state, library, res };
  }
  if (e.op === 'apply') {
    const res = apply(state, env, e.input.drafts);
    return { state: res.state, library, res };
  }
  if (e.op === 'repin') {
    const res = repin(state, env);
    return { state: res.state, library, res };
  }
  if (e.op === 'ingest') {
    holder.library = library;
    const res = ingestProposal(state, env, e.input.proposal, { task: e.input.task, library, consent: e.input.consent, fog: (e.kernel ?? 1) >= 2, holder: (e.kernel ?? 1) >= 2 ? holder : null });
    holder.library = res.library;
    return { state: res.state, library: res.library, res };
  }
  throw new Error(`unknown journal operation ${e.op}`);
}

/**
 * A commit that wrote its journal entry but not the state: the state still
 * matches the entry before. The step is run again from the library prefix the
 * earlier entry anchored and must reproduce the recorded hash.
 */
function rollForward(cc, journal) {
  const last = journal.at(-1);
  const before = journal.at(-2);
  if (!before || !last.kernel || !POST[last.op] || stateHash(cc.state) !== before.hashAfter) return null;
  const count = before.libraryCount ?? cc.library.entries.length;
  const library = { ...cc.library, entries: cc.library.entries.slice(0, count) };
  let step;
  try {
    step = runStep(cc.state, cc.env, last, library, cc.holder);
  } catch (err) {
    return [cliIssue('cli.interrupted', '/journal', `the interrupted ${last.op} could not be repeated: ${err.message}`, { reason: 'repeat-failed', op: last.op, error: err.message })];
  }
  if (stateHash(step.state) !== last.hashAfter) {
    return [cliIssue('cli.interrupted', '/journal', `the interrupted ${last.op} does not reproduce its journal entry`, { reason: 'not-reproduced', op: last.op })];
  }
  if (step.library !== library) writeJsonAtomic(join(cc.dir, LAYOUT.library), step.library);
  const w = writeState(cc.dir, step.state, { expectRev: cc.state.rev, validate: false });
  if (!w.ok) return w.issues;
  const issues = [cliIssue('cli.recovered', '/journal', `the interrupted ${last.op} of turn ${last.turn} was completed`, { op: last.op, turn: last.turn }, 'warning')];
  const cc2 = { ...cc, state: step.state, library: step.library };
  soft(issues, `${last.op} files`, () => POST[last.op](cc2, step.res, last));
  downstream(cc2, step.state, step.res.events, issues, { op: last.op });
  cc.state = step.state;
  cc.library = step.library;
  cc.holder.library = step.library;
  cc.warnings.push(...issues);
  return [];
}

/** The campaign files match the journal; an interrupted commit is completed first. */
function guard(cc, { allowDrift = false } = {}) {
  const journal = readJournal(cc.dir);
  if (!journal?.length) return [kissue('tamper', '/state', 'the campaign has no journal, its state cannot be verified', { params: { reason: 'no-journal' } })];
  const chain = chainIssues(journal);
  if (chain.length) return chain;
  let last = journal.at(-1);
  if (stateHash(cc.state) !== last.hashAfter) {
    const rolled = rollForward(cc, journal);
    if (rolled === null) return [kissue('tamper', '/state', 'state.json was changed outside the kernel (hash differs from the journal)', { params: { reason: 'state-edited' } })];
    if (rolled.length) return rolled;
    last = journal.at(-1);
  }
  if (last.kernel !== undefined) {
    // An interrupted ingest may leave library entries no state refers to yet.
    if (cc.library.entries.length > last.libraryCount) cc.library = { ...cc.library, entries: cc.library.entries.slice(0, last.libraryCount) };
    if (cc.library.entries.length !== last.libraryCount || libraryAnchor(cc.library) !== last.libraryHash) {
      return [kissue('tamper', '/library', 'library.json was changed outside the kernel', { params: { reason: 'library-edited' } })];
    }
    cc.holder.library = cc.library;
    if (!allowDrift && last.worldHash !== cc.env.hash) return [cliIssue('cli.world_drift', '/world', 'the world package changed since the last transition; restore it or run repin', { reason: 'since-transition' })];
  }
  if (!allowDrift && cc.drift) return [cliIssue('cli.world_drift', '/world', 'the world package differs from the one the campaign is pinned to; restore it or run repin', { reason: 'since-pin' })];
  return [];
}

const lockHeld = (cid) => cliIssue('cli.locked', '/campaign', `another command holds the lock of campaign ${cid}; try again when it has finished`, { reason: 'lock-held', campaign: cid });

/** Runs fn on a freshly loaded campaign under the campaign lock. */
function locked(c, fn, { verify = true, allowDrift = false } = {}) {
  try {
    return withLock(c.dir, 'campaign', () => {
      const settled = settledIssues(settleRestore(c.dir));
      const fresh = loadCampaign(c.root, c.cid);
      if (fresh.error) return fresh.error;
      const cc = fresh.c;
      if (verify) {
        const t = guard(cc, { allowDrift });
        if (t.length) return fail(exitFor(t), [...settled, ...t]);
      }
      if (settled.length) refreshAfterLoad(cc, settled);
      const r = fn(cc);
      return { ...r, issues: [...settled, ...cc.warnings.filter((w) => bareCode(w) !== 'cli.world_drift'), ...(r.issues ?? [])] };
    });
  } catch (err) {
    if (err instanceof LockError) return fail(4, [lockHeld(c.cid)]);
    throw err;
  }
}

const outcome = (res, extra = {}) => ({ code: res.code, issues: res.issues, data: res.data ?? {}, text: res.text ?? '', ...extra });

// --- new ---------------------------------------------------------------------

function cmdNew(a) {
  const root = rootOf();
  const [worldId] = a.positional;
  const cid = flag(a, 'id');
  if (!worldId || !cid) return fail(3, [cliIssue('cli.missing_input', '', `usage: ${NEW_USAGE}`, { reason: 'usage' })]);
  if (!CID.test(cid)) return fail(2, [cliIssue('format', '/id', `campaign id "${cid}" must match ${CID.source}`, { reason: 'campaign-id', campaign: cid, pattern: CID.source })]);
  const worldDir = worldDirFor(root, worldId);
  if (!worldDir) return fail(3, [cliIssue('cli.no_world', '/world', `world package "${worldId}" not found`, { world: worldId })]);
  const { pack, problems } = loadPack(worldDir);
  const checked = [...problems, ...validateWorldPackage(pack)];
  if (hasErrors(checked)) return fail(2, checked);

  const dir = campaignDir(root, cid);
  // Windows folds case and trailing dots, so another spelling of an existing id is the same folder.
  const taken = existsSync(join(root, 'campaigns'))
    && readdirSync(join(root, 'campaigns')).some((n) => n.toLowerCase().replace(/[. ]+$/, '') === cid);
  if (existsSync(join(dir, LAYOUT.state)) || taken) return fail(2, [cliIssue('duplicate', '/id', `campaign "${cid}" already exists`, { reason: 'campaign-exists', campaign: cid })]);
  const holder = { library: packLibrary(pack) };
  let env;
  try {
    env = buildEnv(pack, holder);
  } catch (err) {
    return fail(2, [cliIssue('format', '/world', err.message, { reason: 'world-package', world: worldId })]);
  }
  const seedArg = flag(a, 'seed');
  const fromState = flag(a, 'from-state');
  // Creation options are checked here, at the boundary, so a wrong flag is an issue and not an exception.
  const rivalsArg = flag(a, 'rivals');
  const options = {
    player: flag(a, 'as') ?? null,
    rivals: rivalsArg === undefined ? null : String(rivalsArg).split(',').map((s) => s.trim()).filter(Boolean),
    difficulty: flag(a, 'difficulty') ?? DEFAULT_SETTINGS.difficulty,
    language: flag(a, 'lang') ?? DEFAULT_SETTINGS.language,
  };
  if (fromState && (rivalsArg !== undefined || flag(a, 'difficulty') !== undefined || flag(a, 'lang') !== undefined)) {
    return fail(2, [cliIssue('format', '/from-state', '--rivals, --difficulty and --lang do not apply to --from-state', { reason: 'options-with-state' })]);
  }
  const problem = fromState ? null : creationProblem(env, options);
  if (problem) {
    const { message, ...params } = problem;
    const at = { 'unknown-template': options.rivals?.includes(problem.template) ? '/rivals' : '/as', 'rival-is-player': '/rivals', 'rival-twice': '/rivals', rivals: '/rivals', difficulty: '/difficulty', language: '/lang' }[problem.reason];
    return fail(2, [cliIssue('target', at, message, params)]);
  }

  let state;
  let seed;
  let player;
  if (fromState) {
    const r = tryJson(resolve(fromState));
    if (r.error) return fail(3, [cliIssue('cli.missing_input', '/from-state', r.error, { reason: r.missing ? 'file-missing' : 'file-unreadable', file: fromState })]);
    state = { ...r.value, campaign: { ...r.value.campaign, id: cid } };
    const bad = [...schemaIssues(SCHEMAS.campaign, state), ...reservedKeyPaths(state).map((p) => cliIssue('format', p, 'a reserved name cannot serve as an id or key', { reason: 'reserved-name' }))];
    if (bad.length) return fail(2, bad);
    seed = state.map.seed;
    player = state.campaign.player;
  } else {
    if (seedArg === undefined) return fail(3, [cliIssue('cli.missing_input', '/seed', 'new needs --seed <n>', { reason: 'seed' })]);
    seed = parseSeed(seedArg);
    try {
      state = createCampaign(env, { id: cid, seed, ...options }).state;
    } catch (err) {
      return fail(2, [cliIssue('format', '/as', err.message, { reason: 'creation-failed' })]);
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
  const entry = chainEntry([], c, { op: 'new', turn: state.turn, revAfter: state.rev, hashAfter: stateHash(state), input: fromState ? { anchor: 'anchor.json' } : {} }, { library: holder.library, drafts: {} });
  writeJsonAtomic(journalPath(dir), [entry]);
  const issues = [];
  soft(issues, 'views', () => writeViews(c, state));
  soft(issues, 'event views', () => writeEventViews(c, state, state.chronicle));
  soft(issues, 'campaign index', () => upsertIndex(c, state));
  soft(issues, 'tasks', () => writeTasks(c, state));
  soft(issues, 'status', () => initTurnStatus(dir, state.turn));
  const rivals = peopleIds(state).filter((p) => p !== player);
  const data = { campaign: cid, world: worldId, player, rivals, settings: settingsOf(state), turn: state.turn, phase: state.phase, rev: state.rev, dir };
  return { ...ok(data, `campaign ${cid} created at turn ${state.turn}, phase ${state.phase}`), issues };
}

// --- reading commands --------------------------------------------------------

function playerOf(c, a) {
  return flag(a, 'as') ?? c.state.campaign.player;
}

const storedDraft = (c, pid) => {
  const stored = tryJson(draftPath(c, pid)).value;
  return stored && stored.turn === c.state.turn ? stored : emptyDraft(c.state, pid);
};

function openProbes(c, pid) {
  const { state } = c;
  if (!['planning', 'agents'].includes(state.phase) || pid !== state.campaign.player) return [];
  const draft = storedDraft(c, pid);
  const chk = checkDraft(projectFor(state, c.env, pid), c.env, draft, { as: pid, mode: 'preview' });
  return chk.probes.filter((p) => p.roller === 'player' && !draft.rolls[p.id]).map((p) => p.id);
}

function cmdStatus(c, a) {
  const { state } = c;
  const pid = playerOf(c, a);
  if (!Object.hasOwn(state.peoples, pid)) return fail(2, [cliIssue('target', '/as', `no people "${pid}"`, { reason: 'no-people', people: pid })]);
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
    settings: settingsOf(state),
    probes: openProbes(c, pid),
    tasks,
    proposals: waiting,
  };
  return { ...ok(data, `${state.campaign.id}: turn ${state.turn} (${cal.season} ${cal.year}), phase ${state.phase}, rev ${state.rev}, ${state.status}`), issues: c.warnings };
}

// The preview runs on the people's projection, as seal and apply check it,
// so its errors never reveal what the people cannot see.
function previewResult(c, pid, draft) {
  const pv = preview(projectFor(c.state, c.env, pid), c.env, draft, { as: pid });
  const errors = errorsOf(pv.issues);
  const rollsMissing = (pv.unresolved ?? []).some((u) => u.probe);
  let code = 0;
  if (errors.length) code = exitFor(pv.issues);
  else if (rollsMissing) code = 3;
  return { code, issues: pv.issues, data: { ...pv, issues: undefined } };
}

const draftPhaseIssue = (state) => (!['planning', 'agents'].includes(state.phase) || state.status === 'ended'
  ? cliIssue('phase', '/phase', `drafts and rolls are accepted in planning or agents, the campaign is in ${state.phase}`, { reason: 'draft-closed', phase: state.phase })
  : null);

function cmdPreview(c, a) {
  const pid = flag(a, 'as') ?? c.state.campaign.player;
  if (!Object.hasOwn(c.state.peoples, pid)) return fail(2, [cliIssue('target', '/as', `no people "${pid}"`, { reason: 'no-people', people: pid })]);
  const file = flag(a, 'draft');
  if (!file) {
    const res = previewResult(c, pid, storedDraft(c, pid));
    return outcome(res, { text: `preview for ${pid}: ${res.data.probes.length} probes, ${errorsOf(res.issues).length} errors` });
  }
  const r = tryJson(resolve(file));
  if (r.error) return fail(3, [cliIssue('cli.missing_input', '/draft', r.error, { reason: r.missing ? 'file-missing' : 'file-unreadable', file })]);
  if (pid !== c.state.campaign.player) return fail(2, [cliIssue('target', '/as', 'only the player people stores a draft', { reason: 'not-player', people: pid })]);
  return locked(c, (cc) => {
    const phase = draftPhaseIssue(cc.state);
    if (phase) return fail(4, [phase]);
    const incoming = r.value;
    const view = projectFor(cc.state, cc.env, pid);
    // A draft that does not parse as a draft or names another turn is not stored.
    const shape = errorsOf(checkDraft(view, cc.env, { ...incoming, sealed: false }, { as: pid, mode: 'preview' }).issues);
    if (shape.some((i) => i.code.startsWith('schema.') || ['format', 'stale'].includes(i.code))) return fail(2, shape);
    const rec = settleRolls(view, cc.env, { ...incoming, sealed: false }, pid, storedDraft(cc, pid), { adopt: true });
    writeJsonAtomic(draftPath(cc, pid), rec.draft);
    const res = previewResult(cc, pid, rec.draft);
    const kept = rec.kept.map((id) => cliIssue('duplicate', `/rolls/${id}`, `probe ${id} keeps its first roll ${rec.draft.rolls[id].value}`,
      { reason: 'roll-kept', probe: id, value: rec.draft.rolls[id].value }, 'warning'));
    res.issues = [...kept, ...res.issues];
    res.data.stored = true;
    res.data.draft = rec.draft;
    return outcome(res, { text: `preview for ${pid}: ${res.data.probes.length} probes, ${errorsOf(res.issues).length} errors` });
  });
}

function cmdRoll(c, a) {
  const [probeId, raw] = a.positional;
  const value = Number(raw);
  if (!probeId || raw === undefined) return fail(3, [cliIssue('cli.missing_input', '', 'usage: roll <probeId> <1-10>', { reason: 'usage' })]);
  if (!isRollValue(value)) return fail(2, [cliIssue('format', '/value', 'a roll is an integer from 1 to 10', { reason: 'roll-value', min: 1, max: 10 })]);
  return locked(c, (cc) => {
    const phase = draftPhaseIssue(cc.state);
    if (phase) return fail(4, [phase]);
    const pid = cc.state.campaign.player;
    const view = projectFor(cc.state, cc.env, pid);
    const stored = storedDraft(cc, pid);
    const rec = settleRolls(view, cc.env, stored, pid, stored);
    const chk = checkDraft(view, cc.env, rec.draft, { as: pid, mode: 'preview' });
    const probe = chk.probes.find((p) => p.id === probeId && p.roller === 'player');
    if (!probe) return fail(2, [cliIssue('target', '/probe', `no probe "${probeId}" the player rolls in the current draft`, { reason: 'no-probe', probe: probeId })]);
    const held = rec.draft.rolls[probeId];
    if (held) return fail(2, [cliIssue('duplicate', '/probe', `probe ${probeId} was already rolled (${held.value})`, { reason: 'already-rolled', probe: probeId, value: held.value })]);
    writeJsonAtomic(draftPath(cc, pid), { ...rec.draft, sealed: false, rolls: { ...rec.draft.rolls, [probeId]: { value, fingerprint: probe.fingerprint } } });
    const resolved = resolveProbe(probe, value);
    return ok({ probe: { ...resolved, calculation: calculation(resolved) }, band: resolved.band, natural: resolved.natural, margin: resolved.margin }, calculation(resolved));
  });
}

// --- transitions -------------------------------------------------------------

function cmdSeal(c) {
  return locked(c, (cc) => {
    const drafts = draftsOf(cc);
    const res = seal(cc.state, cc.env, drafts);
    if (!res.ok) return fail(exitFor(res.issues), res.issues);
    const done = commit(cc, { op: 'seal', next: res.state, input: { drafts }, res, events: res.events });
    if (!done.entry) return fail(2, done.issues);
    return { ...ok({ turn: res.state.turn, phase: res.state.phase, rev: res.state.rev, substitutions: res.substitutions, draws: res.state.eventDraws }, `sealed turn ${res.state.turn}, rev ${res.state.rev}`), issues: done.issues };
  });
}

function cmdApply(c, a) {
  return locked(c, (cc) => {
    const expect = flag(a, 'expect-rev');
    if (expect !== undefined && Number(expect) !== cc.state.rev) {
      return fail(4, [cliIssue('cli.stale_rev', '/rev', `state is at revision ${cc.state.rev}, expected ${expect}`, { rev: cc.state.rev, expected: String(expect) })]);
    }
    if (cc.state.status === 'ended') return fail(4, [cliIssue('finished', '', 'the campaign has ended')]);
    if (cc.state.phase !== 'resolving') return fail(4, [cliIssue('phase', '/phase', `apply needs resolving, the campaign is in ${cc.state.phase}`, { reason: 'apply-needs-resolving', phase: cc.state.phase })]);
    const drafts = draftsOf(cc);
    const res = apply(cc.state, cc.env, drafts);
    if (!res.ok) return fail(exitFor(res.issues), res.issues);
    const resolved = cc.state.turn;
    const done = commit(cc, { op: 'apply', next: res.state, input: { drafts }, res, events: res.events });
    if (!done.entry) return fail(2, done.issues);
    const data = {
      resolved, turn: res.state.turn, phase: res.state.phase, rev: res.state.rev, status: res.state.status, result: res.state.result ?? null,
      orders: res.report.sections.orders, probes: res.report.sections.probes,
    };
    return { ...ok(data, `resolved turn ${resolved}, now turn ${res.state.turn} in phase ${res.state.phase}, rev ${res.state.rev}`), issues: done.issues };
  });
}

function cmdOpen(c) {
  return locked(c, (cc) => {
    const res = open(cc.state, cc.env);
    if (!res.ok) return fail(exitFor(res.issues), res.issues);
    const done = commit(cc, { op: 'open', next: res.state, input: {}, res, events: res.events });
    if (!done.entry) return fail(2, done.issues);
    return { ...ok({ turn: res.state.turn, phase: res.state.phase, rev: res.state.rev }, `turn ${res.state.turn} is open for planning`), issues: done.issues };
  });
}

function cmdRepin(c) {
  return locked(c, (cc) => {
    const checked = validateWorldPackage(cc.pack);
    if (hasErrors(checked)) return fail(2, checked);
    const from = cc.lock?.hash ?? cc.state.campaign.world.hash;
    if (from === cc.env.hash && cc.state.campaign.world.hash === cc.env.hash) {
      return ok({ rev: cc.state.rev, hash: cc.env.hash, changed: false }, `campaign is pinned to ${cc.env.hash} already`);
    }
    const res = repin(cc.state, cc.env);
    if (!res.ok) return fail(exitFor(res.issues), res.issues);
    const anchor = `anchors/repin-r${res.state.rev}.json`;
    writeJsonAtomic(join(cc.dir, anchor), res.state);
    const done = commit(cc, { op: 'repin', next: res.state, input: { from, to: cc.env.hash, anchor }, res, events: res.events });
    if (!done.entry) return fail(2, done.issues);
    return { ...ok({ rev: res.state.rev, from, to: cc.env.hash, changed: true }, `campaign re-pinned from ${from} to ${cc.env.hash}`), issues: done.issues };
  }, { allowDrift: true });
}

// --- tasks and ingest --------------------------------------------------------

function cmdTasks(c, a) {
  const { state } = c;
  const agent = flag(a, 'agent');
  const wanted = agent?.startsWith('judge-') ? [buildJudgeTask(state, c.env, agent)] : buildTasks(state, c.env, { library: c.library, notes: agentNotes(c, state.turn) });
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
  if (typeof agent !== 'string' || !Number.isInteger(turn) || !CID.test(agent)) return null;
  const people = proposal.people ?? 'all';
  if (!CID.test(String(people))) return null;
  const file = join(c.dir, LAYOUT.tasks, turnStem(turn), `${agent}-${people}.json`);
  const held = tryJson(file).value;
  if (held) return held;
  if (turn !== state.turn) return null;
  const wanted = agent.startsWith('judge-') ? [buildJudgeTask(state, c.env, agent)] : buildTasks(state, c.env, { library: c.library, notes: agentNotes(c, state.turn) });
  return wanted.find((w) => w.task.agent === agent && w.task.people === (proposal.people ?? null))?.task ?? null;
}

/**
 * Files an ingest may read: only proposals inside agents/proposals/. Anything
 * else would let ingest move an arbitrary file into the campaign.
 */
function proposalFiles(cc, a) {
  const propDir = resolve(cc.dir, LAYOUT.proposals);
  if (!a.positional.length) return { files: listJson(propDir).map((n) => join(propDir, n)), refused: [] };
  const files = [];
  const refused = [];
  for (const f of a.positional) {
    const full = resolve(f);
    const rel = relative(propDir, full);
    if (!rel || rel.startsWith('..') || isAbsolute(rel) || /[\\/]/.test(rel) || !rel.endsWith('.json')) refused.push(f);
    else files.push(full);
  }
  return { files, refused };
}

// The envelope ties a proposal to its file and its agent: the file is named
// by the proposal id, and the id starts with the agent.
function envelopeIssues(id, proposal) {
  const out = [];
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) return [cliIssue('format', '', 'a proposal must be an object', { reason: 'not-object' })];
  if (proposal.proposalId !== id) out.push(cliIssue('format', '/proposalId', `the file ${id}.json carries proposal "${proposal.proposalId}"`, { reason: 'proposal-id', file: id, proposal: proposal.proposalId }));
  if (typeof proposal.proposalId === 'string' && proposal.proposalId.split('.')[0] !== proposal.agent) {
    out.push(cliIssue('format', '/agent', `proposal "${proposal.proposalId}" names agent "${proposal.agent}"`, { reason: 'proposal-agent', proposal: proposal.proposalId, agent: proposal.agent }));
  }
  return out;
}

function cmdIngest(c, a) {
  return locked(c, (cc) => {
    const consent = (a.flags.consent ?? []).flatMap((s) => String(s).split(','));
    const { files, refused } = proposalFiles(cc, a);
    const reports = [];
    const issues = refused.map((f) => cliIssue('target', '/file', `${f} is not a proposal file in ${LAYOUT.proposals}/`, { reason: 'not-proposal-file', file: f, folder: LAYOUT.proposals }));
    for (const f of refused) reports.push({ proposalId: f, verdict: 'refused', issues: [] });
    for (const file of files) {
      const id = file.split(/[\\/]/).pop().replace(/\.json$/, '');
      const read = tryJson(file);
      if (read.error) {
        const why = { reason: read.missing ? 'file-missing' : 'file-unreadable', file: id };
        issues.push(cliIssue('cli.missing_input', `/${id}`, read.error, why));
        reports.push({ proposalId: id, verdict: read.missing ? 'missing' : 'rejected', issues: [cliIssue('format', '', read.error, why)].map(norm) });
        if (!read.missing) moveFile(file, join(cc.dir, 'agents', 'rejected', `${id}.json`));
        continue;
      }
      const proposal = read.value;
      const state = cc.state;
      const task = taskFor(cc, proposal, state);
      let res;
      const envelope = envelopeIssues(id, proposal);
      if (!envelope.length && !task && changesState(proposal)) {
        envelope.push(cliIssue('target', '/proposalId', `no task of turn ${proposal.turn} for ${proposal.agent}${proposal.people ? ` ${proposal.people}` : ''}; items that change state need one`,
          { reason: 'no-task', turn: proposal.turn, agent: proposal.agent, people: proposal.people }));
      }
      if (envelope.length) res = { verdict: 'rejected', issues: envelope, items: [] };
      else {
        cc.holder.library = cc.library;
        res = ingestProposal(state, cc.env, proposal, { task, library: cc.library, consent, holder: cc.holder });
        if (res.verdict !== 'accepted' && res.verdict !== 'partial') cc.holder.library = cc.library;
      }
      const report = { proposalId: id, agent: proposal?.agent ?? null, verdict: res.verdict, issues: res.issues.map(norm), items: res.items.map((i) => ({ index: i.index, type: i.type, title: i.title, verdict: i.verdict, budget: i.budget, issues: i.issues.map(norm) })) };
      if (res.verdict === 'deferred') {
        reports.push(report);
        issues.push(...res.issues);
        continue;
      }
      if (res.verdict === 'accepted' || res.verdict === 'partial') {
        const input = { proposal, task, consent: consent.includes(proposal.proposalId) ? [proposal.proposalId] : [] };
        const done = commit(cc, { op: 'ingest', next: res.state, library: res.library, input, res, events: res.events });
        if (!done.entry) {
          issues.push(...done.issues);
          reports.push({ ...report, verdict: 'rejected', issues: done.issues.map(norm) });
          continue;
        }
        issues.push(...done.issues);
        cc.state = res.state;
        cc.library = res.library;
      }
      const dest = res.verdict === 'rejected' ? 'rejected' : 'ingested';
      const verdictPath = join(cc.dir, LAYOUT.verdicts, `${id}.json`);
      // A duplicate repeats a proposal already filed; its first verdict stays.
      if (res.verdict !== 'duplicate' || !existsSync(verdictPath)) writeJsonAtomic(verdictPath, report);
      moveFile(file, join(cc.dir, 'agents', dest, res.verdict === 'duplicate' && existsSync(join(cc.dir, 'agents', dest, `${id}.json`)) ? `${id}.duplicate.json` : `${id}.json`));
      if (res.verdict !== 'duplicate' && proposal && typeof proposal.agent === 'string') {
        soft(issues, 'status', () => {
          initTurnStatus(cc.dir, cc.state.turn);
          const step = `${proposal.agent}-${proposal.people ?? 'all'}`;
          for (const it of res.items) {
            recordVerdict(cc.dir, step, {
              proposalId: proposal.proposalId, kind: it.type, title: it.title || it.type, verdict: it.verdict === 'accepted' ? 'accepted' : 'rejected',
              budget: it.budget, reason: it.issues.find((i) => i.severity === 'error')?.message ?? null,
            });
          }
          // A judge's finding reaches the board only when ingest showed it to the player (all cited entries visible).
          const player = cc.state.campaign.player;
          for (const it of res.items) {
            const item = proposal.items?.[it.index];
            if (it.verdict !== 'accepted' || item?.type !== 'finding') continue;
            const shown = (res.events ?? []).some((e) => e.kind === 'ingest.finding' && e.refs?.[0] === item.id && e.visibleTo.includes(player));
            if (shown) recordFinding(cc.dir, step, { id: item.id, judge: proposal.agent, severity: item.severity, text: item.text, refs: item.refs });
          }
        });
      }
      if (res.verdict === 'rejected') issues.push(...res.issues);
      reports.push(report);
    }
    const hasRejected = reports.some((r) => r.verdict === 'rejected' || r.verdict === 'refused');
    const hasDeferred = reports.some((r) => r.verdict === 'deferred');
    const hasMissing = reports.some((r) => r.verdict === 'missing');
    const code = hasRejected ? 2 : hasDeferred ? 4 : hasMissing ? 3 : 0;
    return { code, issues, data: { proposals: reports, rev: cc.state.rev }, text: reports.map((r) => `${r.proposalId}: ${r.verdict}`).join('\n') || 'no proposals' };
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
  if (!target) return fail(3, [cliIssue('cli.missing_input', '', 'usage: validate <path>', { reason: 'usage' })]);
  const path = resolve(target);
  if (!existsSync(path)) return fail(3, [cliIssue('cli.missing_input', '/path', `${target} not found`, { reason: 'file-missing', file: target })]);
  if (statSync(path).isDirectory()) {
    const { pack, problems } = loadPack(path);
    const issues = [...problems, ...validateWorldPackage(pack)];
    return { code: hasErrors(issues) ? 2 : 0, issues, data: { kind: 'world', path }, text: `world package ${target}` };
  }
  const r = tryJson(path);
  if (r.error) return fail(2, [cliIssue('format', '', r.error, { reason: 'file-unreadable', file: target })]);
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
  else return fail(2, [cliIssue('format', '', 'unknown document: no known format, band or milestones', { reason: 'unknown-document' })]);
  const issues = res.issues ?? [];
  const items = res.items?.flatMap((i) => i.issues) ?? [];
  const all = [...issues, ...items];
  return { code: hasErrors(all) || res.ok === false ? 2 : 0, issues: all, data: { kind, budget: res.budget ?? null, items: res.items ?? undefined }, text: `${kind} ${target}` };
}

function cmdBudget(a) {
  const target = a.positional[0];
  if (!target) return fail(3, [cliIssue('cli.missing_input', '', 'usage: budget <file>', { reason: 'usage' })]);
  const r = tryJson(resolve(target));
  if (r.error) return fail(r.missing ? 3 : 2, [cliIssue('cli.missing_input', '/file', r.error, { reason: r.missing ? 'file-missing' : 'file-unreadable', file: target })]);
  const ctx = contextFor(a);
  const doc = r.value;
  if (Number.isInteger(doc?.band) && !doc.format) {
    const score = scoreEreignis(doc, ctx);
    return { code: hasErrors(score.issues) ? 2 : 0, issues: score.issues, data: { ...score, N: score.net, issues: undefined }, text: `event card ${doc.id}: net ${score.net}` };
  }
  if (doc?.format !== 'realmcraft-entwicklung') return fail(2, [cliIssue('format', '', 'budget needs an Entwicklung or an event card', { reason: 'not-priceable' })]);
  const score = scoreEntwicklungStandalone(doc, ctx.regeln);
  return { code: hasErrors(score.issues) ? 2 : 0, issues: score.issues, data: { ...score, N: score.net, issues: undefined }, text: `${doc.id}: effect ${score.effect}, price ${score.price}, net ${score.net}` };
}

function cmdSchema(a) {
  const name = a.positional[0];
  if (!name || !SCHEMAS[name]) return fail(2, [cliIssue('target', '/name', `schema name one of ${Object.keys(SCHEMAS).join(', ')}`, { reason: 'schema-name', names: Object.keys(SCHEMAS) })]);
  return ok({ name, schema: SCHEMAS[name] }, JSON.stringify(SCHEMAS[name], null, 2));
}

// --- replay ------------------------------------------------------------------

function cmdReplay(c, a) {
  const journal = readJournal(c.dir);
  if (!journal?.length) return fail(5, [cliIssue('replay.mismatch', '/journal', 'the campaign has no journal', { reason: 'no-journal' })]);
  const chain = chainIssues(journal);
  if (chain.length) return fail(5, chain.map((i) => cliIssue('replay.mismatch', i.path, i.message, i.params)));
  const to = flag(a, 'to') === undefined ? undefined : Number(flag(a, 'to'));
  const lock = c.lock;
  if (!lock) return fail(5, [cliIssue('replay.mismatch', '/world.lock', 'world.lock.json is missing', { reason: 'no-world-lock' })]);
  let library = packLibrary(c.pack);
  c.holder.library = library;
  let state = null;
  const steps = [];
  const mismatch = (i, e, reason, why) => fail(5, [cliIssue('replay.mismatch', `/journal/${i}`, `${e.op} at turn ${e.turn}: ${why}`, { reason, entry: i, op: e.op, turn: e.turn })], { data: { steps } });
  // Steps before the last repin ran on another world package, steps before a
  // base anchor on an older kernel; replay starts at the latest such anchor,
  // which the hash chain ties to the journal.
  let from = 0;
  journal.forEach((e, i) => {
    if (e.op === 'repin' || e.base) from = i;
  });
  for (const [i, e] of journal.entries()) {
    if (i < from) continue;
    if (to !== undefined && state && state.turn >= to) break;
    try {
      if (i === from && e.op === 'repin') {
        state = readJson(join(c.dir, e.input.anchor));
        library = { ...c.library, entries: c.library.entries.slice(0, e.libraryCount) };
        c.holder.library = library;
      } else if (i === from && e.base) {
        state = readJson(join(c.dir, e.base.anchor));
        if (stateHash(state) !== journal[i - 1].hashAfter) return mismatch(i, e, 'base-anchor', 'the base anchor differs from the entry before it');
        library = { ...c.library, entries: c.library.entries.slice(0, e.base.libraryCount) };
        c.holder.library = library;
        const step = runStep(state, c.env, e, library, c.holder);
        state = step.state;
        library = step.library;
      } else if (e.op === 'new') {
        state = e.input?.anchor ? readJson(join(c.dir, e.input.anchor)) : createCampaign(c.env, { id: lock.campaign, seed: lock.seed, player: lock.player }).state;
      } else {
        const step = runStep(state, c.env, e, library, c.holder);
        state = step.state;
        library = step.library;
      }
    } catch (err) {
      return mismatch(i, e, 'kernel-error', `kernel error ${err.message}`);
    }
    const h = stateHash(state);
    steps.push({ op: e.op, turn: e.turn, rev: state.rev, hash: h });
    if (h !== e.hashAfter) return mismatch(i, e, 'state-hash', `hash ${h} differs from the journal ${e.hashAfter}`);
    if (e.kernel !== undefined && libraryAnchor(library) !== e.libraryHash) return mismatch(i, e, 'library', 'the replayed library differs from the journal');
  }
  if (to === undefined && stateHash(state) !== stateHash(c.state)) return mismatch(journal.length - 1, journal.at(-1), 'state-file', 'the replayed state differs from state.json');
  return ok({ steps: steps.length, turn: state.turn, rev: state.rev, hash: stateHash(state) }, `replayed ${steps.length} transitions to turn ${state.turn}, rev ${state.rev}`);
}

// --- saves -------------------------------------------------------------------

const SAVES = 'saves';
const RESTORE = '.restore';
const SAVE_FORMAT = 'realmcraft-save';
const LABEL_MAX = 80;
// Control and bidirectional override characters: a label is shown to the
// player as it was typed and must not reorder or hide the text around it.
const LABEL_BAD = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
// Neither saved nor replaced by a load: the saves themselves, the staging
// folder and lock files (dot names) and the run marker of /zug.
const keptInPlace = (name) => name === SAVES || name.startsWith('.') || name === 'run.json';

// Test seam: REALMCRAFT_CRASH_AT=<point> ends the process at that point the
// way a crash would, lock file and half-moved folders included.
function crashPoint(point) {
  if (process.env.REALMCRAFT_CRASH_AT === point) process.exit(70);
}

/** The campaign files without what keptInPlace names and without temp files of atomic writes in flight. */
function copySnapshot(from, to) {
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    if (!keptInPlace(name)) cpSync(join(from, name), join(to, name), { recursive: true, filter: (src) => !src.endsWith('.tmp') });
  }
}

/** `stem`, or `stem-2`, `stem-3` ... when taken, so no save is ever overwritten. */
function freeSlot(dir, stem) {
  const taken = (s) => existsSync(join(dir, SAVES, s));
  if (!taken(stem)) return stem;
  for (let n = 2; ; n++) if (!taken(`${stem}-${n}`)) return `${stem}-${n}`;
}

function manifestOf(cc, slot, label, auto) {
  const { state } = cc;
  const cal = calendarOf(cc.env.regeln, state.turn);
  return {
    format: SAVE_FORMAT,
    version: 1,
    slot,
    label,
    auto,
    campaign: cc.cid,
    turn: state.turn,
    season: cal.season,
    year: cal.year,
    phase: state.phase,
    status: state.status,
    rev: state.rev,
    created: new Date().toISOString(),
    stateHash: stateHash(state),
    journalHead: entryHash(readJournal(cc.dir).at(-1)),
    world: { id: state.campaign.world.id, hash: cc.lock?.hash ?? state.campaign.world.hash },
  };
}

/** Copies the campaign into a hidden folder under saves/ and renames it to the slot when complete. */
function writeSave(cc, slot, manifest) {
  const base = join(cc.dir, SAVES);
  mkdirSync(base, { recursive: true });
  // Hidden folders are saves a crash interrupted; the campaign lock is held, so none is in progress.
  for (const n of readdirSync(base)) if (n.startsWith('.')) rmSync(join(base, n), { recursive: true, force: true });
  const tmp = join(base, `.${slot}.${randomBytes(4).toString('hex')}`);
  copySnapshot(cc.dir, join(tmp, 'campaign'));
  writeJsonAtomic(join(tmp, 'manifest.json'), manifest);
  renameWithRetry(tmp, join(base, slot));
}

function listSaves(dir) {
  let names = [];
  try {
    names = readdirSync(join(dir, SAVES));
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    if (!CID.test(n)) continue;
    const m = tryJson(join(dir, SAVES, n, 'manifest.json')).value;
    if (m?.format === SAVE_FORMAT && m.slot === n) out.push(m);
  }
  return out.sort((a, b) => String(b.created).localeCompare(String(a.created)) || (a.slot < b.slot ? 1 : -1));
}

/** Why a save or load cannot run now, or null. Load also takes an ended campaign, so a lost game can go back. */
function saveGateIssue(cc, op) {
  if (tryJson(join(cc.dir, 'run.json')).value?.active === true) {
    return cliIssue('cli.turn_running', '/run', `${op} waits until the running turn ends (run.json is active; tools/harness/run-marker.mjs end closes a run that crashed)`, { reason: 'run-active', op });
  }
  const { phase, status } = cc.state;
  if (op === 'save' && (phase !== 'planning' || status !== 'playing')) {
    return cliIssue('phase', '/phase', `save needs a playing campaign in planning, the campaign is ${status} in ${phase}`, { reason: 'save-needs-planning', phase });
  }
  if (op === 'load' && phase !== 'planning' && status !== 'ended') {
    return cliIssue('phase', '/phase', `load needs planning or an ended campaign, the campaign is in ${phase}`, { reason: 'load-needs-planning', phase });
  }
  return null;
}

function moveSetAside(from, oldDir, name) {
  mkdirSync(oldDir, { recursive: true });
  renameWithRetry(from, join(oldDir, `${name}.${randomBytes(4).toString('hex')}`));
}

/**
 * Completes or drops a load in .restore/. Without step.json the staging was
 * not finished and the campaign files are untouched, so it is dropped. With
 * step "staged" the current entries still move to .restore/old, with
 * "swapped" only the staged entries move in. Each rename is atomic, so an
 * entry is either moved or not, and a repeat continues where a crash
 * stopped. Returns the marker of a completed load, { dropped: true }, or null.
 */
function settleRestore(dir) {
  const stage = join(dir, RESTORE);
  if (!existsSync(stage)) return null;
  const marker = tryJson(join(stage, 'step.json')).value;
  if (!marker?.step) {
    rmSync(stage, { recursive: true, force: true, maxRetries: 5 });
    return { dropped: true };
  }
  const oldDir = join(stage, 'old');
  if (marker.step === 'staged') {
    mkdirSync(oldDir, { recursive: true });
    for (const n of readdirSync(dir)) {
      if (keptInPlace(n)) continue;
      if (existsSync(join(oldDir, n))) moveSetAside(join(dir, n), oldDir, n);
      else renameWithRetry(join(dir, n), join(oldDir, n));
      crashPoint('load:old');
    }
    writeJsonAtomic(join(stage, 'step.json'), { ...marker, step: 'swapped' });
  }
  const fresh = join(stage, 'new');
  for (const n of existsSync(fresh) ? readdirSync(fresh) : []) {
    // A file another writer created after the current entries moved out (status.json, a proposal) gives way.
    if (existsSync(join(dir, n))) moveSetAside(join(dir, n), oldDir, n);
    renameWithRetry(join(fresh, n), join(dir, n));
    crashPoint('load:new');
  }
  rmSync(stage, { recursive: true, force: true, maxRetries: 5 });
  return marker;
}

function settledIssues(marker) {
  if (!marker) return [];
  if (marker.dropped) return [cliIssue('cli.recovered', '/restore', 'an interrupted load was dropped before it changed the campaign', { reason: 'load-dropped' }, 'warning')];
  return [cliIssue('cli.recovered', '/restore', `the interrupted load of ${marker.slot} was completed, the previous files are in ${marker.autosave}`, { reason: 'load-completed', slot: marker.slot, autosave: marker.autosave }, 'warning')];
}

/** Views, index row and agent status follow a restored state; the board learns of the load through the view. */
function refreshAfterLoad(cc, issues) {
  soft(issues, 'views', () => writeViews(cc, cc.state));
  soft(issues, 'campaign index', () => upsertIndex(cc, cc.state));
  soft(issues, 'status', () => followState(cc.dir, cc.state));
}

/** Integrity of a saved copy: the campaign checks of a transition plus the manifest's hashes. */
function verifySave(cc, dir, manifest) {
  const loaded = loadCampaign(cc.root, cc.cid, dir);
  if (loaded.error) return loaded.error.issues;
  const sc = loaded.c;
  const t = guard(sc, { allowDrift: true });
  if (t.length) return t;
  const head = entryHash(readJournal(dir).at(-1));
  if (manifest.campaign !== cc.cid || sc.state.campaign.id !== cc.cid) {
    return [kissue('tamper', '/slot', `the save belongs to campaign ${manifest.campaign}`, { params: { reason: 'save-campaign', campaign: String(manifest.campaign) } })];
  }
  if (manifest.stateHash !== stateHash(sc.state) || manifest.journalHead !== head) {
    return [kissue('tamper', '/slot', 'the save differs from its manifest', { params: { reason: 'save-edited', slot: manifest.slot } })];
  }
  return [];
}

function labelIssue(label) {
  if (label === undefined) return { code: 3, issue: cliIssue('cli.missing_input', '/name', 'save needs --name <label>', { reason: 'usage' }) };
  const text = String(label).trim();
  const length = [...text].length;
  if (!length || length > LABEL_MAX || LABEL_BAD.test(text)) {
    return { code: 2, issue: cliIssue('format', '/name', `a save label has 1 to ${LABEL_MAX} characters without control characters`, { reason: 'label', max: LABEL_MAX }) };
  }
  return null;
}

function cmdSave(c, a) {
  const bad = labelIssue(flag(a, 'name'));
  if (bad) return fail(bad.code, [bad.issue]);
  const label = String(flag(a, 'name')).trim();
  return locked(c, (cc) => {
    const gate = saveGateIssue(cc, 'save');
    if (gate) return fail(4, [gate]);
    const slot = freeSlot(cc.dir, `save-${cc.state.rev}`);
    const manifest = manifestOf(cc, slot, label, null);
    writeSave(cc, slot, manifest);
    return ok({ save: manifest }, `saved ${cc.cid} turn ${cc.state.turn} as ${slot}`);
  }, { allowDrift: true });
}

function cmdSaves(c) {
  const saves = listSaves(c.dir);
  return ok({ saves }, saves.map((m) => `${m.slot}  turn ${m.turn} (${m.season} ${m.year})  ${m.label ?? `autosave before ${m.auto?.slot}`}`).join('\n') || 'no saves');
}

function cmdLoad(c, a) {
  const slot = flag(a, 'slot');
  if (slot === undefined) return fail(3, [cliIssue('cli.missing_input', '/slot', 'load needs --slot <slot>', { reason: 'usage' })]);
  if (!CID.test(slot)) return fail(2, [cliIssue('format', '/slot', `slot id "${slot}" must match ${CID.source}`, { reason: 'slot-id', pattern: CID.source })]);
  // Loading a save as a new campaign would need a new journal and anchor under another id; not offered.
  if (flag(a, 'as') !== undefined) return fail(2, [cliIssue('format', '/as', 'load restores a save into its own campaign only', { reason: 'fork-unsupported' })]);
  return locked(c, (cc) => {
    const gate = saveGateIssue(cc, 'load');
    if (gate) return fail(4, [gate]);
    const src = join(cc.dir, SAVES, slot);
    const manifest = tryJson(join(src, 'manifest.json')).value;
    if (manifest?.format !== SAVE_FORMAT || manifest.slot !== slot || !existsSync(join(src, 'campaign', LAYOUT.state))) {
      return fail(3, [cliIssue('cli.no_save', '/slot', `campaign ${cc.cid} has no save "${slot}"`, { slot })]);
    }
    const stage = join(cc.dir, RESTORE);
    rmSync(stage, { recursive: true, force: true, maxRetries: 5 });
    copySnapshot(join(src, 'campaign'), join(stage, 'new'));
    const bad = verifySave(cc, join(stage, 'new'), manifest);
    if (bad.length) {
      rmSync(stage, { recursive: true, force: true, maxRetries: 5 });
      return fail(exitFor(bad) || 2, bad);
    }
    const autosave = freeSlot(cc.dir, `autosave-${cc.state.rev}`);
    writeSave(cc, autosave, manifestOf(cc, autosave, null, { reason: 'load', slot }));
    crashPoint('load:staged');
    writeJsonAtomic(join(stage, 'step.json'), { step: 'staged', slot, autosave });
    settleRestore(cc.dir);

    const after = loadCampaign(cc.root, cc.cid);
    if (after.error) return after.error;
    const lc = after.c;
    const t = guard(lc, { allowDrift: true });
    const kept = cliIssue('cli.recovered', '/slot', `the files before the load are in ${autosave}`, { reason: 'load-autosave', autosave }, 'warning');
    if (t.length) return fail(exitFor(t), [...t, kept]);
    const issues = [];
    refreshAfterLoad(lc, issues);
    if (lc.drift) issues.push(cliIssue('cli.world_drift', '/world', 'the save was made under another world package; transitions wait for repin', { reason: 'save-world', world: lc.state.campaign.world.id }, 'warning'));
    const { state } = lc;
    const data = { slot, autosave, turn: state.turn, phase: state.phase, status: state.status, rev: state.rev, stateHash: stateHash(state), drift: lc.drift };
    return { ...ok(data, `loaded ${slot} into ${cc.cid}: turn ${state.turn}, rev ${state.rev}; previous files in ${autosave}`), issues };
  }, { allowDrift: true });
}

// --- main --------------------------------------------------------------------

const NEEDS_CAMPAIGN = new Set(['status', 'preview', 'roll', 'seal', 'apply', 'open', 'tasks', 'ingest', 'replay', 'repin', 'save', 'saves', 'load']);

/** An interrupted load is settled before any command reads the campaign, also one that takes no lock. */
function settleFirst(root, cid) {
  if (typeof cid !== 'string' || !CID.test(cid) || !existsSync(join(campaignDir(root, cid), RESTORE))) return { issues: [] };
  try {
    return withLock(campaignDir(root, cid), 'campaign', () => {
      const issues = settledIssues(settleRestore(campaignDir(root, cid)));
      const restored = issues.some((i) => i.params?.reason === 'load-completed') ? loadCampaign(root, cid) : null;
      if (restored?.c) refreshAfterLoad(restored.c, issues);
      return { issues };
    });
  } catch (err) {
    if (err instanceof LockError) return { error: fail(4, [lockHeld(cid)]) };
    throw err;
  }
}

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
  if (!NEEDS_CAMPAIGN.has(cmd)) return fail(2, [cliIssue('cli.unknown_command', '', `unknown command "${cmd ?? ''}"`, { command: cmd ?? '' })]);
  const settled = settleFirst(rootOf(), flag(a, 'campaign'));
  if (settled.error) return settled.error;
  const loaded = loadCampaign(rootOf(), flag(a, 'campaign'));
  if (loaded.error) return loaded.error;
  const r = dispatch(cmd, loaded.c, a);
  return settled.issues.length ? { ...r, issues: [...settled.issues, ...(r.issues ?? [])] } : r;
}

function dispatch(cmd, c, a) {
  switch (cmd) {
    case 'status': return cmdStatus(c, a);
    case 'preview': return cmdPreview(c, a);
    case 'roll': return cmdRoll(c, a);
    case 'seal': return cmdSeal(c);
    case 'apply': return cmdApply(c, a);
    case 'open': return cmdOpen(c);
    case 'tasks': return cmdTasks(c, a);
    case 'ingest': return cmdIngest(c, a);
    case 'repin': return cmdRepin(c);
    case 'save': return cmdSave(c, a);
    case 'saves': return cmdSaves(c);
    case 'load': return cmdLoad(c, a);
    default: return cmdReplay(c, a);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  let r;
  try {
    r = run(argv);
  } catch (err) {
    r = fail(1, [cliIssue('cli.error', '', err.stack ?? String(err), { error: String(err?.message ?? err) })]);
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

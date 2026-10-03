// Black-box driver for the rules kernel. Acceptance tests reach the kernel only
// through `node engine/cli.mjs` and the JSON files it writes, never through
// engine/core or engine/modules, so they stay independent of the implementation.
// Every reading of the CLI contract lives in this file, so reconciling the
// contract means editing one place.
//
// Verified against the delivered kernel CLI (engine/cli.mjs). Contract points
// the tests rely on:
//
// A1 Root. The CLI resolves campaigns/ and welten/ against its working
//    directory. Each campaign runs in a fresh temp root under os.tmpdir() that
//    holds a copy of welten/<world>. REALMCRAFT_ROOT carries the same path.
// A2 new. `new <world-id> --seed <n> --as <template> --id <cid>`, world id as
//    the folder name under welten/ (RC_ACCEPT_WORLD, default hochland), player
//    template from RC_ACCEPT_AS (default bergnomaden). `--from-state <file>`
//    loads a crafted state as the campaign (and anchors it for the tamper
//    guard); the state's campaign.id is replaced by --id.
// A3 Every other command takes `--campaign <cid>`, every command takes
//    `--json`. stdout is then one JSON document. Issues are objects with a
//    string `code` plus `severity`, `message` or `path`. Exit codes: 0 ok,
//    2 refused (validation, stale, conflict, duplicate), 3 missing input or
//    pending rolls.
// A4 Player draft. `preview --as <player> --draft <file>` stores the file as
//    drafts/<player>.json and answers with the preview. Drafts carry exactly
//    the keys of engine/schemas/draft.js.
// A5 Preview output has `probes`. A probe has id, roller ('player' when the
//    player rolls it), target, modifiers [{ source, value }], a total
//    (modTotal or mod), a fingerprint and its success probability. The world
//    event probe has id T<turn>:<people>:event and chance null (the event
//    table is rolled, there is no success chance). When rolls are missing,
//    `seal` answers exit 3 with roll_missing issues.
// A6 Turn flow planning --seal--> resolving --apply--> agents --open-->
//    planning. apply gets --expect-rev with the rev read from state.json after
//    seal; a stale rev or a conflict is refused with exit 2.
// A7 Round report at log/T<turn as 4 digits>.json, projection of a people at
//    view/<people>.json, projected events at
//    view/<people>/events/T<turn as 4 digits>.json.
// A8 Event-log entries are objects with `source`, `target` and `change`, in
//    the shape of engine/schemas/event.js (target { kind, id }, change
//    { field, before, after } or { field, delta }).
// A9 Bands. A natural 10 is 'crit_success', a natural 1 is 'crit_fail'
//    (engine/schemas/entwicklung.js). The names 'fortune' and 'setback' of
//    the Regelkern prose stay accepted.

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { ring, parseKey, key as hexKey } from '../../../engine/world/hex.js';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const CLI = join(REPO, 'engine', 'cli.mjs');
export const WORLD = process.env.RC_ACCEPT_WORLD ?? 'hochland';
export const PLAYER_TEMPLATE = process.env.RC_ACCEPT_AS ?? 'bergnomaden';
export const SEED = 48213;
export const FIXTURES = join(REPO, 'tests', 'fixtures', 'engine');
const KEEP = process.env.RC_ACCEPT_KEEP === '1';
const CALL_TIMEOUT = 180_000;

export const FORTUNE = Object.freeze(['crit_success', 'fortune']);
export const SETBACK = Object.freeze(['crit_fail', 'setback']);

// Generous per-test budgets: every CLI call is a fresh node process that may
// regenerate world chunks. Timeouts guard against hangs, not against slowness.
export const T_SHORT = 5 * 60_000;
export const T_LONG = 30 * 60_000;

// ---- process and files

export function makeRoot(label) {
  const root = mkdtempSync(join(tmpdir(), `rc-accept-${label}-`));
  const world = join(REPO, 'welten', WORLD);
  assert.ok(existsSync(world), `world package welten/${WORLD} is missing`);
  cpSync(world, join(root, 'welten', WORLD), { recursive: true });
  mkdirSync(join(root, '_input'), { recursive: true });
  return root;
}

export function removeRoot(root) {
  if (!KEEP && root) rmSync(root, { recursive: true, force: true });
}

function parseJson(text) {
  const t = (text ?? '').trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    const lines = t.split(/\r?\n/).reverse();
    for (const line of lines) {
      try {
        return JSON.parse(line);
      } catch { /* not a JSON line */ }
    }
    return null;
  }
}

function parseJsonLines(text) {
  const whole = parseJson(text);
  if (whole !== null && !/\n\s*[[{]/.test((text ?? '').trim())) return [whole];
  const out = [];
  for (const line of (text ?? '').split(/\r?\n/)) {
    try {
      out.push(JSON.parse(line));
    } catch { /* prose line */ }
  }
  if (!out.length && whole !== null) out.push(whole);
  return out;
}

export function collectIssues(doc) {
  return collect(doc, (o) => isObj(o) && typeof o.code === 'string' && ('severity' in o || 'message' in o || 'path' in o));
}

export function runCli(root, args) {
  assert.ok(existsSync(CLI), 'engine/cli.mjs does not exist yet (lanes K1 to K3 and H)');
  const r = spawnSync(process.execPath, [CLI, ...args, '--json'], {
    cwd: root,
    env: { ...process.env, REALMCRAFT_ROOT: root },
    encoding: 'utf8',
    timeout: CALL_TIMEOUT,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  const json = parseJson(r.stdout);
  const errDocs = parseJsonLines(r.stderr);
  const issues = [...collectIssues(json), ...errDocs.flatMap(collectIssues)];
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json, issues, args };
}

export function describeRun(res) {
  const cut = (s) => (s ?? '').slice(0, 1500);
  return `node engine/cli.mjs ${res.args.join(' ')} --json -> exit ${res.code}\nstdout: ${cut(res.stdout)}\nstderr: ${cut(res.stderr)}`;
}

export function expectExit(res, codes, what = '') {
  assert.ok(codes.includes(res.code), `${what} expected exit ${codes.join(' or ')}\n${describeRun(res)}`);
  return res;
}

export const codesOf = (res) => res.issues.map((i) => i.code);
export const errorIssues = (res) => res.issues.filter((i) => i.severity === 'error');

export function listJsonFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return listJsonFiles(p);
    return e.name.endsWith('.json') ? [p] : [];
  });
}

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const fixture = (rel) => readJson(join(FIXTURES, rel));

// ---- generic data helpers

export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function walk(node, fn, path = []) {
  fn(node, path);
  if (Array.isArray(node)) node.forEach((v, i) => walk(v, fn, [...path, i]));
  else if (isObj(node)) for (const [k, v] of Object.entries(node)) walk(v, fn, [...path, k]);
}

export function collect(node, pred) {
  const out = [];
  walk(node, (v) => { if (pred(v)) out.push(v); });
  return out;
}

/** Breadth-first: the shallowest value under any of the keys, so top-level fields win over nested ones. */
export function pick(node, ...keys) {
  const queue = [node];
  while (queue.length) {
    const n = queue.shift();
    if (isObj(n)) {
      for (const k of keys) if (Object.hasOwn(n, k)) return n[k];
      queue.push(...Object.values(n));
    } else if (Array.isArray(n)) queue.push(...n);
  }
  return undefined;
}

export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

/** Own hash, independent of engine/core/hash.js; `derived` is excluded as in Regelkern section 3. */
export function stateHash(state) {
  const { derived, ...rest } = state;
  return createHash('sha256').update(canonical(rest)).digest('hex');
}

export function deepEqual(a, b) {
  return canonical(a) === canonical(b);
}

/** Dotted paths of changed values; arrays count as one value, so a list change is one path. */
export function leafDiff(a, b, prefix = '') {
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].sort().flatMap((k) => leafDiff(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  }
  return deepEqual(a, b) ? [] : [prefix];
}

export function dice(seed = 1) {
  let x = (seed >>> 0) || 1;
  return () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return 1 + ((x >>> 16) % 10);
  };
}

// ---- schemas (ajv over engine/schemas, not the kernel's own interpreter)

const ajv = new Ajv2020({ strict: false, allErrors: true });
const compiled = {};

export function schemaErrors(name, data) {
  compiled[name] ??= ajv.compile(SCHEMAS[name]);
  const v = compiled[name];
  return v(data) ? [] : v.errors.map((e) => `${e.instancePath || '/'} ${e.message} ${JSON.stringify(e.params)}`);
}

export function assertSchema(name, data, label = name) {
  const errs = schemaErrors(name, data);
  assert.deepEqual(errs, [], `${label} violates engine/schemas ${name}:\n${errs.slice(0, 12).join('\n')}`);
}

// ---- probes and bands

export function expectedP(target, mod) {
  return Math.min(0.9, Math.max(0.1, (11 - target + mod) / 10));
}

export function probabilityOf(probe) {
  const raw = probe.probability ?? probe.P ?? probe.p ?? probe.chance;
  if (typeof raw !== 'number') return undefined;
  return raw > 1 ? raw / 100 : raw;
}

export const isStruck = (m) => Boolean(m.struck || m.dropped || m.ignored || m.capped || m.active === false || m.counted === false);

export function modTotalOf(probe) {
  return probe.modTotal ?? probe.mod ?? probe.modifierTotal;
}

/** Band of a probe in a CLI answer or a round report, located by probe id. */
export function bandIn(doc, probeId) {
  const hit = collect(doc, (o) => isObj(o) && (o.id === probeId || o.probe === probeId || o.probeId === probeId)
    && (typeof o.band === 'string' || typeof o.outcome === 'string'));
  if (hit.length) return hit[0].band ?? hit[0].outcome;
  const top = pick(doc, 'band', 'outcome');
  return typeof top === 'string' ? top : undefined;
}

// ---- event log (A8)

export const isLogEntry = (o) => isObj(o) && 'source' in o && 'target' in o && 'change' in o;

export function sourceOk(src) {
  if (typeof src === 'string') return /^(kernel|player|agent(:[a-z][a-z0-9-]*)?)$/.test(src);
  return isObj(src) && ['kernel', 'player', 'agent'].includes(src.kind);
}

export function entryPaths(e) {
  const out = [];
  if (typeof e.target === 'string') out.push(e.target);
  const field = isObj(e.change) ? e.change.field : undefined;
  if (typeof field === 'string') {
    out.push(field);
    if (isObj(e.target) && typeof e.target.id === 'string') {
      const prefix = { people: 'peoples', relation: 'relations', region: 'map.control', tile: 'map.features' }[e.target.kind];
      if (prefix) out.push(`${prefix}.${e.target.id}.${field}`, `${prefix}.${e.target.id}`);
    }
  }
  return out;
}

function idsAt(states, segs) {
  const ids = new Set();
  for (const s of states) {
    let n = s;
    for (const k of segs) n = n?.[k];
    if (Array.isArray(n)) n.forEach((x) => isObj(x) && ids.add(x.id));
    else if (isObj(n)) Object.entries(n).forEach(([k, x]) => { ids.add(k); if (isObj(x)) ids.add(x.id); });
  }
  return ids;
}

/** Whether a log entry accounts for the changed path; entity targets map onto their list or map. */
export function covers(entry, path, before, after) {
  if (entry.change === null || entry.change === undefined) return false;
  const near = (s) => s === path || s.startsWith(`${path}.`) || path.startsWith(`${s}.`);
  if (entryPaths(entry).some(near)) return true;
  const t = entry.target;
  if (!isObj(t)) return false;
  const seg = path.split('.');
  const states = [before, after];
  if (seg[0] === 'peoples' && seg[2] === 'council' && t.kind === 'member') return idsAt(states, seg.slice(0, 3)).has(t.id);
  if (seg[0] === 'peoples' && seg[2] === 'units' && t.kind === 'unit') return idsAt(states, seg.slice(0, 3)).has(t.id);
  if (seg[0] === 'peoples' && seg[2] === 'developments' && t.kind === 'development') {
    const f = isObj(entry.change) ? entry.change.field : undefined;
    return typeof f !== 'string' || seg.length < 4 || f.includes(seg[3]);
  }
  if (seg[0] === 'peoples' && t.kind === 'people' && t.id === seg[1] && seg.length === 2) return true;
  if (seg[0] === 'map' && seg[1] === 'settlements' && ['settlement', 'tile', 'region'].includes(t.kind)) return true;
  if (seg[0] === 'map' && seg[1] === 'control' && t.kind === 'region') return seg.length < 3 || t.id === seg[2];
  if (seg[0] === 'map' && seg[1] === 'features' && t.kind === 'tile') return seg.length < 3 || t.id === seg[2];
  if (seg[0] === 'relations' && t.kind === 'relation') return seg.length < 2 || t.id === seg[1];
  if (seg[0] === 'status' && t.kind === 'campaign') return true;
  return false;
}

// ---- state helpers

export function settlementsOf(state) {
  const s = state.map?.settlements ?? [];
  return Array.isArray(s) ? s : Object.entries(s).map(([tile, v]) => ({ tile, ...v }));
}

export function wesensart(people) {
  const w = people.identity?.wesensart ?? {};
  const tag = (x) => (typeof x === 'string' ? x : x?.tag);
  return { plus: tag(w.plus), minus: tag(w.minus) };
}

export const destinyOf = (people) => people.bestimmung ?? people.destiny ?? null;

/** Tiles at distance 2 and 3 around a tile key, in ring order, as explore candidates. */
export function tilesAround(tileKey, radii = [2, 3]) {
  const c = parseKey(tileKey);
  return radii.flatMap((r) => ring(c, r)).map(({ q, r }) => hexKey(q, r));
}

// ---- campaign driver

/**
 * `craft(state)` mutates a real state (returned value replaces it when given)
 * that is then loaded through `new --from-state`; editing state.json in place
 * is refused by the tamper guard.
 */
export function createCampaign({ label = 'c', id = 'acc-1', seed = SEED, root, craft } = {}) {
  const r = root ?? makeRoot(label);
  try {
    const baseId = craft ? `${id}-base` : id;
    expectExit(runCli(r, ['new', WORLD, '--seed', String(seed), '--as', PLAYER_TEMPLATE, '--id', baseId]), [0], 'new');
    let res = null;
    if (craft) {
      const base = readJson(join(r, 'campaigns', baseId, 'state.json'));
      const state = craft(base) ?? base;
      const file = join(r, '_input', `${id}-from-state.json`);
      writeFileSync(file, JSON.stringify(state, null, 2));
      res = runCli(r, ['new', WORLD, '--seed', String(seed), '--as', PLAYER_TEMPLATE, '--id', id, '--from-state', file]);
      expectExit(res, [0], 'new --from-state');
    }
    const c = new Campaign(r, id);
    assert.ok(c.has('state.json'), `new did not write campaigns/${id}/state.json under the temp root (assumption A1)${res ? `\n${describeRun(res)}` : ''}`);
    return c;
  } catch (err) {
    // The caller never receives the campaign, so its after() hook cannot clean up the root.
    if (!root) removeRoot(r);
    throw err;
  }
}

export class Campaign {
  constructor(root, id) {
    this.root = root;
    this.id = id;
    this.dir = join(root, 'campaigns', id);
    this.inputs = 0;
  }

  run(cmd, ...args) {
    return runCli(this.root, [cmd, ...args, '--campaign', this.id]);
  }

  path(rel) { return join(this.dir, rel); }
  has(rel) { return existsSync(this.path(rel)); }
  read(rel) { return readJson(this.path(rel)); }
  raw(rel) { return readFileSync(this.path(rel), 'utf8'); }
  state() { return this.read('state.json'); }
  get player() { return this.state().campaign.player; }

  /** Writes state.json in place, which the tamper guard refuses; only the tamper test uses it. Crafted states go through createCampaign({ craft }). */
  writeState(state) {
    writeFileSync(this.path('state.json'), JSON.stringify(state, null, 2));
  }

  /** Places a file where an agent would write its proposal (agents/proposals/). */
  writeProposal(proposal) {
    const p = this.path(`agents/proposals/${proposal.proposalId}.json`);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(proposal, null, 2));
    return p;
  }

  input(name, data) {
    const p = join(this.root, '_input', `${++this.inputs}-${name}.json`);
    writeFileSync(p, JSON.stringify(data, null, 2));
    return p;
  }

  emptyDraft(state = this.state(), orders = []) {
    return {
      format: 'realmcraft-draft',
      version: 1,
      people: state.campaign.player,
      turn: state.turn,
      baseRev: state.rev,
      orders,
      mandate: {},
      rolls: {},
      withdrawn: [],
      sealed: false,
    };
  }

  storedDraft(people = this.player) {
    return this.has(`drafts/${people}.json`) ? this.read(`drafts/${people}.json`) : null;
  }

  /** A4: preview with --draft stores the player draft and answers with the preview. */
  submit(draft) {
    return this.run('preview', '--as', draft.people, '--draft', this.input('draft', draft));
  }

  probes(res) {
    const p = pick(res.json, 'probes');
    return Array.isArray(p) ? p : [];
  }

  playerProbes(res, player = this.player) {
    return this.probes(res).filter((p) => p.roller === 'player' || (p.roller === undefined && p.people === player));
  }

  roll(probeId, value) {
    return this.run('roll', probeId, String(value));
  }

  rollPending(res, next, skip = []) {
    for (const p of this.playerProbes(res)) {
      if (skip.includes(p.id)) continue;
      expectExit(this.roll(p.id, next()), [0], `roll ${p.id}`);
    }
  }

  /** seal, and when it answers 3 with roll_missing issues, roll those probes and seal again (A5). */
  seal(next) {
    let res = this.run('seal');
    if (res.code === 3 && next) {
      const text = JSON.stringify(res.issues.filter((i) => i.code === 'roll_missing'));
      const ids = [...new Set(text.match(/T\d+:[a-z0-9-]+:[a-z0-9-]+/g) ?? [])];
      for (const id of ids) expectExit(this.roll(id, next()), [0], `roll ${id} after seal named it missing`);
      if (ids.length) res = this.run('seal');
    }
    return res;
  }

  apply(rev = this.state().rev) {
    return this.run('apply', '--expect-rev', String(rev));
  }

  open() {
    return this.run('open');
  }

  toPlanning() {
    const s = this.state();
    if (s.phase === 'agents') expectExit(this.open(), [0], 'open');
    assert.equal(this.state().phase, 'planning', 'campaign did not reach phase planning');
  }

  /**
   * One season with the player draft `makeDraft(state)` (empty by default):
   * submit, roll every pending player probe, seal, apply, and open unless the
   * campaign ended or `stopAt` is 'agents'.
   */
  playTurn({ next, makeDraft, stopAt = 'planning' } = {}) {
    this.toPlanning();
    const before = this.state();
    const draft = makeDraft ? makeDraft(before, this) : this.emptyDraft(before);
    const preview = expectExit(this.submit(draft), [0, 3], 'preview');
    this.rollPending(preview, next);
    expectExit(this.seal(next), [0], 'seal');
    let s = this.state();
    let applied = null;
    if (s.phase === 'resolving') {
      applied = expectExit(this.apply(s.rev), [0], 'apply');
      s = this.state();
    }
    const afterApply = s;
    if (stopAt === 'planning' && s.status !== 'ended' && s.phase === 'agents') expectExit(this.open(), [0], 'open');
    return { turn: before.turn, before, afterApply, after: this.state(), preview, applied };
  }

  roundLog(turn) {
    const rel = `log/T${String(turn).padStart(4, '0')}.json`;
    return this.has(rel) ? this.read(rel) : null;
  }

  /** Every event-log entry the campaign holds: round reports plus the chronicle in state.json. */
  allLogEntries(state = this.state()) {
    const fromLogs = listJsonFiles(this.path('log')).flatMap((f) => collect(readJson(f), isLogEntry));
    const fromChronicle = collect(state.chronicle ?? [], isLogEntry);
    const seen = new Set();
    return [...fromLogs, ...fromChronicle].filter((e) => {
      const k = canonical(e);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  view(people = this.player) {
    const rel = `view/${people}.json`;
    return this.has(rel) ? this.read(rel) : null;
  }

  viewEvents(people, turn) {
    const rel = `view/${people}/events/T${String(turn).padStart(4, '0')}.json`;
    return this.has(rel) ? this.read(rel) : null;
  }

  tasksFromFiles() {
    return listJsonFiles(this.path('agents/tasks')).map(readJson).filter((t) => t?.format === 'realmcraft-task');
  }
}

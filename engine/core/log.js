// Mutation context of one kernel transition (apply, open, ingest, create) and
// the only sanctioned way to change state. Every helper writes the change and
// a log entry in the shape of engine/schemas/event.js, so the chronicle can
// account for every value: source, target, change, reason.
//
// A context holds
//   s0      the opening state (never mutated; every rule of the turn reads it)
//   state   the working copy that receives all changes
//   rng     sfc32 generator over s0.rng; written back by finish()
//   log     entries of this transition
//   hooks   trigger hooks fired this turn: [{ people, hook, tags }]
//   probes  resolved probes with the full calculation
//   scratch per-subsystem scratch space, never persisted
//
// Visibility: every entry carries visibleTo, the peoples whose projection
// shows it (opts.people, plus opts.visibleTo), or ["all"] when it names no
// people. step names the season step that wrote it (tc.step).

import { clone, relKey } from './state.js';
import { makeRng } from './rng.js';
import { calendarOf } from './calendar.js';
import { RULES } from './rules.js';

const MAX_REASON = 200;
const MAX_REFS = 8;

export function createContext(s0, env, { source = 'kernel' } = {}) {
  const state = clone(s0);
  const turn = s0.turn;
  // Sequence continues after entries this turn already has (ingest after apply).
  let seq = 0;
  for (const e of s0.chronicle ?? []) {
    if (e.turn !== turn) continue;
    const n = Number(e.id.slice(e.id.indexOf('-e') + 2));
    if (n > seq) seq = n;
  }
  const tc = {
    env,
    s0,
    state,
    turn,
    cal: calendarOf(env.regeln, turn),
    world: env.world(s0.map.seed),
    rng: makeRng(s0.rng),
    source,
    log: [],
    hooks: [],
    probes: [],
    scratch: {},
    step: 'kernel',
    nextSeq: () => ++seq,
  };
  return tc;
}

/** Writes the rng back and appends the log to the chronicle (bounded). */
export function finish(tc, { chronicleTurns, chronicleMax }) {
  tc.state.rng = tc.rng.state();
  const keepFrom = tc.state.turn - chronicleTurns + 1;
  const merged = [...(tc.state.chronicle ?? []), ...tc.log].filter((e) => e.turn >= keepFrom);
  tc.state.chronicle = merged.slice(Math.max(0, merged.length - chronicleMax));
  return tc.state;
}

function clip(text) {
  const s = String(text ?? '').trim() || 'kernel rule';
  return s.length > MAX_REASON ? `${s.slice(0, MAX_REASON - 3)}...` : s;
}

/**
 * Raw entry. target = { kind, id }, change = null | { field, before, after } |
 * { field, delta }. opts: { source, refs, people, visibleTo, step } where
 * people (id or ids) are the peoples concerned and see the entry;
 * visibleTo 'all' shows it to everyone.
 */
export function record(tc, kind, target, change, reason, opts = {}) {
  const peoples = [...new Set([opts.people ?? [], opts.visibleTo === 'all' ? [] : opts.visibleTo ?? []].flat().filter(Boolean))].sort();
  const visibleTo = opts.visibleTo === 'all' || peoples.length === 0 ? ['all'] : peoples.slice(0, 16);
  const refs = [...new Set((opts.refs ?? []).map(String))]
    .map((r) => (r.length > 80 ? r.slice(0, 80) : r))
    .slice(0, MAX_REFS);
  const entry = {
    id: `T${tc.turn}-e${tc.nextSeq()}`,
    turn: tc.turn,
    source: opts.source ?? tc.source,
    kind,
    target: { kind: target.kind, id: String(target.id).slice(0, 80) },
    change: change ?? null,
    reason: clip(reason),
    refs,
    visibleTo,
    step: opts.step ?? tc.step ?? 'kernel',
  };
  tc.log.push(entry);
  return entry;
}

// Own properties only: a key such as "constructor" would otherwise read the
// inherited Object member and turn a meter or stock into a function.
function getPath(obj, path) {
  let o = obj;
  for (const k of path.split('.')) {
    if (o == null || typeof o !== 'object' || !Object.hasOwn(o, k)) return undefined;
    o = o[k];
  }
  return o;
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  if (keys.includes('__proto__')) throw new RangeError(`setPath: reserved key in ${path}`);
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!Object.hasOwn(o, keys[i]) || o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (value === undefined) delete o[last];
  else o[last] = value;
}

const snapshot = (v) => (v === undefined ? null : clone(v));

/**
 * Sets a field of a people (dotted path relative to the people object) and
 * logs before/after. No entry when the value does not change.
 */
export function setPeople(tc, pid, field, value, reason, opts = {}) {
  const people = tc.state.peoples[pid];
  const before = getPath(people, field);
  if (JSON.stringify(before) === JSON.stringify(value)) return false;
  setPath(people, field, value === undefined ? undefined : clone(value));
  record(tc, opts.kind ?? `people.${field.split('.')[0]}`, { kind: 'people', id: pid },
    { field, before: snapshot(before), after: snapshot(value) }, reason, { ...opts, people: [pid, ...[opts.people ?? []].flat()] });
  return true;
}

/**
 * Adds `delta` to a numeric people field, clamped to [min, max]. Logs the
 * applied delta and returns { applied, missing } where missing is the part of
 * a negative delta the floor swallowed.
 */
export function addPeople(tc, pid, field, delta, reason, { min = 0, max = 999, ...opts } = {}) {
  const people = tc.state.peoples[pid];
  const before = getPath(people, field) ?? 0;
  const after = Math.min(max, Math.max(min, before + delta));
  const applied = after - before;
  const missing = delta < 0 ? applied - delta : 0;
  if (applied !== 0) {
    setPath(people, field, after);
    record(tc, opts.kind ?? `people.${field.split('.')[0]}`, { kind: 'people', id: pid }, { field, delta: applied }, reason,
      { ...opts, people: [pid, ...[opts.people ?? []].flat()] });
  }
  // Every loss of clans routes through here, so the standing labour never outlasts the people.
  if (field === 'population.core' && applied < 0) fitLabour(tc, pid);
  return { applied, missing };
}

/**
 * Takes clans off population.assigned until it fits population.core:
 * activities first, then resources, food last, each group in id order.
 */
export function fitLabour(tc, pid) {
  const pop = tc.state.peoples[pid].population;
  const assigned = { ...(pop.assigned ?? {}) };
  let excess = Object.values(assigned).reduce((a, b) => a + b, 0) - pop.core;
  if (excess <= 0) return false;
  const rank = (k) => (RULES.activities.includes(k) ? 0 : k === RULES.food ? 2 : 1);
  const keys = Object.keys(assigned).sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  for (const k of keys) {
    const take = Math.min(excess, assigned[k]);
    if (take <= 0) continue;
    excess -= take;
    if (assigned[k] === take) delete assigned[k];
    else assigned[k] -= take;
    if (excess === 0) break;
  }
  return setPeople(tc, pid, 'population.assigned', assigned, `${pop.core} clan(s) left, labour shrinks to fit`, { kind: 'population.assign' });
}

/** Resource stock change; never below 0 or above 999. */
export function addResource(tc, pid, res, delta, reason, opts = {}) {
  return addPeople(tc, pid, `resources.${res}`, delta, reason, { kind: 'resource.change', ...opts });
}

/** Sets a field of a council member; target id "<people>:<member>". */
export function setMember(tc, pid, memberId, field, value, reason, opts = {}) {
  const m = tc.state.peoples[pid].council.find((x) => x.id === memberId);
  if (!m || JSON.stringify(m[field]) === JSON.stringify(value)) return false;
  const before = m[field];
  m[field] = clone(value);
  record(tc, opts.kind ?? `member.${field}`, { kind: 'member', id: memberId },
    { field, before: snapshot(before), after: snapshot(value) }, reason, { ...opts, people: pid });
  return true;
}

/**
 * Loyalty change capped at RULES.loyaltyPerTurnCap per member and turn across
 * all sources and clamped to -5..5. Returns the applied delta.
 */
export function changeLoyalty(tc, pid, memberId, delta, reason, { cap = 2, ...opts } = {}) {
  const m = tc.state.peoples[pid]?.council.find((x) => x.id === memberId);
  if (!m || delta === 0) return 0;
  const key = `${pid}:${memberId}`;
  tc.scratch.loyalty ??= {};
  const so = tc.scratch.loyalty[key] ?? 0;
  const allowed = Math.max(-cap - so, Math.min(cap - so, delta));
  const after = Math.max(-5, Math.min(5, m.loyalty + allowed));
  const applied = after - m.loyalty;
  if (applied === 0) return 0;
  tc.scratch.loyalty[key] = so + applied;
  m.loyalty = after;
  record(tc, opts.kind ?? 'member.loyalty', { kind: 'member', id: memberId }, { field: 'loyalty', delta: applied }, reason,
    { ...opts, people: pid });
  return applied;
}

export function setControl(tc, regionId, pid, reason, opts = {}) {
  // An absent entry and null both mean uncontrolled.
  const before = tc.state.map.control[regionId] ?? null;
  if (before === pid) return false;
  tc.state.map.control[regionId] = pid;
  record(tc, 'map.control', { kind: 'region', id: regionId }, { field: 'control', before, after: pid }, reason,
    { ...opts, people: [pid, before, ...[opts.people ?? []].flat()].filter(Boolean) });
  return true;
}

/** Patches a relation (value clamped -3..3); creates it when missing. */
export function setRelation(tc, a, b, patch, reason, opts = {}) {
  const k = relKey(a, b);
  const existed = Object.hasOwn(tc.state.relations, k);
  const rel = existed ? tc.state.relations[k] : { value: 0, atWar: false, since: tc.turn, contact: false };
  const next = { ...rel, ...patch };
  next.value = Math.max(-3, Math.min(3, next.value));
  if (existed && JSON.stringify(rel) === JSON.stringify(next)) return false;
  tc.state.relations[k] = next;
  record(tc, opts.kind ?? 'relation.change', { kind: 'relation', id: k },
    { field: 'relation', before: existed ? clone(rel) : null, after: clone(next) }, reason, { ...opts, people: [a, b] });
  return true;
}

/** Logs a change made through a dedicated code path (list insertions, unit moves). */
export function noteChange(tc, kind, target, field, before, after, reason, opts = {}) {
  return record(tc, kind, target, { field, before: snapshot(before), after: snapshot(after) }, reason, opts);
}

/** A pure notice (probe result, rejected order); change null. */
export function notice(tc, kind, target, reason, opts = {}) {
  return record(tc, kind, target, null, reason, opts);
}

/** Fires a trigger hook for the events step. */
export function fireHook(tc, pid, hook, tags = []) {
  tc.hooks.push({ people: pid, hook, tags: [...tags] });
}

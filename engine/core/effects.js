// Effect primitives of engine/schemas/effects.js.
//
// Standing primitives (effects and price of an Entwicklung, effects of a
// status) act while their source is active. standingOf() lists them for one
// people as they stand in the state it is given; during a turn that is the
// opening state S0, so whatever a turn adds acts from the next turn on
// (effectiveFrom = turn + 1). Each subsystem reads the ops it owns:
//
//   resource.flow, yield.mod, stock.cap, population.cap,
//   population.growth, dependency                     economy.js
//   stat.mod                                          derive.js
//   probe.mod                                         probes.js
//   research.mod                                      research.js
//   unit.mod                                          military.js
//   order.unlock, order.slot, order.restrict          orders.js
//   governance.rule                                   council.js
//   module.activate                                   modules/index.js
//   meter, trigger                                    events.js
//   sight.mod                                         map.js via turn.js
//
// One-off primitives act exactly once through applyOnce(), from application
// outcomes, onAcquire, triggers, meter thresholds, event cards and penalties.

import { RULES } from './rules.js';
import {
  activeDevelopments, buildingsOf, homeSettlement, kern, KERN_SLICE, peopleIds, settlementsOf, clamp,
} from './state.js';
import {
  addPeople, addResource, changeLoyalty, noteChange, setControl, setMember, setPeople, setRelation, record,
} from './log.js';
import { distance, parseKey, reveal, regionInfo, tileAt } from '../world/index.js';
import { RESERVED_KEYS } from './canon.js';

/**
 * Standing primitives of a people: [{ effect, source }] where source is
 * { kind: 'development'|'building'|'status', key, ref?, label }.
 */
export function standingOf(state, env, pid, turn = state.turn) {
  const people = state.peoples[pid];
  if (!people) return [];
  const out = [];
  const push = (effect, source) => out.push({ effect, source });
  for (const d of activeDevelopments(state, env, pid, turn)) {
    const source = { kind: 'development', key: `dev:${d.ref}`, ref: d.ref, label: d.ent.name };
    for (const e of d.ent.effects) push(e, source);
    for (const e of d.ent.price) push(e, { ...source, price: true });
  }
  for (const b of buildingsOf(state, env, pid, turn)) {
    const source = { kind: 'building', key: `bld:${b.settlement.id}:${b.building.ref}`, ref: b.building.ref, label: b.ent.name };
    for (const e of b.ent.effects) push(e, source);
    for (const e of b.ent.price) push(e, { ...source, price: true });
  }
  for (const s of people.statuses ?? []) {
    if (s.until != null && s.until < turn) continue;
    const source = { kind: 'status', key: `status:${s.id}`, label: s.id };
    for (const e of s.effects) push(e, source);
  }
  return out;
}

export const ofOp = (standing, op) => standing.filter((s) => s.effect.op === op);

/** Module ids switched on by module.activate in the standing set, with their bindings. */
export function activations(standing) {
  const out = {};
  for (const s of ofOp(standing, 'module.activate')) out[s.effect.module] = { ...(out[s.effect.module] ?? {}), ...s.effect.bind };
  return out;
}

function kernOf(tc, pid) {
  const people = tc.state.peoples[pid];
  if (!people.modules.kern) people.modules.kern = KERN_SLICE();
  return people.modules.kern;
}

/** Sets a key of the kernel slice with a log entry. */
export function setKern(tc, pid, field, value, reason, opts = {}) {
  kernOf(tc, pid);
  return setPeople(tc, pid, `modules.kern.${field}`, value, reason, { kind: opts.kind ?? 'kern.change', ...opts });
}

function nextUnitId(people) {
  let n = 0;
  for (const u of people.units) {
    const m = /^u-(\d+)$/.exec(u.id);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `u-${n + 1}`;
}

function neighbours(state, pid) {
  const own = settlementsOf(state, pid).map((s) => parseKey(s.tile));
  return peopleIds(state).filter((o) => o !== pid && settlementsOf(state, o)
    .some((s) => own.some((t) => distance(t, parseKey(s.tile)) <= RULES.neighbourRadius)));
}

function meterBounds(standing, id) {
  const def = ofOp(standing, 'meter').find((s) => s.effect.id === id)?.effect;
  return def ? [def.min, def.max] : [-5, 5];
}

/**
 * Applies one one-off primitive for people `pid`.
 * ctx = { reason, source?, refs?, target?: { tile, region, people, unit: { people, id }, member } }
 * Returns true when it changed state. Unresolvable targets ($target without a
 * target) are a notice, not an error: content may fire in contexts without one.
 */
export function applyOnce(tc, pid, e, ctx = {}) {
  const state = tc.state;
  const people = state.peoples[pid];
  if (!people) return false;
  const reason = ctx.reason ?? `effect ${e.op}`;
  const opts = { source: ctx.source, refs: ctx.refs };
  const t = ctx.target ?? {};
  const skip = (why) => {
    record(tc, 'effect.skipped', { kind: 'people', id: pid }, null, `${e.op}: ${why} (${reason})`, { ...opts, people: pid });
    return false;
  };
  switch (e.op) {
    case 'resource.delta': {
      const { applied, missing } = addResource(tc, pid, e.res, e.amount, reason, opts);
      if (missing > 0) addPeople(tc, pid, `shortfall.${e.res}`, missing, `${reason}: ${missing} missing`, { ...opts, kind: 'shortfall' });
      return applied !== 0 || missing > 0;
    }
    case 'population.delta': {
      const core = people.population.core;
      // A people that has gone under is not brought back by content.
      if (core === 0) return false;
      const min = 1;
      return addPeople(tc, pid, 'population.core', e.amount, reason, { ...opts, min, max: 99, kind: 'population.change' }).applied !== 0;
    }
    case 'loyalty.delta': {
      const members = people.council.filter((m) => {
        if (e.target === 'all') return true;
        if (e.target.startsWith('favor:')) return m.goal.favor.includes(e.target.slice(6));
        if (e.target.startsWith('oppose:')) return m.goal.oppose.includes(e.target.slice(7));
        return m.id === e.target;
      });
      let changed = false;
      for (const m of members) changed = changeLoyalty(tc, pid, m.id, e.amount, reason, opts) !== 0 || changed;
      return changed;
    }
    case 'loyalty.bind': {
      const m = people.council.find((x) => x.id === e.target) ?? people.council.find((x) => x.id === t.member);
      if (!m) return skip('no such member');
      const a = setMember(tc, pid, m.id, 'loyalty', e.value, reason, opts);
      const b = setMember(tc, pid, m.id, 'hollow', true, reason, opts);
      return a || b;
    }
    case 'relation.delta': {
      let others;
      if (e.people === '$target') others = t.people ? [t.people] : [];
      else if (e.people === 'neighbours') others = neighbours(tc.s0, pid);
      else if (e.people === 'all') others = peopleIds(state).filter((o) => o !== pid);
      else others = state.peoples[e.people] && e.people !== pid ? [e.people] : [];
      if (!others.length) return skip('no matching people');
      let changed = false;
      for (const o of others) {
        const rel = state.relations[[pid, o].sort().join('|')] ?? { value: 0, atWar: false, since: tc.turn };
        changed = setRelation(tc, pid, o, { value: clamp(rel.value + e.amount, -3, 3) }, reason, opts) || changed;
      }
      return changed;
    }
    case 'standing.delta':
      return addPeople(tc, pid, 'standing', e.amount, reason, { ...opts, min: 0, max: 3, kind: 'people.standing' }).applied !== 0;
    case 'status.add': {
      const status = { id: e.id, effects: structuredClone(e.effects), until: e.duration == null ? null : tc.turn + e.duration, endsOn: e.endsOn ?? null };
      const list = people.statuses.filter((s) => s.id !== e.id);
      while (list.length >= 12) list.shift();
      list.push(status);
      setPeople(tc, pid, 'statuses', list, reason, { ...opts, kind: 'status.add' });
      return true;
    }
    case 'token.add': {
      const prefix = `tok-t${tc.turn}-`;
      const n = people.tokens.filter((x) => x.id.startsWith(prefix)).length + 1;
      const token = { id: `${prefix}${n}`, kind: e.kind, tags: [...e.tags], turn: tc.turn, source: reason.slice(0, 80) };
      const list = [...people.tokens];
      while (list.length >= 20) list.shift();
      list.push(token);
      people.tokens = list;
      noteChange(tc, 'token.add', { kind: 'people', id: pid }, `tokens.${token.id}`, null, token, reason, { ...opts, people: pid });
      return true;
    }
    case 'unit.spawn': {
      const ent = tc.env.entwicklung(e.type);
      if (!ent || ent.kind !== 'einheit') return skip(`unknown unit type ${e.type}`);
      const tile = e.tile === '$home' ? homeSettlement(state, pid)?.tile : e.tile;
      if (!tile) return skip('no home tile');
      if (people.units.length >= 40) return skip('unit limit');
      const unit = { id: nextUnitId(people), type: e.type, strength: ent.spec.strength, tile, state: 'moved', since: tc.turn };
      people.units.push(unit);
      noteChange(tc, 'unit.spawn', { kind: 'unit', id: unit.id }, 'units', null, unit, reason, { ...opts, people: pid });
      return true;
    }
    case 'unit.delta': {
      let targets = [];
      if (e.unit === '$target' && t.unit) targets = [t.unit];
      else if (e.unit === '$all-on-tile' && t.tile) {
        for (const o of peopleIds(state)) for (const u of state.peoples[o].units) if (u.tile === t.tile) targets.push({ people: o, id: u.id });
      }
      if (!targets.length) return skip('no target unit');
      for (const ref of targets) changeUnitStrength(tc, ref.people, ref.id, e.strength, reason, opts);
      return true;
    }
    case 'region.control': {
      const region = e.region === '$target' ? t.region : e.region;
      if (!region) return skip('no target region');
      return setControl(tc, region, e.people === '$self' ? pid : null, reason, { ...opts, people: pid });
    }
    case 'council.seat': {
      const seats = [...kernOf(tc, pid).seats, { role: e.role, favor: [...e.favor], oppose: [...e.oppose], since: tc.turn }];
      return setKern(tc, pid, 'seats', seats, reason, { ...opts, kind: 'council.seat' });
    }
    case 'flag.set':
      return setKern(tc, pid, `flags.${e.flag.replace('.', '~')}`, e.value, reason, { ...opts, kind: 'flag.set' });
    case 'meter.delta': {
      // Runtime guard behind makeEnv and ingest: an inherited name is never a meter.
      if (RESERVED_KEYS.has(e.meter)) return skip(`${e.meter} cannot name a meter`);
      const [min, max] = meterBounds(standingOf(tc.s0, tc.env, pid), e.meter);
      if (!Object.hasOwn(people.meters, e.meter)) people.meters[e.meter] = clamp(0, min, max);
      return addPeople(tc, pid, `meters.${e.meter}`, e.amount, reason, { ...opts, min, max, kind: 'meter.change' }).applied !== 0;
    }
    case 'reveal':
      return applyReveal(tc, pid, e, t, reason, opts);
    default:
      throw new Error(`applyOnce: ${e.op} is not a one-off primitive`);
  }
}

/** Flag keys contain a dot, which the dotted field path would split; stored with "~". */
export function flagValue(people, flag) {
  return kern(people).flags?.[flag.replace('.', '~')] === true;
}

export function applyOnceList(tc, pid, effects, ctx) {
  let n = 0;
  for (const e of effects ?? []) if (applyOnce(tc, pid, e, ctx)) n++;
  return n;
}

/** Strength change of one unit, clamped 0..9; strength 0 dissolves it. */
export function changeUnitStrength(tc, pid, unitId, delta, reason, opts = {}) {
  const people = tc.state.peoples[pid];
  const i = people.units.findIndex((u) => u.id === unitId);
  if (i < 0 || delta === 0) return 0;
  const u = people.units[i];
  const after = clamp(u.strength + delta, 0, 9);
  const applied = after - u.strength;
  if (applied === 0) return 0;
  const target = { kind: 'unit', id: unitId };
  if (after === 0) {
    people.units.splice(i, 1);
    noteChange(tc, 'unit.dissolved', target, 'units', u, null, reason, { ...opts, people: [pid, ...[opts.people ?? []].flat()] });
  } else {
    u.strength = after;
    record(tc, 'unit.strength', target, { field: 'strength', delta: applied }, reason, { ...opts, people: [pid, ...[opts.people ?? []].flat()] });
  }
  return applied;
}

function applyReveal(tc, pid, e, t, reason, opts) {
  const state = tc.state;
  const at = e.at === '$target' ? (e.scope === 'people' ? t.people : e.scope === 'region' ? t.region : t.tile)
    : e.at === '$home' ? homeSettlement(state, pid)?.tile : e.at;
  if (!at) return false;
  if (e.scope === 'people') {
    if (!state.peoples[at] || at === pid) return false;
    return setKern(tc, pid, `revealed.${at}`, tc.turn + 1, reason, { ...opts, kind: 'reveal.people' });
  }
  const before = state.map.known[pid] ?? {};
  let known = before;
  if (e.scope === 'tiles') {
    known = reveal(known, parseKey(at), e.radius ?? 1);
  } else {
    const info = regionInfo(tc.world, at);
    if (!info) return false;
    tileAt(tc.world, info.centre.q, info.centre.r);
    known = { ...known };
    for (const k of regionInfo(tc.world, at).tiles) known[k] = 'visible';
  }
  const added = Object.keys(known).filter((k) => !Object.hasOwn(before, k)).sort();
  if (!added.length) return false;
  state.map.known[pid] = known;
  record(tc, 'map.reveal', { kind: e.scope === 'region' ? 'region' : 'tile', id: at }, { field: `map.known.${pid}`, delta: added.length }, reason, { ...opts, people: pid });
  return true;
}

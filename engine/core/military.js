// Units on tiles, battle, raids, losses and control by presence. The orders
// that drive these functions live in engine/modules/militaer.js; the season
// step resolveMilitary(tc) closes the military part of a turn.
//
//   unitStats(state, env, pid, unit[, standing]) -> { strength, mobility, upkeep: { res: n }, tags }
//        effective values: spec plus standing unit.mod, never stored on the unit.
//   battleSpec(ox, unitIds, tile[, { from }])     the calculation of an attack against S0
//   resolveBattle(tc, ox, order, outcome, spec)   losses, routs, capture, war
//   raidSpec / resolveRaid                        the raubzug counterparts
//   moveUnit(tc, pid, unitId, toTile, reason)     logged move
//   resolveMilitary(tc)                           unit states for the next turn, control by presence
//
// Units of one turn that acted (moved, attacked, raided) are claimed in
// tc.scratch.acted ("pid:unitId"), so two orders never use one unit twice.
// tc.scratch.routed holds the units routed this turn; resolveMilitary turns
// every other unit 'ready' for the next turn, so routed units recover after one
// turn without orders.

import { RULES, tune } from './rules.js';
import { changeUnitStrength, ofOp, standingOf } from './effects.js';
import { evalCondition } from './conditions.js';
import { addPeople, addResource, fireHook, noteChange, notice, setControl, setRelation } from './log.js';
import { peopleIds, relKey } from './state.js';
import { statsOf } from './stats.js';
import { regionAt, tileOf } from './map.js';
import { distance, neighbors, parseKey } from '../world/index.js';

const unitKey = (pid, id) => `${pid}:${id}`;
const idCompare = (a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);

export const specOf = (env, unit) => env.entwicklung(unit.type)?.spec ?? {};

function modSum(standing, spec, stat) {
  let n = 0;
  for (const s of ofOp(standing, 'unit.mod')) {
    const e = s.effect;
    if (e.stat === stat && e.unitTags.some((t) => (spec.tags ?? []).includes(t))) n += e.amount;
  }
  return n;
}

/** Effective stats of one unit as the given state stands; standing may be passed to avoid recomputing it. */
export function unitStats(state, env, pid, unit, standing = standingOf(state, env, pid)) {
  const spec = specOf(env, unit);
  const upkeepMod = modSum(standing, spec, 'upkeep');
  const upkeep = {};
  for (const [res, n] of Object.entries(spec.upkeep ?? {})) upkeep[res] = Math.max(0, n + upkeepMod);
  return {
    strength: Math.max(0, Math.min(9, unit.strength + modSum(standing, spec, 'strength'))),
    mobility: Math.max(0, (spec.mobility ?? 1) + modSum(standing, spec, 'mobility')),
    upkeep,
    tags: [...(spec.tags ?? [])],
  };
}

/** Ratio step of attack strength A against defence D; the +2 test comes before +1 because 2A <= D implies 3A <= 2D. */
export function ratioStep(a, d) {
  if (d === 0 || a >= 2 * d) return -2;
  if (2 * a >= 3 * d) return -1;
  if (2 * a <= d) return 2;
  if (3 * a <= 2 * d) return 1;
  return 0;
}

/** Losses by band: { defender, attacker, routed, standing } for a probe margin. */
export function lossesFor(band, margin) {
  switch (band) {
    case 'crit_success': return { defender: 2 + Math.max(0, margin), attacker: 0, routed: false, standing: 0 };
    case 'success': return { defender: 1 + margin, attacker: 1, routed: false, standing: 0 };
    case 'narrow': return { defender: 1, attacker: 2, routed: false, standing: 0 };
    case 'failure': return { defender: 0, attacker: 1 - margin, routed: true, standing: 0 };
    case 'setback': return { defender: 0, attacker: 2 - margin, routed: true, standing: -1 };
    default: return { defender: 0, attacker: 2 + Math.max(0, -margin), routed: true, standing: -1 };
  }
}

function standingCache(state, env, own, ownStanding) {
  const cache = new Map([[own, ownStanding]]);
  return (pid) => {
    if (!cache.has(pid)) cache.set(pid, standingOf(state, env, pid));
    return cache.get(pid);
  };
}

/**
 * The people that defends a tile: the owner of a foreign settlement on it,
 * else the owner of the strongest foreign unit. Returns null when nothing
 * foreign stands there.
 */
function defenceOf(state, env, attacker, tile, standingFor) {
  const settlement = state.map.settlements.find((s) => s.tile === tile && s.people !== attacker) ?? null;
  const foreign = [];
  for (const pid of peopleIds(state)) {
    if (pid === attacker) continue;
    for (const unit of state.peoples[pid].units) {
      if (unit.tile === tile) foreign.push({ people: pid, unit, strength: unitStats(state, env, pid, unit, standingFor(pid)).strength });
    }
  }
  let defender = settlement?.people ?? null;
  if (!defender && foreign.length) {
    const strongest = [...foreign].sort((a, b) => b.strength - a.strength || (a.people < b.people ? -1 : a.people > b.people ? 1 : 0) || idCompare(a.unit.id, b.unit.id))[0];
    defender = strongest.people;
  }
  if (!defender) return null;
  return { defender, units: foreign.filter((f) => f.people === defender), settlement };
}

/**
 * The calculation of an attack read from the opening state ox.state.
 * unitIds: the units sent; from: an own settlement for a sortie (its ready
 * units on the settlement tile attack and RULES.garrison of its kind adds to
 * A). Returns { error, invalid: [{ id, why }], target, extraMods, step, A, D,
 * defender, defenders: [{ people, unitId }], settlement, garrison,
 * attackers: [{ unit, strength }], terrain }. error is null for a valid attack.
 */
export function battleSpec(ox, unitIds, tile, { from = null } = {}) {
  const { state, env, pid, world } = ox;
  const spec = {
    error: null, invalid: [], target: null, extraMods: [], step: 0, A: 0, D: 0, defender: null, defenders: [],
    settlement: null, garrison: 0, attackers: [], terrain: null, sortie: from !== null,
  };
  if (state.map.known?.[pid]?.[tile] !== 'visible') {
    spec.error = 'the tile is not in sight';
    return spec;
  }
  const own = state.peoples[pid].units;
  let attackStrength = 0;
  if (from) {
    if (distance(parseKey(from.tile), parseKey(tile)) !== 1) spec.error = 'the settlement does not border the tile';
    for (const u of own) if (u.tile === from.tile && u.state === 'ready') spec.attackers.push({ unit: u, strength: unitStats(state, env, pid, u, ox.standing).strength });
    attackStrength += RULES.garrison[from.kind] ?? 0;
  } else {
    for (const id of new Set(unitIds)) {
      const u = own.find((x) => x.id === id);
      if (!u) spec.invalid.push({ id, why: 'is no unit of this people' });
      else if (u.state !== 'ready') spec.invalid.push({ id, why: `is ${u.state} and cannot attack` });
      else if (distance(parseKey(u.tile), parseKey(tile)) !== 1) spec.invalid.push({ id, why: 'does not border the tile' });
      else spec.attackers.push({ unit: u, strength: unitStats(state, env, pid, u, ox.standing).strength });
    }
    if (!spec.attackers.length && !spec.invalid.length) spec.error = 'no unit named';
  }
  spec.A = attackStrength + spec.attackers.reduce((n, a) => n + a.strength, 0);

  const standingFor = standingCache(state, env, pid, ox.standing);
  const def = defenceOf(state, env, pid, tile, standingFor);
  if (!def) {
    spec.error ??= 'no foreign unit or settlement stands on the tile';
    return spec;
  }
  spec.defender = def.defender;
  spec.defenders = def.units.map((f) => ({ people: f.people, unitId: f.unit.id }));
  spec.settlement = def.settlement;
  spec.garrison = def.settlement ? RULES.garrison[def.settlement.kind] ?? 0 : 0;
  spec.D = def.units.reduce((n, f) => n + f.strength, 0) + spec.garrison;
  spec.terrain = tileOf(world, tile).terrain;
  if (spec.A === 0) spec.error ??= 'the attack has no strength';
  spec.step = ratioStep(spec.A, spec.D);
  spec.target = 5 + spec.step + tune(env, 'terrainDefense', spec.terrain);

  if (def.settlement) {
    const stat = statsOf(state, env, def.defender).verteidigung ?? 0;
    if (stat > 0) spec.extraMods.push({ source: 'defender:verteidigung', label: 'verteidigung', value: -stat, dev: false });
  }
  const dstanding = standingFor(def.defender);
  // Conditions of the defender's modifiers read the defender's state, so the people in cx is swapped.
  const dcx = { ...ox.cx, pid: def.defender };
  let probeMod = 0;
  for (const s of ofOp(dstanding, 'probe.mod')) {
    const e = s.effect;
    if (!e.tags.includes('verteidigung') || (e.if && !evalCondition(e.if, dcx))) continue;
    probeMod += e.amount;
  }
  probeMod = Math.min(2, probeMod);
  if (probeMod > 0) spec.extraMods.push({ source: 'defender:probe', label: 'verteidigung', value: -probeMod, dev: false });
  return spec;
}

// --- unit changes ----------------------------------------------------------------

/** Claims units for an action of this turn; returns the ids that are still free and alive. */
export function claimUnits(tc, pid, ids) {
  const acted = (tc.scratch.acted ??= new Set());
  const out = [];
  for (const id of ids) {
    const k = unitKey(pid, id);
    if (acted.has(k) || !tc.state.peoples[pid].units.some((u) => u.id === id)) continue;
    acted.add(k);
    out.push(id);
  }
  return out;
}

export function moveUnit(tc, pid, unitId, toTile, reason, opts = {}) {
  const u = tc.state.peoples[pid].units.find((x) => x.id === unitId);
  if (!u || u.tile === toTile) return false;
  const from = u.tile;
  u.tile = toTile;
  u.state = 'moved';
  noteChange(tc, 'unit.move', { kind: 'unit', id: unitId }, 'tile', from, toTile, reason, { ...opts, people: [pid, ...[opts.people ?? []].flat()] });
  return true;
}

function routUnits(tc, pid, ids, reason, opts) {
  const routed = (tc.scratch.routed ??= new Set());
  for (const id of ids) {
    const u = tc.state.peoples[pid].units.find((x) => x.id === id);
    if (!u) continue;
    routed.add(unitKey(pid, id));
    if (u.state === 'routed') continue;
    const before = u.state;
    u.state = 'routed';
    noteChange(tc, 'unit.state', { kind: 'unit', id }, 'state', before, 'routed', reason, { ...opts, people: [pid, ...[opts.people ?? []].flat()] });
  }
}

/**
 * Takes `loss` points from the units one point at a time, always from the
 * currently strongest (effective strength, ties by unit id), so wear spreads
 * from the top. Strength 0 dissolves a unit. Returns the points taken.
 */
export function distributeLoss(tc, pid, ids, loss, reason, opts = {}) {
  if (loss <= 0) return 0;
  const standing = standingOf(tc.s0, tc.env, pid);
  const work = [];
  for (const id of ids) {
    const u = tc.state.peoples[pid].units.find((x) => x.id === id);
    if (!u) continue;
    const eff = unitStats(tc.s0, tc.env, pid, u, standing).strength;
    work.push({ id, stored: u.strength, eff, taken: 0 });
  }
  let left = loss;
  while (left > 0) {
    const live = work.filter((w) => w.stored > 0);
    if (!live.length) break;
    live.sort((a, b) => b.eff - a.eff || idCompare(a.id, b.id));
    live[0].stored -= 1;
    live[0].eff -= 1;
    live[0].taken += 1;
    left -= 1;
  }
  let total = 0;
  for (const w of work) if (w.taken) total += -changeUnitStrength(tc, pid, w.id, -w.taken, reason, opts);
  return total;
}

/** War by an attack: relation at war, value -2, standing -1 for the aggressor, hook 'war' for both. */
export function declareWar(tc, aggressor, victim, reason) {
  const rel = tc.state.relations[relKey(aggressor, victim)];
  if (rel?.atWar) return false;
  setRelation(tc, aggressor, victim, { atWar: true, value: (rel?.value ?? 0) - 2, since: tc.turn }, reason, { kind: 'relation.war' });
  addPeople(tc, aggressor, 'standing', -1, reason, { min: 0, max: 3, kind: 'people.standing', people: [victim] });
  fireHook(tc, aggressor, 'war', ['krieg']);
  fireHook(tc, victim, 'war', ['krieg']);
  return true;
}

// --- battle ----------------------------------------------------------------------

/** Resolves one attack or sortie. spec comes from battleSpec on the opening state. */
export function resolveBattle(tc, ox, order, outcome, spec) {
  const att = ox.pid;
  const def = spec.defender;
  const both = [att, def];
  const tile = order.params.tile;
  const sortie = spec.sortie === true;
  const free = claimUnits(tc, att, spec.attackers.map((a) => a.unit.id));
  if (!free.length && !sortie) {
    notice(tc, 'battle.skipped', { kind: 'tile', id: tile }, `order ${order.id}: the units already acted this season`, { people: att });
    return;
  }
  const result = lossesFor(outcome.band, outcome.margin ?? 0);
  const why = `order ${order.id}: attack on ${tile}, ${outcome.band}`;
  declareWar(tc, att, def, `${why}: attack without war`);
  notice(tc, 'battle.result', { kind: 'tile', id: tile }, `${att} attacks ${def} on ${tile}: A ${spec.A} against D ${spec.D}, ${outcome.band}`, { people: both, refs: [outcome.probe.id] });

  const defIds = spec.defenders.map((d) => d.unitId);
  distributeLoss(tc, def, defIds, result.defender, `${why}: defender losses`, { people: both });
  distributeLoss(tc, att, free, result.attacker, `${why}: attacker losses`, { people: both });
  if (result.routed) routUnits(tc, att, free, `${why}: the attackers are routed`, { people: both });
  if (result.standing) addPeople(tc, att, 'standing', result.standing, `${why}: attack fails badly`, { min: 0, max: 3, kind: 'people.standing', people: [def] });
  if (!outcome.success || sortie) return;

  const holding = tc.state.peoples[def].units.some((u) => u.tile === tile);
  const survivors = free.filter((id) => tc.state.peoples[att].units.some((u) => u.id === id));
  if (holding || !survivors.length) return;
  for (const id of survivors) moveUnit(tc, att, id, tile, `${why}: the attackers take the tile`, { people: both });
  const s = tc.state.map.settlements.find((x) => x.tile === tile && x.people === def);
  if (!s) return;
  if (s.mobile) {
    tc.state.map.settlements.splice(tc.state.map.settlements.indexOf(s), 1);
    noteChange(tc, 'settlement.destroyed', { kind: 'settlement', id: s.id }, 'map.settlements', s, null, `${why}: the camp is broken up`, { people: both });
  } else {
    s.people = att;
    noteChange(tc, 'settlement.captured', { kind: 'settlement', id: s.id }, 'people', def, att, `${why}: ${s.name} falls`, { people: both });
  }
  setControl(tc, s.regionId, att, `${why}: the region follows the settlement`, { people: both });
}

// --- raids -----------------------------------------------------------------------

const regionTouched = (world, tile, region) => {
  const p = parseKey(tile);
  if (regionAt(world, tile) === region) return true;
  return neighbors(p.q, p.r).some((n) => regionAt(world, `${n.q},${n.r}`) === region);
};

/**
 * The calculation of a raid on a region held by another people:
 * { error, invalid, victim, units: [{ unit, strength }], A, D, step, target }.
 * D counts the victim's units in the region and may be 0.
 */
export function raidSpec(ox, unitIds, region) {
  const { state, env, pid, world } = ox;
  const spec = { error: null, invalid: [], victim: null, units: [], A: 0, D: 0, step: 0, target: null };
  const victim = state.map.control[region] ?? null;
  if (!victim) {
    spec.error = 'no people controls that region';
    return spec;
  }
  if (victim === pid) {
    spec.error = 'the region is controlled by the raider';
    return spec;
  }
  spec.victim = victim;
  const own = state.peoples[pid].units;
  for (const id of new Set(unitIds)) {
    const u = own.find((x) => x.id === id);
    if (!u) spec.invalid.push({ id, why: 'is no unit of this people' });
    else if (u.state !== 'ready') spec.invalid.push({ id, why: `is ${u.state} and cannot raid` });
    else if (!regionTouched(world, u.tile, region)) spec.invalid.push({ id, why: 'is neither in nor next to the region' });
    else spec.units.push({ unit: u, strength: unitStats(state, env, pid, u, ox.standing).strength });
  }
  if (!spec.units.length && !spec.invalid.length) spec.error = 'no unit named';
  spec.A = spec.units.reduce((n, a) => n + a.strength, 0);
  const vs = standingOf(state, env, victim);
  spec.D = state.peoples[victim].units.filter((u) => regionAt(world, u.tile) === region)
    .reduce((n, u) => n + unitStats(state, env, victim, u, vs).strength, 0);
  spec.step = ratioStep(spec.A, spec.D);
  spec.target = 5 + spec.step;
  return spec;
}

/** Resolves a raubzug: loot on success, losses and rout on failure. */
export function resolveRaid(tc, ox, order, outcome, spec) {
  const att = ox.pid;
  const vic = spec.victim;
  const both = [att, vic];
  const region = order.params.region;
  const why = `order ${order.id}: raid on ${region}, ${outcome.band}`;
  const free = claimUnits(tc, att, spec.units.map((a) => a.unit.id));
  if (!free.length) {
    notice(tc, 'raid.skipped', { kind: 'region', id: region }, `order ${order.id}: the units already acted this season`, { people: att });
    return;
  }
  declareWar(tc, att, vic, `${why}: raid without war`);
  const margin = outcome.margin ?? 0;
  if (outcome.success) {
    // Largest stock wins, ties by the order of the world's resources.
    let best = null;
    for (const r of tc.env.regeln.resources) {
      const n = tc.state.peoples[vic].resources[r.id] ?? 0;
      if (n > 0 && (!best || n > best.n)) best = { res: r.id, n };
    }
    if (best) {
      const take = Math.min(best.n, 1 + Math.max(0, margin));
      const lost = -addResource(tc, vic, best.res, -take, `${why}: plundered`, { people: [att] }).applied;
      addResource(tc, att, best.res, lost, `${why}: loot from ${vic}`, { people: [vic] });
    } else {
      notice(tc, 'raid.empty', { kind: 'region', id: region }, `${why}: ${vic} has nothing to take`, { people: both });
    }
    if (outcome.band === 'crit_success' && tc.state.peoples[vic].population.core > 1) {
      addPeople(tc, vic, 'population.core', -1, `${why}: a clan is carried off`, { min: 1, max: 99, kind: 'population.change', people: [att] });
      addPeople(tc, att, 'population.core', 1, `${why}: a clan joins from ${vic}`, { min: 1, max: 99, kind: 'population.change', people: [vic] });
    }
    return;
  }
  distributeLoss(tc, att, free, Math.max(1, 1 - margin), `${why}: raiders lost`, { people: both });
  routUnits(tc, att, free, `${why}: the raiders are routed`, { people: both });
}

// --- season step -----------------------------------------------------------------

/**
 * Unit states for the next turn (routed this turn stays routed, everything
 * else is ready, so recruits and moved units can act next turn and units
 * routed last turn recover), control of empty regions by presence, and the
 * relation cost of standing in a region of a people one is not at war with.
 */
export function resolveMilitary(tc) {
  const { state, s0 } = tc;
  const routed = tc.scratch.routed ?? new Set();
  for (const pid of peopleIds(state)) {
    for (const u of state.peoples[pid].units) {
      const next = routed.has(unitKey(pid, u.id)) ? 'routed' : 'ready';
      if (u.state === next) continue;
      const was = s0.peoples[pid]?.units.find((x) => x.id === u.id && x.since === u.since);
      u.state = next;
      if (was && was.state !== next) noteChange(tc, 'unit.state', { kind: 'unit', id: u.id }, 'state', was.state, next, 'a routed unit recovers', { people: pid });
    }
  }

  const presence = new Map();
  for (const pid of peopleIds(state)) {
    for (const u of state.peoples[pid].units) {
      const region = regionAt(tc.world, u.tile);
      if (!presence.has(region)) presence.set(region, new Set());
      presence.get(region).add(pid);
    }
  }
  const settled = new Set(state.map.settlements.map((s) => s.regionId));
  for (const region of [...presence.keys()].sort()) {
    if (settled.has(region) || state.map.control[region] != null || presence.get(region).size !== 1) continue;
    const [pid] = presence.get(region);
    setControl(tc, region, pid, 'only this people stands in the empty region at season end', { people: pid });
  }

  const pairs = new Map();
  for (const pid of peopleIds(state)) {
    for (const u of state.peoples[pid].units) {
      const owner = state.map.control[regionAt(tc.world, u.tile)] ?? null;
      const rel = owner && owner !== pid ? state.relations[relKey(pid, owner)] : null;
      if (rel && !rel.atWar && !pairs.has(relKey(pid, owner))) pairs.set(relKey(pid, owner), [pid, owner]);
    }
  }
  for (const k of [...pairs.keys()].sort()) {
    const [a, b] = pairs.get(k);
    setRelation(tc, a, b, { value: state.relations[k].value - 1 }, `units of ${a} stand in a region of ${b}`, { kind: 'relation.trespass' });
  }
}

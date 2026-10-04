// Militaer module: units, recruitment, movement, battle, sortie and raids. The
// rules behind the orders live in engine/core/military.js.

import { RULES } from '../core/rules.js';
import { issue } from '../core/issues.js';
import { activeDevelopments, homeSettlement, knownEntry, peopleIds, settlementsOf } from '../core/state.js';
import { applyOnce, standingOf } from '../core/effects.js';
import { notice, setPeople } from '../core/log.js';
import { moveBudget, reach, route, stepCost, tileOf } from '../core/map.js';
import {
  battleSpec, claimUnits, moveUnit, raidSpec, resolveBattle, resolveRaid, unitStats,
} from '../core/military.js';

const isTile = (v) => typeof v === 'string' && /^(0|-?[1-9][0-9]*),(0|-?[1-9][0-9]*)$/.test(v);
const target = (ox, reason, msg, params = {}) => [issue('target', `${ox.path}/params`, msg, { params: { reason, ...params } })];
const unitIdsOf = (v) => (Array.isArray(v) && v.length >= 1 && v.length <= 40 && v.every((x) => typeof x === 'string') ? v : null);
const ownUnit = (ox, id) => ox.people.units.find((u) => u.id === id) ?? null;

// Units and strength already promised by earlier recruit orders of the same
// draft check; the check sees one order at a time, ox.cx is shared by all of
// them. A deliberate shortcut: it ties the check to the draft order of one
// checkDraft call, which is how seal, apply and preview call it.
const pendingRecruits = new WeakMap();
const pendingOf = (ox) => {
  if (!pendingRecruits.has(ox.cx)) pendingRecruits.set(ox.cx, { strength: 0, count: 0 });
  return pendingRecruits.get(ox.cx);
};

const recruitLimit = (ox) => Math.floor(ox.people.population.core / RULES.recruitPerCore);

function recruitCheck(ox, o) {
  const p = o.params ?? {};
  const ent = ox.env.entwicklung(p.type);
  const known = knownEntry(ox.people, p.type);
  if (!ent || !known || ent.kind !== 'einheit' || known.state !== 'active' || known.effectiveFrom > ox.turn) {
    return target(ox, 'not-unit-type', 'type must be a known, active unit development');
  }
  if (!settlementsOf(ox.state, ox.pid).some((s) => s.id === p.settlement)) return target(ox, 'not-own-settlement', 'settlement must be an own settlement');
  const pending = pendingOf(ox);
  const held = ox.people.units.reduce((n, u) => n + u.strength, 0) + pending.strength;
  const cap = ox.people.population.core * RULES.strengthPerClan;
  if (held + ent.spec.strength > cap) return target(ox, 'strength-cap', `the units would hold ${held + ent.spec.strength} strength, the people carries ${cap}`, { strength: held + ent.spec.strength, cap });
  if (ox.people.units.length + pending.count >= 40) return target(ox, 'unit-limit', 'a people keeps at most 40 units', { max: 40 });
  pending.strength += ent.spec.strength;
  pending.count += 1;
  return [];
}

function moveCheck(ox, o) {
  const p = o.params ?? {};
  const u = ownUnit(ox, p.unit);
  if (!u) return target(ox, 'not-own-unit', 'unit must be an own unit');
  if (u.state !== 'ready') return target(ox, 'unit-not-ready', `unit is ${u.state} and cannot move`, { state: u.state });
  if (!isTile(p.tile)) return target(ox, 'not-tile', 'tile must be a tile key');
  if (p.tile === u.tile) return target(ox, 'unit-on-tile', 'unit already stands on that tile');
  const budget = moveBudget(unitStats(ox.state, ox.env, ox.pid, u, ox.standing).mobility);
  if (!Object.hasOwn(reach(ox.state, ox.world, u.tile, budget), p.tile)) return target(ox, 'out-of-reach', 'tile is out of reach this season');
  if (tileHolder(ox.state, ox.pid, p.tile)) return target(ox, 'tile-held', 'a foreign unit or settlement holds that tile');
  return [];
}

// A foreign unit or settlement on a tile makes it impassable as a goal; an attack takes it.
function tileHolder(state, pid, tile) {
  if (state.map.settlements.some((s) => s.tile === tile && s.people !== pid)) return true;
  return peopleIds(state).some((o) => o !== pid && state.peoples[o].units.some((u) => u.tile === tile));
}

/** The tile a unit reaches on its way to the home settlement this season, or null. */
function retreatTile(ox, u) {
  const home = homeSettlement(ox.state, ox.pid);
  if (!home || home.tile === u.tile) return null;
  const r = route(ox.state, ox.world, u.tile, home.tile, { maxRadius: 32 });
  if (!r) return null;
  const budget = moveBudget(unitStats(ox.state, ox.env, ox.pid, u, ox.standing).mobility);
  let spent = 0;
  let best = null;
  for (const k of r.path.slice(1)) {
    spent += stepCost(ox.state, ox.world, tileOf(ox.world, k));
    if (spent > budget) break;
    if (!tileHolder(ox.state, ox.pid, k)) best = k;
  }
  return best;
}

// where names the tile or region the order aims at, { tile } or { region }.
function attackIssues(ox, spec, where) {
  const out = spec.invalid.map((i) => issue('target', `${ox.path}/params`, `unit ${i.id} ${i.why}`, {
    params: { reason: i.reason, unit: i.id, ...(i.state ? { state: i.state } : {}), ...where },
  }));
  if (spec.error && !spec.invalid.length) out.push(issue('target', `${ox.path}/params`, spec.error, { params: { reason: spec.errorReason, ...where } }));
  return out;
}

function attackProbe(spec) {
  return { kind: 'attack', target: spec.target, tags: ['angriff'], extraMods: spec.extraMods };
}

function sortieSource(ox, o) {
  const s = settlementsOf(ox.state, ox.pid).find((x) => x.id === o.params?.settlement);
  return s && !s.mobile ? s : null;
}

function ausfallCheck(ox, o) {
  const s = sortieSource(ox, o);
  if (!s) return target(ox, 'not-fixed-settlement', 'settlement must be an own settlement that does not move');
  if (!isTile(o.params.tile)) return target(ox, 'not-tile', 'tile must be a tile key');
  const spec = battleSpec(ox, [], o.params.tile, { from: s });
  if (spec.error) return target(ox, spec.errorReason, spec.error, { tile: o.params.tile });
  if (!spec.defenders.length) return target(ox, 'no-foreign-units', 'a sortie needs foreign units on the tile', { tile: o.params.tile });
  return [];
}

function raubzugCheck(ox, o) {
  const ids = unitIdsOf(o.params?.units);
  if (!ids) return target(ox, 'bad-units', 'units must list one to forty unit ids');
  if (typeof o.params.region !== 'string') return target(ox, 'not-region', 'region must be a region id');
  return attackIssues(ox, raidSpec(ox, ids, o.params.region), { region: o.params.region });
}

const ORDERS = {
  recruit: {
    slot: (ox, o, k) => (k >= recruitLimit(ox) ? 'none' : 'minor'),
    tags: ['krieg'],
    available: (ox) => ox.people.developments.known.some((k) => ox.env.entwicklung(k.ref)?.kind === 'einheit' && k.state === 'active'),
    check: recruitCheck,
    plan: (ox, o) => ({ costs: { ...ox.env.entwicklung(o.params.type).spec.recruitCost }, probe: null }),
    resolve(tc, ox, o) {
      const s = tc.state.map.settlements.find((x) => x.id === o.params.settlement && x.people === ox.pid);
      if (!s) {
        notice(tc, 'recruit.skipped', { kind: 'people', id: ox.pid }, `order ${o.id}: the settlement is no longer held`, { people: ox.pid });
        return;
      }
      if (!applyOnce(tc, ox.pid, { op: 'unit.spawn', type: o.params.type, tile: s.tile }, { reason: `order ${o.id}: recruits in ${s.name}` })) return;
      const n = tc.state.peoples[ox.pid].modules.militaer?.recruited ?? 0;
      setPeople(tc, ox.pid, 'modules.militaer.recruited', n + 1, `order ${o.id}: recruit counted`, { kind: 'module.militaer' });
    },
  },
  move: {
    slot: 'minor',
    tags: ['krieg'],
    available: (ox) => ox.people.units.length > 0,
    check: moveCheck,
    plan: () => ({ costs: {}, probe: null }),
    resolve(tc, ox, o) {
      const [id] = claimUnits(tc, ox.pid, [o.params.unit]);
      if (!id) {
        notice(tc, 'move.skipped', { kind: 'unit', id: o.params.unit }, `order ${o.id}: the unit already acted this season`, { people: ox.pid });
      } else if (tileHolder(tc.state, ox.pid, o.params.tile)) {
        notice(tc, 'move.skipped', { kind: 'unit', id }, `order ${o.id}: a foreign unit arrived on ${o.params.tile} first`, { people: ox.pid });
      } else {
        moveUnit(tc, ox.pid, id, o.params.tile, `order ${o.id}: move to ${o.params.tile}`);
      }
    },
  },
  attack: {
    slot: 'main',
    tags: ['krieg', 'angriff'],
    check(ox, o) {
      const ids = unitIdsOf(o.params?.units);
      if (!ids) return target(ox, 'bad-units', 'units must list one to forty unit ids');
      if (!isTile(o.params.tile)) return target(ox, 'not-tile', 'tile must be a tile key');
      return attackIssues(ox, battleSpec(ox, ids, o.params.tile), { tile: o.params.tile });
    },
    available: (ox) => ox.people.units.length > 0,
    plan: (ox, o) => ({ costs: {}, probe: attackProbe(battleSpec(ox, o.params.units, o.params.tile)) }),
    resolve: (tc, ox, o, plan, out) => resolveBattle(tc, ox, o, out, battleSpec(ox, o.params.units, o.params.tile)),
  },
  retreat: {
    slot: 'minor',
    tags: [],
    available: (ox) => ox.people.units.length > 0,
    check(ox, o) {
      const u = ownUnit(ox, o.params?.unit);
      if (!u) return target(ox, 'not-own-unit', 'unit must be an own unit');
      if (!retreatTile(ox, u)) return target(ox, 'no-retreat', 'the unit cannot get closer to its home settlement');
      return [];
    },
    plan: () => ({ costs: {}, probe: null }),
    resolve(tc, ox, o) {
      const u = ownUnit(ox, o.params.unit);
      const [id] = claimUnits(tc, ox.pid, [o.params.unit]);
      if (!id) {
        notice(tc, 'retreat.skipped', { kind: 'unit', id: o.params.unit }, `order ${o.id}: the unit already acted this season`, { people: ox.pid });
        return;
      }
      moveUnit(tc, ox.pid, id, retreatTile(ox, u), `order ${o.id}: retreat towards home`);
    },
  },
  ausfall: {
    slot: 'main',
    locked: true,
    tags: ['krieg', 'angriff', 'befestigung'],
    available: (ox) => settlementsOf(ox.state, ox.pid).some((s) => !s.mobile),
    check: ausfallCheck,
    plan: (ox, o) => ({ costs: {}, probe: attackProbe(battleSpec(ox, [], o.params.tile, { from: sortieSource(ox, o) })) }),
    resolve: (tc, ox, o, plan, out) => resolveBattle(tc, ox, o, out, battleSpec(ox, [], o.params.tile, { from: sortieSource(ox, o) })),
  },
  raubzug: {
    slot: 'main',
    locked: true,
    tags: ['krieg', 'angriff', 'beute'],
    available: (ox) => ox.people.units.length > 0,
    check: raubzugCheck,
    plan: (ox, o) => ({ costs: {}, probe: { kind: 'raubzug', target: raidSpec(ox, o.params.units, o.params.region).target, tags: ['beute'] } }),
    resolve: (tc, ox, o, plan, out) => resolveRaid(tc, ox, o, out, raidSpec(ox, o.params.units, o.params.region)),
  },
};

export default {
  id: 'militaer',
  always: false,
  autoActive: (state, env, pid) => activeDevelopments(state, env, pid).some((d) => d.ent.kind === 'einheit'),
  resourceRoles: [],
  initPeople: () => ({ recruited: 0 }),
  orders: ORDERS,
  hooks: {
    derive(state, env, pid) {
      const standing = standingOf(state, env, pid);
      const units = state.peoples[pid].units.map((u) => ({
        id: u.id, type: u.type, tile: u.tile, state: u.state, ...unitStats(state, env, pid, u, standing),
      }));
      return {
        units,
        strength: units.reduce((n, u) => n + u.strength, 0),
        recruitLimit: Math.floor(state.peoples[pid].population.core / RULES.recruitPerCore),
      };
    },
  },
};

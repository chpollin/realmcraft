// Lebensweise: the way of life of a people, always active. Its spec (settlement,
// migrates, consumption, herdRules) comes from the people's lebensweise
// development; this module adds the orders migrate and adopt, the herd rules,
// the grazing holds a camp leaves behind and the two-season change of way of life.
//
// Slice people.modules.lebensweise = { camp, migratedAt, transition }:
//   camp        id of the people's mobile settlement or null
//   migratedAt  turn of the last migration
//   transition  null | { to, from, startedAt, completeAt }
//
// Resource role herd (default "herden"): a world without that resource simply
// has no herd rules.

import { RULES } from '../core/rules.js';
import { issue } from '../core/issues.js';
import { applyOnce, setKern } from '../core/effects.js';
import { addResource, noteChange, notice, setControl, setPeople } from '../core/log.js';
import { controlledRegions, kern, regionTerrain, settlementsOf } from '../core/state.js';
import { reach, regionAt, tileOf } from '../core/map.js';

const EMPTY = Object.freeze({ camp: null, migratedAt: 0, transition: null });
const sliceOf = (people) => people.modules?.lebensweise ?? EMPTY;
const campOf = (state, pid) => {
  const id = sliceOf(state.peoples[pid]).camp;
  return id ? settlementsOf(state, pid).find((s) => s.id === id) ?? null : null;
};
const isTile = (v) => typeof v === 'string' && /^(0|-?[1-9][0-9]*),(0|-?[1-9][0-9]*)$/.test(v);
const target = (ox, msg) => [issue('target', `${ox.path}/params`, msg)];

function adoptable(ox) {
  return ox.people.developments.known.filter((k) => {
    if (k.state !== 'active' || k.effectiveFrom > ox.turn || k.ref === ox.people.lebensweise) return false;
    return ox.env.entwicklung(k.ref)?.kind === 'lebensweise';
  });
}

const ORDERS = {
  migrate: {
    slot: 'main',
    tags: ['zug', 'herde'],
    available: (ox) => ox.env.entwicklung(ox.people.lebensweise)?.spec?.migrates === true
      && campOf(ox.state, ox.pid) !== null && !sliceOf(ox.people).transition,
    check(ox, o) {
      const camp = campOf(ox.state, ox.pid);
      const tile = o.params?.tile;
      if (!camp) return target(ox, 'the people has no camp');
      if (!isTile(tile)) return target(ox, 'tile must be a tile key');
      if (tile === camp.tile) return target(ox, 'the camp already stands on that tile');
      if (!ox.env.terrain(tileOf(ox.world, tile).terrain)?.buildable) return target(ox, 'tile is not buildable');
      // Passable terrain is implied by reach(); the half-step budget makes roads extend the range.
      if (!Object.hasOwn(reach(ox.state, ox.world, camp.tile, RULES.migrateRange * 2), tile)) return target(ox, `tile is out of reach of the camp (${RULES.migrateRange} steps)`);
      const owner = ox.state.map.control[regionAt(ox.world, tile)];
      if (owner && owner !== ox.pid) return target(ox, `region is controlled by ${owner}`);
      if (ox.state.map.settlements.some((s) => s.tile === tile)) return target(ox, 'a settlement already stands on that tile');
      return [];
    },
    plan: (ox) => ({ costs: {}, probe: { kind: 'migrate', target: ox.cal.winter ? RULES.migrateWinterTarget : RULES.migrateTarget, tags: ['zug'] } }),
    resolve(tc, ox, o, plan, out) {
      const pid = ox.pid;
      const camp = tc.state.map.settlements.find((s) => s.id === campOf(ox.state, pid)?.id);
      if (!camp) return;
      // The check saw the people's projection and the drafts of other peoples
      // run in the same season, so the target is decided on the current state.
      const owner = tc.state.map.control[regionAt(tc.world, o.params.tile)];
      if ((owner && owner !== pid) || tc.state.map.settlements.some((s) => s.tile === o.params.tile && s.id !== camp.id)) {
        notice(tc, 'order.blocked', { kind: 'settlement', id: camp.id }, `order ${o.id}: the camp cannot move to ${o.params.tile}, the tile or its region is taken`, { people: pid });
        return;
      }
      const reason = `order ${o.id}: the camp moves (${out.band})`;
      const loss = out.band === 'failure' ? 1 : out.band === 'setback' || out.band === 'crit_fail' ? 2 : 0;
      const herd = ox.bind('lebensweise')?.herd;
      if (loss && herd && ox.env.resourceIds.includes(herd)) {
        applyOnce(tc, pid, { op: 'resource.delta', res: herd, amount: -loss }, { reason: `order ${o.id}: the herd suffers on the way (${out.band})` });
      }
      const oldRegion = camp.regionId;
      const newRegion = regionAt(tc.world, o.params.tile);
      const own = { people: pid };
      if (oldRegion !== newRegion) {
        const another = tc.state.map.settlements.some((s) => s.people === pid && s.id !== camp.id && s.regionId === oldRegion);
        if (!another) setKern(tc, pid, `holds.${oldRegion}`, tc.turn + RULES.campHold, `${o.id}: grazing hold on the region the camp leaves`, { kind: 'kern.hold' });
      }
      noteChange(tc, 'settlement.move', { kind: 'settlement', id: camp.id }, 'tile', camp.tile, o.params.tile, reason, own);
      camp.tile = o.params.tile;
      if (camp.regionId !== newRegion) {
        noteChange(tc, 'settlement.move', { kind: 'settlement', id: camp.id }, 'regionId', camp.regionId, newRegion, reason, own);
        camp.regionId = newRegion;
      }
      if (!tc.state.map.control[newRegion]) setControl(tc, newRegion, pid, `${o.id}: the camp takes the grazing of an unclaimed region`, own);
      setPeople(tc, pid, 'modules.lebensweise.migratedAt', tc.turn, reason, { kind: 'lebensweise.migrate' });
    },
  },
  adopt: {
    slot: 'main',
    tags: ['wandel'],
    available: (ox) => !sliceOf(ox.people).transition && adoptable(ox).length > 0,
    check(ox, o) {
      const ref = o.params?.lebensweise;
      if (sliceOf(ox.people).transition) return target(ox, 'a change of way of life is already running');
      if (!adoptable(ox).some((k) => k.ref === ref)) return target(ox, 'lebensweise must be another known, active way of life');
      return [];
    },
    plan: () => ({ costs: {}, probe: { kind: 'adopt', target: RULES.adoptTarget, tags: ['wandel'] } }),
    resolve(tc, ox, o, plan, out) {
      const pid = ox.pid;
      if (!out.success) {
        notice(tc, 'lebensweise.adopt-failed', { kind: 'people', id: pid }, `order ${o.id}: the people does not change its way of life (${out.band})`, { people: pid });
        return;
      }
      if (sliceOf(tc.state.peoples[pid]).transition) return;
      const transition = { to: o.params.lebensweise, from: tc.state.peoples[pid].lebensweise, startedAt: tc.turn, completeAt: tc.turn + 2 };
      setPeople(tc, pid, 'modules.lebensweise.transition', transition, `order ${o.id}: the change of way of life begins (${out.band})`, { kind: 'lebensweise.transition' });
    },
  },
};

// The way of life changes: people and settlements follow the new spec.
function completeTransition(tc, pid, transition) {
  const ent = tc.env.entwicklung(transition.to);
  if (!ent?.spec) {
    setPeople(tc, pid, 'modules.lebensweise.transition', null, `the way of life ${transition.to} is unknown; the change is dropped`, { kind: 'lebensweise.transition' });
    return;
  }
  const reason = `the change of way of life to ${ent.name} is complete`;
  setPeople(tc, pid, 'lebensweise', transition.to, reason, { kind: 'lebensweise.change' });
  const kind = RULES.settlementKind[ent.spec.settlement];
  const mobile = ent.spec.settlement === 'camp';
  const generated = new Set(Object.values(RULES.settlementKind));
  for (const s of tc.state.map.settlements) {
    // A settlement of another kind (a town) keeps what it is.
    if (s.people !== pid || !generated.has(s.kind)) continue;
    if (s.kind !== kind) {
      noteChange(tc, 'settlement.kind', { kind: 'settlement', id: s.id }, 'kind', s.kind, kind, reason, { people: pid });
      s.kind = kind;
    }
    if (s.mobile !== mobile) {
      noteChange(tc, 'settlement.kind', { kind: 'settlement', id: s.id }, 'mobile', s.mobile, mobile, reason, { people: pid });
      s.mobile = mobile;
    }
  }
  const own = settlementsOf(tc.state, pid);
  const keep = own.find((s) => s.id === sliceOf(tc.state.peoples[pid]).camp);
  setPeople(tc, pid, 'modules.lebensweise.camp', mobile ? (keep ?? own[0])?.id ?? null : null, reason, { kind: 'lebensweise.change' });
  setPeople(tc, pid, 'modules.lebensweise.transition', null, reason, { kind: 'lebensweise.transition' });
}

// A camp that moved on keeps its grazing for RULES.campHold turns; afterwards
// the region falls free unless the people still has a settlement or unit there.
function expireHolds(tc, pid) {
  const holds = kern(tc.s0.peoples[pid]).holds ?? {};
  for (const region of Object.keys(holds).sort()) {
    if (holds[region] >= tc.turn) continue;
    const present = tc.state.map.settlements.some((s) => s.people === pid && s.regionId === region)
      || tc.state.peoples[pid].units.some((u) => regionAt(tc.world, u.tile) === region);
    if (tc.state.map.control[region] === pid && !present) setControl(tc, region, null, 'the grazing hold has run out', { people: pid });
    setKern(tc, pid, `holds.${region}`, undefined, 'the grazing hold has run out', { kind: 'kern.hold' });
  }
}

function tendHerds(tc, pid, mx) {
  const people = tc.s0.peoples[pid];
  const rules = tc.env.entwicklung(people.lebensweise)?.spec?.herdRules;
  const herd = mx.bind.herd;
  if (!rules || !herd || !tc.env.resourceIds.includes(herd)) return;
  if (tc.cal.winter) {
    addResource(tc, pid, herd, -rules.winterLoss, 'winter takes part of the herds');
    return;
  }
  const pasture = controlledRegions(tc.s0, pid).filter((r) => rules.pastureTerrains.includes(regionTerrain(tc.world, r))).length;
  // The season's labour is already in tc.state (set when apply starts), S0 holds the previous one.
  const hueten = tc.state.peoples[pid].population.assigned?.hueten ?? 0;
  const growth = Math.min(people.population.core, rules.growth * pasture) + Math.floor(hueten / 2);
  if (growth > 0) addResource(tc, pid, herd, growth, `the herds graze on ${pasture} pasture region(s), ${hueten} clan(s) tend them`);
  const food = Math.floor((people.resources[herd] ?? 0) / RULES.herdFoodDivisor);
  // Food comes before the economy step so it counts against consumption.
  if (food > 0 && tc.env.resourceIds.includes(RULES.food)) addResource(tc, pid, RULES.food, food, 'the herds feed the people');
}

export default {
  id: 'lebensweise',
  version: 1,
  always: true,
  resourceRoles: [{ role: 'herd', defaultId: 'herden' }],
  tags: { zug: 1, herde: 1, weide: 1, wandel: 1 },
  initPeople: (state, env, pid) => ({ camp: settlementsOf(state, pid).find((s) => s.mobile)?.id ?? null, migratedAt: 0, transition: null }),
  orders: ORDERS,
  hooks: {
    resolve(tc, pid, mx) {
      const transition = sliceOf(tc.s0.peoples[pid]).transition;
      if (transition && transition.completeAt <= tc.turn) completeTransition(tc, pid, transition);
      expireHolds(tc, pid);
      tendHerds(tc, pid, mx);
    },
    derive(state, env, pid, mx) {
      const people = state.peoples[pid];
      const slice = sliceOf(people);
      const camp = campOf(state, pid);
      const herd = mx.bind.herd;
      return {
        camp: camp ? { id: camp.id, tile: camp.tile, regionId: camp.regionId } : null,
        migratedAt: slice.migratedAt,
        transition: slice.transition,
        holds: { ...(kern(people).holds ?? {}) },
        herds: herd && env.resourceIds.includes(herd) ? { res: herd, stock: people.resources[herd] ?? 0, tending: people.population.assigned?.hueten ?? 0 } : null,
      };
    },
  },
  views: [{ id: 'lebensweise', labelKey: 'view.lebensweise', icon: 'tent', order: 25, scope: 'people', sections: ['camp', 'herds', 'transition'] }],
  labelKeys: ['view.lebensweise', 'module.lebensweise', 'order.migrate', 'order.adopt'],
  agentHints: { primitives: ['resource.flow', 'stat.mod', 'yield.mod'], tags: ['zug', 'herde', 'weide', 'wandel'] },
};

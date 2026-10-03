import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testEnv } from '../../fixtures/engine/k1/pack.js';
import {
  PLAYER, PARTNER, startState, hochlandEnv, edited, learn, forget, atTurn, contextOf, runHook, resolveOrder,
  checkOrders, rolledDraft, season, uncoveredPaths, LABELS,
} from '../../fixtures/engine/k1/modules.js';
import lebensweise from '../../../engine/modules/lebensweise.js';
import { activeModules } from '../../../engine/modules/index.js';
import { catalogueFor } from '../../../engine/core/orders.js';
import { RULES } from '../../../engine/core/rules.js';
import { reach, route, regionAt, tileOf } from '../../../engine/core/map.js';
import { kern, regionTerrain, settlementsOf } from '../../../engine/core/state.js';

const env = testEnv();
const world = env.world(7);
const start = startState(env);
const campOf = (s, pid = PLAYER) => settlementsOf(s, pid).find((x) => x.id === s.peoples[pid].modules.lebensweise.camp);
const camp0 = campOf(start);
const near = reach(start, world, camp0.tile, RULES.migrateRange * 2);
const buildable = (k) => env.terrain(tileOf(world, k).terrain)?.buildable;

// Within reach of the camp only the regions of the two neighbours lie beside its own, so the
// base state frees the region of the first such tile (the foreign-region rule is tested separately).
const otherRegion = Object.keys(near).filter((k) => buildable(k) && regionAt(world, k) !== camp0.regionId).sort()[0];
const freed = (s) => edited(s, (x) => { delete x.map.control[regionAt(world, otherRegion)]; });
const base = freed(start);
const sameRegion = Object.keys(near).filter((k) => k !== camp0.tile && buildable(k) && regionAt(world, k) === camp0.regionId).sort()[0];
const unbuildable = Object.keys(near).filter((k) => !buildable(k)).sort()[0];
const farAway = Object.keys(reach(base, world, camp0.tile, 40)).filter((k) => !Object.hasOwn(near, k) && buildable(k)).sort()[0];

const migrate = lebensweise.orders.migrate;
const adopt = lebensweise.orders.adopt;
const herdOf = (s) => s.peoples[PLAYER].resources.herden;

test('fixture precondition: the chosen tiles exist', () => {
  assert.ok(otherRegion && sameRegion && unbuildable && farAway);
  assert.equal(base.map.control[camp0.regionId], PLAYER);
});

test('lebensweise is always active with the herd role defaulting to herden', () => {
  assert.equal(lebensweise.always, true);
  for (const pid of Object.keys(base.peoples)) {
    const m = activeModules(base, env, pid).find((x) => x.id === 'lebensweise');
    assert.equal(m.bind.herd, 'herden');
  }
  assert.deepEqual(base.peoples[PLAYER].modules.lebensweise, { camp: 's-hochweide', migratedAt: 0, transition: null });
  assert.deepEqual(base.peoples[PARTNER].modules.lebensweise, { camp: null, migratedAt: 0, transition: null });
});

test('migrate is in the catalogue of nomads only', () => {
  const find = (pid, type) => catalogueFor(base, env, pid).find((c) => c.type === type);
  assert.equal(find(PLAYER, 'migrate').available, true);
  assert.equal(find(PARTNER, 'migrate').available, false);
  assert.equal(find(PARTNER, 'migrate').reason, 'nothing to act on');
  assert.equal(find(PLAYER, 'adopt').available, false, 'no other way of life known');
});

test('migrate is a main order with the tags zug and herde and no cost', () => {
  assert.equal(migrate.slot, 'main');
  assert.deepEqual(migrate.tags, ['zug', 'herde']);
  const chk = checkOrders(base, env, PLAYER, [{ id: 'o1', type: 'migrate', params: { tile: otherRegion } }]);
  assert.deepEqual(chk.issues.filter((i) => i.severity === 'error'), []);
  assert.deepEqual(chk.entries[0].tags, ['zug', 'herde', RULES.mainTag]);
  assert.deepEqual(chk.costs, {});
});

test('migrate target: winter raises the probe target', () => {
  const target = (turn) => checkOrders(atTurn(base, turn), env, PLAYER, [{ id: 'o1', type: 'migrate', params: { tile: otherRegion } }]).entries[0].probe.target;
  assert.equal(target(0), RULES.migrateTarget);
  assert.equal(target(3), RULES.migrateWinterTarget);
});

test('migrate check rejects every bad target', () => {
  const issues = (s, tile) => checkOrders(s, env, PLAYER, [{ id: 'o1', type: 'migrate', params: { tile } }]).issues.filter((i) => i.severity === 'error');
  assert.equal(issues(base, otherRegion).length, 0);
  assert.equal(issues(base, 'nowhere').length, 1, 'not a tile key');
  assert.equal(issues(base, camp0.tile).length, 1, 'the camp is already there');
  assert.equal(issues(base, unbuildable).length, 1, 'not buildable');
  assert.equal(issues(base, farAway).length, 1, 'out of reach');
  const foreign = edited(base, (s) => { s.map.control[regionAt(world, otherRegion)] = PARTNER; });
  assert.equal(issues(foreign, otherRegion).length, 1, 'region of another people');
  const settled = edited(base, (s) => { s.map.settlements.push({ id: 's-x', name: 'Fremdhof', people: PARTNER, kind: 'dorf', tile: otherRegion, regionId: regionAt(world, otherRegion), mobile: false, buildings: [] }); });
  assert.equal(issues(settled, otherRegion).length, 1, 'foreign settlement on the tile');
});

test('migrate reach is measured in half steps, so a road extends it', () => {
  const budget = RULES.migrateRange * 2;
  const reachable = (s) => Object.hasOwn(reach(s, world, camp0.tile, budget), farTile);
  const wide = reach(base, world, camp0.tile, budget + 4);
  const farTile = Object.keys(wide).filter((k) => !Object.hasOwn(near, k) && buildable(k) && !base.map.control[regionAt(world, k)]).sort()[0];
  assert.ok(farTile, 'a tile just beyond the range');
  assert.equal(reachable(base), false);
  const roaded = edited(base, (s) => {
    for (const k of route(s, world, camp0.tile, farTile).path) s.map.features[k] = { id: `weg-${k}`.replace(/[^a-z0-9-]/g, 'x').slice(0, 41), kind: RULES.roadKind, name: 'Weg', tags: ['weg'], resources: [], since: 0, source: 'kernel' };
  });
  assert.equal(reachable(roaded), true);
  assert.deepEqual(checkOrders(roaded, env, PLAYER, [{ id: 'o1', type: 'migrate', params: { tile: farTile } }]).issues.filter((i) => i.severity === 'error'), []);
});

const losses = { crit_success: 0, success: 0, narrow: 0, failure: 1, setback: 2, crit_fail: 2 };
for (const [band, loss] of Object.entries(losses)) {
  test(`migrate in band ${band}: the camp moves and ${loss} herd(s) are lost`, () => {
    const { tc, errors } = resolveOrder(base, env, PLAYER, migrate, { tile: otherRegion }, band);
    assert.deepEqual(errors, []);
    const s = tc.state;
    const camp = campOf(s);
    const region = regionAt(world, otherRegion);
    assert.equal(camp.tile, otherRegion);
    assert.equal(camp.regionId, region);
    assert.equal(herdOf(s), herdOf(base) - loss);
    assert.equal(s.map.control[region], PLAYER, 'the new region is claimed');
    assert.equal(s.map.control[camp0.regionId], PLAYER, 'the old region stays under control');
    assert.equal(kern(s.peoples[PLAYER]).holds[camp0.regionId], base.turn + RULES.campHold, 'grazing hold on the old region');
    assert.equal(s.peoples[PLAYER].modules.lebensweise.migratedAt, base.turn);
    assert.deepEqual(uncoveredPaths(tc, PLAYER), []);
    for (const e of tc.log) assert.ok(e.visibleTo.includes(PLAYER) || e.visibleTo[0] === 'all');
    assert.ok(tc.log.some((e) => e.kind === 'settlement.move' && e.target.id === camp.id && e.change.field === 'tile'));
  });
}

test('migrate keeps a claimed region and sets no hold when the camp stays in its region', () => {
  const { tc } = resolveOrder(base, env, PLAYER, migrate, { tile: sameRegion }, 'success');
  assert.equal(campOf(tc.state).tile, sameRegion);
  assert.deepEqual(kern(tc.state.peoples[PLAYER]).holds, {});
  assert.equal(tc.state.map.control[camp0.regionId], PLAYER);
});

test('migrate sets no hold while another own settlement stands in the old region', () => {
  const second = edited(base, (s) => {
    s.map.settlements.push({ id: 's-hochweide-2', name: 'Zweitlager', people: PLAYER, kind: 'lager', tile: sameRegion, regionId: camp0.regionId, mobile: true, buildings: [] });
  });
  const { tc } = resolveOrder(second, env, PLAYER, migrate, { tile: otherRegion }, 'success');
  assert.deepEqual(kern(tc.state.peoples[PLAYER]).holds, {});
});

test('migrate does not claim a region the people already controls', () => {
  const owned = edited(base, (s) => { s.map.control[regionAt(world, otherRegion)] = PLAYER; });
  const { tc } = resolveOrder(owned, env, PLAYER, migrate, { tile: otherRegion }, 'success');
  assert.equal(tc.log.filter((e) => e.kind === 'map.control').length, 0, 'an own region is not claimed again');
});

test('a world without the herd resource has no herd rules, and migrating costs nothing', () => {
  const noHerd = testEnv({ regeln: { ...testEnv().regeln, moduleBindings: { handel: { currency: 'salz' }, magie: { source: 'rauchkraut' }, lebensweise: { herd: 'gibtesnicht' } } } });
  const s = freed(startState(noHerd));
  const { tc } = resolveOrder(s, noHerd, PLAYER, migrate, { tile: otherRegion }, 'crit_fail');
  assert.equal(tc.state.peoples[PLAYER].resources.herden, 4);
  assert.equal(campOf(tc.state).tile, otherRegion);
  const hook = contextOf(s, noHerd);
  runHook(hook, 'resolve', PLAYER);
  assert.equal(hook.state.peoples[PLAYER].resources.herden, 4);
});

test('the grazing hold lapses after campHold turns: the region falls free', () => {
  const held = edited(base, (s) => {
    kern(s.peoples[PLAYER]);
    s.peoples[PLAYER].modules.kern.holds = { [camp0.regionId]: 2 };
    campOf(s).tile = otherRegion;
    campOf(s).regionId = regionAt(world, otherRegion);
    s.map.control[regionAt(world, otherRegion)] = PLAYER;
  });
  for (const turn of [1, 2]) {
    const tc = contextOf(atTurn(held, turn), env);
    runHook(tc, 'resolve', PLAYER);
    assert.equal(tc.state.map.control[camp0.regionId], PLAYER, `held in turn ${turn}`);
    assert.equal(kern(tc.state.peoples[PLAYER]).holds[camp0.regionId], 2);
  }
  const tc = contextOf(atTurn(held, 3), env);
  runHook(tc, 'resolve', PLAYER);
  assert.equal(tc.state.map.control[camp0.regionId], null);
  assert.deepEqual(kern(tc.state.peoples[PLAYER]).holds, {});
  assert.ok(tc.log.some((e) => e.kind === 'map.control' && e.target.id === camp0.regionId && e.change.after === null));
  assert.deepEqual(uncoveredPaths(tc, PLAYER), []);
});

test('an expired hold frees nothing while a unit or a settlement still stands in the region', () => {
  const held = edited(base, (s) => {
    s.peoples[PLAYER].modules.kern.holds = { [camp0.regionId]: 0 };
    s.peoples[PLAYER].units.push({ id: 'u-1', type: 'speerwall@1', strength: 2, tile: camp0.tile, state: 'moved', since: 0 });
    campOf(s).tile = otherRegion;
    campOf(s).regionId = regionAt(world, otherRegion);
  });
  const tc = contextOf(atTurn(held, 5), env);
  runHook(tc, 'resolve', PLAYER);
  assert.equal(tc.state.map.control[camp0.regionId], PLAYER, 'a unit holds the region');
  assert.deepEqual(kern(tc.state.peoples[PLAYER]).holds, {}, 'the hold itself is gone');

  const settled = edited(base, (s) => { s.peoples[PLAYER].modules.kern.holds = { [camp0.regionId]: 0 }; });
  const tc2 = contextOf(atTurn(settled, 5), env);
  runHook(tc2, 'resolve', PLAYER);
  assert.equal(tc2.state.map.control[camp0.regionId], PLAYER, 'the camp itself stands there');
});

test('an expired hold does not touch a region another people took over', () => {
  const held = edited(base, (s) => {
    s.peoples[PLAYER].modules.kern.holds = { '5:5:0': 0 };
    s.map.control['5:5:0'] = PARTNER;
  });
  const tc = contextOf(atTurn(held, 5), env);
  runHook(tc, 'resolve', PLAYER);
  assert.equal(tc.state.map.control['5:5:0'], PARTNER);
  assert.deepEqual(kern(tc.state.peoples[PLAYER]).holds, {});
});

const known = (s) => learn(s, PLAYER, 'talbauern@1');
const talbauern = known(base);

test('adopt needs another known way of life and no running change', () => {
  assert.equal(catalogueFor(talbauern, env, PLAYER).find((c) => c.type === 'adopt').available, true);
  const issues = (s, params) => checkOrders(s, env, PLAYER, [{ id: 'o1', type: 'adopt', params }]).issues.filter((i) => i.severity === 'error');
  assert.equal(issues(talbauern, { lebensweise: 'talbauern@1' }).length, 0);
  assert.equal(issues(talbauern, { lebensweise: 'wanderhirten@1' }).length, 1, 'the current one');
  assert.equal(issues(talbauern, { lebensweise: 'sippenrat@1' }).length, 1, 'not a way of life');
  assert.equal(issues(talbauern, { lebensweise: 'unbekannt@1' }).length, 1, 'unknown');
  const running = edited(talbauern, (s) => { s.peoples[PLAYER].modules.lebensweise.transition = { to: 'talbauern@1', from: 'wanderhirten@1', startedAt: 0, completeAt: 2 }; });
  assert.equal(catalogueFor(running, env, PLAYER).find((c) => c.type === 'adopt').available, false);
  assert.equal(catalogueFor(running, env, PLAYER).find((c) => c.type === 'migrate').available, false, 'no migration during the change');
});

test('adopt is a main order for the council scope wandel with a probe of the adopt target', () => {
  assert.equal(adopt.slot, 'main');
  assert.deepEqual(adopt.tags, ['wandel']);
  const e = checkOrders(talbauern, env, PLAYER, [{ id: 'o1', type: 'adopt', params: { lebensweise: 'talbauern@1' } }]).entries[0];
  assert.equal(e.probe.target, RULES.adoptTarget);
  assert.ok(e.probe.tags.includes('wandel'));
});

for (const [band, ok] of Object.entries({ crit_success: true, success: true, narrow: true, failure: false, setback: false, crit_fail: false })) {
  test(`adopt in band ${band} ${ok ? 'starts' : 'does not start'} the change`, () => {
    const { tc } = resolveOrder(talbauern, env, PLAYER, adopt, { lebensweise: 'talbauern@1' }, band);
    const t = tc.state.peoples[PLAYER].modules.lebensweise.transition;
    if (ok) assert.deepEqual(t, { to: 'talbauern@1', from: 'wanderhirten@1', startedAt: 0, completeAt: 2 });
    else assert.equal(t, null);
    assert.equal(tc.state.peoples[PLAYER].lebensweise, 'wanderhirten@1', 'the way of life itself changes later');
    assert.deepEqual(uncoveredPaths(tc, PLAYER), []);
  });
}

test('the change of way of life completes in the third season and turns the camp into a village', () => {
  // The Sippenrat would put adopt to a council vote; this test is about the module.
  let s = forget(talbauern, PLAYER, 'sippenrat@1');
  const roll10 = (state) => rolledDraft(state, env, PLAYER, [], { roll: 5 });
  let r = season(s, env, { [PLAYER]: rolledDraft(s, env, PLAYER, [{ id: 'o1', type: 'adopt', params: { lebensweise: 'talbauern@1' } }], { roll: { o1: 10 } }) });
  s = r.state;
  assert.deepEqual(s.peoples[PLAYER].modules.lebensweise.transition, { to: 'talbauern@1', from: 'wanderhirten@1', startedAt: 0, completeAt: 2 });
  assert.equal(s.peoples[PLAYER].lebensweise, 'wanderhirten@1');
  assert.equal(campOf(s).kind, 'lager');
  r = season(s, env, { [PLAYER]: roll10(s) });
  s = r.state;
  assert.equal(s.turn, 2);
  assert.equal(s.peoples[PLAYER].lebensweise, 'wanderhirten@1', 'still the old way in the second season');
  assert.ok(s.peoples[PLAYER].modules.lebensweise.transition);
  r = season(s, env, { [PLAYER]: roll10(s) });
  s = r.state;
  assert.equal(s.peoples[PLAYER].lebensweise, 'talbauern@1');
  assert.equal(s.peoples[PLAYER].modules.lebensweise.transition, null);
  assert.equal(s.peoples[PLAYER].modules.lebensweise.camp, null);
  const own = settlementsOf(s, PLAYER);
  assert.ok(own.length > 0 && own.every((x) => x.kind === 'dorf' && x.mobile === false));
  const entry = r.events.find((e) => e.kind === 'lebensweise.change');
  assert.equal(entry.step, 'modules');
  assert.equal(entry.change.after, 'talbauern@1');
});

test('the way back to a camp makes the first settlement the camp again', () => {
  const village = edited(learn(base, PLAYER, 'talbauern@1'), (s) => {
    const p = s.peoples[PLAYER];
    p.lebensweise = 'talbauern@1';
    p.modules.lebensweise.camp = null;
    p.modules.lebensweise.transition = { to: 'wanderhirten@1', from: 'talbauern@1', startedAt: 0, completeAt: 2 };
    Object.assign(campOf(base) && s.map.settlements.find((x) => x.id === camp0.id), { kind: 'dorf', mobile: false });
  });
  const tc = contextOf(atTurn(village, 2), env);
  runHook(tc, 'resolve', PLAYER);
  assert.equal(tc.state.peoples[PLAYER].lebensweise, 'wanderhirten@1');
  assert.equal(tc.state.peoples[PLAYER].modules.lebensweise.camp, camp0.id);
  assert.deepEqual(settlementsOf(tc.state, PLAYER).map((x) => [x.kind, x.mobile]), [['lager', true]]);
  assert.deepEqual(uncoveredPaths(tc, PLAYER), []);
});

// Fixture facts (checked in the precondition): the player controls one region of wiese
// (a pasture terrain of wanderhirten), holds 4 herds and has 3 clans, 2 of them on food.
test('herds in a season with pasture: growth per pasture region, plus one per two herding clans, plus food', () => {
  assert.equal(regionTerrain(world, camp0.regionId), 'wiese');
  const run = (hueten) => {
    const s = edited(base, (x) => { x.peoples[PLAYER].population.assigned = { nahrung: 3 - hueten, hueten }; });
    // The labour of the season is written to tc.state when apply starts; the hook reads it there.
    const tc = contextOf(s, env);
    tc.state.peoples[PLAYER].population.assigned = { nahrung: 3 - hueten, hueten };
    runHook(tc, 'resolve', PLAYER);
    return tc;
  };
  const none = run(0);
  assert.equal(herdOf(none.state), 4 + 1, 'growth 1 x 1 pasture region');
  assert.equal(none.state.peoples[PLAYER].resources.nahrung, 6 + 1, 'floor(4 / 3) food from the opening herd');
  assert.equal(herdOf(run(2).state), 4 + 1 + 1);
  assert.equal(herdOf(run(3).state), 4 + 1 + 1, 'an odd clan adds nothing');
  assert.deepEqual(uncoveredPaths(none, PLAYER), []);
  assert.ok(none.log.every((e) => e.step === 'modules'));
});

test('pasture growth is capped at the number of clans', () => {
  const small = edited(base, (s) => { s.peoples[PLAYER].population.core = 1; });
  const rich = testEnv();
  rich.content.entwicklungen.find((e) => e.id === 'wanderhirten').spec.herdRules.growth = 2;
  const tc = contextOf(small, rich);
  tc.state.peoples[PLAYER].population.assigned = { nahrung: 1 };
  runHook(tc, 'resolve', PLAYER);
  assert.equal(herdOf(tc.state), 4 + 1, 'growth 2 x 1 region, capped at core 1');
});

// Hochland starts every people on an alm tile, often inside a mountain region.
// The herds graze the land around the camp, as the harvest does.
test('a camp on pasture land in a mountain region grazes its herds', () => {
  const real = hochlandEnv();
  const pid = 'bergnomaden';
  let found = null;
  for (let seed = 1; seed <= 24 && !found; seed++) {
    const s = startState(real, seed);
    const w = real.world(s.map.seed);
    const c = settlementsOf(s, pid)[0];
    const pasture = real.entwicklung(s.peoples[pid].lebensweise).spec.herdRules.pastureTerrains;
    if (!pasture.includes(regionTerrain(w, c.regionId)) && pasture.includes(tileOf(w, c.tile).terrain)) found = s;
  }
  assert.ok(found, 'a seed whose start camp stands on pasture in a region of other terrain');
  const s = edited(found, (x) => { x.peoples[pid].population.assigned = { nahrung: x.peoples[pid].population.core }; });
  const tc = contextOf(s, real);
  runHook(tc, 'resolve', pid);
  const growth = real.entwicklung(s.peoples[pid].lebensweise).spec.herdRules.growth;
  assert.equal(tc.state.peoples[pid].resources.herden, s.peoples[pid].resources.herden + Math.min(s.peoples[pid].population.core, growth));
});

test('herds lose winterLoss in winter, never below zero, and give no food', () => {
  const winter = atTurn(base, 3);
  const tc = contextOf(winter, env);
  runHook(tc, 'resolve', PLAYER);
  assert.equal(herdOf(tc.state), 4 - 1);
  assert.equal(tc.state.peoples[PLAYER].resources.nahrung, 6);
  const empty = atTurn(edited(base, (s) => { s.peoples[PLAYER].resources.herden = 0; }), 3);
  const tc2 = contextOf(empty, env);
  runHook(tc2, 'resolve', PLAYER);
  assert.equal(herdOf(tc2.state), 0);
  assert.equal(tc2.state.peoples[PLAYER].shortfall.herden ?? 0, 0, 'a winter loss is no shortfall');
});

test('a way of life without herdRules leaves herds alone', () => {
  const tc = contextOf(base, env);
  runHook(tc, 'resolve', PARTNER);
  assert.equal(tc.state.peoples[PARTNER].resources.herden, 1);
  assert.equal(tc.state.peoples[PARTNER].resources.nahrung, 8);
});

test('in a full season the herd food is booked in the modules step, before the economy', () => {
  const s = forget(base, PLAYER, 'sippenrat@1');
  const r = season(s, env, { [PLAYER]: rolledDraft(s, env, PLAYER, []) });
  const food = r.events.find((e) => e.target.id === PLAYER && e.kind === 'resource.change' && e.change.field === 'resources.nahrung' && /herds feed/.test(e.reason));
  assert.ok(food);
  assert.equal(food.step, 'modules');
  const order = r.events.map((e) => e.step);
  assert.ok(order.indexOf('modules') < (order.indexOf('economy') < 0 ? Infinity : order.indexOf('economy')));
});

test('a migration through a full season moves the camp and keeps the hold in the kernel slice', () => {
  const s = forget(base, PLAYER, 'sippenrat@1');
  const r = season(s, env, { [PLAYER]: rolledDraft(s, env, PLAYER, [{ id: 'o1', type: 'migrate', params: { tile: otherRegion } }], { roll: { o1: 5 } }) });
  assert.equal(campOf(r.state).tile, otherRegion);
  assert.equal(kern(r.state.peoples[PLAYER]).holds[camp0.regionId], RULES.campHold);
  assert.equal(r.state.map.control[regionAt(world, otherRegion)], PLAYER);
  assert.equal(r.state.peoples[PLAYER].modules.lebensweise.migratedAt, 0);
});

test('real Hochland package: nomads migrate, the herd role defaults to herden', () => {
  const real = hochlandEnv();
  const s = startState(real);
  const pid = s.campaign.player;
  assert.equal(s.peoples[pid].lebensweise, 'nomadisch@1');
  assert.equal(catalogueFor(s, real, pid).find((c) => c.type === 'migrate').available, true);
  assert.equal(activeModules(s, real, pid).find((m) => m.id === 'lebensweise').bind.herd, 'herden');
  const rw = real.world(s.map.seed);
  const camp = campOf(s, pid);
  const target = Object.keys(reach(s, rw, camp.tile, RULES.migrateRange * 2)).filter((k) => k !== camp.tile && real.terrain(tileOf(rw, k).terrain)?.buildable && regionAt(rw, k) === camp.regionId).sort()[0];
  const chk = checkOrders(s, real, pid, [{ id: 'o1', type: 'migrate', params: { tile: target } }]);
  assert.deepEqual(chk.issues.filter((i) => i.severity === 'error'), []);
});

test('descriptor: views, label keys and hints are well formed and the labels exist', () => {
  assert.deepEqual(lebensweise.views, [{ id: 'lebensweise', labelKey: 'view.lebensweise', icon: 'tent', order: 25, scope: 'people', sections: ['camp', 'herds', 'transition'] }]);
  assert.deepEqual(lebensweise.resourceRoles, [{ role: 'herd', defaultId: 'herden' }]);
  for (const k of lebensweise.labelKeys) assert.ok(Object.hasOwn(LABELS, k), `${k} is missing in labels.json`);
  assert.ok(lebensweise.agentHints.tags.includes('zug'));
  const d = lebensweise.hooks.derive(base, env, PLAYER, { id: 'lebensweise', bind: { herd: 'herden' } });
  assert.equal(d.camp.id, camp0.id);
  assert.equal(d.herds.stock, 4);
});

test('refusals are machine-readable: code, reason and the interpolated params', () => {
  const first = (s, type, params) => checkOrders(s, env, PLAYER, [{ id: 'o1', type, params }]).issues.filter((i) => i.severity === 'error')[0];
  const shape = (i) => [i.code, i.params];
  const move = (s, tile) => shape(first(s, 'migrate', { tile }));
  assert.deepEqual(move(base, 'nowhere'), ['target', { reason: 'not-tile' }]);
  assert.deepEqual(move(base, camp0.tile), ['target', { reason: 'camp-on-tile' }]);
  assert.deepEqual(move(base, unbuildable), ['target', { reason: 'not-buildable' }]);
  assert.deepEqual(move(base, farAway), ['target', { reason: 'out-of-reach', range: RULES.migrateRange }]);
  const foreign = edited(base, (s) => { s.map.control[regionAt(world, otherRegion)] = PARTNER; });
  assert.deepEqual(move(foreign, otherRegion), ['target', { reason: 'region-controlled', people: PARTNER }]);
  const settled = edited(base, (s) => { s.map.settlements.push({ id: 's-x', name: 'Fremdhof', people: PARTNER, kind: 'dorf', tile: otherRegion, regionId: regionAt(world, otherRegion), mobile: false, buildings: [] }); });
  assert.deepEqual(move(settled, otherRegion), ['target', { reason: 'settlement-on-tile' }]);
  assert.deepEqual(shape(first(talbauern, 'adopt', { lebensweise: 'wanderhirten@1' })), ['target', { reason: 'not-adoptable' }]);
});

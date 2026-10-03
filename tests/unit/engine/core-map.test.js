import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  roadLevel, stepCost, costFn, route, reach, moveBudget, regionAt, tileOf, visionUpdate, knownRegions, threatLayer, roadLayer,
} from '../../../engine/core/map.js';
import { RULES } from '../../../engine/core/rules.js';
import { tileAt, neighbors, key, parseKey, distance } from '../../../engine/world/index.js';
import { freshState, clone, findTerrain, roadFeature, PLAYER } from '../../fixtures/engine/k1/foundation.js';

const P = PLAYER;
const HOME = '0,1';
const setup = () => {
  const { env, state } = freshState();
  const s = clone(state);
  return { env, state: s, world: env.world(s.map.seed) };
};
const tileKeyOf = (terrain, world) => {
  const k = findTerrain(world, terrain, HOME);
  assert.ok(k, `test world has a ${terrain} tile`);
  return k;
};

test('roadLevel: no feature or another kind is level 0, a road is level 1 plus its stufe tag, capped', () => {
  assert.equal(roadLevel(undefined), 0);
  assert.equal(roadLevel(null), 0);
  assert.equal(roadLevel({ kind: 'ruine', tags: ['stufe-3'] }), 0);
  assert.equal(roadLevel({ kind: 'weg' }), 1);
  assert.equal(roadLevel({ kind: 'weg', tags: ['weg'] }), 1);
  assert.equal(roadLevel(roadFeature('w', 2)), 2);
  assert.equal(roadLevel(roadFeature('w', 3)), 3);
  assert.equal(roadLevel({ kind: 'weg', tags: ['stufe-1', 'stufe-3', 'stufe-2'] }), 3);
  assert.equal(roadLevel({ kind: 'weg', tags: ['stufe-9'] }), RULES.maxRoadLevel);
  assert.equal(roadLevel({ kind: 'weg', tags: ['stufe-0', 'stufe-x'] }), 1);
});

test('stepCost without a road is twice the terrain move cost in half steps', () => {
  const { state, world } = setup();
  const expected = { wiese: 2, heide: 2, alm: 2, wald: 4, bergwald: 4, gebirge: 6, moor: 6 };
  for (const [terrain, cost] of Object.entries(expected)) {
    const k = tileKeyOf(terrain, world);
    assert.equal(stepCost(state, world, tileOf(world, k)), cost, terrain);
  }
});

test('stepCost on impassable terrain is Infinity, with or without a road', () => {
  const { state, world } = setup();
  for (const terrain of ['see', 'gipfel']) {
    const k = tileKeyOf(terrain, world);
    assert.equal(stepCost(state, world, tileOf(world, k)), Infinity, terrain);
    state.map.features[k] = roadFeature('weg-x', 3);
    assert.equal(stepCost(state, world, tileOf(world, k)), Infinity, `${terrain} with road`);
  }
});

test('stepCost with a road takes 2 per level off, never below 1', () => {
  const { state, world } = setup();
  const table = {
    wiese: [1, 1, 1], alm: [1, 1, 1], wald: [2, 1, 1], gebirge: [4, 2, 1], moor: [4, 2, 1],
  };
  for (const [terrain, byLevel] of Object.entries(table)) {
    const k = tileKeyOf(terrain, world);
    byLevel.forEach((cost, i) => {
      state.map.features[k] = roadFeature('weg-t', i + 1);
      assert.equal(stepCost(state, world, tileOf(world, k)), cost, `${terrain} level ${i + 1}`);
    });
  }
});

test('stepCost ignores features that are not roads', () => {
  const { state, world } = setup();
  const k = tileKeyOf('wald', world);
  state.map.features[k] = { id: 'ruine-a', kind: 'ruine', name: 'Ruine', tags: ['stufe-3'], resources: [], since: 0, source: 'kernel' };
  assert.equal(stepCost(state, world, tileOf(world, k)), 4);
});

test('costFn applies the road-aware cost and lets blocked() close tiles, passing the region id', () => {
  const { state, world } = setup();
  const k = tileKeyOf('wald', world);
  const t = tileAt(world, ...Object.values(parseKey(k)));
  assert.equal(costFn(state, world)(t), 4);
  const seen = [];
  const blocked = (tile, region) => { seen.push([key(tile.q, tile.r), region]); return key(tile.q, tile.r) === k; };
  assert.equal(costFn(state, world, { blocked })(t), Infinity);
  assert.equal(seen[0][0], k);
  assert.equal(seen[0][1], regionAt(world, k));
  const other = tileOf(world, HOME);
  assert.equal(costFn(state, world, { blocked })(other), 2);
});

test('moveBudget is mobility times movePointsPerMobility full steps, in half steps, and never negative', () => {
  assert.equal(moveBudget(1), 1 * RULES.movePointsPerMobility * 2);
  assert.equal(moveBudget(3), 3 * RULES.movePointsPerMobility * 2);
  assert.equal(moveBudget(0), 0);
  assert.equal(moveBudget(-2), 0);
});

test('reach: a neighbour costs exactly its step cost, impassable neighbours are absent, budget bounds every value', () => {
  const { state, world } = setup();
  const r = reach(state, world, HOME, 8);
  assert.equal(r[HOME], 0);
  const [q, rr] = [0, 1];
  for (const n of neighbors(q, rr)) {
    const k = key(n.q, n.r);
    const cost = stepCost(state, world, tileAt(world, n.q, n.r));
    if (Number.isFinite(cost) && cost <= 8) assert.equal(r[k], cost, k);
    else assert.equal(Object.hasOwn(r, k), false, k);
  }
  for (const [, c] of Object.entries(r)) assert.ok(c <= 8);
  assert.deepEqual(reach(state, world, HOME, 0), { [HOME]: 0 });
});

test('reach is road-aware: a road on neighbouring tiles lowers their cost and widens the reach', () => {
  const { state, world } = setup();
  const budget = 4;
  const before = reach(state, world, HOME, budget);
  const heavy = neighbors(0, 1).map((n) => key(n.q, n.r)).filter((k) => stepCost(state, world, tileOf(world, k)) === 6);
  assert.ok(heavy.length > 0, 'home has mountain neighbours');
  for (const k of heavy) assert.equal(Object.hasOwn(before, k), false, 'a cost-6 tile is beyond budget 4');
  for (const k of heavy) state.map.features[k] = roadFeature('weg-m', 3);
  const after = reach(state, world, HOME, budget);
  for (const k of heavy) assert.equal(after[k], 1, k);
  assert.ok(Object.keys(after).length > Object.keys(before).length);
});

test('reach honours blocked tiles', () => {
  const { state, world } = setup();
  const target = neighbors(0, 1).map((n) => key(n.q, n.r)).find((k) => Number.isFinite(stepCost(state, world, tileOf(world, k))));
  const open = reach(state, world, HOME, 6);
  assert.ok(Object.hasOwn(open, target));
  const shut = reach(state, world, HOME, 6, { blocked: (tile) => key(tile.q, tile.r) === target });
  assert.equal(Object.hasOwn(shut, target), false);
});

test('route: from a tile to itself is a path of one tile at cost 0', () => {
  const { state, world } = setup();
  assert.deepEqual(route(state, world, HOME, HOME), { path: [HOME], cost: 0 });
});

test('route: the path runs from start to target over adjacent tiles and its cost is the sum of the step costs', () => {
  const { state, world } = setup();
  const to = '4,1';
  const r = route(state, world, HOME, to);
  assert.ok(r);
  assert.equal(r.path[0], HOME);
  assert.equal(r.path.at(-1), to);
  let sum = 0;
  for (let i = 1; i < r.path.length; i++) {
    assert.equal(distance(parseKey(r.path[i - 1]), parseKey(r.path[i])), 1);
    sum += stepCost(state, world, tileOf(world, r.path[i]));
  }
  assert.equal(r.cost, sum);
  assert.ok(r.cost >= distance(parseKey(HOME), parseKey(to)));
});

test('route is road-aware: a level 3 road along the way makes it cheaper and cost one half step per tile', () => {
  const { state, world } = setup();
  const to = '4,1';
  const plain = route(state, world, HOME, to);
  for (const k of plain.path.slice(1)) {
    if (stepCost(state, world, tileOf(world, k)) < Infinity) state.map.features[k] = roadFeature(`weg-${k.replace(/[^0-9]/g, '')}`, 3);
  }
  const paved = route(state, world, HOME, to);
  assert.ok(paved.cost < plain.cost, `${paved.cost} < ${plain.cost}`);
  assert.ok(paved.cost <= plain.path.length - 1);
  assert.ok(paved.cost >= distance(parseKey(HOME), parseKey(to)));
});

test('route to impassable terrain, over blocked tiles or beyond maxRadius is null', () => {
  const { state, world } = setup();
  assert.equal(route(state, world, HOME, tileKeyOf('gipfel', world)), null);
  assert.equal(route(state, world, HOME, tileKeyOf('see', world)), null);
  assert.equal(route(state, world, HOME, '4,1', { blocked: (tile) => key(tile.q, tile.r) === '4,1' }), null);
  assert.equal(route(state, world, HOME, '40,1', { maxRadius: 5 }), null);
});

test('regionAt and tileOf resolve tile keys', () => {
  const { state, world } = setup();
  assert.equal(regionAt(world, HOME), '-1:0:0');
  assert.equal(regionAt(world, HOME), state.map.settlements.find((s) => s.people === P).regionId);
  assert.equal(tileOf(world, HOME).terrain, 'alm');
  assert.equal(tileOf(world, '0,1').q, 0);
});

test('visionUpdate fades old sight, reveals settlements and units, and does not mutate the state', () => {
  const { state, world } = setup();
  state.map.known[P]['30,30'] = 'visible';
  state.peoples[P].units.push({ id: 'u-1', type: 'speerwall@1', strength: 3, tile: '8,1', state: 'ready', since: 0 });
  const frozen = JSON.stringify(state.map.known[P]);
  const known = visionUpdate(state, world, P);
  assert.equal(JSON.stringify(state.map.known[P]), frozen);
  assert.equal(known['30,30'], 'seen');
  assert.equal(known[HOME], 'visible');
  assert.equal(known['8,1'], 'visible');
  assert.equal(known['2,1'] !== undefined, true);
  for (const k of ['0,1', '8,1']) assert.equal(known[k], 'visible', k);
  assert.ok(Object.values(known).every((v) => v === 'visible' || v === 'seen'));
});

test('visionUpdate: an old visible tile out of sight becomes seen, a sight bonus widens the disc', () => {
  const { state, world } = setup();
  const plain = visionUpdate(state, world, P);
  const bonus = visionUpdate(state, world, P, 1);
  const visible = (m) => Object.values(m).filter((v) => v === 'visible').length;
  assert.ok(visible(bonus) > visible(plain));
  for (const k of Object.keys(plain)) assert.ok(Object.hasOwn(bonus, k));
  const far = clone(state);
  far.map.settlements.find((s) => s.people === P).tile = '12,-8';
  const moved = visionUpdate(far, world, P);
  assert.equal(moved[HOME], 'seen');
  assert.equal(moved['12,-8'], 'visible');
});

test('visionUpdate for a people without a known map or units starts from its settlements', () => {
  const { state, world } = setup();
  delete state.map.known[P];
  state.peoples[P].units = [];
  const known = visionUpdate(state, world, P);
  assert.equal(known[HOME], 'visible');
});

test('knownRegions lists the regions of known tiles, sorted and unique', () => {
  const { state, world } = setup();
  const regions = knownRegions(state, world, P);
  assert.deepEqual(regions, [...new Set(regions)].sort());
  assert.ok(regions.includes('-1:0:0'));
  state.map.known[P]['9,-6'] = 'seen';
  assert.ok(knownRegions(state, world, P).includes(regionAt(world, '9,-6')));
  assert.deepEqual(knownRegions(state, world, 'niemand'), []);
});

const visibleTile = (state) => Object.keys(state.map.known[P]).find((k) => state.map.known[P][k] === 'visible' && k !== HOME);

test('threatLayer marks a visible foreign unit with level 2, the tiles it can reach with level 1, and lists the source', () => {
  const { state, world } = setup();
  const at = visibleTile(state);
  state.peoples.esk.units.push({ id: 'u-1', type: 'speerwall@1', strength: 3, tile: at, state: 'ready', since: 0 });
  const layer = threatLayer(state, world, P, () => 2);
  assert.deepEqual(layer.sources, [{ kind: 'unit', people: 'esk', unit: 'u-1', tile: at, hostile: false }]);
  assert.equal(layer.tiles[at], 2);
  assert.ok(Object.values(layer.tiles).includes(1));
  const known = state.map.known[P];
  for (const k of Object.keys(layer.tiles)) assert.ok(Object.hasOwn(known, k), `${k} is known`);
  const reachable = reach(state, world, at, moveBudget(2));
  for (const [k, level] of Object.entries(layer.tiles)) if (k !== at) assert.ok(Object.hasOwn(reachable, k) && level === 1);
});

test('threatLayer: hostile follows the war flag, mobility from unitMobility(people, unit), zero mobility keeps only its tile', () => {
  const { state, world } = setup();
  const at = visibleTile(state);
  state.peoples.glutreiter.units.push({ id: 'u-1', type: 'reiterschar@1', strength: 2, tile: at, state: 'ready', since: 0 });
  state.relations['glutreiter|hochweide'].atWar = true;
  const calls = [];
  const layer = threatLayer(state, world, P, (people, unit) => { calls.push([people, unit.id]); return 0; });
  assert.equal(layer.sources[0].hostile, true);
  assert.deepEqual(layer.tiles, { [at]: 2 });
  assert.deepEqual(calls, [['glutreiter', 'u-1']]);
});

test('threatLayer ignores own units, units on tiles that are not currently visible, and unknown ones', () => {
  const { state, world } = setup();
  const at = visibleTile(state);
  state.peoples[P].units.push({ id: 'u-1', type: 'speerwall@1', strength: 3, tile: at, state: 'ready', since: 0 });
  state.peoples.esk.units.push({ id: 'u-2', type: 'speerwall@1', strength: 3, tile: '30,30', state: 'ready', since: 0 });
  state.map.known[P]['31,30'] = 'seen';
  state.peoples.esk.units.push({ id: 'u-3', type: 'speerwall@1', strength: 3, tile: '31,30', state: 'ready', since: 0 });
  assert.deepEqual(threatLayer(state, world, P), { tiles: {}, sources: [] });
});

test('threatLayer marks known danger features with level 2 and never lowers a level', () => {
  const { state, world } = setup();
  const at = visibleTile(state);
  const danger = (id) => ({ id, kind: 'hoehle', name: 'Hoehle', tags: [RULES.dangerTag], resources: [], since: 0, source: 'kernel' });
  state.map.features[at] = danger('hoehle-a');
  state.map.features['30,30'] = danger('hoehle-b');
  state.map.features['1,0'] = { ...danger('quelle-a'), tags: ['wasser'] };
  const layer = threatLayer(state, world, P);
  assert.deepEqual(layer.sources, [{ kind: 'feature', feature: 'hoehle-a', tile: at }]);
  assert.equal(layer.tiles[at], 2);
  state.peoples.esk.units.push({ id: 'u-1', type: 'speerwall@1', strength: 3, tile: HOME, state: 'ready', since: 0 });
  state.map.known[P][HOME] = 'visible';
  const both = threatLayer(state, world, P, () => 3);
  assert.equal(both.tiles[at], 2, 'danger stays 2 although a unit can reach it');
  assert.equal(both.tiles[HOME], 2);
});

test('roadLayer lists known road tiles with their level, sorted by key; other features and unknown tiles stay out', () => {
  const { state } = setup();
  state.map.features['1,1'] = roadFeature('weg-b', 2);
  state.map.features['0,2'] = roadFeature('weg-a', 1);
  state.map.features['1,0'] = { id: 'x-1', kind: 'ruine', name: 'Ruine', tags: [], resources: [], since: 0, source: 'kernel' };
  state.map.features['30,30'] = roadFeature('weg-far', 1);
  assert.deepEqual(roadLayer(state, P), [{ tile: '0,2', level: 1 }, { tile: '1,1', level: 2 }]);
  assert.deepEqual(roadLayer(state, 'niemand'), []);
});

test('threatLayer: a road on an unseen tile does not change the reach shown', () => {
  const { state, world } = setup();
  const at = visibleTile(state);
  state.peoples.esk.units.push({ id: 'u-1', type: 'speerwall@1', strength: 3, tile: at, state: 'ready', since: 0 });
  const before = threatLayer(state, world, P, () => 2);
  const unknownRoads = Object.keys(reach(state, world, at, moveBudget(2))).filter((k) => !Object.hasOwn(state.map.known[P], k));
  assert.ok(unknownRoads.length > 0, 'the unit could reach tiles the people does not know');
  for (const k of unknownRoads) state.map.features[k] = roadFeature(`weg-${k}`.replace(/[^a-z0-9-]/g, 'x'), 3);
  assert.deepEqual(threatLayer(state, world, P, () => 2), before);
});

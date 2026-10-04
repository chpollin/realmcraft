// Derived values (engine/core/derive.js): stats, per-people derived record
// and the map layers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDerived, mapLayers } from '../../../engine/core/derive.js';
import { statsOf } from '../../../engine/core/stats.js';
import { createCampaign, open, stateHash } from '../../../engine/core/turn.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { validate } from '../../../engine/content/schema.js';
import { PID, realEnv, setup, status, unit } from '../../fixtures/engine/k1/economy.js';

const hw = (s) => s.peoples[PID];
const mod = (stat, amount) => ({ op: 'stat.mod', stat, amount });

test('statsOf is base plus stat.mod effects of the standing set, held to -2..3', () => {
  const { env, state } = setup();
  assert.deepEqual(statsOf(state, env, PID), { verteidigung: 0, mobilitaet: 1, wohlstand: 0 }, 'wanderhirten carry mobility +1');
  assert.equal(statsOf(state, env, 'esk').mobilitaet, -1, 'talbauern pay mobility -1');
  hw(state).statuses.push(status('t-up', mod('wohlstand', 2), mod('wohlstand', 2)), status('t-down', mod('verteidigung', -2), mod('verteidigung', -2)));
  const stats = statsOf(state, env, PID);
  assert.equal(stats.wohlstand, 3);
  assert.equal(stats.verteidigung, -2);
  assert.equal(stats.mobilitaet, 1);
});

test('a status that has run out no longer counts for stats', () => {
  const { env, state } = setup({ turn: 3 });
  hw(state).statuses.push({ id: 't-old', effects: [mod('wohlstand', 2)], until: 2, endsOn: null });
  assert.equal(statsOf(state, env, PID).wohlstand, 0);
});

test('computeDerived describes every people: stats, caps, capacity, forecast, slots, modules, catalogue', () => {
  const { env, state } = setup();
  const derived = computeDerived(state, env);
  assert.deepEqual(Object.keys(derived).sort(), ['esk', 'glutreiter', 'hochweide']);
  for (const [pid, d] of Object.entries(derived)) {
    assert.deepEqual(Object.keys(d.caps).sort(), [...env.resourceIds].sort(), pid);
    for (const n of Object.values(d.caps)) assert.ok(Number.isInteger(n) && n >= 0 && n <= 9999, pid);
    assert.deepEqual(d.stats, statsOf(state, env, pid));
    assert.ok(Number.isInteger(d.popCap) && d.popCap >= 1);
    assert.deepEqual(Object.keys(d.forecast).sort(), ['income', 'net', 'shortfall']);
    assert.deepEqual(d.slots, { main: 1, minor: 2 });
    assert.ok(d.modules.includes('lebensweise'));
    assert.ok(d.catalogue.includes('explore') && d.catalogue.every((t) => typeof t === 'string'));
  }
  assert.equal(derived[PID].caps.nahrung, 30);
  assert.equal(derived[PID].popCap, 6);
  assert.equal(derived.esk.popCap, 8);
  assert.ok(derived[PID].catalogue.includes('migrate'), 'a camp can migrate');
  assert.ok(!derived.esk.catalogue.includes('migrate'));
});

test('computeDerived is pure and a pure function of the state', () => {
  const { env, state } = setup();
  const hash = stateHash(state);
  const a = computeDerived(state, env);
  assert.equal(stateHash(state), hash);
  assert.deepEqual(computeDerived(structuredClone(state), env), a);
});

test('a people without a settlement keeps stats and caps but no forecast or orders', () => {
  const { env, state } = setup();
  state.map.settlements = state.map.settlements.filter((s) => s.people !== 'glutreiter');
  const d = computeDerived(state, env).glutreiter;
  assert.equal(d.caps.nahrung, 30);
  assert.equal(d.popCap, 1);
  assert.deepEqual(d.forecast, { income: {}, net: {}, shortfall: {} });
  assert.deepEqual(d.catalogue, []);
  assert.deepEqual(d.modules, []);
});

test('the derived record follows the standing set: stock.cap and population.cap', () => {
  const { env, state } = setup();
  hw(state).statuses.push(status('t-x', { op: 'stock.cap', res: 'nahrung', amount: 4 }, { op: 'population.cap', amount: 1 }));
  const d = computeDerived(state, env)[PID];
  assert.equal(d.caps.nahrung, 34);
  assert.equal(d.popCap, 7);
});

test('the opened campaign carries derived data that validates against the campaign schema', () => {
  const { state } = setup();
  assert.ok(state.derived[PID].caps);
  assert.deepEqual(validate(SCHEMAS.campaign, state), []);
});

test('the real Hochland package derives for every people', () => {
  const env = realEnv();
  const { state } = createCampaign(env, { id: 'real-1', seed: 7 });
  const opened = open(state, env).state;
  const derived = computeDerived(opened, env);
  assert.deepEqual(Object.keys(derived).sort(), Object.keys(opened.peoples).sort());
  for (const d of Object.values(derived)) {
    assert.deepEqual(Object.keys(d.caps).sort(), [...env.resourceIds].sort());
    for (const s of env.regeln.stats) assert.ok(d.stats[s.id] >= -2 && d.stats[s.id] <= 3);
  }
  assert.deepEqual(validate(SCHEMAS.campaign, opened), []);
});

test('mapLayers: control of the regions a people knows, by owner', () => {
  const { env, state } = setup();
  const { control } = mapLayers(state, env, PID);
  assert.equal(control['-1:0:0'], PID);
  assert.equal(control['0:-1:1'], 'esk', 'its region lies in sight');
  assert.ok(!('-1:-1:0' in control), 'the region of glutreiter is unknown');
  state.map.control['0:-1:1'] = null;
  assert.ok(!('0:-1:1' in mapLayers(state, env, PID).control), 'uncontrolled regions are left out');
});

test('mapLayers: roads the people knows, with their level', () => {
  const { env, state } = setup();
  const road = (tags) => ({ id: 'weg-x', kind: 'weg', name: 'Weg', tags, resources: [], since: 0, source: 'kernel' });
  state.map.features['0,1'] = road(['weg', 'stufe-2']);
  state.map.features['40,40'] = road(['weg']); // unknown tile
  assert.deepEqual(mapLayers(state, env, PID).roads, [{ tile: '0,1', level: 2 }]);
});

test('mapLayers: threat from a foreign unit on a visible tile, and an empty trade layer while handel is inactive', () => {
  const { env, state } = setup();
  state.map.known[PID]['1,1'] = 'visible';
  state.peoples.esk.units = [{ ...unit('u-1', 'reiterschar@1'), tile: '1,1' }];
  const layers = mapLayers(state, env, PID);
  assert.equal(layers.threat.tiles['1,1'], 2);
  assert.ok(layers.threat.sources.some((s) => s.kind === 'unit' && s.people === 'esk' && s.tile === '1,1'));
  assert.deepEqual(layers.trade, []);
  assert.deepEqual(mapLayers(setup().state, env, PID).threat.sources, []);
});

test('fog: threat reach uses the unit type of a foreign unit, not the hidden modifiers of its owner', () => {
  const { env, state } = setup();
  state.map.known[PID]['1,1'] = 'visible';
  state.peoples.esk.units = [{ ...unit('u-1', 'reiterschar@1'), tile: '1,1' }];
  const plain = mapLayers(state, env, PID).threat;
  assert.ok(Object.keys(plain.tiles).length > 1, 'the unit reaches known tiles beyond its own');
  hw(state).statuses.push(status('t-slow', { op: 'unit.mod', unitTags: ['reiter'], stat: 'mobility', amount: -2 }));
  state.peoples.esk.statuses.push(status('t-slow', { op: 'unit.mod', unitTags: ['reiter'], stat: 'mobility', amount: -2 }));
  assert.deepEqual(mapLayers(state, env, PID).threat, plain);
});

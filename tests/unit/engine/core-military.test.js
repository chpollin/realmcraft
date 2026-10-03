// Military rules: unit stats, the battle calculation and its outcomes, war,
// raids, losses, and the season step (unit states, control by presence).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../../../engine/core/rules.js';
import {
  battleSpec, distributeLoss, lossesFor, moveUnit, raidSpec, ratioStep, resolveBattle, resolveMilitary, resolveRaid, unitStats,
} from '../../../engine/core/military.js';
import { standingOf } from '../../../engine/core/effects.js';
import { relKey } from '../../../engine/core/state.js';
import { addStatus, ctx, outcome, scenario, settlementAt, unit } from '../../fixtures/engine/k1/military.js';

const order = (tile = '0,0', units = ['u-1', 'u-2']) => ({ id: 'o1', type: 'attack', params: { units, tile } });
const strengths = (state, pid) => Object.fromEntries(state.peoples[pid].units.map((u) => [u.id, u.strength]));
const warBetween = (state, a, b) => { state.relations[relKey(a, b)].atWar = true; };

// Two attackers on the camp tile (speerwall 3, reiterschar 2) against esk units on 0,0 (gebirge).
function battle({ defenders = [3, 3], war = true, standing = 2 } = {}) {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '0,1'), unit('u-2', 'reiterschar@1', '0,1')];
  state.peoples.esk.units = defenders.map((s, i) => unit(`e-${i + 1}`, 'speerwall@1', '0,0', { strength: s }));
  state.peoples.hochweide.standing = standing;
  if (war) warBetween(state, 'hochweide', 'esk');
  const c = ctx(state, env);
  const spec = battleSpec(c.ox, ['u-1', 'u-2'], '0,0');
  return { env, state, ...c, spec };
}

test('unitStats: spec values, unit.mod by tag, clamps, upkeep floor', () => {
  const { env, state } = scenario();
  const spear = unit('u-1', 'speerwall@1', '0,1');
  const rider = unit('u-2', 'reiterschar@1', '0,1');
  assert.deepEqual(unitStats(state, env, 'hochweide', spear), { strength: 3, mobility: 1, upkeep: { nahrung: 1 }, tags: ['fuss'] });
  const plain = standingOf(state, env, 'hochweide');
  addStatus(state, 'hochweide', 'drill', [
    { op: 'unit.mod', unitTags: ['fuss'], stat: 'strength', amount: 2 },
    { op: 'unit.mod', unitTags: ['reiter'], stat: 'mobility', amount: -2 },
    { op: 'unit.mod', unitTags: ['fuss'], stat: 'upkeep', amount: -2 },
  ]);
  const s = unitStats(state, env, 'hochweide', spear);
  assert.equal(s.strength, 5);
  assert.deepEqual(s.upkeep, { nahrung: 0 });
  const r = unitStats(state, env, 'hochweide', rider);
  assert.equal(r.strength, 2, 'a tag outside unitTags is not modified');
  assert.equal(r.mobility, 1);
  assert.deepEqual(r.upkeep, { nahrung: 1 });
  assert.equal(spear.strength, 3, 'the stored strength stays');
  assert.equal(unitStats(state, env, 'hochweide', { ...spear, strength: 9 }).strength, 9, 'clamped to 9');
  assert.equal(unitStats(state, env, 'hochweide', rider, plain).mobility, 3, 'a standing set can be passed in');
  state.peoples.hochweide.statuses[0].effects[0].amount = -2;
  assert.equal(unitStats(state, env, 'hochweide', { ...spear, strength: 1 }).strength, 0, 'clamped to 0');
});

test('ratioStep boundaries', () => {
  const cases = [
    [6, 3, -2], [7, 3, -2], [5, 3, -1], [3, 2, -1], [3, 3, 0], [4, 3, 0], [5, 4, 0], [8, 4, -2], [3, 4, 0],
    [2, 3, 1], [4, 6, 1], [3, 6, 2], [1, 3, 2], [0, 3, 2], [1, 0, -2], [0, 0, -2],
  ];
  for (const [a, d, step] of cases) assert.equal(ratioStep(a, d), step, `A ${a} against D ${d}`);
});

test('battleSpec: ratio step and terrain bonus give the target, A and D are effective sums', () => {
  const { spec } = battle({ defenders: [3, 3] });
  assert.equal(spec.error, null);
  assert.equal(spec.A, 5);
  assert.equal(spec.D, 6);
  assert.equal(spec.step, 0);
  assert.equal(spec.terrain, 'gebirge');
  assert.equal(spec.target, 5 + 0 + RULES.terrainDefense.gebirge);
  assert.deepEqual(spec.defenders, [{ people: 'esk', unitId: 'e-1' }, { people: 'esk', unitId: 'e-2' }]);

  const weak = battle({ defenders: [1] }).spec;
  assert.equal(weak.step, -2, 'A 5 >= 2D');
  assert.equal(weak.target, 5 - 2 + 2);
  assert.equal(battle({ defenders: [7, 1] }).spec.step, 1, '3A = 15 <= 2D = 16 and 2A = 10 > D = 8');
  assert.equal(battle({ defenders: [9, 9, 9] }).spec.step, 2, '2A = 10 <= D = 27');
});

test('battleSpec: the terrain bonus follows the tile defended', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '0,1')];
  state.peoples.esk.units = [unit('e-1', 'speerwall@1', '0,0'), unit('e-2', 'speerwall@1', '0,2')];
  const { ox } = ctx(state, env);
  assert.equal(battleSpec(ox, ['u-1'], '0,0').target, 5 + 0 + 2);
  assert.equal(battleSpec(ox, ['u-1'], '0,2').target, 5 + 0 + 0);
});

test('battleSpec: attackers must be own, ready and adjacent; the tile must be in sight and hold foreigners', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [
    unit('u-1', 'speerwall@1', '0,1'), unit('u-2', 'speerwall@1', '0,1', { state: 'routed' }),
    unit('u-3', 'speerwall@1', '-1,2'), unit('u-4', 'speerwall@1', '0,2'),
  ];
  state.peoples.esk.units = [unit('e-1', 'speerwall@1', '0,0')];
  const { ox } = ctx(state, env);
  const spec = battleSpec(ox, ['u-1', 'u-2', 'u-3', 'u-9', 'u-1'], '0,0');
  assert.deepEqual(spec.attackers.map((a) => a.unit.id), ['u-1']);
  assert.deepEqual(spec.invalid.map((i) => i.id).sort(), ['u-2', 'u-3', 'u-9']);
  assert.equal(battleSpec(ox, ['u-1'], '0,2').error, 'no foreign unit or settlement stands on the tile');
  assert.equal(battleSpec(ox, [], '0,0').error, 'no unit named');
  state.map.known.hochweide['0,0'] = 'seen';
  assert.equal(battleSpec(ctx(state, env).ox, ['u-1'], '0,0').error, 'the tile is not in sight');
});

test('battleSpec: the defender is the settlement owner, else the owner of the strongest unit; garrison by kind', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '0,1')];
  settlementAt(state, 'esk').tile = '1,1';
  state.peoples.esk.units = [unit('e-1', 'speerwall@1', '1,1', { strength: 1 })];
  state.peoples.glutreiter.units = [unit('g-1', 'speerwall@1', '1,1', { strength: 4 })];
  let spec = battleSpec(ctx(state, env).ox, ['u-1'], '1,1');
  assert.equal(spec.defender, 'esk', 'the settlement owner defends although a stronger foreign unit stands there');
  assert.deepEqual(spec.defenders, [{ people: 'esk', unitId: 'e-1' }]);
  assert.equal(spec.garrison, RULES.garrison.dorf);
  assert.equal(spec.D, 1 + RULES.garrison.dorf);

  state.peoples.esk.units = [];
  spec = battleSpec(ctx(state, env).ox, ['u-1'], '1,1');
  assert.deepEqual(spec.defenders, [], 'a settlement alone has no unit but a garrison');
  assert.equal(spec.D, RULES.garrison.dorf);

  const s2 = scenario();
  s2.state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '0,1')];
  s2.state.peoples.esk.units = [unit('e-1', 'speerwall@1', '0,0', { strength: 2 })];
  s2.state.peoples.glutreiter.units = [unit('g-1', 'speerwall@1', '0,0', { strength: 3 })];
  const spec2 = battleSpec(ctx(s2.state, s2.env).ox, ['u-1'], '0,0');
  assert.equal(spec2.defender, 'glutreiter');
  assert.deepEqual(spec2.defenders, [{ people: 'glutreiter', unitId: 'g-1' }]);
  assert.equal(spec2.garrison, 0);

  const s3 = scenario();
  s3.state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '0,1')];
  settlementAt(s3.state, 'glutreiter').tile = '1,0';
  assert.equal(battleSpec(ctx(s3.state, s3.env).ox, ['u-1'], '1,0').garrison, RULES.garrison.lager);
});

test('battleSpec: stat verteidigung (settlement only) and probe.mod verteidigung (clamped to 2) become negative modifiers', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '0,1')];
  state.peoples.esk.units = [unit('e-1', 'speerwall@1', '1,1')];
  addStatus(state, 'esk', 'wall', [{ op: 'stat.mod', stat: 'verteidigung', amount: 1 }]);
  let spec = battleSpec(ctx(state, env).ox, ['u-1'], '1,1');
  assert.deepEqual(spec.extraMods, [], 'no settlement on the tile, no stat modifier');
  settlementAt(state, 'esk').tile = '1,1';
  spec = battleSpec(ctx(state, env).ox, ['u-1'], '1,1');
  assert.deepEqual(spec.extraMods, [{ source: 'defender:verteidigung', label: 'verteidigung', value: -1, dev: false }]);

  addStatus(state, 'esk', 'drill', [
    { op: 'probe.mod', tags: ['verteidigung'], amount: 2 },
    { op: 'probe.mod', tags: ['verteidigung', 'bau'], amount: 1 },
    { op: 'probe.mod', tags: ['handel'], amount: 2 },
  ]);
  spec = battleSpec(ctx(state, env).ox, ['u-1'], '1,1');
  assert.deepEqual(spec.extraMods.map((m) => [m.source, m.value, m.dev]), [['defender:verteidigung', -1, false], ['defender:probe', -2, false]]);
});

test('lossesFor: the band table', () => {
  assert.deepEqual(lossesFor('crit_success', 3), { defender: 5, attacker: 0, routed: false, standing: 0 });
  assert.deepEqual(lossesFor('crit_success', -2), { defender: 2, attacker: 0, routed: false, standing: 0 });
  assert.deepEqual(lossesFor('success', 2), { defender: 3, attacker: 1, routed: false, standing: 0 });
  assert.deepEqual(lossesFor('narrow', 0), { defender: 1, attacker: 2, routed: false, standing: 0 });
  assert.deepEqual(lossesFor('failure', -2), { defender: 0, attacker: 3, routed: true, standing: 0 });
  assert.deepEqual(lossesFor('setback', -5), { defender: 0, attacker: 7, routed: true, standing: -1 });
  assert.deepEqual(lossesFor('crit_fail', -1), { defender: 0, attacker: 3, routed: true, standing: -1 });
  assert.deepEqual(lossesFor('crit_fail', 3), { defender: 0, attacker: 2, routed: true, standing: -1 });
});

test('distributeLoss takes one point at a time from the strongest, ties by unit id', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [
    unit('u-1', 'speerwall@1', '0,1'), unit('u-2', 'speerwall@1', '0,1'), unit('u-10', 'speerwall@1', '0,1', { strength: 1 }),
  ];
  const { tc } = ctx(state, env);
  assert.equal(distributeLoss(tc, 'hochweide', ['u-10', 'u-2', 'u-1'], 3, 'test'), 3);
  assert.deepEqual(strengths(tc.state, 'hochweide'), { 'u-1': 1, 'u-2': 2, 'u-10': 1 });
  assert.equal(distributeLoss(tc, 'hochweide', ['u-1', 'u-2', 'u-10'], 10, 'test'), 4, 'only what is there is lost');
  assert.deepEqual(tc.state.peoples.hochweide.units, [], 'strength 0 dissolves the units');
  assert.ok(tc.log.some((e) => e.kind === 'unit.dissolved'));
});

test('distributeLoss ranks by effective strength, not by stored strength', () => {
  const { env, state } = scenario();
  addStatus(state, 'hochweide', 'drill', [{ op: 'unit.mod', unitTags: ['fuss'], stat: 'strength', amount: 2 }]);
  state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '0,1', { strength: 1 }), unit('u-2', 'reiterschar@1', '0,1', { strength: 2 })];
  const { tc } = ctx(state, env);
  distributeLoss(tc, 'hochweide', ['u-1', 'u-2'], 1, 'test');
  assert.deepEqual(strengths(tc.state, 'hochweide'), { 'u-2': 2 }, 'u-1 (1 + 2 = 3) was the strongest and fell');
});

const BANDS = [
  // band, margin, esk after (from 3, 3), hochweide after (from u-1 3, u-2 2), routed, standing delta
  ['crit_success', 2, { 'e-1': 1, 'e-2': 1 }, { 'u-1': 3, 'u-2': 2 }, false, 0],
  ['success', 1, { 'e-1': 2, 'e-2': 2 }, { 'u-1': 2, 'u-2': 2 }, false, 0],
  ['narrow', 0, { 'e-1': 2, 'e-2': 3 }, { 'u-1': 1, 'u-2': 2 }, false, 0],
  ['failure', -2, { 'e-1': 3, 'e-2': 3 }, { 'u-1': 1, 'u-2': 1 }, true, 0],
  ['setback', -4, { 'e-1': 3, 'e-2': 3 }, {}, true, -1],
  ['crit_fail', 3, { 'e-1': 3, 'e-2': 3 }, { 'u-1': 1, 'u-2': 2 }, true, -1],
];
for (const [band, margin, def, att, routed, standing] of BANDS) {
  test(`resolveBattle ${band} (margin ${margin}): losses, rout and standing`, () => {
    const b = battle();
    resolveBattle(b.tc, b.ox, order(), outcome(band, margin), b.spec);
    assert.deepEqual(strengths(b.tc.state, 'esk'), def);
    assert.deepEqual(strengths(b.tc.state, 'hochweide'), att);
    for (const u of b.tc.state.peoples.hochweide.units) {
      assert.equal(u.state, routed ? 'routed' : 'ready');
      assert.equal(u.tile, '0,1', 'no capture while defenders stand');
    }
    assert.equal(b.tc.state.peoples.hochweide.standing, 2 + standing);
    assert.equal(b.tc.scratch.routed?.size ?? 0, routed ? Object.keys(att).length : 0);
  });
}

test('resolveBattle: a successful attack that clears the tile moves the survivors in', () => {
  const b = battle({ defenders: [1] });
  resolveBattle(b.tc, b.ox, order(), outcome('success', 1), b.spec);
  assert.deepEqual(b.tc.state.peoples.esk.units, []);
  assert.ok(b.tc.state.peoples.hochweide.units.length > 0);
  for (const u of b.tc.state.peoples.hochweide.units) {
    assert.equal(u.tile, '0,0');
    assert.equal(u.state, 'moved');
  }
  assert.ok(b.tc.log.some((e) => e.kind === 'unit.move'));
});

test('resolveBattle: a failed attack never moves in', () => {
  const b = battle({ defenders: [1] });
  resolveBattle(b.tc, b.ox, order(), outcome('failure', -1), b.spec);
  assert.ok(b.tc.state.peoples.hochweide.units.every((u) => u.tile === '0,1'));
});

test('resolveBattle: a village changes its people and the region follows', () => {
  const b = battle({ defenders: [] });
  const village = settlementAt(b.state, 'esk');
  village.tile = '1,1';
  const c = ctx(b.state, b.env);
  const spec = battleSpec(c.ox, ['u-1', 'u-2'], '1,1');
  assert.equal(spec.defender, 'esk');
  resolveBattle(c.tc, c.ox, order('1,1'), outcome('narrow', 0), spec);
  const s = c.tc.state.map.settlements.find((x) => x.id === village.id);
  assert.equal(s.people, 'hochweide');
  assert.equal(c.tc.state.map.control[village.regionId], 'hochweide');
  assert.ok(c.tc.state.peoples.hochweide.units.every((u) => u.tile === '1,1'));
  assert.deepEqual(c.tc.log.find((e) => e.kind === 'settlement.captured').visibleTo, ['esk', 'hochweide']);
});

test('resolveBattle: a camp is removed, not taken', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '0,1')];
  const camp = settlementAt(state, 'glutreiter');
  camp.tile = '1,0';
  camp.regionId = '0:-1:1';
  warBetween(state, 'hochweide', 'glutreiter');
  const c = ctx(state, env);
  const spec = battleSpec(c.ox, ['u-1'], '1,0');
  assert.equal(spec.defender, 'glutreiter');
  resolveBattle(c.tc, c.ox, order('1,0', ['u-1']), outcome('success', 1), spec);
  assert.ok(!c.tc.state.map.settlements.some((s) => s.id === camp.id));
  assert.equal(c.tc.state.map.control['0:-1:1'], 'hochweide');
  assert.equal(c.tc.state.peoples.hochweide.units[0].tile, '1,0');
  assert.ok(c.tc.log.some((e) => e.kind === 'settlement.destroyed' && e.target.id === camp.id));
});

test('resolveBattle: a defender who holds on keeps the settlement', () => {
  const b = battle({ defenders: [9] });
  const village = settlementAt(b.state, 'esk');
  village.tile = '0,0';
  const c = ctx(b.state, b.env);
  const spec = battleSpec(c.ox, ['u-1', 'u-2'], '0,0');
  resolveBattle(c.tc, c.ox, order(), outcome('crit_success', 5), spec);
  assert.equal(c.tc.state.map.settlements.find((s) => s.id === village.id).people, 'esk');
});

test('resolveBattle: an attack without war declares it', () => {
  const b = battle({ war: false });
  resolveBattle(b.tc, b.ox, order(), outcome('narrow', 0), b.spec);
  const rel = b.tc.state.relations[relKey('hochweide', 'esk')];
  assert.equal(rel.atWar, true);
  assert.equal(rel.value, -2);
  assert.equal(rel.since, 0);
  assert.equal(b.tc.state.peoples.hochweide.standing, 1);
  assert.deepEqual(b.tc.hooks.filter((h) => h.hook === 'war').map((h) => h.people).sort(), ['esk', 'hochweide']);
  assert.deepEqual(b.tc.log.find((e) => e.kind === 'relation.war').visibleTo, ['esk', 'hochweide']);
});

test('resolveBattle: an attack in a war costs nothing extra, and every entry names both peoples', () => {
  const b = battle({ war: true });
  resolveBattle(b.tc, b.ox, order(), outcome('narrow', 0), b.spec);
  assert.equal(b.tc.state.peoples.hochweide.standing, 2);
  assert.ok(!b.tc.hooks.some((h) => h.hook === 'war'));
  assert.ok(b.tc.log.length > 1);
  for (const e of b.tc.log) assert.deepEqual(e.visibleTo, ['esk', 'hochweide'], e.kind);
});

test('resolveBattle: units that already acted this season are not used twice', () => {
  const b = battle({ defenders: [3, 3] });
  resolveBattle(b.tc, b.ox, order(), outcome('narrow', 0), b.spec);
  const before = JSON.stringify(b.tc.state);
  resolveBattle(b.tc, b.ox, order(), outcome('narrow', 0), b.spec);
  assert.equal(JSON.stringify(b.tc.state), before);
  assert.ok(b.tc.log.some((e) => e.kind === 'battle.skipped'));
});

test('sortie: the units attack from the settlement, A adds the garrison, nobody leaves or captures', () => {
  const { env, state } = scenario();
  const home = { id: 'x-village', name: 'Hochdorf', people: 'hochweide', kind: 'dorf', tile: '0,2', regionId: '-1:0:0', mobile: false, buildings: [] };
  state.map.settlements.push(home);
  state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '0,2'), unit('u-2', 'speerwall@1', '-1,2')];
  state.peoples.esk.units = [unit('e-1', 'speerwall@1', '0,3', { strength: 1 })];
  warBetween(state, 'hochweide', 'esk');
  const c = ctx(state, env);
  const spec = battleSpec(c.ox, [], '0,3', { from: home });
  assert.equal(spec.error, null);
  assert.deepEqual(spec.attackers.map((a) => a.unit.id), ['u-1']);
  assert.equal(spec.A, 3 + RULES.garrison.dorf);
  assert.equal(spec.sortie, true);
  resolveBattle(c.tc, c.ox, { id: 'o1', type: 'ausfall', params: { settlement: 'x-village', tile: '0,3' } }, outcome('success', 1), spec);
  assert.deepEqual(c.tc.state.peoples.esk.units, [], 'the defender falls');
  assert.equal(c.tc.state.peoples.hochweide.units.find((u) => u.id === 'u-1').tile, '0,2');
  assert.equal(battleSpec(c.ox, [], '2,1', { from: home }).error, 'the settlement does not border the tile');
});

test('moveUnit moves, marks moved and logs once with the people', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '0,1')];
  const { tc } = ctx(state, env);
  assert.equal(moveUnit(tc, 'hochweide', 'u-1', '0,2', 'test'), true);
  assert.equal(moveUnit(tc, 'hochweide', 'u-1', '0,2', 'test'), false);
  assert.equal(moveUnit(tc, 'hochweide', 'u-9', '0,2', 'test'), false);
  assert.deepEqual(tc.state.peoples.hochweide.units[0], { ...state.peoples.hochweide.units[0], tile: '0,2', state: 'moved' });
  assert.equal(tc.log.length, 1);
  assert.deepEqual(tc.log[0].change, { field: 'tile', before: '0,1', after: '0,2' });
  assert.deepEqual(tc.log[0].visibleTo, ['hochweide']);
});

function raid({ units = [3], defenders = [], victimCore = 4, stocks = {} } = {}) {
  const { env, state } = scenario();
  state.peoples.hochweide.units = units.map((s, i) => unit(`u-${i + 1}`, 'speerwall@1', '0,1', { strength: s }));
  state.peoples.esk.units = defenders.map((s, i) => unit(`e-${i + 1}`, 'speerwall@1', '2,1', { strength: s }));
  state.peoples.esk.population.core = victimCore;
  Object.assign(state.peoples.esk.resources, stocks);
  const c = ctx(state, env);
  const spec = raidSpec(c.ox, units.map((_, i) => `u-${i + 1}`), '0:-1:1');
  return { env, state, ...c, spec };
}
const raidOrder = { id: 'o1', type: 'raubzug', params: { units: ['u-1'], region: '0:-1:1' } };

test('raidSpec: units in or next to the region, D from the victim units there, target 5 + step', () => {
  let r = raid({ units: [3], defenders: [] });
  assert.equal(r.spec.error, null);
  assert.equal(r.spec.victim, 'esk');
  assert.equal(r.spec.D, 0);
  assert.equal(r.spec.target, 3, 'D 0 gives step -2');
  r = raid({ units: [3], defenders: [3, 3] });
  assert.equal(r.spec.D, 6);
  assert.equal(r.spec.target, 7, '2A = 6 <= D = 6 gives step +2');
  const far = scenario();
  far.state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '-1,2')];
  const { ox } = ctx(far.state, far.env);
  assert.deepEqual(raidSpec(ox, ['u-1'], '0:-1:1').invalid.map((i) => i.id), ['u-1']);
  assert.equal(raidSpec(ox, ['u-1'], '-1:0:0').error, 'the region is controlled by the raider');
  assert.equal(raidSpec(ox, ['u-1'], 'nowhere').error, 'no people controls that region');
});

test('resolveRaid success: loot from the largest stock, 1 + margin, ties by resource order', () => {
  const r = raid({ stocks: { nahrung: 4, material: 4, wissen: 0 } });
  const own = r.state.peoples.hochweide.resources.nahrung;
  resolveRaid(r.tc, r.ox, raidOrder, outcome('success', 2), r.spec);
  assert.equal(r.tc.state.peoples.esk.resources.nahrung, 1, 'nahrung precedes material in the resource order');
  assert.equal(r.tc.state.peoples.hochweide.resources.nahrung, own + 3);
  assert.equal(r.tc.state.peoples.esk.population.core, 4);
  assert.ok(r.tc.state.peoples.hochweide.units.every((u) => u.state === 'ready' && u.tile === '0,1'));
});

test('resolveRaid takes at least one and never more than the victim holds', () => {
  const stocks = { nahrung: 1, material: 0, wissen: 0, herden: 0, erz: 0 };
  const r = raid({ stocks });
  resolveRaid(r.tc, r.ox, raidOrder, outcome('narrow', 0), r.spec);
  assert.equal(r.tc.state.peoples.esk.resources.nahrung, 0);
  assert.equal(r.tc.state.peoples.hochweide.resources.nahrung, r.state.peoples.hochweide.resources.nahrung + 1);
  const r2 = raid({ stocks });
  resolveRaid(r2.tc, r2.ox, raidOrder, outcome('success', 3), r2.spec);
  assert.equal(r2.tc.state.peoples.hochweide.resources.nahrung, r2.state.peoples.hochweide.resources.nahrung + 1);
});

test('resolveRaid crit_success carries off a clan, never the last one of the victim', () => {
  const r = raid({ victimCore: 4 });
  resolveRaid(r.tc, r.ox, raidOrder, outcome('crit_success', 4), r.spec);
  assert.equal(r.tc.state.peoples.esk.population.core, 3);
  assert.equal(r.tc.state.peoples.hochweide.population.core, 4);
  const last = raid({ victimCore: 1 });
  resolveRaid(last.tc, last.ox, raidOrder, outcome('crit_success', 4), last.spec);
  assert.equal(last.tc.state.peoples.esk.population.core, 1);
  assert.equal(last.tc.state.peoples.hochweide.population.core, 3);
});

test('resolveRaid failure: the raiders lose 1 - margin strongest first and are routed; war is declared', () => {
  const r = raid({ units: [3, 3] });
  resolveRaid(r.tc, r.ox, { ...raidOrder, params: { units: ['u-1', 'u-2'], region: '0:-1:1' } }, outcome('failure', -2), r.spec);
  assert.deepEqual(strengths(r.tc.state, 'hochweide'), { 'u-1': 1, 'u-2': 2 });
  assert.ok(r.tc.state.peoples.hochweide.units.every((u) => u.state === 'routed'));
  assert.equal(r.tc.state.relations[relKey('hochweide', 'esk')].atWar, true);
  for (const e of r.tc.log) assert.deepEqual(e.visibleTo, ['esk', 'hochweide'], e.kind);
});

test('resolveMilitary: routed this turn stays routed, routed before recovers, moved and new units become ready', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [
    unit('u-1', 'speerwall@1', '0,1', { state: 'routed' }), unit('u-2', 'speerwall@1', '0,1'), unit('u-3', 'speerwall@1', '0,1'),
  ];
  state.peoples.esk.units = [unit('e-1', 'speerwall@1', '0,0', { strength: 3 })];
  warBetween(state, 'hochweide', 'esk');
  const { tc, ox } = ctx(state, env);
  resolveBattle(tc, ox, order('0,0', ['u-2']), outcome('failure', -1), battleSpec(ox, ['u-2'], '0,0'));
  moveUnit(tc, 'hochweide', 'u-3', '0,2', 'test');
  tc.state.peoples.hochweide.units.push({ id: 'u-4', type: 'speerwall@1', strength: 3, tile: '0,1', state: 'moved', since: 0 });
  resolveMilitary(tc);
  const states = Object.fromEntries(tc.state.peoples.hochweide.units.map((u) => [u.id, u.state]));
  assert.deepEqual(states, { 'u-1': 'ready', 'u-2': 'routed', 'u-3': 'ready', 'u-4': 'ready' });
  assert.ok(tc.log.some((e) => e.kind === 'unit.state' && e.target.id === 'u-1' && e.change.after === 'ready'));
});

// esk loses its controller and its village stands in another region, so presence decides in 0:-1:1.
function emptyRegion() {
  const sc = scenario();
  delete sc.state.map.control['0:-1:1'];
  settlementAt(sc.state, 'esk').regionId = '0:-1:9';
  return sc;
}

test('resolveMilitary: an empty region goes to the only people with units in it', () => {
  const { env, state } = emptyRegion();
  state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '1,1')];
  const { tc } = ctx(state, env);
  resolveMilitary(tc);
  assert.equal(tc.state.map.control['0:-1:1'], 'hochweide');
  assert.deepEqual(tc.log.find((e) => e.kind === 'map.control').visibleTo, ['hochweide']);
});

test('resolveMilitary: presence does not decide with two peoples, a controller or a settlement', () => {
  const two = emptyRegion();
  two.state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '1,1')];
  two.state.peoples.esk.units = [unit('e-1', 'speerwall@1', '1,0')];
  const a = ctx(two.state, two.env);
  resolveMilitary(a.tc);
  assert.equal(a.tc.state.map.control['0:-1:1'], undefined);

  const held = emptyRegion();
  held.state.map.control['0:-1:1'] = 'glutreiter';
  held.state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '1,1')];
  const b = ctx(held.state, held.env);
  resolveMilitary(b.tc);
  assert.equal(b.tc.state.map.control['0:-1:1'], 'glutreiter');

  const settled = scenario();
  delete settled.state.map.control['0:-1:1'];
  settled.state.peoples.glutreiter.units = [unit('g-1', 'speerwall@1', '1,1')];
  const c = ctx(settled.state, settled.env);
  resolveMilitary(c.tc);
  assert.equal(c.tc.state.map.control['0:-1:1'], undefined, 'the village of esk stands in that region');
});

test('resolveMilitary: units in the region of a people at peace cost the relation once per season and pair', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '1,1'), unit('u-2', 'speerwall@1', '1,0'), unit('u-3', 'speerwall@1', '0,1')];
  const { tc } = ctx(state, env);
  resolveMilitary(tc);
  assert.equal(tc.state.relations[relKey('hochweide', 'esk')].value, -1);
  assert.equal(tc.state.relations[relKey('hochweide', 'glutreiter')].value, 0);
  assert.equal(tc.log.filter((e) => e.kind === 'relation.trespass').length, 1);

  const war = scenario();
  war.state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '1,1')];
  warBetween(war.state, 'hochweide', 'esk');
  const w = ctx(war.state, war.env);
  resolveMilitary(w.tc);
  assert.equal(w.tc.state.relations[relKey('hochweide', 'esk')].value, 0);
});

test('specs carry machine keys beside their texts: errorReason and the reason and state of invalid entries', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [
    unit('u-1', 'speerwall@1', '0,1'), unit('u-2', 'speerwall@1', '0,1', { state: 'routed' }),
    unit('u-3', 'speerwall@1', '-1,2'), unit('u-5', 'speerwall@1', '0,1', { strength: 0 }),
  ];
  state.peoples.esk.units = [unit('e-1', 'speerwall@1', '0,0')];
  const { ox } = ctx(state, env);
  const spec = battleSpec(ox, ['u-1', 'u-2', 'u-3', 'u-9'], '0,0');
  assert.equal(spec.error, null);
  assert.equal(spec.errorReason, null);
  assert.deepEqual(spec.invalid, [
    { id: 'u-2', why: 'is routed and cannot attack', reason: 'unit-not-ready', state: 'routed' },
    { id: 'u-3', why: 'does not border the tile', reason: 'not-adjacent' },
    { id: 'u-9', why: 'is no unit of this people', reason: 'not-own-unit' },
  ]);
  const reasonOf = (s) => [s.error, s.errorReason];
  assert.deepEqual(reasonOf(battleSpec(ox, ['u-1'], '0,2')), ['no foreign unit or settlement stands on the tile', 'no-foreign-target']);
  assert.deepEqual(reasonOf(battleSpec(ox, [], '0,0')), ['no unit named', 'no-unit-named']);
  assert.deepEqual(reasonOf(battleSpec(ox, ['u-5'], '0,0')), ['the attack has no strength', 'no-strength']);
  const home = { id: 'x-village', name: 'Hochdorf', people: 'hochweide', kind: 'dorf', tile: '0,2', regionId: '-1:0:0', mobile: false, buildings: [] };
  assert.deepEqual(reasonOf(battleSpec(ox, [], '2,1', { from: home })), ['the settlement does not border the tile', 'not-adjacent']);
  state.map.known.hochweide['0,0'] = 'seen';
  assert.deepEqual(reasonOf(battleSpec(ctx(state, env).ox, ['u-1'], '0,0')), ['the tile is not in sight', 'not-in-sight']);

  const raidState = scenario();
  raidState.state.peoples.hochweide.units = [unit('u-1', 'speerwall@1', '-1,2'), unit('u-2', 'speerwall@1', '0,1', { state: 'moved' }), unit('u-3', 'speerwall@1', '0,1')];
  const raidOx = ctx(raidState.state, raidState.env).ox;
  assert.deepEqual(raidSpec(raidOx, ['u-1', 'u-2', 'u-9'], '0:-1:1').invalid, [
    { id: 'u-1', why: 'is neither in nor next to the region', reason: 'not-near-region' },
    { id: 'u-2', why: 'is moved and cannot raid', reason: 'unit-not-ready', state: 'moved' },
    { id: 'u-9', why: 'is no unit of this people', reason: 'not-own-unit' },
  ]);
  assert.deepEqual(reasonOf(raidSpec(raidOx, ['u-3'], '-1:0:0')), ['the region is controlled by the raider', 'own-region']);
  assert.deepEqual(reasonOf(raidSpec(raidOx, ['u-3'], 'nowhere')), ['no people controls that region', 'region-uncontrolled']);
  assert.deepEqual(reasonOf(raidSpec(raidOx, [], '0:-1:1')), ['no unit named', 'no-unit-named']);
});

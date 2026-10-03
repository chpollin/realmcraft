// Economy of a season (engine/core/economy.js): labour and harvest, flows,
// consumption, upkeep and suspension, famine, shortfall bookkeeping, growth,
// stock caps, loss of suspended developments, and the shared arithmetic of
// forecast and resolveEconomy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capStocks, forecast, loseSuspended, popCap, regionPotential, resolveEconomy, stockCaps } from '../../../engine/core/economy.js';
import { standingOf } from '../../../engine/core/effects.js';
import { createContext } from '../../../engine/core/log.js';
import { createCampaign, open } from '../../../engine/core/turn.js';
import { CONTENT, REGELN } from '../../fixtures/engine/k1/pack.js';
import { PID, SEASONS, ctxOf, known, realEnv, setDeposits, setup, status, unit } from '../../fixtures/engine/k1/economy.js';

const hw = (s) => s.peoples[PID];
const run = (state, env) => {
  const tc = ctxOf(state, env);
  resolveEconomy(tc);
  return tc;
};
// resolveEconomy runs for every people, so entries are narrowed to the one under test.
const kinds = (tc, kind, pid = PID) => tc.log.filter((e) => e.kind === kind && e.visibleTo.includes(pid));
const noWork = (state) => { hw(state).population.assigned = {}; };
const SETTLEMENT_TILE = '0,1';
const withContent = (edit) => {
  const content = structuredClone(CONTENT);
  edit(content);
  return { content };
};
const patchTuning = (tuning) => ({ regeln: { ...REGELN, tuning: { ...REGELN.tuning, ...tuning } } });

// --- caps and capacity -------------------------------------------------------

test('stockCaps adds stock.cap effects to the regeln cap and never goes below 0', () => {
  const { env, state } = setup();
  assert.equal(stockCaps(state, env, PID).nahrung, 30);
  hw(state).statuses.push(status('t-bonus', { op: 'stock.cap', res: 'nahrung', amount: 3 }, { op: 'stock.cap', res: 'salz', amount: -5 }));
  hw(state).statuses.push(status('t-more', { op: 'stock.cap', res: 'salz', amount: -5 }, { op: 'stock.cap', res: 'salz', amount: -5 }, { op: 'stock.cap', res: 'salz', amount: -5 }));
  const caps = stockCaps(state, env, PID);
  assert.equal(caps.nahrung, 33);
  assert.equal(caps.salz, 0);
  assert.equal(caps.wissen, 12);
});

test('popCap counts settlements by way of life, adds population.cap and is at least 1', () => {
  const { env, state } = setup();
  assert.equal(popCap(state, env, PID), 6, 'a camp holds six clans');
  assert.equal(popCap(state, env, 'esk'), 8, 'a village holds eight');
  hw(state).statuses.push(status('t-cap', { op: 'population.cap', amount: 2 }));
  assert.equal(popCap(state, env, PID), 8);
  hw(state).statuses = [status('t-cap', { op: 'population.cap', amount: -2 })];
  assert.equal(popCap(state, env, PID), 4);
  state.map.settlements = state.map.settlements.filter((s) => s.people !== PID);
  assert.equal(popCap(state, env, PID), 1);
});

// --- harvest -------------------------------------------------------------------

test('harvest: groups work the best land of their region, the settlement surroundings included; a resource no land yields stays idle', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  hw(state).population.assigned = { nahrung: 2, material: 1 };
  const pot = regionPotential(state, env, PID, standingOf(state, env, PID), 'fruehling').find((r) => r.region === '-1:0:0');
  // The camp's region is meadow, but the camp stands next to the mountains, whose stone folds onto material.
  assert.equal(pot.terrain, 'wiese');
  assert.deepEqual(pot.terrains, ['alm', 'gebirge', 'wiese']);
  assert.equal(pot.yields.material, 3);
  const tc = run(state, env);
  const p = hw(tc.state);
  // 2 clans on the meadow (nahrung 3), 1 clan on the mountain stone (material 3);
  // 3 eat, 1 knowledge from the settlement.
  assert.equal(p.resources.nahrung, 6 + 6 - 3);
  assert.equal(p.resources.material, 3 + 3);
  assert.equal(p.resources.wissen, 3);
  const harvest = kinds(tc, 'economy.harvest').find((e) => e.change.field === 'resources.nahrung');
  assert.equal(harvest.change.delta, 6);
  assert.deepEqual(harvest.refs, ['-1:0:0']);
  assert.ok(harvest.visibleTo.includes(PID));
  hw(state).population.assigned = { nahrung: 2, herden: 1 };
  const f = forecast(state, env, PID);
  assert.deepEqual(f.harvest.find((h) => h.kind === 'idle'), { kind: 'idle', res: 'herden', groups: 1 });
});

test('harvest: slots per region are exhausted, the surplus clans stay idle', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  hw(state).population.core = 5;
  hw(state).population.assigned = { nahrung: 5 };
  const f = forecast(state, env, PID);
  assert.equal(f.income.nahrung, 9, 'three slots on the meadow');
  assert.deepEqual(f.harvest.find((h) => h.kind === 'harvest'), { kind: 'harvest', res: 'nahrung', region: '-1:0:0', terrain: 'wiese', groups: 3, amount: 9 });
  assert.deepEqual(f.harvest.find((h) => h.kind === 'idle'), { kind: 'idle', res: 'nahrung', groups: 2 });
});

test('harvest: greedy placement fills the richest region first, then the next', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  state.map.control['0:-1:1'] = PID; // alm: nahrung 2, stein 1 folded onto material
  hw(state).population.core = 7;
  hw(state).population.assigned = { nahrung: 4, material: 3 };
  const f = forecast(state, env, PID);
  const at = (res, region) => f.harvest.find((h) => h.kind === 'harvest' && h.res === res && h.region === region);
  assert.equal(at('nahrung', '-1:0:0').groups, 3);
  assert.equal(at('nahrung', '0:-1:1').groups, 1);
  assert.equal(at('material', '0:-1:1').groups, 2, 'the meadow slots are full and yield no material');
  assert.deepEqual(f.harvest.find((h) => h.kind === 'idle'), { kind: 'idle', res: 'material', groups: 1 });
  assert.equal(f.income.nahrung, 3 * 3 + 2);
  assert.equal(f.income.material, 2);
});

test('harvest: equal yields go to the lowest region id first', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  state.map.control['-1:0:0'] = null;
  state.map.control['0:-1:1'] = PID;
  state.map.control['-1:-1:0'] = PID; // both alm
  hw(state).population.core = 4;
  hw(state).population.assigned = { nahrung: 4 };
  const f = forecast(state, env, PID);
  const groups = Object.fromEntries(f.harvest.filter((h) => h.kind === 'harvest').map((h) => [h.region, h.groups]));
  assert.deepEqual(groups, { '-1:-1:0': 3, '0:-1:1': 1 });
});

test('regionPotential folds welt.json keys onto world resources: alias, or the key itself when the world has it', () => {
  const { env, state } = setup();
  const standing = standingOf(state, env, PID);
  state.map.control['0:-1:1'] = PID;
  const alm = regionPotential(state, env, PID, standing, 'fruehling').find((r) => r.terrain === 'alm');
  assert.equal(alm.yields.nahrung, 2);
  assert.equal(alm.yields.material, 1, 'stein folds onto material');
  assert.equal(alm.yields.erz, 0);
  const own = setup({ regeln: { ...REGELN, resources: [...REGELN.resources, { id: 'stein', value: 1, cap: 9, module: null }] } });
  own.state.map.control['0:-1:1'] = PID;
  const alm2 = regionPotential(own.state, own.env, PID, standingOf(own.state, own.env, PID), 'fruehling').find((r) => r.terrain === 'alm');
  assert.equal(alm2.yields.stein, 1, 'a world resource of that name keeps the key');
  assert.equal(alm2.yields.material, 0);
});

test('yieldFactor 0 of the world switches a yield off for that season only', () => {
  // The meadow and the alm beside the camp both lie fallow in spring.
  const tuning = { terrainRules: { wiese: { yieldFactor: { fruehling: { nahrung: 0 } } }, alm: { yieldFactor: { fruehling: { nahrung: 0 } } } } };
  const spring = setup({ turn: 0, ...patchTuning(tuning) });
  setDeposits(spring.env, spring.state);
  const f0 = forecast(spring.state, spring.env, PID);
  assert.equal(f0.income.nahrung, undefined);
  assert.deepEqual(f0.harvest.find((h) => h.res === 'nahrung'), { kind: 'idle', res: 'nahrung', groups: 2 });
  const summer = setup({ turn: 1, ...patchTuning(tuning) });
  setDeposits(summer.env, summer.state);
  assert.equal(forecast(summer.state, summer.env, PID).income.nahrung, 6);
});

test('yield.mod shifts the base yield of its terrain and season, never below 0', () => {
  const { env, state } = setup({ turn: 0 });
  setDeposits(env, state);
  hw(state).statuses.push(status('t-spring', { op: 'yield.mod', res: 'nahrung', terrain: 'wiese', amount: 1, when: ['fruehling'] }, { op: 'yield.mod', res: 'nahrung', terrain: 'see', amount: 2 }));
  assert.equal(forecast(state, env, PID).income.nahrung, 8, '2 clans x (3 + 1), the lake mod touches no land of the region');
  state.turn = 1;
  assert.equal(forecast(state, env, PID).income.nahrung, 6, 'the mod is spring only');
  hw(state).statuses = [status('t-bad', { op: 'yield.mod', res: 'nahrung', terrain: 'wiese', amount: -2 }, { op: 'yield.mod', res: 'nahrung', terrain: 'wiese', amount: -2 })];
  assert.equal(forecast(state, env, PID).income.nahrung, 4, 'the meadow is held at 0, the alm beside the camp still yields 2 per clan');
});

test('deposits within the radius of a settlement yield through featureYield; those beyond, in a foreign region or without a worked slot do not', () => {
  const { env, state } = setup();
  setDeposits(env, state, {
    [SETTLEMENT_TILE]: [{ key: 'eisenerz', amount: 30 }, { key: 'fisch', amount: 5 }, { key: 'edelsteine', amount: 3 }],
    '-1,2': [{ key: 'salz', amount: 9 }], // distance 1, own region
    '1,1': [{ key: 'torf', amount: 9 }], // distance 1, but in the region of esk
    '0,4': [{ key: 'eisenerz', amount: 50 }], // distance 3
  });
  const f = forecast(state, env, PID);
  const sum = (res) => f.harvest.filter((h) => h.kind === 'deposit' && h.res === res).reduce((n, h) => n + h.amount, 0);
  assert.equal(sum('erz'), 1, 'eisenerz maps to erz, the far one is out of reach');
  assert.equal(sum('nahrung'), 1, 'fisch maps to nahrung');
  assert.equal(sum('salz'), 1);
  assert.equal(sum('material'), 0, 'torf lies in a region the people does not control');
  assert.equal(f.harvest.some((h) => h.res === 'edelsteine'), false, 'a deposit without a world resource yields nothing');
  hw(state).population.assigned = {};
  assert.equal(forecast(state, env, PID).harvest.filter((h) => h.kind === 'deposit').length, 0, 'no worked slot, no deposits');
});

test('tuning.featureYield of the world overrides the deposit mapping', () => {
  const tuning = { featureYield: { eisenerz: { res: 'material', amount: 3 } } };
  const { env, state } = setup(patchTuning(tuning));
  setDeposits(env, state, { [SETTLEMENT_TILE]: [{ key: 'eisenerz', amount: 30 }] });
  const f = forecast(state, env, PID);
  assert.equal(f.harvest.find((h) => h.kind === 'deposit').amount, 3);
  const worked = f.harvest.filter((h) => h.kind === 'harvest' && h.res === 'material').reduce((n, h) => n + h.amount, 0);
  assert.equal(f.income.material, 3 + worked);
});

test('features of a controlled, worked region yield; those of a foreign region do not', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  const feature = (id, key) => ({ id, kind: 'lagerstaette', name: 'Lager', tags: [], resources: [{ key, amount: 4 }], since: 0, source: 'world' });
  state.map.features[SETTLEMENT_TILE] = feature('f-own', 'salz');
  state.map.features['8,-5'] = feature('f-esk', 'erz'); // inside the region of esk
  const f = forecast(state, env, PID);
  assert.equal(f.income.salz, 1);
  assert.equal(f.income.erz, undefined);
  assert.deepEqual(f.harvest.find((h) => h.kind === 'feature'), { kind: 'feature', res: 'salz', amount: 1 });
});

test('every own settlement yields knowledge', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  assert.equal(forecast(state, env, PID).income.wissen, 1);
  state.map.settlements.push({ ...state.map.settlements[0], id: 's-hochweide-2', tile: '1,1' });
  assert.equal(forecast(state, env, PID).income.wissen, 2);
});

// --- flows -----------------------------------------------------------------------

test('resource.flow gains in its season and scales by population, settlements, regions or tagged units', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  state.map.control['0:-1:1'] = PID;
  noWork(state);
  hw(state).units = [unit('u-1'), unit('u-2'), unit('u-3', 'speerwall@1')];
  hw(state).resources.nahrung = 30;
  const flow = (res, amount, extra) => ({ op: 'resource.flow', res, amount, ...extra });
  hw(state).statuses.push(
    status('t-a', flow('erz', 1, { when: ['fruehling'] }), flow('salz', 1, { when: ['sommer'] }), flow('herden', 1, { scale: { per: 'population', step: 2 } })),
    status('t-b', flow('rauchkraut', 2, { scale: { per: 'settlements', step: 1 } }), flow('material', 3, { scale: { per: 'regions', step: 2 } }), flow('wissen', 1, { scale: { per: 'units', tag: 'reiter', step: 1 } })),
  );
  const f = forecast(state, env, PID);
  assert.equal(f.income.erz, 1);
  assert.equal(f.income.salz, undefined, 'summer flow does not act in spring');
  assert.equal(f.income.herden, 1, 'floor(3 / 2)');
  assert.equal(f.income.rauchkraut, 2);
  assert.equal(f.income.material, 3, 'two regions at step 2');
  assert.equal(f.income.wissen, 1 + 2, 'knowledge of the settlement plus two reiter units');
});

test('a negative flow of a status or the way of life is paid as far as possible and the rest is shortfall', () => {
  const { env, state } = setup(withContent((c) => {
    c.entwicklungen.find((e) => e.id === 'wanderhirten').price = [{ op: 'resource.flow', res: 'material', amount: -2 }];
  }));
  setDeposits(env, state);
  noWork(state);
  hw(state).resources.material = 1;
  hw(state).statuses.push(status('t-frost', { op: 'resource.flow', res: 'erz', amount: -1 }));
  const tc = run(state, env);
  assert.equal(hw(tc.state).resources.material, 0);
  assert.deepEqual(hw(tc.state).shortfall, { material: 1, erz: 1 });
  assert.equal(hw(tc.state).population.core, 3, 'only a food shortfall costs clans');
  assert.ok(tc.hooks.some((h) => h.people === PID && h.hook === 'shortfall:material'));
  assert.ok(hw(tc.state).developments.known.every((k) => k.state === 'active'), 'the way of life is never suspended');
});

// --- consumption and famine -------------------------------------------------------

test('consumption follows the way of life per season and the number of clans', () => {
  for (const [turn, due] of [[0, 3], [3, 6]]) {
    const { env, state } = setup({ turn });
    setDeposits(env, state);
    noWork(state);
    hw(state).resources.nahrung = 12;
    const tc = run(state, env);
    const eat = kinds(tc, 'economy.consumption')[0];
    assert.equal(eat.change.delta, -due, SEASONS[turn]);
    assert.equal(eat.step, 'economy');
  }
});

test('gains come before consumption: an empty stock is fed by this season harvest', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  hw(state).resources.nahrung = 0;
  hw(state).population.assigned = { nahrung: 3 };
  const tc = run(state, env);
  assert.equal(hw(tc.state).resources.nahrung, 9 - 3);
  assert.deepEqual(hw(tc.state).shortfall, {});
});

test('famine: ceil(missing / 2) clans are lost, council loyalty and approval fall, shortfall is logged', () => {
  for (const [stock, lost] of [[3, 0], [2, 1], [1, 1], [0, 2]]) {
    const { env, state } = setup();
    setDeposits(env, state);
    noWork(state);
    hw(state).resources.nahrung = stock;
    const tc = run(state, env);
    const p = hw(tc.state);
    assert.equal(p.population.core, 3 - lost, `stock ${stock}`);
    assert.equal(p.resources.nahrung, 0);
    if (!lost) {
      assert.deepEqual(p.shortfall, {});
      continue;
    }
    assert.deepEqual(p.shortfall, { nahrung: 3 - stock });
    assert.deepEqual(p.council.map((m) => m.loyalty), [2, 0, -3]);
    assert.equal(p.meters.zustimmung, -1);
    assert.equal(p.population.growth, 0, 'no growth in famine');
    const entry = tc.log.find((e) => e.kind === 'shortfall');
    assert.deepEqual(entry.change, { field: 'shortfall.nahrung', delta: 3 - stock });
    assert.ok(entry.visibleTo.includes(PID));
    assert.ok(tc.hooks.some((h) => h.people === PID && h.hook === 'shortfall:nahrung'));
  }
});

test('famine cannot take the population below 0', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  noWork(state);
  hw(state).population.core = 1;
  hw(state).resources.nahrung = 0;
  const tc = run(state, env);
  assert.equal(hw(tc.state).population.core, 0);
});

// --- upkeep ---------------------------------------------------------------------------

test('development upkeep is paid in its season', () => {
  const { env, state } = setup({ turn: 3 }); // winter: sippenrat costs 1 nahrung
  setDeposits(env, state);
  noWork(state);
  hw(state).resources.nahrung = 8;
  const tc = run(state, env);
  assert.equal(hw(tc.state).resources.nahrung, 8 - 6 - 1);
  assert.equal(kinds(tc, 'economy.upkeep').length, 1);
  assert.equal(hw(tc.state).developments.known.find((k) => k.ref === 'sippenrat@1').state, 'active');
});

test('unpaid upkeep suspends the development and pays nothing', () => {
  const { env, state } = setup({ turn: 3 });
  setDeposits(env, state);
  noWork(state);
  hw(state).resources.nahrung = 6; // exactly the consumption
  const tc = run(state, env);
  const entry = hw(tc.state).developments.known.find((k) => k.ref === 'sippenrat@1');
  assert.equal(entry.state, 'suspended');
  assert.equal(entry.suspendedSince, 3);
  assert.deepEqual(hw(tc.state).shortfall, {}, 'a suspension is the consequence, not a shortfall');
  assert.equal(kinds(tc, 'development.suspend').length, 1);
  assert.equal(kinds(tc, 'development.suspend')[0].change.field, 'developments.known');
  assert.equal(hw(tc.state).meters.zustimmung, 1, 'winter without famine');
});

test('a suspended development whose upkeep is payable again resumes', () => {
  const { env, state } = setup({ turn: 3 });
  setDeposits(env, state);
  noWork(state);
  const k = hw(state).developments.known.find((x) => x.ref === 'sippenrat@1');
  k.state = 'suspended';
  k.suspendedSince = 1;
  hw(state).resources.nahrung = 10;
  const tc = run(state, env);
  const after = hw(tc.state).developments.known.find((x) => x.ref === 'sippenrat@1');
  assert.equal(after.state, 'active');
  assert.equal(after.suspendedSince, null);
  assert.equal(hw(tc.state).resources.nahrung, 3);
  assert.equal(kinds(tc, 'development.resume').length, 1);
});

test('upkeep is served oldest development first', () => {
  const { env, state } = setup({ turn: 3 });
  setDeposits(env, state);
  noWork(state);
  // hirtenhunde (since 2) is listed before sippenrat (since 0) on purpose.
  hw(state).developments.known.unshift(known('hirtenhunde@1', 2));
  hw(state).resources.nahrung = 7; // 6 consumption leave one upkeep
  const tc = run(state, env);
  const by = (ref) => hw(tc.state).developments.known.find((k) => k.ref === ref).state;
  assert.equal(by('sippenrat@1'), 'active');
  assert.equal(by('hirtenhunde@1'), 'suspended');
});

test('a development with several upkeep resources is paid whole or not at all', () => {
  const extra = withContent((c) => {
    c.entwicklungen.push({
      ...structuredClone(c.entwicklungen.find((e) => e.id === 'hirtenhunde')), id: 'tribut', name: 'Tribut',
      effects: [], price: [{ op: 'resource.flow', res: 'nahrung', amount: -1 }, { op: 'resource.flow', res: 'material', amount: -1 }],
      origin: { source: 'world', practiceTags: ['herde'], token: null, request: null, proposal: null },
    });
  });
  const lacking = setup(extra);
  setDeposits(lacking.env, lacking.state);
  noWork(lacking.state);
  hw(lacking.state).developments.known.push(known('tribut@1'));
  hw(lacking.state).resources.nahrung = 10;
  hw(lacking.state).resources.material = 0;
  const tc = run(lacking.state, lacking.env);
  assert.equal(hw(tc.state).developments.known.find((k) => k.ref === 'tribut@1').state, 'suspended');
  assert.equal(hw(tc.state).resources.nahrung, 7, 'the food part was not paid');

  const covered = setup(extra);
  setDeposits(covered.env, covered.state);
  noWork(covered.state);
  hw(covered.state).developments.known.push(known('tribut@1'));
  hw(covered.state).resources.nahrung = 10;
  hw(covered.state).resources.material = 1;
  const ok = run(covered.state, covered.env);
  assert.equal(hw(ok.state).developments.known.find((k) => k.ref === 'tribut@1').state, 'active');
  assert.equal(hw(ok.state).resources.nahrung, 6);
  assert.equal(hw(ok.state).resources.material, 0);
});

test('upkeep does not apply before a development takes effect or to an institution not in force', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  noWork(state);
  hw(state).resources.salz = 0;
  hw(state).resources.material = 0;
  hw(state).developments.known.push(known('marktrecht@1')); // institution, not instituted: costs 1 salz
  hw(state).developments.known.push(known('saumpfade@1', 0, { effectiveFrom: 2 })); // costs material in summer
  state.turn = 1;
  const tc = run(state, env);
  assert.ok(hw(tc.state).developments.known.every((k) => k.state === 'active'));
});

test('building upkeep is paid per copy; the unpaid copy is suspended and later resumes', () => {
  const { env, state } = setup({ turn: 1 });
  setDeposits(env, state);
  noWork(state);
  const copy = () => ({ ref: 'wachfeuer@1', since: 0, state: 'active' });
  state.map.settlements[0].buildings = [copy(), copy()];
  hw(state).resources.material = 1;
  const tc = run(state, env);
  assert.deepEqual(tc.state.map.settlements[0].buildings.map((b) => b.state), ['active', 'suspended']);
  assert.equal(hw(tc.state).resources.material, 0);
  const e = kinds(tc, 'building.suspend')[0];
  assert.deepEqual(e.target, { kind: 'settlement', id: 's-hochweide' });
  assert.ok(e.visibleTo.includes(PID));

  const resume = setup({ turn: 1 });
  setDeposits(resume.env, resume.state);
  noWork(resume.state);
  resume.state.map.settlements[0].buildings = [copy(), { ...copy(), state: 'suspended' }];
  hw(resume.state).resources.material = 2;
  const back = run(resume.state, resume.env);
  assert.deepEqual(back.state.map.settlements[0].buildings.map((b) => b.state), ['active', 'active']);
  assert.equal(hw(back.state).resources.material, 0);
  assert.equal(kinds(back, 'building.resume').length, 1);
});

test('unit upkeep is paid per unit; an unpaid unit loses 1 strength and dissolves at 0', () => {
  const paid = setup();
  setDeposits(paid.env, paid.state);
  noWork(paid.state);
  hw(paid.state).units = [unit('u-1')];
  hw(paid.state).resources.nahrung = 4;
  const ok = run(paid.state, paid.env);
  assert.equal(hw(ok.state).units[0].strength, 2);
  assert.equal(hw(ok.state).resources.nahrung, 0);

  const hungry = setup();
  setDeposits(hungry.env, hungry.state);
  noWork(hungry.state);
  hungry.state.peoples[PID].units = [unit('u-1'), unit('u-2', 'reiterschar@1', 1)];
  hungry.state.peoples[PID].resources.nahrung = 3; // only the clans eat
  const tc = run(hungry.state, hungry.env);
  assert.equal(hw(tc.state).units.length, 1);
  assert.equal(hw(tc.state).units[0].strength, 1, 'u-1 lost one');
  assert.equal(kinds(tc, 'unit.dissolved').length, 1, 'u-2 had only 1');
  assert.deepEqual(hw(tc.state).shortfall, {});
});

test('dependency is paid from the stock; unpaid it fires the penalty, the hook and the scratch flag', () => {
  const dependent = (rauchkraut) => {
    const { env, state } = setup();
    setDeposits(env, state);
    noWork(state);
    hw(state).developments.known.push(known('ahnensprache@1'));
    hw(state).resources.nahrung = 10;
    hw(state).resources.rauchkraut = rauchkraut;
    return run(state, env);
  };
  const ok = dependent(1);
  assert.equal(hw(ok.state).resources.rauchkraut, 0);
  assert.deepEqual(hw(ok.state).council.map((m) => m.loyalty), [3, 1, -2]);
  assert.equal(ok.scratch.dependencyUnpaid, undefined);

  const bad = dependent(0);
  assert.deepEqual(hw(bad.state).council.map((m) => m.loyalty), [2, 0, -3], 'penalty: loyalty -1 for all');
  assert.equal(bad.scratch.dependencyUnpaid[PID].rauchkraut, true);
  assert.deepEqual(hw(bad.state).shortfall, { rauchkraut: 1 });
  assert.ok(bad.hooks.some((h) => h.people === PID && h.hook === 'shortfall:rauchkraut'));
});

// --- shortfall bookkeeping -------------------------------------------------------------

test('shortfall of the opening state lapses, increases made earlier in the turn stay', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  hw(state).shortfall = { nahrung: 3, erz: 2 };
  const tc = ctxOf(state, env);
  tc.state.peoples[PID].shortfall = { nahrung: 5, erz: 2, salz: 1 }; // resource.delta of an order added 2 and 1
  resolveEconomy(tc);
  assert.deepEqual(hw(tc.state).shortfall, { nahrung: 2, salz: 1 });
  assert.equal(kinds(tc, 'shortfall.reset').length, 1);
});

test('a quiet season leaves no shortfall entry and removes zero values', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  hw(state).shortfall = { nahrung: 3 };
  const tc = run(state, env);
  assert.deepEqual(hw(tc.state).shortfall, {});
  assert.equal(tc.log.filter((e) => e.kind === 'shortfall').length, 0);
});

test('peoples without clans or settlements are skipped', () => {
  const { env, state } = setup();
  state.peoples.glutreiter.population.core = 0;
  state.map.settlements = state.map.settlements.filter((s) => s.people !== 'esk');
  const tc = run(state, env);
  assert.equal(tc.log.filter((e) => ['glutreiter', 'esk'].includes(e.target.id)).length, 0);
  assert.deepEqual(tc.state.peoples.esk.resources, state.peoples.esk.resources);
});

test('every change of a stock or of the clans is accounted for by a log entry of the people', () => {
  const { env, state } = setup({ turn: 3 });
  setDeposits(env, state);
  hw(state).resources.nahrung = 4;
  hw(state).developments.known.push(known('ahnensprache@1'));
  hw(state).units = [unit('u-1')];
  const tc = run(state, env);
  for (const res of env.resourceIds) {
    const delta = tc.log.filter((e) => e.target.id === PID && e.change?.field === `resources.${res}`).reduce((n, e) => n + e.change.delta, 0);
    assert.equal((hw(tc.state).resources[res] ?? 0) - (hw(state).resources[res] ?? 0), delta, res);
  }
  const clans = tc.log.filter((e) => e.target.id === PID && e.change?.field === 'population.core').reduce((n, e) => n + e.change.delta, 0);
  assert.equal(hw(tc.state).population.core - 3, clans);
  assert.ok(tc.log.every((e) => e.step === 'economy' && e.visibleTo.length > 0));
});

test('gains are capped before losses: a stock above its cap gains nothing, losses come off the opening stock', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  hw(state).resources.nahrung = 998;
  hw(state).population.assigned = { nahrung: 3 };
  const tc = run(state, env);
  const gain = kinds(tc, 'economy.harvest').find((e) => e.change.field === 'resources.nahrung');
  assert.equal(gain, undefined);
  assert.equal(hw(tc.state).resources.nahrung, 998 - 3);
});

// --- growth and approval --------------------------------------------------------------

const grow = (patch, { growth = 0, core = 3, statuses = [] } = {}) => {
  const { env, state } = setup(patch);
  setDeposits(env, state);
  noWork(state);
  hw(state).resources.nahrung = 30;
  hw(state).population.core = core;
  hw(state).population.growth = growth;
  hw(state).statuses = statuses;
  const tc = run(state, env);
  return hw(tc.state).population;
};

test('growth: base growth accumulates, four points make a clan', () => {
  assert.deepEqual(grow(undefined, { growth: 0 }), { core: 3, growth: 1, assigned: {} });
  assert.deepEqual(grow(undefined, { growth: 2 }), { core: 3, growth: 3, assigned: {} });
  assert.deepEqual(grow(undefined, { growth: 3 }), { core: 4, growth: 0, assigned: {} });
});

test('growth: population.growth effects change the points and cannot push them below 0', () => {
  const up = [status('t-up', { op: 'population.growth', amount: 2 })];
  const down = [status('t-down', { op: 'population.growth', amount: -1 }, { op: 'population.growth', amount: -1 })];
  assert.equal(grow(undefined, { growth: 0, statuses: up }).growth, 3);
  assert.equal(grow(undefined, { growth: 0, statuses: down }).growth, 0);
  const lots = [status('t-lots', { op: 'population.growth', amount: 2 }, { op: 'population.growth', amount: 2 }, { op: 'population.growth', amount: 2 })];
  assert.deepEqual(grow(undefined, { growth: 3, statuses: lots }), { core: 5, growth: 2, assigned: {} }, '3 + 1 + 6 = 10 points: two clans, 2 left');
});

test('growth stops at the population cap and keeps at most 3 points', () => {
  assert.deepEqual(grow(undefined, { growth: 3, core: 6 }), { core: 6, growth: 3, assigned: {} });
  const lots = [status('t-lots', { op: 'population.growth', amount: 2 }, { op: 'population.growth', amount: 2 }, { op: 'population.growth', amount: 2 })];
  assert.deepEqual(grow(undefined, { growth: 3, core: 5, statuses: lots }), { core: 6, growth: 3, assigned: {} }, 'one clan fits, 6 points left are held at 3');
});

test('growth does not happen while food is short', () => {
  const { env, state } = setup();
  setDeposits(env, state);
  noWork(state);
  hw(state).resources.nahrung = 0;
  hw(state).population.growth = 2;
  const tc = run(state, env);
  assert.equal(hw(tc.state).population.growth, 2);
});

test('approval rises by 1 in a winter without famine and stays within the world bounds', () => {
  const winter = (approval, patch) => {
    const { env, state } = setup({ turn: 3, ...patch });
    setDeposits(env, state);
    noWork(state);
    hw(state).resources.nahrung = 30;
    hw(state).meters.zustimmung = approval;
    return hw(run(state, env).state).meters.zustimmung;
  };
  assert.equal(winter(0), 1);
  assert.equal(winter(5), 5);
  assert.equal(winter(2, patchTuning({ approval: { min: -2, max: 2, start: 0 } })), 2);
  const spring = setup();
  setDeposits(spring.env, spring.state);
  noWork(spring.state);
  assert.equal(hw(run(spring.state, spring.env).state).meters.zustimmung, 0, 'only winters raise approval');
});

// --- caps and loss ----------------------------------------------------------------------------

const capped = (stock, patch = {}) => {
  const { env, state } = setup(patch);
  Object.assign(hw(state).resources, stock);
  const tc = ctxOf(state, env);
  capStocks(tc);
  return tc;
};

test('capStocks: a stock at the cap is kept, above it loses ceil(excess / spoilage)', () => {
  assert.equal(hw(capped({ nahrung: 30 }).state).resources.nahrung, 30);
  const over = capped({ nahrung: 31 });
  assert.equal(hw(over.state).resources.nahrung, 30);
  assert.equal(kinds(over, 'resource.spoil')[0].change.delta, -1);
  assert.equal(hw(capped({ nahrung: 33 }).state).resources.nahrung, 31, 'excess 3 loses ceil(3 / 2) = 2');
  assert.equal(hw(capped({ nahrung: 33 }, patchTuning({ spoilage: 3 })).state).resources.nahrung, 32);
});

test('capStocks: a cap of 0 stores nothing and caps are read from the opening state', () => {
  const zero = capped({ rauchkraut: 5 }, { regeln: { ...REGELN, resources: REGELN.resources.map((r) => (r.id === 'rauchkraut' ? { ...r, cap: 0 } : r)) } });
  assert.equal(hw(zero.state).resources.rauchkraut, 0);
  const { env, state } = setup();
  hw(state).resources.nahrung = 31;
  const tc = ctxOf(state, env);
  tc.state.peoples[PID].statuses.push(status('t-late', { op: 'stock.cap', res: 'nahrung', amount: 10 })); // acts next turn
  capStocks(tc);
  assert.equal(hw(tc.state).resources.nahrung, 30);
});

test('capStocks: a cap whose source was suspended this season binds at once', () => {
  const { env, state } = setup();
  hw(state).statuses.push(status('vorrat', { op: 'stock.cap', res: 'nahrung', amount: 4 }));
  hw(state).resources.nahrung = 34;
  const tc = ctxOf(state, env);
  tc.state.peoples[PID].statuses = tc.state.peoples[PID].statuses.filter((s) => s.id !== 'vorrat');
  capStocks(tc);
  assert.equal(hw(tc.state).resources.nahrung, 32, 'cap 30 now, excess 4 loses ceil(4 / 2) = 2');
});

test('capStocks: a world cap above 999 still holds the stock at 999', () => {
  const big = capped({ nahrung: 1500 }, { regeln: { ...REGELN, resources: REGELN.resources.map((r) => (r.id === 'nahrung' ? { ...r, cap: 2000 } : r)) } });
  assert.equal(hw(big.state).resources.nahrung, 999);
});

test('loseSuspended removes developments suspended for lossAfter turns, not earlier, and never the way of life', () => {
  const lose = (turn, edit) => {
    const { env, state } = setup({ turn });
    const k = hw(state).developments.known.find((x) => x.ref === 'sippenrat@1');
    k.state = 'suspended';
    k.suspendedSince = 0;
    edit?.(state);
    const tc = ctxOf(state, env);
    loseSuspended(tc);
    return tc;
  };
  const early = lose(3);
  assert.ok(hw(early.state).developments.known.some((k) => k.ref === 'sippenrat@1'), 'tuning.lossAfter is 4');
  const late = lose(4);
  assert.ok(!hw(late.state).developments.known.some((k) => k.ref === 'sippenrat@1'));
  assert.deepEqual(hw(late.state).developments.instituted, []);
  assert.ok(late.log.some((e) => e.kind === 'development.lost' && e.refs.includes('sippenrat@1') && e.target.id === PID));
  const way = lose(9, (s) => {
    const k = hw(s).developments.known.find((x) => x.ref === 'wanderhirten@1');
    k.state = 'suspended';
    k.suspendedSince = 0;
  });
  assert.ok(hw(way.state).developments.known.some((k) => k.ref === 'wanderhirten@1'));
});

// --- forecast shares the arithmetic of resolveEconomy ------------------------------------------

test('forecast net equals the change of the stock in a season, in every season, for every people', () => {
  for (const turn of [0, 1, 2, 3, 4, 5, 6, 7]) {
    for (const pid of ['hochweide', 'esk', 'glutreiter']) {
      const { env, state } = setup({ turn });
      const f = forecast(state, env, pid);
      const tc = run(state, env);
      const before = state.peoples[pid];
      const after = tc.state.peoples[pid];
      for (const res of env.resourceIds) {
        assert.equal((after.resources[res] ?? 0) - (before.resources[res] ?? 0), f.net[res] ?? 0, `turn ${turn} ${pid} ${res}`);
      }
      assert.deepEqual(after.shortfall, f.shortfall, `turn ${turn} ${pid} shortfall`);
      assert.equal(after.population.core - before.population.core, (f.growth?.clans ?? 0) - (f.famine?.clans ?? 0), `turn ${turn} ${pid} clans`);
    }
  }
});

test('forecast of a stressed people agrees with the season as well', () => {
  const { env, state } = setup({ turn: 3 });
  noWork(state);
  hw(state).resources = { nahrung: 2, material: 0, wissen: 0, erz: 0, herden: 0, salz: 0, rauchkraut: 0 };
  hw(state).developments.known.push(known('ahnensprache@1'), known('hirtenhunde@1', 2));
  hw(state).units = [unit('u-1')];
  const f = forecast(state, env, PID);
  const tc = run(state, env);
  assert.ok(f.shortfall.nahrung > 0 && f.upkeepRisk.length > 0);
  for (const res of env.resourceIds) {
    assert.equal((hw(tc.state).resources[res] ?? 0) - (hw(state).resources[res] ?? 0), f.net[res] ?? 0, res);
  }
  assert.deepEqual(hw(tc.state).shortfall, f.shortfall);
});

test('forecast: spend lowers the opening stock, assign replaces the standing labour, risks name what is suspended', () => {
  const { env, state } = setup({ turn: 3 });
  setDeposits(env, state);
  assert.deepEqual(forecast(state, env, PID).shortfall, {});
  const poor = forecast(state, env, PID, { spend: { nahrung: 6 } });
  assert.equal(poor.shortfall.nahrung, undefined, 'income 6 still feeds the clans');
  const none = forecast(state, env, PID, { spend: { nahrung: 6 }, assign: {} });
  assert.deepEqual(none.shortfall, { nahrung: 6 - 0 });
  assert.equal(forecast(state, env, PID, { assign: { nahrung: 3 } }).income.nahrung, 9);
  assert.equal(none.famine.clans, 3);
  hw(state).resources.nahrung = 6;
  const risk = forecast(state, env, PID, { assign: {} }).upkeepRisk;
  assert.equal(risk.length, 1);
  assert.match(risk[0], /Sippenrat/);
  assert.equal(forecast(state, env, PID).popCap, 6);
  assert.equal(forecast(state, env, PID).caps.nahrung, 30);
});

test('forecast works on a projection that holds foreign peoples only in the foreign shape', () => {
  const { env, state } = setup({ turn: 3 });
  const view = structuredClone(state);
  for (const pid of Object.keys(view.peoples)) {
    if (pid === PID) continue;
    const { id, name, controller, identity, lebensweise, standing, units } = view.peoples[pid];
    view.peoples[pid] = { id, name, controller, identity, lebensweise, standing, units };
  }
  assert.deepEqual(forecast(view, env, PID), forecast(state, env, PID));
});

test('the real Hochland package runs the economy in every season and keeps its numbers in range', () => {
  const env = realEnv();
  for (const turn of [0, 1, 2, 3]) {
    const { state } = createCampaign(env, { id: 'real-1', seed: 7 });
    const opened = structuredClone(open(state, env).state);
    opened.turn = turn;
    for (const pid of Object.keys(opened.peoples)) {
      const f = forecast(opened, env, pid);
      const tc = createContext(opened, env);
      tc.step = 'economy';
      resolveEconomy(tc);
      const after = tc.state.peoples[pid];
      for (const res of env.resourceIds) {
        const v = after.resources[res] ?? 0;
        assert.ok(Number.isInteger(v) && v >= 0 && v <= 999, `${pid} ${res}`);
        assert.equal((after.resources[res] ?? 0) - (opened.peoples[pid].resources[res] ?? 0), f.net[res] ?? 0, `turn ${turn} ${pid} ${res}`);
      }
      assert.ok(after.population.growth >= 0 && after.population.growth <= 3);
    }
  }
});

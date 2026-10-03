import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evalCondition } from '../../../engine/core/conditions.js';
import { regionInfo } from '../../../engine/world/index.js';
import { freshState, cxOf, clone, PLAYER } from '../../fixtures/engine/k1/foundation.js';

// hochweide: nahrung 6, material 3, wissen 2, erz 0, herden 4; zustimmung 0;
// knows wanderhirten (lebensweise, tier 0) and sippenrat (institution, tier 0).
const setup = (edit) => {
  const { env, state } = freshState();
  const s = clone(state);
  if (edit) edit(s, env);
  return { env, state: s, cx: (extra) => cxOf(s, env, PLAYER, extra) };
};
const known = (ref, over = {}) => ({ ref, since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null, ...over });
const ev = (cond, edit, extra) => {
  const t = setup(edit);
  return evalCondition(cond, t.cx(extra));
};

test('null and undefined conditions hold', () => {
  assert.equal(ev(null), true);
  assert.equal(ev(undefined), true);
});

test('season compares with the calendar season of the context', () => {
  assert.equal(ev({ season: 'fruehling' }), true);
  assert.equal(ev({ season: 'winter' }), false);
  const t = setup((s) => { s.turn = 3; });
  assert.equal(evalCondition({ season: 'winter' }, t.cx()), true);
});

test('res: gte and lt at, below and above the stock, missing resource counts as 0', () => {
  assert.equal(ev({ res: 'nahrung', cmp: 'gte', value: 6 }), true);
  assert.equal(ev({ res: 'nahrung', cmp: 'gte', value: 7 }), false);
  assert.equal(ev({ res: 'nahrung', cmp: 'gte', value: 5 }), true);
  assert.equal(ev({ res: 'nahrung', cmp: 'lt', value: 6 }), false);
  assert.equal(ev({ res: 'nahrung', cmp: 'lt', value: 7 }), true);
  assert.equal(ev({ res: 'salz', cmp: 'lt', value: 1 }), true);
  assert.equal(ev({ res: 'salz', cmp: 'gte', value: 1 }), false);
  assert.equal(ev({ res: 'erz', cmp: 'gte', value: 0 }), true);
});

test('meter: gte and lt, absent meter counts as 0', () => {
  const edit = (s) => { s.peoples[PLAYER].meters.zustimmung = -2; };
  assert.equal(ev({ meter: 'zustimmung', cmp: 'gte', value: -2 }, edit), true);
  assert.equal(ev({ meter: 'zustimmung', cmp: 'gte', value: -1 }, edit), false);
  assert.equal(ev({ meter: 'zustimmung', cmp: 'lt', value: -1 }, edit), true);
  assert.equal(ev({ meter: 'zustimmung', cmp: 'lt', value: -2 }, edit), false);
  assert.equal(ev({ meter: 'unbekannt', cmp: 'gte', value: 0 }), true);
  assert.equal(ev({ meter: 'unbekannt', cmp: 'lt', value: 0 }), false);
});

test('knows matches the id of an active, effective development', () => {
  assert.equal(ev({ knows: 'sippenrat' }), true);
  assert.equal(ev({ knows: 'wanderhirten' }), true);
  assert.equal(ev({ knows: 'filzjurten' }), false);
  assert.equal(ev({ knows: 'filzjurten' }, (s) => { s.peoples[PLAYER].developments.known.push(known('filzjurten@1')); }), true);
});

test('knows ignores developments that are not yet effective, suspended, or an institution not in force', () => {
  const push = (over) => (s) => { s.peoples[PLAYER].developments.known.push(known('filzjurten@1', over)); };
  assert.equal(ev({ knows: 'filzjurten' }, push({ effectiveFrom: 1 })), false);
  assert.equal(ev({ knows: 'filzjurten' }, push({ state: 'suspended', suspendedSince: 0 })), false);
  const inst = (s) => { s.peoples[PLAYER].developments.known.push(known('marktrecht@1')); };
  assert.equal(ev({ knows: 'marktrecht' }, inst), false);
  assert.equal(ev({ knows: 'marktrecht' }, (s) => { inst(s); s.peoples[PLAYER].developments.instituted.push('marktrecht@1'); }), true);
});

test('lebensweise compares the id of the people way of life', () => {
  assert.equal(ev({ lebensweise: 'wanderhirten' }), true);
  assert.equal(ev({ lebensweise: 'talbauern' }), false);
});

test('module defers to cx.isModuleActive(pid, id), false without it', () => {
  assert.equal(ev({ module: 'handel' }), false);
  const calls = [];
  const isModuleActive = (pid, id) => { calls.push([pid, id]); return id === 'handel'; };
  assert.equal(ev({ module: 'handel' }, null, { isModuleActive }), true);
  assert.equal(ev({ module: 'magie' }, null, { isModuleActive }), false);
  assert.deepEqual(calls, [[PLAYER, 'handel'], [PLAYER, 'magie']]);
});

test('tagCount counts active developments carrying the tag, gte and lt', () => {
  assert.equal(ev({ tagCount: 'herde', cmp: 'gte', value: 1 }), true);
  assert.equal(ev({ tagCount: 'herde', cmp: 'gte', value: 2 }), false);
  assert.equal(ev({ tagCount: 'herde', cmp: 'lt', value: 1 }), false);
  assert.equal(ev({ tagCount: 'krieg', cmp: 'lt', value: 1 }), true);
  const more = (s) => { s.peoples[PLAYER].developments.known.push(known('hirtenhunde@1'), known('filzjurten@1')); };
  assert.equal(ev({ tagCount: 'herde', cmp: 'gte', value: 3 }, more), true);
  assert.equal(ev({ tagCount: 'herde', cmp: 'gte', value: 4 }, more), false);
});

test('tagCount does not count buildings or developments not yet effective', () => {
  const edit = (s) => { s.peoples[PLAYER].developments.known.push(known('hirtenhunde@1', { effectiveFrom: 2 }), known('wachfeuer@1')); };
  assert.equal(ev({ tagCount: 'verteidigung', cmp: 'gte', value: 1 }, edit), false);
  assert.equal(ev({ tagCount: 'herde', cmp: 'gte', value: 2 }, edit), false);
});

test('tierCount counts known developments of exactly that tier, whatever their state', () => {
  assert.equal(ev({ tierCount: 0, cmp: 'gte', value: 2 }), true);
  assert.equal(ev({ tierCount: 0, cmp: 'gte', value: 3 }), false);
  assert.equal(ev({ tierCount: 1, cmp: 'lt', value: 1 }), true);
  assert.equal(ev({ tierCount: 1, cmp: 'gte', value: 1 }), false);
  const edit = (s) => { s.peoples[PLAYER].developments.known.push(known('filzjurten@1', { effectiveFrom: 5 })); };
  assert.equal(ev({ tierCount: 1, cmp: 'gte', value: 1 }, edit), true);
});

test('atWar is about the evaluating people only', () => {
  assert.equal(ev({ atWar: false }), true);
  assert.equal(ev({ atWar: true }), false);
  const own = (s) => { s.relations['glutreiter|hochweide'].atWar = true; };
  assert.equal(ev({ atWar: true }, own), true);
  assert.equal(ev({ atWar: false }, own), false);
  const others = (s) => { s.relations['esk|glutreiter'].atWar = true; };
  assert.equal(ev({ atWar: true }, others), false);
  assert.equal(ev({ atWar: false }, others), true);
});

test('flag reads the kernel slice with the dot stored as "~"', () => {
  const edit = (s) => { s.peoples[PLAYER].modules.kern.flags = { 'ritus~blutritus': true, 'ritus~leer': false }; };
  assert.equal(ev({ flag: 'ritus.blutritus' }, edit), true);
  assert.equal(ev({ flag: 'ritus.leer' }, edit), false);
  assert.equal(ev({ flag: 'ritus.fehlt' }, edit), false);
  assert.equal(ev({ flag: 'ritus.blutritus' }), false);
  assert.equal(ev({ flag: 'ritus.blutritus' }, (s) => { delete s.peoples[PLAYER].modules.kern; }), false);
});

test('controls counts controlled regions, optionally by dominant terrain', () => {
  assert.equal(ev({ controls: {}, cmp: 'gte', value: 1 }), true);
  assert.equal(ev({ controls: {}, cmp: 'gte', value: 2 }), false);
  assert.equal(ev({ controls: {}, cmp: 'lt', value: 1 }), false);
  assert.equal(ev({ controls: {}, cmp: 'lt', value: 2 }), true);
  const t = setup();
  const region = Object.keys(t.state.map.control).find((r) => t.state.map.control[r] === PLAYER);
  const terrain = regionInfo(t.cx().world, region).dominantTerrain;
  assert.equal(evalCondition({ controls: { terrain }, cmp: 'gte', value: 1 }, t.cx()), true);
  assert.equal(evalCondition({ controls: { terrain: 'see' }, cmp: 'gte', value: 1 }, t.cx()), terrain === 'see');
  const more = setup((s) => { s.map.control['9:9:0'] = PLAYER; });
  assert.equal(evalCondition({ controls: {}, cmp: 'gte', value: 2 }, more.cx()), true);
});

test('relation compares the value with one people or any other people ($any)', () => {
  const edit = (s) => {
    s.relations['esk|hochweide'].value = 2;
    s.relations['glutreiter|hochweide'].value = -3;
  };
  assert.equal(ev({ relation: 'esk', cmp: 'gte', value: 2 }, edit), true);
  assert.equal(ev({ relation: 'esk', cmp: 'gte', value: 3 }, edit), false);
  assert.equal(ev({ relation: 'esk', cmp: 'lt', value: 2 }, edit), false);
  assert.equal(ev({ relation: 'glutreiter', cmp: 'lt', value: -2 }, edit), true);
  assert.equal(ev({ relation: '$any', cmp: 'gte', value: 2 }, edit), true);
  assert.equal(ev({ relation: '$any', cmp: 'gte', value: 3 }, edit), false);
  assert.equal(ev({ relation: '$any', cmp: 'lt', value: -2 }, edit), true);
  assert.equal(ev({ relation: '$any', cmp: 'lt', value: -3 }, edit), false);
});

test('relation to a people without a relation entry is false for gte and lt alike; $any ignores the evaluator itself', () => {
  assert.equal(ev({ relation: 'nirgends', cmp: 'lt', value: 3 }), false);
  assert.equal(ev({ relation: 'nirgends', cmp: 'gte', value: -3 }), false);
  const edit = (s) => { delete s.relations['esk|hochweide']; delete s.relations['glutreiter|hochweide']; };
  assert.equal(ev({ relation: '$any', cmp: 'gte', value: -3 }, edit), false);
});

test('all, any and not combine and nest', () => {
  const T = { res: 'nahrung', cmp: 'gte', value: 1 };
  const F = { res: 'nahrung', cmp: 'gte', value: 99 };
  assert.equal(ev({ all: [T, T] }), true);
  assert.equal(ev({ all: [T, F] }), false);
  assert.equal(ev({ any: [F, T] }), true);
  assert.equal(ev({ any: [F, F] }), false);
  assert.equal(ev({ not: F }), true);
  assert.equal(ev({ not: T }), false);
  assert.equal(ev({ all: [] }), true);
  assert.equal(ev({ any: [] }), false);
  assert.equal(ev({ all: [T, { any: [F, { not: F }] }, { not: { all: [T, F] } }] }), true);
  assert.equal(ev({ any: [F, { all: [T, { not: T }] }, { not: { any: [T] } }] }), false);
});

test('an unknown people evaluates every atom to false, but not the combinators themselves', () => {
  const t = setup();
  const cx = { ...t.cx(), pid: 'niemand' };
  assert.equal(evalCondition({ res: 'nahrung', cmp: 'gte', value: 0 }, cx), false);
  assert.equal(evalCondition({ season: 'fruehling' }, cx), false);
  assert.equal(evalCondition({ not: { res: 'nahrung', cmp: 'gte', value: 0 } }, cx), true);
});

test('an unknown atom throws', () => {
  assert.throws(() => ev({ gibtsnicht: 1 }), /unknown atom/);
});

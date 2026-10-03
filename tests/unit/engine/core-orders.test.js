import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogueFor, slotCapacity, assertDraft, checkDraft, orderContext, registry, effectiveAssign,
} from '../../../engine/core/orders.js';
import { bareCode } from '../../../engine/core/codes.js';
import { RULES } from '../../../engine/core/rules.js';
import { CONTENT, ENTWICKLUNGEN } from '../../fixtures/engine/k1/pack.js';
import { freshState, clone, draftOf, PLAYER } from '../../fixtures/engine/k1/foundation.js';

const P = PLAYER;
// Opening state: phase planning, turn 0 (spring), player hochweide with one main and two minor slots,
// nahrung 6, material 3, core 3, camp at 0,1; council ulrun 3 (lebensabend), torhild 1, garmund -2 (lebensabend).
const known = (ref, over = {}) => ({ ref, since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null, ...over });
const peopleOf = (s, pid = P) => s.peoples[pid];

const explore = (id = 'ex', tile = '2,1') => ({ id, type: 'explore', params: { tile } });
const found = (id = 'fd', tile = '1,0') => ({ id, type: 'found', params: { tile } });
const institute = (id = 'in', development = 'marktrecht@1') => ({ id, type: 'institute', params: { development } });
const build = (id = 'bd') => ({ id, type: 'build', params: { development: 'wachfeuer@1', settlement: 's-hochweide' } });

// A second region within range 3 is free for a settlement once esk's claim on it is removed.
const freeRegion = (s) => {
  delete s.map.control['0:-1:1'];
  s.map.settlements.find((x) => x.people === 'esk').regionId = '9:9:9';
};
const withInstitution = (s) => { peopleOf(s).developments.known.push(known('marktrecht@1')); };
const withBauwerk = (s) => { peopleOf(s).developments.known.push(known('wachfeuer@1')); };

function check(patch = {}, { edit, mode, as, env: envPatch } = {}) {
  const base = freshState(7, envPatch);
  const state = clone(base.state);
  if (edit) edit(state, base.env);
  const draft = draftOf(state, as ?? P, patch);
  return { env: base.env, state, draft, chk: checkDraft(state, base.env, draft, { mode, as }) };
}
const errs = (chk) => chk.issues.filter((i) => i.severity === 'error');
const issuesOf = (chk, code) => chk.issues.filter((i) => bareCode(i) === code);
const codes = (chk) => chk.issues.map(bareCode);
const rollsFor = (chk, value = 5) => Object.fromEntries(chk.probes.map((p) => [p.id, { value, fingerprint: p.fingerprint }]));

// a development that adds slots, limits or restrictions, for catalogue and slot tests
const custom = (id, effects) => ({ ...ENTWICKLUNGEN.find((e) => e.id === 'filzjurten'), id, name: id, effects, price: [] });
const patchWith = (...devs) => ({ content: { ...CONTENT, entwicklungen: [...ENTWICKLUNGEN, ...devs] } });
const knows = (...ids) => (s) => { for (const id of ids) peopleOf(s).developments.known.push(known(`${id}@1`)); };

// registry, catalogue, slots

test('registry holds the core orders with origin core and module orders with their module', () => {
  const reg = registry();
  for (const t of ['build', 'found', 'institute', 'explore', 'road', 'road.pave']) assert.equal(reg[t]?.origin, 'core', t);
  assert.ok(typeof reg.explore.def.check === 'function' && typeof reg.explore.def.plan === 'function' && typeof reg.explore.def.resolve === 'function');
  assert.equal(reg['trade.offer'].origin, 'handel');
});

test('catalogueFor is sorted by type and marks core orders by availability and reason', () => {
  const { env, state } = freshState();
  const cat = catalogueFor(state, env, P);
  const types = cat.map((c) => c.type);
  assert.deepEqual(types, [...types].sort());
  const by = Object.fromEntries(cat.map((c) => [c.type, c]));
  for (const t of ['found', 'institute', 'explore']) assert.deepEqual([by[t].available, by[t].reason], [true, null], t);
  assert.deepEqual([by.build.available, by.build.reason], [false, 'nothing to act on']);
  assert.deepEqual([by.road.available, by.road.reason], [false, 'not unlocked']);
  assert.deepEqual([by['road.pave'].available, by['road.pave'].reason], [false, 'not unlocked']);
  assert.equal(by.explore.slot, 'minor');
  assert.equal(by.found.slot, 'main');
  assert.equal(by.explore.origin, 'core');
  assert.equal(by['trade.offer'].available, false);
  assert.match(by['trade.offer'].reason, /module handel is not active/);
});

test('catalogueFor opens a locked order through order.unlock, a known bauwerk opens build', () => {
  const base = freshState();
  const s = clone(base.state);
  peopleOf(s).developments.known.push(known('saumpfade@1'), known('wachfeuer@1'));
  const by = Object.fromEntries(catalogueFor(s, base.env, P).map((c) => [c.type, c]));
  assert.deepEqual([by.road.available, by.road.limit], [true, null]);
  assert.equal(by['road.pave'].available, false);
  assert.equal(by.build.available, true);
});

test('catalogueFor takes the highest unlock limit and no limit beats any limit', () => {
  const patch = patchWith(
    custom('weg-eins', [{ op: 'order.unlock', order: 'road', limit: 1 }]),
    custom('weg-zwei', [{ op: 'order.unlock', order: 'road', limit: 2 }]),
    custom('weg-frei', [{ op: 'order.unlock', order: 'road' }]),
  );
  const limitOf = (ids) => {
    const base = freshState(7, patch);
    const s = clone(base.state);
    knows(...ids)(s);
    return catalogueFor(s, base.env, P).find((c) => c.type === 'road').limit;
  };
  assert.equal(limitOf(['weg-eins']), 1);
  assert.equal(limitOf(['weg-eins', 'weg-zwei']), 2);
  assert.equal(limitOf(['weg-zwei', 'weg-eins']), 2);
  assert.equal(limitOf(['weg-zwei', 'weg-frei']), null);
  assert.equal(limitOf(['weg-frei', 'weg-eins']), null);
});

test('catalogueFor reports an order forbidden by order.restrict, a false condition lifts it', () => {
  const patch = patchWith(
    custom('verbot', [{ op: 'order.restrict', mode: 'forbid', orders: ['explore'], tags: [] }]),
    custom('winterverbot', [{ op: 'order.restrict', mode: 'forbid', orders: ['found'], tags: [], if: { season: 'winter' } }]),
  );
  const base = freshState(7, patch);
  const s = clone(base.state);
  knows('verbot', 'winterverbot')(s);
  const by = Object.fromEntries(catalogueFor(s, base.env, P).map((c) => [c.type, c]));
  assert.equal(by.explore.available, false);
  assert.match(by.explore.reason, /^forbidden by verbot/);
  assert.equal(by.found.available, true);
});

test('orderContext carries calendar, standing, modules and bind', () => {
  const { env, state } = freshState();
  const ox = orderContext(state, env, P);
  assert.equal(ox.pid, P);
  assert.equal(ox.turn, 0);
  assert.equal(ox.cal.season, 'fruehling');
  assert.equal(ox.people, state.peoples[P]);
  assert.ok(Array.isArray(ox.standing) && ox.standing.length > 0);
  assert.equal(ox.bind('handel'), null);
  assert.equal(ox.cx.isModuleActive(P, 'handel'), false);
});

test('slotCapacity is tuning.slots plus order.slot effects', () => {
  const { env, state } = freshState();
  assert.deepEqual(slotCapacity(orderContext(state, env, P)), { main: 1, minor: 2 });
  const patch = patchWith(
    custom('ratshalle', [{ op: 'order.slot', slot: 'main', amount: 1 }]),
    custom('spaeher', [{ op: 'order.slot', slot: 'minor', amount: 1 }]),
    custom('spaeher-zwei', [{ op: 'order.slot', slot: 'minor', amount: 1 }]),
  );
  const base = freshState(7, patch);
  const s = clone(base.state);
  knows('ratshalle', 'spaeher', 'spaeher-zwei')(s);
  assert.deepEqual(slotCapacity(orderContext(s, base.env, P)), { main: 2, minor: 4 });
});

test('effectiveAssign takes the draft assignment, else the standing one', () => {
  const { state } = freshState();
  assert.deepEqual(effectiveAssign(state, { assign: { nahrung: 1 } }, P), { nahrung: 1 });
  assert.deepEqual(effectiveAssign(state, { assign: {} }, P), {});
  assert.deepEqual(effectiveAssign(state, {}, P), { nahrung: 2, material: 1 });
  assert.deepEqual(effectiveAssign(state, null, P), { nahrung: 2, material: 1 });
});

// assertDraft and format

test('assertDraft accepts an empty draft and rejects non-objects with one format issue', () => {
  const { state } = freshState();
  assert.deepEqual(assertDraft(draftOf(state)), []);
  for (const bad of [null, undefined, [], 'draft', 3]) {
    const r = assertDraft(bad);
    assert.equal(r.length, 1);
    assert.equal(r[0].code, 'format');
    assert.equal(r[0].severity, 'error');
  }
});

test('assertDraft finds schema violations as format issues with a path', () => {
  const { state } = freshState();
  const d = draftOf(state);
  const cases = {
    'missing field': (() => { const x = clone(d); delete x.orders; return x; })(),
    'wrong version': { ...d, version: 2 },
    'orders not an array': { ...d, orders: {} },
    'extra property': { ...d, extra: 1 },
    'order without params': { ...d, orders: [{ id: 'ab', type: 'explore' }] },
    'too many orders': { ...d, orders: Array.from({ length: 17 }, (_, i) => ({ id: `o${i}`, type: 'explore', params: {} })) },
    'roll out of range': { ...d, rolls: { 'T0:hochweide:ex': { value: 11, fingerprint: '0'.repeat(16) } } },
    'labour above 99': { ...d, assign: { nahrung: 100 } },
    'venture not true': { ...d, venture: { ex: false } },
  };
  for (const [name, draft] of Object.entries(cases)) {
    const r = assertDraft(draft);
    assert.ok(r.length >= 1, name);
    assert.ok(r.every((i) => i.code === 'format'), name);
  }
});

test('the reserved order id event is a schema format error', () => {
  const { chk } = check({ orders: [{ id: 'event', type: 'explore', params: { tile: '2,1' } }] });
  assert.deepEqual(codes(chk), ['format']);
  assert.match(chk.issues[0].path, /\/orders\/0\/id$/);
  assert.deepEqual(chk.entries, []);
});

test('checkDraft returns format issues without throwing for garbage and stops before anything else', () => {
  const { env, state } = freshState();
  const out = checkDraft(state, env, null);
  assert.deepEqual(out.issues.map((i) => i.code), ['format']);
  assert.deepEqual(out.entries, []);
  assert.deepEqual(out.probes, []);
});

test('format: the draft must be for the people it is checked as', () => {
  const { env, state } = freshState();
  const out = checkDraft(state, env, draftOf(state, P), { as: 'esk' });
  assert.deepEqual(out.issues.map((i) => [i.code, i.path]), [['format', '/people']]);
  const unknown = checkDraft(state, env, { ...draftOf(state, P), people: 'niemand' });
  assert.equal(unknown.issues[0].code, 'format');
});

// phase, stale, finished

test('phase: preview needs planning or agents, apply needs planning or resolving', () => {
  const at = (phase, mode) => check({}, { edit: (s) => { s.phase = phase; }, mode }).chk;
  for (const [phase, mode, ok] of [
    ['planning', 'preview', true], ['agents', 'preview', true], ['resolving', 'preview', false],
    ['planning', 'apply', true], ['resolving', 'apply', true], ['agents', 'apply', false],
  ]) {
    const phaseIssues = issuesOf(at(phase, mode), 'phase');
    assert.equal(phaseIssues.length === 0, ok, `${mode} in ${phase}`);
    if (!ok) assert.equal(phaseIssues[0].path, '/phase');
  }
});

test('stale: a draft of another turn is stale, in either direction', () => {
  for (const turn of [1, 5]) {
    const { chk } = check({ turn });
    assert.deepEqual(issuesOf(chk, 'stale').map((i) => i.path), ['/turn']);
    assert.deepEqual(chk.entries, []);
  }
  const later = check({ turn: 3 }, { edit: (s) => { s.turn = 2; } }).chk;
  assert.equal(issuesOf(later, 'stale').length, 1);
});

test('a baseRev lower or higher than the state revision alone is not stale', () => {
  for (const baseRev of [0, 1, 99, 100000]) {
    const { chk } = check({ baseRev });
    assert.deepEqual(issuesOf(chk, 'stale'), []);
    assert.deepEqual(errs(chk), []);
  }
  const { chk } = check({ baseRev: 0 }, { edit: (s) => { s.rev = 40; } });
  assert.deepEqual(errs(chk), []);
});

test('finished: an ended campaign takes no draft', () => {
  const { chk } = check({}, { edit: (s) => { s.status = 'ended'; } });
  assert.equal(issuesOf(chk, 'finished').length, 1);
});

// order issues

test('unknown_order for a type nobody registered, with its path and no entry def', () => {
  const { chk } = check({ orders: [{ id: 'ab', type: 'zaubern', params: {} }] });
  assert.deepEqual(issuesOf(chk, 'unknown_order').map((i) => i.path), ['/orders/0/type']);
  assert.equal(chk.entries[0].def, null);
});

test('locked_order for an order without its unlock, and for build without a bauwerk', () => {
  const road = check({ orders: [{ id: 'rd', type: 'road', params: { tile: '3,1' } }] }).chk;
  assert.deepEqual(issuesOf(road, 'locked_order').map((i) => i.path), ['/orders/0/type']);
  assert.match(issuesOf(road, 'locked_order')[0].message, /not unlocked/);
  assert.equal(road.issues.find((i) => i.code === 'locked_order').severity, 'error');
  const noBuild = check({ orders: [build()] }).chk;
  assert.match(issuesOf(noBuild, 'locked_order')[0].message, /nothing to act on/);
  const open = check({ orders: [build()] }, { edit: withBauwerk }).chk;
  assert.deepEqual(issuesOf(open, 'locked_order'), []);
});

test('locked_order for a module order of an inactive module', () => {
  const { chk } = check({ orders: [{ id: 'tr', type: 'trade.offer', params: {} }] });
  assert.equal(issuesOf(chk, 'locked_order').length, 1);
  assert.match(issuesOf(chk, 'locked_order')[0].message, /module handel is not active/);
});

test('restricted for a forbidden order and for a per-season limit', () => {
  const patch = patchWith(
    custom('verbot', [{ op: 'order.restrict', mode: 'forbid', orders: ['found'], tags: [] }]),
    custom('grenze', [{ op: 'order.restrict', mode: 'limit', orders: ['explore'], tags: [], limit: 1, per: 'season' }]),
  );
  const forbidden = check({ orders: [found()] }, { edit: knows('verbot'), env: patch }).chk;
  assert.deepEqual(issuesOf(forbidden, 'restricted').map((i) => i.path), ['/orders/0/type']);
  assert.equal(issuesOf(forbidden, 'restricted')[0].severity, 'error');
  const one = check({ orders: [explore('e1')] }, { edit: knows('grenze'), env: patch }).chk;
  assert.deepEqual(issuesOf(one, 'restricted'), []);
  const two = check({ orders: [explore('e1'), explore('e2', '1,1')] }, { edit: knows('grenze'), env: patch }).chk;
  assert.deepEqual(issuesOf(two, 'restricted').map((i) => i.path), ['/orders/1/type']);
});

test('restricted when the number of uses exceeds an order.unlock limit', () => {
  const patch = patchWith(custom('weg-eins', [{ op: 'order.unlock', order: 'road', limit: 1 }]));
  const roads = [1, 2].map((i) => ({ id: `rd${i}`, type: 'road', params: { tile: '3,1' } }));
  const { chk } = check({ orders: roads }, { edit: knows('weg-eins'), env: patch });
  assert.deepEqual(issuesOf(chk, 'restricted').map((i) => i.path), ['/orders/1/type']);
});

test('target for a bad order parameter, with the params path', () => {
  const badTile = check({ orders: [explore('ex', 'nirgends')] }).chk;
  assert.deepEqual(issuesOf(badTile, 'target').map((i) => i.path), ['/orders/0/params']);
  const far = check({ orders: [explore('ex', '40,40')] }).chk;
  assert.equal(issuesOf(far, 'target').length, 1);
  assert.match(issuesOf(far, 'target')[0].message, new RegExp(`within ${RULES.exploreRange}`));
  assert.equal(issuesOf(check({ orders: [explore('ex', '2,1')] }).chk, 'target').length, 0);
  assert.equal(issuesOf(check({ orders: [found('fd', '0,0')] }, { edit: freeRegion }).chk, 'target').length, 1, 'mountain is not buildable');
  assert.equal(issuesOf(check({ orders: [found('fd', '1,0')], }, { edit: freeRegion }).chk, 'target').length, 0);
  assert.equal(issuesOf(check({ orders: [found('fd', '1,0')] }).chk, 'target').length, 1, 'region held by another people');
});

test('target for names that belong to no order: venture, lead, mandate', () => {
  for (const key of ['venture', 'lead', 'mandate']) {
    const value = key === 'venture' ? true : key === 'lead' ? 'torhild' : 'decree';
    const { chk } = check({ orders: [explore('ex')], [key]: { nirgends: value } });
    const t = issuesOf(chk, 'target');
    assert.equal(t.length, 1, key);
    assert.equal(t[0].path, '/orders');
    assert.match(t[0].message, /nirgends names no order/);
  }
});

test('duplicate when an order id is used twice', () => {
  const { chk } = check({ orders: [explore('ex'), explore('ex', '1,1')] });
  assert.deepEqual(issuesOf(chk, 'duplicate').map((i) => i.path), ['/orders/1/id']);
  assert.deepEqual(chk.entries[0].errors.filter((e) => e.code === 'duplicate'), []);
  assert.equal(chk.entries[1].errors.some((e) => e.code === 'duplicate'), true);
});

test('slots when a draft uses more main orders than the capacity', () => {
  const { chk } = check({ orders: [found(), build()] }, { edit: (s, env) => { freeRegion(s, env); withBauwerk(s); peopleOf(s).resources.material = 20; } });
  assert.deepEqual(issuesOf(chk, 'slots').map((i) => [i.path, i.severity]), [['/orders', 'error']]);
  assert.match(issuesOf(chk, 'slots')[0].message, /2 main orders, 1 available/);
  assert.deepEqual(chk.slots, { main: { used: 2, max: 1 }, minor: { used: 0, max: 2 } });
});

test('slots: three minor orders exceed two minor slots, and an extra slot lifts the error', () => {
  const orders = [explore('e1', '2,1'), explore('e2', '1,1'), explore('e3', '1,0')];
  const { chk } = check({ orders });
  assert.match(issuesOf(chk, 'slots')[0].message, /3 minor orders, 2 available/);
  const patch = patchWith(custom('spaeher', [{ op: 'order.slot', slot: 'minor', amount: 1 }]));
  const wide = check({ orders }, { edit: knows('spaeher'), env: patch }).chk;
  assert.deepEqual(issuesOf(wide, 'slots'), []);
  assert.deepEqual(wide.slots.minor, { used: 3, max: 3 });
});

test('cost when the orders need more than the opening stock, accumulated over the draft', () => {
  const ok = check({ orders: [found()] }, { edit: freeRegion }).chk;
  assert.deepEqual(issuesOf(ok, 'cost'), []);
  assert.deepEqual(ok.costs, { material: 2, nahrung: 2 });
  const poor = check({ orders: [found()] }, { edit: (s) => { freeRegion(s); peopleOf(s).resources.material = 1; } }).chk;
  assert.deepEqual(issuesOf(poor, 'cost').map((i) => i.path), ['/orders/0']);
  assert.match(issuesOf(poor, 'cost')[0].message, /material: orders need 2, the opening stock holds 1/);
  // two main orders against stock 3 material: the second one breaks the budget
  const two = check({ orders: [found('f1'), build('b1')] }, { edit: (s) => { freeRegion(s); withBauwerk(s); } }).chk;
  assert.deepEqual(issuesOf(two, 'cost').map((i) => i.path), ['/orders/1']);
  assert.match(issuesOf(two, 'cost')[0].message, /material: orders need 4, the opening stock holds 3/);
  assert.equal(two.costs.material, 4);
});

test('cost is exactly affordable at the stock and fails one above', () => {
  const at = check({ orders: [found()] }, { edit: (s) => { freeRegion(s); peopleOf(s).resources.material = 2; peopleOf(s).resources.nahrung = 2; } }).chk;
  assert.deepEqual(issuesOf(at, 'cost'), []);
  const below = check({ orders: [found()] }, { edit: (s) => { freeRegion(s); peopleOf(s).resources.material = 2; peopleOf(s).resources.nahrung = 1; } }).chk;
  assert.equal(issuesOf(below, 'cost').length, 1);
  assert.match(issuesOf(below, 'cost')[0].message, /nahrung/);
});

test('free_slots warns per unused slot kind and stays quiet when all slots are filled', () => {
  const empty = check({}).chk;
  assert.deepEqual(issuesOf(empty, 'free_slots').map((i) => [i.severity, i.path, i.message]), [
    ['warning', '/orders', '1 main slot(s) unused'],
    ['warning', '/orders', '2 minor slot(s) unused'],
  ]);
  assert.deepEqual(errs(empty), []);
  const half = check({ orders: [explore('e1')] }).chk;
  assert.deepEqual(issuesOf(half, 'free_slots').map((i) => i.message), ['1 main slot(s) unused', '1 minor slot(s) unused']);
  const full = check({ orders: [found(), explore('e1'), explore('e2', '1,1')] }, { edit: freeRegion }).chk;
  assert.deepEqual(issuesOf(full, 'free_slots'), []);
  assert.deepEqual(errs(full), []);
});

test('entries describe each order: slot, origin, tags, plan and probe', () => {
  const { chk } = check({ orders: [found(), explore('e1')] }, { edit: freeRegion });
  const [f, e] = chk.entries;
  assert.deepEqual([f.slot, f.origin, f.venture], ['main', 'core', false]);
  assert.ok(f.tags.includes(RULES.mainTag));
  assert.equal(f.probe, null);
  assert.deepEqual(f.plan.costs, RULES.foundCost);
  assert.deepEqual([e.slot, e.origin], ['minor', 'core']);
  assert.ok(e.tags.includes('erkundung'));
  assert.ok(!e.tags.includes(RULES.mainTag));
  assert.equal(e.probe.id, 'T0:hochweide:e1');
  assert.equal(e.probe.target, 5);
  assert.equal(e.probe.roller, 'player');
  assert.equal(e.probe.kind, 'explore');
  assert.deepEqual(e.errors, []);
});

// rolls

test('roll_missing in apply mode for the player, one per probe; preview lists them as unresolved instead', () => {
  const apply = check({ orders: [explore('e1')] }, { mode: 'apply' }).chk;
  const missing = issuesOf(apply, 'roll_missing');
  assert.ok(missing.some((i) => i.path === '/rolls/T0:hochweide:e1'));
  assert.equal(missing.length, apply.probes.length);
  assert.ok(missing.every((i) => i.severity === 'error'));
  const preview = check({ orders: [explore('e1')] }, { mode: 'preview' }).chk;
  assert.deepEqual(issuesOf(preview, 'roll_missing'), []);
  assert.deepEqual(preview.unresolved.map((u) => u.probe).sort(), preview.probes.map((p) => p.id).sort());
});

test('rolls with the right fingerprint settle the probes: no roll_missing, no roll_stale', () => {
  const first = check({ orders: [explore('e1')] }, { mode: 'apply' });
  const rolls = rollsFor(first.chk);
  const { chk } = check({ orders: [explore('e1')], rolls }, { mode: 'apply' });
  assert.deepEqual(issuesOf(chk, 'roll_missing'), []);
  assert.deepEqual(issuesOf(chk, 'roll_stale'), []);
  assert.deepEqual(errs(chk), []);
  const preview = check({ orders: [explore('e1')], rolls }).chk;
  assert.deepEqual(preview.unresolved, []);
});

test('roll_stale after a parameter change, for a wrong fingerprint and for a roll without a probe', () => {
  const rolls = rollsFor(check({ orders: [explore('e1', '2,1')] }).chk);
  const moved = check({ orders: [explore('e1', '1,1')], rolls }, { mode: 'apply' }).chk;
  assert.deepEqual(issuesOf(moved, 'roll_stale').map((i) => i.path), ['/rolls/T0:hochweide:e1']);
  assert.match(issuesOf(moved, 'roll_stale')[0].message, /changed after the roll/);
  assert.deepEqual(issuesOf(moved, 'roll_missing'), []);
  const wrong = check({ orders: [explore('e1')], rolls: { 'T0:hochweide:e1': { value: 4, fingerprint: 'f'.repeat(16) } } }).chk;
  assert.equal(issuesOf(wrong, 'roll_stale').length, 1);
  const ghost = check({ orders: [], rolls: { 'T0:hochweide:nix': { value: 4, fingerprint: 'f'.repeat(16) } } }).chk;
  assert.match(issuesOf(ghost, 'roll_stale')[0].message, /no matching probe/);
});

test('roll_stale after the venture flag or a lead changes the probe', () => {
  const rolls = rollsFor(check({ orders: [explore('e1')] }).chk);
  const lead = check({ orders: [explore('e1')], lead: { e1: 'torhild' }, rolls }).chk;
  assert.deepEqual(issuesOf(lead, 'roll_stale').map((i) => i.path), ['/rolls/T0:hochweide:e1']);
  const edit = withBauwerk;
  const buildRolls = rollsFor(check({ orders: [build()] }, { edit }).chk);
  const venture = check({ orders: [build()], venture: { bd: true }, rolls: buildRolls }, { edit }).chk;
  assert.deepEqual(issuesOf(venture, 'roll_stale').map((i) => i.path), ['/rolls/T0:hochweide:bd']);
});

// softcap

test('softcap warns when the stacking rules cut a modifier', () => {
  const edit = (s) => {
    for (const id of ['st-a', 'st-b', 'st-c']) peopleOf(s).statuses.push({ id, effects: [{ op: 'probe.mod', tags: ['erkundung'], amount: 2 }], until: null, endsOn: null });
  };
  const { chk } = check({ orders: [explore('e1')] }, { edit });
  const w = issuesOf(chk, 'softcap');
  assert.equal(w.length, 1);
  assert.equal(w[0].severity, 'warning');
  assert.equal(w[0].path, '/probes/T0:hochweide:e1');
  assert.equal(chk.entries[0].probe.modTotal, RULES.totalModCap);
  const quiet = check({ orders: [explore('e1')] }).chk;
  assert.deepEqual(issuesOf(quiet, 'softcap'), []);
});

// labour

test('labour: more clans assigned than the people has is an error', () => {
  const { chk } = check({ assign: { nahrung: 3, material: 1 } });
  const l = issuesOf(chk, 'labour');
  assert.equal(l.length, 1);
  assert.equal(l[0].severity, 'error');
  assert.equal(l[0].path, '/assign');
  assert.match(l[0].message, /4 clans assigned, the people has 3/);
  assert.deepEqual(issuesOf(chk, 'idle_labour'), []);
});

test('idle_labour: clans without work are a warning, exactly the core is quiet', () => {
  const idle = check({ assign: { nahrung: 1 } }).chk;
  const i = issuesOf(idle, 'idle_labour');
  assert.equal(i.length, 1);
  assert.equal(i[0].severity, 'warning');
  assert.match(i[0].message, /2 clan\(s\) without work/);
  assert.deepEqual(errs(idle), []);
  const exact = check({ assign: { nahrung: 2, material: 1 } }).chk;
  assert.deepEqual(issuesOf(exact, 'idle_labour'), []);
  assert.deepEqual(issuesOf(exact, 'labour'), []);
  assert.deepEqual(exact.assign, { nahrung: 2, material: 1 });
});

test('labour: research is an activity, unknown keys are target errors, no assign keeps the standing assignment', () => {
  const research = check({ assign: { nahrung: 2, research: 1 } }).chk;
  assert.deepEqual(issuesOf(research, 'target'), []);
  assert.deepEqual(issuesOf(research, 'labour'), []);
  const bad = check({ assign: { nahrung: 2, zauberei: 1 } }).chk;
  assert.deepEqual(issuesOf(bad, 'target').map((i) => i.path), ['/assign/zauberei']);
  const none = check({}).chk;
  assert.deepEqual(issuesOf(none, 'labour'), []);
  assert.deepEqual(issuesOf(none, 'idle_labour'), []);
  assert.deepEqual(none.assign, { nahrung: 2, material: 1 });
});

test('labour issues use the interim prefix until issues.js lists the code, bareCode strips it', () => {
  const { chk } = check({ assign: { nahrung: 3, material: 1 } });
  const raw = chk.issues.find((i) => bareCode(i) === 'labour');
  assert.ok(raw.code === 'labour' || raw.code === 'kern.labour');
});

// choices

test('choices must answer an open decision of this people with one of its options', () => {
  const edit = (s) => {
    s.pendingChoices.push({ id: 'pc-frage', people: P, event: 'fremder-hirte@1', offeredAt: 0, deadline: 1, options: ['aufnehmen', 'abweisen'] });
  };
  assert.deepEqual(errs(check({ choices: { 'pc-frage': 'aufnehmen' } }, { edit }).chk), []);
  const wrongOption = check({ choices: { 'pc-frage': 'plundern' } }, { edit }).chk;
  assert.deepEqual(issuesOf(wrongOption, 'target').map((i) => i.path), ['/choices/pc-frage']);
  const unknown = check({ choices: { 'pc-nix': 'aufnehmen' } }, { edit }).chk;
  assert.deepEqual(issuesOf(unknown, 'target').map((i) => i.path), ['/choices/pc-nix']);
  const foreign = check({ choices: { 'pc-frage': 'aufnehmen' } }, { edit: (s) => { edit(s); s.pendingChoices[0].people = 'esk'; } }).chk;
  assert.equal(issuesOf(foreign, 'target').length, 1);
});

// venture

test('venture: a main order without a probe gets a probe at RULES.ventureTarget', () => {
  const plain = check({ orders: [found()] }, { edit: freeRegion }).chk;
  assert.equal(plain.entries[0].probe, null);
  const { chk } = check({ orders: [found()], venture: { fd: true } }, { edit: freeRegion });
  const e = chk.entries[0];
  assert.equal(e.venture, true);
  assert.equal(e.probe.target, RULES.ventureTarget);
  assert.equal(e.probe.id, 'T0:hochweide:fd');
  assert.equal(e.probe.kind, 'found');
  assert.ok(e.probe.tags.includes(RULES.mainTag));
  assert.deepEqual(errs(chk), []);
});

test('venture: a main order with a probe gets its target raised by one', () => {
  const edit = (s) => { withBauwerk(s); };
  const plain = check({ orders: [build()] }, { edit }).chk;
  assert.equal(plain.entries[0].probe.target, 5);
  const venture = check({ orders: [build()], venture: { bd: true } }, { edit }).chk;
  assert.equal(venture.entries[0].probe.target, 6);
  assert.equal(venture.entries[0].probe.chance, plain.entries[0].probe.chance - 10);
  assert.notEqual(venture.entries[0].probe.fingerprint, plain.entries[0].probe.fingerprint);
});

test('venture: a minor order cannot be a venture', () => {
  const { chk } = check({ orders: [explore('e1')], venture: { e1: true } });
  assert.deepEqual(issuesOf(chk, 'target').map((i) => i.path), ['/orders/0']);
  assert.match(issuesOf(chk, 'target')[0].message, /only a main order can be a venture/);
});

// lead

const leadModsOf = (chk) => chk.entries[0].probe.modifiers.filter((m) => m.source.startsWith('lead:'));

test('lead: loyalty at leadLoyalty or more gives +1, the Lebensabend -1, hinfaellig -2', () => {
  const lead = (member, edit) => check({ orders: [explore('e1')], lead: { e1: member } }, { edit }).chk;
  assert.deepEqual(leadModsOf(lead('torhild')), []);
  assert.deepEqual(leadModsOf(lead('torhild', (s) => { s.peoples[P].council[1].loyalty = RULES.leadLoyalty; })).map((m) => m.value), [1]);
  assert.deepEqual(leadModsOf(lead('torhild', (s) => { s.peoples[P].council[1].loyalty = RULES.leadLoyalty - 1; })), []);
  assert.deepEqual(leadModsOf(lead('ulrun')).map((m) => [m.source, m.value]), [['lead:ulrun:age', -1]]);
  assert.deepEqual(leadModsOf(lead('ulrun', (s) => { s.peoples[P].council[0].loyalty = 4; })).map((m) => m.value).sort(), [-1, 1]);
  assert.deepEqual(leadModsOf(lead('garmund', (s) => { s.peoples[P].council[2].lifeStage = 'hinfaellig'; })).map((m) => m.value), [-2]);
});

test('lead changes the probe total and the chance, and an unknown member is a target error', () => {
  const base = check({ orders: [explore('e1')] }).chk.entries[0].probe;
  const led = check({ orders: [explore('e1')], lead: { e1: 'garmund' } }, { edit: (s) => { s.peoples[P].council[2].lifeStage = 'hinfaellig'; } }).chk.entries[0].probe;
  assert.equal(led.modTotal, base.modTotal - 2);
  assert.equal(led.chance, base.chance - 20);
  const { chk } = check({ orders: [explore('e1')], lead: { e1: 'niemand' } });
  assert.deepEqual(issuesOf(chk, 'target').map((i) => i.path), ['/lead/e1']);
});

// modifiers

test('probe modifiers of an order include Wesensart and standing probe.mod effects on the order tags', () => {
  const edit = (s) => { peopleOf(s).developments.known.push(known('saumpfade@1')); };
  const { chk } = check({ orders: [explore('e1')] }, { edit });
  const probe = chk.entries[0].probe;
  assert.deepEqual(probe.modifiers.map((m) => [m.source, m.value]), [['dev:saumpfade@1', 1]]);
  assert.equal(probe.modTotal, 1);
  assert.equal(probe.chance, 70);
});

// council

test('council_rejected when the council of an institution-scoped order votes it down, a decree carries it', () => {
  const { chk } = check({ orders: [institute()] }, { edit: withInstitution });
  const vote = chk.entries[0].vote;
  assert.ok(vote?.required, 'sippenrat requires a vote on ordnung orders');
  assert.equal(vote.passed, false);
  assert.deepEqual(issuesOf(chk, 'council_rejected').map((i) => [i.path, i.severity]), [['/orders/0', 'error']]);
  assert.match(issuesOf(chk, 'council_rejected')[0].message, /council rejects institute/);
  const decree = check({ orders: [institute()], mandate: { in: 'decree' } }, { edit: withInstitution }).chk;
  assert.deepEqual(issuesOf(decree, 'council_rejected'), []);
  assert.equal(decree.entries[0].vote.decree, true);
  const agreed = check({ orders: [institute()] }, { edit: (s) => { withInstitution(s); s.peoples[P].council[2].loyalty = 1; } }).chk;
  assert.equal(agreed.entries[0].vote.passed, true);
  assert.deepEqual(issuesOf(agreed, 'council_rejected'), []);
});

test('a people without a governance rule needs no council vote', () => {
  const { chk } = check({ orders: [institute()] }, { edit: (s) => { withInstitution(s); peopleOf(s).developments.known = peopleOf(s).developments.known.filter((k) => k.ref !== 'sippenrat@1'); } });
  assert.equal(chk.entries[0].vote, null);
  assert.deepEqual(issuesOf(chk, 'council_rejected'), []);
});

// out shape

test('checkDraft output shape: entries per order, probes, costs, slots, assign, event probe', () => {
  const { chk } = check({ orders: [explore('e1')] });
  assert.deepEqual(Object.keys(chk).sort(), ['assign', 'costs', 'entries', 'eventProbe', 'issues', 'probes', 'slots', 'unresolved']);
  assert.equal(chk.entries.length, 1);
  assert.equal(chk.entries[0].index, 0);
  assert.equal(chk.entries[0].order.id, 'e1');
  assert.ok(chk.probes.includes(chk.entries[0].probe));
  assert.ok(chk.eventProbe && chk.probes.includes(chk.eventProbe));
  assert.equal(chk.eventProbe.kind, 'event');
  assert.equal(chk.eventProbe.id, 'T0:hochweide:event');
});

test('checkDraft does not mutate the state or the draft', () => {
  const base = freshState();
  const state = clone(base.state);
  const draft = draftOf(state, P, { orders: [explore('e1'), found()], venture: { fd: true }, assign: { nahrung: 3 } });
  const before = JSON.stringify([state, draft]);
  checkDraft(state, base.env, draft, { mode: 'apply' });
  assert.equal(JSON.stringify([state, draft]), before);
});

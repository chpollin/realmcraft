import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createContext, finish, record, setPeople, addPeople, addResource, setMember, changeLoyalty, setControl, setRelation,
  noteChange, notice, fireHook,
} from '../../../engine/core/log.js';
import { validate } from '../../../engine/content/schema.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { freshState, ctxOf, PLAYER } from '../../fixtures/engine/k1/foundation.js';

const P = PLAYER;
const setup = () => {
  const { env, state } = freshState();
  return { env, state, tc: ctxOf(state, env, 'economy') };
};
const last = (tc) => tc.log.at(-1);
const valid = (entry) => assert.deepEqual(validate(SCHEMAS.event, entry), [], JSON.stringify(entry));

test('createContext clones the state, keeps s0 untouched and takes calendar, world and rng from s0', () => {
  const { env, state } = freshState();
  const tc = createContext(state, env);
  assert.notEqual(tc.state, state);
  assert.deepEqual(tc.state, state);
  assert.equal(tc.s0, state);
  assert.equal(tc.turn, state.turn);
  assert.equal(tc.cal.season, 'fruehling');
  assert.equal(tc.step, 'kernel');
  assert.equal(tc.source, 'kernel');
  assert.deepEqual(tc.rng.state().s.map((x) => x >>> 0), state.rng.s.map((x) => x >>> 0));
  tc.state.peoples[P].resources.nahrung = 0;
  assert.equal(state.peoples[P].resources.nahrung, 6);
  assert.equal(tc.rng.draws(), 0);
  assert.deepEqual(tc.log, []);
});

test('entry ids continue after entries this turn already has in the chronicle', () => {
  const { env, state } = freshState();
  const s = structuredClone(state);
  s.chronicle.push({ id: 'T0-e41', turn: 0 }, { id: 'T7-e99', turn: 7 });
  const tc = createContext(s, env);
  const T = { kind: 'campaign', id: 'c' };
  assert.equal(record(tc, 'x.y', T, null, 'r').id, 'T0-e42');
  assert.equal(record(tc, 'x.y', T, null, 'r').id, 'T0-e43');
});

test('record writes a schema-valid entry with source, target, change, reason, visibleTo and step', () => {
  const { tc } = setup();
  const e = record(tc, 'order.cost', { kind: 'people', id: P }, { field: 'resources.nahrung', delta: -1 }, 'because', { people: P, refs: ['a'] });
  assert.equal(tc.log.length, 1);
  assert.deepEqual(e, {
    id: e.id, turn: 0, source: 'kernel', kind: 'order.cost', target: { kind: 'people', id: P },
    change: { field: 'resources.nahrung', delta: -1 }, reason: 'because', refs: ['a'], visibleTo: [P], step: 'economy',
  });
  valid(e);
});

test('record visibility: people, visibleTo and "all"', () => {
  const { tc } = setup();
  const T = { kind: 'campaign', id: 'c' };
  assert.deepEqual(record(tc, 'a.b', T, null, 'r').visibleTo, ['all']);
  assert.deepEqual(record(tc, 'a.b', T, null, 'r', { people: 'zz' }).visibleTo, ['zz']);
  assert.deepEqual(record(tc, 'a.b', T, null, 'r', { people: ['zz', 'aa', 'zz'] }).visibleTo, ['aa', 'zz']);
  assert.deepEqual(record(tc, 'a.b', T, null, 'r', { people: 'esk', visibleTo: ['glutreiter'] }).visibleTo, ['esk', 'glutreiter']);
  assert.deepEqual(record(tc, 'a.b', T, null, 'r', { people: 'esk', visibleTo: 'all' }).visibleTo, ['all']);
  assert.deepEqual(record(tc, 'a.b', T, null, 'r', { people: [undefined, null] }).visibleTo, ['all']);
});

test('record step and source default to the context and can be overridden', () => {
  const { tc } = setup();
  tc.step = 'research';
  tc.source = 'agent:world';
  const T = { kind: 'campaign', id: 'c' };
  const a = record(tc, 'a.b', T, null, 'r');
  assert.equal(a.step, 'research');
  assert.equal(a.source, 'agent:world');
  const b = record(tc, 'a.b', T, null, 'r', { step: 'council', source: 'player' });
  assert.equal(b.step, 'council');
  assert.equal(b.source, 'player');
  valid(a);
  valid(b);
});

test('record limits reason (200, empty becomes a default), refs (8 unique, 80 chars) and target id (80)', () => {
  const { tc } = setup();
  const T = { kind: 'campaign', id: 'c'.repeat(100) };
  const e = record(tc, 'a.b', T, null, 'x'.repeat(300), { refs: [...Array(12).keys()].map((i) => `r${i}`).concat(['r0', 'q'.repeat(100)]) });
  assert.equal(e.reason.length, 200);
  assert.ok(e.reason.endsWith('...'));
  assert.equal(e.target.id.length, 80);
  assert.equal(e.refs.length, 8);
  assert.equal(new Set(e.refs).size, 8);
  const long = record(tc, 'a.b', T, null, 'r', { refs: ['q'.repeat(100)] });
  assert.equal(long.refs[0].length, 80);
  assert.equal(record(tc, 'a.b', T, null, '   ').reason, 'kernel rule');
  assert.equal(record(tc, 'a.b', T, null, undefined).reason, 'kernel rule');
  valid(e);
});

test('setPeople writes the value, logs one entry with before and after, and visibleTo the people', () => {
  const { tc } = setup();
  assert.equal(setPeople(tc, P, 'population.core', 5, 'growth'), true);
  assert.equal(tc.state.peoples[P].population.core, 5);
  assert.equal(tc.log.length, 1);
  const e = last(tc);
  assert.deepEqual(e.target, { kind: 'people', id: P });
  assert.deepEqual(e.change, { field: 'population.core', before: 3, after: 5 });
  assert.deepEqual(e.visibleTo, [P]);
  assert.equal(e.reason, 'growth');
  assert.equal(e.kind, 'people.population');
  valid(e);
});

test('setPeople for an unchanged value (also an equal object) logs nothing', () => {
  const { tc } = setup();
  assert.equal(setPeople(tc, P, 'population.core', 3, 'same'), false);
  assert.equal(setPeople(tc, P, 'population.assigned', { nahrung: 2, material: 1 }, 'same object'), false);
  assert.equal(tc.log.length, 0);
});

test('setPeople deep-copies the value, creates missing path parts and deletes on undefined', () => {
  const { tc } = setup();
  const list = [{ id: 'a' }];
  setPeople(tc, P, 'statuses', list, 'add');
  list[0].id = 'changed';
  assert.equal(tc.state.peoples[P].statuses[0].id, 'a');
  setPeople(tc, P, 'modules.kern.flags.ritus~x', true, 'flag');
  assert.equal(tc.state.peoples[P].modules.kern.flags['ritus~x'], true);
  setPeople(tc, P, 'modules.kern.flags.ritus~x', undefined, 'unset');
  assert.equal(Object.hasOwn(tc.state.peoples[P].modules.kern.flags, 'ritus~x'), false);
  assert.deepEqual(last(tc).change, { field: 'modules.kern.flags.ritus~x', before: true, after: null });
});

test('setPeople takes kind, source and refs from opts and adds further people to visibleTo', () => {
  const { tc } = setup();
  setPeople(tc, P, 'standing', 2, 'r', { kind: 'people.standing', source: 'player', refs: ['x'], people: 'esk' });
  const e = last(tc);
  assert.equal(e.kind, 'people.standing');
  assert.equal(e.source, 'player');
  assert.deepEqual(e.refs, ['x']);
  assert.deepEqual(e.visibleTo, ['esk', P].sort());
});

test('addPeople adds, logs the applied delta and returns applied and missing', () => {
  const { tc } = setup();
  const r = addPeople(tc, P, 'resources.nahrung', 3, 'harvest');
  assert.deepEqual(r, { applied: 3, missing: 0 });
  assert.equal(tc.state.peoples[P].resources.nahrung, 9);
  assert.deepEqual(last(tc).change, { field: 'resources.nahrung', delta: 3 });
  assert.equal(tc.log.length, 1);
  valid(last(tc));
});

test('addPeople clamps at the floor and reports the swallowed part as missing', () => {
  const { tc } = setup();
  const r = addPeople(tc, P, 'resources.nahrung', -10, 'famine');
  assert.deepEqual(r, { applied: -6, missing: 4 });
  assert.equal(tc.state.peoples[P].resources.nahrung, 0);
  assert.deepEqual(last(tc).change, { field: 'resources.nahrung', delta: -6 });
});

test('addPeople clamps at the ceiling and honours min and max options', () => {
  const { tc } = setup();
  assert.deepEqual(addPeople(tc, P, 'resources.nahrung', 2000, 'x'), { applied: 993, missing: 0 });
  assert.equal(tc.state.peoples[P].resources.nahrung, 999);
  assert.deepEqual(addPeople(tc, P, 'population.core', 10, 'x', { max: 4 }), { applied: 1, missing: 0 });
  assert.deepEqual(addPeople(tc, P, 'population.core', -10, 'x', { min: 1 }), { applied: -3, missing: 7 });
  assert.equal(tc.state.peoples[P].population.core, 1);
});

test('addPeople without effect (zero delta or already at the bound) logs nothing', () => {
  const { tc } = setup();
  assert.deepEqual(addPeople(tc, P, 'resources.nahrung', 0, 'x'), { applied: 0, missing: 0 });
  addPeople(tc, P, 'resources.erz', -3, 'x');
  assert.equal(tc.log.length, 0);
  assert.deepEqual(addPeople(tc, P, 'resources.erz', -3, 'x'), { applied: 0, missing: 3 });
  addPeople(tc, P, 'resources.nahrung', 993, 'fill');
  const n = tc.log.length;
  addPeople(tc, P, 'resources.nahrung', 5, 'over');
  assert.equal(tc.log.length, n);
});

test('addPeople treats a missing numeric field as 0', () => {
  const { tc } = setup();
  assert.deepEqual(addPeople(tc, P, 'shortfall.nahrung', 2, 'x'), { applied: 2, missing: 0 });
  assert.equal(tc.state.peoples[P].shortfall.nahrung, 2);
});

test('addResource logs kind resource.change within 0..999', () => {
  const { tc } = setup();
  const r = addResource(tc, P, 'material', -5, 'build');
  assert.deepEqual(r, { applied: -3, missing: 2 });
  assert.equal(last(tc).kind, 'resource.change');
  assert.equal(tc.state.peoples[P].resources.material, 0);
});

test('setMember changes a field, logs one member entry visible to the people, and skips equal values', () => {
  const { tc } = setup();
  assert.equal(setMember(tc, P, 'ulrun', 'loyalty', 5, 'oath'), true);
  assert.equal(tc.state.peoples[P].council.find((m) => m.id === 'ulrun').loyalty, 5);
  const e = last(tc);
  assert.deepEqual(e.target, { kind: 'member', id: 'ulrun' });
  assert.deepEqual(e.change, { field: 'loyalty', before: 3, after: 5 });
  assert.deepEqual(e.visibleTo, [P]);
  assert.equal(e.kind, 'member.loyalty');
  assert.equal(setMember(tc, P, 'ulrun', 'loyalty', 5, 'again'), false);
  assert.equal(setMember(tc, P, 'niemand', 'loyalty', 1, 'x'), false);
  assert.equal(tc.log.length, 1);
  valid(e);
});

test('changeLoyalty applies the change, logs the applied delta once', () => {
  const { tc } = setup();
  assert.equal(changeLoyalty(tc, P, 'torhild', 1, 'gift'), 1);
  assert.equal(tc.state.peoples[P].council.find((m) => m.id === 'torhild').loyalty, 2);
  assert.equal(tc.log.length, 1);
  assert.deepEqual(last(tc).change, { field: 'loyalty', delta: 1 });
  assert.deepEqual(last(tc).target, { kind: 'member', id: 'torhild' });
  valid(last(tc));
});

test('changeLoyalty caps one call at +-2', () => {
  const { tc } = setup();
  assert.equal(changeLoyalty(tc, P, 'torhild', 5, 'big'), 2);
  assert.equal(changeLoyalty(tc, P, 'garmund', -5, 'big'), -2);
  assert.equal(tc.state.peoples[P].council.find((m) => m.id === 'torhild').loyalty, 3);
  assert.equal(tc.state.peoples[P].council.find((m) => m.id === 'garmund').loyalty, -4);
});

test('changeLoyalty cap holds per member across all calls of the turn and tracks the net change', () => {
  const { tc } = setup();
  assert.equal(changeLoyalty(tc, P, 'torhild', 1, 'a'), 1);
  assert.equal(changeLoyalty(tc, P, 'torhild', 2, 'b'), 1);
  assert.equal(changeLoyalty(tc, P, 'torhild', 1, 'c'), 0);
  assert.equal(tc.state.peoples[P].council.find((m) => m.id === 'torhild').loyalty, 3);
  assert.equal(tc.log.length, 2);
  assert.equal(changeLoyalty(tc, P, 'torhild', -2, 'd'), -2);
  assert.equal(changeLoyalty(tc, P, 'torhild', -2, 'e'), -2);
  assert.equal(changeLoyalty(tc, P, 'torhild', -2, 'f'), 0);
  assert.equal(tc.state.peoples[P].council.find((m) => m.id === 'torhild').loyalty, -1);
  assert.equal(changeLoyalty(tc, P, 'ulrun', 2, 'other member'), 2);
});

test('changeLoyalty clamps to -5..5 and a clamped-out change logs nothing', () => {
  const { tc } = setup();
  assert.equal(changeLoyalty(tc, P, 'ulrun', 2, 'x', { cap: 9 }), 2);
  assert.equal(tc.state.peoples[P].council.find((m) => m.id === 'ulrun').loyalty, 5);
  const n = tc.log.length;
  assert.equal(changeLoyalty(tc, P, 'ulrun', 1, 'x', { cap: 9 }), 0);
  assert.equal(tc.log.length, n);
  assert.equal(changeLoyalty(tc, P, 'garmund', -9, 'x', { cap: 9 }), -3);
  assert.equal(tc.state.peoples[P].council.find((m) => m.id === 'garmund').loyalty, -5);
});

test('changeLoyalty ignores zero deltas and unknown members', () => {
  const { tc } = setup();
  assert.equal(changeLoyalty(tc, P, 'ulrun', 0, 'x'), 0);
  assert.equal(changeLoyalty(tc, P, 'niemand', 1, 'x'), 0);
  assert.equal(changeLoyalty(tc, 'nopeople', 'ulrun', 1, 'x'), 0);
  assert.equal(tc.log.length, 0);
});

test('setControl sets and releases control with one entry visible to old and new holder', () => {
  const { tc } = setup();
  const region = Object.keys(tc.state.map.control).find((r) => tc.state.map.control[r] === 'esk');
  assert.equal(setControl(tc, region, P, 'conquered'), true);
  assert.equal(tc.state.map.control[region], P);
  const e = last(tc);
  assert.deepEqual(e.target, { kind: 'region', id: region });
  assert.deepEqual(e.change, { field: 'control', before: 'esk', after: P });
  assert.deepEqual(e.visibleTo, ['esk', P].sort());
  valid(e);
  assert.equal(setControl(tc, region, P, 'again'), false);
  assert.equal(setControl(tc, region, null, 'released'), true);
  assert.equal(tc.state.map.control[region], null);
  assert.deepEqual(last(tc).change, { field: 'control', before: P, after: null });
  assert.equal(tc.log.length, 2);
});

test('setControl on a free region logs the first claim, and releasing an unclaimed region is a no-op', () => {
  const { tc } = setup();
  assert.equal(setControl(tc, '5:5:0', P, 'claim'), true);
  assert.deepEqual(last(tc).change, { field: 'control', before: null, after: P });
  const n = tc.log.length;
  assert.equal(setControl(tc, '6:6:0', null, 'release of nothing'), false);
  assert.equal(tc.log.length, n);
});

test('setRelation clamps the value to -3..3, creates a missing relation and logs before and after', () => {
  const { tc } = setup();
  assert.equal(setRelation(tc, P, 'esk', { value: 9 }, 'gift'), true);
  assert.equal(tc.state.relations['esk|hochweide'].value, 3);
  const e = last(tc);
  assert.deepEqual(e.target, { kind: 'relation', id: 'esk|hochweide' });
  assert.equal(e.change.field, 'relation');
  assert.equal(e.change.before.value, 0);
  assert.equal(e.change.after.value, 3);
  assert.deepEqual(e.visibleTo, ['esk', P].sort());
  valid(e);
  assert.equal(setRelation(tc, P, 'esk', { value: -9 }, 'insult'), true);
  assert.equal(tc.state.relations['esk|hochweide'].value, -3);
});

test('setRelation with no effective change logs nothing, a missing relation is created', () => {
  const { tc } = setup();
  assert.equal(setRelation(tc, P, 'esk', { value: 0 }, 'nothing'), false);
  assert.equal(setRelation(tc, 'esk', P, { atWar: false }, 'nothing'), false);
  assert.equal(tc.log.length, 0);
  delete tc.state.relations['esk|hochweide'];
  assert.equal(setRelation(tc, P, 'esk', { value: 0 }, 'create'), true);
  assert.deepEqual(tc.state.relations['esk|hochweide'], { value: 0, atWar: false, since: 0, contact: false });
  assert.equal(tc.log.length, 1);
});

test('setRelation entry before is the value before this change, also on a second change in one turn', () => {
  const { tc } = setup();
  setRelation(tc, P, 'esk', { value: 1 }, 'first');
  setRelation(tc, P, 'esk', { value: 2 }, 'second');
  const [a, b] = tc.log;
  assert.equal(a.change.before.value, 0);
  assert.equal(a.change.after.value, 1);
  assert.equal(b.change.before.value, 1);
  assert.equal(b.change.after.value, 2);
});

test('setRelation entry before is not null when the relation was created earlier in the same turn', () => {
  const { tc } = setup();
  delete tc.s0.relations['esk|hochweide'];
  delete tc.state.relations['esk|hochweide'];
  setRelation(tc, P, 'esk', { value: 1 }, 'first');
  setRelation(tc, P, 'esk', { value: 2 }, 'second');
  assert.equal(tc.log[1].change.before.value, 1);
});

test('noteChange and notice write one entry each, notice without a change', () => {
  const { tc } = setup();
  const n = noteChange(tc, 'unit.spawn', { kind: 'unit', id: 'u-1' }, 'units', null, { id: 'u-1' }, 'spawn', { people: P });
  assert.deepEqual(n.change, { field: 'units', before: null, after: { id: 'u-1' } });
  assert.deepEqual(n.visibleTo, [P]);
  const m = notice(tc, 'probe.resolved', { kind: 'people', id: P }, 'rolled', { people: P });
  assert.equal(m.change, null);
  assert.equal(tc.log.length, 2);
  valid(n);
  valid(m);
});

test('noteChange snapshots its values', () => {
  const { tc } = setup();
  const obj = { a: 1 };
  const e = noteChange(tc, 'x.y', { kind: 'campaign', id: 'c' }, 'f', obj, obj, 'r');
  obj.a = 2;
  assert.equal(e.change.before.a, 1);
  assert.equal(e.change.after.a, 1);
});

test('fireHook collects hooks with a copy of the tags and writes no entry', () => {
  const { tc } = setup();
  const tags = ['a'];
  fireHook(tc, P, 'use:build', tags);
  tags.push('b');
  fireHook(tc, 'esk', 'contact');
  assert.deepEqual(tc.hooks, [{ people: P, hook: 'use:build', tags: ['a'] }, { people: 'esk', hook: 'contact', tags: [] }]);
  assert.equal(tc.log.length, 0);
});

test('every helper writes exactly one entry per effective change', () => {
  const { tc } = setup();
  const counts = [];
  const step = (f) => { const before = tc.log.length; f(); counts.push(tc.log.length - before); };
  step(() => setPeople(tc, P, 'standing', 1, 'r'));
  step(() => addPeople(tc, P, 'resources.nahrung', 1, 'r'));
  step(() => addResource(tc, P, 'material', 1, 'r'));
  step(() => setMember(tc, P, 'ulrun', 'hollow', true, 'r'));
  step(() => changeLoyalty(tc, P, 'ulrun', -1, 'r'));
  step(() => setControl(tc, '7:7:0', P, 'r'));
  step(() => setRelation(tc, P, 'esk', { value: 1 }, 'r'));
  step(() => noteChange(tc, 'a.b', { kind: 'campaign', id: 'c' }, 'f', 1, 2, 'r'));
  step(() => notice(tc, 'a.b', { kind: 'campaign', id: 'c' }, 'r'));
  assert.deepEqual(counts, [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  const ids = tc.log.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const e of tc.log) valid(e);
});

test('finish writes the rng back and appends the log to the chronicle', () => {
  const { tc } = setup();
  tc.rng.d10();
  const draws = tc.rng.state().s.slice();
  setPeople(tc, P, 'standing', 1, 'r');
  const next = finish(tc, { chronicleTurns: 8, chronicleMax: 2000 });
  assert.equal(next, tc.state);
  assert.deepEqual(next.rng.s, draws);
  assert.equal(next.chronicle.at(-1).reason, 'r');
});

test('finish trims the chronicle to the last chronicleTurns turns and to chronicleMax entries', () => {
  const { env, state } = freshState();
  const s = structuredClone(state);
  s.turn = 10;
  s.chronicle = [3, 4, 7, 8, 9, 10].map((t, i) => ({ id: `T${t}-e${i}`, turn: t }));
  const tc = createContext(s, env);
  const next = finish(tc, { chronicleTurns: 3, chronicleMax: 2000 });
  assert.deepEqual(next.chronicle.map((e) => e.turn), [8, 9, 10]);

  const s2 = structuredClone(state);
  s2.turn = 10;
  s2.chronicle = [7, 8, 9, 10].map((t, i) => ({ id: `T${t}-e${i}`, turn: t }));
  const next2 = finish(createContext(s2, env), { chronicleTurns: 8, chronicleMax: 2 });
  assert.deepEqual(next2.chronicle.map((e) => e.turn), [9, 10]);
});

test('finish keeps this turn and drops nothing when the window is wide', () => {
  const { tc, state } = setup();
  const before = state.chronicle.length;
  record(tc, 'a.b', { kind: 'campaign', id: 'c' }, null, 'r');
  const next = finish(tc, { chronicleTurns: 8, chronicleMax: 2000 });
  assert.equal(next.chronicle.length, before + 1);
});

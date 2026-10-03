import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  standingOf, ofOp, activations, applyOnce, applyOnceList, changeUnitStrength, flagValue, setKern,
} from '../../../engine/core/effects.js';
import { evalCondition } from '../../../engine/core/conditions.js';
import { regionInfo } from '../../../engine/world/index.js';
import { validate } from '../../../engine/content/schema.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { CONTENT, ENTWICKLUNGEN } from '../../fixtures/engine/k1/pack.js';
import { freshState, ctxOf, cxOf, clone, PLAYER } from '../../fixtures/engine/k1/foundation.js';

const P = PLAYER;
// hochweide: nahrung 6, material 3, wissen 2, erz 0, herden 4; core 3; standing 0; zustimmung 0;
// council ulrun (3, favor herde+weide, oppose krieg), torhild (1, favor geist+feuer, oppose handel),
// garmund (-2, favor wege+erkundung, oppose mauern); camp s-hochweide at 0,1.
const known = (ref, over = {}) => ({ ref, since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null, ...over });
const peopleOf = (s) => s.peoples[P];
const memberOf = (s, id) => peopleOf(s).council.find((m) => m.id === id);

const assertValidState = (state) => {
  const { derived, ...rest } = state;
  assert.deepEqual(validate(SCHEMAS.campaign, rest), []);
};

// Runs one effect in a fresh context; `edit(state, env)` prepares the opening state.
function run(effect, { edit, ctx, who = P, patch } = {}) {
  const base = freshState(7, patch);
  const state = clone(base.state);
  if (edit) edit(state, base.env);
  const tc = ctxOf(state, base.env);
  const ret = applyOnce(tc, who, effect, { reason: 'test', ...ctx });
  assertValidState(tc.state);
  return { tc, ret, env: base.env, state: tc.state, s0: state, log: tc.log };
}

// standingOf and helpers

test('standingOf lists effects, then price of each development with its source', () => {
  const { env, state } = freshState();
  const list = standingOf(state, env, P);
  assert.deepEqual(list.map((s) => [s.source.kind, s.source.key, s.effect.op, s.source.price ?? false]), [
    ['development', 'dev:wanderhirten@1', 'stat.mod', false],
    ['development', 'dev:sippenrat@1', 'governance.rule', false],
    ['development', 'dev:sippenrat@1', 'resource.flow', true],
  ]);
  assert.equal(list[0].source.label, 'Wanderhirten');
  assert.equal(list[0].source.ref, 'wanderhirten@1');
});

test('standingOf leaves out a foreign lebensweise, an institution not in force, suspended and not yet effective developments', () => {
  const { env, state } = freshState();
  const s = clone(state);
  const k = peopleOf(s).developments.known;
  k.push(known('talbauern@1'), known('marktrecht@1'), known('filzjurten@1', { effectiveFrom: 3 }), known('hirtenhunde@1', { state: 'suspended', suspendedSince: 0 }));
  const keys = standingOf(s, env, P).map((x) => x.source.key);
  for (const gone of ['dev:talbauern@1', 'dev:marktrecht@1', 'dev:filzjurten@1', 'dev:hirtenhunde@1']) assert.ok(!keys.includes(gone), gone);
  assert.ok(standingOf(s, env, P, 3).some((x) => x.source.key === 'dev:filzjurten@1'), 'effective from turn 3');
  assert.ok(!standingOf(s, env, P, 2).some((x) => x.source.key === 'dev:filzjurten@1'));
  peopleOf(s).developments.instituted.push('marktrecht@1');
  assert.ok(standingOf(s, env, P).some((x) => x.source.key === 'dev:marktrecht@1'));
});

test('standingOf counts a building once per settlement from the turn after it was built', () => {
  const { env, state } = freshState();
  const s = clone(state);
  const camp = s.map.settlements.find((x) => x.id === 's-hochweide');
  camp.buildings.push({ ref: 'wachfeuer@1', since: 0, state: 'active' }, { ref: 'wachfeuer@1', since: 0, state: 'active' });
  assert.equal(standingOf(s, env, P).some((x) => x.source.kind === 'building'), false, 'built this turn');
  s.turn = 1;
  const b = standingOf(s, env, P).filter((x) => x.source.kind === 'building');
  assert.deepEqual(b.map((x) => [x.source.key, x.effect.op]), [['bld:s-hochweide:wachfeuer@1', 'probe.mod'], ['bld:s-hochweide:wachfeuer@1', 'sight.mod']]);
  camp.buildings[0].state = 'suspended';
  camp.buildings[1].state = 'suspended';
  assert.equal(standingOf(s, env, P).some((x) => x.source.kind === 'building'), false);
});

test('standingOf includes statuses until their last turn', () => {
  const { env, state } = freshState();
  const s = clone(state);
  const eff = [{ op: 'probe.mod', tags: ['bau'], amount: 1 }];
  peopleOf(s).statuses.push({ id: 'laufend', effects: eff, until: null, endsOn: null }, { id: 'bis-5', effects: eff, until: 5, endsOn: null });
  s.turn = 5;
  const keys = (x) => standingOf(x, env, P).filter((e) => e.source.kind === 'status').map((e) => e.source.key);
  assert.deepEqual(keys(s), ['status:laufend', 'status:bis-5']);
  s.turn = 6;
  assert.deepEqual(keys(s), ['status:laufend']);
  assert.deepEqual(standingOf(s, env, P).find((e) => e.source.key === 'status:laufend').source, { kind: 'status', key: 'status:laufend', label: 'laufend' });
});

test('standingOf of an unknown people is empty; ofOp filters by op; activations merge module bindings', () => {
  const { env, state } = freshState();
  assert.deepEqual(standingOf(state, env, 'niemand'), []);
  const s = clone(state);
  peopleOf(s).developments.known.push(known('salzpfad@1'), known('ahnensprache@1'));
  const list = standingOf(s, env, P);
  assert.deepEqual(ofOp(list, 'stat.mod').map((x) => x.effect.stat), ['mobilitaet']);
  assert.deepEqual(activations(list), { handel: { currency: 'salz' }, magie: { source: 'rauchkraut' } });
  assert.deepEqual(activations([]), {});
  const merged = activations([
    { effect: { op: 'module.activate', module: 'handel', bind: { a: 'x' } }, source: {} },
    { effect: { op: 'module.activate', module: 'handel', bind: { b: 'y' } }, source: {} },
  ]);
  assert.deepEqual(merged, { handel: { a: 'x', b: 'y' } });
});

// resource.delta

test('resource.delta adds a stock with one entry', () => {
  const { ret, state, log } = run({ op: 'resource.delta', res: 'nahrung', amount: 3 });
  assert.equal(ret, true);
  assert.equal(peopleOf(state).resources.nahrung, 9);
  assert.equal(log.length, 1);
  assert.equal(log[0].kind, 'resource.change');
  assert.deepEqual(log[0].change, { field: 'resources.nahrung', delta: 3 });
  assert.deepEqual(log[0].target, { kind: 'people', id: P });
  assert.deepEqual(log[0].visibleTo, [P]);
  assert.equal(log[0].reason, 'test');
});

test('resource.delta below zero floors the stock and books the shortfall', () => {
  const { ret, state, log } = run({ op: 'resource.delta', res: 'nahrung', amount: -10 });
  assert.equal(ret, true);
  assert.equal(peopleOf(state).resources.nahrung, 0);
  assert.equal(peopleOf(state).shortfall.nahrung, 4);
  assert.equal(log.length, 2);
  assert.deepEqual(log[0].change, { field: 'resources.nahrung', delta: -6 });
  assert.equal(log[1].kind, 'shortfall');
  assert.deepEqual(log[1].change, { field: 'shortfall.nahrung', delta: 4 });
  assert.match(log[1].reason, /4 missing/);
});

test('resource.delta on an empty stock books the whole amount as shortfall and reports a change', () => {
  const { ret, state, log } = run({ op: 'resource.delta', res: 'erz', amount: -3 });
  assert.equal(peopleOf(state).resources.erz, 0);
  assert.equal(peopleOf(state).shortfall.erz, 3);
  assert.equal(log.length, 1);
  assert.equal(ret, true);
});

test('resource.delta on a full stock is no change and logs nothing', () => {
  const { ret, log } = run({ op: 'resource.delta', res: 'nahrung', amount: 5 }, { edit: (s) => { peopleOf(s).resources.nahrung = 999; } });
  assert.equal(ret, false);
  assert.equal(log.length, 0);
});

test('resource.delta keeps its stock within 0..999', () => {
  const { state } = run({ op: 'resource.delta', res: 'nahrung', amount: 10 }, { edit: (s) => { peopleOf(s).resources.nahrung = 995; } });
  assert.equal(peopleOf(state).resources.nahrung, 999);
});

// population.delta

test('population.delta adds clans and keeps at least one clan alive, at most 99', () => {
  assert.equal(run({ op: 'population.delta', amount: 2 }).state.peoples[P].population.core, 5);
  const down = run({ op: 'population.delta', amount: -3 });
  assert.equal(peopleOf(down.state).population.core, 1);
  assert.deepEqual(down.log[0].change, { field: 'population.core', delta: -2 });
  assert.equal(down.log[0].kind, 'population.change');
  assert.equal(peopleOf(run({ op: 'population.delta', amount: 3 }, { edit: (s) => { peopleOf(s).population.core = 98; } }).state).population.core, 99);
});

test('population.delta at the floor of one clan is no change', () => {
  const r = run({ op: 'population.delta', amount: -1 }, { edit: (s) => { peopleOf(s).population.core = 1; } });
  assert.equal(r.ret, false);
  assert.equal(r.log.length, 0);
});

test('population.delta on a people with no clans does not bring one back from -1', () => {
  const r = run({ op: 'population.delta', amount: -1 }, { edit: (s) => { peopleOf(s).population.core = 0; } });
  assert.equal(peopleOf(r.state).population.core, 0);
  assert.equal(r.log.length, 0);
});

// loyalty.delta

const loyalties = (s) => Object.fromEntries(peopleOf(s).council.map((m) => [m.id, m.loyalty]));

test('loyalty.delta all hits every member, one entry each', () => {
  const r = run({ op: 'loyalty.delta', target: 'all', amount: 1 });
  assert.deepEqual(loyalties(r.state), { ulrun: 4, torhild: 2, garmund: -1 });
  assert.equal(r.log.length, 3);
  assert.ok(r.log.every((e) => e.target.kind === 'member' && e.change.delta === 1));
  assert.equal(r.ret, true);
});

test('loyalty.delta favor:<tag> and oppose:<tag> pick members by goal', () => {
  assert.deepEqual(loyalties(run({ op: 'loyalty.delta', target: 'favor:herde', amount: 1 }).state), { ulrun: 4, torhild: 1, garmund: -2 });
  assert.deepEqual(loyalties(run({ op: 'loyalty.delta', target: 'favor:geist', amount: -1 }).state), { ulrun: 3, torhild: 0, garmund: -2 });
  assert.deepEqual(loyalties(run({ op: 'loyalty.delta', target: 'oppose:handel', amount: 1 }).state), { ulrun: 3, torhild: 2, garmund: -2 });
  assert.deepEqual(loyalties(run({ op: 'loyalty.delta', target: 'oppose:krieg', amount: -2 }).state), { ulrun: 1, torhild: 1, garmund: -2 });
  const none = run({ op: 'loyalty.delta', target: 'favor:krieg', amount: 1 });
  assert.equal(none.ret, false);
  assert.equal(none.log.length, 0);
});

test('loyalty.delta with a member id targets that member only; an unknown member changes nothing', () => {
  assert.deepEqual(loyalties(run({ op: 'loyalty.delta', target: 'garmund', amount: 2 }).state), { ulrun: 3, torhild: 1, garmund: 0 });
  const r = run({ op: 'loyalty.delta', target: 'niemand', amount: 2 });
  assert.equal(r.ret, false);
  assert.equal(r.log.length, 0);
});

test('loyalty.delta respects the cap of 2 per member and turn across effects and the -5..5 clamp', () => {
  const s = freshState();
  const tc = ctxOf(clone(s.state), s.env);
  const fx = (amount) => applyOnce(tc, P, { op: 'loyalty.delta', target: 'torhild', amount }, { reason: 't' });
  assert.equal(fx(2), true);
  assert.equal(fx(1), false, 'cap used up');
  assert.equal(memberOf(tc.state, 'torhild').loyalty, 3);
  assert.equal(fx(-2), true);
  assert.equal(memberOf(tc.state, 'torhild').loyalty, 1);
  const top = run({ op: 'loyalty.delta', target: 'ulrun', amount: 2 }, { edit: (st) => { memberOf(st, 'ulrun').loyalty = 5; } });
  assert.equal(top.ret, false);
  assert.equal(memberOf(top.state, 'ulrun').loyalty, 5);
});

// loyalty.bind

test('loyalty.bind sets the loyalty and marks the member hollow, one entry per field', () => {
  const r = run({ op: 'loyalty.bind', target: 'garmund', value: 4 });
  assert.equal(r.ret, true);
  assert.equal(memberOf(r.state, 'garmund').loyalty, 4);
  assert.equal(memberOf(r.state, 'garmund').hollow, true);
  assert.deepEqual(r.log.map((e) => [e.target.id, e.change.field]), [['garmund', 'loyalty'], ['garmund', 'hollow']]);
  assert.deepEqual(r.log[0].change, { field: 'loyalty', before: -2, after: 4 });
});

test('loyalty.bind falls back to the context member and skips without any member', () => {
  const r = run({ op: 'loyalty.bind', target: 'unbekannt', value: 3 }, { ctx: { target: { member: 'torhild' } } });
  assert.equal(memberOf(r.state, 'torhild').loyalty, 3);
  assert.equal(memberOf(r.state, 'torhild').hollow, true);
  const none = run({ op: 'loyalty.bind', target: 'unbekannt', value: 3 });
  assert.equal(none.ret, false);
  assert.equal(none.log.length, 1);
  assert.equal(none.log[0].kind, 'effect.skipped');
  assert.match(none.log[0].reason, /loyalty\.bind/);
});

test('loyalty.bind on a member already bound to that value changes nothing', () => {
  const edit = (s) => { Object.assign(memberOf(s, 'ulrun'), { loyalty: 3, hollow: true }); };
  const r = run({ op: 'loyalty.bind', target: 'ulrun', value: 3 }, { edit });
  assert.equal(r.log.length, 0);
  assert.equal(r.ret, false);
});

// relation.delta

const relValue = (s, a, b) => s.relations[[a, b].sort().join('|')]?.value;

test('relation.delta $target changes the relation with the context people', () => {
  const r = run({ op: 'relation.delta', people: '$target', amount: 2 }, { ctx: { target: { people: 'esk' } } });
  assert.equal(relValue(r.state, P, 'esk'), 2);
  assert.equal(relValue(r.state, P, 'glutreiter'), 0);
  assert.equal(r.log.length, 1);
  assert.deepEqual(r.log[0].target, { kind: 'relation', id: 'esk|hochweide' });
  const none = run({ op: 'relation.delta', people: '$target', amount: 2 });
  assert.equal(none.ret, false);
  assert.equal(none.log[0].kind, 'effect.skipped');
});

test('relation.delta all changes every other people, an id changes that one, itself and strangers are skipped', () => {
  const all = run({ op: 'relation.delta', people: 'all', amount: -1 });
  assert.equal(relValue(all.state, P, 'esk'), -1);
  assert.equal(relValue(all.state, P, 'glutreiter'), -1);
  assert.equal(relValue(all.state, 'esk', 'glutreiter'), 0);
  assert.equal(all.log.length, 2);
  const one = run({ op: 'relation.delta', people: 'glutreiter', amount: 1 });
  assert.equal(relValue(one.state, P, 'glutreiter'), 1);
  assert.equal(relValue(one.state, P, 'esk'), 0);
  for (const people of [P, 'niemand']) {
    const r = run({ op: 'relation.delta', people, amount: 1 });
    assert.equal(r.ret, false, people);
    assert.deepEqual(r.log.map((e) => e.kind), ['effect.skipped'], people);
  }
});

test('relation.delta neighbours reaches only peoples with a settlement near an own one (read from the opening state)', () => {
  const far = (s) => { s.map.settlements.find((x) => x.people === 'glutreiter').tile = '90,0'; };
  const r = run({ op: 'relation.delta', people: 'neighbours', amount: 1 }, { edit: far });
  assert.equal(relValue(r.state, P, 'esk'), 1);
  assert.equal(relValue(r.state, P, 'glutreiter'), 0);
  const both = run({ op: 'relation.delta', people: 'neighbours', amount: 1 });
  assert.equal(relValue(both.state, P, 'esk'), 1);
  assert.equal(relValue(both.state, P, 'glutreiter'), 1);
  const nobody = run({ op: 'relation.delta', people: 'neighbours', amount: 1 }, { edit: (s) => { for (const x of s.map.settlements) if (x.people !== P) x.tile = '90,0'; } });
  assert.equal(nobody.ret, false);
  assert.equal(nobody.log[0].kind, 'effect.skipped');
});

test('relation.delta clamps to -3..3 and a clamped-out change logs nothing and reports no change', () => {
  const up = run({ op: 'relation.delta', people: 'esk', amount: 2 }, { edit: (s) => { s.relations['esk|hochweide'].value = 2; } });
  assert.equal(relValue(up.state, P, 'esk'), 3);
  const edge = (s) => { s.relations['esk|hochweide'].value = 3; };
  const top = run({ op: 'relation.delta', people: 'esk', amount: 2 }, { edit: edge });
  assert.equal(relValue(top.state, P, 'esk'), 3);
  assert.equal(top.log.length, 0);
  assert.equal(top.ret, false);
  const low = run({ op: 'relation.delta', people: 'esk', amount: -2 }, { edit: (s) => { s.relations['esk|hochweide'].value = -2; } });
  assert.equal(relValue(low.state, P, 'esk'), -3);
});

test('relation.delta creates a relation that does not exist yet', () => {
  const r = run({ op: 'relation.delta', people: 'esk', amount: 1 }, { edit: (s) => { delete s.relations['esk|hochweide']; } });
  assert.equal(relValue(r.state, P, 'esk'), 1);
});

// standing.delta

test('standing.delta moves the standing within 0..3', () => {
  assert.equal(peopleOf(run({ op: 'standing.delta', amount: 1 }).state).standing, 1);
  assert.equal(peopleOf(run({ op: 'standing.delta', amount: 1 }, { edit: (s) => { peopleOf(s).standing = 3; } }).state).standing, 3);
  assert.equal(peopleOf(run({ op: 'standing.delta', amount: -1 }, { edit: (s) => { peopleOf(s).standing = 1; } }).state).standing, 0);
  const floor = run({ op: 'standing.delta', amount: -1 });
  assert.equal(peopleOf(floor.state).standing, 0);
  assert.equal(floor.ret, false);
  assert.equal(floor.log.length, 0);
  const up = run({ op: 'standing.delta', amount: 1 });
  assert.equal(up.log[0].kind, 'people.standing');
  assert.deepEqual(up.log[0].change, { field: 'standing', delta: 1 });
});

// status.add

const STATUS_FX = [{ op: 'probe.mod', tags: ['bau'], amount: 1 }];

test('status.add appends a status with until = turn + duration and one entry', () => {
  const r = run({ op: 'status.add', id: 'segen', effects: STATUS_FX, duration: 3, endsOn: null }, { edit: (s) => { s.turn = 4; } });
  assert.deepEqual(peopleOf(r.state).statuses, [{ id: 'segen', effects: STATUS_FX, until: 7, endsOn: null }]);
  assert.equal(r.log.length, 1);
  assert.equal(r.log[0].kind, 'status.add');
  assert.equal(r.log[0].change.field, 'statuses');
  assert.equal(r.ret, true);
});

test('status.add without duration lasts until ended; endsOn setback is kept', () => {
  const r = run({ op: 'status.add', id: 'dauer', effects: STATUS_FX, duration: null, endsOn: 'setback' });
  assert.deepEqual(peopleOf(r.state).statuses[0], { id: 'dauer', effects: STATUS_FX, until: null, endsOn: 'setback' });
  const bare = run({ op: 'status.add', id: 'xx', effects: STATUS_FX });
  assert.deepEqual(peopleOf(bare.state).statuses[0], { id: 'xx', effects: STATUS_FX, until: null, endsOn: null });
});

test('status.add with an id already present replaces it (moved to the end)', () => {
  const edit = (s) => {
    peopleOf(s).statuses.push({ id: 'aa', effects: STATUS_FX, until: 2, endsOn: null }, { id: 'bb', effects: STATUS_FX, until: null, endsOn: null });
  };
  const r = run({ op: 'status.add', id: 'aa', effects: STATUS_FX, duration: 5 }, { edit });
  assert.deepEqual(peopleOf(r.state).statuses.map((x) => [x.id, x.until]), [['bb', null], ['aa', 5]]);
});

test('status.add keeps at most 12 statuses and drops the oldest', () => {
  const edit = (s) => {
    for (let i = 0; i < 12; i++) peopleOf(s).statuses.push({ id: `s-${String.fromCharCode(97 + i)}`, effects: STATUS_FX, until: null, endsOn: null });
  };
  const r = run({ op: 'status.add', id: 'neu', effects: STATUS_FX, duration: null }, { edit });
  const ids = peopleOf(r.state).statuses.map((x) => x.id);
  assert.equal(ids.length, 12);
  assert.equal(ids[0], 's-b');
  assert.equal(ids.at(-1), 'neu');
});

test('status.add copies its effects instead of sharing the content object', () => {
  const effects = clone(STATUS_FX);
  const r = run({ op: 'status.add', id: 'copy', effects, duration: 1 });
  effects[0].amount = 99;
  assert.equal(peopleOf(r.state).statuses[0].effects[0].amount, 1);
});

// token.add

test('token.add appends a token with a turn-scoped id, kind, tags and source from the reason', () => {
  const r = run({ op: 'token.add', kind: 'breakthrough', tags: ['bau'] }, { ctx: { reason: 'natural 10 on the venture' } });
  assert.deepEqual(peopleOf(r.state).tokens, [{ id: 'tok-t0-1', kind: 'breakthrough', tags: ['bau'], turn: 0, source: 'natural 10 on the venture' }]);
  assert.equal(r.log.length, 1);
  assert.equal(r.log[0].kind, 'token.add');
  assert.deepEqual(r.log[0].change, { field: 'tokens.tok-t0-1', before: null, after: peopleOf(r.state).tokens[0] });
  assert.deepEqual(r.log[0].visibleTo, [P]);
});

test('token.add numbers tokens of the same turn and limits the reason to 80 characters', () => {
  const s = freshState();
  const tc = ctxOf(clone(s.state), s.env);
  const reason = 'r'.repeat(120);
  applyOnce(tc, P, { op: 'token.add', kind: 'impulse', tags: [] }, { reason });
  applyOnce(tc, P, { op: 'token.add', kind: 'crisis', tags: ['aa', 'bb'] }, { reason });
  assert.deepEqual(peopleOf(tc.state).tokens.map((x) => x.id), ['tok-t0-1', 'tok-t0-2']);
  assert.equal(peopleOf(tc.state).tokens[0].source.length, 80);
  assertValidState(tc.state);
});

test('token.add keeps at most 20 tokens and drops the oldest', () => {
  const edit = (s) => {
    for (let i = 0; i < 20; i++) peopleOf(s).tokens.push({ id: `old-${i}`, kind: 'grievance', tags: [], turn: 0, source: 'x' });
  };
  const r = run({ op: 'token.add', kind: 'impulse', tags: [] }, { edit });
  const ids = peopleOf(r.state).tokens.map((x) => x.id);
  assert.equal(ids.length, 20);
  assert.equal(ids[0], 'old-1');
  assert.equal(ids.at(-1), 'tok-t0-1');
});

// unit.spawn

test('unit.spawn $home creates a unit of the type at the camp with the type strength', () => {
  const r = run({ op: 'unit.spawn', type: 'reiterschar@1', tile: '$home' });
  assert.equal(r.ret, true);
  assert.deepEqual(peopleOf(r.state).units, [{ id: 'u-1', type: 'reiterschar@1', strength: 2, tile: '0,1', state: 'moved', since: 0 }]);
  assert.equal(r.log.length, 1);
  assert.equal(r.log[0].kind, 'unit.spawn');
  assert.deepEqual(r.log[0].target, { kind: 'unit', id: 'u-1' });
  assert.deepEqual(r.log[0].visibleTo, [P]);
});

test('unit.spawn takes an explicit tile and numbers units after the highest id', () => {
  const edit = (s) => { peopleOf(s).units.push({ id: 'u-4', type: 'speerwall@1', strength: 3, tile: '0,1', state: 'ready', since: 0 }); };
  const r = run({ op: 'unit.spawn', type: 'speerwall@1', tile: '1,1' }, { edit });
  assert.deepEqual(peopleOf(r.state).units.map((u) => [u.id, u.tile, u.strength]), [['u-4', '0,1', 3], ['u-5', '1,1', 3]]);
});

test('unit.spawn skips an unknown type, a non-unit type and the limit of 40 units', () => {
  for (const type of ['nirgends@1', 'wachfeuer@1']) {
    const r = run({ op: 'unit.spawn', type, tile: '$home' });
    assert.equal(r.ret, false, type);
    assert.deepEqual(r.log.map((e) => e.kind), ['effect.skipped']);
    assert.equal(peopleOf(r.state).units.length, 0);
  }
  const edit = (s) => { for (let i = 1; i <= 40; i++) peopleOf(s).units.push({ id: `u-${i}`, type: 'speerwall@1', strength: 1, tile: '0,1', state: 'ready', since: 0 }); };
  const full = run({ op: 'unit.spawn', type: 'speerwall@1', tile: '$home' }, { edit });
  assert.equal(full.ret, false);
  assert.equal(peopleOf(full.state).units.length, 40);
  assert.match(full.log[0].reason, /unit limit/);
});

test('unit.spawn $home without a settlement skips', () => {
  const r = run({ op: 'unit.spawn', type: 'speerwall@1', tile: '$home' }, { edit: (s) => { s.map.settlements = s.map.settlements.filter((x) => x.people !== P); } });
  assert.equal(r.ret, false);
  assert.match(r.log[0].reason, /no home tile/);
});

// unit.delta and changeUnitStrength

const unitsEdit = (s) => {
  peopleOf(s).units.push({ id: 'u-1', type: 'speerwall@1', strength: 3, tile: '0,1', state: 'ready', since: 0 });
  s.peoples.esk.units.push(
    { id: 'u-1', type: 'speerwall@1', strength: 2, tile: '0,1', state: 'ready', since: 0 },
    { id: 'u-2', type: 'speerwall@1', strength: 2, tile: '5,5', state: 'ready', since: 0 },
  );
};

test('unit.delta $target changes one unit, clamped to 0..9, with a strength entry', () => {
  const r = run({ op: 'unit.delta', unit: '$target', strength: -2 }, { edit: unitsEdit, ctx: { target: { unit: { people: P, id: 'u-1' } } } });
  assert.equal(peopleOf(r.state).units[0].strength, 1);
  assert.equal(r.log.length, 1);
  assert.equal(r.log[0].kind, 'unit.strength');
  assert.deepEqual(r.log[0].change, { field: 'strength', delta: -2 });
  assert.deepEqual(r.log[0].target, { kind: 'unit', id: 'u-1' });
  const hi = run({ op: 'unit.delta', unit: '$target', strength: 3 }, {
    edit: (s) => { unitsEdit(s); peopleOf(s).units[0].strength = 8; },
    ctx: { target: { unit: { people: P, id: 'u-1' } } },
  });
  assert.equal(peopleOf(hi.state).units[0].strength, 9);
  assert.deepEqual(hi.log[0].change, { field: 'strength', delta: 1 });
});

test('unit.delta dissolves a unit that reaches strength 0 with one dissolution entry', () => {
  const r = run({ op: 'unit.delta', unit: '$target', strength: -3 }, { edit: unitsEdit, ctx: { target: { unit: { people: P, id: 'u-1' } } } });
  assert.equal(peopleOf(r.state).units.length, 0);
  assert.equal(r.log.length, 1);
  assert.equal(r.log[0].kind, 'unit.dissolved');
  assert.equal(r.log[0].change.field, 'units');
  assert.equal(r.log[0].change.before.id, 'u-1');
  assert.equal(r.log[0].change.after, null);
  assert.deepEqual(r.log[0].visibleTo, [P]);
});

test('unit.delta $all-on-tile hits the units of all peoples on the tile', () => {
  const r = run({ op: 'unit.delta', unit: '$all-on-tile', strength: -1 }, { edit: unitsEdit, ctx: { target: { tile: '0,1' } } });
  assert.equal(peopleOf(r.state).units[0].strength, 2);
  assert.deepEqual(r.state.peoples.esk.units.map((u) => [u.id, u.strength]), [['u-1', 1], ['u-2', 2]]);
  assert.equal(r.log.length, 2);
  assert.deepEqual(r.log.map((e) => e.visibleTo).flat().sort(), ['esk', P].sort());
});

test('unit.delta skips without a target', () => {
  for (const unit of ['$target', '$all-on-tile']) {
    const r = run({ op: 'unit.delta', unit, strength: -1 }, { edit: unitsEdit });
    assert.equal(r.ret, false, unit);
    assert.deepEqual(r.log.map((e) => e.kind), ['effect.skipped']);
  }
  const empty = run({ op: 'unit.delta', unit: '$all-on-tile', strength: -1 }, { edit: unitsEdit, ctx: { target: { tile: '9,9' } } });
  assert.equal(empty.ret, false);
});

test('changeUnitStrength returns the applied change and ignores unknown units and zero deltas', () => {
  const base = freshState();
  const s = clone(base.state);
  unitsEdit(s);
  const tc = ctxOf(s, base.env);
  assert.equal(changeUnitStrength(tc, P, 'u-1', 10, 'x'), 6);
  assert.equal(changeUnitStrength(tc, P, 'u-1', 1, 'x'), 0);
  assert.equal(changeUnitStrength(tc, P, 'u-9', 1, 'x'), 0);
  assert.equal(changeUnitStrength(tc, P, 'u-1', 0, 'x'), 0);
  assert.equal(changeUnitStrength(tc, P, 'u-1', -20, 'x'), -9);
  assert.equal(peopleOf(tc.state).units.length, 0);
  assert.equal(tc.log.length, 2);
});

// region.control

test('region.control $self takes a region from the context target; the old holder sees the entry', () => {
  const r = run({ op: 'region.control', region: '$target', people: '$self' }, { ctx: { target: { region: '0:-1:1' } } });
  assert.equal(r.state.map.control['0:-1:1'], P);
  assert.equal(r.log.length, 1);
  assert.deepEqual(r.log[0].change, { field: 'control', before: 'esk', after: P });
  assert.deepEqual(r.log[0].visibleTo, ['esk', P].sort());
  assert.equal(r.ret, true);
});

test('region.control with an explicit region and people null releases it', () => {
  const r = run({ op: 'region.control', region: '-1:0:0', people: null });
  assert.equal(r.state.map.control['-1:0:0'], null);
  assert.deepEqual(r.log[0].change, { field: 'control', before: P, after: null });
});

test('region.control skips without a target region and does nothing when the holder is unchanged', () => {
  const none = run({ op: 'region.control', region: '$target', people: '$self' });
  assert.equal(none.ret, false);
  assert.equal(none.log[0].kind, 'effect.skipped');
  const same = run({ op: 'region.control', region: '-1:0:0', people: '$self' });
  assert.equal(same.ret, false);
  assert.equal(same.log.length, 0);
});

// council.seat

test('council.seat opens a seat in the kernel slice with the current turn', () => {
  const r = run({ op: 'council.seat', role: 'haendlerin', favor: ['handel'], oppose: ['krieg'] }, { edit: (s) => { s.turn = 2; } });
  assert.deepEqual(peopleOf(r.state).modules.kern.seats, [{ role: 'haendlerin', favor: ['handel'], oppose: ['krieg'], since: 2 }]);
  assert.equal(r.log.length, 1);
  assert.equal(r.log[0].kind, 'council.seat');
  assert.equal(r.log[0].change.field, 'modules.kern.seats');
  assert.equal(r.ret, true);
});

test('council.seat appends to earlier seats and creates a missing kernel slice', () => {
  const edit = (s) => { delete peopleOf(s).modules.kern; };
  const base = freshState();
  const s = clone(base.state);
  edit(s);
  const tc = ctxOf(s, base.env);
  applyOnce(tc, P, { op: 'council.seat', role: 'a-rolle', favor: [], oppose: [] }, { reason: 't' });
  applyOnce(tc, P, { op: 'council.seat', role: 'b-rolle', favor: [], oppose: [] }, { reason: 't' });
  assert.deepEqual(peopleOf(tc.state).modules.kern.seats.map((x) => x.role), ['a-rolle', 'b-rolle']);
  assert.deepEqual(peopleOf(tc.state).modules.kern.flags, {});
});

// flag.set

test('flag.set stores the flag under "~", flagValue and the flag atom read it, a repeat is no change', () => {
  const base = freshState();
  const tc = ctxOf(clone(base.state), base.env);
  const set = (value) => applyOnce(tc, P, { op: 'flag.set', flag: 'ritus.blutritus', value }, { reason: 'ritual' });
  assert.equal(set(true), true);
  assert.equal(peopleOf(tc.state).modules.kern.flags['ritus~blutritus'], true);
  assert.equal(tc.log.length, 1);
  assert.equal(tc.log[0].kind, 'flag.set');
  assert.equal(tc.log[0].change.field, 'modules.kern.flags.ritus~blutritus');
  assert.equal(flagValue(peopleOf(tc.state), 'ritus.blutritus'), true);
  assert.equal(flagValue(peopleOf(tc.state), 'ritus.anders'), false);
  assert.equal(flagValue(peopleOf(base.state), 'ritus.blutritus'), false, 'opening state untouched');
  assert.equal(evalCondition({ flag: 'ritus.blutritus' }, cxOf(tc.state, base.env)), true);
  assert.equal(set(true), false);
  assert.equal(tc.log.length, 1);
  assert.equal(set(false), true);
  assert.equal(flagValue(peopleOf(tc.state), 'ritus.blutritus'), false);
  assert.equal(evalCondition({ flag: 'ritus.blutritus' }, cxOf(tc.state, base.env)), false);
  assertValidState(tc.state);
});

test('setKern changes a kernel slice key with a log entry, no entry for an equal value', () => {
  const base = freshState();
  const tc = ctxOf(clone(base.state), base.env);
  assert.equal(setKern(tc, P, 'honored.ulrun', 1, 'talk'), true);
  assert.equal(setKern(tc, P, 'honored.ulrun', 1, 'talk'), false);
  assert.equal(peopleOf(tc.state).modules.kern.honored.ulrun, 1);
  assert.equal(tc.log.length, 1);
  assert.equal(tc.log[0].kind, 'kern.change');
});

// meter.delta

test('meter.delta moves a known meter within -5..5', () => {
  assert.equal(peopleOf(run({ op: 'meter.delta', meter: 'zustimmung', amount: 3 }).state).meters.zustimmung, 3);
  const top = run({ op: 'meter.delta', meter: 'zustimmung', amount: 3 }, { edit: (s) => { peopleOf(s).meters.zustimmung = 4; } });
  assert.equal(peopleOf(top.state).meters.zustimmung, 5);
  assert.deepEqual(top.log[0].change, { field: 'meters.zustimmung', delta: 1 });
  assert.equal(top.log[0].kind, 'meter.change');
  const low = run({ op: 'meter.delta', meter: 'zustimmung', amount: -3 }, { edit: (s) => { peopleOf(s).meters.zustimmung = -4; } });
  assert.equal(peopleOf(low.state).meters.zustimmung, -5);
  const edge = run({ op: 'meter.delta', meter: 'zustimmung', amount: 1 }, { edit: (s) => { peopleOf(s).meters.zustimmung = 5; } });
  assert.equal(edge.ret, false);
  assert.equal(edge.log.length, 0);
});

test('meter.delta uses the bounds of a meter definition in the standing set and creates the meter at the clamped 0', () => {
  const schrein = {
    ...ENTWICKLUNGEN.find((e) => e.id === 'filzjurten'),
    id: 'zornschrein',
    effects: [{ op: 'meter', id: 'zorn', min: -1, max: 3, decay: 0, thresholds: [{ at: 3, effects: [] }] }],
    price: [],
  };
  const patch = { content: { ...CONTENT, entwicklungen: [...ENTWICKLUNGEN, schrein] } };
  const edit = (s) => { peopleOf(s).developments.known.push(known('zornschrein@1')); };
  const up = run({ op: 'meter.delta', meter: 'zorn', amount: 3 }, { edit, patch });
  assert.equal(peopleOf(up.state).meters.zorn, 3);
  const more = run({ op: 'meter.delta', meter: 'zorn', amount: 3 }, { edit: (s) => { edit(s); peopleOf(s).meters.zorn = 2; }, patch });
  assert.equal(peopleOf(more.state).meters.zorn, 3);
  assert.deepEqual(more.log[0].change, { field: 'meters.zorn', delta: 1 });
  const down = run({ op: 'meter.delta', meter: 'zorn', amount: -3 }, { edit, patch });
  assert.equal(peopleOf(down.state).meters.zorn, -1);
});

test('meter.delta on a meter nobody defines uses -5..5', () => {
  const r = run({ op: 'meter.delta', meter: 'fremd', amount: -3 });
  assert.equal(peopleOf(r.state).meters.fremd, -3);
});

// reveal

test('reveal tiles discloses a disc around the target tile, with a delta entry of the new tiles', () => {
  const r = run({ op: 'reveal', scope: 'tiles', at: '$target', radius: 1 }, { ctx: { target: { tile: '12,-8' } } });
  const before = Object.keys(r.s0.map.known[P]);
  const after = Object.keys(r.state.map.known[P]);
  assert.ok(after.length > before.length);
  assert.equal(r.state.map.known[P]['12,-8'], 'visible');
  assert.equal(r.ret, true);
  assert.equal(r.log.length, 1);
  assert.equal(r.log[0].kind, 'map.reveal');
  assert.deepEqual(r.log[0].target, { kind: 'tile', id: '12,-8' });
  assert.deepEqual(r.log[0].change, { field: `map.known.${P}`, delta: after.length - before.length });
  assert.deepEqual(r.log[0].visibleTo, [P]);
  assert.deepEqual(r.s0.map.known[P], clone(r.s0.map.known[P]), 'opening state keeps its own map');
  assert.equal(Object.keys(r.s0.map.known[P]).length, before.length);
});

test('reveal tiles at $home or a literal tile; nothing new means no entry', () => {
  const home = run({ op: 'reveal', scope: 'tiles', at: '$home', radius: 3 });
  assert.ok(Object.keys(home.state.map.known[P]).length > Object.keys(home.s0.map.known[P]).length);
  const lit = run({ op: 'reveal', scope: 'tiles', at: '20,-4', radius: 0 });
  assert.equal(lit.state.map.known[P]['20,-4'], 'visible');
  assert.equal(Object.keys(lit.state.map.known[P]).length, Object.keys(lit.s0.map.known[P]).length + 1);
  const again = run({ op: 'reveal', scope: 'tiles', at: '0,1', radius: 0 });
  assert.equal(again.ret, false);
  assert.equal(again.log.length, 0);
  const none = run({ op: 'reveal', scope: 'tiles', at: '$target', radius: 1 });
  assert.equal(none.ret, false);
  assert.equal(none.log.length, 0);
});

test('reveal region makes every tile of the region known', () => {
  const r = run({ op: 'reveal', scope: 'region', at: '$target', radius: 0 }, { ctx: { target: { region: '0:-1:1' } } });
  const tiles = regionInfo(r.tc.world, '0:-1:1').tiles;
  assert.ok(tiles.length > 0);
  for (const k of tiles) assert.equal(r.state.map.known[P][k], 'visible', k);
  assert.equal(r.log.length, 1);
  assert.deepEqual(r.log[0].target, { kind: 'region', id: '0:-1:1' });
  assert.equal(r.log[0].change.delta > 0, true);
  const bad = run({ op: 'reveal', scope: 'region', at: 'nirgends', radius: 0 });
  assert.equal(bad.ret, false);
});

test('reveal people marks the other people as revealed from the next turn on, never the own people', () => {
  const r = run({ op: 'reveal', scope: 'people', at: 'esk', radius: 0 });
  assert.equal(peopleOf(r.state).modules.kern.revealed.esk, 1);
  assert.equal(r.log.length, 1);
  assert.equal(r.log[0].kind, 'reveal.people');
  assert.equal(r.ret, true);
  const viaTarget = run({ op: 'reveal', scope: 'people', at: '$target', radius: 0 }, { ctx: { target: { people: 'glutreiter' } } });
  assert.equal(peopleOf(viaTarget.state).modules.kern.revealed.glutreiter, 1);
  for (const at of [P, 'niemand']) {
    const x = run({ op: 'reveal', scope: 'people', at, radius: 0 });
    assert.equal(x.ret, false, at);
    assert.equal(x.log.length, 0, at);
  }
});

// generic behaviour

test('applyOnce passes source and refs to the entries and uses the reason', () => {
  const r = run({ op: 'standing.delta', amount: 1 }, { ctx: { reason: 'Zaubergabe', source: 'player', refs: ['dev:x@1'] } });
  assert.equal(r.log[0].source, 'player');
  assert.deepEqual(r.log[0].refs, ['dev:x@1']);
  assert.equal(r.log[0].reason, 'Zaubergabe');
  const bare = run({ op: 'standing.delta', amount: 1 }, { ctx: { reason: undefined } });
  assert.equal(bare.log[0].reason, 'effect standing.delta');
});

test('applyOnce for an unknown people returns false without a trace; a standing op throws', () => {
  const base = freshState();
  const tc = ctxOf(clone(base.state), base.env);
  assert.equal(applyOnce(tc, 'niemand', { op: 'standing.delta', amount: 1 }, {}), false);
  assert.equal(tc.log.length, 0);
  assert.throws(() => applyOnce(tc, P, { op: 'stat.mod', stat: 'x', amount: 1 }, {}), /not a one-off primitive/);
});

test('applyOnceList counts the effects that changed state', () => {
  const base = freshState();
  const tc = ctxOf(clone(base.state), base.env);
  const n = applyOnceList(tc, P, [
    { op: 'resource.delta', res: 'nahrung', amount: 1 },
    { op: 'standing.delta', amount: -1 },
    { op: 'population.delta', amount: 1 },
  ], { reason: 'list' });
  assert.equal(n, 2);
  assert.equal(applyOnceList(tc, P, null, {}), 0);
  assert.equal(applyOnceList(tc, P, [], {}), 0);
});

test('one-off effects never touch the opening state', () => {
  const base = freshState();
  const s = clone(base.state);
  const frozen = JSON.stringify(s);
  const tc = ctxOf(s, base.env);
  applyOnceList(tc, P, [
    { op: 'resource.delta', res: 'nahrung', amount: -9 },
    { op: 'loyalty.delta', target: 'all', amount: 2 },
    { op: 'status.add', id: 'xx', effects: STATUS_FX, duration: 2 },
    { op: 'token.add', kind: 'impulse', tags: [] },
    { op: 'flag.set', flag: 'ritus.test', value: true },
    { op: 'reveal', scope: 'tiles', at: '$home', radius: 3 },
  ], { reason: 'all' });
  assert.equal(JSON.stringify(s), frozen);
  assert.notEqual(JSON.stringify(tc.state), frozen);
});

test('population.delta never brings back a people that has gone under', () => {
  const r = run({ op: 'population.delta', amount: 2 }, { edit: (s) => { peopleOf(s).population.core = 0; } });
  assert.equal(peopleOf(r.state).population.core, 0);
  assert.equal(r.ret, false);
});

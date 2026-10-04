import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../../../engine/core/rules.js';
import * as research from '../../../engine/core/research.js';
import { orderContext } from '../../../engine/core/orders.js';
import { standingOf, ofOp } from '../../../engine/core/effects.js';
import { validate } from '../../../engine/content/schema.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { practiceTop as validatorPracticeTop, openTier as validatorOpenTier } from '../../../engine/content/validate.js';
import { openTier } from '../../../engine/core/pfade.js';
import { assertCovered, dev, envWith, fresh, knownEntry, context, logKinds } from '../../fixtures/engine/k1/research.js';

const H = 'hochweide';
const withoutDerived = (state) => { const { derived, ...rest } = state; return rest; };
const project = (ref, progress = 0) => ({ ref, progress });
const withResearch = (state, ref, progress = 0, assigned = {}) => {
  state.peoples[H].developments.research = [project(ref, progress)];
  state.peoples[H].population.assigned = { nahrung: 3 - Object.values(assigned).reduce((a, b) => a + b, 0), ...assigned };
  state.peoples[H].resources.wissen = 0;
  return state;
};

// --- cost ------------------------------------------------------------------------

test('cost grows with the number of known developments, halves for a breakthrough and stays within 1..maxProgress', () => {
  const env = envWith({ developments: [dev({ id: 'riesig', name: 'Riesig', cost: { research: 60, resources: {} } }), dev({ id: 'winzig', name: 'Winzig', cost: { research: 2, resources: {} } })] });
  const s = fresh(env);
  assert.equal(research.researchCost(s, env, H, 'marktrecht@1'), 9);
  s.peoples[H].developments.known.push(...Array.from({ length: 16 }, (_, i) => knownEntry(`fuell-${i}@1`)));
  assert.equal(research.researchCost(s, env, H, 'marktrecht@1'), 17);
  s.peoples[H].developments.known.push(...Array.from({ length: 4 }, (_, i) => knownEntry(`mehr-${i}@1`)));
  assert.equal(research.researchCost(s, env, H, 'riesig@1'), RULES.maxProgress);

  const t = fresh(env);
  t.peoples[H].developments.candidates = [{ ref: 'marktrecht@1', offeredAt: 0, expiresAt: 4, origin: 'breakthrough' }, { ref: 'winzig@1', offeredAt: 0, expiresAt: 4, origin: 'breakthrough' }];
  assert.equal(research.researchCost(t, env, H, 'marktrecht@1'), 4);
  assert.equal(research.researchCost(t, env, H, 'winzig@1'), 1);
});

// --- points ------------------------------------------------------------------------

test('points are the base rate plus one per clan assigned to research', () => {
  const env = envWith();
  const s = withResearch(fresh(env), 'marktrecht@1', 0, { research: 1 });
  const tc = context(s, env);
  research.resolveResearch(tc);
  assert.equal(tc.state.peoples[H].developments.research[0].progress, RULES.researchBase + RULES.researchPerClan);
  const e = tc.log.find((x) => x.kind === 'research.progress');
  assert.equal(e.target.id, H);
  assert.equal(e.change.field, 'developments.research');
  assert.deepEqual(e.visibleTo, [H]);
});

test('research.mod counts for matching tags from active, effective developments only', () => {
  const env = envWith({
    developments: [
      dev({ id: 'schreibkunst', name: 'Schreibkunst', effects: [{ op: 'research.mod', tags: ['handel'], amount: 2 }, { op: 'research.mod', tags: ['krieg'], amount: 3 }] }),
      dev({ id: 'spaet', name: 'Spät', effects: [{ op: 'research.mod', tags: ['handel'], amount: 3 }] }),
    ],
  });
  const s = withResearch(fresh(env), 'marktrecht@1');
  s.peoples[H].developments.known.push(knownEntry('schreibkunst@1'), knownEntry('spaet@1', { effectiveFrom: 1 }));
  const tc = context(s, env);
  research.resolveResearch(tc);
  assert.equal(tc.state.peoples[H].developments.research[0].progress, RULES.researchBase + 2);
});

test('knowledge burns up to the spend limit and no further than the stock', () => {
  const env = envWith();
  const rich = withResearch(fresh(env), 'marktrecht@1');
  rich.peoples[H].resources.wissen = 5;
  const tc = context(rich, env);
  research.resolveResearch(tc);
  assertCovered(tc, H);
  assert.equal(tc.state.peoples[H].resources.wissen, 5 - RULES.knowledgeSpend);
  assert.equal(tc.state.peoples[H].developments.research[0].progress, RULES.researchBase + RULES.knowledgeSpend);
  const burn = tc.log.find((x) => x.kind === 'resource.change');
  assert.deepEqual(burn.change, { field: 'resources.wissen', delta: -RULES.knowledgeSpend });

  const poor = withResearch(fresh(env), 'marktrecht@1');
  poor.peoples[H].resources.wissen = 1;
  const tc2 = context(poor, env);
  research.resolveResearch(tc2);
  assert.equal(tc2.state.peoples[H].resources.wissen, 0);
  assert.equal(tc2.state.peoples[H].developments.research[0].progress, RULES.researchBase + 1);
});

test('the world tuning changes the knowledge spend', () => {
  const env = envWith({ tuning: { knowledgeSpend: 3 } });
  const s = withResearch(fresh(env), 'marktrecht@1');
  s.peoples[H].resources.wissen = 5;
  const tc = context(s, env);
  research.resolveResearch(tc);
  assert.equal(tc.state.peoples[H].resources.wissen, 2);
});

test('without a research target nothing is burned and no point accrues', () => {
  const env = envWith();
  const s = fresh(env);
  s.peoples[H].resources.wissen = 5;
  const tc = context(s, env);
  research.resolveResearch(tc);
  assert.equal(tc.state.peoples[H].resources.wissen, 5);
  assert.deepEqual(tc.log, []);
});

// --- completion -----------------------------------------------------------------------

test('a completed development is known from the next turn and its effects wait until then', () => {
  const env = envWith();
  const s = withResearch(fresh(env), 'filzjurten@1', 2);
  s.peoples[H].developments.candidates = [{ ref: 'filzjurten@1', offeredAt: 0, expiresAt: 4, origin: 'pool' }, { ref: 'salzpfad@1', offeredAt: 0, expiresAt: 4, origin: 'pool' }];
  const tc = context(s, env);
  research.resolveResearch(tc);
  const d = tc.state.peoples[H].developments;
  assert.deepEqual(d.known.at(-1), { ref: 'filzjurten@1', since: 0, effectiveFrom: 1, state: 'active', suspendedSince: null });
  assert.deepEqual(d.research, []);
  assert.deepEqual(d.candidates.map((c) => c.ref), ['salzpfad@1']);
  const probe = (turn) => ofOp(standingOf(tc.state, env, H, turn), 'probe.mod').filter((x) => x.source.ref === 'filzjurten@1');
  assert.equal(probe(tc.turn).length, 0);
  assert.equal(probe(tc.turn + 1).length, 1);
  assert.ok(logKinds(tc).includes('research.completed'));
});

test('a development whose resources are not at hand waits at full progress and completes when they are', () => {
  const env = envWith({ developments: [dev({ id: 'teuer', name: 'Teuer', cost: { research: 2, resources: { material: 5 } } })] });
  const s = withResearch(fresh(env), 'teuer@1');
  s.peoples[H].resources.material = 1;
  const tc = context(s, env);
  research.resolveResearch(tc);
  const d = tc.state.peoples[H].developments;
  assert.equal(d.research[0].progress, 2);
  assert.equal(d.known.some((k) => k.ref === 'teuer@1'), false);
  assert.equal(tc.state.peoples[H].resources.material, 1);
  assert.ok(logKinds(tc).includes('research.waiting'));

  const next = structuredClone(tc.state);
  next.turn = 1;
  next.peoples[H].resources.material = 6;
  next.peoples[H].resources.wissen = 5;
  const tc2 = context(next, env);
  research.resolveResearch(tc2);
  assert.equal(tc2.state.peoples[H].developments.known.at(-1).ref, 'teuer@1');
  assert.equal(tc2.state.peoples[H].resources.material, 1);
  // A project that only waits for resources does not burn knowledge.
  assert.equal(tc2.state.peoples[H].resources.wissen, 5);
});

test('onAcquire runs once on completion with its reason', () => {
  const env = envWith({ developments: [dev({ id: 'gabe', name: 'Gabe', onAcquire: [{ op: 'resource.delta', res: 'nahrung', amount: 3 }] })] });
  const s = withResearch(fresh(env), 'gabe@1', 4);
  const before = s.peoples[H].resources.nahrung;
  const tc = context(s, env);
  research.resolveResearch(tc);
  assert.equal(tc.state.peoples[H].resources.nahrung, before + 3);
  assert.ok(tc.log.some((e) => e.kind === 'resource.change' && e.reason === 'onAcquire of Gabe'));
  assertCovered(tc, H);
});

test('a development replaces the known ones it names, also from the instituted list', () => {
  const env = envWith({ developments: [dev({ id: 'grossrat', name: 'Großrat', kind: 'institution', spec: { seat: null }, replaces: ['sippenrat'] })] });
  const s = withResearch(fresh(env), 'grossrat@1', 4);
  assert.ok(s.peoples[H].developments.instituted.includes('sippenrat@1'));
  const tc = context(s, env);
  research.resolveResearch(tc);
  const d = tc.state.peoples[H].developments;
  assert.equal(d.known.some((k) => k.ref === 'sippenrat@1'), false);
  assert.equal(d.known.some((k) => k.ref === 'grossrat@1'), true);
  assert.equal(d.instituted.includes('sippenrat@1'), false);
  assert.ok(logKinds(tc).includes('research.replaced'));
  assertCovered(tc, H);
});

test('a project that is already known leaves the list without costing anything', () => {
  const env = envWith();
  const s = withResearch(fresh(env), 'sippenrat@1');
  s.peoples[H].resources.wissen = 5;
  const tc = context(s, env);
  research.resolveResearch(tc);
  assert.deepEqual(tc.state.peoples[H].developments.research, []);
  assert.equal(tc.state.peoples[H].resources.wissen, 5);
});

// --- expiry ----------------------------------------------------------------------------------

test('candidates run out after candidateLife planning turns and one under research stays', () => {
  const env = envWith();
  const s = fresh(env);
  s.turn = 3;
  const cand = (ref, expiresAt) => ({ ref, offeredAt: 3 - RULES.candidateLife + 1, expiresAt, origin: 'pool' });
  s.peoples[H].developments.candidates = [cand('salzpfad@1', 4), cand('hirtenhunde@1', 5), cand('filzjurten@1', 3)];
  s.peoples[H].developments.research = [project('filzjurten@1', 1)];
  const tc = context(s, env, 'cleanup');
  research.expire(tc);
  assert.deepEqual(tc.state.peoples[H].developments.candidates.map((c) => c.ref), ['hirtenhunde@1', 'filzjurten@1']);
});

test('offered at turn t, a pool candidate is on offer for exactly candidateLife plannings', () => {
  const env = envWith();
  const s = fresh(env);
  s.peoples.glutreiter.developments.candidates = [];
  const open = context(s, env, 'open');
  research.offerPool(open, 'glutreiter');
  let state = open.state;
  const seen = [];
  for (let t = 0; t < RULES.candidateLife + 1; t++) {
    seen.push(state.peoples.glutreiter.developments.candidates.length > 0);
    const tc = context({ ...state, turn: t }, env, 'cleanup');
    research.expire(tc);
    state = { ...tc.state, turn: t + 1 };
  }
  assert.deepEqual(seen, [true, true, true, true, false]);
});

test('breakthrough, impulse and crisis tokens fade after tokenLife turns, a grievance stays, old requests lapse', () => {
  const env = envWith();
  const s = fresh(env);
  s.turn = 10;
  const tok = (id, kind, turn) => ({ id, kind, tags: ['bau'], turn, source: 'test' });
  s.peoples[H].tokens = [tok('a', 'breakthrough', 2), tok('b', 'breakthrough', 1), tok('c', 'impulse', 1), tok('d', 'crisis', 0), tok('e', 'grievance', 0), tok('f', 'crisis', 9)];
  s.peoples[H].developments.requests = [{ turn: 1, tags: ['bau'], note: '' }, { turn: 2, tags: ['bau'], note: '' }, { turn: 9, tags: ['handel'], note: '' }];
  const tc = context(s, env, 'cleanup');
  research.expire(tc);
  assertCovered(tc, H);
  assert.deepEqual(tc.state.peoples[H].tokens.map((k) => k.id), ['a', 'e', 'f']);
  assert.deepEqual(tc.state.peoples[H].developments.requests.map((r) => r.turn), [2, 9]);
});

// --- orders ------------------------------------------------------------------------------------

test('research.assign takes an open candidate or running project and puts it first', () => {
  const env = envWith();
  const s = fresh(env);
  s.peoples[H].developments.candidates = [{ ref: 'salzpfad@1', offeredAt: 0, expiresAt: 4, origin: 'pool' }, { ref: 'saumpfade@1', offeredAt: 0, expiresAt: 4, origin: 'pool' }];
  s.peoples[H].developments.research = [project('hirtenhunde@1', 3)];
  const def = research.ORDERS['research.assign'];
  const ox = { ...orderContext(s, env, H), path: '/orders/0' };
  const order = (development) => ({ id: 'o1', type: 'research.assign', params: { development } });
  assert.equal(def.slot, 'free');
  assert.equal(def.unique, true);
  assert.deepEqual(def.tags(ox, order('salzpfad@1')), ['handel', 'salz']);
  assert.deepEqual(def.check(ox, order('salzpfad@1')), []);
  assert.deepEqual(def.check(ox, order('hirtenhunde@1')), []);
  assert.equal(def.check(ox, order('filzjurten@1'))[0].code, 'target');
  assert.equal(def.check(ox, { id: 'o1', type: 'research.assign', params: {} })[0].code, 'target');

  const tc = context(s, env, 'orders');
  def.resolve(tc, ox, order('salzpfad@1'));
  assert.deepEqual(tc.state.peoples[H].developments.research, [project('salzpfad@1'), project('hirtenhunde@1', 3)]);
  def.resolve(tc, ox, order('hirtenhunde@1'));
  assert.deepEqual(tc.state.peoples[H].developments.research, [project('hirtenhunde@1', 3), project('salzpfad@1')]);
  tc.state.peoples[H].developments.research.push(project('saumpfade@1', 1));
  tc.state.peoples[H].developments.candidates.push({ ref: 'wachfeuer@1', offeredAt: 0, expiresAt: 4, origin: 'pool' });
  def.resolve(tc, ox, order('wachfeuer@1'));
  assert.deepEqual(tc.state.peoples[H].developments.research.map((r) => r.ref), ['wachfeuer@1', 'hirtenhunde@1', 'salzpfad@1']);
});

test('research.direct checks tags against the vocabulary and keeps the last eight requests', () => {
  const env = envWith();
  const s = fresh(env);
  s.turn = 10;
  s.peoples[H].developments.requests = Array.from({ length: 8 }, (_, i) => ({ turn: 2 + i, tags: ['bau'], note: '' }));
  const def = research.ORDERS['research.direct'];
  const ox = { ...orderContext(s, env, H), path: '/orders/0' };
  const order = (params) => ({ id: 'o1', type: 'research.direct', params });
  assert.equal(def.slot, 'free');
  assert.deepEqual(def.check(ox, order({ tags: ['handel', 'salz'], note: 'Mehr Salz.' })), []);
  assert.deepEqual(def.check(ox, order({ tags: ['handel'] })), []);
  for (const bad of [{ tags: [] }, { tags: ['bau', 'handel', 'salz', 'markt'] }, { tags: ['gibtsnicht'] }, { tags: ['bau', 'bau'] }, { tags: ['bau'], note: 'x'.repeat(201) }, {}]) {
    assert.equal(def.check(ox, order(bad)).length, 1, JSON.stringify(bad));
  }
  assert.deepEqual(def.tags(ox, order({ tags: ['handel', 'salz'] })), ['handel', 'salz']);
  const tc = context(s, env, 'orders');
  def.resolve(tc, ox, order({ tags: ['handel'], note: 'Salz.' }));
  const list = tc.state.peoples[H].developments.requests;
  assert.equal(list.length, 8);
  assert.deepEqual(list.at(-1), { turn: 10, tags: ['handel'], note: 'Salz.' });
  assert.equal(list[0].turn, 3);
});

// --- practice ledger ------------------------------------------------------------------------------

const run = (slot, tags, band = null) => ({ order: { id: 'x', type: 'x', params: {} }, slot, tags, band });

test('practice weights are main 2, minor 1, free 0 and one more for a successful probe', () => {
  const env = envWith();
  const s = fresh(env);
  s.turn = 3;
  const tc = context(s, env, 'finalize');
  research.recordPractice(tc, H, [
    run('main', ['bau', 'siedlung', RULES.mainTag], 'success'),
    run('minor', ['erkundung'], 'failure'),
    run('free', ['wege'], 'narrow'),
    run('free', ['zug'], 'failure'),
    run('minor', ['erkundung'], 'crit_success'),
  ]);
  assert.deepEqual(tc.state.peoples[H].practice.ledger, [{ turn: 3, tags: { bau: 3, erkundung: 3, siedlung: 3, wege: 1 } }]);
  assert.ok(Object.values(tc.state.peoples[H].practice.ledger[0].tags).every((v) => v >= 1 && v <= 20));
});

test('a practice sum is clamped to 20 and a turn without practice adds no row', () => {
  const env = envWith();
  const s = fresh(env);
  const tc = context(s, env, 'finalize');
  research.recordPractice(tc, H, Array.from({ length: 11 }, () => run('main', ['bau'])));
  assert.equal(tc.state.peoples[H].practice.ledger[0].tags.bau, 20);
  const quiet = context(fresh(env), env, 'finalize');
  research.recordPractice(quiet, H, [run('free', ['zug'])]);
  research.recordPractice(quiet, H, []);
  assert.deepEqual(quiet.state.peoples[H].practice.ledger, []);
  assert.deepEqual(quiet.log, []);
});

test('the practice ledger keeps the last eight turns and validates against the schema', () => {
  const env = envWith();
  let state = fresh(env);
  for (let t = 0; t < RULES.practice.turns + 2; t++) {
    const tc = context({ ...state, turn: t }, env, 'finalize');
    research.recordPractice(tc, H, [run('main', ['bau'])]);
    state = tc.state;
  }
  const ledger = state.peoples[H].practice.ledger;
  assert.equal(ledger.length, RULES.practice.turns);
  assert.equal(ledger[0].turn, 2);
  assert.equal(ledger.at(-1).turn, RULES.practice.turns + 1);
  assert.deepEqual(validate(SCHEMAS.campaign, withoutDerived(state)).filter((i) => i.path.includes('practice')), []);
});

test('practiceTop sums the ledger like the validator does', () => {
  const people = { practice: { ledger: [{ turn: 0, tags: { bau: 2, zug: 1, wege: 4 } }, { turn: 1, tags: { zug: 3, handel: 4, felder: 1 } }] } };
  assert.deepEqual(research.practiceTop(people, 3), [['wege', 4], ['zug', 4], ['handel', 4]].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 3));
  assert.deepEqual(research.practiceTop(people, 3), validatorPracticeTop(people, 3));
  assert.deepEqual(research.practiceTop({}, 3), []);
});

// --- open tier ----------------------------------------------------------------------------------------

function tierState(env, { turn, core, extra = [] }) {
  const s = fresh(env);
  s.turn = turn;
  s.peoples.esk.population.core = core;
  s.peoples.esk.developments.known.push(...['filzjurten', 'hirtenhunde', 'saumpfade', ...extra].map((id) => knownEntry(`${id}@1`)));
  return s;
}

test('open tier gates on known developments, clans and world years, the same as the validator', () => {
  const env = envWith();
  const ctxOf = (s) => ({ regeln: env.regeln, state: s, library: { entries: [...env.content.entwicklungen.map((data) => ({ ref: `${data.id}@${data.rev}`, type: 'entwicklung', data }))] }, turn: s.turn });
  const fewer = tierState(env, { turn: 8, core: 4 });
  fewer.peoples.esk.developments.known = fewer.peoples.esk.developments.known.slice(0, 3);
  const cases = [
    [tierState(env, { turn: 4, core: 4 }), 1],
    [tierState(env, { turn: 8, core: 4 }), 2],
    [tierState(env, { turn: 8, core: 3 }), 1],
    [fewer, 1],
  ];
  for (const [s, want] of cases) {
    assert.equal(openTier(s, env, 'esk'), want);
    assert.equal(validatorOpenTier(s.peoples.esk, ctxOf(s)), want);
  }
  const capped = envWith({ tuning: { maxTier: 1 } });
  assert.equal(openTier(tierState(capped, { turn: 8, core: 4 }), capped, 'esk'), 1);
});

// --- pool offers ------------------------------------------------------------------------------------------

const offer = (state, env, pid) => {
  const tc = context(state, env, 'open');
  research.offerPool(tc, pid);
  return tc;
};
const refs = (tc, pid) => tc.state.peoples[pid].developments.candidates.map((c) => c.ref);

test('pool offers respect aboveTier: a people without tier-1 knowledge gets one tier-1 candidate', () => {
  const env = envWith();
  const tc = offer(fresh(env), env, H);
  assert.equal(refs(tc, H).length, 1);
  const c = tc.state.peoples[H].developments.candidates[0];
  assert.deepEqual({ offeredAt: c.offeredAt, expiresAt: c.expiresAt, origin: c.origin }, { offeredAt: 0, expiresAt: RULES.candidateLife, origin: 'pool' });
  assert.deepEqual(logKinds(tc), ['research.offer']);
  assertCovered(tc, H);
  const wider = envWith({ limits: { aboveTier: 2 } });
  assert.equal(refs(offer(fresh(wider), wider, H), H).length, 2);
});

test('pool offers are ranked by overlap with the practice tags, then by id, up to candidatesPerTurn', () => {
  const env = envWith();
  const s = fresh(env);
  s.peoples.glutreiter.practice.ledger = [{ turn: 0, tags: { wege: 5, erkundung: 4 } }];
  assert.deepEqual(refs(offer(s, env, 'glutreiter'), 'glutreiter'), ['saumpfade@1', 'salzpfad@1', 'ahnensprache@1']);
  const t = fresh(env);
  t.peoples[H].practice.ledger = [{ turn: 0, tags: { handel: 5, salz: 3 } }];
  assert.deepEqual(refs(offer(t, env, H), H), ['salzpfad@1']);
});

test('candidates offered this turn use up the same limits', () => {
  const env = envWith();
  const s = fresh(env);
  s.peoples.glutreiter.developments.candidates = [{ ref: 'wachfeuer@1', offeredAt: 0, expiresAt: 4, origin: 'agent' }];
  const out = refs(offer(s, env, 'glutreiter'), 'glutreiter');
  assert.equal(out.length, 3);
  assert.equal(out[0], 'wachfeuer@1');
});

test('the open pool never exceeds openCandidates', () => {
  const env = envWith();
  const s = fresh(env);
  s.turn = 5;
  s.peoples.glutreiter.developments.candidates = ['hirtenhunde', 'salzpfad', 'saumpfade', 'wachfeuer', 'speerwall'].map((id) => ({ ref: `${id}@1`, offeredAt: 4, expiresAt: 8, origin: 'pool' }));
  assert.equal(refs(offer(s, env, 'glutreiter'), 'glutreiter').length, 6);
  const t = fresh(env);
  t.peoples.glutreiter.developments.candidates = ['hirtenhunde', 'salzpfad', 'saumpfade', 'wachfeuer', 'speerwall', 'ahnensprache'].map((id) => ({ ref: `${id}@1`, offeredAt: 0, expiresAt: 4, origin: 'agent' }));
  assert.equal(offer(t, env, 'glutreiter').log.length, 0);
});

test('known, offered and researched developments, tier 0 and agent content are not offered', () => {
  const env = envWith({
    limits: { aboveTier: 3, candidatesPerTurn: 6, openCandidates: 12 },
    developments: [dev({ id: 'agentenwerk', name: 'Agentenwerk', origin: { source: 'agent', practiceTags: [], token: null, request: null, proposal: 'p' } })],
  });
  const s = fresh(env);
  s.peoples[H].developments.known.push(knownEntry('salzpfad@1'));
  s.peoples[H].developments.research = [project('wachfeuer@1')];
  s.peoples[H].developments.candidates = [{ ref: 'saumpfade@1', offeredAt: -1, expiresAt: 3, origin: 'pool' }];
  const out = refs(offer(s, env, H), H);
  for (const id of ['salzpfad', 'wachfeuer', 'wanderhirten', 'talbauern', 'agentenwerk', 'marktrecht', 'sippenrat']) assert.equal(out.some((r) => r.startsWith(`${id}@`)), false, id);
  assert.deepEqual(out.slice().sort(), ['ahnensprache@1', 'filzjurten@1', 'hirtenhunde@1', 'reiterschar@1', 'saumpfade@1', 'speerwall@1'].sort());
});

test('prerequisites: all known, any of, and the condition', () => {
  const env = envWith({
    limits: { aboveTier: 3, candidatesPerTurn: 6, openCandidates: 12 },
    developments: [
      dev({ id: 'braucht-weide', name: 'Braucht Weide', prerequisites: { all: ['wanderhirten'], any: [], if: null } }),
      dev({ id: 'braucht-tal', name: 'Braucht Tal', prerequisites: { all: ['talbauern'], any: [], if: null } }),
      dev({ id: 'eines-von', name: 'Eines von', prerequisites: { all: [], any: ['reiterschar', 'speerwall'], if: null } }),
      dev({ id: 'reich', name: 'Reich', prerequisites: { all: [], any: [], if: { res: 'material', cmp: 'gte', value: 50 } } }),
      dev({ id: 'arm', name: 'Arm', prerequisites: { all: [], any: [], if: { res: 'material', cmp: 'lt', value: 50 } } }),
    ],
  });
  const s = fresh(env);
  const out = refs(offer(s, env, 'glutreiter'), 'glutreiter');
  assert.ok(out.includes('braucht-weide@1'));
  assert.ok(!out.includes('braucht-tal@1'));
  assert.ok(out.includes('eines-von@1'));
  assert.ok(!out.includes('reich@1'));
  assert.ok(out.includes('arm@1'));
  const esk = refs(offer(s, env, 'esk'), 'esk');
  assert.ok(esk.includes('braucht-tal@1'));
  assert.ok(!esk.includes('eines-von@1'));
});

test('tier gates close higher tiers until clans, known developments and world years are there', () => {
  const env = envWith();
  const rich = { turn: 8, core: 4, extra: ['salzpfad'] };
  const ranked = (s) => { s.peoples.esk.practice.ledger = [{ turn: 0, tags: { handel: 5, markt: 3, ordnung: 2 } }]; return s; };
  assert.equal(refs(offer(ranked(tierState(env, rich)), env, 'esk'), 'esk')[0], 'marktrecht@1');
  for (const poor of [{ turn: 4, core: 4, extra: ['salzpfad'] }, { turn: 8, core: 3, extra: ['salzpfad'] }, { turn: 8, core: 4 }]) {
    const out = refs(offer(ranked(tierState(env, poor)), env, 'esk'), 'esk');
    assert.equal(out.includes('marktrecht@1'), false, JSON.stringify(poor));
  }
});

test('the maxTier of the world caps the offers', () => {
  const env = envWith({ tuning: { maxTier: 1 } });
  const s = tierState(env, { turn: 8, core: 4, extra: ['salzpfad'] });
  s.peoples.esk.practice.ledger = [{ turn: 0, tags: { handel: 5, markt: 3, ordnung: 2 } }];
  assert.equal(refs(offer(s, env, 'esk'), 'esk').includes('marktrecht@1'), false);
});

test('offered candidates fit the campaign schema', () => {
  const env = envWith();
  const tc = offer(fresh(env), env, 'glutreiter');
  assert.deepEqual(validate(SCHEMAS.campaign, withoutDerived(tc.state)).filter((i) => i.path.includes('candidates')), []);
});

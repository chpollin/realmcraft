import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDERS, afterCouncilOrder, bookDecree, councilVote, isAlive, loyaltyBand, resolveCouncilSeason,
} from '../../../engine/core/council.js';
import { checkDraft } from '../../../engine/core/orders.js';
import { apply, emptyDraft } from '../../../engine/core/turn.js';
import { changeLoyalty } from '../../../engine/core/log.js';
import { hasErrors } from '../../../engine/core/issues.js';
import { RULES } from '../../../engine/core/rules.js';
import { PLAYER, context, entries, member, outcome, oxOf, world } from '../../fixtures/engine/k1/council.js';

const m = (id, loyalty, favor = [], oppose = [], extra = {}) => ({
  id, name: id, role: 'rolle', goal: { text: 'x', favor, oppose }, loyalty, hollow: false, age: 40, lifeStage: 'ruestig', leader: false, appearance: '', ...extra,
});
const rule = (r, scopeTags = ['ordnung'], scopeOrders = []) => ({ effect: { op: 'governance.rule', rule: r, scopeTags, scopeOrders }, source: { kind: 'development', key: `dev:${r}`, label: r } });
const vox = (rules, council) => ({ standing: [].concat(rules), people: { council } });

// --- vote ---------------------------------------------------------------------------

test('a vote is required only for scope tags or scope orders, with a council and a rule', () => {
  const council = [m('a', 2), m('b', 2)];
  assert.equal(councilVote(vox(rule('council'), council), ['ordnung'], 'institute').required, true);
  assert.equal(councilVote(vox(rule('council'), council), ['bau'], 'build').required, false);
  assert.equal(councilVote(vox(rule('council', [], ['destiny.adopt']), council), ['bestimmung'], 'destiny.adopt').required, true);
  assert.equal(councilVote(vox(rule('council'), []), ['ordnung'], 'institute').required, false);
  assert.equal(councilVote(vox([], council), ['ordnung'], 'institute').required, false);
  const none = councilVote(vox([], council), ['ordnung'], 'institute');
  assert.deepEqual([none.passed, none.votes, none.rule], [true, [], null]);
});

test('Machtprobe and talk never need a council vote', () => {
  const council = [m('a', -4)];
  assert.equal(councilVote(vox(rule('council', ['macht', 'rat']), council), ['macht', 'rat'], 'machtprobe').required, false);
  assert.equal(councilVote(vox(rule('council', ['macht', 'rat']), council), ['macht', 'rat'], 'talk').required, false);
});

test('the last governance.rule in standing order wins', () => {
  const v = councilVote(vox([rule('leader'), rule('assembly', ['bau'])], [m('a', 2)]), ['bau'], 'build');
  assert.equal(v.rule, 'assembly');
  assert.deepEqual(v.scopeTags, ['bau']);
  assert.equal(v.required, true);
});

test('member votes: breaking point, oppose over favor, favor, loyalty sign', () => {
  const council = [
    m('broken', -4, ['ordnung']),
    m('both', 3, ['ordnung'], ['ordnung']),
    m('favors', -3, ['ordnung']),
    m('zero', 0),
    m('sour', -1),
    m('fine', 2),
  ];
  const v = councilVote(vox(rule('council'), council), ['ordnung'], 'institute');
  const by = Object.fromEntries(v.votes.map((x) => [x.member, x.vote]));
  assert.deepEqual(by, { broken: 'no', both: 'no', favors: 'yes', zero: 'yes', sour: 'no', fine: 'yes' });
  assert.deepEqual([v.yes, v.no], [3, 3]);
  assert.ok(v.votes.every((x) => typeof x.reason === 'string' && x.reason));
});

test('rule leader passes without a majority', () => {
  assert.equal(councilVote(vox(rule('leader'), [m('a', -5), m('b', -5)]), ['ordnung'], 'institute').passed, true);
});

test('rule council needs more than half yes', () => {
  const pass = (loyalties) => councilVote(vox(rule('council'), loyalties.map((l, i) => m(`m${i}`, l))), ['ordnung'], 'institute').passed;
  assert.equal(pass([1, 1, -1]), true);
  assert.equal(pass([1, -1, -1]), false);
  assert.equal(pass([1, -1]), false);
  assert.equal(pass([1, 1, -1, -1]), false);
  assert.equal(pass([1, 1, 1, -1]), true);
});

test('rule assembly needs two thirds yes', () => {
  const pass = (loyalties) => councilVote(vox(rule('assembly'), loyalties.map((l, i) => m(`m${i}`, l))), ['ordnung'], 'institute').passed;
  assert.equal(pass([1, 1, -1]), true);
  assert.equal(pass([1, -1, -1]), false);
  assert.equal(pass([1, 1, 1, -1]), true);
  assert.equal(pass([1, 1, -1, -1]), false);
});

test('loyaltyBand covers every value', () => {
  const bands = { 5: 'ergeben', 4: 'ergeben', 3: 'treu', 1: 'treu', 0: 'schwankend', '-1': 'verstimmt', '-3': 'verstimmt', '-4': 'bruch', '-5': 'bruch' };
  for (const [v, b] of Object.entries(bands)) assert.equal(loyaltyBand(Number(v)), b, v);
});

// --- decree and loyalty cap -----------------------------------------------------------

function institution(state, loyalty = {}) {
  const p = state.peoples[PLAYER];
  p.developments.known.push({ ref: 'marktrecht@1', since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null });
  for (const [id, l] of Object.entries(loyalty)) member(state, id).loyalty = l;
}

const instituteEntry = (ox, id = 'o2') => {
  const tags = ['ordnung', 'handel', 'markt', RULES.mainTag];
  return { order: { id, type: 'institute', params: { development: 'marktrecht@1' } }, tags, vote: councilVote(ox, tags, 'institute') };
};

test('the test council rejects an institute order (1 yes of 3)', () => {
  const { env, state } = world((s) => institution(s));
  const e = instituteEntry(oxOf(state, env));
  assert.deepEqual([e.vote.required, e.vote.rule, e.vote.yes, e.vote.no, e.vote.passed], [true, 'council', 1, 2, false]);
});

test('a decree costs each no-voter 1 loyalty, one at the breaking point opens a grievance, approval falls', () => {
  const { env, state } = world((s) => institution(s, { garmund: -4 }));
  const tc = context(state, env);
  const ox = oxOf(state, env);
  bookDecree(tc, ox, instituteEntry(ox));
  const p = tc.state.peoples[PLAYER];
  assert.equal(member(tc.state, 'ulrun').loyalty, 3);
  assert.equal(member(tc.state, 'torhild').loyalty, 0);
  assert.equal(member(tc.state, 'garmund').loyalty, -5);
  const grievances = p.tokens.filter((t) => t.kind === 'grievance');
  assert.equal(grievances.length, 1);
  assert.ok(grievances[0].tags.includes('ordnung') && grievances[0].tags.length <= 3);
  assert.equal(p.meters[RULES.approval], state.peoples[PLAYER].meters[RULES.approval] - 1);
  assert.equal(entries(tc, 'council.decree').length, 1);
});

test('a decree against members above the breaking point opens no grievance', () => {
  const { env, state } = world((s) => institution(s));
  const tc = context(state, env);
  const ox = oxOf(state, env);
  bookDecree(tc, ox, instituteEntry(ox));
  assert.equal(tc.state.peoples[PLAYER].tokens.length, 0);
});

test('approval stays inside the world bounds', () => {
  const { env, state } = world((s) => { institution(s); s.peoples[PLAYER].meters[RULES.approval] = -1; }, { tuning: { approval: { min: -1, max: 3, start: 0 } } });
  const tc = context(state, env);
  const ox = oxOf(state, env);
  bookDecree(tc, ox, instituteEntry(ox));
  assert.equal(tc.state.peoples[PLAYER].meters[RULES.approval], -1);
});

test('afterCouncilOrder: oppose -1, favor +1, and the cap of 2 holds across sources', () => {
  const { env, state } = world((s) => institution(s));
  const tc = context(state, env);
  const ox = oxOf(state, env);
  const e = instituteEntry(ox);
  // torhild opposes handel, garmund has no goal on these tags, ulrun none either
  afterCouncilOrder(tc, ox, e);
  assert.equal(member(tc.state, 'torhild').loyalty, 0);
  assert.equal(member(tc.state, 'ulrun').loyalty, 3);
  bookDecree(tc, ox, e);
  assert.equal(member(tc.state, 'torhild').loyalty, -1);
  changeLoyalty(tc, PLAYER, 'torhild', -1, 'another source');
  assert.equal(member(tc.state, 'torhild').loyalty, -1, 'a third point in one turn is cut');
  changeLoyalty(tc, PLAYER, 'ulrun', 2, 'cap and clamp');
  assert.equal(member(tc.state, 'ulrun').loyalty, 5);
});

test('favored tags raise loyalty after an executed council order', () => {
  const { env, state } = world();
  const tc = context(state, env);
  afterCouncilOrder(tc, oxOf(state, env), { order: { id: 'o1', type: 'build' }, tags: ['herde', 'bau'] });
  assert.equal(member(tc.state, 'ulrun').loyalty, 4);
  assert.equal(member(tc.state, 'torhild').loyalty, 1);
});

// --- Machtprobe: slots, tags, check, plan ---------------------------------------------

const MP = ORDERS.machtprobe;
const order = (params, id = 'm1') => ({ id, type: 'machtprobe', params });

test('Machtprobe slots: first free, second main, none beyond the cap', () => {
  const { env, state } = world();
  const ox = oxOf(state, env);
  assert.deepEqual([0, 1, 2, 3].map((k) => MP.slot(ox, order({}), k)), ['free', 'main', 'none', 'none']);
  const one = world(null, { tuning: { machtprobeCap: 1 } });
  assert.deepEqual([0, 1].map((k) => MP.slot(oxOf(one.state, one.env), order({}), k)), ['free', 'none']);
  const three = world(null, { tuning: { machtprobeCap: 3 } });
  assert.deepEqual([0, 1, 2, 3].map((k) => MP.slot(oxOf(three.state, three.env), order({}), k)), ['free', 'main', 'main', 'none']);
});

test('Machtprobe tags carry the approach', () => {
  const { env, state } = world();
  const ox = oxOf(state, env);
  assert.deepEqual(MP.tags(ox, order({ approach: 'wege' })), ['machtprobe', 'macht', 'wege']);
  assert.deepEqual(MP.tags(ox, order({})), ['machtprobe', 'macht']);
});

test('Machtprobe check validates aim, targets and optional params', () => {
  const { env, state } = world((s) => { s.peoples[PLAYER].tokens.push({ id: 'tok-t0-1', kind: 'grievance', tags: [], turn: 0, source: 'x' }); });
  const ox = { ...oxOf(state, env), path: '/orders/0' };
  const bad = (params) => MP.check(ox, order(params)).length > 0;
  assert.equal(bad({ aim: 'rally' }), false);
  assert.equal(bad({ aim: 'rally', approach: 'wege', cause: 'need', against: 'garmund' }), false);
  assert.equal(bad({}), true);
  assert.equal(bad({ aim: 'conquer' }), true);
  assert.equal(bad({ aim: 'rally', approach: 'Not A Tag' }), true);
  assert.equal(bad({ aim: 'rally', cause: 'greed' }), true);
  assert.equal(bad({ aim: 'rally', against: 'nobody' }), true);
  assert.equal(bad({ aim: 'override' }), true);
  assert.equal(bad({ aim: 'override', order: 'o2' }), false);
  assert.equal(bad({ aim: 'reconcile' }), true);
  assert.equal(bad({ aim: 'reconcile', member: 'nobody' }), true);
  assert.equal(bad({ aim: 'reconcile', member: 'garmund' }), false);
  assert.equal(bad({ aim: 'quell' }), false);
  const clean = world();
  assert.equal(MP.check({ ...oxOf(clean.state, clean.env), path: '/orders/0' }, order({ aim: 'quell' })).length, 1, 'quell needs a grievance');
});

const modsOf = (state, env, params) => MP.plan(oxOf(state, env), order({ aim: 'rally', ...params })).probe;
const valueOf = (probe, source) => probe.extraMods.find((x) => x.source === `machtprobe:${source}`)?.value;

test('Machtprobe plan: target 5, no costs, no speech bonus', () => {
  const { env, state } = world();
  const plan = MP.plan(oxOf(state, env), order({ aim: 'rally' }));
  assert.deepEqual(plan.costs, {});
  assert.equal(plan.probe.kind, 'machtprobe');
  assert.equal(plan.probe.target, 5);
});

test('Machtprobe modifier: standing', () => {
  const at = (n) => { const w = world((s) => { s.peoples[PLAYER].standing = n; }); return valueOf(modsOf(w.state, w.env, {}), 'standing'); };
  assert.deepEqual([at(0), at(1), at(2), at(3)], [undefined, 1, 2, 2]);
});

test('Machtprobe modifier: need needs a shortfall or a foreign unit in an own region', () => {
  const none = world();
  assert.equal(valueOf(modsOf(none.state, none.env, { cause: 'need' }), 'need'), undefined);
  const hungry = world((s) => { s.peoples[PLAYER].shortfall.nahrung = 2; });
  assert.equal(valueOf(modsOf(hungry.state, hungry.env, { cause: 'need' }), 'need'), 1);
  assert.equal(valueOf(modsOf(hungry.state, hungry.env, {}), 'need'), undefined, 'without cause need there is no bonus');
  const invaded = world((s) => {
    const home = s.map.settlements.find((x) => x.people === PLAYER);
    s.peoples.esk.units.push({ id: 'u-9', type: 'speerwall@1', strength: 2, tile: home.tile, state: 'ready', since: 0 });
  });
  assert.equal(valueOf(modsOf(invaded.state, invaded.env, { cause: 'need' }), 'need'), 1);
});

test('Machtprobe modifier: a loyal majority gives +1', () => {
  const base = world();
  assert.equal(valueOf(modsOf(base.state, base.env, {}), 'council'), 1, 'two of three at loyalty 1 or more');
  const split = world((s) => { member(s, 'torhild').loyalty = 0; });
  assert.equal(valueOf(modsOf(split.state, split.env, {}), 'council'), undefined);
});

test('Machtprobe modifier: the opponent weighs by loyalty', () => {
  const at = (l) => { const w = world((s) => { member(s, 'garmund').loyalty = l; }); return valueOf(modsOf(w.state, w.env, { against: 'garmund' }), 'against'); };
  assert.deepEqual([at(0), at(-1), at(-3), at(-4), at(-5)], [undefined, -1, -1, -2, -2]);
});

test('Machtprobe modifier: an open grievance costs 2', () => {
  const w = world((s) => { s.peoples[PLAYER].tokens.push({ id: 'tok-t0-1', kind: 'grievance', tags: ['ordnung'], turn: 0, source: 'x' }); });
  assert.equal(valueOf(modsOf(w.state, w.env, {}), 'grievance'), -2);
});

test('Machtprobe modifier: approval at the thresholds', () => {
  const at = (v) => { const w = world((s) => { s.peoples[PLAYER].meters[RULES.approval] = v; }); return valueOf(modsOf(w.state, w.env, {}), 'approval'); };
  assert.deepEqual([at(2), at(1), at(0), at(-1), at(-2)], [1, undefined, undefined, undefined, -1]);
});

test('Machtprobe through checkDraft: Wesensart acts by the approach tag, slots follow the cap', () => {
  const { env, state } = world();
  const d = emptyDraft(state, PLAYER);
  d.orders = [
    { id: 'm1', type: 'machtprobe', params: { aim: 'rally', approach: 'wege' } },
    { id: 'm2', type: 'machtprobe', params: { aim: 'rally', approach: 'mauern' } },
    { id: 'm3', type: 'machtprobe', params: { aim: 'rally' } },
  ];
  const chk = checkDraft(state, env, d, { as: PLAYER, mode: 'preview' });
  const [a, b, c] = chk.entries;
  assert.deepEqual([a.slot, b.slot, c.slot], ['free', 'main', 'none']);
  assert.ok(a.probe.modifiers.some((x) => x.source === 'wesensart:plus' && x.value === 2));
  assert.ok(b.probe.modifiers.some((x) => x.source === 'wesensart:minus' && x.value === -2));
  assert.ok(b.tags.includes(RULES.mainTag));
  assert.equal(a.vote, null, 'the Machtprobe itself needs no vote');
  assert.ok(chk.issues.some((i) => i.code === 'slots' && i.path === '/orders/2/type'));
});

// --- Machtprobe: resolution by band ---------------------------------------------------

function resolveMp(params, out, edit) {
  const { env, state } = world((s) => {
    member(s, 'garmund').loyalty = -2;
    member(s, 'torhild').loyalty = -1;
    edit?.(s);
  });
  const tc = context(state, env);
  ORDERS.machtprobe.resolve(tc, oxOf(state, env), order(params), null, out);
  return tc;
}

const loyaltyOf = (tc, id) => member(tc.state, id).loyalty;
const tokens = (tc, kind) => tc.state.peoples[PLAYER].tokens.filter((t) => t.kind === kind);
const status = (tc, id) => tc.state.peoples[PLAYER].statuses.find((s) => s.id === id);

test('band boundaries of a probe against target 5 and 8 (the outcomes used below)', () => {
  assert.equal(outcome(5, 9).band, 'crit_success');
  assert.equal(outcome(5, 7).band, 'success');
  assert.equal(outcome(5, 6).band, 'success');
  assert.equal(outcome(5, 5).band, 'narrow');
  assert.equal(outcome(5, 2).band, 'failure');
  assert.equal(outcome(8, 5).band, 'failure');
  assert.equal(outcome(8, 4).band, 'setback');
  assert.equal(outcome(8, 1).band, 'crit_fail');
});

test('crit_success: aim achieved, status autoritaet, impulse token, no opponent penalty', () => {
  const tc = resolveMp({ aim: 'reconcile', member: 'garmund', approach: 'wege', against: 'torhild' }, outcome(5, 10));
  assert.equal(loyaltyOf(tc, 'garmund'), -1);
  assert.equal(loyaltyOf(tc, 'torhild'), -1);
  const st = status(tc, 'autoritaet');
  assert.deepEqual([st.until, st.endsOn], [null, 'setback']);
  assert.deepEqual(st.effects, [{ op: 'probe.mod', tags: [RULES.mainTag], amount: 1, label: 'autoritaet' }]);
  const [imp] = tokens(tc, 'impulse');
  assert.deepEqual(imp.tags, ['wege', 'macht']);
});

test('success: aim achieved, opponent -1, impulse only from margin 2', () => {
  const low = resolveMp({ aim: 'reconcile', member: 'garmund', against: 'torhild' }, outcome(5, 6));
  assert.equal(loyaltyOf(low, 'garmund'), -1);
  assert.equal(loyaltyOf(low, 'torhild'), -2);
  assert.equal(tokens(low, 'impulse').length, 0);
  assert.equal(status(low, 'autoritaet'), undefined);
  const high = resolveMp({ aim: 'reconcile', member: 'garmund', against: 'torhild' }, outcome(5, 7));
  assert.equal(tokens(high, 'impulse').length, 1);
  assert.deepEqual(tokens(high, 'impulse')[0].tags, ['macht']);
});

test('narrow: aim achieved, opponent -1, every member at loyalty -1 or less -1 (once each)', () => {
  const tc = resolveMp({ aim: 'rally', against: 'garmund' }, outcome(5, 5));
  assert.ok(status(tc, 'sammlung'));
  assert.equal(loyaltyOf(tc, 'garmund'), -3, 'the opponent is hit once');
  assert.equal(loyaltyOf(tc, 'torhild'), -2);
  assert.equal(loyaltyOf(tc, 'ulrun'), 3);
});

test('failure: aim missed, opponent -1, members at -1 or less -1', () => {
  const tc = resolveMp({ aim: 'rally', against: 'garmund' }, outcome(5, 2));
  assert.equal(status(tc, 'sammlung'), undefined);
  assert.equal(loyaltyOf(tc, 'garmund'), -3);
  assert.equal(loyaltyOf(tc, 'torhild'), -2);
  assert.equal(tokens(tc, 'crisis').length, 0);
});

test('setback and crit_fail: aim missed, opponent -2, crisis token absetzung', () => {
  for (const out of [outcome(8, 4), outcome(8, 1)]) {
    const tc = resolveMp({ aim: 'reconcile', member: 'garmund', against: 'torhild' }, out);
    assert.equal(loyaltyOf(tc, 'garmund'), -2, out.band);
    assert.equal(loyaltyOf(tc, 'torhild'), -3, out.band);
    assert.deepEqual(tokens(tc, 'crisis').map((t) => t.tags), [['absetzung']], out.band);
  }
});

test('aim override lists the order for the booking step', () => {
  const tc = resolveMp({ aim: 'override', order: 'o2' }, outcome(5, 6));
  assert.deepEqual(tc.scratch.overrides[PLAYER], ['o2']);
  const failed = resolveMp({ aim: 'override', order: 'o2' }, outcome(5, 2));
  assert.equal(failed.scratch.overrides[PLAYER], undefined);
});

test('aim rally gives a one-season status on main orders from the next turn', () => {
  const tc = resolveMp({ aim: 'rally' }, outcome(5, 6));
  const st = status(tc, 'sammlung');
  assert.equal(st.until, 1);
  assert.deepEqual(st.effects[0].tags, [RULES.mainTag]);
  assert.equal(st.effects[0].amount, 1);
});

test('aim quell removes the oldest grievance', () => {
  const tc = resolveMp({ aim: 'quell' }, outcome(5, 6), (s) => {
    s.peoples[PLAYER].tokens.push(
      { id: 'tok-t2-1', kind: 'grievance', tags: [], turn: 2, source: 'b' },
      { id: 'tok-t1-1', kind: 'grievance', tags: [], turn: 1, source: 'a' },
      { id: 'tok-t0-1', kind: 'impulse', tags: [], turn: 0, source: 'c' },
    );
  });
  assert.deepEqual(tc.state.peoples[PLAYER].tokens.map((t) => t.id), ['tok-t2-1', 'tok-t0-1']);
});

test('a Machtprobe leaves the loyalty cap and standing effects of the turn alone', () => {
  const tc = resolveMp({ aim: 'rally', against: 'garmund' }, outcome(8, 4));
  assert.ok(Math.abs(loyaltyOf(tc, 'garmund') - -2) <= 2);
  assert.equal(tc.probes.length, 0);
});

// --- Machtprobe in a whole turn ---------------------------------------------------------

function draftWith(state, env, orders, extra = {}, rolls = {}) {
  const d = { ...emptyDraft(state, PLAYER), orders, ...extra };
  const chk = checkDraft(state, env, d, { as: PLAYER, mode: 'preview' });
  for (const p of chk.probes) d.rolls[p.id] = { value: rolls[p.order ?? 'event'] ?? 5, fingerprint: p.fingerprint };
  return d;
}

const INSTITUTE = { id: 'o2', type: 'institute', params: { development: 'marktrecht@1' } };

test('turn: without a Machtprobe or decree the council rejects the order', () => {
  const { env, state } = world((s) => institution(s));
  const d = draftWith(state, env, [INSTITUTE]);
  assert.ok(checkDraft(state, env, d, { as: PLAYER, mode: 'apply' }).issues.some((i) => i.code === 'council_rejected'));
});

test('turn: a successful override Machtprobe carries the rejected order', () => {
  const { env, state } = world((s) => institution(s));
  const orders = [{ id: 'm1', type: 'machtprobe', params: { aim: 'override', order: 'o2', approach: 'wege' } }, INSTITUTE];
  const res = apply(state, env, { [PLAYER]: draftWith(state, env, orders, {}, { m1: 9 }) });
  assert.equal(res.ok, true, JSON.stringify(res.issues));
  assert.ok(res.state.peoples[PLAYER].developments.instituted.includes('marktrecht@1'));
  assert.equal(res.report.sections.orders.find((o) => o.people === PLAYER && o.id === 'o2').status, 'executed');
  assert.equal(res.state.peoples[PLAYER].tokens.filter((t) => t.kind === 'grievance').length, 0, 'an override is no decree');
});

test('turn: a failed override leaves the order rejected', () => {
  const { env, state } = world((s) => institution(s));
  const orders = [{ id: 'm1', type: 'machtprobe', params: { aim: 'override', order: 'o2' } }, INSTITUTE];
  const res = apply(state, env, { [PLAYER]: draftWith(state, env, orders, {}, { m1: 2 }) });
  assert.equal(res.ok, true, JSON.stringify(res.issues));
  assert.ok(!res.state.peoples[PLAYER].developments.instituted.includes('marktrecht@1'));
  assert.equal(res.report.sections.orders.find((o) => o.people === PLAYER && o.id === 'o2').status, 'rejected');
});

test('turn: a decree runs the order and books its costs', () => {
  const { env, state } = world((s) => institution(s, { garmund: -4 }));
  const res = apply(state, env, { [PLAYER]: draftWith(state, env, [INSTITUTE], { mandate: { o2: 'decree' } }) });
  assert.equal(res.ok, true, JSON.stringify(res.issues));
  const p = res.state.peoples[PLAYER];
  assert.ok(p.developments.instituted.includes('marktrecht@1'));
  assert.equal(p.tokens.filter((t) => t.kind === 'grievance').length, 1);
  assert.equal(p.meters[RULES.approval], state.peoples[PLAYER].meters[RULES.approval] - 1);
  assert.equal(p.council.find((x) => x.id === 'torhild').loyalty, -1, 'decree -1 and the oppose of handel -1');
  assert.ok(res.events.some((e) => e.kind === 'council.decree'));
});

// --- talk -----------------------------------------------------------------------------

const TALK = ORDERS.talk;
const talk = (params) => ({ id: 't1', type: 'talk', params });

test('talk is a free order tagged rat', () => {
  assert.equal(TALK.slot, 'free');
  assert.deepEqual(TALK.tags, ['rat']);
});

test('talk check: modes, member, honor conditions', () => {
  const { env, state } = world((s) => {
    member(s, 'torhild').hollow = true;
    member(s, 'torhild').loyalty = -1;
  });
  const ox = { ...oxOf(state, env), path: '/orders/0' };
  const bad = (params) => TALK.check(ox, talk(params)).length > 0;
  assert.equal(bad({ mode: 'listen', member: 'ulrun' }), false);
  assert.equal(bad({ mode: 'ask', member: 'ulrun' }), false);
  assert.equal(bad({ mode: 'sing', member: 'ulrun' }), true);
  assert.equal(bad({ mode: 'listen', member: 'nobody' }), true);
  assert.equal(bad({ mode: 'honor', member: 'ulrun' }), true, 'loyalty 0 or more');
  assert.equal(bad({ mode: 'honor', member: 'torhild' }), true, 'hollow');
  assert.equal(bad({ mode: 'honor', member: 'garmund' }), false);
});

test('honor: once per member and calendar year', () => {
  // Turn 0 lies in calendar year 1.
  const marked = world((s) => { s.peoples[PLAYER].modules.kern.honored.garmund = 1; });
  const ox = { ...oxOf(marked.state, marked.env), path: '/orders/0' };
  assert.equal(TALK.check(ox, talk({ mode: 'honor', member: 'garmund' })).length, 1, 'honoured this year');
  const older = world((s) => { s.peoples[PLAYER].modules.kern.honored.garmund = 0; });
  assert.equal(TALK.check({ ...oxOf(older.state, older.env), path: '/orders/0' }, talk({ mode: 'honor', member: 'garmund' })).length, 0, 'last honoured in an earlier year');
});

test('honor raises loyalty by 1, marks the year and cannot repeat in one draft', () => {
  const { env, state } = world();
  const tc = context(state, env);
  const ox = oxOf(state, env);
  TALK.resolve(tc, ox, talk({ mode: 'honor', member: 'garmund' }));
  assert.equal(member(tc.state, 'garmund').loyalty, -1);
  assert.equal(tc.state.peoples[PLAYER].modules.kern.honored.garmund, tc.cal.year);
  TALK.resolve(tc, ox, talk({ mode: 'honor', member: 'garmund' }));
  assert.equal(member(tc.state, 'garmund').loyalty, -1);
});

test('honor-dead needs a death of the previous season and raises everyone once', () => {
  const none = world();
  assert.equal(TALK.check({ ...oxOf(none.state, none.env), path: '/orders/0' }, talk({ mode: 'honor-dead' })).length, 1);
  const { env, state } = world((s) => {
    s.turn = 4;
    s.peoples[PLAYER].modules.kern.deaths = [{ member: 'old', turn: 2 }, { member: 'ahn', turn: 3 }];
  });
  const ox = { ...oxOf(state, env), path: '/orders/0' };
  assert.equal(TALK.check(ox, talk({ mode: 'honor-dead' })).length, 0);
  const tc = context(state, env);
  TALK.resolve(tc, ox, talk({ mode: 'honor-dead' }));
  assert.deepEqual(tc.state.peoples[PLAYER].council.map((x) => x.loyalty), [4, 2, -1]);
  assert.deepEqual(tc.state.peoples[PLAYER].modules.kern.deaths, [{ member: 'old', turn: 2 }, { member: 'ahn', turn: 3, honored: true }]);
  TALK.resolve(tc, ox, talk({ mode: 'honor-dead' }));
  assert.deepEqual(tc.state.peoples[PLAYER].council.map((x) => x.loyalty), [4, 2, -1], 'a death is honoured once');
  const after = { ...oxOf(tc.state, env), path: '/orders/0' };
  assert.equal(TALK.check(after, talk({ mode: 'honor-dead' })).length, 1);
});

test('listen and ask only leave a notice', () => {
  const { env, state } = world();
  for (const mode of ['listen', 'ask']) {
    const tc = context(state, env);
    TALK.resolve(tc, oxOf(state, env), talk({ mode, member: 'ulrun' }));
    assert.equal(entries(tc, 'council.talk').length, 1);
    assert.deepEqual(tc.state.peoples[PLAYER].council, state.peoples[PLAYER].council);
  }
});

// --- season -------------------------------------------------------------------------------

test('served: an executed order with a favored tag marks the member', () => {
  const { env, state } = world((s) => { s.turn = 2; });
  const tc = context(state, env);
  tc.scratch.executed[PLAYER] = [{ order: { id: 'o1', type: 'build' }, slot: 'main', tags: ['herde', 'bau'], band: null }];
  resolveCouncilSeason(tc);
  assert.deepEqual(tc.state.peoples[PLAYER].modules.kern.served, { ulrun: 2 });
});

test('winter devotion fades for an ergeben member not served in the last year', () => {
  const edit = (served) => (s) => {
    s.turn = 7;
    member(s, 'ulrun').loyalty = 5;
    member(s, 'torhild').loyalty = 4;
    member(s, 'garmund').loyalty = 3;
    s.peoples[PLAYER].modules.kern.served = served;
  };
  const run = (served, turn) => {
    const { env, state } = world((s) => { edit(served)(s); s.turn = turn; });
    const tc = context(state, env);
    resolveCouncilSeason(tc);
    return tc.state.peoples[PLAYER].council.map((x) => x.loyalty);
  };
  assert.deepEqual(run({}, 7), [4, 3, 3], 'never served: both ergeben members fade, the treu one does not');
  assert.deepEqual(run({ ulrun: 4, torhild: 3 }, 7), [5, 3, 3], 'served in the last four seasons only counts from turn 4');
  assert.deepEqual(run({}, 6), [5, 4, 3], 'no fading outside winter');
});

test('a world may add a flat winter decay of loyalty', () => {
  const { env, state } = world((s) => { s.turn = 3; }, { tuning: { loyaltyDecay: 1 } });
  const tc = context(state, env);
  resolveCouncilSeason(tc);
  assert.deepEqual(tc.state.peoples[PLAYER].council.map((x) => x.loyalty), [2, 0, -3]);
});

function hollowWorld(turn, loyalty = 1) {
  const w = world((s) => {
    s.turn = turn;
    Object.assign(member(s, 'torhild'), { hollow: true, loyalty });
  });
  const tc = context(w.state, w.env);
  return tc;
}

test('hollow loyalty breaks on a failed winter probe', () => {
  for (const [roll, loyalty] of [[1, 1], [4, 1], [4, 2]]) {
    const tc = hollowWorld(3, loyalty);
    tc.rng.d10 = () => roll;
    resolveCouncilSeason(tc);
    const t = member(tc.state, 'torhild');
    assert.deepEqual([t.loyalty, t.hollow], [-2, false], `roll ${roll} at loyalty ${loyalty}`);
    assert.equal(tc.probes[0].id, 'T3:hochweide:hollow-1');
    assert.equal(tc.probes[0].target, RULES.hollowTarget);
    assert.equal(entries(tc, 'council.betrayal').length > 0, true);
  }
});

test('hollow loyalty holds on a success band, loyalty 3 adds +1', () => {
  for (const [roll, loyalty] of [[5, 1], [6, 1], [4, 3], [10, 1]]) {
    const tc = hollowWorld(3, loyalty);
    tc.rng.d10 = () => roll;
    resolveCouncilSeason(tc);
    const t = member(tc.state, 'torhild');
    assert.deepEqual([t.loyalty, t.hollow], [loyalty, true], `roll ${roll} at loyalty ${loyalty}`);
    assert.equal(tc.probes.length, 1);
  }
});

test('no hollow probe outside winter', () => {
  const tc = hollowWorld(2);
  tc.rng.d10 = () => { throw new Error('no roll expected'); };
  resolveCouncilSeason(tc);
  assert.equal(tc.probes.length, 0);
});

test('isAlive follows population and settlements', () => {
  const { state } = world();
  assert.equal(isAlive(state, PLAYER), true);
  state.peoples[PLAYER].population.core = 0;
  assert.equal(isAlive(state, PLAYER), false);
});

test('checkDraft result stays free of errors for a talk and a Machtprobe', () => {
  const { env, state } = world();
  const d = emptyDraft(state, PLAYER);
  d.orders = [{ id: 't1', type: 'talk', params: { mode: 'listen', member: 'ulrun' } }, { id: 'm1', type: 'machtprobe', params: { aim: 'rally' } }];
  assert.equal(hasErrors(checkDraft(state, env, d, { as: PLAYER, mode: 'preview' }).issues), false);
});

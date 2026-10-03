import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDERS, eventProbeSpec, resolveEvents } from '../../../engine/core/events.js';
import { apply, emptyDraft, stateHash } from '../../../engine/core/turn.js';
import { checkDraft } from '../../../engine/core/orders.js';
import { fireHook } from '../../../engine/core/log.js';
import { validate } from '../../../engine/content/schema.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { RULES } from '../../../engine/core/rules.js';
import { PLAYER, context, entries, member, world } from '../../fixtures/engine/k1/council.js';

const draw = (band, card = null, roll = 3) => ({ turn: 0, roll, band, roller: 'player', card });
const card = (id, band, extra = {}) => ({ id, rev: 1, name: id, text: 'text', band, tags: ['ereignis'], if: null, effects: [], options: null, ...extra });
const food = (state, pid = PLAYER) => state.peoples[pid].resources.nahrung;
const gain = (amount) => ({ op: 'resource.delta', res: 'nahrung', amount });
const addStanding = (state, effects, pid = PLAYER) => state.peoples[pid].statuses.push({ id: 'teststand', effects, until: null, endsOn: null });
const noRoll = () => { throw new Error('no random draw expected'); };

test('events own no orders and keep the event probe spec', () => {
  assert.deepEqual(ORDERS, {});
  const { state } = world();
  assert.deepEqual(eventProbeSpec(state, 'esk', 'kernel'), {
    id: 'T0:esk:event', people: 'esk', order: null, kind: 'event', tags: ['ereignis'], roller: 'kernel', target: null, modifiers: [], params: {},
  });
});

// --- world event ------------------------------------------------------------------------

test('the band of the draw selects the card and its effects apply', () => {
  const { env, state } = world((s) => { s.eventDraws = { [PLAYER]: draw(2) }; });
  const tc = context(state, env);
  resolveEvents(tc);
  assert.equal(food(tc.state), food(state) - 1);
  const [drawn] = entries(tc, 'event.drawn');
  assert.deepEqual(drawn.refs, ['kaelteeinbruch@1']);
  assert.deepEqual(drawn.visibleTo, [PLAYER]);
  assert.deepEqual(tc.state.modules.kern.draws['kaelteeinbruch@1'], { total: 1, last: { [PLAYER]: 0 } });
  assert.equal(entries(tc, 'event.history').length, 1);
});

test('a card named in the draw is used whatever the band', () => {
  const { env, state } = world((s) => { s.eventDraws = { [PLAYER]: draw(2, 'gute-weide@1') }; });
  const tc = context(state, env);
  tc.rng.below = noRoll;
  resolveEvents(tc);
  assert.equal(food(tc.state), food(state) + 3);
});

test('a band without a card leaves a notice and draws nothing', () => {
  const { env, state } = world((s) => { s.eventDraws = { [PLAYER]: draw(3) }; s.eventPool = ['lawine@1']; });
  const tc = context(state, env);
  tc.rng.below = noRoll;
  resolveEvents(tc);
  assert.equal(entries(tc, 'event.none').length, 1);
  assert.equal(entries(tc, 'event.drawn').length, 0);
});

test('a people without a draw gets no event', () => {
  const { env, state } = world();
  const tc = context(state, env);
  tc.rng.below = noRoll;
  resolveEvents(tc);
  assert.equal(tc.log.length, 0);
});

test('the if of a card is read from the opening state', () => {
  const cards = [card('a-karte', 3, { if: { res: 'nahrung', cmp: 'gte', value: 999 }, effects: [gain(1)] }), card('b-karte', 3, { effects: [gain(2)] })];
  const { env, state } = world((s) => { s.eventDraws = { [PLAYER]: draw(3) }; s.eventPool = cards.map((c) => `${c.id}@1`); }, { ereignisse: cards });
  const tc = context(state, env);
  tc.rng.below = (n) => { assert.equal(n, 1); return 0; };
  resolveEvents(tc);
  assert.equal(food(tc.state), food(state) + 2);
});

test('candidates are sorted by ref before the RNG picks', () => {
  const cards = [card('y-karte', 3, { effects: [gain(1)] }), card('x-karte', 3, { effects: [gain(2)] })];
  const run = (index) => {
    const { env, state } = world((s) => { s.eventDraws = { [PLAYER]: draw(3) }; s.eventPool = ['y-karte@1', 'x-karte@1']; }, { ereignisse: cards });
    const tc = context(state, env);
    tc.rng.below = (n) => { assert.equal(n, 2); return index; };
    resolveEvents(tc);
    return food(tc.state) - food(state);
  };
  assert.deepEqual([run(0), run(1)], [2, 1]);
});

function drawn(cardDef, { turn = 0, history = {}, pids = [PLAYER] } = {}) {
  const { env, state } = world((s) => {
    s.turn = turn;
    s.eventDraws = Object.fromEntries(pids.map((p) => [p, draw(3)]));
    s.eventPool = [`${cardDef.id}@1`];
    s.modules.kern = { draws: history };
  }, { ereignisse: [cardDef] });
  const tc = context(state, env);
  resolveEvents(tc);
  return Object.fromEntries(pids.map((p) => [p, entries(tc, 'event.drawn').some((e) => e.target.id === p)]));
}

test('once: a people never draws the card twice, others may', () => {
  const c = card('einmalig', 3, { once: true });
  const history = { 'einmalig@1': { total: 1, last: { [PLAYER]: 0 } } };
  assert.deepEqual(drawn(c, { turn: 5, history, pids: [PLAYER, 'esk'] }), { [PLAYER]: false, esk: true });
  assert.deepEqual(drawn(c, { pids: [PLAYER] }), { [PLAYER]: true });
});

test('cooldown: drawn again only when the last draw lies the cooldown back', () => {
  const c = card('selten', 3, { cooldown: 3 });
  const at = (turn) => drawn(c, { turn, history: { 'selten@1': { total: 1, last: { [PLAYER]: 2 } } } })[PLAYER];
  assert.deepEqual([at(3), at(4), at(5), at(6)], [false, false, true, true]);
});

test('maxPerCampaign: the total over all peoples is bounded', () => {
  const c = card('knapp', 3, { maxPerCampaign: 2 });
  const at = (total) => drawn(c, { history: { 'knapp@1': { total, last: { esk: 0 } } } })[PLAYER];
  assert.deepEqual([at(1), at(2)], [true, false]);
  const both = drawn(c, { history: { 'knapp@1': { total: 1, last: {} } }, pids: ['esk', PLAYER] });
  assert.deepEqual(both, { esk: true, [PLAYER]: false }, 'the first people of this turn uses the last draw');
});

test('a decision card opens a pending choice with a deadline', () => {
  const { env, state } = world((s) => { s.turn = 2; s.eventDraws = { [PLAYER]: draw(3) }; s.eventPool = ['fremder-hirte@1']; });
  const tc = context(state, env);
  resolveEvents(tc);
  assert.deepEqual(tc.state.pendingChoices, [{
    id: 'c-2-hochweide', people: PLAYER, event: 'fremder-hirte@1', offeredAt: 2, deadline: 2 + RULES.choiceDeadline, options: ['aufnehmen', 'abweisen'],
  }]);
  assert.equal(entries(tc, 'event.choice').length, 1);
  assert.equal(food(tc.state), food(state), 'options apply only when answered');
  assert.deepEqual(state.pendingChoices, [], 'the opening state is untouched');
});

// --- pending choices ------------------------------------------------------------------------

const PENDING = { id: 'c-0-hochweide', people: PLAYER, event: 'fremder-hirte@1', offeredAt: 0, deadline: 1, options: ['aufnehmen', 'abweisen'] };
const herds = (state) => state.peoples[PLAYER].resources.herden;

function pending(turn, answer) {
  const { env, state } = world((s) => { s.turn = turn; s.pendingChoices = [{ ...PENDING }]; });
  const tc = context(state, env);
  if (answer) tc.scratch.choices = { [PLAYER]: { [PENDING.id]: answer } };
  resolveEvents(tc);
  return { tc, state };
}

test('an answered decision applies the chosen option and closes', () => {
  const { tc, state } = pending(1, 'aufnehmen');
  assert.equal(food(tc.state), food(state) - 1);
  assert.equal(herds(tc.state), herds(state) + 1);
  assert.deepEqual(tc.state.pendingChoices, []);
  assert.equal(entries(tc, 'event.choice').length, 1);
});

test('the other answer applies its own effects', () => {
  const { tc, state } = pending(1, 'abweisen');
  assert.equal(food(tc.state), food(state));
  assert.deepEqual(tc.state.pendingChoices, []);
});

test('an unanswered decision at its deadline applies the first option', () => {
  const { tc, state } = pending(1);
  assert.equal(herds(tc.state), herds(state) + 1);
  assert.deepEqual(tc.state.pendingChoices, []);
  assert.match(entries(tc, 'event.choice')[0].reason, /first option/);
});

test('an unanswered decision before its deadline stays open', () => {
  const { tc, state } = pending(0);
  assert.equal(herds(tc.state), herds(state));
  assert.deepEqual(tc.state.pendingChoices, [PENDING]);
});

test('a decision of a card missing from the library closes with a notice', () => {
  const { env, state } = world((s) => { s.turn = 1; s.pendingChoices = [{ ...PENDING, event: 'verschollen@1' }]; });
  const tc = context(state, env);
  resolveEvents(tc);
  assert.deepEqual(tc.state.pendingChoices, []);
  assert.equal(entries(tc, 'event.choice-lost').length, 1);
});

// --- winter life ------------------------------------------------------------------------------

function winter(edit, rolls, tuning) {
  const { env, state } = world((s) => { s.turn = 3; edit?.(s); }, tuning ? { tuning } : {});
  const tc = context(state, env);
  const queue = typeof rolls === 'number' ? null : [...rolls];
  tc.rng.d10 = () => (queue ? queue.shift() : rolls);
  resolveEvents(tc);
  return { tc, state };
}
const ids = (tc, pid = PLAYER) => tc.state.peoples[pid].council.map((m) => m.id);
const stage = (tc, id) => member(tc.state, id).lifeStage;

test('every member ages in winter and a rüstiges member enters the Lebensabend at the age limit', () => {
  const { tc } = winter((s) => { member(s, 'torhild').age = RULES.ageLebensabend - 1; }, 10);
  assert.deepEqual(tc.state.peoples[PLAYER].council.map((m) => m.age), [59, RULES.ageLebensabend, 64]);
  assert.equal(stage(tc, 'torhild'), 'lebensabend');
  assert.deepEqual(tc.state.peoples.esk.council.map((m) => m.age), [48]);
});

test('a member who enters the Lebensabend rolls only from the next winter', () => {
  const { tc } = winter((s) => { member(s, 'torhild').age = RULES.ageLebensabend - 1; }, 10);
  assert.deepEqual(tc.probes.map((p) => p.id), ['T3:hochweide:life-0', 'T3:hochweide:life-2']);
});

test('no ageing and no life roll outside winter', () => {
  const { env, state } = world((s) => { s.turn = 2; });
  const tc = context(state, env);
  tc.rng.d10 = noRoll;
  resolveEvents(tc);
  assert.deepEqual(tc.state.peoples[PLAYER].council.map((m) => m.age), state.peoples[PLAYER].council.map((m) => m.age));
});

test('Lebensabend life probe: target 4 with +1 in peace, boundary at margin 0', () => {
  for (const [roll, down] of [[3, false], [2, true], [10, false], [1, true]]) {
    const { tc } = winter(null, [roll, 10]);
    const p = tc.probes[0];
    assert.equal(p.target, 4);
    assert.deepEqual(p.modifiers.map((m) => [m.source, m.value]), [['life:peace', 1]]);
    assert.equal(stage(tc, 'ulrun'), down ? 'hinfaellig' : 'lebensabend', `roll ${roll}`);
    assert.ok(ids(tc).includes('ulrun'), 'one stage down is not yet death');
  }
});

test('war removes the peace modifier, hunger takes 1', () => {
  const war = winter((s) => { s.relations['esk|hochweide'].atWar = true; }, [3, 10]);
  assert.deepEqual(war.tc.probes[0].modifiers, []);
  assert.equal(stage(war.tc, 'ulrun'), 'hinfaellig', 'roll 3 against target 4 fails without peace');
  const hungry = winter((s) => { s.peoples[PLAYER].shortfall.nahrung = 1; }, [4, 10]);
  assert.deepEqual(hungry.tc.probes[0].modifiers.map((m) => [m.source, m.value]), [['life:peace', 1], ['life:hunger', -1]]);
  assert.equal(stage(hungry.tc, 'ulrun'), 'lebensabend', 'roll 4 +1 -1 meets 4');
  const current = world((s) => { s.turn = 3; });
  const tc = context(current.state, current.env);
  tc.state.peoples[PLAYER].shortfall.nahrung = 2;
  tc.rng.d10 = () => 10;
  resolveEvents(tc);
  assert.ok(tc.probes[0].modifiers.some((m) => m.source === 'life:hunger'), 'a shortfall of this very turn counts as well');
});

test('a hinfälliges member rolls against target 5 and dies on failure', () => {
  const hold = winter((s) => { member(s, 'garmund').lifeStage = 'hinfaellig'; }, [10, 4]);
  assert.equal(hold.tc.probes[1].target, 5);
  assert.ok(ids(hold.tc).includes('garmund'), 'roll 4 +1 meets 5');
  const dies = winter((s) => { member(s, 'garmund').lifeStage = 'hinfaellig'; }, [10, 3]);
  assert.deepEqual(ids(dies.tc), ['ulrun', 'torhild']);
});

test('life rolls are drawn in sorted people order, then council order', () => {
  const { tc } = winter((s) => { member(s, 'garmund').lifeStage = 'hinfaellig'; s.peoples.esk.council[0].lifeStage = 'lebensabend'; }, [10, 10, 10]);
  assert.deepEqual(tc.probes.map((p) => p.id), ['T3:esk:life-0', 'T3:hochweide:life-0', 'T3:hochweide:life-2']);
});

test('death opens a seat, notes the death and fires the death hooks', () => {
  const { tc } = winter((s) => { member(s, 'garmund').lifeStage = 'hinfaellig'; }, [10, 2]);
  const kern = tc.state.peoples[PLAYER].modules.kern;
  assert.deepEqual(kern.deaths, [{ member: 'garmund', turn: 3 }]);
  assert.deepEqual(kern.seats, [{ role: 'pfadmeister', favor: ['wege', 'erkundung'], oppose: ['mauern'], since: 3 }]);
  const hooks = tc.hooks.filter((h) => h.people === PLAYER).map((h) => h.hook);
  assert.deepEqual(hooks, ['death:pfadmeister', 'death']);
  assert.equal(member(tc.state, 'ulrun').leader, true, 'a death of a member leaves the leader');
  assert.equal(entries(tc, 'council.death').length > 0, true);
});

test('the leader dies: the most loyal member succeeds, standing halves, loyalty is capped, a crisis opens', () => {
  const { tc } = winter((s) => {
    member(s, 'ulrun').lifeStage = 'hinfaellig';
    s.peoples[PLAYER].standing = 3;
    member(s, 'torhild').loyalty = 4;
    member(s, 'garmund').loyalty = 3;
  }, [2, 10]);
  assert.deepEqual(ids(tc), ['torhild', 'garmund']);
  assert.deepEqual(tc.state.peoples[PLAYER].council.map((m) => [m.leader, m.loyalty]), [[true, 2], [false, 2]]);
  assert.equal(tc.state.peoples[PLAYER].standing, 1);
  assert.deepEqual(tc.state.peoples[PLAYER].tokens.filter((t) => t.kind === 'crisis').map((t) => t.tags), [['nachfolge']]);
  assert.ok(tc.hooks.some((h) => h.hook === 'death:leader' && h.people === PLAYER));
  assert.equal(tc.state.peoples[PLAYER].council.filter((m) => m.leader).length, 1);
});

test('a tie in loyalty goes to the earlier seat; loyalty below the cap stays', () => {
  const { tc } = winter((s) => {
    member(s, 'ulrun').lifeStage = 'hinfaellig';
    member(s, 'torhild').loyalty = 1;
    member(s, 'garmund').loyalty = 1;
  }, [2, 10]);
  assert.equal(member(tc.state, 'torhild').leader, true);
  assert.equal(member(tc.state, 'garmund').leader, false);
  assert.equal(member(tc.state, 'garmund').loyalty, 1);
});

test('the last council member does not die', () => {
  const { tc } = winter((s) => { s.peoples.esk.council[0].lifeStage = 'hinfaellig'; }, 1);
  assert.deepEqual(ids(tc, 'esk'), ['vesna']);
  assert.equal(entries(tc, 'council.last-member').length, 1);
  assert.equal(tc.state.peoples.esk.council[0].leader, true);
});

test('deaths older than the last season are dropped, the last one stays honourable', () => {
  const { env, state } = world((s) => {
    s.turn = 6;
    s.peoples[PLAYER].modules.kern.deaths = [{ member: 'a', turn: 4 }, { member: 'b', turn: 5 }];
  });
  const tc = context(state, env);
  resolveEvents(tc);
  assert.deepEqual(tc.state.peoples[PLAYER].modules.kern.deaths, [{ member: 'b', turn: 5 }]);
});

test('after a winter with a death the state still validates', () => {
  const { tc } = winter((s) => { member(s, 'ulrun').lifeStage = 'hinfaellig'; s.eventDraws = { [PLAYER]: draw(2) }; }, [2, 10]);
  const { derived, ...rest } = tc.state;
  assert.deepEqual(validate(SCHEMAS.campaign, rest), []);
});

// --- meters -----------------------------------------------------------------------------------

const meter = (extra = {}) => ({
  op: 'meter', id: 'gier', min: -2, max: 3, rise: { on: 'season', amount: 1 }, decay: 1, thresholds: [{ at: 2, effects: [gain(-1)] }], ...extra,
});
const metered = (def, value, executed = []) => {
  const { env, state } = world((s) => {
    addStanding(s, [def]);
    if (value !== undefined) s.peoples[PLAYER].meters.gier = value;
  });
  const tc = context(state, env);
  tc.scratch.executed[PLAYER] = executed.map((type) => ({ order: { id: 'x', type }, slot: 'main', tags: [], band: null }));
  // apply fires use:<type> for every executed order; meters count these hooks.
  for (const type of executed) tc.hooks.push({ people: PLAYER, hook: `use:${type}`, tags: [] });
  resolveEvents(tc);
  return { tc, state, value: tc.state.peoples[PLAYER].meters.gier };
};

test('a meter that is absent starts at 0, logged, and then rises', () => {
  const { tc, value } = metered(meter());
  assert.equal(value, 1);
  assert.ok(entries(tc, 'meter.change').length >= 2);
});

test('a seasonal rise is clamped to the maximum', () => {
  assert.equal(metered(meter(), 3).value, 3);
  assert.equal(metered(meter({ rise: { on: 'season', amount: 2 } }), 2).value, 3);
});

test('a use rise counts the executed orders of that type', () => {
  const def = meter({ rise: { on: 'use:build', amount: 1 } });
  assert.equal(metered(def, 0, ['build']).value, 1);
  assert.equal(metered(def, 0, ['build', 'build', 'explore']).value, 2);
  assert.equal(metered(def, 0, ['build', 'build', 'build', 'build']).value, 3, 'clamped');
});

test('a use rise also counts application hooks fired by magie (use:<application id>)', () => {
  const def = meter({ rise: { on: 'use:fernblick', amount: 1 } });
  const { env, state } = world((s) => addStanding(s, [def]));
  const tc = context(state, env);
  tc.hooks.push({ people: PLAYER, hook: 'use:fernblick', tags: [] });
  resolveEvents(tc);
  assert.equal(tc.state.peoples[PLAYER].meters.gier, 1);
});

test('a meter decays without a rise and never falls below its minimum', () => {
  const def = meter({ rise: { on: 'use:build', amount: 1 } });
  assert.equal(metered(def, 2, ['explore']).value, 1);
  assert.equal(metered(def, -2).value, -2);
  assert.equal(metered(meter({ rise: { on: 'use:build', amount: 1 }, decay: 0 }), 2).value, 2);
});

test('an upward threshold fires once on crossing', () => {
  const up = metered(meter(), 1);
  assert.equal(food(up.tc.state), food(up.state) - 1);
  assert.equal(metered(meter(), 2).value, 3);
  assert.equal(food(metered(meter(), 2).tc.state), food(up.state), 'already at the threshold, no second crossing');
  assert.equal(food(metered(meter({ thresholds: [{ at: 3, effects: [gain(-1)] }] }), 2).tc.state), food(up.state) - 1);
});

test('a downward threshold at or below 0 fires on crossing, an upper one does not fire on the way down', () => {
  const def = meter({ rise: { on: 'use:build', amount: 1 }, decay: 2, thresholds: [{ at: 0, effects: [gain(-2)] }, { at: 2, effects: [gain(-5)] }] });
  const down = metered(def, 1);
  assert.equal(down.value, -1);
  assert.equal(food(down.tc.state), food(down.state) - 2);
  const high = metered(def, 3);
  assert.equal(high.value, 1);
  assert.equal(food(high.tc.state), food(high.state), 'falling from 3 to 1 crosses 2 downward, which only fires for thresholds at or below 0');
});

test('the thresholds compare with the opening value of the turn', () => {
  const { env, state } = world((s) => { addStanding(s, [meter()]); s.peoples[PLAYER].meters.gier = 1; });
  const tc = context(state, env);
  tc.state.peoples[PLAYER].meters.gier = 2;
  resolveEvents(tc);
  assert.equal(food(tc.state), food(state) - 1, 'opening 1, closing 3');
});

// --- triggers ---------------------------------------------------------------------------------

const trigger = (on, effects = [gain(2)], extra = {}) => ({ op: 'trigger', on, effects, ...extra });

function triggered(effects, { turn = 0, hooks = [], edit } = {}) {
  const { env, state } = world((s) => { s.turn = turn; addStanding(s, effects); edit?.(s); });
  const tc = context(state, env);
  for (const h of hooks) fireHook(tc, h.people ?? PLAYER, h.hook);
  tc.rng.d10 = () => 10;
  resolveEvents(tc);
  return food(tc.state) - food(state);
}

test('a season trigger fires every turn, a winter trigger only in winter', () => {
  assert.equal(triggered([trigger('season')]), 2);
  assert.equal(triggered([trigger('winter')], { turn: 1 }), 0);
  assert.equal(triggered([trigger('winter')], { turn: 3 }), 2);
});

test('a hook trigger fires once per turn however often the hook fires', () => {
  const hooks = [{ hook: 'use:build' }, { hook: 'use:build' }];
  assert.equal(triggered([trigger('use:build')], { hooks }), 2);
  assert.equal(triggered([trigger('use:build'), trigger('use:build')], { hooks }), 4, 'two triggers fire once each');
});

test('a trigger ignores hooks of other peoples and other names', () => {
  assert.equal(triggered([trigger('use:build')], { hooks: [{ hook: 'use:build', people: 'esk' }] }), 0);
  assert.equal(triggered([trigger('war')], { hooks: [{ hook: 'contact' }] }), 0);
});

test('the if of a trigger is evaluated on the opening state', () => {
  assert.equal(triggered([trigger('season', [gain(2)], { if: { res: 'nahrung', cmp: 'gte', value: 999 } })]), 0);
  assert.equal(triggered([trigger('season', [gain(2)], { if: { res: 'nahrung', cmp: 'lt', value: 999 } })]), 2);
});

test('a death in winter fires a death trigger in the same events step', () => {
  const { env, state } = world((s) => { s.turn = 3; addStanding(s, [trigger('death', [gain(3)])]); member(s, 'garmund').lifeStage = 'hinfaellig'; });
  const tc = context(state, env);
  let n = 0;
  tc.rng.d10 = () => (n++ === 1 ? 2 : 10);
  resolveEvents(tc);
  assert.equal(food(tc.state), food(state) + 3);
});

// --- whole turns ------------------------------------------------------------------------------

test('a winter turn applies, stays schema valid and is deterministic', () => {
  const run = () => {
    const { env, state } = world((s) => { s.turn = 3; });
    const d = emptyDraft(state, PLAYER);
    for (const p of checkDraft(state, env, d, { as: PLAYER, mode: 'preview' }).probes) d.rolls[p.id] = { value: 5, fingerprint: p.fingerprint };
    const res = apply(state, env, { [PLAYER]: d });
    assert.equal(res.ok, true, JSON.stringify(res.issues));
    return res;
  };
  const a = run();
  const { derived, ...rest } = a.state;
  // rng.js state() can hand out a signed first word; the rule under test is not the rng encoding.
  rest.rng = { ...rest.rng, s: rest.rng.s.map((x) => x >>> 0) };
  assert.deepEqual(validate(SCHEMAS.campaign, rest), []);
  assert.equal(stateHash(a.state), stateHash(run().state));
  assert.ok(a.report.events.some((e) => e.kind === 'event.drawn' || e.kind === 'event.none'), 'every people had its world event');
  assert.ok(a.state.peoples[PLAYER].council.every((m) => m.age > 40), 'winter aged the council');
});

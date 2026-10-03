import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as bestimmung from '../../../engine/core/bestimmung.js';
import { orderContext } from '../../../engine/core/orders.js';
import { regionTerrain, relKey } from '../../../engine/core/state.js';
import { validateCampaign } from '../../../engine/content/validate.js';
import { scoreBestimmung } from '../../../engine/content/budget.js';
import { statsOf } from '../../../engine/core/stats.js';
import { assertCovered, envWith, fresh, knownEntry, context, logKinds, trivialDestiny } from '../../fixtures/engine/k1/research.js';

const H = 'hochweide';
const withoutDerived = (state) => { const { derived, ...rest } = state; return rest; };
const evalOn = (state, env, pid, pred) => bestimmung.evalPredicate(pred, { state, env, pid });

const holdsDestiny = {
  id: 'ausharren', rev: 1, name: 'Ausharren', summary: 'Durchhalten und satt werden.', tags: ['winter', 'wege'],
  milestones: [
    { id: 'halten', text: 'Zwei Saisons lang vier Sippen', predicate: { pred: 'holds', predicate: { pred: 'population.atLeast', value: 4 }, seasons: 2 } },
    { id: 'satt', text: 'Fünf Nahrung im Lager', predicate: { pred: 'resource.atLeast', key: 'nahrung', value: 5 } },
    { id: 'klein', text: 'Eine Sippe', predicate: { pred: 'population.atLeast', value: 1 } },
  ],
};

function adopt(state, env, pid, ref) {
  state.peoples[pid].bestimmung = bestimmung.initBestimmung(env, ref, 0);
  return state;
}

// One season end on the given state; the returned state carries the next turn.
function season(state, env) {
  const tc = context(state, env, 'bestimmung');
  bestimmung.resolveBestimmung(tc);
  return { tc, next: { ...tc.state, turn: state.turn + 1 } };
}

// --- predicates ---------------------------------------------------------------------

test('controls counts regions, optionally by dominant terrain', () => {
  const env = envWith();
  const s = fresh(env);
  const world = env.world(s.map.seed);
  const own = Object.keys(s.map.control).filter((r) => s.map.control[r] === H);
  assert.equal(own.length, 1);
  const terrain = regionTerrain(world, own[0]);
  assert.equal(evalOn(s, env, H, { pred: 'controls', count: 1 }), true);
  assert.equal(evalOn(s, env, H, { pred: 'controls', count: 2 }), false);
  assert.equal(evalOn(s, env, H, { pred: 'controls', count: 1, terrain }), true);
  assert.equal(evalOn(s, env, H, { pred: 'controls', count: 1, terrain: 'nirgendwo' }), false);
  s.map.control[Object.keys(s.map.control).find((r) => s.map.control[r] === 'esk')] = H;
  assert.equal(evalOn(s, env, H, { pred: 'controls', count: 2 }), true);
});

test('stat.atLeast reads the derived stat and an unknown stat never holds', () => {
  const env = envWith();
  const s = fresh(env);
  assert.equal(evalOn(s, env, H, { pred: 'stat.atLeast', key: 'verteidigung', value: -2 }), true);
  assert.equal(evalOn(s, env, H, { pred: 'stat.atLeast', key: 'verteidigung', value: 3 }), false);
  assert.equal(evalOn(s, env, H, { pred: 'stat.atLeast', key: 'gibtsnicht', value: -2 }), false);
});

test('resource.atLeast and population.atLeast compare against the stock and the clans', () => {
  const env = envWith();
  const s = fresh(env);
  const n = s.peoples[H].resources.nahrung;
  assert.equal(evalOn(s, env, H, { pred: 'resource.atLeast', key: 'nahrung', value: n }), true);
  assert.equal(evalOn(s, env, H, { pred: 'resource.atLeast', key: 'nahrung', value: n + 1 }), false);
  assert.equal(evalOn(s, env, H, { pred: 'resource.atLeast', key: 'rauchkraut', value: 1 }), false);
  assert.equal(evalOn(s, env, H, { pred: 'population.atLeast', value: 3 }), true);
  assert.equal(evalOn(s, env, H, { pred: 'population.atLeast', value: 4 }), false);
});

test('relation covers one people, $any and $all and both comparisons', () => {
  const env = envWith();
  const s = fresh(env);
  s.relations[relKey(H, 'esk')].value = 2;
  s.relations[relKey(H, 'glutreiter')].value = -1;
  const rel = (people, cmp, value) => evalOn(s, env, H, { pred: 'relation', people, cmp, value });
  assert.equal(rel('esk', 'gte', 2), true);
  assert.equal(rel('esk', 'gte', 3), false);
  assert.equal(rel('glutreiter', 'lt', 0), true);
  assert.equal(rel('glutreiter', 'gte', 0), false);
  assert.equal(rel('$any', 'gte', 2), true);
  assert.equal(rel('$any', 'gte', 3), false);
  assert.equal(rel('$all', 'gte', 2), false);
  assert.equal(rel('$all', 'lt', 3), true);
  delete s.relations[relKey(H, 'esk')];
  assert.equal(rel('esk', 'gte', -3), false);
  assert.equal(rel('$all', 'lt', 3), false);
  // A people that went under no longer counts as a partner.
  s.relations[relKey(H, 'esk')] = { value: 2, atWar: false, since: 0 };
  s.map.settlements = s.map.settlements.filter((x) => x.people !== 'glutreiter');
  assert.equal(rel('$all', 'gte', 2), true);
});

test('development.known counts active developments by kind, minimum tier and tags', () => {
  const env = envWith();
  const s = fresh(env);
  const known = s.peoples[H].developments.known;
  assert.equal(known.length, 2);
  const dk = (extra) => evalOn(s, env, H, { pred: 'development.known', ...extra });
  assert.equal(dk({ count: 2 }), true);
  assert.equal(dk({ count: 3 }), false);
  assert.equal(dk({ count: 1, kind: 'institution' }), true);
  assert.equal(dk({ count: 2, kind: 'institution' }), false);
  assert.equal(dk({ count: 1, tier: 1 }), false);
  assert.equal(dk({ count: 1, tags: ['zug'] }), true);
  known.push(knownEntry('filzjurten@1'), knownEntry('hirtenhunde@1', { state: 'suspended', suspendedSince: 0 }));
  assert.equal(dk({ count: 1, tier: 1 }), true);
  assert.equal(dk({ count: 2, tier: 1 }), false, 'a suspended development does not count');
  assert.equal(dk({ count: 1, tier: 0, tags: ['winter', 'ordnung'] }), true, 'tags meet when any one overlaps');
  assert.equal(dk({ count: 1, tier: 1, kind: 'technik', tags: ['krieg'] }), false);
});

test('subjugated holds for a people without clans or without settlement and region', () => {
  const env = envWith();
  const s = fresh(env);
  const pred = { pred: 'subjugated', people: 'esk' };
  assert.equal(evalOn(s, env, H, pred), false);
  const noSettlement = structuredClone(s);
  noSettlement.map.settlements = noSettlement.map.settlements.filter((x) => x.people !== 'esk');
  assert.equal(evalOn(noSettlement, env, H, pred), false, 'its region is still controlled');
  delete noSettlement.map.control[Object.keys(noSettlement.map.control).find((r) => noSettlement.map.control[r] === 'esk')];
  assert.equal(evalOn(noSettlement, env, H, pred), true);
  const noClan = structuredClone(s);
  noClan.peoples.esk.population.core = 0;
  assert.equal(evalOn(noClan, env, H, pred), true);
  assert.equal(evalOn(s, env, H, { pred: 'subjugated', people: 'unbekannt' }), false);
});

test('settlement counts own settlements of a kind', () => {
  const env = envWith();
  const s = fresh(env);
  assert.equal(evalOn(s, env, H, { pred: 'settlement', kind: 'lager', count: 1 }), true);
  assert.equal(evalOn(s, env, H, { pred: 'settlement', kind: 'lager', count: 2 }), false);
  assert.equal(evalOn(s, env, H, { pred: 'settlement', kind: 'dorf', count: 1 }), false);
  s.map.settlements.push({ ...s.map.settlements[0], id: 's-zwei' });
  assert.equal(evalOn(s, env, H, { pred: 'settlement', kind: 'lager', count: 2 }), true);
});

test('an unknown predicate is a programming error', () => {
  const env = envWith();
  assert.throws(() => evalOn(fresh(env), env, H, { pred: 'erfunden' }), /unknown predicate/);
});

// --- holds, latching, victory ----------------------------------------------------------------

test('holds counts consecutive seasons, resets on a miss and reaches at the series length', () => {
  const env = envWith({ bestimmungen: [holdsDestiny] });
  let s = adopt(fresh(env), env, H, 'ausharren@1');
  s.peoples[H].population.core = 4;
  const milestone = (state) => state.peoples[H].bestimmung.milestones.find((m) => m.id === 'halten');

  let r = season(s, env);
  assert.deepEqual(milestone(r.next), { id: 'halten', reached: false, reachedAt: null, progress: 1 });
  r.next.peoples[H].population.core = 3;
  r = season(r.next, env);
  assert.equal(milestone(r.next).progress, 0);
  r.next.peoples[H].population.core = 4;
  r = season(r.next, env);
  r = season(r.next, env);
  assert.deepEqual(milestone(r.next), { id: 'halten', reached: true, reachedAt: 3, progress: 2 });
  assert.ok(logKinds(r.tc).includes('bestimmung.reached'));
});

test('base milestones latch: once reached they stay reached when the predicate fails again', () => {
  const env = envWith({ bestimmungen: [holdsDestiny] });
  const s = adopt(fresh(env), env, H, 'ausharren@1');
  s.turn = 5;
  s.peoples[H].resources.nahrung = 5;
  const r = season(s, env);
  const satt = (state) => state.peoples[H].bestimmung.milestones.find((m) => m.id === 'satt');
  assert.deepEqual(satt(r.next), { id: 'satt', reached: true, reachedAt: 5, progress: 0 });
  r.next.peoples[H].resources.nahrung = 0;
  const again = season(r.next, env);
  assert.deepEqual(satt(again.next), { id: 'satt', reached: true, reachedAt: 5, progress: 0 });
});

test('milestones are read from the end-of-turn state, not from the opening state', () => {
  const env = envWith({ bestimmungen: [holdsDestiny] });
  const s = adopt(fresh(env), env, H, 'ausharren@1');
  const tc = context(s, env, 'bestimmung');
  tc.state.peoples[H].resources.nahrung = 9;
  bestimmung.resolveBestimmung(tc);
  assert.equal(tc.state.peoples[H].bestimmung.milestones.find((m) => m.id === 'satt').reached, true);
});

test('the first people with every milestone wins, a tie goes to the smaller id, and the campaign ends', () => {
  const env = envWith({ bestimmungen: [trivialDestiny('leicht')] });
  const s = fresh(env);
  s.turn = 6;
  adopt(s, env, H, 'leicht@1');
  adopt(s, env, 'esk', 'leicht@1');
  const { tc, next } = season(s, env);
  assert.deepEqual(next.result, { winner: 'esk', kind: 'victory', turn: 6, reason: next.result.reason });
  assert.match(next.result.reason, /Ziel leicht/);
  assert.equal(next.status, 'ended');
  assert.deepEqual(next.peoples.esk.bestimmung.history, [{ ref: 'leicht@1', adoptedAt: 0, endedAt: 6, outcome: 'fulfilled' }]);
  assert.deepEqual(next.peoples[H].bestimmung.history, []);
  const win = tc.log.find((e) => e.kind === 'campaign.victory');
  assert.deepEqual(win.visibleTo, ['all']);
  assert.equal(win.target.kind, 'campaign');
  assert.deepEqual(validateCampaign(withoutDerived(next)).issues, []);
  assertCovered(tc, 'esk');
});

test('a victory of an AI people ends the campaign too', () => {
  const env = envWith({ bestimmungen: [trivialDestiny('leicht')] });
  const s = adopt(fresh(env), env, 'glutreiter', 'leicht@1');
  const { next } = season(s, env);
  assert.equal(next.result.winner, 'glutreiter');
  assert.equal(next.result.kind, 'victory');
  assert.equal(next.status, 'ended');
});

test('a finished campaign is left alone', () => {
  const env = envWith({ bestimmungen: [trivialDestiny('leicht')] });
  const s = adopt(fresh(env), env, H, 'leicht@1');
  s.status = 'ended';
  s.result = { winner: null, kind: 'collapse', turn: 0, reason: 'schon vorbei' };
  const { tc } = season(s, env);
  assert.deepEqual(tc.log, []);
  assert.deepEqual(tc.state.result, s.result);
});

test('no destiny, no victory: the campaign goes on', () => {
  const env = envWith();
  const { tc, next } = season(fresh(env), env);
  assert.equal(next.status, 'playing');
  assert.equal(next.result, null);
  assert.deepEqual(next.peoples.esk.bestimmung, null);
  assert.equal(logKinds(tc).includes('campaign.victory'), false);
});

// --- collapse -------------------------------------------------------------------------------------

test('the collapse of the player people ends the campaign with result kind collapse', () => {
  const env = envWith();
  const s = fresh(env);
  s.peoples[H].population.core = 0;
  s.peoples[H].units = [{ id: 'u-1', type: 'reiterschar@1', strength: 2, tile: s.map.settlements[0].tile, state: 'ready', since: 0 }];
  s.turn = 4;
  const { tc, next } = season(s, env);
  assert.equal(next.result.winner, null);
  assert.equal(next.result.kind, 'collapse');
  assert.equal(next.result.turn, 4);
  assert.equal(next.status, 'ended');
  assert.deepEqual(next.peoples[H].units, []);
  assert.deepEqual(next.peoples[H].population.assigned, {});
  assert.equal(Object.keys(next.map.control).some((r) => next.map.control[r] === H), false);
  assert.ok(Object.values(next.map.control).every((v) => v === null || v !== H));
  assert.ok(logKinds(tc).includes('people.collapsed'));
  assert.ok(logKinds(tc).includes('campaign.defeat'));
  assertCovered(tc, H);
  assert.deepEqual(validateCampaign(withoutDerived(next)).issues, []);
});

test('a people without a settlement collapses, and the campaign is lost when it is the player', () => {
  const env = envWith();
  const s = fresh(env);
  s.map.settlements = s.map.settlements.filter((x) => x.people !== H);
  const { next } = season(s, env);
  assert.equal(next.result.kind, 'collapse');
});

test('an AI people collapses once: units go, control falls free, the campaign continues', () => {
  const env = envWith();
  const s = fresh(env);
  s.map.settlements = s.map.settlements.filter((x) => x.people !== 'esk');
  s.peoples.esk.units = [{ id: 'u-1', type: 'speerwall@1', strength: 3, tile: '0,0', state: 'ready', since: 0 }];
  const first = season(s, env);
  assert.equal(first.next.status, 'playing');
  assert.equal(first.next.result, null);
  assert.deepEqual(first.next.peoples.esk.units, []);
  assert.equal(Object.values(first.next.map.control).includes('esk'), false);
  assert.equal(logKinds(first.tc).filter((k) => k === 'people.collapsed').length, 1);
  const second = season(first.next, env);
  assert.equal(logKinds(second.tc).filter((k) => k === 'people.collapsed').length, 0);
});

test('a collapsed people satisfies subjugated in the same season and cannot win', () => {
  const dead = {
    id: 'unterwerfen', rev: 1, name: 'Unterwerfen', summary: 'Esk soll fallen.', tags: ['krieg'],
    milestones: [
      { id: 'erstes', text: 'Esk ist gefallen', predicate: { pred: 'subjugated', people: 'esk' } },
      { id: 'zweites', text: 'Eine Sippe', predicate: { pred: 'population.atLeast', value: 1 } },
      { id: 'drittes', text: 'Ein Wissen', predicate: { pred: 'development.known', count: 1 } },
    ],
  };
  const env = envWith({ bestimmungen: [dead, trivialDestiny('leicht')] });
  const s = fresh(env);
  adopt(s, env, 'glutreiter', 'unterwerfen@1');
  adopt(s, env, 'esk', 'leicht@1');
  s.map.settlements = s.map.settlements.filter((x) => x.people !== 'esk');
  const { next } = season(s, env);
  assert.equal(next.result.winner, 'glutreiter');
});

// --- destiny.adopt ---------------------------------------------------------------------------------

const adoptDef = bestimmung.ORDERS['destiny.adopt'];
const adoptOrder = (ref) => ({ id: 'o1', type: 'destiny.adopt', params: { bestimmung: ref } });
const oxFor = (state, env, pid = H) => ({ ...orderContext(state, env, pid), path: '/orders/0' });

test('destiny.adopt is a unique main order with the council tag', () => {
  assert.equal(adoptDef.slot, 'main');
  assert.deepEqual(adoptDef.tags, ['bestimmung']);
  assert.equal(adoptDef.unique, true);
});

// Four turns of practice outside the old destiny (its tags are weide, winter, wege) and the given offers, as the open step leaves them.
function readyToSwitch(state, pid, ...refs) {
  const t = state.turn;
  state.peoples[pid].practice.ledger = [t - 4, t - 3, t - 2, t - 1].map((turn) => ({ turn, tags: { handel: 2 } }));
  state.peoples[pid].bestimmung.offers = refs.map((ref) => ({ ref, offeredAt: t, origin: 'pool' }));
  return state;
}

// Updated for M3: a switch now needs the practice condition and an offer, so the tests that adopted from a bare state prepare both.
test('destiny.adopt takes a known destiny other than the current one', () => {
  const env = envWith({ bestimmungen: [holdsDestiny] });
  const s = fresh(env);
  s.turn = 6;
  readyToSwitch(s, H, 'ausharren@1');
  const ox = oxFor(s, env);
  assert.deepEqual(adoptDef.check(ox, adoptOrder('ausharren@1')), []);
  assert.equal(adoptDef.check(ox, adoptOrder('ueberdauern@1'))[0].code, 'target');
  assert.equal(adoptDef.check(ox, adoptOrder('gibtsnicht@1'))[0].code, 'target');
  assert.equal(adoptDef.check(ox, { id: 'o1', type: 'destiny.adopt', params: {} })[0].code, 'target');
});

test('destiny.adopt moves the old destiny into the history and charges standing and loyalty', () => {
  const env = envWith({ bestimmungen: [holdsDestiny] });
  const s = fresh(env);
  s.turn = 6;
  readyToSwitch(s, H, 'ausharren@1');
  s.peoples[H].standing = 2;
  const loyalty = (state) => Object.fromEntries(state.peoples[H].council.map((m) => [m.id, m.loyalty]));
  const before = loyalty(s);
  const tc = context(s, env, 'orders');
  adoptDef.resolve(tc, oxFor(s, env), adoptOrder('ausharren@1'), { costs: {}, probe: null });
  const p = tc.state.peoples[H];
  assert.equal(p.bestimmung.ref, 'ausharren@1');
  assert.equal(p.bestimmung.adoptedAt, 6);
  assert.equal(p.bestimmung.offers, undefined, 'the offers are used up');
  assert.ok(p.bestimmung.milestones.every((m) => !m.reached && m.progress === 0 && m.reachedAt === null));
  assert.deepEqual(p.bestimmung.history, [{ ref: 'ueberdauern@1', adoptedAt: 0, endedAt: 6, outcome: 'switched' }]);
  assert.equal(p.standing, 1);
  const after = loyalty(tc.state);
  // The old destiny names weide, winter and wege; ulrun favors weide, garmund favors wege, torhild neither.
  assert.equal(after.ulrun, before.ulrun - 2);
  assert.equal(after.garmund, before.garmund - 2);
  assert.equal(after.torhild, before.torhild);
  assertCovered(tc, H);
  assert.deepEqual(validateCampaign(withoutDerived(tc.state)).issues, []);
});

test('the history of a people keeps its last twenty destinies', () => {
  const env = envWith({ bestimmungen: [holdsDestiny] });
  const s = fresh(env);
  s.turn = 6;
  readyToSwitch(s, H, 'ausharren@1');
  s.peoples[H].bestimmung.history = Array.from({ length: 20 }, (_, i) => ({ ref: `alt-${i}@1`, adoptedAt: 0, endedAt: 0, outcome: 'switched' }));
  const tc = context(s, env, 'orders');
  adoptDef.resolve(tc, oxFor(s, env), adoptOrder('ausharren@1'), { costs: {}, probe: null });
  const history = tc.state.peoples[H].bestimmung.history;
  assert.equal(history.length, 20);
  assert.equal(history[0].ref, 'alt-1@1');
  assert.equal(history.at(-1).ref, 'ueberdauern@1');
});

test('destiny.adopt is possible once per calendar year', () => {
  const env = envWith({ bestimmungen: [holdsDestiny, trivialDestiny('leicht')] });
  const s = fresh(env);
  s.turn = 5;
  readyToSwitch(s, H, 'ausharren@1');
  const tc = context(s, env, 'orders');
  adoptDef.resolve(tc, oxFor(s, env), adoptOrder('ausharren@1'), { costs: {}, probe: null });
  const adopted = tc.state;
  for (const [turn, allowed] of [[6, false], [7, false], [8, true]]) {
    const state = { ...structuredClone(adopted), turn };
    // The new destiny's tags are winter and wege; the practice stays outside them.
    readyToSwitch(state, H, 'leicht@1');
    const issues = adoptDef.check(oxFor(state, env), adoptOrder('leicht@1'));
    assert.equal(issues.length === 0, allowed, `turn ${turn}`);
  }
  // The destiny a people starts with does not use up the year.
  const start = readyToSwitch({ ...structuredClone(fresh(env)), turn: 6 }, H, 'ausharren@1');
  assert.deepEqual(adoptDef.check(oxFor(start, env), adoptOrder('ausharren@1')), []);
});

test('a people without a destiny can adopt one, and a second adoption in the same year is refused', () => {
  const env = envWith({ bestimmungen: [holdsDestiny, trivialDestiny('leicht')] });
  const s = fresh(env);
  s.turn = 5;
  assert.deepEqual(adoptDef.check(oxFor(s, env, 'esk'), adoptOrder('ausharren@1')), []);
  const tc = context(s, env, 'orders');
  adoptDef.resolve(tc, oxFor(s, env, 'esk'), adoptOrder('ausharren@1'), { costs: {}, probe: null });
  const esk = tc.state.peoples.esk;
  assert.deepEqual(esk.bestimmung.history, []);
  assert.equal(esk.standing, 0);
  const again = { ...structuredClone(tc.state), turn: 6 };
  assert.equal(adoptDef.check(oxFor(again, env, 'esk'), adoptOrder('leicht@1')).length, 1);
});

// --- M3: switching needs practice and an offer ---------------------------------------------------------

const withTags = (id, tags, rev = 1) => ({ ...trivialDestiny(id, tags), rev });
const ledgerOf = (turns, tags = { handel: 2 }) => turns.map((turn) => ({ turn, tags }));

test('canSwitchDestiny needs the four turns before the current one, each without a tag of the destiny', () => {
  const env = envWith();
  const s = fresh(env);
  s.turn = 6;
  const can = () => bestimmung.canSwitchDestiny(s, env, H);
  assert.equal(can(), false, 'no practice history at all');
  s.peoples[H].practice.ledger = ledgerOf([2, 3, 4, 5]);
  assert.equal(can(), true);
  s.peoples[H].practice.ledger = [...ledgerOf([2, 3, 4]), { turn: 5, tags: { handel: 1, weide: 1 } }];
  assert.equal(can(), false, 'one tag of the destiny in the last turn');
  s.peoples[H].practice.ledger = ledgerOf([2, 3, 5]);
  assert.equal(can(), false, 'a turn without a ledger row is no divergence');
  s.peoples[H].practice.ledger = ledgerOf([1, 2, 3, 4]);
  assert.equal(can(), false, 'the rows are not the four turns immediately before');
  s.peoples[H].practice.ledger = ledgerOf([2, 3, 4, 5]);
  const projection = { ...structuredClone(s), peoples: { [H]: structuredClone(s.peoples[H]) } };
  assert.equal(bestimmung.canSwitchDestiny(projection, env, H), true, 'a projection carries the own people only');
  assert.equal(bestimmung.canSwitchDestiny(s, env, 'esk'), true, 'a people without a destiny has nothing to diverge from');
  assert.equal(bestimmung.canSwitchDestiny(s, env, 'unbekannt'), false);
});

test('M3.1 a fresh campaign cannot adopt any destiny at turn 0, neither without practice nor without an offer', () => {
  const env = envWith({ bestimmungen: [holdsDestiny] });
  const s = fresh(env);
  assert.equal(s.turn, 0);
  assert.equal(adoptDef.check(oxFor(s, env), adoptOrder('ausharren@1'))[0].code, 'target');
  s.turn = 6;
  s.peoples[H].practice.ledger = ledgerOf([2, 3, 4, 5]);
  assert.match(adoptDef.check(oxFor(s, env), adoptOrder('ausharren@1'))[0].message, /not offered/);
  s.peoples[H].bestimmung.offers = [{ ref: 'ausharren@1', offeredAt: 6, origin: 'pool' }];
  assert.deepEqual(adoptDef.check(oxFor(s, env), adoptOrder('ausharren@1')), []);
  s.peoples[H].practice.ledger = ledgerOf([2, 3, 4, 5], { weide: 1 });
  assert.match(adoptDef.check(oxFor(s, env), adoptOrder('ausharren@1'))[0].message, /practice/);
});

test('an offer is a destiny offered to this people and runs out after the candidate life', () => {
  const env = envWith({ bestimmungen: [holdsDestiny, withTags('leicht', ['handel'])] });
  const s = fresh(env);
  s.turn = 6;
  readyToSwitch(s, H, 'ausharren@1');
  assert.equal(adoptDef.check(oxFor(s, env), adoptOrder('leicht@1')).length, 1, 'only an offered destiny can be adopted');
  s.turn = 9;
  readyToSwitch(s, H);
  s.peoples[H].bestimmung.offers = [{ ref: 'ausharren@1', offeredAt: 6, origin: 'pool' }];
  assert.deepEqual(adoptDef.check(oxFor(s, env), adoptOrder('ausharren@1')), [], 'three turns old, still open');
  s.turn = 10;
  readyToSwitch(s, H);
  s.peoples[H].bestimmung.offers = [{ ref: 'ausharren@1', offeredAt: 6, origin: 'pool' }];
  assert.equal(adoptDef.check(oxFor(s, env), adoptOrder('ausharren@1')).length, 1, 'four turns old, run out');
});

test('M3.1 the kernel re-checks the order against the opening state and blocks it with a notice', () => {
  const env = envWith({ bestimmungen: [holdsDestiny] });
  const s = fresh(env);
  s.turn = 6;
  const tc = context(s, env, 'orders');
  adoptDef.resolve(tc, oxFor(s, env), adoptOrder('ausharren@1'), { costs: {}, probe: null });
  assert.equal(tc.state.peoples[H].bestimmung.ref, 'ueberdauern@1');
  const note = tc.log.find((e) => e.kind === 'order.blocked');
  assert.ok(note);
  assert.deepEqual(note.visibleTo, [H]);
  assert.equal(tc.state.peoples[H].standing, s.peoples[H].standing);
});

test('M3.2 offerDestiny appends a visible-to-owner offer and refuses every unfit case', () => {
  const env = envWith({ bestimmungen: [holdsDestiny, withTags('leicht', ['handel']), withTags('dritte', ['handel'])] });
  const s = fresh(env);
  s.turn = 6;
  const early = context(s, env, 'agents');
  assert.equal(bestimmung.offerDestiny(early, H, 'ausharren@1', 'agent', { path: '/p' })[0].path, '/p', 'no practice yet');
  s.peoples[H].practice.ledger = ledgerOf([2, 3, 4, 5]);
  const tc = context(s, env, 'agents');
  const offer = (ref, origin = 'agent') => bestimmung.offerDestiny(tc, H, ref, origin);
  assert.deepEqual(offer('ausharren@1'), []);
  const entry = tc.log.find((e) => e.kind === 'bestimmung.offer');
  assert.deepEqual(entry.visibleTo, [H]);
  assert.deepEqual(tc.state.peoples[H].bestimmung.offers, [{ ref: 'ausharren@1', offeredAt: 6, origin: 'agent' }]);
  assert.equal(offer('ausharren@1').length, 1, 'already offered');
  assert.equal(offer('ueberdauern@1').length, 1, 'already the own destiny');
  assert.equal(offer('gibtsnicht@1').length, 1, 'unknown');
  assert.equal(offer('leicht@1', 'wuerfel').length, 1, 'origin');
  assert.deepEqual(offer('leicht@1', 'pool'), []);
  assert.equal(offer('dritte@1').length, 1, 'two offers are open');
  assert.equal(bestimmung.offerDestiny(tc, 'esk', 'leicht@1', 'pool').length, 1, 'a people without a destiny state holds no offer');
  assert.deepEqual(validateCampaign(withoutDerived(tc.state)).issues, []);
});

test('M3.2 offerDestinyPool offers up to two destinies that meet the practice, strongest overlap first, never the own', () => {
  const env = envWith({ bestimmungen: [withTags('a-ziel', ['handel']), withTags('b-ziel', ['handel', 'markt']), withTags('c-ziel', ['handel']), withTags('d-ziel', ['krieg']), withTags('e-ziel', ['weide', 'handel'])] });
  const s = fresh(env);
  s.turn = 6;
  s.peoples[H].practice.ledger = ledgerOf([2, 3, 4, 5], { handel: 2, markt: 1 });
  const tc = context(s, env, 'open');
  bestimmung.offerDestinyPool(tc, H);
  assert.deepEqual(tc.state.peoples[H].bestimmung.offers.map((o) => o.ref), ['b-ziel@1', 'a-ziel@1']);
  assert.ok(tc.state.peoples[H].bestimmung.offers.every((o) => o.origin === 'pool' && o.offeredAt === 6));
  const again = context(tc.state, env, 'open');
  bestimmung.offerDestinyPool(again, H);
  assert.deepEqual(again.log, [], 'two offers are open, nothing new');
  // The practice turns back to the destiny: the offers lapse.
  const back = structuredClone(tc.state);
  back.peoples[H].practice.ledger = ledgerOf([2, 3, 4, 5], { weide: 1 });
  const lapse = context(back, env, 'open');
  bestimmung.offerDestinyPool(lapse, H);
  assert.equal(lapse.state.peoples[H].bestimmung.offers, undefined);
  // A people that still practises its destiny gets no offer, and neither does one without a destiny state.
  const quiet = fresh(env);
  quiet.turn = 6;
  const q = context(quiet, env, 'open');
  bestimmung.offerDestinyPool(q, H);
  bestimmung.offerDestinyPool(q, 'esk');
  assert.deepEqual(q.log, []);
});

test('M3.2 the pool run is deterministic and a pool offer can be adopted at once', () => {
  const env = envWith({ bestimmungen: [withTags('a-ziel', ['handel'])] });
  const s = fresh(env);
  s.turn = 6;
  s.peoples[H].practice.ledger = ledgerOf([2, 3, 4, 5]);
  const run = () => { const tc = context(structuredClone(s), env, 'open'); bestimmung.offerDestinyPool(tc, H); return tc; };
  assert.deepEqual(run().state, run().state);
  const tc = run();
  assert.deepEqual(adoptDef.check(oxFor(tc.state, env), adoptOrder('a-ziel@1')), []);
});

test('a destiny another people holds is neither offered by the pool nor adoptable, whatever its revision', () => {
  const env = envWith({ bestimmungen: [withTags('rivalenziel', ['handel']), withTags('rivalenziel', ['handel'], 2), withTags('freies-ziel', ['handel'])] });
  const s = fresh(env);
  s.turn = 6;
  s.peoples[H].practice.ledger = ledgerOf([2, 3, 4, 5]);
  s.peoples.esk.bestimmung = bestimmung.initBestimmung(env, 'rivalenziel@1', 0);
  const tc = context(s, env, 'open');
  bestimmung.offerDestinyPool(tc, H);
  assert.deepEqual(tc.state.peoples[H].bestimmung.offers.map((o) => o.ref), ['freies-ziel@1']);
  for (const ref of ['rivalenziel@1', 'rivalenziel@2']) {
    assert.match(bestimmung.offerDestiny(tc, H, ref, 'agent')[0].message, /another people/);
    const forced = structuredClone(tc.state);
    forced.peoples[H].bestimmung.offers = [{ ref, offeredAt: 6, origin: 'agent' }];
    assert.match(adoptDef.check(oxFor(forced, env), adoptOrder(ref))[0].message, /another people/);
  }
  // A projection hides the rival's destiny; the kernel stops the order at resolution on the full state.
  const forced = structuredClone(s);
  forced.peoples[H].bestimmung.offers = [{ ref: 'rivalenziel@2', offeredAt: 6, origin: 'agent' }];
  const projection = structuredClone(forced);
  projection.peoples.esk.bestimmung = null;
  assert.deepEqual(adoptDef.check(oxFor(projection, env), adoptOrder('rivalenziel@2')), []);
  const resolving = context(forced, env, 'orders');
  adoptDef.resolve(resolving, oxFor(projection, env), adoptOrder('rivalenziel@2'), { costs: {}, probe: null });
  assert.equal(resolving.state.peoples[H].bestimmung.ref, 'ueberdauern@1');
  assert.ok(logKinds(resolving).includes('order.blocked'));
});

// --- M3.3 milestones of a new destiny count from the next season ---------------------------------------

test('M3.3 milestones of a destiny adopted this turn are not checked until the next season', () => {
  const env = envWith({ bestimmungen: [trivialDestiny('leicht', ['handel'])] });
  const s = fresh(env);
  s.turn = 6;
  readyToSwitch(s, H, 'leicht@1');
  const tc = context(s, env, 'orders');
  adoptDef.resolve(tc, oxFor(s, env), adoptOrder('leicht@1'), { costs: {}, probe: null });
  bestimmung.resolveBestimmung(tc);
  assert.equal(tc.state.status, 'playing');
  assert.ok(tc.state.peoples[H].bestimmung.milestones.every((m) => !m.reached));
  const { next } = season({ ...tc.state, turn: 7 }, env);
  assert.equal(next.result.winner, H);
});

test('the starting destiny is checked in the very first season', () => {
  const env = envWith({ bestimmungen: [trivialDestiny('leicht')] });
  const s = adopt(fresh(env), env, H, 'leicht@1');
  assert.equal(s.turn, 0);
  const { next } = season(s, env);
  assert.equal(next.result.winner, H);
  assert.ok(next.peoples[H].bestimmung.milestones.every((m) => m.reached && m.reachedAt === 0));
});

// --- M3.4 ties and difficulty ---------------------------------------------------------------------------

test('M3.4 a shared victory goes to the higher difficulty, then to the smaller id', () => {
  const env = envWith({ bestimmungen: [trivialDestiny('leicht')] });
  const make = (difficulties) => {
    const s = fresh(env);
    s.turn = 6;
    for (const [pid, d] of Object.entries(difficulties)) {
      adopt(s, env, pid, 'leicht@1');
      s.peoples[pid].bestimmung.difficulty = d;
    }
    return season(s, env).next.result.winner;
  };
  assert.equal(make({ esk: 5, glutreiter: 20 }), 'glutreiter');
  assert.equal(make({ esk: 5, glutreiter: 20, [H]: 20 }), 'glutreiter', 'equal difficulty falls back to the smaller id');
  assert.equal(make({ esk: 20, glutreiter: 5 }), 'esk');
  // Without a stored difficulty (campaigns from before M3) the kernel measures the definitions.
  const hard = { id: 'schwer', rev: 1, name: 'Schwer', summary: 'Mehr verlangt.', tags: ['weide'], milestones: [
    { id: 'a', text: 'Drei Sippen', predicate: { pred: 'population.atLeast', value: 3 } },
    { id: 'b', text: 'Wissen', predicate: { pred: 'development.known', count: 1 } },
    { id: 'c', text: 'Siedlung', predicate: { pred: 'settlement', kind: 'lager', count: 1 } },
  ] };
  const envHard = envWith({ bestimmungen: [trivialDestiny('leicht'), hard] });
  const s = fresh(envHard);
  s.turn = 6;
  adopt(s, envHard, 'esk', 'leicht@1');
  adopt(s, envHard, 'glutreiter', 'schwer@1');
  assert.equal(season(s, envHard).next.result.winner, 'glutreiter');
});

test('M3.4 destinyDifficulty equals the validator score of the budget module', () => {
  const everything = { id: 'alles', rev: 1, name: 'Alles', summary: 'Jede Art Meilenstein.', tags: ['weide'], milestones: [
    { id: 'm1', text: 't', predicate: { pred: 'controls', count: 3 } },
    { id: 'm2', text: 't', predicate: { pred: 'controls', count: 2, terrain: 'alm' } },
    { id: 'm3', text: 't', predicate: { pred: 'stat.atLeast', key: 'verteidigung', value: 2 } },
    { id: 'm4', text: 't', predicate: { pred: 'resource.atLeast', key: 'nahrung', value: 20 } },
    { id: 'm5', text: 't', predicate: { pred: 'population.atLeast', value: 6 } },
    { id: 'm6', text: 't', predicate: { pred: 'relation', people: '$any', cmp: 'gte', value: 2 } },
    { id: 'm7', text: 't', predicate: { pred: 'relation', people: 'esk', cmp: 'lt', value: 0 } },
    { id: 'm8', text: 't', predicate: { pred: 'development.known', count: 3, tier: 1, tags: ['wege'] } },
    { id: 'm9', text: 't', predicate: { pred: 'subjugated', people: 'esk' } },
    { id: 'm10', text: 't', predicate: { pred: 'settlement', kind: 'dorf', count: 2 } },
    { id: 'm11', text: 't', predicate: { pred: 'holds', predicate: { pred: 'population.atLeast', value: 5 }, seasons: 4 } },
  ] };
  const env = envWith({ bestimmungen: [everything, holdsDestiny] });
  const regeln = env.regeln;
  for (const def of env.content.bestimmungen) {
    assert.equal(bestimmung.destinyDifficulty(env, def), scoreBestimmung(def, { regeln }).difficulty, def.id);
  }
  const s = fresh(env);
  s.relations[relKey(H, 'esk')].value = 1;
  const without = { ...everything, milestones: everything.milestones.filter((m) => m.id !== 'm2') };
  const ctx = { regeln, people: s.peoples[H], state: s, stats: statsOf(s, env, H), resolve: (ref) => env.entwicklung(ref) };
  assert.equal(bestimmung.destinyDifficulty(env, without, { state: s, pid: H }), scoreBestimmung(without, ctx).difficulty);
  // A terrain-bound count starts from the regions of that terrain the people really controls.
  const own = Object.keys(s.map.control).find((r) => s.map.control[r] === H);
  const terrain = regionTerrain(env.world(s.map.seed), own);
  const bound = { ...everything, milestones: [{ id: 'm', text: 't', predicate: { pred: 'controls', count: 1, terrain } }] };
  assert.equal(bestimmung.destinyDifficulty(env, bound, { state: s, pid: H }), 0);
  assert.equal(bestimmung.destinyDifficulty(env, bound), 3);
});

test('M3.4 adopting stores the difficulty measured against the opening state', () => {
  const env = envWith({ bestimmungen: [holdsDestiny] });
  const s = fresh(env);
  s.turn = 6;
  readyToSwitch(s, H, 'ausharren@1');
  const tc = context(s, env, 'orders');
  adoptDef.resolve(tc, oxFor(s, env), adoptOrder('ausharren@1'), { costs: {}, probe: null });
  const stored = tc.state.peoples[H].bestimmung.difficulty;
  assert.equal(stored, bestimmung.destinyDifficulty(env, env.bestimmung('ausharren@1'), { state: s, pid: H }));
  assert.ok(Number.isInteger(stored));
  assert.deepEqual(validateCampaign(withoutDerived(tc.state)).issues, []);
  assert.equal(bestimmung.initBestimmung(env, 'ausharren@1', 0).difficulty, undefined, 'campaign creation stores none');
});

// --- M3.5 tuning.collapseCore -------------------------------------------------------------------------------

test('M3.5 a people collapses below tuning.collapseCore, and by default only at core 0', () => {
  const low = (env) => { const s = fresh(env); s.peoples.esk.population.core = 1; return season(s, env); };
  const dflt = low(envWith());
  assert.equal(logKinds(dflt.tc).includes('people.collapsed'), false);
  const strict = low(envWith({ tuning: { collapseCore: 2 } }));
  assert.ok(logKinds(strict.tc).includes('people.collapsed'));
  assert.match(strict.tc.log.find((e) => e.kind === 'people.collapsed').reason, /too few clans/);
  assert.equal(strict.next.status, 'playing', 'an AI people going under does not end the campaign');
  const env4 = envWith({ tuning: { collapseCore: 4 } });
  assert.equal(season(fresh(env4), env4).next.result.kind, 'collapse');
});

// --- machine-readable refusals ------------------------------------------------------------------------

test('adoption and offer refusals name their reason in params', () => {
  const env = envWith({ bestimmungen: [holdsDestiny, withTags('leicht', ['handel']), withTags('dritte', ['handel']), withTags('vierte', ['handel']), withTags('rivalenziel', ['handel'])] });
  const adoptReason = (state, ref) => {
    const issues = adoptDef.check(oxFor(state, env), adoptOrder(ref));
    assert.equal(issues.length, 1, ref);
    assert.equal(issues[0].path, '/orders/0/params');
    return `${issues[0].code}:${issues[0].params.reason}`;
  };
  const s = fresh(env);
  s.turn = 6;
  assert.equal(adoptReason(s, 'gibtsnicht@1'), 'target:unknown-destiny');
  assert.equal(adoptReason(s, 'ueberdauern@1'), 'target:own-destiny');
  assert.equal(adoptReason(s, 'leicht@1'), 'target:practice-touches-destiny', 'no practice rows yet');
  s.peoples[H].practice.ledger = ledgerOf([2, 3, 4, 5]);
  assert.equal(adoptReason(s, 'leicht@1'), 'target:not-offered');
  const rival = structuredClone(s);
  rival.peoples.esk.bestimmung = bestimmung.initBestimmung(env, 'rivalenziel@1', 0);
  assert.equal(adoptReason(rival, 'rivalenziel@1'), 'target:held-by-rival');
  const changed = structuredClone(s);
  changed.peoples[H].bestimmung.adoptedAt = 5;
  assert.equal(adoptReason(changed, 'leicht@1'), 'duplicate:changed-this-year');

  // The blocked notice at resolution keeps the English message of the block.
  const tc = context(rival, env, 'orders');
  adoptDef.resolve(tc, oxFor(rival, env), adoptOrder('rivalenziel@1'), { costs: {}, probe: null });
  assert.match(tc.log.find((e) => e.kind === 'order.blocked').reason, /another people holds this destiny/);

  const early = context(structuredClone(s), env, 'agents');
  early.state.peoples[H].practice.ledger = [];
  const offerReason = (tc2, pid, ref, origin = 'agent') => {
    const issues = bestimmung.offerDestiny(tc2, pid, ref, origin);
    assert.equal(issues.length, 1, `${pid} ${ref} ${origin}`);
    assert.equal(issues[0].code, 'target');
    return issues[0].params.reason;
  };
  assert.equal(offerReason(early, H, 'leicht@1'), 'practice-touches-destiny');
  const tc2 = context(rival, env, 'agents');
  assert.equal(offerReason(context(structuredClone(s), env, 'agents'), 'esk', 'leicht@1', 'pool'), 'no-destiny-state');
  assert.equal(offerReason(tc2, H, 'leicht@1', 'wuerfel'), 'origin');
  assert.equal(offerReason(tc2, H, 'gibtsnicht@1'), 'unknown-destiny');
  assert.equal(offerReason(tc2, H, 'ueberdauern@1'), 'own-destiny');
  assert.equal(offerReason(tc2, H, 'rivalenziel@1'), 'held-by-rival');
  assert.deepEqual(bestimmung.offerDestiny(tc2, H, 'leicht@1', 'pool'), []);
  assert.equal(offerReason(tc2, H, 'leicht@1'), 'offered-already');
  assert.deepEqual(bestimmung.offerDestiny(tc2, H, 'dritte@1', 'pool'), []);
  assert.equal(offerReason(tc2, H, 'vierte@1'), 'offers-full');
});

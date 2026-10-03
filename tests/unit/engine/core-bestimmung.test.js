import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as bestimmung from '../../../engine/core/bestimmung.js';
import { orderContext } from '../../../engine/core/orders.js';
import { regionTerrain, relKey } from '../../../engine/core/state.js';
import { validateCampaign } from '../../../engine/content/validate.js';
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

test('destiny.adopt takes a known destiny other than the current one', () => {
  const env = envWith({ bestimmungen: [holdsDestiny] });
  const s = fresh(env);
  const ox = oxFor(s, env);
  assert.deepEqual(adoptDef.check(ox, adoptOrder('ausharren@1')), []);
  assert.equal(adoptDef.check(ox, adoptOrder('ueberdauern@1'))[0].code, 'target');
  assert.equal(adoptDef.check(ox, adoptOrder('gibtsnicht@1'))[0].code, 'target');
  assert.equal(adoptDef.check(ox, { id: 'o1', type: 'destiny.adopt', params: {} })[0].code, 'target');
});

test('destiny.adopt moves the old destiny into the history and charges standing and loyalty', () => {
  const env = envWith({ bestimmungen: [holdsDestiny] });
  const s = fresh(env);
  s.turn = 2;
  s.peoples[H].standing = 2;
  const loyalty = (state) => Object.fromEntries(state.peoples[H].council.map((m) => [m.id, m.loyalty]));
  const before = loyalty(s);
  const tc = context(s, env, 'orders');
  adoptDef.resolve(tc, oxFor(s, env), adoptOrder('ausharren@1'), { costs: {}, probe: null });
  const p = tc.state.peoples[H];
  assert.equal(p.bestimmung.ref, 'ausharren@1');
  assert.equal(p.bestimmung.adoptedAt, 2);
  assert.ok(p.bestimmung.milestones.every((m) => !m.reached && m.progress === 0 && m.reachedAt === null));
  assert.deepEqual(p.bestimmung.history, [{ ref: 'ueberdauern@1', adoptedAt: 0, endedAt: 2, outcome: 'switched' }]);
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
  s.turn = 2;
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
  s.turn = 1;
  const tc = context(s, env, 'orders');
  adoptDef.resolve(tc, oxFor(s, env), adoptOrder('ausharren@1'), { costs: {}, probe: null });
  const adopted = tc.state;
  for (const [turn, allowed] of [[2, false], [3, false], [4, true]]) {
    const state = { ...structuredClone(adopted), turn };
    const issues = adoptDef.check(oxFor(state, env), adoptOrder('leicht@1'));
    assert.equal(issues.length === 0, allowed, `turn ${turn}`);
  }
  // The destiny a people starts with does not use up the year.
  assert.deepEqual(adoptDef.check(oxFor({ ...structuredClone(fresh(env)), turn: 2 }, env), adoptOrder('ausharren@1')), []);
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

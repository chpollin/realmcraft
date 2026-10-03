import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testEnv } from '../../fixtures/engine/k1/pack.js';
import {
  PLAYER, PARTNER, RIVAL, startState, hochlandEnv, edited, learn, withResources, withRelation, atTurn, contextOf,
  runGlobal, resolveOrder, checkOrders, rolledDraft, season, uncoveredPaths, LABELS,
} from '../../fixtures/engine/k1/modules.js';
import handel, { tradeRoute } from '../../../engine/modules/handel.js';
import { activeModules } from '../../../engine/modules/index.js';
import { catalogueFor } from '../../../engine/core/orders.js';
import { emptyDraft } from '../../../engine/core/turn.js';
import { RULES } from '../../../engine/core/rules.js';
import { route, regionAt } from '../../../engine/core/map.js';
import { distance, key, parseKey } from '../../../engine/world/index.js';
import { homeSettlement, relKey } from '../../../engine/core/state.js';

const env = testEnv();
const world = env.world(7);
const REL = relKey(PLAYER, PARTNER);
const asTrader = (s, pid) => edited(learn(s, pid, 'salzpfad@1'), (x) => { x.peoples[pid].modules.handel = { offersMade: 0 }; });
const start = startState(env);
const traders = withRelation(asTrader(asTrader(start, PLAYER), PARTNER), PLAYER, PARTNER, { contact: true });
const slice = (s) => s.modules.handel;
const errors = (issues) => issues.filter((i) => i.severity === 'error');
const offerOrder = (params) => [{ id: 'o1', type: 'trade.offer', params: { partner: PARTNER, give: { herden: 2 }, get: { nahrung: 2 }, seasons: 3, ...params } }];
const withSlice = (s, patch) => edited(s, (x) => Object.assign(slice(x), patch));
const contract = (patch = {}) => ({ id: 'ct-0-1', a: PLAYER, b: PARTNER, aGives: { herden: 2 }, bGives: { nahrung: 2 }, from: 0, until: 3, ...patch });
const offer = (patch = {}) => ({ id: 'of-0-1', from: PLAYER, to: PARTNER, give: { herden: 2 }, get: { nahrung: 2 }, seasons: 3, expiresAt: 1, ...patch });
const res = (s, pid, r) => s.peoples[pid].resources[r];

test('handel is inactive without the activating development and its orders are locked', () => {
  assert.equal(handel.always, false);
  assert.equal(activeModules(start, env, PLAYER).some((m) => m.id === 'handel'), false);
  const issues = checkOrders(start, env, PLAYER, offerOrder()).issues;
  assert.ok(issues.some((i) => i.code === 'locked_order' && i.severity === 'error'));
  const cat = catalogueFor(start, env, PLAYER).find((c) => c.type === 'trade.offer');
  assert.equal(cat.available, false);
  assert.match(cat.reason, /handel is not active/);
});

test('salzpfad activates handel with the currency role bound to salz', () => {
  const m = activeModules(traders, env, PLAYER).find((x) => x.id === 'handel');
  assert.deepEqual(m.bind, { currency: 'salz' });
  assert.deepEqual(handel.resourceRoles, [{ role: 'currency', defaultId: 'salz' }]);
});

test('initial slices: an empty ledger for the world, an offer counter per people', () => {
  assert.deepEqual(handel.initGlobal(env), { offers: [], contracts: [], prices: {}, seq: 0 });
  assert.deepEqual(handel.initPeople(), { offersMade: 0 });
  assert.deepEqual(slice(start), { offers: [], contracts: [], prices: {}, seq: 0 });
});

test('real Hochland: the Markt am Pass building activates handel from the season after it stands', () => {
  const real = hochlandEnv();
  const s = startState(real);
  const pid = s.campaign.player;
  assert.equal(activeModules(s, real, pid).some((m) => m.id === 'handel'), false);
  const built = edited(s, (x) => {
    const home = homeSettlement(x, pid);
    x.map.settlements.find((y) => y.id === home.id).buildings.push({ ref: 'markt-am-pass@1', since: 0, state: 'active' });
  });
  assert.equal(activeModules(atTurn(built, 1), real, pid).find((m) => m.id === 'handel').bind.currency, 'salz');
});

test('tradeRoute is road-aware, symmetric in range and shuts at war', () => {
  const r = tradeRoute(start, world, PLAYER, PARTNER);
  assert.ok(r && r.cost <= RULES.tradeRadius * 2);
  assert.equal(r.path[0], homeSettlement(start, PLAYER).tile);
  assert.equal(r.path.at(-1), homeSettlement(start, PARTNER).tile);
  assert.equal(tradeRoute(start, world, PARTNER, PLAYER).cost, r.cost);
  assert.equal(tradeRoute(withRelation(start, PLAYER, PARTNER, { atWar: true }), world, PLAYER, PARTNER), null);
});

test('tradeRoute is closed through regions of a people at war with either side', () => {
  const r = tradeRoute(start, world, PLAYER, PARTNER);
  const eskRegion = regionAt(world, homeSettlement(start, PARTNER).tile);
  const seized = edited(withRelation(start, PLAYER, RIVAL, { atWar: true }), (s) => { s.map.control[eskRegion] = RIVAL; });
  assert.equal(tradeRoute(seized, world, PLAYER, PARTNER), null, 'the destination region is held by an enemy of the origin');
  const peaceful = edited(start, (s) => { s.map.control[eskRegion] = RIVAL; });
  assert.ok(tradeRoute(peaceful, world, PLAYER, PARTNER), 'a foreign region at peace is open');
  // A hostile region in the middle of the way forces a detour or closes the route.
  const mid = regionAt(world, r.path[Math.floor(r.path.length / 2)]);
  if (![regionAt(world, r.path[0]), eskRegion].includes(mid)) {
    const blocked = edited(withRelation(start, PLAYER, RIVAL, { atWar: true }), (s) => { s.map.control[mid] = RIVAL; });
    const detour = tradeRoute(blocked, world, PLAYER, PARTNER);
    assert.ok(detour === null || detour.path.every((k) => regionAt(world, k) !== mid));
  }
});

test('trade range is measured in half-step cost, so roads extend it', () => {
  const home = homeSettlement(start, PLAYER);
  const roaded = (s, path) => edited(s, (x) => {
    for (const k of path) x.map.features[k] = { id: `weg-${k}`.replace(/[^a-z0-9-]/g, 'x').slice(0, 41), kind: RULES.roadKind, name: 'Weg', tags: ['weg'], resources: [], since: 0, source: 'kernel' };
  });
  const homeTile = parseKey(home.tile);
  let pick = null;
  for (let q = -RULES.tradeRadius; q <= RULES.tradeRadius && !pick; q++) {
    for (let r = -RULES.tradeRadius; r <= RULES.tradeRadius && !pick; r++) {
      const h = { q: homeTile.q + q, r: homeTile.r + r };
      if (distance(homeTile, h) !== RULES.tradeRadius) continue;
      const k = key(h.q, h.r);
      const far = route(start, world, home.tile, k, { maxRadius: RULES.tradeRadius });
      if (!far || far.cost <= RULES.tradeRadius * 2) continue;
      const near = route(roaded(start, far.path), world, home.tile, k, { maxRadius: RULES.tradeRadius });
      if (near && near.cost <= RULES.tradeRadius * 2) pick = { k, far, path: far.path };
    }
  }
  assert.ok(pick, 'a destination beyond the range that a road brings within it');
  const moved = (s) => edited(s, (x) => {
    const e = x.map.settlements.find((y) => y.id === 's-esk');
    e.tile = pick.k;
    e.regionId = regionAt(world, pick.k);
  });
  assert.equal(tradeRoute(moved(start), world, PLAYER, PARTNER), null);
  assert.ok(tradeRoute(roaded(moved(start), pick.path), world, PLAYER, PARTNER));
  const tooFar = edited(start, (x) => { x.map.settlements.find((y) => y.id === 's-esk').tile = key(homeTile.q + RULES.tradeRadius + 1, homeTile.r); });
  assert.equal(tradeRoute(tooFar, world, PLAYER, PARTNER), null, 'beyond the search radius');
});

test('trade.offer is a minor order with the tag handel and a valid offer passes', () => {
  assert.equal(handel.orders['trade.offer'].slot, 'minor');
  assert.deepEqual(handel.orders['trade.offer'].tags, ['handel']);
  const chk = checkOrders(traders, env, PLAYER, offerOrder());
  assert.deepEqual(errors(chk.issues), []);
  assert.equal(chk.entries[0].slot, 'minor');
  assert.deepEqual(chk.costs, {});
});

test('trade.offer check rejects every bad parameter', () => {
  const bad = (s, patch) => errors(checkOrders(s, env, PLAYER, offerOrder(patch)).issues);
  assert.equal(bad(traders, {}).length, 0);
  assert.equal(bad(traders, { partner: PLAYER }).length, 1, 'oneself');
  assert.equal(bad(traders, { partner: 'niemand' }).length, 1, 'unknown people');
  assert.equal(bad(withRelation(traders, PLAYER, PARTNER, { contact: false }), {}).length, 1, 'no contact yet');
  assert.equal(bad(withRelation(traders, PLAYER, PARTNER, { atWar: true }), {}).length, 1, 'at war');
  assert.equal(bad(withRelation(asTrader(start, PLAYER), PLAYER, PARTNER, { contact: true }), {}).length, 1, 'the partner does not trade');
  assert.equal(bad(traders, { give: {} }).length, 1, 'empty give');
  assert.equal(bad(traders, { give: { gold: 1 } }).length, 1, 'not a world resource');
  assert.equal(bad(traders, { give: { herden: 0 } }).length, 1, 'amount below 1');
  assert.equal(bad(traders, { get: { nahrung: 13 } }).length, 1, 'amount above 12');
  assert.equal(bad(traders, { get: { nahrung: 1.5 } }).length, 1, 'not an integer');
  assert.equal(bad(traders, { seasons: 0 }).length, 1);
  assert.equal(bad(traders, { seasons: 9 }).length, 1);
  assert.equal(bad(traders, { give: { herden: 5 } }).length, 1, 'the people holds 4 herds');
  const far = edited(traders, (x) => { x.map.settlements.find((y) => y.id === 's-esk').tile = '90,90'; });
  assert.ok(errors(checkOrders(far, env, PLAYER, offerOrder()).issues).some((i) => i.code === 'handel.no_route'));
});

test('trade.offer resolves into the global ledger with a numbered id, visible to both peoples', () => {
  const { tc, errors: e } = resolveOrder(traders, env, PLAYER, handel.orders['trade.offer'], offerOrder()[0].params);
  assert.deepEqual(e, []);
  assert.deepEqual(slice(tc.state).offers, [{ id: 'of-0-1', from: PLAYER, to: PARTNER, give: { herden: 2 }, get: { nahrung: 2 }, seasons: 3, expiresAt: 1 }]);
  assert.equal(slice(tc.state).seq, 1);
  assert.equal(tc.state.peoples[PLAYER].modules.handel.offersMade, 1);
  const entry = tc.log.find((x) => x.kind === 'trade.offer');
  assert.deepEqual(entry.target, { kind: 'campaign', id: 'm-1' });
  assert.deepEqual(entry.visibleTo, [PARTNER, PLAYER].sort());
  assert.deepEqual(uncoveredPaths(tc, PLAYER), []);
  const second = resolveOrder(traders, env, PLAYER, handel.orders['trade.offer'], offerOrder()[0].params, 'success', { id: 'o2', tc });
  assert.deepEqual(second.errors, []);
  assert.deepEqual(slice(tc.state).offers.map((x) => x.id), ['of-0-1', 'of-0-2']);
});

const offered = withSlice(atTurn(traders, 1), { offers: [offer()], seq: 1 });

test('trade.accept check: an open offer to this people that it can cover', () => {
  const accept = (s, pid, params) => errors(checkOrders(s, env, pid, [{ id: 'a1', type: 'trade.accept', params }]).issues);
  assert.equal(accept(offered, PARTNER, { offer: 'of-0-1' }).length, 0);
  assert.equal(accept(offered, PLAYER, { offer: 'of-0-1' }).length, 1, 'the offerer cannot accept its own offer');
  assert.equal(accept(offered, PARTNER, { offer: 'of-9-9' }).length, 1, 'unknown offer');
  assert.equal(accept(atTurn(offered, 2), PARTNER, { offer: 'of-0-1' }).length, 1, 'expired');
  assert.equal(accept(withResources(offered, PARTNER, { nahrung: 1 }), PARTNER, { offer: 'of-0-1' }).length, 1, 'cannot cover the get side');
  assert.equal(accept(withRelation(offered, PLAYER, PARTNER, { atWar: true }), PARTNER, { offer: 'of-0-1' }).length, 1, 'no route in war');
  assert.equal(handel.orders['trade.accept'].slot, 'free');
});

test('trade.accept makes a contract from the next season for the offered term and closes the offer', () => {
  const { tc, errors: e } = resolveOrder(offered, env, PARTNER, handel.orders['trade.accept'], { offer: 'of-0-1' });
  assert.deepEqual(e, []);
  assert.deepEqual(slice(tc.state).offers, []);
  assert.deepEqual(slice(tc.state).contracts, [{ id: 'ct-1-2', a: PLAYER, b: PARTNER, aGives: { herden: 2 }, bGives: { nahrung: 2 }, from: 2, until: 4 }]);
  assert.equal(res(tc.state, PARTNER, 'nahrung'), 8, 'nothing is delivered in the season of acceptance');
  assert.ok(tc.log.every((x) => x.kind !== 'trade.delivery'));
});

test('a second accept of the same offer in one season only leaves a notice', () => {
  const first = resolveOrder(offered, env, PARTNER, handel.orders['trade.accept'], { offer: 'of-0-1' });
  const again = resolveOrder(offered, env, PARTNER, handel.orders['trade.accept'], { offer: 'of-0-1' }, 'success', { tc: first.tc });
  assert.equal(slice(again.tc.state).contracts.length, 1);
  assert.ok(again.tc.log.some((x) => x.kind === 'trade.offer-gone'));
});

test('offer, accept and execution through full seasons: the contract delivers from the season after acceptance', () => {
  let s = atTurn(traders, 0);
  s = edited(s, (x) => { x.turn = 0; });
  const draft = rolledDraft(s, env, PLAYER, offerOrder());
  let r = season(s, env, { [PLAYER]: draft });
  s = r.state;
  // The AI partner may make offers of its own; only the player's is followed here.
  const mine = (list) => list.filter((x) => x.from === PLAYER || x.a === PLAYER);
  assert.equal(mine(slice(s).offers).length, 1);
  const id = mine(slice(s).offers)[0].id;
  assert.match(id, /^of-0-\d+$/);
  const acceptDraft = { ...emptyDraft(s, PARTNER), orders: [{ id: 'a1', type: 'trade.accept', params: { offer: id } }] };
  r = season(s, env, { [PLAYER]: rolledDraft(s, env, PLAYER, []), [PARTNER]: acceptDraft });
  s = r.state;
  assert.equal(mine(slice(s).offers).length, 0);
  assert.equal(mine(slice(s).contracts).length, 1);
  assert.equal(mine(slice(s).contracts)[0].from, 2);
  assert.ok(r.events.every((e) => e.kind !== 'trade.delivery'), 'no delivery in the season of acceptance');
  r = season(s, env, { [PLAYER]: rolledDraft(s, env, PLAYER, []) });
  const moves = r.events.filter((e) => e.kind === 'trade.delivery');
  assert.deepEqual(moves.map((e) => [e.target.id, e.change.field, e.change.delta]).sort(), [
    [PARTNER, 'resources.herden', 2], [PARTNER, 'resources.nahrung', -2], [PLAYER, 'resources.herden', -2], [PLAYER, 'resources.nahrung', 2],
  ].sort());
  assert.ok(moves.every((e) => e.step === 'modules'));
});

const running = (patch) => withSlice(atTurn(traders, 2), { contracts: [contract(patch)] });

test('a contract delivers both sides in its term, in a hook of its own', () => {
  const tc = contextOf(running(), env);
  runGlobal(tc);
  assert.equal(res(tc.state, PLAYER, 'herden'), 4 - 2);
  assert.equal(res(tc.state, PLAYER, 'nahrung'), 6 + 2);
  assert.equal(res(tc.state, PARTNER, 'herden'), 1 + 2);
  assert.equal(res(tc.state, PARTNER, 'nahrung'), 8 - 2);
  assert.equal(tc.state.relations[REL].value, 0);
  assert.equal(slice(tc.state).contracts.length, 1);
  assert.deepEqual(uncoveredPaths(tc, PLAYER), []);
  assert.deepEqual(uncoveredPaths(tc, PARTNER), []);
});

test('a contract does not run before its first season and is removed after its last', () => {
  const early = contextOf(running({ from: 3, until: 5 }), env);
  runGlobal(early);
  assert.equal(res(early.state, PLAYER, 'herden'), 4);
  assert.equal(slice(early.state).contracts.length, 1);
  const last = contextOf(running({ from: 0, until: 2 }), env);
  runGlobal(last);
  assert.equal(res(last.state, PLAYER, 'herden'), 2, 'the last season still delivers');
  const over = contextOf(running({ from: 0, until: 1 }), env);
  runGlobal(over);
  assert.equal(res(over.state, PLAYER, 'herden'), 4);
  assert.deepEqual(slice(over.state).contracts, []);
});

test('delivery fails when a side cannot pay: notice, relation -1, the contract stays', () => {
  for (const [who, patch] of [[PLAYER, { herden: 1 }], [PARTNER, { nahrung: 1 }]]) {
    const tc = contextOf(withResources(running(), who, patch), env);
    runGlobal(tc);
    assert.equal(res(tc.state, PLAYER, 'herden'), res(withResources(running(), who, patch), PLAYER, 'herden'), 'nothing moves');
    assert.equal(tc.state.relations[REL].value, -1);
    assert.equal(tc.log.filter((e) => e.kind === 'trade.delivery-failed').length, 1);
    assert.match(tc.log.find((e) => e.kind === 'trade.delivery-failed').reason, new RegExp(`${who} cannot pay`));
    assert.equal(slice(tc.state).contracts.length, 1);
  }
});

test('delivery fails when a war closes the route', () => {
  const eskRegion = regionAt(world, homeSettlement(start, PARTNER).tile);
  const war = edited(withRelation(running(), PLAYER, RIVAL, { atWar: true }), (s) => { s.map.control[eskRegion] = RIVAL; });
  const tc = contextOf(war, env);
  runGlobal(tc);
  assert.equal(res(tc.state, PLAYER, 'herden'), 4);
  assert.equal(tc.state.relations[REL].value, -1);
  assert.match(tc.log.find((e) => e.kind === 'trade.delivery-failed').reason, /no trade route/);
  const atWar = contextOf(withRelation(running(), PLAYER, PARTNER, { atWar: true }), env);
  runGlobal(atWar);
  assert.equal(atWar.log.filter((e) => e.kind === 'trade.delivery-failed').length, 1);
});

test('contracts run in creation order against a shared stock', () => {
  const s = withSlice(atTurn(traders, 2), { contracts: [contract({ id: 'ct-0-1', aGives: { herden: 3 } }), contract({ id: 'ct-0-2', aGives: { herden: 3 } })] });
  const tc = contextOf(s, env);
  runGlobal(tc);
  assert.equal(res(tc.state, PLAYER, 'herden'), 1, 'only the first contract could pay');
  assert.deepEqual(tc.log.filter((e) => e.kind === 'trade.delivery-failed').map((e) => e.refs[0]), ['ct-0-2']);
});

test('offers lapse after the season they can be answered in', () => {
  const s = withSlice(atTurn(traders, 2), { offers: [offer({ id: 'of-0-1', expiresAt: 1 }), offer({ id: 'of-1-2', expiresAt: 2 })] });
  const tc = contextOf(s, env);
  runGlobal(tc);
  assert.deepEqual(slice(tc.state).offers.map((o) => o.id), ['of-1-2']);
});

test('trade.cancel breaks a running contract and lowers the relation', () => {
  const s = running();
  const def = handel.orders['trade.cancel'];
  assert.equal(def.slot, 'free');
  assert.deepEqual(def.tags, ['handel', 'vertragsbruch']);
  const { tc, errors: e } = resolveOrder(s, env, PLAYER, def, { contract: 'ct-0-1' });
  assert.deepEqual(e, []);
  assert.deepEqual(slice(tc.state).contracts, []);
  assert.equal(tc.state.relations[REL].value, -1);
  assert.deepEqual(uncoveredPaths(tc, PLAYER), []);
  const other = resolveOrder(s, env, PARTNER, def, { contract: 'ct-0-1' });
  assert.deepEqual(other.errors, [], 'either side may cancel');
  assert.ok(resolveOrder(s, env, PLAYER, def, { contract: 'ct-9-9' }).errors.length === 1);
  assert.ok(resolveOrder(atTurn(s, 9), env, PLAYER, def, { contract: 'ct-0-1' }).errors.length === 1, 'an ended contract needs no cancelling');
});

test('trade.cancel is offered only to a party of a contract', () => {
  const cat = (s, pid) => catalogueFor(s, env, pid).find((c) => c.type === 'trade.cancel');
  assert.equal(cat(traders, PLAYER).available, false);
  assert.equal(cat(running(), PLAYER).available, true);
  assert.equal(cat(running(), PARTNER).available, true);
});

// Marktrecht opens trade.market; salz is the currency.
const market = withResources(learn(traders, PLAYER, 'marktrecht@1', { instituted: true }), PLAYER, { salz: 30 });
const buy = (amount, res = 'erz') => ({ mode: 'buy', res, amount });

test('trade.market is locked without an order.unlock and open after Marktrecht', () => {
  const cat = (s) => catalogueFor(s, env, PLAYER).find((c) => c.type === 'trade.market');
  assert.equal(cat(traders).available, false);
  assert.equal(cat(traders).reason, 'not unlocked');
  assert.equal(cat(market).available, true);
  assert.deepEqual(handel.orders['trade.market'].tags, ['handel', 'markt']);
  assert.equal(handel.orders['trade.market'].slot, 'minor');
});

test('trade.market check: mode, a resource other than the currency, an amount of 1 to 12', () => {
  const issues = (params) => errors(checkOrders(market, env, PLAYER, [{ id: 'm1', type: 'trade.market', params }]).issues);
  assert.equal(issues(buy(3)).length, 0);
  assert.equal(issues({ mode: 'swap', res: 'erz', amount: 1 }).length, 1);
  assert.equal(issues(buy(1, 'salz')).length, 1, 'the currency cannot be traded');
  assert.equal(issues(buy(1, 'gold')).length, 1);
  assert.equal(issues(buy(0)).length, 1);
  assert.equal(issues(buy(13)).length, 1);
});

test('trade.market buys at the start price and pays the opening stock in the currency', () => {
  const chk = checkOrders(market, env, PLAYER, [{ id: 'm1', type: 'trade.market', params: buy(3) }]);
  assert.deepEqual(chk.costs, { salz: RULES.marketStartPrice * 3 });
  const poor = withResources(market, PLAYER, { salz: 2 });
  assert.ok(errors(checkOrders(poor, env, PLAYER, [{ id: 'm1', type: 'trade.market', params: buy(3) }]).issues).some((i) => i.code === 'cost'));
  const { tc } = resolveOrder(market, env, PLAYER, handel.orders['trade.market'], buy(3));
  assert.equal(res(tc.state, PLAYER, 'erz'), 3);
  assert.equal(tc.scratch.market.erz, 3);
});

test('trade.market sells for one below the price, at least one per unit', () => {
  const sell = (price) => resolveOrder(withSlice(market, { prices: { herden: price } }), env, PLAYER, handel.orders['trade.market'], { mode: 'sell', res: 'herden', amount: 2 });
  assert.deepEqual(sell(5).plan.costs, { herden: 2 });
  assert.equal(res(sell(5).tc.state, PLAYER, 'salz'), 30 + (5 - 1) * 2);
  assert.equal(res(sell(1).tc.state, PLAYER, 'salz'), 30 + 1 * 2, 'a price of 1 still pays 1 per unit');
  assert.equal(sell(5).tc.scratch.market.herden, -2);
  const unpriced = resolveOrder(market, env, PLAYER, handel.orders['trade.market'], { mode: 'sell', res: 'herden', amount: 1 });
  assert.equal(res(unpriced.tc.state, PLAYER, 'salz'), 30 + (RULES.marketStartPrice - 1));
});

test('the price follows the net trade of the season by one step, within 1 to 9', () => {
  const hook = (s, net) => {
    const tc = contextOf(s, env);
    tc.scratch.market = net;
    runGlobal(tc);
    return slice(tc.state).prices;
  };
  assert.deepEqual(hook(market, { erz: 5, herden: -3, salz: 0 }), { erz: RULES.marketStartPrice + 1, herden: RULES.marketStartPrice - 1 });
  assert.deepEqual(hook(market, { erz: 0 }), {});
  assert.deepEqual(hook(withSlice(market, { prices: { erz: 9 } }), { erz: 2 }), { erz: 9 });
  assert.deepEqual(hook(withSlice(market, { prices: { erz: 1 } }), { erz: -2 }), { erz: 1 });
  const tc = contextOf(market, env);
  resolveOrder(market, env, PLAYER, handel.orders['trade.market'], buy(2), 'success', { tc });
  resolveOrder(market, env, PARTNER, handel.orders['trade.market'], { mode: 'sell', res: 'erz', amount: 1 }, 'success', { tc, id: 'o2' });
  runGlobal(tc);
  assert.equal(slice(tc.state).prices.erz, RULES.marketStartPrice + 1, 'net +1 over both peoples');
  assert.ok(tc.log.some((e) => e.kind === 'market.price' && e.visibleTo[0] === 'all'));
});

test('derive lists routes of running contracts, project shows only own offers and contracts', () => {
  const s = withSlice(atTurn(traders, 2), {
    offers: [offer({ id: 'of-1-1', from: PARTNER, to: PLAYER }), offer({ id: 'of-1-2', from: PARTNER, to: RIVAL })],
    contracts: [contract(), contract({ id: 'ct-0-2', a: PARTNER, b: RIVAL }), contract({ id: 'ct-0-3', from: 3, until: 4 })],
    prices: { erz: 4 },
  });
  const d = handel.hooks.derive(s, env, PLAYER, { id: 'handel', bind: { currency: 'salz' } });
  assert.deepEqual(d.routes.map((r) => [r.contract, r.partner]), [['ct-0-1', PARTNER]]);
  assert.deepEqual(d.routes[0].tiles, tradeRoute(s, world, PLAYER, PARTNER).path);
  assert.deepEqual(d.offers.map((o) => o.id), ['of-1-1']);
  assert.deepEqual(d.contracts.map((c) => c.id), ['ct-0-1', 'ct-0-3']);
  assert.deepEqual(d.prices, { erz: 4 });
  const p = handel.hooks.project(s, env, PLAYER, {});
  assert.deepEqual(Object.keys(p).sort(), ['contracts', 'homes', 'offers', 'prices', 'traders']);
  assert.deepEqual(p.offers.map((o) => o.id), ['of-1-1']);
  assert.deepEqual(p.contracts.map((c) => c.id), ['ct-0-1', 'ct-0-3']);
  assert.deepEqual(p.prices, { erz: 4 });
});

test('the global hook leaves a world without a trade ledger alone', () => {
  const s = edited(start, (x) => { delete x.modules.handel; });
  const tc = contextOf(s, env);
  runGlobal(tc);
  assert.equal(tc.state.modules.handel, undefined);
  assert.equal(tc.log.length, 0);
});

test('descriptor: views, label keys and hints are well formed and the labels exist', () => {
  assert.deepEqual(handel.views, [{ id: 'handel', labelKey: 'view.handel', icon: 'scale', order: 40, scope: 'people', sections: ['contracts', 'offers', 'market'] }]);
  for (const k of handel.labelKeys) assert.ok(Object.hasOwn(LABELS, k), `${k} is missing in labels.json`);
  assert.ok(handel.agentHints.tags.includes('handel'));
});

test('project names the trading contacts and their market towns, and nothing of foreign stocks or ledgers', () => {
  const s = withSlice(atTurn(traders, 2), { offers: [offer({ id: 'of-1-2', from: PARTNER, to: RIVAL })], contracts: [contract({ id: 'ct-0-2', a: PARTNER, b: RIVAL })] });
  const p = handel.hooks.project(s, env, PLAYER, {});
  assert.deepEqual(p.traders, [PARTNER]);
  assert.deepEqual(p.homes, { [PARTNER]: homeSettlement(s, PARTNER).tile });
  assert.deepEqual(p.offers, []);
  assert.deepEqual(p.contracts, []);
  const noContact = handel.hooks.project(withRelation(s, PLAYER, PARTNER, { contact: false }), env, PLAYER, {});
  assert.deepEqual(noContact.traders, []);
});

test('on a projection the offer check reads partner activity and home from the projected ledger', () => {
  const proj = (s, hide) => edited(s, (x) => {
    x.modules.handel = handel.hooks.project(s, env, PLAYER, {});
    delete x.peoples[PARTNER].developments;
    if (hide) x.map.settlements = x.map.settlements.filter((y) => y.people !== PARTNER);
  });
  const run = (s) => errors(checkOrders(s, env, PLAYER, offerOrder()).issues);
  assert.deepEqual(run(proj(traders, true)), run(traders));
  assert.deepEqual(run(proj(traders, false)), run(traders));
  const notTrading = withRelation(asTrader(start, PLAYER), PLAYER, PARTNER, { contact: true });
  assert.equal(run(proj(notTrading, true)).length, 1, 'a partner outside the traders list does not trade');
  assert.equal(tradeRoute(proj(traders, true), world, PLAYER, PARTNER).cost, tradeRoute(traders, world, PLAYER, PARTNER).cost);
});

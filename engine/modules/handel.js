// Handel: offers, contracts and a market between peoples. Active for a people
// that knows a development with module.activate handel (role currency bound to
// a world resource, "salz" in Hochland).
//
// Global slice state.modules.handel = { offers, contracts, prices, seq }
//   offer     { id, from, to, give, get, seasons, expiresAt }   from gives `give`, to gives `get`
//   contract  { id, a, b, aGives, bGives, from, until }         runs in the turns from..until
//   prices    { res: 1..9 } of resources traded on the market; absent means RULES.marketStartPrice
// People slice people.modules.handel = { offersMade }.
//
// Trade range is measured in road-aware half-step cost, so roads extend it.

import { RULES } from '../core/rules.js';
import { issue } from '../core/issues.js';
import { addResource, noteChange, notice, setPeople, setRelation } from '../core/log.js';
import { atWar, clamp, homeSettlement, peopleIds, relKey, relation } from '../core/state.js';
import { route as mapRoute } from '../core/map.js';
import { activations, standingOf } from '../core/effects.js';

const MAX_PRICE = 9;
const SEASONS_MAX = 8;
const AMOUNT_MAX = 12;
const EMPTY = Object.freeze({ offers: [], contracts: [], prices: {}, seq: 0 });
const sliceOf = (state) => state.modules?.handel ?? EMPTY;
const target = (ox, reason, msg, params = {}) => [issue('target', `${ox.path}/params`, msg, { params: { reason, ...params } })];
const noRoute = (ox, params) => [issue('handel.no_route', `${ox.path}/params`, 'no trade route to the partner within range', { severity: 'error', params })];
const bind = (ox) => ox.bind('handel') ?? {};

// Home tile of a people. In a projection a foreign settlement is only present
// while its tile is visible, so the projected ledger carries the public market
// towns of trading partners (hooks.project) as a fallback.
const homeTile = (state, pid) => homeSettlement(state, pid)?.tile ?? state.modules?.handel?.homes?.[pid] ?? null;

// Whether a people trades: read from its developments on a full state, from
// the projected list of trading partners otherwise.
const trades = (ox, pid) => (ox.state.peoples[pid]?.developments ? ox.cx.isModuleActive(pid, 'handel') : (ox.state.modules?.handel?.traders ?? []).includes(pid));

/**
 * Cheapest road-aware route between the home settlements of a and b, or null:
 * regions held by a people at war with either side are closed, and so is any
 * way between two peoples at war.
 */
export function tradeRoute(state, world, a, b) {
  if (atWar(state, a, b)) return null;
  const from = homeTile(state, a);
  const to = homeTile(state, b);
  if (!from || !to) return null;
  const blocked = (tile, regionId) => {
    const owner = state.map.control[regionId];
    return Boolean(owner) && (atWar(state, owner, a) || atWar(state, owner, b));
  };
  const r = mapRoute(state, world, from, to, { blocked, maxRadius: RULES.tradeRadius });
  return r && r.cost <= RULES.tradeRadius * 2 ? r : null;
}

// First problem of a resource bag as [reason, message, params], or null.
function bagProblem(ox, bag, what) {
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return ['bag-not-object', `${what} must be an object of resource amounts`, { what }];
  const keys = Object.keys(bag);
  if (keys.length === 0) return ['bag-empty', `${what} must name at least one resource`, { what }];
  for (const k of keys) {
    if (!ox.env.resourceIds.includes(k)) return ['bag-not-resource', `${what}: ${k} is not a resource of this world`, { what, res: k }];
    if (!Number.isInteger(bag[k]) || bag[k] < 1 || bag[k] > AMOUNT_MAX) return ['bag-bad-amount', `${what}: ${k} must be 1 to ${AMOUNT_MAX}`, { what, res: k, max: AMOUNT_MAX }];
  }
  return null;
}

const holds = (people, bag) => Object.entries(bag).every(([res, n]) => (people.resources[res] ?? 0) >= n);
const involves = (x, pid) => x.a === pid || x.b === pid;

// A slice change is logged as a list insertion or removal on the campaign. It
// is visible only to the peoples party to it; bookkeeping without a party
// (ledger creation, sequence counter) reaches no projection, because record()
// would otherwise show every entry without a people to all and so tell any
// people that and how often others trade.
function logGlobal(tc, kind, field, before, after, reason, people = []) {
  const entry = noteChange(tc, kind, { kind: 'campaign', id: tc.state.campaign.id }, `modules.handel.${field}`, before, after, reason, { people });
  if (people.length === 0) entry.visibleTo = [];
}

function liveSlice(tc) {
  if (!tc.state.modules.handel) {
    tc.state.modules.handel = structuredClone(EMPTY);
    logGlobal(tc, 'trade.slice', 'created', null, true, 'the trade ledger is opened');
  }
  return tc.state.modules.handel;
}

function nextSeq(tc, slice) {
  const before = slice.seq;
  slice.seq += 1;
  logGlobal(tc, 'trade.seq', 'seq', before, slice.seq, 'sequence number for trade ids');
  return slice.seq;
}

function openOffer(ox, id) {
  const offer = sliceOf(ox.state).offers.find((o) => o.id === id);
  return offer && offer.to === ox.pid && offer.expiresAt >= ox.turn ? offer : null;
}

const ORDERS = {
  'trade.offer': {
    slot: 'minor',
    tags: ['handel'],
    check(ox, o) {
      const { partner, give, get, seasons } = o.params ?? {};
      const other = ox.state.peoples[partner];
      if (typeof partner !== 'string' || !other || partner === ox.pid) return target(ox, 'not-other-people', 'partner must be another people');
      const rel = relation(ox.state, ox.pid, partner);
      if (!rel || rel.contact !== true) return target(ox, 'no-contact', `no contact with ${partner} yet`, { partner });
      if (rel.atWar) return [issue('handel.at_war', `${ox.path}/params`, `at war with ${partner}`, { severity: 'error', params: { partner } })];
      if (!trades(ox, partner)) return [issue('handel.not_trading', `${ox.path}/params`, `${partner} does not trade`, { severity: 'error', params: { partner } })];
      const problem = bagProblem(ox, give, 'give') ?? bagProblem(ox, get, 'get');
      if (problem) return target(ox, ...problem);
      if (!Number.isInteger(seasons) || seasons < 1 || seasons > SEASONS_MAX) return target(ox, 'bad-seasons', `seasons must be 1 to ${SEASONS_MAX}`, { max: SEASONS_MAX });
      if (!holds(ox.people, give)) return target(ox, 'cannot-give', 'the people does not hold what it offers');
      if (!tradeRoute(ox.state, ox.world, ox.pid, partner)) return noRoute(ox, { partner });
      return [];
    },
    plan: () => ({ costs: {}, probe: null }),
    resolve(tc, ox, o) {
      const slice = liveSlice(tc);
      const { partner, give, get, seasons } = o.params;
      const offer = { id: `of-${tc.turn}-${nextSeq(tc, slice)}`, from: ox.pid, to: partner, give: { ...give }, get: { ...get }, seasons, expiresAt: tc.turn + 1 };
      slice.offers.push(offer);
      logGlobal(tc, 'trade.offer', 'offers', null, offer, `order ${o.id}: ${ox.pid} offers ${partner} a trade for ${seasons} season(s)`, [ox.pid, partner]);
      setPeople(tc, ox.pid, 'modules.handel.offersMade', (tc.state.peoples[ox.pid].modules.handel?.offersMade ?? 0) + 1, `order ${o.id}: offer made`, { kind: 'trade.offer' });
    },
  },
  'trade.accept': {
    slot: 'free',
    tags: ['handel'],
    available: (ox) => sliceOf(ox.state).offers.some((x) => x.to === ox.pid && x.expiresAt >= ox.turn),
    check(ox, o) {
      const offer = openOffer(ox, o.params?.offer);
      if (!offer) return target(ox, 'not-open-offer', 'offer must be an open offer to this people');
      if (!holds(ox.people, offer.get)) return target(ox, 'cannot-pay', 'the people does not hold what the offer asks of it');
      if (!tradeRoute(ox.state, ox.world, offer.from, ox.pid)) return noRoute(ox, { partner: offer.from, offer: offer.id });
      return [];
    },
    plan: () => ({ costs: {}, probe: null }),
    resolve(tc, ox, o) {
      const slice = liveSlice(tc);
      const at = slice.offers.findIndex((x) => x.id === o.params.offer);
      if (at < 0) {
        notice(tc, 'trade.offer-gone', { kind: 'people', id: ox.pid }, `order ${o.id}: the offer ${o.params.offer} is no longer open`, { people: ox.pid });
        return;
      }
      const [offer] = slice.offers.splice(at, 1);
      logGlobal(tc, 'trade.offer-closed', 'offers', offer, null, `order ${o.id}: the offer is accepted`, [offer.from, offer.to]);
      const contract = {
        id: `ct-${tc.turn}-${nextSeq(tc, slice)}`, a: offer.from, b: offer.to, aGives: offer.give, bGives: offer.get,
        from: tc.turn + 1, until: tc.turn + offer.seasons,
      };
      slice.contracts.push(contract);
      logGlobal(tc, 'trade.contract', 'contracts', null, contract, `order ${o.id}: ${contract.a} and ${contract.b} agree on a contract`, [contract.a, contract.b]);
    },
  },
  'trade.cancel': {
    slot: 'free',
    tags: ['handel', 'vertragsbruch'],
    available: (ox) => sliceOf(ox.state).contracts.some((c) => involves(c, ox.pid) && c.until >= ox.turn),
    check(ox, o) {
      const c = sliceOf(ox.state).contracts.find((x) => x.id === o.params?.contract);
      if (!c || !involves(c, ox.pid) || c.until < ox.turn) return target(ox, 'not-running-contract', 'contract must be a running contract of this people');
      return [];
    },
    plan: () => ({ costs: {}, probe: null }),
    resolve(tc, ox, o) {
      const slice = liveSlice(tc);
      const at = slice.contracts.findIndex((x) => x.id === o.params.contract);
      if (at < 0) return;
      const [c] = slice.contracts.splice(at, 1);
      const reason = `order ${o.id}: ${ox.pid} breaks contract ${c.id}`;
      logGlobal(tc, 'trade.contract-closed', 'contracts', c, null, reason, [c.a, c.b]);
      const rel = tc.state.relations[relKey(c.a, c.b)];
      setRelation(tc, c.a, c.b, { value: (rel?.value ?? 0) - 1 }, reason, { kind: 'relation.change', refs: [c.id] });
    },
  },
  'trade.market': {
    slot: 'minor',
    locked: true,
    tags: ['handel', 'markt'],
    available: (ox) => Boolean(bind(ox).currency && ox.env.resourceIds.includes(bind(ox).currency)),
    check(ox, o) {
      const { mode, res, amount } = o.params ?? {};
      const currency = bind(ox).currency;
      if (mode !== 'buy' && mode !== 'sell') return target(ox, 'bad-mode', 'mode must be buy or sell');
      if (!ox.env.resourceIds.includes(res) || res === currency) return target(ox, 'bad-res', `res must be a world resource other than ${currency}`, { currency });
      if (!Number.isInteger(amount) || amount < 1 || amount > AMOUNT_MAX) return target(ox, 'bad-amount', `amount must be 1 to ${AMOUNT_MAX}`, { max: AMOUNT_MAX });
      return [];
    },
    plan(ox, o) {
      const { mode, res, amount } = o.params;
      const currency = bind(ox).currency;
      const price = sliceOf(ox.state).prices[res] ?? RULES.marketStartPrice;
      if (mode === 'buy') return { costs: { [currency]: price * amount }, probe: null, gain: { res, amount }, price };
      return { costs: { [res]: amount }, probe: null, gain: { res: currency, amount: Math.max(1, price - 1) * amount }, price };
    },
    resolve(tc, ox, o, plan) {
      const { mode, res, amount } = o.params;
      addResource(tc, ox.pid, plan.gain.res, plan.gain.amount, `order ${o.id}: ${mode} ${amount} ${res} at price ${plan.price}`, { kind: 'trade.market' });
      tc.scratch.market ??= {};
      tc.scratch.market[res] = (tc.scratch.market[res] ?? 0) + (mode === 'buy' ? amount : -amount);
    },
  },
};

function deliver(tc, c) {
  const state = tc.state;
  const pays = (pid, bag) => Boolean(state.peoples[pid]) && holds(state.peoples[pid], bag);
  const reasonOf = () => {
    if (!tradeRoute(tc.s0, tc.world, c.a, c.b)) return 'no trade route';
    if (!pays(c.a, c.aGives)) return `${c.a} cannot pay`;
    if (!pays(c.b, c.bGives)) return `${c.b} cannot pay`;
    return null;
  };
  const why = reasonOf();
  if (why) {
    const reason = `contract ${c.id} fails: ${why}`;
    notice(tc, 'trade.delivery-failed', { kind: 'relation', id: relKey(c.a, c.b) }, reason, { people: [c.a, c.b], refs: [c.id] });
    const rel = state.relations[relKey(c.a, c.b)];
    setRelation(tc, c.a, c.b, { value: (rel?.value ?? 0) - 1 }, reason, { kind: 'relation.change', refs: [c.id] });
    return;
  }
  const move = (from, to, bag) => {
    for (const res of Object.keys(bag).sort()) {
      addResource(tc, from, res, -bag[res], `contract ${c.id}: delivery to ${to}`, { kind: 'trade.delivery', people: to, refs: [c.id] });
      addResource(tc, to, res, bag[res], `contract ${c.id}: delivery from ${from}`, { kind: 'trade.delivery', people: from, refs: [c.id] });
    }
  };
  move(c.a, c.b, c.aGives);
  move(c.b, c.a, c.bGives);
}

function globalHook(tc) {
  const slice = tc.state.modules.handel;
  if (!slice) return;
  for (const c of [...slice.contracts]) {
    if (c.until < tc.turn) {
      slice.contracts.splice(slice.contracts.indexOf(c), 1);
      logGlobal(tc, 'trade.contract-closed', 'contracts', c, null, `contract ${c.id} has run its term`, [c.a, c.b]);
    } else if (c.from <= tc.turn) deliver(tc, c);
  }
  for (const offer of [...slice.offers]) {
    if (offer.expiresAt >= tc.turn) continue;
    slice.offers.splice(slice.offers.indexOf(offer), 1);
    logGlobal(tc, 'trade.offer-closed', 'offers', offer, null, `offer ${offer.id} lapsed unanswered`, [offer.from, offer.to]);
  }
  for (const res of Object.keys(tc.scratch.market ?? {}).sort()) {
    const net = tc.scratch.market[res];
    if (net === 0) continue;
    const before = slice.prices[res] ?? RULES.marketStartPrice;
    const after = clamp(before + (net > 0 ? 1 : -1), 1, MAX_PRICE);
    if (after === before) continue;
    slice.prices[res] = after;
    noteChange(tc, 'market.price', { kind: 'campaign', id: tc.state.campaign.id }, `modules.handel.prices.${res}`, before, after,
      `the market for ${res} moves ${net > 0 ? 'up' : 'down'}`, { visibleTo: 'all' });
  }
}

export default {
  id: 'handel',
  version: 1,
  always: false,
  resourceRoles: [{ role: 'currency', defaultId: 'salz' }],
  tags: { handel: 2, markt: 1, vertragsbruch: 1 },
  initGlobal: () => ({ offers: [], contracts: [], prices: {}, seq: 0 }),
  initPeople: () => ({ offersMade: 0 }),
  orders: ORDERS,
  hooks: {
    global: globalHook,
    derive(state, env, pid) {
      const slice = sliceOf(state);
      const world = env.world(state.map.seed);
      const mine = slice.contracts.filter((c) => involves(c, pid));
      const routes = mine.filter((c) => c.from <= state.turn && state.turn <= c.until).map((c) => {
        const partner = c.a === pid ? c.b : c.a;
        return { contract: c.id, partner, tiles: tradeRoute(state, world, pid, partner)?.path ?? [] };
      });
      return {
        routes,
        offers: slice.offers.filter((x) => x.from === pid || x.to === pid),
        contracts: mine,
        prices: { ...slice.prices },
      };
    },
    // Besides the own offers and contracts a projection carries which contacts
    // trade and where their market towns lie, so previews give the same result as on the full state.
    // The price list is the public market; the sequence counter and the offers
    // and contracts of other peoples stay in the kernel.
    project(state, env, pid) {
      const slice = sliceOf(state);
      const traders = peopleIds(state).filter((o) => o !== pid && relation(state, pid, o)?.contact === true
        && Object.hasOwn(activations(standingOf(state, env, o)), 'handel'));
      return {
        offers: slice.offers.filter((x) => x.from === pid || x.to === pid),
        contracts: slice.contracts.filter((c) => involves(c, pid)),
        prices: { ...slice.prices },
        traders,
        homes: Object.fromEntries(traders.map((o) => [o, homeSettlement(state, o)?.tile]).filter(([, t]) => t)),
      };
    },
  },
  views: [{ id: 'handel', labelKey: 'view.handel', icon: 'scale', order: 40, scope: 'people', sections: ['contracts', 'offers', 'market'] }],
  labelKeys: ['view.handel', 'module.handel', 'modulerole.currency', 'order.trade.offer', 'order.trade.accept', 'order.trade.cancel', 'order.trade.market'],
  agentHints: { primitives: ['order.unlock', 'resource.flow', 'module.activate'], tags: ['handel', 'markt', 'vertragsbruch'] },
};

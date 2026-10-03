// Generators of the property-based fuzz tests: a seeded random source,
// random effect primitives over the vocabulary of a world, structural
// mutation of JSON values, and random drafts against a campaign state.
//
// Every generator draws only from the random source it is given, so a
// failing case is reproduced from FUZZ_SEED and the case index alone.
// FUZZ_RUNS scales the number of cases; the default keeps `npm run
// test:unit` short, `npm run test:fuzz` runs the long sweep.

import { makeRng, hashSeed, parseKey, spiral, key } from '../../../../engine/world/index.js';
import { catalogueFor, registry } from '../../../../engine/core/orders.js';
import { homeSettlement } from '../../../../engine/core/state.js';
import { TOKEN_KINDS } from '../../../../engine/schemas/common.js';
import { PRIMITIVES } from '../../../../engine/schemas/effects.js';
import { fallbackDraft } from '../../../../engine/ai/fallback.js';

export const SEED = process.env.FUZZ_SEED ?? '1';
const SCALE = Number(process.env.FUZZ_RUNS) > 0 ? Number(process.env.FUZZ_RUNS) : 1;

/** Number of cases: the default count times FUZZ_RUNS. */
export const runs = (n) => n * SCALE;

export function rand(...parts) {
  const r = makeRng(hashSeed('fuzz', SEED, ...parts.map(String)));
  const int = (a, b) => r.int(a, b);
  const pick = (xs) => xs[r.int(0, xs.length - 1)];
  const chance = (p) => r.next() < p;
  const some = (xs, lo, hi) => {
    const pool = [...xs];
    const out = [];
    const n = Math.min(pool.length, int(lo, hi));
    while (out.length < n) out.push(pool.splice(int(0, pool.length - 1), 1)[0]);
    return out;
  };
  return { int, pick, chance, some, next: r.next };
}

// --- effect primitives ---------------------------------------------------------

/** Vocabulary of a world for the generators. */
export function vocabularyOf(env) {
  const regeln = env.regeln;
  return {
    tags: Object.keys(regeln.vocabulary ?? {}).sort(),
    resources: env.resourceIds.filter((r) => !regeln.resources.find((x) => x.id === r)?.module),
    stats: regeln.stats.map((s) => s.id),
    terrains: env.welt.terrains.map((t) => t.id),
    seasons: regeln.calendar.seasons.map((s) => s.id),
    orders: Object.keys(registry()).sort(),
  };
}

// Amount range of every op with an integer amount, read from the primitive
// schemas; the monotonicity property sweeps every value of the range.
export const AMOUNT = Object.fromEntries(Object.entries(PRIMITIVES).flatMap(([op, { schema }]) => {
  const a = schema.properties?.amount;
  return a?.type === 'integer' ? [[op, [a.minimum, a.maximum]]] : [];
}));

const nonZero = (r, [lo, hi]) => {
  const v = r.int(lo, hi);
  return v === 0 ? (hi > 0 ? 1 : -1) : v;
};

/** One one-off primitive; depth bounds nesting through status.add. */
export function oncePrimitive(r, v, depth = 0) {
  const ops = ['resource.delta', 'population.delta', 'loyalty.delta', 'relation.delta', 'standing.delta', 'token.add', 'meter.delta', 'reveal', 'flag.set'];
  if (depth < 1) ops.push('status.add');
  const op = r.pick(ops);
  switch (op) {
    case 'resource.delta': return { op, res: r.pick(v.resources), amount: nonZero(r, AMOUNT[op]) };
    case 'population.delta':
    case 'standing.delta':
    case 'meter.delta':
      return op === 'meter.delta' ? { op, meter: 'fuzzmeter', amount: nonZero(r, AMOUNT[op]) } : { op, amount: nonZero(r, AMOUNT[op]) };
    case 'loyalty.delta': return { op, target: 'all', amount: nonZero(r, AMOUNT[op]) };
    case 'relation.delta': return { op, people: r.pick(['all', 'neighbours', '$target']), amount: nonZero(r, AMOUNT[op]) };
    case 'token.add': return { op, kind: r.pick(TOKEN_KINDS), tags: r.some(v.tags, 0, 2) };
    case 'reveal': return { op, scope: 'tiles', at: '$home', radius: r.int(0, 3) };
    case 'flag.set': return { op, flag: 'fuzz~flag', value: r.chance(0.5) };
    case 'status.add': {
      const effects = Array.from({ length: r.int(1, 2) }, () => standingPrimitive(r, v, depth + 1, true));
      return { op, id: 'fuzzstatus', effects, duration: r.chance(0.3) ? null : r.int(1, 8), endsOn: r.chance(0.3) ? 'setback' : null };
    }
    default: throw new Error(op);
  }
}

/** One standing primitive; inStatus leaves out what a status may not carry. */
export function standingPrimitive(r, v, depth = 0, inStatus = false) {
  const ops = ['resource.flow', 'yield.mod', 'stock.cap', 'population.cap', 'population.growth', 'stat.mod', 'probe.mod', 'research.mod', 'unit.mod', 'sight.mod', 'order.unlock', 'order.restrict'];
  if (!inStatus) ops.push('order.slot', 'dependency', 'meter', 'trigger');
  const op = r.pick(ops);
  const once = () => Array.from({ length: r.int(1, 2) }, () => oncePrimitive(r, v, depth + 1));
  switch (op) {
    case 'resource.flow': {
      const p = { op, res: r.pick(v.resources), amount: nonZero(r, AMOUNT[op]) };
      if (r.chance(0.4)) p.when = r.some(v.seasons, 1, 3);
      if (r.chance(0.2)) p.scale = { per: r.pick(['population', 'units', 'regions', 'settlements']), step: r.int(1, 10) };
      return p;
    }
    case 'yield.mod': return { op, res: r.pick(v.resources), terrain: r.pick(v.terrains), amount: nonZero(r, AMOUNT[op]) };
    case 'stock.cap': return { op, res: r.pick(v.resources), amount: nonZero(r, AMOUNT[op]) };
    case 'stat.mod': return { op, stat: r.pick(v.stats), amount: nonZero(r, AMOUNT[op]) };
    case 'probe.mod':
    case 'research.mod':
      return { op, tags: r.some(v.tags, 1, 2), amount: nonZero(r, AMOUNT[op]) };
    case 'unit.mod': return { op, unitTags: r.some(v.tags, 1, 2), stat: r.pick(['strength', 'mobility', 'upkeep']), amount: nonZero(r, AMOUNT[op]) };
    case 'order.unlock': return { op, order: r.pick(v.orders) };
    case 'order.slot': return { op, slot: r.pick(['main', 'minor']), amount: 1 };
    case 'order.restrict': return { op, mode: r.pick(['forbid', 'limit']), orders: r.some(v.orders, 1, 2), tags: [], limit: 1, per: 'season' };
    case 'dependency': return { op, res: r.pick(v.resources), amount: r.int(1, 3), penalty: [{ op: 'population.delta', amount: -1 }] };
    case 'meter': return {
      op, id: 'fuzzmeter', min: r.int(-5, 0), max: r.int(1, 5), rise: { on: r.pick(['season', 'use:explore']), amount: r.int(1, 2) }, decay: r.int(0, 2),
      thresholds: [{ at: r.int(1, 5), effects: once() }],
    };
    case 'trigger': return { op, on: r.pick(['season', 'winter', 'contact', 'use:explore', 'shortfall:nahrung']), effects: once() };
    default: return { op, amount: nonZero(r, AMOUNT[op]) };
  }
}

// --- mutation ------------------------------------------------------------------

const GARBAGE = [null, true, false, 0, -1, 1, 999999, -999999, 0.5, '', 'x', 'nahrung', 'a'.repeat(300), [], {}, [null], { op: 'resource.delta' }, 'constructor', '0,0'];

function paths(value, at = [], out = []) {
  out.push(at);
  if (value && typeof value === 'object') for (const k of Object.keys(value)) paths(value[k], [...at, k], out);
  return out;
}

/**
 * A structural mutation of a JSON value: one to three edits, each replacing,
 * deleting or adding a node somewhere in the tree. The input is not changed.
 */
export function mutate(r, value) {
  const out = structuredClone(value);
  const edits = r.int(1, 3);
  let root = out;
  for (let i = 0; i < edits; i++) {
    const all = paths(root);
    const path = r.pick(all);
    const kind = r.pick(['replace', 'replace', 'delete', 'add', 'number']);
    if (path.length === 0) {
      if (kind === 'replace') root = r.pick(GARBAGE);
      continue;
    }
    const parent = path.slice(0, -1).reduce((o, k) => o[k], root);
    const k = path[path.length - 1];
    if (kind === 'delete') {
      if (Array.isArray(parent)) parent.splice(Number(k), 1);
      else delete parent[k];
    } else if (kind === 'add' && parent[k] && typeof parent[k] === 'object') {
      if (Array.isArray(parent[k])) parent[k].push(structuredClone(r.pick(GARBAGE)));
      else parent[k][r.pick(['extra', 'op', 'amount', 'tags', 'id'])] = structuredClone(r.pick(GARBAGE));
    } else if (kind === 'number' && typeof parent[k] === 'number') {
      parent[k] += r.pick([-100, -2, -1, 1, 2, 100]);
    } else {
      parent[k] = structuredClone(r.pick(GARBAGE));
    }
  }
  return root;
}

// --- drafts --------------------------------------------------------------------

/** Values a random order may name: tiles near home, own and foreign ids, refs. */
export function poolsOf(state, env, pid) {
  const people = state.peoples[pid];
  const home = homeSettlement(state, pid);
  const tiles = home ? spiral(parseKey(home.tile), 4).map((h) => key(h.q, h.r)) : ['0,0'];
  const handel = state.modules?.handel ?? {};
  return {
    tiles,
    regions: Object.keys(state.map.control).sort(),
    settlements: state.map.settlements.map((s) => s.id),
    refs: [...new Set([...people.developments.known.map((k) => k.ref), ...people.developments.candidates.map((c) => c.ref), ...env.content.entwicklungen.map((e) => `${e.id}@${e.rev}`)])].sort(),
    known: people.developments.known.map((k) => k.ref).sort(),
    destinies: env.content.bestimmungen.map((b) => `${b.id}@${b.rev}`),
    applications: env.content.entwicklungen.flatMap((e) => (e.spec?.applications ?? []).map((x) => ({ development: `${e.id}@${e.rev}`, application: x.id }))),
    offers: (handel.offers ?? []).map((o) => o.id),
    contracts: (handel.contracts ?? []).map((c) => c.id),
    units: Object.values(state.peoples).flatMap((p) => p.units.map((u) => u.id)),
    members: people.council.map((m) => m.id),
    peoples: Object.keys(state.peoples).sort(),
    resources: env.resourceIds,
    tags: Object.keys(env.regeln.vocabulary ?? {}).sort(),
    orders: [...Object.keys(registry()).sort(), 'nonexistent.order'],
    available: catalogueFor(state, env, pid).filter((c) => c.available).map((c) => c.type),
  };
}

// The parameters each order type reads (engine/core/*.js, engine/modules/*.js);
// a case draws mostly from its own type's list, sometimes from all of them.
const PARAMS = {
  build: ['development', 'settlement'], found: ['tile', 'name'], institute: ['development'], explore: ['tile'],
  road: ['tile'], 'road.pave': ['tile'], machtprobe: ['aim', 'approach', 'against', 'member', 'order', 'cause'],
  talk: ['mode', 'member'], 'research.assign': ['development'], 'research.direct': ['tags', 'note'],
  'destiny.adopt': ['bestimmung'], migrate: ['tile'], adopt: ['lebensweise'],
  'trade.offer': ['partner', 'give', 'get', 'seasons'], 'trade.accept': ['offer'], 'trade.cancel': ['contract', 'offer'],
  'trade.market': ['mode', 'res', 'amount'], 'discipline.use': ['application', 'target'],
  recruit: ['type', 'settlement'], move: ['unit', 'tile'], attack: ['units', 'tile'], retreat: ['unit', 'tile'],
  ausfall: ['units', 'tile'], raubzug: ['units', 'tile', 'region'],
};
const ALL_PARAMS = [...new Set(Object.values(PARAMS).flat())];

function paramValue(r, k, pools, params) {
  const orGarbage = (v) => (r.chance(0.08) ? structuredClone(r.pick(GARBAGE)) : v);
  switch (k) {
    case 'tile': case 'target': return orGarbage(r.pick(pools.tiles));
    case 'region': return orGarbage(pools.regions.length ? r.pick(pools.regions) : 'r0');
    case 'settlement': return orGarbage(r.pick(pools.settlements));
    case 'development': case 'type': case 'lebensweise': return orGarbage(r.pick(pools.known.length && r.chance(0.7) ? pools.known : pools.refs));
    case 'bestimmung': return orGarbage(r.pick(pools.destinies));
    case 'application': {
      if (!pools.applications.length) return 'none';
      const app = r.pick(pools.applications);
      params.development = app.development;
      return orGarbage(app.application);
    }
    case 'offer': return orGarbage(pools.offers.length ? r.pick(pools.offers) : 'o-none');
    case 'contract': return orGarbage(pools.contracts.length ? r.pick(pools.contracts) : 'c-none');
    case 'unit': return orGarbage(pools.units.length ? r.pick(pools.units) : 'u-none');
    case 'units': return pools.units.length ? r.some(pools.units, 1, 2) : [];
    case 'member': case 'against': return orGarbage(pools.members.length ? r.pick(pools.members) : 'none');
    case 'partner': return orGarbage(r.pick(pools.peoples));
    case 'give': case 'get': return { [r.pick(pools.resources)]: r.int(0, 3) };
    case 'seasons': case 'amount': return r.int(0, 5);
    case 'res': return r.pick(pools.resources);
    case 'aim': return r.pick(['override', 'rally', 'reconcile', 'quell', 'x']);
    case 'approach': return r.pick(pools.tags);
    case 'cause': return r.pick(['need', 'x']);
    case 'mode': return r.pick(['buy', 'sell', 'honor', 'honor-dead', 'listen', 'x']);
    case 'tags': return r.some(pools.tags, 1, 3);
    case 'note': return 'fuzz';
    case 'name': return orGarbage('Fuzzdorf');
    case 'order': return 'f1';
    default: return structuredClone(r.pick(GARBAGE));
  }
}

function randomParams(r, type, pools) {
  const own = PARAMS[type];
  const keys = own && r.chance(0.85) ? own.filter(() => r.chance(0.9)) : r.some(ALL_PARAMS, 0, 4);
  const params = {};
  for (const k of keys) params[k] = paramValue(r, k, pools, params);
  return params;
}

/** A random draft of people pid for the open turn of state. */
export function randomDraft(r, state, env, pid) {
  const pools = poolsOf(state, env, pid);
  const core = state.peoples[pid].population.core;
  // A third of the cases start from the fallback policy's draft, so that
  // many drafts pass the check and reach the resolution steps of apply.
  const base = state.phase === 'planning' && r.chance(0.35) ? fallbackDraft(state, env, pid) : null;
  const random = Array.from({ length: r.int(0, base ? 2 : 4) }, (_, i) => {
    const type = pools.available.length && r.chance(0.8) ? r.pick(pools.available) : r.pick(pools.orders);
    return { id: `f${i + 1}`, type, params: randomParams(r, type, pools) };
  });
  const orders = [...(base?.orders ?? []).map((o, i) => ({ ...o, id: `b${i + 1}` })), ...random];
  const draft = {
    format: 'realmcraft-draft', version: 1, people: pid, turn: state.turn, baseRev: state.rev,
    orders, mandate: {}, rolls: {}, withdrawn: [], sealed: false,
  };
  if (base?.assign && r.chance(0.7)) draft.assign = base.assign;
  else if (r.chance(0.6)) {
    const targets = [...pools.resources.slice(0, 3), 'research', 'hueten'];
    const assign = {};
    let left = r.chance(0.2) ? core + 1 : core;
    for (const t of r.some(targets, 1, 3)) {
      const n = r.int(0, left);
      if (n) assign[t] = n;
      left -= n;
    }
    draft.assign = assign;
  }
  if (orders.length && r.chance(0.3)) draft.venture = { [r.pick(orders).id]: true };
  if (orders.length && pools.members.length && r.chance(0.3)) draft.lead = { [r.pick(orders).id]: r.pick(pools.members) };
  if (orders.length && r.chance(0.15)) draft.mandate = { [r.pick(orders).id]: 'decree' };
  return draft;
}

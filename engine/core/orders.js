// Order registry, catalogue per people, draft checking and the core orders.
//
// OrderDef (core orders here, subsystem orders in council.js, research.js,
// events.js, bestimmung.js, module orders in engine/modules/*):
//   {
//     slot: 'main'|'minor'|'free' | (ox, order, k) => slot   k = earlier orders of this type
//     tags: [tag] | (ox, order) => [tag]   practice, council and probe tags; main orders
//                                          also carry RULES.mainTag
//     value?: int                          budget weight for order.unlock (default 2)
//     locked?: true                        needs an order.unlock of this type
//     unique?: true                        at most once per draft
//     available?(ox) -> bool               false: locked_order (nothing to build, no unit type)
//     check(ox, order) -> issues           params and targets against S0
//     plan(ox, order) -> { costs, probe }  costs { res: n } against the opening stock;
//                                          probe null | { kind, target, tags, extraMods, suffix? }
//     resolve(tc, ox, order, plan, outcome) outcome null without probe, else
//                                          { band, margin, success, probe }
//   }
//
// ox = { state, env, pid, people, cal, world, standing, cx, turn, path, bind(moduleId) }
// is built from the opening state; resolve writes into tc.state through the
// log helpers and must read positions and stocks from ox.state (S0).

import { RULES } from './rules.js';
import { issue, hasErrors } from './issues.js';
import { kissue } from './codes.js';
import { calendarOf } from './calendar.js';
import { evalCondition } from './conditions.js';
import { standingOf, ofOp, applyOnceList, setKern } from './effects.js';
import { buildProbe, gatherModifiers, probeId, softcapIssues } from './probes.js';
import { validate as validateSchema } from '../content/schema.js';
import { draft as DRAFT_SCHEMA } from '../schemas/draft.js';
import { reservedKeyPaths } from './canon.js';
import {
  homeSettlement, knownEntry, settlementsOf, controlledRegions, kern, unitsOn,
} from './state.js';
import { addPeople, noteChange, notice, setControl, setPeople } from './log.js';
import { activeModules, moduleOrders } from '../modules/index.js';
import { regionAt, tileOf, route } from './map.js';
import { distance, parseKey, reveal, key as tileKey } from '../world/index.js';
import { councilVote, ORDERS as COUNCIL_ORDERS } from './council.js';
import { ORDERS as RESEARCH_ORDERS } from './research.js';
import { ORDERS as EVENT_ORDERS, eventProbeSpec } from './events.js';
import { ORDERS as BESTIMMUNG_ORDERS } from './bestimmung.js';

// Probe subjects the kernel uses for its own probes (events.js world event and
// life rolls, council.js hollow loyalty); an order with such an id would share
// its probe id with a kernel probe.
const RESERVED_IDS = new Set(['event']);
const KERNEL_PROBE_SUBJECT = /^(life|hollow)-\d+$/;
const reservedOrderId = (id) => RESERVED_IDS.has(id) || KERNEL_PROBE_SUBJECT.test(id);

export function orderContext(state, env, pid, extra = {}) {
  const standing = standingOf(state, env, pid);
  const mods = activeModules(state, env, pid, standing);
  const cal = calendarOf(env.regeln, state.turn);
  const world = env.world(state.map.seed);
  const isModuleActive = (p, id) => (p === pid ? mods.some((m) => m.id === id) : activeModules(state, env, p).some((m) => m.id === id));
  const cx = { state, env, pid, cal, world, isModuleActive };
  return {
    state, env, pid, people: state.peoples[pid], cal, world, standing, cx, turn: state.turn,
    modules: mods,
    bind: (id) => mods.find((m) => m.id === id)?.bind ?? null,
    path: '',
    ...extra,
  };
}

function costIssue(ox, costs) {
  const out = [];
  for (const [res, n] of Object.entries(costs ?? {})) {
    if (!Number.isInteger(n) || n < 0) out.push(issue('cost', ox.path, `cost of ${res} must be a non-negative integer`));
  }
  return out;
}

const tagsOf = (def, ox, order) => (typeof def.tags === 'function' ? def.tags(ox, order) : def.tags ?? []);
const slotOf = (def, ox, order, k) => (typeof def.slot === 'function' ? def.slot(ox, order, k) : def.slot);

// --- core orders -----------------------------------------------------------

const target = (ox, msg) => [issue('target', `${ox.path}/params`, msg)];
const isTile = (v) => typeof v === 'string' && /^(0|-?[1-9][0-9]*),(0|-?[1-9][0-9]*)$/.test(v);

function ownSettlement(ox, id) {
  return settlementsOf(ox.state, ox.pid).find((s) => s.id === id) ?? null;
}

function bauwerkOf(ox, ref) {
  const k = knownEntry(ox.people, ref);
  const ent = ox.env.entwicklung(ref);
  if (!k || !ent || ent.kind !== 'bauwerk' || k.state !== 'active' || k.effectiveFrom > ox.turn) return null;
  return ent;
}

function nearOwn(ox, tile, range) {
  const p = parseKey(tile);
  const pts = [...settlementsOf(ox.state, ox.pid).map((s) => s.tile), ...ox.people.units.map((u) => u.tile)];
  return pts.some((t) => distance(parseKey(t), p) <= range);
}

const CORE_ORDERS = {
  build: {
    slot: 'main',
    tags: (ox, o) => ['bau', ...(ox.env.entwicklung(o.params?.development)?.tags ?? [])],
    available: (ox) => ox.people.developments.known.some((k) => bauwerkOf(ox, k.ref)),
    check(ox, o) {
      const ent = bauwerkOf(ox, o.params?.development);
      if (!ent) return target(ox, 'development must be a known, active bauwerk');
      const s = ownSettlement(ox, o.params?.settlement);
      if (!s) return target(ox, 'settlement must be an own settlement');
      if (!ent.spec.terrains.includes(tileOf(ox.world, s.tile).terrain)) return target(ox, `${ent.name} cannot stand on this terrain`);
      const inRegion = settlementsOf(ox.state, ox.pid).filter((x) => x.regionId === s.regionId)
        .reduce((n, x) => n + x.buildings.filter((b) => b.ref === o.params.development).length, 0);
      if (inRegion >= ent.spec.perRegion) return target(ox, `${ent.name} already stands ${inRegion} times in this region`);
      return [];
    },
    plan: (ox, o) => ({ costs: { ...ox.env.entwicklung(o.params.development).spec.buildCost }, probe: { kind: 'build', target: 5, tags: ['bau'] } }),
    resolve(tc, ox, o, plan, out) {
      if (!out.success) return;
      const s = tc.state.map.settlements.find((x) => x.id === o.params.settlement);
      const b = { ref: o.params.development, since: tc.turn, state: 'active' };
      s.buildings.push(b);
      noteChange(tc, 'settlement.build', { kind: 'settlement', id: s.id }, 'buildings', null, b, `order ${o.id}: ${out.band}`, { people: ox.pid });
    },
  },
  found: {
    slot: 'main',
    tags: ['siedlung', 'bau'],
    check(ox, o) {
      const tile = o.params?.tile;
      if (!isTile(tile)) return target(ox, 'tile must be a tile key');
      const t = tileOf(ox.world, tile);
      if (!ox.env.terrain(t.terrain)?.buildable) return target(ox, 'tile is not buildable');
      if (!nearOwn(ox, tile, RULES.foundRange)) return target(ox, `tile must lie within ${RULES.foundRange} of an own settlement or unit`);
      const region = regionAt(ox.world, tile);
      const owner = ox.state.map.control[region];
      if (owner && owner !== ox.pid) return target(ox, `region is controlled by ${owner}`);
      if (ox.state.map.settlements.some((s) => s.regionId === region)) return target(ox, 'region already has a settlement');
      if (ox.people.population.core < 2) return target(ox, 'founding needs a second clan');
      return [];
    },
    plan: () => ({ costs: { ...RULES.foundCost }, probe: null }),
    resolve(tc, ox, o, plan) {
      const region = regionAt(ox.world, o.params.tile);
      // The check saw the people's projection; a hidden owner or a founder
      // earlier in the same season decides here, and the settlers stay home.
      const owner = tc.state.map.control[region];
      if ((owner && owner !== ox.pid) || tc.state.map.settlements.some((s) => s.regionId === region)) {
        notice(tc, 'order.blocked', { kind: 'region', id: region }, `order ${o.id}: the region is taken, no settlement is founded and its costs return`, { people: ox.pid });
        for (const [res, n] of Object.entries(plan?.costs ?? {})) if (n > 0) addPeople(tc, ox.pid, `resources.${res}`, n, `order ${o.id}: costs of the blocked founding return`, { kind: 'resource.change' });
        return;
      }
      const lw = ox.env.entwicklung(ox.people.lebensweise);
      const type = lw?.spec?.settlement ?? 'village';
      const n = tc.state.map.settlements.filter((s) => s.people === ox.pid).length + 1;
      const s = {
        id: `s-${ox.pid}-${tc.turn}-${n}`.slice(0, 41),
        name: (o.params.name && String(o.params.name).slice(0, 60)) || `${ox.people.name.slice(0, 50)} ${n}`,
        people: ox.pid, kind: RULES.settlementKind[type], tile: o.params.tile, regionId: region, mobile: type === 'camp', buildings: [],
      };
      if (s.name.length < 2) s.name = `Ort ${n}`;
      tc.state.map.settlements.push(s);
      noteChange(tc, 'settlement.found', { kind: 'settlement', id: s.id }, 'map.settlements', null, s, `order ${o.id}`, { people: ox.pid });
      addPeople(tc, ox.pid, 'population.core', -1, `order ${o.id}: settlers`, { min: 1, max: 99, kind: 'population.change' });
      setControl(tc, region, ox.pid, `order ${o.id}: new settlement`, { people: ox.pid });
    },
  },
  institute: {
    slot: 'main',
    tags: (ox, o) => ['ordnung', ...(ox.env.entwicklung(o.params?.development)?.tags ?? [])],
    check(ox, o) {
      const ref = o.params?.development;
      const k = knownEntry(ox.people, ref);
      const ent = ox.env.entwicklung(ref);
      if (!k || !ent || ent.kind !== 'institution' || k.state !== 'active' || k.effectiveFrom > ox.turn) return target(ox, 'development must be a known, active institution');
      if (ox.people.developments.instituted.includes(ref)) return target(ox, 'institution is already in force');
      if (ox.people.developments.instituted.length >= 20) return target(ox, 'too many institutions');
      return [];
    },
    plan: () => ({ costs: {}, probe: null }),
    resolve(tc, ox, o) {
      const ref = o.params.development;
      const list = [...tc.state.peoples[ox.pid].developments.instituted, ref];
      setPeople(tc, ox.pid, 'developments.instituted', list, `order ${o.id}: institution in force from the next season`, { kind: 'development.instituted', refs: [ref] });
      const ent = ox.env.entwicklung(ref);
      if (ent.spec?.seat) {
        const seats = [...(kern(tc.state.peoples[ox.pid]).seats ?? []), { ...structuredClone(ent.spec.seat), since: tc.turn }];
        setKern(tc, ox.pid, 'seats', seats, `${ent.name} opens a council seat`, { kind: 'council.seat' });
      }
    },
  },
  explore: {
    slot: 'minor',
    tags: ['erkundung'],
    check(ox, o) {
      const tile = o.params?.tile;
      if (!isTile(tile)) return target(ox, 'tile must be a tile key');
      if (!nearOwn(ox, tile, RULES.exploreRange)) return target(ox, `tile must lie within ${RULES.exploreRange} of an own settlement or unit`);
      return [];
    },
    plan: () => ({ costs: {}, probe: { kind: 'explore', target: 5, tags: ['erkundung'] } }),
    resolve(tc, ox, o, plan, out) {
      const radius = out.band === 'crit_success' ? RULES.exploreRadius + 1 : out.success ? RULES.exploreRadius : out.band === 'fail' ? 1 : 0;
      if (radius === 0 && out.band !== 'fail') return;
      const before = tc.state.map.known[ox.pid] ?? {};
      const known = reveal(before, parseKey(o.params.tile), radius, tc.world);
      const added = Object.keys(known).filter((k) => !Object.hasOwn(before, k)).length;
      tc.state.map.known[ox.pid] = known;
      noteChange(tc, 'map.explore', { kind: 'tile', id: o.params.tile }, `map.known.${ox.pid}`, null, { radius, added }, `order ${o.id}: ${out.band}`, { people: ox.pid });
    },
  },
  // Level-1 road tiles towards a target; unlocked by a path development (saumpfad).
  road: {
    slot: 'main',
    locked: true,
    tags: ['weg', 'bau'],
    check: (ox, o) => roadCheck(ox, o, 'lay'),
    plan: (ox, o) => roadPlan(ox, o, 'lay'),
    resolve: (tc, ox, o, plan) => roadResolve(tc, ox, o, plan),
  },
  // Raises existing road tiles by one level; unlocked by road building (strassenbau).
  'road.pave': {
    slot: 'main',
    locked: true,
    tags: ['weg', 'bau'],
    check: (ox, o) => roadCheck(ox, o, 'pave'),
    plan: (ox, o) => roadPlan(ox, o, 'pave'),
    resolve: (tc, ox, o, plan) => roadResolve(tc, ox, o, plan),
  },
};

function levelOf(f) {
  let level = 1;
  for (const t of f.tags ?? []) {
    const m = /^stufe-([1-9])$/.exec(t);
    if (m) level = Math.max(level, Number(m[1]));
  }
  return level;
}

function roadCheck(ox, o, mode) {
  const tile = o.params?.tile;
  if (!isTile(tile)) return target(ox, 'tile must be a tile key');
  const home = homeSettlement(ox.state, ox.pid);
  if (!home) return target(ox, 'no settlement to start the road from');
  if (!route(ox.state, ox.world, home.tile, tile, { maxRadius: 24 })) return target(ox, 'no passable way to that tile');
  if (!roadTiles(ox, tile, mode).length) return target(ox, mode === 'pave' ? 'no road tile on that way can be raised' : 'the way is already a road');
  return [];
}

function roadPlan(ox, o, mode) {
  const tiles = roadTiles(ox, o.params.tile, mode);
  const costs = {};
  for (const [res, n] of Object.entries(RULES.roadCostPerTile)) costs[res] = n * tiles.length;
  return { costs, probe: null, tiles };
}

function roadResolve(tc, ox, o, plan) {
  for (const k of plan.tiles) {
    const f = tc.state.map.features[k];
    if (f && f.kind !== RULES.roadKind) continue;
    const next = f
      ? { ...f, tags: [...f.tags.filter((t) => !/^stufe-/.test(t)), `stufe-${Math.min(RULES.maxRoadLevel, levelOf(f) + 1)}`].slice(0, 4) }
      : { id: `weg-${k.replace(',', 'x').replace(/-/g, 'm')}`.slice(0, 41), kind: RULES.roadKind, name: 'Weg', tags: ['weg'], resources: [], since: tc.turn, source: 'kernel' };
    tc.state.map.features[k] = next;
    noteChange(tc, 'map.road', { kind: 'tile', id: k }, `map.features.${k}`, f ?? null, next, `order ${o.id}`, { people: ox.pid });
  }
}

/**
 * The next RULES.roadLength tiles of the cheapest way from the camp towards
 * `to`: without a road for 'lay', with a road below the top level for 'pave'.
 * Tiles carrying another feature are skipped (one feature per tile).
 */
function roadTiles(ox, to, mode) {
  const home = homeSettlement(ox.state, ox.pid);
  const r = home && route(ox.state, ox.world, home.tile, to, { maxRadius: 24 });
  if (!r) return [];
  return r.path.slice(1).filter((k) => {
    const f = ox.state.map.features[k];
    if (mode === 'lay') return !f;
    return f && f.kind === RULES.roadKind && levelOf(f) < RULES.maxRoadLevel;
  }).slice(0, RULES.roadLength);
}

/** Every registered order type: { type: { def, origin } } where origin is 'core' or a module id. */
export function registry() {
  const out = {};
  for (const [t, def] of Object.entries({ ...CORE_ORDERS, ...COUNCIL_ORDERS, ...RESEARCH_ORDERS, ...EVENT_ORDERS, ...BESTIMMUNG_ORDERS })) {
    out[t] = { def, origin: 'core' };
  }
  for (const [t, { def, module }] of Object.entries(moduleOrders())) out[t] = { def, origin: module };
  return out;
}

/**
 * Catalogue of a people: [{ type, origin, slot, available, reason, limit }]
 * sorted by type. available false carries the reason (module inactive,
 * locked, nothing to act on, forbidden).
 */
export function catalogueFor(state, env, pid, ox = orderContext(state, env, pid)) {
  const reg = registry();
  const unlocks = {};
  for (const s of ofOp(ox.standing, 'order.unlock')) {
    const prev = unlocks[s.effect.order];
    const limit = s.effect.limit ?? null;
    unlocks[s.effect.order] = prev === undefined ? limit : prev === null || limit === null ? null : Math.max(prev, limit);
  }
  return Object.keys(reg).sort().map((type) => {
    const { def, origin } = reg[type];
    let reason = null;
    if (origin !== 'core' && !ox.modules.some((m) => m.id === origin)) reason = `module ${origin} is not active`;
    else if (def.locked && !Object.hasOwn(unlocks, type)) reason = 'not unlocked';
    else if (def.available && !def.available(ox)) reason = 'nothing to act on';
    else {
      const forbid = restrictionsFor(ox, type, tagsOf(def, ox, { params: {} })).find((r) => r.mode === 'forbid');
      if (forbid) reason = `forbidden by ${forbid.label}`;
    }
    const slot = typeof def.slot === 'string' ? def.slot : 'varies';
    return { type, origin, slot, available: reason === null, reason, limit: unlocks[type] ?? null };
  });
}

function restrictionsFor(ox, type, tags) {
  const out = [];
  for (const s of ofOp(ox.standing, 'order.restrict')) {
    const e = s.effect;
    if (!e.orders.includes(type) && !e.tags.some((t) => tags.includes(t))) continue;
    if (e.if && !evalCondition(e.if, ox.cx)) continue;
    out.push({ mode: e.mode, limit: e.limit ?? 1, per: e.per ?? 'season', label: s.source.label, source: s.source.key });
  }
  return out;
}

/** Slot capacity: tuning.slots plus order.slot effects. */
export function slotCapacity(ox) {
  const base = ox.env.regeln.tuning.slots;
  let main = base.main;
  let minor = base.minor;
  for (const s of ofOp(ox.standing, 'order.slot')) {
    if (s.effect.slot === 'main') main += s.effect.amount;
    else minor += s.effect.amount;
  }
  return { main, minor };
}

/** Exact shape check of a draft; returns format issues (empty when well formed). */
export function assertDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return [issue('format', '', 'draft must be an object')];
  return validateSchema(DRAFT_SCHEMA, draft).map((i) => issue('format', i.path, `${i.code}: ${i.message}`));
}

/** Labour of a turn: the draft's assign, else the assignment of the previous turn. */
export function effectiveAssign(state, draft, pid) {
  return draft && draft.assign !== undefined ? draft.assign : state.peoples[pid]?.population?.assigned ?? {};
}

function checkLabour(state, env, draft, pid, issues) {
  if (!draft.assign) return;
  const core = state.peoples[pid].population.core;
  let total = 0;
  for (const [k, n] of Object.entries(draft.assign)) {
    if (!env.resourceIds.includes(k) && !RULES.activities.includes(k)) {
      issues.push(issue('target', `/assign/${k}`, `${k} is neither a resource nor an activity`));
    }
    total += n;
  }
  if (total > core) issues.push(kissue('labour', '/assign', `${total} clans assigned, the people has ${core}`));
  else if (total < core) issues.push(kissue('idle_labour', '/assign', `${core - total} clan(s) without work`));
}

function checkChoices(state, draft, pid, issues) {
  for (const [id, option] of Object.entries(draft.choices ?? {})) {
    const pc = (state.pendingChoices ?? []).find((c) => c.id === id && c.people === pid);
    if (!pc) issues.push(issue('target', `/choices/${id}`, `no open decision ${id}`));
    else if (!pc.options.includes(option)) issues.push(issue('target', `/choices/${id}`, `${option} is not an option of ${id}`));
  }
}

function leadMods(people, memberId) {
  const m = people.council.find((x) => x.id === memberId);
  if (!m) return null;
  const out = [];
  if (m.loyalty >= RULES.leadLoyalty) out.push({ source: `lead:${m.id}`, label: m.name, value: 1, dev: false });
  if (m.lifeStage === 'lebensabend') out.push({ source: `lead:${m.id}:age`, label: m.name, value: -1, dev: false });
  if (m.lifeStage === 'hinfaellig') out.push({ source: `lead:${m.id}:age`, label: m.name, value: -2, dev: false });
  return out;
}

/**
 * Checks a draft against the opening state (a full state or a projection).
 * mode 'preview' allows phases planning and agents and reports missing player
 * rolls as unresolved; mode 'apply' (used by seal and apply) requires planning
 * or resolving and turns a missing player roll into roll_missing. Returns {
 *   issues, entries: [{ index, order, def, origin, slot, tags, plan, vote, probe, venture, errors }],
 *   probes, eventProbe, costs, slots, assign, unresolved
 * }.
 */
export function checkDraft(state, env, draft, { as, mode = 'preview' } = {}) {
  const issues = [];
  const out = { issues, entries: [], probes: [], eventProbe: null, costs: {}, slots: null, assign: {}, unresolved: [] };
  issues.push(...assertDraft(draft));
  if (hasErrors(issues)) return out;
  for (const path of reservedKeyPaths(draft)) issues.push(issue('format', path, 'a reserved name cannot serve as an id or key'));
  if (hasErrors(issues)) return out;
  const pid = as ?? draft.people;
  if (draft.people !== pid || !state.peoples[pid] || !state.peoples[pid].developments) {
    issues.push(issue('format', '/people', `draft is for ${draft.people}, not ${pid}`));
    return out;
  }
  if (state.status === 'ended') issues.push(issue('finished', '', 'the campaign has ended'));
  const phases = mode === 'apply' ? ['planning', 'resolving'] : ['planning', 'agents'];
  if (!phases.includes(state.phase)) issues.push(issue('phase', '/phase', `phase ${state.phase} does not allow ${mode}`));
  // baseRev is informational: an ingest between preview and apply raises rev,
  // and fingerprints already guard every roll against changed probes.
  if (draft.turn !== state.turn) issues.push(issue('stale', '/turn', `draft for turn ${draft.turn}, state is turn ${state.turn}`));
  if (hasErrors(issues)) return out;

  const people = state.peoples[pid];
  const roller = state.campaign.player === pid ? 'player' : 'kernel';
  checkLabour(state, env, draft, pid, issues);
  checkChoices(state, draft, pid, issues);
  out.assign = effectiveAssign(state, draft, pid);
  const ox0 = orderContext(state, env, pid);
  const reg = registry();
  const catalogue = Object.fromEntries(catalogueFor(state, env, pid, ox0).map((c) => [c.type, c]));
  const typeCount = {};
  const used = { main: 0, minor: 0 };
  const rejectedByCouncil = [];
  const ids = new Set(draft.orders.map((o) => o.id));
  for (const k of [...Object.keys(draft.venture ?? {}), ...Object.keys(draft.lead ?? {}), ...Object.keys(draft.mandate)]) {
    if (!ids.has(k)) issues.push(issue('target', '/orders', `${k} names no order of this draft`));
  }

  const seenIds = new Set();
  draft.orders.forEach((order, index) => {
    const path = `/orders/${index}`;
    const ox = { ...ox0, path };
    const errors = [];
    const entry = { index, order, def: null, origin: null, slot: null, tags: [], plan: null, vote: null, probe: null, venture: false, errors };
    out.entries.push(entry);
    if (seenIds.has(order.id) || reservedOrderId(order.id)) errors.push(issue('duplicate', `${path}/id`, `order id ${order.id} is used twice or reserved`));
    seenIds.add(order.id);
    const reg1 = reg[order.type];
    if (!reg1) {
      errors.push(issue('unknown_order', `${path}/type`, `unknown order type ${order.type}`));
      issues.push(...errors);
      return;
    }
    const { def, origin } = reg1;
    entry.def = def;
    entry.origin = origin;
    const cat = catalogue[order.type];
    if (!cat.available) {
      const code = cat.reason.startsWith('forbidden') ? 'restricted' : 'locked_order';
      errors.push(kissue(code, `${path}/type`, `${order.type}: ${cat.reason}`));
      issues.push(...errors);
      return;
    }
    const k = typeCount[order.type] ?? 0;
    typeCount[order.type] = k + 1;
    if (def.unique && k > 0) errors.push(issue('duplicate', `${path}/type`, `${order.type} is allowed once per season`));
    if (cat.limit !== null && k >= cat.limit) errors.push(kissue('restricted', `${path}/type`, `${order.type} at most ${cat.limit} times per season`));
    const slot = slotOf(def, ox, order, k);
    entry.slot = slot;
    let tags = [...new Set([...tagsOf(def, ox, order), ...(slot === 'main' ? [RULES.mainTag] : [])])];
    entry.tags = tags;
    for (const r of restrictionsFor(ox, order.type, tags)) {
      if (r.mode === 'forbid') errors.push(kissue('restricted', `${path}/type`, `${order.type} is forbidden by ${r.label}`));
      if (r.mode === 'limit' && k >= r.limit) errors.push(kissue('restricted', `${path}/type`, `${order.type} limited to ${r.limit} per ${r.per} by ${r.label}`));
    }
    if (slot === 'none') errors.push(issue('slots', `${path}/type`, `${order.type}: no further order of this type this season`));
    else if (slot === 'main' || slot === 'minor') used[slot]++;
    entry.venture = draft.venture?.[order.id] === true;
    if (entry.venture && slot !== 'main') errors.push(issue('target', path, 'only a main order can be a venture'));
    errors.push(...def.check(ox, order));
    if (!hasErrors(errors)) {
      const plan = def.plan(ox, order);
      entry.plan = plan;
      errors.push(...costIssue(ox, plan.costs));
      if (plan.tags) entry.tags = tags = [...new Set([...tags, ...plan.tags])];
      let pspec = plan.probe;
      if (entry.venture) pspec = pspec ? { ...pspec, target: pspec.target + 1 } : { kind: order.type, target: RULES.ventureTarget, tags: [] };
      if (pspec) {
        const ptags = [...new Set([...tags, ...pspec.tags])];
        const lead = draft.lead?.[order.id];
        const lm = lead ? leadMods(people, lead) : [];
        if (lm === null) errors.push(issue('target', `/lead/${order.id}`, `${lead} is no council member`));
        const mods = [...gatherModifiers(people, ptags, ox.standing, ox.cx), ...(pspec.extraMods ?? []), ...(lm ?? [])];
        entry.probe = buildProbe({
          id: probeId(state.turn, pid, pspec.suffix ?? order.id), people: pid, order: order.id, kind: pspec.kind,
          tags: ptags, roller, target: pspec.target, modifiers: mods,
          params: { order: order.params, venture: entry.venture, lead: lead ?? null },
        });
        out.probes.push(entry.probe);
        issues.push(...softcapIssues(entry.probe));
      }
      const vote = councilVote(ox, tags, order.type);
      if (vote.required) {
        entry.vote = vote;
        if (!vote.passed) {
          if (draft.mandate[order.id] === 'decree') vote.decree = true;
          else rejectedByCouncil.push(entry);
        }
      }
    }
    issues.push(...errors);
  });

  // An override Machtprobe in the same draft can carry a rejected order; it is
  // decided at resolution, so the order stays conditional instead of an error.
  const overrides = new Set(out.entries.filter((e) => e.order.type === 'machtprobe' && e.order.params?.aim === 'override').map((e) => e.order.params.order));
  for (const e of rejectedByCouncil) {
    if (overrides.has(e.order.id)) {
      e.vote.override = true;
      out.unresolved.push({ order: e.order.id, reason: 'council majority depends on the Machtprobe' });
    } else {
      const msg = `council rejects ${e.order.type} (${e.vote.yes} yes, ${e.vote.no} no, rule ${e.vote.rule})`;
      const iss = issue('council_rejected', `/orders/${e.index}`, msg);
      e.errors.push(iss);
      issues.push(iss);
    }
  }

  const cap = slotCapacity(ox0);
  out.slots = { main: { used: used.main, max: cap.main }, minor: { used: used.minor, max: cap.minor } };
  for (const sl of ['main', 'minor']) {
    if (used[sl] > cap[sl]) issues.push(issue('slots', '/orders', `${used[sl]} ${sl} orders, ${cap[sl]} available`));
    else if (used[sl] < cap[sl]) issues.push(issue('free_slots', '/orders', `${cap[sl] - used[sl]} ${sl} slot(s) unused`));
  }

  // Costs of all orders against the opening stock.
  const running = {};
  for (const e of out.entries) {
    if (!e.plan) continue;
    for (const [res, n] of Object.entries(e.plan.costs ?? {})) {
      if (n <= 0) continue;
      running[res] = (running[res] ?? 0) + n;
      if (running[res] > (people.resources[res] ?? 0)) {
        const iss = issue('cost', `/orders/${e.index}`, `${res}: orders need ${running[res]}, the opening stock holds ${people.resources[res] ?? 0}`);
        e.errors.push(iss);
        issues.push(iss);
      }
    }
  }
  out.costs = running;

  // The world event of every people is a probe; the player rolls his own.
  const ev = eventProbeSpec(state, pid, roller);
  if (ev) {
    out.eventProbe = buildProbe(ev);
    out.probes.push(out.eventProbe);
  }

  // Rolls entered between preview and apply.
  const byId = new Map(out.probes.map((p) => [p.id, p]));
  for (const [id, r] of Object.entries(draft.rolls)) {
    const p = byId.get(id);
    if (!p) issues.push(issue('roll_stale', `/rolls/${id}`, `roll for ${id} has no matching probe any more`));
    else if (p.fingerprint !== r.fingerprint) issues.push(issue('roll_stale', `/rolls/${id}`, `probe ${id} changed after the roll`));
  }
  if (roller === 'player') {
    for (const p of out.probes) {
      if (draft.rolls[p.id]) continue;
      if (mode === 'apply') issues.push(issue('roll_missing', `/rolls/${p.id}`, `probe ${p.id} needs the player's roll`));
      else out.unresolved.push({ probe: p.id, reason: 'roll missing' });
    }
  }
  return out;
}

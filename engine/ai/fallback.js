// Fallback policy: the sealed draft an AI people gets when no agent draft
// exists or the agent's draft has errors. Deterministic, no randomness, and
// computed only from projectFor(state, env, pid), so an AI people decides on
// what a player of that people would see. Every order is validated greedily
// with checkDraft on the projection and kept only without error issues.

import { RULES } from '../core/rules.js';
import { calendarOf } from '../core/calendar.js';
import { hasErrors } from '../core/issues.js';
import { projectFor } from '../core/project.js';
import { checkDraft } from '../core/orders.js';
import { forecast, stockCaps } from '../core/economy.js';
import { activeModules } from '../modules/index.js';
import { homeSettlement, regionTerrain, relKey, relation, settlementsOf } from '../core/state.js';
import { regionAt, tileOf } from '../core/map.js';
import { DIRECTIONS, distance, key, parseKey, ring, spiral } from '../world/index.js';

// TUNING: candidates tried per order kind before the policy gives up on it.
const TRIES = 6;

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function fallbackDraft(state, env, pid) {
  const view = projectFor(state, env, pid);
  const own = view.peoples[pid];
  const world = env.world(view.map.seed);
  const profile = (env.regeln.aiProfiles ?? []).find((p) => p.id === own.agentProfile);
  const weights = profile?.weights ?? {};
  // The people's own nature leans every decision a little, so peoples without
  // a profile (the player's seat) still develop apart instead of by alphabet.
  const nature = identityWeights(own.identity);
  const weight = (tag) => (weights[tag] ?? 0) + (nature[tag] ?? 0);
  const score = (tags) => tags.reduce((n, t) => n + weight(t), 0);
  const tagsOf = (ref) => env.entwicklung(ref)?.tags ?? [];
  const mode = view.phase === 'agents' ? 'preview' : 'apply';
  const home = homeSettlement(view, pid);
  const modules = new Set(activeModules(view, env, pid).map((m) => m.id));

  const check = (d) => checkDraft(view, env, d, { as: pid, mode });
  const valid = (d) => !hasErrors(check(d).issues.filter((i) => i.code !== 'roll_missing'));
  const shortfall = (d) => {
    const chk = check(d);
    return forecast(view, env, pid, { spend: chk.costs, assign: chk.assign }).shortfall ?? {};
  };
  let n = 0;
  const order = (type, params) => ({ id: `o${++n}`, type, params });
  let draft = {
    format: 'realmcraft-draft', version: 1, people: pid, turn: view.turn, baseRev: view.rev,
    orders: [], mandate: {}, rolls: {}, withdrawn: [], sealed: true,
  };
  const withAssign = { ...draft, assign: labour(view, env, pid, own) };
  if (valid(withAssign)) draft = withAssign;
  // The first candidate that keeps the draft free of errors wins, unless its
  // costs open a shortfall the draft did not have yet (a policy against
  // starving a people for a unit or a building). With keepReserve its food
  // cost must also leave the winter reserve in stock.
  const foodSpent = (d) => check(d).costs?.[RULES.food] ?? 0;
  const reserve = winterReserve(env, own);
  const addFirst = (type, candidates, { keepReserve = false } = {}) => {
    const before = shortfall(draft);
    for (const params of candidates.slice(0, TRIES)) {
      const next = { ...draft, orders: [...draft.orders, order(type, params)] };
      if (!valid(next)) continue;
      const after = shortfall(next);
      if (Object.keys(after).some((res) => (after[res] ?? 0) > (before[res] ?? 0))) continue;
      if (keepReserve && foodSpent(next) > foodSpent(draft) && (own.resources[RULES.food] ?? 0) - foodSpent(next) < reserve) continue;
      draft = next;
      return true;
    }
    return false;
  };

  // Research follows the profile: the candidate whose tags weigh most, ties in
  // the order of the offer (the pool ranks by practice). A candidate the
  // people's leanings reject is declined, not researched for want of another.
  const dev = own.developments;
  if (dev.research.length === 0 && dev.candidates.length > 0) {
    const ranked = dev.candidates.filter((c) => score(tagsOf(c.ref)) >= 0)
      .sort((a, b) => score(tagsOf(b.ref)) - score(tagsOf(a.ref)));
    addFirst('research.assign', ranked.map((c) => ({ development: c.ref })));
  }

  const knownTiles = Object.keys(view.map.known[pid] ?? {}).sort(byString);
  const threat = threatened(view, pid);
  // A people with clans to spare settles a new region. Founding reaches only
  // a few tiles beyond an own settlement or unit, so without a site in reach
  // a camp moves on into a free region (its old one stays held for a while
  // and can be settled next) or a unit walks ahead.
  const room = own.population.core >= FOUND_CORE;
  const wanted = wantedTerrains(env, own);
  const sites = room ? foundTiles(view, env, own, world, knownTiles, wanted) : [];
  const frontier = room && !sites.length ? frontierTiles(view, env, own, world, knownTiles, wanted) : [];
  // A profile that values war acts on a chance to attack before it settles or builds.
  const attack = () => addFirst('attack', attackParams(view, own, pid, weight));
  const mains = [
    () => addFirst('migrate', migrateTiles(view, env, own, home, world, knownTiles)),
    attack,
    () => addFirst('found', sites),
    () => addFirst('migrate', moveOnTiles(view, env, own, home, frontier)),
    () => addFirst('institute', instituteParams(env, own, score)),
    () => addFirst('build', buildParams(view, env, own, score, threat)),
  ];
  if (weight('krieg') > 0 || weight('angriff') > 0) mains.unshift(mains.splice(1, 1)[0]);
  for (const add of mains) if (add()) break;
  if (frontier.length && modules.has('militaer')) addFirst('move', scoutMoves(own, frontier));

  // A threatened people raises a unit before it looks around.
  const units = env.regeln.tuning?.expected?.units ?? 2;
  const recruit = () => {
    if (!modules.has('militaer')) return;
    if (threat) addFirst('recruit', recruitParams(view, env, own, score));
    else if (weight('krieg') > 0 && own.units.length < units) addFirst('recruit', recruitParams(view, env, own, score), { keepReserve: true });
  };
  if (threat) recruit();
  addFirst('explore', exploreTiles(home, view.turn, knownTiles));
  if (modules.has('magie')) addFirst('discipline.use', disciplineParams(env, own, home, view.turn, knownTiles, score, stockCaps(view, env, pid)));
  if (!threat) recruit();
  if (modules.has('handel') && weight('handel') > 0) addFirst('trade.offer', tradeParams(view, env, own));
  // The council is tended for free: the dead of the last season are honoured,
  // otherwise the most aggrieved member (the kernel allows once a year each).
  const aggrieved = own.council.filter((m) => m.loyalty < 0).sort((a, b) => a.loyalty - b.loyalty || byString(a.id, b.id));
  addFirst('talk', [{ mode: 'honor-dead' }, ...aggrieved.map((m) => ({ mode: 'honor', member: m.id }))]);
  return draft;
}

// TUNING: the people's nature from its template: the strength of its
// Wesensart and its Ausrichtung count +1, its weakness -1.
function identityWeights(identity) {
  const out = {};
  const add = (tag, w) => { if (typeof tag === 'string') out[tag] = (out[tag] ?? 0) + w; };
  add(identity?.wesensart?.plus?.tag, 1);
  add(identity?.wesensart?.minus?.tag, -1);
  add(identity?.ausrichtung, 1);
  return out;
}

// TUNING: a foreign unit this close to an own settlement, of a people at war
// or with a relation below 0, is a threat.
const THREAT_RANGE = 3;
const DEFENCE = ['verteidigung', 'befestigung'];

function threatened(view, pid) {
  const homes = settlementsOf(view, pid).map((s) => parseKey(s.tile));
  return Object.keys(view.peoples).some((other) => {
    if (other === pid) return false;
    const rel = relation(view, pid, other);
    if (!rel?.atWar && (rel?.value ?? 0) >= 0) return false;
    return view.peoples[other].units.some((u) => homes.some((h) => distance(h, parseKey(u.tile)) <= THREAT_RANGE));
  });
}

// TUNING: clans a people keeps before it sends one out to found a settlement.
const FOUND_CORE = 4;

// Region terrains an open controls milestone of the own destiny names.
function wantedTerrains(env, own) {
  const b = own.bestimmung;
  const def = b ? env.bestimmung(b.ref) : null;
  return new Set((b?.milestones ?? [])
    .filter((m) => !m.reached)
    .map((m) => def?.milestones.find((x) => x.id === m.id)?.predicate)
    .filter((p) => p?.pred === 'controls' && p.terrain)
    .map((p) => p.terrain));
}

// Known, buildable tiles in regions no settlement holds and no other people
// controls, with their distance to the nearest own settlement or unit (the
// anchors of a founding).
function freeGround(view, env, own, world, knownTiles, wanted) {
  const anchors = [...settlementsOf(view, own.id).map((s) => s.tile), ...own.units.map((u) => u.tile)].map(parseKey);
  const settled = new Set(view.map.settlements.map((s) => s.regionId));
  return knownTiles
    .map((k) => ({ k, t: tileOf(world, k).terrain, region: regionAt(world, k) }))
    .filter(({ t, region }) => env.terrain(t)?.buildable && !settled.has(region)
      && (!view.map.control[region] || view.map.control[region] === own.id))
    .map((x) => {
      const h = parseKey(x.k);
      return { ...x, d: Math.min(...anchors.map((a) => distance(a, h))), want: wanted.has(regionTerrain(world, x.region)) ? 1 : 0 };
    });
}

// A new settlement within founding reach. Regions the own destiny wants come
// first, then the food the tile's terrain yields, then the distance, then the key.
function foundTiles(view, env, own, world, knownTiles, wanted) {
  const food = (t) => env.terrain(t)?.yields?.[RULES.food] ?? 0;
  return freeGround(view, env, own, world, knownTiles, wanted)
    .filter(({ d }) => d >= 1 && d <= RULES.foundRange)
    .sort((a, b) => b.want - a.want || food(b.t) - food(a.t) || a.d - b.d || byString(a.k, b.k))
    .map(({ k }) => ({ tile: k }));
}

// Free ground beyond founding reach, nearest first: where a camp or a unit
// goes so that a founding comes within reach.
function frontierTiles(view, env, own, world, knownTiles, wanted) {
  return freeGround(view, env, own, world, knownTiles, wanted)
    .filter(({ d }) => d > RULES.foundRange)
    .sort((a, b) => b.want - a.want || a.d - b.d || byString(a.k, b.k))
    .map(({ k }) => k);
}

// A camp moves on into free ground within its reach; the kernel checks reach.
function moveOnTiles(view, env, own, home, frontier) {
  if (!env.entwicklung(own.lebensweise)?.spec?.migrates || !home?.mobile) return [];
  const from = parseKey(home.tile);
  const occupied = new Set(view.map.settlements.map((s) => s.tile));
  return frontier.filter((k) => !occupied.has(k) && distance(from, parseKey(k)) <= RULES.migrateRange).map((k) => ({ tile: k }));
}

// A ready unit steps towards the nearest free ground; the kernel checks reach.
function scoutMoves(own, frontier) {
  const goal = parseKey(frontier[0]);
  const unit = own.units.filter((u) => u.state === 'ready').sort((a, b) => distance(parseKey(a.tile), goal) - distance(parseKey(b.tile), goal) || byString(a.id, b.id))[0];
  if (!unit) return [];
  const at = parseKey(unit.tile);
  return spiral(at, 2)
    .map((h) => ({ k: key(h.q, h.r), d: distance(h, goal) }))
    .filter(({ k, d }) => k !== unit.tile && d < distance(at, goal))
    .sort((a, b) => a.d - b.d || byString(a.k, b.k))
    .map(({ k }) => ({ unit: unit.id, tile: k }));
}

// Minor applications of the known disciplines whose tags the people does not
// reject, paid from the stock: a tile target is a known tile far from home,
// so a far sight reveals new ground.
function disciplineParams(env, own, home, turn, knownTiles, score, caps) {
  if (!home) return [];
  const from = parseKey(home.tile);
  const far = [...knownTiles].sort((a, b) => distance(from, parseKey(b)) - distance(from, parseKey(a)) || byString(a, b));
  const out = [];
  for (const k of own.developments.known) {
    const ent = env.entwicklung(k.ref);
    if (k.state !== 'active' || k.effectiveFrom > turn || ent?.kind !== 'disziplin') continue;
    for (const app of ent.spec.applications) {
      if (app.slot !== 'minor' || score(app.tags) < 0) continue;
      if (Object.entries(app.cost).some(([res, n]) => (own.resources[res] ?? 0) < n)) continue;
      // Gathering a stock that is already full spends the cost for nothing.
      const gains = Object.values(app.outcomes).flat().filter((p) => p.op === 'resource.delta' && p.amount > 0);
      if (gains.some((p) => (own.resources[p.res] ?? 0) >= (caps[p.res] ?? Infinity))) continue;
      if (app.targetKind === 'none' && score(app.tags) > 0) out.push({ development: k.ref, application: app.id });
      if (app.targetKind === 'tile') for (const tile of far.slice(0, 2)) out.push({ development: k.ref, application: app.id, target: tile });
    }
  }
  return out;
}

// TUNING: food a people puts aside per season outside winter until its stock
// holds one winter season's consumption.
const RESERVE_GAIN = 2;

/** Food one winter season consumes under the people's way of life. */
function winterReserve(env, own) {
  const consumption = env.entwicklung(own.lebensweise)?.spec?.consumption ?? {};
  const winters = env.regeln.calendar.seasons.filter((s) => s.winter).map((s) => consumption[s.id] ?? 1);
  return own.population.core * Math.max(1, ...winters);
}

// Labour: food first (the fewest clans whose forecast covers consumption and,
// outside winter, puts food aside towards a winter reserve, at least one),
// one clan on material, the rest on research when there is something to
// research and otherwise on the herds, or on material without herds.
function labour(view, env, pid, own) {
  const core = own.population.core;
  const food = env.resourceIds.includes(RULES.food) ? RULES.food : env.resourceIds[0];
  const mat = env.resourceIds.includes(RULES.material) ? RULES.material : null;
  const filler = mat ?? 'research';
  const reserve = winterReserve(env, own);
  const stock = own.resources[food] ?? 0;
  const gain = calendarOf(env.regeln, view.turn).winter ? 0 : Math.min(RESERVE_GAIN, Math.max(0, reserve - stock));
  const netOf = (f) => {
    const assign = { [food]: f };
    if (core - f > 0) assign[filler] = core - f;
    const fc = forecast(view, env, pid, { assign });
    return { net: fc.net?.[food] ?? 0, short: (fc.shortfall?.[food] ?? 0) > 0 };
  };
  let f = Math.min(1, core);
  let cur = netOf(f);
  // A clan joins the food work only while it adds food: once the work slots
  // of the land are full, more clans would stand idle in the fields.
  while (f < core && (cur.net < gain || cur.short)) {
    const next = netOf(f + 1);
    if (next.net <= cur.net) break;
    f++;
    cur = next;
  }
  const rest = core - f;
  const m = mat && rest >= 1 ? 1 : 0;
  const left = rest - m;
  const researchable = own.developments.research.length > 0 || own.developments.candidates.length > 0;
  const herds = env.entwicklung(own.lebensweise)?.spec?.herdRules ? 'hueten' : null;
  const out = {};
  const put = (k, v) => { if (v > 0) out[k] = (out[k] ?? 0) + v; };
  put(food, f);
  put(mat ?? food, m);
  put(researchable ? 'research' : herds ?? mat ?? food, left);
  return out;
}

// A camp that stands on no pasture moves to the nearest buildable pasture
// tile within reach (lebensweise spec), ties by tile key.
function migrateTiles(view, env, own, home, world, knownTiles) {
  const spec = env.entwicklung(own.lebensweise)?.spec;
  if (!spec?.migrates || !home?.mobile) return [];
  const pasture = new Set(spec.herdRules?.pastureTerrains ?? []);
  if (!pasture.size || pasture.has(tileOf(world, home.tile).terrain)) return [];
  const from = parseKey(home.tile);
  const occupied = new Set(view.map.settlements.map((s) => s.tile));
  return knownTiles
    .map((k) => ({ k, d: distance(from, parseKey(k)) }))
    .filter(({ k, d }) => {
      if (d < 1 || d > RULES.migrateRange || occupied.has(k)) return false;
      const t = tileOf(world, k);
      if (!pasture.has(t.terrain) || !env.terrain(t.terrain)?.buildable) return false;
      const owner = view.map.control[regionAt(world, k)];
      return !owner || owner === own.id;
    })
    .sort((a, b) => a.d - b.d || byString(a.k, b.k))
    .map(({ k }) => ({ tile: k }));
}

// Known bauwerke by profile score, defences first under threat, on the home
// settlement first.
function buildParams(view, env, own, score, threat) {
  const homeId = homeSettlement(view, own.id)?.id;
  const sites = settlementsOf(view, own.id).sort((a, b) => (b.id === homeId) - (a.id === homeId) || byString(a.id, b.id));
  const defends = (ref) => (threat && env.entwicklung(ref).tags.some((t) => DEFENCE.includes(t)) ? 1 : 0);
  const devs = own.developments.known
    .filter((k) => k.state === 'active' && k.effectiveFrom <= view.turn && env.entwicklung(k.ref)?.kind === 'bauwerk')
    .sort((a, b) => defends(b.ref) - defends(a.ref) || score(env.entwicklung(b.ref).tags) - score(env.entwicklung(a.ref).tags) || byString(a.ref, b.ref));
  return devs.flatMap((d) => sites.map((s) => ({ development: d.ref, settlement: s.id })));
}

// Only a profile that values war attacks, a visible foreign unit next to
// an own ready unit and a relation of -1 or worse.
function attackParams(view, own, pid, weight) {
  if (weight('krieg') <= 0 && weight('angriff') <= 0) return [];
  const mine = own.units.filter((u) => u.state === 'ready');
  const out = [];
  for (const other of Object.keys(view.peoples).sort(byString)) {
    if (other === pid || (relation(view, pid, other)?.value ?? 0) > -1) continue;
    for (const target of view.peoples[other].units) {
      const near = mine.filter((u) => distance(parseKey(u.tile), parseKey(target.tile)) === 1);
      if (near.length) out.push({ units: near.map((u) => u.id).sort(byString), tile: target.tile });
    }
  }
  return out.sort((a, b) => byString(a.tile, b.tile));
}

function instituteParams(env, own, score) {
  return own.developments.known
    .filter((k) => k.state === 'active' && env.entwicklung(k.ref)?.kind === 'institution' && !own.developments.instituted.includes(k.ref))
    .sort((a, b) => score(env.entwicklung(b.ref).tags) - score(env.entwicklung(a.ref).tags) || byString(a.ref, b.ref))
    .map((k) => ({ development: k.ref }));
}

// Three tiles from the home settlement, direction by turn mod 6; unknown
// tiles first, since an explore of known ground reveals nothing. Once every
// such corner is known the ring at exploreRange takes over, starting at a
// turn-dependent offset.
function exploreTiles(home, turn, knownTiles) {
  if (!home) return [];
  const from = parseKey(home.tile);
  const known = new Set(knownTiles);
  const corners = DIRECTIONS.map((_, i) => DIRECTIONS[(turn + i) % DIRECTIONS.length])
    .map((d) => key(from.q + 3 * d.q, from.r + 3 * d.r));
  const outer = ring(from, RULES.exploreRange).map((h) => key(h.q, h.r));
  const offset = ((turn % DIRECTIONS.length) * outer.length) / DIRECTIONS.length;
  const rotated = [...outer.slice(offset), ...outer.slice(0, offset)];
  return [...corners, ...rotated].filter((k) => !known.has(k)).map((k) => ({ tile: k }));
}

// Known unit types by profile score, recruited in the home settlement first.
function recruitParams(view, env, own, score) {
  const homeId = homeSettlement(view, own.id)?.id;
  const sites = settlementsOf(view, own.id).sort((a, b) => (b.id === homeId) - (a.id === homeId) || byString(a.id, b.id));
  return own.developments.known
    .filter((k) => k.state === 'active' && k.effectiveFrom <= view.turn && env.entwicklung(k.ref)?.kind === 'einheit')
    .sort((a, b) => score(env.entwicklung(b.ref).tags) - score(env.entwicklung(a.ref).tags) || byString(a.ref, b.ref))
    .flatMap((k) => sites.map((s) => ({ type: k.ref, settlement: s.id })));
}

// One unit of the largest non-food stock against one unit of food, offered
// for two seasons to every partner in contact. What a partner holds is hidden,
// so the offer asks for the one resource every people needs.
function tradeParams(view, env, own) {
  const give = Object.entries(own.resources)
    .filter(([res, n]) => res !== RULES.food && n >= 2)
    .sort((a, b) => b[1] - a[1] || byString(a[0], b[0]))
    .map(([res]) => res);
  if (!give.length || !env.resourceIds.includes(RULES.food)) return [];
  const partners = Object.keys(view.peoples)
    .filter((id) => id !== own.id && view.relations[relKey(own.id, id)]?.contact === true)
    .sort(byString);
  return partners.flatMap((partner) => give.slice(0, 2).map((res) => ({ partner, give: { [res]: 1 }, get: { [RULES.food]: 1 }, seasons: 2 })));
}

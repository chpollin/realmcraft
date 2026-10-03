// Fallback policy: the sealed draft an AI people gets when no agent draft
// exists or the agent's draft has errors. Deterministic, no randomness, and
// computed only from projectFor(state, env, pid), so an AI people decides on
// what a player of that people would see. Every order is validated greedily
// with checkDraft on the projection and kept only without error issues.

import { RULES } from '../core/rules.js';
import { hasErrors } from '../core/issues.js';
import { projectFor } from '../core/project.js';
import { checkDraft } from '../core/orders.js';
import { forecast } from '../core/economy.js';
import { activeModules } from '../modules/index.js';
import { homeSettlement, relKey, relation, settlementsOf } from '../core/state.js';
import { regionAt, tileOf } from '../core/map.js';
import { DIRECTIONS, distance, key, parseKey, ring } from '../world/index.js';

// TUNING: candidates tried per order kind before the policy gives up on it.
const TRIES = 6;

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function fallbackDraft(state, env, pid) {
  const view = projectFor(state, env, pid);
  const own = view.peoples[pid];
  const world = env.world(view.map.seed);
  const profile = (env.regeln.aiProfiles ?? []).find((p) => p.id === own.agentProfile);
  const weights = profile?.weights ?? {};
  const weight = (tag) => weights[tag] ?? 0;
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
  // starving a people for a unit or a building).
  const addFirst = (type, candidates) => {
    const before = shortfall(draft);
    for (const params of candidates.slice(0, TRIES)) {
      const next = { ...draft, orders: [...draft.orders, order(type, params)] };
      if (!valid(next)) continue;
      const after = shortfall(next);
      if (Object.keys(after).some((res) => (after[res] ?? 0) > (before[res] ?? 0))) continue;
      draft = next;
      return true;
    }
    return false;
  };

  // Research follows the profile: the candidate whose tags weigh most.
  const dev = own.developments;
  if (dev.research.length === 0 && dev.candidates.length > 0) {
    const ranked = [...dev.candidates].sort((a, b) => score(tagsOf(b.ref)) - score(tagsOf(a.ref)) || byString(a.ref, b.ref));
    addFirst('research.assign', ranked.map((c) => ({ development: c.ref })));
  }

  const knownTiles = Object.keys(view.map.known[pid] ?? {}).sort(byString);
  // A profile that values war acts on a chance to attack before it settles or builds.
  const attack = () => addFirst('attack', attackParams(view, own, pid, weight));
  const mains = [
    () => addFirst('migrate', migrateTiles(view, env, own, home, world, knownTiles)),
    () => addFirst('build', buildParams(view, env, own, score)),
    attack,
    () => addFirst('institute', instituteParams(env, own, score)),
  ];
  if (weight('krieg') > 0 || weight('angriff') > 0) mains.unshift(mains.splice(2, 1)[0]);
  for (const add of mains) if (add()) break;

  addFirst('explore', exploreTiles(home, view.turn, knownTiles));
  if (modules.has('militaer') && (weight('krieg') > 0)) addFirst('recruit', recruitParams(view, env, own, score));
  if (modules.has('handel') && weight('handel') > 0) addFirst('trade.offer', tradeParams(view, env, own));
  return draft;
}

// Labour: food first (the fewest clans whose forecast covers consumption, at
// least one), one clan on material, the rest on research when there is
// something to research and otherwise on food.
function labour(view, env, pid, own) {
  const core = own.population.core;
  const food = env.resourceIds.includes(RULES.food) ? RULES.food : env.resourceIds[0];
  const mat = env.resourceIds.includes(RULES.material) ? RULES.material : null;
  const filler = mat ?? 'research';
  const covers = (f) => {
    const assign = { [food]: f };
    if (core - f > 0) assign[filler] = core - f;
    const fc = forecast(view, env, pid, { assign });
    return (fc.net?.[food] ?? 0) >= 0 && !((fc.shortfall?.[food] ?? 0) > 0);
  };
  let f = Math.min(1, core);
  while (f < core && !covers(f)) f++;
  const rest = core - f;
  const m = mat && rest >= 1 ? 1 : 0;
  const left = rest - m;
  const researchable = own.developments.research.length > 0 || own.developments.candidates.length > 0;
  const out = {};
  const put = (k, v) => { if (v > 0) out[k] = (out[k] ?? 0) + v; };
  put(food, f + (researchable ? 0 : left));
  put(mat ?? food, m);
  put('research', researchable ? left : 0);
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

// Known bauwerke by profile score, on the home settlement first.
function buildParams(view, env, own, score) {
  const homeId = homeSettlement(view, own.id)?.id;
  const sites = settlementsOf(view, own.id).sort((a, b) => (b.id === homeId) - (a.id === homeId) || byString(a.id, b.id));
  const devs = own.developments.known
    .filter((k) => k.state === 'active' && k.effectiveFrom <= view.turn && env.entwicklung(k.ref)?.kind === 'bauwerk')
    .sort((a, b) => score(env.entwicklung(b.ref).tags) - score(env.entwicklung(a.ref).tags) || byString(a.ref, b.ref));
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

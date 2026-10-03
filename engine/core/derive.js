// Values derived from a state: stats, stock caps, a forecast, order slots and
// catalogue per people (written to state.derived on every write, never an
// input to a rule), and the map layers the views draw.

import { atWar, controlledRegions, homeSettlement, kern, peopleIds, relation, settlementsOf } from './state.js';
import { statsOf } from './stats.js';
import { standingOf } from './effects.js';
import { forecast, popCap, stockCaps } from './economy.js';
import { specOf } from './military.js';
import { knownRegions, roadLayer, threatLayer } from './map.js';
import { catalogueFor, leadMods, orderContext, slotCapacity } from './orders.js';
import { RULES } from './rules.js';
import { calendarOf } from './calendar.js';
import { projectEvents, projectFor } from './project.js';
import { pathsView } from './pfade.js';
import { activeModules } from '../modules/index.js';
import { tradeRoute } from '../modules/handel.js';

/** Base value plus stat.mod effects, held to -2..3. */
export { statsOf };

/**
 * Layers of one people's map view: controller of every known region, threat
 * from foreign units and danger features, known roads and the trade routes of
 * the handel module (empty while it is inactive).
 */
export function mapLayers(state, env, pid) {
  const world = env.world(state.map.seed);
  const control = {};
  for (const region of knownRegions(state, world, pid)) {
    const owner = state.map.control[region];
    if (owner) control[region] = owner;
  }
  // Foreign units are seen as their type: the owner's hidden modifiers (its
  // developments and statuses) must not shape what this people learns of their reach.
  const mobility = (people, unit) => Math.max(0, specOf(env, unit).mobility ?? 1);
  const handel = activeModules(state, env, pid).find((m) => m.id === 'handel');
  return {
    control,
    threat: threatLayer(state, world, pid, mobility),
    roads: roadLayer(state, pid),
    trade: handel?.module.hooks?.derive?.(state, env, pid, { id: handel.id, bind: handel.bind })?.routes ?? [],
  };
}

/**
 * Council members as the board places them: where each stands (the target
 * tile of the order he led last season, else the home settlement), the lead
 * modifier a probe would take from him and his goal tags.
 */
export function councilView(state, pid) {
  const people = state.peoples[pid];
  const home = homeSettlement(state, pid);
  const own = settlementsOf(state, pid);
  return people.council.map((m) => {
    const tile = m.at ?? home?.tile ?? null;
    return {
      id: m.id,
      location: { tile, settlement: own.find((s) => s.tile === tile)?.id ?? null },
      strengths: { lead: (leadMods(people, m.id) ?? []).reduce((n, x) => n + x.value, 0), favor: [...m.goal.favor], oppose: [...m.goal.oppose] },
    };
  });
}

/**
 * One row per people in contact: whether a trade order would find its way
 * there, read on the people's projection as the order check reads it, so a
 * row never tells more than a refusal of the order would. reason is the issue
 * code the order would get, or null. orders: trade order types the catalogue
 * allows now.
 */
export function tradeView(state, env, pid, catalogue) {
  const orders = catalogue.filter((c) => c.origin === 'handel' && c.available).map((c) => c.type);
  const contacts = peopleIds(state).filter((o) => o !== pid && relation(state, pid, o)?.contact === true);
  if (!contacts.length) return { routes: [], orders };
  const view = projectFor(state, env, pid);
  const world = env.world(state.map.seed);
  const traders = view.modules.handel?.traders ?? [];
  const routes = contacts.map((partner) => {
    const r = tradeRoute(view, world, pid, partner);
    const reason = atWar(view, pid, partner) ? 'handel.at_war' : !traders.includes(partner) ? 'handel.not_trading' : r ? null : 'handel.no_route';
    const path = r?.path ?? [];
    return {
      partner,
      length: r ? path.length - 1 : null,
      roads: path.filter((k) => view.map.features[k]?.kind === RULES.roadKind).length,
      reachable: reason === null,
      reason,
    };
  });
  return { routes, orders };
}

/**
 * The destiny of every other people, revealed (Regelkern section 13) while
 * the peoples have contact and the rival has reached a milestone, or while a
 * reveal of scope people covers it; null otherwise.
 */
export function rivalsView(state, env, pid) {
  const revealed = kern(state.peoples[pid]).revealed ?? {};
  return peopleIds(state).filter((o) => o !== pid).map((o) => {
    const b = state.peoples[o].bestimmung;
    const def = b ? env.bestimmung(b.ref) : null;
    const contact = relation(state, pid, o)?.contact === true;
    const open = (contact && b?.milestones.some((m) => m.reached)) || (revealed[o] ?? -1) >= state.turn;
    if (!b || !def || !open) return { people: o, destiny: null };
    return {
      people: o,
      destiny: {
        ref: b.ref,
        name: def.name,
        milestones: b.milestones.map((m) => ({ id: m.id, text: def.milestones.find((x) => x.id === m.id)?.text ?? m.id, reached: m.reached })),
      },
    };
  });
}

const HIGHLIGHTS = new Set(['research.completed', 'bestimmung.reached', 'bestimmung.fulfilled', 'map.control', 'people.collapsed']);
const MAX_HIGHLIGHTS = 8;

/**
 * End of the campaign as one people sees it, null while playing. Region
 * gains are logged as map.control; highlights are the latest such entries the
 * people may see, in log order, from the chronicle the state still keeps.
 */
export function outcomeView(state, env, pid, pfade) {
  const r = state.result;
  if (!r) return null;
  const people = state.peoples[pid];
  const cal = calendarOf(env.regeln, r.turn);
  const b = people.bestimmung;
  const def = b ? env.bestimmung(b.ref) : null;
  const achievements = {};
  for (const p of pfade?.paths ?? []) achievements[p.id] = p.done;
  const highlights = projectEvents(state.chronicle ?? [], pid)
    .filter((e) => HIGHLIGHTS.has(e.kind) && (e.kind !== 'map.control' || e.change?.after === pid))
    .slice(-MAX_HIGHLIGHTS)
    .map((e) => e.id);
  return {
    kind: r.kind,
    winner: r.winner,
    won: r.winner === pid,
    turn: r.turn,
    reason: r.reason,
    summary: {
      turns: r.turn + 1,
      worldYear: cal.worldYear,
      year: cal.year,
      population: people.population.core,
      regions: controlledRegions(state, pid).length,
      settlements: settlementsOf(state, pid).length,
      achievements,
      destiny: b ? { ref: b.ref, name: def?.name ?? b.ref, reached: b.milestones.filter((m) => m.reached).length, of: b.milestones.length } : null,
      highlights,
    },
  };
}

/**
 * derived[pid] for every people. A people without a settlement or clans keeps
 * its stats, caps and capacity but no forecast, slots or catalogue. council,
 * trade, rivals and outcome are what the board shows beside the projection;
 * each is filtered here as the fog requires, because derived[pid] reaches the
 * people's projection whole.
 */
export function computeDerived(state, env) {
  const out = {};
  for (const pid of peopleIds(state)) {
    const people = state.peoples[pid];
    const standing = standingOf(state, env, pid);
    const entry = { stats: statsOf(state, env, pid, standing), caps: stockCaps(state, env, pid, standing), popCap: popCap(state, env, pid, standing) };
    let catalogue = [];
    entry.pfade = pathsView(state, env, pid);
    if (people.population.core > 0 && settlementsOf(state, pid).length) {
      const f = forecast(state, env, pid);
      const ox = orderContext(state, env, pid);
      catalogue = catalogueFor(state, env, pid, ox);
      entry.forecast = { income: f.income, net: f.net, shortfall: f.shortfall };
      entry.slots = slotCapacity(ox);
      entry.modules = ox.modules.map((m) => m.id);
      entry.catalogue = catalogue.filter((c) => c.available).map((c) => c.type);
    } else {
      entry.forecast = { income: {}, net: {}, shortfall: {} };
      entry.slots = slotCapacity(orderContext(state, env, pid));
      entry.modules = [];
      entry.catalogue = [];
    }
    entry.council = councilView(state, pid);
    entry.trade = tradeView(state, env, pid, catalogue);
    entry.rivals = rivalsView(state, env, pid);
    // Last, because the achievements per path come from entry.pfade.
    entry.outcome = outcomeView(state, env, pid, entry.pfade);
    out[pid] = entry;
  }
  return out;
}

// Values derived from a state: stats, stock caps, a forecast, order slots and
// catalogue per people (written to state.derived on every write, never an
// input to a rule), and the map layers the views draw.

import { clamp, peopleIds, settlementsOf } from './state.js';
import { statsOf } from './stats.js';
import { ofOp, standingOf } from './effects.js';
import { forecast, popCap, stockCaps } from './economy.js';
import { specOf } from './military.js';
import { knownRegions, roadLayer, threatLayer } from './map.js';
import { catalogueFor, orderContext, slotCapacity } from './orders.js';
import { pathsView } from './pfade.js';
import { activeModules } from '../modules/index.js';

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
 * derived[pid] for every people. A people without a settlement or clans keeps
 * its stats, caps and capacity but no forecast, slots or catalogue.
 */
export function computeDerived(state, env) {
  const out = {};
  for (const pid of peopleIds(state)) {
    const people = state.peoples[pid];
    const standing = standingOf(state, env, pid);
    const entry = { stats: statsOf(state, env, pid, standing), caps: stockCaps(state, env, pid, standing), popCap: popCap(state, env, pid, standing) };
    entry.pfade = pathsView(state, env, pid);
    if (people.population.core > 0 && settlementsOf(state, pid).length) {
      const f = forecast(state, env, pid);
      const ox = orderContext(state, env, pid);
      entry.forecast = { income: f.income, net: f.net, shortfall: f.shortfall };
      entry.slots = slotCapacity(ox);
      entry.modules = ox.modules.map((m) => m.id);
      entry.catalogue = catalogueFor(state, env, pid, ox).filter((c) => c.available).map((c) => c.type);
    } else {
      entry.forecast = { income: {}, net: {}, shortfall: {} };
      entry.slots = slotCapacity(orderContext(state, env, pid));
      entry.modules = [];
      entry.catalogue = [];
    }
    out[pid] = entry;
  }
  return out;
}

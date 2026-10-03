// Module registry in fixed resolution order. A module is a DOM-free,
// deterministic ES module with a default export:
//
//   {
//     id, version,
//     always?: true                      active for every people (lebensweise)
//     autoActive?(state, env, pid)       extra activation rule besides module.activate
//     resourceRoles: [{ role, defaultId }]  bound to resource ids per people
//     tags: { tag: breadth }             vocabulary the module brings
//     initPeople(state, env, pid, bind)  -> people slice (people.modules[id])
//     initGlobal?(env)                   -> global slice (state.modules[id])
//     orders: { type: OrderDef }         see engine/core/orders.js
//     hooks: {
//       resolve?(tc, pid, mx)            step 3, per people with the module active
//       global?(tc)                      step 3, once after all peoples (prices)
//       upkeep?(tc, pid, mx)             step 4, after the core economy
//       derive?(state, env, pid, mx)     -> object for derived and views
//       project?(state, env, pid, view)  -> filtered global slice for a projection
//     }
//     views: [{ id, labelKey, icon, order, scope, sections }]
//     labelKeys: [...], agentHints: { primitives: [...], tags: [...] }
//   }
//
// mx = { id, bind: { role: resourceId } }. A module reads S0 through tc.s0,
// writes only its own slices and through the log helpers, and draws randomness
// only from tc.rng.

import lebensweise from './lebensweise.js';
import handel from './handel.js';
import magie from './magie.js';
import militaer from './militaer.js';
import { standingOf, activations } from '../core/effects.js';

export const MODULES = Object.freeze([lebensweise, handel, magie, militaer]);
export const MODULE_IDS = Object.freeze(MODULES.map((m) => m.id));

export function moduleById(id) {
  return MODULES.find((m) => m.id === id) ?? null;
}

/**
 * Active modules of a people in registry order: [{ id, module, bind }]. The
 * binding is the module default, overridden by regeln.moduleBindings, overridden
 * by the bind of the activating development.
 */
export function activeModules(state, env, pid, standing = standingOf(state, env, pid)) {
  const act = activations(standing);
  const out = [];
  for (const m of MODULES) {
    const on = m.always === true || Object.hasOwn(act, m.id) || (m.autoActive ? m.autoActive(state, env, pid, standing) : false);
    if (!on) continue;
    const bind = {};
    for (const r of m.resourceRoles ?? []) if (r.defaultId) bind[r.role] = r.defaultId;
    Object.assign(bind, env.regeln.moduleBindings?.[m.id] ?? {}, act[m.id] ?? {});
    out.push({ id: m.id, module: m, bind });
  }
  return out;
}

export function isModuleActive(state, env, pid, id, standing) {
  return activeModules(state, env, pid, standing).some((m) => m.id === id);
}

/** All order definitions of all modules: { type: { def, module } }. */
export function moduleOrders() {
  const out = {};
  for (const m of MODULES) for (const [type, def] of Object.entries(m.orders ?? {})) out[type] = { def, module: m.id };
  return out;
}

/** Label keys of all modules, for the world validator (missing_label). */
export function moduleLabelKeys() {
  return MODULES.flatMap((m) => m.labelKeys ?? []);
}

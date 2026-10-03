// View descriptors and view data. selectView reads only projectFor(state, env,
// pid), so what a view shows is by construction what the fog allows.

import { MODULES, activeModules, moduleLabelKeys } from '../modules/index.js';
import { BANDS, bandLabelKey } from './probes.js';
import { catalogueFor, orderContext, registry, slotCapacity } from './orders.js';
import { forecast } from './economy.js';
import { mapLayers } from './derive.js';
import { kern, peopleIds, relation } from './state.js';
import { projectFor } from './project.js';

const CORE_VIEWS = Object.freeze([
  { id: 'karte', order: 10, icon: 'welt', scope: 'map', sections: ['karte', 'layers'] },
  { id: 'lage', order: 20, icon: 'volk', scope: 'people', sections: ['resources', 'forecast', 'slots', 'catalogue', 'assigned'] },
  { id: 'rat', order: 30, icon: 'rat', scope: 'people', sections: ['council', 'seats'] },
  { id: 'entwicklungen', order: 40, icon: 'entwicklungen', scope: 'people', sections: ['known', 'research', 'candidates', 'requests', 'tokens'] },
  { id: 'bestimmung', order: 50, icon: 'bestimmung', scope: 'people', sections: ['destiny', 'milestones', 'history', 'rivals'] },
  { id: 'voelker', order: 70, icon: 'rivalen', scope: 'world', sections: ['peoples', 'relations', 'trade'] },
  { id: 'chronik', order: 80, icon: 'chronik', scope: 'world', sections: ['entries'] },
].map((v) => Object.freeze({ ...v, labelKey: `view.${v.id}`, active: true })));

// Loyalty bands of the council (Regelkern section 7), best first.
export const LOYALTY_BANDS = Object.freeze(['ergeben', 'treu', 'schwankend', 'verstimmt', 'bruch']);

export function loyaltyBand(loyalty) {
  if (loyalty >= 4) return 'ergeben';
  if (loyalty >= 1) return 'treu';
  if (loyalty === 0) return 'schwankend';
  if (loyalty >= -3) return 'verstimmt';
  return 'bruch';
}

const describe = (v, active) => ({
  id: v.id,
  labelKey: v.labelKey ?? `view.${v.id}`,
  icon: v.icon ?? 'liste',
  order: v.order ?? 90,
  scope: v.scope ?? 'people',
  sections: [...(v.sections ?? [])],
  active,
});

/**
 * Sorted descriptors: the core views plus the views of the active modules and,
 * marked inactive, those of modules whose slice the people still holds.
 */
export function viewsFor(state, env, pid) {
  const people = state.peoples[pid];
  const active = new Set(activeModules(state, env, pid).map((m) => m.id));
  const out = CORE_VIEWS.map((v) => describe(v, true));
  for (const m of MODULES) {
    const on = active.has(m.id);
    if (!on && !people?.modules?.[m.id]) continue;
    for (const v of m.views ?? []) out.push(describe(v, on));
  }
  return out.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Every label key the core views and the kernel's vocabulary use, sorted, for the missing_label check. */
export function labelKeys() {
  const keys = new Set(CORE_VIEWS.map((v) => v.labelKey));
  for (const b of BANDS) keys.add(bandLabelKey(b));
  for (const b of LOYALTY_BANDS) keys.add(`loyalty.${b}`);
  for (const type of Object.keys(registry())) keys.add(`order.${type}`);
  for (const k of moduleLabelKeys()) keys.add(k);
  for (const m of MODULES) for (const v of m.views ?? []) keys.add(v.labelKey ?? `view.${v.id}`);
  return [...keys].sort();
}

function withEntry(env, ref, extra = {}) {
  const ent = env.entwicklung(ref);
  return { ref, name: ent?.name ?? ref, kind: ent?.kind ?? null, tier: ent?.tier ?? null, tags: ent?.tags ?? [], ...extra };
}

function karte(p, env, pid) {
  const known = p.map.known[pid] ?? {};
  const units = [];
  for (const id of peopleIds(p)) for (const u of p.peoples[id].units) units.push({ people: id, ...u });
  const visible = Object.values(known).filter((s) => s === 'visible').length;
  return {
    seed: p.map.seed,
    packId: p.map.packId,
    known,
    counts: { visible, seen: Object.keys(known).length - visible },
    control: p.map.control,
    settlements: p.map.settlements,
    units,
    features: p.map.features,
    layers: mapLayers(p, env, pid),
  };
}

function lage(p, env, pid) {
  const own = p.peoples[pid];
  const fc = forecast(p, env, pid, { assign: own.population.assigned });
  return {
    population: own.population,
    resources: own.resources,
    caps: fc.caps ?? p.derived[pid]?.caps ?? {},
    forecast: fc,
    slots: slotCapacity(orderContext(p, env, pid)),
    catalogue: catalogueFor(p, env, pid),
    assigned: own.population.assigned ?? {},
    shortfall: own.shortfall,
  };
}

function rat(p, env, pid) {
  const own = p.peoples[pid];
  const placed = new Map((p.derived[pid]?.council ?? []).map((c) => [c.id, c]));
  return {
    members: own.council.map((m) => {
      const band = loyaltyBand(m.loyalty);
      return { ...m, band, labelKey: `loyalty.${band}`, location: placed.get(m.id)?.location ?? null, strengths: placed.get(m.id)?.strengths ?? null };
    }),
    seats: kern(own).seats ?? [],
  };
}

function entwicklungen(p, env, pid) {
  const d = p.peoples[pid].developments;
  return {
    known: d.known.map((k) => withEntry(env, k.ref, { since: k.since, effectiveFrom: k.effectiveFrom, state: k.state, instituted: d.instituted.includes(k.ref) })),
    research: d.research.map((r) => withEntry(env, r.ref, { progress: r.progress })),
    candidates: d.candidates.map((c) => withEntry(env, c.ref, { offeredAt: c.offeredAt, expiresAt: c.expiresAt, origin: c.origin })),
    requests: d.requests,
    tokens: p.peoples[pid].tokens,
  };
}

function bestimmung(p, env, pid) {
  const b = p.peoples[pid].bestimmung;
  const rivals = p.derived[pid]?.rivals ?? [];
  if (!b) return { current: null, history: [], rivals };
  const def = env.bestimmung(b.ref);
  return {
    current: {
      ref: b.ref,
      name: def?.name ?? b.ref,
      summary: def?.summary ?? '',
      adoptedAt: b.adoptedAt,
      milestones: b.milestones.map((m) => ({ ...m, text: def?.milestones.find((x) => x.id === m.id)?.text ?? m.id })),
    },
    history: b.history.map((h) => ({ ...h, name: env.bestimmung(h.ref)?.name ?? h.ref })),
    rivals,
  };
}

function voelker(p, env, pid) {
  const d = p.derived[pid] ?? {};
  const destiny = new Map((d.rivals ?? []).map((r) => [r.people, r.destiny]));
  const trade = new Map((d.trade?.routes ?? []).map((r) => [r.partner, r]));
  return {
    peoples: peopleIds(p).filter((id) => id !== pid).map((id) => ({
      ...p.peoples[id], relation: relation(p, pid, id), destiny: destiny.get(id) ?? null, trade: trade.get(id) ?? null,
    })),
    relations: p.relations,
    tradeOrders: d.trade?.orders ?? [],
  };
}

const CORE_DATA = { karte, lage, rat, entwicklungen, bestimmung, voelker, chronik: (p) => ({ entries: p.chronicle }) };

/** Data of one view for a people, or null for an unknown view id. */
export function selectView(state, env, pid, viewId) {
  const p = projectFor(state, env, pid);
  if (Object.hasOwn(CORE_DATA, viewId)) return { ...CORE_DATA[viewId](p, env, pid), id: viewId };
  const mod = MODULES.find((m) => (m.views ?? []).some((v) => v.id === viewId));
  if (!mod) return null;
  const am = activeModules(p, env, pid).find((m) => m.id === mod.id);
  if (!am) return { id: viewId, active: false };
  const data = mod.hooks?.derive ? mod.hooks.derive(p, env, pid, { id: am.id, bind: am.bind }) : {};
  return { ...data, id: viewId, active: true };
}

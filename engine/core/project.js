// Fog filter: the only view of a campaign a people (and every agent working
// for it) receives. projectFor() returns a document valid against SCHEMAS.view
// that keeps the shape preview() and checkDraft() read, so the browser runs the
// same preview on the projection as the kernel runs on the full state.
//
// Left out entirely: rulesVersion, rng, eventPool, ingested. Foreign peoples
// appear in the foreignPeople shape; their stock only while a reveal of scope
// people covers the current turn. Module slices of other peoples and the
// private part of the module global slices never leave the kernel, a module
// shows its global slice only through its own hooks.project filter.

import { MODULES } from '../modules/index.js';
import { knownRegions } from './map.js';
import { kern, peopleIds, settingsOf } from './state.js';

const clone = (v) => structuredClone(v);

const visibleTile = (known, tile) => known[tile] === 'visible';

function foreignPeople(state, own, other, known) {
  const p = state.peoples[other];
  const out = {
    id: p.id,
    name: p.name,
    controller: p.controller,
    identity: clone(p.identity),
    lebensweise: p.lebensweise,
    standing: p.standing,
    units: p.units.filter((u) => visibleTile(known, u.tile)).map(clone),
  };
  // The reveal primitive stores the last turn it covers; see effects.applyReveal.
  if ((kern(own).revealed?.[other] ?? -1) >= state.turn) out.resources = clone(p.resources);
  return out;
}

/**
 * The state as people `pid` may see it. Pure: the input is never mutated and
 * the same state always gives the same document.
 */
export function projectFor(state, env, pid) {
  const own = state.peoples[pid];
  if (!own) throw new RangeError(`projectFor: unknown people ${pid}`);
  const world = env.world(state.map.seed);
  const known = state.map.known[pid] ?? {};
  const regions = new Set(knownRegions(state, world, pid));

  const control = {};
  for (const r of Object.keys(state.map.control)) if (regions.has(r)) control[r] = state.map.control[r];

  const features = {};
  for (const k of Object.keys(state.map.features)) if (Object.hasOwn(known, k)) features[k] = clone(state.map.features[k]);

  const peoples = {};
  for (const id of peopleIds(state)) peoples[id] = id === pid ? clone(own) : foreignPeople(state, own, id, known);

  const relations = {};
  for (const [k, v] of Object.entries(state.relations)) if (k.split('|').includes(pid)) relations[k] = clone(v);

  const view = {
    format: 'realmcraft-view',
    version: 1,
    people: pid,
    campaign: clone(state.campaign),
    rev: state.rev,
    turn: state.turn,
    phase: state.phase,
    status: state.status,
    result: state.result == null ? null : clone(state.result),
    map: {
      seed: state.map.seed,
      packId: state.map.packId,
      control,
      settlements: state.map.settlements.filter((s) => s.people === pid || visibleTile(known, s.tile)).map(clone),
      known: { [pid]: clone(known) },
      features,
    },
    peoples,
    relations,
    modules: {},
    eventDraws: state.eventDraws?.[pid] ? { [pid]: clone(state.eventDraws[pid]) } : {},
    pendingChoices: (state.pendingChoices ?? []).filter((c) => c.people === pid).map(clone),
    chronicle: projectEvents(state.chronicle ?? [], pid),
    settings: settingsOf(state),
    derived: state.derived?.[pid] ? { [pid]: clone(state.derived[pid]) } : {},
  };
  // Module hooks see the projection built so far, never the full state's other peoples.
  for (const m of MODULES) {
    if (!m.hooks?.project || !Object.hasOwn(state.modules, m.id)) continue;
    const slice = m.hooks.project(state, env, pid, view);
    if (slice != null) view.modules[m.id] = clone(slice);
  }
  return view;
}

/** Log entries (state.chronicle or a turn's events) a people may see. */
export function projectEvents(events, pid) {
  return events.filter((e) => Array.isArray(e.visibleTo) && (e.visibleTo.includes(pid) || e.visibleTo.includes('all'))).map(clone);
}

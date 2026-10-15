// Concrete planning choices from the player's projection. Targets never add
// map knowledge; the kernel previews availability, slot, cost and refusal.

import { regionOf, parseKey } from '../../../engine/world/index.js';
import { adoptCandidates, candidates, disciplineCandidates } from './options.js';

function planningTargets(game, model) {
  const { view, world } = game;
  const pid = view.people;
  const known = model.known;
  const targets = Object.keys(known).map((tile) => ({ kind: 'tile', ...parseKey(tile) }));
  const regions = new Set(targets.map(({ q, r }) => regionOf(world, q, r)));
  const visible = (tile) => known[tile] === 'visible';
  for (const settlement of view.map.settlements) {
    if (settlement.people === pid || visible(settlement.tile)) targets.push({ kind: 'place', id: settlement.id, ...parseKey(settlement.tile) });
  }
  for (const [id, people] of Object.entries(view.peoples)) {
    for (const unit of people.units ?? []) {
      if (id === pid || visible(unit.tile)) targets.push({ kind: 'unit', id: unit.id, ...parseKey(unit.tile) });
    }
    if (id !== pid) targets.push({ kind: 'people', id });
  }
  for (const [tile, feature] of Object.entries(view.map.features ?? {})) {
    if (Object.hasOwn(known, tile)) targets.push({ kind: 'place', id: feature.id, ...parseKey(tile) });
  }
  for (const id of regions) targets.push({ kind: 'region', id });
  return targets;
}

/** Main or minor choices, including queued choices and kernel refusals. */
export function collectPlanningOptions(game, model, art) {
  if (art !== 'haupt' && art !== 'neben') return [];
  const slot = art === 'haupt' ? 'main' : 'minor';
  const available = new Set((game.base.catalogue ?? [])
    .filter((c) => c.available && (c.slot === slot || c.slot === 'varies'))
    .map((c) => c.type));
  const { view, env } = game;
  const global = [
    ...adoptCandidates(view, env),
    ...disciplineCandidates(view, env, 'none'),
    ...view.peoples[view.people].council.flatMap((member) => disciplineCandidates(view, env, 'member', member.id)),
  ];
  const all = [...global, ...planningTargets(game, model).flatMap((target) => candidates(view, env, target))];
  const unique = new Map();
  for (const candidate of all) {
    if (!available.has(candidate.type) || candidate.type.startsWith('research.')) continue;
    unique.set(JSON.stringify([candidate.type, candidate.params]), candidate);
  }
  return [...unique.values()].map((candidate) => game.previewOption(candidate)).filter((opt) => opt.art === art);
}

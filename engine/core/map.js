// Kernel view of the hex map: road-aware step costs, routes, reach, sight and
// the derived map layers (control, threat, trade) the frontend draws.
//
// Step costs are integers in half steps (RULES): terrain moveCost x 2; a tile
// carrying a road feature (kind RULES.roadKind) costs 2 less per road level,
// never below 1. Impassable terrain stays impassable with or without road.

import { findPath, reachable, reveal, fade, parseKey, key, moveCost, tileAt, regionOf } from '../world/index.js';
import { RULES } from './rules.js';
import { peopleIds, atWar, settlementsOf } from './state.js';

/** Road level of a feature: 0 without road, else 1 + tags "stufe-<n>" (max RULES.maxRoadLevel). */
export function roadLevel(feature) {
  if (!feature || feature.kind !== RULES.roadKind) return 0;
  let level = 1;
  for (const t of feature.tags ?? []) {
    const m = /^stufe-([1-9])$/.exec(t);
    if (m) level = Math.max(level, Number(m[1]));
  }
  return Math.min(level, RULES.maxRoadLevel);
}

/** Half-step cost of entering a tile, or Infinity when impassable. */
export function stepCost(state, world, tile) {
  const base = moveCost(world.pack, tile.terrain);
  if (!Number.isFinite(base)) return Infinity;
  const road = roadLevel(state.map.features[key(tile.q, tile.r)]);
  return Math.max(1, base * 2 - 2 * road);
}

/**
 * costOf for engine/world path functions. blocked(tile, regionId) -> true makes
 * a tile impassable (enemy regions for trade routes, unknown tiles).
 */
export function costFn(state, world, { blocked } = {}) {
  return (tile) => {
    if (blocked && blocked(tile, tile.regionId ?? regionOf(world, tile.q, tile.r))) return Infinity;
    return stepCost(state, world, tile);
  };
}

/** Cheapest road-aware path between tile keys: { path: [keys], cost } or null. */
export function route(state, world, fromKey, toKey, { blocked, maxRadius = 32 } = {}) {
  const res = findPath(world, parseKey(fromKey), parseKey(toKey), { costOf: costFn(state, world, { blocked }), maxRadius, minCost: 1 });
  return res ? { path: res.path.map((h) => key(h.q, h.r)), cost: res.cost } : null;
}

/** Tiles reachable within `budget` half steps: { key: cost }. */
export function reach(state, world, fromKey, budget, { blocked, maxRadius = 16 } = {}) {
  return reachable(world, parseKey(fromKey), budget, { costOf: costFn(state, world, { blocked }), maxRadius });
}

/** Movement budget of a unit in half steps. */
export function moveBudget(mobility) {
  return Math.max(0, mobility) * RULES.movePointsPerMobility * 2;
}

/** Region id of a tile key. */
export function regionAt(world, tileKey) {
  const { q, r } = parseKey(tileKey);
  return regionOf(world, q, r);
}

export function tileOf(world, tileKey) {
  const { q, r } = parseKey(tileKey);
  return tileAt(world, q, r);
}

/**
 * New known map of a people after a season: everything fades to 'seen', then
 * settlements and units reveal their sight radius. extra: { [tileKey]: radius }
 * for one-off reveals already applied elsewhere is not needed; reveal() keeps
 * existing entries.
 */
export function visionUpdate(state, world, pid, sightBonus = 0) {
  let known = fade(state.map.known[pid] ?? {});
  for (const s of settlementsOf(state, pid)) {
    known = reveal(known, parseKey(s.tile), RULES.settlementSight + sightBonus, world);
  }
  for (const u of state.peoples[pid]?.units ?? []) {
    known = reveal(known, parseKey(u.tile), RULES.unitSight + sightBonus, world);
  }
  return known;
}

/** Region ids of all tiles a people knows, sorted. */
export function knownRegions(state, world, pid) {
  const out = new Set();
  for (const k of Object.keys(state.map.known[pid] ?? {})) out.add(regionAt(world, k));
  return [...out].sort();
}

/**
 * Threat layer for one people: foreign units on tiles it currently sees, the
 * tiles they can reach within one season, and known features tagged as danger.
 * Returns { tiles: { key: level }, sources: [...] }; level 2 = a unit stands
 * there or a danger feature, 1 = reachable by a foreign unit this season.
 * unitMobility(people, unit) gives a unit's mobility (military knows the types).
 */
export function threatLayer(state, world, pid, unitMobility) {
  const known = state.map.known[pid] ?? {};
  const tiles = {};
  const sources = [];
  const mark = (k, level) => {
    if (Object.hasOwn(known, k) && (tiles[k] ?? 0) < level) tiles[k] = level;
  };
  for (const other of peopleIds(state)) {
    if (other === pid) continue;
    for (const u of state.peoples[other]?.units ?? []) {
      if (known[u.tile] !== 'visible') continue;
      const hostile = atWar(state, pid, other);
      sources.push({ kind: 'unit', people: other, unit: u.id, tile: u.tile, hostile });
      mark(u.tile, 2);
      const mob = unitMobility ? unitMobility(other, u) : 1;
      for (const k of Object.keys(reach(state, world, u.tile, moveBudget(mob)))) mark(k, 1);
    }
  }
  for (const [k, f] of Object.entries(state.map.features)) {
    if (!Object.hasOwn(known, k)) continue;
    if ((f.tags ?? []).includes(RULES.dangerTag)) {
      sources.push({ kind: 'feature', feature: f.id, tile: k });
      mark(k, 2);
    }
  }
  return { tiles, sources };
}

/** Road tiles a people knows: [{ tile, level }]. */
export function roadLayer(state, pid) {
  const known = state.map.known[pid] ?? {};
  return Object.entries(state.map.features)
    .filter(([k, f]) => Object.hasOwn(known, k) && roadLevel(f) > 0)
    .map(([k, f]) => ({ tile: k, level: roadLevel(f) }))
    .sort((a, b) => (a.tile < b.tile ? -1 : a.tile > b.tile ? 1 : 0));
}

// Start positions. The criteria come from the pack's `start` block; the search
// walks a spiral from the origin (or an anchor), so the first match is both
// deterministic and the nearest one.

import { spiral, neighbors, distance } from './hex.js';
import { hashSeed, makeRng } from './rng.js';
import { tileAt } from './generate.js';
import { seedContext } from './terrain.js';

function startRules(world) {
  const s = world.pack.start;
  if (!s) throw new Error(`world pack "${world.packId}" has no start block`);
  return s;
}

function waterNear(world, centre, radius, waterTerrains) {
  return spiral(centre, radius).some((h) => {
    const t = tileAt(world, h.q, h.r);
    return t.river || waterTerrains.includes(t.terrain);
  });
}

function depositsNear(world, centre, radius) {
  let n = 0;
  for (const h of spiral(centre, radius)) n += tileAt(world, h.q, h.r).resources.length;
  return n;
}

/**
 * Start tile of the player's people: a tile of one of the pack's start
 * terrains next to one of its adjacentTerrains, with a river or a
 * waterTerrains tile within waterRadius and at least minResources deposits
 * within resourceRadius. Returns the tile, or null when nothing within the
 * pack's searchRadius qualifies.
 */
export function findStart(world, { minResources, origin = { q: 0, r: 0 }, searchRadius } = {}) {
  const s = startRules(world);
  const need = minResources ?? s.minResources ?? 0;
  for (const h of spiral(origin, searchRadius ?? s.searchRadius)) {
    const t = tileAt(world, h.q, h.r);
    if (!s.terrains.includes(t.terrain)) continue;
    if (!neighbors(h.q, h.r).some((n) => s.adjacentTerrains.includes(tileAt(world, n.q, n.r).terrain))) continue;
    if (!waterNear(world, h, s.waterRadius, s.waterTerrains)) continue;
    if (depositsNear(world, h, s.resourceRadius) < need) continue;
    return t;
  }
  return null;
}

/**
 * Start tiles for `count` AI peoples, each at least `minDistance` from the
 * anchor (default: the player's start) and from one another, on settleable
 * terrain with water nearby. A per-tile random gate scatters them around the
 * anchor instead of lining them up along the first ring. May return fewer
 * than `count` tiles when the search radius runs out.
 */
export function placePeoples(world, count, minDistance, { anchor, maxRadius } = {}) {
  const s = startRules(world);
  const centre = anchor ?? findStart(world) ?? { q: 0, r: 0 };
  const radius = maxRadius ?? minDistance * (count + 2);
  const base = seedContext(world.seed, world.pack).base;
  const chosen = [];
  const taken = [centre];
  for (const h of spiral(centre, radius)) {
    if (chosen.length >= count) break;
    if (taken.some((p) => distance(p, h) < minDistance)) continue;
    if (makeRng(hashSeed(base, 'people', h.q, h.r)).next() >= 0.25) continue;
    const t = tileAt(world, h.q, h.r);
    if (!s.peopleTerrains.includes(t.terrain)) continue;
    if (!waterNear(world, h, s.waterRadius, s.waterTerrains)) continue;
    chosen.push(t);
    taken.push(h);
  }
  return chosen;
}


// Regions are Voronoi cells (hex distance) around seed points, with one to a
// few seed points per chunk. Every chunk owns at least one seed, and a tile is
// at most 2*(size-1) steps from any tile of its own chunk, whereas any seed
// three or more chunks away is at least 2*size+1 steps off. Scanning the 5x5
// chunk window around a tile therefore finds the globally nearest seed, which
// makes region ids exact and independent of generation order.

import { key, distance } from './hex.js';
import { hashSeed, makeRng } from './rng.js';
import { terrainAt, seedContext } from './terrain.js';

const WINDOW = 2;

function chunkSizeOf(pack) {
  return pack.generation.chunkSize;
}

export function regionId(cq, cr, i) {
  return `${cq}:${cr}:${i}`;
}

function parseRegionId(id) {
  const parts = String(id).split(':').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n))) return null;
  return { cq: parts[0], cr: parts[1], i: parts[2] };
}

/** Seed points of one chunk: [{ id, q, r }], cached per seed context. */
export function chunkSeeds(ctx, cq, cr, size) {
  const k = key(cq, cr);
  let seeds = ctx.regionSeeds.get(k);
  if (seeds) return seeds;
  const [min, max] = ctx.c.gen.regions?.seedsPerChunk ?? [1, 1];
  const rng = makeRng(hashSeed(ctx.base, 'region-seeds', cq, cr));
  const n = Math.max(1, rng.int(min, max));
  seeds = [];
  for (let i = 0; i < n; i++) {
    let q;
    let r;
    // Two seeds on one tile would leave the later region empty; redraw, bounded.
    for (let tries = 0; tries < 8; tries++) {
      q = cq * size + rng.int(0, size - 1);
      r = cr * size + rng.int(0, size - 1);
      if (!seeds.some((s) => s.q === q && s.r === r)) break;
    }
    seeds.push({ id: regionId(cq, cr, i), q, r });
  }
  ctx.regionSeeds.set(k, seeds);
  return seeds;
}

/**
 * Candidate seeds for every tile of chunk (cq, cr), ascending in (cq, cr, i).
 * That fixed global order is the tie-break, so equidistant tiles resolve the
 * same way whichever chunk they are evaluated from.
 */
export function candidateSeeds(ctx, cq, cr, size) {
  const out = [];
  for (let a = cq - WINDOW; a <= cq + WINDOW; a++) {
    for (let b = cr - WINDOW; b <= cr + WINDOW; b++) out.push(...chunkSeeds(ctx, a, b, size));
  }
  return out;
}

export function nearestSeed(candidates, q, r) {
  let best = null;
  let bestD = Infinity;
  const p = { q, r };
  for (const s of candidates) {
    const d = distance(p, s);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Pure region id of a tile, without touching any world object. */
export function regionIdAt(seed, pack, q, r) {
  const size = chunkSizeOf(pack);
  const ctx = seedContext(seed, pack);
  return nearestSeed(candidateSeeds(ctx, Math.floor(q / size), Math.floor(r / size), size), q, r).id;
}

/** Stable name per region id, drawn from the pack's name lists. */
export function regionName(seed, pack, id) {
  const ctx = seedContext(seed, pack);
  const { prefixes = ['Land'], suffixes = [''] } = pack.names ?? {};
  const rng = makeRng(hashSeed(ctx.base, 'region-name', id));
  const prefix = rng.pick(prefixes);
  let suffix = rng.pick(suffixes);
  // Rerolls avoid doubled stems such as "Moosmoos"; bounded so a tiny list cannot loop.
  for (let tries = 0; tries < 4 && prefix.toLowerCase().endsWith(suffix) && suffix; tries++) suffix = rng.pick(suffixes);
  return prefix + suffix;
}

/** Light summary stored in world.regions when a region is first touched. */
export function regionSummary(seed, pack, id) {
  const p = parseRegionId(id);
  if (!p) return null;
  const size = chunkSizeOf(pack);
  const s = chunkSeeds(seedContext(seed, pack), p.cq, p.cr, size)[p.i];
  if (!s) return null;
  return { id, name: regionName(seed, pack, id), centre: { q: s.q, r: s.r } };
}

// Full membership of a region: only the 5x5 chunk window around its seed can
// hold member tiles (see the header), so the scan is bounded and pure.
function regionDetails(seed, pack, id) {
  const ctx = seedContext(seed, pack);
  let d = ctx.regionDetails.get(id);
  if (d) return d;
  const p = parseRegionId(id);
  const size = chunkSizeOf(pack);
  const members = [];
  for (let a = p.cq - WINDOW; a <= p.cq + WINDOW; a++) {
    for (let b = p.cr - WINDOW; b <= p.cr + WINDOW; b++) {
      const cands = candidateSeeds(ctx, a, b, size);
      if (!cands.some((s) => s.id === id)) continue;
      for (let q = a * size; q < (a + 1) * size; q++) {
        for (let r = b * size; r < (b + 1) * size; r++) {
          if (nearestSeed(cands, q, r).id === id) members.push({ q, r });
        }
      }
    }
  }
  const counts = new Map();
  for (const m of members) {
    const t = terrainAt(seed, pack, m.q, m.r).terrain;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  // Ties go to the terrain listed first in the pack, keeping the result stable.
  let dominantTerrain = null;
  let best = -1;
  for (const t of ctx.c.terrainOrder) {
    const n = counts.get(t) ?? 0;
    if (n > best) {
      best = n;
      dominantTerrain = t;
    }
  }
  d = { members, dominantTerrain };
  ctx.regionDetails.set(id, d);
  return d;
}

export function regionOf(world, q, r) {
  const stored = world.tiles[key(q, r)];
  if (stored) return stored.regionId;
  return regionIdAt(world.seed, world.pack, q, r);
}

/**
 * { id, name, centre, tiles, dominantTerrain } or null for an unknown id.
 * `tiles` lists keys of member tiles in already generated chunks only;
 * `dominantTerrain` is computed over the whole region, so it does not change
 * as the map is explored.
 */
export function regionInfo(world, id) {
  const summary = (Object.hasOwn(world.regions, id) && world.regions[id]) || regionSummary(world.seed, world.pack, id);
  if (!summary) return null;
  const { members, dominantTerrain } = regionDetails(world.seed, world.pack, id);
  const size = world.chunkSize;
  const tiles = members
    .filter((m) => world.chunks[key(Math.floor(m.q / size), Math.floor(m.r / size))])
    .map((m) => key(m.q, m.r));
  return { id, name: summary.name, centre: { ...summary.centre }, tiles, dominantTerrain };
}

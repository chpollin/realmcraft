// World state and lazy chunk generation. The world is a plain JSON object; all
// generated content is a pure function of (seed, pack, q, r), so chunks can be
// generated in any order and a stored world can be regenerated or extended
// after a JSON round trip.

import { key } from './hex.js';
import { compilePack } from './pack.js';
import { terrainAt, seedContext } from './terrain.js';
import { candidateSeeds, nearestSeed, regionSummary } from './regions.js';

export { terrainAt };

export function chunkOf(q, r, chunkSize) {
  return { cq: Math.floor(q / chunkSize), cr: Math.floor(r / chunkSize) };
}

/**
 * The pack travels inside the world: the generation rules a world was made
 * with must stay with it, or a later pack edit would change tiles not yet
 * generated and break determinism for existing savegames.
 */
export function createWorld({ seed, pack }) {
  if (typeof seed !== 'number' && typeof seed !== 'string') throw new TypeError('createWorld: seed must be a number or string');
  compilePack(pack);
  return {
    seed,
    packId: pack.id,
    chunkSize: pack.generation.chunkSize,
    chunks: {},
    tiles: {},
    regions: {},
    pack,
  };
}

function chunkKeys(cq, cr, size) {
  const out = [];
  for (let q = cq * size; q < (cq + 1) * size; q++) {
    for (let r = cr * size; r < (cr + 1) * size; r++) out.push(key(q, r));
  }
  return out;
}

/** Generates all tiles of a chunk once (idempotent); returns its tile keys. */
export function ensureChunk(world, cq, cr) {
  const size = world.chunkSize;
  const ck = key(cq, cr);
  if (world.chunks[ck]) return chunkKeys(cq, cr, size);
  const { seed, pack } = world;
  const candidates = candidateSeeds(seedContext(seed, pack), cq, cr, size);
  const keys = [];
  for (let q = cq * size; q < (cq + 1) * size; q++) {
    for (let r = cr * size; r < (cr + 1) * size; r++) {
      const tile = terrainAt(seed, pack, q, r);
      tile.regionId = nearestSeed(candidates, q, r).id;
      const k = key(q, r);
      world.tiles[k] = tile;
      keys.push(k);
      if (!world.regions[tile.regionId]) world.regions[tile.regionId] = regionSummary(seed, pack, tile.regionId);
    }
  }
  world.chunks[ck] = true;
  return keys;
}

/** Tile at (q, r), generating its chunk on demand. */
export function tileAt(world, q, r) {
  const k = key(q, r);
  const stored = world.tiles[k];
  if (stored) return stored;
  const { cq, cr } = chunkOf(q, r, world.chunkSize);
  ensureChunk(world, cq, cr);
  return world.tiles[k];
}

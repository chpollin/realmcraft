/**
 * World generator for the hex strategy game. Plain ES modules, no
 * dependencies, identical results in Node (>= 21) and the browser.
 *
 * Determinism: every tile is a pure function of (seed, pack, q, r). Chunks
 * may be generated in any order, and no Math.random or Date is involved.
 *
 * Coordinates are axial {q, r}, pointy-top. Tile keys are "q,r". Chunks are
 * axial parallelograms of pack.generation.chunkSize tiles per side; chunk keys
 * in world.chunks are "cq,cr". Region ids are "cq:cr:i" (seed point i of
 * chunk cq,cr).
 *
 * World object (JSON-serialisable, survives JSON.stringify/parse):
 *   { seed, packId, chunkSize, chunks: { "cq,cr": true },
 *     tiles: { "q,r": Tile }, regions: { id: { id, name, centre } }, pack }
 * `pack` is the parsed welten/<id>/welt.json the world was created with; it
 * travels inside the world so that a later pack edit cannot alter tiles of an
 * existing campaign that are generated afterwards.
 *
 * Tile: { q, r, terrain, elevation, moisture, temperature, river,
 *         resources: [{ key, amount }], regionId }
 * elevation, moisture and temperature lie in [-1, 1], rounded to 3 decimals.
 *
 * hex.js
 *   key(q, r) -> "q,r"; parseKey(k) -> {q, r}; neighbors(q, r) -> 6 {q, r};
 *   distance(a, b); ring(center, radius); spiral(center, radius) (centre
 *   first, then ring by ring); line(a, b); hexRound(fq, fr);
 *   hexToPixel(q, r, size) -> {x, y}; pixelToHex(x, y, size) -> {q, r};
 *   hexCorners(x, y, size) -> 6 {x, y}, corner 0 upper right, clockwise;
 *   DIRECTIONS.
 * rng.js
 *   hashSeed(...parts) -> uint32; makeRng(seed) -> { next() in [0, 1),
 *   int(min, max) inclusive, pick(arr), state() }. makeRng(rng.state())
 *   continues the sequence exactly.
 * noise.js
 *   makeNoise(seed) -> (x, y) -> [-1, 1]; fbm(noise, x, y, octaves,
 *   lacunarity, gain) -> [-1, 1].
 * generate.js
 *   createWorld({ seed, pack }); ensureChunk(world, cq, cr) -> tile keys
 *   (idempotent, mutates world); tileAt(world, q, r) -> Tile (generates its
 *   chunk on demand); terrainAt(seed, pack, q, r) -> Tile without regionId
 *   (pure, stores nothing); chunkOf(q, r, chunkSize) -> {cq, cr}.
 * regions.js
 *   regionOf(world, q, r) -> region id (pure, generates nothing);
 *   regionInfo(world, id) -> { id, name, centre, tiles, dominantTerrain } or
 *   null. tiles lists member tile keys in generated chunks only;
 *   dominantTerrain covers the whole region and is stable. regionIdAt(seed,
 *   pack, q, r) and regionName(seed, pack, id) are the pure cores.
 * vision.js
 *   reveal(known, centre, radius, world?) -> NEW known object (input not
 *   mutated); known is { "q,r": 'visible' | 'seen' }. With world, terrain
 *   modifies sight (sightModifier of the observer's tile, blocksSight of
 *   tiles in between). fade(known) -> new object with all entries 'seen'.
 *   isKnown(known, q, r) -> boolean.
 * path.js
 *   findPath(world, from, to, { costOf, maxRadius = 64, minCost }) ->
 *   { path: [{q, r}] with both ends, cost } or null. reachable(world, from,
 *   maxCost, { costOf, maxRadius = 64 }) -> { "q,r": cost }. Cost is paid on
 *   entering a tile; costOf(tile, world) returning Infinity, null or NaN
 *   marks it impassable; the default uses the pack's terrain moveCost.
 * start.js
 *   findStart(world, { minResources, origin, searchRadius }) -> Tile or null;
 *   placePeoples(world, count, minDistance, { anchor, maxRadius }) -> Tile[]
 *   (possibly fewer than count).
 * pack.js
 *   compilePack(pack); terrainDef(pack, id) -> terrain entry of the pack;
 *   moveCost(pack, id) -> number or Infinity.
 *
 * Functions that read tiles through tileAt (vision with world, path, start)
 * generate the chunks they touch and so extend world.tiles.
 */

export { DIRECTIONS, key, parseKey, neighbors, distance, ring, spiral, line, hexRound, hexToPixel, pixelToHex, hexCorners } from './hex.js';
export { hashSeed, makeRng } from './rng.js';
export { makeNoise, fbm } from './noise.js';
export { createWorld, ensureChunk, tileAt, terrainAt, chunkOf } from './generate.js';
export { regionOf, regionInfo, regionIdAt, regionName } from './regions.js';
export { reveal, fade, isKnown } from './vision.js';
export { findPath, reachable } from './path.js';
export { findStart, placePeoples } from './start.js';
export { compilePack, terrainDef, moveCost } from './pack.js';

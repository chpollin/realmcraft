import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createWorld, ensureChunk, tileAt, terrainAt, chunkOf, key, distance,
  regionOf, regionInfo, regionIdAt, regionName,
} from '../../engine/world/index.js';
import { chunkSeeds } from '../../engine/world/regions.js';
import { seedContext } from '../../engine/world/terrain.js';

const pack = JSON.parse(readFileSync(new URL('../../welten/hochland/welt.json', import.meta.url), 'utf8'));
const terrainIds = new Set(pack.terrains.map((t) => t.id));
const resourceDefs = new Map(pack.resources.map((r) => [r.key, r]));

function chunksAround(radius) {
  const out = [];
  for (let a = -radius; a <= radius; a++) for (let b = -radius; b <= radius; b++) out.push([a, b]);
  return out;
}

// Deterministic shuffle so the "other order" is reproducible.
function permuted(list, salt) {
  return list
    .map((v, i) => ({ v, w: (Math.imul(i + 1, 2654435761) ^ salt) >>> 0 }))
    .sort((x, y) => x.w - y.w)
    .map((x) => x.v);
}

test('world: createWorld returns a plain JSON-serialisable world', () => {
  const w = createWorld({ seed: 42, pack });
  assert.equal(w.seed, 42);
  assert.equal(w.packId, 'hochland');
  assert.equal(w.chunkSize, pack.generation.chunkSize);
  assert.deepEqual(w.chunks, {});
  assert.deepEqual(w.tiles, {});
  assert.deepEqual(w.regions, {});
  assert.deepEqual(JSON.parse(JSON.stringify(w)), w);
  assert.throws(() => createWorld({ seed: {}, pack }), TypeError);
});

test('world: chunkOf floors negative coordinates', () => {
  assert.deepEqual(chunkOf(0, 0, 16), { cq: 0, cr: 0 });
  assert.deepEqual(chunkOf(15, 16, 16), { cq: 0, cr: 1 });
  assert.deepEqual(chunkOf(-1, -16, 16), { cq: -1, cr: -1 });
  assert.deepEqual(chunkOf(-17, 31, 16), { cq: -2, cr: 1 });
});

test('world: tiles have the documented shape and valid values', () => {
  const w = createWorld({ seed: 'shape', pack });
  const keys = ensureChunk(w, 0, 0).concat(ensureChunk(w, -1, 1));
  assert.equal(keys.length, 2 * w.chunkSize * w.chunkSize);
  for (const k of keys) {
    const t = w.tiles[k];
    assert.equal(key(t.q, t.r), k);
    assert.ok(terrainIds.has(t.terrain), t.terrain);
    for (const f of ['elevation', 'moisture', 'temperature']) assert.ok(t[f] >= -1 && t[f] <= 1, `${f} ${t[f]}`);
    assert.equal(typeof t.river, 'boolean');
    assert.equal(typeof t.regionId, 'string');
    for (const res of t.resources) {
      const def = resourceDefs.get(res.key);
      assert.ok(def, res.key);
      assert.ok(def.terrains.includes(t.terrain) || (def.river && t.river), `${res.key} on ${t.terrain}`);
      assert.ok(res.amount >= def.amount[0] && res.amount <= def.amount[1]);
    }
  }
});

test('world: same seed gives identical tiles, a different seed does not', () => {
  const a = createWorld({ seed: 1234, pack });
  const b = createWorld({ seed: 1234, pack });
  const c = createWorld({ seed: 1235, pack });
  for (const [cq, cr] of chunksAround(1)) {
    ensureChunk(a, cq, cr);
    ensureChunk(b, cq, cr);
    ensureChunk(c, cq, cr);
  }
  assert.deepEqual(a.tiles, b.tiles);
  assert.deepEqual(a.regions, b.regions);
  const differing = Object.keys(a.tiles).filter((k) => a.tiles[k].terrain !== c.tiles[k].terrain);
  assert.ok(differing.length > 0);
});

test('world: generation order does not change tiles, region ids or regions', () => {
  const chunks = chunksAround(2);
  const a = createWorld({ seed: 'order', pack });
  for (const [cq, cr] of chunks) ensureChunk(a, cq, cr);
  const b = createWorld({ seed: 'order', pack });
  for (const [cq, cr] of permuted(chunks, 0x5bd1e995)) ensureChunk(b, cq, cr);
  // A third world fills the same area tile by tile from scattered positions.
  const c = createWorld({ seed: 'order', pack });
  for (const k of permuted(Object.keys(a.tiles), 0x1b873593)) {
    const [q, r] = k.split(',').map(Number);
    tileAt(c, q, r);
  }
  assert.deepEqual(b.tiles, a.tiles);
  assert.deepEqual(c.tiles, a.tiles);
  assert.deepEqual(b.regions, a.regions);
  assert.deepEqual(c.regions, a.regions);
});

test('world: stored tiles equal the pure core terrainAt and regionIdAt', () => {
  const w = createWorld({ seed: 77, pack });
  for (const k of ensureChunk(w, 2, -3)) {
    const t = w.tiles[k];
    const { regionId, ...rest } = t;
    assert.deepEqual(terrainAt(77, pack, t.q, t.r), rest);
    assert.equal(regionIdAt(77, pack, t.q, t.r), regionId);
    assert.equal(regionOf(w, t.q, t.r), regionId);
  }
});

test('world: ensureChunk is idempotent', () => {
  const w = createWorld({ seed: 5, pack });
  const first = ensureChunk(w, 1, 1);
  const tileRef = w.tiles[first[0]];
  const snapshot = JSON.stringify(w);
  const second = ensureChunk(w, 1, 1);
  assert.deepEqual(second, first);
  assert.equal(w.tiles[first[0]], tileRef);
  assert.equal(JSON.stringify(w), snapshot);
  assert.equal(tileAt(w, tileRef.q, tileRef.r), tileRef);
});

test('world: JSON round trip keeps the world working and consistent', () => {
  const original = createWorld({ seed: 'roundtrip', pack });
  ensureChunk(original, 0, 0);
  const revived = JSON.parse(JSON.stringify(original));
  assert.deepEqual(revived.tiles, original.tiles);
  // New chunks generated after the round trip match those of the original world.
  const fresh = ensureChunk(revived, 3, -2);
  ensureChunk(original, 3, -2);
  for (const k of fresh) assert.deepEqual(revived.tiles[k], original.tiles[k]);
  const t = tileAt(revived, 0, 0);
  const info = regionInfo(revived, t.regionId);
  assert.equal(info.name, regionInfo(original, t.regionId).name);
  assert.ok(info.tiles.includes('0,0'));
});

test('regions: region ids are the globally nearest seed point (exact Voronoi)', () => {
  const seed = 'voronoi';
  const ctx = seedContext(seed, pack);
  const size = pack.generation.chunkSize;
  // Brute force over a 9x9 chunk window, wider than the 5x5 window the engine scans.
  const all = [];
  for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) all.push(...chunkSeeds(ctx, a, b, size));
  for (let q = -2 * size; q < 2 * size; q += 3) {
    for (let r = -2 * size; r < 2 * size; r += 5) {
      let best = null;
      let bestD = Infinity;
      for (const s of all) {
        const d = distance({ q, r }, s);
        // Same tie-break as the engine: ascending (cq, cr, i).
        const [scq, scr, si] = s.id.split(':').map(Number);
        const [bcq, bcr, bi] = best ? best.id.split(':').map(Number) : [];
        const earlier = !best || scq < bcq || (scq === bcq && (scr < bcr || (scr === bcr && si < bi)));
        if (d < bestD || (d === bestD && earlier)) {
          bestD = d;
          best = s;
        }
      }
      assert.equal(regionIdAt(seed, pack, q, r), best.id, `tile ${q},${r}`);
    }
  }
});

test('regions: regionInfo has a stable name, its own centre, and a stable dominant terrain', () => {
  const w = createWorld({ seed: 31, pack });
  ensureChunk(w, 0, 0);
  const id = tileAt(w, 4, 4).regionId;
  const info = regionInfo(w, id);
  assert.equal(info.id, id);
  assert.equal(typeof info.name, 'string');
  assert.ok(info.name.length > 2);
  assert.equal(info.name, regionName(31, pack, id));
  assert.equal(info.name, w.regions[id].name);
  assert.equal(regionOf(w, info.centre.q, info.centre.r), id);
  assert.ok(terrainIds.has(info.dominantTerrain));
  for (const k of info.tiles) assert.equal(w.tiles[k].regionId, id);
  const before = info.tiles.length;
  for (const [cq, cr] of chunksAround(2)) ensureChunk(w, cq, cr);
  const after = regionInfo(w, id);
  assert.ok(after.tiles.length >= before);
  assert.equal(after.dominantTerrain, info.dominantTerrain);
  // With the full 5x5 window generated, tiles covers every member tile.
  const members = Object.values(w.tiles).filter((t) => t.regionId === id).map((t) => key(t.q, t.r)).sort();
  assert.deepEqual([...after.tiles].sort(), members);
  assert.equal(regionInfo(w, 'nonsense'), null);
});

test('world: performance smoke for a 7x7 chunk area', (t) => {
  const w = createWorld({ seed: 'perf', pack });
  const start = performance.now();
  for (const [cq, cr] of chunksAround(3)) ensureChunk(w, cq, cr);
  const ms = performance.now() - start;
  const tiles = Object.keys(w.tiles).length;
  t.diagnostic(`7x7 chunks, ${tiles} tiles generated in ${ms.toFixed(1)} ms`);
  assert.equal(tiles, 49 * w.chunkSize * w.chunkSize);
  // Loose ceiling: catches an accidental complexity blow-up, not a micro-regression.
  assert.ok(ms < 5000, `${ms} ms`);
});

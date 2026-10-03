// The pure core of the generator: a tile's fields and terrain depend only on
// (seed, pack, q, r). Nothing here reads or writes a world object.

import { hexToPixel } from './hex.js';
import { hashSeed, makeRng } from './rng.js';
import { makeNoise, fbm } from './noise.js';
import { seedCache } from './pack.js';

export function seedContext(seed, pack) {
  return seedCache(pack, seed, (c) => {
    const base = hashSeed('world', seed);
    return {
      c,
      base,
      elevation: makeNoise(hashSeed(base, 'elevation')),
      ridge: makeNoise(hashSeed(base, 'ridge')),
      moisture: makeNoise(hashSeed(base, 'moisture')),
      temperature: makeNoise(hashSeed(base, 'temperature')),
      river: makeNoise(hashSeed(base, 'river')),
      regionSeeds: new Map(),
      regionDetails: new Map(),
    };
  });
}

const clamp = (v) => (v > 1 ? 1 : v < -1 ? -1 : v);
// Stored fields are rounded so savegames stay compact; classification uses the
// rounded values, so a tile's numbers and its terrain never disagree.
const round3 = (v) => Math.round(v * 1000) / 1000 + 0;

function inRange(range, v) {
  if (!range) return true;
  if (range[0] !== null && v < range[0]) return false;
  if (range[1] !== null && v >= range[1]) return false;
  return true;
}

export function classify(c, elevation, moisture, temperature) {
  for (const rule of c.rules) {
    if (inRange(rule.elevation, elevation) && inRange(rule.moisture, moisture) && inRange(rule.temperature, temperature)) {
      return rule.terrain;
    }
  }
  return c.terrainOrder[c.terrainOrder.length - 1];
}

/** Raw climate fields of a tile, each in [-1, 1]. */
export function fieldsAt(ctx, q, r) {
  const { gen } = ctx.c;
  // Sampling at hex centres keeps features round on the hex grid instead of skewed.
  const { x, y } = hexToPixel(q, r, 1);
  const E = gen.elevation;
  const e = fbm(ctx.elevation, x * E.scale, y * E.scale, E.octaves, E.lacunarity, E.gain);
  const rs = E.scale * (E.ridgeScale ?? 1);
  const ridge = 1 - Math.abs(fbm(ctx.ridge, x * rs, y * rs, 3, 2, 0.5));
  const elevation = round3(clamp(E.base + E.amplitude * e + (E.ridgeWeight ?? 0) * (ridge * ridge - 0.5)));
  const M = gen.moisture;
  const m = fbm(ctx.moisture, x * M.scale, y * M.scale, M.octaves, M.lacunarity, M.gain);
  // Valleys collect water, so lower ground is wetter.
  const moisture = round3(clamp(m - (M.valleyBias ?? 0) * elevation));
  const T = gen.temperature;
  const t = fbm(ctx.temperature, x * T.scale, y * T.scale, T.octaves, T.lacunarity, T.gain);
  const temperature = round3(clamp((T.amplitude ?? 1) * t - (T.lapseRate ?? 0) * elevation));
  return { x, y, elevation, moisture, temperature };
}

function riverAt(ctx, f, terrain) {
  const R = ctx.c.rivers;
  if (!R) return false;
  const def = ctx.c.terrains.get(terrain);
  if (def.water || typeof def.moveCost !== 'number') return false;
  if (R.minElevation !== null && f.elevation < R.minElevation) return false;
  if (R.maxElevation !== null && f.elevation >= R.maxElevation) return false;
  // Rivers follow the zero contour of a separate noise field: thin connected
  // lines that need no flow simulation and so stay a per-tile function.
  const n = fbm(ctx.river, f.x * R.scale, f.y * R.scale, R.octaves ?? 2, 2, 0.5);
  return Math.abs(n) < R.width + (R.moistureWidth ?? 0) * f.moisture;
}

function resourcesAt(ctx, q, r, terrain, river) {
  const out = [];
  const defs = ctx.c.resources;
  if (!defs.length) return out;
  // One generator per tile, consumed in pack order: pure as long as the pack is unchanged.
  const rng = makeRng(hashSeed(ctx.base, 'resources', q, r));
  for (const d of defs) {
    const fits = d.terrains.includes(terrain) || (d.river === true && river);
    if (!fits) continue;
    const roll = rng.next();
    const amount = rng.int(d.amount[0], d.amount[1]);
    if (roll < d.frequency) out.push({ key: d.key, amount });
  }
  return out;
}

/** Pure tile without region: { q, r, terrain, elevation, moisture, temperature, river, resources }. */
export function terrainAt(seed, pack, q, r) {
  const ctx = seedContext(seed, pack);
  const f = fieldsAt(ctx, q, r);
  const terrain = classify(ctx.c, f.elevation, f.moisture, f.temperature);
  const river = riverAt(ctx, f, terrain);
  return {
    q,
    r,
    terrain,
    elevation: f.elevation,
    moisture: f.moisture,
    temperature: f.temperature,
    river,
    resources: resourcesAt(ctx, q, r, terrain, river),
  };
}


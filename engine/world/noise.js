// 2D gradient (Perlin-style) noise whose lattice gradients come from a hash of
// (seed, ix, iy) instead of a permutation table, so the field is unbounded and
// each sample depends only on its coordinates. Only exact IEEE operations are used.

import { hashSeed } from './rng.js';

const D = Math.SQRT1_2;
const GRADIENTS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [D, D], [-D, D], [D, -D], [-D, -D],
];

function latticeHash(seed, ix, iy) {
  let h = seed ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Returns (x, y) -> value in [-1, 1], continuous and smooth. */
export function makeNoise(seed) {
  const s = hashSeed('noise', seed);
  function corner(ix, iy, dx, dy) {
    const g = GRADIENTS[latticeHash(s, ix, iy) & 7];
    return g[0] * dx + g[1] * dy;
  }
  return function noise(x, y) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const u = fade(fx);
    const v = fade(fy);
    const a = corner(x0, y0, fx, fy);
    const b = corner(x0 + 1, y0, fx - 1, fy);
    const c = corner(x0, y0 + 1, fx, fy - 1);
    const d = corner(x0 + 1, y0 + 1, fx - 1, fy - 1);
    const top = a + (b - a) * u;
    const bottom = c + (d - c) * u;
    // Unit gradients bound 2D Perlin noise by sqrt(1/2); rescaling uses the full range.
    const value = (top + (bottom - top) * v) * Math.SQRT2;
    return value > 1 ? 1 : value < -1 ? -1 : value;
  };
}

/**
 * Fractal sum of `octaves` noise layers, normalised back to [-1, 1].
 * Each octave is shifted so that lattice zeros of the layers do not coincide.
 */
export function fbm(noise, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq + o * 31.7, y * freq - o * 17.3);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

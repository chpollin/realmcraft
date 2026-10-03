// Seeded randomness on 32-bit integer math (Math.imul, shifts), so every engine
// yields the same sequence. Math.random never enters the world generator.

// murmur3 finaliser: spreads every input bit over the whole word.
function fmix(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Integers hash by value; anything else (floats, strings) by its string form,
// so 3 and "3" differ via the type tag and 1.5 stays distinct from 1.
function hashPart(p) {
  if (typeof p === 'number' && Number.isInteger(p) && Math.abs(p) <= 0x7fffffff) {
    return fmix((p | 0) ^ 0x9e3779b9);
  }
  return fmix(hashString(`${typeof p}:${String(p)}`));
}

/** Combines string/number parts into one uint32; order of parts matters. */
export function hashSeed(...parts) {
  let h = 0x2545f491;
  for (const p of parts) {
    h = Math.imul(h ^ hashPart(p), 0x9e3779b1);
    h = (h << 13) | (h >>> 19);
  }
  return fmix(h ^ parts.length);
}

/**
 * mulberry32. The whole state is one uint32, so `makeRng(rng.state())`
 * continues the sequence exactly where `rng` stands.
 */
export function makeRng(seed) {
  let s = seed >>> 0;
  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    /** Integer in [min, max], both inclusive. */
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    state() {
      return s;
    },
  };
}

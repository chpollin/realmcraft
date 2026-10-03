// sfc32 (Small Fast Counting, 128-bit state) on 32-bit integer math, so every
// JavaScript engine yields the same sequence. The whole state is four uint32
// and lives in state.rng.s; a draw advances it and nothing else does.

const MASK = 0x100000000;
// Largest multiple of 10 below 2^32: draws at or above it are rejected so every
// face of the d10 has exactly the same probability.
const D10_LIMIT = Math.floor(MASK / 10) * 10;

function splitmix32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** Initial state for a uint32 seed; twelve warm-up draws decorrelate nearby seeds. */
export function seedState(seed) {
  const next = splitmix32(seed);
  const rng = makeRng({ algo: 'sfc32', s: [next(), next(), next(), next()] });
  for (let i = 0; i < 12; i++) rng.u32();
  return rng.state();
}

/**
 * Generator over a stored state { algo: 'sfc32', s: [a, b, c, d] }. The input
 * is copied, so the stored state changes only when the caller writes back
 * rng.state().
 */
export function makeRng(stored) {
  if (!stored || stored.algo !== 'sfc32' || !Array.isArray(stored.s) || stored.s.length !== 4) {
    throw new TypeError('makeRng: expects { algo: "sfc32", s: [4 x uint32] }');
  }
  let [a, b, c, d] = stored.s.map((x) => x >>> 0);
  let draws = 0;
  function u32() {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    draws++;
    return t;
  }
  return {
    u32,
    /** 1..10 by rejection sampling. */
    d10() {
      for (;;) {
        const x = u32();
        if (x < D10_LIMIT) return (x % 10) + 1;
      }
    },
    /** Integer in [0, n) without modulo bias. */
    below(n) {
      if (!Number.isInteger(n) || n < 1 || n > MASK) throw new RangeError(`rng.below: bad bound ${n}`);
      const limit = Math.floor(MASK / n) * n;
      for (;;) {
        const x = u32();
        if (x < limit) return x % n;
      }
    },
    pick(arr) {
      return arr.length ? arr[this.below(arr.length)] : undefined;
    },
    draws: () => draws,
    state: () => ({ algo: 'sfc32', s: [a, b, c, d] }),
  };
}

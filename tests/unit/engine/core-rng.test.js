import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedState, makeRng } from '../../../engine/core/rng.js';

const U32 = 4294967296;

// Independent sfc32 (a + b + counter, counter incremented after), no shared code with the engine.
function referenceSfc32(a, b, c, d) {
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = ((a + b) | 0) + d | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

const take = (n, f) => Array.from({ length: n }, f);

test('seedState gives a 4-word sfc32 state, deterministic per seed and different across seeds', () => {
  const s = seedState(1);
  assert.equal(s.algo, 'sfc32');
  assert.equal(s.s.length, 4);
  assert.deepEqual(seedState(1), s);
  assert.notDeepEqual(seedState(2).s.map((x) => x >>> 0), s.s.map((x) => x >>> 0));
  assert.notDeepEqual(seedState(0).s.map((x) => x >>> 0), s.s.map((x) => x >>> 0));
});

test('seed state words are uint32 (campaign schema: integer 0..4294967295)', () => {
  for (const seed of [0, 1, 2, 7, 42, 4294967295]) {
    for (const x of seedState(seed).s) assert.ok(Number.isInteger(x) && x >= 0 && x < U32, `seed ${seed}: ${x}`);
  }
});

test('state words stay uint32 after every draw', () => {
  const rng = makeRng(seedState(3));
  for (let i = 0; i < 2000; i++) {
    rng.u32();
    for (const x of rng.state().s) assert.ok(Number.isInteger(x) && x >= 0 && x < U32, `draw ${i}: ${x}`);
  }
});

test('reference sequence: first ten u32 of seed 1 are pinned', () => {
  const rng = makeRng(seedState(1));
  assert.deepEqual(rng.state().s.map((x) => x >>> 0), [2459862799, 1621824973, 3310820794, 2041432051]);
  assert.deepEqual(take(10, () => rng.u32()), [
    1828152527, 3394835397, 2967886022, 2251045104, 4148684523, 4055680838, 3224489912, 3690843842, 1114091683, 537224786,
  ]);
});

test('reference sequence: first ten d10 and below(1000) of seed 1 are pinned', () => {
  assert.deepEqual(take(10, ((r) => () => r.d10())(makeRng(seedState(1)))), [8, 8, 3, 5, 4, 9, 3, 3, 4, 7]);
  assert.deepEqual(take(10, ((r) => () => r.below(1000))(makeRng(seedState(1)))), [527, 397, 22, 104, 523, 838, 912, 842, 683, 786]);
});

test('u32 equals an independent sfc32 implementation', () => {
  const start = seedState(5).s;
  const ref = referenceSfc32(...start);
  const rng = makeRng(seedState(5));
  for (let i = 0; i < 1000; i++) assert.equal(rng.u32(), ref());
});

test('state serialisation round trip continues the sequence', () => {
  const rng = makeRng(seedState(9));
  take(17, () => rng.u32());
  const saved = JSON.parse(JSON.stringify(rng.state()));
  const resumed = makeRng(saved);
  assert.deepEqual(take(20, () => resumed.u32()), take(20, () => rng.u32()));
});

test('makeRng copies the stored state and does not mutate it', () => {
  const stored = seedState(11);
  const before = JSON.stringify(stored);
  const rng = makeRng(stored);
  take(5, () => rng.d10());
  assert.equal(JSON.stringify(stored), before);
  assert.notEqual(JSON.stringify(rng.state()), before);
  assert.equal(rng.draws(), 5);
});

test('makeRng rejects malformed states', () => {
  assert.throws(() => makeRng(null), TypeError);
  assert.throws(() => makeRng({ algo: 'mt', s: [1, 2, 3, 4] }), TypeError);
  assert.throws(() => makeRng({ algo: 'sfc32', s: [1, 2, 3] }), TypeError);
  assert.throws(() => makeRng({ algo: 'sfc32', s: 'abcd' }), TypeError);
});

test('d10 stays in 1..10 and each face has roughly a tenth of 100000 draws', () => {
  const rng = makeRng(seedState(2026));
  const hist = Array(11).fill(0);
  for (let i = 0; i < 100000; i++) {
    const v = rng.d10();
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 10);
    hist[v]++;
  }
  assert.equal(hist[0], 0);
  for (let f = 1; f <= 10; f++) assert.ok(hist[f] >= 9000 && hist[f] <= 11000, `face ${f}: ${hist[f]}`);
});

test('d10 rejects a u32 at or above 4294967290 and draws again', () => {
  // First output t = a + b + d = 4294967291 (rejected); second output is 1 -> face 2.
  const rng = makeRng({ algo: 'sfc32', s: [4294967291, 0, 0, 0] });
  assert.equal(rng.d10(), 2);
  assert.equal(rng.draws(), 2);
});

test('d10 accepts the largest u32 below the limit without rejection', () => {
  const rng = makeRng({ algo: 'sfc32', s: [4294967289, 0, 0, 0] });
  assert.equal(rng.d10(), 10);
  assert.equal(rng.draws(), 1);
});

test('below(n) stays in [0, n) and covers every value of a small range', () => {
  const rng = makeRng(seedState(4));
  for (const n of [1, 2, 3, 7, 10, 100, 65536]) {
    for (let i = 0; i < 300; i++) {
      const v = rng.below(n);
      assert.ok(Number.isInteger(v) && v >= 0 && v < n, `below(${n}) = ${v}`);
    }
  }
  assert.equal(rng.below(1), 0);
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(rng.below(5));
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4]);
});

test('below(n) rejects draws above the largest multiple of n (large n)', () => {
  // n = 3e9: limit = 3e9, so the first output 3.5e9 is rejected and the second (1) returned.
  const rng = makeRng({ algo: 'sfc32', s: [3500000000, 0, 0, 0] });
  assert.equal(rng.below(3000000000), 1);
  assert.equal(rng.draws(), 2);
});

test('below(2^32) never rejects and returns the raw u32', () => {
  const rng = makeRng({ algo: 'sfc32', s: [4294967295, 0, 0, 0] });
  assert.equal(rng.below(U32), 4294967295);
  assert.equal(rng.draws(), 1);
});

test('below rejects bad bounds', () => {
  const rng = makeRng(seedState(1));
  for (const n of [0, -1, 1.5, NaN, U32 + 1, '3']) assert.throws(() => rng.below(n), RangeError, String(n));
});

test('pick returns a member, undefined for an empty list, and consumes one draw', () => {
  const rng = makeRng(seedState(8));
  const items = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) assert.ok(items.includes(rng.pick(items)));
  const before = rng.draws();
  assert.equal(rng.pick([]), undefined);
  assert.equal(rng.draws(), before);
  rng.pick(items);
  assert.equal(rng.draws(), before + 1);
});

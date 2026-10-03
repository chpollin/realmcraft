import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSeed, makeRng, makeNoise, fbm } from '../../engine/world/index.js';

function draw(rng, n) {
  return Array.from({ length: n }, () => rng.next());
}

// Fixed grid of sample points that avoids integer coordinates, where gradient noise is 0.
function samples(n) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([(i % 100) * 0.73 + 0.11, Math.floor(i / 100) * 0.91 - 40.37]);
  return pts;
}

test('rng: hashSeed is deterministic and returns a uint32', () => {
  assert.equal(hashSeed('world', 7, 'x'), hashSeed('world', 7, 'x'));
  const inputs = [[], [0], [-1], [2 ** 31], [1.5], ['a'], ['a', 'b', 'c'], [12345678901]];
  for (const parts of inputs) {
    const h = hashSeed(...parts);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, `out of range for ${JSON.stringify(parts)}`);
  }
});

test('rng: hashSeed is order-sensitive and type-sensitive', () => {
  assert.notEqual(hashSeed('a', 'b'), hashSeed('b', 'a'));
  assert.notEqual(hashSeed(1, 2), hashSeed(2, 1));
  assert.notEqual(hashSeed(3), hashSeed('3'));
  assert.notEqual(hashSeed(1), hashSeed(1.5));
  assert.notEqual(hashSeed('a'), hashSeed('a', ''));
});

test('rng: same seed gives the same sequence, different seeds differ', () => {
  assert.deepEqual(draw(makeRng(42), 50), draw(makeRng(42), 50));
  assert.notDeepEqual(draw(makeRng(42), 50), draw(makeRng(43), 50));
});

test('rng: next stays in [0, 1)', () => {
  const rng = makeRng(hashSeed('range'));
  for (let i = 0; i < 10000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1);
  }
});

test('rng: int is inclusive on both ends and never leaves the range', () => {
  const rng = makeRng(9);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const v = rng.int(3, 7);
    assert.ok(Number.isInteger(v) && v >= 3 && v <= 7);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [3, 4, 5, 6, 7]);
  assert.equal(rng.int(5, 5), 5);
});

test('rng: pick returns members of the array', () => {
  const rng = makeRng(11);
  const arr = ['a', 'b', 'c', 'd'];
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const v = rng.pick(arr);
    assert.ok(arr.includes(v));
    seen.add(v);
  }
  assert.equal(seen.size, arr.length);
});

test('rng: state restores the sequence exactly, also after a JSON round trip', () => {
  const rng = makeRng(hashSeed('state', 1));
  draw(rng, 17);
  const s = rng.state();
  const expected = draw(rng, 10);
  assert.deepEqual(draw(makeRng(s), 10), expected);
  assert.deepEqual(draw(makeRng(JSON.parse(JSON.stringify({ s })).s), 10), expected);
});

test('noise: values for 10k samples lie in [-1, 1] and are not constant', () => {
  const noise = makeNoise(5);
  const values = samples(10000).map(([x, y]) => noise(x, y));
  for (const v of values) assert.ok(v >= -1 && v <= 1);
  assert.ok(new Set(values).size > 1000);
  assert.ok(Math.max(...values) > 0.2 && Math.min(...values) < -0.2);
});

test('noise: same seed same values, different seed different values', () => {
  const pts = samples(500);
  const a = pts.map(([x, y]) => makeNoise(1)(x, y));
  const b = pts.map(([x, y]) => makeNoise(1)(x, y));
  const c = pts.map(([x, y]) => makeNoise(2)(x, y));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.filter((v, i) => v !== c[i]).length > 400);
});

test('noise: continuity, points 1e-4 apart differ by less than 0.01', () => {
  const noise = makeNoise(77);
  for (const [x, y] of samples(5000)) {
    assert.ok(Math.abs(noise(x, y) - noise(x + 1e-4, y)) < 0.01);
    assert.ok(Math.abs(noise(x, y) - noise(x, y + 1e-4)) < 0.01);
  }
});

test('noise: fbm stays in [-1, 1] for several octave settings', () => {
  const noise = makeNoise(3);
  for (const [oct, lac, gain] of [[1, 2, 0.5], [4, 2, 0.5], [6, 2.3, 0.6]]) {
    const values = samples(3000).map(([x, y]) => fbm(noise, x, y, oct, lac, gain));
    for (const v of values) assert.ok(v >= -1 && v <= 1);
    assert.ok(new Set(values).size > 500);
  }
  const v = fbm(noise, 1.3, 2.7);
  assert.ok(v >= -1 && v <= 1);
});

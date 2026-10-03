import { test } from 'node:test';
import assert from 'node:assert/strict';
import { key, parseKey, neighbors, distance, ring, spiral, line, hexToPixel, pixelToHex, hexCorners } from '../../engine/world/index.js';

const ORIGINS = [{ q: 0, r: 0 }, { q: 3, r: -5 }, { q: -7, r: 2 }, { q: -4, r: -4 }];

function allDistinct(hexes) {
  return new Set(hexes.map((h) => key(h.q, h.r))).size === hexes.length;
}

test('hex: key and parseKey round trip including negative coordinates', () => {
  for (let q = -5; q <= 5; q++) {
    for (let r = -5; r <= 5; r++) {
      assert.deepEqual(parseKey(key(q, r)), { q, r });
    }
  }
  assert.equal(key(-3, 12), '-3,12');
  assert.deepEqual(parseKey('-12,-7'), { q: -12, r: -7 });
});

test('hex: key normalises negative zero', () => {
  assert.equal(key(-0, 0), '0,0');
  assert.equal(key(0, -0), '0,0');
  assert.equal(key(-0, -0), '0,0');
});

test('hex: neighbors are six distinct hexes at distance 1', () => {
  for (const c of ORIGINS) {
    const n = neighbors(c.q, c.r);
    assert.equal(n.length, 6);
    assert.ok(allDistinct(n));
    for (const h of n) assert.equal(distance(c, h), 1);
  }
});

test('hex: distance is symmetric and has known values', () => {
  for (const a of ORIGINS) {
    assert.equal(distance(a, a), 0);
    for (const b of ORIGINS) assert.equal(distance(a, b), distance(b, a));
  }
  assert.equal(distance({ q: 0, r: 0 }, { q: 3, r: 0 }), 3);
  assert.equal(distance({ q: 0, r: 0 }, { q: 0, r: -4 }), 4);
  assert.equal(distance({ q: 0, r: 0 }, { q: 2, r: -4 }), 4);
  assert.equal(distance({ q: 0, r: 0 }, { q: 2, r: 2 }), 4);
  assert.equal(distance({ q: -2, r: 1 }, { q: 3, r: -3 }), 5);
});

test('hex: ring of radius 0 is the centre, ring of radius k has 6k distinct hexes at distance k', () => {
  for (const c of ORIGINS) {
    assert.deepEqual(ring(c, 0), [c]);
    for (let k = 1; k <= 6; k++) {
      const hexes = ring(c, k);
      assert.equal(hexes.length, 6 * k);
      assert.ok(allDistinct(hexes));
      for (const h of hexes) assert.equal(distance(c, h), k);
    }
  }
});

test('hex: ring walks around the centre, consecutive hexes are adjacent', () => {
  const c = { q: 1, r: 1 };
  for (let k = 1; k <= 5; k++) {
    const hexes = ring(c, k);
    for (let i = 0; i < hexes.length; i++) {
      assert.equal(distance(hexes[i], hexes[(i + 1) % hexes.length]), 1);
    }
  }
});

test('hex: spiral has 1+3k(k+1) hexes, centre first, ring order', () => {
  for (const c of ORIGINS) {
    for (let k = 0; k <= 6; k++) {
      const hexes = spiral(c, k);
      assert.equal(hexes.length, 1 + 3 * k * (k + 1));
      assert.ok(allDistinct(hexes));
      assert.deepEqual(hexes[0], c);
      const dists = hexes.map((h) => distance(c, h));
      assert.deepEqual(dists, [...dists].sort((a, b) => a - b));
      let offset = 0;
      for (let j = 0; j <= k; j++) {
        const expected = ring(c, j);
        assert.deepEqual(hexes.slice(offset, offset + expected.length), expected);
        offset += expected.length;
      }
    }
  }
});

test('hex: hexToPixel then pixelToHex returns the same hex for several sizes', () => {
  for (const size of [1, 10, 32.5, 64]) {
    for (let q = -12; q <= 12; q++) {
      for (let r = -12; r <= 12; r++) {
        const p = hexToPixel(q, r, size);
        assert.deepEqual(pixelToHex(p.x, p.y, size), { q, r });
      }
    }
  }
});

test('hex: pixelToHex of a point slightly off-centre still returns the same hex', () => {
  for (const size of [10, 32.5]) {
    // 0.3 * size stays inside the inscribed circle (0.866 * size) in every direction.
    const offsets = [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2]];
    for (let q = -6; q <= 6; q++) {
      for (let r = -6; r <= 6; r++) {
        const p = hexToPixel(q, r, size);
        for (const [dx, dy] of offsets) {
          assert.deepEqual(pixelToHex(p.x + dx * size, p.y + dy * size, size), { q, r });
        }
      }
    }
  }
});

test('hex: hexCorners returns six corners all at distance size from the centre', () => {
  for (const size of [1, 10, 32.5]) {
    const centre = hexToPixel(2, -3, size);
    const corners = hexCorners(centre.x, centre.y, size);
    assert.equal(corners.length, 6);
    for (const c of corners) {
      assert.ok(Math.abs(Math.hypot(c.x - centre.x, c.y - centre.y) - size) < 1e-9);
    }
    // Adjacent corners are one side length apart on a regular hexagon.
    for (let i = 0; i < 6; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      assert.ok(Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - size) < 1e-9);
    }
  }
});

test('hex: line has distance+1 hexes, adjacent consecutive hexes and both ends', () => {
  const pairs = [];
  for (const a of ORIGINS) for (const b of ORIGINS) pairs.push([a, b]);
  pairs.push([{ q: 0, r: 0 }, { q: 9, r: -4 }], [{ q: 5, r: 5 }, { q: -5, r: 0 }]);
  for (const [a, b] of pairs) {
    const hexes = line(a, b);
    assert.equal(hexes.length, distance(a, b) + 1);
    assert.deepEqual(hexes[0], a);
    assert.deepEqual(hexes[hexes.length - 1], b);
    for (let i = 1; i < hexes.length; i++) assert.equal(distance(hexes[i - 1], hexes[i]), 1);
  }
});

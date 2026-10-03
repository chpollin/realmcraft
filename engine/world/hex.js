// Axial hex coordinates {q, r}, pointy-top orientation.
// Only +, -, *, /, sqrt and rounding are used, which IEEE 754 defines exactly,
// so results are identical across JavaScript engines.

const SQRT3 = Math.sqrt(3);

// Order matters for ring(): walking these directions in sequence traces a ring.
export const DIRECTIONS = Object.freeze([
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]);

// String(-0) is "0", so keys stay canonical for negated zero coordinates.
export function key(q, r) {
  return `${q},${r}`;
}

export function parseKey(k) {
  const comma = k.indexOf(',');
  return { q: Number(k.slice(0, comma)), r: Number(k.slice(comma + 1)) };
}

export function neighbors(q, r) {
  return DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

export function distance(a, b) {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function ring(center, radius) {
  if (radius === 0) return [{ q: center.q, r: center.r }];
  const out = [];
  let q = center.q + DIRECTIONS[4].q * radius;
  let r = center.r + DIRECTIONS[4].r * radius;
  for (let side = 0; side < 6; side++) {
    for (let step = 0; step < radius; step++) {
      out.push({ q, r });
      q += DIRECTIONS[side].q;
      r += DIRECTIONS[side].r;
    }
  }
  return out;
}

// Centre first, then ring by ring outward; callers rely on this order to find
// the nearest match deterministically.
export function spiral(center, radius) {
  const out = [];
  for (let k = 0; k <= radius; k++) out.push(...ring(center, k));
  return out;
}

export function hexRound(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  // + 0 turns a rounded -0 into 0 so the result compares equal to literal coords.
  return { q: q + 0, r: r + 0 };
}

// Hexes on the straight line from a to b, both ends included. The tiny nudge
// keeps lines that run exactly along hex edges from flipping between sides.
export function line(a, b) {
  const n = distance(a, b);
  if (n === 0) return [{ q: a.q, r: a.r }];
  const out = [];
  const aq = a.q + 1e-6;
  const ar = a.r + 1e-6;
  const bq = b.q + 1e-6;
  const br = b.r + 1e-6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(hexRound(aq + (bq - aq) * t, ar + (br - ar) * t));
  }
  return out;
}

export function hexToPixel(q, r, size) {
  return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
}

export function pixelToHex(x, y, size) {
  const fq = ((SQRT3 / 3) * x - y / 3) / size;
  const fr = ((2 / 3) * y) / size;
  return hexRound(fq, fr);
}

// Corner 0 is the upper right (-30 deg), then clockwise in screen space.
// Precomputed unit offsets avoid Math.cos/sin, whose last bits may differ per engine.
const CORNERS = [
  [SQRT3 / 2, -0.5],
  [SQRT3 / 2, 0.5],
  [0, 1],
  [-SQRT3 / 2, 0.5],
  [-SQRT3 / 2, -0.5],
  [0, -1],
];

export function hexCorners(x, y, size) {
  return CORNERS.map(([cx, cy]) => ({ x: x + cx * size, y: y + cy * size }));
}

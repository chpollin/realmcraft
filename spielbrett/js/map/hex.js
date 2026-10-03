// Drawing helpers on top of the world module's pointy-top axial geometry.

export { key as hexKey, parseKey, neighbors, distance as hexDistance, spiral, hexToPixel, pixelToHex, DIRECTIONS } from '/engine/world/index.js';

const SQRT3_2 = Math.sqrt(3) / 2;
// Unit corner offsets, corner 0 upper right then clockwise, as in the world module.
export const CORNERS = [[SQRT3_2, -0.5], [SQRT3_2, 0.5], [0, 1], [-SQRT3_2, 0.5], [-SQRT3_2, -0.5], [0, -1]];

export function hexPath(ctx, cx, cy, size) {
  ctx.moveTo(cx + CORNERS[0][0] * size, cy + CORNERS[0][1] * size);
  for (let i = 1; i < 6; i++) ctx.lineTo(cx + CORNERS[i][0] * size, cy + CORNERS[i][1] * size);
  ctx.closePath();
}

/** Deterministic 0..1 hash for per-tile jitter of decorations. */
export function hash01(q, r, salt = 0) {
  let h = (Math.imul(q, 374761393) + Math.imul(r, 668265263) + Math.imul(salt, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Painted cartographic terrain marks. Each terrain symbol of the pack gets a
// multi-layered hand-inked motif in the tile's own hue, lit from the upper
// left (NW) like the hillshade, with slope hachures, water mirrors, and
// back-to-front clustered canopies.

import { hash01 } from './hex.js';
import { col } from './palette.js';

/** Snow cap, lit/shaded facets, and directional slope hachures of one peak. */
function peak(ctx, x, by, w, h, base, snowFrac, lean) {
  const ax = x + lean * w;
  const ay = by - h;
  const mx = x + lean * w * 0.36;

  // Base ground shadow under the massif
  ctx.beginPath();
  ctx.moveTo(x - w * 0.52, by);
  ctx.quadraticCurveTo(x, by + h * 0.12, x + w * 0.54, by);
  ctx.fillStyle = col(base, { dL: -0.18, a: 0.32 });
  ctx.fill();

  // Sunlit NW face
  ctx.beginPath();
  ctx.moveTo(x - w / 2, by);
  ctx.lineTo(ax, ay);
  ctx.lineTo(mx, by);
  ctx.closePath();
  ctx.fillStyle = col(base, { dL: 0.11, dC: 0.008 });
  ctx.fill();

  // Shaded SE face
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(x + w / 2, by);
  ctx.lineTo(mx, by);
  ctx.closePath();
  ctx.fillStyle = col(base, { dL: -0.12 });
  ctx.fill();

  // Cartographic slope hachures on the shaded SE flank
  const hachures = 5;
  ctx.strokeStyle = col(base, { dL: -0.24, a: 0.58 });
  ctx.lineWidth = Math.max(0.65, w * 0.028);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 1; i <= hachures; i++) {
    const t = i / (hachures + 1);
    const rx = ax + (x + w / 2 - ax) * t;
    const ry = ay + (by - ay) * t;
    const cx = ax + (mx - ax) * Math.min(1, t + 0.12);
    const cy = ay + (by - ay) * Math.min(1, t + 0.12);
    const len = 0.55 + 0.35 * (1 - t);
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + (cx - rx) * len, ry + (cy - ry) * len);
  }
  ctx.stroke();

  if (snowFrac > 0) {
    const t = snowFrac;
    const lx = ax + (x - w / 2 - ax) * t;
    const rx = ax + (x + w / 2 - ax) * t;
    const sy = ay + h * t;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(rx, sy);
    ctx.lineTo(ax + (rx - ax) * 0.45, sy - h * t * 0.18);
    ctx.lineTo(ax + (mx - ax) * t, sy + h * t * 0.05);
    ctx.lineTo(ax + (lx - ax) * 0.55, sy - h * t * 0.22);
    ctx.lineTo(lx, sy);
    ctx.closePath();
    ctx.fillStyle = col('--map-snow', { a: 0.94 });
    ctx.fill();
  }

  // Crisp cartographic crest & ridge strokes
  ctx.beginPath();
  ctx.moveTo(x - w / 2, by);
  ctx.lineTo(ax, ay);
  ctx.lineTo(x + w / 2, by);
  ctx.moveTo(ax, ay);
  ctx.lineTo(mx, by);
  ctx.strokeStyle = col(base, { dL: -0.24, a: 0.68 });
  ctx.lineWidth = Math.max(0.75, w * 0.036);
  ctx.stroke();
}

function conifer(ctx, x, by, h, base) {
  const w = h * 0.66;
  // Ground shadow
  ctx.beginPath();
  ctx.ellipse(x + w * 0.12, by, w * 0.46, h * 0.13, 0, 0, Math.PI * 2);
  ctx.fillStyle = col(base, { dL: -0.22, a: 0.38 });
  ctx.fill();

  // Three-tiered pine silhouette (shaded side)
  ctx.beginPath();
  ctx.moveTo(x, by - h);
  ctx.lineTo(x + w * 0.36, by - h * 0.58);
  ctx.lineTo(x + w * 0.18, by - h * 0.6);
  ctx.lineTo(x + w * 0.48, by - h * 0.28);
  ctx.lineTo(x + w * 0.26, by - h * 0.3);
  ctx.lineTo(x + w * 0.56, by);
  ctx.lineTo(x - w * 0.56, by);
  ctx.lineTo(x - w * 0.26, by - h * 0.3);
  ctx.lineTo(x - w * 0.48, by - h * 0.28);
  ctx.lineTo(x - w * 0.18, by - h * 0.6);
  ctx.lineTo(x - w * 0.36, by - h * 0.58);
  ctx.closePath();
  ctx.fillStyle = col(base, { dL: -0.15, dC: 0.015 });
  ctx.fill();

  // Sunlit NW half of the conifer
  ctx.beginPath();
  ctx.moveTo(x, by - h);
  ctx.lineTo(x - w * 0.36, by - h * 0.58);
  ctx.lineTo(x - w * 0.18, by - h * 0.6);
  ctx.lineTo(x - w * 0.48, by - h * 0.28);
  ctx.lineTo(x - w * 0.26, by - h * 0.3);
  ctx.lineTo(x - w * 0.56, by);
  ctx.lineTo(x + w * 0.04, by);
  ctx.closePath();
  ctx.fillStyle = col(base, { dL: -0.02, dC: 0.015 });
  ctx.fill();
}

function crown(ctx, x, by, r, base) {
  // Ground shadow ellipse
  ctx.beginPath();
  ctx.ellipse(x + r * 0.22, by - r * 0.08, r * 1.05, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fillStyle = col(base, { dL: -0.22, a: 0.38 });
  ctx.fill();

  // Deep SE shadow foliage lobe
  ctx.beginPath();
  ctx.arc(x + r * 0.26, by - r * 0.88, r * 0.86, 0, Math.PI * 2);
  ctx.arc(x - r * 0.28, by - r * 0.84, r * 0.78, 0, Math.PI * 2);
  ctx.arc(x, by - r * 1.18, r * 0.88, 0, Math.PI * 2);
  ctx.fillStyle = col(base, { dL: -0.14, dC: 0.015 });
  ctx.fill();

  // Mid canopy cluster
  ctx.beginPath();
  ctx.arc(x - r * 0.12, by - r * 1.08, r * 0.82, 0, Math.PI * 2);
  ctx.arc(x + r * 0.18, by - r * 1.0, r * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = col(base, { dL: -0.03, dC: 0.012 });
  ctx.fill();

  // Sunlit NW crown highlight
  ctx.beginPath();
  ctx.arc(x - r * 0.28, by - r * 1.26, r * 0.52, 0, Math.PI * 2);
  ctx.fillStyle = col(base, { dL: 0.09, dC: 0.015 });
  ctx.fill();

  // Delicate cartographic ink rim on upper-left arc
  ctx.beginPath();
  ctx.arc(x - r * 0.12, by - r * 1.14, r * 0.84, Math.PI * 0.85, Math.PI * 1.75);
  ctx.strokeStyle = col(base, { dL: -0.24, a: 0.48 });
  ctx.lineWidth = Math.max(0.6, r * 0.11);
  ctx.stroke();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} symbol pack terrain symbol
 * @param {number} cx @param {number} cy @param {number} s hex radius on screen
 * @param {{q:number,r:number,elevation:number,temperature:number}} tile
 * @param {object} base parsed colour token of the tile (already shaded)
 * @param {{winter:boolean}} env
 */
export function drawTerrainMark(ctx, symbol, cx, cy, s, tile, base, env) {
  const j = (salt) => hash01(tile.q, tile.r, salt);
  const detail = s >= 14;
  const snowy = tile.temperature < -0.35 || (env.winter && tile.temperature < 0.05);
  switch (symbol) {
    case 'peak':
    case 'mountain': {
      const big = symbol === 'peak';
      const n = big ? 2 + (j(3) > 0.5 ? 1 : 0) : 2 + Math.floor(j(3) * 2.2);
      const peaks = [];
      for (let i = 0; i < n; i++) {
        const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * 0.92;
        peaks.push({
          x: cx + (spread + (j(10 + i) - 0.5) * 0.24) * s,
          by: cy + (0.34 + j(20 + i) * 0.28) * s,
          w: s * (big ? 1.25 : 0.72 + j(30 + i) * 0.45) * (i === 0 && n > 1 ? 1.12 : 1),
          h: s * (big ? 1.22 + j(40 + i) * 0.32 : 0.58 + j(40 + i) * 0.46),
          lean: (j(50 + i) - 0.5) * 0.32,
        });
      }
      peaks.sort((a, b) => a.by - b.by);
      for (const p of peaks) {
        const snow = big ? 0.52 : snowy ? 0.42 : tile.elevation > 0.6 ? 0.28 : p.h > s * 0.88 ? 0.18 : 0;
        if (!detail && p !== peaks[peaks.length - 1]) continue;
        peak(ctx, p.x, p.by, p.w, p.h, base, snow, p.lean);
      }
      break;
    }
    case 'pine':
    case 'tree': {
      const n = detail ? (symbol === 'pine' ? 6 : 5) : 2;
      const spots = [
        [-0.42, -0.18], [0.34, -0.28], [-0.08, -0.36],
        [-0.36, 0.24], [0.38, 0.22], [0.02, 0.36], [-0.04, 0.02],
      ];
      const off = Math.floor(j(6) * spots.length);
      const trees = [];
      for (let i = 0; i < n; i++) {
        const [ox, oy] = spots[(i + off) % spots.length];
        trees.push({
          x: cx + (ox + (j(10 + i) - 0.5) * 0.18) * s,
          y: cy + (oy + 0.16 + (j(20 + i) - 0.5) * 0.14) * s,
          scale: 0.88 + j(30 + i) * 0.28,
        });
      }
      trees.sort((a, b) => a.y - b.y);
      for (const tr of trees) {
        if (symbol === 'pine') conifer(ctx, tr.x, tr.y, s * 0.54 * tr.scale, base);
        else crown(ctx, tr.x, tr.y, s * 0.22 * tr.scale, base);
      }
      break;
    }
    case 'pasture':
    case 'grass': {
      if (!detail) break;
      // Subtle rolling contour arcs
      ctx.strokeStyle = col(base, { dL: symbol === 'pasture' ? 0.09 : -0.07, a: 0.42 });
      ctx.lineWidth = Math.max(0.7, s * 0.032);
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const rx = cx + (j(32 + i) - 0.5) * s * 0.5;
        const ry = cy + (i === 0 ? -0.22 : 0.24) * s;
        const rw = s * (0.34 + j(36 + i) * 0.16);
        ctx.beginPath();
        ctx.moveTo(rx - rw, ry + s * 0.04);
        ctx.quadraticCurveTo(rx, ry - s * 0.09, rx + rw, ry + s * 0.04);
        ctx.stroke();
      }
      // Clustered grass blade tufts
      ctx.strokeStyle = col(base, { dL: symbol === 'pasture' ? 0.12 : -0.1, a: 0.78 });
      ctx.lineWidth = Math.max(0.85, s * 0.038);
      for (let i = 0; i < 4; i++) {
        const x = cx + (j(40 + i) - 0.5) * s * 1.05;
        const y = cy + (j(50 + i) - 0.5) * s * 0.85;
        const h = s * (0.12 + j(55 + i) * 0.04);
        ctx.beginPath();
        ctx.moveTo(x - h * 0.65, y - h * 0.65);
        ctx.quadraticCurveTo(x - h * 0.2, y - h * 0.2, x, y);
        ctx.moveTo(x, y);
        ctx.lineTo(x + h * 0.05, y - h * 1.05);
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + h * 0.2, y - h * 0.2, x + h * 0.68, y - h * 0.6);
        ctx.stroke();
      }
      break;
    }
    case 'heath': {
      if (!detail) break;
      // Wind-swept contour lines and low scrub clusters
      ctx.strokeStyle = col(base, { dL: -0.1, a: 0.45 });
      ctx.lineWidth = Math.max(0.75, s * 0.032);
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const hx = cx + (j(58 + i) - 0.5) * s * 0.4;
        const hy = cy + (i ? 0.22 : -0.2) * s;
        ctx.beginPath();
        ctx.moveTo(hx - s * 0.35, hy);
        ctx.quadraticCurveTo(hx, hy - s * 0.08, hx + s * 0.35, hy + s * 0.02);
        ctx.stroke();
      }
      for (let i = 0; i < 4; i++) {
        const x = cx + (j(60 + i) - 0.5) * s * 1.05;
        const y = cy + (j(70 + i) - 0.5) * s * 0.85;
        const r = s * (0.068 + j(75 + i) * 0.025);
        ctx.beginPath();
        ctx.arc(x - r * 0.45, y, r * 0.78, 0, Math.PI * 2);
        ctx.arc(x + r * 0.45, y + r * 0.1, r * 0.68, 0, Math.PI * 2);
        ctx.arc(x, y - r * 0.35, r * 0.82, 0, Math.PI * 2);
        ctx.fillStyle = col(base, { dL: -0.11, dC: 0.022 });
        ctx.fill();
      }
      break;
    }
    case 'marsh': {
      if (!detail) break;
      // Alluvial water mirror pools beneath the reeds
      for (let i = 0; i < 2; i++) {
        const wx = cx + (j(78 + i) - 0.5) * s * 0.55;
        const wy = cy + (i ? 0.2 : -0.16) * s;
        ctx.beginPath();
        ctx.ellipse(wx, wy, s * 0.28, s * 0.075, 0, 0, Math.PI * 2);
        ctx.fillStyle = col('--map-river', { dL: -0.08, a: 0.34 });
        ctx.fill();
      }
      // Reed banks and Typha cat-tail stalks
      ctx.strokeStyle = col(base, { dL: -0.15, a: 0.86 });
      ctx.lineWidth = Math.max(0.85, s * 0.038);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const x = cx + (j(80 + i) - 0.5) * s * 0.85;
        const y = cy + (i - 1) * s * 0.28;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.24, y);
        ctx.lineTo(x + s * 0.24, y);
        ctx.moveTo(x - s * 0.08, y);
        ctx.lineTo(x - s * 0.13, y - s * 0.18);
        ctx.moveTo(x, y);
        ctx.lineTo(x + s * 0.01, y - s * 0.24);
        ctx.moveTo(x + s * 0.08, y);
        ctx.lineTo(x + s * 0.14, y - s * 0.17);
        ctx.stroke();
        // Dark cylindrical cat-tail seed head on central stalk
        ctx.beginPath();
        ctx.ellipse(x + s * 0.008, y - s * 0.17, Math.max(1, s * 0.025), Math.max(2, s * 0.055), 0, 0, Math.PI * 2);
        ctx.fillStyle = col(base, { dL: -0.25, a: 0.9 });
        ctx.fill();
      }
      break;
    }
    case 'wave': {
      if (!detail) break;
      ctx.strokeStyle = col(base, { dL: 0.12, a: 0.52 });
      ctx.lineWidth = Math.max(0.8, s * 0.038);
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const x = cx + (j(90 + i) - 0.5) * s * 0.55;
        const y = cy + (i ? 0.22 : -0.18) * s;
        const w = s * 0.18;
        ctx.beginPath();
        ctx.moveTo(x - w * 1.5, y);
        ctx.quadraticCurveTo(x - w * 0.75, y - w * 0.55, x, y);
        ctx.quadraticCurveTo(x + w * 0.75, y + w * 0.55, x + w * 1.5, y);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
}

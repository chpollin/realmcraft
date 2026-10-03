// Painted terrain marks. Each terrain symbol of the pack gets a small drawn
// motif in the tile's own hue, lit from the upper left like the hillshade, so
// the map reads as one landscape rather than a board of coloured cells.

import { hash01 } from './hex.js';
import { col } from './palette.js';

/** Snow cap and lit/shaded faces of one peak. */
function peak(ctx, x, by, w, h, base, snowFrac, lean) {
  const ax = x + lean * w;
  const ay = by - h;
  const mx = x + lean * w * 0.4;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, by);
  ctx.lineTo(ax, ay);
  ctx.lineTo(mx, by);
  ctx.closePath();
  ctx.fillStyle = col(base, { dL: 0.09 });
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(x + w / 2, by);
  ctx.lineTo(mx, by);
  ctx.closePath();
  ctx.fillStyle = col(base, { dL: -0.1 });
  ctx.fill();
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
    ctx.fillStyle = col('--map-snow', { a: 0.92 });
    ctx.fill();
  }
  // Ridge line: one dark stroke down the shaded side gives the peak its edge.
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(x + w / 2, by);
  ctx.strokeStyle = col(base, { dL: -0.2, a: 0.55 });
  ctx.lineWidth = Math.max(0.6, w * 0.035);
  ctx.stroke();
}

function conifer(ctx, x, by, h, base) {
  const w = h * 0.62;
  ctx.beginPath();
  ctx.moveTo(x, by - h);
  ctx.lineTo(x + w / 2, by - h * 0.38);
  ctx.lineTo(x + w * 0.3, by - h * 0.4);
  ctx.lineTo(x + w * 0.55, by);
  ctx.lineTo(x - w * 0.55, by);
  ctx.lineTo(x - w * 0.3, by - h * 0.4);
  ctx.lineTo(x - w / 2, by - h * 0.38);
  ctx.closePath();
  ctx.fillStyle = col(base, { dL: -0.13, dC: 0.01 });
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, by - h);
  ctx.lineTo(x - w * 0.55, by);
  ctx.lineTo(x - w * 0.05, by);
  ctx.closePath();
  ctx.fillStyle = col(base, { dL: -0.05 });
  ctx.fill();
}

function crown(ctx, x, by, r, base) {
  ctx.beginPath();
  ctx.arc(x, by - r, r, 0, Math.PI * 2);
  ctx.fillStyle = col(base, { dL: -0.1 });
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - r * 0.3, by - r * 1.3, r * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = col(base, { dL: 0.0 });
  ctx.fill();
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
  const detail = s >= 15;
  const snowy = tile.temperature < -0.35 || (env.winter && tile.temperature < 0.05);
  switch (symbol) {
    case 'peak':
    case 'mountain': {
      // One to three peaks per tile, varied in size and lean, drawn back to
      // front; tall ones reach into the row above so ranges read as massifs.
      const big = symbol === 'peak';
      const n = big ? 1 + (j(3) > 0.55 ? 1 : 0) : 1 + Math.floor(j(3) * 2.6);
      const peaks = [];
      for (let i = 0; i < n; i++) {
        const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * 0.85;
        peaks.push({
          x: cx + (spread + (j(10 + i) - 0.5) * 0.25) * s,
          by: cy + (0.42 + j(20 + i) * 0.22) * s,
          w: s * (big ? 1.3 : 0.75 + j(30 + i) * 0.45) * (i === 0 && n > 1 ? 1.1 : 1),
          h: s * (big ? 1.25 + j(40 + i) * 0.3 : 0.6 + j(40 + i) * 0.45),
          lean: (j(50 + i) - 0.5) * 0.35,
        });
      }
      peaks.sort((a, b) => a.by - b.by);
      for (const p of peaks) {
        const snow = big ? 0.5 : snowy ? 0.42 : tile.elevation > 0.6 ? 0.26 : p.h > s * 0.9 ? 0.16 : 0;
        if (!detail && p !== peaks[peaks.length - 1]) continue;
        peak(ctx, p.x, p.by, p.w, p.h, base, snow, p.lean);
      }
      break;
    }
    case 'pine':
    case 'tree': {
      const n = detail ? (symbol === 'pine' ? 4 : 3) : 2;
      const spots = [[-0.4, 0.0], [0.3, -0.25], [-0.02, 0.4], [0.42, 0.3], [-0.12, -0.38]];
      const off = Math.floor(j(6) * 5);
      for (let i = 0; i < n; i++) {
        const [ox, oy] = spots[(i + off) % 5];
        const x = cx + (ox + (j(10 + i) - 0.5) * 0.2) * s;
        const y = cy + (oy + 0.2 + (j(20 + i) - 0.5) * 0.14) * s;
        if (symbol === 'pine') conifer(ctx, x, y, s * (0.5 + j(30 + i) * 0.2), base);
        else crown(ctx, x, y, s * (0.2 + j(30 + i) * 0.07), base);
      }
      break;
    }
    case 'pasture':
    case 'grass': {
      if (!detail) break;
      ctx.strokeStyle = col(base, { dL: symbol === 'pasture' ? 0.1 : -0.08, a: 0.7 });
      ctx.lineWidth = Math.max(0.8, s * 0.04);
      ctx.lineCap = 'round';
      const n = 3;
      for (let i = 0; i < n; i++) {
        const x = cx + (j(40 + i) - 0.5) * s * 1.1;
        const y = cy + (j(50 + i) - 0.5) * s * 0.9;
        const h = s * 0.13;
        ctx.beginPath();
        ctx.moveTo(x - h * 0.6, y - h * 0.7);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y - h);
        ctx.moveTo(x, y);
        ctx.lineTo(x + h * 0.6, y - h * 0.7);
        ctx.stroke();
      }
      break;
    }
    case 'heath': {
      if (!detail) break;
      for (let i = 0; i < 4; i++) {
        const x = cx + (j(60 + i) - 0.5) * s * 1.1;
        const y = cy + (j(70 + i) - 0.5) * s * 0.9;
        ctx.beginPath();
        ctx.arc(x, y, s * 0.075, 0, Math.PI * 2);
        ctx.fillStyle = col(base, { dL: -0.1, dC: 0.02 });
        ctx.fill();
      }
      break;
    }
    case 'marsh': {
      if (!detail) break;
      ctx.strokeStyle = col(base, { dL: -0.12, a: 0.8 });
      ctx.lineWidth = Math.max(0.8, s * 0.04);
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const x = cx + (j(80 + i) - 0.5) * s * 0.9;
        const y = cy + (i - 1) * s * 0.3;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.22, y);
        ctx.lineTo(x + s * 0.22, y);
        ctx.moveTo(x - s * 0.05, y);
        ctx.lineTo(x - s * 0.1, y - s * 0.16);
        ctx.moveTo(x + s * 0.06, y);
        ctx.lineTo(x + s * 0.08, y - s * 0.2);
        ctx.stroke();
      }
      break;
    }
    case 'wave': {
      if (!detail) break;
      ctx.strokeStyle = col(base, { dL: 0.1, a: 0.55 });
      ctx.lineWidth = Math.max(0.8, s * 0.04);
      ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) {
        const x = cx + (j(90 + i) - 0.5) * s * 0.6;
        const y = cy + (i ? 0.22 : -0.18) * s;
        const w = s * 0.18;
        ctx.beginPath();
        ctx.moveTo(x - w * 1.5, y);
        ctx.quadraticCurveTo(x - w * 0.75, y - w * 0.6, x, y);
        ctx.quadraticCurveTo(x + w * 0.75, y + w * 0.6, x + w * 1.5, y);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
}

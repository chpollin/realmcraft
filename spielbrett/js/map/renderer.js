// Canvas 2D map: camera, layered drawing and hit testing. Draws on demand; a
// frame loop runs only while something moves (camera tween, pulses, trade
// flow, the selection settling) and stops by itself afterwards.

import { hexToPixel, pixelToHex, hexKey, neighbors, CORNERS, hexPath, hash01, hexDistance } from './hex.js';
import { token, col } from './palette.js';
import { drawTerrainMark } from './terrain.js';
import { iconPath } from '../icons.js';
import { tileAt } from '/engine/world/index.js';
import { prefersReducedMotion } from '../dom.js';
import { regionName } from '../model.js';

export const BASE = 30;
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 2.4;
const SQRT3 = Math.sqrt(3);

const PEOPLE_TOKEN = { spieler: '--people-own', schaedelklan: '--people-schaedelklan', talbund: '--people-talbund' };
// Peoples of other worlds have no colour token of their own and fall back to ink.
const peopleToken = (volk) => PEOPLE_TOKEN[volk] ?? '--ink';
const ORIGIN_TOKEN = {
  kern: '--origin-kern', welt: '--origin-welt', rivalen: '--origin-rivalen',
  forschung: '--origin-forschung', rat: '--origin-rat', chronist: '--origin-chronist',
};

const ease = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class MapView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} model
   * @param {{onSelect?: Function, onHover?: Function, onCamera?: Function}} hooks
   */
  constructor(canvas, model, hooks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.model = model;
    this.hooks = hooks;
    const c = hexToPixel(model.start.q, model.start.r, BASE);
    this.cam = { x: c.x, y: c.y, z: 1.45 };
    this.tween = null;
    this.selectT0 = 0;
    this.running = false;
    this.focusCross = false;
    this.colourCache = new Map();
    this.fogCanvas = document.createElement('canvas');
    this.terrainCanvas = document.createElement('canvas');
    this.grain = this.makeGrain();
    this.ownerVersion = -1;
    const css = getComputedStyle(document.documentElement);
    this.fontWorld = css.getPropertyValue('--font-world');
    this.fontUi = css.getPropertyValue('--font-ui');
    this.version = 0;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.bindInput();
  }

  /* Camera */

  get size() { return BASE * this.cam.z; }

  worldToScreen(wx, wy) {
    return { x: (wx - this.cam.x) * this.cam.z + this.w / 2, y: (wy - this.cam.y) * this.cam.z + this.h / 2 };
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.w / 2) / this.cam.z + this.cam.x, y: (sy - this.h / 2) / this.cam.z + this.cam.y };
  }

  hexAtScreen(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return pixelToHex(w.x, w.y, BASE);
  }

  hexScreen(q, r) {
    const p = hexToPixel(q, r, BASE);
    return this.worldToScreen(p.x, p.y);
  }

  bounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const k of Object.keys(this.model.known)) {
      const [q, r] = k.split(',').map(Number);
      const p = hexToPixel(q, r, BASE);
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  clamp() {
    const b = this.bounds();
    this.cam.z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.cam.z));
    this.cam.x = Math.min(b.maxX, Math.max(b.minX, this.cam.x));
    this.cam.y = Math.min(b.maxY, Math.max(b.minY, this.cam.y));
  }

  panBy(dx, dy) {
    this.tween = null;
    this.cam.x += dx / this.cam.z;
    this.cam.y += dy / this.cam.z;
    this.clamp();
    this.changed();
  }

  zoomAt(factor, sx = this.w / 2, sy = this.h / 2) {
    this.tween = null;
    const before = this.screenToWorld(sx, sy);
    this.cam.z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.cam.z * factor));
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clamp();
    this.changed();
  }

  /** Glide to a hex. The selection panel covers the right side on wide screens, so callers may pass an offset. */
  flyTo(q, r, { zoom, offsetX = 0 } = {}) {
    const p = hexToPixel(q, r, BASE);
    const z = zoom ?? this.cam.z;
    const target = { x: p.x + offsetX / z, y: p.y, z };
    if (prefersReducedMotion()) {
      Object.assign(this.cam, target);
      this.clamp();
      this.changed();
      return;
    }
    this.tween = { from: { ...this.cam }, to: target, t0: performance.now(), dur: 520 };
    this.kick();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.terrainCanvas.width = this.canvas.width;
    this.terrainCanvas.height = this.canvas.height;
    this.fogCanvas.width = Math.ceil(this.w / 5);
    this.fogCanvas.height = Math.ceil(this.h / 5);
    this.changed();
  }

  /* Frame scheduling */

  changed() {
    this.version++;
    this.kick();
  }

  kick() {
    if (this.running) return;
    this.running = true;
    requestAnimationFrame((t) => this.frame(t));
  }

  frame(now) {
    let busy = false;
    if (this.tween) {
      const k = ease((now - this.tween.t0) / this.tween.dur);
      const { from, to } = this.tween;
      this.cam.x = from.x + (to.x - from.x) * k;
      this.cam.y = from.y + (to.y - from.y) * k;
      this.cam.z = from.z + (to.z - from.z) * k;
      if (k >= 1) this.tween = null;
      else busy = true;
      this.clamp();
    }
    this.draw(now);
    this.hooks.onCamera?.();
    const reduced = prefersReducedMotion();
    if (!reduced) {
      if (now - this.selectT0 < 400) busy = true;
      if (this.model.highlights.some((h) => now - h.t0 < 1600)) busy = true;
      if (this.model.layer === 'handel') busy = true;
      if (this.model.preview?.tiles?.length) busy = true;
    }
    if (busy) requestAnimationFrame((t) => this.frame(t));
    else this.running = false;
  }

  /* Colour */

  tileColour(tile, def, mode) {
    const k = `${tile.q},${tile.r}|${mode}|${this.model.winter ? 1 : 0}`;
    let c = this.colourCache.get(k);
    if (c) return c;
    const base = token(def?.colour ?? 'terrain-unknown');
    // Hillshade: light from the upper left, i.e. from neighbour (q, r-1).
    const up = tileAt(this.model.world, tile.q, tile.r - 1);
    const left = tileAt(this.model.world, tile.q - 1, tile.r);
    const slope = (tile.elevation - up.elevation) * 0.55 + (tile.elevation - left.elevation) * 0.3;
    let dL = Math.max(-0.09, Math.min(0.09, slope * 0.35)) + tile.elevation * 0.025 + (hash01(tile.q, tile.r, 7) - 0.5) * 0.012;
    let cScale = 1;
    if (mode === 'muted') { cScale = 0.3; dL -= 0.07; }
    if (mode === 'frontier') { cScale = 0.25; dL -= 0.05; }
    if (this.model.winter && tile.temperature < 0.1 && !def?.water) { cScale *= 0.55; dL += 0.05; }
    c = { L: Math.min(0.97, Math.max(0.05, base.L + dL)), C: base.C * cScale, H: base.H, A: 1 };
    this.colourCache.set(k, c);
    return c;
  }

  invalidateColours() {
    this.colourCache.clear();
    this.changed();
  }

  /* Drawing */

  visibleHexes(pad = 1) {
    const s = BASE;
    const tl = this.screenToWorld(0, 0);
    const br = this.screenToWorld(this.w, this.h);
    const rMin = Math.floor(tl.y / (1.5 * s)) - pad;
    const rMax = Math.ceil(br.y / (1.5 * s)) + pad;
    const out = [];
    for (let r = rMin; r <= rMax; r++) {
      const qMin = Math.floor(tl.x / (SQRT3 * s) - r / 2) - pad;
      const qMax = Math.ceil(br.x / (SQRT3 * s) - r / 2) + pad;
      for (let q = qMin; q <= qMax; q++) out.push({ q, r });
    }
    return out;
  }

  draw(now) {
    const { ctx, model } = this;
    const s = this.size;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = col('--fog');
    ctx.fillRect(0, 0, this.w, this.h);

    const known = model.known;
    const muted = model.layer !== 'gelaende';
    const cells = [];
    for (const h of this.visibleHexes()) {
      const k = hexKey(h.q, h.r);
      const status = known[k];
      if (!status) {
        if (!neighbors(h.q, h.r).some((n) => known[hexKey(n.q, n.r)])) continue;
      }
      const tile = tileAt(model.world, h.q, h.r);
      const def = model.terrains.get(tile.terrain);
      const p = this.hexScreen(h.q, h.r);
      cells.push({ tile, def, x: p.x, y: p.y, status: status ?? 'frontier', k });
    }

    // Terrain fill on its own layer, drawn back softened: neighbouring terrains
    // blend into a landscape and the hex structure is carried by the faint grid,
    // the marks and the selection instead of by hard colour steps.
    const tctx = this.terrainCanvas.getContext('2d');
    tctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    tctx.clearRect(0, 0, this.w, this.h);
    for (const c of cells) {
      const mode = c.status === 'frontier' ? 'frontier' : muted ? 'muted' : 'full';
      c.colour = this.tileColour(c.tile, c.def, mode);
      tctx.beginPath();
      hexPath(tctx, c.x, c.y, s + 0.6);
      tctx.fillStyle = col(c.colour);
      tctx.fill();
    }
    ctx.save();
    ctx.filter = `blur(${Math.max(1.5, s * 0.2).toFixed(1)}px)`;
    ctx.drawImage(this.terrainCanvas, 0, 0, this.w, this.h);
    ctx.restore();

    // Faint hex grid only when zoomed in, so the board stays a landscape.
    if (s > 26) {
      ctx.strokeStyle = col('--map-grid', { a: Math.min(0.16, (s - 26) / 80) });
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const c of cells) if (c.status !== 'frontier') hexPath(ctx, c.x, c.y, s);
      ctx.stroke();
    }

    this.drawRivers(cells, s);
    if (model.frostRegions.size) this.drawFrost(cells, s);

    for (const c of cells) {
      if (!c.def) continue;
      ctx.save();
      if (c.status === 'frontier') ctx.globalAlpha = 0.55;
      drawTerrainMark(ctx, c.def.symbol, c.x, c.y, s, c.tile, c.colour, { winter: model.winter });
      ctx.restore();
    }

    this.drawFog(cells, s);

    if (model.layer === 'besitz') this.drawOwnership(cells, s);
    if (model.layer === 'bedrohung') this.drawThreat(cells, s);

    this.drawRoads(s);
    this.drawCampGlow(s);
    if (s > 20) this.drawRegionLabels(cells, s);
    if (model.layer === 'handel') this.drawTrade(s, now);
    this.drawMoves(s);
    this.drawPlaces(s);
    this.drawUnits(s);
    this.drawHighlights(s, now);
    this.drawPreview(s, now);
    this.drawHoverSelection(s, now);

    ctx.globalAlpha = 1;
    ctx.fillStyle = this.grain;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  drawRivers(cells, s) {
    const { ctx, model } = this;
    const isWet = (q, r) => {
      const t = tileAt(model.world, q, r);
      return t.river || model.terrains.get(t.terrain)?.water;
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const paths = new Path2D();
    for (const c of cells) {
      if (!c.tile.river) continue;
      const jx = c.x + (hash01(c.tile.q, c.tile.r, 11) - 0.5) * s * 0.35;
      const jy = c.y + (hash01(c.tile.q, c.tile.r, 12) - 0.5) * s * 0.35;
      const mids = [];
      for (const n of neighbors(c.tile.q, c.tile.r)) {
        if (!isWet(n.q, n.r)) continue;
        const p = this.hexScreen(n.q, n.r);
        mids.push({ x: (c.x + p.x) / 2, y: (c.y + p.y) / 2 });
      }
      if (mids.length === 0) continue;
      if (mids.length === 2) {
        paths.moveTo(mids[0].x, mids[0].y);
        paths.quadraticCurveTo(jx, jy, mids[1].x, mids[1].y);
      } else {
        for (const m of mids) {
          paths.moveTo(m.x, m.y);
          paths.quadraticCurveTo((m.x + jx) / 2 + (jy - m.y) * 0.12, (m.y + jy) / 2, jx, jy);
        }
      }
    }
    ctx.strokeStyle = col('--map-river');
    ctx.lineWidth = Math.max(1.4, s * 0.11);
    ctx.stroke(paths);
    ctx.strokeStyle = col('--map-river', { dL: 0.14, a: 0.55 });
    ctx.lineWidth = Math.max(0.6, s * 0.035);
    ctx.stroke(paths);
  }

  drawFrost(cells, s) {
    const { ctx, model } = this;
    for (const c of cells) {
      if (c.status === 'frontier' || !model.frostRegions.has(c.tile.regionId)) continue;
      ctx.beginPath();
      hexPath(ctx, c.x, c.y, s + 0.5);
      const g = ctx.createRadialGradient(c.x, c.y - s * 0.3, s * 0.1, c.x, c.y, s * 1.1);
      g.addColorStop(0, col('--map-frost', { a: 0.42 }));
      g.addColorStop(1, col('--map-frost', { a: 0.2 }));
      ctx.fillStyle = g;
      ctx.fill();
      // Scattered rime crystals, placed per tile so they hold still while panning.
      if (s > 18) {
        for (let i = 0; i < 2; i++) {
          const x = c.x + (hash01(c.tile.q, c.tile.r, 200 + i) - 0.5) * s * 1.1;
          const y = c.y + (hash01(c.tile.q, c.tile.r, 210 + i) - 0.5) * s * 0.9;
          this.icon('frost', x, y, s * (0.32 + hash01(c.tile.q, c.tile.r, 220 + i) * 0.14), col('--map-snow', { a: 0.75 }));
        }
      }
    }
  }

  drawFog(cells, s) {
    const { ctx } = this;
    const f = this.fogCanvas;
    const fc = f.getContext('2d');
    const k = f.width / this.w;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.globalCompositeOperation = 'source-over';
    fc.clearRect(0, 0, f.width, f.height);
    fc.fillStyle = col('--fog');
    fc.fillRect(0, 0, f.width, f.height);
    fc.globalCompositeOperation = 'destination-out';
    for (const c of cells) {
      // Visible land is clear, remembered land keeps a veil, frontier mostly fog.
      fc.fillStyle = c.status === 'visible' ? 'rgb(0 0 0 / 1)' : c.status === 'seen' ? 'rgb(0 0 0 / 0.6)' : 'rgb(0 0 0 / 0.22)';
      fc.beginPath();
      hexPath(fc, c.x * k, c.y * k, s * k + 0.3);
      fc.fill();
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.filter = `blur(${Math.max(2, s * 0.3).toFixed(1)}px)`;
    ctx.drawImage(f, 0, 0, this.w, this.h);
    ctx.restore();
  }

  ownership() {
    // A real campaign carries the kernel's region control per known tile.
    if (this.model.owners instanceof Map) return this.model.owners;
    if (this.ownerVersion === this.model.ownerVersion && this.owners) return this.owners;
    const holdings = [];
    for (const u of this.model.units) holdings.push({ q: u.q, r: u.r, volk: u.volk, reach: u.art === 'lager' ? 3 : 1 });
    for (const p of this.model.places) if (p.volk) holdings.push({ q: p.q, r: p.r, volk: p.volk, reach: p.art === 'siedlung' ? 3 : 2 });
    const owners = new Map();
    for (const k of Object.keys(this.model.known)) {
      const [q, r] = k.split(',').map(Number);
      let best = null;
      let bestD = Infinity;
      for (const h of holdings) {
        const d = hexDistance(h, { q, r });
        if (d <= h.reach && d < bestD) { best = h.volk; bestD = d; }
      }
      if (best) owners.set(k, best);
    }
    this.owners = owners;
    this.ownerVersion = this.model.ownerVersion;
    return owners;
  }

  drawOwnership(cells, s) {
    const { ctx } = this;
    const owners = this.ownership();
    for (const c of cells) {
      const o = owners.get(c.k);
      if (!o) continue;
      ctx.beginPath();
      hexPath(ctx, c.x, c.y, s + 0.5);
      ctx.fillStyle = col(peopleToken(o), { a: 0.26 });
      ctx.fill();
      // Border on edges where ownership changes.
      const ns = neighbors(c.tile.q, c.tile.r);
      ctx.strokeStyle = col(peopleToken(o), { a: 0.95 });
      ctx.lineWidth = Math.max(1.5, s * 0.07);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ns.forEach((n, i) => {
        if (owners.get(hexKey(n.q, n.r)) === o) return;
        const [a, b] = EDGE_CORNERS[i];
        const inset = 0.9;
        ctx.moveTo(c.x + CORNERS[a][0] * s * inset, c.y + CORNERS[a][1] * s * inset);
        ctx.lineTo(c.x + CORNERS[b][0] * s * inset, c.y + CORNERS[b][1] * s * inset);
      });
      ctx.stroke();
    }
  }

  threatAt(q, r) {
    // Kernel threat layer: level 2 where a foreign unit or danger stands, 1 within its reach.
    if (this.model.threat instanceof Map) return (this.model.threat.get(`${q},${r}`) ?? 0) / 2;
    let v = 0;
    for (const u of this.model.units) {
      if (u.volk !== 'schaedelklan') continue;
      const d = hexDistance(u, { q, r });
      if (d < 5) v = Math.max(v, (u.staerke / 3) * (1 - d / 5));
    }
    return Math.min(1, v);
  }

  drawThreat(cells, s) {
    const { ctx, model } = this;
    for (const c of cells) {
      if (c.status === 'frontier') continue;
      let v = this.threatAt(c.tile.q, c.tile.r);
      if (model.frostRegions.has(c.tile.regionId)) v = Math.max(v, 0.3);
      if (v <= 0.02) continue;
      ctx.beginPath();
      hexPath(ctx, c.x, c.y, s + 0.5);
      ctx.fillStyle = col('--map-threat', { a: 0.12 + v * 0.45 });
      ctx.fill();
    }
  }

  drawCampGlow(s) {
    const { ctx, model } = this;
    const camp = model.home ?? model.units.find((u) => u.art === 'lager' && u.volk === 'spieler');
    if (!camp) return;
    const p = this.hexScreen(camp.q, camp.r);
    const R = s * 4.2;
    const g = ctx.createRadialGradient(p.x, p.y, s * 0.2, p.x, p.y, R);
    g.addColorStop(0, col('--map-camp-glow', { a: 0.34 }));
    g.addColorStop(0.35, col('--map-camp-glow', { a: 0.12 }));
    g.addColorStop(1, col('--map-camp-glow', { a: 0 }));
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = g;
    ctx.fillRect(p.x - R, p.y - R, R * 2, R * 2);
    ctx.globalCompositeOperation = 'lighter';
    const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 1.6);
    g2.addColorStop(0, col('--map-camp-glow', { a: 0.22 }));
    g2.addColorStop(1, col('--map-camp-glow', { a: 0 }));
    ctx.fillStyle = g2;
    ctx.fillRect(p.x - s * 1.6, p.y - s * 1.6, s * 3.2, s * 3.2);
    ctx.restore();
  }

  drawRegionLabels(cells, s) {
    const { ctx, model } = this;
    // Label each region at the centroid of its known tiles in view, so a region
    // whose seed lies in the fog is still named where the player sees it.
    const acc = new Map();
    for (const c of cells) {
      if (c.status === 'frontier') continue;
      const a = acc.get(c.tile.regionId) ?? { x: 0, y: 0, n: 0 };
      a.x += c.x;
      a.y += c.y;
      a.n++;
      acc.set(c.tile.regionId, a);
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const px = Math.round(Math.min(26, Math.max(14, s * 0.55)));
    ctx.font = `italic ${px}px ${this.fontWorld}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${(px * 0.14).toFixed(1)}px`;
    const marks = [...model.units, ...model.places]
      .filter((o) => model.known[hexKey(o.q, o.r)])
      .map((o) => this.hexScreen(o.q, o.r));
    const w2 = (t) => ctx.measureText(t).width / 2 + s * 0.3;
    for (const [id, a] of acc) {
      if (a.n < 5) continue;
      const name = regionName(model, id);
      if (!name) continue;
      const x = a.x / a.n;
      // Try the centroid, then rows above and below, so the name never sits on a symbol.
      const half = w2(name);
      const clear = (y) => marks.every((m) => Math.abs(m.y - y) > s * 0.95 || Math.abs(m.x - x) > half);
      const y = [0.15, -1.35, 1.65, -2.85, 3.15].map((d) => a.y / a.n + s * d).find(clear);
      if (y === undefined) continue;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = col('--map-label-halo', { a: 0.35 });
      ctx.strokeText(name, x, y);
      ctx.fillStyle = col('--map-label', { a: 0.55 });
      ctx.fillText(name, x, y);
    }
    ctx.restore();
  }

  posOf(id) {
    const m = this.model;
    return m.units.find((u) => u.id === id) ?? m.places.find((p) => p.id === id);
  }

  /** Smooth polyline through hex centres (midpoint quadratic smoothing). */
  tracePath(path) {
    const pts = path.map((h) => this.hexScreen(h.q, h.r));
    const p = new Path2D();
    if (pts.length < 2) return { p, pts };
    p.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      p.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    p.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    return { p, pts };
  }

  drawRoads(s) {
    const { ctx, model } = this;
    const muted = model.layer !== 'gelaende' && model.layer !== 'handel';
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of model.roads) {
      if (!road.path.some((h) => model.known[hexKey(h.q, h.r)])) continue;
      const { p } = this.tracePath(road.path);
      const strasse = road.art === 'strasse';
      ctx.globalAlpha = muted ? 0.45 : 0.9;
      ctx.strokeStyle = col('--map-road-casing', { a: 0.55 });
      ctx.lineWidth = Math.max(2.5, s * (strasse ? 0.15 : 0.1));
      ctx.setLineDash([]);
      if (strasse) ctx.stroke(p);
      ctx.strokeStyle = col('--map-road', { a: strasse ? 0.9 : 0.75 });
      ctx.lineWidth = Math.max(1.2, s * (strasse ? 0.07 : 0.045));
      ctx.setLineDash(strasse ? [] : [s * 0.16, s * 0.14]);
      ctx.stroke(p);
    }
    ctx.restore();
  }

  drawTrade(s, now) {
    const { ctx, model } = this;
    const reduced = prefersReducedMotion();
    for (const route of model.tradeRoutes) {
      const { p, pts } = this.tracePath(route.path);
      if (pts.length < 2) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = col('--map-trade', { a: 0.22 });
      ctx.lineWidth = Math.max(6, s * 0.32);
      ctx.stroke(p);
      ctx.strokeStyle = col('--map-trade');
      ctx.lineWidth = Math.max(1.8, s * 0.08);
      ctx.setLineDash([s * 0.12, s * 0.3]);
      ctx.lineDashOffset = reduced ? 0 : -(now / 30) % 1000;
      ctx.stroke(p);
      ctx.setLineDash([]);
      const mid = pts[Math.floor(pts.length / 2)];
      this.chip(mid.x, mid.y - s * 0.55, route.gut, 'handel', '--map-trade');
      ctx.restore();
    }
  }

  drawPreview(s, now) {
    const tiles = this.model.preview?.tiles;
    if (!tiles?.length) return;
    const { ctx } = this;
    const k = prefersReducedMotion() ? 1 : 0.5 + 0.5 * Math.sin(now / 220);
    for (const t of tiles) {
      const p = this.hexScreen(t.q, t.r);
      ctx.save();
      ctx.beginPath();
      hexPath(ctx, p.x, p.y, s * 0.92);
      ctx.fillStyle = col('--ember', { a: 0.08 + 0.1 * k });
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -now / 60;
      ctx.strokeStyle = col('--ember', { a: 0.6 + 0.4 * k });
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  chip(x, y, text, iconName, tokenName) {
    const { ctx } = this;
    ctx.save();
    ctx.font = `600 12px ${this.fontUi}`;
    const tw = ctx.measureText(text).width;
    const w = tw + 30;
    const h = 22;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 11);
    ctx.fillStyle = col('--night-1', { a: 0.94 });
    ctx.fill();
    this.icon(iconName, x - w / 2 + 13, y, 14, col(tokenName));
    ctx.fillStyle = col('--ink');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, x - w / 2 + 23, y + 0.5);
    ctx.restore();
  }

  icon(name, x, y, size, stroke, halo) {
    const { ctx } = this;
    const k = size / 24;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(k, k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const p = iconPath(name);
    if (halo) {
      ctx.strokeStyle = halo;
      ctx.lineWidth = 5.5;
      ctx.stroke(p);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.9;
    ctx.stroke(p);
    ctx.restore();
  }

  drawMoves(s) {
    const { ctx, model } = this;
    for (const m of model.moves) {
      const a = this.hexScreen(m.from.q, m.from.r);
      const b = this.hexScreen(m.to.q, m.to.r);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const end = { x: b.x - Math.cos(ang) * s * 0.55, y: b.y - Math.sin(ang) * s * 0.55 };
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = col('--map-label-halo', { a: 0.6 });
      ctx.lineWidth = Math.max(4, s * 0.17);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.strokeStyle = col('--people-schaedelklan');
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.setLineDash([s * 0.2, s * 0.16]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = col('--people-schaedelklan');
      ctx.beginPath();
      const hs = Math.max(7, s * 0.3);
      ctx.moveTo(end.x + Math.cos(ang) * hs * 0.6, end.y + Math.sin(ang) * hs * 0.6);
      ctx.lineTo(end.x + Math.cos(ang + 2.4) * hs, end.y + Math.sin(ang + 2.4) * hs);
      ctx.lineTo(end.x + Math.cos(ang - 2.4) * hs, end.y + Math.sin(ang - 2.4) * hs);
      ctx.closePath();
      ctx.fill();
      // Ghost of the old position.
      ctx.globalAlpha = 0.4;
      this.tokenShape('schaedelklan', a.x, a.y, Math.max(9, s * 0.36));
      ctx.strokeStyle = col('--people-schaedelklan');
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawPlaces(s) {
    const { ctx, model } = this;
    const size = Math.max(16, s * 0.82);
    const labels = s > 22;
    ctx.save();
    ctx.font = `${Math.round(Math.min(16, Math.max(12, s * 0.36)))}px ${this.fontWorld}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const p of model.places) {
      if (!model.known[hexKey(p.q, p.r)]) continue;
      const sp = this.hexScreen(p.q, p.r);
      if (sp.x < -60 || sp.y < -60 || sp.x > this.w + 60 || sp.y > this.h + 60) continue;
      const tint = p.volk && p.volk !== 'spieler' ? col(peopleToken(p.volk)) : col('--ink');
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, size * 0.62, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, size * 0.62);
      g.addColorStop(0, col('--map-label-halo', { a: 0.55 }));
      g.addColorStop(1, col('--map-label-halo', { a: 0 }));
      ctx.fillStyle = g;
      ctx.fill();
      this.icon(p.art, sp.x, sp.y, size, tint, col('--map-label-halo', { a: 0.85 }));
      if (labels) {
        // A unit on a hex below would hide the name; put it above the symbol then.
        const below = model.units.some((u) => u.r === p.r + 1 && (u.q === p.q || u.q === p.q - 1) && model.known[hexKey(u.q, u.r)]);
        ctx.textBaseline = below ? 'bottom' : 'top';
        const y = below ? sp.y - size * 0.6 : sp.y + size * 0.6;
        ctx.lineWidth = 3.5;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = col('--map-label-halo', { a: 0.85 });
        ctx.strokeText(p.name, sp.x, y);
        ctx.fillStyle = col('--map-label');
        ctx.fillText(p.name, sp.x, y);
      }
    }
    ctx.restore();
  }

  tokenShape(volk, x, y, R) {
    const { ctx } = this;
    ctx.beginPath();
    if (volk === 'schaedelklan') {
      // Hostile: a diamond, so the threat reads without colour.
      ctx.moveTo(x, y - R * 1.18);
      ctx.lineTo(x + R * 1.18, y);
      ctx.lineTo(x, y + R * 1.18);
      ctx.lineTo(x - R * 1.18, y);
      ctx.closePath();
    } else if (volk === 'talbund') {
      ctx.roundRect(x - R * 0.95, y - R * 0.95, R * 1.9, R * 1.9, R * 0.45);
    } else {
      ctx.arc(x, y, R, 0, Math.PI * 2);
    }
  }

  drawUnits(s) {
    const { ctx, model } = this;
    const sel = model.selection;
    for (const u of model.units) {
      if (!model.known[hexKey(u.q, u.r)]) continue;
      const p = this.hexScreen(u.q, u.r);
      const camp = u.art === 'lager';
      const R = Math.max(10, s * (camp ? 0.5 : 0.4));
      const ring = col(peopleToken(u.volk));
      const selected = sel && sel.kind === 'unit' && sel.id === u.id;
      ctx.save();
      ctx.shadowColor = col('--night-0', { a: 0.7 });
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      this.tokenShape(u.volk, p.x, p.y, R);
      ctx.fillStyle = col('--night-1', { a: 0.95 });
      ctx.fill();
      ctx.restore();
      ctx.save();
      this.tokenShape(u.volk, p.x, p.y, R);
      ctx.strokeStyle = ring;
      ctx.lineWidth = selected ? 3 : 2;
      ctx.stroke();
      if (camp) {
        this.tokenShape(u.volk, p.x, p.y, R + 4);
        ctx.strokeStyle = col(peopleToken(u.volk), { a: 0.45 });
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();
      this.icon(u.art, p.x, p.y, R * 1.25, col('--ink'));
      // Strength as small pips under the token: game state, not decoration.
      if (s > 24) {
        const n = u.staerke ?? 0;
        const gap = 5;
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.arc(p.x - ((n - 1) * gap) / 2 + i * gap, p.y + R + 6, 1.7, 0, Math.PI * 2);
          ctx.fillStyle = ring;
          ctx.fill();
        }
      }
    }
  }

  drawHighlights(s, now) {
    const { ctx, model } = this;
    const reduced = prefersReducedMotion();
    for (const h of model.highlights) {
      const p = this.hexScreen(h.q, h.r);
      const tk = ORIGIN_TOKEN[h.origin] ?? '--origin-kern';
      const age = now - h.t0;
      ctx.save();
      ctx.beginPath();
      hexPath(ctx, p.x, p.y, s * 0.94);
      ctx.fillStyle = col(tk, { a: 0.14 });
      ctx.fill();
      ctx.strokeStyle = col(tk);
      ctx.lineWidth = 2.2;
      ctx.setLineDash(h.origin === 'rivalen' ? [5, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!reduced && age < 1600) {
        for (const delay of [0, 380]) {
          const k = ease((age - delay) / 1200);
          if (k <= 0 || k >= 1) continue;
          ctx.beginPath();
          hexPath(ctx, p.x, p.y, s * (1 + k * 1.1));
          ctx.strokeStyle = col(tk, { a: 0.75 * (1 - k) });
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      // Origin badge on the right edge, clear of names above and below the symbol.
      const bx = p.x + s * 0.86;
      const by = p.y;
      const br = Math.max(8, s * 0.27);
      const pop = reduced ? 1 : 0.6 + 0.4 * ease(age / 300);
      ctx.beginPath();
      ctx.arc(bx, by, br * pop, 0, Math.PI * 2);
      ctx.fillStyle = col('--night-1');
      ctx.fill();
      ctx.strokeStyle = col(tk);
      ctx.lineWidth = 1.6;
      ctx.stroke();
      this.icon(h.origin, bx, by, br * 1.3 * pop, col(tk));
      ctx.restore();
    }
  }

  drawHoverSelection(s, now) {
    const { ctx, model } = this;
    if (model.hover && (!model.selection || model.hover.q !== model.selection.q || model.hover.r !== model.selection.r)) {
      const p = this.hexScreen(model.hover.q, model.hover.r);
      ctx.beginPath();
      hexPath(ctx, p.x, p.y, s * 0.96);
      ctx.strokeStyle = col('--ink', { a: 0.4 });
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    if (model.selection) {
      const p = this.hexScreen(model.selection.q, model.selection.r);
      const k = prefersReducedMotion() ? 1 : ease((now - this.selectT0) / 260);
      const scale = 1.22 - 0.22 * k;
      ctx.save();
      ctx.shadowColor = col('--ember-glow');
      ctx.shadowBlur = 14;
      ctx.beginPath();
      hexPath(ctx, p.x, p.y, s * 0.97 * scale);
      ctx.strokeStyle = col('--ember', { a: 0.4 + 0.6 * k });
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.restore();
      // Corner ticks give the selection a crafted, sighting-frame look.
      ctx.save();
      ctx.strokeStyle = col('--ember');
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const cx = p.x + CORNERS[i][0] * s * 1.12 * scale;
        const cy = p.y + CORNERS[i][1] * s * 1.12 * scale;
        const ix = p.x + CORNERS[i][0] * s * 1.0 * scale;
        const iy = p.y + CORNERS[i][1] * s * 1.0 * scale;
        ctx.moveTo(cx, cy);
        ctx.lineTo(ix, iy);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (this.focusCross) {
      const h = this.hexAtScreen(this.w / 2, this.h / 2);
      const p = this.hexScreen(h.q, h.r);
      ctx.save();
      ctx.beginPath();
      hexPath(ctx, p.x, p.y, s * 0.9);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = col('--ember');
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 10;
    }
    g.putImageData(img, 0, 0);
    return this.ctx.createPattern(c, 'repeat');
  }

  markSelected() {
    this.selectT0 = performance.now();
    this.changed();
  }

  /* Input */

  bindInput() {
    const cv = this.canvas;
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pointers.size === 1) drag = { x: e.offsetX, y: e.offsetY, moved: false };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
        drag = null;
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch.d = d;
        return;
      }
      if (drag) {
        const dx = e.offsetX - drag.x;
        const dy = e.offsetY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 5) {
          drag.moved = true;
          cv.classList.add('is-panning');
        }
        if (drag.moved) {
          this.panBy(-dx, -dy);
          drag.x = e.offsetX;
          drag.y = e.offsetY;
        }
        return;
      }
      if (e.pointerType === 'mouse') {
        const h = this.hexAtScreen(e.offsetX, e.offsetY);
        const prev = this.model.hover;
        if (!prev || prev.q !== h.q || prev.r !== h.r) {
          this.model.hover = this.model.known[hexKey(h.q, h.r)] ? h : null;
          this.hooks.onHover?.(this.model.hover);
          this.changed();
        }
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && !drag.moved && e.type === 'pointerup') {
        const h = this.hexAtScreen(e.offsetX, e.offsetY);
        if (this.model.known[hexKey(h.q, h.r)]) this.hooks.onSelect?.(h);
      }
      drag = null;
      cv.classList.remove('is-panning');
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => {
      if (this.model.hover) {
        this.model.hover = null;
        this.changed();
      }
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY);
    }, { passive: false });
    cv.addEventListener('focus', () => { this.focusCross = true; this.changed(); });
    cv.addEventListener('blur', () => { this.focusCross = false; this.changed(); });
  }
}

// For neighbour direction i (world module order E, NE, NW, W, SW, SE) the
// shared edge runs between these two corners (0 upper right, clockwise).
const EDGE_CORNERS = [[0, 1], [5, 0], [4, 5], [3, 4], [2, 3], [1, 2]];

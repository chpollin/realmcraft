// Overview of the known world with the current view frame. Pointer users jump
// by click or drag; keyboard users pan with the arrow keys on the map, so the
// minimap itself stays out of the tab order.

import { hexToPixel, hexKey } from './hex.js';
import { tileAt } from '/engine/world/index.js';
import { col } from './palette.js';
import { BASE } from './renderer.js';

export class Minimap {
  constructor(canvas, view, model) {
    this.canvas = canvas;
    this.view = view;
    this.model = model;
    this.ctx = canvas.getContext('2d');
    this.base = null;
    this.knownCount = -1;
    const go = (e) => {
      const rect = canvas.getBoundingClientRect();
      const w = this.toWorld(e.clientX - rect.left, e.clientY - rect.top);
      view.tween = null;
      view.cam.x = w.x;
      view.cam.y = w.y;
      view.clamp();
      view.changed();
    };
    let down = false;
    canvas.addEventListener('pointerdown', (e) => { down = true; canvas.setPointerCapture(e.pointerId); go(e); });
    canvas.addEventListener('pointermove', (e) => { if (down) go(e); });
    canvas.addEventListener('pointerup', () => { down = false; });
  }

  layout() {
    const b = this.view.bounds();
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = rect.width;
    this.h = rect.height;
    if (this.canvas.width !== Math.round(this.w * dpr)) {
      this.canvas.width = Math.round(this.w * dpr);
      this.canvas.height = Math.round(this.h * dpr);
      this.knownCount = -1;
    }
    this.dpr = dpr;
    const pad = BASE * 1.5;
    const ww = b.maxX - b.minX + pad * 2;
    const wh = b.maxY - b.minY + pad * 2;
    this.k = Math.min(this.w / ww, this.h / wh);
    this.ox = b.minX - pad - (this.w / this.k - ww) / 2;
    this.oy = b.minY - pad - (this.h / this.k - wh) / 2;
  }

  toWorld(x, y) {
    return { x: x / this.k + this.ox, y: y / this.k + this.oy };
  }

  draw() {
    // Hidden (narrow screen with an open panel): nothing to draw into.
    if (!this.canvas.getBoundingClientRect().width) {
      this.knownCount = -1;
      return;
    }
    const keys = Object.keys(this.model.known);
    const { ctx } = this;
    if (keys.length !== this.knownCount || this.model.winter !== this.winter) {
      this.layout();
      this.knownCount = keys.length;
      this.winter = this.model.winter;
      const off = document.createElement('canvas');
      off.width = this.canvas.width;
      off.height = this.canvas.height;
      const o = off.getContext('2d');
      o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const r = Math.max(1.2, BASE * this.k);
      for (const key of keys) {
        const [q, rr] = key.split(',').map(Number);
        const t = tileAt(this.model.world, q, rr);
        const def = this.model.terrains.get(t.terrain);
        const p = hexToPixel(q, rr, BASE);
        o.fillStyle = col(def?.colour ?? 'terrain-unknown', { a: this.model.known[key] === 'visible' ? 1 : 0.6, cScale: this.model.winter && t.temperature < 0.1 ? 0.5 : 1 });
        o.beginPath();
        o.arc((p.x - this.ox) * this.k, (p.y - this.oy) * this.k, r, 0, Math.PI * 2);
        o.fill();
      }
      this.base = off;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const u of this.model.units) {
      if (!this.model.known[hexKey(u.q, u.r)]) continue;
      const p = hexToPixel(u.q, u.r, BASE);
      ctx.beginPath();
      ctx.arc((p.x - this.ox) * this.k, (p.y - this.oy) * this.k, u.art === 'lager' ? 3.2 : 2.2, 0, Math.PI * 2);
      ctx.fillStyle = col(u.volk === 'spieler' ? '--people-own' : u.volk === 'talbund' ? '--people-talbund' : u.volk === 'schaedelklan' ? '--people-schaedelklan' : '--ink');
      ctx.fill();
    }
    const v = this.view;
    const tl = v.screenToWorld(0, 0);
    const br = v.screenToWorld(v.w, v.h);
    // Clamp the view frame inside the minimap so all four edges stay readable.
    const x0 = Math.max(1, (tl.x - this.ox) * this.k);
    const y0 = Math.max(1, (tl.y - this.oy) * this.k);
    const x1 = Math.min(this.w - 1, (br.x - this.ox) * this.k);
    const y1 = Math.min(this.h - 1, (br.y - this.oy) * this.k);
    ctx.fillStyle = col('--ink', { a: 0.07 });
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = col('--ink', { a: 0.7 });
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 3);
    ctx.stroke();
  }
}

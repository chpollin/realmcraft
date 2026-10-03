// Bootstrap of the Spielbrett prototype: builds the model, the map and the
// panels, and wires selection, orders, overlays, keyboard and the Zwischenzug.

import { createModel, objectsAt, resourceByKey } from './model.js';
import { MapView } from './map/renderer.js';
import { Minimap } from './map/minimap.js';
import { el, prefersReducedMotion } from './dom.js';
import { icon } from './icons.js';
import { renderTopbar, renderResources, renderDestinyChip, renderOrders, renderMessages, renderEndTurn } from './ui/leiste.js';
import { renderKontext } from './ui/kontext.js';
import { renderOrtsliste } from './ui/ortsliste.js';
import { renderWeltgeschehen, runZwischenzug } from './ui/weltgeschehen.js';
import { renderBaum } from './ui/baum.js';
import { renderRat } from './ui/rat.js';
import { renderChronik } from './ui/chronik.js';
import { renderBestimmung } from './ui/bestimmung.js';
import { renderProbe } from './ui/probe.js';
import { closePinnedTip } from './ui/tip.js';

const DIALOGS = {
  entwicklungen: renderBaum,
  rat: renderRat,
  chronik: renderChronik,
  bestimmung: renderBestimmung,
  probe: renderProbe,
};
const SHORTCUTS = { e: 'entwicklungen', r: 'rat', c: 'chronik', b: 'bestimmung' };
const LAYERS = [
  ['gelaende', 'Gelände'],
  ['besitz', 'Besitz'],
  ['bedrohung', 'Bedrohung'],
  ['handel', 'Handel'],
];

const model = await createModel();
model.panel = null;
model.ownerVersion = 0;

const canvas = document.getElementById('karte');
const isNarrow = () => window.matchMedia('(max-width: 760px)').matches;
let minimap;

const api = {
  model,
  view: null,

  available(k) {
    const r = resourceByKey(model, k);
    if (!r) return 0;
    const reserved = model.orders.reduce((s, o) => s + (o.kosten ?? []).filter((c) => c.key === k).reduce((a, c) => a + c.menge, 0), 0);
    return r.wert - reserved;
  },
  resourceName(k) {
    return resourceByKey(model, k)?.name ?? k;
  },

  select(sel, { fly = false, keepPanel = false } = {}) {
    model.selection = sel;
    if (sel && !keepPanel) model.panel = 'kontext';
    if (!sel && model.panel === 'kontext') model.panel = null;
    if (sel) {
      api.view.markSelected();
      // On wide screens the panel covers the right edge; centre the target in the free part.
      if (fly) api.view.flyTo(sel.q, sel.r, { offsetX: isNarrow() ? 0 : 180 });
    } else {
      api.view.changed();
    }
    refreshPanels();
    if (sel && model.panel === 'kontext') announceSelection(sel);
  },

  setPanel(p) {
    model.panel = p;
    if (p !== 'kontext') model.selection = null;
    api.view.changed();
    refreshPanels();
  },

  chooseOrder(opt, target, mods) {
    if (opt.probe) {
      api.openDialog('probe', { opt, target, mods });
      return;
    }
    if (opt.id === 'lager_rat') {
      api.openDialog('rat');
      return;
    }
    api.addOrder({ id: `${opt.id}-${target.id}`, quelle: opt.id, zielId: target.id, titel: opt.titel, ziel: target.name, kosten: opt.kosten ?? [], art: opt.art });
  },

  addOrder(order) {
    if (model.orders.some((o) => o.id === order.id)) return;
    model.orders.push(order);
    renderOrders(api, { freshId: order.id });
    renderResources(api);
    renderKontext(api);
    api.announce(`${order.titel} in die Befehle aufgenommen`);
  },

  removeOrder(id) {
    const o = model.orders.find((x) => x.id === id);
    model.orders = model.orders.filter((x) => x.id !== id);
    renderOrders(api);
    renderResources(api);
    renderKontext(api);
    if (o) api.announce(`${o.titel} zurückgenommen`);
    document.getElementById('befehle').querySelector('button')?.focus() ?? document.getElementById('zug-beenden').focus();
  },

  meldungAktion(m) {
    if (m.id === 'weltgeschehen') return api.setPanel('welt');
    if (m.id === 'meldung_rat') return api.openDialog('rat');
    if (m.dialog) return api.openDialog(m.dialog);
    if (m.pos) {
      const q = model.start.q + m.pos.dq;
      const r = model.start.r + m.pos.dr;
      const near = model.units.find((u) => Math.abs(u.q - q) + Math.abs(u.r - r) <= 2 && u.volk !== 'spieler');
      if (near) return api.select({ kind: 'unit', id: near.id, q: near.q, r: near.r }, { fly: true });
      return api.select({ kind: 'tile', q, r }, { fly: true });
    }
    const camp = model.units.find((u) => u.art === 'lager' && u.volk === 'spieler');
    return api.select({ kind: 'unit', id: camp.id, q: camp.q, r: camp.r }, { fly: true });
  },

  openDialog(name, ctx) {
    const dlg = document.getElementById(`dlg-${name}`);
    for (const d of document.querySelectorAll('dialog[open]')) if (d !== dlg) d.close();
    if (dlg.open && name !== 'probe') {
      dlg.close();
      return;
    }
    DIALOGS[name](dlg, api, ctx);
    dlg.showModal();
    // Start on the title so the reader meets the content first, not the close button.
    if (name !== 'probe') dlg.querySelector('h2')?.focus();
    for (const b of document.querySelectorAll('[data-dialog]')) b.setAttribute('aria-expanded', String(b.dataset.dialog === name));
  },

  rerenderDialog(name) {
    const dlg = document.getElementById(`dlg-${name}`);
    const focusedText = document.activeElement?.textContent;
    DIALOGS[name](dlg, api);
    // Keep keyboard focus on the equivalent control after a re-render.
    const again = [...dlg.querySelectorAll('button')].find((b) => b.textContent === focusedText);
    (again ?? dlg.querySelector('.overlay-kopf .icon-btn'))?.focus();
  },

  refreshResources(opts) { renderResources(api, opts); },

  /** Shows a decision's consequences where they land, before it is committed. */
  setPreview(p) {
    const same = JSON.stringify(p) === JSON.stringify(model.preview);
    if (same) return;
    model.preview = p;
    renderResources(api);
    api.view.changed();
  },
  refreshDestiny(i) { renderDestinyChip(api, { freshIndex: i }); },
  refreshMessages(opts) { renderMessages(api, opts); },
  refreshOrders() { renderOrders(api); },
  refreshList() { renderOrtsliste(api); },

  setPhase(p) {
    model.phase = p;
    document.getElementById('brett').classList.toggle('is-dusk', p === 'A');
    renderOrders(api);
    renderEndTurn(api);
    renderKontext(api);
    if (p !== 'A') document.getElementById('zeit').textContent = `${model.zeit.saison}, Jahr ${model.zeit.jahr}`;
  },

  seasonCard(z) {
    const card = document.getElementById('saisonkarte');
    card.replaceChildren(el('span', { class: 's-name', text: z.saison }), el('span', { class: 's-jahr', text: `Jahr ${z.jahr}` }));
    card.hidden = false;
    if (prefersReducedMotion()) {
      setTimeout(() => { card.hidden = true; }, 1600);
      return;
    }
    card.classList.remove('play');
    void card.offsetWidth;
    card.classList.add('play');
    setTimeout(() => { card.hidden = true; card.classList.remove('play'); }, 2300);
  },

  streamChronicle(entry) {
    const band = document.getElementById('chronikband');
    const text = el('p', { class: 'cb-text' });
    band.replaceChildren(el('p', { class: 'cb-titel' }, icon('chronist', { size: 18 }), entry.titel), text);
    band.hidden = false;
    band.classList.remove('is-fading');
    const finish = () => {
      text.textContent = entry.text;
      model.chronik.forEach((c) => { c.neu = false; });
      model.chronik.push({ saison: entry.saison, jahr: entry.jahr, titel: entry.titel, text: entry.text, neu: true });
      api.announce(`Chronik, ${entry.titel}. ${entry.text}`);
      setTimeout(() => band.classList.add('is-fading'), 9000);
      setTimeout(() => { band.hidden = true; }, 9600);
    };
    if (prefersReducedMotion()) return finish();
    const words = entry.text.split(' ');
    let i = 0;
    const caret = el('span', { class: 'caret', 'aria-hidden': 'true' });
    const step = () => {
      i++;
      text.replaceChildren(words.slice(0, i).join(' '), caret);
      if (i < words.length) setTimeout(step, 55);
      else finish();
    };
    step();
  },

  announce(msg) {
    const live = document.getElementById('ansage');
    live.textContent = '';
    setTimeout(() => { live.textContent = msg; }, 30);
  },
};

function announceSelection(sel) {
  const h = document.getElementById('kontext-titel');
  if (h) api.announce(`Ausgewählt ${h.textContent}`);
}

function refreshPanels() {
  renderKontext(api);
  renderWeltgeschehen(api);
  document.getElementById('brett').classList.toggle('has-panel', Boolean(model.panel && (model.panel === 'welt' || model.selection)));
}

function selectHex(h) {
  const { units, places } = objectsAt(model, h.q, h.r);
  const unit = units.find((u) => u.volk === 'spieler') ?? units[0];
  if (unit) return api.select({ kind: 'unit', id: unit.id, q: h.q, r: h.r });
  if (places[0]) return api.select({ kind: 'place', id: places[0].id, q: h.q, r: h.r });
  return api.select({ kind: 'tile', q: h.q, r: h.r });
}

/* Map and tools */

api.view = new MapView(canvas, model, {
  onSelect: selectHex,
  onCamera: () => minimap?.draw(),
});
minimap = new Minimap(document.getElementById('minimap'), api.view, model);

const ebenen = document.getElementById('ebenen');
function renderLayers() {
  ebenen.replaceChildren(...LAYERS.map(([id, label]) => el('button', {
    class: 'ebene',
    type: 'button',
    role: 'radio',
    'aria-checked': String(model.layer === id),
    tabindex: model.layer === id ? '0' : '-1',
    'data-ebene': id,
    onclick: () => setLayer(id),
  }, icon(id, { size: 17 }), el('span', { class: 'ebene-label', text: label }))));
}
function setLayer(id) {
  model.layer = id;
  renderLayers();
  ebenen.querySelector(`[data-ebene="${id}"]`).focus();
  api.view.changed();
}
ebenen.addEventListener('keydown', (e) => {
  const i = LAYERS.findIndex(([id]) => id === model.layer);
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setLayer(LAYERS[(i + 1) % LAYERS.length][0]); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setLayer(LAYERS[(i + LAYERS.length - 1) % LAYERS.length][0]); }
});
renderLayers();

const ortsliste = document.getElementById('ortsliste');
document.getElementById('zoom').replaceChildren(
  el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Hineinzoomen (Plus)', onclick: () => api.view.zoomAt(1.25) }, icon('plus', { size: 18 })),
  el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Herauszoomen (Minus)', onclick: () => api.view.zoomAt(0.8) }, icon('minus', { size: 18 })),
  el('button', {
    class: 'icon-btn', type: 'button', 'aria-label': 'Zum Lager',
    onclick: () => { const c = model.units.find((u) => u.art === 'lager' && u.volk === 'spieler'); api.view.flyTo(c.q, c.r, { zoom: 1.15 }); },
  }, icon('ziel', { size: 18 })),
  el('button', {
    class: 'icon-btn', type: 'button', 'aria-label': 'Liste der Orte und Einheiten', 'aria-pressed': 'false', 'aria-controls': 'ortsliste',
    onclick: (e) => {
      const open = ortsliste.classList.toggle('is-open');
      e.currentTarget.setAttribute('aria-pressed', String(open));
      if (open) ortsliste.querySelector('button')?.focus();
    },
  }, icon('liste', { size: 18 })),
);

/* Turn */

const zugBtn = document.getElementById('zug-beenden');
zugBtn.addEventListener('click', async () => {
  if (model.phase === 'A') return;
  for (const d of document.querySelectorAll('dialog[open]')) d.close();
  await runZwischenzug(api);
  renderEndTurn(api);
});

/* Keyboard */

const PAN = 90;
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  const typing = t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
  if (typing) return;
  const k = e.key.toLowerCase();
  if (SHORTCUTS[k]) {
    e.preventDefault();
    api.openDialog(SHORTCUTS[k]);
    return;
  }
  if (document.querySelector('dialog[open]')) return;
  const onMap = t === document.body || t === canvas;
  if (onMap) {
    const moves = { arrowleft: [-PAN, 0], arrowright: [PAN, 0], arrowup: [0, -PAN], arrowdown: [0, PAN] };
    if (moves[k]) {
      e.preventDefault();
      api.view.panBy(...moves[k]);
      return;
    }
    if (k === '+' || k === '=') { api.view.zoomAt(1.2); return; }
    if (k === '-') { api.view.zoomAt(1 / 1.2); return; }
    if (k === 'enter' && t === canvas) {
      // Without preventDefault the same Enter would activate the button that receives focus.
      e.preventDefault();
      const h = api.view.hexAtScreen(api.view.w / 2, api.view.h / 2);
      if (model.known[`${h.q},${h.r}`]) {
        selectHex(h);
        document.getElementById('kontext-titel')?.focus();
      }
      return;
    }
  }
  if (k === 'escape' && closePinnedTip()) return;
  if (k === 'escape') {
    if (ortsliste.classList.contains('is-open')) {
      ortsliste.classList.remove('is-open');
      return;
    }
    if (model.panel) {
      api.setPanel(null);
      canvas.focus();
    }
  }
});

for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('close', () => {
    api.setPreview(null);
    for (const b of document.querySelectorAll('[data-dialog]')) b.setAttribute('aria-expanded', 'false');
  });
  // Click on the backdrop closes, a click inside does not.
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
}

// The tree overlay starts below the top bar; its height changes when the bar wraps.
new ResizeObserver(([e]) => {
  document.documentElement.style.setProperty('--leiste-h', `${Math.round(e.target.getBoundingClientRect().height)}px`);
}).observe(document.querySelector('.leiste'));

/* First render */

renderTopbar(api);
renderOrders(api);
renderMessages(api);
renderEndTurn(api);
renderOrtsliste(api);
refreshPanels();
minimap.draw();
document.documentElement.dataset.ready = 'true';

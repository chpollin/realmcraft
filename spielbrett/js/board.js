// The Spielbrett: map, panels, overlays, keyboard and the Zwischenzug, wired
// to a board model. With a game (a real campaign) every decision goes into
// the kernel draft and every consequence comes from the kernel preview; without
// one the prototype plays its fixtures (?demo).

import { objectsAt, resourceByKey } from './model.js';
import { MapView } from './map/renderer.js';
import { Minimap } from './map/minimap.js';
import { el, prefersReducedMotion } from './dom.js';
import { icon } from './icons.js';
import { renderTopbar, renderResources, renderDestinyChip, renderOrders, renderMessages, renderEndTurn, renderBlocker } from './ui/leiste.js';
import { renderKontext } from './ui/kontext.js';
import { renderOrtsliste } from './ui/ortsliste.js';
import { renderRatsleiste } from './ui/ratsleiste.js';
import { initEreignisse } from './ui/ereignisse.js';
import { renderWeltgeschehen, runZwischenzug } from './ui/weltgeschehen.js';
import { renderPfade } from './ui/pfade.js';
import { renderRat } from './ui/rat.js';
import { renderChronik } from './ui/chronik.js';
import { renderBestimmung } from './ui/bestimmung.js';
import { renderProbe } from './ui/probe.js';
import { closePinnedTip } from './ui/tip.js';
import { issueText } from './data/adapter.js';
import { t, onLanguage, applyStatic } from './i18n/index.js';
import { renderSprache } from './ui/sprache.js';

const DIALOGS = {
  entwicklungen: renderPfade,
  rat: renderRat,
  chronik: renderChronik,
  bestimmung: renderBestimmung,
  probe: renderProbe,
};
const SHORTCUTS = { e: 'entwicklungen', r: 'rat', c: 'chronik', b: 'bestimmung' };
const LAYERS = ['gelaende', 'besitz', 'bedrohung', 'handel'];

export function startBoard(model, game) {
  const canvas = document.getElementById('karte');
  const isNarrow = () => window.matchMedia('(max-width: 760px)').matches;
  const home = () => model.home ?? model.units.find((u) => u.art === 'lager' && u.volk === 'spieler');
  let minimap;

  const api = {
    model,
    game,
    view: null,

    available(k) {
      const r = resourceByKey(model, k);
      if (!r) return 0;
      const reserved = model.orders.reduce((s, o) => s + (o.kosten ?? []).filter((c) => c.key === k).reduce((a, c) => a + c.menge, 0), 0);
      return r.wert - reserved;
    },
    resourceName(k) {
      return resourceByKey(model, k)?.name ?? t(`resource.${k}`, k);
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
      if (sel && model.panel === 'kontext') announceSelection();
    },

    setPanel(p) {
      model.panel = p;
      if (p !== 'kontext') model.selection = null;
      api.view.changed();
      refreshPanels();
    },

    chooseOrder(opt, target, mods) {
      if (game) {
        if (opt.grund) return;
        if (opt.probe) {
          api.openDialog('probe', { real: true, opt, target });
          return;
        }
        const res = game.addOption(opt);
        api.setPreview(null);
        api.announce(res.grund ? t.fmt('board.announce.refused', { title: opt.titel, reason: res.grund }) : t.fmt('board.announce.added', { title: opt.titel }));
        return;
      }
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

    /** Real campaign: adds a kernel option (or a raw { type, params }) to the draft. */
    addCandidate(cand, { roll, extra } = {}) {
      const opt = cand.titel ? cand : game.previewOption(cand, extra);
      if (opt.grund) {
        api.announce(opt.grund);
        return null;
      }
      if (opt.probe && !roll) {
        api.openDialog('probe', { real: true, opt, target: {} });
        return null;
      }
      const res = game.addOption(opt, { roll, extra });
      api.setPreview(null);
      if (res.grund) {
        api.announce(t.fmt('board.announce.refused', { title: opt.titel, reason: res.grund }));
        return null;
      }
      api.announce(t.fmt('board.announce.added', { title: opt.titel }));
      return res.id;
    },

    addOrder(order) {
      if (model.orders.some((o) => o.id === order.id)) return;
      model.orders.push(order);
      renderOrders(api, { freshId: order.id });
      renderResources(api);
      renderKontext(api);
      api.announce(t.fmt('board.announce.added', { title: order.titel }));
    },

    removeOrder(id) {
      const o = model.orders.find((x) => x.id === id);
      if (game) game.removeOrder(id);
      else {
        model.orders = model.orders.filter((x) => x.id !== id);
        renderOrders(api);
        renderResources(api);
        renderKontext(api);
      }
      if (o) api.announce(t.fmt('board.announce.removed', { title: o.titel }));
      document.getElementById('befehle').querySelector('button')?.focus() ?? document.getElementById('zug-beenden').focus();
    },

    /** Real campaign: takes every owed roll in turn without ending the turn afterwards. */
    rollOwed() {
      const first = game.blockers().wuerfe[0];
      if (first) api.openDialog('probe', { real: true, probeId: first.probeId, sequence: 'wuerfe' });
    },

    jumpToTile(tileKey) {
      const [q, r] = String(tileKey).split(',').map(Number);
      if (Number.isInteger(q) && Number.isInteger(r)) selectHex({ q, r }, { fly: true });
    },

    /** Real campaign: rolls (or rolls again) the probe of an order already in the draft. */
    rollOrder(orderId) {
      const row = model.orders.find((o) => o.id === orderId);
      if (row?.probe) api.openDialog('probe', { real: true, probeId: row.probe });
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
      const camp = home();
      if (!camp) return undefined;
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
      if (p !== 'A') document.getElementById('zeit').textContent = t.fmt('board.time', { season: model.zeit.saison, year: model.zeit.jahr });
    },

    seasonCard(z) {
      const card = document.getElementById('saisonkarte');
      card.replaceChildren(el('span', { class: 's-name', text: z.saison }), el('span', { class: 's-jahr', text: t.fmt('board.year', { year: z.jahr }) }));
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
        if (!game) {
          model.chronik.forEach((c) => { c.neu = false; });
          model.chronik.push({ saison: entry.saison, jahr: entry.jahr, titel: entry.titel, text: entry.text, neu: true });
        } else {
          for (const c of model.chronik) c.neu = c.turn === entry.turn;
        }
        api.announce(t.fmt('board.announce.chronicle', { title: entry.titel, text: entry.text }));
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
      return undefined;
    },

    announce(msg) {
      const live = document.getElementById('ansage');
      live.textContent = '';
      setTimeout(() => { live.textContent = msg; }, 30);
    },

    /**
     * Real campaign, "Zug beenden": owed rolls are taken one by one in the
     * probe dialog, then the draft is sealed through the server.
     */
    async endTurn() {
      // Problems first: rolling for a draft that cannot be sealed would only end in the same refusal.
      const { probleme } = game.blockers();
      if (probleme.length) {
        renderBlocker(api, { open: true });
        api.announce(t.fmt('board.announce.cannot-end', { reason: t.plural('board.announce.problems', probleme.length) }));
        document.querySelector('#blocker-liste button')?.focus();
        return;
      }
      const can = game.canSeal();
      if (can.rolls?.length) {
        api.openDialog('probe', { real: true, probeId: can.rolls[0].id, sequence: true });
        return;
      }
      if (!can.ok) {
        api.announce(t.fmt('board.announce.cannot-end', { reason: can.reason }));
        document.getElementById('zug-beenden').dataset.grund = can.reason;
        return;
      }
      for (const d of document.querySelectorAll('dialog[open]')) d.close();
      const res = await game.seal();
      if (!res.ok) {
        const why = [...new Set((res.issues ?? []).filter((i) => i.severity === 'error').map((i) => issueText(i, t)))].join(', ');
        api.announce(t.fmt('board.announce.not-sealed', { reason: why }));
        return;
      }
      api.announce(t('board.announce.sealed'));
    },
  };

  function announceSelection() {
    const h = document.getElementById('kontext-titel');
    if (h) api.announce(t.fmt('board.announce.selected', { name: h.textContent }));
  }

  function refreshPanels() {
    renderKontext(api);
    renderWeltgeschehen(api);
    document.getElementById('brett').classList.toggle('has-panel', Boolean(model.panel && (model.panel === 'welt' || model.selection)));
  }

  function selectHex(h, opts = {}) {
    const { units, places } = objectsAt(model, h.q, h.r);
    const unit = units.find((u) => u.volk === 'spieler') ?? units[0];
    if (unit) return api.select({ kind: 'unit', id: unit.id, q: h.q, r: h.r }, opts);
    if (places[0]) return api.select({ kind: 'place', id: places[0].id, q: h.q, r: h.r }, opts);
    return api.select({ kind: 'tile', q: h.q, r: h.r }, opts);
  }

  /* Map and tools */

  api.view = new MapView(canvas, model, {
    onSelect: selectHex,
    onCamera: () => minimap?.draw(),
  });
  minimap = new Minimap(document.getElementById('minimap'), api.view, model);

  const ebenen = document.getElementById('ebenen');
  function renderLayers() {
    ebenen.replaceChildren(...LAYERS.map((id) => el('button', {
      class: 'ebene',
      type: 'button',
      role: 'radio',
      'aria-checked': String(model.layer === id),
      tabindex: model.layer === id ? '0' : '-1',
      'data-ebene': id,
      onclick: () => setLayer(id),
    }, icon(id, { size: 17 }), el('span', { class: 'ebene-label', text: t(`board.layer.${id}`) }))));
  }
  function setLayer(id) {
    model.layer = id;
    renderLayers();
    ebenen.querySelector(`[data-ebene="${id}"]`).focus();
    api.view.changed();
  }
  ebenen.addEventListener('keydown', (e) => {
    const i = LAYERS.indexOf(model.layer);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); setLayer(LAYERS[(i + 1) % LAYERS.length]); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); setLayer(LAYERS[(i + LAYERS.length - 1) % LAYERS.length]); }
  });
  renderLayers();

  const ortsliste = document.getElementById('ortsliste');
  // Labelled through data-t-aria-label, so a change of language relabels them in place.
  document.getElementById('zoom').replaceChildren(
    el('button', { class: 'icon-btn', type: 'button', 'data-t-aria-label': 'board.zoom.in', onclick: () => api.view.zoomAt(1.25) }, icon('plus', { size: 18 })),
    el('button', { class: 'icon-btn', type: 'button', 'data-t-aria-label': 'board.zoom.out', onclick: () => api.view.zoomAt(0.8) }, icon('minus', { size: 18 })),
    el('button', {
      class: 'icon-btn', type: 'button', 'data-t-aria-label': 'board.zoom.home',
      onclick: () => { const c = home(); if (c) api.view.flyTo(c.q, c.r, { zoom: 1.15 }); },
    }, icon('ziel', { size: 18 })),
    el('button', {
      class: 'icon-btn', type: 'button', 'data-t-aria-label': 'board.zoom.list', 'aria-pressed': 'false', 'aria-controls': 'ortsliste',
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
    if (game) {
      if (zugBtn.getAttribute('aria-disabled') === 'true') return;
      await api.endTurn();
      renderEndTurn(api);
      return;
    }
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    await runZwischenzug(api);
    renderEndTurn(api);
  });

  /* Kernel and agents of a real campaign */

  if (game) {
    game.onUpdate((kind, detail) => {
      if (kind === 'draft') {
        renderOrders(api);
        renderResources(api);
        renderMessages(api);
        renderEndTurn(api);
        renderKontext(api);
        renderRatsleiste(api);
        for (const name of ['rat', 'entwicklungen', 'bestimmung']) {
          const d = document.getElementById(`dlg-${name}`);
          if (d.open) api.rerenderDialog(name);
        }
      } else if (kind === 'view') {
        const turned = detail.before.turn !== detail.after.turn;
        renderTopbar(api);
        renderMessages(api);
        renderOrtsliste(api);
        renderRatsleiste(api);
        api.setPhase(model.phase);
        api.view.invalidateColours();
        api.view.changed();
        minimap.draw();
        if (turned) api.seasonCard(model.zeit);
        if (model.zz) api.setPanel(model.panel ?? 'welt');
        else refreshPanels();
        api.announce(t.fmt('board.announce.season', { time: t.fmt('board.time', { season: model.zeit.saison, year: model.zeit.jahr }), phase: t(`phase.${model.kernPhase}`, model.kernPhase) }));
      } else if (kind === 'status' || kind === 'report') {
        if (kind === 'report') {
          renderResources(api, { bump: model.ressourcen.filter((r) => r.verlauf?.length).map((r) => r.key) });
          api.view.changed();
        }
        renderMessages(api, { freshId: 'weltgeschehen' });
        renderWeltgeschehen(api);
      } else if (kind === 'chronik' && detail) {
        api.streamChronicle(detail);
      } else if (kind === 'sealed') {
        api.setPhase('A');
        renderMessages(api, { freshId: 'weltgeschehen' });
        api.setPanel('welt');
      }
    });
  }

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

  /* Language: everything visible is rendered again in place, no reload. Modal
     dialogs keep the rest of the page inert, so none is open while it changes. */

  onLanguage(() => {
    game?.relabel();
    applyStatic();
    renderSprache();
    renderLayers();
    renderTopbar(api);
    renderOrders(api);
    renderMessages(api);
    renderEndTurn(api);
    renderOrtsliste(api);
    renderRatsleiste(api);
    refreshPanels();
    api.setPhase(model.phase);
    api.view.changed();
    minimap.draw();
    api.announce(t('board.announce.language'));
  });

  /* First render */

  applyStatic();
  renderSprache();
  renderTopbar(api);
  renderOrders(api);
  renderMessages(api);
  renderEndTurn(api);
  renderOrtsliste(api);
  renderRatsleiste(api);
  if (game && model.zz) model.panel = 'welt';
  refreshPanels();
  api.setPhase(model.phase);
  minimap.draw();
  document.documentElement.dataset.ready = 'true';
  if (game) document.documentElement.dataset.campaign = game.cid;
  // Handle for the browser tests and the console; the board reads nothing back from it.
  window.spielbrett = api;
  if (game) initEreignisse(api);
  return api;
}

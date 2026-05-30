// Bootstrap, Hash-Routing, Datei-Upload, Einstellungen, Bildgenerierung, Export.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "js/app.js".
import { parseSavegame } from './parse.js';
import { setState, getState, subscribe } from './state.js';
import { el, toast } from './components/ui.js';
import * as store from './store.js';
import { diffStates } from './diff.js';
import { renderCommandBar } from './commands.js';
import { MODELS, generateImage } from './images/gemini.js';
import { makeKey, cacheGet, cachePut } from './images/cache.js';
import { renderLage } from './render/overview.js';
import { renderBerater } from './render/advisors.js';
import { renderWelt } from './render/actors.js';
import { renderKarte } from './render/map.js';
import { renderHistorie } from './render/history.js';

const VIEWS = ['lage', 'berater', 'welt', 'karte', 'historie'];
const LS = {
  apiKey: 'realmcraft.apiKey',
  modelPortrait: 'realmcraft.model.portrait',
  modelMap: 'realmcraft.model.map',
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const roman = (n) => ROMAN[n] || String(n);

// API-Key: bevorzugt der vom Nutzer gespeicherte; sonst ein Laufzeit-Key aus
// .env (über serve.mjs als window.__RC_ENV__ eingespeist). So funktioniert die
// Bildgenerierung lokal ohne manuelle Eingabe, ohne dass der Key ins Repo kommt.
const envApiKey = () => (typeof window !== 'undefined' && window.__RC_ENV__ && window.__RC_ENV__.GEMINI_API_KEY) || '';
const getApiKey = () => (localStorage.getItem(LS.apiKey) || envApiKey() || '').trim();

// Update-Loop-Zustand: Delta fuer den naechsten Render, aktuell betrachteter Verlaufsindex.
let pendingDelta = null;
let viewIndex = -1;

// --- DOM-Referenzen aus dem Scaffold (index.html) ---
const $ = (sel, root = document) => root.querySelector(sel);
const els = {
  wrap: $('.wrap'),
  nav: $('nav.tabs'),
  emptyState: $('[data-testid="empty-state"]'),
  loadBtn: $('[data-testid="load-btn"]'),
  emptyLoadBtn: $('[data-testid="empty-load-btn"]'),
  loadInput: $('[data-testid="load-input"]'),
  exportBtn: $('[data-testid="export-btn"]'),
  settingsBtn: $('[data-testid="settings-btn"]'),
  settingsDialog: $('[data-testid="settings-dialog"]'),
  apiKeyInput: $('[data-testid="api-key-input"]'),
  modelPortrait: $('[data-testid="model-portrait"]'),
  modelMap: $('[data-testid="model-map"]'),
  saveSettings: $('[data-testid="save-settings"]'),
  settingsCancel: $('[data-testid="settings-cancel"]'),
  settingsClose: $('[data-testid="settings-close"]'),
  views: Object.fromEntries(VIEWS.map((v) => [v, $(`[data-view="${v}"]`)])),
};

// Persistente Realm-Leiste (Hero), oberhalb der umschaltbaren Views — bleibt
// auf jeder Route sichtbar, sobald ein Stand geladen ist.
const hero = el('section', { class: 'hero', id: 'realm-hero', hidden: true });
if (els.nav && els.nav.parentNode) {
  els.nav.insertAdjacentElement('afterend', hero);
} else if (els.wrap) {
  els.wrap.prepend(hero);
}

const handlers = {
  onGeneratePortrait,
  onGenerateMap,
};

// ---------------------------------------------------------------------------
// Rendern
// ---------------------------------------------------------------------------
function renderHero(state) {
  hero.replaceChildren();
  if (!state) return;
  const { meta = {}, volk = {}, status = {} } = state;
  const zeit = meta.zeit || {};
  const evGewuerfelt = meta.weltereignis === 'gewürfelt';

  const badges = el('div', { class: 'badges' }, [
    el('span', { class: 'badge', 'data-testid': 'chapter' }, [
      el('span', { class: 'dot' }), document.createTextNode(`Kapitel ${roman(meta.kapitel)}`),
    ]),
    el('span', { class: 'badge', 'data-testid': 'season' }, [
      el('span', { class: 'dot' }), document.createTextNode(`${zeit.jahreszeit || '–'}, Jahr ${zeit.jahr ?? '–'}`),
    ]),
    el('span', { class: `badge ${evGewuerfelt ? 'live' : 'amber'}`, 'data-testid': 'worldevent' }, [
      el('span', { class: 'dot' }), document.createTextNode(`Weltereignis ${evGewuerfelt ? 'gewürfelt' : 'noch offen'}`),
    ]),
  ]);

  const crestMeta = el('div', { class: 'crest-meta' }, [
    volk.ausrichtung ? metaItem('Ausrichtung', volk.ausrichtung) : null,
    volk.region?.name ? metaItem('Heimatregion', volk.region.name) : null,
  ]);

  const crest = el('div', { class: 'crest' }, [
    badges,
    el('h1', { class: 'realm-name' }, [
      el('span', { class: 'the', text: 'Das Volk' }),
      el('span', { 'data-testid': 'realm-name', text: volk.name || '' }),
    ]),
    volk.wesensart ? el('div', { class: 'realm-essence', text: volk.wesensart }) : null,
    volk.erscheinung ? el('p', { class: 'realm-desc', text: volk.erscheinung }) : null,
    crestMeta,
  ]);

  // Ansehen
  const ansehen = status.ansehen || {};
  const max = 3;
  const stars = el('div', { class: 'stars' },
    Array.from({ length: max }, (_, i) => el('span', { class: i < (ansehen.stufe || 0) ? 'on' : 'off', text: '★' })),
  );
  const renown = el('section', { class: 'renown', 'data-testid': 'ansehen' }, [
    el('div', { class: 'lbl', text: 'Ansehen' }),
    stars,
    el('div', { class: 'rstage', text: `Stufe ${ansehen.stufe ?? '–'} von ${max}` }),
    ansehen.label ? el('div', { class: 'rdesc', text: ansehen.label }) : null,
    status.text ? el('div', { class: 'rfoot', text: status.text }) : null,
  ]);

  hero.append(crest, renown);
}

function metaItem(k, v) {
  return el('div', { class: 'm' }, [
    el('span', { class: 'k', text: k }),
    el('span', { class: 'v', text: v }),
  ]);
}

function renderAll(state, delta) {
  renderHero(state);
  renderLage(els.views.lage, state, { delta });
  renderBerater(els.views.berater, state, handlers);
  renderWelt(els.views.welt, state);
  renderKarte(els.views.karte, state, handlers);
  renderHistorie(els.views.historie, state);
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------
function currentView() {
  const m = (location.hash || '').match(/^#\/([a-z]+)/);
  const v = m && m[1];
  return VIEWS.includes(v) ? v : 'lage';
}

function applyRoute() {
  const hasState = !!getState();
  const view = currentView();

  els.emptyState.hidden = hasState;
  els.nav.hidden = !hasState;
  hero.hidden = !hasState;

  for (const v of VIEWS) {
    els.views[v].hidden = !(hasState && v === view);
  }
  els.nav.querySelectorAll('[data-tab]').forEach((tab) => {
    if (tab.dataset.tab === view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
}

// ---------------------------------------------------------------------------
// Datei laden
// ---------------------------------------------------------------------------
function handleSavegameText(text) {
  const res = parseSavegame(text);
  if (!res.ok) {
    toast(res.error || 'Speicherstand konnte nicht gelesen werden.');
    return;
  }
  // Delta zum vorigen Stand berechnen, neuen Stand in den lokalen Verlauf legen.
  const prev = getState() || store.loadLast();
  pendingDelta = diffStates(prev, res.data);
  store.saveSnapshot(res.data);
  viewIndex = store.list().length - 1;
  setState(res.data);
}

// Fuellt die Kapitel-Historie-Auswahl; blendet sie unter zwei Staenden aus.
function refreshHistorySelect() {
  const sel = document.querySelector('[data-testid="history-select"]');
  if (!sel) return;
  const items = store.list();
  if (items.length < 2) {
    sel.hidden = true;
    sel.replaceChildren();
    return;
  }
  sel.hidden = false;
  sel.replaceChildren(
    ...items.map((it) => {
      const opt = el('option', { value: String(it.index) }, [
        `Kapitel ${it.kapitel ?? '?'}, ${it.jahreszeit || ''} ${it.jahr ?? ''}`.trim(),
      ]);
      if (it.index === viewIndex) opt.selected = true;
      return opt;
    }),
  );
}

async function handleFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    handleSavegameText(text);
  } catch (e) {
    toast(`Datei konnte nicht gelesen werden: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------
function openSettings() {
  els.apiKeyInput.value = getApiKey();
  els.modelPortrait.value = localStorage.getItem(LS.modelPortrait) || MODELS.portrait;
  els.modelMap.value = localStorage.getItem(LS.modelMap) || MODELS.map;
  if (typeof els.settingsDialog.showModal === 'function') els.settingsDialog.showModal();
  else els.settingsDialog.setAttribute('open', '');
}

function closeSettings() {
  if (typeof els.settingsDialog.close === 'function' && els.settingsDialog.open) els.settingsDialog.close();
  else els.settingsDialog.removeAttribute('open');
}

function saveSettings() {
  localStorage.setItem(LS.apiKey, els.apiKeyInput.value.trim());
  localStorage.setItem(LS.modelPortrait, els.modelPortrait.value.trim() || MODELS.portrait);
  localStorage.setItem(LS.modelMap, els.modelMap.value.trim() || MODELS.map);
  closeSettings();
}

// ---------------------------------------------------------------------------
// Bildgenerierung
// ---------------------------------------------------------------------------
const portraitModel = () => localStorage.getItem(LS.modelPortrait) || MODELS.portrait;
const mapModel = () => localStorage.getItem(LS.modelMap) || MODELS.map;

function portraitKey(b, state) {
  return makeKey([b.id, b.erscheinung || '', state.meta?.visualStyle || '', portraitModel()]);
}
function mapKey(state) {
  return makeKey(['map', state.karte?.prompt || '', state.meta?.mapStyle || '', mapModel()]);
}
function portraitImg(id) {
  return document.querySelector(`[data-testid="advisor-card"][data-id="${id}"] [data-testid="advisor-portrait"]`);
}

async function onGeneratePortrait(beraterId) {
  const state = getState();
  if (!state) return;
  const b = (state.berater || []).find((x) => x.id === beraterId);
  if (!b) return;
  const img = portraitImg(beraterId);
  const key = portraitKey(b, state);

  const cached = await cacheGet(key);
  if (cached) {
    if (img) img.src = cached;
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    toast('Kein API-Key. Bitte in den Einstellungen einen Gemini-Key hinterlegen.');
    openSettings();
    return;
  }

  const prompt = `${state.meta?.visualStyle || ''} Portrait von ${b.name}, ${b.rolle || ''}. ${b.erscheinung || ''}`.trim();
  try {
    const { dataUrl } = await generateImage({ apiKey, model: portraitModel(), prompt });
    await cachePut(key, dataUrl);
    if (img) img.src = dataUrl;
  } catch (e) {
    toast(e.message);
  }
}

async function onGenerateMap() {
  const state = getState();
  if (!state || !state.karte) return;
  const img = document.querySelector('[data-testid="map-image"]');
  const key = mapKey(state);

  const cached = await cacheGet(key);
  if (cached) {
    if (img) img.src = cached;
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    toast('Kein API-Key. Bitte in den Einstellungen einen Gemini-Key hinterlegen.');
    openSettings();
    return;
  }

  try {
    const { dataUrl } = await generateImage({
      apiKey, model: mapModel(), prompt: state.karte.prompt || '', aspectRatio: '16:9',
    });
    await cachePut(key, dataUrl);
    if (img) img.src = dataUrl;
  } catch (e) {
    toast(e.message);
  }
}

// Befüllt Portraits/Karte aus eingebetteten dataUrls oder dem Cache, ohne API.
async function hydrateImages(state) {
  for (const b of state.berater || []) {
    const img = portraitImg(b.id);
    if (!img) continue;
    const key = portraitKey(b, state);
    if (b.portrait?.dataUrl) {
      img.src = b.portrait.dataUrl;
      cachePut(key, b.portrait.dataUrl);
      continue;
    }
    if (img.getAttribute('src')) continue;
    const cached = await cacheGet(key);
    if (cached) img.src = cached;
  }

  const mapImg = document.querySelector('[data-testid="map-image"]');
  if (mapImg && state.karte && !mapImg.getAttribute('src')) {
    const cached = await cacheGet(mapKey(state));
    if (cached) mapImg.src = cached;
  }
}

// ---------------------------------------------------------------------------
// Export-Bundle (mit eingebetteten Portrait-dataUrls)
// ---------------------------------------------------------------------------
async function onExport() {
  const state = getState();
  if (!state) {
    toast('Kein Speicherstand geladen.');
    return;
  }
  const bundle = JSON.parse(JSON.stringify(state));

  for (const b of bundle.berater || []) {
    const cached = await cacheGet(portraitKey(b, state));
    if (cached) b.portrait = { ...(b.portrait || {}), dataUrl: cached };
  }
  const mapCached = await cacheGet(mapKey(state));
  if (mapCached && bundle.karte) bundle.karte.dataUrl = mapCached;

  const name = (state.meta?.spielname || 'stand').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `realmcraft-${name || 'stand'}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------------------
// Verdrahtung
// ---------------------------------------------------------------------------
function wire() {
  // Befehlsleiste (immer sichtbar): Slash-Befehle fuer den Spielleiter-Chat.
  const cmdHost = document.querySelector('[data-testid="command-bar"]');
  if (cmdHost) {
    renderCommandBar(cmdHost, {
      onCopy: (text) => toast(`${text} kopiert, im Spielleiter-Chat einfuegen.`),
    });
  }

  subscribe((state) => {
    renderAll(state, pendingDelta);
    applyRoute();
    hydrateImages(state);
    refreshHistorySelect();
  });

  // Kapitel-Historie: Umschalten zwischen gespeicherten Staenden (ohne Delta).
  const histSel = document.querySelector('[data-testid="history-select"]');
  histSel?.addEventListener('change', () => {
    const snap = store.getAt(Number(histSel.value));
    if (snap) {
      viewIndex = Number(histSel.value);
      pendingDelta = null;
      setState(snap);
    }
  });

  window.addEventListener('hashchange', applyRoute);

  els.nav.querySelectorAll('[data-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      location.hash = `#/${tab.dataset.tab}`;
    });
  });

  els.loadBtn?.addEventListener('click', () => els.loadInput.click());
  els.emptyLoadBtn?.addEventListener('click', () => els.loadInput.click());
  els.loadInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    handleFile(file);
    e.target.value = '';
  });

  els.exportBtn?.addEventListener('click', onExport);

  els.settingsBtn?.addEventListener('click', openSettings);
  els.saveSettings?.addEventListener('click', saveSettings);
  els.settingsCancel?.addEventListener('click', closeSettings);
  els.settingsClose?.addEventListener('click', closeSettings);

  // Drag & Drop
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  });

  // Einfügen (Strg+V) eines Speicherstand-Textes
  window.addEventListener('paste', (e) => {
    if (getState()) return; // nur im Leerzustand als Komfort
    const text = e.clipboardData?.getData('text');
    if (text && text.trim()) {
      e.preventDefault();
      handleSavegameText(text);
    }
  });

  // Auto-Restore: zuletzt geladenen Stand wiederherstellen, ohne Delta-Banner.
  const restored = store.loadLast();
  if (restored) {
    viewIndex = store.list().length - 1;
    pendingDelta = null;
    setState(restored);
  }

  applyRoute();

  // Live-Modus: gegen den lokalen Server spiegeln, was der Terminal-Spielleiter
  // in savegame.json schreibt. Greift nur, wenn die Datei existiert.
  wireLive();
}

// Lädt savegame.json vom Server (Terminal-Modus) und abonniert Änderungen per
// SSE. Ohne Datei (404), ohne http (file://) oder ohne Server-Unterstützung ein
// No-op, damit Chat-Modus und Tests unberührt bleiben.
async function wireLive() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;

  const loadLive = async () => {
    try {
      const res = await fetch('savegame.json', { cache: 'no-store' });
      if (!res.ok) return false;
      handleSavegameText(await res.text());
      return true;
    } catch {
      return false;
    }
  };

  const present = await loadLive();
  if (!present) return; // kein Live-Spielstand: kein SSE öffnen

  toast('Live-Modus: savegame.json wird gespiegelt.');
  try {
    const es = new EventSource('events');
    es.addEventListener('savegame', () => loadLive());
  } catch {
    // EventSource nicht verfügbar: einmaliges Laden genügt.
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wire);
} else {
  wire();
}

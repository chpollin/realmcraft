// Bootstrap, hash routing, file loading, settings and the image flow.
// Contract: docs/Frontend-Contract.md, section "js/app.js".
import { parseSavegame } from './parse.js';
import { setState, getState, subscribe } from './state.js';
import { el, toast } from './components/ui.js';
import * as store from './store.js';
import { gameKey } from './store.js';
import { diffStates } from './diff.js';
import { MODELS, generateImage, toRefImage } from './images/gemini.js';
import { cacheGet, cachePut } from './images/cache.js';
import {
  identityOf, karteChronik, aktiverKarteStand, fortschreibenPrompt, versionKey, bildVersLabel,
} from './images/prompts.js';
import { BILDTYPEN, findBild, fortschreibenButton } from './images/registry.js';
import { migrateLegacy, verList, verPush, aktGet, aktSet } from './images/versions.js';
import { buildExportBundle, downloadBundle } from './export.js';
import { wireLive } from './live.js';
import { demoPicker } from './demo.js';
import { renderHero } from './render/hero.js';
import { renderLage } from './render/overview.js';
import { renderLebenswelt } from './render/lebenswelt.js';
import { renderBerater } from './render/advisors.js';
import { renderArmee } from './render/armee.js';
import { renderWelt } from './render/actors.js';
import { renderKarte } from './render/map.js';
import { renderHistorie } from './render/history.js';
import { renderRecht } from './render/recht.js';
import { roman } from './format.js';

const VIEWS = ['lage', 'lebenswelt', 'berater', 'armee', 'welt', 'karte', 'historie', 'recht'];
const LS = {
  apiKey: 'realmcraft.apiKey',
  modelPortrait: 'realmcraft.model.portrait',
  modelMap: 'realmcraft.model.map',
};
const NO_KEY_MSG = 'Kein API-Key. Bitte in den Einstellungen einen Gemini-Key hinterlegen.';

// The key saved by the user wins; otherwise a runtime key from .env, injected
// by serve.mjs as window.__RC_ENV__, so local generation works without manual
// entry and without the key entering the repository.
const envApiKey = () => (typeof window !== 'undefined' && window.__RC_ENV__ && window.__RC_ENV__.GEMINI_API_KEY) || '';
const getApiKey = () => (localStorage.getItem(LS.apiKey) || envApiKey() || '').trim();

// pendingDelta is consumed by the next render, lastDelta keeps it for
// re-renders of the same state (image switches), so the banner survives them.
let pendingDelta = null;
let lastDelta = null;
let viewIndex = -1;
// Party of the loaded state; scopes the image version store.
let aktuellePartie = null;
// Map stand picked in the chronicle (null = the state's aktuellerStand). Reset
// when the party changes or the game master advances aktuellerStand, otherwise
// an old pick would hide the new stand.
let karteStandId = null;
let letzterKarteStand = null;

const $ = (sel, root = document) => root.querySelector(sel);
const els = {
  wrap: $('.wrap'),
  nav: $('nav.tabs'),
  emptyState: $('[data-testid="empty-state"]'),
  loadBtn: $('[data-testid="load-btn"]'),
  emptyLoadBtn: $('[data-testid="empty-load-btn"]'),
  loadInput: $('[data-testid="load-input"]'),
  demoSelect: $('[data-testid="demo-select"]'),
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

// The hero stays visible on every route once a state is loaded. It sits at
// the top of <main>, because it carries the page's h1.
const hero = el('section', { class: 'hero', id: 'realm-hero', hidden: true });
els.wrap?.prepend(hero);

const handlers = {
  onGeneratePortrait: (id) => generate('berater', id),
  onGenerateMap: () => generate('karte', null),
  onGenerateArmeeBild: () => generate('armee', null),
  onGenerateVerband: (id) => generate('verband', id),
  onGenerateMacht: (id) => generate('macht', id),
  onGenerateGruppe: (id) => generate('gruppe', id),
  onGenerateSiedlung: (id) => generate('siedlung', id),
  onSelectKarteStand,
  onGenerateKarteStand,
  getKarteStandId: () => karteStandId,
  onGenerateEreignisbild,
  onBildFortschreiben,
  onWaehleBildVersion,
  bildVersionen: (typ, id) => verList(aktuellePartie, identityOf(typ, id)),
  aktiveBildVersion: (typ, id) => aktGet(aktuellePartie, identityOf(typ, id)),
};

function renderAll(state, delta) {
  renderHero(hero, state);
  renderLage(els.views.lage, state, { delta });
  renderLebenswelt(els.views.lebenswelt, state, handlers);
  renderBerater(els.views.berater, state, handlers);
  renderArmee(els.views.armee, state, handlers);
  renderWelt(els.views.welt, state, handlers);
  renderKarte(els.views.karte, state, handlers);
  renderHistorie(els.views.historie, state, handlers);
  renderRecht(els.views.recht, state);
}

// Re-render of the current state after an image choice; renders replace the
// <img> elements, so the images are hydrated again.
function rerender(state) {
  renderAll(state, lastDelta);
  hydrateImages(state);
}

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

// opts.demo loads a demo state ephemerally, without delta banner and without a
// history entry; otherwise switching demos would diff two unrelated parties.
function handleSavegameText(text, { demo = false } = {}) {
  const res = parseSavegame(text);
  if (!res.ok) {
    toast(res.error || 'Speicherstand konnte nicht gelesen werden.', { error: true });
    return;
  }
  if (demo) {
    pendingDelta = null;
    setState(res.data);
    return;
  }
  // Delta only against the last state of the same party; the first load of a
  // party has no predecessor and shows no banner.
  const prev = store.lastForParty(gameKey(res.data));
  pendingDelta = diffStates(prev, res.data);
  if (store.saveSnapshot(res.data) < 0) toast('Lokaler Verlauf voll oder gesperrt: dieser Stand wurde nicht gesichert.', { error: true });
  viewIndex = store.list().length - 1;
  setState(res.data);
}

// History select of the current party; hidden below two states. Labels carry
// chapter, season and a short timestamp, because in live mode the game master
// often saves several times per season.
function refreshHistorySelect() {
  const sel = document.querySelector('[data-testid="history-select"]');
  if (!sel) return;
  const aktuell = gameKey(getState());
  const items = store.list().filter((it) => !aktuell || (it.spielname || null) === aktuell);
  if (items.length < 2) {
    sel.hidden = true;
    sel.replaceChildren();
    return;
  }
  const wann = (ms) => {
    if (!ms) return '';
    try {
      return new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };
  const neuester = items[items.length - 1].index;
  sel.hidden = false;
  sel.replaceChildren(
    ...items.map((it) => {
      const kapitel = it.kapitel != null ? `Kapitel ${roman(it.kapitel)}` : 'Kapitel ?';
      const saison = `${it.jahreszeit || ''} ${it.jahr ?? ''}`.trim();
      const teile = [kapitel, saison, wann(it.savedAt)].filter(Boolean).join(', ');
      const label = it.index === neuester ? `${teile} (neuester)` : teile;
      const opt = el('option', { value: String(it.index) }, [label]);
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
    toast(`Datei konnte nicht gelesen werden: ${e.message}`, { error: true });
  }
}

function openSettings() {
  // Show only the explicitly saved override, not the .env fallback; otherwise
  // a click on save would freeze the current .env key into localStorage, where
  // it would shadow every later .env key.
  els.apiKeyInput.value = localStorage.getItem(LS.apiKey) || '';
  els.apiKeyInput.placeholder = envApiKey()
    ? 'Schlüssel aus .env aktiv — Feld leer lassen, um ihn zu nutzen'
    : 'Gemini API-Key (beginnt mit AIza… oder AQ.…)';
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
  // An empty field removes the override so the .env key applies again.
  const apiKey = els.apiKeyInput.value.trim();
  if (apiKey) localStorage.setItem(LS.apiKey, apiKey);
  else localStorage.removeItem(LS.apiKey);
  localStorage.setItem(LS.modelPortrait, els.modelPortrait.value.trim() || MODELS.portrait);
  localStorage.setItem(LS.modelMap, els.modelMap.value.trim() || MODELS.map);
  closeSettings();
}

// ---------------------------------------------------------------------------
// Image flow
// ---------------------------------------------------------------------------
const portraitModel = () => localStorage.getItem(LS.modelPortrait) || MODELS.portrait;
const mapModel = () => localStorage.getItem(LS.modelMap) || MODELS.map;
const modelFor = (role) => (role === 'map' ? mapModel() : portraitModel());
const isDataUrl = (u) => typeof u === 'string' && u.startsWith('data:');

// Where an image comes from, the same rule for every type. A cached data URL is
// this browser's image under the exact prompt key, possibly paid for, and wins
// over an imported one. The URL embedded in the state comes next and is
// mirrored into the cache when it is a data URL. A cached path (from a slim
// demo state) comes last: a later demo build may have moved the file it names,
// and the embedded field of the current state is the fresher pointer.
async function bildUrl(def, e, state, key) {
  const cached = await cacheGet(key);
  if (isDataUrl(cached)) return cached;
  const embedded = def.embedded(e, state);
  if (embedded) {
    if (isDataUrl(embedded)) cachePut(key, embedded);
    return embedded;
  }
  return cached || null;
}

// Keys of running API calls: a second click while one runs would pay twice.
const inFlight = new Set();
function setBusy(selector, busy) {
  const btn = document.querySelector(selector);
  if (!btn) return;
  if (busy) btn.setAttribute('aria-busy', 'true');
  else btn.removeAttribute('aria-busy');
}

// Order pinned by E2E: a cache hit makes no request; a missing API key toasts
// and opens the settings without generating; otherwise generate, cache, show.
// The <img> is looked up again after the call, because a live re-render during
// the 10 to 60 seconds replaces it; stillCurrent() guards against showing the
// image on an entity whose prompt changed meanwhile.
async function generateInto({ key, model, prompt, aspectRatio, refs, imgSel, btnSel, stillCurrent }) {
  // Marked before the first await, so a second click in the same tick sees it.
  if (inFlight.has(key)) return;
  inFlight.add(key);
  try {
    const cached = await cacheGet(key);
    if (cached) {
      const img = document.querySelector(imgSel);
      if (img) img.src = cached;
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      toast(NO_KEY_MSG);
      openSettings();
      return;
    }

    setBusy(btnSel, true);
    const refImages = refs ? await refs() : [];
    const { dataUrl } = await generateImage({ apiKey, model, prompt, aspectRatio, refImages });
    await cachePut(key, dataUrl);
    const img = document.querySelector(imgSel);
    if (img && stillCurrent()) img.src = dataUrl;
  } catch (e) {
    toast(e.message, { error: true });
  } finally {
    inFlight.delete(key);
    setBusy(btnSel, false);
  }
}

// Reference images: the advisor's reference photo, or for a map stand built on
// a previous one, that stand's image (image-to-image).
async function refsFor(typ, e, state) {
  const urls = [];
  if (typ === 'berater' && e.referenz?.dataUrl) urls.push(e.referenz.dataUrl);
  if (typ === 'karte-stand' && e.basiertAuf) {
    const def = BILDTYPEN['karte-stand'];
    const vorg = karteChronik(state).find((x) => x.id === e.basiertAuf);
    const url = vorg && await bildUrl(def, vorg, state, def.key(vorg, state, mapModel()));
    if (url) urls.push(url);
  }
  return (await Promise.all(urls.map(toRefImage))).filter(Boolean);
}

async function generate(typ, id) {
  const state = getState();
  const e = findBild(state, typ, id);
  if (!e) return;
  const def = BILDTYPEN[typ];
  const model = modelFor(def.role);
  const key = def.key(e, state, model);
  await generateInto({
    key,
    model,
    prompt: def.prompt(e, state),
    aspectRatio: def.aspect,
    refs: () => refsFor(typ, e, state),
    imgSel: def.img(id),
    btnSel: def.button(id),
    stillCurrent: () => {
      const cur = getState();
      const ce = findBild(cur, typ, id);
      if (!ce || def.key(ce, cur, model) !== key) return false;
      return typ !== 'karte-stand' || aktiverKarteStand(cur, karteStandId)?.id === id;
    },
  });
}

function onSelectKarteStand(id) {
  karteStandId = id;
  const state = getState();
  if (state) rerender(state);
}

async function onGenerateKarteStand(id) {
  const state = getState();
  if (!state || !state.karte) return;
  const entry = karteChronik(state).find((e) => e.id === id) || aktiverKarteStand(state, karteStandId);
  if (!entry) return generate('karte', null);
  return generate('karte-stand', entry.id);
}

function onGenerateEreignisbild(index) {
  const entry = (getState()?.historie || [])[index];
  if (!entry?.bild) return;
  return generate('ereignis', entry.jahre || '');
}

// Resolves (typ, id) of a versioned image: entity, identity, model and the
// base prompt and key the first generation used.
function bildSpec(typ, id, state) {
  const def = BILDTYPEN[typ];
  if (!def?.versioned) return null;
  const e = findBild(state, typ, id);
  if (!e) return null;
  const model = modelFor(def.role);
  return { def, e, identity: identityOf(typ, id), model, basePrompt: def.prompt(e, state), baseKey: def.key(e, state, model) };
}

// "Bild fortschreiben": derives a new image from the one shown and the prompt
// built from the state and its point in time, and keeps every version. The
// map keeps its own savegame-driven chronicle instead.
async function onBildFortschreiben(typ, id) {
  const state = getState();
  if (!state) return;
  const spec = bildSpec(typ, id, state);
  if (!spec) return;
  const flight = `fortschreiben:${spec.identity}`;
  if (inFlight.has(flight)) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    toast(NO_KEY_MSG);
    openSettings();
    return;
  }
  const partie = aktuellePartie;
  const btnSel = fortschreibenButton(typ, id);
  inFlight.add(flight);
  setBusy(btnSel, true);
  try {
    const liste = verList(partie, spec.identity);
    const vorlageKey = aktGet(partie, spec.identity) || (liste.length ? liste[liste.length - 1].key : null);
    const vorlageUrl = (vorlageKey && await cacheGet(vorlageKey))
      || await bildUrl(spec.def, spec.e, state, spec.baseKey)
      || document.querySelector(spec.def.img(id))?.getAttribute('src')
      || null;
    const ref = await toRefImage(vorlageUrl);
    const prompt = fortschreibenPrompt(spec.basePrompt, state);
    const vnum = liste.length + 1;
    const newKey = versionKey(spec.identity, vnum, prompt, spec.model);
    const { dataUrl } = await generateImage({ apiKey, model: spec.model, prompt, aspectRatio: spec.def.aspect, refImages: ref ? [ref] : [] });
    await cachePut(newKey, dataUrl);
    verPush(partie, spec.identity, { key: newKey, label: bildVersLabel(state, vnum), savedAt: Date.now() });
    aktSet(partie, spec.identity, newKey);
    const cur = getState();
    if (cur && gameKey(cur) === partie) rerender(cur);
  } catch (e) {
    toast(e.message, { error: true });
  } finally {
    inFlight.delete(flight);
    setBusy(btnSel, false);
  }
}

// Picks a stored version, or the origin ('__basis'), and shows it.
function onWaehleBildVersion(typ, id, value) {
  const state = getState();
  if (!state) return;
  const spec = bildSpec(typ, id, state);
  if (!spec) return;
  aktSet(aktuellePartie, spec.identity, !value || value === '__basis' ? null : value);
  rerender(state);
}

async function applyAktiveBild(partie, identity, img) {
  const key = aktGet(partie, identity);
  if (!key) return false;
  const url = await cacheGet(key);
  if (url) { img.src = url; return true; }
  return false;
}

// Fills every image from the active version, the cache or the state, without
// an API call. The map chronicle shows only the active stand in the one map
// <img>. An <img> that already has a src keeps it, because subscribe hydrates
// twice (before and after restoring bildChronik).
async function hydrateImages(state) {
  if (!state) return;
  const partie = gameKey(state);
  for (const [typ, def] of Object.entries(BILDTYPEN)) {
    const shown = typ === 'karte-stand'
      ? [aktiverKarteStand(state, karteStandId)].filter(Boolean)
      : def.list(state);
    for (const e of shown) {
      const id = def.id(e);
      const img = document.querySelector(def.img(id));
      if (!img) continue;
      if (def.versioned && await applyAktiveBild(partie, identityOf(typ, id), img)) continue;
      if (img.getAttribute('src')) continue;
      const url = await bildUrl(def, e, state, def.key(e, state, modelFor(def.role)));
      if (url) img.src = url;
    }
  }
}

// Plays an embedded bildChronik (export bundle) back into the cache and the
// version lists, so continued images with all versions appear on a foreign
// browser. Once per party and identity per session, so live mode does not
// repeat it on every render; a demo switch clears the marks. Returns whether
// versions were added, because the version selects were rendered before.
const bildChronikRestauriert = new Set();
function resetBildVersionState() {
  bildChronikRestauriert.clear();
}
async function restoreBildChronik(state) {
  const chronik = state && state.bildChronik;
  if (!chronik || typeof chronik !== 'object') return false;
  const partie = gameKey(state);
  let neu = false;
  for (const [identity, eintrag] of Object.entries(chronik)) {
    const marke = JSON.stringify([partie, identity]);
    if (bildChronikRestauriert.has(marke)) continue;
    const versionen = Array.isArray(eintrag?.versionen) ? eintrag.versionen : [];
    if (!versionen.length) continue;
    bildChronikRestauriert.add(marke);

    const bekannt = new Set(verList(partie, identity).map((v) => v.key));
    for (const v of versionen) {
      if (!v || !v.key) continue;
      if (v.dataUrl) await cachePut(v.key, v.dataUrl);
      if (!bekannt.has(v.key)) {
        verPush(partie, identity, { key: v.key, label: v.label || 'Stand', savedAt: v.savedAt || 0 });
        bekannt.add(v.key);
        neu = true;
      }
    }
    if (eintrag.aktiv && !aktGet(partie, identity)) aktSet(partie, identity, eintrag.aktiv);
  }
  return neu;
}

async function onExport() {
  const state = getState();
  if (!state) {
    toast('Kein Speicherstand geladen.', { error: true });
    return;
  }
  downloadBundle(await buildExportBundle(state, { partie: gameKey(state), modelFor }));
}

function wire() {
  subscribe((state) => {
    // The delta is consumed once per load, so a banner never leaks into a
    // later, unrelated state.
    const delta = pendingDelta;
    pendingDelta = null;
    lastDelta = delta;
    const partie = gameKey(state);
    const stand = state?.karte?.aktuellerStand ?? null;
    if (partie !== aktuellePartie || stand !== letzterKarteStand) karteStandId = null;
    aktuellePartie = partie;
    letzterKarteStand = stand;
    migrateLegacy(partie);
    renderAll(state, delta);
    applyRoute();
    restoreBildChronik(state).then((neu) => {
      if (neu && getState() === state) rerender(state);
      else hydrateImages(state);
    });
    hydrateImages(state);
    refreshHistorySelect();
  });

  // History select: switch between stored states, without delta.
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

  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    handleFile(e.dataTransfer.files[0]);
  });

  // Pasting a savegame text, as a convenience in the empty state only.
  window.addEventListener('paste', (e) => {
    if (getState()) return;
    const text = e.clipboardData?.getData('text');
    if (text && text.trim()) {
      e.preventDefault();
      handleSavegameText(text);
    }
  });

  // Auto-restore of the last loaded state, without delta banner.
  const restored = store.loadLast();
  if (restored) {
    viewIndex = store.list().length - 1;
    pendingDelta = null;
    setState(restored);
  }

  applyRoute();

  const demo = demoPicker({
    select: els.demoSelect,
    loadInput: els.loadInput,
    apply: handleSavegameText,
    hasState: () => !!getState(),
    beforeSwitch: resetBildVersionState,
  });
  demo.wire();

  // Without a live server (published page) the default sample fills the page,
  // unless a stored state was restored.
  wireLive({
    apply: handleSavegameText,
    ohneLive: () => (getState() ? null : demo.loadDefault()),
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wire);
} else {
  wire();
}

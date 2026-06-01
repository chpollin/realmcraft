// Bootstrap, Hash-Routing, Datei-Upload, Einstellungen, Bildgenerierung, Export.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "js/app.js".
import { parseSavegame } from './parse.js';
import { setState, getState, subscribe } from './state.js';
import { el, toast } from './components/ui.js';
import * as store from './store.js';
import { diffStates } from './diff.js';
import { MODELS, generateImage } from './images/gemini.js';
import { makeKey, cacheGet, cachePut } from './images/cache.js';
import { renderLage } from './render/overview.js';
import { renderLebenswelt } from './render/lebenswelt.js';
import { renderBerater } from './render/advisors.js';
import { renderArmee } from './render/armee.js';
import { renderWelt } from './render/actors.js';
import { renderKarte } from './render/map.js';
import { renderHistorie } from './render/history.js';
import { renderRecht } from './render/recht.js';
import { roman, signed } from './format.js';

const VIEWS = ['lage', 'lebenswelt', 'berater', 'armee', 'welt', 'karte', 'historie', 'recht'];
const LS = {
  apiKey: 'realmcraft.apiKey',
  modelPortrait: 'realmcraft.model.portrait',
  modelMap: 'realmcraft.model.map',
};
// Toast-Text, wenn ein Bild ohne hinterlegten API-Key erzeugt werden soll.
const NO_KEY_MSG = 'Kein API-Key. Bitte in den Einstellungen einen Gemini-Key hinterlegen.';

// API-Key: bevorzugt der vom Nutzer gespeicherte; sonst ein Laufzeit-Key aus
// .env (über serve.mjs als window.__RC_ENV__ eingespeist). So funktioniert die
// Bildgenerierung lokal ohne manuelle Eingabe, ohne dass der Key ins Repo kommt.
const envApiKey = () => (typeof window !== 'undefined' && window.__RC_ENV__ && window.__RC_ENV__.GEMINI_API_KEY) || '';
const getApiKey = () => (localStorage.getItem(LS.apiKey) || envApiKey() || '').trim();

// Update-Loop-Zustand: Delta fuer den naechsten Render, aktuell betrachteter Verlaufsindex.
let pendingDelta = null;
let viewIndex = -1;
// Partie des aktuell geladenen Stands (Spielname). Skaliert den Bild-Versions-
// Speicher, damit zwei Partien sich nicht ins Bild reden; bei jedem Render gesetzt.
let aktuellePartie = null;
function gameKey(state) {
  return state?.meta?.spielname || state?.volk?.name || null;
}

// --- DOM-Referenzen aus dem Scaffold (index.html) ---
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
  onGenerateArmeeBild,
  onGenerateVerband,
  onGenerateMacht,
  onGenerateGruppe,
  onGenerateSiedlung,
  onSelectKarteStand,
  onGenerateKarteStand,
  getKarteStandId: () => karteStandId,
  onGenerateEreignisbild,
  onBildFortschreiben,
  onWaehleBildVersion,
  bildVersionen: (typ, id) => verList(identityOf(typ, id)),
  aktiveBildVersion: (typ, id) => aktGet(identityOf(typ, id)),
};

// ---------------------------------------------------------------------------
// Rendern
// ---------------------------------------------------------------------------

// Kompakte Kernzustand-Leiste im Hero: Grundgrößen und Lagewerte als Icon+Zahl,
// damit der Kernstand von jeder Sicht aus in einem Blick lesbar ist. Icons als
// inline-SVG im Stil der Lage-Stat-Cards.
const HERO_ICONS = {
  nahrung: '<path d="M12 2C8 2 5 5 5 9c0 5 4 11 7 13 3-2 7-8 7-13 0-4-3-7-7-7z"/>',
  material: '<path d="M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  wissen: '<path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8 7h8M8 11h6"/>',
  bevoelkerung: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  verteidigung: '<path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"/>',
  mobilitaet: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  wohlstand: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
};

// dir (optional): numerischer Wert, der die Richtungsfarbe der Zahl steuert
// (>0 grün, <0 rot, 0 neutral). Nur für Lagewerte gesetzt; Grundgrößen bleiben
// neutral, da sie keine Auf/Ab-Bedeutung tragen.
function coreStat(iconKey, value, label, testid, dir) {
  const dirCls = dir == null ? '' : dir > 0 ? ' up' : dir < 0 ? ' down' : ' flat';
  return el('div', { class: 'core-stat', 'data-testid': testid, title: label }, [
    el('span', {
      class: 'core-ico',
      html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${HERO_ICONS[iconKey] || ''}</svg>`,
    }),
    el('span', { class: `core-val${dirCls}`, text: value }),
  ]);
}

function coreStrip(state) {
  const gg = state.grundgroessen || {};
  const lw = state.lagewerte || {};
  const bev = gg.bevoelkerung && typeof gg.bevoelkerung === 'object' ? gg.bevoelkerung.zahl : gg.bevoelkerung;
  const num = (v) => (typeof v === 'number' ? String(v) : '–');
  const sval = (v) => (typeof v === 'number' ? signed(v) : '–');

  return el('div', { class: 'core-strip', 'data-testid': 'core-strip' }, [
    el('div', { class: 'core-group' }, [
      coreStat('nahrung', num(gg.nahrung), 'Nahrung', 'core-nahrung'),
      coreStat('material', num(gg.material), 'Material', 'core-material'),
      coreStat('wissen', num(gg.wissen), 'Wissen', 'core-wissen'),
      coreStat('bevoelkerung', num(bev), 'Bevölkerung', 'core-bevoelkerung'),
    ]),
    el('div', { class: 'core-sep' }),
    el('div', { class: 'core-group' }, [
      coreStat('verteidigung', sval(lw.verteidigung), 'Verteidigung', 'core-verteidigung', lw.verteidigung),
      coreStat('mobilitaet', sval(lw.mobilitaet), 'Mobilität', 'core-mobilitaet', lw.mobilitaet),
      coreStat('wohlstand', sval(lw.wohlstand), 'Wohlstand', 'core-wohlstand', lw.wohlstand),
    ]),
  ]);
}

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

  const crest = el('div', { class: 'crest' }, [
    badges,
    el('h1', { class: 'realm-name' }, [
      el('span', { class: 'the', text: 'Das Volk' }),
      el('span', { 'data-testid': 'realm-name', text: volk.name || '' }),
    ]),
    coreStrip(state),
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
  ]);

  hero.append(crest, renown);
}

function renderAll(state, delta) {
  renderHero(state);
  renderLage(els.views.lage, state, { delta });
  renderLebenswelt(els.views.lebenswelt, state, handlers);
  renderBerater(els.views.berater, state, handlers);
  renderArmee(els.views.armee, state, handlers);
  renderWelt(els.views.welt, state, handlers);
  renderKarte(els.views.karte, state, handlers);
  renderHistorie(els.views.historie, state, { ...handlers, chronik: store.all() });
  renderRecht(els.views.recht, state);
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
// opts.demo: ein Demo-Stand (Picker) wird "ephemer" geladen — KEIN Delta-Banner
// und KEIN Eintrag in den lokalen Verlauf. Sonst rechnet das Dashboard den
// Unterschied zwischen zwei verschiedenen Partien aus (z. B. Karren Kap. 4 ->
// Gestrandete Kap. 1) und das Delta-Banner zeigt eine sinnlose Vermischung
// (alle Berater getauscht, "Kapitel 4 -> 1", "Ort entfallen: Die Karren").
function handleSavegameText(text, { demo = false } = {}) {
  const res = parseSavegame(text);
  if (!res.ok) {
    toast(res.error || 'Speicherstand konnte nicht gelesen werden.');
    return;
  }
  if (demo) {
    pendingDelta = null;
    setState(res.data);
    return;
  }
  // Delta nur gegen den letzten Stand DERSELBEN Partie berechnen, nie quer ueber
  // Partien (sonst eine sinnlose Vermischung). Auf der ersten Last einer Partie
  // gibt es keinen Vorgaenger -> kein Banner.
  const prev = store.lastForParty(gameKey(res.data));
  pendingDelta = diffStates(prev, res.data);
  store.saveSnapshot(res.data);
  viewIndex = store.list().length - 1;
  setState(res.data);
}

// Fuellt die Kapitel-Historie-Auswahl; blendet sie unter zwei Staenden aus.
// Die Labels muessen unterscheidbar sein: im Live-Modus speichert der Spielleiter
// oft mehrmals pro Saison, sonst lesen mehrere Eintraege identisch ("Kapitel II,
// Winter 3"). Darum Kapitel (roemisch, wie sonst im UI), Saison und ein knapper
// Zeitstempel aus savedAt; der neueste Stand wird eigens markiert.
function refreshHistorySelect() {
  const sel = document.querySelector('[data-testid="history-select"]');
  if (!sel) return;
  // Nur die Staende der aktuellen Partie nebeneinanderstellen; ein gemischter
  // Verlauf mehrerer Partien waere wirr und liesse quer springen.
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
      const teile = [kapitel, saison, wann(it.savedAt)].filter(Boolean).join(' · ');
      const label = it.index === neuester ? `${teile} · neuester` : teile;
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
    toast(`Datei konnte nicht gelesen werden: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------
function openSettings() {
  // Nur den ausdruecklich gespeicherten Override zeigen, nicht den .env-Fallback.
  // Sonst friert ein Klick auf "Speichern" den momentanen .env-Key in localStorage
  // ein, wo er ab da jeden neuen .env-Key ueberschattet (stiller 429/Limit-0-Bug).
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
  // Leeres Feld entfernt den Override, damit der .env-Key (falls vorhanden) wieder
  // greift, statt einen leeren String zu speichern, der ihn nur zufaellig durchlaesst.
  const apiKey = els.apiKeyInput.value.trim();
  if (apiKey) localStorage.setItem(LS.apiKey, apiKey);
  else localStorage.removeItem(LS.apiKey);
  localStorage.setItem(LS.modelPortrait, els.modelPortrait.value.trim() || MODELS.portrait);
  localStorage.setItem(LS.modelMap, els.modelMap.value.trim() || MODELS.map);
  closeSettings();
}

// ---------------------------------------------------------------------------
// Bildgenerierung
// ---------------------------------------------------------------------------
const portraitModel = () => localStorage.getItem(LS.modelPortrait) || MODELS.portrait;
const mapModel = () => localStorage.getItem(LS.modelMap) || MODELS.map;

// Baut den Portrait-Prompt in fester, wirksamer Reihenfolge. Der Stil (Medium,
// Kunstrichtung) kommt aus meta.visualStyle — das ist der vom Spielleiter aus dem
// Setting abgeleitete Teil. Das Geruest hier (Komposition, Welt-Anker, Ausschluss
// der KI-Tells) ist settingunabhaengig und hebt jedes Bild aus dem Default-Look.
// Reihenfolge zaehlt: Bildmodelle gewichten den Anfang am staerksten, darum steht
// das Medium zuerst und die negativen Vorgaben am Ende.
function buildPortraitPrompt(b, state) {
  const style = (state.meta?.visualStyle || '').trim();
  const region = (state.volk?.region?.name || state.volk?.name || '').trim();
  const wer = [b.name, b.rolle].filter(Boolean).join(', ');
  const look = (b.erscheinung || '').trim();

  return [
    // 1. Medium/Kunstrichtung zuerst (aus dem Spielkontext abgeleitet)
    style,
    // 2. feste Komposition gegen die zentrierte KI-Heldenpose
    'Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie',
    // 3. die Figur selbst
    [wer, look].filter(Boolean).join('. '),
    // 4. Welt-Anker, damit alle Portraits aus einer Welt stammen
    region ? `aus ${region}` : '',
    // 5. die typischen KI-Tells ausschliessen
    'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen',
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('. ');
}

// Cache-Schluessel ueber den fertigen Prompt: aendert sich Stil oder Prompt-Logik,
// invalidiert der Cache von selbst. id bleibt drin, damit zwei Berater mit
// gleicher Beschreibung dennoch getrennte Bilder behalten.
function portraitKey(b, state) {
  return makeKey([b.id, buildPortraitPrompt(b, state), portraitModel()]);
}
function mapKey(state) {
  return makeKey(['map', state.karte?.prompt || '', state.meta?.mapStyle || '', mapModel()]);
}
function portraitImg(id) {
  return document.querySelector(`[data-testid="advisor-card"][data-id="${id}"] [data-testid="advisor-portrait"]`);
}

// Armee-Bilder folgen demselben Muster wie die Portraits: Medium/Stil zuerst (aus
// meta.armeeStyle, mit visualStyle als Rueckfall), dann Komposition, dann der aus
// dem Stand abgeleitete Inhalt, dann der Welt-Anker, dann die KI-Tells als
// Ausschluss. armeeStyle ist der vom Spielleiter aus dem Setting abgeleitete Teil.
function armeeStyle(state) {
  return (state.meta?.armeeStyle || state.meta?.visualStyle || '').trim();
}

// Heerschau: ein breites Gesamtbild der Streitmacht, aus Verbaenden und Moral.
function buildHeerschauPrompt(state) {
  const a = state.armee || {};
  const region = (state.volk?.region?.name || state.volk?.name || '').trim();
  const truppen = (a.verbaende || [])
    .map((v) => [v.name, v.typ].filter(Boolean).join(' ('))
    .map((s) => (s.includes('(') ? `${s})` : s))
    .join(', ');
  return [
    armeeStyle(state),
    'weite Heerschau, eine aufgestellte Streitmacht in der Landschaft, mehrere Gruppen, dokumentarische Totale, kein einzelner Held',
    truppen ? `die Verbaende: ${truppen}` : '',
    a.moral ? `Stimmung: ${a.moral}` : '',
    (state.volk?.erscheinung || '').trim(),
    region ? `aus ${region}` : '',
    'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen',
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('. ');
}

// Verband-Avatar: ein Truppenteil als Gruppe, Wappen-/Banneranmutung statt Einzelportrait.
function buildVerbandPrompt(v, state) {
  const beraterById = Object.fromEntries((state.berater || []).map((b) => [b.id, b]));
  const fuehrer = v.fuehrungId && beraterById[v.fuehrungId] ? beraterById[v.fuehrungId].name : '';
  const region = (state.volk?.region?.name || state.volk?.name || '').trim();
  return [
    armeeStyle(state),
    'eine kleine Gruppe Krieger desselben Verbandes, Dreiviertelansicht, dokumentarisch, leicht aus der Mitte, schlichter Hintergrund, natuerliche Asymmetrie',
    [v.name, v.typ].filter(Boolean).join(', '),
    v.ausruestung ? `Ausruestung: ${v.ausruestung}` : '',
    v.verfassung ? `Verfassung: ${v.verfassung}` : '',
    fuehrer ? `gefuehrt von ${fuehrer}` : '',
    region ? `aus ${region}` : '',
    'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen',
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('. ');
}

function armeeBildKey(state) {
  return makeKey(['armee', buildHeerschauPrompt(state), portraitModel()]);
}
function verbandKey(v, state) {
  return makeKey(['verband', v.id || '', buildVerbandPrompt(v, state), portraitModel()]);
}
function armeeBildImg() {
  return document.querySelector('[data-testid="armee-bild"]');
}
function verbandImg(id) {
  return document.querySelector(`[data-testid="verband"][data-id="${id}"] [data-testid="verband-avatar"]`);
}

// Macht-Bild: eine fremde Macht als Szene/Wesen, nicht als Held. erscheinung
// fuehrt (das Finstere ist gesichtslos, der Prompt erzwingt also kein Portrait).
function buildMachtPrompt(m, state) {
  return [
    armeeStyle(state),
    'ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing',
    [m.name, m.typ].filter(Boolean).join(', '),
    (m.erscheinung || '').trim(),
    m.haltung ? `Haltung: ${m.haltung}` : '',
    'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen',
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('. ');
}

// Gruppen-Bild: die tragende Gruppe als Personengruppe bei ihrer Kompetenz,
// gefuehrt von ihrem Sprecher (Berater oder Person).
function buildGruppePrompt(gr, state) {
  const sp = (state.berater || []).find((b) => b.id === gr.sprecherId)
    || (state.personen || []).find((p) => p.id === gr.sprecherId);
  const region = (state.volk?.region?.name || state.volk?.name || '').trim();
  return [
    armeeStyle(state),
    'eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum',
    gr.name || '',
    gr.kompetenz ? `Wirken: ${gr.kompetenz}` : '',
    sp ? `Sprecher: ${sp.name}` : '',
    region ? `aus ${region}` : '',
    'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen',
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('. ');
}

function machtKey(m, state) {
  return makeKey(['macht', m.id || '', buildMachtPrompt(m, state), portraitModel()]);
}
function gruppeKey(gr, state) {
  return makeKey(['gruppe', gr.id || '', buildGruppePrompt(gr, state), portraitModel()]);
}
function machtImg(id) {
  return document.querySelector(`[data-testid="power-card"][data-id="${id}"] [data-testid="power-bild"]`);
}
function gruppeImg(id) {
  return document.querySelector(`[data-testid="group-row"][data-id="${id}"] [data-testid="gruppe-bild"]`);
}

// Siedlungen aus dem Stand lesen — gleiche Logik wie render/lebenswelt.js: die
// neue Liste lebenswelt.siedlungen, sonst das ältere Einzelobjekt state.siedlung.
// id-Fallback (id || name) muss zum Render übereinstimmen, sonst findet das <img>
// seinen Schlüssel nicht.
function siedlungenAus(state) {
  const list = Array.isArray(state.lebenswelt?.siedlungen) ? state.lebenswelt.siedlungen : [];
  if (list.length) return list;
  if (state.siedlung && state.siedlung.name) return [{ ...state.siedlung, hauptstadt: true }];
  return [];
}
function siedlungId(s) {
  return s.id || s.name || '';
}

// Siedlungsbild: ein weiter Blick auf die Siedlung, dokumentarische Totale aus dem
// Alltag, kein einzelner Held. Nutzt einen vorhandenen s.prompt, sonst aus den
// Feldern gebaut. Stil aus armeeStyle (mit visualStyle als Rueckfall), damit die
// Siedlung aus derselben Welt stammt wie Portraits und Heerschau.
function buildSiedlungPrompt(s, state) {
  if (s.prompt && s.prompt.trim()) return s.prompt.trim();
  const region = (state.volk?.region?.name || state.volk?.name || '').trim();
  return [
    armeeStyle(state),
    'ein weiter Blick auf die Siedlung eines Volkes, dokumentarische Totale, Behausungen und Menschen im Alltag, kein einzelner Held, kein heroisches Posing',
    [s.name, s.typ].filter(Boolean).join(', '),
    (s.beschreibung || s.lage || '').trim(),
    region ? `aus ${region}` : '',
    'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen',
  ]
    .map((x) => x.trim())
    .filter(Boolean)
    .join('. ');
}

function siedlungKey(s, state) {
  return makeKey(['siedlung', siedlungId(s), buildSiedlungPrompt(s, state), portraitModel()]);
}
function siedlungImg(id) {
  return document.querySelector(`[data-testid="siedlung"][data-id="${id}"] [data-testid="siedlung-bild"]`);
}

// Gemeinsamer Bild-Flow für Portrait und Karte. Hält die in E2E gepinnte
// Reihenfolge ein: ein Cache-Treffer löst keinen Netzaufruf aus; ein fehlender
// API-Key toastet und öffnet die Einstellungen, ohne zu erzeugen; sonst wird
// erzeugt, gecacht und ins <img> gesetzt, Fehler werden getoastet.
async function generateInto({ img, key, model, prompt, aspectRatio, refImages }) {
  const cached = await cacheGet(key);
  if (cached) {
    if (img) img.src = cached;
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    toast(NO_KEY_MSG);
    openSettings();
    return;
  }

  try {
    const { dataUrl } = await generateImage({ apiKey, model, prompt, aspectRatio, refImages });
    await cachePut(key, dataUrl);
    if (img) img.src = dataUrl;
  } catch (e) {
    toast(e.message);
  }
}

async function onGeneratePortrait(beraterId) {
  const state = getState();
  if (!state) return;
  const b = (state.berater || []).find((x) => x.id === beraterId);
  if (!b) return;
  const prompt = buildPortraitPrompt(b, state);
  await generateInto({ img: portraitImg(beraterId), key: portraitKey(b, state), model: portraitModel(), prompt, aspectRatio: '4:3' });
}

async function onGenerateMap() {
  const state = getState();
  if (!state || !state.karte) return;
  await generateInto({
    img: document.querySelector('[data-testid="map-image"]'),
    key: mapKey(state),
    model: mapModel(),
    prompt: state.karte.prompt || '',
    aspectRatio: '16:9',
  });
}

// --- Karten-Chronik: Folge von Karten-Ständen, jeder aus dem vorigen entwickelt.
// karteStandId merkt sich den gewählten Stand (null = aktuellerStand aus dem
// Speicherstand). Die Chronik ist optional; ohne sie verhält sich der Reiter wie
// bisher (ein Bild aus karte.prompt).
let karteStandId = null;

function karteChronik(state) {
  return Array.isArray(state.karte?.chronik) ? state.karte.chronik : [];
}

function aktiverKarteStand(state) {
  const chronik = karteChronik(state);
  if (!chronik.length) return null;
  const id = karteStandId || state.karte?.aktuellerStand;
  return chronik.find((e) => e.id === id) || chronik[chronik.length - 1];
}

// Stabiler, deterministischer Cache-Key je Stand (bleibt über Sitzungen erhalten).
function karteStandKey(state, entry) {
  return entry.bildCacheKey
    || makeKey(['map', entry.id, entry.prompt || '', state.meta?.mapStyle || '', mapModel()]);
}

function karteStandPrompt(state, entry) {
  return [state.meta?.mapStyle || '', entry.prompt || '']
    .map((s) => (s || '').trim()).filter(Boolean).join('. ');
}

function onSelectKarteStand(id) {
  karteStandId = id;
  const state = getState();
  if (!state) return;
  renderAll(state);
  // Frisch gerendertes Kartenbild (ohne src) mit dem gewählten Stand füllen.
  hydrateImages(state);
}

async function onGenerateKarteStand(id) {
  const state = getState();
  if (!state || !state.karte) return;
  const chronik = karteChronik(state);
  const entry = chronik.find((e) => e.id === id) || aktiverKarteStand(state);
  if (!entry) { await onGenerateMap(); return; }
  // Bild-zu-Bild: die vorige Karte als Vorlage, wenn dieser Stand auf ihr aufbaut.
  let refImages;
  if (entry.basiertAuf) {
    const vorg = chronik.find((e) => e.id === entry.basiertAuf);
    const vorgUrl = vorg ? await cacheGet(karteStandKey(state, vorg)) : null;
    if (vorgUrl) refImages = [vorgUrl.replace(/^data:[^,]+,/, '')];
  }
  await generateInto({
    img: document.querySelector('[data-testid="map-image"]'),
    key: karteStandKey(state, entry),
    model: mapModel(),
    prompt: karteStandPrompt(state, entry),
    aspectRatio: '16:9',
    refImages,
  });
}

async function onGenerateArmeeBild() {
  const state = getState();
  if (!state || !state.armee) return;
  await generateInto({
    img: armeeBildImg(),
    key: armeeBildKey(state),
    model: portraitModel(),
    prompt: buildHeerschauPrompt(state),
    aspectRatio: '16:9',
  });
}

async function onGenerateVerband(verbandId) {
  const state = getState();
  if (!state || !state.armee) return;
  const v = (state.armee.verbaende || []).find((x) => x.id === verbandId);
  if (!v) return;
  await generateInto({
    img: verbandImg(verbandId),
    key: verbandKey(v, state),
    model: portraitModel(),
    prompt: buildVerbandPrompt(v, state),
    aspectRatio: '4:3',
  });
}

async function onGenerateMacht(machtId) {
  const state = getState();
  if (!state) return;
  const m = (state.maechte || []).find((x) => x.id === machtId);
  if (!m) return;
  await generateInto({
    img: machtImg(machtId),
    key: machtKey(m, state),
    model: portraitModel(),
    prompt: buildMachtPrompt(m, state),
    aspectRatio: '4:3',
  });
}

async function onGenerateGruppe(gruppeId) {
  const state = getState();
  if (!state) return;
  const gr = (state.gruppen || []).find((x) => x.id === gruppeId);
  if (!gr) return;
  await generateInto({
    img: gruppeImg(gruppeId),
    key: gruppeKey(gr, state),
    model: portraitModel(),
    prompt: buildGruppePrompt(gr, state),
    aspectRatio: '4:3',
  });
}

async function onGenerateSiedlung(id) {
  const state = getState();
  if (!state) return;
  const s = siedlungenAus(state).find((x) => siedlungId(x) === id);
  if (!s) return;
  await generateInto({
    img: siedlungImg(id),
    key: siedlungKey(s, state),
    model: portraitModel(),
    prompt: buildSiedlungPrompt(s, state),
    aspectRatio: '16:9',
  });
}

// --- Ereignis-Bilder der Historie: ein Text-zu-Bild je Jahreszeit-Eintrag.
// Inhalt und Prompt von historie[].bild gehoeren dem Spielleiter (Claude 0);
// hier nur Anzeige, Erzeugung und der bildCacheKey.
function buildEreignisPrompt(entry, state) {
  return [state.meta?.visualStyle || '', entry.bild?.prompt || '']
    .map((s) => (s || '').trim()).filter(Boolean).join('. ');
}
function ereignisKey(entry, state) {
  return entry.bild?.bildCacheKey
    || makeKey(['ereignis', entry.jahre || '', buildEreignisPrompt(entry, state), portraitModel()]);
}
function ereignisImg(jahre) {
  return document.querySelector(`[data-testid="ereignis-bild"][data-jahre="${CSS.escape(jahre || '')}"]`);
}
async function onGenerateEreignisbild(index) {
  const state = getState();
  const entry = (state?.historie || [])[index];
  if (!entry?.bild) return;
  await generateInto({
    img: ereignisImg(entry.jahre),
    key: ereignisKey(entry, state),
    model: portraitModel(),
    prompt: buildEreignisPrompt(entry, state),
    aspectRatio: '16:9',
  });
}

// ---------------------------------------------------------------------------
// Bild fortschreiben: aus dem bisherigen Bild + aktuellem Stand ein neues
// ableiten und alle Staende behalten (client-seitige Bild-Chronik). Die Karte
// fuehrt ihre eigene, savegame-getriebene Karten-Chronik; hier geht es um die
// uebrigen Bilder (Berater, Armee/Verband, Macht, Gruppe, Siedlung). Die
// Versionsliste lebt in localStorage, nicht im Speicherstand (Claude 0s Lane).
// ---------------------------------------------------------------------------
const VER_NS = 'rc.imgver'; // identity -> [{ key, label, savedAt }]
const AKT_NS = 'rc.imgakt'; // identity -> aktiver Cache-Key

// Die Versions-/Auswahl-Listen werden PRO PARTIE gefuehrt, sonst zeigte eine
// Partie die fortgeschriebenen Bilder einer anderen (gleiche Identitaet
// "berater:<id>"). Der Schluessel haengt einen kompakten Partie-Hash an.
function nsKey(base) {
  return aktuellePartie ? `${base}.${makeKey([aktuellePartie])}` : base;
}
// Einmalige Migration der alten, partie-losen Listen auf die erste geladene
// Partie, damit bereits erzeugte Bilder einer laufenden Sitzung nicht verwaisen.
function migrateLegacyNs(base) {
  if (!aktuellePartie) return;
  const scoped = nsKey(base);
  if (scoped === base) return;
  try {
    if (localStorage.getItem(scoped) == null) {
      const legacy = localStorage.getItem(base);
      if (legacy != null) {
        localStorage.setItem(scoped, legacy);
        localStorage.removeItem(base); // genau einer Partie zuordnen
      }
    }
  } catch { /* localStorage optional */ }
}

function jsonLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}
function setLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Quota: optional */ }
}
function identityOf(typ, id) {
  return typ === 'armee' ? 'armee' : `${typ}:${id}`;
}
function verList(identity) {
  const all = jsonLS(nsKey(VER_NS), {});
  return Array.isArray(all[identity]) ? all[identity] : [];
}
function verPush(identity, entry) {
  const all = jsonLS(nsKey(VER_NS), {});
  const list = Array.isArray(all[identity]) ? all[identity] : [];
  list.push(entry);
  all[identity] = list;
  setLS(nsKey(VER_NS), all);
  return list;
}
function aktGet(identity) {
  return jsonLS(nsKey(AKT_NS), {})[identity] || null;
}
function aktSet(identity, key) {
  const all = jsonLS(nsKey(AKT_NS), {});
  if (key) all[identity] = key; else delete all[identity];
  setLS(nsKey(AKT_NS), all);
}

// Beim Wechsel des Standes nur die Einmal-pro-Sitzung-Markierung loeschen, damit
// die bildChronik des neuen Standes wieder eingespielt wird. Die Versions-/
// Auswahl-Listen selbst werden NICHT mehr geloescht (das vernichtete sonst die
// bereits erzeugten Bilder des Nutzers); das Durchbluten zwischen Partien
// verhindert jetzt die Partie-Skalierung der Namespaces (nsKey). Innerhalb
// derselben Partie bleiben Wahl und Versionen ueber Reloads erhalten.
function resetBildVersionState() {
  bildChronikRestauriert.clear();
}

// Loest (typ, id) gegen den Stand auf: <img>, Modell, Seitenverhaeltnis, der aus
// dem aktuellen Stand gebaute Basis-Prompt, der Basis-Cache-Key und die stabile
// Identitaet. Nutzt dieselben buildX/xKey/xImg wie die Erst-Erzeugung.
function bildSpec(typ, id, state) {
  switch (typ) {
    case 'berater': {
      const b = (state.berater || []).find((x) => x.id === id);
      if (!b) return null;
      return { identity: identityOf(typ, id), img: portraitImg(id), model: portraitModel(), aspectRatio: '4:3', basePrompt: buildPortraitPrompt(b, state), baseKey: portraitKey(b, state) };
    }
    case 'armee': {
      if (!state.armee) return null;
      return { identity: 'armee', img: armeeBildImg(), model: portraitModel(), aspectRatio: '16:9', basePrompt: buildHeerschauPrompt(state), baseKey: armeeBildKey(state) };
    }
    case 'verband': {
      const v = (state.armee?.verbaende || []).find((x) => x.id === id);
      if (!v) return null;
      return { identity: identityOf(typ, id), img: verbandImg(id), model: portraitModel(), aspectRatio: '4:3', basePrompt: buildVerbandPrompt(v, state), baseKey: verbandKey(v, state) };
    }
    case 'macht': {
      const m = (state.maechte || []).find((x) => x.id === id);
      if (!m) return null;
      return { identity: identityOf(typ, id), img: machtImg(id), model: portraitModel(), aspectRatio: '4:3', basePrompt: buildMachtPrompt(m, state), baseKey: machtKey(m, state) };
    }
    case 'gruppe': {
      const gr = (state.gruppen || []).find((x) => x.id === id);
      if (!gr) return null;
      return { identity: identityOf(typ, id), img: gruppeImg(id), model: portraitModel(), aspectRatio: '4:3', basePrompt: buildGruppePrompt(gr, state), baseKey: gruppeKey(gr, state) };
    }
    case 'siedlung': {
      const s = siedlungenAus(state).find((x) => siedlungId(x) === id);
      if (!s) return null;
      return { identity: identityOf(typ, id), img: siedlungImg(id), model: portraitModel(), aspectRatio: '16:9', basePrompt: buildSiedlungPrompt(s, state), baseKey: siedlungKey(s, state) };
    }
    default:
      return null;
  }
}

// Der "entwickelte Kontext": Jahreszeit-Stimmung, Jahr und Kapitel. Faerbt den
// Prompt eines fortgeschriebenen Bildes auf den Zeitpunkt der Partie ein.
const SAISON_STIMMUNG = {
  'Frühling': 'Frühling, neues Wachsen', 'Fruehling': 'Frühling, neues Wachsen',
  'Sommer': 'Hochsommer, volles Licht',
  'Herbst': 'Herbst, Ernte und fallendes Laub',
  'Winter': 'Winter, karge und harte Zeit',
};
function kontextHauch(state) {
  const z = state.meta?.zeit || {};
  const js = (z.jahreszeit || '').trim();
  const teile = [];
  if (js) teile.push(SAISON_STIMMUNG[js] || js);
  if (z.jahr != null) teile.push(`Jahr ${z.jahr}`);
  if (state.meta?.kapitel != null) teile.push(`Kapitel ${roman(state.meta.kapitel)}`);
  return teile.length ? `Zeitpunkt der Szene: ${teile.join(', ')}` : '';
}
function bildVersLabel(state, vnum) {
  const z = state.meta?.zeit || {};
  const saison = `${z.jahreszeit || ''} ${z.jahr ?? ''}`.trim();
  return `Stand ${vnum}${saison ? ` · ${saison}` : ''}`;
}

// Setzt, falls vorhanden, die aktive (gewaehlte) Bild-Version ins <img>. true,
// wenn ein Bild gesetzt wurde — der Aufrufer ueberspringt dann die Basis-/
// Embed-Logik in hydrateImages.
async function applyAktiveBild(identity, img) {
  const key = aktGet(identity);
  if (!key) return false;
  const url = await cacheGet(key);
  if (url) { img.src = url; return true; }
  return false;
}

// Manuell ausgeloest: leitet aus dem aktuell gezeigten Bild (Vorlage) und dem
// aus Stand + Zeitpunkt gebauten Prompt ein neues ab, behaelt es als neue
// Version und zeigt es an. Neuer, versionsindizierter Key => garantierter
// Cache-Miss => frische Erzeugung (kein stilles Zurueckfallen aufs alte Bild).
async function onBildFortschreiben(typ, id) {
  const state = getState();
  if (!state) return;
  const spec = bildSpec(typ, id, state);
  if (!spec) return;
  const apiKey = getApiKey();
  if (!apiKey) {
    toast(NO_KEY_MSG);
    openSettings();
    return;
  }
  const liste = verList(spec.identity);
  const vorlageKey = aktGet(spec.identity) || (liste.length ? liste[liste.length - 1].key : spec.baseKey);
  const vorlageUrl = (await cacheGet(vorlageKey)) || (spec.img && spec.img.getAttribute('src')) || null;
  const refImages = vorlageUrl && vorlageUrl.startsWith('data:')
    ? [vorlageUrl.replace(/^data:[^,]+,/, '')]
    : undefined;
  const prompt = [spec.basePrompt, kontextHauch(state)].filter(Boolean).join('. ');
  const vnum = liste.length + 1;
  const newKey = makeKey([spec.identity, `v${vnum}`, prompt, spec.model]);
  try {
    const { dataUrl } = await generateImage({ apiKey, model: spec.model, prompt, aspectRatio: spec.aspectRatio, refImages });
    await cachePut(newKey, dataUrl);
    verPush(spec.identity, { key: newKey, label: bildVersLabel(state, vnum), savedAt: Date.now() });
    aktSet(spec.identity, newKey);
    if (spec.img) spec.img.src = dataUrl;
    renderAll(state);
    hydrateImages(state);
  } catch (e) {
    toast(e.message);
  }
}

// Waehlt eine gespeicherte Bild-Version (oder den Ursprung) und zeigt sie an.
async function onWaehleBildVersion(typ, id, value) {
  const state = getState();
  if (!state) return;
  const spec = bildSpec(typ, id, state);
  if (!spec) return;
  if (!value || value === '__basis') {
    aktSet(spec.identity, null);
    const url = await cacheGet(spec.baseKey);
    if (spec.img && url) spec.img.src = url;
  } else {
    aktSet(spec.identity, value);
    const url = await cacheGet(value);
    if (spec.img && url) spec.img.src = url;
  }
  renderAll(state);
  hydrateImages(state);
}

// Befüllt Portraits/Karte aus eingebetteten dataUrls oder dem Cache, ohne API.
async function hydrateImages(state) {
  for (const b of state.berater || []) {
    const img = portraitImg(b.id);
    if (!img) continue;
    if (await applyAktiveBild(`berater:${b.id}`, img)) continue;
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
    const entry = aktiverKarteStand(state);
    if (entry) {
      const key = karteStandKey(state, entry);
      const cached = await cacheGet(key);
      if (cached) {
        mapImg.src = cached;
      } else if (entry.id === state.karte.aktuellerStand && state.karte.dataUrl) {
        // Das eingebettete Kartenbild gehört dem aktuellen Stand.
        mapImg.src = state.karte.dataUrl;
        cachePut(key, state.karte.dataUrl);
      }
    } else if (state.karte.dataUrl) {
      mapImg.src = state.karte.dataUrl;
      cachePut(mapKey(state), state.karte.dataUrl);
    } else {
      const cached = await cacheGet(mapKey(state));
      if (cached) mapImg.src = cached;
    }
  }

  if (state.armee) {
    const aImg = armeeBildImg();
    if (aImg && !aImg.getAttribute('src') && !(await applyAktiveBild('armee', aImg))) {
      if (state.armee.bild?.dataUrl) {
        aImg.src = state.armee.bild.dataUrl;
        cachePut(armeeBildKey(state), state.armee.bild.dataUrl);
      } else {
        const cached = await cacheGet(armeeBildKey(state));
        if (cached) aImg.src = cached;
      }
    }
    for (const v of state.armee.verbaende || []) {
      const img = verbandImg(v.id);
      if (!img) continue;
      if (await applyAktiveBild(`verband:${v.id}`, img)) continue;
      const key = verbandKey(v, state);
      if (v.avatar?.dataUrl) {
        img.src = v.avatar.dataUrl;
        cachePut(key, v.avatar.dataUrl);
        continue;
      }
      if (img.getAttribute('src')) continue;
      const cached = await cacheGet(key);
      if (cached) img.src = cached;
    }
  }

  for (const m of state.maechte || []) {
    const img = machtImg(m.id);
    if (!img) continue;
    if (await applyAktiveBild(`macht:${m.id}`, img)) continue;
    const key = machtKey(m, state);
    if (m.bild?.dataUrl) {
      img.src = m.bild.dataUrl;
      cachePut(key, m.bild.dataUrl);
      continue;
    }
    if (img.getAttribute('src')) continue;
    const cached = await cacheGet(key);
    if (cached) img.src = cached;
  }

  for (const gr of state.gruppen || []) {
    const img = gruppeImg(gr.id);
    if (!img) continue;
    if (await applyAktiveBild(`gruppe:${gr.id}`, img)) continue;
    const key = gruppeKey(gr, state);
    if (gr.bild?.dataUrl) {
      img.src = gr.bild.dataUrl;
      cachePut(key, gr.bild.dataUrl);
      continue;
    }
    if (img.getAttribute('src')) continue;
    const cached = await cacheGet(key);
    if (cached) img.src = cached;
  }

  for (const s of siedlungenAus(state)) {
    const img = siedlungImg(siedlungId(s));
    if (!img) continue;
    if (await applyAktiveBild(`siedlung:${siedlungId(s)}`, img)) continue;
    const key = siedlungKey(s, state);
    if (s.bild?.dataUrl) {
      img.src = s.bild.dataUrl;
      cachePut(key, s.bild.dataUrl);
      continue;
    }
    if (img.getAttribute('src')) continue;
    const cached = await cacheGet(key);
    if (cached) img.src = cached;
  }

  // Ereignis-Bilder der Historie (Text-zu-Bild, keine aktive Version). Auf einem
  // fremden Browser (Pages-Besucher) liegt nichts im Cache; dann das im Stand
  // eingebettete h.bild.dataUrl nehmen und in den Cache spiegeln.
  for (const h of state.historie || []) {
    if (!h.bild) continue;
    const img = ereignisImg(h.jahre);
    if (!img || img.getAttribute('src')) continue;
    const key = ereignisKey(h, state);
    const cached = await cacheGet(key);
    if (cached) {
      img.src = cached;
    } else if (h.bild.dataUrl) {
      img.src = h.bild.dataUrl;
      cachePut(key, h.bild.dataUrl);
    }
  }
}

// Spielt eine im Stand eingebettete Bild-Chronik (Export-Bundle, Feld
// bildChronik) in den lokalen Cache und die localStorage-Listen zurück, damit
// fortgeschriebene Bilder samt allen Versionen auch auf einem fremden Browser
// (GitHub Pages) erscheinen und durchblätterbar sind. Idempotent und nur je
// Identität einmal pro Sitzung, damit der Live-Modus es nicht bei jedem Render
// wiederholt. bildChronik gehört dem Frontend (additionalProperties offen).
const bildChronikRestauriert = new Set();
async function restoreBildChronik(state) {
  const chronik = state && state.bildChronik;
  if (!chronik || typeof chronik !== 'object') return;
  for (const [identity, eintrag] of Object.entries(chronik)) {
    if (bildChronikRestauriert.has(identity)) continue;
    const versionen = Array.isArray(eintrag?.versionen) ? eintrag.versionen : [];
    if (!versionen.length) continue;
    bildChronikRestauriert.add(identity);

    const liste = verList(identity);
    const bekannt = new Set(liste.map((v) => v.key));
    for (const v of versionen) {
      if (!v || !v.key) continue;
      if (v.dataUrl) await cachePut(v.key, v.dataUrl);
      if (!bekannt.has(v.key)) {
        verPush(identity, { key: v.key, label: v.label || 'Stand', savedAt: v.savedAt || 0 });
        bekannt.add(v.key);
      }
    }
    if (eintrag.aktiv && !aktGet(identity)) aktSet(identity, eintrag.aktiv);
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

  if (bundle.armee && state.armee) {
    const aCached = await cacheGet(armeeBildKey(state));
    if (aCached) bundle.armee.bild = { ...(bundle.armee.bild || {}), dataUrl: aCached };
    for (const v of bundle.armee.verbaende || []) {
      const vCached = await cacheGet(verbandKey(v, state));
      if (vCached) v.avatar = { ...(v.avatar || {}), dataUrl: vCached };
    }
  }
  for (const m of bundle.maechte || []) {
    const cached = await cacheGet(machtKey(m, state));
    if (cached) m.bild = { ...(m.bild || {}), dataUrl: cached };
  }
  for (const gr of bundle.gruppen || []) {
    const cached = await cacheGet(gruppeKey(gr, state));
    if (cached) gr.bild = { ...(gr.bild || {}), dataUrl: cached };
  }
  // Siedlungsbilder einbetten — sowohl in der neuen Liste als auch im älteren
  // siedlung-Einzelobjekt, je nachdem, was der Stand führt.
  for (const s of bundle.lebenswelt?.siedlungen || []) {
    const cached = await cacheGet(siedlungKey(s, state));
    if (cached) s.bild = { ...(s.bild || {}), dataUrl: cached };
  }
  if (bundle.siedlung && state.siedlung && !(bundle.lebenswelt?.siedlungen || []).length) {
    const cached = await cacheGet(siedlungKey({ ...state.siedlung, hauptstadt: true }, state));
    if (cached) bundle.siedlung.bild = { ...(bundle.siedlung.bild || {}), dataUrl: cached };
  }

  // Ereignis-Bilder der Historie einbetten (Text-zu-Bild je Jahreszeit).
  for (const h of bundle.historie || []) {
    if (!h.bild) continue;
    const cached = await cacheGet(ereignisKey(h, state));
    if (cached) h.bild = { ...h.bild, dataUrl: cached };
  }

  // Fortgeschriebene Bilder: die volle Bild-Chronik je Identität einbetten
  // (alle Versionen mit dataUrl + die aktive Wahl), damit sie auf einem fremden
  // Browser (Pages) durchblätterbar sind. Zusätzlich das gewählte Bild als
  // primäres dataUrl der Entität setzen, damit es auch ohne Restore sofort zeigt.
  const bildChronik = {};
  const alleVersionen = jsonLS(VER_NS, {});
  for (const [identity, liste] of Object.entries(alleVersionen)) {
    if (!Array.isArray(liste) || !liste.length) continue;
    const aktiv = aktGet(identity);
    const versionen = [];
    for (const v of liste) {
      const dataUrl = await cacheGet(v.key);
      versionen.push({ key: v.key, label: v.label, savedAt: v.savedAt, ...(dataUrl ? { dataUrl } : {}) });
    }
    bildChronik[identity] = { aktiv: aktiv || null, versionen };
  }
  if (Object.keys(bildChronik).length) bundle.bildChronik = bildChronik;

  // Das jeweils gewählte (aktive) Bild als primäres dataUrl der Entität ablegen,
  // damit ein Pages-Besucher ohne lokalen Restore sofort die aktuelle Wahl sieht.
  const aktivUrl = async (identity) => {
    const k = aktGet(identity);
    return k ? cacheGet(k) : null;
  };
  for (const b of bundle.berater || []) {
    const u = await aktivUrl(`berater:${b.id}`);
    if (u) b.portrait = { ...(b.portrait || {}), dataUrl: u };
  }
  if (bundle.armee) {
    const u = await aktivUrl('armee');
    if (u) bundle.armee.bild = { ...(bundle.armee.bild || {}), dataUrl: u };
    for (const v of bundle.armee.verbaende || []) {
      const vu = await aktivUrl(`verband:${v.id}`);
      if (vu) v.avatar = { ...(v.avatar || {}), dataUrl: vu };
    }
  }
  for (const m of bundle.maechte || []) {
    const u = await aktivUrl(`macht:${m.id}`);
    if (u) m.bild = { ...(m.bild || {}), dataUrl: u };
  }
  for (const gr of bundle.gruppen || []) {
    const u = await aktivUrl(`gruppe:${gr.id}`);
    if (u) gr.bild = { ...(gr.bild || {}), dataUrl: u };
  }
  for (const s of bundle.lebenswelt?.siedlungen || []) {
    const u = await aktivUrl(`siedlung:${siedlungId(s)}`);
    if (u) s.bild = { ...(s.bild || {}), dataUrl: u };
  }

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
  subscribe((state) => {
    // Delta einmalig verbrauchen: ein Banner erscheint genau einmal pro Last und
    // kann nicht in einen späteren, unverwandten Render durchsickern.
    const delta = pendingDelta;
    pendingDelta = null;
    // Partie-Skalierung des Bild-Speichers VOR jedem Bild-Zugriff setzen, einmal
    // die alten partie-losen Listen auf diese Partie migrieren.
    aktuellePartie = gameKey(state);
    migrateLegacyNs(VER_NS);
    migrateLegacyNs(AKT_NS);
    renderAll(state, delta);
    applyRoute();
    restoreBildChronik(state).then(() => hydrateImages(state));
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

  // Demo-Picker: mehrere ausgelagerte Demo-Stände zum Umschalten anbieten
  // (sofern examples/demo/manifest.json erreichbar ist).
  wireDemoPicker();

  // Live-Modus: gegen den lokalen Server spiegeln, was der Terminal-Spielleiter
  // in savegame.json schreibt. Greift nur, wenn die Datei existiert.
  wireLive();
}

// --- Demo-Picker: mehrere ausgelagerte Demo-Stände aus examples/demo/manifest.json
// laden und im Dashboard umschalten. Greift auf der veröffentlichten Seite (Pages)
// wie lokal. Die Stände referenzieren ihre Bilder als Dateien (Pfade statt
// data:-URIs); der bestehende Bild-Flow (img.src) verarbeitet beides gleich.
const DEMO_MANIFEST = 'examples/demo/manifest.json';
let demoManifest = null;

async function ladeDemoManifest() {
  if (demoManifest) return demoManifest;
  try {
    const res = await fetch(DEMO_MANIFEST, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.staende) || !data.staende.length) return null;
    demoManifest = data;
    return demoManifest;
  } catch {
    return null;
  }
}

async function ladeDemoStand(eintrag) {
  if (!eintrag?.pfad) return false;
  try {
    const res = await fetch(eintrag.pfad, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    // Vor dem Wechsel den fluechtigen Bild-Versionsstand des vorigen Demo-Standes
    // verwerfen, damit nichts in den neuen Stand durchblutet (sauberer Wechsel).
    resetBildVersionState();
    handleSavegameText(await res.text(), { demo: true });
    return true;
  } catch {
    return false;
  }
}

// Ein einziges Lade-Auswahlfeld: jeder Demo-Stand aus dem Manifest plus der
// Eintrag "Eigenen Speicherstand laden …", der den bestehenden Datei-Dialog
// oeffnet. So liegt das Umschalten zwischen Demos UND das Laden einer eigenen
// Datei an einer Stelle. Erscheint, sobald ein Manifest da ist (auch bei nur
// einem Demo, weil die Eigen-Option das Feld immer nuetzlich macht). Der zuletzt
// geladene Demo-Slug wird gespiegelt, damit die Eigen-Option nie "haengen" bleibt.
const PICK_OWN = '__own__';
let pickerDemoSlug = null;
async function wireDemoPicker() {
  const sel = els.demoSelect;
  if (!sel) return null;
  const manifest = await ladeDemoManifest();
  if (!manifest) { sel.hidden = true; return manifest; }

  sel.replaceChildren(
    ...manifest.staende.map((e) => {
      const teile = [e.titel || e.slug];
      if (e.kapitel != null) teile.push(`Kapitel ${roman(e.kapitel)}`);
      const saison = `${e.jahreszeit || ''} ${e.jahr ?? ''}`.trim();
      if (saison) teile.push(saison);
      return el('option', { value: e.slug }, [teile.join(' · ')]);
    }),
    el('option', { value: PICK_OWN }, ['Eigenen Speicherstand laden …']),
  );
  sel.hidden = false;
  if (pickerDemoSlug) sel.value = pickerDemoSlug;

  sel.addEventListener('change', () => {
    if (sel.value === PICK_OWN) {
      // Auswahl auf den geladenen Demo zuruecksetzen, dann den Datei-Dialog oeffnen.
      sel.value = pickerDemoSlug || manifest.staende[0]?.slug || '';
      els.loadInput?.click();
      return;
    }
    const eintrag = manifest.staende.find((e) => e.slug === sel.value);
    if (eintrag) { pickerDemoSlug = sel.value; ladeDemoStand(eintrag); }
  });
  return manifest;
}

// Voreingestellter Beispielstand für die veröffentlichte Seite: lädt den im
// Manifest als default markierten Demo-Stand (sonst den ersten), wenn kein anderer
// Stand vorliegt. Fällt ohne Manifest auf den älteren Einzelstand zurück. Fehler
// (404, Netz) werden still verschluckt — dann bleibt der Leerzustand.
async function loadDefaultSample() {
  const manifest = await ladeDemoManifest();
  if (manifest) {
    const eintrag = manifest.staende.find((e) => e.slug === manifest.default) || manifest.staende[0];
    if (await ladeDemoStand(eintrag)) {
      pickerDemoSlug = eintrag.slug;
      if (els.demoSelect) els.demoSelect.value = eintrag.slug;
      return;
    }
  }
  try {
    const res = await fetch('examples/die-gestrandeten.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return;
    handleSavegameText(await res.text());
  } catch {
    // still: ohne Beispielstand bleibt der Leerzustand mit Lade-Aufforderung.
  }
}

// Lädt savegame.json vom Server (Terminal-Modus) und abonniert Änderungen per
// SSE. Ohne Datei (404), ohne http (file://) oder ohne Server-Unterstützung ein
// No-op, damit Chat-Modus und Tests unberührt bleiben.
async function wireLive() {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;

  const loadLive = async () => {
    try {
      // Timeout, damit eine stockende Antwort die Spiegelung nicht still aufhängt.
      const res = await fetch('savegame.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!res.ok) return false;
      handleSavegameText(await res.text());
      return true;
    } catch {
      return false;
    }
  };

  const present = await loadLive();
  if (!present) {
    // Kein Live-Server (z. B. auf der veröffentlichten GitHub-Pages-Seite): den
    // voreingestellten Beispielstand laden, falls noch kein Stand da ist. So ist
    // die Seite nicht leer; ein eigener Stand lässt sich darüberladen. Greift
    // nicht im Terminal-Modus (savegame.json vorhanden) und nicht, wenn ein
    // gespeicherter Stand wiederhergestellt wurde.
    if (!getState()) await loadDefaultSample();
    return; // ohne Live-Server kein SSE
  }

  toast('Live-Modus: savegame.json wird gespiegelt.');

  // SSE-Verbindung, die sich nach endgültigem Schließen (z. B. Serverneustart)
  // einmalig mit kurzem Backoff neu aufbaut. Transiente Aussetzer reconnectet
  // EventSource selbst, daher nur bei readyState === CLOSED eingreifen.
  const connect = () => {
    let es;
    try {
      es = new EventSource('events');
    } catch {
      return; // EventSource nicht verfügbar: einmaliges Laden genügt.
    }
    es.addEventListener('savegame', () => loadLive());
    // Code-Änderung am Dev-Server: ganze Seite neu laden, damit ein offener Tab
    // nicht auf altem JS/HTML/CSS hängen bleibt (siehe serve.mjs, reload-Event).
    es.addEventListener('reload', () => location.reload());
    es.addEventListener('error', () => {
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        setTimeout(connect, 2000);
      }
    });
  };
  connect();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wire);
} else {
  wire();
}

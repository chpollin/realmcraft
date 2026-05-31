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
  onGenerateArmeeBild,
  onGenerateVerband,
  onGenerateMacht,
  onGenerateGruppe,
  onGenerateSiedlung,
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
  renderHistorie(els.views.historie, state, { chronik: store.all() });
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
async function generateInto({ img, key, model, prompt, aspectRatio }) {
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
    const { dataUrl } = await generateImage({ apiKey, model, prompt, aspectRatio });
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
    const entry = aktiverKarteStand(state);
    if (entry) {
      const key = karteStandKey(entry);
      const cached = await cacheGet(key);
      if (cached) {
        mapImg.src = cached;
      } else if (entry.id === state.karte.aktuellerStand && state.karte.dataUrl) {
        // Das eingebettete Kartenbild gehoert dem aktuellen Stand.
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
    if (aImg && !aImg.getAttribute('src')) {
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
    renderAll(state, delta);
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

// Voreingestellter Beispielstand für die veröffentlichte Seite: lädt einmalig
// examples/die-gestrandeten.json, wenn kein anderer Stand vorliegt. Fehler (404,
// Netz) werden still verschluckt — dann bleibt der Leerzustand.
async function loadDefaultSample() {
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

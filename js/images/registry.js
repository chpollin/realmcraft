// js/images/registry.js — one entry per image type. Generation, hydration, the
// version store, export and the generator tools all derive from this table,
// so a new image type is added in one place.
//
// Entry fields:
//   list(state)            entities of this type in the state
//   id(entity)             id the render module puts on the card (data-id)
//   embedded(e, state)     image URL embedded in the state (data URL or path)
//   setEmbedded(e, url)    writes the URL into the field embedded() reads
//   prompt(e, state)       prompt sent to the image API
//   key(e, state, model)   cache key (see prompts.js, pinned by keys.test.js)
//   role                   'portrait' or 'map', selects the configured model
//   aspect                 aspect ratio requested from the API
//   versioned              takes part in "Bild fortschreiben"
//   img(id), button(id)    DOM selectors of the <img> and its generate button
// DOM-free apart from CSS.escape inside the selector functions, which only the
// browser calls.
import * as P from './prompts.js';

const esc = (v) => CSS.escape(String(v ?? ''));
const inCard = (card, testid) => (id) => `[data-testid="${card}"][data-id="${esc(id)}"] [data-testid="${testid}"]`;
const fixed = (sel) => () => sel;

// field names the object that carries dataUrl (entity[field].dataUrl); without
// a field the entity carries dataUrl itself.
function embeddedIn(field) {
  return {
    embedded: (e) => (field ? e[field]?.dataUrl : e.dataUrl) || null,
    setEmbedded: (e, url) => {
      if (field) e[field] = { ...(e[field] || {}), dataUrl: url };
      else e.dataUrl = url;
    },
  };
}

export const BILDTYPEN = {
  berater: {
    list: (s) => s.berater || [],
    id: (b) => b.id,
    ...embeddedIn('portrait'),
    prompt: P.buildPortraitPrompt,
    key: P.portraitKey,
    role: 'portrait', aspect: '4:3', versioned: true,
    img: inCard('advisor-card', 'advisor-portrait'),
    button: inCard('advisor-card', 'generate-portrait'),
  },
  armee: {
    list: (s) => (s.armee ? [s.armee] : []),
    id: () => null,
    ...embeddedIn('bild'),
    prompt: (_, s) => P.buildHeerschauPrompt(s),
    key: (_, s, model) => P.armeeBildKey(s, model),
    role: 'portrait', aspect: '16:9', versioned: true,
    img: fixed('[data-testid="armee-bild"]'),
    button: fixed('[data-testid="generate-armee-bild"]'),
  },
  verband: {
    list: (s) => s.armee?.verbaende || [],
    id: (v) => v.id,
    ...embeddedIn('avatar'),
    prompt: P.buildVerbandPrompt,
    key: P.verbandKey,
    role: 'portrait', aspect: '4:3', versioned: true,
    img: inCard('verband', 'verband-avatar'),
    button: inCard('verband', 'generate-verband'),
  },
  macht: {
    list: (s) => s.maechte || [],
    id: (m) => m.id,
    ...embeddedIn('bild'),
    prompt: P.buildMachtPrompt,
    key: P.machtKey,
    role: 'portrait', aspect: '4:3', versioned: true,
    img: inCard('power-card', 'power-bild'),
    button: inCard('power-card', 'generate-macht'),
  },
  gruppe: {
    list: (s) => s.gruppen || [],
    id: (g) => g.id,
    ...embeddedIn('bild'),
    prompt: P.buildGruppePrompt,
    key: P.gruppeKey,
    role: 'portrait', aspect: '4:3', versioned: true,
    img: inCard('group-row', 'gruppe-bild'),
    button: inCard('group-row', 'generate-gruppe'),
  },
  siedlung: {
    list: P.siedlungenAus,
    id: P.siedlungId,
    ...embeddedIn('bild'),
    prompt: P.buildSiedlungPrompt,
    key: P.siedlungKey,
    role: 'portrait', aspect: '16:9', versioned: true,
    img: inCard('siedlung', 'siedlung-bild'),
    button: inCard('siedlung', 'generate-siedlung'),
  },
  ereignis: {
    list: (s) => (s.historie || []).filter((h) => h.bild),
    id: (h) => h.jahre || '',
    ...embeddedIn('bild'),
    prompt: P.buildEreignisPrompt,
    key: P.ereignisKey,
    role: 'portrait', aspect: '16:9', versioned: false,
    img: (id) => `[data-testid="ereignis-bild"][data-jahre="${esc(id)}"]`,
    button: (id) => `[data-testid="generate-ereignisbild"][data-jahre="${esc(id)}"]`,
  },
  // The single map image of a state without a map chronicle.
  karte: {
    list: (s) => (s.karte && !P.karteChronik(s).length ? [s.karte] : []),
    id: () => null,
    ...embeddedIn(null),
    prompt: (k) => k.prompt || '',
    key: (_, s, model) => P.mapKey(s, model),
    role: 'map', aspect: '16:9', versioned: false,
    img: fixed('[data-testid="map-image"]'),
    button: fixed('[data-testid="generate-map"]'),
  },
  // One map image per chronicle stand; all share the one map <img>, so
  // hydration shows only the active stand. A state exported before stands
  // carried their own dataUrl embeds the image of aktuellerStand in
  // karte.dataUrl, which stays the fallback for that stand.
  'karte-stand': {
    list: P.karteChronik,
    id: (e) => e.id,
    embedded: (e, s) => e.dataUrl || (e.id === s.karte?.aktuellerStand ? s.karte.dataUrl : null) || null,
    setEmbedded: (e, url) => { e.dataUrl = url; },
    prompt: (e, s) => P.karteStandPrompt(s, e),
    key: (e, s, model) => P.karteStandKey(s, e, model),
    role: 'map', aspect: '16:9', versioned: false,
    img: fixed('[data-testid="map-image"]'),
    button: fixed('[data-testid="generate-map"]'),
  },
};

// Finds the entity of a type by the id the handlers receive. Singletons (armee,
// karte) have the id null; handlers may pass undefined for them.
export function findBild(state, typ, id) {
  const def = BILDTYPEN[typ];
  if (!def || !state) return null;
  return def.list(state).find((e) => (def.id(e) ?? null) === (id ?? null)) || null;
}

export function fortschreibenButton(typ, id) {
  return `[data-testid="bild-fortschreiben"][data-typ="${esc(typ)}"][data-id="${esc(id)}"]`;
}

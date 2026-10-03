// js/images/prompts.js — DOM-free prompt builders and cache keys for every
// image type. Shared by the dashboard (js/app.js) and the generator tools, so a
// click in the UI and a tool run produce the same prompt for the same state.
// Keys hash the full prompt text: any byte change here orphans images users
// already paid for. tests/unit/keys.test.js pins every prompt and key.
import { makeKey } from './cache.js';
import { roman } from '../format.js';

function region(state) {
  return (state.volk?.region?.name || state.volk?.name || '').trim();
}

// Portrait prompt in a fixed order: image models weight the beginning most, so
// the medium (meta.visualStyle, derived by the game master from the setting)
// comes first and the negative constraints last. The scaffold in between
// (composition, world anchor) is setting-independent.
export function buildPortraitPrompt(b, state) {
  const style = (state.meta?.visualStyle || '').trim();
  const wer = [b.name, b.rolle].filter(Boolean).join(', ');
  const look = (b.erscheinung || '').trim();
  // A reference photo travels as refImage; this line ties the likeness to it
  // and translates the person into the world and style of the party.
  const hasRef = !!(b.referenz && b.referenz.dataUrl);

  return [
    style,
    'Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie',
    [wer, look].filter(Boolean).join('. '),
    hasRef ? 'Gesicht, Kopfform, Bart und Statur nach dem beigefuegten Referenzfoto uebernehmen, dieselbe Person, in Kleidung, Welt und Stil dieser Partie uebersetzt, Aehnlichkeit wahren' : '',
    region(state) ? `aus ${region(state)}` : '',
    'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen',
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('. ');
}

// The id stays in the key so two advisors with the same description keep
// separate images. The reference photo is folded in by length and tail, so a
// different photo (or removing it) invalidates the image even if the text
// prompt stays the same.
export function portraitKey(b, state, model) {
  const refUrl = b.referenz && b.referenz.dataUrl ? b.referenz.dataUrl : '';
  const refTag = refUrl ? `ref:${refUrl.length}:${refUrl.slice(-24)}` : '';
  return makeKey([b.id, buildPortraitPrompt(b, state), refTag, model]);
}

export function mapKey(state, model) {
  return makeKey(['map', state.karte?.prompt || '', state.meta?.mapStyle || '', model]);
}

// Army images use meta.armeeStyle with visualStyle as fallback.
function armeeStyle(state) {
  return (state.meta?.armeeStyle || state.meta?.visualStyle || '').trim();
}

export function buildHeerschauPrompt(state) {
  const a = state.armee || {};
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
    region(state) ? `aus ${region(state)}` : '',
    'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen',
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('. ');
}

export function buildVerbandPrompt(v, state) {
  const beraterById = Object.fromEntries((state.berater || []).map((b) => [b.id, b]));
  const fuehrer = v.fuehrungId && beraterById[v.fuehrungId] ? beraterById[v.fuehrungId].name : '';
  return [
    armeeStyle(state),
    'eine kleine Gruppe Krieger desselben Verbandes, Dreiviertelansicht, dokumentarisch, leicht aus der Mitte, schlichter Hintergrund, natuerliche Asymmetrie',
    [v.name, v.typ].filter(Boolean).join(', '),
    v.ausruestung ? `Ausruestung: ${v.ausruestung}` : '',
    v.verfassung ? `Verfassung: ${v.verfassung}` : '',
    fuehrer ? `gefuehrt von ${fuehrer}` : '',
    region(state) ? `aus ${region(state)}` : '',
    'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen',
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('. ');
}

export function armeeBildKey(state, model) {
  return makeKey(['armee', buildHeerschauPrompt(state), model]);
}
export function verbandKey(v, state, model) {
  return makeKey(['verband', v.id || '', buildVerbandPrompt(v, state), model]);
}

// A foreign power as scene or being, not as hero; erscheinung leads, so a
// faceless power is not forced into a portrait.
export function buildMachtPrompt(m, state) {
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

export function buildGruppePrompt(gr, state) {
  const sp = (state.berater || []).find((b) => b.id === gr.sprecherId)
    || (state.personen || []).find((p) => p.id === gr.sprecherId);
  return [
    armeeStyle(state),
    'eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum',
    gr.name || '',
    gr.kompetenz ? `Wirken: ${gr.kompetenz}` : '',
    sp ? `Sprecher: ${sp.name}` : '',
    region(state) ? `aus ${region(state)}` : '',
    'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen',
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join('. ');
}

export function machtKey(m, state, model) {
  return makeKey(['macht', m.id || '', buildMachtPrompt(m, state), model]);
}
export function gruppeKey(gr, state, model) {
  return makeKey(['gruppe', gr.id || '', buildGruppePrompt(gr, state), model]);
}

// Same rule as render/lebenswelt.js: the list lebenswelt.siedlungen, else the
// older single object state.siedlung. The legacy object is returned itself, not
// a copy, so export can embed its image in place. The id fallback must match
// the render module, otherwise the <img> does not find its key.
export function siedlungenAus(state) {
  const list = Array.isArray(state.lebenswelt?.siedlungen) ? state.lebenswelt.siedlungen : [];
  if (list.length) return list;
  if (state.siedlung && state.siedlung.name) return [state.siedlung];
  return [];
}
export function siedlungId(s) {
  return s.id || s.name || '';
}

// A given s.prompt wins; otherwise built from the fields in the army style, so
// the settlement comes from the same world as portraits and the army.
export function buildSiedlungPrompt(s, state) {
  if (s.prompt && s.prompt.trim()) return s.prompt.trim();
  return [
    armeeStyle(state),
    'ein weiter Blick auf die Siedlung eines Volkes, dokumentarische Totale, Behausungen und Menschen im Alltag, kein einzelner Held, kein heroisches Posing',
    [s.name, s.typ].filter(Boolean).join(', '),
    (s.beschreibung || s.lage || '').trim(),
    region(state) ? `aus ${region(state)}` : '',
    'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen',
  ]
    .map((x) => x.trim())
    .filter(Boolean)
    .join('. ');
}

export function siedlungKey(s, state, model) {
  return makeKey(['siedlung', siedlungId(s), buildSiedlungPrompt(s, state), model]);
}

// Map chronicle: a sequence of map stands, each developed from the previous.
export function karteChronik(state) {
  return Array.isArray(state.karte?.chronik) ? state.karte.chronik : [];
}

// selectedId is the stand the user picked; without one the state's
// aktuellerStand, and without a match the newest stand.
export function aktiverKarteStand(state, selectedId) {
  const chronik = karteChronik(state);
  if (!chronik.length) return null;
  const id = selectedId || state.karte?.aktuellerStand;
  return chronik.find((e) => e.id === id) || chronik[chronik.length - 1];
}

export function karteStandKey(state, entry, model) {
  return entry.bildCacheKey
    || makeKey(['map', entry.id, entry.prompt || '', state.meta?.mapStyle || '', model]);
}

export function karteStandPrompt(state, entry) {
  return [state.meta?.mapStyle || '', entry.prompt || '']
    .map((s) => (s || '').trim()).filter(Boolean).join('. ');
}

// Event images of the history: prompt content and bildCacheKey belong to the
// game master; the dashboard only displays and generates.
export function buildEreignisPrompt(entry, state) {
  return [state.meta?.visualStyle || '', entry.bild?.prompt || '']
    .map((s) => (s || '').trim()).filter(Boolean).join('. ');
}
export function ereignisKey(entry, state, model) {
  return entry.bild?.bildCacheKey
    || makeKey(['ereignis', entry.jahre || '', buildEreignisPrompt(entry, state), model]);
}

// Stable identity of an image across prompt changes, the anchor of its version
// list ("Bild fortschreiben").
export function identityOf(typ, id) {
  return typ === 'armee' ? 'armee' : `${typ}:${id}`;
}

// The developed context of a continued image: season mood, year and chapter.
const SAISON_STIMMUNG = {
  'Frühling': 'Frühling, neues Wachsen', 'Fruehling': 'Frühling, neues Wachsen',
  'Sommer': 'Hochsommer, volles Licht',
  'Herbst': 'Herbst, Ernte und fallendes Laub',
  'Winter': 'Winter, karge und harte Zeit',
};
export function kontextHauch(state) {
  const z = state.meta?.zeit || {};
  const js = (z.jahreszeit || '').trim();
  const teile = [];
  if (js) teile.push(SAISON_STIMMUNG[js] || js);
  if (z.jahr != null) teile.push(`Jahr ${z.jahr}`);
  if (state.meta?.kapitel != null) teile.push(`Kapitel ${roman(state.meta.kapitel)}`);
  return teile.length ? `Zeitpunkt der Szene: ${teile.join(', ')}` : '';
}
export function bildVersLabel(state, vnum) {
  const z = state.meta?.zeit || {};
  const saison = `${z.jahreszeit || ''} ${z.jahr ?? ''}`.trim();
  return `Stand ${vnum}${saison ? `, ${saison}` : ''}`;
}

// A version-indexed key guarantees a cache miss and thus a fresh image instead
// of silently falling back to the previous one.
export function fortschreibenPrompt(basePrompt, state) {
  return [basePrompt, kontextHauch(state)].filter(Boolean).join('. ');
}
export function versionKey(identity, vnum, prompt, model) {
  return makeKey([identity, `v${vnum}`, prompt, model]);
}

// Per-party suffix of the version store namespaces (rc.imgver.<tag>).
export function partieTag(partie) {
  return makeKey([partie]);
}

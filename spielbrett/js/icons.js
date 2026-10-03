// One icon family for DOM and canvas. Every glyph is a 24x24 stroke drawing
// (round caps and joins, stroke 1.75 at 24px), so the same path data renders as
// inline SVG in panels and as Path2D on the map and the symbols stay identical.
// Dots are zero-length segments ("h.01") that the round cap turns into points.

export const ICONS = {
  // Resources
  nahrung: 'M12 21V7.5 M12 7.5c-1.3-1.2-1.5-3.1-.2-4.6 1.4 1.4 1.4 3.3.2 4.6z M12 12c-2.6.3-4.3-1-4.6-3.1 2.5-.3 4.3 1 4.6 3.1z M12 12c2.6.3 4.3-1 4.6-3.1-2.5-.3-4.3 1-4.6 3.1z M12 16.5c-2.6.3-4.3-1-4.6-3.1 2.5-.3 4.3 1 4.6 3.1z M12 16.5c2.6.3 4.3-1 4.6-3.1-2.5-.3-4.3 1-4.6 3.1z',
  holz: 'M15.5 8.5H6a2 3.5 0 0 0 0 7h9.5 M15.5 8.5a2.2 3.5 0 1 1 0 7 2.2 3.5 0 1 1 0-7z M15.5 11.2a.7 .9 0 1 1 0 1.8 M9.5 8.5 8.2 5.5 M4 19.5h16',
  erz: 'M3.5 15.5 7 7.5l6.5-3 6.5 5-2 9-10 1z M7 7.5l4 4.5 2.5-7.5 M11 12l9-2.5 M11 12l-3 7.5 M11 12l7 6.5',
  wissen: 'M7 20.5V9c0-3.3 2.2-6 5-6s5 2.7 5 6v11.5 M4.5 20.5h15 M12 17V9.5 M9.6 9.8 12 12.6l2.4-2.8',
  volk: 'M9 10.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z M3.8 19.5c0-3.1 2.3-5.4 5.2-5.4s5.2 2.3 5.2 5.4 M16.2 11a2.2 2.2 0 1 0 0-4.4 M16.5 14.2c2.3.3 3.9 2.4 3.9 5.3',
  zustimmung: 'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z',
  material: 'M3.5 20h17 M5 20v-4.3a1.2 1.2 0 0 1 1.2-1.2h4.6a1.2 1.2 0 0 1 1.2 1.2V20 M12 20v-4.3a1.2 1.2 0 0 1 1.2-1.2h4.6a1.2 1.2 0 0 1 1.2 1.2V20 M5.2 11h13.6a1.6 1.6 0 0 0 0-3.2H5.2a1.6 1.6 0 0 0 0 3.2z M15.5 9.4h.01',
  salz: 'M3.5 20h17 M5.5 20v-5h5.5v5 M13 20v-5h5.5v5 M9.2 15V10h5.6v5',
  opfer: 'M4 13h16a8 8 0 0 1-16 0z M9 21h6 M12 3c1.5 2 2.5 3.3 2.5 4.8a2.5 2.5 0 0 1-5 0c0-1.5 1-2.8 2.5-4.8z',
  psil: 'M12 3l4.2 6.2L12 21 7.8 9.2z M7.8 9.2h8.4 M12 3v18 M3.5 7.5l1.8 1 M20.5 7.5l-1.8 1 M3 14h2 M19 14h2',

  // Facts and order marks
  bewegung: 'M5.6 9a2.4 3.6 0 1 0 4.8 0 2.4 3.6 0 1 0-4.8 0z M6.5 15.4a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0z M13.6 11.6a2.4 3.6 0 1 0 4.8 0 2.4 3.6 0 1 0-4.8 0z M14.5 18a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0z',
  sicht: 'M2.8 13.5s3.4-5.5 9.2-5.5 9.2 5.5 9.2 5.5-3.4 5.5-9.2 5.5-9.2-5.5-9.2-5.5z M12 15.8a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z M12 2.8v2.4 M5.2 5l1.5 1.7 M18.8 5l-1.5 1.7',
  kosten: 'M8.6 6.6h6.8l-1.6 2.6c3 1.4 5 4.4 5 7.4 0 2.6-2.2 3.9-6.8 3.9s-6.8-1.3-6.8-3.9c0-3 2-6 5-7.4z M9.6 3.8h4.8',
  haupt: 'M12 3.5l8.5 8.5-8.5 8.5L3.5 12z M12 8.2l3.8 3.8-3.8 3.8L8.2 12z',
  neben: 'M12 3.5l8.5 8.5-8.5 8.5L3.5 12z',
  preis: 'M7.4 9.2h9.2l2.8 10.8H4.6z M9.8 9.2a2.2 2.2 0 1 1 4.4 0',
  ueberdehnung: 'M3.5 17.5a8.5 8.5 0 0 1 17 0 M12 17.5l4.6-5.6 M6.2 13l1.2.8 M12 9v1.5 M17.8 13l-1.2.8',
  schild: 'M12 3.5l7 2.6v5.6c0 4.4-2.9 7.6-7 8.8-4.1-1.2-7-4.4-7-8.8V6.1z',
  praxis: 'M19.5 12a7.5 7.5 0 0 1-13 5.1 M4.5 12a7.5 7.5 0 0 1 13-5.1 M17.8 3.6v3.6h-3.6 M6.2 20.4v-3.6h3.6',
  dafuer: 'M8 13V6.8a1.25 1.25 0 0 1 2.5 0V11 M10.5 11V4.8a1.25 1.25 0 0 1 2.5 0V11 M13 11V5.8a1.25 1.25 0 0 1 2.5 0V11.5 M15.5 11.5V8.3a1.25 1.25 0 0 1 2.5 0V14c0 3.8-2.6 6.5-6.3 6.5-2.5 0-4.2-1.2-5.5-3.2l-2.3-3.6a1.35 1.35 0 0 1 2.1-1.7L8 13.6',

  // Overlays and shortcuts
  entwicklungen: 'M12 21v-7.5 M12 13.5c0-3.2-2.2-5.3-6-5.6-.1 3.7 2.4 5.6 6 5.6z M12 11c0-3.8 2.4-6.7 6.5-7 .1 4.2-2.6 7-6.5 7z',
  rat: 'M12 9.8c1.2 1.3 1.8 2.3 1.8 3.4a1.8 1.8 0 0 1-3.6 0c0-1.1.6-2.1 1.8-3.4z M12 2.9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z M19.4 8.4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z M16.6 17.1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z M7.4 17.1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z M4.6 8.4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  chronik: 'M6.5 4h11a2 2 0 0 1 2 2v12.5 M6.5 4a2 2 0 0 0-2 2v1.5h4V6a2 2 0 0 0-2-2z M8.5 7.5v10.5a2 2 0 0 0 2 2h9a1.5 1.5 0 0 0 1.5-1.5v-.5h-10v.5a1.5 1.5 0 0 1-1.5 1.5 M11.5 8.5h5 M11.5 11.5h5 M11.5 14.5h3',
  bestimmung: 'M2.5 20.5 9.2 10l3.6 5.2 2-2.8 6.7 8.1z M9.2 10V3.5 M9.2 3.8h5.6l-1.3 1.7 1.3 1.7H9.2',

  // Units
  lager: 'M3.5 19.5h17 M5.5 19.5v-6.2L12 8.6l6.5 4.7v6.2 M12 8.6V5.2 M10.2 19.5v-3.6a1.8 1.8 0 0 1 3.6 0v3.6 M5.5 13.3h13',
  spaeher: 'M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6z M12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z',
  herde: 'M12 19.5c-2 0-3-1.5-3-3.5V11 M12 19.5c2 0 3-1.5 3-3.5V11 M9 11c-3.8 0-5.4-2.5-5-5 .4-2 3-2.6 4-.8.7 1.3-.5 2.5-1.5 2 M15 11c3.8 0 5.4-2.5 5-5-.4-2-3-2.6-4-.8-.7 1.3.5 2.5 1.5 2 M9 11h6 M10.5 16.5h.01 M13.5 16.5h.01',
  krieger: 'M4 20.5 15.5 5.5 M13.6 4.6l3.6-.8-.8 3.6 M12.5 12.5l4.5-1.5 4.5 1.5v3c0 3-2 4.6-4.5 5.5-2.5-.9-4.5-2.5-4.5-5.5z',
  haendler: 'M5 9.5h14l-1.4 10H6.4z M9 9.5V7.8a3 3 0 0 1 6 0v1.7 M5.6 13.5h12.8',
  raeuber: 'M4.5 4.5c5 3 9.2 7.2 12.6 12.6 M19.5 4.5c-5 3-9.2 7.2-12.6 12.6 M14.6 19.6l4.8-4.8 M9.4 19.6l-4.8-4.8',

  // Places
  ruine: 'M3.5 20h17 M6 20V10h3v10 M5 10h5 M15 20v-6.4l1.3-1.6 1.7 1.2V20 M14 13.6h4.6 M10.8 20v-2.5h2.4V20',
  schrein: 'M6.5 20.5h11 M8.4 20.5c-1.2-1.6-.6-3.6 1.2-3.9h4.8c1.8.3 2.4 2.3 1.2 3.9 M9.5 16.6c-.8-1.3 0-2.9 1.4-3.1h2.2c1.4.2 2.2 1.8 1.4 3.1 M10.6 13.5c-.5-1.2.1-2.5 1.4-2.5s1.9 1.3 1.4 2.5 M12 4l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z',
  pass: 'M2.5 19.5 8.5 8l4 7 M21.5 19.5 15.5 8l-4 7 M12 16.5l-1 1.6 1 1.4',
  erzader: 'M4.5 19.5 14 10 M7.8 7.4c3-2.6 8.1-2.6 11.2 1.1-1.6-.8-3.2-1-5-.6 M7.8 7.4c2 .2 3.8 1 5 2.2 M16.5 16.5h.01 M19.5 14h.01 M14.5 19.5h.01',
  quelle: 'M12 3.5c3 4 5.5 7 5.5 10.5a5.5 5.5 0 0 1-11 0c0-3.5 2.5-6.5 5.5-10.5z M9.5 14.2a2.5 2.5 0 0 0 2.5 2.5',
  siedlung: 'M3.5 20h17 M5 20v-7l4-3.5 4 3.5v7 M13 20v-9.5l3.5-3 3.5 3V20 M8 20v-3h2v3',
  turm: 'M8 20V8.5h8V20 M6.5 20h11 M8 8.5V5h1.6v1.5h1.6V5h1.6v1.5h1.6V5H16v3.5 M10.8 20v-3.4a1.2 1.2 0 0 1 2.4 0V20 M11.5 11.5h1',
  hoehle: 'M2.5 20c0-6 3-11 6.3-13 2.2-1.4 4.2-1.4 6.4 0 3.3 2 6.3 7 6.3 13z M8.5 20c0-3.3 1.6-6 3.5-6s3.5 2.7 3.5 6',

  // Agents
  kern: 'M12 4.5V20 M8.5 20h7 M4.5 7.5h15 M4.5 7.5 2.2 13.4a2.4 2.4 0 0 0 4.6 0z M19.5 7.5l-2.3 5.9a2.4 2.4 0 0 0 4.6 0z',
  welt: 'M2.5 19.5 9 9.5l4 6 2.5-3.5 6 7.5z M17.5 8.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z',
  rivalen: 'M6 21V4 M6 4.5h8l-1.5 3 1.5 3H6 M15.5 21V9.5 M15.5 10h5.5l-1.2 2.2 1.2 2.3h-5.5',
  chronist: 'M20 4C14 5 9 9 6.5 16L5 20 M6.6 16.4c4-.5 8.5-3 11.2-7.6 M9.4 13.2h3.8',

  // Development kinds
  technik: 'M3.5 9.5h13c0 2.5-2 4.2-4.5 4.6V17H7v-2.9C4.8 13.7 3.5 12 3.5 9.5z M16.5 9.5h4 M5 20.5h11 M7 17v3.5 M12 17v3.5',
  magie: 'M12 3c1 3.6 5 5.6 5 10.5a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 0 2 1 3 2 3 0-3-.5-5.5.5-8.5z',
  einheit: 'M4 20.5 15.5 5.5 M13.6 4.6l3.6-.8-.8 3.6 M12.5 12.5l4.5-1.5 4.5 1.5v3c0 3-2 4.6-4.5 5.5-2.5-.9-4.5-2.5-4.5-5.5z',
  bauwerk: 'M3.5 20V9.5h3V12h3V9.5h5V12h3V9.5h3V20z M10 20v-4a2 2 0 0 1 4 0v4',
  institution: 'M3.5 20h17 M5.5 20v-8 M9.8 20v-8 M14.2 20v-8 M18.5 20v-8 M3.5 10 12 4.5l8.5 5.5z',

  // Interface
  schliessen: 'M6.5 6.5l11 11 M17.5 6.5l-11 11',
  ja: 'M5 12.5l4.5 4.5L19 7.5',
  nein: 'M6.5 6.5l11 11 M17.5 6.5l-11 11',
  enthaltung: 'M6.5 12h11',
  warnung: 'M12 4.2l8.8 15.3H3.2z M12 10v4 M12 16.9h.01',
  angebot: 'M4 8.5h14.5l-3.2-3.2 M20 15.5H5.5l3.2 3.2',
  schloss: 'M6.5 11h11v9h-11z M8.6 11V8a3.4 3.4 0 0 1 6.8 0v3',
  trendAuf: 'M6.5 14.5l5.5-5.5 5.5 5.5',
  trendAb: 'M6.5 9.5l5.5 5.5 5.5-5.5',
  trendGleich: 'M6.5 12h11',
  dauer: 'M7 3.5h10 M7 20.5h10 M8 3.5c0 4 4 5.5 4 8.5s-4 4.5-4 8.5 M16 3.5c0 4-4 5.5-4 8.5s4 4.5 4 8.5',
  plus: 'M12 5.5v13 M5.5 12h13',
  minus: 'M5.5 12h13',
  wuerfel: 'M12 2.8l8.4 7.6L12 21.2 3.6 10.4z M3.6 10.4l8.4 3 8.4-3 M12 13.4v7.8 M12 2.8v10.6',
  gelaende: 'M2.5 19 9 8l4 6.5 2.5-3.5 6 8z',
  besitz: 'M6 21V4 M6 4.5h11l-2 3.5 2 3.5H6',
  bedrohung: 'M12 3c1 3.6 5 5.6 5 10.5a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 0 2 1 3 2 3 0-3-.5-5.5.5-8.5z',
  handel: 'M4 8.5h14.5l-3.2-3.2 M20 15.5H5.5l3.2 3.2',
  ziel: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z',
  pfeil: 'M5 12h14 M13 6l6 6-6 6',
  liste: 'M9 6.5h11 M9 12h11 M9 17.5h11 M4.5 6.5h.01 M4.5 12h.01 M4.5 17.5h.01',
  feld: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z',
  ort: 'M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z',
  meilenstein: 'M12 3.5l8.5 8.5-8.5 8.5L3.5 12z',
  frost: 'M12 3v18 M4.2 7.5l15.6 9 M4.2 16.5l15.6-9 M9.5 4.5 12 6.5l2.5-2 M9.5 19.5 12 17.5l2.5 2',
};

// The research agent and the development overlay share one symbol.
ICONS.forschung = ICONS.entwicklungen;
ICONS.herden = ICONS.herde;
// The three council votes are one hand in three postures, so they read as a set.
ICONS.dagegen = ICONS.dafuer;
ICONS.enthaltung_hand = ICONS.dafuer;
const ROTATE = { dagegen: 180, enthaltung_hand: 90 };

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Inline SVG for the DOM. Decorative by default; pass `label` when the icon is
 * the only carrier of its meaning.
 * @param {string} name
 * @param {{size?: number, label?: string, cls?: string}} [opts]
 */
export function icon(name, opts = {}) {
  const { size = 20, label, cls } = opts;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', cls ? `icon ${cls}` : 'icon');
  svg.setAttribute('focusable', 'false');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name] || ICONS.ort);
  if (ROTATE[name]) path.setAttribute('transform', `rotate(${ROTATE[name]} 12 12)`);
  svg.append(path);
  return svg;
}

const path2dCache = new Map();

/** Path2D for the canvas renderer, cached per icon. */
export function iconPath(name) {
  let p = path2dCache.get(name);
  if (!p) {
    p = new Path2D(ICONS[name] || ICONS.ort);
    path2dCache.set(name, p);
  }
  return p;
}

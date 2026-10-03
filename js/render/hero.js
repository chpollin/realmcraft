// Persistent realm bar (hero) above the switchable views: chapter, season,
// world event, realm name, the core values and renown, readable from every view.
import { el } from '../components/ui.js';
import { roman, signed } from '../format.js';

// Inline SVG icons in the style of the Lage stat cards.
const HERO_ICONS = {
  nahrung: '<path d="M12 2C8 2 5 5 5 9c0 5 4 11 7 13 3-2 7-8 7-13 0-4-3-7-7-7z"/>',
  material: '<path d="M3 7l9-4 9 4-9 4-9-4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  wissen: '<path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM8 7h8M8 11h6"/>',
  bevoelkerung: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  verteidigung: '<path d="M12 2l8 3v6c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V5l8-3z"/>',
  mobilitaet: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  wohlstand: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
};

// dir colours the number (>0 up, <0 down, 0 flat). Only the situation values
// set it; base values carry no up/down meaning.
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

export function renderHero(hero, state) {
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
      el('span', { 'data-testid': 'realm-name', text: volk.name || '' }),
    ]),
    coreStrip(state),
  ]);

  const ansehen = status.ansehen || {};
  const max = 3;
  // The stars repeat the level visually; the heading carries it as text.
  const stars = el('div', { class: 'stars', 'aria-hidden': 'true' },
    Array.from({ length: max }, (_, i) => el('span', { class: i < (ansehen.stufe || 0) ? 'on' : 'off', text: '★' })),
  );
  const renown = el('section', { class: 'renown', 'data-testid': 'ansehen' }, [
    el('h2', { class: 'rstage', text: `Ansehen ${ansehen.stufe ?? '–'} von ${max}` }),
    stars,
    ansehen.label ? el('div', { class: 'rdesc', text: ansehen.label }) : null,
  ]);

  hero.append(crest, renown);
}

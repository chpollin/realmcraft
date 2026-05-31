// Sicht "Karte": Kartenbild (generierbar) und Legende der bekannten Orte.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Karte (data-view=karte)".
import { el } from '../components/ui.js';

export function renderKarte(root, state, handlers = {}) {
  root.replaceChildren();
  if (!state) return;

  const karte = state.karte || {};
  const orte = karte.orte || [];

  // Datengetriebener Alt-Text: nennt die bekannten Orte, statt einer fixen Floskel.
  const alt = orte.length
    ? `Lagekarte mit ${orte.map((o) => o.name).join(', ')}`
    : 'Lagekarte (noch nicht erzeugt)';
  const mapImage = el('img', {
    class: 'map-image',
    'data-testid': 'map-image',
    alt,
  });

  const genBtn = el('button', {
    class: 'btn primary gen-map',
    'data-testid': 'generate-map',
    type: 'button',
    text: 'Karte erzeugen',
    onClick: () => handlers.onGenerateMap?.(),
  });

  const compass = el('div', { class: 'compass', 'aria-hidden': 'true', html:
    '<svg viewBox="0 0 100 100" fill="none" stroke="#9aa0a8" stroke-width="1">'
    + '<circle cx="50" cy="50" r="44" stroke-opacity=".6"/><circle cx="50" cy="50" r="34" stroke-opacity=".3"/>'
    + '<path d="M50 8 L57 50 L50 92 L43 50 Z" fill="#2a2e35" stroke="none" opacity=".85"/>'
    + '<path d="M8 50 L50 43 L92 50 L50 57 Z" fill="#9aa0a8" stroke="none" opacity=".7"/>'
    + '<circle cx="50" cy="50" r="4" fill="#ffffff" stroke="#2a2e35"/></svg>',
  });

  const frame = el('div', { class: 'map-frame' }, [
    mapImage,
    el('span', { class: 'map-corner tl' }), el('span', { class: 'map-corner tr' }),
    el('span', { class: 'map-corner bl' }), el('span', { class: 'map-corner br' }),
    el('div', { class: 'map-center' }, [
      compass,
      el('div', { class: 'mt', text: 'Lagekarte' }),
      el('div', { class: 'ms', text: state.meta?.mapStyle || '' }),
      genBtn,
    ]),
  ]);

  const PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';
  const CASTLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V8l3 2V6l3 2V6l3 2 3-2v2l3-2v2l3-2v13z"/><path d="M10 21v-4h4v4"/></svg>';

  const legendList = el('ul', { class: 'll', 'data-testid': 'map-legend' },
    orte.map((o) => {
      const cap = /Hauptstadt|Bergfestung/.test(o.typ || '');
      return el('li', { 'data-testid': 'map-place' }, [
        el('span', { class: `gly${cap ? ' cap' : ''}`, 'aria-hidden': 'true', html: cap ? CASTLE : PIN }),
        el('div', {}, [
          el('div', { class: 'li-nm', text: o.name }),
          o.typ ? el('div', { class: 'li-ty', text: o.typ }) : null,
          o.beziehung ? el('div', { class: 'li-rl', text: o.beziehung }) : null,
        ]),
        o.richtung ? el('span', { class: 'li-dir', text: o.richtung }) : null,
      ]);
    }),
  );

  const legend = el('div', { class: 'legend' }, [
    el('div', { class: 'block-head' }, [el('h3', { text: 'Orte' }), el('div', { class: 'rule' })]),
    legendList,
  ]);

  const head = el('section', {}, [
    el('div', { class: 'section-title' }, [
      el('span', { class: 'kicker', text: 'Geographie' }),
      document.createTextNode(' Die bekannte Welt'),
    ]),
    el('p', { class: 'section-sub', text: 'Die Karte wächst mit dem Spiel und zeigt nur, was das Volk kennt.' }),
    el('div', { class: 'map-wrap' }, [frame, legend]),
  ]);

  root.append(head);
}

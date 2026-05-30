// Sicht "Historie": Chronik der Kapitel, Fähigkeiten und Besitz.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Historie (data-view=historie)".
import { el } from '../components/ui.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const roman = (n) => ROMAN[n] || String(n);

export function renderHistorie(root, state) {
  root.replaceChildren();
  if (!state) return;

  const kapitelJetzt = state.meta?.kapitel;

  const timeline = el('div', { class: 'timeline' },
    (state.historie || []).map((h) => {
      const cur = h.kapitel === kapitelJetzt;
      return el('div', { class: `epoch${cur ? ' current' : ''}`, 'data-testid': 'history-entry' }, [
        el('div', { class: 'node' }, [el('b', { text: roman(h.kapitel) })]),
        el('div', { class: 'ehead' }, [
          el('span', { class: 'etitle', text: `Kapitel ${roman(h.kapitel)}` }),
          h.jahre ? el('span', { class: 'eyears', text: h.jahre }) : null,
          cur ? el('span', { class: 'ecur', text: 'Gegenwart' }) : null,
        ]),
        el('p', { class: 'esum', text: h.zusammenfassung }),
      ]);
    }),
  );

  const skills = el('ul', { class: 'list-clean' },
    (state.faehigkeiten || []).map((f) =>
      el('li', { 'data-testid': 'faehigkeit' }, [el('span', { class: 'marker' }), el('span', { text: f })]),
    ),
  );
  const holdings = el('ul', { class: 'list-clean' },
    (state.besitz || []).map((b) =>
      el('li', { 'data-testid': 'besitz' }, [el('span', { class: 'marker' }), el('span', { text: b })]),
    ),
  );

  const head = el('section', {}, [
    el('div', { class: 'section-title' }, [
      el('span', { class: 'kicker', text: 'Chronik' }),
      document.createTextNode(' Der Weg des Volkes'),
    ]),
    el('p', { class: 'section-sub', text: 'Die wichtigsten Entscheidungen in ihrer Reihenfolge.' }),
    el('div', { class: 'panel pad' }, [timeline]),
    el('div', { class: 'two-col' }, [
      el('div', { class: 'panel pad' }, [
        el('div', { class: 'block-head' }, [
          el('h3', { text: 'Fähigkeiten' }),
          el('div', { class: 'rule' }),
          el('span', { class: 'eyebrow', text: 'Was der Wissensstand beherrscht' }),
        ]),
        skills,
      ]),
      el('div', { class: 'panel pad' }, [
        el('div', { class: 'block-head' }, [
          el('h3', { text: 'Besitz' }),
          el('div', { class: 'rule' }),
          el('span', { class: 'eyebrow', text: 'Bauten, Orte, Güter' }),
        ]),
        holdings,
      ]),
    ]),
  ]);

  root.append(head);
}

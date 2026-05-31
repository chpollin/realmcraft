// Sicht "Historie": erzählte Chronik — eine Karte je Jahreszeit, nach Kapiteln
// gruppiert, jede mit Ereignis-Bild — und die Fähigkeiten des Volkes.
// (Besitz lebt in der Lebenswelt, Setzungen/Verfassung im Reiter „Recht".)
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Historie (data-view=historie)".
import { el } from '../components/ui.js';
import { roman } from '../format.js';

// Dezenter Hinweis, wenn eine Liste (noch) leer ist — statt eines nackten Panels.
function leerHinweis(text) {
  return el('p', { class: 'list-empty', text });
}

// Eine Eintrags-Karte: Saison als Titel, „Gegenwart" nur am jüngsten Eintrag,
// die Zusammenfassung und — falls vorhanden — das Ereignis-Bild mit Erzeugen-
// Knopf. index ist die Position im flachen historie[]-Array (für die Erzeugung).
function epochCard(h, index, istGegenwart, opts) {
  return el('div', { class: `epoch${istGegenwart ? ' current' : ''}`, 'data-testid': 'history-entry' }, [
    el('div', { class: 'ehead' }, [
      el('span', { class: 'etitle', text: h.jahre || '' }),
      istGegenwart ? el('span', { class: 'ecur', text: 'Gegenwart' }) : null,
    ]),
    h.zusammenfassung ? el('p', { class: 'esum', text: h.zusammenfassung }) : null,
    h.bild ? el('div', { class: 'epoch-bild' }, [
      el('img', {
        class: 'epoch-img',
        'data-testid': 'ereignis-bild',
        'data-jahre': h.jahre || '',
        alt: h.bild.anlass || `Bild zu ${h.jahre || 'diesem Ereignis'}`,
      }),
      el('div', { class: 'epoch-bild-cap' }, [
        h.bild.anlass ? el('span', { class: 'epoch-anlass', text: h.bild.anlass }) : null,
        el('button', {
          class: 'btn btn-ghost gen-ereignis',
          type: 'button',
          'data-testid': 'generate-ereignisbild',
          dataset: { jahre: h.jahre || '' },
          text: 'Bild erzeugen',
          onClick: () => opts.onGenerateEreignisbild?.(index),
        }),
      ]),
    ]) : null,
  ]);
}

export function renderHistorie(root, state, opts = {}) {
  root.replaceChildren();
  if (!state) return;

  const kapitelListe = state.historie || [];
  const letzteIdx = kapitelListe.length - 1;

  // Nach Kapitel gruppieren (in Reihenfolge des ersten Auftretens). Der globale
  // Index bleibt erhalten, damit die Bild-Erzeugung den richtigen Eintrag trifft.
  const gruppen = [];
  kapitelListe.forEach((h, i) => {
    let g = gruppen[gruppen.length - 1];
    if (!g || g.kapitel !== h.kapitel) {
      g = { kapitel: h.kapitel, items: [] };
      gruppen.push(g);
    }
    g.items.push({ h, i });
  });

  const timeline = kapitelListe.length
    ? el('div', { class: 'timeline' },
        gruppen.map((g) => el('div', { class: 'timeline-gruppe' }, [
          el('div', { class: 'timeline-kapitel-titel', text: `Kapitel ${roman(g.kapitel)}` }),
          ...g.items.map(({ h, i }) => epochCard(h, i, i === letzteIdx, opts)),
        ])))
    : leerHinweis('Noch keine Kapitel verzeichnet.');

  const faehigkeiten = state.faehigkeiten || [];
  const skills = faehigkeiten.length
    ? el('ul', { class: 'list-clean' },
        faehigkeiten.map((f) =>
          el('li', { 'data-testid': 'faehigkeit' }, [el('span', { class: 'marker' }), el('span', { text: f })]),
        ),
      )
    : leerHinweis('Noch keine Fähigkeiten erschlossen.');

  // Besitz lebt in der Lebenswelt (render/lebenswelt.js), Setzungen und Verfassung
  // im Reiter „Recht" (render/recht.js). Die Chronik trägt den erzählten Verlauf
  // (eine Karte je Jahreszeit, mit Bild) und die Fähigkeiten des Volkes.
  const head = el('section', {}, [
    el('div', { class: 'section-title' }, [
      el('span', { class: 'kicker', text: 'Chronik' }),
      document.createTextNode(' Der Weg des Volkes'),
    ]),
    el('p', { class: 'section-sub', text: 'Die Geschichte der Partie, Kapitel für Kapitel und Saison für Saison.' }),
    el('div', { class: 'panel pad' }, [timeline]),
    el('div', { class: 'panel pad' }, [
      el('div', { class: 'block-head' }, [
        el('h3', { text: 'Fähigkeiten' }),
        el('div', { class: 'rule' }),
        el('span', { class: 'eyebrow', text: 'Was der Wissensstand beherrscht' }),
      ]),
      skills,
    ]),
  ]);

  root.append(head);
}

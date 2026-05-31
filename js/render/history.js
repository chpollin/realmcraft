// Sicht "Historie": Chronik der Kapitel, der Verlauf der Stände und Fähigkeiten.
// (Besitz lebt in der Lebenswelt, Setzungen/Verfassung im Reiter „Recht".)
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Historie (data-view=historie)".
import { el } from '../components/ui.js';
import { roman, firstSentence } from '../format.js';

// Dezenter Hinweis, wenn eine Liste (noch) leer ist — statt eines nackten Panels.
function leerHinweis(text) {
  return el('p', { class: 'list-empty', text });
}

// Verdichtet die gespeicherten Stände (ältester zuerst) zu Zügen. Jeder Stand ist
// ein Zug: Kapitel, Saison, Lage in einem Satz, ausgewürfelte Vorhaben. Der
// Statustext ist kumulativ und wiederholt über Saisons hinweg fast denselben
// Wortlaut; darum trägt ein Zug nur den ersten Satz als knappe Lage und nur, wenn
// er sich zum Vorgänger geändert hat. Mehrere Stände können denselben Zug tragen
// (wiederholtes Speichern, ohne dass die Runde weiterrückt); aufeinanderfolgende,
// inhaltsgleiche Stände fallen über ihre Signatur (Kapitel, Saison, Lage, Vorhaben)
// zu einem Zug zusammen. Stände, die weder eine neue Lage noch ein Vorhaben tragen,
// entfallen — so bleibt keine inhaltsleere Zeile stehen.
function verdichteZuege(snapshots) {
  const zuege = [];
  let letzteLage = null;
  let letzteSignatur = null;
  snapshots.forEach((s) => {
    const meta = s?.meta || {};
    const zeit = meta.zeit || {};
    const kapitel = meta.kapitel;
    const saison = `${zeit.jahreszeit || ''} ${zeit.jahr ?? ''}`.trim();
    const erledigt = (s?.runde?.aktionen || []).filter((a) => a && a.ergebnis);
    const lage = firstSentence(s?.status?.text);
    if (!lage && !erledigt.length) return;

    const signatur = JSON.stringify([kapitel, saison, lage, erledigt.map((a) => `${a.titel}=${a.ergebnis}`)]);
    if (signatur === letzteSignatur) return;
    letzteSignatur = signatur;

    const neueLage = lage && lage !== letzteLage ? lage : null;
    if (lage) letzteLage = lage;
    if (!neueLage && !erledigt.length) return; // bloße Wiederholung der Lage ohne Vorhaben

    zuege.push({ kapitel, saison, lage: neueLage, erledigt });
  });
  return zuege;
}

// Gruppiert Züge nach Kapitel in der Reihenfolge ihres ersten Auftretens.
function gruppiereNachKapitel(zuege) {
  const gruppen = [];
  zuege.forEach((z) => {
    let g = gruppen[gruppen.length - 1];
    if (!g || g.kapitel !== z.kapitel) {
      g = { kapitel: z.kapitel, zuege: [] };
      gruppen.push(g);
    }
    g.zuege.push(z);
  });
  return gruppen;
}

// Baut den erzählten Verlauf: Züge unter ihr Kapitel gruppiert, jeder Zug mit
// Saison, knapper Lage und Vorhaben. Gibt null zurück, wenn nach der Verdichtung
// weniger als zwei Züge bleiben (zu wenig für einen Verlauf).
function buildVerlauf(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length < 2) return null;
  const zuege = verdichteZuege(snapshots);
  if (zuege.length < 2) return null;

  const gruppen = gruppiereNachKapitel(zuege).map((g) =>
    el('div', { class: 'chronik-kapitel' }, [
      el('div', { class: 'chronik-kapitel-titel', text: `Kapitel ${roman(g.kapitel)}` }),
      ...g.zuege.map((z) => el('article', { class: 'chronik-entry', 'data-testid': 'chronik-entry' }, [
        z.saison ? el('div', { class: 'chronik-when', text: z.saison }) : null,
        z.lage ? el('p', { class: 'chronik-text', text: z.lage }) : null,
        z.erledigt.length
          ? el('ul', { class: 'chronik-acts' },
              z.erledigt.map((a) => el('li', {}, [
                el('span', { class: 'chronik-act-titel', text: a.titel || 'Vorhaben' }),
                document.createTextNode(': '),
                el('span', { text: a.ergebnis }),
              ])),
            )
          : null,
      ])),
    ]),
  );

  return el('section', { class: 'chronik-flow', 'data-testid': 'chronik-flow' }, [
    el('div', { class: 'block-head mt' }, [
      el('h3', { text: 'Verlauf dieser Partie' }),
      el('div', { class: 'rule' }),
      el('span', { class: 'eyebrow', text: 'Zug für Zug, nach Kapiteln; mehrfaches Speichern zusammengefasst' }),
    ]),
    el('div', { class: 'panel pad' }, gruppen),
  ]);
}

export function renderHistorie(root, state, opts = {}) {
  root.replaceChildren();
  if (!state) return;

  const kapitelJetzt = state.meta?.kapitel;
  const flow = buildVerlauf(Array.isArray(opts.chronik) ? opts.chronik : []);

  const kapitelListe = state.historie || [];
  const timeline = kapitelListe.length
    ? el('div', { class: 'timeline' },
        kapitelListe.map((h) => {
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
      )
    : leerHinweis('Noch keine Kapitel verzeichnet.');

  const faehigkeiten = state.faehigkeiten || [];
  const skills = faehigkeiten.length
    ? el('ul', { class: 'list-clean' },
        faehigkeiten.map((f) =>
          el('li', { 'data-testid': 'faehigkeit' }, [el('span', { class: 'marker' }), el('span', { text: f })]),
        ),
      )
    : leerHinweis('Noch keine Fähigkeiten erschlossen.');

  // Besitz lebt jetzt in der Lebenswelt (render/lebenswelt.js), Setzungen und
  // Verfassung im Reiter „Recht" (render/recht.js). Die Chronik führt nur noch
  // den langen Bogen, den Verlauf der Stände und die Fähigkeiten des Volkes.
  const head = el('section', {}, [
    el('div', { class: 'section-title' }, [
      el('span', { class: 'kicker', text: 'Chronik' }),
      document.createTextNode(' Der Weg des Volkes'),
    ]),
    el('p', { class: 'section-sub', text: 'Die Geschichte der Partie, Kapitel für Kapitel und Zug für Zug.' }),
    el('div', { class: 'panel pad' }, [timeline]),
    flow,
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

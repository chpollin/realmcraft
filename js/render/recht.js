// Sicht "Recht": die vereinbarten Sonderregeln dieser Partie — Verfassung
// (Grundordnung) und Setzungen (ergänzend zur Mechanik, für dieses Spiel
// vereinbart). Reines Nachschlage-Material, kein Spielzug verändert es hier.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Recht (data-view=recht)".
import { el } from '../components/ui.js';

export function renderRecht(root, state) {
  root.replaceChildren();
  if (!state) return;

  const verfassung = state.verfassung && state.verfassung.text;
  const setzungen = state.setzungen || [];

  if (!verfassung && !setzungen.length) {
    root.append(el('section', { class: 'panel pad', 'data-testid': 'recht-leer' }, [
      el('div', { class: 'block-head' }, [el('h2', { text: 'Recht' })]),
      el('p', { class: 'section-sub', text: 'Noch keine Verfassung und keine Sonderregeln.' }),
    ]));
    return;
  }

  // Verfassung (Grundordnung) zuerst, volle Breite.
  if (verfassung) {
    root.append(el('section', { class: 'panel pad', 'data-testid': 'verfassung' }, [
      el('div', { class: 'block-head' }, [el('h2', { text: 'Verfassung' })]),
      el('p', { class: 'verfassung-text', text: verfassung }),
    ]));
  }

  // Setzungen: jede Sonderregel als Karte mit Titel und Text.
  if (setzungen.length) {
    root.append(el('section', { class: 'panel pad mt', 'data-testid': 'setzungen' }, [
      el('div', { class: 'block-head' }, [el('h2', { text: 'Sonderregeln' })]),
      el('div', { class: 'rules-list' },
        setzungen.map((s) =>
          el('article', { class: 'rule-item', 'data-testid': 'setzung' }, [
            s.titel ? el('h3', { class: 'rule-title', text: s.titel }) : null,
            s.text ? el('p', { class: 'rule-text', text: s.text }) : null,
          ]),
        ),
      ),
    ]));
  }
}

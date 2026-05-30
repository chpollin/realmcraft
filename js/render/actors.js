// Sicht "Welt": Mächte (Diplomatie) und tragende Gruppen mit Sprechern.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Welt (data-view=welt)".
import { el } from '../components/ui.js';

const initials = (n) => (n || '?').replace(/^Die\s+/, '').trim().slice(0, 1).toUpperCase();

function relMeta(beziehung = {}) {
  const w = beziehung.wert;
  if (w == null) return { cls: 'unknown', pips: 0 };
  return { cls: w >= 2 ? 'warm' : 'cool', pips: Math.max(0, Math.min(5, w + 2)) };
}

export function renderWelt(root, state) {
  root.replaceChildren();
  if (!state) return;

  // Sprecher einer Gruppe kann ein Berater oder eine sonstige Person sein
  // (z. B. eine Verwalterin der nächsten Generation, die nicht im Rat sitzt).
  const sprecherById = (id) =>
    (state.berater || []).find((b) => b.id === id) ||
    (state.personen || []).find((p) => p.id === id);

  // --- Mächte ---
  const powerGrid = el('div', { class: 'power-grid' },
    (state.maechte || []).map((m) => {
      const r = relMeta(m.beziehung);
      const pips = el('span', { class: 'pips' },
        Array.from({ length: 5 }, (_, i) => el('i', { class: i < r.pips ? 'on' : '' })),
      );
      const relLabel = m.beziehung?.label || '';
      return el('article', { class: 'power', 'data-testid': 'power-card', dataset: { id: m.id } }, [
        el('div', { class: 'ph' }, [
          el('div', {}, [
            el('div', { class: 'pname', 'data-testid': 'power-name', text: m.name }),
            m.typ ? el('div', { class: 'ptype', text: m.typ }) : null,
          ]),
        ]),
        m.erscheinung ? el('div', { class: 'pdesc', text: m.erscheinung }) : null,
        el('span', { class: `rel ${r.cls}`, 'data-testid': 'power-relation' }, [
          m.beziehung?.wert != null ? pips : null,
          el('span', { text: relLabel }),
        ]),
        el('div', { class: 'stance', 'data-testid': 'power-stance' }, [
          el('span', { text: m.haltung || '' }),
        ]),
      ]);
    }),
  );

  const power = el('section', {}, [
    el('div', { class: 'section-title' }, [
      el('span', { class: 'kicker', text: 'Diplomatie' }),
      document.createTextNode(' Mächte des Kontinents'),
    ]),
    el('p', { class: 'section-sub', text: 'Nachbarvölker und Großmächte mit Beziehungsstand und Haltung.' }),
    powerGrid,
  ]);

  // --- Gruppen ---
  const groupGrid = el('div', { class: 'group-grid' },
    (state.gruppen || []).map((gr) => {
      const sp = sprecherById(gr.sprecherId);
      return el('div', { class: 'group', 'data-testid': 'group-row', dataset: { id: gr.id } }, [
        el('div', { class: 'gp', text: initials(gr.name) }),
        el('div', { class: 'gmeta' }, [
          el('div', { class: 'gn', text: gr.name }),
          gr.kompetenz ? el('div', { class: 'gk', text: gr.kompetenz }) : null,
          el('div', { class: 'gsp' }, [
            document.createTextNode('Sprecher: '),
            el('b', { text: sp ? sp.name : gr.sprecherId || '–' }),
          ]),
        ]),
      ]);
    }),
  );

  const groups = el('section', { class: 'panel pad mt' }, [
    el('div', { class: 'block-head' }, [
      el('h3', { text: 'Tragende Gruppen' }),
      el('div', { class: 'rule' }),
      el('span', { class: 'eyebrow', text: 'Bevölkerung und ihre Sprecher' }),
    ]),
    groupGrid,
  ]);

  root.append(power, groups);
}

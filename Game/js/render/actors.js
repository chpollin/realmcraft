// js/render/actors.js — View "Welt" (Powers + Groups)
// Vertrag: export function renderWelt(root, state): void
// Optik nach design/prototypes/war-table.html (Mächte-Cards + Gruppen-Tabelle mit Sprecher).
import { el } from '../components/ui.js';

function flagSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p1.setAttribute('d', 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z');
  const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p2.setAttribute('d', 'M4 22v-7');
  svg.append(p1, p2);
  return svg;
}

function relClass(w) {
  if (w == null) return 'unknown';
  if (w >= 2) return 'warm';
  if (w >= 1) return 'cool';
  return 'unknown';
}

/**
 * Leert root und baut die Welt-Ansicht neu auf.
 * @param {HTMLElement} root
 * @param {object} state
 */
export function renderWelt(root, state) {
  root.replaceChildren();
  if (!state) return;

  const maechte = Array.isArray(state.maechte) ? state.maechte : [];
  const gruppen = Array.isArray(state.gruppen) ? state.gruppen : [];
  const berater = Array.isArray(state.berater) ? state.berater : [];

  root.appendChild(
    el('div', { class: 'section-title' }, [
      el('span', { class: 'kicker' }, 'Diplomatie'),
      ' Mächte des Kontinents',
    ])
  );
  root.appendChild(
    el(
      'p',
      { class: 'section-sub' },
      'Nachbarvölker und Großmächte mit Beziehungsstand und Haltung.'
    )
  );

  // ---- Mächte ----
  const powerGrid = el('div', { class: 'power-grid' });
  for (const m of maechte) {
    const bez = m.beziehung || {};
    const w = bez.wert;

    const card = el('div', {
      class: 'power',
      dataset: { testid: 'power-card', id: m.id },
    });

    card.appendChild(
      el('div', { class: 'ph' }, [
        el('div', {}, [
          el('div', { class: 'pname', dataset: { testid: 'power-name' } }, m.name || ''),
          el('div', { class: 'ptype' }, m.typ || ''),
        ]),
      ])
    );

    card.appendChild(el('p', { class: 'pdesc' }, m.erscheinung || ''));

    // Beziehung
    const rel = el('span', {
      class: `rel ${relClass(w)}`,
      dataset: { testid: 'power-relation' },
    });
    if (w != null) {
      const pips = el('span', { class: 'pips' });
      for (let i = 0; i < 3; i++) {
        pips.appendChild(el('i', { class: i < w ? 'on' : '' }));
      }
      rel.appendChild(pips);
    }
    rel.appendChild(document.createTextNode(bez.label || ''));
    card.appendChild(rel);

    // Haltung (stance)
    card.appendChild(
      el('div', { class: 'stance', dataset: { testid: 'power-stance' } }, [
        flagSvg(),
        el('span', {}, m.haltung || ''),
      ])
    );

    powerGrid.appendChild(card);
  }
  root.appendChild(powerGrid);

  // ---- Tragende Gruppen ----
  const groupPanel = el('div', { class: 'panel pad mt' });
  groupPanel.appendChild(
    el('div', { class: 'block-head' }, [
      el('h3', {}, 'Tragende Gruppen'),
      el('div', { class: 'rule' }),
      el('span', { class: 'eyebrow' }, 'Bevölkerung und ihre Sprecher'),
    ])
  );

  const groupGrid = el('div', { class: 'group-grid' });
  for (const g of gruppen) {
    const sprecher = berater.find((b) => b.id === g.sprecherId);
    const row = el('div', {
      class: 'group',
      dataset: { testid: 'group-row', id: g.id },
    });

    row.appendChild(
      el('div', { class: 'gp' }, (g.name && g.name[0]) || '?')
    );

    const meta = el('div', { class: 'gmeta' }, [
      el('div', { class: 'gn' }, g.name || ''),
      el('div', { class: 'gk' }, g.kompetenz || ''),
    ]);
    if (sprecher) {
      meta.appendChild(
        el('div', { class: 'gsp' }, ['Sprecher · ', el('b', {}, sprecher.name || '')])
      );
    }
    row.appendChild(meta);

    groupGrid.appendChild(row);
  }
  groupPanel.appendChild(groupGrid);
  root.appendChild(groupPanel);
}

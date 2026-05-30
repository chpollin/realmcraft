// js/render/history.js — View "Historie" (History)
// Vertrag: export function renderHistorie(root, state): void
// Optik nach design/prototypes/war-table.html (Zeitstrahl + Fähigkeiten + Besitz).
import { el } from '../components/ui.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

function checkSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M20 6L9 17l-5-5');
  svg.appendChild(p);
  return svg;
}

function gemSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p1 = document.createElementNS(ns, 'path');
  p1.setAttribute('d', 'M6 3h12l4 6-10 13L2 9z');
  const p2 = document.createElementNS(ns, 'path');
  p2.setAttribute('d', 'M11 3 8 9l4 13 4-13-3-6M2 9h20');
  svg.append(p1, p2);
  return svg;
}

/**
 * Leert root und baut die Historie-Ansicht neu auf.
 * @param {HTMLElement} root
 * @param {object} state
 */
export function renderHistorie(root, state) {
  root.replaceChildren();
  if (!state) return;

  const historie = Array.isArray(state.historie) ? state.historie : [];
  const faehigkeiten = Array.isArray(state.faehigkeiten) ? state.faehigkeiten : [];
  const besitz = Array.isArray(state.besitz) ? state.besitz : [];

  root.appendChild(
    el('div', { class: 'section-title' }, [
      el('span', { class: 'kicker' }, 'Chronik'),
      ' Der Weg des Volkes',
    ])
  );
  root.appendChild(
    el(
      'p',
      { class: 'section-sub' },
      'Die wichtigsten Entscheidungen in ihrer Reihenfolge.'
    )
  );

  // ---- Zeitstrahl ----
  const tlPanel = el('div', { class: 'panel pad' });
  const timeline = el('div', { class: 'timeline' });
  historie.forEach((h, i) => {
    const cur = i === historie.length - 1;
    const epoch = el('div', {
      class: `epoch ${cur ? 'current' : ''}`.trim(),
      dataset: { testid: 'history-entry', kapitel: h.kapitel },
    });
    epoch.appendChild(
      el('div', { class: 'node' }, [el('b', {}, ROMAN[h.kapitel - 1] || String(h.kapitel))])
    );
    const ehead = el('div', { class: 'ehead' }, [
      el('span', { class: 'etitle' }, `Kapitel ${h.kapitel}`),
      el('span', { class: 'eyears' }, h.jahre || ''),
    ]);
    if (cur) ehead.appendChild(el('span', { class: 'ecur' }, 'Aktuell'));
    epoch.appendChild(ehead);
    epoch.appendChild(el('p', { class: 'esum' }, h.zusammenfassung || ''));
    timeline.appendChild(epoch);
  });
  tlPanel.appendChild(timeline);
  root.appendChild(tlPanel);

  // ---- Fähigkeiten + Besitz ----
  const twoCol = el('div', { class: 'two-col' });

  // Fähigkeiten
  const skillPanel = el('div', { class: 'panel pad' });
  skillPanel.appendChild(
    el('div', { class: 'block-head' }, [
      el('h3', {}, 'Fähigkeiten'),
      el('div', { class: 'rule' }),
      el('span', { class: 'eyebrow' }, 'Was der Wissensstand beherrscht'),
    ])
  );
  const skills = el('ul', { class: 'list-clean' });
  for (const f of faehigkeiten) {
    skills.appendChild(
      el('li', { dataset: { testid: 'faehigkeit' } }, [checkSvg(), el('span', {}, f)])
    );
  }
  skillPanel.appendChild(skills);
  twoCol.appendChild(skillPanel);

  // Besitz
  const holdPanel = el('div', { class: 'panel pad' });
  holdPanel.appendChild(
    el('div', { class: 'block-head' }, [
      el('h3', {}, 'Besitz'),
      el('div', { class: 'rule' }),
      el('span', { class: 'eyebrow' }, 'Bauten, Orte, Güter'),
    ])
  );
  const holdings = el('ul', { class: 'list-clean' });
  for (const b of besitz) {
    holdings.appendChild(
      el('li', { dataset: { testid: 'besitz' } }, [gemSvg(), el('span', {}, b)])
    );
  }
  holdPanel.appendChild(holdings);
  twoCol.appendChild(holdPanel);

  root.appendChild(twoCol);
}

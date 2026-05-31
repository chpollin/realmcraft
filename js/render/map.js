// js/render/map.js — Karte-Reiter: Kartenbild, Karten-Chronik (Zeitleiste der
// Stände) und Orte-Liste. Ohne karte.chronik verhält sich der Reiter wie bisher
// (ein Bild aus karte.prompt).
import { el } from '../format.js';

export function renderMap(root, state, handlers = {}) {
  const k = state.karte || {};
  const orte = Array.isArray(k.orte) ? k.orte : [];
  const chronik = Array.isArray(k.chronik) ? k.chronik : [];
  const selId = (handlers.getKarteStandId && handlers.getKarteStandId()) || k.aktuellerStand;
  const aktiv = chronik.length
    ? (chronik.find((e) => e.id === selId) || chronik[chronik.length - 1])
    : null;

  root.innerHTML = '';

  // Kartenbild mit Erzeugen-Knopf (wie Hero/Heerschau).
  const figure = el('figure', { class: 'map-figure', 'data-testid': 'map-figure' });
  const img = el('img', {
    class: 'map-image',
    'data-testid': 'map-image',
    alt: k.bildAlt || 'Karte der bekannten Welt',
    loading: 'lazy',
  });
  figure.appendChild(img);

  // Anlass und Zeit des gezeigten Standes.
  if (aktiv && (aktiv.zeit || aktiv.anlass)) {
    const cap = el('figcaption', { class: 'map-stand-info', 'data-testid': 'karte-stand-info' });
    if (aktiv.zeit) cap.appendChild(el('span', { class: 'map-stand-zeit', text: aktiv.zeit }));
    if (aktiv.anlass) cap.appendChild(el('span', { class: 'map-stand-anlass', text: aktiv.anlass }));
    figure.appendChild(cap);
  }

  // Erzeugen: ohne Chronik wie bisher; mit Chronik den aktiven Stand, und wenn
  // er auf einem Vorgänger basiert, aus dessen Bild weiterentwickeln.
  const evolving = !!(aktiv && aktiv.basiertAuf);
  const genBtn = el('button', {
    class: 'btn gen-map',
    'data-testid': chronik.length ? 'generate-karte-stand' : 'generate-map',
    type: 'button',
    text: evolving ? 'Aus der vorigen weiterentwickeln' : 'Karte erzeugen',
  });
  genBtn.addEventListener('click', () => {
    if (chronik.length && handlers.onGenerateKarteStand) handlers.onGenerateKarteStand(aktiv.id);
    else if (handlers.onGenerateMap) handlers.onGenerateMap();
  });
  figure.appendChild(genBtn);

  root.appendChild(figure);

  // Karten-Chronik: Zeitleiste der Stände, jeder anklickbar; aktiver hervorgehoben.
  if (chronik.length) {
    const chronikPanel = el('section', { class: 'panel chronik-panel', 'data-testid': 'chronik-panel' });
    chronikPanel.appendChild(el('h3', { text: 'Karten-Chronik' }));
    const leiste = el('div', { class: 'karte-chronik', 'data-testid': 'karte-chronik' });
    for (const e of chronik) {
      const istAktiv = aktiv && e.id === aktiv.id;
      const btn = el('button', {
        class: `karte-stand${istAktiv ? ' karte-stand-aktiv' : ''}`,
        'data-testid': istAktiv ? 'karte-stand-aktiv' : 'karte-stand',
        type: 'button',
        'aria-pressed': istAktiv ? 'true' : 'false',
      });
      if (e.zeit) btn.appendChild(el('span', { class: 'karte-stand-zeit', text: e.zeit }));
      if (e.anlass) btn.appendChild(el('span', { class: 'karte-stand-anlass', text: e.anlass }));
      btn.addEventListener('click', () => handlers.onSelectKarteStand && handlers.onSelectKarteStand(e.id));
      leiste.appendChild(btn);
    }
    chronikPanel.appendChild(leiste);
    root.appendChild(chronikPanel);
  }

  // Orte-Liste (gilt für den aktuellen Stand).
  const ortePanel = el('section', { class: 'panel orte-panel', 'data-testid': 'orte-panel' });
  ortePanel.appendChild(el('h3', { text: 'Orte' }));
  if (orte.length) {
    const list = el('ul', { class: 'orte-list', 'data-testid': 'orte-list' });
    for (const o of orte) {
      const li = el('li', { class: 'ort', 'data-testid': 'ort' });
      li.appendChild(el('span', { class: 'ort-name', text: o.name || '' }));
      if (o.art) li.appendChild(el('span', { class: 'ort-art', text: o.art }));
      if (o.beschreibung) li.appendChild(el('span', { class: 'ort-besch', text: o.beschreibung }));
      list.appendChild(li);
    }
    ortePanel.appendChild(list);
  } else {
    ortePanel.appendChild(el('p', { class: 'muted', text: 'Noch keine Orte verzeichnet.' }));
  }
  root.appendChild(ortePanel);
}

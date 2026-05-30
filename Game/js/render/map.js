// js/render/map.js — View "Karte" (Map)
// Vertrag: export function renderKarte(root, state, handlers): void
//   handlers = { onGenerateMap() }
// Optik nach design/prototypes/war-table.html (Karten-Platzhalter + Orte-Legende).
import { el } from '../components/ui.js';

function compassSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'compass');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', '#c9a24a');
  svg.setAttribute('stroke-width', '1');
  const mk = (tag, attrs) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  svg.appendChild(mk('circle', { cx: '50', cy: '50', r: '44', 'stroke-opacity': '.5' }));
  svg.appendChild(mk('circle', { cx: '50', cy: '50', r: '34', 'stroke-opacity': '.25' }));
  svg.appendChild(mk('path', { d: 'M50 8 L57 50 L50 92 L43 50 Z', fill: '#e7c879', stroke: 'none', opacity: '.85' }));
  svg.appendChild(mk('path', { d: 'M8 50 L50 43 L92 50 L50 57 Z', fill: '#9c7a30', stroke: 'none', opacity: '.7' }));
  svg.appendChild(mk('circle', { cx: '50', cy: '50', r: '4', fill: '#0a0c10', stroke: '#e7c879' }));
  return svg;
}

function pinSvg(capital) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', capital ? '1.4' : '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (capital) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M12 2l2.9 6.2 6.6.8-4.9 4.5 1.3 6.5L12 17.3 6.1 20.5l1.3-6.5L2.5 9.5l6.6-.8z');
    svg.appendChild(p);
  } else {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z');
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', '12');
    c.setAttribute('cy', '10');
    c.setAttribute('r', '3');
    svg.append(p, c);
  }
  return svg;
}

/**
 * Leert root und baut die Karten-Ansicht neu auf.
 * Verkabelt den Karten-Button mit handlers.onGenerateMap().
 * @param {HTMLElement} root
 * @param {object} state
 * @param {{ onGenerateMap?: () => void }} [handlers]
 */
export function renderKarte(root, state, handlers = {}) {
  root.replaceChildren();
  if (!state) return;

  const karte = state.karte || {};
  const meta = state.meta || {};
  const orte = Array.isArray(karte.orte) ? karte.orte : [];
  const onGenerateMap = handlers.onGenerateMap || (() => {});

  root.appendChild(
    el('div', { class: 'section-title' }, [
      el('span', { class: 'kicker' }, 'Geographie'),
      ' Die bekannte Welt',
    ])
  );
  root.appendChild(
    el(
      'p',
      { class: 'section-sub' },
      'Die Karte wächst mit dem Spiel und zeigt nur, was das Volk kennt.'
    )
  );

  const wrap = el('div', { class: 'map-wrap' });

  // ---- Karten-Rahmen mit Platzhalter ----
  const frame = el('div', { class: 'map-frame' });
  frame.append(
    el('span', { class: 'map-corner tl' }),
    el('span', { class: 'map-corner tr' }),
    el('span', { class: 'map-corner bl' }),
    el('span', { class: 'map-corner br' })
  );

  // Bild (anfangs leer/Platzhalter, hidden bis Quelle gesetzt)
  const img = el('img', {
    class: 'map-image',
    dataset: { testid: 'map-image' },
    alt: 'Lagekarte',
    hidden: true,
  });
  if (karte.bildDataUrl) {
    img.src = karte.bildDataUrl;
    img.hidden = false;
  }
  frame.appendChild(img);

  // Platzhalter-Mitte (Kompass + Hinweis + Button)
  const center = el('div', { class: 'map-center' });
  center.appendChild(compassSvg());
  center.appendChild(el('div', { class: 'mt' }, 'Lagekarte wird generiert'));
  center.appendChild(el('div', { class: 'ms' }, meta.mapStyle || ''));

  const genBtn = el(
    'button',
    {
      class: 'btn primary',
      type: 'button',
      dataset: { testid: 'generate-map' },
      onClick: () => onGenerateMap(),
    },
    'Karte erzeugen'
  );
  center.appendChild(genBtn);
  frame.appendChild(center);

  wrap.appendChild(frame);

  // ---- Legende ----
  const legend = el('div', { class: 'legend' });
  legend.appendChild(
    el('div', { class: 'block-head' }, [el('h3', {}, 'Orte'), el('div', { class: 'rule' })])
  );
  const ll = el('ul', { class: 'll', dataset: { testid: 'map-legend' } });
  for (const o of orte) {
    const isCapital = typeof o.typ === 'string' && o.typ.includes('Hauptstadt');
    const li = el('li', { dataset: { testid: 'map-place', id: o.id } }, [
      el('span', { class: `gly ${isCapital ? 'cap' : ''}`.trim() }, [pinSvg(isCapital)]),
      el('div', {}, [
        el('div', { class: 'li-nm' }, o.name || ''),
        el('div', { class: 'li-ty' }, o.typ || ''),
        el('div', { class: 'li-rl' }, o.beziehung || ''),
      ]),
      el('span', { class: 'li-dir' }, o.richtung || ''),
    ]);
    ll.appendChild(li);
  }
  legend.appendChild(ll);
  wrap.appendChild(legend);

  root.appendChild(wrap);
}

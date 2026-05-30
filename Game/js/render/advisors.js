// js/render/advisors.js — View "Berater" (Advisors)
// Vertrag: export function renderBerater(root, state, handlers): void
//   handlers = { onGeneratePortrait(beraterId) }
// Optik nach design/prototypes/war-table.html (Berater-Cards mit Loyalitäts-Schiene).
import { el, loyaltyMeter } from '../components/ui.js';

const num = (n) => (n > 0 ? '+' : '') + n;

function clockSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '12');
  c.setAttribute('cy', '12');
  c.setAttribute('r', '10');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M12 6v6l4 2');
  svg.append(c, p);
  return svg;
}

function loyaltyState(v) {
  if (v >= 4) return { label: 'Ergeben', color: 'var(--rc-pos)' };
  if (v >= 1) return { label: 'Treu', color: 'var(--rc-pos)' };
  if (v <= -1) return { label: 'Wankend', color: 'var(--rc-neg)' };
  return { label: 'Neutral', color: 'var(--rc-ink-dim)' };
}

/**
 * Leert root und baut die Berater-Ansicht neu auf.
 * Verkabelt den Portrait-Button je Card mit handlers.onGeneratePortrait(berater.id).
 * @param {HTMLElement} root
 * @param {object} state
 * @param {{ onGeneratePortrait?: (beraterId: string) => void }} [handlers]
 */
export function renderBerater(root, state, handlers = {}) {
  root.replaceChildren();
  if (!state) return;

  const berater = Array.isArray(state.berater) ? state.berater : [];
  const onGeneratePortrait = handlers.onGeneratePortrait || (() => {});

  root.appendChild(
    el('div', { class: 'section-title' }, [
      el('span', { class: 'kicker' }, 'Der Rat'),
      ' Berater und Loyalität',
    ])
  );
  root.appendChild(
    el(
      'p',
      { class: 'section-sub' },
      'Jede tragende Gruppe spricht durch einen benannten Charakter mit eigenem Ziel. Loyalität läuft von -5 (am Bruch) bis +5 (ergeben).'
    )
  );

  const list = el('div', {
    class: 'advisor-grid',
    dataset: { testid: 'advisor-list' },
  });

  for (const b of berater) {
    const card = el('div', {
      class: 'advisor',
      dataset: { testid: 'advisor-card', id: b.id },
    });
    card.dataset.id = b.id; // data-id = berater.id (Vertrag)

    // Kopf: Portrait + Name/Rolle
    const portrait = el('div', { class: 'portrait' }, [
      el('span', { class: 'ring' }),
    ]);
    const img = el('img', {
      class: 'portrait-img',
      dataset: { testid: 'advisor-portrait' },
      alt: `Portrait von ${b.name || ''}`,
      hidden: true,
    });
    const dataUrl = b.portrait && b.portrait.dataUrl;
    if (dataUrl) {
      img.src = dataUrl;
      img.hidden = false;
    }
    portrait.appendChild(img);
    // Initiale als Platzhalter, solange kein Bild gesetzt ist
    portrait.appendChild(
      el('span', { class: 'ini' }, (b.name && b.name[0]) || '?')
    );

    const head = el('div', { class: 'head' }, [
      portrait,
      el('div', { class: 'who' }, [
        el('div', { class: 'nm', dataset: { testid: 'advisor-name' } }, b.name || ''),
        el('div', { class: 'role', dataset: { testid: 'advisor-role' } }, b.rolle || ''),
      ]),
    ]);
    card.appendChild(head);

    // Ziel-Zitat
    card.appendChild(
      el('div', { class: 'goal' }, [
        el('span', { dataset: { testid: 'advisor-goal' } }, b.ziel || ''),
      ])
    );

    // Generation
    card.appendChild(
      el('div', { class: 'gen' }, [clockSvg(), el('span', {}, b.generation || '')])
    );

    // Loyalität
    const v = Number(b.loyalitaet) || 0;
    const st = loyaltyState(v);
    const loy = el('div', { class: 'loy' });
    loy.appendChild(
      el('div', { class: 'lhead' }, [
        el('span', { class: 'ltitle' }, 'Loyalität'),
        el(
          'span',
          {
            class: 'lstate',
            dataset: { testid: 'advisor-loyalty' },
            style: `color:${st.color}`,
          },
          `${st.label} · ${num(v)}`
        ),
      ])
    );
    loy.appendChild(loyaltyMeter(v));
    card.appendChild(loy);

    // Portrait-Button
    const genBtn = el(
      'button',
      {
        class: 'btn',
        type: 'button',
        dataset: { testid: 'generate-portrait' },
        onClick: () => onGeneratePortrait(b.id),
      },
      'Portrait erzeugen'
    );
    card.appendChild(genBtn);

    list.appendChild(card);
  }

  root.appendChild(list);
}

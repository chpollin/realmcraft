// js/render/overview.js — View "Lage" (Overview)
// Vertrag: export function renderLage(root, state): void
// Optik nach design/prototypes/war-table.html (Richtung War Table).
import { el, gauge, statCard } from '../components/ui.js';

const num = (n) => (n > 0 ? '+' : '') + n;

const SEASON = {
  Frühling: 'Frühling',
  Sommer: 'Sommer',
  Herbst: 'Herbst',
  Winter: 'Winter',
};

function starSvg(on) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', on ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.2');
  svg.setAttribute('class', on ? 'on' : 'off');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute(
    'd',
    'M12 2l2.9 6.2 6.6.8-4.9 4.5 1.3 6.5L12 17.3 6.1 20.5l1.3-6.5L2.5 9.5l6.6-.8z'
  );
  svg.appendChild(p);
  return svg;
}

/**
 * Leert root und baut die Lage-Ansicht neu auf.
 * @param {HTMLElement} root
 * @param {object} state
 */
export function renderLage(root, state) {
  root.replaceChildren();
  if (!state) return;

  const meta = state.meta || {};
  const zeit = meta.zeit || {};
  const volk = state.volk || {};
  const status = state.status || {};
  const ansehen = status.ansehen || {};
  const grund = state.grundgroessen || {};
  const bev = grund.bevoelkerung || {};
  const lage = state.lagewerte || {};
  const ausbeuten = Array.isArray(lage.ausbeuten) ? lage.ausbeuten : [];
  const faeden = Array.isArray(state.offeneFaeden) ? state.offeneFaeden : [];

  // ---- Hero: Crest + Renown ----
  const hero = el('div', { class: 'hero' });

  // Crest
  const crest = el('div', { class: 'crest' });

  const badges = el('div', { class: 'badges' });
  const badgeDefs = [
    { t: `Kapitel ${meta.kapitel ?? ''}`.trim(), cls: '' },
    {
      t: `${SEASON[zeit.jahreszeit] || zeit.jahreszeit || ''} · Jahr ${zeit.jahr ?? ''}`.trim(),
      cls: '',
    },
    {
      t: meta.weltereignis === 'gewürfelt' ? 'Weltereignis gewürfelt' : 'Weltereignis offen',
      cls: 'amber',
    },
  ];
  for (const b of badgeDefs) {
    badges.appendChild(
      el('span', { class: `badge ${b.cls}`.trim() }, [
        el('span', { class: 'dot' }),
        b.t,
      ])
    );
  }
  crest.appendChild(badges);

  const realmName = el('div', { class: 'realm-name' }, [
    el('span', { class: 'the' }, 'Das Volk'),
    el('span', { dataset: { testid: 'realm-name' } }, volk.name || ''),
  ]);
  crest.appendChild(realmName);

  crest.appendChild(
    el('div', { class: 'realm-essence' }, volk.wesensart || '')
  );
  crest.appendChild(
    el('p', { class: 'realm-desc' }, volk.erscheinung || '')
  );

  const region = volk.region || {};
  const crestMeta = el('div', { class: 'crest-meta' }, [
    el('div', { class: 'm' }, [
      el('span', { class: 'k' }, 'Region'),
      el('span', { class: 'v' }, region.name || '—'),
    ]),
    el('div', { class: 'm' }, [
      el('span', { class: 'k' }, 'Ausrichtung'),
      el('span', { class: 'v' }, volk.ausrichtung || '—'),
    ]),
    el('div', { class: 'm' }, [
      el('span', { class: 'k' }, 'Jahreszeit'),
      el('span', { class: 'v', dataset: { testid: 'season' } },
        SEASON[zeit.jahreszeit] || zeit.jahreszeit || '—'),
    ]),
    el('div', { class: 'm' }, [
      el('span', { class: 'k' }, 'Kapitel'),
      el('span', { class: 'v', dataset: { testid: 'chapter' } },
        String(meta.kapitel ?? '—')),
    ]),
    el('div', { class: 'm' }, [
      el('span', { class: 'k' }, 'Weltereignis'),
      el('span', { class: 'v', dataset: { testid: 'worldevent' } },
        meta.weltereignis || '—'),
    ]),
  ]);
  crest.appendChild(crestMeta);
  hero.appendChild(crest);

  // Renown
  const stufe = Number(ansehen.stufe) || 0;
  const maxStars = 5;
  const renown = el('div', { class: 'renown', dataset: { testid: 'ansehen' } });
  renown.appendChild(el('div', { class: 'lbl' }, 'Ansehen'));
  const stars = el('div', { class: 'stars' });
  for (let i = 0; i < maxStars; i++) stars.appendChild(starSvg(i < stufe));
  renown.appendChild(stars);
  renown.appendChild(el('div', { class: 'rstage' }, ansehen.label || ''));
  renown.appendChild(el('p', { class: 'rdesc' }, status.text || ''));
  renown.appendChild(
    el('div', { class: 'rfoot' }, `Stufe ${stufe} von ${maxStars}`)
  );
  hero.appendChild(renown);

  root.appendChild(hero);

  // ---- Grundgrößen (Stat-Cards) ----
  const statPanel = el('div', { class: 'panel pad mt' });
  statPanel.appendChild(
    el('div', { class: 'block-head' }, [
      el('h3', {}, 'Grundgrößen'),
      el('div', { class: 'rule' }),
      el('span', { class: 'eyebrow' }, 'Getragene Vorräte'),
    ])
  );
  const statGrid = el('div', { class: 'stat-grid' });

  const nahrungCard = statCard({
    label: 'Nahrung',
    value: grund.nahrung ?? 0,
    sub: 'Getragener Vorrat',
  });
  nahrungCard.dataset.testid = 'stat-nahrung';

  const materialCard = statCard({
    label: 'Material',
    value: grund.material ?? 0,
    sub: 'Werkstoff für Bau und Schmiede',
  });
  materialCard.dataset.testid = 'stat-material';

  const wissenCard = statCard({
    label: 'Wissen',
    value: grund.wissen ?? 0,
    sub: 'Wissenshaus, höchster Wert',
  });
  wissenCard.dataset.testid = 'stat-wissen';

  const bevCard = statCard({
    label: 'Bevölkerung',
    value: bev.zahl ?? '—',
    sub: bev.label || '',
  });
  bevCard.dataset.testid = 'stat-bevoelkerung';

  statGrid.append(nahrungCard, materialCard, wissenCard, bevCard);
  statPanel.appendChild(statGrid);
  root.appendChild(statPanel);

  // ---- Lagewerte + Offene Fäden ----
  const grid2 = el('div', { class: 'grid-2 mt' });

  // Lagewerte
  const lagePanel = el('div', { class: 'panel pad' });
  lagePanel.appendChild(
    el('div', { class: 'block-head' }, [
      el('h3', {}, 'Lagewerte'),
      el('div', { class: 'rule' }),
      el('span', { class: 'eyebrow' }, 'Maßstab -2 bis +3'),
    ])
  );
  const lageGrid = el('div', { class: 'lage-grid' });
  const LMIN = -2,
    LMAX = 3;
  const lageDefs = [
    { nm: 'Verteidigung', val: lage.verteidigung ?? 0, testid: 'lage-verteidigung', note: 'Die Festung, kriegserprobt' },
    { nm: 'Mobilität', val: lage.mobilitaet ?? 0, testid: 'lage-mobilitaet', note: 'Straßen und Bundeswege' },
    { nm: 'Wohlstand', val: lage.wohlstand ?? 0, testid: 'lage-wohlstand', note: 'Handel, neue Dimension' },
  ];
  for (const l of lageDefs) {
    const bar = el('div', { class: 'lagebar' });
    bar.appendChild(
      el('div', { class: 'top' }, [
        el('span', { class: 'nm' }, l.nm),
        el(
          'span',
          { class: `val ${l.val === 0 ? 'neutral' : ''}`.trim(), dataset: { testid: l.testid } },
          num(l.val)
        ),
      ])
    );
    bar.appendChild(gauge(l.val, LMIN, LMAX));
    bar.appendChild(el('div', { class: 'gnote' }, l.note));
    lageGrid.appendChild(bar);
  }
  lagePanel.appendChild(lageGrid);

  // Ausbeuten
  const yieldRow = el('div', { class: 'yield-row' });
  for (const a of ausbeuten) {
    yieldRow.appendChild(
      el('div', { class: 'yield' }, [
        el('span', { class: 'amt' }, num(a.value)),
        el('div', {}, [
          el('div', { class: 'yk' }, a.key || ''),
          el('div', { class: 'ysrc' }, a.quelle || ''),
        ]),
      ])
    );
  }
  lagePanel.appendChild(yieldRow);
  grid2.appendChild(lagePanel);

  // Offene Fäden
  const fadenPanel = el('div', { class: 'panel pad' });
  fadenPanel.appendChild(
    el('div', { class: 'block-head' }, [
      el('h3', {}, 'Offene Fäden'),
      el('div', { class: 'rule' }),
      el('span', { class: 'eyebrow' }, 'Das nächste Kapitel'),
    ])
  );
  const threads = el('ul', { class: 'threads', dataset: { testid: 'offene-faeden' } });
  for (const f of faeden) {
    threads.appendChild(
      el('li', {}, [el('span', { class: 'marker' }), el('span', {}, f)])
    );
  }
  fadenPanel.appendChild(threads);
  grid2.appendChild(fadenPanel);

  root.appendChild(grid2);
}

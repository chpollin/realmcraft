// Sicht "Lage": Grundgrößen, Lagewerte, offene Fäden.
// (Realm-Identität und Ansehen rendert app.js in die persistente Hero-Leiste.)
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Lage (data-view=lage)".
import { el, gauge } from '../components/ui.js';

const fmt = (n) => (n > 0 ? `+${n}` : `${n}`);

const ICO = {
  nahrung: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3 0-5 2.5-5 6 0 4 2 9 5 12 3-3 5-8 5-12 0-3.5-2-6-5-6z"/><path d="M12 9v8"/></svg>',
  material: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>',
  wissen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 0-2 2z"/><path d="M4 5v14"/><path d="M9 7h6M9 11h6"/></svg>',
  bevoelkerung: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5a3 3 0 0 1 0 6M18 20c0-2.5-1-4-3-4.6"/></svg>',
};

export function renderLage(root, state) {
  root.replaceChildren();
  if (!state) return;

  const { grundgroessen = {}, lagewerte = {}, offeneFaeden = [] } = state;

  // --- Grundgrößen ---
  const bev = grundgroessen.bevoelkerung || {};
  const stats = [
    { k: 'nahrung', lab: 'Nahrung', val: grundgroessen.nahrung },
    { k: 'material', lab: 'Material', val: grundgroessen.material },
    { k: 'wissen', lab: 'Wissen', val: grundgroessen.wissen },
    { k: 'bevoelkerung', lab: 'Bevölkerung', val: bev.zahl ?? bev.label ?? '–', sub: bev.label },
  ];
  const statGrid = el('div', { class: 'stat-grid' },
    stats.map((s) =>
      el('div', { class: 'stat' }, [
        el('div', { class: 'ico', html: ICO[s.k] || '' }),
        el('div', { class: 'num', 'data-testid': `stat-${s.k}`, text: String(s.val) }),
        el('div', { class: 'lab', text: s.lab }),
        s.sub ? el('div', { class: 'note', text: s.sub }) : null,
      ]),
    ),
  );
  const grund = el('section', { class: 'panel pad' }, [
    blockHead('Grundgrößen', 'Getragene Vorräte'),
    statGrid,
  ]);

  // --- Lagewerte ---
  const bars = [
    { k: 'verteidigung', nm: 'Verteidigung', v: lagewerte.verteidigung ?? 0 },
    { k: 'mobilitaet', nm: 'Mobilität', v: lagewerte.mobilitaet ?? 0 },
    { k: 'wohlstand', nm: 'Wohlstand', v: lagewerte.wohlstand ?? 0 },
  ];
  const lageGrid = el('div', { class: 'lage-grid' },
    bars.map((b) =>
      el('div', { class: 'lagebar' }, [
        el('div', { class: 'top' }, [
          el('span', { class: 'nm', text: b.nm }),
          el('span', {
            class: `val${b.v === 0 ? ' neutral' : ''}${b.v < 0 ? ' neg' : ''}`,
            'data-testid': `lage-${b.k}`,
            text: fmt(b.v),
          }),
        ]),
        gauge(b.v, -2, 3),
        el('div', { class: 'scale-ticks' }, [
          el('span', { text: '-2' }), el('span', { text: '0' }), el('span', { text: '+3' }),
        ]),
      ]),
    ),
  );
  const yields = (lagewerte.ausbeuten || []).map((a) =>
    el('div', { class: 'yield' }, [
      el('span', { class: 'amt', text: fmt(a.value) }),
      el('div', {}, [
        el('div', { class: 'yk', text: `Ausbeute ${a.key}` }),
        a.quelle ? el('div', { class: 'ysrc', text: a.quelle }) : null,
      ]),
    ]),
  );
  const lage = el('div', { class: 'panel pad' }, [
    blockHead('Lagewerte', 'Maßstab -2 bis +3'),
    lageGrid,
    yields.length ? el('div', { class: 'yield-row' }, yields) : null,
  ]);

  // --- Offene Fäden ---
  const threads = el('ul', { class: 'threads', 'data-testid': 'offene-faeden' },
    offeneFaeden.map((t) =>
      el('li', {}, [el('span', { class: 'marker' }), el('span', { text: t })]),
    ),
  );
  const faeden = el('div', { class: 'panel pad' }, [
    blockHead('Offene Fäden', 'Das nächste Kapitel'),
    threads,
  ]);

  root.append(grund, el('div', { class: 'grid-2 mt' }, [lage, faeden]));
}

function blockHead(title, eyebrow) {
  return el('div', { class: 'block-head' }, [
    el('h3', { text: title }),
    el('div', { class: 'rule' }),
    eyebrow ? el('span', { class: 'eyebrow', text: eyebrow }) : null,
  ]);
}

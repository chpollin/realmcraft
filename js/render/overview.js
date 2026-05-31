// Sicht "Lage": Grundgrößen, Lagewerte, offene Fäden.
// (Realm-Identität und Ansehen rendert app.js in die persistente Hero-Leiste.)
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Lage (data-view=lage)".
import { el, gauge } from '../components/ui.js';
import { signed, signedZeroPlus } from '../format.js';

// Trend-Markierung je Grundgröße (steigend ▲, fallend ▼, gleichbleibend →).
const TREND = {
  steigend: { mark: '▲', cls: 'up' },
  fallend: { mark: '▼', cls: 'down' },
  gleichbleibend: { mark: '→', cls: 'flat' },
};
function trendEl(trends, key) {
  const t = trends && trends[key];
  if (!t || !TREND[t.richtung]) return null;
  const { mark, cls } = TREND[t.richtung];
  return el('span', {
    class: `trend trend-${cls}`,
    'data-testid': `trend-${key}`,
    title: t.grund || '',
    text: mark,
  });
}

const ICO = {
  nahrung: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3 0-5 2.5-5 6 0 4 2 9 5 12 3-3 5-8 5-12 0-3.5-2-6-5-6z"/><path d="M12 9v8"/></svg>',
  material: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>',
  wissen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 0-2 2z"/><path d="M4 5v14"/><path d="M9 7h6M9 11h6"/></svg>',
  bevoelkerung: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5a3 3 0 0 1 0 6M18 20c0-2.5-1-4-3-4.6"/></svg>',
};

export function renderLage(root, state, opts = {}) {
  root.replaceChildren();
  if (!state) return;

  // Delta zum zuletzt geladenen Stand, nur nach echtem Laden mit Aenderungen.
  if (opts.delta && opts.delta.hasChanges) {
    root.append(renderDeltaBanner(opts.delta));
  }

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
        el('div', { class: 'ico', 'aria-hidden': 'true', html: ICO[s.k] || '' }),
        el('div', { class: 'num', 'data-testid': `stat-${s.k}`, text: String(s.val) }),
        trendEl(state.trends, s.k),
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
            text: signed(b.v),
          }),
        ]),
        gauge(b.v, -2, 3, { label: b.nm, valueText: signed(b.v) }),
        el('div', { class: 'scale-ticks' }, [
          el('span', { text: '-2' }), el('span', { text: '0' }), el('span', { text: '+3' }),
        ]),
      ]),
    ),
  );
  const yields = (lagewerte.ausbeuten || []).map((a) =>
    el('div', { class: 'yield' }, [
      el('span', { class: 'amt', text: signed(a.value) }),
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

  root.append(grund);
  if (state.runde && (state.runde.aktionen || []).length) {
    root.append(renderAktionsbrett(state.runde));
  }
  root.append(el('div', { class: 'grid-2 mt' }, [lage, faeden]));
}

// Aktionsbrett der laufenden Runde: Haupt/Neben-Zähler und je Aktion Titel,
// Kern, Folge, Ziel, Modifikator und Wurf-Hinweis bzw. Ergebnis.
function renderAktionsbrett(runde) {
  const haupt = runde.haupt || {};
  const neben = runde.neben || {};
  const head = el('div', { class: 'block-head' }, [
    el('h3', { text: 'Aktionen dieser Runde' }),
    el('div', { class: 'rule' }),
    el('span', { class: 'eyebrow', 'data-testid': 'aktion-budget',
      text: `Haupt ${haupt.used ?? 0}/${haupt.max ?? 0} · Neben ${neben.used ?? 0}/${neben.max ?? 0}` }),
  ]);

  const rows = (runde.aktionen || []).map((a) => {
    const modStr = typeof a.mod === 'number' ? signedZeroPlus(a.mod) : '';
    const roll = a.wurf == null
      ? el('span', { class: 'aktion-cue', text: '▶ 1d10' })
      : el('span', { class: 'aktion-ergebnis', 'data-testid': 'aktion-ergebnis', text: a.ergebnis || `Wurf ${a.wurf}` });
    return el('article', {
      class: `aktion aktion-${a.art}${a.status === 'frei' ? ' frei' : ''}`,
      'data-testid': 'aktion',
      'data-id': a.id || '',
    }, [
      el('span', { class: 'aktion-art', title: a.art === 'haupt' ? 'Hauptaktion' : 'Nebenaktion',
        text: a.art === 'haupt' ? 'H' : 'N' }),
      el('div', { class: 'aktion-body' }, [
        el('div', { class: 'aktion-top' }, [
          el('span', { class: 'aktion-titel', 'data-testid': 'aktion-titel', text: a.titel || '' }),
          a.kern ? el('span', { class: 'aktion-kern', text: `„${a.kern}“` }) : null,
        ]),
        a.folge ? el('div', { class: 'aktion-folge', text: a.folge }) : null,
      ]),
      el('div', { class: 'aktion-roll' }, [
        typeof a.ziel === 'number' ? el('span', { class: 'aktion-ziel', text: `Ziel ${a.ziel}` }) : null,
        modStr ? el('span', { class: 'aktion-mod', text: modStr }) : null,
        roll,
      ]),
    ]);
  });

  return el('section', { class: 'panel pad aktionsbrett mt', 'data-testid': 'aktionsbrett' }, [
    head,
    el('div', { class: 'aktion-list' }, rows),
  ]);
}

function blockHead(title, eyebrow) {
  return el('div', { class: 'block-head' }, [
    el('h3', { text: title }),
    el('div', { class: 'rule' }),
    eyebrow ? el('span', { class: 'eyebrow', text: eyebrow }) : null,
  ]);
}

// Banner mit den Aenderungen seit dem zuletzt geladenen Stand.
function renderDeltaBanner(delta) {
  const banner = el('section', { class: 'delta-banner panel pad', 'data-testid': 'delta-banner' });
  banner.append(
    el('div', { class: 'block-head' }, [
      el('h3', { text: 'Seit dem letzten Stand' }),
      el('div', { class: 'rule' }),
      el('button', {
        class: 'delta-dismiss', 'data-testid': 'delta-dismiss',
        text: 'Verstanden', onClick: () => banner.remove(),
      }),
    ]),
  );
  const list = el('ul', { class: 'delta-list' },
    (delta.eintraege || []).map((e) => {
      let txt = e.label;
      if (typeof e.from === 'number' && typeof e.to === 'number') {
        txt = `${e.label}: ${e.from} → ${e.to} (${signed(e.delta)})`;
      }
      return el('li', {
        class: `delta-item delta-${e.richtung || 'flat'}`, 'data-testid': 'delta-item',
      }, [el('span', { class: 'delta-mark', text: e.richtung === 'down' ? '▼' : '▲' }), el('span', { text: txt })]);
    }),
  );
  banner.append(list);
  return banner;
}

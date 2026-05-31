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

// Trend in Worten und die qualitative Einordnung einer Grundgröße auf der
// 0–5-Skala (0–2 niedrig, 3–5 hoch), dazu die Skala selbst als fünf Segmente.
const TREND_WORT = { steigend: 'steigend', fallend: 'fallend', gleichbleibend: 'gleichbleibend' };
const GG_WORT = ['Mangel', 'knapp', 'knapp gesichert', 'gesichert', 'reichlich', 'Überfluss'];
function ggWort(v) { return GG_WORT[Math.max(0, Math.min(5, Math.round(v)))] || ''; }
function skala05(v) {
  const n = Math.max(0, Math.min(5, Math.round(v)));
  const ton = n <= 2 ? ' low' : '';
  return el('div', { class: 'stat-scale', 'aria-hidden': 'true' },
    Array.from({ length: 5 }, (_, i) => el('span', { class: `seg${i < n ? ' on' : ''}${ton}` })));
}

const ICO = {
  nahrung: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c-3 0-5 2.5-5 6 0 4 2 9 5 12 3-3 5-8 5-12 0-3.5-2-6-5-6z"/><path d="M12 9v8"/></svg>',
  material: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>',
  wissen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 0-2 2z"/><path d="M4 5v14"/><path d="M9 7h6M9 11h6"/></svg>',
  bevoelkerung: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5a3 3 0 0 1 0 6M18 20c0-2.5-1-4-3-4.6"/></svg>',
};

// Icons für das Delta-Banner, ergänzend zu ICO (Grundgrößen). Schlüssel sind die
// `key`/`art`-Werte aus diff.js. Gleicher Strich-Stil wie ICO.
const DELTA_ICO = {
  verteidigung: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/></svg>',
  mobilitaet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h12"/><path d="M12 6l6 6-6 6"/></svg>',
  wohlstand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/><path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/></svg>',
  ansehen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 17.9 6.7 19.6l1-5.8L3.5 9.7l5.9-.9z"/></svg>',
  loyalitaet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/></svg>',
  'berater-neu': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/></svg>',
  'berater-weg': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20c0-3.6 2.9-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/></svg>',
  'ort-neu': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z"/><circle cx="12" cy="11" r="2.3"/></svg>',
  'ort-weg': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z"/><circle cx="12" cy="11" r="2.3"/></svg>',
  'setzung-neu': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><path d="M9.5 14.5l1.8 1.8 3.2-3.6"/></svg>',
  kapitel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg>',
};

// Wählt das Icon eines Delta-Eintrags: Grundgrößen über ICO[key], Lagewerte über
// DELTA_ICO[key], alles andere über DELTA_ICO[art]. Ohne Treffer kein Icon.
function deltaIcon(e) {
  return ICO[e.key] || DELTA_ICO[e.key] || DELTA_ICO[e.art] || '';
}

export function renderLage(root, state, opts = {}) {
  root.replaceChildren();
  if (!state) return;

  // Delta zum zuletzt geladenen Stand, nur nach echtem Laden mit Aenderungen.
  if (opts.delta && opts.delta.hasChanges) {
    root.append(renderDeltaBanner(opts.delta));
  }

  const { grundgroessen = {}, lagewerte = {}, offeneFaeden = [] } = state;

  // --- Grundgrößen: Wert, 0–5-Skala mit Einordnung, Trend mit Begründung und die
  // zugeordneten Quellen (Ausbeuten). Bevölkerung ist eine Kopfzahl mit Text.
  const bev = grundgroessen.bevoelkerung || {};
  const trends = state.trends || {};
  const ausbeuten = Array.isArray(lagewerte.ausbeuten) ? lagewerte.ausbeuten : [];
  const skalaStats = [
    { k: 'nahrung', lab: 'Nahrung', val: grundgroessen.nahrung },
    { k: 'material', lab: 'Material', val: grundgroessen.material },
    { k: 'wissen', lab: 'Wissen', val: grundgroessen.wissen },
  ];
  // Ausbeuten gehören als Quelle zu ihrer Grundgröße (key gegen Label); was nicht
  // passt, bleibt unten bei den Lagewerten stehen (keine Dopplung).
  const matchedKeys = new Set(skalaStats.map((s) => s.lab.toLowerCase()));
  const restAusbeuten = ausbeuten.filter((a) => !matchedKeys.has((a.key || '').toLowerCase()));
  const quellenFuer = (lab) => ausbeuten.filter((a) => (a.key || '').toLowerCase() === lab.toLowerCase());

  const trendZeile = (key) => {
    const t = trends[key];
    const info = t && TREND[t.richtung];
    if (!info) return null;
    return el('div', { class: `stat-trend trend-${info.cls}`, 'data-testid': `trend-${key}` }, [
      el('span', { class: 'tmark', text: info.mark }),
      document.createTextNode(` ${TREND_WORT[t.richtung] || ''}`),
      t.grund ? el('span', { class: 'tgrund', text: ` — ${t.grund}` }) : null,
    ]);
  };

  const ggCard = (s) => {
    const v = typeof s.val === 'number' ? s.val : null;
    const quellen = quellenFuer(s.lab);
    return el('div', { class: 'stat stat-rich' }, [
      el('div', { class: 'stat-head' }, [
        el('div', { class: 'ico', 'aria-hidden': 'true', html: ICO[s.k] || '' }),
        el('div', { class: 'lab', text: s.lab }),
        el('div', { class: 'num', 'data-testid': `stat-${s.k}`, text: v == null ? '–' : String(v) }),
        v == null ? null : el('div', { class: 'stat-of', text: '/ 5' }),
      ]),
      v == null ? null : skala05(v),
      v == null ? null : el('div', { class: 'stat-qual', text: ggWort(v) }),
      trendZeile(s.k),
      quellen.length ? el('ul', { class: 'stat-quellen' }, quellen.map((a) =>
        el('li', {}, [
          el('span', { class: 'qamt', text: signed(a.value) }),
          el('span', { class: 'qtxt', text: a.quelle ? `Ausbeute · ${a.quelle}` : 'Ausbeute' }),
        ]))) : null,
    ]);
  };

  const bevCard = el('div', { class: 'stat stat-rich stat-bev' }, [
    el('div', { class: 'stat-head' }, [
      el('div', { class: 'ico', 'aria-hidden': 'true', html: ICO.bevoelkerung || '' }),
      el('div', { class: 'lab', text: 'Bevölkerung' }),
      el('div', { class: 'num', 'data-testid': 'stat-bevoelkerung', text: String(bev.zahl ?? bev.label ?? '–') }),
    ]),
    trendZeile('bevoelkerung'),
    bev.label ? el('div', { class: 'note', text: bev.label }) : null,
  ]);

  const statGrid = el('div', { class: 'stat-grid' }, [...skalaStats.map(ggCard), bevCard]);
  const grund = el('section', { class: 'panel pad' }, [
    blockHead('Grundgrößen', 'Vorräte, Trend und Quellen'),
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
  const yields = restAusbeuten.map((a) =>
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

// Banner mit den Aenderungen seit dem zuletzt geladenen Stand. Nach Bereichen
// gruppiert (Grundgrößen, Lagewerte, Rat, Welt & Stand), damit auf einen Blick
// lesbar ist, wo sich etwas bewegt hat; jedes Delta trägt sein Vorzeichen als
// hervorgehobene, richtungsgefärbte Marke (Einbußen rot, Zugewinne grün).
const DELTA_GRUPPEN = [
  { titel: 'Grundgrößen', arten: ['grundgroesse'] },
  { titel: 'Lagewerte', arten: ['lagewert'] },
  { titel: 'Rat', arten: ['loyalitaet', 'berater-neu', 'berater-weg'] },
  { titel: 'Welt & Stand', arten: ['kapitel', 'ansehen', 'ort-neu', 'ort-weg', 'setzung-neu'] },
];

function deltaItem(e) {
  const numerisch = typeof e.from === 'number' && typeof e.to === 'number';
  const mark = e.richtung === 'down' ? '▼' : '▲';
  const ico = deltaIcon(e);
  const kinder = [
    ico ? el('span', { class: 'delta-ico', 'aria-hidden': 'true', html: ico }) : null,
    el('span', { class: 'delta-label', text: numerisch ? `${e.label}: ${e.from} → ${e.to}` : e.label }),
    numerisch
      ? el('span', { class: 'delta-amount' }, [
          el('span', { class: 'delta-mark', text: mark }),
          document.createTextNode(` ${signed(e.delta)}`),
        ])
      : el('span', { class: 'delta-mark', text: mark }),
  ];
  return el('li', {
    class: `delta-item delta-${e.richtung || 'flat'}`, 'data-testid': 'delta-item',
  }, kinder);
}

function renderDeltaBanner(delta) {
  const banner = el('section', { class: 'delta-banner panel pad', 'data-testid': 'delta-banner' });
  banner.append(
    el('div', { class: 'block-head' }, [
      el('h3', { text: 'Seit dem letzten Stand' }),
      el('div', { class: 'rule' }),
    ]),
  );

  const eintraege = delta.eintraege || [];
  const gruppen = el('div', { class: 'delta-groups' });
  DELTA_GRUPPEN.forEach((g) => {
    const teil = eintraege.filter((e) => g.arten.includes(e.art));
    if (!teil.length) return;
    gruppen.append(el('section', { class: 'delta-group' }, [
      el('div', { class: 'delta-group-titel', text: g.titel }),
      el('ul', { class: 'delta-list' }, teil.map(deltaItem)),
    ]));
  });

  // Unbekannte Arten (Fallback) ungruppiert anhängen, damit nie ein Delta verschwindet.
  const rest = eintraege.filter((e) => !DELTA_GRUPPEN.some((g) => g.arten.includes(e.art)));
  if (rest.length) {
    gruppen.append(el('section', { class: 'delta-group' }, [
      el('ul', { class: 'delta-list' }, rest.map(deltaItem)),
    ]));
  }

  banner.append(gruppen);
  return banner;
}

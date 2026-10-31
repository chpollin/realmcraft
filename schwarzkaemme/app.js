// Leitstand der Schwarzkämme — Talustan-Partie.
// Reads the same savegame.json as the main dashboard, reinterprets its fields
// into the dystopian setting and renders a dark control-room view. Reuses the
// contract-bound loader (js/parse.js) and UI primitives (js/components/ui.js).
// Absolute paths (/savegame.json, /events) so it works from the subdirectory.

import { parseSavegame } from '../js/parse.js';
import { el, gauge, loyaltyMeter } from '../js/components/ui.js';

// ---- setting-specific relabeling of the generic RealmCraft fields ----------
const GG = {
  nahrung: { name: 'Versorgung', sub: 'Wasser, Brot, Fisch — das Auskommen der Täler' },
  material: { name: 'Werk', sub: 'eigenes Werk und Infrastruktur (das Erz fließt ab)' },
  wissen: { name: 'Gedächtnis', sub: 'Sprache, Erinnerung, das Eigene' },
};
const LW = {
  verteidigung: { name: 'Deckung', sub: 'Schutz vor dem Zugriff des Auges' },
  mobilitaet: { name: 'Spielraum', sub: 'freier Zug ohne Erlaubnis (Autonomie)' },
  wohlstand: { name: 'Auskommen', sub: 'wie es den Menschen geht' },
};
const TREND = { steigend: ['▲', 'up'], fallend: ['▼', 'down'], gleichbleibend: ['→', 'flat'] };

// ---- small helpers ---------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const vz = (n) => (n > 0 ? `+${n}` : String(n)); // signed
const findMod = (state, needle) =>
  (state.modifikatoren?.lage || []).find((m) => m.key.toLowerCase().includes(needle));

function rangWort(v) {
  if (v >= 3) return 'hoch';
  if (v >= 1) return 'solide';
  if (v === 0) return 'blass';
  return 'verdächtig';
}
function hitzeWort(v) {
  const a = Math.abs(v);
  if (a <= 1) return 'niedrig';
  if (a === 2) return 'erhöht';
  if (a === 3) return 'hoch';
  return 'kritisch';
}
function spielraumWort(v) {
  if (v >= 2) return 'spürbar';
  if (v >= 0) return 'eng';
  return 'eingeschnürt';
}

// ---- panel scaffold --------------------------------------------------------
function panel(title, span, children) {
  return el('section', { class: `panel col-${span}` }, [
    el('h2', { text: title }),
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

// ---- header ----------------------------------------------------------------
function renderKopf(state) {
  $('[data-testid="republik-name"]').textContent = state.volk?.name || '—';
  $('[data-testid="kapitel"]').textContent = `Kapitel ${state.meta?.kapitel ?? '—'}`;
  const z = state.meta?.zeit || {};
  $('[data-testid="zeit"]').textContent = `${z.jahreszeit || '—'} ${z.jahr ?? ''}`.trim();
  $('[data-testid="weltereignis"]').textContent =
    `Weltereignis ${state.meta?.weltereignis || '—'}`;
  const a = state.status?.ansehen;
  $('[data-testid="ansehen"]').textContent = a
    ? `Ansehen ${a.stufe}/3 · ${a.label || ''}`
    : '';

  const rang = findMod(state, 'rang');
  const auge = findMod(state, 'aufmerksamkeit');
  const spiel = state.lagewerte?.mobilitaet;

  const signals = [];
  if (rang) {
    signals.push(signalBox('warm', 'Rang der Statthalterin', `${vz(rang.value)} · ${rangWort(rang.value)}`, rang.grund));
  }
  if (auge) {
    signals.push(signalBox('hot', 'Aufmerksamkeit des Auges', `${hitzeWort(auge.value)}`, auge.grund));
  }
  if (Number.isFinite(spiel)) {
    signals.push(signalBox('', 'Spielraum (Autonomie)', `${vz(spiel)} · ${spielraumWort(spiel)}`,
      'Der freie Zug ohne Erlaubnis des Zentrums.'));
  }
  const host = $('[data-testid="signalwerte"]');
  host.replaceChildren(...signals);
}

function signalBox(kind, name, wert, grund) {
  return el('div', { class: `signal ${kind}` }, [
    el('div', { class: 'signal-kopf' }, [
      el('span', { class: 'signal-name', text: name }),
      el('span', { class: 'signal-wert', text: wert }),
    ]),
    grund ? el('div', { class: 'signal-grund', text: grund }) : null,
  ]);
}

// ---- panels ----------------------------------------------------------------
function panelLage(state) {
  const kids = [el('p', { class: 'status-text', text: state.status?.text || '' })];
  const v = state.volk || {};
  const zeilen = [];
  if (v.wesensart) zeilen.push(el('div', { class: 'volk-zeile' }, [el('b', { text: 'Wesensart. ' }), v.wesensart]));
  if (v.ausrichtung) zeilen.push(el('div', { class: 'volk-zeile' }, [el('b', { text: 'Lage. ' }), v.ausrichtung]));
  kids.push(...zeilen);
  return panel('Lage in Derband', 8, kids);
}

function panelKarte(state) {
  const k = state.karte || {};
  const orte = (k.orte || []).map((o) =>
    el('div', { class: 'ort' }, [
      el('div', { class: 'ort-name', text: o.name }),
      o.typ ? el('div', { class: 'ort-typ', text: o.typ }) : null,
      o.beziehung ? el('div', { class: 'ort-bez', text: o.beziehung }) : null,
    ]),
  );
  const kids = [el('div', { class: 'orte' }, orte)];
  if (k.aktuellerStand) kids.push(el('div', { class: 'karte-prompt', text: k.aktuellerStand }));
  return panel('Lagekarte', 4, kids);
}

function panelGrundgroessen(state) {
  const g = state.grundgroessen || {};
  const t = state.trends || {};
  const cards = ['nahrung', 'material', 'wissen'].map((key) => {
    const meta = GG[key];
    const tr = t[key];
    const glyph = tr && TREND[tr.richtung];
    return el('div', { class: 'stat' }, [
      el('div', { class: 'num' }, [
        String(g[key] ?? '—'),
        glyph ? el('span', { class: `trend ${glyph[1]}`, text: glyph[0], title: tr.grund || '' }) : null,
      ]),
      el('div', { class: 'lab', text: meta.name }),
      el('div', { class: 'note', text: meta.sub }),
    ]);
  });
  const bev = g.bevoelkerung;
  if (bev) {
    cards.push(el('div', { class: 'stat' }, [
      el('div', { class: 'num', text: bev.zahl == null ? '⁂' : String(bev.zahl) }),
      el('div', { class: 'lab', text: 'Volk' }),
      el('div', { class: 'note', text: bev.label || '' }),
    ]));
  }
  return panel('Grundgrößen der Republik', 6, el('div', { class: 'stat-reihe' }, cards));
}

function messzeile(name, value, min, max, note) {
  return el('div', { class: 'messzeile' }, [
    el('div', { class: 'mz-kopf' }, [
      el('span', { class: 'mz-name', text: name }),
      el('span', { class: 'mz-wert', text: vz(value) }),
    ]),
    gauge(value, min, max, { label: name, valueText: vz(value) }),
    note ? el('div', { class: 'mz-note', text: note }) : null,
  ]);
}

function panelLagewerte(state) {
  const lw = state.lagewerte || {};
  const zeilen = ['verteidigung', 'mobilitaet', 'wohlstand'].map((key) =>
    messzeile(LW[key].name, lw[key] ?? 0, -2, 3, LW[key].sub),
  );
  return panel('Lagewerte', 6, el('div', { class: 'messreihe' }, zeilen));
}

function panelDruck(state) {
  const zeilen = [];
  // remaining standing pressures (Rang/Aufmerksamkeit are already in the header)
  for (const m of state.modifikatoren?.lage || []) {
    const k = m.key.toLowerCase();
    if (k.includes('rang') || k.includes('aufmerksamkeit')) continue;
    zeilen.push(messzeile(m.key, m.value, -2, 3, m.grund));
  }
  for (const g of state.modifikatoren?.gelaende || []) {
    zeilen.push(messzeile(g.key, g.value, -2, 3));
  }
  if (!zeilen.length) return null;
  return panel('Stehender Druck & Gelände', 4, el('div', { class: 'messreihe' }, zeilen));
}

function panelAbfluss(state) {
  const items = state.lagewerte?.ausbeuten || [];
  if (!items.length) return null;
  const max = Math.max(5, ...items.map((i) => Math.abs(i.value) || 0));
  const zeilen = items.map((i) =>
    el('div', { class: 'ledger-zeile' }, [
      el('div', { class: 'ledger-name', text: i.key }),
      el('div', { class: 'ledger-wert', text: String(i.value) }),
      el('div', { class: 'ledger-bar' }, [barSpan(i.value, max)]),
      i.quelle ? el('div', { class: 'ledger-quelle', text: i.quelle }) : null,
    ]),
  );
  return panel('Abfluss nach oben', 4, el('div', { class: 'ledger' }, zeilen));
}
function barSpan(value, max) {
  const s = el('span');
  s.style.width = `${(Math.abs(value) / max) * 100}%`;
  return s;
}

function panelRat(state) {
  const karten = (state.berater || []).map((b) => {
    const mole = (b.achse ?? 0) <= -4;
    const tags = [];
    if (mole) tags.push(el('span', { class: 'rat-tag mole', text: 'Ohr des Zentrums' }));
    if (b.lebensstand && b.lebensstand !== 'ruestig') {
      tags.push(el('span', { class: 'rat-tag lebensabend', text: b.lebensstand }));
    }
    return el('div', { class: `rat-karte${mole ? ' mole' : ''}`, dataset: { id: b.id } }, [
      el('div', { class: 'rat-kopf' }, [
        el('span', { class: 'rat-name', text: b.name }),
        tags.length ? el('div', {}, tags) : null,
      ]),
      b.rolle ? el('div', { class: 'rat-rolle', text: b.rolle }) : null,
      b.ziel ? el('div', { class: 'rat-ziel', text: b.ziel }) : null,
      meterRow('Loyalität', b.loyalitaet, loyaltyMeter(b.loyalitaet, { label: `Loyalität ${b.name}` }), `${vz(b.loyalitaet)}`),
      achseRow(b.achse ?? 0),
    ]);
  });
  return panel('Der Rat', 8, el('div', { class: 'rat-grid' }, karten));
}

function meterRow(lab, value, meterNode, valText) {
  return el('div', { class: 'meterzeile' }, [
    el('span', { class: 'm-lab', text: lab }),
    meterNode,
    el('span', { class: 'm-val', text: valText }),
  ]);
}

function achseRow(value) {
  const wrap = el('div', {}, [
    el('div', { class: 'meterzeile' }, [
      el('span', { class: 'm-lab', text: 'Achse' }),
      el('div', { class: 'achse' }, [loyaltyMeter(value, { label: 'Zentrum gegen Volk' })]),
      el('span', { class: 'm-val', text: vz(value) }),
    ]),
    el('div', { class: 'achse-pole' }, [el('span', { text: 'Zentrumstreu' }), el('span', { text: 'Volksnah' })]),
  ]);
  return wrap;
}

function panelMaechte(state) {
  const cards = (state.maechte || []).map((m) => {
    const bez = m.beziehung || {};
    const kind = bez.wert > 0 ? 'pos' : bez.wert < 0 ? 'neg' : 'neutral';
    const chips = (m.profil || []).map((p) =>
      el('span', { class: 'profil-chip' }, [`${p.key} `, el('span', { class: 'cv', text: vz(p.value) })]),
    );
    return el('div', { class: 'macht' }, [
      el('div', { class: 'macht-kopf' }, [
        el('div', {}, [
          el('div', { class: 'macht-name', text: m.name }),
          m.typ ? el('div', { class: 'macht-typ', text: m.typ }) : null,
        ]),
        bez.label ? el('span', { class: `macht-bez ${kind}`, text: bez.label }) : null,
      ]),
      chips.length ? el('div', { class: 'macht-profil' }, chips) : null,
      m.haltung ? el('div', { class: 'macht-haltung', text: m.haltung }) : null,
    ]);
  });
  return panel('Die Mächte', 8, el('div', { class: 'macht-grid' }, cards));
}

function panelBrett(state) {
  const r = state.runde;
  if (!r) return null;
  const kids = [
    el('div', {
      class: 'brett-budget',
      text: `Haupt ${r.haupt?.used ?? 0}/${r.haupt?.max ?? 0}  ·  Neben ${r.neben?.used ?? 0}/${r.neben?.max ?? 0}`,
    }),
  ];
  for (const a of r.aktionen || []) {
    kids.push(el('div', { class: 'aktion' }, [
      el('div', { class: 'aktion-kopf' }, [
        el('span', { class: `aktion-art ${a.art}`, text: a.art }),
        el('span', { class: 'aktion-titel', text: a.titel }),
        a.kern ? el('span', { class: 'aktion-kern', text: `„${a.kern}"` }) : null,
      ]),
      a.folge ? el('div', { class: 'aktion-folge', text: a.folge }) : null,
      el('div', { class: 'aktion-probe' }, [
        a.ziel != null ? el('span', {}, ['Ziel ', el('b', { text: String(a.ziel) })]) : null,
        a.mod != null && a.mod !== '' ? el('span', {}, ['Mod ', el('b', { text: String(a.mod) })]) : null,
        a.wurf != null ? el('span', {}, ['Wurf ', el('b', { text: String(a.wurf) })]) : null,
      ]),
      a.ergebnis ? el('div', { class: 'aktion-ergebnis', text: a.ergebnis }) : null,
    ]));
  }
  return panel('Das Aktionsbrett', 6, kids);
}

function panelFaeden(state) {
  const f = state.offeneFaeden || [];
  if (!f.length) return null;
  return panel('Offene Fäden', 6, el('ul', { class: 'faeden' }, f.map((x) => el('li', { text: x }))));
}

function panelSetzungen(state) {
  const s = state.setzungen || [];
  if (!s.length) return null;
  return panel('Setzungen — die Regeln dieser Partie', 12,
    s.map((x) => el('div', { class: 'setzung' }, [
      el('div', { class: 'setzung-titel', text: x.titel }),
      el('div', { class: 'setzung-text', text: x.text }),
    ])),
  );
}

// ---- top-level render ------------------------------------------------------
function render(state) {
  renderKopf(state);
  const host = $('#leitstand');
  const panels = [
    panelLage(state),
    panelKarte(state),
    panelGrundgroessen(state),
    panelLagewerte(state),
    panelRat(state),
    panelAbfluss(state),
    panelMaechte(state),
    panelDruck(state),
    panelBrett(state),
    panelFaeden(state),
    panelSetzungen(state),
  ].filter(Boolean);
  host.replaceChildren(...panels);
  host.hidden = false;
  $('[data-testid="leerzustand"]').hidden = true;
}

// ---- load + live -----------------------------------------------------------
async function ladeStand() {
  try {
    const res = await fetch('/savegame.json', { cache: 'no-store' });
    if (!res.ok) return false;
    const parsed = parseSavegame(await res.text());
    if (!parsed.ok) {
      console.error('Speicherstand ungültig:', parsed.error);
      return false;
    }
    render(parsed.data);
    return true;
  } catch (e) {
    console.error('Laden fehlgeschlagen:', e);
    return false;
  }
}

function wireLive() {
  if (!/^https?:$/.test(location.protocol)) return; // no SSE on file://
  const connect = () => {
    let es;
    try {
      es = new EventSource('/events');
    } catch {
      return;
    }
    es.addEventListener('savegame', () => ladeStand());
    es.addEventListener('reload', () => location.reload());
    es.addEventListener('error', () => {
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        setTimeout(connect, 2000);
      }
    });
  };
  connect();
}

ladeStand();
wireLive();

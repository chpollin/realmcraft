// Probe dialog: target number and every modifier are open before the roll; the
// player rolls 1d10 with a click and sees the full calculation. A natural 1 is
// always a critical setback, a natural 10 always a critical success. Optional
// help changes the chance live, and its cost shows in the top bar meanwhile.

import { el, signed, prefersReducedMotion } from '../dom.js';
import { icon } from '../icons.js';
import { dialogHead } from './dialoge.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function d10(value) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'd10');
  svg.setAttribute('aria-hidden', 'true');
  const faces = [
    ['M50 4 L6 40 L14 62 L26 44 Z', 'f-l'],
    ['M50 4 L94 40 L86 62 L74 44 Z', 'f-r'],
    ['M26 44 L14 62 L50 96 L50 66 Z', 'f-bl'],
    ['M74 44 L86 62 L50 96 L50 66 Z', 'f-br'],
    ['M50 4 L74 44 L50 66 L26 44 Z', 'f-front'],
  ];
  for (const [d, cls] of faces) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', cls);
    svg.append(p);
  }
  const t = document.createElementNS(SVG_NS, 'text');
  t.setAttribute('x', '50');
  t.setAttribute('y', '47');
  t.setAttribute('class', 'd10-zahl');
  t.textContent = value ?? '?';
  svg.append(t);
  return svg;
}

function outcome(roll, mod, ziel) {
  if (roll === 1) return 'krit-tief';
  if (roll === 10) return 'krit-hoch';
  return roll + mod >= ziel ? 'erfolg' : 'fehlschlag';
}

const VERDICT = {
  'krit-tief': { text: 'Kritischer Rückschlag', gut: false },
  'krit-hoch': { text: 'Kritischer Glücksfall', gut: true },
  erfolg: { text: 'Erfolg', gut: true },
  fehlschlag: { text: 'Fehlschlag', gut: false },
};

export function renderProbe(dlg, api, ctx) {
  const { opt, target } = ctx;
  const ziel = opt.probe.ziel;
  const optional = opt.probe.optional ?? [];
  const state = { roll: null, extra: new Set() };
  const chosen = () => optional.filter((_, i) => state.extra.has(i));
  const modOf = () => [...ctx.mods, ...chosen()].reduce((a, m) => a + m.wert, 0);
  const costs = () => [...(opt.kosten ?? []), ...chosen().flatMap((o) => o.kosten ?? [])];

  const die = el('div', { class: 'wuerfelfeld' }, d10(null));
  const result = el('div', { class: 'probe-ergebnis', 'aria-live': 'polite' });
  const calc = el('div', { class: 'probe-rechnung-feld' });
  const rollBtn = el('button', { class: 'btn btn-primary btn-gross', type: 'button', onclick: () => roll() }, icon('wuerfel', { size: 20 }), 'Würfeln');
  const takeBtn = el('button', { class: 'btn btn-primary btn-gross', type: 'button', hidden: true, onclick: () => take() }, 'In die Befehle');

  /** Every face of the d10 with its outcome, so the chance is seen, not only stated. */
  function strip(mod) {
    const faces = Array.from({ length: 10 }, (_, i) => i + 1);
    const good = faces.filter((n) => VERDICT[outcome(n, mod, ziel)].gut).length;
    return el('div', { class: 'chance' },
      el('div', { class: 'chance-leiste', role: 'img', 'aria-label': `Erfolg bei ${good} von 10 Würfen` },
        ...faces.map((n) => el('span', { class: `chance-feld ${outcome(n, mod, ziel)}${state.roll === n ? ' is-wurf' : ''}`, text: String(n) }))),
      el('p', { class: 'chance-wert num' }, el('strong', { text: `${good * 10} %` }), ' Erfolg'));
  }

  function renderCalc() {
    const mod = modOf();
    calc.replaceChildren(...[
      el('dl', { class: 'probe-rechnung' },
        el('dt', { text: 'Zielwert' }), el('dd', { class: 'num pr-ziel', text: String(ziel) }),
        ...ctx.mods.flatMap((m) => [el('dt', { text: m.grund }), el('dd', { class: `num ${m.wert > 0 ? 'up' : 'down'}`, text: signed(m.wert) })]),
        el('dt', { class: 'pr-summe', text: 'Modifikator' }), el('dd', { class: 'num pr-summe', text: signed(mod) })),
      optional.length ? el('ul', { class: 'probe-optionen plain' }, ...optional.map((o, i) => el('li', {},
        el('label', { class: 'probe-option' },
          el('input', {
            type: 'checkbox',
            checked: state.extra.has(i),
            disabled: state.roll !== null,
            onchange: (e) => {
              if (e.target.checked) state.extra.add(i);
              else state.extra.delete(i);
              renderCalc();
              calc.querySelectorAll('input')[i]?.focus();
            },
          }),
          el('span', { text: o.grund }),
          el('span', { class: `num ${o.wert > 0 ? 'up' : 'down'}`, text: signed(o.wert) }),
          o.kosten?.length ? el('span', { class: 'costs' }, ...o.kosten.map((k) => el('span', { class: 'cost', 'aria-label': `${k.menge} ${api.resourceName(k.key)}` }, icon(k.key, { size: 14 }), String(k.menge)))) : el('span'))))) : null,
      strip(mod),
    ].filter(Boolean));
    const deltas = {};
    for (const k of costs()) deltas[k.key] = (deltas[k.key] ?? 0) - k.menge;
    api.setPreview({ deltas, tiles: target.q !== undefined ? [{ q: target.q, r: target.r }] : [] });
  }

  function land(n) {
    state.roll = n;
    const mod = modOf();
    const total = n + mod;
    const cls = outcome(n, mod, ziel);
    const v = VERDICT[cls];
    state.v = v;
    die.replaceChildren(d10(n));
    die.className = `wuerfelfeld gelandet ${cls}`;
    renderCalc();
    result.replaceChildren(
      el('p', { class: 'pe-rechnung num' },
        el('span', { class: 'pe-teil' }, el('span', { class: 'pe-wert', text: String(n) }), el('span', { class: 'pe-label', text: 'Wurf' })),
        el('span', { class: 'pe-op', text: mod < 0 ? '−' : '+' }),
        el('span', { class: 'pe-teil' }, el('span', { class: 'pe-wert', text: String(Math.abs(mod)) }), el('span', { class: 'pe-label', text: 'Modifikator' })),
        el('span', { class: 'pe-op', text: '=' }),
        el('span', { class: 'pe-teil' }, el('span', { class: 'pe-wert', text: String(total) }), el('span', { class: 'pe-label', text: `gegen ${ziel}` })),
        el('span', { class: 'pe-teil' }, el('span', { class: 'pe-wert', text: signed(total - ziel) }), el('span', { class: 'pe-label', text: 'Marge' }))),
      el('p', { class: `pe-urteil world ${cls}` }, icon(v.gut ? 'ja' : 'nein', { size: 22 }), v.text),
    );
    rollBtn.hidden = true;
    takeBtn.hidden = false;
    takeBtn.focus();
  }

  function roll() {
    if (state.roll !== null) return;
    rollBtn.disabled = true;
    const n = 1 + Math.floor(Math.random() * 10);
    if (prefersReducedMotion()) {
      land(n);
      return;
    }
    die.className = 'wuerfelfeld rollt';
    const start = performance.now();
    const tick = () => {
      const t = performance.now() - start;
      if (t >= 820) {
        land(n);
        return;
      }
      die.replaceChildren(d10(1 + Math.floor(Math.random() * 10)));
      setTimeout(tick, 40 + t / 9);
    };
    tick();
  }

  function take() {
    const mod = modOf();
    api.addOrder({
      id: `${opt.id}-${target.id}`,
      quelle: opt.id,
      zielId: target.id,
      titel: opt.titel,
      ziel: target.name,
      kosten: costs(),
      art: opt.art,
      wurf: { gut: state.v.gut, kurz: `${state.roll}${mod ? signed(mod) : ''} gegen ${ziel}, ${state.v.text}`, marge: state.roll + mod - ziel },
    });
    dlg.close();
  }

  dlg.replaceChildren(
    dialogHead(dlg, `${opt.titel}`, 'wuerfel', target.name),
    el('div', { class: 'overlay-body probe' },
      el('p', { class: 'probe-folge', text: opt.folge }),
      calc,
      die,
      result,
      el('div', { class: 'probe-aktionen' }, rollBtn, takeBtn)),
  );
  renderCalc();
  requestAnimationFrame(() => rollBtn.focus());
}

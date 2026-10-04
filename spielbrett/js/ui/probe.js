// Probe dialog: target number and every modifier are open before the roll; the
// player rolls 1d10 with a click and sees the full calculation. Venture and
// lead change the chance live, and their cost shows in the top bar meanwhile.
// Target, modifiers, chance and the band of every face come from the kernel
// probe, and the roll is stored in the draft together with the probe's
// fingerprint.

import { el, signed, prefersReducedMotion } from '../dom.js';
import { icon } from '../icons.js';
import { dialogHead } from './dialoge.js';
import { portrait } from './portrait.js';
import { modLabel } from '../data/options.js';
import { t } from '../i18n/index.js';

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
  const face = document.createElementNS(SVG_NS, 'text');
  face.setAttribute('x', '50');
  face.setAttribute('y', '47');
  face.setAttribute('class', 'd10-zahl');
  face.textContent = value ?? '?';
  svg.append(face);
  return svg;
}

const FACE_CLASS = { crit_fail: 'krit-tief', setback: 'fehlschlag', failure: 'fehlschlag', narrow: 'erfolg', success: 'erfolg', crit_success: 'krit-hoch' };
// World-event bands 1..5 run from calamity to blessing.
const EVENT_CLASS = { 1: 'krit-tief', 2: 'fehlschlag', 3: 'neutral', 4: 'erfolg', 5: 'krit-hoch' };

function faceClass(f) {
  return typeof f.band === 'number' ? EVENT_CLASS[f.band] ?? 'neutral' : FACE_CLASS[f.band] ?? 'fehlschlag';
}

/** One d10 face from the player's click; the kernel takes the value as the player's roll. */
function d10Roll() {
  const buf = new Uint32Array(1);
  // Rejection sampling keeps every face equally likely.
  do crypto.getRandomValues(buf); while (buf[0] >= 4294967290);
  return (buf[0] % 10) + 1;
}

/**
 * ctx.opt: a new order from the kernel options
 * (venture and lead change the kernel probe live); ctx.probeId: a probe of
 * the draft that still needs its roll (world event, stale roll); with
 * ctx.sequence the dialog walks through all owed rolls and ends the turn.
 */
export function renderProbe(dlg, api, ctx) {
  const { game } = api;
  const fresh = Boolean(ctx.opt);
  const state = { roll: null, venture: false, lead: null };
  let opt = ctx.opt ?? null;
  const probe = () => (fresh ? opt.probe.kernel : game.base.probes.find((p) => p.id === ctx.probeId));
  const p0 = probe();
  if (!p0) {
    dlg.close();
    return;
  }
  const row = fresh ? null : api.model.orders.find((o) => o.probe === p0.id);
  const isEvent = p0.target == null;
  const title = fresh ? opt.titel : isEvent ? t('ui.weltereignis') : row?.titel ?? p0.id;
  const sub = fresh ? opt.ziel : isEvent ? t.fmt('board.time', { season: api.model.zeit.saison, year: api.model.zeit.jahr }) : row?.ziel ?? '';

  const die = el('div', { class: 'wuerfelfeld' }, d10(null));
  const result = el('div', { class: 'probe-ergebnis', 'aria-live': 'polite' });
  const calc = el('div', { class: 'probe-rechnung-feld' });
  const rollBtn = el('button', { class: 'btn btn-primary btn-gross', type: 'button', 'data-wuerfeln': '', onclick: () => roll() }, icon('wuerfel', { size: 20 }), t('ui.wuerfeln'));
  const takeBtn = el('button', { class: 'btn btn-primary btn-gross', type: 'button', hidden: true, onclick: () => take() }, t('board.probe.take'));

  const extra = () => ({ ...(state.venture ? { venture: true } : {}), ...(state.lead ? { lead: state.lead } : {}) });
  const remaining = () => game.canSeal().rolls?.filter((p) => p.id !== p0.id) ?? [];

  function strip(p) {
    const faces = game.faces(p);
    const good = faces.filter((f) => f.gut).length;
    return el('div', { class: 'chance' },
      el('div', { class: 'chance-leiste', role: 'img', 'aria-label': isEvent ? faces.map((f) => `${f.n} ${f.label}`).join(', ') : t.fmt('board.probe.good-faces', { n: good }) },
        ...faces.map((f) => el('span', { class: `chance-feld ${faceClass(f)}${state.roll === f.n ? ' is-wurf' : ''}`, title: f.label, text: String(f.n) }))),
      isEvent ? null : el('p', { class: 'chance-wert num' }, el('strong', { text: `${p.chance} %` }), ` ${t('board.probe.success')}`));
  }

  /**
   * Venture and lead as choices with their effect: every row is the kernel
   * preview of the draft with exactly that choice, so modifier and chance are
   * the kernel's, and a member the kernel refuses is shown with its reason.
   */
  function options() {
    if (!fresh || state.roll !== null) return null;
    const venture = state.venture ? { venture: true } : {};
    const variant = (lead) => game.previewOption(ctx.opt, { ...venture, ...(lead ? { lead } : {}) });
    const none = variant(null);
    const baseMod = none.probe?.modTotal ?? 0;
    const parts = [];
    if (opt.art === 'haupt') {
      const alt = game.previewOption(ctx.opt, { ...(state.venture ? {} : { venture: true }), ...(state.lead ? { lead: state.lead } : {}) });
      const withV = state.venture ? opt : alt;
      parts.push(el('label', { class: 'probe-option wagnis' },
        el('input', { type: 'checkbox', checked: state.venture, 'data-wagnis': '', onchange: (e) => { state.venture = e.target.checked; update('[data-wagnis]'); } }),
        el('span', { text: t('board.probe.venture') }),
        el('span', { class: 'num down', text: withV.probe ? `${t('ui.ziel')} ${withV.probe.ziel}` : '' }),
        el('span', { class: 'num po-chance', text: withV.probe ? `${withV.probe.chance} %` : '' })));
    }
    const row = (id, label, face, v) => {
      const refused = id && (v.grund || !v.probe);
      const d = v.probe ? v.probe.modTotal - baseMod : 0;
      return el('li', {}, el('label', { class: `probe-option fuehrung${refused ? ' is-gesperrt' : ''}${state.lead === id ? ' is-gewaehlt' : ''}` },
        el('input', {
          type: 'radio', name: 'fuehrung', value: id ?? '', checked: state.lead === id, disabled: Boolean(refused), 'data-fuehrung': id ?? 'niemand',
          onchange: () => { state.lead = id; update(`[data-fuehrung="${id ?? 'niemand'}"]`); },
        }),
        face,
        el('span', { class: 'po-name' }, label, refused ? el('span', { class: 'po-grund', text: v.grund ?? t('issue.generic') }) : null),
        el('span', { class: `num po-wirkung ${d > 0 ? 'up' : d < 0 ? 'down' : ''}`, text: id && !refused ? signed(d) : '' }),
        el('span', { class: 'num po-chance', text: refused || !v.probe ? '' : `${v.probe.chance} %` })));
    };
    const council = game.view.peoples[game.pid].council;
    parts.push(el('fieldset', { class: 'probe-fuehrung' },
      el('legend', { text: t('ui.fuehrung') }),
      el('ul', { class: 'probe-optionen plain' },
        row(null, t('ui.niemand-fuehrt'), el('span', { class: 'po-leer', 'aria-hidden': 'true' }), none),
        ...council.map((m) => row(m.id, m.name, portrait(m.id, m.name, { size: 28 }), variant(m.id))))));
    return el('div', { class: 'probe-wahl' }, ...parts);
  }

  function renderCalc() {
    const p = probe();
    const mods = p.modifiers.filter((m) => !m.struck);
    const struck = p.modifiers.filter((m) => m.struck);
    calc.replaceChildren(...[
      isEvent
        ? el('dl', { class: 'probe-rechnung' }, el('dt', { text: t('board.probe.roll') }), el('dd', { class: 'num', text: t('board.probe.plain-d10') }))
        : el('dl', { class: 'probe-rechnung' },
          el('dt', { text: t('ui.ziel') }), el('dd', { class: 'num pr-ziel', text: String(p.target) }),
          ...mods.flatMap((m) => [el('dt', { text: modLabel(t, m.label) }), el('dd', { class: `num ${m.value > 0 ? 'up' : 'down'}`, text: signed(m.value) })]),
          ...struck.flatMap((m) => [el('dt', { class: 'gekappt', text: t.fmt('board.probe.capped', { label: modLabel(t, m.label) }) }), el('dd', { class: 'num gekappt', text: signed(m.value) })]),
          el('dt', { class: 'pr-summe', text: t('ui.modifikatoren') }), el('dd', { class: 'num pr-summe', text: signed(p.modTotal) })),
      options(),
      strip(p),
    ].filter(Boolean));
  }

  function update(focusSel) {
    opt = game.previewOption(ctx.opt, extra());
    api.setPreview(opt.preview);
    renderCalc();
    calc.querySelector(focusSel)?.focus();
  }

  function land(n) {
    state.roll = n;
    const p = probe();
    const face = game.faces(p)[n - 1];
    const cls = faceClass(face);
    die.replaceChildren(d10(n));
    die.className = `wuerfelfeld gelandet ${cls}`;
    renderCalc();
    result.replaceChildren(
      isEvent
        ? el('p', { class: 'pe-rechnung num' }, el('span', { class: 'pe-teil' }, el('span', { class: 'pe-wert', text: String(n) }), el('span', { class: 'pe-label', text: t('board.probe.roll') })))
        : el('p', { class: 'pe-rechnung num' },
          el('span', { class: 'pe-teil' }, el('span', { class: 'pe-wert', text: String(n) }), el('span', { class: 'pe-label', text: t('board.probe.roll') })),
          el('span', { class: 'pe-op', text: p.modTotal < 0 ? '−' : '+' }),
          el('span', { class: 'pe-teil' }, el('span', { class: 'pe-wert', text: String(Math.abs(p.modTotal)) }), el('span', { class: 'pe-label', text: t('board.probe.modifier') })),
          el('span', { class: 'pe-op', text: '=' }),
          el('span', { class: 'pe-teil' }, el('span', { class: 'pe-wert', text: String(n + p.modTotal) }), el('span', { class: 'pe-label', text: t.fmt('board.probe.against', { target: p.target }) })),
          el('span', { class: 'pe-teil' }, el('span', { class: 'pe-wert', text: signed(n + p.modTotal - p.target) }), el('span', { class: 'pe-label', text: t('board.probe.margin') }))),
      el('p', { class: `pe-urteil world ${cls}`, 'data-band': String(face.band) }, icon(face.gut ? 'ja' : 'nein', { size: 22 }), face.label),
    );
    rollBtn.hidden = true;
    const more = remaining().length;
    // sequence true walks the owed rolls of "Zug beenden" and seals; 'wuerfe' only takes the rolls.
    const last = t(ctx.sequence === true ? 'ui.zug-beenden' : 'board.probe.apply');
    takeBtn.replaceChildren(fresh ? t('board.probe.take') : ctx.sequence ? (more ? t('ereignis.weiter') : last) : t('board.probe.apply'));
    takeBtn.hidden = false;
    takeBtn.focus();
  }

  function roll() {
    if (state.roll !== null) return;
    rollBtn.disabled = true;
    const n = d10Roll();
    if (prefersReducedMotion()) {
      land(n);
      return;
    }
    die.className = 'wuerfelfeld rollt';
    const start = performance.now();
    const tick = () => {
      const el2 = performance.now() - start;
      if (el2 >= 820) {
        land(n);
        return;
      }
      die.replaceChildren(d10(1 + Math.floor(Math.random() * 10)));
      setTimeout(tick, 40 + el2 / 9);
    };
    tick();
  }

  function take() {
    const p = probe();
    const value = state.roll;
    if (fresh) {
      api.addCandidate(opt, { roll: { probe: p.id, value, fingerprint: p.fingerprint }, extra: extra() });
      dlg.close();
      return;
    }
    game.roll(p.id, value, p.fingerprint);
    if (!ctx.sequence) {
      dlg.close();
      return;
    }
    const next = game.blockers().wuerfe[0];
    if (next) renderProbe(dlg, api, { probeId: next.probeId, sequence: ctx.sequence });
    else {
      dlg.close();
      if (ctx.sequence === true) api.endTurn();
    }
  }

  dlg.replaceChildren(
    dialogHead(dlg, title, 'wuerfel', sub),
    el('div', { class: 'overlay-body probe', 'data-probe': p0.id },
      fresh && opt.folge && opt.folge !== sub ? el('p', { class: 'probe-folge', text: opt.folge }) : null,
      calc,
      die,
      result,
      el('div', { class: 'probe-aktionen' }, rollBtn, takeBtn)),
  );
  if (fresh) api.setPreview(opt.preview);
  renderCalc();
  requestAnimationFrame(() => rollBtn.focus());
}

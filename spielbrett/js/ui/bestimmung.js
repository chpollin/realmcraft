// Destinies overlay: one's own destiny with its milestones beside the rivals'
// as far as the view reveals them, plus the destinies the people could turn to.
// A milestone is a symbol and a progress bar, its wording appears on hover and
// focus. What the view does not reveal stays an unknown marker.

import { el } from '../dom.js';
import { ICONS, icon } from '../icons.js';
import { dialogHead } from './dialoge.js';
import { withTip } from './tip.js';
import { t } from '../i18n/index.js';

const symbol = (name) => (ICONS[name] ? name : 'meilenstein');

/** Tooltip text of a milestone: wording first, then where it stands. */
function milestoneTip(label, status) {
  return [el('span', { class: 'ms-tip' }, el('strong', { text: label }), status ? el('span', { text: status }) : null)];
}

function milestone(m) {
  const unknown = m.text === null || m.text === undefined;
  const label = unknown ? t('board.destiny.unknown-milestone') : m.text;
  const f = m.fortschritt;
  const total = f?.ziel ?? 1;
  const status = unknown ? t('board.destiny.state.unbekannt') : m.erreicht ? t('board.destiny.state.erreicht') : f ? t.fmt('board.destiny.progress', { done: f.wert, total: f.ziel, unit: f.einheit ?? '' }).trim() : t('board.destiny.state.offen');
  const state = unknown ? 'unbekannt' : m.erreicht ? 'erreicht' : 'offen';
  const bar = el('progress', {
    class: 'ms-balken',
    max: total,
    value: unknown ? 0 : m.erreicht ? total : Math.min(f?.wert ?? 0, total),
    'aria-label': label,
    'aria-valuetext': status,
  });
  const row = el('div', { class: 'ms-zeile', tabindex: '0', role: 'group', 'aria-label': `${label}, ${status}` },
    icon(symbol(m.icon), { size: 20, cls: 'ms-symbol' }),
    bar,
    m.erreicht ? icon('ja', { size: 16, cls: 'ms-erreicht' }) : el('span', { class: 'ms-erreicht' }));
  return el('li', { class: `meilenstein ${state}` }, withTip(row, milestoneTip(label, status)));
}

function column(peopleName, peopleCls, b) {
  const known = b.name !== null && b.name !== undefined;
  return el('section', { class: `bst-spalte ${peopleCls}`, 'aria-label': `${peopleName}, ${t('view.bestimmung')}` },
    el('h3', { class: `bst-name world${known ? '' : ' is-fog'}`, text: known ? b.name : t('board.destiny.unknown') }),
    el('p', { class: 'bst-volk', text: peopleName }),
    b.meilensteine.length ? el('ol', { class: 'meilensteine plain' }, ...b.meilensteine.map(milestone)) : null);
}

/** One symbol per milestone of a destiny the people could adopt; the wording is on demand. */
function candidateMilestones(list) {
  return el('ul', { class: 'ms-chips plain' }, ...list.map((entry) => {
    const m = typeof entry === 'string' ? { text: entry } : entry;
    const chip = el('div', { class: 'ms-chip', tabindex: '0', role: 'group', 'aria-label': m.text }, icon(symbol(m.icon), { size: 20 }));
    return el('li', {}, withTip(chip, milestoneTip(m.text)));
  }));
}

function adoptButton({ queued, blocked, reason, onclick, onpointerenter, onpointerleave, order }) {
  const btn = el('button', {
    class: queued ? 'btn btn-quiet' : 'btn',
    type: 'button',
    'aria-disabled': blocked ? 'true' : 'false',
    'data-order': order,
    onclick: () => { if (!blocked) onclick(); },
    onpointerenter,
    onpointerleave,
  }, icon(queued ? 'ja' : 'bestimmung', { size: 18 }), t(queued ? 'board.option.queued' : 'board.destiny.switch'));
  // The reason (kernel text or price) appears on hover and focus, not as standing text.
  return reason ? withTip(btn, [reason], undefined, { up: true }) : btn;
}

/**
 * Real campaign: the switch is the kernel order destiny.adopt. A destiny the
 * kernel refuses stays visible but disabled, with the kernel's reason on demand.
 */
function realButton(api, w) {
  const opt = api.game.previewOption({ type: 'destiny.adopt', params: { bestimmung: w.ref } });
  const blocked = Boolean(opt.grund) || opt.queued || api.model.phase === 'A';
  return adoptButton({
    queued: opt.queued,
    blocked,
    reason: opt.grund ?? (api.model.phase === 'A' ? t('board.destiny.resolving') : null),
    order: 'destiny.adopt',
    onclick: () => api.addCandidate(opt),
    onpointerenter: () => { if (!blocked) api.setPreview(opt.preview); },
    onpointerleave: () => api.setPreview(null),
  });
}

/** Prototype (?demo): a free order with the price the fixture names. */
function demoButton(api, w, queued) {
  const blocked = queued || api.model.phase === 'A';
  return adoptButton({
    queued,
    blocked,
    reason: w.preis ?? null,
    onclick: () => {
      api.addOrder({ id: `b-${w.name}`, quelle: `bestimmung-${w.name}`, titel: t('board.destiny.switch'), ziel: w.name, kosten: [{ key: 'zustimmung', menge: 2 }], art: 'frei' });
      api.rerenderDialog('bestimmung');
    },
  });
}

export function renderBestimmung(dlg, api) {
  const { model } = api;
  const own = model.bestimmung;
  const switchQueued = (name) => model.orders.some((o) => o.quelle === `bestimmung-${name}`);
  dlg.replaceChildren(
    dialogHead(dlg, t('board.destiny.title'), 'bestimmung'),
    el('div', { class: 'overlay-body' },
      el('div', { class: 'bst-raster' },
        column(model.volk.name, 'spieler', own),
        ...model.rivalen.map((r) => column(r.name, r.id, r.bestimmung))),
      own.wechsel.length ? el('section', { class: 'wechsel', 'aria-labelledby': 'bst-w' },
        el('h3', { class: 'abschnitt', id: 'bst-w', text: t('board.destiny.new') }),
        el('ul', { class: 'wechsel-liste plain' }, ...own.wechsel.map((w) => el('li', { class: 'wechsel-karte' },
          el('h4', { class: 'world', text: w.name }),
          // The prototype names a reason ("weil"), the kernel package only a summary of the destiny.
          el('p', { class: 'v-weil' }, model.real ? null : el('span', { class: 'v-weil-wort', text: `${t('board.tree.because')} ` }), w.weil),
          candidateMilestones(w.meilensteine),
          model.real ? realButton(api, w) : demoButton(api, w, switchQueued(w.name)))))) : null),
  );
}

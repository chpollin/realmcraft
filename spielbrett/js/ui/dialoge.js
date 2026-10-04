// Shared parts of the overlays. Native <dialog> with showModal() brings focus
// trapping, Escape to close and focus return.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n/index.js';

export function dialogHead(dlg, title, iconName, sub) {
  return el('header', { class: 'overlay-kopf' },
    el('span', { class: 'overlay-siegel' }, icon(iconName, { size: 22 })),
    el('h2', { class: 'world', id: `${dlg.id}-titel`, tabindex: '-1', text: title }),
    sub ? el('p', { class: 'unter', text: sub }) : null,
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': t.fmt('board.close.esc', { label: t('board.close') }), onclick: () => dlg.close() }, icon('schliessen')));
}

/** Loyalty on the -5..+5 scale, filled from the centre. */
export function loyaltyMeter(value, { label } = {}) {
  const lit = (x, v) => (v < 0 && v >= x) || (v > 0 && v <= x);
  const cells = [];
  for (let v = -5; v <= 5; v++) {
    if (v === 0) {
      cells.push(el('span', { class: 'lm-null' }));
      continue;
    }
    const on = lit(value, v);
    cells.push(el('span', { class: `lm-zelle ${on ? (v < 0 ? 'neg' : 'pos') : ''}` }));
  }
  return el('span', { class: 'loyalitaet', role: 'meter', 'aria-label': label ?? t('ui.loyalitaet'), 'aria-valuemin': '-5', 'aria-valuemax': '5', 'aria-valuenow': String(value) }, ...cells);
}

// Two-stage tooltips. Hover or focus shows the short form (name and value);
// a click, Enter or Space on the trigger pins the tip open with the detail
// (calculation, origin). Escape or a click elsewhere closes it again.

import { el } from '../dom.js';
import { icon } from '../icons.js';

let pinned = null;
let seq = 0;

/**
 * @param {HTMLElement} trigger focusable element the tip belongs to
 * @param {(Node|string)[]} short
 * @param {(Node|string)[]} [detail]
 * @param {{up?: boolean, right?: boolean, left?: boolean, action?: boolean}} [opts]
 * With `action` the trigger has its own click; the detail then opens after a
 * short dwell of pointer or focus instead of on click.
 * @returns {HTMLElement} wrapper holding trigger and tip
 */
export function withTip(trigger, short, detail, opts = {}) {
  const id = `tip-${++seq}`;
  const cls = ['tip', opts.up ? 'tip-up' : '', opts.right ? 'tip-rechts' : '', opts.left ? 'tip-links' : ''].filter(Boolean).join(' ');
  const tip = el('span', { class: cls, role: 'tooltip', id },
    el('span', { class: 'tip-kurz' }, ...short, detail?.length ? icon('trendAb', { size: 12, cls: 'tip-pfeil' }) : null),
    detail?.length ? el('span', { class: 'tip-mehr' }, ...detail) : null);
  const wrap = el('span', { class: 'has-tip' }, trigger, tip);
  trigger.setAttribute('aria-describedby', id);
  if (detail?.length && opts.action) {
    let timer = 0;
    const deep = () => { timer = setTimeout(() => wrap.classList.add('is-deep'), 700); };
    const flat = () => { clearTimeout(timer); wrap.classList.remove('is-deep'); };
    trigger.addEventListener('pointerenter', deep);
    trigger.addEventListener('pointerleave', flat);
    trigger.addEventListener('focus', deep);
    trigger.addEventListener('blur', flat);
  } else if (detail?.length) {
    trigger.classList.add('tip-ausklappbar');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (pinned === wrap) closePinnedTip();
      else pin(wrap, trigger);
    });
  }
  return wrap;
}

function pin(wrap, trigger) {
  closePinnedTip();
  pinned = wrap;
  wrap.classList.add('is-open');
  trigger.setAttribute('aria-expanded', 'true');
}

/** Closes the pinned tip; returns true when one was open (Escape uses this first). */
export function closePinnedTip() {
  if (!pinned) return false;
  pinned.classList.remove('is-open');
  pinned.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
  pinned = null;
  return true;
}

document.addEventListener('click', (e) => {
  if (pinned && !pinned.contains(e.target)) closePinnedTip();
});

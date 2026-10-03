// Game menu on the board: the menu button of the top bar and Escape (when
// nothing else is left to close) open it, with resume, settings, rules, the
// end screen of a finished campaign and the way back to the start screen.
// Settings and rules opened from here return to the menu when they close.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n/index.js';
import { dialogHead } from './dialoge.js';
import { openEinstellungen } from './einstellungen.js';
import { openRegeln } from './regeln.js';

/** The start screen is the board page without a campaign. */
export const toStart = () => { location.href = location.pathname; };

/**
 * @param {{ api: object, regeln: () => object|null, ended: () => boolean, onResult: () => void }} opts
 */
export function installMenu({ api, regeln, ended, onResult }) {
  const dlg = document.getElementById('dlg-menu');
  const button = document.getElementById('menu-knopf');

  // A sub-dialog hands back to the menu unless something else opened meanwhile.
  function sub(item, show) {
    dlg.close();
    const other = show();
    other?.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) open(item);
    }, { once: true });
  }

  const ITEMS = [
    { id: 'resume', icon: 'weiter', run: () => dlg.close() },
    { id: 'settings', icon: 'zahnrad', run: () => sub('settings', openEinstellungen) },
    { id: 'rules', icon: 'buch', run: () => sub('rules', () => { const r = regeln(); return r ? openRegeln(r) : null; }), when: () => Boolean(regeln()) },
    { id: 'result', icon: 'bestimmung', run: () => { dlg.close(); onResult(); }, when: ended },
    { id: 'to-start', icon: 'verlassen', run: toStart },
  ];

  function render() {
    dlg.replaceChildren(
      dialogHead(dlg, t('shell.menu.title'), 'menu'),
      el('nav', { class: 'overlay-body spielmenu', 'aria-labelledby': 'dlg-menu-titel' },
        el('ul', { class: 'plain' }, ...ITEMS.filter((i) => !i.when || i.when()).map((i) => el('li', {},
          el('button', { class: `menu-punkt${i.id === 'resume' ? ' btn-primary' : ''}`, type: 'button', 'data-menu': i.id, onclick: i.run },
            icon(i.icon, { size: 20 }), el('span', { text: t(`shell.menu.${i.id}`) })))))));
  }

  function open(focus = 'resume') {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    render();
    dlg.showModal();
    (dlg.querySelector(`[data-menu="${focus}"]`) ?? dlg.querySelector('[data-menu]'))?.focus();
  }

  button?.addEventListener('click', () => open());
  // Escape on the board with nothing else to close (board.js calls it).
  api.openMenu = () => open();
  return { open };
}

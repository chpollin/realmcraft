// Chronicle overlay: the people's history season by season, newest last, as a
// reading column.

import { el } from '../dom.js';
import { dialogHead } from './dialoge.js';
import { t } from '../i18n/index.js';

export function renderChronik(dlg, api) {
  const entries = api.model.chronik;
  dlg.replaceChildren(
    dialogHead(dlg, t('view.chronik'), 'chronik'),
    el('div', { class: 'overlay-body' },
      entries.length ? null : el('p', { class: 'chronik-leer', text: t('board.chronicle.empty') }),
      el('ol', { class: 'chronik plain' }, ...entries.map((c, i) => el('li', { class: `chronik-eintrag${c.neu ? ' is-neu' : ''}` },
        el('p', { class: 'ce-zeit', text: t.fmt('board.time', { season: c.saison, year: c.jahr }) }),
        el('article', { 'aria-labelledby': `ce-${i}` },
          el('h3', { class: 'world', id: `ce-${i}`, text: c.titel }),
          el('p', { class: 'world ce-text', text: c.text })))))),
  );
  // Open at the newest entry.
  requestAnimationFrame(() => {
    const body = dlg.querySelector('.overlay-body');
    if (body) body.scrollTop = body.scrollHeight;
  });
}

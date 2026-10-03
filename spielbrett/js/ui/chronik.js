// Chronicle overlay: the people's history season by season, newest last, as a
// reading column.

import { el } from '../dom.js';
import { dialogHead } from './dialoge.js';

export function renderChronik(dlg, api) {
  const entries = api.model.chronik;
  dlg.replaceChildren(
    dialogHead(dlg, 'Chronik', 'chronik'),
    el('div', { class: 'overlay-body' },
      el('ol', { class: 'chronik plain' }, ...entries.map((c, i) => el('li', { class: `chronik-eintrag${c.neu ? ' is-neu' : ''}` },
        el('p', { class: 'ce-zeit', text: `${c.saison}, Jahr ${c.jahr}` }),
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

// Keyboard and screen-reader equivalent of the canvas: every known unit and
// place as a button that selects it and moves the map to it.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { peopleName, tileInfo } from '../model.js';
import { t } from '../i18n/index.js';

export function renderOrtsliste(api) {
  const { model } = api;
  const nav = document.getElementById('ortsliste');
  const units = model.units.filter((u) => model.known[`${u.q},${u.r}`]);
  const places = model.places.filter((p) => model.known[`${p.q},${p.r}`]);
  const item = (o, kind, meta) => el('li', {},
    el('button', {
      class: 'ort-btn',
      type: 'button',
      onclick: () => {
        api.select({ kind, id: o.id, q: o.q, r: o.r }, { fly: true });
        nav.classList.remove('is-open');
      },
    }, icon(o.art, { size: 18 }), o.name, el('span', { class: 'meta', text: meta })));
  nav.replaceChildren(
    el('h2', { text: t('board.list.units') }),
    el('ul', { role: 'list' }, ...units.map((u) => item(u, 'unit', peopleName(model, u.volk) === model.volk.name ? t('board.list.own') : peopleName(model, u.volk)))),
    el('h2', { text: t('board.list.places') }),
    el('ul', { role: 'list' }, ...places.map((p) => item(p, 'place', tileInfo(model, p.q, p.r).regionName))),
  );
}

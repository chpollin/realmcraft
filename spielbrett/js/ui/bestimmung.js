// Destinies overlay: one's own destiny with its milestones beside the rivals'
// as far as one knows them, plus the destinies the people could turn to.
// Unknown names and milestones stay fogged.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { dialogHead } from './dialoge.js';

function milestone(m, { own }) {
  const unknown = m.text === null || m.text === undefined;
  const state = unknown ? 'unbekannt' : m.erreicht ? 'erreicht' : 'offen';
  return el('li', { class: `meilenstein ${state}` },
    el('span', { class: 'ms-marke', 'aria-hidden': 'true' }),
    el('span', { class: 'ms-text', text: unknown ? 'Unbekannter Meilenstein' : m.text }),
    own && m.stand ? el('span', { class: 'ms-stand num', text: m.erreicht ? 'erreicht' : m.stand }) : null,
    !own && !unknown ? el('span', { class: 'sr-only', text: m.erreicht ? ', erreicht' : ', offen' }) : null);
}

function column(title, peopleCls, b, { own = false } = {}) {
  const known = b.name !== null && b.name !== undefined;
  return el('section', { class: `bst-spalte ${peopleCls}`, 'aria-label': `${title}, Bestimmung` },
    el('p', { class: 'bst-volk', text: title }),
    el('h3', { class: `bst-name world${known ? '' : ' is-fog'}`, text: known ? b.name : 'Unbekannte Bestimmung' }),
    el('ol', { class: 'meilensteine plain' }, ...b.meilensteine.map((m) => milestone(m, { own }))));
}

/** Real campaign: the switch is the kernel order destiny.adopt, disabled with the kernel's reason. */
function switchButton(api, w) {
  const opt = api.game.previewOption({ type: 'destiny.adopt', params: { bestimmung: w.ref } });
  const disabled = Boolean(opt.grund) || opt.queued || api.model.phase === 'A';
  return el('div', { class: 'bs-aktion' },
    el('button', {
      class: opt.queued ? 'btn btn-quiet' : 'btn',
      type: 'button',
      'aria-disabled': disabled ? 'true' : 'false',
      'data-order': 'destiny.adopt',
      onclick: () => { if (!disabled) api.addCandidate(opt); },
      onpointerenter: () => { if (!disabled) api.setPreview(opt.preview); },
      onpointerleave: () => api.setPreview(null),
    }, icon(opt.queued ? 'ja' : 'bestimmung', { size: 18 }), opt.queued ? 'In den Befehlen' : 'Bestimmung wechseln'),
    opt.grund ? el('p', { class: 'bo-grund', text: opt.grund }) : null);
}

export function renderBestimmung(dlg, api) {
  const { model } = api;
  const own = model.bestimmung;
  const switchQueued = (name) => model.orders.some((o) => o.quelle === `bestimmung-${name}`);
  dlg.replaceChildren(
    dialogHead(dlg, 'Bestimmungen', 'bestimmung'),
    el('div', { class: 'overlay-body' },
      el('div', { class: 'bst-raster' },
        column(model.volk.name, 'spieler', own, { own: true }),
        ...model.rivalen.map((r) => column(r.name, r.id, r.bestimmung))),
      el('section', { class: 'wechsel', 'aria-labelledby': 'bst-w' },
        el('h3', { class: 'abschnitt', id: 'bst-w', text: 'Neue Bestimmung' }),
        el('ul', { class: 'wechsel-liste plain' }, ...own.wechsel.map((w) => {
          const queued = switchQueued(w.name);
          return el('li', { class: 'wechsel-karte' },
            el('h4', { class: 'world', text: w.name }),
            el('p', { class: 'v-weil' }, el('span', { class: 'v-weil-wort', text: 'weil ' }), w.weil),
            el('ol', { class: 'meilensteine plain klein' }, ...w.meilensteine.map((t) => milestone({ text: t, erreicht: false }, { own: false }))),
            w.preis ? el('dl', { class: 'v-fakten' }, el('dt', { text: 'Preis' }), el('dd', { class: 'v-preis', text: w.preis })) : null,
            model.real ? switchButton(api, w) : el('button', {
              class: queued ? 'btn btn-quiet' : 'btn',
              type: 'button',
              disabled: queued || model.phase === 'A',
              onclick: () => {
                api.addOrder({ id: `b-${w.name}`, quelle: `bestimmung-${w.name}`, titel: 'Bestimmung wechseln', ziel: w.name, kosten: [{ key: 'zustimmung', menge: 2 }], art: 'frei' });
                api.rerenderDialog('bestimmung');
              },
            }, icon('bestimmung', { size: 18 }), queued ? 'In den Befehlen' : 'Bestimmung wechseln'));
        })))),
  );
}

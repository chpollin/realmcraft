// Council strip at the left edge of the map: every member with portrait (or
// initials), name, role symbol, what they do this season, their effect when
// leading a probe and their loyalty. Always visible, folds to the portraits.
// A member opens the council overlay on their card.

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { portrait } from './portrait.js';
import { withTip } from './tip.js';
import { loyaltyMeter } from './dialoge.js';
import { t } from '../i18n/index.js';

// Role symbols of the Hochland roles; a role of another world falls back to the people symbol.
const ROLE_ICON = {
  bundessprecherin: 'rat', erste: 'bestimmung', feldaelteste: 'nahrung', feuerhueterin: 'magie', herdenaelteste: 'herde',
  herdenreiterin: 'herde', knochenruferin: 'opfer', kriegsherr: 'krieger', pfadmeister: 'bewegung', schmied: 'technik',
  vogt: 'pass', zirkelmeister: 'magie',
};
// Prototype members carry no role id; their symbol goes by person.
const PERSON_ICON = { ulrun: 'herde', torhild: 'magie', garmund: 'bewegung', brandur: 'technik' };
const STORE = 'spielbrett.ratsleiste';

function readFolded() {
  try {
    const v = localStorage.getItem(STORE);
    if (v !== null) return v === 'zu';
  } catch { /* storage blocked: fall back to the width rule */ }
  return window.matchMedia('(max-width: 1200px)').matches;
}

function storeFolded(folded) {
  try { localStorage.setItem(STORE, folded ? 'zu' : 'auf'); } catch { /* convenience only */ }
}

/** Member rows of a real campaign: role id, assignment from draft.lead, lead effect from the kernel preview. */
function realMembers(api) {
  const { game, model } = api;
  const people = game.view.peoples[game.pid];
  const leads = Object.entries(game.draft.lead ?? {});
  const effects = game.leadEffects();
  return model.rat.map((a) => {
    const m = people.council.find((x) => x.id === a.id);
    const led = leads.filter(([, member]) => member === a.id).map(([oid]) => model.orders.find((o) => o.id === oid)).filter(Boolean);
    return {
      ...a,
      icon: ROLE_ICON[m?.role] ?? 'volk',
      // The kernel keeps no place per member; without a lead they stay with the people at its home settlement.
      auftrag: led.length ? { icon: 'wuerfel', text: t.fmt('board.council.leads', { orders: led.map((o) => o.titel).join(', ') }) } : null,
      ort: model.home ? t(`settlement.${model.home.kind}`, t('board.unit.lager')) : null,
      fuehrung: effects[a.id] ?? null,
    };
  });
}

function mockMembers(api) {
  return api.model.rat.map((a) => ({ ...a, icon: PERSON_ICON[a.id] ?? 'volk', favor: a.favor ?? [], auftrag: null, fuehrung: null }));
}

export function renderRatsleiste(api) {
  const box = document.getElementById('ratsleiste');
  const { model, game } = api;
  if (!model.rat?.length) {
    box.replaceChildren();
    return;
  }
  const folded = box.dataset.zu ? box.dataset.zu === 'true' : readFolded();
  box.dataset.zu = String(folded);
  const members = game ? realMembers(api) : mockMembers(api);
  const toggle = el('button', {
    class: 'icon-btn rl-schalter', type: 'button', 'aria-expanded': String(!folded), 'aria-controls': 'ratsleiste-liste',
    'aria-label': t.fmt(folded ? 'board.council.unfold' : 'board.council.fold', { name: t('view.rat') }),
    onclick: () => {
      box.dataset.zu = String(!folded);
      storeFolded(!folded);
      renderRatsleiste(api);
      box.querySelector('.rl-schalter')?.focus();
    },
  }, icon('rat', { size: 18 }));
  const card = (a) => {
    const chips = [
      a.auftrag ? el('span', { class: 'rl-chip auftrag' }, icon(a.auftrag.icon, { size: 13 }), a.auftrag.text) : null,
      a.fuehrung !== null && a.fuehrung !== undefined ? el('span', { class: `rl-chip fuehrung ${a.fuehrung > 0 ? 'up' : a.fuehrung < 0 ? 'down' : ''}` }, icon('wuerfel', { size: 13 }), signed(a.fuehrung)) : null,
      ...(a.favor ?? []).slice(0, 2).map((g) => el('span', { class: 'rl-chip anliegen' }, icon('dafuer', { size: 13 }), t(`tag.${g}`, g))),
    ].filter(Boolean);
    const btn = el('button', {
      class: `rl-karte${a.leader ? ' is-anfuehrer' : ''}`,
      type: 'button',
      'data-rat': a.id,
      'aria-label': [a.name, a.rolle, `${t('ui.loyalitaet')} ${signed(a.loyalitaet)}`, a.auftrag?.text, a.fuehrung != null ? `${t('ui.fuehrung')} ${signed(a.fuehrung)}` : null].filter(Boolean).join(', '),
      onclick: () => {
        api.openDialog('rat');
        document.querySelector(`#dlg-rat [data-berater="${a.id}"] .berater-karte`)?.focus();
      },
    },
    el('span', { class: 'rl-bild' }, portrait(a.id, a.name, { size: 40 }), el('span', { class: 'rl-rolle', 'aria-hidden': 'true' }, icon(a.icon, { size: 13 }))),
    folded ? null : el('span', { class: 'rl-text' },
      el('span', { class: 'rl-name', text: a.name.split(' ')[0] }),
      el('span', { class: `rl-loyal num ${a.loyalitaet > 0 ? 'up' : a.loyalitaet < 0 ? 'down' : ''}`, text: signed(a.loyalitaet) }),
      chips.length ? el('span', { class: 'rl-chips' }, ...chips) : null));
    return el('li', {}, withTip(btn, [el('strong', { text: a.name }), ` ${a.rolle}`], [
      el('span', { class: 'tip-zeile' }, el('span', { text: t('ui.loyalitaet') }), el('span', {}, loyaltyMeter(a.loyalitaet, { label: t.fmt('board.council.loyalty-of', { name: a.name }) }), ` ${a.band ?? ''}`)),
      a.ort ? el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.place') }), el('span', { text: a.ort })) : null,
      el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.this-season') }), el('span', { text: a.auftrag?.text ?? t('board.council.no-task') })),
      a.fuehrung != null ? el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.lead-probe') }), el('span', { class: a.fuehrung > 0 ? 'up' : a.fuehrung < 0 ? 'down' : '', text: signed(a.fuehrung) })) : null,
      a.favor?.length ? el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.favours') }), el('span', { text: a.favor.map((g) => t(`tag.${g}`, g)).join(', ') })) : null,
      a.oppose?.length ? el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.opposes') }), el('span', { text: a.oppose.map((g) => t(`tag.${g}`, g)).join(', ') })) : null,
    ].filter(Boolean), { right: true, action: true }));
  };
  box.replaceChildren(toggle, el('ul', { class: 'rl-liste plain', id: 'ratsleiste-liste' }, ...members.map(card)));
}

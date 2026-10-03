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
import { describeParams } from '../data/adapter.js';

// Role symbols of the Hochland roles; a role of another world falls back to the people symbol.
export const ROLE_ICON = {
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

/**
 * Member rows of a real campaign: role id, task from draft.lead, and place and
 * strengths from the kernel's council view (derived[pid].council): where the
 * member stands, the lead modifier a probe would take and the goal tags.
 */
function realMembers(api) {
  const { game, model } = api;
  const view = game.view;
  const people = view.peoples[game.pid];
  const derived = new Map((view.derived?.[game.pid]?.council ?? []).map((c) => [c.id, c]));
  const leads = Object.entries(game.draft.lead ?? {});
  return model.rat.map((a) => {
    const m = people.council.find((x) => x.id === a.id);
    const d = derived.get(a.id);
    const led = leads.filter(([, member]) => member === a.id).map(([oid]) => model.orders.find((o) => o.id === oid)).filter(Boolean);
    const tile = d?.location?.tile ?? null;
    const settlement = d?.location?.settlement ? view.map.settlements.find((x) => x.id === d.location.settlement) : null;
    return {
      ...a,
      icon: ROLE_ICON[m?.role] ?? 'volk',
      auftrag: led.length ? { icon: 'wuerfel', text: t.fmt('board.council.leads', { orders: led.map((o) => o.titel).join(', ') }) } : null,
      ort: settlement?.name ?? (tile ? describeParams(view, game.env, t, { params: { tile } }, game.world) : null),
      tile,
      // At home is the default; only a member away (after leading an order) gets a place chip and a way to the map.
      fort: Boolean(tile && model.home && tile !== `${model.home.q},${model.home.r}`),
      fuehrung: d?.strengths?.lead ?? null,
      favor: d?.strengths?.favor ?? a.favor,
      oppose: d?.strengths?.oppose ?? a.oppose,
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
      a.ort && a.fort ? el('span', { class: 'rl-chip ort', 'data-ort': a.tile }, icon('ort', { size: 13 }), a.ort) : null,
      a.fuehrung !== null && a.fuehrung !== undefined ? el('span', { class: `rl-chip fuehrung ${a.fuehrung > 0 ? 'up' : a.fuehrung < 0 ? 'down' : ''}`, 'data-fuehrung': String(a.fuehrung) }, icon('wuerfel', { size: 13 }), signed(a.fuehrung)) : null,
      ...(a.favor ?? []).slice(0, 2).map((g) => el('span', { class: 'rl-chip anliegen' }, icon('dafuer', { size: 13 }), t(`tag.${g}`, g))),
      ...(a.oppose ?? []).slice(0, 1).map((g) => el('span', { class: 'rl-chip gegen' }, icon('dagegen', { size: 13 }), t(`tag.${g}`, g))),
    ].filter(Boolean);
    const btn = el('button', {
      class: `rl-karte${a.leader ? ' is-anfuehrer' : ''}`,
      type: 'button',
      'data-rat': a.id,
      'aria-label': [a.name, a.rolle, `${t('ui.loyalitaet')} ${signed(a.loyalitaet)}`, a.ort ? `${t('board.council.place')} ${a.ort}` : null, a.auftrag?.text, a.fuehrung != null ? `${t('board.council.lead-probe')} ${signed(a.fuehrung)}` : null].filter(Boolean).join(', '),
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
    const where = !folded && a.fort ? el('button', {
      class: 'icon-btn rl-zeigen', type: 'button', 'data-zeigen': a.id,
      'aria-label': t.fmt('board.council.show-on-map', { name: a.name }),
      onclick: () => api.jumpToTile(a.tile),
    }, icon('ziel', { size: 16 })) : null;
    return el('li', {}, withTip(btn, [el('strong', { text: a.name }), ` ${a.rolle}`], [
      el('span', { class: 'tip-zeile' }, el('span', { text: t('ui.loyalitaet') }), el('span', {}, loyaltyMeter(a.loyalitaet, { label: t.fmt('board.council.loyalty-of', { name: a.name }) }), ` ${a.band ?? ''}`)),
      a.ort ? el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.place') }), el('span', { text: a.ort })) : null,
      el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.this-season') }), el('span', { text: a.auftrag?.text ?? t('board.council.no-task') })),
      a.fuehrung != null ? el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.lead-probe') }), el('span', { class: a.fuehrung > 0 ? 'up' : a.fuehrung < 0 ? 'down' : '', text: signed(a.fuehrung) })) : null,
      a.favor?.length ? el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.favours') }), el('span', { text: a.favor.map((g) => t(`tag.${g}`, g)).join(', ') })) : null,
      a.oppose?.length ? el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.opposes') }), el('span', { text: a.oppose.map((g) => t(`tag.${g}`, g)).join(', ') })) : null,
    ].filter(Boolean), { right: true, action: true }), where);
  };
  box.replaceChildren(toggle, el('ul', { class: 'rl-liste plain', id: 'ratsleiste-liste' }, ...members.map(card)));
}

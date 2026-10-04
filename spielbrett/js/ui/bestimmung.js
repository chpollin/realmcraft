// Destinies overlay: one's own destiny with its milestones, the destinies of
// rivals only once the kernel reveals them (derived[pid].rivals), and the
// destinies the people may turn to, which are only those the kernel would let
// it adopt now. A milestone is a symbol and a progress bar, its wording appears
// on hover and focus; a switch shows its consequences from the kernel preview.

import { el, signed } from '../dom.js';
import { ICONS, icon } from '../icons.js';
import { dialogHead } from './dialoge.js';
import { withTip } from './tip.js';
import { predicateIcon } from '../data/adapter.js';
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

function column(peopleName, peopleCls, b, { rival = false } = {}) {
  const known = b.name !== null && b.name !== undefined;
  return el('section', { class: `bst-spalte ${peopleCls}`, 'aria-label': rival ? t.fmt('board.destiny.rival', { name: peopleName }) : `${peopleName}, ${t('view.bestimmung')}`, ...(rival ? { 'data-rivale': peopleCls } : {}) },
    el('h3', { class: `bst-name world${known ? '' : ' is-fog'}`, text: known ? b.name : t('board.destiny.unknown') }),
    el('p', { class: 'bst-volk' }, rival ? icon('rivalen', { size: 14 }) : null, peopleName),
    b.meilensteine.length ? el('ol', { class: 'meilensteine plain' }, ...b.meilensteine.map(milestone)) : null);
}

/** One symbol per milestone of a destiny the people could adopt; the wording is on demand. */
function candidateMilestones(list) {
  return el('ul', { class: 'ms-chips plain' }, ...list.map((m) => {
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
    onfocus: onpointerenter,
    onblur: onpointerleave,
  }, icon(queued ? 'ja' : 'bestimmung', { size: 18 }), t(queued ? 'board.option.queued' : 'board.destiny.switch'));
  // The reason (kernel issue label or price) appears on hover and focus, not as standing text.
  return reason ? withTip(btn, [reason], undefined, { up: true }) : btn;
}

/** Consequences of a switch from the kernel preview (destiny.adopt row): standing, loyalty, stores. */
function deltaChips(api, delta) {
  if (!delta) return null;
  const council = api.game.view.peoples[api.game.pid].council;
  const chip = (iconName, text, n) => el('li', {}, withTip(el('span', { class: `folge-chip ${n > 0 ? 'up' : 'down'}`, tabindex: '0', 'aria-label': `${text} ${signed(n)}` }, icon(iconName, { size: 15 }), signed(n)), [el('span', { text })], null, { up: true }));
  const chips = [
    delta.standing ? chip('schild', t('board.destiny.standing'), delta.standing) : null,
    ...Object.entries(delta.resources ?? {}).map(([k, n]) => chip(k, api.resourceName(k), n)),
    ...Object.entries(delta.meters ?? {}).map(([k, n]) => chip(k, t(`meter.${k}`, k), n)),
    ...Object.entries(delta.loyalty ?? {}).map(([id, n]) => chip('rat', `${council.find((m) => m.id === id)?.name ?? id}, ${t('ui.loyalitaet')}`, n)),
    delta.population ? chip('volk', t('population.core'), delta.population) : null,
  ].filter(Boolean);
  return chips.length ? el('ul', { class: 'folgen-chips plain', 'aria-label': t('board.destiny.change') }, ...chips) : null;
}

/** Rival columns: the kernel reveals a rival's destiny after contact and a reached milestone, or by a reveal. */
function rivalColumns(api) {
  const { game } = api;
  const rivals = game.view.derived?.[game.pid]?.rivals ?? [];
  return rivals.filter((r) => r.destiny).map((r) => {
    const def = game.env.bestimmung(r.destiny.ref);
    const iconOf = (id) => {
      const md = def?.milestones.find((x) => x.id === id);
      return md ? predicateIcon(md.predicate) : 'meilenstein';
    };
    return column(game.view.peoples[r.people]?.name ?? r.people, r.people, {
      name: r.destiny.name,
      meilensteine: r.destiny.milestones.map((m) => ({ id: m.id, text: m.text, erreicht: m.reached, icon: iconOf(m.id), fortschritt: null })),
    }, { rival: true });
  });
}

/** Offer cards: only destinies the kernel accepts now, each with the preview of the switch. */
function offerCards(api) {
  return api.model.bestimmung.wechsel.map((w) => {
    const opt = api.game.previewOption({ type: 'destiny.adopt', params: { bestimmung: w.ref } });
    if (opt.grund && !opt.queued) return null;
    const locked = api.model.phase === 'A';
    const row = opt.pv?.orders?.find((o) => o.type === 'destiny.adopt' && o.destiny?.ref === w.ref);
    return {
      w,
      delta: row?.destiny?.delta ?? null,
      button: adoptButton({
        queued: opt.queued,
        blocked: opt.queued || locked,
        reason: locked ? t('board.destiny.resolving') : null,
        order: 'destiny.adopt',
        onclick: () => api.addCandidate(opt),
        onpointerenter: () => { if (!locked && !opt.queued) api.setPreview(opt.preview); },
        onpointerleave: () => api.setPreview(null),
      }),
    };
  }).filter(Boolean);
}

export function renderBestimmung(dlg, api) {
  const { model } = api;
  const own = model.bestimmung;
  const offers = offerCards(api);
  dlg.replaceChildren(
    dialogHead(dlg, t('board.destiny.title'), 'bestimmung'),
    el('div', { class: 'overlay-body' },
      el('div', { class: 'bst-raster' },
        column(model.volk.name, 'spieler', own),
        ...rivalColumns(api)),
      offers.length ? el('section', { class: 'wechsel', 'aria-labelledby': 'bst-w' },
        el('h3', { class: 'abschnitt', id: 'bst-w', text: t('board.destiny.offers') }),
        el('ul', { class: 'wechsel-liste plain' }, ...offers.map(({ w, button, delta }) => el('li', { class: 'wechsel-karte', 'data-angebot': w.ref },
          // The summary of the destiny sits in the tooltip of its name, not as standing text.
          w.weil ? withTip(el('h4', { class: 'world', tabindex: '0', text: w.name }), [el('span', { text: w.weil })], null, { up: true }) : el('h4', { class: 'world', text: w.name }),
          candidateMilestones(w.meilensteine),
          deltaChips(api, delta),
          button)))) : null),
  );
}

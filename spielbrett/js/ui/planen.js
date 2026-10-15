import { el } from '../dom.js';
import { icon, orderIcon } from '../icons.js';
import { t } from '../i18n/index.js';
import { collectPlanningOptions } from '../data/planning.js';
import { dialogHead } from './dialoge.js';
import { optionRow, orderOptions } from './kontext.js';

// Navigation inspects kernel previews; only the existing order control edits the draft.
export function renderPlanen(dlg, api, ctx) {
  if (ctx) {
    dlg.dataset.slot = ctx.art;
    delete dlg.dataset.type;
    delete dlg.dataset.option;
  }
  const art = dlg.dataset.slot;
  const locked = api.model.phase === 'A' || api.game.view.status === 'ended';
  const options = locked ? [] : collectPlanningOptions(api.game, api.model, art);
  const groups = new Map();
  for (const opt of options) {
    if (!groups.has(opt.type)) groups.set(opt.type, []);
    groups.get(opt.type).push(opt);
  }
  for (const rows of groups.values()) rows.sort((a, b) => Number(Boolean(a.grund) || a.queued) - Number(Boolean(b.grund) || b.queued));
  const ordered = [...groups].sort(([a, aa], [b, bb]) => {
    const usable = (rows) => rows.some((o) => !o.grund && !o.queued);
    return Number(usable(bb)) - Number(usable(aa)) || t(`order.${a}`, a).localeCompare(t(`order.${b}`, b));
  });
  const detail = el('section', { class: 'plan-detail', 'aria-label': t('board.plan.target') });

  const showOption = (rows, optionId) => {
    api.setPreview(null);
    const selected = rows.find((o) => o.id === optionId) ?? rows.find((o) => !o.grund && !o.queued) ?? rows[0];
    dlg.dataset.option = selected.id;
    detail.replaceChildren(
      el('h3', { class: 'plan-heading', text: selected.titel }),
      rows.length > 1 ? el('label', { for: 'plan-ziel', text: t('board.plan.target') }) : null,
      rows.length > 1 ? el('select', {
        id: 'plan-ziel',
        onchange: (e) => {
          showOption(rows, e.target.value);
          detail.querySelector('select')?.focus();
        },
      }, ...rows.map((o) => el('option', { value: o.id, selected: o.id === selected.id },
        [o.ziel || o.titel, o.params.tile ? `(${o.params.tile})` : ''].filter(Boolean).join(' '), o.queued ? ` · ${t('board.option.queued')}` : o.grund ? ` · ${o.grund}` : ''))) : null,
      el('div', { id: 'plan-option' }, orderOptions({ ...api, addCandidate: (opt) => {
        const id = api.addCandidate(opt);
        if (id) dlg.close();
        return id;
      } }, null, {
        given: [optionRow(selected)], titel: t('board.plan.preview'), hid: 'plan-preview-heading',
      })));
    // Replacing a select's options must retain the target, even after a keyboard change.
    const select = detail.querySelector('select');
    if (select) select.value = selected.id;
  };
  const choose = (type, { focus = false } = {}) => {
    dlg.dataset.type = type;
    for (const btn of dlg.querySelectorAll('[data-plan-type]')) btn.setAttribute('aria-pressed', String(btn.dataset.planType === type));
    showOption(groups.get(type), dlg.dataset.option);
    if (focus) (detail.querySelector('select') ?? detail.querySelector('button'))?.focus();
  };
  const route = (type, name, dest) => {
    const entry = (api.game.base.catalogue ?? []).find((c) => c.type === type && c.available && c.slot === (art === 'haupt' ? 'main' : 'minor'));
    return entry ? el('button', { class: 'plan-route', type: 'button', onclick: () => api.openDialog(dest) },
      icon(orderIcon(type), { size: 22 }), t(`order.${type}`, type), el('span', { class: 'meta', text: name }), icon('pfeil', { size: 16 })) : null;
  };
  dlg.replaceChildren(
    dialogHead(dlg, t(`board.plan.${art}`), art),
    el('div', { class: 'overlay-body plan-body' },
      locked ? el('p', { class: 'bo-gesperrt', text: t('board.option.locked') }) : null,
      ordered.length ? el('div', { class: 'plan-layout' },
        el('div', { class: 'plan-actions', role: 'group', 'aria-label': t('board.plan.action') }, ...ordered.map(([type, rows]) => {
          const possible = rows.some((o) => !o.grund && !o.queued);
          return el('button', {
            class: `plan-action${possible ? '' : ' is-unavailable'}`, type: 'button', 'data-plan-type': type,
            'aria-pressed': 'false', onclick: () => choose(type, { focus: true }),
          }, icon(orderIcon(type), { size: 28 }), el('span', { text: t(`order.${type}`, type) }),
          !possible ? icon('schloss', { size: 15 }) : icon('pfeil', { size: 16 }));
        })), detail) : el('p', { text: locked ? '' : t('board.plan.empty') }),
      locked ? null : el('div', { class: 'plan-routes' },
        route('institute', t('view.entwicklungen'), 'entwicklungen'),
        route('destiny.adopt', t('board.destiny.title'), 'bestimmung'))));
  if (ordered.length) choose(groups.has(dlg.dataset.type) ? dlg.dataset.type : ordered[0][0]);
}

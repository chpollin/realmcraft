import { el, signed } from '../dom.js';
import { t } from '../i18n/index.js';
import { seasonSummary } from '../data/saison.js';
import { seasonOf } from '../data/adapter.js';
import { labour } from './kontext.js';
import { budgetState, slotName } from './leiste.js';
import { dialogHead } from './dialoge.js';

export function renderSaison(dlg, api) {
  const { game, model } = api;
  const data = seasonSummary({ view: game.view, env: game.env, draft: game.draft, pv: game.base, report: game.report });
  const budget = budgetState(model);
  const locked = model.phase === 'A' || game.view.status === 'ended';
  const route = (label, run, props = {}) => el('button', { type: 'button', onclick: run, ...props, class: `btn ${props.class ?? ''}` }, label);
  const rows = data.resources.filter((r) => r.stock || r.reserved || r.net);
  const research = data.research;
  const title = research.ref ? game.env.entwicklung(research.ref)?.name ?? research.ref : t('season.no-project');
  const previous = data.previous && seasonOf(game.env, t, data.previous.turn);
  dlg.replaceChildren(dialogHead(dlg, t('season.title'), 'kompass', t.fmt('board.time', { season: model.zeit.saison, year: model.zeit.jahr })),
    el('div', { class: 'overlay-body saison-body' },
      labour(api, 'saison-arbeit'),
      el('section', {}, el('h3', { text: t('season.actions') }),
        el('div', { class: 'saison-actions' }, ...['haupt', 'neben'].map((art) => route(
          `${slotName(art)} ${budget.used[art]}/${budget.max[art]}`,
          () => api.openDialog('planen', { art }), { disabled: locked, 'data-season-slot': art }))),
        el('p', { class: 'meta', text: t('season.budgets') })),
      el('section', {}, el('h3', { text: t('season.supplies') }),
        el('table', { class: 'saison-table' },
          el('thead', {}, el('tr', {}, ...['resource', 'stock', 'reserved', 'net'].map((key) => el('th', { scope: 'col', text: t(`season.${key}`) })))),
          el('tbody', {}, ...rows.map((r) => el('tr', { 'data-season-resource': r.key },
            el('th', { scope: 'row', text: api.resourceName(r.key) }),
            el('td', { text: String(r.stock) }), el('td', { text: String(r.reserved) }),
            el('td', { text: r.net === null ? '—' : signed(r.net) }))))),
        el('p', { class: 'meta', text: t('season.forecast-note') })),
      el('section', {}, el('h3', { text: t('ui.forschung') }), el('p', { text: title }),
        el('p', { class: 'meta', text: research.ref ? t.fmt('season.research', {
          progress: research.progress, cost: research.cost, points: research.points.total,
        }) : t.fmt('season.research-points', { points: research.points.total }) }),
        route(t('season.research-open'), () => api.openDialog('entwicklungen'))),
      el('section', {}, el('h3', { text: t('season.previous') }),
        previous ? el('p', { text: t.fmt('board.time', { season: previous.saison, year: previous.jahr }) }) : null,
        data.previous ? el('ul', { class: 'saison-changes' }, ...Object.entries(data.previous.changes).map(([key, value]) =>
          el('li', { text: `${api.resourceName(key)} ${signed(value)}` }))) : null,
        el('p', { class: 'meta', text: t(data.previous ? 'season.report-note' : 'season.no-report') })),
      el('div', { class: 'saison-actions' },
        route(t('season.back'), () => dlg.close()),
        route(t(game.view.phase === 'agents' ? 'board.endturn.waiting' : 'season.end'), () => { dlg.close(); api.endTurn(); }, { class: 'btn-primary', disabled: locked || game.view.phase !== 'planning' }))));
}

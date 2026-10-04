// Magic on the board: the people's disciplines with their source, the
// withdrawal an unpaid dependency left and every application with cost, slot
// and uses. Applications without a target or aimed at a council member are
// ordered here; those aimed at a tile, region, unit or people appear in the
// panel of what they aim at, where the board offers them with the other orders.

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { withTip } from './tip.js';
import { SLOT_ICON } from './leiste.js';
import { slotArt } from '../data/adapter.js';
import { disciplineCandidates, moduleData } from '../data/options.js';
import { t } from '../i18n/index.js';
import { header, fact, facts, section, orderOptions, optionRow, costChips } from './kontext.js';

// Target kinds whose applications are ordered from the target's own panel.
const ON_MAP = new Set(['tile', 'region', 'unit', 'people']);
const KIND_ICON = { tile: 'feld', region: 'besitz', unit: 'krieger', people: 'rivalen', member: 'rat', none: 'magie' };

export function renderMagie(api, close) {
  const { model, game } = api;
  const data = moduleData(game.view, game.env).magie ?? { disciplines: [], sources: {}, withdrawal: {} };
  const kopf = header(t('view.magie'), model.volk.name, icon('magie', { size: 22 }), 'spieler', close);
  const body = [];
  body.push(facts(
    ...Object.entries(data.sources).map(([res, n]) => fact(res, String(n), t.fmt('board.magic.source', { res: api.resourceName(res) }), [el('span', { text: t('board.magic.source-tip') })])),
    ...Object.entries(data.withdrawal).filter(([, n]) => n > 0).map(([res, n]) => fact('warnung', signed(-n), t.fmt('board.magic.withdrawal', { res: api.resourceName(res) }), [el('span', { text: t('board.magic.withdrawal-tip') })], { cls: 'is-gefahr' })),
  ));
  for (const d of data.disciplines) {
    const ent = game.env.entwicklung(d.ref);
    body.push(section(`disziplin-${d.ref.replace(/[^a-z0-9-]/g, '-')}`, 'magie', d.name,
      el('ul', { class: 'liste-objekte plain anwendungen' }, ...d.applications.map((a) => {
        const spec = ent?.spec?.applications?.find((x) => x.id === a.id);
        const kind = spec?.targetKind ?? 'none';
        const slot = slotArt(a.slot);
        return el('li', { class: 'anwendung', 'data-anwendung': a.id },
          withTip(el('span', { class: 'anwendung-slot', tabindex: '0', 'aria-label': t(`board.slot.${slot}`) }, icon(SLOT_ICON[slot], { size: 16 })), [el('span', { text: t(`board.slot.${slot}`) })], null, { up: true }),
          el('span', { class: 'anwendung-name', text: a.name }),
          costChips(api, Object.entries(a.cost).map(([key, menge]) => ({ key, menge }))),
          spec ? withTip(el('span', { class: 'anwendung-ziel', tabindex: '0', 'aria-label': t(`board.magic.target.${kind}`) }, icon(KIND_ICON[kind] ?? 'ziel', { size: 15 }), ON_MAP.has(kind) ? icon('ort', { size: 13 }) : null),
            [el('span', { text: t(`board.magic.target.${kind}`) })], null, { up: true }) : null);
      }))));
  }
  const home = model.home;
  const target = home ? { kind: 'unit', id: home.id, q: home.q, r: home.r } : { kind: 'modul', id: 'magie' };
  const cands = [
    ...disciplineCandidates(game.view, game.env, 'none'),
    ...game.view.peoples[game.pid].council.flatMap((m) => disciplineCandidates(game.view, game.env, 'member', m.id)),
  ];
  if (cands.length) body.push(orderOptions(api, target, { given: cands.map((c) => optionRow(game.previewOption(c))), hid: 'magie-order-h' }));
  return { kopf, body };
}

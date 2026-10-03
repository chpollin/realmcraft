// Way of life on the board: what the people lives as, where its camp stands,
// the grazing holds a moved camp leaves, the herds and a running change of way
// of life, with the change itself (adopt) as an order. A migration is ordered
// on the tile it goes to.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { regionName } from '../model.js';
import { adoptCandidates, moduleData } from '../data/options.js';
import { seasonOf } from '../data/adapter.js';
import { t } from '../i18n/index.js';
import { header, fact, facts, section, orderOptions, optionRow } from './kontext.js';

const when = (game, turn) => {
  const z = seasonOf(game.env, t, turn);
  return `${z.saison} ${z.jahr}`;
};

export function renderLebensweise(api, close) {
  const { model, game } = api;
  const data = moduleData(game.view, game.env).lebensweise ?? {};
  const people = game.view.peoples[game.pid];
  const name = (ref) => game.env.entwicklung(ref)?.name ?? ref;
  const kopf = header(t('view.lebensweise'), name(people.lebensweise), icon('lager', { size: 22 }), 'spieler', close);
  const body = [];
  const camp = data.camp;
  const campAt = camp ? camp.tile.split(',').map(Number) : null;
  body.push(facts(
    fact('lager', name(people.lebensweise), t('board.life.current'), [el('span', { text: game.env.entwicklung(people.lebensweise)?.summary ?? '' })]),
    camp ? fact('ort', regionName(model, camp.regionId), t('board.life.camp'), null, { onclick: () => api.select({ kind: 'unit', id: camp.id, q: campAt[0], r: campAt[1] }, { fly: true }), cls: 'is-link' }) : null,
    camp && data.migratedAt ? fact('bewegung', when(game, data.migratedAt), t('board.life.migrated'), null, { cls: 'is-text' }) : null,
    data.herds ? fact(data.herds.res, String(data.herds.stock), api.resourceName(data.herds.res), [el('span', { text: t.fmt('board.life.tending', { n: data.herds.tending }) })]) : null,
  ));
  if (data.transition) {
    body.push(section('wandel-h', 'praxis', t('board.life.transition'),
      facts(
        fact('pfeil', name(data.transition.to), t('board.life.to'), null),
        fact('dauer', when(game, data.transition.completeAt), t('board.life.complete'), [el('span', { text: t('board.life.complete-tip') })]),
      )));
  }
  const holds = Object.entries(data.holds ?? {});
  if (holds.length) {
    body.push(section('weide-h', 'besitz', t('board.life.holds'),
      el('ul', { class: 'liste-objekte plain' }, ...holds.map(([region, until]) => el('li', { class: 'halt-eintrag' },
        icon('besitz', { size: 16 }), el('span', { text: regionName(model, region) }),
        el('span', { class: 'meta' }, icon('dauer', { size: 13 }), when(game, until)))))));
  }
  const home = model.home;
  const target = home ? { kind: 'unit', id: home.id, q: home.q, r: home.r } : { kind: 'modul', id: 'lebensweise' };
  const adopt = adoptCandidates(game.view, game.env).map((c) => optionRow(game.previewOption(c)));
  if (adopt.length) body.push(orderOptions(api, null, target, { given: adopt, titel: t('board.life.adopt'), hid: 'wandel-order-h', iconName: 'praxis' }));
  return { kopf, body };
}

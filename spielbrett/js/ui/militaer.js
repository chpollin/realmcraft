// Military on the board: the module view with the people's units, strength and
// recruitment, the facts of a selected unit (strength, reach, sight, upkeep)
// and the battle an attack would fight. Every figure comes from the module's
// derive hook or the kernel's battle rule on the projection.

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { peopleName } from '../model.js';
import { withTip } from './tip.js';
import { attackForecast, moduleData } from '../data/options.js';
import { RULES } from '../../../engine/core/rules.js';
import { distance, parseKey } from '/engine/world/index.js';
import { t } from '../i18n/index.js';
import { header, fact, facts, section, orderOptions, realOptions, artName } from './kontext.js';

const STATE_ICON = { ready: 'ja', moved: 'bewegung', routed: 'warnung' };
const stateText = (s) => t(`board.unit.state.${s}`, s ?? '');

/** Reach, sight, upkeep and state of a unit; an own unit shows what the kernel computes for it. */
export function unitFacts(api, u) {
  const { model, game } = api;
  const own = u.volk === 'spieler';
  const r = own && model.unitReach?.id === u.id ? model.unitReach : null;
  const upkeep = Object.entries(r?.upkeep ?? {}).filter(([, n]) => n > 0);
  return facts(
    u.zustandId ? fact(STATE_ICON[u.zustandId] ?? 'praxis', stateText(u.zustandId), t('board.unit.state'), null, { cls: u.zustandId === 'routed' ? 'is-gefahr' : 'is-text' }) : null,
    r ? fact('bewegung', String(r.mobility), t('board.unit.mobility'), [el('span', { text: t.fmt('board.unit.reach', { n: r.tiles.length }) })]) : null,
    r ? fact('sicht', String(r.radius), t('board.unit.sight'), [el('span', { text: t('board.unit.sight-tip') })]) : null,
    ...upkeep.map(([res, n]) => fact(res, signed(-n), t.fmt('board.unit.upkeep', { res: api.resourceName(res) }), null)),
    !own && game ? fact('ort', t.plural('board.unit.distance', distanceToOwn(game, u)), t('board.unit.distance-label'), null, { cls: 'is-text' }) : null,
  );
}

// Steps from the nearest own unit or settlement, so a threat reads at a glance.
function distanceToOwn(game, u) {
  const pid = game.pid;
  const at = { q: u.q, r: u.r };
  const points = [...game.view.map.settlements.filter((s) => s.people === pid).map((s) => s.tile), ...game.view.peoples[pid].units.map((x) => x.tile)];
  return Math.min(...points.map((k) => distance(parseKey(k), at)));
}

/**
 * The battle an attack on the tile would fight: own strength against the
 * defence (units and garrison), as the kernel's battle rule counts them. The
 * chance and the modifiers sit on the attack order itself.
 */
export function attackForecastFacts(api, tile) {
  const { game } = api;
  const f = attackForecast(game.view, game.env, tile);
  if (!f) return null;
  const terrain = game.env.terrain(f.terrain)?.name ?? f.terrain;
  return section('angriff-h', 'krieger', t('board.military.battle'),
    el('div', { class: 'kraefte', 'data-kraefte': '', role: 'group', 'aria-label': t.fmt('board.military.versus', { a: f.A, d: f.D }) },
      kraft('krieger', f.A, t('board.military.attack'), 'own'),
      el('span', { class: 'kraefte-gegen', 'aria-hidden': 'true', text: ':' }),
      kraft('schild', f.D, f.garrison ? t.fmt('board.military.defence-garrison', { n: f.garrison }) : t('board.military.defence'), 'foe')),
    facts(
      fact('gelaende', terrain, t('board.military.terrain'), null, { cls: 'is-text' }),
      fact('wuerfel', String(f.target), t('board.probe.target'), [el('span', { text: t('board.military.target-tip') })]),
      f.invalid.length ? fact('warnung', String(f.invalid.length), t('board.military.not-ready'), null, { cls: 'is-gefahr' }) : null,
    ));
}

function kraft(iconName, n, label, side) {
  return withTip(el('span', { class: `kraft ${side}`, tabindex: '0', 'aria-label': `${label} ${n}` }, icon(iconName, { size: 18 }), el('span', { class: 'num', text: String(n) })), [el('strong', { text: label })], null, { up: true });
}

/** Foreign units and settlements bordering an own unit, one click away. */
export function threatsNear(api, u) {
  const { model } = api;
  const near = [...model.units, ...model.places].filter((o) => o.volk && o.volk !== 'spieler' && model.known[`${o.q},${o.r}`] && distance({ q: o.q, r: o.r }, { q: u.q, r: u.r }) === 1);
  if (!near.length) return null;
  return section('nahe-h', 'bedrohung', t('board.military.nearby'),
    el('ul', { class: 'liste-objekte plain' }, ...near.map((o) => el('li', {},
      el('button', { class: 'objekt-btn', type: 'button', 'data-ziel': o.id, onclick: () => api.select({ kind: o.objekt === 'unit' || o.art === 'lager' ? 'unit' : 'place', id: o.id, q: o.q, r: o.r }) },
        icon(o.art, { size: 18 }), o.name, el('span', { class: 'meta', text: peopleName(model, o.volk) }))))));
}

export function renderMilitaer(api, close) {
  const { model, game } = api;
  const data = moduleData(game.view, game.env).militaer ?? { units: [], strength: 0, recruitLimit: 0 };
  const core = game.view.peoples[game.pid].population.core;
  const cap = core * RULES.strengthPerClan;
  const kopf = header(t('view.militaer'), model.volk.name, icon('krieger', { size: 22 }), 'spieler', close);
  const body = [];
  body.push(facts(
    fact('schild', `${data.strength}/${cap}`, t('board.military.strength'), [el('span', { text: t('board.military.strength-tip') })]),
    fact('volk', String(data.recruitLimit), t('board.military.recruit-limit'), [el('span', { text: t('board.military.recruit-tip') })]),
  ));
  body.push(section('einheiten-h', 'krieger', t('board.military.units'),
    data.units.length ? el('ul', { class: 'liste-objekte plain einheiten' }, ...data.units.map((u) => {
      const [q, r] = u.tile.split(',').map(Number);
      const name = game.env.entwicklung(u.type)?.name ?? u.type;
      return el('li', {}, el('button', {
        class: 'objekt-btn', type: 'button', 'data-einheit': u.id,
        'aria-label': [name, t.fmt('board.unit.strength', { n: u.strength }), stateText(u.state)].join(', '),
        onclick: () => api.select({ kind: 'unit', id: u.id, q, r }, { fly: true }),
      }, icon('krieger', { size: 18 }), name,
      el('span', { class: 'meta einheit-marken' },
        el('span', { class: 'mini' }, icon('schild', { size: 14 }), String(u.strength)),
        el('span', { class: 'mini' }, icon('bewegung', { size: 14 }), String(u.mobility)),
        icon(STATE_ICON[u.state] ?? 'praxis', { size: 14 }))));
    })) : el('p', { class: 'leer-zeile' }, icon('krieger', { size: 16 }), t('board.military.none'))));
  const home = model.home;
  if (home) {
    const recruit = realOptions(api, { kind: 'unit', id: home.id, q: home.q, r: home.r }).filter((o) => o.opt.type === 'recruit' || o.opt.type === 'ausfall');
    body.push(orderOptions(api, null, { kind: 'unit', id: home.id, q: home.q, r: home.r }, { given: recruit, titel: t('board.military.recruit'), hid: 'rekrut-h', iconName: 'plus' }));
  }
  const foes = model.units.filter((u) => u.volk !== 'spieler' && u.objekt === 'unit' && model.known[`${u.q},${u.r}`]);
  if (foes.length) {
    body.push(section('fremde-h', 'bedrohung', t('board.military.foreign'),
      el('ul', { class: 'liste-objekte plain' }, ...foes.map((u) => el('li', {},
        el('button', { class: 'objekt-btn', type: 'button', onclick: () => api.select({ kind: 'unit', id: u.id, q: u.q, r: u.r }, { fly: true }) },
          icon(u.art, { size: 18 }), u.name, el('span', { class: 'meta', text: `${peopleName(model, u.volk)}, ${artName(u.art)}` })))))));
  }
  return { kopf, body };
}

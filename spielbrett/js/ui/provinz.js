// Province panel: a region as the kernel's unit of control. Owner, dominant
// terrain, yield of the known deposits, settlements and features, the selected
// tile with its orders, and how the region can be won or raided, as far as the
// kernel offers an order for it.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { tileInfo, peopleName, regionName } from '../data/adapter.js';
import { regionInfo } from '/engine/world/index.js';
import { tune } from '../data/kernel.js';
import { attackersFor } from '../data/options.js';
import { t } from '../i18n/index.js';
import { header, fact, facts, orderOptions, optionRow, realOptions, terrainFacts, deposits, artName } from './kontext.js';

// Orders that decide who controls a region; the province shows them under its own heading, not among the tile's orders.
const CONTROL_ORDERS = new Set(['found', 'attack', 'raubzug']);

export function province(api, regionId, tileKey, close) {
  const { model, game } = api;
  const info = regionInfo(model.world, regionId);
  const dom = model.terrains.get(info?.dominantTerrain);
  const owners = api.view.ownership();
  const known = Object.keys(model.known).filter((k) => { const [q, r] = k.split(',').map(Number); return tileInfo(model, q, r).regionId === regionId; });
  const owner = known.map((k) => owners.get(k)).find(Boolean) ?? null;
  const ownerName = owner ? peopleName(model, owner) : t('ui.ohne-herrschaft');
  const inRegion = (o) => known.includes(`${o.q},${o.r}`);
  const settlements = [...model.units.filter((u) => u.art === 'lager'), ...model.places.filter((p) => p.art === 'siedlung')].filter(inRegion);
  const features = model.places.filter((p) => p.art !== 'siedlung' && inRegion(p));
  const units = model.units.filter((u) => u.objekt === 'unit' && inRegion(u));

  // Yield potential: deposits of the known tiles turned into resources by the world's featureYield rule.
  const yields = new Map();
  for (const k of known) {
    const [q, r] = k.split(',').map(Number);
    for (const d of tileInfo(model, q, r).tile.resources ?? []) {
      const y = tune(game.env, 'featureYield', d.key);
      if (y?.res) yields.set(y.res, (yields.get(y.res) ?? 0) + y.amount);
    }
  }
  const kopf = header(regionName(model, regionId), `${t('ui.provinz')}, ${ownerName}`, icon('besitz', { size: 22 }), owner ?? '', close);
  const body = [];
  body.push(facts(
    fact(owner ? 'besitz' : 'ort', ownerName, t('ui.herrschaft'), null, owner && owner !== 'spieler' ? { onclick: () => api.select({ kind: 'people', id: owner, q: info?.centre.q, r: info?.centre.r }), cls: 'is-link' } : {}),
    fact('gelaende', dom?.name ?? '', t('board.province.terrain'), null),
    ...[...yields].map(([res, n]) => fact(res, String(n), `${t('ui.ertragspotenzial')}: ${api.resourceName(res)}`, [el('span', { text: t('board.province.yield') })])),
  ));

  if (tileKey) {
    const [q, r] = tileKey.split(',').map(Number);
    const { def, regionName: rn } = tileInfo(model, q, r);
    const target = { kind: 'tile', id: tileKey, name: t.fmt('board.tile.near', { tile: def?.name ?? t('ui.feld'), region: rn }), q, r };
    const field = el('section', { class: 'provinz-feld', 'aria-labelledby': 'feld-h' },
      el('h3', { id: 'feld-h', class: 'mit-symbol' }, icon('feld', { size: 16 }), `${t('ui.feld')}, ${def?.name ?? ''}`),
      terrainFacts(api, q, r, { region: false }),
      deposits(api, q, r),
      def && !def.water && typeof def.moveCost === 'number'
        ? orderOptions(api, target, { given: realOptions(api, target).filter((o) => !CONTROL_ORDERS.has(o.opt.type)) })
        : null);
    body.push(field);
  }

  const places = [...settlements, ...features, ...units];
  if (places.length) {
    body.push(el('ul', { class: 'liste-objekte plain', 'aria-label': t('board.province.places') }, ...places.map((p) => el('li', {},
      el('button', { class: 'objekt-btn', type: 'button', onclick: () => api.select(p.art === 'lager' || p.objekt === 'unit' ? { kind: 'unit', id: p.id, q: p.q, r: p.r } : { kind: 'place', id: p.id, q: p.q, r: p.r }, { fly: true }) },
        icon(p.art, { size: 18 }), p.name, el('span', { class: 'meta', text: p.volk && p.volk !== 'spieler' ? peopleName(model, p.volk) : artName(p.art) }))))));
  }

  if (owner !== 'spieler') {
    const list = controlOptions(api, regionId, tileKey, owner, settlements);
    if (list.length) body.push(orderOptions(api, tileKey ? { kind: 'tile', id: tileKey } : { kind: 'region', id: regionId }, { given: list, titel: t('board.province.win'), hid: 'herrschaft-h', iconName: 'besitz' }));
  }
  return { kopf, body };
}

/**
 * Orders the kernel offers to win this region: founding a settlement on the
 * selected tile, attacking the owner's settlement with the own units, a raid
 * on a region another people controls, or moving a unit in, since a people
 * standing alone in an empty, unsettled region takes it at season end. Types
 * the catalogue marks unavailable stay out.
 */
function controlOptions(api, regionId, tileKey, owner, settlements) {
  const { game } = api;
  const available = new Set((game.base.catalogue ?? []).filter((c) => c.available).map((c) => c.type));
  const units = game.view.peoples[game.pid].units ?? [];
  const ready = units.filter((u) => u.state === 'ready');
  const cands = [];
  if (tileKey && available.has('found') && !owner) cands.push({ type: 'found', params: { tile: tileKey } });
  if (owner && available.has('attack') && units.length) {
    const s = settlements.find((x) => x.volk === owner);
    const tile = s ? `${s.q},${s.r}` : tileKey;
    if (tile) cands.push({ type: 'attack', params: { units: attackersFor(game.view, tile).map((u) => u.id), tile } });
  }
  if (owner && available.has('raubzug') && ready.length) cands.push({ type: 'raubzug', params: { units: ready.map((u) => u.id), region: regionId } });
  if (!owner && !settlements.length && tileKey && available.has('move') && units.length) cands.push({ type: 'move', params: { unit: units[0].id, tile: tileKey } });
  return cands.map((c) => optionRow(game.previewOption(c)));
}

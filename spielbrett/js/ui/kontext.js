// Selection panel: what the selected tile, unit, place, region, people or
// module is, and which orders it allows. Facts are icon and value with a
// tooltip; orders preview their effect in the top bar and on the map while
// hovered or focused. Province, trade, military, magic and way of life build
// their sections in their own modules from the helpers exported here.

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { tileInfo, objectsAt, peopleName, relationOf } from '../data/adapter.js';
import { budgetState, hintSlot, slotOf, slotName, SLOT_ICON } from './leiste.js';
import { withTip } from './tip.js';
import { portrait } from './portrait.js';
import { unitReach } from '../data/options.js';
import { t } from '../i18n/index.js';
import { province } from './provinz.js';
import { tradeSection, renderHandel } from './handel.js';
import { renderMilitaer, unitFacts, attackForecastFacts, threatsNear } from './militaer.js';
import { renderMagie } from './magie.js';
import { renderLebensweise } from './lebensweise.js';

const UNIT_ARTS = new Set(['lager', 'spaeher', 'herde', 'krieger', 'haendler', 'raeuber']);
const PLACE_ARTS = new Set(['ruine', 'schrein', 'pass', 'erzader', 'quelle', 'siedlung', 'turm', 'hoehle']);
export const artName = (art) => (UNIT_ARTS.has(art) ? t(`board.unit.${art}`) : PLACE_ARTS.has(art) ? t(`board.place.${art}`) : '');
const MODULES = { handel: renderHandel, militaer: renderMilitaer, magie: renderMagie, lebensweise: renderLebensweise };
// Board icon of each module view, in the order of the module bar.
const MODULE_ICON = { lebensweise: 'lager', handel: 'handel', militaer: 'krieger', magie: 'magie' };

/**
 * Module bar on the map: one button per module the people has active, opening
 * its view in the selection panel.
 */
function renderModulLeiste(api) {
  const bar = document.getElementById('module');
  if (!bar) return;
  const { model, game } = api;
  const active = new Set(game.view.derived?.[game.pid]?.modules ?? []);
  const ids = Object.keys(MODULE_ICON).filter((id) => active.has(id));
  bar.hidden = !ids.length;
  const open = model.panel === 'kontext' && model.selection?.kind === 'modul' ? model.selection.id : null;
  const focused = bar.contains(document.activeElement) ? document.activeElement.dataset.modul : null;
  bar.replaceChildren(...ids.map((id) => withTip(el('button', {
    class: 'modul-btn',
    type: 'button',
    'data-modul': id,
    'aria-pressed': String(open === id),
    'aria-label': t(`view.${id}`, id),
    'aria-controls': 'kontext',
    onclick: () => {
      if (open === id) return api.select(null);
      const home = model.home ?? model.start;
      return api.select({ kind: 'modul', id, q: home.q, r: home.r });
    },
  }, icon(MODULE_ICON[id], { size: 18 })), [el('strong', { text: t(`view.${id}`, id) })], null, { right: true })));
  if (focused) bar.querySelector(`[data-modul="${focused}"]`)?.focus();
}

export function closeButton(onclick, label = t('board.close')) {
  return el('button', { class: 'icon-btn', type: 'button', 'aria-label': t.fmt('board.close.esc', { label }), onclick }, icon('schliessen'));
}

export function header(title, sub, seal, cls, onClose) {
  return el('div', { class: 'panel-kopf' },
    el('div', { class: `panel-siegel ${cls ?? ''}` }, seal),
    el('h2', { id: 'kontext-titel', tabindex: '-1', text: title }),
    el('p', { class: 'unter', text: sub }),
    closeButton(onClose, t('board.close.selection')));
}

/** One fact as icon and value; the label and any explanation live in the tooltip. */
export function fact(iconName, value, label, detail, { onclick, cls = '' } = {}) {
  const btn = el('button', { class: `fakt ${cls}`, type: 'button', 'aria-label': `${label} ${value}` }, icon(iconName, { size: 17 }), el('span', { text: value }));
  if (onclick) btn.addEventListener('click', onclick);
  return withTip(btn, [el('strong', { text: label })], onclick ? null : detail);
}

export function facts(...items) {
  return el('div', { class: 'fakten-zeile' }, ...items.flat().filter(Boolean));
}

/** A titled section of the panel; null without content. */
export function section(id, iconName, title, ...content) {
  const body = content.flat().filter(Boolean);
  if (!body.length) return null;
  return el('section', { class: 'kontext-sektion', 'aria-labelledby': id },
    el('h3', { id, class: 'mit-symbol' }, icon(iconName, { size: 16 }), title),
    ...body);
}

export function costChips(api, kosten, { size = 15 } = {}) {
  if (!kosten?.length) return null;
  return el('span', { class: 'costs' }, ...kosten.map((k) => {
    const short = api.available(k.key) < k.menge;
    const name = api.resourceName(k.key);
    return el('span', { class: `cost${short ? ' is-short' : ''}`, 'aria-label': `${k.menge} ${name}` }, icon(k.key, { size }), String(k.menge));
  }));
}

export function terrainFacts(api, q, r, { region = true } = {}) {
  const { model } = api;
  const { tile, def, regionName: rn, regionId } = tileInfo(model, q, r);
  const costs = model.pack.terrains.map((x) => `${x.name} ${typeof x.moveCost === 'number' ? x.moveCost : t('board.terrain.impassable')}`);
  const road = model.roadTiles.has(`${q},${r}`);
  const level = model.roads ? roadLevelAt(model, `${q},${r}`) : 0;
  return facts(
    fact('gelaende', def?.name ?? tile.terrain, t('board.layer.gelaende'), [el('span', { text: t(`board.terrain.elevation.${tile.elevation > 0.45 ? 'mountains' : tile.elevation > 0.22 ? 'uplands' : 'valley'}`) })]),
    region ? fact('ort', rn, t('board.terrain.region'), null, { onclick: () => api.select({ kind: 'region', id: regionId, q, r }), cls: 'is-link' }) : null,
    fact('bewegung', typeof def?.moveCost === 'number' ? (road ? '¼' : String(def.moveCost)) : '✕', t('board.terrain.movement'), [
      el('span', { text: t(road ? 'board.terrain.road' : 'board.terrain.move-cost') }),
      ...costs.map((c) => el('span', { class: 'tip-zeile', text: c })),
    ]),
    road && level ? fact('handel', t.fmt('board.road.level', { n: level }), t('board.road.label'), [el('span', { text: t('board.road.tip') })]) : null,
    def?.sightModifier ? fact('sicht', signed(def.sightModifier), t('board.terrain.sight'), [el('span', { text: t('board.terrain.sight-tip') })]) : null,
    tile.river ? fact('quelle', t('board.terrain.stream'), t('board.terrain.water'), null, { cls: 'is-wasser' }) : null,
  );
}

// Road level of a tile as the kernel's road layer gives it (adapter keeps the levels per tile).
function roadLevelAt(model, k) {
  return model.roadLevels?.get(k) ?? (model.roadTiles.has(k) ? 1 : 0);
}

export function deposits(api, q, r) {
  const { tile } = tileInfo(api.model, q, r);
  if (!tile.resources.length) return null;
  return facts(...tile.resources.map((res) => {
    const def = api.model.resourceDefs.get(res.key);
    return fact(resourceIcon(res.key), String(res.amount), def?.name ?? res.key, [el('span', { text: t('board.terrain.deposit') })]);
  }));
}

export function resourceIcon(k) {
  if (/erz|feuerstein|lehm|gold/.test(k)) return 'erz';
  if (/salz/.test(k)) return 'salz';
  if (/edelstein/.test(k)) return 'psil';
  if (/wild|gemsen/.test(k)) return 'herde';
  if (/fisch/.test(k)) return 'quelle';
  if (/kraeuter/.test(k)) return 'entwicklungen';
  if (/torf/.test(k)) return 'material';
  return 'ort';
}

/** A previewed kernel option (game.previewOption, game.optionsFor) as a row of the order list. */
export function optionRow(opt) {
  return {
    opt, titel: opt.titel, art: opt.art, kosten: opt.kosten, folge: opt.folge, queued: opt.queued,
    mods: opt.probe ? opt.probe.modifikatoren : null,
    probe: opt.probe ? { ziel: opt.probe.ziel, chance: opt.probe.chance } : null,
    grund: opt.grund,
    hinweis: opt.rat ? t.fmt('board.option.council-rejects', { yes: opt.rat.yes, no: opt.rat.no }) : null,
    preview: opt.preview,
    ersetzt: opt.ersetzt,
    ersatz: opt.ersatz,
    extra: opt.extraRows ?? null,
  };
}

/** Kernel options of a selection: availability, costs, probe and preview come from preview(). */
export function realOptions(api, target) {
  return api.game.optionsFor(target).map(optionRow);
}

/** While an order is hovered or focused: its consequences in the top bar and on the map, its slot in the slot indicator. */
function previewHandlers(api, opt, pv, art, ersetzt, enabled) {
  const on = () => {
    if (!enabled()) return;
    api.setPreview(pv);
    hintSlot(api, { art, ersetzt: ersetzt ?? null });
  };
  const off = () => {
    api.setPreview(null);
    hintSlot(api, null);
  };
  return { onpointerenter: on, onpointerleave: off, onfocus: on, onblur: off };
}

export function orderOptions(api, target, { given = null, titel = t('board.option.heading'), hid = 'bo-h', iconName = null } = {}) {
  const { model } = api;
  const list = given ?? realOptions(api, target);
  if (!list.length) return null;
  const { used, max } = budgetState(model);
  const locked = model.phase === 'A';
  return el('section', { 'aria-labelledby': hid, class: 'befehle-sektion' },
    el('h3', { id: hid, class: iconName ? 'mit-symbol' : null }, iconName ? icon(iconName, { size: 16 }) : null, titel),
    locked ? el('p', { class: 'bo-gesperrt' }, icon('schloss', { size: 16 }), t('board.option.locked')) : null,
    el('ul', { class: 'befehlsliste plain' }, ...list.map((o) => {
      const { opt, queued, mods, grund } = o;
      const disabled = locked || Boolean(grund) || queued;
      const sum = mods ? mods.reduce((a, m) => a + m.wert, 0) : 0;
      const pv = o.preview;
      const slot = slotOf({ type: opt.type, art: o.art });
      const btn = el('button', {
        class: 'befehl-option',
        type: 'button',
        'aria-disabled': disabled ? 'true' : 'false',
        'aria-label': [o.titel, o.folge, slotName(slot), grund].filter(Boolean).join(', '),
        'data-order': opt.type ?? opt.id,
        'data-slot': slot,
        'data-fk': `bo:${opt.id ?? opt.type}`,
        onclick: () => { if (!disabled) api.addCandidate(opt); },
        ...previewHandlers(api, opt, pv, slot, o.ersetzt?.id, () => !disabled),
      },
      el('span', { class: `bo-art ${slot}`, 'aria-hidden': 'true' }, icon(SLOT_ICON[slot], { size: 18 })),
      el('span', { class: 'bo-titel', text: o.titel }),
      el('span', { class: 'bo-marken' },
        costChips(api, o.kosten),
        o.probe ? el('span', { class: 'probe-tag', 'aria-label': t.fmt(o.probe.chance != null ? 'board.option.probe-chance' : 'board.option.probe', { target: o.probe.ziel, mod: signed(sum), chance: o.probe.chance }) }, icon('wuerfel', { size: 15 }), `${o.probe.ziel}`, el('span', { class: 'probe-mod', text: signed(sum) }), o.probe.chance != null ? el('span', { class: 'probe-chance', text: `${o.probe.chance} %` }) : null) : null),
      el('span', { class: 'bo-folge', text: o.folge }),
      o.extra ? el('span', { class: 'bo-extra' }, ...o.extra) : null,
      o.ersetzt && !queued ? el('span', { class: 'bo-ersetzt' }, icon('praxis', { size: 14 }), t.fmt('board.option.instead', { title: [o.ersetzt.titel, o.ersetzt.ziel].filter(Boolean).join(', ') })) : null,
      queued ? el('span', { class: 'is-queued' }, icon('ja', { size: 14 }), t('board.option.queued')) : null,
      grund ? el('span', { class: 'bo-grund', text: grund }) : o.hinweis ? el('span', { class: 'bo-grund', text: o.hinweis }) : null);
      // A full slot offers the swap instead of an overflow: the option replaces the last order of that slot.
      const swap = o.ersatz && !locked && !queued ? el('button', {
        class: 'btn btn-klein bo-tausch',
        type: 'button',
        'data-ersetzen': opt.type,
        onclick: () => api.addCandidate(o.ersatz),
        ...previewHandlers(api, o.ersatz, o.ersatz.preview, slot, o.ersatz.ersetzt?.id, () => true),
      }, icon('praxis', { size: 15 }), t.fmt('board.option.replace', { title: o.ersatz.ersetzt.titel })) : null;
      const detail = [
        el('span', { class: 'tip-zeile' }, el('span', {}, icon(SLOT_ICON[slot], { size: 14 }), ` ${slotName(slot)}`), el('span', { text: slot in used ? t.fmt('board.option.slots-taken', { used: used[slot], max: max[slot] }) : t(slot === 'forschung' ? 'board.option.once-per-season' : 'board.option.no-action') })),
        ...(o.probe ? [
          el('span', { class: 'tip-zeile' }, el('span', { text: t('board.probe.target') }), el('span', { text: String(o.probe.ziel) })),
          ...mods.map((m) => el('span', { class: 'tip-zeile' }, el('span', { text: m.grund }), el('span', { class: m.wert > 0 ? 'up' : 'down', text: signed(m.wert) }))),
          o.probe.chance != null ? el('span', { class: 'tip-zeile' }, el('span', { text: t('board.probe.success') }), el('span', { text: `${o.probe.chance} %` })) : null,
        ] : []),
        ...Object.entries(pv?.deltas ?? {}).map(([k, d]) => el('span', { class: 'tip-zeile' }, el('span', { text: t.fmt('board.option.at-season-end', { res: api.resourceName(k) }) }), el('span', { class: d > 0 ? 'up' : 'down', text: signed(d) }))),
      ].filter(Boolean);
      return el('li', {}, withTip(btn, [el('strong', { text: o.titel })], detail, { left: true, action: true }), swap);
    })));
}

/**
 * Labour of the turn (draft.assign): clans per resource or activity. Every
 * step previews its effect on the stores before it is made.
 */
function labour(api) {
  const { model, game } = api;
  const people = game.view.peoples[game.pid];
  const assign = { ...(game.draft.assign ?? people.population.assigned ?? {}) };
  const keys = [...new Set([...game.env.regeln.resources.slice(0, 3).map((r) => r.id), ...Object.keys(assign)])];
  const total = Object.values(assign).reduce((a, n) => a + n, 0);
  const core = people.population.core;
  const locked = model.phase === 'A';
  const label = (k) => (k === 'research' ? t('ui.forschung') : t(`resource.${k}`, k));
  const step = (k, d) => ({ ...assign, [k]: Math.max(0, (assign[k] ?? 0) + d) });
  const hover = (k, d) => {
    const next = step(k, d);
    api.setPreview({ deltas: game.deltasWith((dr) => ({ ...dr, assign: next })), tiles: [] });
  };
  const btn = (k, d, disabled, name) => el('button', {
    class: 'icon-btn', type: 'button', 'aria-label': t.fmt(d > 0 ? 'board.labour.more' : 'board.labour.less', { name }), 'aria-disabled': disabled ? 'true' : 'false',
    onclick: () => { if (!disabled) { api.setPreview(null); game.setAssign(step(k, d)); } },
    onpointerenter: () => { if (!disabled) hover(k, d); },
    onpointerleave: () => api.setPreview(null),
    onfocus: () => { if (!disabled) hover(k, d); },
    onblur: () => api.setPreview(null),
  }, icon(d > 0 ? 'plus' : 'minus', { size: 15 }));
  return el('section', { 'aria-labelledby': 'arbeit-h', class: 'befehle-sektion arbeit' },
    el('h3', { id: 'arbeit-h', text: t.fmt('board.labour.heading', { clans: t('population.core'), total, core }) }),
    el('ul', { class: 'arbeit-liste plain' }, ...keys.map((k) => el('li', { class: 'arbeit-zeile', 'data-arbeit': k },
      icon(k === 'research' ? 'wissen' : k, { size: 17 }),
      el('span', { class: 'arbeit-name', text: label(k) }),
      btn(k, -1, locked || !(assign[k] > 0), label(k)),
      el('span', { class: 'num arbeit-zahl', text: String(assign[k] ?? 0) }),
      btn(k, 1, locked || total >= core, label(k))))));
}

export function onTile(api, q, r, exclude) {
  const { units, places } = objectsAt(api.model, q, r);
  const items = [...units.filter((u) => u.id !== exclude), ...places.filter((p) => p.id !== exclude)];
  if (!items.length) return null;
  return el('ul', { class: 'liste-objekte plain', 'aria-label': t('board.tile.objects') }, ...items.map((o) => el('li', {},
    el('button', { class: 'objekt-btn', type: 'button', onclick: () => api.select(UNIT_ARTS.has(o.art) ? { kind: 'unit', id: o.id, q, r } : { kind: 'place', id: o.id, q, r }) },
      icon(o.art, { size: 18 }), o.name, el('span', { class: 'meta', text: artName(o.art) })))));
}

function strengthPips(n) {
  return el('span', { class: 'staerke', 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, (_, i) => el('span', { class: i < n ? 'on' : '' })));
}

/** Facts of a foreign people: stance, relation, its destiny when the kernel has revealed it. */
function peopleFacts(api, riv) {
  const { game } = api;
  const revealed = game.view.derived?.[game.pid]?.rivals?.find((r) => r.people === riv.id)?.destiny ?? null;
  const rel = relationOf(game.view, game.pid, riv.id);
  const destinyName = revealed?.name ?? riv.bestimmung.name ?? t('board.people.unknown');
  const steps = revealed?.milestones ?? [];
  const destinyBtn = el('button', { class: `fakt${revealed ? '' : ' is-text'}`, type: 'button', 'data-rival-destiny': revealed ? revealed.ref : '', 'aria-label': [t('view.bestimmung'), destinyName, revealed ? t.fmt('board.of', { done: steps.filter((m) => m.reached).length, total: steps.length }) : null].filter(Boolean).join(', ') },
    icon('bestimmung', { size: 17 }), el('span', { text: destinyName }),
    steps.length ? el('span', { class: 'pips', 'aria-hidden': 'true' }, ...steps.map((m) => el('span', { class: `pip${m.reached ? ' on' : ''}` }))) : null);
  return facts(
    fact(riv.haltung === 'feindlich' ? 'warnung' : 'angebot', t(`board.stance.${riv.haltung}`, riv.haltung), t('board.people.stance'), null, { cls: riv.haltung === 'feindlich' ? 'is-gefahr' : 'is-wasser' }),
    rel?.contact ? fact('zustimmung', signed(rel.value), t('ui.beziehung'), [el('span', { text: t(rel.atWar ? 'board.people.at-war' : 'board.people.relation-tip') })], { cls: rel.atWar ? 'is-gefahr' : '' }) : null,
    withTip(destinyBtn, [el('strong', { text: t('view.bestimmung') })], steps.length ? steps.map((m) => el('span', { class: 'tip-zeile' }, icon(m.reached ? 'ja' : 'meilenstein', { size: 14 }), el('span', { text: m.text }))) : null),
  );
}

/** Own units and settlements of the people are drawn with their reach and sight on the map while selected. */
function markReach(api, sel) {
  const { model, game } = api;
  const own = sel?.kind === 'unit' ? game.view.peoples[game.pid].units.find((u) => u.id === sel.id) : null;
  const next = own ? unitReach(game.view, game.env, game.world, own.id) : null;
  if ((next?.id ?? null) === (model.unitReach?.id ?? null) && (!next || next.tile === model.unitReach.tile)) return;
  model.unitReach = next;
  api.view.changed();
}

export function renderKontext(api) {
  const { model } = api;
  renderModulLeiste(api);
  const panel = document.getElementById('kontext');
  const sel = model.selection;
  markReach(api, model.panel === 'kontext' ? sel : null);
  if (!sel || model.panel !== 'kontext') {
    panel.hidden = true;
    delete panel.dataset.modul;
    return;
  }
  panel.hidden = false;
  const close = () => api.select(null);
  let kopf;
  const body = [];
  panel.dataset.modul = sel.kind === 'modul' ? sel.id : '';
  if (sel.kind === 'modul') {
    const m = (MODULES[sel.id] ?? renderHandel)(api, close);
    kopf = m.kopf;
    body.push(...m.body);
  } else if (sel.kind === 'unit') {
    const u = model.units.find((x) => x.id === sel.id);
    if (!u) {
      api.select(null);
      return;
    }
    const own = u.volk === 'spieler';
    kopf = header(u.name, own ? artName(u.art) : `${artName(u.art)}, ${peopleName(model, u.volk)}`, icon(u.art, { size: 22 }), u.volk, close);
    const isUnit = u.objekt === 'unit';
    body.push(facts(
      withTip(el('button', { class: 'fakt', type: 'button', 'aria-label': t.fmt('board.unit.strength-of', { n: u.staerke }) }, icon('schild', { size: 17 }), strengthPips(u.staerke)), [el('strong', { text: t.fmt('board.unit.strength', { n: u.staerke }) })], null),
      isUnit ? null : fact('praxis', u.zustand, t('board.unit.state'), null, { cls: 'is-text' }),
      own ? null : fact(u.volk === 'schaedelklan' ? 'raeuber' : 'haendler', peopleName(model, u.volk), t('board.unit.people'), null, { onclick: () => api.select({ kind: 'people', id: u.volk, q: u.q, r: u.r }), cls: 'is-link' }),
    ));
    if (isUnit) body.push(unitFacts(api, u));
    if (!own) body.push(attackForecastFacts(api, `${u.q},${u.r}`));
    body.push(orderOptions(api, { kind: 'unit', id: u.id, name: u.name, q: u.q, r: u.r }));
    if (own && isUnit) body.push(threatsNear(api, u));
    if (own && u.objekt === 'settlement') body.push(labour(api));
    body.push(terrainFacts(api, u.q, u.r));
    body.push(onTile(api, u.q, u.r, u.id));
  } else if (sel.kind === 'place') {
    const p = model.places.find((x) => x.id === sel.id);
    if (!p) {
      api.select(null);
      return;
    }
    kopf = header(p.name, `${artName(p.art)}${p.volk && p.volk !== 'spieler' ? `, ${peopleName(model, p.volk)}` : ''}`, icon(p.art, { size: 22 }), p.volk, close);
    body.push(el('p', { class: 'beschreibung', text: p.beschreibung }));
    if (p.volk && p.volk !== 'spieler' && p.objekt === 'settlement') body.push(attackForecastFacts(api, `${p.q},${p.r}`));
    body.push(orderOptions(api, { kind: 'place', id: p.id, name: p.name, q: p.q, r: p.r }));
    if (p.volk === 'spieler' && p.objekt === 'settlement') body.push(labour(api));
    body.push(terrainFacts(api, p.q, p.r));
    body.push(deposits(api, p.q, p.r));
    body.push(onTile(api, p.q, p.r, p.id));
  } else if (sel.kind === 'region') {
    const p = province(api, sel.id, sel.q !== undefined ? `${sel.q},${sel.r}` : null, close);
    kopf = p.kopf;
    body.push(...p.body);
  } else if (sel.kind === 'people') {
    const riv = model.rivalen.find((x) => x.id === sel.id);
    if (!riv) {
      api.select(null);
      return;
    }
    kopf = header(riv.name, riv.anfuehrer ? `${riv.anfuehrer.name}, ${riv.anfuehrer.rolle}` : t(`board.stance.${riv.haltung}`, riv.haltung), portrait(riv.anfuehrer?.id, riv.anfuehrer?.name ?? riv.name, { size: 44 }), `${riv.id} mit-portraet`, close);
    body.push(el('p', { class: 'beschreibung', text: riv.beschreibung }));
    body.push(peopleFacts(api, riv));
    body.push(tradeSection(api, riv.id));
    const units = model.units.filter((u) => u.volk === riv.id && model.known[`${u.q},${u.r}`]);
    if (units.length) {
      body.push(el('ul', { class: 'liste-objekte plain', 'aria-label': t('board.people.sighted') }, ...units.map((u) => el('li', {},
        el('button', { class: 'objekt-btn', type: 'button', onclick: () => api.select({ kind: 'unit', id: u.id, q: u.q, r: u.r }, { fly: true }) }, icon(u.art, { size: 18 }), u.name, el('span', { class: 'meta', text: artName(u.art) }))))));
    }
    body.push(orderOptions(api, { kind: 'people', id: riv.id, name: riv.name }));
  } else {
    // An empty tile opens its province, with the tile and its orders as one section of it.
    const { regionId } = tileInfo(model, sel.q, sel.r);
    const p = province(api, regionId, `${sel.q},${sel.r}`, close);
    kopf = p.kopf;
    body.push(...p.body);
  }
  // Forms in the panel re-render it on every change; focus and scroll stay where the player was.
  const same = panel.dataset.sel === selKey(sel);
  const active = panel.contains(document.activeElement) ? document.activeElement : null;
  const focusSel = active?.id ? `#${CSS.escape(active.id)}` : active?.dataset.fk ? `[data-fk="${CSS.escape(active.dataset.fk)}"]` : null;
  const scroll = same ? panel.querySelector('.panel-body')?.scrollTop ?? 0 : 0;
  panel.dataset.sel = selKey(sel);
  panel.replaceChildren(kopf, el('div', { class: 'panel-body' }, ...body.filter(Boolean)));
  panel.querySelector('.panel-body').scrollTop = scroll;
  if (same && focusSel) panel.querySelector(focusSel)?.focus({ preventScroll: true });
}

const selKey = (sel) => `${sel.kind}:${sel.id ?? ''}:${sel.q ?? ''},${sel.r ?? ''}`;

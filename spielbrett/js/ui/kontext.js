// Selection panel: what the selected tile, unit, place, region or people is,
// and which orders it allows. Facts are icon and value with a tooltip; orders
// preview their effect in the top bar and on the map while hovered or focused.

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { tileInfo, objectsAt, peopleName, regionName } from '../model.js';
import { budgetState, hintSlot, slotOf, SLOT_ICON, SLOT_NAME } from './leiste.js';
import { withTip } from './tip.js';
import { regionInfo } from '/engine/world/index.js';
import { portrait } from './portrait.js';
import { tune } from '../data/kernel.js';

const UNIT_ART = { lager: 'Lager', spaeher: 'Späher', herde: 'Herde', krieger: 'Krieger', haendler: 'Händler', raeuber: 'Reiterschar' };
const PLACE_ART = { ruine: 'Ruine', schrein: 'Schrein', pass: 'Pass', erzader: 'Erzader', quelle: 'Quelle', siedlung: 'Siedlung', turm: 'Turm', hoehle: 'Höhle' };

export function closeButton(onclick, label = 'Schließen') {
  return el('button', { class: 'icon-btn', type: 'button', 'aria-label': `${label} (Esc)`, onclick }, icon('schliessen'));
}

function header(title, sub, seal, cls, onClose) {
  return el('div', { class: 'panel-kopf' },
    el('div', { class: `panel-siegel ${cls ?? ''}` }, seal),
    el('h2', { id: 'kontext-titel', tabindex: '-1', text: title }),
    el('p', { class: 'unter', text: sub }),
    closeButton(onClose, 'Auswahl schließen'));
}

/** One fact as icon and value; the label and any explanation live in the tooltip. */
function fact(iconName, value, label, detail, { onclick, cls = '' } = {}) {
  const btn = el('button', { class: `fakt ${cls}`, type: 'button', 'aria-label': `${label} ${value}` }, icon(iconName, { size: 17 }), el('span', { text: value }));
  if (onclick) btn.addEventListener('click', onclick);
  return withTip(btn, [el('strong', { text: label })], onclick ? null : detail);
}

function facts(...items) {
  return el('div', { class: 'fakten-zeile' }, ...items.filter(Boolean));
}

export function costChips(api, kosten, { size = 15 } = {}) {
  if (!kosten?.length) return null;
  return el('span', { class: 'costs' }, ...kosten.map((k) => {
    const short = api.available(k.key) < k.menge;
    const name = api.resourceName(k.key);
    return el('span', { class: `cost${short ? ' is-short' : ''}`, 'aria-label': `${k.menge} ${name}` }, icon(k.key, { size }), String(k.menge));
  }));
}

function terrainFacts(api, q, r, { region = true } = {}) {
  const { model } = api;
  const { tile, def, regionName: rn, regionId } = tileInfo(model, q, r);
  const frost = model.frostRegions.has(regionId);
  const costs = model.pack.terrains.map((t) => `${t.name} ${typeof t.moveCost === 'number' ? t.moveCost : 'unpassierbar'}`);
  const road = model.roadTiles.has(`${q},${r}`);
  return facts(
    fact('gelaende', def?.name ?? tile.terrain, 'Gelände', [el('span', { text: `Höhenlage ${tile.elevation > 0.45 ? 'Gebirge' : tile.elevation > 0.22 ? 'Bergland' : 'Tal'}` })]),
    region ? fact('ort', rn, 'Region', null, { onclick: () => api.select({ kind: 'region', id: regionId, q, r }), cls: 'is-link' }) : null,
    fact('bewegung', typeof def?.moveCost === 'number' ? (road ? '¼' : String(def.moveCost)) : '✕', 'Bewegung', [
      el('span', { text: road ? 'Weg auf diesem Feld, Betreten kostet ein Viertel.' : 'Kosten für das Betreten dieses Feldes.' }),
      ...costs.map((c) => el('span', { class: 'tip-zeile', text: c })),
    ]),
    def?.sightModifier ? fact('sicht', signed(def.sightModifier), 'Sicht', [el('span', { text: 'Sichtweite einer Schar auf diesem Feld.' })]) : null,
    tile.river ? fact('quelle', 'Bach', 'Wasser', null, { cls: 'is-wasser' }) : null,
    frost ? fact('frost', 'Frost', 'Wetter', [el('span', { text: 'Weltagent, Herbst Jahr 3' })], { cls: 'is-wasser' }) : null,
  );
}

function deposits(api, q, r) {
  const { tile } = tileInfo(api.model, q, r);
  if (!tile.resources.length) return null;
  return facts(...tile.resources.map((res) => {
    const def = api.model.resourceDefs.get(res.key);
    return fact(resourceIcon(res.key), String(res.amount), def?.name ?? res.key, [el('span', { text: 'Vorkommen auf diesem Feld' })]);
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

function previewOf(opt, target) {
  const deltas = {};
  for (const k of opt.kosten ?? []) deltas[k.key] = (deltas[k.key] ?? 0) - k.menge;
  if (opt.gibt) deltas[opt.gibt.key] = (deltas[opt.gibt.key] ?? 0) + opt.gibt.menge;
  return { deltas, tiles: target.q !== undefined ? [{ q: target.q, r: target.r }] : [] };
}

/** Prototype options from the fixture catalogue, in the shape the list renders. */
function mockOptions(api, catalogKeys, target) {
  const { model } = api;
  const { used, max } = budgetState(model);
  return [catalogKeys].flat().flatMap((k) => model.S.befehlskatalog[k] ?? []).map((opt) => {
    const queued = model.orders.some((o) => o.quelle === opt.id && o.zielId === target.id);
    const missing = (opt.kosten ?? []).filter((k) => api.available(k.key) < k.menge);
    const over = opt.art in used && used[opt.art] >= max[opt.art];
    const mods = opt.probe ? [...opt.probe.modifikatoren, ...(over ? [{ wert: -1, grund: 'Überdehnung' }] : [])] : null;
    return {
      opt, titel: opt.titel, art: opt.art, kosten: opt.kosten, folge: opt.folge, queued, over, mods,
      probe: opt.probe ? { ziel: opt.probe.ziel } : null,
      grund: missing.length ? `Es fehlen ${missing.map((k) => `${k.menge - api.available(k.key)} ${api.resourceName(k.key)}`).join(' und ')}` : null,
      preview: previewOf(opt, target),
    };
  });
}

/** Kernel options of a real campaign: availability, costs, probe and preview come from preview(). */
function realOptions(api, target) {
  return api.game.optionsFor(target).map((opt) => ({
    opt, titel: opt.titel, art: opt.art, kosten: opt.kosten, folge: opt.folge, queued: opt.queued, over: false,
    mods: opt.probe ? opt.probe.modifikatoren : null,
    probe: opt.probe ? { ziel: opt.probe.ziel, chance: opt.probe.chance } : null,
    grund: opt.grund,
    hinweis: opt.rat ? `Der Rat lehnt ab (${opt.rat.yes} dafür, ${opt.rat.no} dagegen)` : null,
    preview: opt.preview,
    ersetzt: opt.ersetzt,
    ersatz: opt.ersatz,
  }));
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

function orderOptions(api, catalogKeys, target, { given = null, titel = 'Befehle', hid = 'bo-h' } = {}) {
  const { model } = api;
  const list = given ?? (model.real ? realOptions(api, target) : mockOptions(api, catalogKeys, target));
  if ((model.real || given) && !list.length) return null;
  const { used, max } = budgetState(model);
  const locked = model.phase === 'A';
  return el('section', { 'aria-labelledby': hid, class: 'befehle-sektion' },
    el('h3', { id: hid, text: titel }),
    locked ? el('p', { class: 'bo-gesperrt' }, icon('schloss', { size: 16 }), 'Gesperrt, bis Regelkern und Weltereignisse fertig sind') : null,
    el('ul', { class: 'befehlsliste plain' }, ...list.map((o) => {
      const { opt, queued, over, mods, grund } = o;
      const disabled = locked || Boolean(grund) || queued;
      const sum = mods ? mods.reduce((a, m) => a + m.wert, 0) : 0;
      const pv = o.preview;
      const slot = slotOf({ type: opt.type, art: o.art });
      const btn = el('button', {
        class: 'befehl-option',
        type: 'button',
        'aria-disabled': disabled ? 'true' : 'false',
        'aria-label': `${o.titel}, ${SLOT_NAME[slot]}${over && !queued ? ', Überdehnung' : ''}`,
        'data-order': opt.type ?? opt.id,
        'data-slot': slot,
        onclick: () => { if (!disabled) api.chooseOrder(opt, target, mods); },
        ...previewHandlers(api, opt, pv, slot, o.ersetzt?.id, () => !disabled),
      },
      el('span', { class: `bo-art ${slot}`, 'aria-hidden': 'true' }, icon(SLOT_ICON[slot], { size: 18 })),
      el('span', { class: 'bo-titel', text: o.titel }),
      el('span', { class: 'bo-marken' },
        over && !queued && !locked ? el('span', { class: 'bo-ueber', 'aria-hidden': 'true' }, icon('ueberdehnung', { size: 16 })) : null,
        costChips(api, o.kosten),
        o.probe ? el('span', { class: 'probe-tag', 'aria-label': `Probe W10 gegen ${o.probe.ziel}, Modifikator ${signed(sum)}${o.probe.chance != null ? `, ${o.probe.chance} Prozent` : ''}` }, icon('wuerfel', { size: 15 }), `${o.probe.ziel}`, el('span', { class: 'probe-mod', text: signed(sum) })) : null),
      el('span', { class: 'bo-folge', text: o.folge }),
      o.ersetzt && !queued ? el('span', { class: 'bo-ersetzt' }, icon('praxis', { size: 14 }), `statt ${o.ersetzt.titel}${o.ersetzt.ziel ? `, ${o.ersetzt.ziel}` : ''}`) : null,
      queued ? el('span', { class: 'is-queued' }, icon('ja', { size: 14 }), 'In den Befehlen') : null,
      grund ? el('span', { class: 'bo-grund', text: grund }) : o.hinweis ? el('span', { class: 'bo-grund', text: o.hinweis }) : null);
      // A full slot offers the swap instead of an overflow: the option replaces the last order of that slot.
      const swap = o.ersatz && !locked && !queued ? el('button', {
        class: 'btn btn-klein bo-tausch',
        type: 'button',
        'data-ersetzen': opt.type,
        onclick: () => api.chooseOrder(o.ersatz, target, o.ersatz.probe?.modifikatoren ?? null),
        ...previewHandlers(api, o.ersatz, o.ersatz.preview, slot, o.ersatz.ersetzt?.id, () => true),
      }, icon('praxis', { size: 15 }), `Ersetzen: ${o.ersatz.ersetzt.titel}`) : null;
      const detail = [
        el('span', { class: 'tip-zeile' }, el('span', {}, icon(SLOT_ICON[slot], { size: 14 }), ` ${SLOT_NAME[slot]}`), el('span', { text: slot in used ? `${used[slot]} von ${max[slot]} vergeben` : slot === 'forschung' ? 'eine Wahl je Saison' : 'ohne Aktion' })),
        over ? el('span', { class: 'tip-zeile' }, el('span', {}, icon('ueberdehnung', { size: 14 }), ' Überdehnung'), el('span', { class: 'down', text: '−1 auf Proben' })) : null,
        ...(o.probe ? [
          el('span', { class: 'tip-zeile' }, el('span', { text: 'Zielwert' }), el('span', { text: String(o.probe.ziel) })),
          ...mods.map((m) => el('span', { class: 'tip-zeile' }, el('span', { text: m.grund }), el('span', { class: m.wert > 0 ? 'up' : 'down', text: signed(m.wert) }))),
          o.probe.chance != null ? el('span', { class: 'tip-zeile' }, el('span', { text: 'Erfolg' }), el('span', { text: `${o.probe.chance} %` })) : null,
        ] : []),
        ...Object.entries(pv?.deltas ?? {}).map(([k, d]) => el('span', { class: 'tip-zeile' }, el('span', { text: `${api.resourceName(k)} zum Saisonende` }), el('span', { class: d > 0 ? 'up' : 'down', text: signed(d) }))),
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
  const label = (k) => (k === 'research' ? game.t('ui.forschung', 'Forschung') : game.t(`resource.${k}`, k));
  const step = (k, d) => ({ ...assign, [k]: Math.max(0, (assign[k] ?? 0) + d) });
  const hover = (k, d) => {
    const next = step(k, d);
    api.setPreview({ deltas: game.deltasWith((dr) => ({ ...dr, assign: next })), tiles: [] });
  };
  const btn = (k, d, disabled, name) => el('button', {
    class: 'icon-btn', type: 'button', 'aria-label': `${name} ${d > 0 ? 'mehr' : 'weniger'}`, 'aria-disabled': disabled ? 'true' : 'false',
    onclick: () => { if (!disabled) { api.setPreview(null); game.setAssign(step(k, d)); } },
    onpointerenter: () => { if (!disabled) hover(k, d); },
    onpointerleave: () => api.setPreview(null),
    onfocus: () => { if (!disabled) hover(k, d); },
    onblur: () => api.setPreview(null),
  }, icon(d > 0 ? 'plus' : 'minus', { size: 15 }));
  return el('section', { 'aria-labelledby': 'arbeit-h', class: 'befehle-sektion arbeit' },
    el('h3', { id: 'arbeit-h', text: `${game.t('population.core', 'Sippen')} ${total} von ${core}` }),
    el('ul', { class: 'arbeit-liste plain' }, ...keys.map((k) => el('li', { class: 'arbeit-zeile', 'data-arbeit': k },
      icon(k === 'research' ? 'wissen' : k, { size: 17 }),
      el('span', { class: 'arbeit-name', text: label(k) }),
      btn(k, -1, locked || !(assign[k] > 0), label(k)),
      el('span', { class: 'num arbeit-zahl', text: String(assign[k] ?? 0) }),
      btn(k, 1, locked || total >= core, label(k))))));
}

function onTile(api, q, r, exclude) {
  const { units, places } = objectsAt(api.model, q, r);
  const items = [...units.filter((u) => u.id !== exclude), ...places.filter((p) => p.id !== exclude)];
  if (!items.length) return null;
  return el('ul', { class: 'liste-objekte plain', 'aria-label': 'Auf diesem Feld' }, ...items.map((o) => el('li', {},
    el('button', { class: 'objekt-btn', type: 'button', onclick: () => api.select(o.art in UNIT_ART ? { kind: 'unit', id: o.id, q, r } : { kind: 'place', id: o.id, q, r }) },
      icon(o.art, { size: 18 }), o.name, el('span', { class: 'meta', text: UNIT_ART[o.art] ?? PLACE_ART[o.art] })))));
}

// Orders that decide who controls a region; the province shows them under "Herrschaft", not among the tile's orders.
const CONTROL_ORDERS = new Set(['found', 'attack']);

/**
 * Province panel: owner, dominant terrain, yield of the known deposits,
 * settlements and features, the selected tile with its orders, and how the
 * region can be won, as far as the kernel offers an order for it.
 */
function province(api, regionId, tileKey) {
  const { model, game } = api;
  const close = () => api.select(null);
  const info = regionInfo(model.world, regionId);
  const dom = model.terrains.get(info?.dominantTerrain);
  const owners = api.view.ownership();
  const known = Object.keys(model.known).filter((k) => { const [q, r] = k.split(',').map(Number); return tileInfo(model, q, r).regionId === regionId; });
  const owner = known.map((k) => owners.get(k)).find(Boolean) ?? null;
  const ownerName = owner ? peopleName(model, owner) : game?.t('ui.ohne-herrschaft', 'Ohne Herrschaft') ?? 'Ohne Herrschaft';
  const inRegion = (o) => known.includes(`${o.q},${o.r}`);
  const settlements = [...model.units.filter((u) => u.art === 'lager'), ...model.places.filter((p) => p.art === 'siedlung')].filter(inRegion);
  const features = model.places.filter((p) => p.art !== 'siedlung' && inRegion(p));

  // Yield potential: deposits of the known tiles turned into resources by the world's featureYield rule.
  const yields = new Map();
  for (const k of known) {
    const [q, r] = k.split(',').map(Number);
    for (const d of tileInfo(model, q, r).tile.resources ?? []) {
      const y = game ? tune(game.env, 'featureYield', d.key) : { res: d.key, amount: d.amount };
      if (y?.res) yields.set(y.res, (yields.get(y.res) ?? 0) + y.amount);
    }
  }
  const t = (k, f) => game?.t(k, f) ?? f;
  const kopf = header(regionName(model, regionId), `${t('ui.provinz', 'Provinz')}, ${ownerName}`, icon('besitz', { size: 22 }), owner ?? '', close);
  const body = [];
  body.push(facts(
    fact(owner ? 'besitz' : 'ort', ownerName, t('ui.herrschaft', 'Herrschaft'), null, owner && owner !== 'spieler' ? { onclick: () => api.select({ kind: 'people', id: owner, q: info?.centre.q, r: info?.centre.r }), cls: 'is-link' } : {}),
    fact('gelaende', dom?.name ?? '', 'Vorherrschendes Gelände', null),
    ...[...yields].map(([res, n]) => fact(res, String(n), `${t('ui.ertragspotenzial', 'Vorkommen')}: ${api.resourceName(res)}`, [el('span', { text: 'Ertrag, solange die Provinz bewirtschaftet und beherrscht wird' })])),
  ));

  if (tileKey) {
    const [q, r] = tileKey.split(',').map(Number);
    const { def, regionName: rn } = tileInfo(model, q, r);
    const target = { kind: 'tile', id: tileKey, name: `${def?.name ?? 'Feld'} bei ${rn}`, q, r };
    const field = el('section', { class: 'provinz-feld', 'aria-labelledby': 'feld-h' },
      el('h3', { id: 'feld-h', class: 'mit-symbol' }, icon('feld', { size: 16 }), `${t('ui.feld', 'Feld')}, ${def?.name ?? ''}`),
      terrainFacts(api, q, r, { region: false }),
      deposits(api, q, r),
      def && !def.water && typeof def.moveCost === 'number'
        ? orderOptions(api, 'feld', target, game ? { given: realOptions(api, target).filter((o) => !CONTROL_ORDERS.has(o.opt.type)) } : {})
        : null);
    body.push(field);
  }

  const places = [...settlements, ...features];
  if (places.length) {
    body.push(el('ul', { class: 'liste-objekte plain', 'aria-label': 'Siedlungen und Merkmale der Provinz' }, ...places.map((p) => el('li', {},
      el('button', { class: 'objekt-btn', type: 'button', onclick: () => api.select(p.art === 'lager' ? { kind: 'unit', id: p.id, q: p.q, r: p.r } : { kind: 'place', id: p.id, q: p.q, r: p.r }, { fly: true }) },
        icon(p.art, { size: 18 }), p.name, el('span', { class: 'meta', text: UNIT_ART[p.art] ?? PLACE_ART[p.art] ?? '' }))))));
  }

  if (game && owner !== 'spieler') {
    const list = controlOptions(api, regionId, tileKey, owner, settlements);
    if (list.length) body.push(orderOptions(api, null, tileKey ? { kind: 'tile', id: tileKey } : {}, { given: list, titel: `${t('ui.herrschaft', 'Herrschaft')} gewinnen`, hid: 'herrschaft-h' }));
  }
  return { kopf, body };
}

/**
 * Orders the kernel offers to win this region: founding a settlement on the
 * selected tile, attacking the owner's settlement with the own units, or
 * moving a unit in, since a people standing alone in an empty, unsettled
 * region takes it at season end. Types the catalogue marks unavailable stay out.
 */
function controlOptions(api, regionId, tileKey, owner, settlements) {
  const { game } = api;
  const available = new Set((game.base.catalogue ?? []).filter((c) => c.available).map((c) => c.type));
  const units = game.view.peoples[game.pid].units ?? [];
  const cands = [];
  if (tileKey && available.has('found') && !owner) cands.push({ type: 'found', params: { tile: tileKey } });
  if (owner && available.has('attack') && units.length) {
    const s = settlements.find((x) => x.volk === owner);
    const tile = s ? `${s.q},${s.r}` : tileKey;
    if (tile) cands.push({ type: 'attack', params: { units: units.map((u) => u.id), tile } });
  }
  if (!owner && !settlements.length && tileKey && available.has('move') && units.length) cands.push({ type: 'move', params: { unit: units[0].id, tile: tileKey } });
  return cands.map((c) => game.previewOption(c)).map((opt) => ({
    opt, titel: opt.titel, art: opt.art, kosten: opt.kosten, folge: opt.folge, queued: opt.queued, over: false,
    mods: opt.probe ? opt.probe.modifikatoren : null,
    probe: opt.probe ? { ziel: opt.probe.ziel, chance: opt.probe.chance } : null,
    grund: opt.grund, hinweis: null, preview: opt.preview, ersetzt: opt.ersetzt, ersatz: opt.ersatz,
  }));
}

function strengthPips(n) {
  return el('span', { class: 'staerke', 'aria-hidden': 'true' }, ...Array.from({ length: 5 }, (_, i) => el('span', { class: i < n ? 'on' : '' })));
}

export function renderKontext(api) {
  const { model } = api;
  const panel = document.getElementById('kontext');
  const sel = model.selection;
  if (!sel || model.panel !== 'kontext') {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const close = () => api.select(null);
  let kopf;
  const body = [];
  if (sel.kind === 'unit') {
    const u = model.units.find((x) => x.id === sel.id);
    const own = u.volk === 'spieler';
    kopf = header(u.name, own ? UNIT_ART[u.art] : `${UNIT_ART[u.art]}, ${peopleName(model, u.volk)}`, icon(u.art, { size: 22 }), u.volk, close);
    body.push(facts(
      withTip(el('button', { class: 'fakt', type: 'button', 'aria-label': `Stärke ${u.staerke} von 5` }, icon('schild', { size: 17 }), strengthPips(u.staerke)), [el('strong', { text: `Stärke ${u.staerke}` })], null),
      fact('praxis', u.zustand, 'Zustand', null, { cls: 'is-text' }),
      own ? null : fact(u.volk === 'schaedelklan' ? 'raeuber' : 'haendler', peopleName(model, u.volk), 'Volk', null, { onclick: () => api.select({ kind: 'people', id: u.volk, q: u.q, r: u.r }), cls: 'is-link' }),
    ));
    body.push(orderOptions(api, own ? u.art : u.volk === 'talbund' ? ['handel', 'fremd'] : 'fremd', { kind: 'unit', id: u.id, name: u.name, q: u.q, r: u.r }));
    if (model.real && own && u.objekt === 'settlement') body.push(labour(api));
    body.push(terrainFacts(api, u.q, u.r));
    body.push(onTile(api, u.q, u.r, u.id));
  } else if (sel.kind === 'place') {
    const p = model.places.find((x) => x.id === sel.id);
    kopf = header(p.name, `${PLACE_ART[p.art] ?? ''}${p.volk && p.volk !== 'spieler' ? `, ${peopleName(model, p.volk)}` : ''}`, icon(p.art, { size: 22 }), p.volk, close);
    body.push(el('p', { class: 'beschreibung', text: p.beschreibung }));
    body.push(orderOptions(api, 'ort', { kind: 'place', id: p.id, name: p.name, q: p.q, r: p.r }));
    if (model.real && p.volk === 'spieler' && p.objekt === 'settlement') body.push(labour(api));
    body.push(terrainFacts(api, p.q, p.r));
    body.push(deposits(api, p.q, p.r));
    body.push(onTile(api, p.q, p.r, p.id));
  } else if (sel.kind === 'region') {
    const p = province(api, sel.id, sel.q !== undefined ? `${sel.q},${sel.r}` : null);
    kopf = p.kopf;
    body.push(...p.body);
  } else if (sel.kind === 'people') {
    const riv = model.rivalen.find((x) => x.id === sel.id);
    kopf = header(riv.name, riv.anfuehrer ? `${riv.anfuehrer.name}, ${riv.anfuehrer.rolle}` : riv.haltung, portrait(riv.anfuehrer?.id, riv.anfuehrer?.name ?? riv.name, { size: 44 }), `${riv.id} mit-portraet`, close);
    body.push(el('p', { class: 'beschreibung', text: riv.beschreibung }));
    body.push(facts(
      fact(riv.haltung === 'feindlich' ? 'warnung' : 'angebot', riv.haltung, 'Haltung', null, { cls: riv.haltung === 'feindlich' ? 'is-gefahr' : 'is-wasser' }),
      fact('bestimmung', riv.bestimmung.name ?? 'unbekannt', 'Bestimmung', null, { onclick: () => api.openDialog('bestimmung'), cls: 'is-link' }),
    ));
    const units = model.units.filter((u) => u.volk === riv.id && model.known[`${u.q},${u.r}`]);
    body.push(el('ul', { class: 'liste-objekte plain', 'aria-label': 'Gesichtete Scharen' }, ...units.map((u) => el('li', {},
      el('button', { class: 'objekt-btn', type: 'button', onclick: () => api.select({ kind: 'unit', id: u.id, q: u.q, r: u.r }, { fly: true }) }, icon(u.art, { size: 18 }), u.name)))));
    body.push(orderOptions(api, riv.id === 'talbund' ? ['handel', 'fremd'] : 'fremd', { kind: 'people', id: riv.id, name: riv.name }));
  } else {
    // An empty tile opens its province, with the tile and its orders as one section of it.
    const { regionId } = tileInfo(model, sel.q, sel.r);
    const p = province(api, regionId, `${sel.q},${sel.r}`);
    kopf = p.kopf;
    body.push(...p.body);
  }
  panel.replaceChildren(kopf, el('div', { class: 'panel-body' }, ...body.filter(Boolean)));
}

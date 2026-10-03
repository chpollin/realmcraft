// Runtime model of the prototype: the world from the world module plus the
// fixture state, with absolute hex positions. A tiny publish/subscribe store;
// the real rules kernel replaces the fixture side later, the world side stays.

import { createWorld, findStart, tileAt, regionInfo, reveal, spiral, key, distance, findPath, moveCost } from '/engine/world/index.js';
import { SPIELSTAND } from './mock/spielstand.js';

export const PACK_URL = '/welten/hochland/welt.json';

/** @typedef {{q:number, r:number}} Hex */

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit(topic, detail) {
  for (const fn of listeners) fn(topic, detail);
}

function passable(world, h) {
  const t = tileAt(world, h.q, h.r);
  const def = world.pack.terrains.find((d) => d.id === t.terrain);
  return def && !def.water && typeof def.moveCost === 'number';
}

/**
 * Fixture positions are offsets from the camp. The generated terrain under an
 * offset can be a lake or a glacier, so each object snaps to the nearest free
 * passable tile. Prototype shortcut: the kernel will place objects itself.
 */
function placeOffset(world, start, off, taken) {
  const target = { q: start.q + off.dq, r: start.r + off.dr };
  for (const h of spiral(target, 4)) {
    if (taken.has(key(h.q, h.r))) continue;
    if (!passable(world, h)) continue;
    taken.add(key(h.q, h.r));
    return h;
  }
  return target;
}

export async function createModel({ seed = 'graue-kaemme-7' } = {}) {
  const pack = await (await fetch(PACK_URL)).json();
  const world = createWorld({ seed, pack });
  const startTile = findStart(world) ?? tileAt(world, 0, 0);
  const start = { q: startTile.q, r: startTile.r };
  const S = structuredClone(SPIELSTAND);
  const taken = new Set([key(start.q, start.r)]);

  const units = S.einheiten.map((u) => {
    const h = u.pos.dq === 0 && u.pos.dr === 0 ? start : placeOffset(world, start, u.pos, taken);
    return { ...u, q: h.q, r: h.r };
  });
  const places = S.orte.map((o) => {
    const h = placeOffset(world, start, o.pos, taken);
    return { ...o, q: h.q, r: h.r };
  });

  let known = {};
  const sight = { lager: 4, spaeher: 3, krieger: 2, herde: 2 };
  for (const u of units.filter((x) => x.volk === 'spieler')) known = reveal(known, u, sight[u.art] ?? 2, world);
  // The fixture claims these are known; make sure the map agrees.
  for (const o of [...places, ...units.filter((x) => x.volk !== 'spieler')]) {
    for (const h of spiral(o, 1)) if (!known[key(h.q, h.r)]) known[key(h.q, h.r)] = 'seen';
    known[key(o.q, o.r)] = 'visible';
  }

  // Roads and paths follow the cheapest route over the terrain; trade routes
  // then prefer road tiles, so caravans visibly travel the roads.
  const byId = (id) => units.find((u) => u.id === id) ?? places.find((p) => p.id === id);
  const roads = [];
  const roadTiles = new Set();
  for (const w of S.wege ?? []) {
    const a = byId(w.von);
    const b = byId(w.nach);
    const found = a && b ? findPath(world, a, b) : null;
    if (!found) continue;
    roads.push({ ...w, path: found.path });
    for (const h of found.path) roadTiles.add(key(h.q, h.r));
  }
  const viaRoads = (tile) => {
    if (roadTiles.has(key(tile.q, tile.r))) return 0.25;
    return moveCost(pack, tile.terrain);
  };
  const tradeRoutes = [];
  for (const h of S.handel ?? []) {
    const a = byId(h.von);
    const b = byId(h.nach);
    const found = a && b ? findPath(world, a, b, { costOf: viaRoads, minCost: 0.25 }) : null;
    if (found) tradeRoutes.push({ ...h, path: found.path });
  }

  const terrains = new Map(pack.terrains.map((t) => [t.id, t]));
  const resourceDefs = new Map(pack.resources.map((r) => [r.key, r]));

  // Prototype shortcut: the camp's region carries the fixture's name, so map
  // and chronicle agree. With the kernel the name comes from the world itself.
  const regionNames = new Map([[tileAt(world, start.q, start.r).regionId, 'Grauhang']]);

  return {
    world,
    pack,
    start,
    terrains,
    resourceDefs,
    S,
    regionNames,
    volk: S.volk,
    zeit: { ...S.zeit },
    ressourcen: S.ressourcen.map((r) => ({ ...r })),
    module: S.modulRessourcen.filter((r) => r.aktiv).map((r) => ({ ...r })),
    roads,
    roadTiles,
    tradeRoutes,
    preview: null,
    units,
    places,
    known,
    selection: null,
    hover: null,
    layer: 'gelaende',
    orders: S.befehle.map((b) => ({ ...b, art: b.art })),
    meldungen: S.meldungen.map((m) => ({ ...m })),
    rat: S.rat.map((a) => ({ ...a })),
    ratsfrage: S.ratsfrage,
    ratBeschluss: null,
    bestimmung: structuredClone(S.bestimmung),
    rivalen: S.rivalen,
    entwicklungen: structuredClone(S.entwicklungen),
    chronik: S.chronik.slice(),
    phase: 'planung',
    zugGelaufen: false,
    winter: false,
    highlights: [],
    frostRegions: new Set(),
    moves: [],
  };
}

export function absPos(model, off) {
  return { q: model.start.q + off.dq, r: model.start.r + off.dr };
}

export function tileInfo(model, q, r) {
  const t = tileAt(model.world, q, r);
  const def = model.terrains.get(t.terrain);
  return { tile: t, def, regionName: regionName(model, t.regionId), regionId: t.regionId };
}

export function regionName(model, id) {
  return model.regionNames.get(id) ?? regionInfo(model.world, id)?.name ?? '';
}

export function objectsAt(model, q, r) {
  return {
    units: model.units.filter((u) => u.q === q && u.r === r),
    places: model.places.filter((p) => p.q === q && p.r === r),
  };
}

export function peopleName(model, id) {
  if (id === 'spieler') return model.volk.name;
  return model.rivalen.find((r) => r.id === id)?.name ?? id;
}

export function resourceByKey(model, k) {
  return model.ressourcen.find((r) => r.key === k) ?? model.module.find((r) => r.key === k);
}

export { tileAt, key, distance, reveal, spiral };

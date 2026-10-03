// Fog of war. `known` maps tile keys to 'visible' (in sight now) or 'seen'
// (seen before, possibly changed since). reveal() and fade() never mutate their
// input; they return a new object, so callers can keep the previous state for
// diffs or undo.

import { key, spiral, line } from './hex.js';
import { tileAt } from './generate.js';
import { terrainDef } from './pack.js';

/**
 * Marks every tile within `radius` of `centre` as 'visible'.
 * Without `world` the radius is a plain hex disc. With `world` the terrain
 * counts: the observer's tile adds its sightModifier to the radius, and a
 * tile whose terrain blocks sight hides what lies behind it, unless the
 * observer stands on blocking terrain at least as high (looking over a ridge).
 * Tiles are read through tileAt, so revealing generates the chunks it touches.
 */
export function reveal(known, centre, radius, world) {
  const out = { ...known };
  if (!world) {
    for (const h of spiral(centre, Math.max(0, radius))) out[key(h.q, h.r)] = 'visible';
    return out;
  }
  const pack = world.pack;
  const here = tileAt(world, centre.q, centre.r);
  const hereDef = terrainDef(pack, here.terrain);
  const sight = Math.max(0, radius + (hereDef.sightModifier ?? 0));
  const onHigh = hereDef.blocksSight === true;
  for (const h of spiral(centre, sight)) {
    const path = line(centre, h);
    let clear = true;
    // Ends excluded: the observer's own tile never blocks, and a blocking
    // target is itself visible (one sees the mountain face, not beyond).
    for (let i = 1; i < path.length - 1; i++) {
      const t = tileAt(world, path[i].q, path[i].r);
      if (terrainDef(pack, t.terrain).blocksSight && !(onHigh && t.elevation <= here.elevation)) {
        clear = false;
        break;
      }
    }
    if (clear) out[key(h.q, h.r)] = 'visible';
  }
  return out;
}

/** New object with every 'visible' tile turned 'seen'; call before re-revealing a turn. */
export function fade(known) {
  const out = {};
  for (const k of Object.keys(known)) out[k] = 'seen';
  return out;
}

export function isKnown(known, q, r) {
  return Object.prototype.hasOwnProperty.call(known, key(q, r));
}

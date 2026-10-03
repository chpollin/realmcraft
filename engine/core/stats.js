// Lagewerte (stats) of a people: regeln base plus stat.mod, clamped to -2..3.
// A leaf module so rules code (military, bestimmung) can read stats without
// importing derive.js, which depends on the module registry.

import { clamp } from './state.js';
import { ofOp, standingOf } from './effects.js';

export function statsOf(state, env, pid, standing = standingOf(state, env, pid)) {
  const mods = ofOp(standing, 'stat.mod');
  return Object.fromEntries(env.regeln.stats.map((s) => [
    s.id,
    clamp(s.base + mods.reduce((n, m) => (m.effect.stat === s.id ? n + m.effect.amount : n), 0), -2, 3),
  ]));
}

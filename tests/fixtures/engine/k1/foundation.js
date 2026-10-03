// Shared builders for the foundation tests (rng, calendar, probes, conditions,
// effects, orders, log, map): a fresh campaign in planning, a mutation
// context, a condition context and a tile search over the generated world.

import { createCampaign, open, emptyDraft } from '../../../../engine/core/turn.js';
import { createContext } from '../../../../engine/core/log.js';
import { calendarOf } from '../../../../engine/core/calendar.js';
import { key, tileAt, neighbors } from '../../../../engine/world/index.js';
import { testEnv } from './pack.js';

export const PLAYER = 'hochweide';

/** Opened campaign (phase planning, turn 0) over the test package. */
export function freshState(seed = 7, patch = {}) {
  const env = testEnv(patch);
  const created = createCampaign(env, { id: 'test-1', seed });
  const opened = open(created.state, env);
  if (!opened.ok) throw new Error(`open failed: ${JSON.stringify(opened.issues)}`);
  return { env, state: opened.state };
}

export const clone = (v) => structuredClone(v);

/** Mutation context over a state; `step` is fixed so visibility entries are predictable. */
export function ctxOf(state, env, step = 'orders') {
  const tc = createContext(state, env);
  tc.step = step;
  return tc;
}

/** Condition context for one people over a state. */
export function cxOf(state, env, pid = PLAYER, extra = {}) {
  return { state, env, pid, cal: calendarOf(env.regeln, state.turn), world: env.world(state.map.seed), ...extra };
}

/** First tile of a terrain found on rings around `from` ("q,r"), or null. */
export function findTerrain(world, terrain, from = '0,0', maxRadius = 30) {
  const [q0, r0] = from.split(',').map(Number);
  const seen = new Set([key(q0, r0)]);
  let frontier = [{ q: q0, r: r0 }];
  for (let ring = 0; ring <= maxRadius; ring++) {
    for (const h of frontier) if (tileAt(world, h.q, h.r).terrain === terrain) return key(h.q, h.r);
    const next = [];
    for (const h of frontier) {
      for (const n of neighbors(h.q, h.r)) {
        const k = key(n.q, n.r);
        if (!seen.has(k)) { seen.add(k); next.push(n); }
      }
    }
    frontier = next;
  }
  return null;
}

export const roadFeature = (id, level = 1, since = 0) => ({
  id, kind: 'weg', name: 'Weg', tags: level > 1 ? ['weg', `stufe-${level}`] : ['weg'], resources: [], since, source: 'kernel',
});

/** Draft with the player's defaults: no orders, current turn and revision. */
export const draftOf = (state, pid = PLAYER, patch = {}) => ({ ...emptyDraft(state, pid), ...patch });

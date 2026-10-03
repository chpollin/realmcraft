// Shared set-up of the council and events tests: an opened campaign over the
// test package, cloned and edited per test, and a context with the scratch
// slots apply() fills.

import { CONTENT, REGELN, testEnv } from './pack.js';
import { createCampaign, open } from '../../../../engine/core/turn.js';
import { createContext } from '../../../../engine/core/log.js';
import { orderContext } from '../../../../engine/core/orders.js';
import { buildProbe, resolveProbe } from '../../../../engine/core/probes.js';

const SHARED = testEnv();
const BASE = open(createCampaign(SHARED, { id: 'test-1', seed: 7 }).state, SHARED).state;

export const PLAYER = 'hochweide';

/**
 * { env, state }: a fresh clone of the opened campaign, edited by `edit(state)`.
 * opts.tuning extends regeln.tuning, opts.ereignisse replaces the event cards.
 */
export function world(edit, { tuning = null, ereignisse = null } = {}) {
  const env = tuning || ereignisse
    ? testEnv({
      regeln: { tuning: { ...REGELN.tuning, ...tuning } },
      content: { ...CONTENT, ereignisse: ereignisse ?? CONTENT.ereignisse },
    })
    : SHARED;
  const state = structuredClone(BASE);
  edit?.(state);
  return { env, state };
}

/** Context over the state with the scratch maps apply() prepares. */
export function context(state, env) {
  const tc = createContext(state, env);
  Object.assign(tc.scratch, { executed: {}, overrides: {}, choices: {}, setback: {} });
  return tc;
}

export const oxOf = (state, env, pid = PLAYER) => orderContext(state, env, pid);

export const member = (state, id, pid = PLAYER) => state.peoples[pid].council.find((m) => m.id === id);

/** A resolved Machtprobe-like outcome: target 8 allows every band with a non-natural roll. */
export function outcome(target, roll, modifiers = []) {
  const probe = resolveProbe(buildProbe({ id: 'T0:hochweide:m1', people: PLAYER, order: 'm1', kind: 'machtprobe', tags: ['macht'], roller: 'player', target, modifiers }), roll);
  return { band: probe.band, margin: probe.margin, success: probe.band !== null && ['narrow', 'success', 'crit_success'].includes(probe.band), natural: probe.natural, probe };
}

export function entries(tc, kind) {
  return tc.log.filter((e) => e.kind === kind);
}

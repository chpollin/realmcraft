// Scenario helpers for the military tests (core-military, module-militaer).

import assert from 'node:assert/strict';
import { REGELN, testEnv } from './pack.js';
import { createCampaign, open, preview, seal, apply, emptyDraft } from '../../../../engine/core/turn.js';
import { createContext } from '../../../../engine/core/log.js';
import { orderContext } from '../../../../engine/core/orders.js';
import { resolveProbe } from '../../../../engine/core/probes.js';
import { peopleIds, clone } from '../../../../engine/core/state.js';

export const STRENGTH = { 'speerwall@1': 3, 'reiterschar@1': 2 };

/** Test env with room for several orders per season. */
export function bigEnv() {
  return testEnv({ regeln: { tuning: { ...REGELN.tuning, slots: { main: 3, minor: 6 } } } });
}

export const unit = (id, type, tile, extra = {}) => ({ id, type, strength: STRENGTH[type], tile, state: 'ready', since: 0, ...extra });

/**
 * Planning state at turn 0. The player (hochweide) camps on 0,1 and knows both
 * unit types; esk holds a village, glutreiter a camp, both far away. Tiles
 * next to the camp: 1,1 alm and 1,0 alm (region 0:-1:1, controlled by esk),
 * 0,0 gebirge, 0,2 alm and -1,2 alm (own region), -1,1 gebirge.
 */
export function scenario() {
  const env = bigEnv();
  const state = open(createCampaign(env, { id: 'mil', seed: 7 }).state, env).state;
  const p = state.peoples.hochweide;
  for (const ref of ['speerwall@1', 'reiterschar@1']) {
    p.developments.known.push({ ref, since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null });
  }
  p.modules.militaer = { recruited: 0 };
  // Without the Sippenrat no council vote stands between the player and an attack order.
  p.developments.instituted = [];
  return { env, state };
}

export const settlementAt = (state, pid) => state.map.settlements.find((s) => s.people === pid);

/** Status with standing effects, as the tests patch order.unlock or unit.mod into a people. */
export function addStatus(state, pid, id, effects) {
  state.peoples[pid].statuses.push({ id, effects, until: null, endsOn: null });
}

/** Unit-test context over a state: tc plus the order context of pid. */
export function ctx(state, env, pid = 'hochweide') {
  const tc = createContext(state, env);
  tc.step = 'orders';
  return { tc, ox: orderContext(state, env, pid) };
}

export const outcome = (band, margin, success = ['narrow', 'success', 'crit_success'].includes(band)) => ({
  band, margin, success, natural: null, probe: { id: 'T0:hochweide:o1' },
});

/** Roll value that gives `band` against `probe`. */
export function rollFor(probe, band) {
  for (let r = 1; r <= 10; r++) if (resolveProbe(probe, r).band === band) return r;
  throw new Error(`no roll gives ${band} against ${probe.id} (chance ${probe.chance})`);
}

/**
 * One full season of the player with `orders`; every other people sits idle.
 * bands: { orderId: band } picks the player's roll per order probe, others roll `roll`.
 */
export function play(state, env, orders = [], { bands = {}, roll = 5, probeOf = null } = {}) {
  const pid = state.campaign.player;
  const draft = { ...emptyDraft(state, pid), orders };
  const pv = preview(state, env, draft, { as: pid });
  assert.deepEqual(pv.issues.filter((i) => i.severity === 'error'), [], 'draft has errors');
  for (const p of pv.probes) {
    draft.rolls[p.id] = { value: bands[p.order] ? rollFor(p, bands[p.order]) : roll, fingerprint: p.fingerprint };
    if (probeOf && p.order) probeOf[p.order] = p;
  }
  const drafts = { [pid]: draft };
  for (const id of peopleIds(state)) if (id !== pid) drafts[id] = emptyDraft(state, id);
  const sealed = seal(state, env, drafts);
  assert.ok(sealed.ok, JSON.stringify(sealed.issues));
  const applied = apply(sealed.state, env, sealed.drafts);
  assert.ok(applied.ok, JSON.stringify(applied.issues));
  const opened = open(applied.state, env);
  assert.ok(opened.ok, JSON.stringify(opened.issues));
  return { applied: applied.state, state: opened.state, report: applied.report, events: applied.events };
}

/** Preview issues of one order draft (errors only). */
export function errorsOf(state, env, orders) {
  const pid = state.campaign.player;
  const pv = preview(state, env, { ...emptyDraft(state, pid), orders }, { as: pid });
  return pv.issues.filter((i) => i.severity === 'error');
}

export const cloneState = clone;

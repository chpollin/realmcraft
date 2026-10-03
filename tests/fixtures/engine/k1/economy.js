// Builders for the economy and derive tests: an opened campaign over the test
// package, small edits of one people and a context to run resolveEconomy in.
// Subject is hochweide: three clans in a camp on a meadow region, labour two
// clans on nahrung and one on material, wanderhirten and sippenrat known.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCampaign, open } from '../../../../engine/core/turn.js';
import { createContext } from '../../../../engine/core/log.js';
import { makeEnv } from '../../../../engine/core/env.js';
import { parseKey, spiral, tileAt } from '../../../../engine/world/index.js';
import { testEnv } from './pack.js';

export const PID = 'hochweide';
export const SEASONS = ['fruehling', 'sommer', 'herbst', 'winter'];

export function setup({ turn = 0, regeln, content } = {}) {
  const env = testEnv({ regeln, content });
  const { state } = createCampaign(env, { id: 'test-1', seed: 7 });
  const opened = structuredClone(open(state, env).state);
  opened.turn = turn;
  return { env, state: opened };
}

/** Context for one transition over the (edited) state; step economy. */
export function ctxOf(state, env) {
  const tc = createContext(state, env);
  tc.step = 'economy';
  return tc;
}

export const known = (ref, since = 0, extra = {}) => ({ ref, since, effectiveFrom: since, state: 'active', suspendedSince: null, ...extra });

export const status = (id, ...effects) => ({ id, effects, until: null, endsOn: null });

export const unit = (id, type = 'reiterschar@1', strength = 2) => ({ id, type, strength, tile: '0,1', state: 'ready', since: 0 });

/** Tiles within the deposit radius of every settlement lose their deposits; `put` sets some by tile key. */
export function setDeposits(env, state, put = {}) {
  const world = env.world(state.map.seed);
  for (const s of state.map.settlements) {
    for (const h of spiral(parseKey(s.tile), 4)) tileAt(world, h.q, h.r).resources = [];
  }
  for (const [k, resources] of Object.entries(put)) {
    const { q, r } = parseKey(k);
    tileAt(world, q, r).resources = resources;
  }
}

const REAL = fileURLToPath(new URL('../../../../welten/hochland/', import.meta.url));
const load = (f) => JSON.parse(readFileSync(REAL + f, 'utf8'));

/** The real Hochland package as an environment. */
export function realEnv() {
  return makeEnv({
    welt: load('welt.json'),
    regeln: load('regeln.json'),
    content: { entwicklungen: load('content/entwicklungen.json'), ereignisse: load('content/ereignisse.json'), bestimmungen: load('content/bestimmungen.json') },
  });
}

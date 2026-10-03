// Helpers for the research and bestimmung tests: extra content over the K1 test
// package, an environment with patched limits, and fresh states.

import assert from 'node:assert/strict';
import { CONTENT, REGELN, testEnv } from './pack.js';
import { createCampaign } from '../../../../engine/core/turn.js';
import { createContext } from '../../../../engine/core/log.js';

/** A schema-shaped Entwicklung with defaults; override per test. */
export const dev = (o) => ({
  format: 'realmcraft-entwicklung', version: 1, rev: 1, appearance: '', summary: 'Testentwicklung.',
  kind: 'technik', tier: 1, tags: ['handel'], spec: null,
  prerequisites: { all: [], any: [], if: null }, cost: { research: 4, resources: {} },
  effects: [], price: [], onAcquire: [], replaces: [],
  origin: { source: 'world', practiceTags: [], token: null, request: null, proposal: null },
  ...o,
});

const milestone = (id, predicate) => ({ id, text: `Meilenstein ${id}`, predicate });

/** A destiny whose milestones are all true for any living test people. */
export const trivialDestiny = (id, tags = ['weide']) => ({
  id, rev: 1, name: `Ziel ${id}`, summary: 'Alles ist schon erfüllt.', tags,
  milestones: [
    milestone('erstes', { pred: 'population.atLeast', value: 1 }),
    milestone('zweites', { pred: 'development.known', count: 1 }),
    milestone('drittes', { pred: 'holds', predicate: { pred: 'population.atLeast', value: 1 }, seasons: 1 }),
  ],
});

/**
 * Environment over the K1 test package with extra content and tuning.
 * opts: { developments, bestimmungen, limits, tuning }
 */
export function envWith({ developments = [], bestimmungen = [], limits = {}, tuning = {} } = {}) {
  return testEnv({
    regeln: { tuning: { ...REGELN.tuning, ...tuning, limits: { ...REGELN.tuning.limits, ...limits } } },
    content: {
      ...CONTENT,
      entwicklungen: [...CONTENT.entwicklungen, ...developments],
      bestimmungen: [...CONTENT.bestimmungen, ...bestimmungen],
    },
  });
}

/** Campaign at turn 0, phase agents, no candidates yet. */
export function fresh(env) {
  return structuredClone(createCampaign(env, { id: 'test-1', seed: 7 }).state);
}

export const knownEntry = (ref, over = {}) => ({ ref, since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null, ...over });

export function context(state, env, step = 'research') {
  const tc = createContext(state, env);
  tc.step = step;
  return tc;
}

export const logKinds = (tc) => tc.log.map((e) => e.kind);

/** Every top-level group of a people that changed between s0 and the working state has a log entry naming it. */
export function assertCovered(tc, pid) {
  const before = tc.s0.peoples[pid];
  const after = tc.state.peoples[pid];
  for (const group of Object.keys({ ...before, ...after })) {
    if (JSON.stringify(before[group]) === JSON.stringify(after[group])) continue;
    // Council members carry their own target id ("member"), their changes belong to the people's council.
    const covered = tc.log.some((e) => e.change && ((e.target.kind === 'people' && e.target.id === pid && (e.change.field === group || e.change.field.startsWith(`${group}.`)))
      || (e.target.kind === 'member' && group === 'council' && e.visibleTo.includes(pid))));
    assert.ok(covered, `no log entry covers people.${pid}.${group}`);
  }
}

// Progress of one turn's agent round (campaigns/<cid>/status.json), written by
// the harness so the board can show which agent is working and what the
// validator decided on each proposal. It is a view: nothing reads it back
// into the state.

import { AGENTS, COMMON_DEFS, JUDGES, MAX_TIER, PHASES, arr, bundle, int, nullable, obj, ref, text } from './common.js';
import { ITEM_TYPES } from './proposal.js';

export const STATUS_DEFS = Object.freeze({
  steps: arr(obj({
    id: ref('id'),
    agent: { enum: ['kernel', ...AGENTS] },
    state: { enum: ['waiting', 'running', 'done', 'failed'] },
    startedAt: nullable(ref('isoTime')),
    endedAt: nullable(ref('isoTime')),
    summary: text(400),
    proposals: arr(obj({
      proposalId: ref('proposalId'),
      kind: { enum: [...ITEM_TYPES] },
      title: text(80, 1),
      verdict: { enum: ['accepted', 'rejected', 'pending'] },
      // Only items with a power budget (entwicklung, event) carry one.
      budget: nullable(obj({ effect: int(0, 99), price: int(-99, 0), net: int(-99, 99), tier: int(0, MAX_TIER) })),
      reason: nullable(text(400, 1)),
    }), 24),
    // Default absent: accepted findings of a judge that the player may see
    // (every entry they cite is visible to him), with the judge's severity.
    findings: arr(obj({
      id: ref('id'),
      judge: { enum: [...JUDGES] },
      severity: { enum: ['info', 'warn', 'severe'] },
      text: text(1000, 1),
      refs: arr(text(80, 1), 12),
    }), 24),
  }, ['findings']), 40),
  status: obj({
    format: { const: 'realmcraft-status' },
    version: { const: 1 },
    campaign: ref('id'),
    turn: ref('turn'),
    phase: { enum: [...PHASES] },
    steps: ref('steps'),
    // Default absent: the steps of the turn the last apply resolved (phase B
    // before it and the world step of phase A), kept until open.
    resolved: obj({ turn: ref('turn'), steps: ref('steps') }),
  }, ['resolved']),
});

export const status = bundle('status/1', STATUS_DEFS.status, COMMON_DEFS, STATUS_DEFS);

// Progress of one turn's agent round (campaigns/<cid>/status.json), written by
// the harness so the dashboard can show which agent is working and what the
// validator decided on each proposal. It is a view: nothing reads it back
// into the state.

import { AGENTS, COMMON_DEFS, MAX_TIER, PHASES, arr, bundle, int, nullable, obj, ref, text } from './common.js';
import { ITEM_TYPES } from './proposal.js';

export const STATUS_DEFS = Object.freeze({
  status: obj({
    format: { const: 'realmcraft-status' },
    version: { const: 1 },
    campaign: ref('id'),
    turn: ref('turn'),
    phase: { enum: [...PHASES] },
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
    }), 40),
  }),
});

export const status = bundle('status/1', STATUS_DEFS.status, COMMON_DEFS, STATUS_DEFS);

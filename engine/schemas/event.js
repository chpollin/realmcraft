// Event log entry: one structured change the round report and the chronicle
// carry. Narrative may cite an entry by id but never adds one, so every value
// a chronicle mentions traces back to an entry with source and reason.

import { COMMON_DEFS, arr, bundle, int, obj, ref, str, text } from './common.js';

export const EVENT_DEFS = Object.freeze({
  logEntry: obj({
    // "T6-e3": turn and sequence within the turn.
    id: str('^T(0|[1-9][0-9]*)-e(0|[1-9][0-9]*)$'),
    turn: ref('turn'),
    source: ref('source'),
    kind: str('^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)*$'),
    target: obj({
      kind: { enum: ['people', 'member', 'region', 'tile', 'settlement', 'unit', 'development', 'relation', 'campaign'] },
      id: text(80, 1),
    }),
    // before/after for state changes, delta for counted streams, null for pure notices.
    change: {
      oneOf: [
        { type: 'null' },
        obj({ field: text(80, 1), before: {}, after: {} }),
        obj({ field: text(80, 1), delta: int(-999, 999) }),
      ],
    },
    reason: text(200, 1),
    refs: arr(text(80, 1), 8),
  }),
});

export const event = bundle('event/1', EVENT_DEFS.logEntry, COMMON_DEFS, EVENT_DEFS);

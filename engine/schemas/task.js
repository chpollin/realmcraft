// Task (kernel to agent, agents/tasks/T<turn>/<agent>-<people>.json). A task
// with a people reference carries only that people's projection in `context`,
// so the agent sees what the people sees and nothing more. The context shape
// differs per agent and is produced by the kernel, so it stays an open object.

import { AGENTS, COMMON_DEFS, MAX_TIER, PATTERNS, arr, bundle, int, nullable, obj, ref, str, text } from './common.js';
import { ONCE_OPS, STANDING_OPS } from './effects.js';
import { ITEM_TYPES } from './proposal.js';

export const TASK_DEFS = Object.freeze({
  task: obj({
    format: { const: 'realmcraft-task' },
    version: { const: 1 },
    campaign: ref('id'),
    turn: ref('turn'),
    rev: int(0, 999999),
    agent: { enum: [...AGENTS] },
    people: nullable(ref('id')),
    // path is agents/proposals/<proposalId>.json; the validator checks that both name the same id.
    respondAs: obj({ proposalId: ref('proposalId'), path: str(`^agents/proposals/${PATTERNS.proposal.slice(1, -1)}\\.json$`) }),
    // Paths relative to the campaign folder.
    read: arr(str('^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,120}$'), 12),
    context: { type: 'object' },
    limits: obj({
      items: arr({ enum: [...ITEM_TYPES] }, ITEM_TYPES.length, 1),
      candidates: int(0, 6),
      aboveTier: int(0, 3),
      openPool: int(0, 12),
      moduleActivations: int(0, 3),
      allowedPrimitives: arr({ enum: [...STANDING_OPS, ...ONCE_OPS] }, STANDING_OPS.length + ONCE_OPS.length),
      tags: arr(ref('tag'), 200),
      budget: arr(obj({ tier: int(1, MAX_TIER), effectMax: int(1, 99), netMin: int(-99, 99), netMax: int(-99, 99), priceMax: int(-99, 0) }), MAX_TIER),
    }),
    note: text(1000),
  }, ['note']),
});

export const task = bundle('task/1', TASK_DEFS.task, COMMON_DEFS, TASK_DEFS);

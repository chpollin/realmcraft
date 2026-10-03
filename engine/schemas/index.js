// Data contracts of the engine. SCHEMA_VERSION moves when any contract changes
// incompatibly; each file format also carries its own `version`.

import { campaign } from './campaign.js';
import { entwicklung } from './entwicklung.js';
import { bestimmung } from './bestimmung.js';
import { event } from './event.js';
import { draft } from './draft.js';
import { proposal } from './proposal.js';
import { task } from './task.js';
import { status } from './status.js';
import { ereignis, regeln, labels, style, entwicklungen, ereignisse, bestimmungen } from './world.js';

export const SCHEMA_VERSION = 1;

export const SCHEMAS = Object.freeze({
  campaign,
  entwicklung,
  bestimmung,
  event,
  draft,
  proposal,
  task,
  status,
  ereignis,
  regeln,
  labels,
  style,
  entwicklungen,
  ereignisse,
  bestimmungen,
});

export { campaign, entwicklung, bestimmung, event, draft, proposal, task, status, ereignis, regeln, labels, style, entwicklungen, ereignisse, bestimmungen };
export { PATTERNS, AGENTS, KINDS, PHASES, LIFE_STAGES, MAX_TIER } from './common.js';
export { PRIMITIVES, STANDING_OPS, ONCE_OPS, WEIGHTS, SPEC_WEIGHTS, TIERS } from './effects.js';
export { ITEM_TYPES, ITEMS_BY_AGENT } from './proposal.js';
export { WELT_REQUIRED_KEYS } from './world.js';

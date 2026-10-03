// Data contracts of the engine. SCHEMA_VERSION moves when any contract changes
// incompatibly; each file format also carries its own `version`. Version 2 is
// the amendment recorded in knowledge/data-contracts.md (band ids, accent tokens,
// stricter proposal and order id patterns); no persisted campaign predates it,
// so the per-file versions stay 1.

import { campaign } from './campaign.js';
import { entwicklung } from './entwicklung.js';
import { bestimmung } from './bestimmung.js';
import { event } from './event.js';
import { draft } from './draft.js';
import { proposal } from './proposal.js';
import { task } from './task.js';
import { status } from './status.js';
import { report, view, campaignIndex } from './files.js';
import { ereignis, regeln, labels, style, entwicklungen, ereignisse, bestimmungen } from './world.js';

export const SCHEMA_VERSION = 2;

export const SCHEMAS = Object.freeze({
  campaign,
  entwicklung,
  bestimmung,
  event,
  draft,
  proposal,
  task,
  status,
  report,
  view,
  campaignIndex,
  ereignis,
  regeln,
  labels,
  style,
  entwicklungen,
  ereignisse,
  bestimmungen,
});

export { campaign, entwicklung, bestimmung, event, draft, proposal, task, status, report, view, campaignIndex, ereignis, regeln, labels, style, entwicklungen, ereignisse, bestimmungen };
export { PATTERNS, AGENTS, JUDGES, KINDS, PHASES, LIFE_STAGES, MAX_TIER, BANDS, SUCCESS_BANDS, TOKEN_KINDS, APPROVAL_METER } from './common.js';
export { PRIMITIVES, STANDING_OPS, ONCE_OPS, WEIGHTS, SPEC_WEIGHTS, TIERS } from './effects.js';
export { ITEM_TYPES, ITEMS_BY_AGENT } from './proposal.js';
export { WELT_REQUIRED_KEYS } from './world.js';

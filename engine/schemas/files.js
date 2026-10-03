// Campaign folder files the kernel writes besides state.json: the round report
// log/T<turn>.json, the projection view/<people>.json and the campaign list
// campaigns/index.json. All three are derived from the state and never read
// back into it, except that the tamper check compares hashAfter of the latest
// report with the hash of state.json.

import { COMMON_DEFS, PATTERNS, PHASES, arr, bundle, int, map, nullable, obj, ref, str } from './common.js';
import { EFFECT_DEFS } from './effects.js';
import { BESTIMMUNG_DEFS } from './bestimmung.js';
import { EVENT_DEFS } from './event.js';
import { CAMPAIGN_DEFS } from './campaign.js';

const DEFS = [COMMON_DEFS, EFFECT_DEFS, BESTIMMUNG_DEFS, EVENT_DEFS, CAMPAIGN_DEFS];

export const FILE_DEFS = Object.freeze({
  // Full record of one resolved turn. hashBefore and hashAfter are
  // stateHash() of the state before and after apply; revBefore and revAfter
  // its revisions. sections holds the kernel's report parts by name (orders,
  // probes with their full calculation, draws, substitutions, warnings, and
  // whatever modules add); their shape belongs to the kernel. events is the
  // complete event log of the turn, unfiltered.
  report: obj({
    format: { const: 'realmcraft-report' },
    version: { const: 1 },
    campaign: ref('id'),
    turn: ref('turn'),
    revBefore: int(0, 999999),
    revAfter: int(0, 999999),
    hashBefore: ref('hash'),
    hashAfter: ref('hash'),
    sections: map(str(PATTERNS.id), {}),
    events: arr(ref('logEntry'), 5000),
  }),
  // projectFor(state, people): the campaign state as this people may see it.
  // Left out entirely: rulesVersion, rng, eventPool, ingested (hidden or
  // meaningless to a people). Filtered: map.control to known regions,
  // map.settlements and foreign units to visible tiles, map.known to the own
  // key, map.features to known tiles, relations to own pairs, eventDraws and
  // pendingChoices to the own people, chronicle to entries whose visibleTo
  // names the people or "all", derived to the own people. The own people
  // keeps the full people shape, every other people the foreignPeople shape.
  view: obj({
    format: { const: 'realmcraft-view' },
    version: { const: 1 },
    people: ref('id'),
    campaign: ref('campaignRef'),
    rev: int(0, 999999),
    turn: ref('turn'),
    phase: { enum: [...PHASES] },
    status: { enum: ['playing', 'ended'] },
    result: nullable(ref('result')),
    map: ref('campaignMap'),
    peoples: map(str(PATTERNS.id), { oneOf: [ref('people'), ref('foreignPeople')] }),
    relations: ref('relations'),
    modules: map(str(PATTERNS.id), { type: 'object' }),
    eventDraws: map(str(PATTERNS.id), ref('eventDraw')),
    pendingChoices: arr(ref('pendingChoice'), 24),
    chronicle: arr(ref('logEntry'), 2000),
    // Default absent in views written before M1; the campaign's settings.
    settings: ref('settings'),
    derived: ref('derived'),
  }, ['settings']),
  // One row per campaign folder; status playing marks an active campaign.
  campaignIndex: obj({
    format: { const: 'realmcraft-campaigns' },
    version: { const: 1 },
    campaigns: arr(obj({
      id: ref('id'),
      world: ref('id'),
      player: ref('id'),
      turn: ref('turn'),
      status: { enum: ['playing', 'ended'] },
      updatedAt: ref('isoTime'),
    }), 200),
  }),
});

export const report = bundle('report/1', FILE_DEFS.report, ...DEFS, FILE_DEFS);
export const view = bundle('view/1', FILE_DEFS.view, ...DEFS, FILE_DEFS);
export const campaignIndex = bundle('campaign-index/1', FILE_DEFS.campaignIndex, ...DEFS, FILE_DEFS);

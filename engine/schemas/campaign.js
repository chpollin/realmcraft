// Campaign state (state.json), written only by the kernel. It holds references
// to world content and the mutable part of the map; generated tiles are a pure
// function of map.seed and the pinned pack and are never stored here.
//
// Every people, player-led or agent-led, has exactly the same shape; only
// `controller` (and the profile it implies) differs. Invariants a schema
// cannot express (refs exist in the library, one leader per council, tile keys
// match their regionId, resource keys exist in regeln.json) belong to the
// content validator.

import { COMMON_DEFS, LIFE_STAGES, PATTERNS, PHASES, arr, bundle, int, map, nullable, obj, ref, str, text } from './common.js';
import { EFFECT_DEFS } from './effects.js';
import { BESTIMMUNG_DEFS } from './bestimmung.js';
import { EVENT_DEFS } from './event.js';

const peopleKey = str(PATTERNS.id);

const member = obj({
  id: ref('id'),
  name: text(60, 2),
  role: ref('id'),
  goal: obj({ text: text(200, 1), favor: arr(ref('tag'), 4), oppose: arr(ref('tag'), 4) }),
  loyalty: int(-5, 5),
  // Loyalty bought by fear or bribe: reads high, breaks on a stronger offer.
  hollow: { type: 'boolean' },
  age: int(12, 120),
  lifeStage: { enum: [...LIFE_STAGES] },
  leader: { type: 'boolean' },
  appearance: text(200),
});

// Wesensart: a +2 tag bound to a -2 tag, the same for every people.
const identity = obj({
  wesensart: obj({
    plus: obj({ tag: ref('tag'), text: text(200, 1) }),
    minus: obj({ tag: ref('tag'), text: text(200, 1) }),
  }),
  ausrichtung: ref('id'),
  appearance: text(300),
});

const unit = obj({
  id: ref('id'),
  type: ref('ref'),
  strength: int(0, 9),
  tile: ref('tile'),
  state: { enum: ['ready', 'moved', 'routed'] },
  since: ref('turn'),
});

const people = obj({
  id: ref('id'),
  name: text(80, 2),
  controller: { enum: ['player', 'ai'] },
  agentProfile: nullable(ref('id')),
  identity: ref('identity'),
  lebensweise: ref('ref'),
  // core counts clans (Sippen) as the game unit, growth the points towards the next one.
  population: obj({ core: int(0, 99), growth: int(0, 3) }),
  resources: map(str(PATTERNS.key), int(0, 999)),
  standing: int(0, 3),
  developments: obj({
    known: arr(obj({
      ref: ref('ref'),
      since: ref('turn'),
      effectiveFrom: ref('turn'),
      state: { enum: ['active', 'suspended'] },
      suspendedSince: nullable(ref('turn')),
    }), 200),
    research: arr(obj({ ref: ref('ref'), progress: int(0, 99) }), 3),
    candidates: arr(obj({
      ref: ref('ref'),
      offeredAt: ref('turn'),
      expiresAt: ref('turn'),
      origin: { enum: ['pool', 'agent', 'breakthrough'] },
    }), 6),
    requests: arr(obj({ turn: ref('turn'), tags: arr(ref('tag'), 3, 1), note: text(200) }), 8),
    instituted: arr(ref('ref'), 20),
  }),
  units: arr(unit, 40),
  council: arr(member, 9),
  // Ring buffer of the last eight turns; the research agent reads the strongest tags.
  practice: obj({ ledger: arr(obj({ turn: ref('turn'), tags: map(str(PATTERNS.tag), int(1, 20)) }), 8) }),
  tokens: arr(obj({
    id: ref('id'),
    kind: { enum: ['breakthrough', 'crisis', 'grievance'] },
    tags: arr(ref('tag'), 3),
    turn: ref('turn'),
    source: text(80, 1),
  }), 20),
  statuses: arr(obj({
    id: ref('id'),
    effects: arr(ref('statusEffect'), 3, 1),
    until: nullable(ref('turn')),
    endsOn: nullable({ const: 'setback' }),
  }), 12),
  // Values of standing `meter` primitives, keyed by meter id.
  meters: map(str(PATTERNS.id), int(-5, 5)),
  shortfall: map(str(PATTERNS.key), int(0, 999)),
  bestimmung: nullable(ref('bestimmungState')),
  // Per-module slices; each module validates its own slice.
  modules: map(str(PATTERNS.id), { type: 'object' }),
});

const settlement = obj({
  id: ref('id'),
  name: text(60, 2),
  people: ref('id'),
  kind: ref('id'),
  tile: ref('tile'),
  regionId: ref('region'),
  mobile: { type: 'boolean' },
  buildings: arr(obj({ ref: ref('ref'), since: ref('turn'), state: { enum: ['active', 'suspended'] } }), 12),
});

// Added by the world agent after validation; resources mirror the tile shape of engine/world.
const feature = obj({
  id: ref('id'),
  kind: ref('id'),
  name: text(60, 2),
  tags: arr(ref('tag'), 4),
  resources: arr(obj({ key: ref('key'), amount: int(1, 999) }), 4),
  since: ref('turn'),
  source: ref('source'),
});

export const CAMPAIGN_DEFS = Object.freeze({
  people,
  identity,
  member,
  unit,
  settlement,
  feature,
  campaign: obj({
    format: { const: 'realmcraft-campaign' },
    version: { const: 1 },
    rulesVersion: int(1, 999),
    campaign: obj({
      id: ref('id'),
      // The pinned world package: welt.json carries a semver, the hash covers the whole package.
      world: obj({ id: ref('id'), version: str(PATTERNS.semver), hash: ref('hash') }),
      player: ref('id'),
    }),
    rev: int(0, 999999),
    turn: ref('turn'),
    phase: { enum: [...PHASES] },
    rng: obj({ algo: { const: 'sfc32' }, s: arr(int(0, 4294967295), 4, 4) }),
    map: obj({
      // createWorld accepts a number or string seed.
      seed: { oneOf: [{ type: 'integer' }, text(64, 1)] },
      packId: ref('id'),
      control: map(ref('region'), nullable(ref('id'))),
      settlements: arr(ref('settlement'), 200),
      // Fog per people in the shape of engine/world reveal()/fade().
      known: map(peopleKey, map(ref('tile'), { enum: ['seen', 'visible'] })),
      features: map(ref('tile'), ref('feature')),
    }),
    peoples: map(peopleKey, ref('people')),
    // Key: both people ids in alphabetical order joined by "|".
    relations: map(
      str('^[a-z][a-z0-9-]{1,40}\\|[a-z][a-z0-9-]{1,40}$'),
      obj({ value: int(-3, 3), atWar: { type: 'boolean' }, since: ref('turn') }),
    ),
    modules: map(str(PATTERNS.id), { type: 'object' }),
    eventPool: arr(ref('ref'), 200),
    ingested: map(ref('proposalId'), ref('hash')),
    chronicle: arr(ref('logEntry'), 2000),
    status: { enum: ['playing', 'ended'] },
    // Recomputed on every write, never an input to a rule, excluded from the state hash.
    derived: { type: 'object' },
  }, ['derived']),
});

export const campaign = bundle('campaign/1', CAMPAIGN_DEFS.campaign, COMMON_DEFS, EFFECT_DEFS, BESTIMMUNG_DEFS, EVENT_DEFS, CAMPAIGN_DEFS);

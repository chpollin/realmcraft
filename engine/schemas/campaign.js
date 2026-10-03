// Campaign state (state.json), written only by the kernel. It holds references
// to world content and the mutable part of the map; generated tiles are a pure
// function of map.seed and the pinned pack and are never stored here.
//
// Every people, player-led or agent-led, has exactly the same shape; only
// `controller` (and the profile it implies) differs. Invariants a schema
// cannot express (refs exist in the library, one leader per council, tile keys
// match their regionId, resource keys exist in regeln.json) belong to the
// content validator.
//
// Fields added after the first freeze (docs/Vertragsaenderungen.md) are
// optional with a stated default, so states written before the amendment stay
// valid; the kernel writes them on every write. The exception is the core
// meter zustimmung, which the kernel has written since turn 0.

import { APPROVAL_METER, COMMON_DEFS, DIFFICULTIES, LIFE_STAGES, PATTERNS, PHASES, TOKEN_KINDS, arr, bundle, int, map, nullable, obj, ref, str, text } from './common.js';
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
  // Default null: the target tile of the order the member led last season,
  // set at resolution and cleared when planning opens; null means at home.
  at: nullable(ref('tile')),
}, ['at']);

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
  // Volk: core counts clans (Sippen), the unit of population and labour.
  // growth holds the growth points towards the next clan (four make one), the
  // value the rules call growthPoints. assigned is the labour of the current
  // turn as taken over from draft.assign (default {}).
  population: obj({ core: int(0, 99), growth: int(0, 3), assigned: map(str(PATTERNS.key), int(0, 99)) }, ['assigned']),
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
    // pfad: the path a research.direct named (default absent).
    requests: arr(obj({ turn: ref('turn'), tags: arr(ref('tag'), 3, 1), note: text(200), pfad: ref('id') }, ['pfad']), 8),
    instituted: arr(ref('ref'), 20),
  }),
  units: arr(unit, 40),
  council: arr(member, 9),
  // Ring buffer of the last eight turns; the research agent reads the strongest tags.
  practice: obj({ ledger: arr(obj({ turn: ref('turn'), tags: map(str(PATTERNS.tag), int(1, 20)) }), 8) }),
  tokens: arr(obj({
    id: ref('id'),
    kind: { enum: [...TOKEN_KINDS] },
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
  // Values of standing `meter` primitives, keyed by meter id, plus the core
  // meter zustimmung (approval of the people) every people carries in every
  // world. Its bounds and start value are regeln.tuning.approval.
  meters: {
    type: 'object',
    propertyNames: str(PATTERNS.id),
    properties: { [APPROVAL_METER]: int(-5, 5) },
    required: [APPROVAL_METER],
    additionalProperties: int(-5, 5),
  },
  shortfall: map(str(PATTERNS.key), int(0, 999)),
  bestimmung: nullable(ref('bestimmungState')),
  // Per-module slices; each module validates its own slice.
  modules: map(str(PATTERNS.id), { type: 'object' }),
  // Default { opened: {} }: turn in which each path with an opens condition
  // opened (engine/core/pfade.js). Everything else about a path derives
  // from the known achievements.
  pfade: obj({ opened: map(ref('id'), ref('turn')) }),
}, ['pfade']);

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

// What a people sees of another people (view schema): no stocks, meters,
// research, candidates, council or destiny. units holds only units on tiles
// the viewer sees as visible; resources appears only while a reveal with
// scope people uncovers them.
const foreignPeople = obj({
  id: ref('id'),
  name: text(80, 2),
  controller: { enum: ['player', 'ai'] },
  identity: ref('identity'),
  lebensweise: ref('ref'),
  standing: int(0, 3),
  units: arr(unit, 40),
  resources: map(str(PATTERNS.key), int(0, 999)),
}, ['resources']);

export const CAMPAIGN_DEFS = Object.freeze({
  people,
  foreignPeople,
  identity,
  member,
  unit,
  settlement,
  feature,
  campaignRef: obj({
    id: ref('id'),
    // The pinned world package: welt.json carries a semver, the hash covers the whole package.
    world: obj({ id: ref('id'), version: str(PATTERNS.semver), hash: ref('hash') }),
    player: ref('id'),
  }),
  campaignMap: obj({
    // createWorld accepts a number or string seed.
    seed: { oneOf: [{ type: 'integer' }, text(64, 1)] },
    packId: ref('id'),
    control: map(ref('region'), nullable(ref('id'))),
    settlements: arr(ref('settlement'), 200),
    // Fog per people in the shape of engine/world reveal()/fade().
    known: map(peopleKey, map(ref('tile'), { enum: ['seen', 'visible'] })),
    features: map(ref('tile'), ref('feature')),
  }),
  // Key: both people ids in alphabetical order joined by "|". contact: the
  // two peoples have met (first contact); absent means false.
  relations: map(
    str('^[a-z][a-z0-9-]{1,40}\\|[a-z][a-z0-9-]{1,40}$'),
    obj({ value: int(-3, 3), atWar: { type: 'boolean' }, since: ref('turn'), contact: { type: 'boolean' } }, ['contact']),
  ),
  // World-event draw of one people for the resolution of `turn`: the raw d10
  // (the player's roll for the player people, an RNG draw at seal for the
  // others), its band and the card chosen for it (null until the world agent's
  // card is ingested or apply picks one from the pool).
  eventDraw: obj({
    turn: ref('turn'),
    roll: int(1, 10),
    band: int(1, 5),
    roller: { enum: ['player', 'kernel'] },
    card: nullable(ref('ref')),
  }),
  // An event card with options awaiting the people's answer (draft.choices).
  // Unanswered at the seal of turn `deadline`, the first option applies.
  pendingChoice: obj({
    id: ref('id'),
    people: ref('id'),
    event: ref('ref'),
    offeredAt: ref('turn'),
    deadline: ref('turn'),
    options: arr(ref('id'), 3, 2),
  }),
  // End of the campaign. victory: winner fulfilled its Bestimmung first.
  // collapse: the player people went under; winner is null. status is
  // "ended" exactly when result is not null (content validator).
  result: obj({
    winner: nullable(ref('id')),
    kind: { enum: ['victory', 'collapse'] },
    turn: ref('turn'),
    reason: text(200, 1),
  }),
  // Recomputed on every write, never an input to a rule, excluded from the
  // state hash. One open object per people (or per map layer); caps holds the
  // stock limit per resource (regeln cap plus stock.cap).
  derived: map(str(PATTERNS.id), {
    type: 'object',
    properties: { caps: map(str(PATTERNS.key), int(0, 9999)) },
    additionalProperties: true,
  }),
  campaign: obj({
    format: { const: 'realmcraft-campaign' },
    version: { const: 1 },
    rulesVersion: int(1, 999),
    campaign: ref('campaignRef'),
    rev: int(0, 999999),
    turn: ref('turn'),
    phase: { enum: [...PHASES] },
    rng: obj({ algo: { const: 'sfc32' }, s: arr(int(0, 4294967295), 4, 4) }),
    map: ref('campaignMap'),
    peoples: map(peopleKey, ref('people')),
    relations: ref('relations'),
    modules: map(str(PATTERNS.id), { type: 'object' }),
    eventPool: arr(ref('ref'), 200),
    ingested: map(ref('proposalId'), ref('hash')),
    // Default {}: draws of the current resolution, keyed by people.
    eventDraws: map(peopleKey, ref('eventDraw')),
    // Default {}: hash of every draft sealed for the current resolution, keyed
    // by people; apply resolves only drafts with exactly these hashes.
    sealed: map(peopleKey, ref('hash')),
    // Default [].
    pendingChoices: arr(ref('pendingChoice'), 24),
    chronicle: arr(ref('logEntry'), 2000),
    status: { enum: ['playing', 'ended'] },
    // Default null.
    result: nullable(ref('result')),
    // Default { difficulty: 'normal', language: 'de' } (settingsOf in engine/core/state.js).
    settings: ref('settings'),
    derived: ref('derived'),
  }, ['derived', 'eventDraws', 'pendingChoices', 'result', 'sealed', 'settings']),
  // Options of a campaign chosen at creation. language is the narrative
  // language the agents write in; the UI language is a setting of the viewer.
  settings: obj({ difficulty: { enum: [...DIFFICULTIES] }, language: str(PATTERNS.language) }),
});

export const campaign = bundle('campaign/1', CAMPAIGN_DEFS.campaign, COMMON_DEFS, EFFECT_DEFS, BESTIMMUNG_DEFS, EVENT_DEFS, CAMPAIGN_DEFS);

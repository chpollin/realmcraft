// Entwicklung: the one generic content object (technique, discipline, unit,
// building, institution, way of life, doctrine). The shape of `spec` depends
// on `kind`, so the schema is one closed variant per kind, discriminated by
// the kind constant.

import { BANDS, COMMON_DEFS, KINDS, MAX_TIER, arr, bundle, int, map, nullable, obj, ref, str, text, PATTERNS } from './common.js';
import { EFFECT_DEFS } from './effects.js';

const application = obj({
  id: ref('id'),
  name: text(40, 2),
  slot: { enum: ['main', 'minor'] },
  target: int(3, 8),
  cost: ref('costBag'),
  tags: ref('tags'),
  targetKind: { enum: ['none', 'tile', 'region', 'people', 'member', 'unit'] },
  outcomes: obj(Object.fromEntries(BANDS.map((b) => [b, arr(ref('oncePrimitive'), 3)]))),
});

const SPECS = {
  technik: { type: 'null' },
  doktrin: { type: 'null' },
  disziplin: obj({ source: ref('key'), applications: arr(ref('application'), 4, 1) }),
  einheit: obj({ strength: int(1, 4), mobility: int(1, 4), recruitCost: ref('costBag'), upkeep: ref('costBag'), tags: ref('tags') }),
  bauwerk: obj({ terrains: arr(ref('key'), 6, 1), buildCost: ref('costBag'), perRegion: int(1, 3), upkeep: ref('costBag') }),
  // Governance comes from the governance.rule primitive in effects, so the
  // spec only names the council seat an institution opens.
  institution: obj({ seat: nullable(obj({ role: ref('id'), favor: arr(ref('tag'), 4), oppose: arr(ref('tag'), 4) })) }),
  lebensweise: obj({
    settlement: { enum: ['camp', 'village'] },
    migrates: { type: 'boolean' },
    consumption: map(ref('id'), int(0, 4)),
    herdRules: nullable(obj({ pastureTerrains: arr(ref('key'), 6, 1), growth: int(0, 2), winterLoss: int(0, 3) })),
  }),
};

function envelope(kind) {
  return obj({
    format: { const: 'realmcraft-entwicklung' },
    version: { const: 1 },
    id: str('^[a-z][a-z0-9-]{2,40}$'),
    rev: int(1, 999),
    kind: { const: kind },
    tier: int(0, MAX_TIER),
    name: text(40, 2),
    summary: text(280, 1),
    appearance: text(200),
    tags: ref('tags'),
    prerequisites: ref('prerequisites'),
    cost: ref('developmentCost'),
    effects: arr(ref('standingPrimitive'), 6),
    price: arr(ref('standingPrimitive'), 4),
    onAcquire: arr(ref('oncePrimitive'), 3),
    // An Entwicklung that supersedes an order (way of life, constitution) names it here instead of stacking.
    replaces: arr(str('^[a-z][a-z0-9-]{2,40}$'), 2),
    spec: SPECS[kind],
    origin: ref('origin'),
    // Path of the achievement (regeln.pfade); absent, the tags decide (engine/core/pfade.js pfadOf).
    pfad: ref('id'),
  }, ['pfad']);
}

export const ENTWICKLUNG_DEFS = Object.freeze({
  application,
  prerequisites: obj({
    // Ids without revision: any revision of a prerequisite satisfies it.
    all: arr(str('^[a-z][a-z0-9-]{2,40}$'), 3),
    any: arr(str('^[a-z][a-z0-9-]{2,40}$'), 3),
    if: nullable(ref('condition')),
  }),
  // research cap follows the mechanics draft: net 10 x (tier 5 + 1) = 60.
  developmentCost: obj({ research: int(2, 60), resources: map(str(PATTERNS.key), int(1, 12)) }),
  origin: obj({
    source: { enum: ['world', 'agent'] },
    practiceTags: arr(ref('tag'), 3),
    token: nullable(ref('id')),
    request: nullable(ref('turn')),
    proposal: nullable(text(80, 1)),
  }),
  entwicklung: { oneOf: KINDS.map(envelope) },
});

export const entwicklung = bundle('entwicklung/1', ENTWICKLUNG_DEFS.entwicklung, COMMON_DEFS, EFFECT_DEFS, ENTWICKLUNG_DEFS);

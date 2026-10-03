// World package files beside welt.json (whose generator schema belongs to
// engine/world): regeln.json, labels.json, style.json and the three content
// files under content/. A package directory is welten/<id>/; every file names
// its world id so a file copied into the wrong package is caught.

import { COMMON_DEFS, MAX_TIER, PATTERNS, arr, bundle, int, map, nullable, obj, ref, str, text } from './common.js';
import { EFFECT_DEFS } from './effects.js';
import { ENTWICKLUNG_DEFS } from './entwicklung.js';
import { BESTIMMUNG_DEFS } from './bestimmung.js';
import { CAMPAIGN_DEFS } from './campaign.js';

// Keys of welt.json the kernel relies on; its full schema lives with engine/world.
export const WELT_REQUIRED_KEYS = Object.freeze(['id', 'name', 'version', 'generation', 'terrains', 'resources', 'start', 'names']);

const head = (format) => ({ format: { const: format }, version: { const: 1 }, world: ref('id') });

const peopleTemplate = obj({
  id: ref('id'),
  name: text(80, 2),
  agentProfile: nullable(ref('id')),
  identity: ref('identity'),
  lebensweise: ref('ref'),
  population: obj({ core: int(1, 99), growth: int(0, 3) }),
  resources: map(str(PATTERNS.key), int(0, 999)),
  standing: int(0, 3),
  developments: arr(ref('ref'), 12),
  council: ref('id'),
  bestimmung: nullable(ref('ref')),
});

export const WORLD_DEFS = Object.freeze({
  // Event card for the pool; its net weight must fit the band (content validator).
  ereignis: obj({
    id: str('^[a-z][a-z0-9-]{2,40}$'),
    rev: int(1, 999),
    name: text(60, 2),
    text: text(400, 1),
    band: int(1, 5),
    tags: ref('tags'),
    if: nullable(ref('condition')),
    effects: arr(ref('oncePrimitive'), 4),
    // A decision event offers two or three options instead of fixed effects.
    options: nullable(arr(obj({ id: ref('id'), label: text(80, 1), effects: arr(ref('oncePrimitive'), 4) }), 3, 2)),
  }),
  regeln: obj({
    ...head('realmcraft-regeln'),
    calendar: obj({
      seasons: arr(obj({ id: ref('id'), winter: { type: 'boolean' } }), 6, 2),
      startYear: int(1, 9999),
      startSeason: ref('id'),
    }),
    // value is v(res) of the power budget; module role resources appear here too and are bound in moduleBindings.
    resources: arr(obj({ id: ref('key'), value: int(1, 3), cap: int(0, 999), module: nullable(ref('id')) }), 24, 1),
    stats: arr(obj({ id: ref('key'), base: int(-2, 3) }), 8, 1),
    // Tag vocabulary with breadth b(tag): 1 narrow, 2 a domain, 3 everything.
    vocabulary: map(str(PATTERNS.tag), int(1, 3)),
    peopleTemplates: arr(peopleTemplate, 8, 1),
    councilTemplates: arr(obj({ id: ref('id'), members: arr(ref('member'), 9, 1) }), 8, 1),
    tuning: obj({
      maxTier: int(1, MAX_TIER),
      lossAfter: int(1, 12),
      newMemberLoyalty: int(-5, 5),
      slots: obj({ main: int(1, 3), minor: int(0, 4) }),
      limits: obj({ candidatesPerTurn: int(1, 6), aboveTier: int(0, 3), openCandidates: int(1, 12), moduleActivations: int(0, 3) }),
      // Expected counts for scaled flows (per population, units, regions, settlements).
      expected: map(str(PATTERNS.id), int(0, 99)),
    }),
    aiProfiles: arr(obj({ id: ref('id'), name: text(60, 2), stance: text(400, 1), weights: map(str(PATTERNS.tag), int(-3, 3)) }), 8),
    moduleBindings: map(str(PATTERNS.id), map(str(PATTERNS.id), ref('key'))),
  }),
  labels: obj({
    ...head('realmcraft-labels'),
    locale: str('^[a-z]{2}$'),
    labels: map(str(PATTERNS.labelKey), text(200, 1)),
  }),
  style: obj({
    ...head('realmcraft-style'),
    image: obj({ base: text(1000, 1), negative: text(500) }),
    imageTypes: map(str(PATTERNS.id), obj({ prompt: text(500, 1), aspect: { enum: ['1:1', '3:2', '2:3', '16:9'] } })),
    accents: map(str(PATTERNS.id), str('^#[0-9a-f]{6}$')),
  }),
  entwicklungen: obj({ ...head('realmcraft-entwicklungen'), items: arr(ref('entwicklung'), 500) }),
  ereignisse: obj({ ...head('realmcraft-ereignisse'), items: arr(ref('ereignis'), 500) }),
  bestimmungen: obj({ ...head('realmcraft-bestimmungen'), items: arr(ref('bestimmung'), 50) }),
});

const DEFS = [COMMON_DEFS, EFFECT_DEFS, ENTWICKLUNG_DEFS, BESTIMMUNG_DEFS, CAMPAIGN_DEFS, WORLD_DEFS];

export const ereignis = bundle('ereignis/1', WORLD_DEFS.ereignis, ...DEFS);
export const regeln = bundle('regeln/1', WORLD_DEFS.regeln, ...DEFS);
export const labels = bundle('labels/1', WORLD_DEFS.labels, ...DEFS);
export const style = bundle('style/1', WORLD_DEFS.style, ...DEFS);
export const entwicklungen = bundle('entwicklungen/1', WORLD_DEFS.entwicklungen, ...DEFS);
export const ereignisse = bundle('ereignisse/1', WORLD_DEFS.ereignisse, ...DEFS);
export const bestimmungen = bundle('bestimmungen/1', WORLD_DEFS.bestimmungen, ...DEFS);

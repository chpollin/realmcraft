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
    // Repeat control, all optional. once: at most one draw per people and
    // campaign (default false). cooldown: turns before the same people can
    // draw it again (default 0). maxPerCampaign: draws over all peoples
    // (default unlimited).
    once: { type: 'boolean' },
    cooldown: int(0, 99),
    maxPerCampaign: int(1, 99),
  }, ['once', 'cooldown', 'maxPerCampaign']),
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
      // Kernel constants a world may set; absent, the kernel's TUNING value
      // of the same name applies.
      // Divisor of the stock above its cap lost at the end of a turn (2 = half, rounded up).
      spoilage: int(1, 10),
      // Loyalty every council member loses each winter (decay of devotion).
      loyaltyDecay: int(0, 3),
      // Machtproben a people may take per turn (the first is free).
      machtprobeCap: int(1, 4),
      // Allowed total difficulty D of a Bestimmung (validator, destiny_band).
      bestimmungBand: obj({ min: int(0, 99), max: int(0, 99) }),
      // Per event band: the raw d10 range that draws it and the net weight
      // range a card of the band must have (validator).
      eventBands: arr(obj({
        band: int(1, 5),
        roll: obj({ min: int(1, 10), max: int(1, 10) }),
        net: obj({ min: int(-20, 20), max: int(-20, 20) }),
      }), 5, 5),
      // Per terrain: defence bonus to an attack on the tile and the seasonal
      // yield factor (0, 1 or 2) per season and resource.
      terrainRules: map(str(PATTERNS.key), obj({
        defense: int(0, 3),
        yieldFactor: map(str(PATTERNS.id), map(str(PATTERNS.key), int(0, 2))),
      }, ['defense', 'yieldFactor'])),
      // Wissen burned from stock into research points per season, at most.
      knowledgeSpend: int(0, 10),
      // Bounds and start value of the core meter zustimmung.
      approval: obj({ min: int(-5, 0), max: int(0, 5), start: int(-5, 5) }),
      // Per deposit or feature resource key: the world resource it yields and
      // how much per season in a worked region.
      featureYield: map(str(PATTERNS.key), obj({ res: ref('key'), amount: int(1, 5) })),
    }, ['spoilage', 'loyaltyDecay', 'machtprobeCap', 'bestimmungBand', 'eventBands', 'terrainRules', 'knowledgeSpend', 'approval', 'featureYield']),
    aiProfiles: arr(obj({ id: ref('id'), name: text(60, 2), stance: text(400, 1), weights: map(str(PATTERNS.tag), int(-3, 3)) }), 8),
    moduleBindings: map(str(PATTERNS.id), map(str(PATTERNS.id), ref('key'))),
    // Research paths (engine/core/pfade.js). Absent, the world has no paths
    // and research runs without a path gate. The order of `paths` breaks
    // ties of the tag mapping and is the order of the board's wheel.
    pfade: obj({
      paths: arr(obj({
        id: ref('id'),
        tags: arr(ref('tag'), 16, 1),
        // null: always open. Otherwise open from the first season in which the
        // practice ledger sums at least `min` over these tags.
        opens: nullable(obj({ practice: arr(ref('tag'), 8, 1), min: int(1, 99) })),
      }), 8, 1),
      // unlock[k-1]: completed achievements on the path of tier k-1 or higher
      // that open tier k on the path. unlock[0] is 0.
      unlock: arr(int(0, 20), MAX_TIER, 1),
      // Path of an Entwicklung whose tags meet no path.
      fallback: ref('id'),
    }),
  }, ['pfade']),
  labels: obj({
    ...head('realmcraft-labels'),
    locale: str('^[a-z]{2}$'),
    // Keys use dots and dashes only; an id with "_" (probe bands) appears
    // with "-" instead, so crit_success is labelled under "band.crit-success".
    labels: map(str(PATTERNS.labelKey), text(200, 1)),
  }),
  style: obj({
    ...head('realmcraft-style'),
    image: obj({ base: text(1000, 1), negative: text(500) }),
    imageTypes: map(str(PATTERNS.id), obj({ prompt: text(500, 1), aspect: { enum: ['1:1', '3:2', '2:3', '16:9'] } })),
    // Accent role -> design token name of the UI ("ochre", "slate-dark");
    // colour values belong to the UI's token sheet, not to the world.
    accents: map(str(PATTERNS.id), str('^[a-z][a-z0-9-]*$')),
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

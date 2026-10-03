// Effect primitives: one closed schema per op, the lifetime of each op, and the
// power-weight table the budget validator reads.
//
// Standing primitives live in an Entwicklung's effects and price or in a
// status and act while their source is active. One-off primitives live in
// onAcquire, application outcomes, triggers, meter thresholds and event cards
// and act exactly once. The schema enforces the lifetime per slot; the sign
// rule (effects >= 0, price <= 0) needs the weights and belongs to the
// content validator (misplaced_effect).
//
// Mapping of the mechanics draft's eleven primitives onto kernel ops:
//
//   mechanics   kernel op(s)                                    note
//   ---------   ---------------------------------------------   ------------------------------------------
//   modify      probe.mod, unit.mod                             tag-scoped die modifier, optional condition
//   bonus       stat.mod, order.slot, stock.cap, population.cap standing shift of a derived value or capacity
//   flow        resource.flow, yield.mod, research.mod,         per-season stream; negative flow is upkeep
//               population.growth, dependency
//   adjust      resource.delta, population.delta, loyalty.delta, one-off change of a stock, meter or relation
//               relation.delta, standing.delta, meter.delta
//   grant       order.unlock                                    new order type; unit, building and discipline
//                                                               applications are granted through the spec of
//                                                               an Entwicklung of kind einheit, bauwerk, disziplin
//   restrict    order.restrict, governance.rule                 forbid, per-period limit, duty with breach;
//                                                               governance.rule is the council-majority case
//   meter       meter                                           bounded track with rise, decay and thresholds
//   trigger     trigger                                         one-off effects when a hook fires
//   spawn       unit.spawn, council.seat, population.delta      map sites and powers are not primitives: the
//                                                               world agent proposes map features instead
//   tag         status.add, token.add, flag.set, loyalty.bind   timed status, marker, switch, hollow loyalty
//   reveal      reveal (one-off), sight.mod (standing)          fog over tiles, a region or a people's intent
//
// module.activate has no mechanics counterpart; it is the kernel's handle for
// switching a mechanics module on (weight 0, modules are balanced as code).

import { arr, int, nullable, obj, ref, str, text, PATTERNS, TOKEN_KINDS } from './common.js';

const op = (name, props, optional = []) => obj({ op: { const: name }, ...props }, optional);
const seasons = arr(ref('id'), 3, 1);
const once = (max, min = 1) => arr(ref('oncePrimitive'), max, min);

const STANDING = {
  'resource.flow': op('resource.flow', {
    res: ref('key'),
    amount: int(-5, 5),
    when: seasons,
    scale: obj({ per: { enum: ['population', 'units', 'regions', 'settlements'] }, tag: ref('tag'), step: int(1, 10) }, ['tag']),
  }, ['when', 'scale']),
  // Shifts the base yield of every tile of this terrain the people works.
  'yield.mod': op('yield.mod', { res: ref('key'), terrain: ref('key'), amount: int(-2, 2), when: seasons }, ['when']),
  'stock.cap': op('stock.cap', { res: ref('key'), amount: int(-5, 10) }),
  'population.cap': op('population.cap', { amount: int(-2, 4) }),
  'population.growth': op('population.growth', { amount: int(-1, 2) }),
  'stat.mod': op('stat.mod', { stat: ref('key'), amount: int(-2, 2) }),
  'probe.mod': op('probe.mod', { tags: arr(ref('tag'), 3, 1), amount: int(-2, 2), if: ref('condition'), label: text(40, 1) }, ['if', 'label']),
  'research.mod': op('research.mod', { tags: arr(ref('tag'), 3, 1), amount: int(-1, 3) }),
  'unit.mod': op('unit.mod', { unitTags: arr(ref('tag'), 3, 1), stat: { enum: ['strength', 'mobility', 'upkeep'] }, amount: int(-2, 2) }),
  'order.unlock': op('order.unlock', { order: ref('order'), limit: int(1, 3) }, ['limit']),
  'order.slot': op('order.slot', { slot: { enum: ['main', 'minor'] }, amount: { const: 1 } }),
  'order.restrict': op('order.restrict', {
    mode: { enum: ['forbid', 'limit', 'duty'] },
    orders: arr(ref('order'), 4),
    tags: arr(ref('tag'), 3),
    limit: int(1, 3),
    per: { enum: ['season', 'year'] },
    if: ref('condition'),
    breach: once(3),
  }, ['limit', 'per', 'if', 'breach']),
  'module.activate': op('module.activate', {
    module: ref('id'),
    bind: { type: 'object', propertyNames: str(PATTERNS.id), additionalProperties: ref('key') },
  }),
  // scopeTags names order tags ("befohlen", "angriff"); scopeOrders names order
  // types directly ("destiny.adopt", "trade.cancel"), which carry a dot and are no tags.
  'governance.rule': op('governance.rule', { rule: { enum: ['leader', 'council', 'assembly'] }, scopeTags: arr(ref('tag'), 6), scopeOrders: arr(ref('order'), 8) }, ['scopeOrders']),
  dependency: op('dependency', { res: ref('key'), amount: int(1, 3), penalty: once(3) }),
  meter: op('meter', {
    id: ref('id'),
    min: int(-5, 0),
    max: int(1, 5),
    rise: obj({ on: str('^(season|use:[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)?)$'), amount: int(1, 2) }),
    decay: int(0, 2),
    thresholds: arr(obj({ at: int(-5, 5), effects: once(3) }), 3, 1),
  }),
  'sight.mod': op('sight.mod', { amount: int(-1, 2) }),
  trigger: op('trigger', {
    on: str('^(season|winter|war|contact|death|(crit_success|crit_fail|shortfall|use):[a-z][a-z0-9-.]*)$'),
    if: ref('condition'),
    effects: once(3),
  }, ['if']),
};

const ONCE = {
  'resource.delta': op('resource.delta', { res: ref('key'), amount: int(-10, 10) }),
  'population.delta': op('population.delta', { amount: int(-3, 3) }),
  'loyalty.delta': op('loyalty.delta', { target: str('^(all|(favor|oppose):[a-z][a-z0-9-]{1,24}|[a-z][a-z0-9-]{1,40})$'), amount: int(-2, 2) }),
  'loyalty.bind': op('loyalty.bind', { target: ref('id'), value: int(1, 4) }),
  'relation.delta': op('relation.delta', { people: str('^(\\$target|neighbours|all|[a-z][a-z0-9-]{1,40})$'), amount: int(-2, 2) }),
  'standing.delta': op('standing.delta', { amount: int(-1, 1) }),
  'status.add': op('status.add', {
    id: ref('id'),
    effects: arr(ref('statusEffect'), 3, 1),
    duration: nullable(int(1, 8)),
    endsOn: nullable({ const: 'setback' }),
  }),
  'token.add': op('token.add', { kind: { enum: [...TOKEN_KINDS] }, tags: arr(ref('tag'), 3) }),
  'unit.spawn': op('unit.spawn', { type: ref('ref'), tile: str(`^(\\$home|${PATTERNS.tile.slice(1, -1)})$`) }),
  'unit.delta': op('unit.delta', { unit: { enum: ['$target', '$all-on-tile'] }, strength: int(-3, 3) }),
  'region.control': op('region.control', { region: str(`^(\\$target|${PATTERNS.region.slice(1, -1)})$`), people: nullable({ const: '$self' }) }),
  'council.seat': op('council.seat', { role: ref('id'), favor: arr(ref('tag'), 4), oppose: arr(ref('tag'), 4) }),
  'flag.set': op('flag.set', { flag: ref('flag'), value: { type: 'boolean' } }),
  'meter.delta': op('meter.delta', { meter: ref('id'), amount: int(-3, 3) }),
  // scope tiles: disc of `radius` around `at`; region: all tiles of a region; people: intent and stocks of a people.
  reveal: op('reveal', {
    scope: { enum: ['tiles', 'region', 'people'] },
    at: str(`^(\\$target|\\$home|${PATTERNS.tile.slice(1, -1)}|${PATTERNS.region.slice(1, -1)}|[a-z][a-z0-9-]{1,40})$`),
    radius: int(0, 3),
  }, ['radius']),
};

// A status must not carry anything that changes the catalogue, activates a
// module or nests further one-off effects, otherwise a timed status could
// smuggle in permanent structure.
const NOT_IN_STATUS = new Set(['module.activate', 'order.slot', 'trigger', 'dependency', 'meter', 'governance.rule']);

export const PRIMITIVES = Object.freeze(Object.fromEntries([
  ...Object.entries(STANDING).map(([k, schema]) => [k, Object.freeze({ lifetime: 'standing', schema })]),
  ...Object.entries(ONCE).map(([k, schema]) => [k, Object.freeze({ lifetime: 'once', schema })]),
]));

export const STANDING_OPS = Object.freeze(Object.keys(STANDING));
export const ONCE_OPS = Object.freeze(Object.keys(ONCE));

const refs = (ops) => ops.map((k) => ref(`op.${k}`));

export const EFFECT_DEFS = Object.freeze({
  ...Object.fromEntries([...Object.entries(STANDING), ...Object.entries(ONCE)].map(([k, s]) => [`op.${k}`, s])),
  standingPrimitive: { oneOf: refs(Object.keys(STANDING)) },
  oncePrimitive: { oneOf: refs(Object.keys(ONCE)) },
  statusEffect: { oneOf: refs(Object.keys(STANDING).filter((k) => !NOT_IN_STATUS.has(k))) },
});

// TUNING: power weights from the mechanics draft (section 5.1), placeholder
// until simulation calibrates them. One weight unit is one point of a one-off
// adjust. Effects count positive, prices negative, so every entry is the
// weight per unit of the op's amount with the amount's sign unless stated.
// Entries marked "derived" have no row in the mechanics draft; the note
// names how the value follows from rows that exist.
export const WEIGHTS = Object.freeze({
  'probe.mod': { perPoint: { narrow: 1, broad: 2 }, note: 'tag breadth from the world vocabulary, broad = a whole probe category' },
  'unit.mod': { perPoint: { narrow: 1, broad: 2 }, note: 'derived: treated as modify on units' },
  'stat.mod': { perPoint: 3 },
  'order.slot': { minor: 4, main: 6 },
  'stock.cap': { perTwoPoints: 1 },
  'population.cap': { perPoint: 3, note: 'bonus +1 Arbeitsgruppe' },
  'population.growth': { perPoint: 3, note: 'derived: four growth points are one group (spawn 3) per year, as flow +1' },
  'resource.flow': { perPoint: { seasons4: 3, seasons3: 2, seasons2: 2, seasons1: 1 }, earmarked: 2, scaleBound: 2, note: 'seasons2 derived, no row in the draft; a scaled benefit counts scaleBound x tuning.expected units (an upper bound, the expected count is a campaign average), a scaled burden the expected count' },
  'yield.mod': { perPoint: { seasons4: 3, seasons3: 2, seasons2: 2, seasons1: 1 }, note: 'derived: treated as flow' },
  'research.mod': { perPoint: 2, note: 'flow of research, earmarked to tags' },
  dependency: { perPoint: -3, note: 'derived: upkeep flow -1 is -3; the people pays or takes the penalty each season, so the weight is the lighter of the payment and the harmful part of the penalty on the resource.flow scale of every season (a helpful penalty counts 0)' },
  'order.unlock': { plain: 2, withStandingOutcome: 3 },
  'order.restrict': { forbidNarrow: -1, forbidBroad: -2, limitNarrow: -1, limitBroad: -2, duty: 0, note: 'duty weighs 0 while the kernel has no duty rule, the draft value -2 returns with an enforcing kernel; a restriction without orders and tags weighs 0' },
  meter: { severity: { light: 1, heavy: 2, existential: 3 }, cadence: { use: 1, season: 2 }, severityByThresholdWeight: [[2, 1], [5, 2], [null, 3]], repeat: 2, note: 'weight = gain - severity x cadence; severity from |w| of the worst harmful threshold the meter reaches, null = no upper bound; gain = sum of the beneficial thresholds in range, x repeat when the meter can fall and cross again (a use meter with decay crosses at most every other season)' },
  trigger: { negativeOnOmission: -2, otherwise: 'sum of effects x hook frequency on the resource.flow scale: season every season, winter in the winter seasons, use: and shortfall: every season for a benefit and once for a burden, other hooks once, a burden under an if once' },
  'sight.mod': { perPoint: 2, note: 'standing reveal' },
  'module.activate': { fixed: 0 },
  'governance.rule': { fixed: 0 },
  'resource.delta': { perPoint: 1 },
  'population.delta': { perPoint: 3, note: 'spawn group' },
  'loyalty.delta': { perPoint: 1 },
  'loyalty.bind': { fixed: 1, note: 'tag, beneficial status' },
  'relation.delta': { perPoint: { people: 1, $target: 1, neighbours: 2, all: 2 }, note: 'all treated like a tag group' },
  'standing.delta': { perPoint: 1 },
  'meter.delta': { perPoint: 1 },
  'status.add': { note: 'sum of the standing weights of its effects x min(duration, seasons) / seasons, duration null is the full standing weight; a harmful status ending on setback counts one season' },
  'token.add': { fixed: 1 },
  'unit.spawn': { perStrength: 1 },
  'unit.delta': { perStrength: 1 },
  'region.control': { fixed: 6, note: 'derived: kernel draft 10 on a scale where stat.mod is 5, rescaled to stat.mod 3' },
  'council.seat': { fixed: 1, note: 'spawn advisor' },
  'flag.set': { fixed: 0 },
  reveal: { perRegion: 1 },
});

// TUNING: grants carried by an Entwicklung's spec (mechanics draft 5.1).
export const SPEC_WEIGHTS = Object.freeze({
  einheit: { perStrength: 1 },
  bauwerk: { withoutOwnEffect: 1 },
  application: { plain: 2, withStandingOutcome: 3, maxOutcomePerUse: 3 },
});

// TUNING: tier limits and gates (mechanics draft 5.2). effectMax bounds the
// summed effect weight E, net = E + P must lie in [netMin, netMax], and the
// price P must be at most priceMax (negative = a minimum price). Research cost
// is net x (tier + 1). Tier 0 is the starting endowment of a world and uses
// the row of tier 1.
export const TIERS = Object.freeze([
  { tier: 1, effectMax: 4, netMin: 1, netMax: 3, priceMax: 0, gate: { prevTierKnown: 0, groups: 0, settlements: 0, worldYear: 0 } },
  { tier: 2, effectMax: 6, netMin: 2, netMax: 4, priceMax: -1, gate: { prevTierKnown: 3, groups: 4, settlements: 0, worldYear: 2 } },
  { tier: 3, effectMax: 9, netMin: 3, netMax: 6, priceMax: -2, gate: { prevTierKnown: 3, groups: 6, settlements: 2, worldYear: 5 } },
  { tier: 4, effectMax: 12, netMin: 4, netMax: 8, priceMax: -3, gate: { prevTierKnown: 3, groups: 9, settlements: 0, worldYear: 9 } },
  { tier: 5, effectMax: 15, netMin: 5, netMax: 10, priceMax: -4, gate: { prevTierKnown: 3, groups: 12, settlements: 0, worldYear: 14 } },
]);

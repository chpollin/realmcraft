// Building blocks shared by every engine schema. Each root schema bundles the
// $defs it needs (bundle below), because $ref resolves only against the root
// and the interpreter knows no cross-document references.

export const PATTERNS = Object.freeze({
  id: '^[a-z][a-z0-9-]{1,40}$',
  // A content reference pins the revision, "salzpfad@1".
  ref: '^[a-z][a-z0-9-]{1,40}@[1-9][0-9]*$',
  tag: '^[a-z][a-z0-9-]{1,24}$',
  // Resource, stat and terrain keys come from the world package (welt.json uses "eisenerz", "alm").
  key: '^[a-z][a-z0-9-]{1,24}$',
  // engine/world/hex.js key(): "q,r", negative ints, never "-0".
  tile: '^(0|-?[1-9][0-9]*),(0|-?[1-9][0-9]*)$',
  // engine/world/regions.js regionId(): "cq:cr:i".
  region: '^(0|-?[1-9][0-9]*):(0|-?[1-9][0-9]*):(0|[1-9][0-9]*)$',
  order: '^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)?$',
  // Probe ids name turn, people and order: "T6:schar:o2".
  probe: '^T(0|[1-9][0-9]*):[a-z][a-z0-9-]{1,40}:[a-z0-9][a-z0-9-]{0,40}$',
  hash: '^[0-9a-f]{16}$',
  // Issued by the kernel in each task: "research.schar.T6", campaign-wide agents omit the people.
  proposal: '^[a-z]+(\.[a-z][a-z0-9-]{1,40})?\.T(0|[1-9][0-9]*)$',
  // welt.json carries a semver string ("0.1.0").
  semver: '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)$',
  // Flags are namespaced by the development that sets them: "rauchorakel.befragt".
  flag: '^[a-z][a-z0-9-]{1,40}\\.[a-z][a-z0-9-]{1,24}$',
  source: '^(kernel|player|agent:[a-z][a-z0-9-]{1,24})$',
  isoTime: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\\.[0-9]{1,3})?Z$',
  labelKey: '^[a-z][a-z0-9-]*(\\.[a-z0-9][a-z0-9-]*)*$',
});

export const AGENTS = Object.freeze(['research', 'rival', 'council', 'world', 'chronicler', 'image']);
export const KINDS = Object.freeze(['technik', 'disziplin', 'einheit', 'bauwerk', 'institution', 'lebensweise', 'doktrin']);
export const MAX_TIER = 5;
export const LIFE_STAGES = Object.freeze(['ruestig', 'lebensabend', 'hinfaellig']);
export const PHASES = Object.freeze(['planning', 'resolving', 'agents']);
// Comparison for conditions and destiny predicates. gte and lt are
// complementary, so with integers and "not" every threshold is expressible.
export const CMP = Object.freeze(['gte', 'lt']);

export const str = (pattern) => ({ type: 'string', pattern });
export const int = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
export const text = (maxLength, minLength = 0) => ({ type: 'string', minLength, maxLength });
export const arr = (items, maxItems, minItems = 0) => ({ type: 'array', items, minItems, maxItems });
export const nullable = (schema) => ({ oneOf: [{ type: 'null' }, schema] });
export const ref = (name) => ({ $ref: `#/$defs/${name}` });

/** Closed object: every listed property required unless named in `optional`. */
export function obj(properties, optional = []) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties).filter((k) => !optional.includes(k)),
    properties,
  };
}

/** Map with constrained keys and uniform values. */
export function map(keySchema, valueSchema) {
  return { type: 'object', propertyNames: keySchema, additionalProperties: valueSchema };
}

/**
 * Root schema with exactly the $defs reachable from `body`, so a schema handed
 * to an agent carries no unrelated definitions. Throws on a dangling $ref at
 * module load instead of at the first validation.
 */
export function bundle(id, body, ...defSets) {
  const all = Object.assign({}, ...defSets);
  const used = {};
  const visit = (s) => {
    if (!s || typeof s !== 'object') return;
    if (Array.isArray(s)) return s.forEach(visit);
    if (typeof s.$ref === 'string') {
      const name = s.$ref.slice('#/$defs/'.length);
      if (!Object.hasOwn(all, name)) throw new Error(`bundle ${id}: unknown $ref ${s.$ref}`);
      if (!Object.hasOwn(used, name)) {
        used[name] = all[name];
        visit(all[name]);
      }
    }
    for (const [k, v] of Object.entries(s)) if (k !== '$ref' && k !== 'const' && k !== 'enum') visit(v);
  };
  visit(body);
  const $defs = Object.fromEntries(Object.keys(used).sort().map((k) => [k, used[k]]));
  return { $id: `https://realmcraft.local/schemas/${id}`, ...body, $defs };
}

// Conditions have at most three levels (two nested combinators around atoms);
// the depth limit is spelled out as three definitions instead of being
// checked in code.
const cmp = (value) => ({ cmp: { enum: [...CMP] }, value });

const CONDITION_ATOMS = {
  season: obj({ season: ref('id') }),
  res: obj({ res: ref('key'), ...cmp(int(-999, 999)) }),
  meter: obj({ meter: ref('id'), ...cmp(int(-5, 5)) }),
  knows: obj({ knows: ref('id') }),
  lebensweise: obj({ lebensweise: ref('id') }),
  module: obj({ module: ref('id') }),
  tagCount: obj({ tagCount: ref('tag'), ...cmp(int(0, 20)) }),
  tierCount: obj({ tierCount: int(0, MAX_TIER), ...cmp(int(0, 20)) }),
  atWar: obj({ atWar: { type: 'boolean' } }),
  flag: obj({ flag: ref('flag') }),
  // Controlled regions, optionally only those whose dominant terrain matches.
  controls: obj({ controls: { type: 'object', additionalProperties: false, required: [], properties: { terrain: ref('key') } }, ...cmp(int(0, 99)) }),
  relation: obj({ relation: { oneOf: [ref('id'), { const: '$any' }] }, ...cmp(int(-3, 3)) }),
};
const atomRefs = () => Object.keys(CONDITION_ATOMS).map((k) => ref(`cond.${k}`));

function conditionLevel(inner) {
  return {
    oneOf: [
      ...atomRefs(),
      obj({ all: arr(ref(inner), 4, 1) }),
      obj({ any: arr(ref(inner), 4, 1) }),
      obj({ not: ref(inner) }),
    ],
  };
}

export const COMMON_DEFS = Object.freeze({
  id: str(PATTERNS.id),
  ref: str(PATTERNS.ref),
  tag: str(PATTERNS.tag),
  key: str(PATTERNS.key),
  tile: str(PATTERNS.tile),
  region: str(PATTERNS.region),
  order: str(PATTERNS.order),
  probe: str(PATTERNS.probe),
  hash: str(PATTERNS.hash),
  proposalId: str(PATTERNS.proposal),
  flag: str(PATTERNS.flag),
  source: str(PATTERNS.source),
  isoTime: str(PATTERNS.isoTime),
  turn: int(0, 9999),
  tags: arr(str(PATTERNS.tag), 4, 1),
  // One-off costs (research projects, recruiting, building).
  costBag: map(str(PATTERNS.key), int(1, 12)),
  ...Object.fromEntries(Object.entries(CONDITION_ATOMS).map(([k, v]) => [`cond.${k}`, v])),
  condition1: { oneOf: atomRefs() },
  condition2: conditionLevel('condition1'),
  condition: conditionLevel('condition2'),
});

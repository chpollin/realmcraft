// Bestimmung (destiny): the victory track of a people. A destiny is world
// content with three or four milestones; each milestone is one predicate from
// a fixed library the kernel evaluates, so no agent can phrase a goal the
// kernel cannot check.

import { CMP, COMMON_DEFS, KINDS, MAX_TIER, arr, bundle, int, nullable, obj, ref, str, text } from './common.js';

const cmp = (value) => ({ cmp: { enum: [...CMP] }, value });
const pred = (name, props, optional = []) => obj({ pred: { const: name }, ...props }, optional);

// Regions carry no tags in the generated world; the dominant terrain of a
// region (engine/world regionInfo) stands in for the draft's regionTag.
const BASE = [
  pred('controls', { count: int(1, 99), terrain: ref('key') }, ['terrain']),
  pred('stat.atLeast', { key: ref('key'), value: int(-2, 3) }),
  pred('resource.atLeast', { key: ref('key'), value: int(1, 999) }),
  pred('population.atLeast', { value: int(1, 99) }),
  pred('relation', { people: { oneOf: [ref('id'), { enum: ['$any', '$all'] }] }, ...cmp(int(-3, 3)) }),
  pred('development.known', {
    count: int(1, 20),
    kind: { enum: [...KINDS] },
    tier: int(0, MAX_TIER),
    tags: arr(ref('tag'), 3, 1),
  }, ['kind', 'tier', 'tags']),
  pred('subjugated', { people: ref('id') }),
  pred('settlement', { kind: ref('id'), count: int(1, 20) }),
];

export const BESTIMMUNG_DEFS = Object.freeze({
  basePredicate: { oneOf: BASE },
  // holds wraps exactly one base predicate, so "hold for n seasons" cannot nest.
  predicate: { oneOf: [...BASE, pred('holds', { predicate: ref('basePredicate'), seasons: int(1, 12) })] },
  bestimmung: obj({
    id: ref('id'),
    rev: int(1, 999),
    name: text(60, 2),
    summary: text(280, 1),
    tags: ref('tags'),
    milestones: arr(obj({ id: ref('id'), text: text(140, 2), predicate: ref('predicate') }), 4, 3),
  }),
  // Per-people state. progress counts consecutive seasons for holds and is 0 otherwise.
  bestimmungState: obj({
    ref: ref('ref'),
    adoptedAt: ref('turn'),
    milestones: arr(obj({ id: ref('id'), reached: { type: 'boolean' }, reachedAt: nullable(ref('turn')), progress: int(0, 99) }), 4, 3),
    history: arr(obj({
      ref: ref('ref'),
      adoptedAt: ref('turn'),
      endedAt: ref('turn'),
      outcome: { enum: ['fulfilled', 'switched', 'abandoned'] },
    }), 20),
  }),
});

export const bestimmung = bundle('bestimmung/1', BESTIMMUNG_DEFS.bestimmung, COMMON_DEFS, BESTIMMUNG_DEFS);

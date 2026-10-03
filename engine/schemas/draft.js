// Orders of one people for one turn (drafts/<peopleId>.json). Order params are
// validated by the order registry of the kernel or the owning module, so here
// they are only required to be an object.
//
// A roll the player has entered between preview and apply sits in `rolls`
// under its probe id, with the fingerprint of the probe it was rolled
// against; a later change to that probe makes the fingerprint stale.

import { COMMON_DEFS, PATTERNS, arr, bundle, int, map, obj, ref, str } from './common.js';

const roll = { value: int(1, 10), fingerprint: ref('hash') };

export const DRAFT_DEFS = Object.freeze({
  draft: obj({
    format: { const: 'realmcraft-draft' },
    version: { const: 1 },
    people: ref('id'),
    turn: ref('turn'),
    baseRev: int(0, 999999),
    orders: arr(obj({ id: ref('id'), type: ref('order'), params: { type: 'object' } }), 16),
    // Orders pushed through without a council majority.
    mandate: map(str(PATTERNS.id), { const: 'decree' }),
    rolls: map(ref('probe'), obj(roll)),
    // A withdrawn rolled order stays visible in the round report.
    withdrawn: arr(obj({ probe: ref('probe'), ...roll }), 16),
    sealed: { type: 'boolean' },
  }),
});

export const draft = bundle('draft/1', DRAFT_DEFS.draft, COMMON_DEFS, DRAFT_DEFS);

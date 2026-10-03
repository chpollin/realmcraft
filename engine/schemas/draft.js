// Orders of one people for one turn (drafts/<peopleId>.json). Order params are
// validated by the order registry of the kernel or the owning module, so here
// they are only required to be an object.
//
// A roll the player has entered between preview and apply sits in `rolls`
// under its probe id, with the fingerprint of the probe it was rolled
// against; a later change to that probe makes the fingerprint stale.
//
// Staleness: a draft is stale only when its `turn` differs from state.turn.
// `baseRev` is informational (the revision the draft was planned against);
// seal and apply re-run the preview against the current state, so a draft
// written during the agents phase stays usable after later ingests.
//
// The four maps after `orders` are optional and default to {}. Their keys
// that name orders must be ids of orders in this draft (content validator).

import { COMMON_DEFS, PATTERNS, arr, bundle, int, map, obj, ref, str } from './common.js';

const roll = { value: int(1, 10), fingerprint: ref('hash') };

export const DRAFT_DEFS = Object.freeze({
  draft: obj({
    format: { const: 'realmcraft-draft' },
    version: { const: 1 },
    people: ref('id'),
    turn: ref('turn'),
    baseRev: int(0, 999999),
    orders: arr(obj({ id: ref('orderId'), type: ref('order'), params: { type: 'object' } }), 16),
    // Labour of the turn: groups (clans) per target, where a target is a
    // resource key, "research" or a module activity ("hueten", "adepten").
    // The sum must not exceed population.core (issue labour).
    assign: map(str(PATTERNS.key), int(0, 99)),
    // Answers to open event decisions: pendingChoices id -> option id.
    choices: map(str(PATTERNS.id), ref('id')),
    // Main orders declared as Wagnis (venture), by order id.
    venture: map(str(PATTERNS.orderId), { const: true }),
    // Council member leading an order, by order id.
    lead: map(str(PATTERNS.orderId), ref('id')),
    // Orders pushed through without a council majority.
    mandate: map(str(PATTERNS.id), { const: 'decree' }),
    rolls: map(ref('probe'), obj(roll)),
    // A withdrawn rolled order stays visible in the round report.
    withdrawn: arr(obj({ probe: ref('probe'), ...roll }), 16),
    sealed: { type: 'boolean' },
  }, ['assign', 'choices', 'venture', 'lead']),
});

export const draft = bundle('draft/1', DRAFT_DEFS.draft, COMMON_DEFS, DRAFT_DEFS);

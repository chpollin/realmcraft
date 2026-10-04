// The player's draft for the current turn (engine/schemas/draft.js) as
// immutable updates. The board never edits campaign state; it edits this
// draft, previews it with the kernel and hands it to the server, whose CLI
// stores it.

import { emptyDraft } from './kernel.js';

const MAX_WITHDRAWN = 16;

/** The stored draft when it belongs to the view's turn and people, else a fresh one. */
export function draftFor(view, stored) {
  if (stored && stored.turn === view.turn && stored.people === view.people && stored.format === 'realmcraft-draft') {
    return { ...emptyDraft(view, view.people), ...stored, sealed: false };
  }
  return emptyDraft(view, view.people);
}

/** First free order id o1, o2, ...; "event" is reserved by the kernel. */
export function nextOrderId(draft) {
  const used = new Set(draft.orders.map((o) => o.id));
  for (let n = 1; ; n++) if (!used.has(`o${n}`)) return `o${n}`;
}

const without = (map, k) => {
  if (!map || !Object.hasOwn(map, k)) return map;
  const { [k]: _gone, ...rest } = map;
  return rest;
};

export function withOrder(draft, { type, params }, extra = {}) {
  const id = extra.id ?? nextOrderId(draft);
  let next = { ...draft, orders: [...draft.orders, { id, type, params }] };
  if (extra.venture) next = { ...next, venture: { ...(next.venture ?? {}), [id]: true } };
  if (extra.lead) next = { ...next, lead: { ...(next.lead ?? {}), [id]: extra.lead } };
  return next;
}

/**
 * Puts `cand` in place of order `replaceId`: the old order (and its roll, kept
 * in `withdrawn`) leaves, the new one keeps the old id so the draft order list
 * reads as one choice changed rather than one dropped and one added.
 */
export function withReplacedOrder(draft, replaceId, cand, extra = {}, probeId = null) {
  return withOrder(withoutOrder(draft, replaceId, probeId), cand, { ...extra, id: replaceId });
}

/** Drops a roll whose probe no longer exists; it stays visible in `withdrawn`. */
export function withoutRoll(draft, probeId) {
  const r = draft.rolls?.[probeId];
  if (!r) return draft;
  return { ...draft, rolls: without(draft.rolls, probeId), withdrawn: [...(draft.withdrawn ?? []), { probe: probeId, value: r.value, fingerprint: r.fingerprint }].slice(-MAX_WITHDRAWN) };
}

/**
 * Removes an order. A roll already made for it moves to `withdrawn`, so the
 * round report still shows it (schema: a withdrawn rolled order stays visible).
 */
export function withoutOrder(draft, id, probeId = null) {
  let next = { ...draft, orders: draft.orders.filter((o) => o.id !== id) };
  // Optional maps stay absent when the draft has none: a key holding undefined fails the draft schema in the browser preview.
  for (const field of ['venture', 'lead', 'mandate']) if (draft[field]) next[field] = without(draft[field], id);
  // A Machtprobe overriding this order loses its object.
  next = { ...next, orders: next.orders.filter((o) => !(o.type === 'machtprobe' && o.params?.order === id)) };
  return probeId ? withoutRoll(next, probeId) : next;
}

/** Stores a roll against the probe's current fingerprint; a replaced stale roll is kept in `withdrawn`. */
export function withRoll(draft, probeId, value, fingerprint) {
  const old = draft.rolls?.[probeId];
  const withdrawn = old && old.fingerprint !== fingerprint
    ? [...(draft.withdrawn ?? []), { probe: probeId, value: old.value, fingerprint: old.fingerprint }].slice(-MAX_WITHDRAWN)
    : draft.withdrawn ?? [];
  return { ...draft, rolls: { ...(draft.rolls ?? {}), [probeId]: { value, fingerprint } }, withdrawn };
}

export function withMandate(draft, orderId, on) {
  return { ...draft, mandate: on ? { ...(draft.mandate ?? {}), [orderId]: 'decree' } : without(draft.mandate ?? {}, orderId) };
}

export function withChoice(draft, choiceId, option) {
  return { ...draft, choices: option ? { ...(draft.choices ?? {}), [choiceId]: option } : without(draft.choices ?? {}, choiceId) };
}

export function withAssign(draft, assign) {
  return { ...draft, assign: Object.fromEntries(Object.entries(assign).filter(([, n]) => n > 0)) };
}

/** Rolls the player still owes: probes of the preview without a roll, or with a stale one. */
export function openRolls(draft, pv) {
  const stale = new Set((pv?.issues ?? []).filter((i) => i.code === 'roll_stale').map((i) => i.path.replace('/rolls/', '')));
  return (pv?.probes ?? []).filter((p) => p.roller === 'player' && (!draft.rolls?.[p.id] || stale.has(p.id)));
}

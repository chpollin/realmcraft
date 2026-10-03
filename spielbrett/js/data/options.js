// Orders a selection allows, decided by the kernel. For a selected tile,
// settlement or unit the board builds the parameter candidates of every order
// type the catalogue marks available, adds each to the draft and previews it;
// what the preview accepts is offered, what it refuses is shown with the
// kernel's reason. Costs, probe, slot and the change of every store come from
// that preview (Spieldesign D15), never from the board.

import { key, parseKey } from '../../../engine/world/index.js';
import { previewDraft } from './kernel.js';
import { withOrder } from './draft.js';
import { describeParams, issueText, issuesOfOrder, previewDeltas, slotArt } from './adapter.js';

const TILE_ORDERS = ['explore', 'found', 'migrate', 'road', 'road.pave'];

/** Parameter candidates per selection: [{ type, params }]. */
export function candidates(view, env, target) {
  const pid = view.people;
  const own = view.peoples[pid];
  const out = [];
  const tile = target.q !== undefined ? key(target.q, target.r) : null;
  const settlement = view.map.settlements.find((s) => s.id === target.id && s.people === pid)
    ?? (tile ? view.map.settlements.find((s) => s.tile === tile && s.people === pid) : null);
  const ownUnit = own.units.find((u) => u.id === target.id) ?? null;
  if (settlement) {
    for (const k of own.developments.known) {
      const ent = env.entwicklung(k.ref);
      if (ent?.kind === 'bauwerk') out.push({ type: 'build', params: { development: k.ref, settlement: settlement.id } });
      if (ent?.kind === 'einheit') out.push({ type: 'recruit', params: { settlement: settlement.id, type: k.ref } });
    }
  }
  if (ownUnit) out.push({ type: 'retreat', params: { unit: ownUnit.id } });
  if (tile && target.kind !== 'people' && target.kind !== 'region') {
    for (const type of TILE_ORDERS) out.push({ type, params: { tile } });
    if (!ownUnit) for (const u of own.units) out.push({ type: 'move', params: { unit: u.id, tile } });
  }
  return out;
}

const sameOrder = (a, b) => a.type === b.type && JSON.stringify(a.params) === JSON.stringify(b.params);

const modLabel = (t, label) => t(`tag.${label}`, t(label, label));

/**
 * One board option per candidate, previewed on the draft. base is the preview
 * of the draft as it stands; extra = { venture, lead } for the probe dialog.
 */
export function previewOption(ctx, cand, extra = {}) {
  const { view, env, t, draft, base, world } = ctx;
  const next = withOrder(draft, cand, extra);
  const order = next.orders.at(-1);
  const index = next.orders.length - 1;
  const pv = previewDraft(view, env, next);
  const po = pv.orders.find((o) => o.id === order.id);
  const probe = pv.probes.find((p) => p.order === order.id) ?? null;
  // Draft-wide errors the candidate causes (slot overflow sits at /orders) count as its own.
  const known = new Set((base?.issues ?? []).map((i) => `${i.code}|${i.path}`));
  const caused = pv.issues.filter((i) => i.severity === 'error' && !i.path.startsWith('/orders/') && !known.has(`${i.code}|${i.path}`));
  const errors = [...issuesOfOrder(pv, index, null), ...caused];
  const blocking = errors.filter((e) => e.code !== 'council_rejected');
  const vote = pv.votes.find((v) => v.order === order.id) ?? null;
  const pos = cand.params.tile ? parseKey(cand.params.tile) : null;
  return {
    id: `${cand.type}:${JSON.stringify(cand.params)}`,
    type: cand.type,
    params: cand.params,
    titel: t(`order.${cand.type}`, cand.type),
    ziel: describeParams(view, env, t, cand, world),
    art: slotArt(po?.slot),
    kosten: Object.entries(po?.costs ?? {}).filter(([, n]) => n > 0).map(([k, n]) => ({ key: k, menge: n })),
    probe: probe ? {
      id: probe.id,
      ziel: probe.target,
      chance: probe.chance,
      modTotal: probe.modTotal,
      fingerprint: probe.fingerprint,
      modifikatoren: probe.modifiers.filter((m) => !m.struck).map((m) => ({ wert: m.value, grund: modLabel(t, m.label) })),
      gekappt: probe.struck.map((m) => ({ wert: m.value, grund: modLabel(t, m.label) })),
      kernel: probe,
    } : null,
    folge: describeParams(view, env, t, cand, world),
    queued: draft.orders.some((o) => sameOrder(o, cand)),
    grund: blocking.length ? `${issueText(blocking[0], t)}${blocking[0].message ? `: ${blocking[0].message}` : ''}` : null,
    rat: vote?.required && !vote.passed ? vote : null,
    issues: errors,
    preview: { deltas: previewDeltas(view, base, pv), tiles: pos ? [pos] : [] },
    extra,
    pv,
  };
}

/** Options for a selection, in catalogue order; types the catalogue marks unavailable are left out. */
export function optionsFor(ctx, target) {
  const available = new Set((ctx.base?.catalogue ?? []).filter((c) => c.available).map((c) => c.type));
  return candidates(ctx.view, ctx.env, target)
    .filter((c) => available.has(c.type))
    .map((c) => previewOption(ctx, c));
}

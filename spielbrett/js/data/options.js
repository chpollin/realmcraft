// Orders a selection allows, decided by the kernel. For a selected tile,
// settlement or unit the board builds the parameter candidates of every order
// type the catalogue marks available, adds each to the draft and previews it;
// what the preview accepts is offered, what it refuses is shown with the
// kernel's reason. Costs, probe, slot and the change of every store come from
// that preview (Spieldesign D15), never from the board.

import { distance, key, parseKey, reveal } from '../../../engine/world/index.js';
import { previewDraft, isUnique } from './kernel.js';
import { withOrder, withReplacedOrder } from './draft.js';
import { describeParams, issueText, issuesOfOrder, previewDeltas, slotArt } from './adapter.js';
import { activeModules } from '../../../engine/modules/index.js';
import { activeDevelopments } from '../../../engine/core/state.js';
import { moveBudget, reach } from '../../../engine/core/map.js';
import { battleSpec, unitStats } from '../../../engine/core/military.js';
import { orderContext, registry } from '../../../engine/core/orders.js';
import { standingOf, ofOp } from '../../../engine/core/effects.js';
import { RULES } from '../../../engine/core/rules.js';

const TILE_ORDERS = ['explore', 'found', 'migrate', 'road', 'road.pave'];

/** Foreign units and settlements on a tile of the projection. */
function foreignOn(view, tile) {
  const pid = view.people;
  const units = Object.entries(view.peoples).filter(([id]) => id !== pid).flatMap(([id, p]) => (p.units ?? []).filter((u) => u.tile === tile).map((u) => ({ people: id, unit: u })));
  const settlements = view.map.settlements.filter((s) => s.tile === tile && s.people !== pid);
  return { units, settlements };
}

/**
 * Applications of the player's active disciplines whose target kind is `kind`,
 * as discipline.use candidates aimed at `value` (none takes no target).
 */
export function disciplineCandidates(view, env, kind, value) {
  const out = [];
  for (const d of activeDevelopments(view, env, view.people)) {
    if (d.ent.kind !== 'disziplin') continue;
    for (const app of d.ent.spec?.applications ?? []) {
      if (app.targetKind !== kind) continue;
      out.push({ type: 'discipline.use', params: { development: d.ref, application: app.id, ...(kind === 'none' ? {} : { target: value }) } });
    }
  }
  return out;
}

/** Ways of life the player knows besides the current one, as adopt candidates. */
export function adoptCandidates(view, env) {
  const own = view.peoples[view.people];
  return own.developments.known
    .filter((k) => k.state === 'active' && k.ref !== own.lebensweise && env.entwicklung(k.ref)?.kind === 'lebensweise')
    .map((k) => ({ type: 'adopt', params: { lebensweise: k.ref } }));
}

/**
 * Attack candidates against a tile held by another people: the own ready
 * units bordering it (all own units when none borders it, so the kernel names
 * why the attack fails) and a sortie from every bordering own fixed settlement.
 */
function attackCandidates(view, tile) {
  const pid = view.people;
  const { units, settlements } = foreignOn(view, tile);
  if (!units.length && !settlements.length) return [];
  const out = [];
  const attackers = attackersFor(view, tile);
  if (attackers.length) out.push({ type: 'attack', params: { units: attackers.map((u) => u.id), tile } });
  for (const s of view.map.settlements) {
    if (s.people === pid && !s.mobile && units.length && distance(parseKey(s.tile), parseKey(tile)) === 1) out.push({ type: 'ausfall', params: { settlement: s.id, tile } });
  }
  return out;
}

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
    out.push(...adoptCandidates(view, env), ...disciplineCandidates(view, env, 'none'));
  }
  if (ownUnit) out.push({ type: 'retreat', params: { unit: ownUnit.id } }, ...disciplineCandidates(view, env, 'unit', ownUnit.id));
  if (target.kind === 'people' && target.id !== pid) out.push(...disciplineCandidates(view, env, 'people', target.id));
  if (target.kind === 'region' && view.map.control[target.id] && view.map.control[target.id] !== pid) {
    const ready = own.units.filter((u) => u.state === 'ready');
    if (ready.length) out.push({ type: 'raubzug', params: { units: ready.map((u) => u.id), region: target.id } });
  }
  if (tile && target.kind !== 'people' && target.kind !== 'region') {
    // On a tile another people holds the attack is what the player came for, so it leads.
    out.push(...attackCandidates(view, tile));
    for (const type of TILE_ORDERS) out.push({ type, params: { tile } });
    if (!ownUnit) for (const u of own.units) out.push({ type: 'move', params: { unit: u.id, tile } });
    const foreign = foreignOn(view, tile).units.find((f) => f.unit.id === target.id);
    if (foreign) out.push(...disciplineCandidates(view, env, 'unit', `${foreign.people}:${foreign.unit.id}`));
    out.push(...disciplineCandidates(view, env, 'tile', tile), ...disciplineCandidates(view, env, 'region', tile));
  }
  return out;
}

/**
 * Data of the player's active modules as their derive hooks give it on the
 * projection: { moduleId: data }, the same objects the kernel's module views
 * select.
 */
export function moduleData(view, env) {
  const pid = view.people;
  const out = {};
  for (const m of activeModules(view, env, pid)) out[m.id] = m.module.hooks?.derive?.(view, env, pid, { id: m.id, bind: m.bind }) ?? {};
  return out;
}

/**
 * Where an own unit can go this season and what it sees: tiles within its
 * move budget (kernel reach over road-aware step costs) and the tiles its sight
 * radius reveals, with the people's sight.mod effects as the kernel counts them.
 */
export function unitReach(view, env, world, unitId) {
  const pid = view.people;
  const u = view.peoples[pid].units.find((x) => x.id === unitId);
  if (!u) return null;
  const standing = standingOf(view, env, pid);
  const stats = unitStats(view, env, pid, u, standing);
  const budget = moveBudget(stats.mobility);
  const tiles = u.state === 'ready' ? Object.keys(reach(view, world, u.tile, budget)).filter((k) => k !== u.tile) : [];
  const bonus = ofOp(standing, 'sight.mod').reduce((n, s) => n + s.effect.amount, 0);
  const radius = Math.max(0, RULES.unitSight + bonus);
  return { id: u.id, tile: u.tile, tiles, sight: Object.keys(reveal({}, parseKey(u.tile), radius, world)), radius, mobility: stats.mobility, strength: stats.strength, upkeep: stats.upkeep };
}

/** Own units that may attack a tile: the ready ones bordering it, else all, so the kernel names the refusal. */
export function attackersFor(view, tile) {
  const own = view.peoples[view.people].units;
  const near = own.filter((u) => u.state === 'ready' && distance(parseKey(u.tile), parseKey(tile)) === 1);
  return near.length ? near : own;
}

/**
 * The battle an attack on `tile` would fight, from the kernel's battle rule on
 * the projection: attack and defence strength, the garrison of a settlement,
 * the terrain and the probe target. null when no foreign unit or settlement
 * stands there or the people has no unit.
 */
export function attackForecast(view, env, tile) {
  const ids = attackersFor(view, tile).map((u) => u.id);
  if (!ids.length) return null;
  const spec = battleSpec(orderContext(view, env, view.people), ids, tile);
  if (spec.errorReason === 'no-foreign-target' || spec.errorReason === 'not-in-sight') return null;
  return {
    attackers: spec.attackers.map((a) => a.unit.id),
    invalid: spec.invalid.map((i) => ({ unit: i.id, reason: i.reason })),
    A: spec.A,
    D: spec.D,
    garrison: spec.garrison,
    terrain: spec.terrain,
    target: spec.target,
    defender: spec.defender,
  };
}

/**
 * What a market order gives and costs, from the order's own kernel plan:
 * { costs, gain: { res, amount }, price }. null when the order is not valid.
 */
export function marketQuote(view, env, params) {
  const def = registry()['trade.market']?.def;
  const ox = orderContext(view, env, view.people, { path: '/orders/0' });
  if (!def || def.check(ox, { id: 'q', type: 'trade.market', params }).length) return null;
  const plan = def.plan(ox, { id: 'q', type: 'trade.market', params });
  return { costs: plan.costs, gain: plan.gain, price: plan.price };
}

const sameOrder = (a, b) => a.type === b.type && JSON.stringify(a.params) === JSON.stringify(b.params);

const modLabel = (t, label) => t(`tag.${label}`, t(label, label));

/** The draft with the candidate added, or put in place of `replaceId`. */
function draftWith(draft, cand, extra, replaceId, base) {
  if (!replaceId) return withOrder(draft, cand, extra);
  const probeId = base?.probes?.find((p) => p.order === replaceId)?.id ?? null;
  return withReplacedOrder(draft, replaceId, cand, extra, probeId);
}

/**
 * One board option per candidate, previewed on the draft. base is the preview
 * of the draft as it stands; extra = { venture, lead } for the probe dialog.
 * A once-per-season order (research.assign) replaces its namesake in the
 * draft instead of colliding with it. extra.replace names an order the
 * candidate takes the place of; an option blocked only by a full slot carries
 * `ersatz`, the same option replacing the last order of that slot, so the
 * board can offer "ersetzen" instead of letting the slot overflow.
 */
export function previewOption(ctx, cand, extra = {}) {
  const { view, env, t, draft, base, world } = ctx;
  const { replace: wanted = null, ...ext } = extra;
  const namesake = isUnique(cand.type) ? draft.orders.find((o) => o.type === cand.type && !sameOrder(o, cand)) : null;
  const replaceId = wanted ?? namesake?.id ?? null;
  const next = draftWith(draft, cand, ext, replaceId, base);
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
  const replaced = replaceId ? draft.orders.find((o) => o.id === replaceId) : null;
  let ersatz = null;
  if (!replaceId && blocking.length && blocking.every((e) => e.code === 'slots') && po?.slot) {
    const sameSlot = (base?.orders ?? []).filter((o) => o.slot === po.slot);
    const last = sameSlot.at(-1);
    if (last) {
      const alt = previewOption(ctx, cand, { ...ext, replace: last.id });
      if (!alt.grund) ersatz = alt;
    }
  }
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
    grund: blocking.length ? issueText(blocking[0], t) : null,
    rat: vote?.required && !vote.passed ? vote : null,
    issues: errors,
    preview: { deltas: previewDeltas(view, base, pv), tiles: pos ? [pos] : [], ...(cand.params.region ? { region: cand.params.region } : {}) },
    extra: replaceId ? { ...ext, replace: replaceId } : ext,
    ersetzt: replaced ? { id: replaced.id, titel: t(`order.${replaced.type}`, replaced.type), ziel: describeParams(view, env, t, replaced, world) } : null,
    ersatz,
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

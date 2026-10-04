// The paths wheel as data: the research paths of the world with tier, cap and
// achievements, the research points of the season and the project that
// gathers them. Pure and DOM-free, so the unit tests run it in Node. Path
// state comes from the kernel's derived path view, costs from researchCost,
// points from the rule of resolveResearch (kernel.js seasonPoints); the board
// only arranges them.

import { pathsView, researchCost, seasonPoints } from './kernel.js';
import { KIND_ICON, kurzOf, seasonOf } from './adapter.js';

// One glyph per Hochland path; a path of another world falls back to the research glyph.
export const PATH_ICON = { nahrung: 'nahrung', gemeinschaft: 'rat', militaer: 'krieger', werk: 'technik', erkenntnis: 'sicht', magie: 'magie' };
export const pathIcon = (id) => PATH_ICON[id] ?? 'entwicklungen';
const STATE_ORDER = { known: 0, research: 1, candidate: 2 };

const practiceSum = (people, tags) => (people.practice?.ledger ?? [])
  .reduce((n, row) => n + tags.reduce((m, g) => m + (row.tags[g] ?? 0), 0), 0);

/** Research orders of the draft: the chosen project and the path direction. */
export function researchOrders(draft) {
  const assign = draft?.orders?.find((o) => o.type === 'research.assign') ?? null;
  const direct = draft?.orders?.find((o) => o.type === 'research.direct') ?? null;
  return { chosen: assign?.params?.development ?? null, direct: direct?.params ?? null };
}

/**
 * The project that gathers this season's points and what it gathers:
 * { ref, chosen, points, cost, progress, gain }, ref null without a project.
 * research.assign runs in the order step before the research step, so a
 * project chosen in the draft takes the points, else the first in research.
 */
export function currentResearch({ view, env, draft, pv }) {
  const pid = view.people;
  const dev = view.peoples[pid].developments;
  const { chosen } = researchOrders(draft);
  const listed = chosen && (dev.research.some((r) => r.ref === chosen) || dev.candidates.some((c) => c.ref === chosen));
  const ref = listed ? chosen : dev.research[0]?.ref ?? null;
  const points = seasonPoints(view, env, pid, pv?.assign ?? null, ref);
  if (!ref) return { ref: null, chosen: null, points, cost: null, progress: 0, gain: 0 };
  const cost = researchCost(view, env, pid, ref);
  const progress = dev.research.find((r) => r.ref === ref)?.progress ?? 0;
  return { ref, chosen: listed ? chosen : null, points, cost, progress, gain: Math.max(0, Math.min(cost, progress + points.total) - progress) };
}

/**
 * Wheel model of a real campaign. ctx = { view, env, t, draft, pv } with pv
 * the kernel preview of the draft (its labour feeds the points).
 */
export function wheelOf({ view, env, t, draft, pv }) {
  const pid = view.people;
  const people = view.peoples[pid];
  const dev = people.developments;
  const pv0 = view.derived?.[pid]?.pfade ?? pathsView(view, env, pid);
  const assigned = pv?.assign ?? null;
  const { chosen, direct } = researchOrders(draft);
  const now = currentResearch({ view, env, draft, pv });
  const current = now.ref;
  const defs = new Map((env.regeln.pfade?.paths ?? []).map((p) => [p.id, p]));
  const vocabulary = env.regeln.vocabulary ?? {};

  const node = (ref, pfad, state, extra = {}) => {
    const ent = env.entwicklung(ref);
    const cost = state === 'known' ? null : researchCost(view, env, pid, ref);
    const progress = extra.progress ?? 0;
    const pts = state === 'known' ? null : seasonPoints(view, env, pid, assigned, ref);
    const resources = Object.entries(ent?.cost?.resources ?? {}).map(([k, n]) => ({ key: k, menge: n }));
    const isCurrent = ref === current;
    const gain = isCurrent && cost !== null ? Math.max(0, Math.min(cost, progress + pts.total) - progress) : 0;
    return {
      ref,
      pfad,
      name: ent?.name ?? ref,
      kind: ent?.kind ?? null,
      kindName: ent?.kind ? t(`kind.${ent.kind}`, ent.kind) : '',
      icon: KIND_ICON[ent?.kind] ?? 'technik',
      tier: ent?.tier ?? 1,
      state,
      summary: ent?.summary ?? '',
      kurz: kurzOf(ent),
      resources,
      cost,
      progress,
      points: pts?.total ?? null,
      gain,
      current: isCurrent,
      chosen: ref === chosen,
      // Completion pays the resources; a project short of them waits at full progress.
      completes: isCurrent && cost !== null && progress + gain >= cost,
      waits: resources.some((r) => (people.resources[r.key] ?? 0) < r.menge),
      seasons: cost !== null && pts.total > 0 ? Math.ceil(Math.max(0, cost - progress) / pts.total) : null,
      ...extra,
    };
  };

  const paths = pv0.paths.map((p) => {
    const def = defs.get(p.id);
    const known = new Map(dev.known.map((k) => [k.ref, k]));
    const research = new Map(dev.research.map((r) => [r.ref, r]));
    const cands = new Map(dev.candidates.map((c) => [c.ref, c]));
    const nodes = [
      ...p.known.map((ref) => node(ref, p.id, 'known', { active: known.get(ref)?.state === 'active', since: known.get(ref)?.since ?? null })),
      ...p.research.map((ref) => node(ref, p.id, 'research', { progress: research.get(ref)?.progress ?? 0 })),
      // A candidate stays listed while it is researched; the wheel shows it once, in research.
      ...p.candidates.filter((ref) => !research.has(ref)).map((ref) => {
        const c = cands.get(ref);
        return node(ref, p.id, 'candidate', { expires: c ? seasonOf(env, t, c.expiresAt) : null, origin: c?.origin ?? null });
      }),
    ].sort((a, b) => a.tier - b.tier || STATE_ORDER[a.state] - STATE_ORDER[b.state] || (a.name < b.name ? -1 : 1));
    return {
      id: p.id,
      name: t(`pfad.${p.id}`, p.id),
      icon: pathIcon(p.id),
      open: p.open,
      openedAt: p.openedAt,
      tier: p.tier,
      cap: p.cap,
      done: p.done,
      next: p.next,
      opens: !p.open && def?.opens ? { tags: def.opens.practice, min: def.opens.min, have: practiceSum(people, def.opens.practice) } : null,
      tags: (def?.tags ?? []).filter((g) => Object.hasOwn(vocabulary, g)),
      directed: direct?.pfad === p.id,
      nodes,
    };
  });
  const top = env.regeln.pfade?.unlock?.length ?? 1;
  const tiers = Math.max(Math.min(top, env.regeln.tuning?.maxTier ?? top), ...paths.flatMap((p) => p.nodes.map((n) => n.tier)), 1);
  const all = paths.flatMap((p) => p.nodes);
  return { points: now.points, tiers, current, chosen, direct, paths, nodeOf: (ref) => all.find((n) => n.ref === ref) ?? null };
}

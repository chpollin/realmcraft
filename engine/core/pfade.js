// Paths (Pfade): the fixed research domains of a world (regeln.pfade). An
// achievement on a path is an ordinary Entwicklung; its path comes from an
// explicit `pfad` or from its tags. Only the opening turn of a path with an
// `opens` condition is stored (people.pfade.opened); tiers, gates and the
// board's view derive from the known achievements. A world without a pfade
// block has no paths, and every function here leaves research as it was.
//
// `env` is anything with { regeln, entwicklung(ref) }, so the content
// validator can pass a shim over its library.
//
//   pathsOf(env)                    path definitions in regeln order, [] without a block
//   pfadOf(env, ent)                path id of an Entwicklung, null without a block
//   pathOfTags(env, tags)           path with most tags in common, ties by order, else fallback
//   directTags(env, pathId)         first three vocabulary tags of a path (research.direct)
//   pfadeOf(people)                 people.pfade with its default
//   isOpen(env, people, pathId)     no condition, latched open, or an active achievement on it
//   pathTier(env, people, pathId)   tier reached through completed achievements
//   latch(env, people, turn)        people.pfade with the paths that open this season
//   openTier(state, env, pid)       people and world-age gate of the kernel TIERS
//   pointsOf(env, people)           research points of a season before research.mod
//   pathsView(state, env, pid)      derived[pid].pfade, also on a projection

import { RULES, tune } from './rules.js';
import { calendarOf } from './calendar.js';
import { settlementsOf } from './state.js';
import { TIERS } from '../schemas/effects.js';
import { MAX_TIER } from '../schemas/common.js';

const DEFAULT = Object.freeze({ opened: Object.freeze({}) });

export const pathsOf = (env) => env.regeln?.pfade?.paths ?? [];

const pathDef = (env, id) => pathsOf(env).find((p) => p.id === id) ?? null;

export function pathOfTags(env, tags) {
  const block = env.regeln?.pfade;
  if (!block) return null;
  let best = null;
  let score = 0;
  for (const p of block.paths) {
    const n = p.tags.filter((t) => tags.includes(t)).length;
    if (n > score) [best, score] = [p.id, n];
  }
  return best ?? block.fallback;
}

export function pfadOf(env, ent) {
  if (!ent || !env.regeln?.pfade) return null;
  if (typeof ent.pfad === 'string' && pathDef(env, ent.pfad)) return ent.pfad;
  return pathOfTags(env, ent.tags ?? []);
}

export function directTags(env, pathId) {
  const vocabulary = env.regeln?.vocabulary ?? {};
  return (pathDef(env, pathId)?.tags ?? []).filter((t) => Object.hasOwn(vocabulary, t)).slice(0, 3);
}

/** Absent before M1; read through here so a migrated people needs no rewrite to be read. */
export function pfadeOf(people) {
  return people?.pfade ?? DEFAULT;
}

/** Active known achievements on a path, resolved. */
function activeOn(env, people, pathId) {
  return (people?.developments?.known ?? [])
    .filter((k) => k.state === 'active')
    .map((k) => env.entwicklung(k.ref))
    .filter((e) => e && pfadOf(env, e) === pathId);
}

export function isOpen(env, people, pathId) {
  const def = pathDef(env, pathId);
  if (!def) return false;
  if (!def.opens || Object.hasOwn(pfadeOf(people).opened, pathId)) return true;
  return activeOn(env, people, pathId).length > 0;
}

const topTier = (env) => Math.min(MAX_TIER, env.regeln?.tuning?.maxTier ?? MAX_TIER, env.regeln?.pfade?.unlock.length ?? 0);

/**
 * Highest k with done(k-1) >= unlock[k-1] for every step up to k, where
 * done(j) counts the active achievements on the path of tier j or higher.
 */
export function pathTier(env, people, pathId) {
  const unlock = env.regeln?.pfade?.unlock;
  if (!unlock || !pathDef(env, pathId)) return 0;
  const tiers = activeOn(env, people, pathId).map((e) => e.tier);
  let tier = 0;
  for (let k = 1; k <= topTier(env); k++) {
    if (tiers.filter((t) => t >= k - 1).length < unlock[k - 1]) break;
    tier = k;
  }
  return tier;
}

const practiceSum = (people, tags) => (people?.practice?.ledger ?? [])
  .reduce((n, row) => n + tags.reduce((m, t) => m + (row.tags[t] ?? 0), 0), 0);

/**
 * people.pfade after the research step of `turn`: a path with an `opens`
 * condition opens once the practice ledger sums at least `min` over its
 * tags or the people knows an active achievement on it. The latch never closes.
 */
export function latch(env, people, turn) {
  const opened = { ...pfadeOf(people).opened };
  for (const p of pathsOf(env)) {
    if (!p.opens || Object.hasOwn(opened, p.id)) continue;
    if (practiceSum(people, p.opens.practice) >= p.opens.min || activeOn(env, people, p.id).length) opened[p.id] = turn;
  }
  return { ...pfadeOf(people), opened };
}

/**
 * Highest tier whose people gate and world-age gate are open; same rule as
 * engine/content/validate.js openTier, with known developments resolved through env.
 */
export function openTier(state, env, pid) {
  const people = state.peoples[pid];
  const known = people.developments.known.filter((k) => k.state === 'active').map((k) => env.entwicklung(k.ref)).filter(Boolean);
  const worldYear = calendarOf(env.regeln, state.turn).worldYear;
  const settlements = settlementsOf(state, pid).length;
  const maxTier = env.regeln.tuning?.maxTier ?? TIERS.length;
  let open = 1;
  for (const row of TIERS) {
    if (row.tier <= 1) continue;
    const g = row.gate;
    const below = known.filter((e) => e.tier >= row.tier - 1).length;
    if (below < g.prevTierKnown || people.population.core < g.groups || settlements < g.settlements || worldYear < g.worldYear) break;
    open = row.tier;
  }
  return Math.min(open, maxTier);
}

/** Points of a season before the research.mod effects that depend on the project's tags. */
export function pointsOf(env, people) {
  const base = RULES.researchBase;
  const labour = (people.population.assigned?.research ?? 0) * RULES.researchPerGroup;
  const knowledge = Math.min(people.resources[RULES.knowledge] ?? 0, tune(env, 'knowledgeSpend'));
  return { base, labour, knowledge, total: base + labour + knowledge };
}

/** The board's path state of one people; runs on the full state and on projectFor(). */
export function pathsView(state, env, pid) {
  const people = state.peoples[pid];
  const open = openTier(state, env, pid);
  const unlock = env.regeln?.pfade?.unlock ?? [];
  const top = topTier(env);
  const refsOn = (list, id) => list.map((x) => x.ref).filter((ref) => pfadOf(env, env.entwicklung(ref)) === id);
  const d = people.developments;
  return {
    points: pointsOf(env, people),
    paths: pathsOf(env).map((p) => {
      const on = activeOn(env, people, p.id);
      const tier = pathTier(env, people, p.id);
      const openedAt = pfadeOf(people).opened[p.id] ?? null;
      return {
        id: p.id,
        open: isOpen(env, people, p.id),
        openedAt,
        tier,
        cap: Math.min(tier, open),
        done: on.length,
        next: tier >= top ? null : { tier: tier + 1, needed: Math.max(0, unlock[tier] - on.filter((e) => e.tier >= tier).length) },
        known: refsOn(d.known, p.id),
        research: refsOn(d.research, p.id),
        candidates: refsOn(d.candidates, p.id),
      };
    }),
  };
}

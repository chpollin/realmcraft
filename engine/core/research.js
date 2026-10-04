// Research, candidates, research requests, tokens, the practice ledger and the
// deterministic pool offers of the open step (Regelkern section 8).
//
//   ORDERS                       research.assign, research.direct (free slot)
//   researchCost(state, env, pid, ref)   effective cost of a development for a people
//   resolveResearch(tc)          season step: points into research[0], completion
//   expire(tc)                   cleanup: candidates, tokens, requests that ran out
//   offerPool(tc, pid)           open step: pool candidates, ranked by practice
//   recordPractice(tc, pid, executed)    ring buffer of order tags
//   practiceTop(people, n)       strongest practice tags
//
// With paths in the world (regeln.pfade) the pool offers only achievements on
// an open path within its cap, research.direct may name a path, and the
// research step latches the paths that open. Candidates and research listed
// before a path gate existed stay valid.
//
// Whatever research completes acts from the next turn (effectiveFrom = turn + 1),
// so the standing effects of the new development never reach the turn that
// finished it.

import { RULES } from './rules.js';
import { idOfRef } from './env.js';
import { issue } from './issues.js';
import { evalCondition } from './conditions.js';
import { applyOnceList, ofOp, standingOf } from './effects.js';
import { addResource, noteChange, record, setPeople } from './log.js';
import { SUCCESS } from './probes.js';
import { isAlive, maxKnownTier, peopleIds } from './state.js';
import { directTags, isOpen, latch, openTier, pathTier, pathsOf, pfadOf, pointsOf } from './pfade.js';
import { activeModules } from '../modules/index.js';
import { TIERS } from '../schemas/effects.js';

// TUNING: research requests stay readable for the research agent this many turns.
const REQUEST_LIFE = 8;
const MAX_REQUESTS = 8;
const MAX_RESEARCH = 3;
const MAX_CANDIDATES = 6;
const DEFAULT_LIMITS = Object.freeze({ candidatesPerTurn: 3, aboveTier: 1, openCandidates: 6 });
const TOKEN_KINDS_EXPIRING = new Set(['breakthrough', 'impulse', 'crisis']);

const tagsOfRef = (env, ref) => env.entwicklung(ref)?.tags ?? [];

// --- orders -------------------------------------------------------------------

export const ORDERS = {
  'research.assign': {
    slot: 'free',
    unique: true,
    tags: (ox, o) => tagsOfRef(ox.env, o.params?.development),
    check(ox, o) {
      const ref = o.params?.development;
      const dev = ox.people.developments;
      const listed = typeof ref === 'string' && (dev.candidates.some((c) => c.ref === ref) || dev.research.some((r) => r.ref === ref));
      if (!listed || !ox.env.entwicklung(ref)) {
        const params = typeof ref === 'string' ? { reason: 'not-candidate', development: ref } : { reason: 'not-candidate' };
        return [issue('target', `${ox.path}/params`, 'development must be an open candidate or already in research', { params })];
      }
      return [];
    },
    plan: () => ({ costs: {}, probe: null }),
    resolve(tc, ox, o) {
      const ref = o.params.development;
      const list = tc.state.peoples[ox.pid].developments.research;
      const entry = list.find((r) => r.ref === ref) ?? { ref, progress: 0 };
      const next = [entry, ...list.filter((r) => r.ref !== ref)].slice(0, MAX_RESEARCH);
      setPeople(tc, ox.pid, 'developments.research', next, `order ${o.id}: research turns to ${ox.env.entwicklung(ref).name}`, { kind: 'research.assign', refs: [ref] });
    },
  },
  'research.direct': {
    slot: 'free',
    unique: true,
    tags: (ox, o) => requestTags(ox.env, o.params),
    check(ox, o) {
      const { pfad, tags, note } = o.params ?? {};
      const bad = (message, params) => [issue('target', `${ox.path}/params`, message, { params })];
      if (pfad !== undefined) {
        if (typeof pfad !== 'string' || !pathsOf(ox.env).some((p) => p.id === pfad)) return bad(`path ${JSON.stringify(pfad)} is not a path of this world`, { reason: 'unknown-pfad', pfad: String(pfad) });
        if (!isOpen(ox.env, ox.people, pfad)) return bad(`path ${pfad} is not open`, { reason: 'pfad-closed', pfad });
      }
      if (tags !== undefined || pfad === undefined) {
        if (!Array.isArray(tags) || tags.length < 1 || tags.length > 3) return bad('tags must list one to three vocabulary tags', { reason: 'tag-count' });
        if (new Set(tags).size !== tags.length) return bad('tags must be distinct', { reason: 'tag-duplicate' });
        const unknown = tags.find((t) => typeof t !== 'string' || !Object.hasOwn(ox.env.vocabulary, t));
        if (unknown !== undefined) return bad(`tag ${JSON.stringify(unknown)} is not in the world's vocabulary`, { reason: 'unknown-tag', tag: String(unknown) });
      }
      if (note !== undefined && (typeof note !== 'string' || note.length > 200)) return bad('note must be a text of at most 200 characters', { reason: 'note-length' });
      return [];
    },
    plan: () => ({ costs: {}, probe: null }),
    resolve(tc, ox, o) {
      const { pfad, note } = o.params;
      const request = { turn: tc.turn, tags: requestTags(ox.env, o.params), note: note ?? '', ...(pfad === undefined ? {} : { pfad }) };
      const list = [...tc.state.peoples[ox.pid].developments.requests, request].slice(-MAX_REQUESTS);
      setPeople(tc, ox.pid, 'developments.requests', list, `order ${o.id}: research request ${request.tags.join(', ')}${pfad ? ` on path ${pfad}` : ''}`, { kind: 'research.request' });
    },
  },
};

// A request on a path alone takes the path's first three vocabulary tags.
function requestTags(env, params) {
  if (Array.isArray(params?.tags)) return params.tags.filter((t) => typeof t === 'string');
  return typeof params?.pfad === 'string' ? directTags(env, params.pfad) : [];
}

// --- cost and tiers ---------------------------------------------------------------

/**
 * Effective research cost: base cost plus floor(base * n / complexityDivisor)
 * for n known developments, halved for a breakthrough candidate, within 1..maxProgress.
 */
export function researchCost(state, env, pid, ref) {
  const ent = env.entwicklung(ref);
  if (!ent) return RULES.maxProgress;
  const dev = state.peoples[pid].developments;
  const c = ent.cost.research;
  let cost = c + Math.floor((c * dev.known.length) / RULES.complexityDivisor);
  if (dev.candidates.find((x) => x.ref === ref)?.origin === 'breakthrough') cost = Math.floor(cost / 2);
  return Math.min(RULES.maxProgress, Math.max(1, cost));
}

/** Sum of the practice ledger, strongest n tags (ties by tag); same result as engine/content/validate.js. */
export function practiceTop(people, n = 3) {
  const sums = new Map();
  for (const row of people?.practice?.ledger ?? []) for (const [t, v] of Object.entries(row.tags)) sums.set(t, (sums.get(t) ?? 0) + v);
  return [...sums.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
}

// --- season step ----------------------------------------------------------------

function payable(people, bag) {
  return Object.entries(bag ?? {}).every(([res, n]) => (people.resources[res] ?? 0) >= n);
}

/**
 * Research of every people runs on the first project of its list. The list
 * is read from the working state because research.assign already ran this
 * turn, standing research.mod and the labour from the opening state.
 */
export function resolveResearch(tc) {
  const { env } = tc;
  for (const pid of peopleIds(tc.s0)) {
    if (!isAlive(tc.s0, pid)) continue;
    const people = tc.state.peoples[pid];
    const project = people.developments.research[0];
    if (!project) continue;
    const ent = env.entwicklung(project.ref);
    const name = ent?.name ?? project.ref;
    if (!ent || people.developments.known.some((k) => idOfRef(k.ref) === ent.id)) {
      // A project that vanished from the library or became known elsewhere has nothing left to research.
      setPeople(tc, pid, 'developments.research', people.developments.research.slice(1), `${name} leaves the research list`, { kind: 'research.progress', refs: [project.ref] });
      continue;
    }
    const cost = researchCost(tc.state, env, pid, project.ref);
    let progress = project.progress;
    // A project waiting for resources neither burns knowledge nor gathers points.
    if (progress < cost) {
      const { base, labour, knowledge: spend } = pointsOf(env, people);
      const mods = ofOp(standingOf(tc.s0, env, pid), 'research.mod')
        .filter((s) => s.effect.tags.some((t) => ent.tags.includes(t)))
        .reduce((n, s) => n + s.effect.amount, 0);
      if (spend > 0) addResource(tc, pid, RULES.knowledge, -spend, `${spend} knowledge burned into research of ${name}`, { refs: [project.ref] });
      const points = Math.max(0, base + labour + mods + spend);
      progress = Math.min(cost, progress + points);
      const next = people.developments.research.map((r, i) => (i === 0 ? { ref: r.ref, progress } : r));
      setPeople(tc, pid, 'developments.research', next,
        `${name}: ${points} research points (base ${base}, labour ${labour}, mods ${mods}, knowledge ${spend}), progress ${progress} of ${cost}`,
        { kind: 'research.progress', refs: [project.ref] });
    }
    if (progress >= cost) complete(tc, pid, project.ref, ent, cost);
  }
  // After completion, so an achievement finished this season opens its path now.
  for (const pid of peopleIds(tc.s0)) if (isAlive(tc.s0, pid)) openPaths(tc, pid);
}

/**
 * Latches the paths that open this season. A people from before paths
 * existed has no pfade record; the first research step stores the default
 * as a hidden bookkeeping entry, so every changed field keeps its log entry.
 */
function openPaths(tc, pid) {
  if (!pathsOf(tc.env).length) return;
  const people = tc.state.peoples[pid];
  if (!people.pfade) {
    noteChange(tc, 'research.pfade', { kind: 'people', id: pid }, 'pfade', null, { opened: {} }, 'path record starts').visibleTo = [];
    people.pfade = { opened: {} };
  }
  const next = latch(tc.env, people, tc.turn);
  for (const p of pathsOf(tc.env)) {
    if (Object.hasOwn(people.pfade.opened, p.id) || !Object.hasOwn(next.opened, p.id)) continue;
    setPeople(tc, pid, `pfade.opened.${p.id}`, tc.turn, `path ${p.id} opens for ${people.name}`, { kind: 'pfad.opened' });
  }
}

function complete(tc, pid, ref, ent, cost) {
  const people = tc.state.peoples[pid];
  const dev = people.developments;
  if (!payable(people, ent.cost.resources)) {
    record(tc, 'research.waiting', { kind: 'people', id: pid }, null, `${ent.name} is researched (${cost} of ${cost}) but its resources are not at hand`, { people: pid, refs: [ref] });
    return;
  }
  for (const [res, n] of Object.entries(ent.cost.resources)) addResource(tc, pid, res, -n, `${ent.name} costs ${n} ${res}`, { refs: [ref] });
  const entry = { ref, since: tc.turn, effectiveFrom: tc.turn + 1, state: 'active', suspendedSince: null };
  dev.known.push(entry);
  noteChange(tc, 'research.completed', { kind: 'people', id: pid }, 'developments.known', null, entry, `${ent.name} becomes known and acts from turn ${tc.turn + 1}`, { people: pid, refs: [ref] });
  setPeople(tc, pid, 'developments.research', dev.research.filter((r) => r.ref !== ref), `${ent.name} leaves the research list`, { kind: 'research.progress', refs: [ref] });
  setPeople(tc, pid, 'developments.candidates', dev.candidates.filter((c) => c.ref !== ref), `${ent.name} is no candidate any more`, { kind: 'research.progress', refs: [ref] });

  const replaced = [];
  for (const id of ent.replaces) {
    const i = dev.known.findIndex((k) => idOfRef(k.ref) === id && k.ref !== ref);
    if (i < 0) continue;
    const [gone] = dev.known.splice(i, 1);
    replaced.push(gone.ref);
    noteChange(tc, 'research.replaced', { kind: 'people', id: pid }, 'developments.known', gone, null, `${ent.name} replaces ${gone.ref}`, { people: pid, refs: [ref, gone.ref] });
  }
  if (replaced.length) {
    setPeople(tc, pid, 'developments.instituted', dev.instituted.filter((r) => !replaced.includes(r)), `${ent.name} replaces an institution`, { kind: 'development.instituted' });
  }
  applyOnceList(tc, pid, ent.onAcquire, { reason: `onAcquire of ${ent.name}`, refs: [ref] });
}

/**
 * Cleanup. A candidate runs out when the next planning would reach its
 * expiresAt; one already under research stays, so a breakthrough halving is
 * not lost mid-project. Tokens of kind breakthrough, impulse and crisis last
 * RULES.tokenLife turns, a grievance stays until it is quelled.
 */
export function expire(tc) {
  const upcoming = tc.turn + 1;
  for (const pid of peopleIds(tc.state)) {
    const people = tc.state.peoples[pid];
    const dev = people.developments;
    const researched = new Set(dev.research.map((r) => r.ref));
    const candidates = dev.candidates.filter((c) => c.expiresAt > upcoming || researched.has(c.ref));
    if (candidates.length !== dev.candidates.length) {
      const gone = dev.candidates.filter((c) => !candidates.includes(c)).map((c) => c.ref);
      setPeople(tc, pid, 'developments.candidates', candidates, `candidates run out: ${gone.join(', ')}`, { kind: 'research.expired', refs: gone });
    }
    const tokens = people.tokens.filter((k) => !TOKEN_KINDS_EXPIRING.has(k.kind) || tc.turn - k.turn <= RULES.tokenLife);
    if (tokens.length !== people.tokens.length) setPeople(tc, pid, 'tokens', tokens, 'tokens fade', { kind: 'token.expired' });
    const requests = dev.requests.filter((r) => tc.turn - r.turn <= REQUEST_LIFE);
    if (requests.length !== dev.requests.length) setPeople(tc, pid, 'developments.requests', requests, 'old research requests lapse', { kind: 'research.expired' });
  }
}

// --- practice ledger ----------------------------------------------------------------

/**
 * Appends the tags of this turn's executed orders to the ring buffer.
 * executed = [{ order, slot, tags, band }]. The command tag every main order
 * carries (RULES.mainTag) says nothing about what a people practises and stays out.
 */
export function recordPractice(tc, pid, executed) {
  const sums = {};
  for (const e of executed) {
    const w = (RULES.practice[e.slot] ?? 0) + (SUCCESS.has(e.band) ? RULES.practice.success : 0);
    if (w === 0) continue;
    for (const t of e.tags) if (t !== RULES.mainTag) sums[t] = (sums[t] ?? 0) + w;
  }
  const tags = {};
  for (const t of Object.keys(sums).sort()) tags[t] = Math.min(20, Math.max(1, sums[t]));
  if (!Object.keys(tags).length) return;
  const ledger = [...tc.state.peoples[pid].practice.ledger, { turn: tc.turn, tags }].slice(-RULES.practice.turns);
  setPeople(tc, pid, 'practice.ledger', ledger, `practice of turn ${tc.turn}: ${Object.keys(tags).join(', ')}`, { kind: 'practice.recorded' });
}

// --- pool offers ----------------------------------------------------------------

function latestWorldPool(env) {
  const latest = new Map();
  for (const e of env.content.entwicklungen) {
    if (e.tier < 1 || e.origin?.source !== 'world') continue;
    const cur = latest.get(e.id);
    if (!cur || cur.rev < e.rev) latest.set(e.id, e);
  }
  return [...latest.values()];
}

/**
 * The deterministic possibility space without agents: world developments the
 * people may research next (within the open tier and, with paths, on an open
 * path within its tier), ranked by overlap with its three strongest
 * practice tags and then by id, within tuning.limits. Candidates agents offered
 * this turn use up the same limits.
 */
export function offerPool(tc, pid) {
  const { env, s0 } = tc;
  const people = s0.peoples[pid];
  const dev = tc.state.peoples[pid].developments;
  const limits = { ...DEFAULT_LIMITS, ...(env.regeln.tuning?.limits ?? {}) };
  const open = Math.min(openTier(s0, env, pid), env.regeln.tuning?.maxTier ?? TIERS.length);
  const known = new Set(people.developments.known.map((k) => idOfRef(k.ref)));
  const taken = new Set([...dev.candidates, ...dev.research].map((x) => idOfRef(x.ref)));
  const top = new Set(practiceTop(people, 3).map(([t]) => t));
  const cx = {
    state: s0, env, pid, cal: tc.cal, world: tc.world,
    isModuleActive: (p, id) => activeModules(s0, env, p).some((m) => m.id === id),
  };
  const maxKnown = maxKnownTier(s0, env, pid);
  // Path gate: an open path, and the achievement's tier within the path's tier.
  const onPath = (e) => {
    const p = pfadOf(env, e);
    return p === null || (isOpen(env, people, p) && e.tier <= pathTier(env, people, p));
  };

  const ranked = latestWorldPool(env)
    .filter((e) => !known.has(e.id) && !taken.has(e.id) && e.tier <= open && onPath(e))
    .filter((e) => e.prerequisites.all.every((id) => known.has(id)))
    .filter((e) => e.prerequisites.any.length === 0 || e.prerequisites.any.some((id) => known.has(id)))
    .filter((e) => !e.prerequisites.if || evalCondition(e.prerequisites.if, cx))
    .map((e) => ({ e, overlap: [...new Set([...e.origin.practiceTags, ...e.tags])].filter((t) => top.has(t)).length }))
    .sort((a, b) => b.overlap - a.overlap || (a.e.id < b.e.id ? -1 : 1));

  const offeredNow = dev.candidates.filter((c) => c.offeredAt === tc.turn);
  const room = Math.min(limits.candidatesPerTurn - offeredNow.length, Math.min(limits.openCandidates, MAX_CANDIDATES) - dev.candidates.length);
  let above = offeredNow.filter((c) => (env.entwicklung(c.ref)?.tier ?? 0) > maxKnown).length;
  const added = [];
  for (const { e } of ranked) {
    if (added.length >= room) break;
    if (e.tier > maxKnown) {
      if (above >= limits.aboveTier) continue;
      above++;
    }
    added.push({ ref: `${e.id}@${e.rev}`, offeredAt: tc.turn, expiresAt: tc.turn + RULES.candidateLife, origin: 'pool' });
  }
  if (!added.length) return;
  setPeople(tc, pid, 'developments.candidates', [...dev.candidates, ...added], `pool offers ${added.map((c) => c.ref).join(', ')}`,
    { kind: 'research.offer', refs: added.map((c) => c.ref) });
}

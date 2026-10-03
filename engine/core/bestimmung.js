// Bestimmung (destiny): milestone predicates, the season check, victory and
// collapse (Regelkern section 13).
//
//   initBestimmung(env, ref, turn, at?)   fresh per-people state for a destiny
//   evalPredicate(pred, cx)           one predicate on a state; cx = { state, env, pid, world? }
//   canSwitchDestiny(state, env, pid) practice condition of a switch (Regelkern section 13, Wechsel)
//   offerDestiny / offerDestinyPool   offers a destiny the people may adopt
//   destinyDifficulty(env, def, at?)  difficulty of a destiny, the tie-break of a shared victory
//   ORDERS['destiny.adopt']           council order that replaces the destiny
//   resolveBestimmung(tc)             season end: collapse, milestones, victory
//
// Milestones are read from the end-of-turn state, after economy, research,
// military and events have written their changes.

import { RULES, tune } from './rules.js';
import { idOfRef } from './env.js';
import { WEIGHTS } from '../schemas/effects.js';
import { calendarOf } from './calendar.js';
import { issue } from './issues.js';
import { applyOnce } from './effects.js';
import { statsOf } from './stats.js';
import { changeLoyalty, noteChange, notice, record, setControl, setPeople } from './log.js';
import { controlledRegions, peopleIds, regionTerrain, relKey, settlementsOf } from './state.js';

const MAX_HISTORY = 20;

/**
 * `at` = { state, pid } is the people's situation at adoption; the difficulty
 * of the destiny is measured against it and stored. Without `at` (campaign
 * creation) nothing is stored and resolveBestimmung measures on demand.
 */
export function initBestimmung(env, ref, turn, at = null) {
  const b = env.bestimmung(ref);
  if (!b) return null;
  const init = { ref, adoptedAt: turn, milestones: b.milestones.map((m) => ({ id: m.id, reached: false, reachedAt: null, progress: 0 })), history: [] };
  if (at) init.difficulty = destinyDifficulty(env, b, at);
  return init;
}

const alive = (state, pid, env) => state.peoples[pid].population.core >= tune(env, 'collapseCore') && state.map.settlements.some((s) => s.people === pid);
const cmpOk = (cmp, v, value) => (cmp === 'gte' ? v >= value : v < value);

/**
 * Truth of one predicate on cx.state. A `holds` predicate answers with its
 * inner predicate; counting the series is the job of resolveBestimmung.
 */
export function evalPredicate(pred, cx) {
  const { state, env, pid } = cx;
  const people = state.peoples[pid];
  if (!people) return false;
  switch (pred.pred) {
    case 'holds':
      return evalPredicate(pred.predicate, cx);
    case 'controls': {
      let regions = controlledRegions(state, pid);
      if (pred.terrain) {
        const world = cx.world ?? env.world(state.map.seed);
        regions = regions.filter((r) => regionTerrain(world, r) === pred.terrain);
      }
      return regions.length >= pred.count;
    }
    case 'stat.atLeast':
      return (cx.stats ??= statsOf(state, env, pid))[pred.key] >= pred.value;
    case 'resource.atLeast':
      return (people.resources[pred.key] ?? 0) >= pred.value;
    case 'population.atLeast':
      return people.population.core >= pred.value;
    case 'relation': {
      const value = (o) => state.relations[relKey(pid, o)]?.value;
      const test = (o) => value(o) !== undefined && cmpOk(pred.cmp, value(o), pred.value);
      if (pred.people !== '$any' && pred.people !== '$all') return test(pred.people);
      // Peoples that have gone under no longer count as partners.
      const others = peopleIds(state).filter((o) => o !== pid && alive(state, o, env));
      return pred.people === '$any' ? others.some(test) : others.length > 0 && others.every(test);
    }
    case 'development.known': {
      const n = people.developments.known.filter((k) => {
        if (k.state !== 'active') return false;
        const ent = env.entwicklung(k.ref);
        if (!ent) return false;
        if (pred.kind && ent.kind !== pred.kind) return false;
        if (pred.tier !== undefined && ent.tier < pred.tier) return false;
        if (pred.tags && !pred.tags.some((t) => ent.tags.includes(t))) return false;
        return true;
      }).length;
      return n >= pred.count;
    }
    case 'subjugated': {
      const other = state.peoples[pred.people];
      if (!other) return false;
      return other.population.core === 0 || (settlementsOf(state, pred.people).length === 0 && controlledRegions(state, pred.people).length === 0);
    }
    case 'settlement':
      return settlementsOf(state, pid).filter((s) => s.kind === pred.kind).length >= pred.count;
    default:
      throw new Error(`evalPredicate: unknown predicate ${JSON.stringify(pred)}`);
  }
}

// --- difficulty -------------------------------------------------------------------

// The core must stay loadable without engine/content/library.js, which
// engine/content/budget.js imports, so the difficulty rule of scoreBestimmung
// is mirrored here from the same WEIGHTS rows. A unit test pins both to the
// same numbers; change them together.
const DW = Object.freeze({
  controls: 3,
  stat: WEIGHTS['stat.mod'].perPoint,
  population: WEIGHTS['population.delta'].perPoint,
  resourcePerUnit: 3 / 4,
  relation: 2,
  knownPerTier: 3,
  subjugated: 2 * WEIGHTS['region.control'].fixed,
  settlement: 3,
});

// Baseline of a people: the situation at adoption, or an empty people without `at`.
function baselineOf(env, at) {
  const state = at?.state;
  const pid = at?.pid;
  const people = state?.peoples?.[pid];
  const statBase = (k) => env.regeln.stats.find((s) => s.id === k)?.base ?? 0;
  const stats = people ? statsOf(state, env, pid) : null;
  let byTerrain = null;
  return {
    controls: people ? controlledRegions(state, pid).length : 0,
    byTerrain(terrain) {
      if (!people) return 0;
      if (!byTerrain) {
        const world = env.world(state.map.seed);
        byTerrain = {};
        for (const r of controlledRegions(state, pid)) {
          const t = regionTerrain(world, r);
          byTerrain[t] = (byTerrain[t] ?? 0) + 1;
        }
      }
      return byTerrain[terrain] ?? 0;
    },
    population: people?.population?.core ?? 0,
    resource: (k) => people?.resources?.[k] ?? 0,
    stat: (k) => stats?.[k] ?? statBase(k),
    relation(other) {
      if (!people) return 0;
      if (other === '$any' || other === '$all') {
        const values = Object.entries(state.relations ?? {}).filter(([k]) => k.split('|').includes(pid)).map(([, r]) => r.value);
        if (!values.length) return 0;
        return other === '$any' ? Math.max(...values) : Math.min(...values);
      }
      return state.relations?.[relKey(pid, other)]?.value ?? 0;
    },
    known: (people?.developments?.known ?? []).filter((k) => k.state === 'active').map((k) => env.entwicklung(k.ref)).filter(Boolean),
    settlements: (kind) => (people ? settlementsOf(state, pid).filter((s) => s.kind === kind).length : 0),
  };
}

function predicateDifficulty(pred, base, env) {
  switch (pred.pred) {
    case 'controls':
      return DW.controls * Math.max(0, pred.count - (pred.terrain ? base.byTerrain(pred.terrain) : base.controls));
    case 'stat.atLeast':
      return DW.stat * Math.max(0, pred.value - base.stat(pred.key));
    case 'resource.atLeast': {
      const value = env.regeln.resources.find((r) => r.id === pred.key)?.value ?? 1;
      return Math.ceil(Math.max(0, pred.value - base.resource(pred.key)) * value * DW.resourcePerUnit);
    }
    case 'population.atLeast':
      return DW.population * Math.max(0, pred.value - base.population);
    case 'relation': {
      const cur = base.relation(pred.people);
      return DW.relation * (pred.cmp === 'gte' ? Math.max(0, pred.value - cur) : Math.max(0, cur - pred.value + 1));
    }
    case 'development.known': {
      const have = base.known.filter((e) => (!pred.kind || e.kind === pred.kind)
        && (pred.tier === undefined || e.tier >= pred.tier)
        && (!pred.tags || pred.tags.some((t) => e.tags.includes(t)))).length;
      return DW.knownPerTier * Math.max(1, pred.tier ?? 1) * Math.max(0, pred.count - have);
    }
    case 'subjugated':
      return DW.subjugated;
    case 'settlement':
      return DW.settlement * Math.max(0, pred.count - base.settlements(pred.kind));
    case 'holds':
      return predicateDifficulty(pred.predicate, base, env) + pred.seasons;
    default:
      throw new Error(`destinyDifficulty: no difficulty rule for predicate "${pred.pred}"`);
  }
}

/** Difficulty D of a destiny definition, measured against at = { state, pid } or an empty people. */
export function destinyDifficulty(env, def, at = null) {
  const base = baselineOf(env, at);
  return def.milestones.reduce((sum, m) => sum + predicateDifficulty(m.predicate, base, env), 0);
}

// --- switching and offers -----------------------------------------------------------

// Regelkern section 13 (Wechsel): a switch needs four turns in a row without practice in the old destiny's field.
const SWITCH_STREAK = 4;
const MAX_OFFERS = 2;

/**
 * Whether the practice of the four turns before state.turn never touched a tag
 * of the people's destiny. The ledger holds a row only for a turn in which
 * tagged orders ran, so a missing row means no practice at all. Such a gap is
 * not accepted as divergence: a people that did nothing has not turned to
 * another field, and Wechsel asks for a Richtungswechsel. All four rows must
 * exist, be the four turns immediately before the current one, and carry no
 * tag of the destiny. A people without a destiny has nothing to diverge from.
 * Works on a full state and on a projection (own people only).
 */
export function canSwitchDestiny(state, env, pid) {
  const people = state.peoples[pid];
  if (!people) return false;
  const cur = people.bestimmung;
  if (!cur) return true;
  const tags = new Set(env.bestimmung(cur.ref)?.tags ?? []);
  const byTurn = new Map((people.practice?.ledger ?? []).map((row) => [row.turn, row.tags]));
  for (let t = state.turn - SWITCH_STREAK; t < state.turn; t++) {
    const row = byTurn.get(t);
    if (!row || Object.keys(row).some((tag) => tags.has(tag))) return false;
  }
  return true;
}

/** Destiny of another people with this id, whatever its revision; foreign destinies are absent from a projection. */
function heldByRival(state, pid, ref) {
  const id = idOfRef(ref);
  return Object.keys(state.peoples).some((x) => x !== pid && state.peoples[x].bestimmung && idOfRef(state.peoples[x].bestimmung.ref) === id);
}

// An offer lives as long as a development candidate offered in the same open step (RULES.candidateLife).
const offerAlive = (state, offer) => state.turn - offer.offeredAt < RULES.candidateLife;

/** Offers the people can act on now: young enough, resolvable, still free and with the practice condition met. */
function liveOffers(state, env, pid) {
  const cur = state.peoples[pid]?.bestimmung;
  if (!cur?.offers?.length || !canSwitchDestiny(state, env, pid)) return [];
  return cur.offers.filter((o) => offerAlive(state, o) && env.bestimmung(o.ref) && idOfRef(o.ref) !== idOfRef(cur.ref) && !heldByRival(state, pid, o.ref));
}

/**
 * Why `ref` cannot be adopted by pid on this state, or null. Run on the
 * projection when a draft is checked and again on the full state at
 * resolution, because a projection hides the destinies of the other peoples.
 */
function adoptBlock(state, env, pid, ref) {
  const blocked = (code, reason, message) => ({ code, message, params: { reason } });
  const cur = state.peoples[pid].bestimmung;
  if (cur?.ref === ref) return blocked('target', 'own-destiny', 'this destiny is already the people\'s own');
  // The destiny a people starts with carries no year of its own; only a switch (history) or a later adoption starts the yearly limit.
  if (cur && (cur.adoptedAt > 0 || cur.history.length > 0) && yearOf(env, cur.adoptedAt) === yearOf(env, state.turn)) {
    return blocked('duplicate', 'changed-this-year', 'the destiny was changed this year already');
  }
  if (heldByRival(state, pid, ref)) return blocked('target', 'held-by-rival', 'another people holds this destiny');
  // A people without a destiny chooses its first one freely; the practice and offer rules apply to a switch.
  if (cur) {
    if (!canSwitchDestiny(state, env, pid)) return blocked('target', 'practice-touches-destiny', 'the practice of the last four turns still touches the destiny, no switch yet');
    if (!liveOffers(state, env, pid).some((o) => o.ref === ref)) return blocked('target', 'not-offered', 'this destiny was not offered to the people');
  }
  return null;
}

/**
 * Appends an offer to the people's destiny state, visible to that people only.
 * Returns an issue array, empty when the offer was made. opts.path is the
 * issue pointer. Works on tc.state; agent offers arrive in the agents phase,
 * after the turn counter moved on, so the ledger already holds the last turn.
 */
export function offerDestiny(tc, pid, ref, origin, opts = {}) {
  const path = opts.path ?? '/bestimmung';
  const bad = (reason, message) => [issue('target', path, message, { params: { reason } })];
  const state = tc.state;
  const cur = state.peoples[pid]?.bestimmung;
  if (!cur) return bad('no-destiny-state', 'the people has no destiny state to hold an offer');
  if (origin !== 'agent' && origin !== 'pool') return bad('origin', 'origin must be agent or pool');
  if (typeof ref !== 'string' || !tc.env.bestimmung(ref)) return bad('unknown-destiny', 'bestimmung must be a destiny of this world');
  if (!canSwitchDestiny(state, tc.env, pid)) return bad('practice-touches-destiny', 'the practice of the last four turns still touches the destiny, no offer yet');
  if (idOfRef(ref) === idOfRef(cur.ref)) return bad('own-destiny', 'this destiny is already the people\'s own');
  if (heldByRival(state, pid, ref)) return bad('held-by-rival', 'another people holds this destiny');
  const live = liveOffers(state, tc.env, pid);
  if (live.some((o) => idOfRef(o.ref) === idOfRef(ref))) return bad('offered-already', 'this destiny is offered already');
  if (live.length >= MAX_OFFERS) return bad('offers-full', 'two offers are open already');
  const next = [...live, { ref, offeredAt: tc.turn, origin }];
  setPeople(tc, pid, 'bestimmung.offers', next, `${origin} offers the destiny ${tc.env.bestimmung(ref).name}`, { kind: 'bestimmung.offer', refs: [ref] });
  return [];
}

/**
 * Open step without agents: when the switch condition holds and no offer is
 * open, offers up to two destinies of the world package whose tags meet the
 * people's recent practice, strongest overlap first, then by id. Dead offers
 * (too old, condition gone) are dropped here.
 */
export function offerDestinyPool(tc, pid) {
  const state = tc.state;
  const cur = state.peoples[pid]?.bestimmung;
  if (!cur) return;
  const live = liveOffers(state, tc.env, pid);
  if (live.length !== (cur.offers ?? []).length) {
    setPeople(tc, pid, 'bestimmung.offers', live.length ? live : undefined, 'offers of a destiny lapse', { kind: 'bestimmung.offer' });
  }
  if (live.length || !canSwitchDestiny(state, tc.env, pid)) return;
  const practiced = new Set();
  for (const row of state.peoples[pid].practice?.ledger ?? []) for (const t of Object.keys(row.tags)) practiced.add(t);
  const latest = new Map();
  for (const b of tc.env.content.bestimmungen) {
    const have = latest.get(b.id);
    if (!have || have.rev < b.rev) latest.set(b.id, b);
  }
  const ranked = [...latest.values()]
    .filter((b) => idOfRef(cur.ref) !== b.id && !heldByRival(state, pid, b.id))
    .map((b) => ({ b, overlap: b.tags.filter((t) => practiced.has(t)).length }))
    .filter((x) => x.overlap > 0)
    .sort((a, c) => c.overlap - a.overlap || (a.b.id < c.b.id ? -1 : 1));
  for (const { b } of ranked.slice(0, MAX_OFFERS)) offerDestiny(tc, pid, `${b.id}@${b.rev}`, 'pool');
}

// --- destiny.adopt ---------------------------------------------------------------

const yearOf = (env, turn) => calendarOf(env.regeln, turn).year;

export const ORDERS = {
  'destiny.adopt': {
    slot: 'main',
    tags: ['bestimmung'],
    unique: true,
    check(ox, o) {
      const ref = o.params?.bestimmung;
      if (typeof ref !== 'string' || !ox.env.bestimmung(ref)) return [issue('target', `${ox.path}/params`, 'bestimmung must be a destiny of this world', { params: { reason: 'unknown-destiny' } })];
      const block = adoptBlock(ox.state, ox.env, ox.pid, ref);
      return block ? [issue(block.code, `${ox.path}/params`, block.message, { params: block.params })] : [];
    },
    plan: () => ({ costs: {}, probe: null }),
    resolve(tc, ox, o) {
      const pid = ox.pid;
      const ref = o.params.bestimmung;
      // The full opening state decides: a draft check ran on the projection, which hides the destinies of the other peoples.
      const block = adoptBlock(tc.s0, tc.env, pid, ref);
      if (block) {
        notice(tc, 'order.blocked', { kind: 'people', id: pid }, `order ${o.id}: ${block.message}, the destiny does not change`, { people: pid, refs: [ref] });
        return;
      }
      const old = tc.state.peoples[pid].bestimmung;
      const next = initBestimmung(tc.env, ref, tc.turn, { state: tc.s0, pid });
      if (!next) return;
      const history = [...(old?.history ?? [])];
      if (old) history.push({ ref: old.ref, adoptedAt: old.adoptedAt, endedAt: tc.turn, outcome: 'switched' });
      next.history = history.slice(-MAX_HISTORY);
      const reason = `order ${o.id}: destiny changes to ${tc.env.bestimmung(ref).name}`;
      setPeople(tc, pid, 'bestimmung', next, reason, { kind: 'bestimmung.adopt', refs: [ref] });
      applyOnce(tc, pid, { op: 'standing.delta', amount: -1 }, { reason: `${reason} costs standing`, refs: [ref] });
      const oldTags = old ? tc.env.bestimmung(old.ref)?.tags ?? [] : [];
      for (const m of tc.state.peoples[pid].council) {
        if (m.goal.favor.some((t) => oldTags.includes(t))) changeLoyalty(tc, pid, m.id, -2, `${m.name} mourns the old destiny`);
      }
    },
  },
};

// --- season end ------------------------------------------------------------------

function collapse(tc, pid) {
  const people = tc.state.peoples[pid];
  const core = people.population.core;
  const reason = core === 0 ? `${people.name} has no clan left`
    : core < tune(tc.env, 'collapseCore') ? `${people.name} has too few clans left to hold together`
      : `${people.name} has no settlement left`;
  record(tc, 'people.collapsed', { kind: 'people', id: pid }, null, reason, { people: pid, visibleTo: 'all' });
  if (people.units.length) setPeople(tc, pid, 'units', [], `${people.name} collapses, its units dissolve`, { kind: 'unit.dissolved' });
  // Labour may not exceed the clans left, and none are left.
  setPeople(tc, pid, 'population.assigned', {}, `${people.name} collapses, no clan works any more`, { kind: 'population.assign' });
  for (const region of controlledRegions(tc.state, pid)) setControl(tc, region, null, `${people.name} collapses, its region falls free`, { people: pid });
  applyOnce(tc, pid, { op: 'flag.set', flag: 'kern.collapsed', value: true }, { reason: 'collapse is recorded once' });
  return reason;
}

// A destiny adopted by destiny.adopt in this turn counts from the next season on. The starting destiny
// (adoptedAt 0 at turn 0) is the same in S0 and in the working state, so only a replaced one differs.
function adoptedThisTurn(tc, pid) {
  const now = tc.state.peoples[pid].bestimmung;
  const before = tc.s0.peoples[pid]?.bestimmung;
  return Boolean(now) && (!before || before.ref !== now.ref || before.adoptedAt !== now.adoptedAt);
}

function checkMilestones(tc, pid) {
  const people = tc.state.peoples[pid];
  const state = people.bestimmung;
  const def = state && tc.env.bestimmung(state.ref);
  if (!def) return;
  const cx = { state: tc.state, env: tc.env, pid, world: tc.world };
  const reachedNow = [];
  const milestones = state.milestones.map((m) => {
    const md = def.milestones.find((x) => x.id === m.id);
    if (m.reached || !md) return m;
    if (md.predicate.pred === 'holds') {
      const progress = evalPredicate(md.predicate.predicate, cx) ? Math.min(99, m.progress + 1) : 0;
      const reached = progress >= md.predicate.seasons;
      if (reached) reachedNow.push(md);
      return { ...m, progress, reached, reachedAt: reached ? tc.turn : null };
    }
    const reached = evalPredicate(md.predicate, cx);
    if (reached) reachedNow.push(md);
    return reached ? { ...m, reached: true, reachedAt: tc.turn } : m;
  });
  setPeople(tc, pid, 'bestimmung.milestones', milestones, `milestones of ${def.name} checked`, { kind: 'bestimmung.milestone' });
  for (const md of reachedNow) {
    record(tc, 'bestimmung.reached', { kind: 'people', id: pid }, null, `milestone reached: ${md.text}`, { people: pid, refs: [state.ref] });
  }
}

export function resolveBestimmung(tc) {
  if (tc.state.status === 'ended') return;
  const { state } = tc;
  for (const pid of peopleIds(state)) {
    if (!alive(state, pid, tc.env) && !state.peoples[pid].modules?.kern?.flags?.['kern~collapsed']) collapse(tc, pid);
  }
  for (const pid of peopleIds(state)) {
    if (alive(state, pid, tc.env) && !adoptedThisTurn(tc, pid)) checkMilestones(tc, pid);
  }

  const fulfilled = peopleIds(state).filter((pid) => {
    const b = state.peoples[pid].bestimmung;
    return alive(state, pid, tc.env) && b && b.milestones.length > 0 && b.milestones.every((m) => m.reached);
  });
  if (fulfilled.length) {
    // Regelkern section 13: the higher difficulty of the destiny wins a tie, then the smaller id (ids come sorted, the sort is stable).
    const difficulty = (pid) => {
      const b = state.peoples[pid].bestimmung;
      const def = tc.env.bestimmung(b.ref);
      return b.difficulty ?? (def ? destinyDifficulty(tc.env, def) : 0);
    };
    const winner = fulfilled.map((pid) => ({ pid, d: difficulty(pid) })).sort((a, b) => b.d - a.d)[0].pid;
    const people = state.peoples[winner];
    const def = tc.env.bestimmung(people.bestimmung.ref);
    const history = [...people.bestimmung.history, { ref: people.bestimmung.ref, adoptedAt: people.bestimmung.adoptedAt, endedAt: tc.turn, outcome: 'fulfilled' }].slice(-MAX_HISTORY);
    setPeople(tc, winner, 'bestimmung.history', history, `${people.name} fulfils its destiny`, { kind: 'bestimmung.fulfilled', visibleTo: 'all' });
    const reason = `${people.name} fulfils the destiny ${def?.name ?? people.bestimmung.ref}`.slice(0, 200);
    end(tc, { winner, kind: 'victory', turn: tc.turn, reason }, 'campaign.victory');
    return;
  }
  const player = state.campaign.player;
  if (!alive(state, player, tc.env)) {
    const people = state.peoples[player];
    const reason = `${people.name} has gone under`.slice(0, 200);
    end(tc, { winner: null, kind: 'collapse', turn: tc.turn, reason }, 'campaign.defeat');
  }
}

function end(tc, result, kind) {
  const target = { kind: 'campaign', id: tc.state.campaign.id };
  tc.state.result = result;
  noteChange(tc, kind, target, 'result', null, result, result.reason, { visibleTo: 'all' });
  tc.state.status = 'ended';
  noteChange(tc, 'campaign.status', target, 'status', 'playing', 'ended', result.reason, { visibleTo: 'all' });
}

// Bestimmung (destiny): milestone predicates, the season check, victory and
// collapse (Regelkern section 13).
//
//   initBestimmung(env, ref, turn)    fresh per-people state for a destiny
//   evalPredicate(pred, cx)           one predicate on a state; cx = { state, env, pid, world? }
//   ORDERS['destiny.adopt']           council order that replaces the destiny
//   resolveBestimmung(tc)             season end: collapse, milestones, victory
//
// Milestones are read from the end-of-turn state, after economy, research,
// military and events have written their changes.

import { calendarOf } from './calendar.js';
import { issue } from './issues.js';
import { applyOnce } from './effects.js';
import { statsOf } from './stats.js';
import { changeLoyalty, noteChange, record, setControl, setPeople } from './log.js';
import { controlledRegions, peopleIds, regionTerrain, relKey, settlementsOf } from './state.js';

const MAX_HISTORY = 20;

export function initBestimmung(env, ref, turn) {
  const b = env.bestimmung(ref);
  if (!b) return null;
  return { ref, adoptedAt: turn, milestones: b.milestones.map((m) => ({ id: m.id, reached: false, reachedAt: null, progress: 0 })), history: [] };
}

const alive = (state, pid) => state.peoples[pid].population.core > 0 && state.map.settlements.some((s) => s.people === pid);
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
      const others = peopleIds(state).filter((o) => o !== pid && alive(state, o));
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

// --- destiny.adopt ---------------------------------------------------------------

const yearOf = (env, turn) => calendarOf(env.regeln, turn).year;

export const ORDERS = {
  'destiny.adopt': {
    slot: 'main',
    tags: ['bestimmung'],
    unique: true,
    check(ox, o) {
      const ref = o.params?.bestimmung;
      const bad = (message) => [issue('target', `${ox.path}/params`, message)];
      if (typeof ref !== 'string' || !ox.env.bestimmung(ref)) return bad('bestimmung must be a destiny of this world');
      const cur = ox.people.bestimmung;
      if (cur?.ref === ref) return bad('this destiny is already the people\'s own');
      // The destiny a people starts with carries no year of its own; only a switch (history) or a later adoption starts the yearly limit.
      if (cur && (cur.adoptedAt > 0 || cur.history.length > 0) && yearOf(ox.env, cur.adoptedAt) === ox.cal.year) {
        return [issue('duplicate', `${ox.path}/params`, 'the destiny was changed this year already')];
      }
      return [];
    },
    plan: () => ({ costs: {}, probe: null }),
    resolve(tc, ox, o) {
      const pid = ox.pid;
      const ref = o.params.bestimmung;
      const old = tc.state.peoples[pid].bestimmung;
      const next = initBestimmung(tc.env, ref, tc.turn);
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
  const reason = people.population.core === 0 ? `${people.name} has no clan left` : `${people.name} has no settlement left`;
  record(tc, 'people.collapsed', { kind: 'people', id: pid }, null, reason, { people: pid, visibleTo: 'all' });
  if (people.units.length) setPeople(tc, pid, 'units', [], `${people.name} collapses, its units dissolve`, { kind: 'unit.dissolved' });
  // Labour may not exceed the clans left, and none are left.
  setPeople(tc, pid, 'population.assigned', {}, `${people.name} collapses, no clan works any more`, { kind: 'population.assign' });
  for (const region of controlledRegions(tc.state, pid)) setControl(tc, region, null, `${people.name} collapses, its region falls free`, { people: pid });
  applyOnce(tc, pid, { op: 'flag.set', flag: 'kern.collapsed', value: true }, { reason: 'collapse is recorded once' });
  return reason;
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
    if (!alive(state, pid) && !state.peoples[pid].modules?.kern?.flags?.['kern~collapsed']) collapse(tc, pid);
  }
  for (const pid of peopleIds(state)) if (alive(state, pid)) checkMilestones(tc, pid);

  const fulfilled = peopleIds(state).filter((pid) => {
    const b = state.peoples[pid].bestimmung;
    return alive(state, pid) && b && b.milestones.length > 0 && b.milestones.every((m) => m.reached);
  });
  if (fulfilled.length) {
    // Every fulfilled people has all milestones; ids are sorted, so the smallest id wins a tie.
    const winner = fulfilled[0];
    const people = state.peoples[winner];
    const def = tc.env.bestimmung(people.bestimmung.ref);
    const history = [...people.bestimmung.history, { ref: people.bestimmung.ref, adoptedAt: people.bestimmung.adoptedAt, endedAt: tc.turn, outcome: 'fulfilled' }].slice(-MAX_HISTORY);
    setPeople(tc, winner, 'bestimmung.history', history, `${people.name} fulfils its destiny`, { kind: 'bestimmung.fulfilled', visibleTo: 'all' });
    const reason = `${people.name} fulfils the destiny ${def?.name ?? people.bestimmung.ref}`.slice(0, 200);
    end(tc, { winner, kind: 'victory', turn: tc.turn, reason }, 'campaign.victory');
    return;
  }
  const player = state.campaign.player;
  if (!alive(state, player)) {
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

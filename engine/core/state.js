// Read helpers over a campaign state (or a projection of it, which has the
// same shape). Nothing here mutates; changes go through engine/core/log.js.

import { idOfRef } from './env.js';
import { regionInfo } from '../world/index.js';

export const clone = (v) => structuredClone(v);

export function peopleIds(state) {
  return Object.keys(state.peoples).sort();
}

export function relKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function relation(state, a, b) {
  return state.relations[relKey(a, b)] ?? null;
}

/** Other people ids this people has a relation entry with, sorted. */
export function partners(state, pid) {
  return peopleIds(state).filter((o) => o !== pid && state.relations[relKey(pid, o)]);
}

export function atWar(state, a, b) {
  return relation(state, a, b)?.atWar === true;
}

export function settlementsOf(state, pid) {
  return state.map.settlements.filter((s) => s.people === pid);
}

/** Kernel-owned per-people slice (seats, flags, holds, honours); see KERN_SLICE. */
export function kern(people) {
  return people.modules?.kern ?? KERN_SLICE();
}

// Fields the kernel keeps beside the module slices. Schema-free by design
// (people.modules values are open objects), documented here as the contract.
export const KERN_SLICE = () => ({
  flags: {}, // flag.set values: { "dev.name": true }
  seats: [], // open council seats: [{ role, favor, oppose, since }]
  honored: {}, // talk honor: { memberId: year }
  served: {}, // last turn an executed order served a member's favor tags: { memberId: turn }
  holds: {}, // grazing rights after a camp moved on: { regionId: untilTurn }
  revealed: {}, // reveal scope people: { peopleId: untilTurn }
  pending: null, // open decision card: { card, turn }
  deaths: [], // deaths of the last turn for honor-dead: [{ member, turn }]
});

/** The camp or first settlement of a people; its tile is "$home". */
export function homeSettlement(state, pid) {
  const people = state.peoples[pid];
  const campId = people?.modules?.lebensweise?.camp;
  const own = settlementsOf(state, pid);
  return own.find((s) => s.id === campId) ?? own[0] ?? null;
}

export function controlledRegions(state, pid) {
  return Object.keys(state.map.control).filter((r) => state.map.control[r] === pid).sort();
}

export function unitsOn(state, tile) {
  const out = [];
  for (const pid of peopleIds(state)) {
    for (const u of state.peoples[pid].units ?? []) if (u.tile === tile) out.push({ people: pid, unit: u });
  }
  return out;
}

export function findUnit(state, pid, unitId) {
  return state.peoples[pid]?.units?.find((u) => u.id === unitId) ?? null;
}

export function findMember(people, memberId) {
  return people.council?.find((m) => m.id === memberId) ?? null;
}

export function leaderOf(people) {
  return people.council?.find((m) => m.leader) ?? null;
}

export function knownEntry(people, ref) {
  return people.developments.known.find((k) => k.ref === ref) ?? null;
}

/** Known entry by id regardless of revision. */
export function knowsId(people, id) {
  return people.developments.known.some((k) => idOfRef(k.ref) === id);
}

/**
 * Developments whose standing effects act in `turn`: known, active and
 * effective; institutions only while instituted; a lebensweise only while it
 * is the people's way of life; a bauwerk acts per built instance (see
 * buildingsOf) and is excluded here. Returns [{ ref, ent, entry }] in known order.
 */
export function activeDevelopments(state, env, pid, turn = state.turn) {
  const people = state.peoples[pid];
  if (!people?.developments) return [];
  const out = [];
  for (const entry of people.developments.known) {
    if (entry.state !== 'active' || entry.effectiveFrom > turn) continue;
    const ent = env.entwicklung(entry.ref);
    if (!ent) continue;
    if (ent.kind === 'bauwerk') continue;
    if (ent.kind === 'institution' && !people.developments.instituted.includes(entry.ref)) continue;
    if (ent.kind === 'lebensweise' && entry.ref !== people.lebensweise) continue;
    out.push({ ref: entry.ref, ent, entry });
  }
  return out;
}

/**
 * Active buildings of a people that act in `turn`: [{ settlement, building, ent }].
 * A bauwerk's standing effects count once per settlement, however many copies
 * stand there (owner decision), so only the first active copy per settlement
 * and ref is listed; upkeep is charged per copy elsewhere.
 */
export function buildingsOf(state, env, pid, turn = state.turn) {
  const out = [];
  for (const s of settlementsOf(state, pid)) {
    const seen = new Set();
    for (const b of s.buildings) {
      if (b.state !== 'active' || b.since >= turn || seen.has(b.ref)) continue;
      const ent = env.entwicklung(b.ref);
      if (!ent) continue;
      seen.add(b.ref);
      out.push({ settlement: s, building: b, ent });
    }
  }
  return out;
}

export function lebensweiseOf(state, env, pid) {
  return env.entwicklung(state.peoples[pid]?.lebensweise) ?? null;
}

/** Highest tier among known developments, 0 when only the endowment is known. */
export function maxKnownTier(state, env, pid) {
  let max = 0;
  for (const k of state.peoples[pid].developments.known) {
    const e = env.entwicklung(k.ref);
    if (e && e.tier > max) max = e.tier;
  }
  return max;
}

/** Region info cached per world; dominantTerrain is stable for the region. */
export function regionTerrain(world, regionId) {
  return regionInfo(world, regionId)?.dominantTerrain ?? null;
}

export function sum(values) {
  let n = 0;
  for (const v of values) n += v;
  return n;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

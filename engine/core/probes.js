// Probes: d10 against a target with an open list of modifiers.
//
//   chance  = clamp((11 - target + mod) x 10, 10, 90) percent; the clamp is
//             the rule that a natural 1 always fails and a natural 10 always
//             succeeds (P = clamp((11 - target + mod) / 10, 0.1, 0.9)).
//   bands   engine/schemas/common.js BANDS. Natural 10 or m >= 4 crit_success,
//           1..3 success, 0 narrow, -3..-1 failure, m <= -4 setback, natural 1
//           crit_fail, where m = roll + mod - target. narrow, success and
//           crit_success are successes (SUCCESS_BANDS). The natural roll is kept
//           in probe.natural (10, 1 or null): only natural rolls fire the
//           crit hooks and open breakthrough or crisis tokens.
//   stack   each modifier is clamped to +-2; modifiers from developments add up
//           to at most +3; the total is clamped to +-4. Every cut is listed as
//           `struck` with its reason and raises the warning softcap.
//
// A probe id names turn, people and order ("T6:schar:o2"); the fingerprint
// covers everything a roll was made against, so a later change to the probe
// makes a stored roll stale.

import { RULES } from './rules.js';
import { hashValue } from './hash.js';
import { issue } from './issues.js';
import { evalCondition } from './conditions.js';
import { BANDS, SUCCESS_BANDS } from '../schemas/common.js';

export { BANDS };
export const SUCCESS = Object.freeze(new Set(SUCCESS_BANDS));

export function probeId(turn, pid, suffix) {
  return `T${turn}:${pid}:${suffix}`;
}

export function chance(target, mod) {
  return Math.max(10, Math.min(90, (11 - target + mod) * 10));
}

export function bandOf(roll, modTotal, target) {
  if (roll === 10) return 'crit_success';
  if (roll === 1) return 'crit_fail';
  const m = roll + modTotal - target;
  if (m >= 4) return 'crit_success';
  if (m >= 1) return 'success';
  if (m === 0) return 'narrow';
  if (m >= -3) return 'failure';
  return 'setback';
}

/** Label key of a band: label keys allow no underscore. */
export const bandLabelKey = (band) => `band.${band.replaceAll('_', '-')}`;

/**
 * Modifiers a people brings to a probe with these tags: Wesensart (+2 plus,
 * -2 minus) and every standing probe.mod whose tags intersect and whose
 * condition holds. standing: list from effects.standingOf; cx for conditions.
 * Returns [{ source, label, value, dev }] (dev marks development sources for
 * the +3 cap).
 */
export function gatherModifiers(people, tags, standing, cx) {
  const out = [];
  const w = people.identity?.wesensart;
  if (w?.plus?.tag && tags.includes(w.plus.tag)) out.push({ source: 'wesensart:plus', label: w.plus.tag, value: 2, dev: false });
  if (w?.minus?.tag && tags.includes(w.minus.tag)) out.push({ source: 'wesensart:minus', label: w.minus.tag, value: -2, dev: false });
  for (const s of standing) {
    const e = s.effect;
    if (e.op !== 'probe.mod') continue;
    if (!e.tags.some((t) => tags.includes(t))) continue;
    if (e.if && !evalCondition(e.if, cx)) continue;
    out.push({ source: s.source.key, label: e.label ?? s.source.label, value: e.amount, dev: s.source.kind !== 'status' });
  }
  return out;
}

/**
 * Builds a probe record. spec = { id, people, order, kind, tags, roller,
 * target, modifiers, params }. Target is clamped to 3..8 for order probes; a
 * raw probe (kind event) has target null and no modifiers.
 */
export function buildProbe(spec) {
  const raw = spec.target == null;
  const target = raw ? null : Math.max(3, Math.min(8, spec.target));
  const mods = [];
  const struck = [];
  // Order: by value descending, then source, so cuts fall deterministically on the weakest.
  const sorted = [...(spec.modifiers ?? [])].sort((a, b) => b.value - a.value || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));
  let devPlus = 0;
  for (const m of raw ? [] : sorted) {
    let v = Math.max(-RULES.singleModCap, Math.min(RULES.singleModCap, m.value));
    if (v !== m.value) struck.push({ source: m.source, label: m.label, value: m.value - v, reason: 'single' });
    if (m.dev && v > 0) {
      const room = Math.max(0, RULES.developmentModCap - devPlus);
      if (v > room) {
        struck.push({ source: m.source, label: m.label, value: v - room, reason: 'developments' });
        v = room;
      }
      devPlus += v;
    }
    if (v !== 0) mods.push({ source: m.source, label: m.label, value: v });
  }
  const counted = [...mods];
  // Struck parts stay visible in the list, marked struck, so the calculation
  // shows what was cut and why; they never count towards the total.
  for (const s of struck) mods.push({ source: s.source, label: s.label, value: s.value, struck: true, reason: s.reason });
  const sum = counted.reduce((n, m) => n + m.value, 0);
  const modTotal = Math.max(-RULES.totalModCap, Math.min(RULES.totalModCap, sum));
  if (modTotal !== sum) struck.push({ source: 'total', label: 'cap', value: sum - modTotal, reason: 'total' });
  const probe = {
    id: spec.id,
    people: spec.people,
    order: spec.order ?? null,
    kind: spec.kind,
    tags: [...(spec.tags ?? [])],
    roller: spec.roller,
    target,
    modifiers: mods,
    struck,
    modTotal,
    chance: raw ? null : chance(target, modTotal),
    fingerprint: null,
    roll: null,
    margin: null,
    band: null,
    natural: null,
  };
  probe.fingerprint = fingerprint(probe, spec.params ?? {});
  return probe;
}

export function fingerprint(probe, params) {
  return hashValue({
    id: probe.id,
    kind: probe.kind,
    target: probe.target,
    modifiers: probe.modifiers.filter((m) => !m.struck).map((m) => [m.source, m.value]),
    params,
  });
}

/** Applies a roll to a probe (returns a new probe). */
export function resolveProbe(probe, roll) {
  if (!Number.isInteger(roll) || roll < 1 || roll > 10) throw new RangeError(`probe ${probe.id}: roll must be 1..10`);
  const natural = roll === 10 || roll === 1 ? roll : null;
  if (probe.target == null) return { ...probe, roll, natural, margin: null, band: null };
  return { ...probe, roll, natural, margin: roll + probe.modTotal - probe.target, band: bandOf(roll, probe.modTotal, probe.target) };
}

export function softcapIssues(probe) {
  return probe.struck.length
    ? [issue('softcap', `/probes/${probe.id}`, `modifiers cut: ${probe.struck.map((s) => `${s.label} ${s.value > 0 ? '+' : ''}${s.value} (${s.reason})`).join(', ')}`)]
    : [];
}

/** Event band 1..5 of a raw d10; bands = tune(env, 'eventBands'). */
export function eventBand(roll, bands = RULES.eventBands) {
  return bands.findIndex(([lo, hi]) => roll >= lo && roll <= hi) + 1;
}

/** One-line calculation for reports. */
export function calculation(probe) {
  if (probe.roll == null) return `${probe.id}: not rolled`;
  if (probe.target == null) return `${probe.id}: roll ${probe.roll}`;
  const mods = probe.modifiers.filter((m) => !m.struck).map((m) => `${m.value > 0 ? '+' : ''}${m.value} ${m.label}`).join(' ');
  return `${probe.id}: roll ${probe.roll} ${mods} = ${probe.roll + probe.modTotal} vs ${probe.target}, margin ${probe.margin}, ${probe.band}`;
}

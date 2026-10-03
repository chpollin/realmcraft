// Council and rule: votes, decree, Machtprobe, talk, loyalty and hollow loyalty.
//
//   councilVote(ox, tags, type)   deterministic vote of an order against S0
//   bookDecree(tc, ox, entry)     costs of a decree (turn.js step orders)
//   afterCouncilOrder(tc, ox, e)  loyalty from the match with the member's goal
//   resolveCouncilSeason(tc)      served goals, winter decay, hollow betrayal
//
// Loyalty changes go through log.changeLoyalty, which caps every member at
// +-RULES.loyaltyPerTurnCap per turn across all sources.

import { RULES, tune } from './rules.js';
import { issue } from './issues.js';
import { seasonsPerYear } from './calendar.js';
import { applyOnce, ofOp, setKern } from './effects.js';
import { SUCCESS, buildProbe, calculation, probeId, resolveProbe } from './probes.js';
import { addPeople, changeLoyalty, notice, record, setMember, setPeople } from './log.js';
import { KERN_SLICE, controlledRegions, findMember, kern, peopleIds } from './state.js';
import { regionAt } from './map.js';
import { PATTERNS } from '../schemas/common.js';

// Kernel slice with every key present, whatever an older state carried.
const slice = (people) => ({ ...KERN_SLICE(), ...kern(people) });

const AIMS = ['override', 'rally', 'reconcile', 'quell'];
const TALK_MODES = ['listen', 'ask', 'honor', 'honor-dead'];
const tagPattern = new RegExp(PATTERNS.tag);

/** Same test turn.js uses to skip a people that has gone under. */
export const isAlive = (state, pid) => state.peoples[pid].population.core > 0 && state.map.settlements.some((s) => s.people === pid);

export function loyaltyBand(v) {
  if (v >= 4) return 'ergeben';
  if (v >= 1) return 'treu';
  if (v === 0) return 'schwankend';
  if (v >= -3) return 'verstimmt';
  return 'bruch';
}

// --- vote -------------------------------------------------------------------

function memberVote(m, tags) {
  if (m.loyalty <= -4) return { vote: 'no', reason: 'loyalty at breaking point' };
  if (m.goal.oppose.some((t) => tags.includes(t))) return { vote: 'no', reason: 'opposes' };
  if (m.goal.favor.some((t) => tags.includes(t))) return { vote: 'yes', reason: 'favours' };
  return m.loyalty >= 0 ? { vote: 'yes', reason: 'loyal' } : { vote: 'no', reason: 'discontent' };
}

/**
 * The vote of the council on an order with these tags and this type. Several
 * governance.rule primitives: the last one in standing order wins. The
 * Machtprobe and the talk are the instruments against and with the council,
 * so they never need its consent.
 */
export function councilVote(ox, tags, type) {
  const rules = ofOp(ox.standing, 'governance.rule');
  const rule = rules.length ? rules[rules.length - 1].effect : null;
  const out = {
    required: false, rule: rule?.rule ?? null, scopeTags: rule?.scopeTags ?? [], scopeOrders: rule?.scopeOrders ?? [],
    votes: [], yes: 0, no: 0, passed: true,
  };
  const council = ox.people.council;
  if (!rule || !council.length || type === 'machtprobe' || type === 'talk') return out;
  if (!tags.some((t) => out.scopeTags.includes(t)) && !out.scopeOrders.includes(type)) return out;
  out.required = true;
  out.votes = council.map((m) => ({ member: m.id, ...memberVote(m, tags) }));
  out.yes = out.votes.filter((v) => v.vote === 'yes').length;
  out.no = out.votes.length - out.yes;
  const n = out.votes.length;
  out.passed = rule.rule === 'leader' ? true : rule.rule === 'council' ? out.yes * 2 > n : out.yes * 3 >= 2 * n;
  return out;
}

/**
 * A decree runs a rejected order: every no-voter loses 1 loyalty, one at the
 * breaking point also opens a grievance token, and the people's approval falls.
 */
export function bookDecree(tc, ox, entry) {
  const pid = ox.pid;
  const reason = `decree for ${entry.order.type} ${entry.order.id}`;
  const tags = [...new Set(entry.tags)].slice(0, 3);
  let no = 0;
  for (const v of entry.vote.votes) {
    if (v.vote !== 'no') continue;
    no++;
    changeLoyalty(tc, pid, v.member, -1, reason);
    const m = findMember(ox.people, v.member);
    if (m && m.loyalty <= -4) applyOnce(tc, pid, { op: 'token.add', kind: 'grievance', tags }, { reason: `${reason} against ${m.name}` });
  }
  const bounds = tune(ox.env, 'approval');
  addPeople(tc, pid, `meters.${RULES.approval}`, -1, reason, { min: bounds.min, max: bounds.max, kind: 'meter.change' });
  notice(tc, 'council.decree', { kind: 'people', id: pid }, `${reason}: ${no} against`, { people: pid });
}

/** +1 for members whose favor meets the tags of an executed council order, -1 where oppose does. */
export function afterCouncilOrder(tc, ox, entry) {
  const reason = `order ${entry.order.id} (${entry.order.type}) measured against the member's goal`;
  for (const m of ox.people.council) {
    if (m.goal.oppose.some((t) => entry.tags.includes(t))) changeLoyalty(tc, ox.pid, m.id, -1, reason);
    else if (m.goal.favor.some((t) => entry.tags.includes(t))) changeLoyalty(tc, ox.pid, m.id, 1, reason);
  }
}

/**
 * Council consequences of checked draft entries that are certain before any
 * roll, for the preview: per order the loyalty change of each member and the
 * change of meters (approval), and the season total under the per-turn cap
 * and the -5..5 range. Orders whose effect hangs on a probe (Machtprobe) or
 * on a pending override are listed with `depends` and not counted.
 * Mirrors bookDecree, afterCouncilOrder, the talk order and destiny.adopt.
 */
export function forecastCouncil(ox, entries) {
  const { people, env } = ox;
  const approval = RULES.approval;
  const orders = [];
  const loyalty = {};
  const meters = {};
  const add = (map, key, n) => {
    if (n) map[key] = (map[key] ?? 0) + n;
  };
  for (const e of entries) {
    if (!e.def || e.errors.some((x) => x.severity === 'error')) continue;
    const lo = {};
    const me = {};
    let depends = null;
    const vote = e.vote;
    const type = e.order.type;
    if (type === 'machtprobe') depends = 'probe';
    else if (vote?.required && !vote.passed && vote.override) depends = 'machtprobe';
    else {
      if (vote?.required && !vote.passed && vote.decree) {
        for (const v of vote.votes) if (v.vote === 'no') add(lo, v.member, -1);
        add(me, approval, -1);
      }
      if (vote?.required) {
        for (const m of people.council) {
          if (m.goal.oppose.some((t) => e.tags.includes(t))) add(lo, m.id, -1);
          else if (m.goal.favor.some((t) => e.tags.includes(t))) add(lo, m.id, 1);
        }
      }
      const p = e.order.params ?? {};
      if (type === 'talk' && p.mode === 'honor') add(lo, p.member, 1);
      if (type === 'talk' && p.mode === 'honor-dead') for (const m of people.council) add(lo, m.id, 1);
      if (type === 'destiny.adopt') {
        const oldTags = people.bestimmung ? env.bestimmung(people.bestimmung.ref)?.tags ?? [] : [];
        for (const m of people.council) if (m.goal.favor.some((t) => oldTags.includes(t))) add(lo, m.id, -2);
      }
    }
    orders.push({ order: e.order.id, loyalty: lo, meters: me, depends });
    for (const [k, n] of Object.entries(lo)) add(loyalty, k, n);
    for (const [k, n] of Object.entries(me)) add(meters, k, n);
  }
  const cap = RULES.loyaltyPerTurnCap;
  for (const [id, n] of Object.entries(loyalty)) {
    const m = findMember(people, id);
    const capped = Math.max(-cap, Math.min(cap, n));
    loyalty[id] = m ? Math.max(-5, Math.min(5, m.loyalty + capped)) - m.loyalty : capped;
  }
  if (Object.hasOwn(meters, approval)) {
    const bounds = tune(env, 'approval');
    const now = Object.hasOwn(people.meters ?? {}, approval) ? people.meters[approval] : 0;
    meters[approval] = Math.max(bounds.min, Math.min(bounds.max, now + meters[approval])) - now;
  }
  return { orders, loyalty, meters };
}

// --- Machtprobe -----------------------------------------------------------------

const machtError = (ox, reason, msg, params = {}) => issue('target', `${ox.path}/params`, msg, { params: { reason, ...params } });

function needShown(ox) {
  const { people, state, pid, world } = ox;
  if (Object.values(people.shortfall ?? {}).some((n) => n > 0)) return true;
  const own = new Set(controlledRegions(state, pid));
  return peopleIds(state).some((o) => o !== pid && state.peoples[o].units.some((u) => own.has(regionAt(world, u.tile))));
}

function machtMods(ox, params) {
  const { people } = ox;
  const mods = [];
  const add = (source, label, value) => mods.push({ source: `machtprobe:${source}`, label, value, dev: false });
  if (people.standing >= 2) add('standing', 'standing', 2);
  else if (people.standing === 1) add('standing', 'standing', 1);
  if (params.cause === 'need' && needShown(ox)) add('need', 'need', 1);
  const council = people.council;
  if (council.length && council.filter((m) => m.loyalty >= 1).length * 2 > council.length) add('council', 'council', 1);
  const against = params.against ? findMember(people, params.against) : null;
  if (against) {
    if (against.loyalty <= -4) add('against', against.name, -2);
    else if (against.loyalty <= -1) add('against', against.name, -1);
  }
  if (people.tokens.some((t) => t.kind === 'grievance')) add('grievance', 'grievance', -2);
  const approval = people.meters?.[RULES.approval] ?? 0;
  if (approval >= RULES.approvalHigh) add('approval', 'approval', 1);
  else if (approval <= RULES.approvalLow) add('approval', 'approval', -1);
  return mods;
}

function achieve(tc, ox, order, reason) {
  const { aim, member } = order.params;
  const pid = ox.pid;
  if (aim === 'override') {
    tc.scratch.overrides ??= {};
    (tc.scratch.overrides[pid] ??= []).push(order.params.order);
    notice(tc, 'council.override', { kind: 'people', id: pid }, `${reason}: council vote on ${order.params.order} is overridden`, { people: pid });
  } else if (aim === 'rally') {
    applyOnce(tc, pid, {
      op: 'status.add', id: 'sammlung', effects: [{ op: 'probe.mod', tags: [RULES.mainTag], amount: 1, label: 'sammlung' }], duration: 1, endsOn: null,
    }, { reason });
  } else if (aim === 'reconcile') {
    changeLoyalty(tc, pid, member, 1, reason);
  } else {
    const tokens = tc.state.peoples[pid].tokens;
    let oldest = -1;
    tokens.forEach((t, i) => {
      if (t.kind === 'grievance' && (oldest < 0 || t.turn < tokens[oldest].turn)) oldest = i;
    });
    if (oldest >= 0) setPeople(tc, pid, 'tokens', tokens.filter((_, i) => i !== oldest), `${reason}: grievance quelled`, { kind: 'token.remove' });
  }
}

const ORDER_MACHTPROBE = {
  // The first Machtprobe is free, further ones (up to tuning.machtprobeCap) take a main slot.
  slot: (ox, order, k) => (k === 0 ? 'free' : k < tune(ox.env, 'machtprobeCap') ? 'main' : 'none'),
  tags: (ox, o) => ['machtprobe', 'macht', o.params?.approach].filter(Boolean),
  check(ox, o) {
    const p = o.params ?? {};
    if (!AIMS.includes(p.aim)) return [machtError(ox, 'aim', `aim must be one of ${AIMS.join(', ')}`, { aims: AIMS })];
    const out = [];
    if (p.approach !== undefined && !(typeof p.approach === 'string' && tagPattern.test(p.approach))) out.push(machtError(ox, 'approach-not-tag', 'approach must be a tag'));
    if (p.cause !== undefined && p.cause !== 'need') out.push(machtError(ox, 'cause', 'cause must be need'));
    if (p.against !== undefined && !findMember(ox.people, p.against)) out.push(machtError(ox, 'against-not-member', `against names no council member: ${p.against}`, { member: String(p.against) }));
    if (p.aim === 'override' && typeof p.order !== 'string') out.push(machtError(ox, 'override-needs-order', 'override needs params.order'));
    if (p.aim === 'reconcile' && !findMember(ox.people, p.member)) out.push(machtError(ox, 'reconcile-needs-member', 'reconcile needs params.member of the council'));
    if (p.aim === 'quell' && !ox.people.tokens.some((t) => t.kind === 'grievance')) out.push(machtError(ox, 'quell-needs-grievance', 'quell needs an open grievance token'));
    return out;
  },
  plan: (ox, o) => ({
    costs: {},
    probe: { kind: 'machtprobe', target: RULES.machtprobeTarget, tags: [], extraMods: machtMods(ox, o.params) },
  }),
  resolve(tc, ox, order, plan, out) {
    const pid = ox.pid;
    const { band } = out;
    const reason = `Machtprobe ${order.id}: ${band}`;
    const against = order.params.against ?? null;
    const approach = order.params.approach;
    const impulse = () => applyOnce(tc, pid, { op: 'token.add', kind: 'impulse', tags: [...new Set([approach, 'macht'].filter(Boolean))] }, { reason });
    // The member named as opponent is hit once; the group penalty skips him.
    const sweep = () => {
      for (const m of ox.people.council) if (m.loyalty <= -1 && m.id !== against) changeLoyalty(tc, pid, m.id, -1, reason);
    };
    const hit = (n) => against && changeLoyalty(tc, pid, against, -n, reason);
    if (band === 'crit_success') {
      achieve(tc, ox, order, reason);
      applyOnce(tc, pid, {
        op: 'status.add', id: 'autoritaet', effects: [{ op: 'probe.mod', tags: [RULES.mainTag], amount: 1, label: 'autoritaet' }], duration: null, endsOn: 'setback',
      }, { reason });
      impulse();
    } else if (band === 'success') {
      achieve(tc, ox, order, reason);
      hit(1);
      if (out.margin >= 2) impulse();
    } else if (band === 'narrow') {
      achieve(tc, ox, order, reason);
      hit(1);
      sweep();
    } else if (band === 'failure') {
      hit(1);
      sweep();
    } else {
      hit(2);
      applyOnce(tc, pid, { op: 'token.add', kind: 'crisis', tags: ['absetzung'] }, { reason });
    }
  },
};

// --- talk -----------------------------------------------------------------------

const deathsToHonor = (state, people) => slice(people).deaths.filter((d) => d.turn === state.turn - 1 && d.honored !== true);

const ORDER_TALK = {
  slot: 'free',
  tags: ['rat'],
  check(ox, o) {
    const p = o.params ?? {};
    const bad = (reason, msg, params) => [machtError(ox, reason, msg, params)];
    if (!TALK_MODES.includes(p.mode)) return bad('mode', `mode must be one of ${TALK_MODES.join(', ')}`, { modes: TALK_MODES });
    if (p.mode === 'honor-dead') return deathsToHonor(ox.state, ox.people).length ? [] : bad('no-death-to-honor', 'no death of the last season left to honour');
    const m = findMember(ox.people, p.member);
    if (!m) return bad('not-member', 'member must be a council member');
    if (p.mode === 'honor') {
      if (m.loyalty >= 0) return bad('no-grievance', `${m.name} has no grievance to honour`, { name: m.name });
      if (m.hollow) return bad('member-hollow', `${m.name} is bound hollow`, { name: m.name });
      if (slice(ox.people).honored[m.id] === ox.cal.year) return bad('honored-this-year', `${m.name} was honoured this year`, { name: m.name });
    }
    return [];
  },
  plan: () => ({ costs: {}, probe: null }),
  resolve(tc, ox, order) {
    const { mode, member } = order.params;
    const pid = ox.pid;
    const people = tc.state.peoples[pid];
    const reason = `talk ${order.id} (${mode})`;
    if (mode === 'honor') {
      // A second honour order of the same draft finds the mark of the first.
      if (slice(people).honored[member] === tc.cal.year) return;
      changeLoyalty(tc, pid, member, 1, reason);
      setKern(tc, pid, `honored.${member}`, tc.cal.year, `${reason}: honoured in year ${tc.cal.year}`, { kind: 'council.honor' });
    } else if (mode === 'honor-dead') {
      const open = slice(people).deaths.filter((d) => d.turn === tc.turn - 1 && d.honored !== true);
      if (!open.length) return;
      for (const m of people.council) changeLoyalty(tc, pid, m.id, 1, reason);
      setKern(tc, pid, 'deaths', slice(people).deaths.map((d) => (open.includes(d) ? { ...d, honored: true } : d)), `${reason}: the dead are honoured`, { kind: 'council.honor' });
    } else {
      notice(tc, 'council.talk', { kind: 'people', id: pid }, `${reason}${member ? ` with ${member}` : ''}`, { people: pid });
    }
  },
};

export const ORDERS = { machtprobe: ORDER_MACHTPROBE, talk: ORDER_TALK };

// --- season ---------------------------------------------------------------------

export function resolveCouncilSeason(tc) {
  const { env } = tc;
  const horizon = tc.turn - seasonsPerYear(env.regeln) + 1;
  const decay = tune(env, 'loyaltyDecay');
  for (const pid of peopleIds(tc.s0)) {
    if (!isAlive(tc.s0, pid)) continue;
    const s0 = tc.s0.peoples[pid];

    // 1. A member is served by an executed order that carries one of his favor tags.
    const served = new Set();
    for (const ex of tc.scratch.executed?.[pid] ?? []) {
      for (const m of s0.council) if (m.goal.favor.some((t) => ex.tags.includes(t))) served.add(m.id);
    }
    for (const m of s0.council) {
      if (served.has(m.id) && findMember(tc.state.peoples[pid], m.id)) setKern(tc, pid, `served.${m.id}`, tc.turn, 'an executed order served the member\'s goal', { kind: 'council.served' });
    }
    if (!tc.cal.winter) continue;

    // 2. Winter: devotion fades without service; worlds may add a flat decay.
    for (const m of s0.council) {
      if (m.loyalty >= 4) {
        const last = slice(tc.state.peoples[pid]).served[m.id];
        if (last === undefined || last < horizon) changeLoyalty(tc, pid, m.id, -1, 'devotion fades: no order served the member\'s goal this year');
      }
      if (decay > 0) changeLoyalty(tc, pid, m.id, -decay, 'winter decay of loyalty');
    }

    // 3. Winter: hollow loyalty breaks on a failed probe.
    s0.council.forEach((m, index) => {
      if (!m.hollow || !findMember(tc.state.peoples[pid], m.id)) return;
      const modifiers = m.loyalty >= 3 ? [{ source: 'hollow:loyalty', label: 'loyalty', value: 1, dev: false }] : [];
      const probe = buildProbe({
        id: probeId(tc.turn, pid, `hollow-${index}`), people: pid, order: null, kind: 'hollow', tags: ['hollow'], roller: 'kernel',
        target: RULES.hollowTarget, modifiers, params: { member: m.id },
      });
      const res = resolveProbe(probe, tc.rng.d10());
      tc.probes.push(res);
      record(tc, 'probe.resolved', { kind: 'people', id: pid }, null, calculation(res), { people: pid, refs: [res.id] });
      if (SUCCESS.has(res.band)) return;
      setMember(tc, pid, m.id, 'loyalty', -2, `hollow loyalty of ${m.name} breaks (${res.band})`, { kind: 'council.betrayal' });
      setMember(tc, pid, m.id, 'hollow', false, `${m.name} betrays the people`, { kind: 'council.betrayal' });
      notice(tc, 'council.betrayal', { kind: 'member', id: m.id }, `${m.name} betrays the people: hollow loyalty breaks`, { people: pid, refs: [res.id] });
    });
  }
}

// Season events (turn.js step events): decisions left open, the world event of
// every people, winter ageing with life rolls and succession, meters and
// triggers. Everything reads the opening state S0 and writes through log.js.
//
// The world-event roll itself is drawn at seal (state.eventDraws); orders of
// this file's kind are none, because answers to decisions come in draft.choices.

import { RULES } from './rules.js';
import { applyOnce, applyOnceList, ofOp, setKern, standingOf } from './effects.js';
import { evalCondition } from './conditions.js';
import { SUCCESS, buildProbe, calculation, probeId, resolveProbe } from './probes.js';
import { activeModules } from '../modules/index.js';
import { addPeople, fireHook, noteChange, notice, record, setMember, setPeople } from './log.js';
import { KERN_SLICE, atWar, clamp, findMember, isAlive, kern, peopleIds } from './state.js';

export function eventProbeSpec(state, pid, roller) {
  return { id: probeId(state.turn, pid, 'event'), people: pid, order: null, kind: 'event', tags: ['ereignis'], roller, target: null, modifiers: [], params: {} };
}

const MAX_PENDING = 24;
const slice = (people) => ({ ...KERN_SLICE(), ...kern(people) });
const alivePeoples = (tc) => peopleIds(tc.s0).filter((pid) => isAlive(tc.s0, pid));

function cxOf(tc, pid) {
  const isModuleActive = (p, id) => activeModules(tc.s0, tc.env, p).some((m) => m.id === id);
  return { state: tc.s0, env: tc.env, pid, cal: tc.cal, world: tc.world, isModuleActive };
}

export function resolveEvents(tc) {
  resolvePending(tc);
  worldEvents(tc);
  pruneDeaths(tc);
  if (tc.cal.winter) winterLife(tc);
  meters(tc);
  triggers(tc);
}

// --- a. decisions left open --------------------------------------------------------

function resolvePending(tc) {
  const open = tc.s0.pendingChoices ?? [];
  if (!open.length) return;
  const done = new Set();
  for (const pc of open) {
    // A decision of a people that has gone under lapses unanswered.
    if (!isAlive(tc.s0, pc.people)) {
      done.add(pc.id);
      noteChange(tc, 'event.choice', { kind: 'campaign', id: tc.state.campaign.id }, `pendingChoices.${pc.id}`, pc, null,
        `decision ${pc.id} lapses, ${pc.people} has gone under`, { people: pc.people, refs: [pc.event] });
      continue;
    }
    const answer = tc.scratch.choices?.[pc.people]?.[pc.id];
    const card = tc.env.ereignis(pc.event);
    let optionId = null;
    if (answer !== undefined && pc.options.includes(answer)) optionId = answer;
    else if (pc.deadline <= tc.turn) optionId = pc.options[0];
    else continue;
    done.add(pc.id);
    noteChange(tc, 'event.choice', { kind: 'campaign', id: tc.state.campaign.id }, `pendingChoices.${pc.id}`, pc, null,
      `decision ${pc.id} closed with ${optionId}${answer === optionId ? '' : ' (no answer, first option)'}`, { people: pc.people, refs: [pc.event] });
    const option = card?.options?.find((o) => o.id === optionId);
    if (!option) {
      notice(tc, 'event.choice-lost', { kind: 'people', id: pc.people }, `option ${optionId} of ${pc.event} is not in the library`, { people: pc.people, refs: [pc.event] });
      continue;
    }
    applyOnceList(tc, pc.people, option.effects, { reason: `${card.name}: ${option.label}`, refs: [pc.event] });
  }
  if (done.size) tc.state.pendingChoices = tc.state.pendingChoices.filter((c) => !done.has(c.id));
}

// --- b. the world event ------------------------------------------------------------

function repeatAllowed(card, hist, pid, turn) {
  const last = hist?.last?.[pid];
  if (card.once && last !== undefined) return false;
  if (card.cooldown && last !== undefined && turn - last < card.cooldown) return false;
  if (card.maxPerCampaign && (hist?.total ?? 0) >= card.maxPerCampaign) return false;
  return true;
}

function candidatesFor(tc, pid, band) {
  const cx = cxOf(tc, pid);
  const draws = tc.state.modules.kern?.draws ?? {};
  const out = [];
  for (const ref of [...new Set(tc.s0.eventPool ?? [])].sort()) {
    const card = tc.env.ereignis(ref);
    if (!card || card.band !== band || !evalCondition(card.if, cx)) continue;
    if (repeatAllowed(card, draws[ref], pid, tc.turn)) out.push({ ref, card });
  }
  return out;
}

function recordDraw(tc, pid, ref, card) {
  const k = (tc.state.modules.kern ??= {});
  const draws = (k.draws ??= {});
  const prev = draws[ref];
  const next = { total: (prev?.total ?? 0) + 1, last: { ...(prev?.last ?? {}), [pid]: tc.turn } };
  draws[ref] = next;
  const campaign = { kind: 'campaign', id: tc.state.campaign.id };
  // The stored record holds when every people drew the card and how often the
  // world did, so the entry a people sees carries only its own turn. The total
  // is accounted for in an entry that reaches no projection. The field stops at
  // `last` because the schema bounds its length and ids may be long.
  const own = (turn) => (turn === undefined ? null : { [pid]: turn });
  noteChange(tc, 'event.history', campaign, `modules.kern.draws.${ref}.last`, own(prev?.last?.[pid]), own(tc.turn),
    `${card.name} drawn by ${pid}`, { people: pid, refs: [ref] });
  noteChange(tc, 'event.history-total', campaign, `modules.kern.draws.${ref}.total`, prev?.total ?? null, next.total,
    `${card.name} drawn by ${pid}`, { refs: [ref] }).visibleTo = [];
}

function worldEvents(tc) {
  for (const pid of alivePeoples(tc)) {
    const draw = tc.s0.eventDraws?.[pid];
    if (!draw) continue;
    let ref = null;
    let card = draw.card ? tc.env.ereignis(draw.card) : null;
    if (card) ref = draw.card;
    else {
      const candidates = candidatesFor(tc, pid, draw.band);
      if (!candidates.length) {
        notice(tc, 'event.none', { kind: 'people', id: pid }, `no event card for band ${draw.band}`, { people: pid });
        continue;
      }
      ({ ref, card } = candidates[tc.rng.below(candidates.length)]);
    }
    recordDraw(tc, pid, ref, card);
    notice(tc, 'event.drawn', { kind: 'people', id: pid }, `${card.name} (roll ${draw.roll}, band ${draw.band})`, { people: pid, refs: [ref] });
    applyOnceList(tc, pid, card.effects, { reason: card.name, refs: [ref] });
    if (card.options?.length) offerChoice(tc, pid, ref, card);
  }
}

function offerChoice(tc, pid, ref, card) {
  const list = (tc.state.pendingChoices ??= []);
  if (list.length >= MAX_PENDING) {
    notice(tc, 'event.choice-lost', { kind: 'people', id: pid }, `too many open decisions, ${card.name} offers none`, { people: pid, refs: [ref] });
    return;
  }
  const pc = {
    id: `c-${tc.turn}-${pid}`.slice(0, 41), people: pid, event: ref, offeredAt: tc.turn,
    deadline: tc.turn + RULES.choiceDeadline, options: card.options.map((o) => o.id),
  };
  list.push(pc);
  noteChange(tc, 'event.choice', { kind: 'campaign', id: tc.state.campaign.id }, `pendingChoices.${pc.id}`, null, pc,
    `${card.name} asks for a decision`, { people: pid, refs: [ref] });
}

// --- c. winter: ageing, life, death, succession -----------------------------------------

// A death is honourable only in the following season, so older entries go.
function pruneDeaths(tc) {
  for (const pid of alivePeoples(tc)) {
    const deaths = slice(tc.state.peoples[pid]).deaths;
    const keep = deaths.filter((d) => d.turn >= tc.turn - 1);
    if (keep.length !== deaths.length) setKern(tc, pid, 'deaths', keep, 'old deaths are no longer honourable', { kind: 'council.deaths' });
  }
}

function winterLife(tc) {
  for (const pid of alivePeoples(tc)) {
    const peace = !peopleIds(tc.s0).some((o) => o !== pid && atWar(tc.s0, pid, o));
    const hungry = (tc.s0.peoples[pid].shortfall?.[RULES.food] ?? 0) > 0 || (tc.state.peoples[pid].shortfall?.[RULES.food] ?? 0) > 0;
    tc.s0.peoples[pid].council.forEach((m, index) => {
      if (!findMember(tc.state.peoples[pid], m.id)) return;
      const age = Math.min(120, m.age + 1);
      setMember(tc, pid, m.id, 'age', age, `${m.name} grows a year older`, { kind: 'council.age' });
      if (m.lifeStage === 'ruestig' && age >= RULES.ageLebensabend) {
        setMember(tc, pid, m.id, 'lifeStage', 'lebensabend', `${m.name} enters the evening of life`, { kind: 'council.age' });
      }
      const target = RULES.lifeTarget[m.lifeStage];
      if (target === undefined) return;
      const modifiers = [];
      if (peace) modifiers.push({ source: 'life:peace', label: 'peace', value: 1, dev: false });
      if (hungry) modifiers.push({ source: 'life:hunger', label: 'hunger', value: -1, dev: false });
      const probe = buildProbe({
        id: probeId(tc.turn, pid, `life-${index}`), people: pid, order: null, kind: 'life', tags: ['life'], roller: 'kernel',
        target, modifiers, params: { member: m.id },
      });
      const res = resolveProbe(probe, tc.rng.d10());
      tc.probes.push(res);
      record(tc, 'probe.resolved', { kind: 'people', id: pid }, null, calculation(res), { people: pid, refs: [res.id] });
      if (SUCCESS.has(res.band)) return;
      if (m.lifeStage === 'lebensabend') setMember(tc, pid, m.id, 'lifeStage', 'hinfaellig', `${m.name} grows frail`, { kind: 'council.age' });
      else die(tc, pid, m.id);
    });
  }
}

function die(tc, pid, memberId) {
  const people = tc.state.peoples[pid];
  const m = findMember(people, memberId);
  if (!m) return;
  // An empty council would leave no leader, which the state invariants forbid.
  if (people.council.length <= 1) {
    notice(tc, 'council.last-member', { kind: 'member', id: memberId }, `${m.name} is the last council member and holds on`, { people: pid });
    return;
  }
  const wasLeader = m.leader;
  const gone = structuredClone(m);
  setPeople(tc, pid, 'council', people.council.filter((x) => x.id !== memberId), `${gone.name} dies`, { kind: 'council.death' });
  setKern(tc, pid, 'deaths', [...slice(people).deaths, { member: gone.id, turn: tc.turn }], `${gone.name} dies`, { kind: 'council.death' });
  setKern(tc, pid, 'seats', [...slice(people).seats, { role: gone.role, favor: [...gone.goal.favor], oppose: [...gone.goal.oppose], since: tc.turn }],
    `the seat of ${gone.role} stands open`, { kind: 'council.seat' });
  fireHook(tc, pid, `death:${gone.role}`, []);
  fireHook(tc, pid, 'death', []);
  if (wasLeader) succeed(tc, pid);
}

// The most loyal remaining member leads (ties: council order); standing halves
// and loyalty is capped, before any preparation of a successor can exist.
function succeed(tc, pid) {
  const people = tc.state.peoples[pid];
  let heir = people.council[0];
  for (const c of people.council) if (c.loyalty > heir.loyalty) heir = c;
  setMember(tc, pid, heir.id, 'leader', true, `${heir.name} succeeds the leader`, { kind: 'council.succession' });
  setPeople(tc, pid, 'standing', Math.floor(people.standing / 2), 'standing halves with the change of leadership', { kind: 'people.standing' });
  for (const c of people.council) {
    if (c.loyalty > RULES.successionLoyalty) setMember(tc, pid, c.id, 'loyalty', RULES.successionLoyalty, 'loyalty is capped in the succession', { kind: 'council.succession' });
  }
  applyOnce(tc, pid, { op: 'token.add', kind: 'crisis', tags: ['nachfolge'] }, { reason: 'unprepared succession' });
  fireHook(tc, pid, 'death:leader', []);
}

// --- d. meters ----------------------------------------------------------------------

function meters(tc) {
  for (const pid of alivePeoples(tc)) {
    const people = tc.state.peoples[pid];
    const executed = tc.scratch.executed?.[pid] ?? [];
    const seen = new Set();
    for (const s of ofOp(standingOf(tc.s0, tc.env, pid), 'meter')) {
      const def = s.effect;
      if (seen.has(def.id)) continue;
      seen.add(def.id);
      const init = clamp(0, def.min, def.max);
      if (people.meters[def.id] === undefined) setPeople(tc, pid, `meters.${def.id}`, init, `meter ${def.id} starts at ${init}`, { kind: 'meter.change' });
      // Thresholds are crossed relative to the opening value, not to deltas earlier in the turn.
      const before = tc.s0.peoples[pid].meters?.[def.id] ?? init;
      const { on, amount } = def.rise;
      // use:<x> counts every hook of that name this turn: turn.js fires use:<order type>
      // per executed order, magie fires use:<application id> per application.
      const uses = tc.hooks.filter((h) => h.people === pid && h.hook === on).length;
      const rise = on === 'season' ? amount : amount * uses;
      const delta = rise > 0 ? rise : -def.decay;
      addPeople(tc, pid, `meters.${def.id}`, delta, rise > 0 ? `${def.id} rises (${on})` : `${def.id} decays`, { min: def.min, max: def.max, kind: 'meter.change' });
      const after = people.meters[def.id];
      for (const t of def.thresholds) {
        const up = t.at > 0 && before < t.at && t.at <= after;
        const down = t.at <= 0 && before > t.at && t.at >= after;
        if (up || down) applyOnceList(tc, pid, t.effects, { reason: `${def.id} crosses ${t.at}`, refs: s.source.ref ? [s.source.ref] : [] });
      }
    }
  }
}

// --- e. triggers --------------------------------------------------------------------

function triggers(tc) {
  for (const pid of alivePeoples(tc)) {
    const hooks = new Set(['season', ...(tc.cal.winter ? ['winter'] : []), ...tc.hooks.filter((h) => h.people === pid).map((h) => h.hook)]);
    const cx = cxOf(tc, pid);
    for (const s of ofOp(standingOf(tc.s0, tc.env, pid), 'trigger')) {
      const t = s.effect;
      if (!hooks.has(t.on) || !evalCondition(t.if, cx)) continue;
      applyOnceList(tc, pid, t.effects, { reason: `${s.source.label}: ${t.on}`, refs: s.source.ref ? [s.source.ref] : [] });
    }
  }
}

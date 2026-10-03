// Tasks the kernel hands to the agents (agents/tasks/T<turn>/<agent>-<scope>.json).
// Pure: no file access, so the CLI, the server and tests share it. A task for
// one people carries only data derived from projectFor(state, env, people), so
// an agent never sees a stock or draft of another people.
//
//   buildTasks(state, env, { library, phase })  -> [{ path, task }]
//     phase resolving: the world task (phase A); otherwise the phase B tasks
//     (research per people, rival per AI people, council for the player,
//     chronicler for the campaign).
//   buildJudgeTask(state, env, judge)           -> { path, task }

import { ONCE_OPS, STANDING_OPS, TIERS } from '../schemas/effects.js';
import { ITEMS_BY_AGENT } from '../schemas/proposal.js';
import { projectFor } from '../core/project.js';
import { practiceTop, openTier } from '../content/validate.js';
import { libraryFrom } from '../content/library.js';
import { catalogueFor } from '../core/orders.js';
import { kern, maxKnownTier, peopleIds } from '../core/state.js';
import { calendarOf } from '../core/calendar.js';
import { activeModules } from '../modules/index.js';

const stem = (turn) => `T${String(turn).padStart(4, '0')}`;
const ALL_PRIMITIVES = [...new Set([...STANDING_OPS, ...ONCE_OPS])];
// Used when a world's regeln.json sets no tuning.limits.
const DEFAULT_LIMITS = Object.freeze({ candidatesPerTurn: 3, aboveTier: 1, openCandidates: 6, moduleActivations: 1 });

const alive = (state, pid) => state.peoples[pid].population.core > 0 && state.map.settlements.some((s) => s.people === pid);

function packLibrary(env) {
  const c = env.content;
  return libraryFrom([...c.entwicklungen, ...c.ereignisse, ...c.bestimmungen]);
}

function tagsFor(env, state, pid) {
  const tags = new Set(Object.keys(env.vocabulary));
  if (pid) for (const m of activeModules(state, env, pid)) for (const t of Object.keys(m.module.tags ?? {})) tags.add(t);
  return [...tags].sort().slice(0, 200);
}

function budgetRows(maxTier) {
  return TIERS.filter((r) => r.tier <= maxTier)
    .map(({ tier, effectMax, netMin, netMax, priceMax }) => ({ tier, effectMax, netMin, netMax, priceMax }));
}

function envelope(state, agent, people, extra) {
  const scope = people ?? 'all';
  const proposalId = people ? `${agent}.${people}.T${state.turn}` : `${agent}.T${state.turn}`;
  return {
    path: `agents/tasks/${stem(state.turn)}/${agent}-${scope}.json`,
    task: {
      format: 'realmcraft-task',
      version: 1,
      campaign: state.campaign.id,
      turn: state.turn,
      rev: state.rev,
      agent,
      people: people ?? null,
      respondAs: { proposalId, path: `agents/proposals/${proposalId}.json` },
      ...extra,
    },
  };
}

// Files an agent reads: its own projection and the projected events of the
// season before; campaign-wide roles name the player's.
function viewReads(state, pid) {
  const reads = [`view/${pid}.json`];
  if (state.turn > 0) reads.push(`view/${pid}/events/${stem(state.turn - 1)}.json`);
  reads.push('library.json');
  return reads;
}

function limitsFor(env, items, extra = {}) {
  return {
    items: [...items],
    candidates: 0,
    aboveTier: 0,
    openPool: 0,
    moduleActivations: 0,
    allowedPrimitives: ALL_PRIMITIVES,
    tags: [],
    budget: [],
    ...extra,
  };
}

function researchTask(state, env, library, pid) {
  const view = projectFor(state, env, pid);
  const people = view.peoples[pid];
  const lim = { ...DEFAULT_LIMITS, ...(env.regeln.tuning?.limits ?? {}) };
  const maxTier = env.regeln.tuning?.maxTier ?? TIERS.length;
  const open = openTier(people, { state: view, regeln: env.regeln, library, turn: state.turn });
  const reach = Math.min(maxTier, open + lim.aboveTier);
  return envelope(state, 'research', pid, {
    read: viewReads(state, pid),
    context: {
      phase: 'b',
      practiceTop: practiceTop(people, 3),
      openTier: open,
      maxKnownTier: maxKnownTier(view, env, pid),
      tokens: people.tokens,
      requests: people.developments.requests,
      candidates: people.developments.candidates.length,
      known: people.developments.known.map((k) => k.ref),
      lebensweise: people.lebensweise,
      bestimmung: people.bestimmung ?? null,
    },
    limits: limitsFor(env, ITEMS_BY_AGENT.research, {
      candidates: lim.candidatesPerTurn,
      aboveTier: lim.aboveTier,
      openPool: lim.openCandidates,
      moduleActivations: lim.moduleActivations,
      tags: tagsFor(env, state, pid),
      budget: budgetRows(reach),
    }),
  });
}

function rivalTask(state, env, pid) {
  const view = projectFor(state, env, pid);
  const people = view.peoples[pid];
  const profile = env.regeln.aiProfiles?.find((a) => a.id === people.agentProfile) ?? null;
  return envelope(state, 'rival', pid, {
    read: viewReads(state, pid),
    context: {
      phase: 'b',
      draftTurn: state.turn,
      profile: profile ? { id: profile.id, name: profile.name, stance: profile.stance, weights: profile.weights } : null,
      catalogue: catalogueFor(view, env, pid),
      resources: people.resources,
      units: people.units,
    },
    limits: limitsFor(env, ITEMS_BY_AGENT.rival, { tags: tagsFor(env, state, pid) }),
  });
}

function councilTask(state, env, pid) {
  const view = projectFor(state, env, pid);
  const people = view.peoples[pid];
  return envelope(state, 'council', pid, {
    read: viewReads(state, pid),
    context: {
      phase: 'b',
      council: people.council,
      seats: kern(people).seats,
      newMemberLoyalty: env.regeln.tuning?.newMemberLoyalty ?? 0,
    },
    limits: limitsFor(env, ITEMS_BY_AGENT.council, { tags: tagsFor(env, state, pid) }),
  });
}

// The world agent sees the event bands and the situation of every people,
// because a card is matched against its `if` condition.
function worldTask(state, env) {
  const eventDraws = {};
  const situation = {};
  for (const pid of peopleIds(state)) {
    if (!alive(state, pid)) continue;
    const p = state.peoples[pid];
    const d = state.eventDraws?.[pid];
    if (d) eventDraws[pid] = { band: d.band, roll: d.roll, card: d.card };
    situation[pid] = { lebensweise: p.lebensweise, resources: p.resources, meters: p.meters, standing: p.standing, population: p.population.core };
  }
  const cal = calendarOf(env.regeln, state.turn);
  return envelope(state, 'world', null, {
    read: ['state.json', 'library.json'],
    context: { phase: 'a', season: cal.season, year: cal.year, eventDraws, situation },
    limits: limitsFor(env, ITEMS_BY_AGENT.world, { tags: tagsFor(env, state, null) }),
  });
}

function chroniclerTask(state, env) {
  const player = state.campaign.player;
  const cal = calendarOf(env.regeln, state.turn);
  const reads = [`view/${player}.json`];
  if (state.turn > 0) reads.push(`view/${player}/events/${stem(state.turn - 1)}.json`);
  return envelope(state, 'chronicler', null, {
    read: reads,
    context: { phase: 'b', player, season: cal.season, year: cal.year, chapter: stem(state.turn) },
    limits: limitsFor(env, ITEMS_BY_AGENT.chronicler),
  });
}

export function buildTasks(state, env, { library, phase = state.phase } = {}) {
  if (state.status === 'ended') return [];
  if (phase === 'resolving') return [worldTask(state, env)];
  const lib = library ?? packLibrary(env);
  const out = [];
  for (const pid of peopleIds(state)) {
    if (!alive(state, pid)) continue;
    out.push(researchTask(state, env, lib, pid));
    if (state.peoples[pid].controller === 'ai') out.push(rivalTask(state, env, pid));
    else out.push(councilTask(state, env, pid));
  }
  out.push(chroniclerTask(state, env));
  return out;
}

const JUDGES = ['judge-coherence', 'judge-balance', 'judge-narrative'];

/** Judges see the whole state and the unfiltered round report, so their reads are the full files. */
export function buildJudgeTask(state, env, judge) {
  if (!JUDGES.includes(judge)) throw new Error(`buildJudgeTask: unknown judge ${judge}`);
  const read = ['state.json'];
  if (state.turn > 0) read.push(`log/${stem(state.turn - 1)}.json`);
  read.push('library.json');
  if (judge === 'judge-narrative') read.push('narrative/gedaechtnis.md');
  return envelope(state, judge, null, {
    read,
    context: { phase: 'judges' },
    limits: limitsFor(env, ITEMS_BY_AGENT[judge], {
      allowedPrimitives: [...ONCE_OPS],
      tags: tagsFor(env, state, null),
      budget: budgetRows(1),
    }),
  });
}

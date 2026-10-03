// Tasks the kernel hands to the agents (agents/tasks/T<turn>/<agent>-<scope>.json).
// Every task that asks for prose (rival stance, council voices, world cards,
// chronicle, judges) carries context.language, the campaign's narrative language.
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
import { catalogueFor, orderContext, registry, slotCapacity } from '../core/orders.js';
import { homeSettlement, kern, maxKnownTier, peopleIds, settingsOf, settlementsOf } from '../core/state.js';
import { RULES } from '../core/rules.js';
import { distance, parseKey } from '../world/index.js';
import { calendarOf } from '../core/calendar.js';

const stem = (turn) => `T${String(turn).padStart(4, '0')}`;
const ALL_PRIMITIVES = [...new Set([...STANDING_OPS, ...ONCE_OPS])];
// Used when a world's regeln.json sets no tuning.limits.
const DEFAULT_LIMITS = Object.freeze({ candidatesPerTurn: 3, aboveTier: 1, openCandidates: 6, moduleActivations: 1 });

const alive = (state, pid) => state.peoples[pid].population.core > 0 && state.map.settlements.some((s) => s.people === pid);

function packLibrary(env) {
  const c = env.content;
  return libraryFrom([...c.entwicklungen, ...c.ereignisse, ...c.bestimmungen]);
}

// Only the world's vocabulary: the validator checks every tag an agent
// writes against regeln.vocabulary, so a module tag outside it (reiter) would
// be offered here and rejected at ingest.
function tagsFor(env) {
  return Object.keys(env.vocabulary).sort().slice(0, 200);
}

const TILE = 'tile key "q,r"';
// Parameters of every order type as the checks in engine/core and
// engine/modules read them. A rival agent drafts from this table, the
// targets and the example; without it agents guessed names (ref, target).
const ORDER_PARAMS = Object.freeze({
  build: { development: 'ref of a known, active bauwerk', settlement: 'id of an own settlement' },
  found: { tile: `${TILE}: buildable, within ${RULES.foundRange} of an own settlement or unit, region without settlement or foreign control`, name: 'optional settlement name' },
  institute: { development: 'ref of a known, active institution not yet in force' },
  explore: { tile: `${TILE} within ${RULES.exploreRange} of an own settlement or unit` },
  road: { tile: `${TILE} the road leads towards` },
  'road.pave': { tile: `${TILE} the raised road leads towards` },
  machtprobe: {
    aim: 'override | rally | reconcile | quell', approach: 'optional vocabulary tag', cause: 'optional, "need"',
    against: 'optional council member id', order: 'order id of this draft (aim override)', member: 'council member id (aim reconcile)',
  },
  talk: { mode: 'listen | ask | honor | honor-dead', member: 'council member id (all modes but honor-dead)' },
  'research.assign': { development: 'ref of an open candidate or of a development in research' },
  'research.direct': { tags: 'one to three distinct vocabulary tags', note: 'optional text, at most 200 characters' },
  'destiny.adopt': { bestimmung: 'ref of a destiny offered to the people (bestimmung.offers)' },
  migrate: { tile: `${TILE} within reach of the camp, buildable, no settlement on it` },
  adopt: { lebensweise: 'ref of another known, active way of life' },
  'trade.offer': { partner: 'id of a people in contact', give: '{ resource: amount }', get: '{ resource: amount }', seasons: 'integer number of seasons' },
  'trade.accept': { offer: 'id of an open offer to this people' },
  'trade.cancel': { contract: 'id of a contract of this people' },
  'trade.market': { mode: 'buy | sell', res: 'resource id other than the currency', amount: 'integer' },
  'discipline.use': { development: 'ref of a known discipline', application: 'id of one of its applications', target: 'target the application names' },
  recruit: { type: 'ref of a known, active unit development', settlement: 'id of an own settlement' },
  move: { unit: 'id of a ready own unit', tile: `${TILE} within its reach, no foreign unit or settlement visible on it` },
  attack: { units: 'list of own unit ids', tile: `${TILE} with a foreign unit or settlement` },
  retreat: { unit: 'id of an own unit away from home' },
  ausfall: { settlement: 'id of an own settlement that does not move', tile: `${TILE} with foreign units` },
  raubzug: { units: 'list of own unit ids', region: 'region id "cq:cr:i"' },
});

const MAX_TARGETS = 6;
const MAX_TILES = 40;

/** Known tiles of a people, nearest to its home first. */
function nearTiles(view, pid) {
  const home = homeSettlement(view, pid);
  if (!home) return [];
  const h = parseKey(home.tile);
  return Object.keys(view.map.known[pid] ?? {})
    .map((k) => ({ k, d: distance(h, parseKey(k)) }))
    .sort((a, b) => a.d - b.d || (a.k < b.k ? -1 : 1))
    .slice(0, MAX_TILES)
    .map((x) => x.k);
}

function candidateParams(view, env, pid, type) {
  const p = view.peoples[pid];
  const own = settlementsOf(view, pid).map((x) => x.id);
  const refs = (kind) => p.developments.known.filter((k) => env.entwicklung(k.ref)?.kind === kind).map((k) => k.ref);
  const cross = (a, key, b, key2) => a.flatMap((x) => b.map((y) => ({ [key]: x, [key2]: y })));
  switch (type) {
    case 'build': return cross(refs('bauwerk'), 'development', own, 'settlement');
    case 'found': case 'explore': case 'road': case 'road.pave': case 'migrate': return nearTiles(view, pid).map((tile) => ({ tile }));
    case 'institute': return refs('institution').map((development) => ({ development }));
    case 'research.assign': return [...p.developments.candidates.map((c) => c.ref), ...p.developments.research.map((r) => r.ref)].map((development) => ({ development }));
    case 'research.direct': return [{ tags: [practiceTop(p, 1).map(([t]) => t).find((t) => Object.hasOwn(env.vocabulary, t)) ?? Object.keys(env.vocabulary).sort()[0]] }];
    case 'destiny.adopt': return (p.bestimmung?.offers ?? []).map((o) => ({ bestimmung: o.ref }));
    case 'adopt': return refs('lebensweise').map((lebensweise) => ({ lebensweise }));
    case 'recruit': return cross(refs('einheit'), 'type', own, 'settlement');
    case 'move': return p.units.flatMap((u) => nearTiles(view, pid).map((tile) => ({ unit: u.id, tile })));
    case 'retreat': return p.units.map((u) => ({ unit: u.id }));
    case 'talk': return [{ mode: 'listen', member: p.council[0]?.id }];
    case 'machtprobe': return [{ aim: 'rally' }];
    default: return [];
  }
}

/**
 * The orders a people can give now: parameters, up to six valid parameter
 * sets (each passes the order's own check on the people's projection) and an
 * example order. Types without enumerable targets list their parameters only.
 */
export function orderGuide(view, env, pid) {
  const reg = registry();
  const ox0 = orderContext(view, env, pid, { path: '/orders/0' });
  const out = [];
  for (const c of catalogueFor(view, env, pid, ox0)) {
    if (!c.available) continue;
    const def = reg[c.type].def;
    const targets = [];
    for (const params of candidateParams(view, env, pid, c.type)) {
      if (targets.length >= MAX_TARGETS) break;
      // A fresh cx per check: some checks count earlier orders of one draft on it.
      const ox = { ...ox0, cx: { ...ox0.cx } };
      let issues;
      try {
        issues = def.check(ox, { id: 'o1', type: c.type, params });
      } catch {
        continue;
      }
      if (!issues.some((i) => i.severity === 'error')) targets.push(params);
    }
    out.push({
      type: c.type,
      slot: c.slot,
      limit: c.limit,
      params: ORDER_PARAMS[c.type] ?? {},
      targets,
      example: targets.length ? { id: 'o1', type: c.type, params: targets[0] } : null,
    });
  }
  return out;
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
      tags: tagsFor(env),
      budget: budgetRows(reach),
    }),
  });
}

function rivalTask(state, env, pid) {
  const view = projectFor(state, env, pid);
  const people = view.peoples[pid];
  const profile = env.regeln.aiProfiles?.find((a) => a.id === people.agentProfile) ?? null;
  const cap = slotCapacity(orderContext(view, env, pid));
  return envelope(state, 'rival', pid, {
    read: viewReads(state, pid),
    context: {
      phase: 'b',
      language: settingsOf(state).language,
      draftTurn: state.turn,
      profile: profile ? { id: profile.id, name: profile.name, stance: profile.stance, weights: profile.weights } : null,
      catalogue: catalogueFor(view, env, pid),
      orders: orderGuide(view, env, pid),
      resources: people.resources,
      units: people.units,
    },
    // Orders with slot "free" take no slot; main and minor are the capacity of the season.
    limits: limitsFor(env, ITEMS_BY_AGENT.rival, { tags: tagsFor(env), slots: { main: cap.main, minor: cap.minor } }),
  });
}

function councilTask(state, env, pid) {
  const view = projectFor(state, env, pid);
  const people = view.peoples[pid];
  return envelope(state, 'council', pid, {
    read: viewReads(state, pid),
    context: {
      phase: 'b',
      language: settingsOf(state).language,
      council: people.council,
      seats: kern(people).seats,
      newMemberLoyalty: env.regeln.tuning?.newMemberLoyalty ?? 0,
    },
    limits: limitsFor(env, ITEMS_BY_AGENT.council, { tags: tagsFor(env) }),
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
    context: { phase: 'a', language: settingsOf(state).language, season: cal.season, year: cal.year, eventDraws, situation },
    limits: limitsFor(env, ITEMS_BY_AGENT.world, { tags: tagsFor(env) }),
  });
}

function chroniclerTask(state, env) {
  const player = state.campaign.player;
  const cal = calendarOf(env.regeln, state.turn);
  const reads = [`view/${player}.json`];
  if (state.turn > 0) reads.push(`view/${player}/events/${stem(state.turn - 1)}.json`);
  return envelope(state, 'chronicler', null, {
    read: reads,
    context: { phase: 'b', language: settingsOf(state).language, player, season: cal.season, year: cal.year, chapter: stem(state.turn) },
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
    context: { phase: 'judges', language: settingsOf(state).language },
    limits: limitsFor(env, ITEMS_BY_AGENT[judge], {
      allowedPrimitives: [...ONCE_OPS],
      tags: tagsFor(env),
      budget: budgetRows(1),
    }),
  });
}

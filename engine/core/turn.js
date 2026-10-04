// Campaign creation and the turn pipeline.
//
//   createCampaign(env, { id, seed, player?, rivals?, difficulty?, language? })
//                                                 -> { state, events }   phase agents, turn 0
//   preview(state, env, draft, { as })            -> preview (pure; state or projection),
//                                                    with the consequences of draft.choices
//                                                    and of a destiny.adopt order
//   seal(state, env, drafts)                      -> { ok, issues, state, drafts, events }
//                                                    planning -> resolving: orders locked,
//                                                    AI drafts filled, world-event draws made
//   apply(state, env, drafts)                     -> { ok, issues, state, report, events }
//                                                    resolving -> agents (seals first from planning)
//   open(state, env)                              -> { ok, issues, state, events }  agents -> planning
//   stateHash(state)                              hash without `derived`
//
// apply reads the opening state S0 everywhere and writes into a clone, in
// this order (tc.step): orders (Machtprobe first, then council booking,
// costs, all other orders), modules, economy, research, military, vision,
// events, council, cleanup, bestimmung, finalize. Every change lands in the log.

import { RULES, RULES_VERSION, tune } from './rules.js';
import { issue, hasErrors } from './issues.js';
import { hashValue } from './hash.js';
import { seedState } from './rng.js';
import { calendarOf } from './calendar.js';
import { createContext, finish, fitLabour, notice, noteChange, record, setMember, setPeople, setRelation, fireHook } from './log.js';
import { clone, isAlive, peopleIds, relKey, settlementsOf, KERN_SLICE, DEFAULT_SETTINGS } from './state.js';
import { DIFFICULTIES, PATTERNS } from '../schemas/common.js';
import { applyOnce, applyOnceList, standingOf, ofOp } from './effects.js';
import { checkDraft, orderContext, catalogueFor } from './orders.js';
import { calculation, eventBand, resolveProbe, SUCCESS } from './probes.js';
import { visionUpdate } from './map.js';
import { MODULES, activeModules } from '../modules/index.js';
import { findStart, placePeoples, key as tileKey, regionOf, regionInfo, reveal, hashSeed } from '../world/index.js';
import * as economy from './economy.js';
import * as research from './research.js';
import * as military from './military.js';
import * as events from './events.js';
import * as council from './council.js';
import * as bestimmung from './bestimmung.js';
import { computeDerived } from './derive.js';
import { projectFor } from './project.js';
import { fallbackDraft } from '../ai/fallback.js';

const LIMITS = { chronicleTurns: RULES.chronicleTurns, chronicleMax: RULES.chronicleMax };

export function stateHash(state) {
  const { derived, ...rest } = state;
  return hashValue(rest);
}

export function emptyDraft(state, pid) {
  return {
    format: 'realmcraft-draft', version: 1, people: pid, turn: state.turn, baseRev: state.rev,
    orders: [], mandate: {}, rolls: {}, withdrawn: [], sealed: false,
  };
}

/** Starting labour: one clan on material if there are two or more, the rest on food. */
export function defaultAssign(env, core) {
  const out = {};
  const material = env.resourceIds.includes(RULES.material) && core >= 2 ? 1 : 0;
  if (env.resourceIds.includes(RULES.food)) out[RULES.food] = core - material;
  if (material) out[RULES.material] = material;
  return out;
}

// The seal hashes say nothing a people may learn about another's draft.
const hideEntry = (entry) => {
  entry.visibleTo = [];
  return entry;
};

const TILE_KEY = new RegExp(PATTERNS.tile);

/**
 * The tile an order acts on, read from its params as the order checks name
 * them (tile, target, region, settlement, unit, units), or null for an order
 * without a place (talk, research). Read from the opening state.
 */
export function orderTile(state, world, pid, order) {
  const p = order.params ?? {};
  for (const v of [p.tile, p.target]) if (typeof v === 'string' && TILE_KEY.test(v)) return v;
  if (typeof p.region === 'string') {
    const c = regionInfo(world, p.region)?.centre;
    if (c) return tileKey(c.q, c.r);
  }
  const s = typeof p.settlement === 'string' ? state.map.settlements.find((x) => x.id === p.settlement) : null;
  if (s) return s.tile;
  const unit = typeof p.unit === 'string' ? p.unit : Array.isArray(p.units) ? p.units[0] : null;
  return state.peoples[pid]?.units.find((u) => u.id === unit)?.tile ?? null;
}

/**
 * Fields added in M1 that a campaign created before them lacks: the settings
 * and the location of every council member; labour that a loss of clans left
 * larger than the people is trimmed. Written with a log entry at the
 * first transition after the kernel update, so the state accounts for them.
 */
export function migrate(tc) {
  if (!tc.state.settings) {
    noteChange(tc, 'campaign.settings', { kind: 'campaign', id: tc.state.campaign.id }, 'settings', null, { ...DEFAULT_SETTINGS },
      'campaign settings take their defaults', { visibleTo: 'all' });
    tc.state.settings = { ...DEFAULT_SETTINGS };
  }
  for (const pid of peopleIds(tc.state)) {
    for (const m of tc.state.peoples[pid].council) {
      if (!Object.hasOwn(m, 'at')) setMember(tc, pid, m.id, 'at', null, `${m.name} is at home`, { kind: 'member.at' });
    }
    // States saved before a loss of clans trimmed the labour may assign more clans than exist.
    fitLabour(tc, pid);
  }
}

// --- creation ----------------------------------------------------------------

/**
 * Start tiles of the AI peoples, each in its own region: a region has one
 * controller, so two peoples starting in one region would leave one of them
 * in foreign land. placePeoples keeps the minimum distance; its candidates
 * are filtered greedily for unused regions, with a widening search radius.
 */
function startTiles(world, start, count) {
  if (count <= 0) return [];
  const used = new Set([regionOf(world, start.q, start.r)]);
  for (let factor = 1; factor <= 4; factor++) {
    const cands = placePeoples(world, count * 8, RULES.minStartDistance, { anchor: start, maxRadius: RULES.minStartDistance * (count + 2) * factor });
    const chosen = [];
    const taken = new Set(used);
    for (const t of cands) {
      const r = regionOf(world, t.q, t.r);
      if (taken.has(r)) continue;
      taken.add(r);
      chosen.push(t);
      if (chosen.length === count) return chosen;
    }
  }
  throw new Error('createCampaign: not enough start tiles in distinct regions for all peoples');
}

function seedOf(seed) {
  return typeof seed === 'number' && Number.isInteger(seed) ? seed >>> 0 : hashSeed('campaign', String(seed));
}

// Start stock of the AI peoples per difficulty, a step of a quarter either way
// (owner decision M1 names the scaling, the factor is the lane's choice).
const DIFFICULTY_STOCK = Object.freeze({ easy: 0.75, normal: 1, hard: 1.25 });
const LANGUAGE = new RegExp(PATTERNS.language);

/**
 * Throws on creation options the kernel cannot honour; the CLI checks the same
 * at its boundary and reports issues instead.
 */
export function creationProblem(env, { player = null, rivals = null, difficulty = DEFAULT_SETTINGS.difficulty, language = DEFAULT_SETTINGS.language } = {}) {
  const ids = env.regeln.peopleTemplates.map((t) => t.id);
  const own = player ?? ids[0];
  if (!ids.includes(own)) return { reason: 'unknown-template', template: String(own), message: `no people template ${own}` };
  if (rivals !== null) {
    if (!Array.isArray(rivals)) return { reason: 'rivals', message: 'rivals must be a list of template ids' };
    for (const r of rivals) {
      if (!ids.includes(r)) return { reason: 'unknown-template', template: String(r), message: `no people template ${r}` };
      if (r === own) return { reason: 'rival-is-player', template: r, message: `${r} is the player's people` };
    }
    if (new Set(rivals).size !== rivals.length) return { reason: 'rival-twice', message: 'a rival is named twice' };
  }
  if (!DIFFICULTIES.includes(difficulty)) return { reason: 'difficulty', difficulty: String(difficulty), message: `difficulty must be one of ${DIFFICULTIES.join(', ')}` };
  if (typeof language !== 'string' || !LANGUAGE.test(language)) return { reason: 'language', language: String(language), message: 'language must be a two-letter code' };
  return null;
}

const scaled = (bag, f) => Object.fromEntries(Object.entries(bag).map(([res, n]) => [res, Math.min(999, Math.round(n * f))]));

/**
 * New campaign at turn 0 in phase agents. The first people template (or
 * `player`) is the player's people; `rivals` names the templates of the AI
 * peoples (default all others), placed at least RULES.minStartDistance away.
 * `difficulty` scales the start stock of the AI peoples, `language` is the
 * narrative language of the campaign.
 */
export function createCampaign(env, { id, seed, player = null, rivals = null, difficulty = DEFAULT_SETTINGS.difficulty, language = DEFAULT_SETTINGS.language }) {
  const problem = creationProblem(env, { player, rivals, difficulty, language });
  if (problem) throw new Error(`createCampaign: ${problem.message}`);
  const { regeln } = env;
  const world = env.world(seed);
  const templates = [...regeln.peopleTemplates];
  const pi = player ? templates.findIndex((t) => t.id === player) : 0;
  const others = templates.filter((t, i) => i !== pi && (rivals === null || rivals.includes(t.id)));
  const ordered = [templates[pi], ...others];
  const start = findStart(world);
  if (!start) throw new Error('createCampaign: no start tile for the player');
  const tiles = [start, ...startTiles(world, start, ordered.length - 1)];
  const approval = tune(env, 'approval');

  const s0 = {
    format: 'realmcraft-campaign',
    version: 1,
    rulesVersion: RULES_VERSION,
    campaign: { id, world: { id: env.welt.id, version: env.welt.version, hash: env.hash }, player: ordered[0].id },
    rev: 0,
    turn: 0,
    phase: 'agents',
    rng: seedState(seedOf(seed) ^ 0x5bd1e995),
    map: { seed, packId: env.welt.id, control: {}, settlements: [], known: {}, features: {} },
    peoples: {},
    relations: {},
    modules: {},
    eventPool: env.content.ereignisse.map((e) => `${e.id}@${e.rev}`),
    ingested: {},
    eventDraws: {},
    pendingChoices: [],
    chronicle: [],
    status: 'playing',
    result: null,
    settings: { difficulty, language },
  };
  const tc = createContext(s0, env);
  tc.step = 'create';
  record(tc, 'campaign.created', { kind: 'campaign', id }, null, `campaign from world ${env.welt.id} with seed ${seed}`);

  ordered.forEach((tpl, i) => {
    const tile = tiles[i];
    const tkey = tileKey(tile.q, tile.r);
    const regionId = regionOf(world, tile.q, tile.r);
    const councilTpl = regeln.councilTemplates.find((c) => c.id === tpl.council);
    const known = [...new Set([tpl.lebensweise, ...tpl.developments])];
    const lw = env.entwicklung(tpl.lebensweise);
    const type = lw?.spec?.settlement ?? 'camp';
    const people = {
      id: tpl.id,
      name: tpl.name,
      controller: i === 0 ? 'player' : 'ai',
      agentProfile: i === 0 ? null : tpl.agentProfile,
      identity: clone(tpl.identity),
      lebensweise: tpl.lebensweise,
      population: { ...clone(tpl.population), assigned: defaultAssign(env, tpl.population.core) },
      resources: i === 0 ? clone(tpl.resources) : scaled(tpl.resources, DIFFICULTY_STOCK[difficulty]),
      standing: tpl.standing,
      developments: {
        known: known.map((ref) => ({ ref, since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null })),
        research: [],
        candidates: [],
        requests: [],
        instituted: known.filter((ref) => env.entwicklung(ref)?.kind === 'institution'),
      },
      units: [],
      council: clone(councilTpl?.members ?? []).map((m) => ({ ...m, at: null })),
      practice: { ledger: [] },
      tokens: [],
      statuses: [],
      meters: { [RULES.approval]: approval.start },
      shortfall: {},
      bestimmung: tpl.bestimmung ? bestimmung.initBestimmung(env, tpl.bestimmung, 0) : null,
      modules: { kern: KERN_SLICE() },
      // Only with paths, so a world without them creates the state it created before M1 and old journals replay.
      ...(regeln.pfade ? { pfade: { opened: {} } } : {}),
    };
    tc.state.peoples[tpl.id] = people;
    const settlement = {
      id: `s-${tpl.id}`.slice(0, 41),
      name: tpl.name.slice(0, 60),
      people: tpl.id,
      kind: RULES.settlementKind[type],
      tile: tkey,
      regionId,
      mobile: type === 'camp',
      buildings: [],
    };
    tc.state.map.settlements.push(settlement);
    tc.state.map.control[regionId] = tpl.id;
    tc.state.map.known[tpl.id] = reveal({}, tile, RULES.settlementSight, world);
    record(tc, 'people.placed', { kind: 'people', id: tpl.id }, { field: 'map.settlements', before: null, after: settlement.id },
      `${tpl.name} starts at ${tkey}`, { people: tpl.id });
  });
  const ids = peopleIds(tc.state);
  for (const a of ids) for (const b of ids) if (a < b) tc.state.relations[relKey(a, b)] = { value: 0, atWar: false, since: 0, contact: false };
  tc.state.modules.kern = { draws: {} };
  for (const m of MODULES) if (m.initGlobal) tc.state.modules[m.id] = m.initGlobal(env);
  for (const pid of ids) {
    const p = tc.state.peoples[pid];
    for (const am of activeModules(tc.state, env, pid)) {
      if (am.module.initPeople) p.modules[am.id] = am.module.initPeople(tc.state, env, pid, am.bind);
    }
  }
  const state = finish(tc, LIMITS);
  state.derived = computeDerived(state, env);
  return { state, events: tc.log };
}

// --- preview ------------------------------------------------------------------

/**
 * Pure preview of one people's draft on a full state or on projectFor(state,
 * env, as). Never touches state or rng; probe outcomes are not included.
 */
export function preview(state, env, draft, { as } = {}) {
  const pid = as ?? draft?.people;
  const chk = checkDraft(state, env, draft, { as: pid, mode: 'preview' });
  const result = {
    people: pid,
    turn: state.turn,
    phase: state.phase,
    issues: chk.issues,
    probes: chk.probes,
    costs: chk.costs,
    slots: chk.slots,
    assign: chk.assign,
    votes: chk.entries.filter((e) => e.vote).map((e) => ({ order: e.order.id, ...e.vote })),
    orders: chk.entries.map((e) => ({
      id: e.order.id, type: e.order.type, slot: e.slot, tags: e.tags, costs: e.plan?.costs ?? {},
      probe: e.probe?.id ?? null, venture: e.venture, ok: !hasErrors(e.errors),
    })),
    unresolved: chk.unresolved,
    choices: [],
    forecast: null,
    catalogue: null,
    council: null,
  };
  if (state.peoples[pid]?.developments) {
    // Loyalty and approval changes the board shows before the player decides (D15).
    result.council = council.forecastCouncil(orderContext(state, env, pid), chk.entries);
    const byOrder = new Map(result.council.orders.map((o) => [o.order, o]));
    for (const o of result.orders) {
      const f = byOrder.get(o.id);
      o.council = f ? { loyalty: f.loyalty, meters: f.meters, depends: f.depends } : null;
    }
    // Answers to open decisions (D15): each option's once effects on its own,
    // and their resources folded into the forecast's stock.
    const choices = draft?.choices && typeof draft.choices === 'object' && !Array.isArray(draft.choices) ? draft.choices : {};
    result.choices = previewChoices(state, env, pid, choices);
    const spend = { ...chk.costs };
    for (const c of result.choices) for (const [res, n] of Object.entries(c.delta.resources ?? {})) spend[res] = (spend[res] ?? 0) - n;
    for (const o of result.orders) {
      const e = chk.entries.find((x) => x.order.id === o.id);
      if (o.type === 'destiny.adopt' && o.ok && e) o.destiny = previewAdopt(state, env, pid, e);
    }
    result.forecast = economy.forecast(state, env, pid, { spend, assign: chk.assign });
    for (const c of result.choices) {
      for (const [res, n] of Object.entries(c.delta.resources ?? {})) {
        const net = (result.forecast.net[res] ?? 0) + n;
        if (net) result.forecast.net[res] = net;
        else delete result.forecast.net[res];
      }
    }
    for (const [res, n] of Object.entries(result.forecast.shortfall ?? {})) {
      if (n > 0) result.issues.push(issue('shortfall', `/forecast/${res}`, `${res}: ${n} missing at season end`, { params: { res, missing: n } }));
    }
    for (const r of result.forecast.upkeepRisks ?? []) result.issues.push(issue('upkeep_risk', '/forecast/upkeep', r.message, { params: r.params }));
    result.catalogue = catalogueFor(state, env, pid);
  }
  return result;
}

// A scratch transition for the preview on a copy of the state (or projection,
// which carries no rng); nothing of it is written back.
function dryRun(state, env, run) {
  const tc = createContext({ ...state, rng: state.rng ?? seedState(0) }, env);
  tc.step = 'preview';
  run(tc);
  return tc.state;
}

const changed = (a = {}, b = {}) => {
  const out = {};
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const n = (b[k] ?? 0) - (a[k] ?? 0);
    if (n) out[k] = n;
  }
  return out;
};

/**
 * What a change does to one people, { resources, meters, loyalty, population,
 * standing, tokens, statuses } with only the keys that change: numbers are
 * deltas, tokens the kinds and statuses the ids that are added.
 */
export function peopleDelta(before, after) {
  const loyalty = (p) => Object.fromEntries(p.council.map((m) => [m.id, m.loyalty]));
  const out = {
    resources: changed(before.resources, after.resources),
    meters: changed(before.meters, after.meters),
    loyalty: changed(loyalty(before), loyalty(after)),
    population: after.population.core - before.population.core,
    standing: after.standing - before.standing,
    tokens: after.tokens.filter((t) => !before.tokens.some((x) => x.id === t.id)).map((t) => t.kind),
    statuses: after.statuses.filter((s) => !before.statuses.some((x) => x.id === s.id && JSON.stringify(x) === JSON.stringify(s))).map((s) => s.id),
  };
  for (const [k, v] of Object.entries(out)) {
    if (v === 0 || (Array.isArray(v) ? v.length === 0 : typeof v === 'object' && Object.keys(v).length === 0)) delete out[k];
  }
  return out;
}

function previewChoices(state, env, pid, choices) {
  const out = [];
  for (const [id, option] of Object.entries(choices)) {
    const pc = (state.pendingChoices ?? []).find((c) => c.id === id && c.people === pid);
    const card = pc && pc.options.includes(option) ? env.ereignis(pc.event) : null;
    const opt = card?.options?.find((o) => o.id === option);
    if (!opt) continue;
    const after = dryRun(state, env, (tc) => applyOnceList(tc, pid, opt.effects, { reason: `${card.name}: ${opt.label}`, refs: [pc.event] }));
    out.push({ id, option, delta: peopleDelta(state.peoples[pid], after.peoples[pid]) });
  }
  return out;
}

// The adoption runs its own resolve on a scratch copy, so the preview shows
// exactly what the order does: the standing cost and the mourning of members.
function previewAdopt(state, env, pid, entry) {
  const def = env.bestimmung(entry.order.params.bestimmung);
  if (!def) return null;
  const after = dryRun(state, env, (tc) => entry.def.resolve(tc, orderContext(tc.s0, env, pid, { path: `/orders/${entry.index}` }), entry.order, entry.plan, null));
  return {
    ref: entry.order.params.bestimmung,
    name: def.name,
    milestones: def.milestones.map((m) => ({ id: m.id, text: m.text })),
    delta: peopleDelta(state.peoples[pid], after.peoples[pid]),
  };
}

// --- drafts of all peoples ----------------------------------------------------

/**
 * The drafts a season resolves with: the player's own draft (or an empty one)
 * and for each AI people its draft or, when missing or broken, the fallback
 * policy. Returns { used: { pid: { draft, chk } }, substitutions, issues }.
 */
function gatherDrafts(state, env, drafts) {
  const issues = [];
  const used = {};
  const substitutions = [];
  for (const pid of peopleIds(state)) {
    if (!isAlive(state, pid)) continue;
    const player = state.campaign.player === pid;
    // Every draft is checked on its people's projection, as the preview does:
    // a check against the full state would reject (and so reveal) what the
    // people cannot see. Hidden conflicts are decided when the order resolves.
    const view = projectFor(state, env, pid);
    let d = drafts[pid] ?? (player ? emptyDraft(state, pid) : null);
    let chk = d ? checkDraft(view, env, d, { as: pid, mode: 'apply' }) : null;
    if (!player && (!d || hasErrors(chk.issues))) {
      substitutions.push({ people: pid, reason: d ? 'draft had errors' : 'no draft' });
      d = fallbackDraft(state, env, pid);
      chk = checkDraft(view, env, d, { as: pid, mode: 'apply' });
      if (hasErrors(chk.issues)) {
        d = emptyDraft(state, pid);
        chk = checkDraft(view, env, d, { as: pid, mode: 'apply' });
      }
    }
    if (hasErrors(chk.issues)) issues.push(...chk.issues.map((i) => ({ ...i, path: `/drafts/${pid}${i.path}` })));
    used[pid] = { draft: { ...d, sealed: true }, chk };
  }
  return { used, substitutions, issues };
}

// --- seal ---------------------------------------------------------------------

/**
 * planning -> resolving. Locks the orders of the season: checks every draft,
 * replaces missing or broken AI drafts by the fallback policy, and records the
 * world-event draw of every people (the player's roll from his draft, an RNG
 * draw for every other people) in state.eventDraws. A player draft with error
 * issues (including roll_missing) leaves the state unchanged.
 */
export function seal(state, env, drafts = {}) {
  const issues = [];
  if (state.status === 'ended') issues.push(issue('finished', '', 'the campaign has ended'));
  if (state.phase !== 'planning') issues.push(issue('phase', '/phase', `seal needs planning, state is ${state.phase}`, { params: { reason: 'seal-needs-planning', phase: state.phase } }));
  if (state.rulesVersion !== RULES_VERSION) {
    issues.push(issue('phase', '/rulesVersion', `campaign rules ${state.rulesVersion}, kernel rules ${RULES_VERSION}`, { params: { reason: 'rules-version', campaign: state.rulesVersion, kernel: RULES_VERSION } }));
  }
  if (hasErrors(issues)) return { ok: false, issues, state, drafts };
  const g = gatherDrafts(state, env, drafts);
  if (hasErrors(g.issues)) return { ok: false, issues: g.issues, state, drafts };

  const tc = createContext(state, env);
  tc.step = 'seal';
  migrate(tc);
  const bands = tune(env, 'eventBands');
  const draws = {};
  for (const pid of Object.keys(g.used).sort()) {
    const { draft, chk } = g.used[pid];
    const ev = chk.eventProbe;
    const player = ev.roller === 'player';
    const roll = player ? draft.rolls[ev.id].value : tc.rng.d10();
    draws[pid] = { turn: state.turn, roll, band: eventBand(roll, bands), roller: player ? 'player' : 'kernel', card: null };
    record(tc, 'event.draw', { kind: 'people', id: pid }, { field: `eventDraws.${pid}`, before: null, after: draws[pid] },
      `world-event roll ${roll}, band ${draws[pid].band}`, { people: pid });
  }
  for (const s of g.substitutions) notice(tc, 'draft.fallback', { kind: 'people', id: s.people }, `fallback policy orders (${s.reason})`, { people: s.people });
  tc.state.eventDraws = draws;
  const sealed = Object.fromEntries(Object.entries(g.used).map(([pid, u]) => [pid, u.draft]));
  const lock = Object.fromEntries(Object.keys(sealed).sort().map((pid) => [pid, hashValue(sealed[pid])]));
  hideEntry(noteChange(tc, 'campaign.sealed', { kind: 'campaign', id: state.campaign.id }, 'sealed', state.sealed ?? null, lock, 'drafts of the season sealed'));
  tc.state.sealed = lock;
  noteChange(tc, 'campaign.phase', { kind: 'campaign', id: state.campaign.id }, 'phase', 'planning', 'resolving', 'orders sealed');
  tc.state.phase = 'resolving';
  tc.state.rev += 1;
  const next = finish(tc, LIMITS);
  next.derived = computeDerived(next, env);
  return { ok: true, issues: [], state: next, drafts: sealed, substitutions: g.substitutions, events: tc.log };
}

// --- apply --------------------------------------------------------------------

const SLOT_ORDER = { free: 0, main: 1, minor: 2 };

/**
 * Resolves one season. drafts: { peopleId: draft } as sealed. From planning,
 * apply seals first (the draws of that seal belong to the same transition).
 */
export function apply(state, env, drafts = {}) {
  let s0 = state;
  let sealEvents = [];
  if (state.phase === 'planning') {
    const sealed = seal(state, env, drafts);
    if (!sealed.ok) return { ok: false, issues: sealed.issues, state };
    s0 = sealed.state;
    drafts = sealed.drafts;
    sealEvents = sealed.events;
  }
  const issues = [];
  if (s0.status === 'ended') issues.push(issue('finished', '', 'the campaign has ended'));
  if (s0.phase !== 'resolving') issues.push(issue('phase', '/phase', `apply needs resolving, state is ${s0.phase}`, { params: { reason: 'apply-needs-resolving', phase: s0.phase } }));
  if (hasErrors(issues)) return { ok: false, issues, state };
  // The seal lock: apply resolves exactly the drafts whose hashes the seal
  // recorded. States sealed before the lock existed carry no hashes.
  if (s0.sealed) {
    for (const pid of Object.keys(s0.sealed).sort()) {
      if (!drafts[pid] || hashValue(drafts[pid]) !== s0.sealed[pid]) {
        issues.push(issue('tamper', `/drafts/${pid}`, `the draft of ${pid} differs from the one sealed for turn ${s0.turn}`, { params: { reason: 'sealed-draft', people: pid, turn: s0.turn } }));
      }
    }
    if (hasErrors(issues)) return { ok: false, issues, state };
    drafts = Object.fromEntries(Object.keys(s0.sealed).map((pid) => [pid, drafts[pid]]));
  }
  const g = gatherDrafts(s0, env, drafts);
  if (hasErrors(g.issues)) return { ok: false, issues: g.issues, state };
  const used = g.used;

  const tc = createContext(s0, env);
  tc.step = 'orders';
  migrate(tc);
  for (const s of g.substitutions) notice(tc, 'draft.fallback', { kind: 'people', id: s.people }, `fallback policy orders (${s.reason})`, { people: s.people });

  // Labour of the season becomes the people's standing assignment.
  tc.scratch.choices = {};
  for (const pid of Object.keys(used).sort()) {
    setPeople(tc, pid, 'population.assigned', used[pid].chk.assign, 'labour of the season', { kind: 'population.assign' });
    tc.scratch.choices[pid] = used[pid].draft.choices ?? {};
  }

  // Order probes: player rolls from the drafts, kernel rolls from sfc32 in
  // probe-id order. World-event rolls were drawn at seal (state.eventDraws).
  const all = [];
  for (const pid of Object.keys(used)) for (const p of used[pid].chk.probes) if (p.kind !== 'event') all.push({ pid, probe: p });
  const resolved = new Map();
  for (const { pid, probe } of all.filter((x) => x.probe.roller === 'player')) {
    resolved.set(probe.id, resolveProbe(probe, used[pid].draft.rolls[probe.id].value));
  }
  for (const { probe } of all.filter((x) => x.probe.roller === 'kernel').sort((a, b) => (a.probe.id < b.probe.id ? -1 : 1))) {
    resolved.set(probe.id, resolveProbe(probe, tc.rng.d10()));
  }
  for (const pid of Object.keys(used).sort()) {
    for (const w of used[pid].draft.withdrawn) {
      notice(tc, 'roll.withdrawn', { kind: 'people', id: pid }, `order with probe ${w.probe} withdrawn after a roll of ${w.value}`, { people: pid, refs: [w.probe] });
    }
  }

  const orderReport = [];
  tc.scratch.executed = {};
  tc.scratch.overrides = {};
  tc.scratch.setback = {};
  const outcomeOf = (e) => {
    if (!e.probe) return null;
    const p = resolved.get(e.probe.id);
    return { band: p.band, margin: p.margin, success: SUCCESS.has(p.band), natural: p.natural, probe: p };
  };
  const contexts = {};
  for (const pid of Object.keys(used).sort()) contexts[pid] = orderContext(s0, env, pid);
  const execute = (pid, e, out) => {
    const ox = { ...contexts[pid], path: `/orders/${e.index}` };
    if (out) {
      tc.probes.push(out.probe);
      record(tc, 'probe.resolved', { kind: 'people', id: pid }, null, calculation(out.probe), { people: pid, refs: [out.probe.id] });
      afterProbe(tc, pid, out.probe, e.venture);
    }
    // A failed venture brings no effect; its costs are spent all the same.
    if (e.venture && out && !out.success) {
      notice(tc, 'order.venture-failed', { kind: 'people', id: pid }, `venture ${e.order.id} (${e.order.type}) fails: ${out.band}`, { people: pid });
    } else {
      e.def.resolve(tc, ox, e.order, e.plan, out);
    }
    const lead = used[pid].draft.lead?.[e.order.id];
    const at = lead ? orderTile(s0, tc.world, pid, e.order) : null;
    if (at) setMember(tc, pid, lead, 'at', at, `leads order ${e.order.id} (${e.order.type}) at ${at}`, { kind: 'member.at' });
    (tc.scratch.executed[pid] ??= []).push({ order: e.order, slot: e.slot, tags: e.tags, band: out?.band ?? null });
    fireHook(tc, pid, `use:${e.order.type}`, e.tags);
    orderReport.push({ people: pid, id: e.order.id, type: e.order.type, status: 'executed', band: out?.band ?? null, venture: e.venture });
  };

  // 1. Machtproben first: an override decides whether a rejected order runs.
  for (const pid of Object.keys(used).sort()) {
    for (const e of used[pid].chk.entries) if (e.order.type === 'machtprobe' && !hasErrors(e.errors)) execute(pid, e, outcomeOf(e));
  }
  // 2. Council booking, then the costs of every people against the opening
  // stock, then all other orders. Paying all costs before any order runs keeps
  // a raid from taking stock another people has already committed to costs.
  const runs = {};
  for (const pid of Object.keys(used).sort()) {
    const entries = used[pid].chk.entries
      .filter((e) => e.order.type !== 'machtprobe' && !hasErrors(e.errors))
      .sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || a.index - b.index);
    const run = [];
    for (const e of entries) {
      if (e.vote && !e.vote.passed) {
        const overridden = tc.scratch.overrides[pid]?.includes(e.order.id);
        if (e.vote.decree && !overridden) council.bookDecree(tc, contexts[pid], e);
        else if (!overridden) {
          notice(tc, 'order.rejected', { kind: 'people', id: pid }, `council rejects ${e.order.type} ${e.order.id}; the Machtprobe failed`, { people: pid });
          orderReport.push({ people: pid, id: e.order.id, type: e.order.type, status: 'rejected', band: null, venture: e.venture });
          continue;
        }
      }
      run.push(e);
    }
    runs[pid] = run;
  }
  for (const pid of Object.keys(runs).sort()) {
    runs[pid] = runs[pid].filter((e) => {
      if (payCosts(tc, pid, e)) return true;
      orderReport.push({ people: pid, id: e.order.id, type: e.order.type, status: 'unpaid', band: null, venture: e.venture });
      return false;
    });
  }
  for (const pid of Object.keys(runs).sort()) {
    for (const e of runs[pid]) {
      execute(pid, e, outcomeOf(e));
      if (e.vote?.required) council.afterCouncilOrder(tc, contexts[pid], e);
    }
  }

  // 3. Modules in registry order, per people, then their global hooks.
  tc.step = 'modules';
  for (const pid of peopleIds(s0)) {
    if (!isAlive(s0, pid)) continue;
    for (const am of activeModules(s0, env, pid)) am.module.hooks?.resolve?.(tc, pid, { id: am.id, bind: am.bind });
  }
  for (const m of MODULES) m.hooks?.global?.(tc);
  // 4. Economy, then module upkeep.
  tc.step = 'economy';
  economy.resolveEconomy(tc);
  for (const pid of peopleIds(s0)) {
    if (!isAlive(s0, pid)) continue;
    for (const am of activeModules(s0, env, pid)) am.module.hooks?.upkeep?.(tc, pid, { id: am.id, bind: am.bind });
  }
  // 5. Research. 6. Military.
  tc.step = 'research';
  research.resolveResearch(tc);
  tc.step = 'military';
  military.resolveMilitary(tc);
  // 7. Sight and first contact, so the events step can fire the contact hook.
  tc.step = 'vision';
  updateVision(tc, env);
  // 8. Events (world events, life, meters, triggers). 9. Council season.
  tc.step = 'events';
  events.resolveEvents(tc);
  tc.step = 'council';
  council.resolveCouncilSeason(tc);
  // 10. Caps and decay.
  tc.step = 'cleanup';
  cleanup(tc);
  // 11. Bestimmung, victory and collapse.
  tc.step = 'bestimmung';
  bestimmung.resolveBestimmung(tc);
  // 12. Finalisation.
  tc.step = 'finalize';
  finalize(tc, env);

  const next = finish(tc, LIMITS);
  next.derived = computeDerived(next, env);
  const cal = calendarOf(env.regeln, s0.turn);
  const report = {
    format: 'realmcraft-report',
    version: 1,
    campaign: state.campaign.id,
    turn: s0.turn,
    revBefore: state.rev,
    revAfter: next.rev,
    hashBefore: stateHash(state),
    hashAfter: stateHash(next),
    sections: {
      calendar: { year: cal.year, season: cal.season, winter: cal.winter },
      orders: orderReport,
      probes: tc.probes.map((p) => ({ ...p, calculation: calculation(p) })),
      draws: s0.eventDraws ?? {},
      substitutions: g.substitutions,
      warnings: Object.values(used).flatMap((u) => u.chk.issues.filter((i) => i.severity === 'warning')),
      drafts: Object.fromEntries(Object.entries(used).map(([pid, u]) => [pid, u.draft])),
    },
    events: [...sealEvents, ...tc.log],
  };
  return { ok: true, issues: [], state: next, report, events: report.events };
}

/**
 * Pays all costs of one order or none. The draft check summed the costs
 * against the opening stock, so a gap here comes from an earlier step of the
 * season (a Machtprobe); the order then does not run, with a notice, instead
 * of a silently clamped payment.
 */
function payCosts(tc, pid, e) {
  const stock = tc.state.peoples[pid].resources;
  const costs = Object.entries(e.plan.costs ?? {}).filter(([, n]) => n > 0);
  const gap = costs.filter(([res, n]) => (Object.hasOwn(stock, res) ? stock[res] : 0) < n);
  if (gap.length) {
    notice(tc, 'order.unpaid', { kind: 'people', id: pid },
      `order ${e.order.id} (${e.order.type}) does not run: ${gap.map(([res, n]) => `${n} ${res} needed, ${Object.hasOwn(stock, res) ? stock[res] : 0} held`).join(', ')}`, { people: pid });
    return false;
  }
  for (const [res, n] of costs) {
    stock[res] -= n;
    record(tc, 'order.cost', { kind: 'people', id: pid }, { field: `resources.${res}`, delta: -n },
      `order ${e.order.id} (${e.order.type}) costs ${n} ${res}`, { people: pid });
  }
  return true;
}

/**
 * Natural rolls fire the crit hooks; on a venture a natural 10 opens a
 * breakthrough token (one per people and year) and a natural 1 a crisis
 * token. Any failing band ends statuses with endsOn setback.
 */
function afterProbe(tc, pid, probe, venture) {
  const tags = probe.tags.slice(0, 3);
  if (probe.natural === 10) {
    for (const t of probe.tags) fireHook(tc, pid, `crit_success:${t}`, probe.tags);
    const year = tc.cal.year;
    const people = tc.state.peoples[pid];
    const already = people.tokens.some((k) => k.kind === 'breakthrough' && calendarOf(tc.env.regeln, k.turn).year === year);
    if (venture && !already) applyOnce(tc, pid, { op: 'token.add', kind: 'breakthrough', tags }, { reason: `natural 10 on the venture ${probe.id}` });
  }
  if (probe.natural === 1) {
    for (const t of probe.tags) fireHook(tc, pid, `crit_fail:${t}`, probe.tags);
    if (venture) applyOnce(tc, pid, { op: 'token.add', kind: 'crisis', tags }, { reason: `natural 1 on the venture ${probe.id}` });
  }
  if (probe.band && !SUCCESS.has(probe.band)) tc.scratch.setback[pid] = true;
}

// Sight of settlements and units, then first contact between peoples.
function updateVision(tc, env) {
  const ids = peopleIds(tc.state);
  for (const pid of ids) {
    const sight = ofOp(standingOf(tc.s0, env, pid), 'sight.mod').reduce((n, s) => n + s.effect.amount, 0);
    const before = tc.state.map.known[pid] ?? {};
    const known = visionUpdate(tc.state, tc.world, pid, sight);
    const added = Object.keys(known).filter((k) => !Object.hasOwn(before, k)).length;
    tc.state.map.known[pid] = known;
    if (added) record(tc, 'map.vision', { kind: 'people', id: pid }, { field: `map.known.${pid}`, delta: added }, 'sight of settlements and units', { people: pid });
  }
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue;
      const rel = tc.state.relations[relKey(a, b)];
      if (!rel || rel.contact) continue;
      const sees = (x, y) => {
        const known = tc.state.map.known[x] ?? {};
        return settlementsOf(tc.state, y).some((s) => known[s.tile] === 'visible')
          || tc.state.peoples[y].units.some((u) => known[u.tile] === 'visible');
      };
      if (sees(a, b) || sees(b, a)) {
        setRelation(tc, a, b, { contact: true }, 'first contact', { kind: 'relation.contact' });
        fireHook(tc, a, 'contact', []);
        fireHook(tc, b, 'contact', []);
      }
    }
  }
}

// Stock caps, suspended developments, statuses, tokens, candidates.
function cleanup(tc) {
  economy.capStocks(tc);
  economy.loseSuspended(tc);
  for (const pid of peopleIds(tc.state)) {
    const people = tc.state.peoples[pid];
    const keep = people.statuses.filter((s) => {
      if (s.until != null && s.until <= tc.turn) return false;
      if (s.endsOn === 'setback' && tc.scratch.setback[pid]) return false;
      return true;
    });
    if (keep.length !== people.statuses.length) setPeople(tc, pid, 'statuses', keep, 'statuses expire or end on a setback', { kind: 'status.end' });
  }
  research.expire(tc);
}

// Practice ledger, module slices of newly active modules, counters.
function finalize(tc, env) {
  for (const pid of peopleIds(tc.state)) research.recordPractice(tc, pid, tc.scratch.executed?.[pid] ?? []);
  const nextTurn = tc.turn + 1;
  const after = { ...tc.state, turn: nextTurn };
  for (const pid of peopleIds(tc.state)) {
    const people = tc.state.peoples[pid];
    for (const am of activeModules(after, env, pid)) {
      if (people.modules[am.id] || !am.module.initPeople) continue;
      const slice = am.module.initPeople(after, env, pid, am.bind);
      setPeople(tc, pid, `modules.${am.id}`, slice, `module ${am.id} becomes active`, { kind: 'module.activate' });
    }
  }
  noteChange(tc, 'campaign.turn', { kind: 'campaign', id: tc.state.campaign.id }, 'turn', tc.turn, nextTurn, 'season ends');
  tc.state.eventDraws = {};
  if (tc.state.sealed) {
    hideEntry(noteChange(tc, 'campaign.sealed', { kind: 'campaign', id: tc.state.campaign.id }, 'sealed', tc.state.sealed, null, 'season resolved, the seal is lifted'));
    delete tc.state.sealed;
  }
  tc.state.turn = nextTurn;
  tc.state.rev += 1;
  tc.state.phase = 'agents';
}

// --- repin --------------------------------------------------------------------

/**
 * Pins the campaign to the world package `env` carries, after the package
 * changed under a running campaign (an operator decision, logged with source
 * player). Refused while a season resolves, because the sealed drafts were
 * checked against the old package.
 */
export function repin(state, env) {
  const before = state.campaign.world;
  const after = { id: env.welt.id, version: env.welt.version, hash: env.hash };
  const issues = [];
  if (state.phase === 'resolving') issues.push(issue('phase', '/phase', 'repin is refused while a season resolves', { params: { reason: 'repin-resolving', phase: state.phase } }));
  if (before.id !== after.id) issues.push(issue('target', '/world', `the campaign plays world ${before.id}, not ${after.id}`, { params: { reason: 'other-world', campaign: before.id, world: after.id } }));
  if (hasErrors(issues)) return { ok: false, issues, state };
  const tc = createContext(state, env, { source: 'player' });
  tc.step = 'repin';
  migrate(tc);
  noteChange(tc, 'campaign.repin', { kind: 'campaign', id: state.campaign.id }, 'campaign.world', before, after,
    `world package re-pinned from ${before.hash} to ${after.hash}`, { people: state.campaign.player });
  tc.state.campaign.world = after;
  tc.state.rev += 1;
  const next = finish(tc, LIMITS);
  next.derived = computeDerived(next, env);
  return { ok: true, issues: [], state: next, events: tc.log };
}

// --- open ---------------------------------------------------------------------

/** agents -> planning: deterministic pool candidates for every people. */
export function open(state, env) {
  if (state.status === 'ended') return { ok: false, issues: [issue('finished', '', 'the campaign has ended')], state };
  if (state.phase !== 'agents') return { ok: false, issues: [issue('phase', '/phase', `open needs agents, state is ${state.phase}`, { params: { reason: 'open-needs-agents', phase: state.phase } })], state };
  const tc = createContext(state, env);
  tc.step = 'open';
  migrate(tc);
  for (const pid of peopleIds(state)) {
    // Members led orders in the season just resolved; planning finds them at home.
    for (const m of tc.state.peoples[pid].council) {
      if (m.at != null) setMember(tc, pid, m.id, 'at', null, `${m.name} returns home as planning opens`, { kind: 'member.at' });
    }
    if (!isAlive(state, pid)) continue;
    research.offerPool(tc, pid);
    bestimmung.offerDestinyPool(tc, pid);
  }
  noteChange(tc, 'campaign.phase', { kind: 'campaign', id: state.campaign.id }, 'phase', 'agents', 'planning', 'planning opens');
  tc.state.phase = 'planning';
  tc.state.rev += 1;
  const next = finish(tc, LIMITS);
  next.derived = computeDerived(next, env);
  return { ok: true, issues: [], state: next, events: tc.log };
}

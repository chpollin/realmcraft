// Headless balance simulation: whole campaigns through the rules kernel in
// memory, every people driven by the fallback policy (engine/ai/fallback.js),
// many seeds and seasons, aggregated into one JSON report.
//
// Nothing is written to campaigns/: the kernel functions run on in-memory
// states, so the simulation never touches a live campaign. The player people
// gets the fallback draft of its own template profile and its probe rolls
// from a seeded die; AI peoples get their drafts from the kernel itself
// (gatherDrafts substitutes the fallback policy for a missing draft).
//
// Determinism: the same world package and options give the same report, byte
// for byte. The report carries no timestamps and no wall-clock figures.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEnv } from '../../engine/core/env.js';
import { RULES_VERSION } from '../../engine/core/rules.js';
import { apply, createCampaign, open, preview } from '../../engine/core/turn.js';
import { fallbackDraft } from '../../engine/ai/fallback.js';
import { validateCampaign } from '../../engine/content/validate.js';
import { scoreEntwicklung } from '../../engine/content/budget.js';
import { controlledRegions, homeSettlement, peopleIds, regionTerrain, settlementsOf } from '../../engine/core/state.js';
import { makeRng, hashSeed } from '../../engine/world/index.js';

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sumOf = (xs) => xs.reduce((a, b) => a + b, 0);

export function loadWorld(dir) {
  const j = (p) => JSON.parse(readFileSync(join(dir, p), 'utf8'));
  return makeEnv({
    welt: j('welt.json'),
    regeln: j('regeln.json'),
    content: { entwicklungen: j('content/entwicklungen.json'), ereignisse: j('content/ereignisse.json'), bestimmungen: j('content/bestimmungen.json') },
  });
}

// The player people has no agentProfile in the state (createCampaign keeps
// it null), so its fallback draft is computed on a copy that carries the
// profile of its template. The real state stays untouched.
function draftWithProfile(state, env, pid, profile) {
  if (!profile) return fallbackDraft(state, env, pid);
  const shadow = { ...state, peoples: { ...state.peoples, [pid]: { ...state.peoples[pid], agentProfile: profile } } };
  return fallbackDraft(shadow, env, pid);
}

function withRolls(state, env, draft, die) {
  const probes = preview(state, env, draft, { as: draft.people }).probes.filter((p) => p.roller === 'player');
  return { ...draft, sealed: false, rolls: Object.fromEntries(probes.map((p) => [p.id, { value: die(), fingerprint: p.fingerprint }])) };
}

const alive = (state, pid) => state.peoples[pid].population.core > 0 && settlementsOf(state, pid).length > 0;
const collapsed = (state, pid) => state.peoples[pid].modules?.kern?.flags?.['kern~collapsed'] === true || !alive(state, pid);

/** One season's measurements of one people. */
function sample(state, env, pid) {
  const p = state.peoples[pid];
  const d = state.derived?.[pid] ?? {};
  const known = p.developments.known.filter((k) => k.state === 'active');
  const tiers = known.map((k) => env.entwicklung(k.ref)?.tier ?? 0);
  const b = p.bestimmung;
  return {
    alive: !collapsed(state, pid),
    resources: { ...p.resources },
    caps: { ...(d.caps ?? {}) },
    population: p.population.core,
    standing: p.standing,
    settlements: settlementsOf(state, pid).length,
    regions: controlledRegions(state, pid).length,
    units: p.units.length,
    strength: sumOf(p.units.map((u) => u.strength)),
    known: known.length,
    maxTier: tiers.length ? Math.max(...tiers) : 0,
    research: p.developments.research.length,
    loyalty: p.council.length ? sumOf(p.council.map((m) => m.loyalty)) : 0,
    shortfall: sumOf(Object.values(p.shortfall ?? {})),
    milestones: b ? b.milestones.filter((m) => m.reached).length : 0,
    reached: b ? b.milestones.filter((m) => m.reached).map((m) => m.id) : [],
    milestonesTotal: b ? b.milestones.length : 0,
    destiny: b?.ref ?? null,
  };
}

/**
 * Plays one campaign: createCampaign, open, then seasons of apply and open
 * until `seasons` are played or the campaign ends. Returns the per-season
 * samples of every people and the events of interest.
 */
export function simulateCampaign(env, { seed, seasons, as = null, playerProfile = undefined }) {
  const templates = env.regeln.peopleTemplates;
  const tpl = as ? templates.find((t) => t.id === as) : templates[0];
  if (!tpl) throw new Error(`simulate: no people template ${as}`);
  const profile = playerProfile === undefined ? tpl.agentProfile ?? null : playerProfile;
  const rng = makeRng(hashSeed('sim-dice', String(seed)));
  const die = () => rng.int(1, 10);

  let state = createCampaign(env, { id: 'sim', seed, player: tpl.id }).state;
  state = must(open(state, env), 'open');
  const player = state.campaign.player;
  const ids = peopleIds(state).sort(byString);
  const series = Object.fromEntries(ids.map((pid) => [pid, [sample(state, env, pid)]]));
  const acquired = Object.fromEntries(ids.map((pid) => [pid, []]));
  const orders = Object.fromEntries(ids.map((pid) => [pid, {}]));
  const startKnown = Object.fromEntries(ids.map((pid) => [pid, new Set(state.peoples[pid].developments.known.map((k) => k.ref))]));
  const collapseAt = {};
  const failures = [];
  // State invariants the kernel itself should keep (validateCampaign): turns per issue.
  const invalid = {};
  // Dominant terrain of the home region at the start; herd growth depends on pasture.
  const world = env.world(state.map.seed);
  const startTerrain = Object.fromEntries(ids.map((pid) => [pid, regionTerrain(world, homeSettlement(state, pid).regionId)]));
  let played = 0;

  for (let i = 0; i < seasons && state.status !== 'ended'; i++) {
    const draft = withRolls(state, env, draftWithProfile(state, env, player, profile), die);
    const res = apply(state, env, { [player]: draft });
    if (!res.ok) {
      failures.push({ turn: state.turn, step: 'apply', issues: res.issues.slice(0, 5).map((x) => `${x.code} ${x.path}`) });
      break;
    }
    for (const o of res.report.sections.orders) {
      if (o.status !== 'executed') continue;
      orders[o.people][o.type] = (orders[o.people][o.type] ?? 0) + 1;
    }
    state = res.state;
    played++;
    for (const x of validateCampaign(state).issues) {
      if (x.severity !== 'error') continue;
      const k = `${x.code} ${x.path.replace(/^\/peoples\/[^/]+/, '/peoples/*')}`;
      (invalid[k] ??= []).push(state.turn);
    }
    if (state.status !== 'ended') state = must(open(state, env), 'open');
    for (const pid of ids) {
      series[pid].push(sample(state, env, pid));
      for (const k of state.peoples[pid].developments.known) {
        if (!startKnown[pid].has(k.ref) && !acquired[pid].some((a) => a.ref === k.ref)) acquired[pid].push({ ref: k.ref, turn: k.since });
      }
      if (collapseAt[pid] === undefined && collapsed(state, pid)) collapseAt[pid] = state.turn;
    }
  }
  return {
    seed, as: tpl.id, profile, played, status: state.status,
    result: state.result ? { kind: state.result.kind, winner: state.result.winner, turn: state.result.turn } : null,
    series, acquired, orders, collapseAt, failures, startTerrain, invalid,
  };
}

function must(res, step) {
  if (!res.ok) throw new Error(`simulate: ${step} failed: ${JSON.stringify(res.issues.slice(0, 3))}`);
  return res.state;
}

// --- aggregation ---------------------------------------------------------------

const round2 = (x) => Math.round(x * 100) / 100;

function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

function summary(values) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  return { n: s.length, mean: round2(sumOf(s) / s.length), min: s[0], p50: quantile(s, 0.5), max: s[s.length - 1] };
}

const SCALARS = ['population', 'standing', 'settlements', 'regions', 'units', 'strength', 'known', 'maxTier', 'research', 'loyalty', 'shortfall', 'milestones'];

/** Aggregates simulated runs into the report body. */
export function aggregate(env, runs, { checkpoints } = {}) {
  const resourceIds = env.resourceIds;
  const peoples = [...new Set(runs.flatMap((r) => Object.keys(r.series)))].sort(byString);
  const maxLen = Math.max(...runs.map((r) => Math.max(...Object.values(r.series).map((s) => s.length))));
  const marks = (checkpoints ?? defaultCheckpoints(maxLen - 1)).filter((t) => t < maxLen);
  const out = {};
  // Extreme values: per people and key the highest and lowest value seen and where.
  const extremes = {};
  const noteExtreme = (people, k, value, seed, turn) => {
    const slot = ((extremes[people] ??= {})[k] ??= { max: null, min: null });
    if (!slot.max || value > slot.max.value) slot.max = { value, seed, turn };
    if (!slot.min || value < slot.min.value) slot.min = { value, seed, turn };
  };

  for (const pid of peoples) {
    const inRuns = runs.filter((r) => r.series[pid]);
    const curves = {};
    for (const t of marks) {
      const at = inRuns.map((r) => r.series[pid][t]).filter(Boolean);
      const living = at.filter((s) => s.alive);
      const point = { turn: t, runs: at.length, alive: living.length, resources: {}, atCap: {}, atZero: {} };
      for (const res of resourceIds) {
        const vals = living.map((s) => s.resources[res] ?? 0);
        point.resources[res] = summary(vals);
        point.atCap[res] = living.filter((s) => typeof s.caps[res] === 'number' && (s.resources[res] ?? 0) >= s.caps[res]).length;
        point.atZero[res] = vals.filter((v) => v === 0).length;
      }
      for (const k of SCALARS) point[k] = summary(living.map((s) => s[k]));
      curves[t] = point;
    }

    const collapses = inRuns.filter((r) => r.collapseAt[pid] !== undefined);
    const lastOf = (r) => r.series[pid][r.series[pid].length - 1];
    const total = inRuns.map((r) => lastOf(r).milestonesTotal);
    const devCount = {};
    const devTurn = {};
    for (const r of inRuns) {
      for (const a of r.acquired[pid]) {
        devCount[a.ref] = (devCount[a.ref] ?? 0) + 1;
        (devTurn[a.ref] ??= []).push(a.turn);
      }
    }
    const developments = Object.keys(devCount).sort((a, b) => devCount[b] - devCount[a] || byString(a, b))
      .map((ref) => ({ ref, runs: devCount[ref], share: round2(devCount[ref] / inRuns.length), firstTurn: summary(devTurn[ref]) }));
    const orderTotals = {};
    for (const r of inRuns) for (const [type, n] of Object.entries(r.orders[pid])) orderTotals[type] = (orderTotals[type] ?? 0) + n;
    const seasonsPlayed = sumOf(inRuns.map((r) => r.played));
    const orders = Object.keys(orderTotals).sort((a, b) => orderTotals[b] - orderTotals[a] || byString(a, b))
      .map((type) => ({ type, total: orderTotals[type], perSeason: round2(orderTotals[type] / Math.max(1, seasonsPlayed)) }));
    const destinies = {};
    const reached = {};
    for (const r of inRuns) {
      const last = lastOf(r);
      const d = last.destiny ?? 'none';
      destinies[d] = (destinies[d] ?? 0) + 1;
      for (const id of last.reached) reached[id] = (reached[id] ?? 0) + 1;
    }
    // End state by the terrain of the start region: yields and herd growth
    // depend on it, so a mean over all starts hides a bad start terrain.
    const byTerrain = {};
    for (const r of inRuns) (byTerrain[r.startTerrain[pid]] ??= []).push(lastOf(r));
    const startTerrain = Object.fromEntries(Object.keys(byTerrain).sort(byString).map((t) => [t, {
      runs: byTerrain[t].length,
      population: summary(byTerrain[t].map((s) => s.population)),
      resources: Object.fromEntries(resourceIds.map((res) => [res, summary(byTerrain[t].map((s) => s.resources[res] ?? 0))?.mean ?? null])),
    }]));

    out[pid] = {
      runs: inRuns.length,
      asPlayer: inRuns.filter((r) => r.as === pid).length,
      collapse: {
        runs: collapses.length,
        rate: round2(collapses.length / Math.max(1, inRuns.length)),
        turn: summary(collapses.map((r) => r.collapseAt[pid])),
      },
      destiny: {
        held: destinies,
        milestonesReached: summary(inRuns.map((r) => lastOf(r).milestones)),
        milestonesTotal: summary(total),
        victories: runs.filter((r) => r.result?.kind === 'victory' && r.result.winner === pid).length,
        reachedShare: Object.fromEntries(Object.keys(reached).sort(byString).map((id) => [id, round2(reached[id] / inRuns.length)])),
      },
      startTerrain,
      curves,
      developments,
      orders,
    };

    for (const r of inRuns) {
      r.series[pid].forEach((smp, t) => {
        if (!smp.alive) return;
        for (const res of resourceIds) noteExtreme(pid, `resources.${res}`, smp.resources[res] ?? 0, r.seed, t);
        noteExtreme(pid, 'population', smp.population, r.seed, t);
        noteExtreme(pid, 'strength', smp.strength, r.seed, t);
      });
    }
  }

  const outcomes = {};
  for (const r of runs) {
    const k = r.result ? `${r.result.kind}${r.result.winner ? `:${r.result.winner}` : `:${r.as}`}` : 'playing';
    outcomes[k] = (outcomes[k] ?? 0) + 1;
  }
  return {
    outcomes,
    endTurn: summary(runs.map((r) => r.played)),
    failures: runs.filter((r) => r.failures.length).map((r) => ({ seed: r.seed, as: r.as, failures: r.failures })),
    peoples: out,
    extremes,
    findings: findings(env, out, runs),
  };
}

function defaultCheckpoints(last) {
  const marks = new Set([0, last]);
  for (let t = 4; t < last; t += 4) marks.add(t);
  return [...marks].sort((a, b) => a - b);
}

// TUNING: thresholds of the automatic findings. They mark what a human should
// look at, not a verdict; the evidence stays in the report.
const FIND = { collapseRate: 0.25, capShare: 0.5, zeroShare: 0.5, convergentShare: 0.8, orderShare: 0.5, loyaltyDrop: 4 };

/** Plain-language flags over the aggregate, each with its evidence. */
function findings(env, peoples, runs) {
  const out = [];
  const ids = Object.keys(peoples);
  for (const [pid, p] of Object.entries(peoples)) {
    const turns = Object.keys(p.curves).map(Number).sort((a, b) => a - b);
    const first = p.curves[turns[0]];
    const last = p.curves[turns[turns.length - 1]];
    if (p.collapse.rate >= FIND.collapseRate) {
      out.push({ people: pid, kind: 'collapse', evidence: { rate: p.collapse.rate, runs: p.collapse.runs, of: p.runs, turn: p.collapse.turn } });
    }
    if (!last || last.alive === 0 || turns.length < 2) continue;
    const at = { turn: last.turn, alive: last.alive };
    for (const res of env.resourceIds) {
      const a = first.resources[res];
      const b = last.resources[res];
      if (!a || !b) continue;
      if (b.max === 0 && a.max === 0) out.push({ people: pid, kind: 'stock_unused', resource: res, evidence: { ...at, start: a, end: b } });
      else if (last.atCap[res] / last.alive >= FIND.capShare) out.push({ people: pid, kind: 'stock_at_cap', resource: res, evidence: { ...at, atCap: last.atCap[res], end: b } });
      else if (last.atZero[res] / last.alive >= FIND.zeroShare && a.mean > 0) out.push({ people: pid, kind: 'stock_drained', resource: res, evidence: { ...at, atZero: last.atZero[res], start: a, end: b } });
      else if (b.max < a.min) out.push({ people: pid, kind: 'stock_declines', resource: res, evidence: { ...at, start: a, end: b } });
    }
    const grows = (k) => last[k] && first[k] && last[k].max > first[k].min;
    if (!grows('known')) out.push({ people: pid, kind: 'no_development', evidence: { start: first.known, end: last.known } });
    if (!grows('population')) out.push({ people: pid, kind: 'population_never_grows', evidence: { start: first.population, end: last.population } });
    if (!grows('regions')) out.push({ people: pid, kind: 'no_expansion', evidence: { regions: last.regions, settlements: last.settlements } });
    if (last.loyalty && first.loyalty && first.loyalty.mean - last.loyalty.mean >= FIND.loyaltyDrop) {
      out.push({ people: pid, kind: 'loyalty_decline', evidence: { start: first.loyalty, end: last.loyalty } });
    }
    if (p.destiny.victories === 0) out.push({ people: pid, kind: 'destiny_unfulfilled', evidence: { milestonesReached: p.destiny.milestonesReached, of: p.destiny.milestonesTotal, reachedShare: p.destiny.reachedShare } });
    const total = sumOf(p.orders.map((o) => o.total));
    for (const o of p.orders) if (total > 0 && o.total / total >= FIND.orderShare) out.push({ people: pid, kind: 'order_dominates', order: o.type, evidence: { share: round2(o.total / total), perSeason: o.perSeason } });
  }
  // A development every people acquires in nearly every run: the peoples do
  // not develop individually.
  const shares = {};
  for (const pid of ids) for (const d of peoples[pid].developments) (shares[d.ref] ??= {})[pid] = d.share;
  for (const ref of Object.keys(shares).sort(byString)) {
    if (ids.length > 1 && ids.every((pid) => (shares[ref][pid] ?? 0) >= FIND.convergentShare)) {
      out.push({ people: null, kind: 'convergent_development', ref, evidence: { share: shares[ref] } });
    }
  }
  if (runs.every((r) => !r.result)) out.push({ people: null, kind: 'campaign_never_ends', evidence: { runs: runs.length, seasons: summary(runs.map((r) => r.played)) } });
  const invalid = {};
  for (const r of runs) for (const [k, turns] of Object.entries(r.invalid)) (invalid[k] ??= []).push({ seed: r.seed, turns: turns.length, first: turns[0] });
  for (const k of Object.keys(invalid).sort(byString)) out.push({ people: null, kind: 'state_invalid', issue: k, evidence: { runs: invalid[k].length, first: invalid[k][0] } });
  const failed = runs.filter((r) => r.failures.length).length;
  if (failed) out.push({ people: null, kind: 'apply_failed', evidence: { runs: failed } });
  return out;
}

/** Runs the whole simulation and returns the report document. */
export function runSimulation(env, { seeds, seasons, rotate = true, as = null, playerProfile = undefined, checkpoints = null }) {
  const templates = env.regeln.peopleTemplates.map((t) => t.id);
  const runs = seeds.map((seed, i) => simulateCampaign(env, {
    seed, seasons, as: as ?? (rotate ? templates[i % templates.length] : templates[0]), playerProfile,
  }));
  const body = aggregate(env, runs, { checkpoints });
  const content = auditContent(env);
  for (const c of content.filter((x) => x.priceOnlyOnUse)) {
    const acquired = Object.fromEntries(Object.entries(body.peoples).map(([pid, p]) => [pid, p.developments.find((d) => d.ref === c.ref)?.share ?? 0]));
    body.findings.push({ people: null, kind: 'price_only_on_use', ref: c.ref, evidence: { tier: c.tier, net: c.net, research: c.research, acquired } });
  }
  return {
    format: 'realmcraft-balance-report',
    version: 1,
    world: { id: env.welt.id, version: env.welt.version, hash: env.hash },
    rulesVersion: RULES_VERSION,
    config: { seeds, seasons, rotate: as ? false : rotate, as, playerProfile: playerProfile ?? 'template' },
    runs: runs.map((r) => ({ seed: r.seed, as: r.as, profile: r.profile, played: r.played, status: r.status, result: r.result, collapseAt: r.collapseAt })),
    ...body,
    content,
  };
}

// A standing price is paid only on use when every primitive in it waits for
// the people to use something, a meter that rises on use: or a trigger on
// use:. Such a development costs nothing to hold while its applications stay
// unused. One-off burdens of onAcquire are left out.
const useBound = (p) => (p.op === 'meter' && p.rise.on.startsWith('use:')) || (p.op === 'trigger' && p.on.startsWith('use:'));

/** Budget of every world Entwicklung and whether only a use pays its standing price. */
export function auditContent(env) {
  const ctx = { regeln: env.regeln, resolve: (ref) => env.entwicklung(ref) };
  return env.content.entwicklungen.map((ent) => {
    const b = scoreEntwicklung(ent, ctx);
    return {
      ref: `${ent.id}@${ent.rev}`, kind: ent.kind, tier: ent.tier, tags: ent.tags,
      effect: b.effect, price: b.price, net: b.net, research: ent.cost.research,
      priceOnlyOnUse: ent.price.length > 0 && ent.price.every(useBound),
    };
  });
}

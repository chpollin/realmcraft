// Economy of a season: harvest with labour, consumption, upkeep, famine,
// growth, stock caps and the loss of long-suspended developments.
//
//   planEconomy(state, env, pid, now)   pure dry run: an ordered list of ops plus the totals
//   forecast(state, env, pid, opts)     the plan as a preview (works on a projection)
//   resolveEconomy(tc)                  plans every people against the opening state and applies the ops with logging
//   capStocks(tc), loseSuspended(tc)    cleanup step
//
// forecast and resolveEconomy share planEconomy, so a preview and the real
// season can only differ by what happens between them (orders, penalties).
// Structure and standing effects come from the state handed to the plan (S0 in
// a turn); the working stock, clans and labour come from `now`, because the
// orders of the season have already spent and moved things in tc.state.
//
// Pay rules: consumption, the lebensweise's own flows, status and building
// flows and dependencies are paid as far as possible and the rest is
// shortfall. Developments, buildings and units are paid whole or not at all,
// and their consequence (suspension, strength loss) is the penalty, so they
// leave no shortfall.

import { RULES, tune } from './rules.js';
import { calendarOf } from './calendar.js';
import { applyOnceList, changeUnitStrength, ofOp, standingOf } from './effects.js';
import { addPeople, addResource, changeLoyalty, fireHook, noteChange, setPeople } from './log.js';
import { clamp, controlledRegions, peopleIds, regionTerrain, settlementsOf } from './state.js';
import { unitStats } from './military.js';
import { bagParam } from './issues.js';
import { regionAt } from './map.js';
import { key as tileKey, neighbors, parseKey, regionOf, spiral, tileAt } from '../world/index.js';

const MAX_STOCK = 999;

const sumInto = (map, res, n) => { map[res] = (map[res] ?? 0) + n; };
const nonZero = (map) => Object.fromEntries(Object.entries(map).filter(([, n]) => n !== 0));

function worldResource(env, key) {
  if (env.resourceIds.includes(key)) return key;
  const alias = Object.hasOwn(RULES.yieldAlias, key) ? RULES.yieldAlias[key] : null;
  return alias && env.resourceIds.includes(alias) ? alias : null;
}

const leb = (state, env, pid) => env.entwicklung(state.peoples[pid].lebensweise);

/** Stock cap per resource: regeln cap plus stock.cap effects, never below 0. */
export function stockCaps(state, env, pid, standing = standingOf(state, env, pid)) {
  const mods = ofOp(standing, 'stock.cap').map((s) => s.effect);
  const out = {};
  for (const r of env.regeln.resources) {
    const bonus = mods.reduce((n, m) => (m.res === r.id ? n + m.amount : n), 0);
    out[r.id] = clamp(r.cap + bonus, 0, 9999);
  }
  return out;
}

/** Clan capacity: settlements by way of life plus population.cap, at least 1. */
export function popCap(state, env, pid, standing = standingOf(state, env, pid)) {
  const type = leb(state, env, pid)?.spec?.settlement ?? 'camp';
  const per = RULES.popCapPerSettlement[type] ?? RULES.popCapPerSettlement.camp;
  const bonus = ofOp(standing, 'population.cap').reduce((n, s) => n + s.effect.amount, 0);
  return Math.max(1, settlementsOf(state, pid).length * per + bonus);
}

/**
 * What each controlled region yields per working clan this season:
 * [{ region, terrain, terrains, yields: { res: n } }] in region id order. A
 * region's land is its dominant terrain plus, where the people has a
 * settlement in it, the terrains of the settlement tile and its neighbours in
 * that region: a settlement works the fields around it, which the dominant
 * terrain of a large region often misses (a village in a mountain region).
 * Per resource the best of these terrains counts: base yield (welt.json keys
 * folded onto world resources) times the world's yieldFactor plus yield.mod,
 * never below 0. Tiles come from tileAt, a pure function of seed and pack, so
 * the result does not depend on which chunks were generated before.
 */
export function regionPotential(state, env, pid, standing, season) {
  const world = env.world(state.map.seed);
  const mods = ofOp(standing, 'yield.mod').map((s) => s.effect);
  const near = {};
  for (const st of settlementsOf(state, pid)) {
    const c = parseKey(st.tile);
    for (const h of [c, ...neighbors(c.q, c.r)]) {
      if (regionOf(world, h.q, h.r) !== st.regionId) continue;
      (near[st.regionId] ??= new Set()).add(tileAt(world, h.q, h.r).terrain);
    }
  }
  const yieldOf = (terrain, res) => {
    let base = 0;
    for (const [k, v] of Object.entries(env.terrain(terrain)?.yields ?? {})) if (worldResource(env, k) === res) base += v;
    let y = Math.floor(base * tune(env, 'yieldFactor', terrain, season, res));
    for (const m of mods) {
      if (m.terrain === terrain && worldResource(env, m.res) === res && (!m.when || m.when.includes(season))) y += m.amount;
    }
    return Math.max(0, y);
  };
  return controlledRegions(state, pid).map((region) => {
    const terrain = regionTerrain(world, region);
    const terrains = [...new Set([terrain, ...(near[region] ?? [])].filter(Boolean))].sort();
    const yields = {};
    for (const res of env.resourceIds) yields[res] = terrains.reduce((best, t) => Math.max(best, yieldOf(t, res)), 0);
    return { region, terrain, terrains, yields };
  });
}

/**
 * Greedy placement of the labour groups: resources in world order, each group
 * into the free slot of the region with the highest yield (ties by region id).
 * A group that finds no region yielding its resource stays idle and takes no slot.
 */
function placeLabour(env, potential, assign, core) {
  const free = Object.fromEntries(potential.map((p) => [p.region, RULES.slotsPerRegion]));
  const placed = [];
  const idle = {};
  // A clan that left during the season's orders no longer works.
  let left = core;
  for (const res of env.resourceIds) {
    let n = Math.min(assign[res] ?? 0, left);
    left -= n;
    while (n > 0) {
      let best = null;
      for (const p of potential) if (free[p.region] > 0 && p.yields[res] > 0 && (!best || p.yields[res] > best.yields[res])) best = p;
      if (!best) {
        sumInto(idle, res, n);
        break;
      }
      free[best.region]--;
      placed.push({ res, region: best.region, terrain: best.terrain, amount: best.yields[res] });
      n--;
    }
  }
  return { placed, idle };
}

function flowAmount(effect, season, cx) {
  if (effect.when && !effect.when.includes(season)) return 0;
  const sc = effect.scale;
  if (!sc) return effect.amount;
  let count;
  if (sc.per === 'population') count = cx.core;
  else if (sc.per === 'regions') count = cx.regions;
  else if (sc.per === 'settlements') count = cx.settlements;
  else count = sc.tag ? cx.units.filter((u) => cx.env.entwicklung(u.type)?.spec?.tags?.includes(sc.tag)).length : cx.units.length;
  return effect.amount * Math.floor(count / sc.step);
}

const dueOf = (effects, season, cx) => {
  const need = {};
  for (const e of effects) {
    if (e.op !== 'resource.flow') continue;
    const n = flowAmount(e, season, cx);
    if (n < 0) sumInto(need, e.res, -n);
  }
  return need;
};

const bagText = (bag) => Object.entries(bag).map(([res, n]) => `${n} ${res}`).join(', ');

/** Gains of the season in log order: harvest, deposits, features, knowledge, positive flows. */
function gainsOf(state, env, pid, standing, season, now, cx) {
  const world = env.world(state.map.seed);
  const potential = regionPotential(state, env, pid, standing, season);
  const { placed, idle } = placeLabour(env, potential, now.assign, now.core);
  const gains = [];
  const harvest = [];

  const byRegion = new Map();
  for (const p of placed) {
    const k = `${p.res}|${p.region}`;
    const e = byRegion.get(k) ?? { res: p.res, region: p.region, terrain: p.terrain, groups: 0, amount: 0 };
    e.groups++;
    e.amount += p.amount;
    byRegion.set(k, e);
  }
  for (const e of byRegion.values()) {
    harvest.push({ kind: 'harvest', ...e });
    gains.push({ res: e.res, n: e.amount, kind: 'harvest', reason: `${e.groups} clan(s) harvest ${e.res} in ${e.region} (${e.terrain})`, refs: [e.region] });
  }
  for (const [res, groups] of Object.entries(idle)) harvest.push({ kind: 'idle', res, groups });

  const worked = new Set(placed.map((p) => p.region));
  const deposits = {};
  const seen = new Set();
  for (const s of settlementsOf(state, pid)) {
    for (const h of spiral(parseKey(s.tile), RULES.depositRadius)) {
      const k = tileKey(h.q, h.r);
      if (seen.has(k)) continue;
      seen.add(k);
      const tile = tileAt(world, h.q, h.r);
      if (!worked.has(tile.regionId)) continue;
      for (const d of tile.resources ?? []) {
        const y = tune(env, 'featureYield', d.key);
        if (y && env.resource(y.res)) sumInto(deposits, y.res, y.amount);
      }
    }
  }
  const features = {};
  for (const k of Object.keys(state.map.features).sort()) {
    const region = regionAt(world, k);
    if (state.map.control[region] !== pid || !worked.has(region)) continue;
    for (const d of state.map.features[k].resources ?? []) {
      const y = tune(env, 'featureYield', d.key);
      if (y && env.resource(y.res)) sumInto(features, y.res, y.amount);
    }
  }
  for (const [kind, map, text] of [['deposit', deposits, 'deposits near the settlements'], ['feature', features, 'features of the worked regions']]) {
    for (const res of env.resourceIds) {
      if (!map[res]) continue;
      harvest.push({ kind, res, amount: map[res] });
      gains.push({ res, n: map[res], kind: 'harvest', reason: `${map[res]} ${res} from ${text}`, refs: [] });
    }
  }
  if (env.resource(RULES.knowledge)) {
    const n = RULES.knowledgePerSettlement * cx.settlements;
    if (n > 0) gains.push({ res: RULES.knowledge, n, kind: 'harvest', reason: `${cx.settlements} settlement(s) gather knowledge`, refs: [] });
  }
  for (const s of ofOp(standing, 'resource.flow')) {
    const n = flowAmount(s.effect, season, cx);
    if (n > 0 && env.resource(s.effect.res)) gains.push({ res: s.effect.res, n, kind: 'flow', reason: `${s.source.label}: flow of ${s.effect.res}`, refs: s.source.ref ? [s.source.ref] : [] });
  }
  return { gains, harvest };
}

const EMPTY = () => ({
  ops: [], shortfall: {}, income: {}, consumption: {}, upkeep: {}, risk: [], risks: [], harvest: [], famine: null, growth: null, approval: 0,
});

/**
 * Dry run of one people's season. now = { stock, core, growth, assign } is the
 * working position (the stock after the season's order costs); state supplies
 * structure and standing. Returns { ops, shortfall, income, consumption,
 * upkeep, risk, risks, harvest, famine, growth, approval }; income,
 * consumption and upkeep are what is actually gained and paid, so income -
 * consumption - upkeep is the change of the stock before caps. risk holds the
 * English lines, risks the same as { message, params } for issues.
 */
export function planEconomy(state, env, pid, now) {
  const people = state.peoples[pid];
  const plan = EMPTY();
  if (now.core <= 0 || !settlementsOf(state, pid).length) return plan;
  const { turn } = state;
  const cal = calendarOf(env.regeln, turn);
  const { season } = cal;
  const standing = standingOf(state, env, pid);
  const cx = { env, core: now.core, units: people.units, regions: controlledRegions(state, pid).length, settlements: settlementsOf(state, pid).length };
  const st = { ...now.stock };
  const get = (res) => st[res] ?? 0;
  const { ops, shortfall } = plan;
  const miss = (res, n) => { if (n > 0) sumInto(shortfall, res, n); };
  const pay = (res, n, kind, reason, refs = []) => {
    if (n <= 0) return;
    st[res] = get(res) - n;
    ops.push({ t: 'pay', res, n, kind, reason, refs });
    sumInto(kind === 'consumption' ? plan.consumption : plan.upkeep, res, n);
  };
  const payAsFar = (res, n, kind, reason, refs) => {
    const p = Math.min(n, get(res));
    pay(res, p, kind, reason, refs);
    miss(res, n - p);
  };
  const payable = (bag) => Object.entries(bag).every(([res, n]) => get(res) >= n);
  const payBag = (bag, reason, refs) => { for (const [res, n] of Object.entries(bag)) pay(res, n, 'upkeep', reason, refs); };
  const risk = (message, params) => {
    plan.risk.push(message);
    plan.risks.push({ message, params });
  };

  // (a) gains
  const { gains, harvest } = gainsOf(state, env, pid, standing, season, now, cx);
  plan.harvest = harvest;
  // Gains are capped before losses: a gain never lifts a stock above its cap
  // (or above where it already stands), so a surplus cannot cushion this
  // season's consumption and upkeep.
  const caps = stockCaps(state, env, pid, standing);
  const ceiling = (res) => Math.min(MAX_STOCK, Math.max(caps[res] ?? MAX_STOCK, now.stock[res] ?? 0));
  for (const g of gains) {
    const n = Math.min(g.n, ceiling(g.res) - get(g.res));
    if (n <= 0) continue;
    st[g.res] = get(g.res) + n;
    ops.push({ t: 'gain', ...g, n });
    sumInto(plan.income, g.res, n);
  }

  // (b) consumption of food
  const lw = leb(state, env, pid);
  if (env.resource(RULES.food)) {
    const due = (lw?.spec?.consumption?.[season] ?? 0) * now.core;
    payAsFar(RULES.food, due, 'consumption', `${now.core} clan(s) eat in ${season}`, lw ? [people.lebensweise] : []);
  }

  // (c) upkeep, oldest development first
  const known = people.developments.known.map((k, i) => ({ k, i })).sort((a, b) => a.k.since - b.k.since || a.i - b.i);
  for (const { k } of known) {
    const ent = env.entwicklung(k.ref);
    if (!ent || k.effectiveFrom > turn || ent.kind === 'lebensweise' || ent.kind === 'bauwerk') continue;
    if (ent.kind === 'institution' && !people.developments.instituted.includes(k.ref)) continue;
    const need = dueOf([...ent.effects, ...ent.price], season, cx);
    if (payable(need)) {
      payBag(need, `upkeep of ${ent.name}`, [k.ref]);
      if (k.state === 'suspended') ops.push({ t: 'resume', ref: k.ref, reason: `upkeep of ${ent.name} is paid again` });
    } else if (k.state === 'active') {
      ops.push({ t: 'suspend', ref: k.ref, reason: `upkeep of ${ent.name} (${bagText(need)}) is not covered` });
      risk(`${ent.name} is suspended: upkeep ${bagText(need)} is not covered`, { reason: 'development-suspended', development: k.ref, name: ent.name, need: bagParam(need) });
    }
  }
  if (lw) {
    for (const [res, n] of Object.entries(dueOf([...lw.effects, ...lw.price], season, cx))) payAsFar(res, n, 'upkeep', `upkeep of ${lw.name}`, [people.lebensweise]);
  }
  for (const s of ofOp(standing, 'resource.flow')) {
    if (s.source.kind !== 'status' && s.source.kind !== 'building') continue;
    const n = flowAmount(s.effect, season, cx);
    if (n < 0) payAsFar(s.effect.res, -n, 'upkeep', `upkeep of ${s.source.label}`, s.source.ref ? [s.source.ref] : []);
  }
  for (const s of settlementsOf(state, pid)) {
    s.buildings.forEach((b, index) => {
      const ent = env.entwicklung(b.ref);
      if (!ent || ent.kind !== 'bauwerk') return;
      const bag = Object.fromEntries(Object.entries(ent.spec.upkeep ?? {}).filter(([, n]) => n > 0));
      const at = { settlement: s.id, index, ref: b.ref };
      if (payable(bag)) {
        payBag(bag, `upkeep of ${ent.name} in ${s.name}`, [b.ref]);
        if (b.state === 'suspended') ops.push({ t: 'building', ...at, state: 'active', reason: `upkeep of ${ent.name} is paid again` });
      } else if (b.state === 'active') {
        ops.push({ t: 'building', ...at, state: 'suspended', reason: `upkeep of ${ent.name} (${bagText(bag)}) is not covered` });
        risk(`${ent.name} in ${s.name} stands idle: upkeep ${bagText(bag)} is not covered`,
          { reason: 'building-idle', development: b.ref, name: ent.name, settlement: s.id, settlementName: s.name, need: bagParam(bag) });
      }
    });
  }
  for (const u of people.units) {
    const bag = Object.fromEntries(Object.entries(unitStats(state, env, pid, u).upkeep ?? {}).filter(([, n]) => n > 0));
    if (payable(bag)) payBag(bag, `upkeep of unit ${u.id}`, [u.type]);
    else {
      ops.push({ t: 'unit', unit: u.id, reason: `upkeep of unit ${u.id} (${bagText(bag)}) is not covered` });
      risk(`unit ${u.id} loses strength: upkeep ${bagText(bag)} is not covered`, { reason: 'unit-weakens', unit: u.id, type: u.type, need: bagParam(bag) });
    }
  }
  for (const s of ofOp(standing, 'dependency')) {
    const { res, amount, penalty } = s.effect;
    const paid = Math.min(amount, get(res));
    pay(res, paid, 'upkeep', `${s.source.label} demands ${amount} ${res}`, s.source.ref ? [s.source.ref] : []);
    if (paid < amount) {
      miss(res, amount - paid);
      ops.push({ t: 'penalty', res, penalty, reason: `${s.source.label}: ${amount} ${res} not delivered` });
      risk(`${s.source.label} demands ${amount} ${res}, which is not covered`, { reason: 'dependency-unpaid', source: s.source.label, res, amount });
    }
  }

  // (d) famine, (f) growth, (g) approval
  let core = now.core;
  const hunger = shortfall[RULES.food] ?? 0;
  if (hunger > 0) {
    const clans = Math.min(core, Math.ceil(hunger / RULES.famineDivisor));
    core -= clans;
    plan.famine = { missing: hunger, clans };
    plan.approval = -1;
    ops.push({ t: 'famine', missing: hunger, clans });
  } else {
    const bonus = ofOp(standing, 'population.growth').reduce((n, s) => n + s.effect.amount, 0);
    let points = Math.max(0, now.growth + RULES.baseGrowth + bonus);
    const cap = Math.min(popCap(state, env, pid, standing), 99);
    let clans = 0;
    while (points >= RULES.growthPerClan && core + clans < cap) {
      clans++;
      points -= RULES.growthPerClan;
    }
    plan.growth = { clans, points: clamp(points, 0, 3) };
    ops.push({ t: 'growth', ...plan.growth });
    if (cal.winter) plan.approval = 1;
  }
  if (plan.approval) ops.push({ t: 'approval', delta: plan.approval, reason: hunger > 0 ? 'famine' : 'a winter without famine' });
  plan.endStock = st;
  return plan;
}

const EMPTY_FORECAST = (caps, cap) => ({ income: {}, consumption: {}, upkeep: {}, net: {}, caps, popCap: cap, shortfall: {}, upkeepRisk: [], upkeepRisks: [], harvest: [] });

/**
 * Preview of the coming season's economy for one people. spend is the cost of
 * the draft's orders, assign the draft's labour (default: the standing one).
 * Works on a full state and on a projection of the people's own side.
 */
export function forecast(state, env, pid, { spend = {}, assign } = {}) {
  const people = state.peoples[pid];
  const standing = standingOf(state, env, pid);
  const caps = stockCaps(state, env, pid, standing);
  const cap = popCap(state, env, pid, standing);
  if (!people?.developments) return EMPTY_FORECAST(caps, cap);
  const stock = { ...people.resources };
  for (const [res, n] of Object.entries(spend)) stock[res] = Math.max(0, (stock[res] ?? 0) - n);
  const plan = planEconomy(state, env, pid, {
    stock, core: people.population.core, growth: people.population.growth, assign: assign ?? people.population.assigned ?? {},
  });
  const net = {};
  for (const res of new Set([...Object.keys(plan.income), ...Object.keys(plan.consumption), ...Object.keys(plan.upkeep)])) {
    net[res] = (plan.income[res] ?? 0) - (plan.consumption[res] ?? 0) - (plan.upkeep[res] ?? 0);
  }
  return {
    income: nonZero(plan.income),
    consumption: nonZero(plan.consumption),
    upkeep: nonZero(plan.upkeep),
    net: nonZero(net),
    caps,
    popCap: cap,
    shortfall: plan.shortfall,
    upkeepRisk: plan.risk,
    upkeepRisks: plan.risks,
    harvest: plan.harvest,
    famine: plan.famine,
    growth: plan.growth,
  };
}

function setDevelopment(tc, pid, ref, patch, kind, reason) {
  const known = tc.state.peoples[pid].developments.known.map((k) => (k.ref === ref ? { ...k, ...patch } : k));
  setPeople(tc, pid, 'developments.known', known, reason, { kind, refs: [ref] });
}

function applyOp(tc, pid, op) {
  const { env } = tc;
  switch (op.t) {
    case 'gain':
      addResource(tc, pid, op.res, op.n, op.reason, { kind: op.kind === 'flow' ? 'economy.flow' : 'economy.harvest', refs: op.refs });
      break;
    case 'pay':
      addResource(tc, pid, op.res, -op.n, op.reason, { kind: `economy.${op.kind}`, refs: op.refs });
      break;
    case 'suspend':
      setDevelopment(tc, pid, op.ref, { state: 'suspended', suspendedSince: tc.turn }, 'development.suspend', op.reason);
      break;
    case 'resume':
      setDevelopment(tc, pid, op.ref, { state: 'active', suspendedSince: null }, 'development.resume', op.reason);
      break;
    case 'building': {
      const s = tc.state.map.settlements.find((x) => x.id === op.settlement);
      const b = s?.buildings[op.index];
      if (!b || b.ref !== op.ref) break;
      const before = b.state;
      b.state = op.state;
      noteChange(tc, op.state === 'suspended' ? 'building.suspend' : 'building.resume', { kind: 'settlement', id: s.id },
        `buildings.${op.index}.state`, before, op.state, op.reason, { people: pid, refs: [op.ref] });
      break;
    }
    case 'unit':
      changeUnitStrength(tc, pid, op.unit, -1, op.reason);
      break;
    case 'penalty': {
      ((tc.scratch.dependencyUnpaid ??= {})[pid] ??= {})[op.res] = true;
      applyOnceList(tc, pid, op.penalty, { reason: op.reason });
      break;
    }
    case 'famine': {
      addPeople(tc, pid, 'population.core', -op.clans, `famine: ${op.missing} ${RULES.food} missing`, { min: 0, max: 99, kind: 'economy.famine' });
      for (const m of tc.state.peoples[pid].council) changeLoyalty(tc, pid, m.id, -1, 'famine in the people');
      break;
    }
    case 'growth': {
      if (op.clans) addPeople(tc, pid, 'population.core', op.clans, 'the people grows', { min: 0, max: 99, kind: 'population.growth' });
      setPeople(tc, pid, 'population.growth', op.points, 'growth points carried on', { kind: 'population.growth' });
      break;
    }
    case 'approval': {
      const { min, max } = tune(env, 'approval');
      addPeople(tc, pid, `meters.${RULES.approval}`, op.delta, `approval changes: ${op.reason}`, { min, max, kind: 'meter.change' });
      break;
    }
    default:
      throw new Error(`economy: unknown op ${op.t}`);
  }
}

/**
 * Step 4 of a season. For every living people: drop the shortfall carried over
 * from S0, plan the season against the opening state and the current stock,
 * apply the plan, then write this season's shortfall and fire its hooks.
 */
export function resolveEconomy(tc) {
  for (const pid of peopleIds(tc.state)) {
    const people = tc.state.peoples[pid];
    if (people.population.core <= 0 || !settlementsOf(tc.state, pid).length) {
      // A people that has gone under keeps no shortfall from earlier seasons.
      if (Object.keys(people.shortfall ?? {}).length) setPeople(tc, pid, 'shortfall', {}, `${pid} has gone under, its shortfall lapses`, { kind: 'shortfall.reset' });
      continue;
    }
    // Increases made earlier this turn (resource.delta) stay, S0 values lapse.
    const old = tc.s0.peoples[pid]?.shortfall ?? {};
    const kept = {};
    for (const res of Object.keys(people.shortfall ?? {}).sort()) {
      const v = people.shortfall[res] - (old[res] ?? 0);
      if (v > 0) kept[res] = v;
    }
    setPeople(tc, pid, 'shortfall', kept, 'shortfall of the last season lapses', { kind: 'shortfall.reset' });

    const plan = planEconomy(tc.s0, tc.env, pid, {
      stock: people.resources, core: people.population.core, growth: people.population.growth, assign: people.population.assigned ?? {},
    });
    for (const op of plan.ops) applyOp(tc, pid, op);
    for (const res of Object.keys(plan.shortfall).sort()) {
      addPeople(tc, pid, `shortfall.${res}`, plan.shortfall[res], `${plan.shortfall[res]} ${res} could not be paid this season`, { kind: 'shortfall' });
      fireHook(tc, pid, `shortfall:${res}`);
    }
    const left = tc.state.peoples[pid].shortfall;
    for (const res of Object.keys(left)) if (left[res] === 0) delete left[res];
  }
}

/** Cap spoilage: above the cap a stock loses ceil(excess / spoilage), a cap of 0 stores nothing. */
export function capStocks(tc) {
  const spoilage = Math.max(1, tune(tc.env, 'spoilage'));
  for (const pid of peopleIds(tc.state)) {
    const people = tc.state.peoples[pid];
    if (!people.developments) continue;
    const caps = stockCaps(tc.s0, tc.env, pid);
    const opening = tc.s0.peoples[pid]?.resources ?? {};
    for (const res of Object.keys(people.resources).sort()) {
      let v = people.resources[res];
      const cap = caps[res];
      // Gains from any source this season (modules, events, trade) are capped
      // too: a stock never ends above its cap or its opening value, whichever is higher.
      const limit = cap === undefined ? MAX_STOCK : Math.max(cap, opening[res] ?? 0);
      if (v > limit) {
        addResource(tc, pid, res, limit - v, `${res} gains above the cap of ${cap} are lost`, { kind: 'resource.spoil' });
        v = limit;
      }
      if (cap !== undefined && v > cap) {
        const lose = cap === 0 ? v : Math.ceil((v - cap) / spoilage);
        addResource(tc, pid, res, -lose, cap === 0 ? `${res} cannot be stored` : `${v - cap} ${res} over the cap of ${cap} spoil`, { kind: 'resource.spoil' });
      } else if (v > MAX_STOCK) {
        addResource(tc, pid, res, MAX_STOCK - v, `${res} is held to ${MAX_STOCK}`, { kind: 'resource.spoil' });
      }
    }
  }
}

/** Developments suspended for tuning.lossAfter turns are lost; the way of life never is. */
export function loseSuspended(tc) {
  const after = tc.env.regeln.tuning.lossAfter;
  for (const pid of peopleIds(tc.state)) {
    const people = tc.state.peoples[pid];
    if (!people.developments) continue;
    const lost = people.developments.known.filter((k) => {
      if (k.state !== 'suspended' || k.suspendedSince == null || tc.turn - k.suspendedSince < after) return false;
      return tc.env.entwicklung(k.ref)?.kind !== 'lebensweise' && k.ref !== people.lebensweise;
    });
    for (const k of lost) {
      const name = tc.env.entwicklung(k.ref)?.name ?? k.ref;
      const reason = `${name} was suspended for ${tc.turn - k.suspendedSince} seasons and is lost`;
      setPeople(tc, pid, 'developments.known', tc.state.peoples[pid].developments.known.filter((x) => x.ref !== k.ref), reason, { kind: 'development.lost', refs: [k.ref] });
      if (tc.state.peoples[pid].developments.instituted.includes(k.ref)) {
        setPeople(tc, pid, 'developments.instituted', tc.state.peoples[pid].developments.instituted.filter((r) => r !== k.ref), reason, { kind: 'development.lost', refs: [k.ref] });
      }
    }
  }
}

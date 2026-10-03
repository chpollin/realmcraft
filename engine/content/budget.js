// Power budget of content: the weight of every primitive, the budget of an
// Entwicklung against its tier row, the net weight of an event card against
// its band and the difficulty of a Bestimmung. Pure functions over plain data,
// so the browser preview and the Node validator compute the same numbers.
//
// The tables are engine/schemas/effects.js (WEIGHTS, SPEC_WEIGHTS, TIERS).
// Where a table entry leaves a choice open, the choice made here is named in
// a comment at the point of use. Rounding never favours the content: a
// fractional weight rounds up when positive and towards zero when negative
// (Regelkern section 10).

import { SUCCESS_BANDS } from '../schemas/common.js';
import { SPEC_WEIGHTS, TIERS, WEIGHTS } from '../schemas/effects.js';
import { issue, pointer } from '../core/issues.js';
import { resolveRef } from './library.js';

const SEASON_KEYS = ['seasons1', 'seasons2', 'seasons3'];

function roundWeight(x) {
  return x > 0 ? Math.ceil(x) : Math.trunc(x) || 0;
}

/** v(res) from regeln.resources, 1 when the world does not list the key (the validator reports unknown_resource). */
export function resourceValue(res, ctx = {}) {
  const r = ctx.regeln?.resources?.find((x) => x.id === res);
  return r ? r.value : 1;
}

/** b(tag) from regeln.vocabulary: 1 narrow, 2 domain, 3 everything; unknown tags count as narrow. */
export function tagBreadth(tags, ctx = {}) {
  const vocab = ctx.regeln?.vocabulary ?? {};
  let b = 1;
  for (const t of tags ?? []) if (Object.hasOwn(vocab, t) && vocab[t] > b) b = vocab[t];
  return b;
}

// WEIGHTS knows two breadths; breadth 3 ("everything") has no row of its
// own and is priced like a domain, the closest row that exists.
const breadthKey = (tags, ctx) => (tagBreadth(tags, ctx) >= 2 ? 'broad' : 'narrow');

function seasonCount(ctx) {
  return ctx.regeln?.calendar?.seasons?.length || 4;
}

function winterCount(ctx) {
  const seasons = ctx.regeln?.calendar?.seasons;
  return seasons ? seasons.filter((s) => s.winter).length : 1;
}

// Weight factor of something that acts in k seasons of the year, on the
// resource.flow scale. Every season of the calendar is the full year.
function flowFactor(k, ctx) {
  const table = WEIGHTS['resource.flow'].perPoint;
  if (k <= 0) return 0;
  if (k >= seasonCount(ctx)) return table.seasons4;
  return table[SEASON_KEYS[Math.min(k, 3) - 1]];
}

// A flow without `when` acts in every season. A `when` that names every
// season of the calendar is the same flow and costs the same.
function seasonFactor(when, ctx) {
  return flowFactor(when ? new Set(when).size : seasonCount(ctx), ctx);
}

// Scaled flows count with the number of their unit per step, at least 1
// (Regelkern section 10). tuning.expected is a campaign average, while the
// runtime pays a scaled benefit on the live count of a grown people, so a
// benefit counts with the upper bound scaleBound x expected and a burden with
// the expected count itself.
function scaleFactor(scale, ctx, amount) {
  if (!scale) return 1;
  const expected = ctx.regeln?.tuning?.expected?.[scale.per];
  if (typeof expected !== 'number') return 1;
  const count = amount > 0 ? expected * WEIGHTS['resource.flow'].scaleBound : expected;
  return Math.max(1, count / scale.step);
}

function unitStrength(typeRef, ctx) {
  const unit = ctx.resolve ? ctx.resolve(typeRef) : ctx.library ? resolveRef(ctx.library, typeRef) : null;
  return unit?.kind === 'einheit' && unit.spec ? unit.spec.strength : 1;
}

/** Sum of the weights of a list of one-off primitives. */
export function sumWeights(list, ctx = {}) {
  return (list ?? []).reduce((s, p) => s + primitiveWeight(p, ctx), 0);
}

// Severity from the worst harmful threshold weight |w|: up to 2 light, up to
// 5 heavy, above existential (WEIGHTS.meter.severityByThresholdWeight).
function meterSeverity(worst) {
  for (const [upTo, severity] of WEIGHTS.meter.severityByThresholdWeight) {
    if (upTo === null || worst <= upTo) return severity;
  }
  return 3;
}

// A meter is a price through its harmful thresholds, -(severity x cadence),
// and an effect through its beneficial ones, which pay out like one-off
// effects: once, or WEIGHTS.meter.repeat times when the meter can fall back
// and cross again (a use meter with decay; the kernel decays only in a
// season without rise, so a season meter never falls). A harmful threshold
// the meter cannot reach by its own rise and decay is no price. A beneficial
// one counts whenever it lies in the meter's range, because meter.delta from
// elsewhere may still move the meter across it.
function meterWeight(p, ctx) {
  const W = WEIGHTS.meter;
  const season = p.rise.on === 'season';
  const falls = !season && p.decay > 0;
  const inRange = (t) => t.at >= p.min && t.at <= p.max;
  let worst = 0;
  let gain = 0;
  for (const t of p.thresholds) {
    const w = sumWeights(t.effects, ctx);
    if (w < 0 && inRange(t) && (t.at > 0 || falls)) worst = Math.max(worst, -w);
    if (w > 0 && inRange(t)) gain += w * (falls ? W.repeat : 1);
  }
  const cadence = season ? W.cadence.season : W.cadence.use;
  return gain - (worst > 0 ? meterSeverity(worst) * cadence : 0);
}

// How often a trigger's effects count, on the resource.flow scale. A benefit
// counts with the most the hook can fire, a burden with the least, so neither
// direction favours the content: season fires every season, winter in the
// winter seasons, use: and shortfall: as often as the people chooses (every
// season for a benefit, once for a burden, which is a cost of use), every
// other hook once. A burden under an `if` may never be due and counts once.
function hookFrequency(p, sum, ctx) {
  const hook = p.on.split(':')[0];
  if (sum < 0 && p.if) return 1;
  if (hook === 'season' || (sum > 0 && (hook === 'use' || hook === 'shortfall'))) return flowFactor(seasonCount(ctx), ctx);
  // A calendar without winter never fires the hook: no price, but a benefit still counts once.
  if (hook === 'winter') return flowFactor(winterCount(ctx), ctx) || (sum > 0 ? 1 : 0);
  return 1;
}

// A status acts like its standing effects for its duration: the full standing
// weight for a permanent status (duration null) or one lasting a year, the
// share duration / seasons below that. A harmful status that ends on setback
// may be gone after one season and counts one.
function statusWeight(p, ctx) {
  const full = (p.effects ?? []).reduce((s, e) => s + primitiveWeight(e, ctx), 0);
  const seasons = seasonCount(ctx);
  const lasts = full < 0 && p.endsOn === 'setback' ? 1 : p.duration ?? seasons;
  return roundWeight((full * Math.min(lasts, seasons)) / seasons);
}

/**
 * Signed weight of one primitive in power points. Effects count positive,
 * prices negative; the sign follows the op's amount unless noted.
 */
export function primitiveWeight(p, ctx = {}) {
  const W = WEIGHTS[p.op];
  if (!W) return 0;
  switch (p.op) {
    case 'probe.mod':
      return p.amount * W.perPoint[breadthKey(p.tags, ctx)];
    case 'unit.mod': {
      const w = p.amount * W.perPoint[breadthKey(p.unitTags, ctx)];
      // More upkeep is a burden, so the upkeep stat counts with reversed sign.
      return p.stat === 'upkeep' ? -w : w;
    }
    case 'stat.mod':
    case 'population.cap':
    case 'population.growth':
    case 'research.mod':
    case 'sight.mod':
    case 'population.delta':
    case 'loyalty.delta':
    case 'standing.delta':
    case 'meter.delta':
      return p.amount * W.perPoint;
    case 'order.slot':
      return W[p.slot];
    // v(res) applies to every op that moves units of a resource, stock caps
    // included, so a valuable resource is worth more in every form.
    case 'stock.cap':
      return roundWeight((p.amount * resourceValue(p.res, ctx) * W.perTwoPoints) / 2);
    case 'resource.flow':
      return roundWeight(p.amount * resourceValue(p.res, ctx) * seasonFactor(p.when, ctx) * scaleFactor(p.scale, ctx, p.amount));
    case 'yield.mod':
      return p.amount * resourceValue(p.res, ctx) * seasonFactor(p.when, ctx);
    case 'resource.delta':
      return p.amount * resourceValue(p.res, ctx) * W.perPoint;
    // Each season the people either pays or takes the penalty, never both, so
    // the dependency weighs as the lighter of the two: the payment, or the
    // harmful part of the penalty on every season of the year. A penalty that
    // harms nothing leaves the dependency free (the validator rejects a
    // helpful one as misplaced_effect).
    case 'dependency': {
      const pay = p.amount * resourceValue(p.res, ctx) * W.perPoint;
      const penalty = roundWeight(Math.min(0, sumWeights(p.penalty, ctx)) * flowFactor(seasonCount(ctx), ctx));
      return Math.max(pay, penalty);
    }
    case 'order.unlock':
      return ctx.orders?.[p.order]?.standingOutcome ? W.withStandingOutcome : W.plain;
    case 'order.restrict': {
      // A duty has no rule in the kernel (W.duty is 0) and a restriction
      // naming neither orders nor tags binds nothing; the runtime never
      // charges either, so neither is a price.
      if (p.mode === 'duty') return W.duty;
      if (!p.orders.length && !p.tags.length) return 0;
      const broad = breadthKey(p.tags, ctx) === 'broad';
      if (p.mode === 'forbid') return broad ? W.forbidBroad : W.forbidNarrow;
      return broad ? W.limitBroad : W.limitNarrow;
    }
    case 'meter':
      return meterWeight(p, ctx);
    case 'trigger': {
      const sum = sumWeights(p.effects, ctx);
      // "Negative consequence on omission" is the shortfall hook: a duty the
      // people fails to meet.
      if (p.on.startsWith('shortfall:') && sum < 0) return W.negativeOnOmission;
      return roundWeight(sum * hookFrequency(p, sum, ctx));
    }
    case 'relation.delta': {
      const t = p.people === 'neighbours' || p.people === 'all' || p.people === '$target' ? p.people : 'people';
      return p.amount * W.perPoint[t];
    }
    case 'status.add':
      return statusWeight(p, ctx);
    // A token or region change has no amount; its sign comes from what it
    // does (a crisis or grievance token and giving up a region are a price,
    // breakthrough and impulse help).
    case 'token.add':
      return p.kind === 'crisis' || p.kind === 'grievance' ? -W.fixed : W.fixed;
    case 'region.control':
      return p.people === '$self' ? W.fixed : -W.fixed;
    case 'loyalty.bind':
    case 'council.seat':
    case 'module.activate':
    case 'governance.rule':
    case 'flag.set':
      return W.fixed;
    case 'unit.spawn':
      return unitStrength(p.type, ctx) * W.perStrength;
    case 'unit.delta':
      return p.strength * W.perStrength;
    case 'reveal':
      return W.perRegion;
    default:
      throw new Error(`budget: no weight rule for op "${p.op}"`);
  }
}

// Outcomes that leave something standing (Regelkern section 10, action.grant).
function hasStandingOutcome(app) {
  const success = SUCCESS_BANDS.flatMap((b) => app.outcomes?.[b] ?? []);
  return success.some((p) => p.op === 'status.add' || p.op === 'unit.spawn' || p.op === 'region.control' || (p.op === 'population.delta' && p.amount > 0));
}

/**
 * A price the people pays only when it uses something: a meter that rises
 * on use: or a trigger on use:. It costs nothing while the use stays undone.
 */
export const useBound = (p) => (p.op === 'meter' && p.rise.on.startsWith('use:')) || (p.op === 'trigger' && p.on.startsWith('use:'));

function tierRow(tier, ctx) {
  const rows = ctx.tiers?.length ? ctx.tiers : TIERS;
  return rows.find((r) => r.tier === Math.max(1, tier)) ?? rows[rows.length - 1];
}

// ctx.resolve(ref) lets a caller with its own lookup (world package
// validation before a library exists) stand in for ctx.library.
function withResolve(ctx) {
  if (ctx.resolve || !ctx.library) return ctx;
  return { ...ctx, resolve: (ref) => resolveRef(ctx.library, ref) };
}

/**
 * Budget of an Entwicklung: E (effects, positive onAcquire, spec grants), P
 * (price, negative onAcquire), net = E + P, the research cost net x (tier + 1)
 * and the budget issues against the tier row. `lines` is the per-primitive
 * breakdown for `cli budget`.
 */
export function scoreEntwicklung(ent, ctx = {}) {
  ctx = withResolve(ctx);
  const lines = [];
  const issues = [];
  let effect = 0;
  let price = 0;
  // The part of P that binds while the development is held. The tier's
  // minimum price asks for this part: a one-off burden of onAcquire and a
  // use-bound price count in P, but a people can take the one and avoid the
  // other and keep the effects for free.
  let standing = 0;
  const add = (path, op, weight, side) => {
    lines.push({ path, op, weight, side });
    if (side === 'effect') effect += weight;
    else price += weight;
  };

  (ent.effects ?? []).forEach((p, i) => add(`/effects/${i}`, p.op, primitiveWeight(p, ctx), 'effect'));
  (ent.price ?? []).forEach((p, i) => {
    const w = primitiveWeight(p, ctx);
    add(`/price/${i}`, p.op, w, 'price');
    if (!useBound(p)) standing += w;
  });
  (ent.onAcquire ?? []).forEach((p, i) => {
    const w = primitiveWeight(p, ctx);
    add(`/onAcquire/${i}`, p.op, w, w >= 0 ? 'effect' : 'price');
  });
  // Acquiring this ends every development it replaces. Losing one is this
  // development's own cost and is not credited; shedding one whose net is
  // negative under the current weights is a gain and counts as effect. The
  // replaced one is scored without its own replaces (ctx.replacing), so a
  // replacement cycle cannot recurse.
  if (!ctx.replacing) {
    (ent.replaces ?? []).forEach((id, i) => {
      const old = ctx.resolve?.(id);
      if (!old || old.id === ent.id) return;
      const { net } = scoreEntwicklung(old, { ...ctx, replacing: true });
      if (net < 0) add(`/replaces/${i}`, 'replaces', -net, 'effect');
    });
  }

  const spec = ent.spec;
  if (spec && ent.kind === 'einheit') add('/spec', 'einheit', spec.strength * SPEC_WEIGHTS.einheit.perStrength, 'effect');
  if (spec && ent.kind === 'bauwerk' && (ent.effects ?? []).length === 0) add('/spec', 'bauwerk', SPEC_WEIGHTS.bauwerk.withoutOwnEffect, 'effect');
  // An institution that opens a seat spawns an advisor (council.seat).
  if (spec && ent.kind === 'institution' && spec.seat) add('/spec/seat', 'council.seat', WEIGHTS['council.seat'].fixed, 'effect');
  if (spec && ent.kind === 'disziplin') {
    spec.applications.forEach((app, i) => {
      const path = `/spec/applications/${i}`;
      add(path, 'application', hasStandingOutcome(app) ? SPEC_WEIGHTS.application.withStandingOutcome : SPEC_WEIGHTS.application.plain, 'effect');
      for (const band of SUCCESS_BANDS) {
        const w = sumWeights(app.outcomes?.[band], ctx);
        if (w > SPEC_WEIGHTS.application.maxOutcomePerUse) {
          issues.push(issue('budget_effect', pointer(`${path}/outcomes`, band), `outcome ${band} weighs ${w}, an application may produce at most ${SPEC_WEIGHTS.application.maxOutcomePerUse} per use`));
        }
      }
    });
  }

  const tier = ent.tier;
  const row = tierRow(tier, ctx);
  const net = effect + price;
  const research = net * (tier + 1);
  if (effect > row.effectMax) issues.push(issue('budget_effect', '', `effect ${effect} exceeds ${row.effectMax} for tier ${tier}`));
  const netOk = net >= row.netMin && net <= row.netMax;
  if (!netOk) issues.push(issue('budget_net', '', `net ${net} lies outside ${row.netMin}..${row.netMax} for tier ${tier}`));
  if (standing > row.priceMax) issues.push(issue('budget_price', '', `standing price ${standing} is above the minimum price ${row.priceMax} for tier ${tier}; one-off and use-bound prices do not count towards it`));
  // Research follows from net and tier; with net out of range there is no
  // valid research cost to compare against.
  if (netOk && ent.cost && ent.cost.research !== research) {
    issues.push(issue('content.research_cost', '/cost/research', `research must be net ${net} x (tier ${tier} + 1) = ${research}, got ${ent.cost.research}`, { severity: 'error' }));
  }
  return { effect, price, net, tier, research, ok: issues.length === 0, issues, lines };
}

/**
 * Budget of a single file for `cli budget <file>`: no library, no people,
 * only the world's rules when given. Without regeln every resource counts
 * v = 1 and every tag narrow; without a library unit.spawn counts strength 1.
 */
export function scoreEntwicklungStandalone(ent, regeln) {
  return scoreEntwicklung(ent, regeln ? { regeln } : {});
}

// TUNING: net weight per event band, Regelkern section 12 (bands on the
// WEIGHTS scale), used when regeln.tuning.eventBands is absent.
export const EVENT_BANDS = Object.freeze({ 1: [-6, -2], 2: [-3, 0], 3: [-2, 2], 4: [0, 3], 5: [2, 6] });

function eventBand(band, ctx) {
  const row = ctx.regeln?.tuning?.eventBands?.find((b) => b.band === band);
  return row ? [row.net.min, row.net.max] : EVENT_BANDS[band];
}

/**
 * Net weight of an event card. A decision card is judged per option (fixed
 * effects plus the option's effects); every option must fit the band.
 */
export function scoreEreignis(ev, ctx = {}) {
  ctx = withResolve(ctx);
  const [min, max] = eventBand(ev.band, ctx);
  const issues = [];
  const base = sumWeights(ev.effects, ctx);
  const variants = ev.options ? ev.options.map((o, i) => ({ path: `/options/${i}`, list: [...ev.effects, ...o.effects] })) : [{ path: '', list: ev.effects }];
  const scored = variants.map(({ path, list }) => {
    const ws = list.map((p) => primitiveWeight(p, ctx));
    const effect = ws.filter((w) => w > 0).reduce((a, b) => a + b, 0);
    const price = ws.filter((w) => w < 0).reduce((a, b) => a + b, 0);
    const net = effect + price;
    if (net < min || net > max) issues.push(issue('budget_net', path, `net ${net} lies outside ${min}..${max} for band ${ev.band}`));
    return { effect, price, net };
  });
  // The headline numbers are those of the worst-fitting variant, so a status
  // line never shows a passing number for a card that failed.
  const head = scored.reduce((a, b) => (Math.abs(b.net) > Math.abs(a.net) ? b : a));
  return { ...head, band: ev.band, base, options: ev.options ? scored : null, ok: issues.length === 0, issues };
}

// TUNING: difficulty points per missing unit of a destiny predicate, on the
// WEIGHTS scale. controls, relation, development.known and holds follow
// Regelkern section 13; the others are derived from the weight of the
// primitive that would close the gap (stat.mod 3, population.delta 3, a
// year-round flow of 3 per four units, two region.control for subjugation).
export const DESTINY_WEIGHTS = Object.freeze({
  controls: 3,
  stat: WEIGHTS['stat.mod'].perPoint,
  population: WEIGHTS['population.delta'].perPoint,
  resourcePerUnit: 3 / 4,
  relation: 2,
  atWar: 3,
  knownPerTier: 3,
  subjugated: 2 * WEIGHTS['region.control'].fixed,
  settlement: 3,
  minPerMilestone: 2,
});

function baseline(ctx) {
  const p = ctx.people;
  const state = ctx.state;
  const known = (p?.developments?.known ?? [])
    .filter((k) => k.state === 'active')
    .map((k) => (ctx.resolve ? ctx.resolve(k.ref) : null))
    .filter(Boolean);
  return {
    controls: state && p ? Object.values(state.map?.control ?? {}).filter((x) => x === p.id).length : 0,
    population: p?.population?.core ?? 0,
    resource: (k) => p?.resources?.[k] ?? 0,
    stat: (k) => ctx.stats?.[k] ?? ctx.regeln?.stats?.find((s) => s.id === k)?.base ?? 0,
    relation: (other) => {
      if (!state || !p) return { value: 0, atWar: false };
      if (other === '$any' || other === '$all') {
        // $any is as close as the best relation, $all as the worst; a people never met counts 0.
        const values = Object.entries(state.relations ?? {}).filter(([k]) => k.split('|').includes(p.id)).map(([, r]) => r.value);
        if (!values.length) return { value: 0, atWar: false };
        return { value: other === '$any' ? Math.max(...values) : Math.min(...values), atWar: false };
      }
      const key = [p.id, other].sort().join('|');
      return state.relations?.[key] ?? { value: 0, atWar: false };
    },
    known,
    settlements: (kind) => (state && p ? (state.map?.settlements ?? []).filter((s) => s.people === p.id && s.kind === kind).length : 0),
  };
}

function predicateDifficulty(pred, base, ctx) {
  const D = DESTINY_WEIGHTS;
  switch (pred.pred) {
    case 'controls':
      // Controlled regions by terrain need the generated map; without it a
      // terrain-bound count starts from zero, which overstates difficulty
      // rather than understating it.
      return D.controls * Math.max(0, pred.count - (pred.terrain ? ctx.controlsByTerrain?.[pred.terrain] ?? 0 : base.controls));
    case 'stat.atLeast':
      return D.stat * Math.max(0, pred.value - base.stat(pred.key));
    case 'resource.atLeast':
      return Math.ceil(Math.max(0, pred.value - base.resource(pred.key)) * resourceValue(pred.key, ctx) * D.resourcePerUnit);
    case 'population.atLeast':
      return D.population * Math.max(0, pred.value - base.population);
    case 'relation': {
      const cur = base.relation(pred.people).value;
      const gap = pred.cmp === 'gte' ? Math.max(0, pred.value - cur) : Math.max(0, cur - pred.value + 1);
      return D.relation * gap;
    }
    case 'development.known': {
      const have = base.known.filter((e) => (!pred.kind || e.kind === pred.kind)
        && (pred.tier === undefined || e.tier >= pred.tier)
        && (!pred.tags || pred.tags.some((t) => e.tags.includes(t)))).length;
      return D.knownPerTier * Math.max(1, pred.tier ?? 1) * Math.max(0, pred.count - have);
    }
    case 'subjugated':
      return D.subjugated;
    case 'settlement':
      return D.settlement * Math.max(0, pred.count - base.settlements(pred.kind));
    case 'holds':
      return predicateDifficulty(pred.predicate, base, ctx) + pred.seasons;
    default:
      throw new Error(`budget: no difficulty rule for predicate "${pred.pred}"`);
  }
}

/**
 * Difficulty of a Bestimmung for a people at adoption (ctx.people, ctx.state;
 * without them the baseline is an empty people). At most one milestone may
 * already hold (difficulty 0), every other needs at least
 * DESTINY_WEIGHTS.minPerMilestone. The sum must lie in ctx.destinyBand
 * { min, max }, else in regeln.tuning.bestimmungBand when the world sets one.
 */
export function scoreBestimmung(b, ctx = {}) {
  ctx = withResolve(ctx);
  const base = baseline(ctx);
  const issues = [];
  const milestones = (b.milestones ?? []).map((m, i) => ({ id: m.id, difficulty: predicateDifficulty(m.predicate, base, ctx), path: `/milestones/${i}` }));
  const reached = milestones.filter((m) => m.difficulty === 0);
  if (reached.length > 1) {
    issues.push(issue('content.destiny_trivial', '/milestones', `${reached.length} milestones already hold at adoption, at most one may`, { severity: 'error' }));
  }
  for (const m of milestones) {
    if (m.difficulty > 0 && m.difficulty < DESTINY_WEIGHTS.minPerMilestone) {
      issues.push(issue('content.destiny_trivial', m.path, `milestone ${m.id} has difficulty ${m.difficulty}, at least ${DESTINY_WEIGHTS.minPerMilestone} required`, { severity: 'error' }));
    }
  }
  const difficulty = milestones.reduce((s, m) => s + m.difficulty, 0);
  const band = ctx.destinyBand ?? ctx.regeln?.tuning?.bestimmungBand;
  if (band && (difficulty < band.min || difficulty > band.max)) {
    issues.push(issue('content.destiny_band', '', `difficulty ${difficulty} lies outside ${band.min}..${band.max}`, { severity: 'error' }));
  }
  return { difficulty, milestones: milestones.map(({ id, difficulty: d }) => ({ id, difficulty: d })), ok: issues.length === 0, issues };
}


// Content validator: Entwicklungen, event cards, Bestimmungen, whole world
// packages and agent proposals. Every function returns issues as data and
// never throws on bad content, because its input comes from agents and world
// authors. Stages follow Regelkern section 10: schema, sign, references,
// tiers, budget, drift, grounding, limits; each stage reports all its issues.
//
// ctx (every field optional; a missing field switches its checks off):
//   regeln    regeln.json: resources and v(res), stats, calendar, vocabulary, tuning
//   welt      welt.json: terrain ids, deposit resource keys (features)
//   library   campaign library (library.js), or a lenient one built from a world package
//   people    the people a candidate is meant for; switches on candidate checks
//   state     campaign state: turn, rev, ingested, settlements, control, relations, peoples
//   task      the task an agent answered: envelope, limits
//   batch     Entwicklungen already accepted earlier in the same proposal
//   openTier, practiceTop   precomputed by the kernel, override the derivation here
//   destinyBand { min, max }   difficulty band of a Bestimmung
//   orders, modules   order types and module ids; validateProposal and
//                     validateWorldPackage fill them from the kernel registry
//   findings   finding ids a correction may cite; validateProposal derives
//              them from the chronicle of ctx.state when absent
//   requireTask   reject state-changing items of a proposal that answers no task

import { SCHEMAS, PRIMITIVES, ITEMS_BY_AGENT, TIERS, WELT_REQUIRED_KEYS, APPROVAL_METER } from '../schemas/index.js';
import { validate as schemaIssues } from './schema.js';
import { issue, hasErrors } from '../core/issues.js';
import { canon } from '../core/canon.js';
import { hashValue } from '../core/hash.js';
import { registry } from '../core/orders.js';
import { MODULE_IDS } from '../modules/index.js';
import { primitiveWeight, scoreBestimmung, scoreEntwicklung, scoreEreignis, sumWeights } from './budget.js';
import { resolveRef, refOf } from './library.js';
import { isOpen, pathTier, pathsOf, pfadOf } from '../core/pfade.js';

// Per proposal, Agentenvertrag (item table): the world agent sends at most
// two pool events and one map feature per turn.
export const MAX_EVENTS_PER_PROPOSAL = 2;
export const MAX_FEATURES_PER_PROPOSAL = 1;
// Text items carry prose with refs and never a value the kernel reads.
const TEXT_ITEMS = new Set(['narrative', 'voice', 'stance', 'memory', 'finding']);

// Helpers

const prefix = (base, list) => list.map((i) => ({ ...i, path: base + i.path }));

function getAt(obj, path) {
  if (!path) return obj;
  let cur = obj;
  for (const raw of path.split('/').slice(1)) {
    const seg = raw.replaceAll('~1', '/').replaceAll('~0', '~');
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = cur[seg];
  }
  return cur;
}

// The interpreter reports a wrong op as schema.discriminator. An agent needs
// to know whether the op does not exist or sits in the wrong slot (a one-off
// op in effects, a standing op in onAcquire, a catalogue op inside a status).
function mapSchemaIssues(list, root) {
  return list.map((i) => {
    if (i.code !== 'schema.discriminator' || !i.path.endsWith('/op')) return i;
    const op = getAt(root, i.path);
    if (typeof op === 'string' && Object.hasOwn(PRIMITIVES, op)) return issue('misplaced_effect', i.path, `op "${op}" (${PRIMITIVES[op].lifetime}) is not allowed in this slot`);
    return issue('unknown_primitive', i.path, `unknown op ${JSON.stringify(op)}`);
  });
}

function checkSchema(name, value) {
  return mapSchemaIssues(schemaIssues(SCHEMAS[name], value), value);
}

const NESTED_ONCE = { trigger: 'effects', 'status.add': 'effects', dependency: 'penalty', 'order.restrict': 'breach' };

/** Visits every primitive of a list, nested one-off lists included. */
function eachPrimitive(list, base, visit) {
  (list ?? []).forEach((p, i) => {
    const path = `${base}/${i}`;
    visit(p, path);
    const nested = NESTED_ONCE[p.op];
    if (nested && Array.isArray(p[nested])) eachPrimitive(p[nested], `${path}/${nested}`, visit);
    if (p.op === 'meter') p.thresholds.forEach((t, j) => eachPrimitive(t.effects, `${path}/thresholds/${j}/effects`, visit));
  });
}

function eachCondition(cond, path, visit) {
  if (!cond || typeof cond !== 'object') return;
  if (cond.all) return cond.all.forEach((c, i) => eachCondition(c, `${path}/all/${i}`, visit));
  if (cond.any) return cond.any.forEach((c, i) => eachCondition(c, `${path}/any/${i}`, visit));
  if (cond.not) return eachCondition(cond.not, `${path}/not`, visit);
  visit(cond, path);
}

/** References of one primitive or condition as { kind, value, path }. */
function primitiveRefs(p, path, out) {
  const add = (kind, value, at) => out.push({ kind, value, path: at });
  const tagList = (field) => (p[field] ?? []).forEach((t, i) => add('tag', t, `${path}/${field}/${i}`));
  if (typeof p.res === 'string') add('res', p.res, `${path}/res`);
  if (p.op === 'stat.mod') add('stat', p.stat, `${path}/stat`);
  if (p.op === 'yield.mod') add('terrain', p.terrain, `${path}/terrain`);
  (p.when ?? []).forEach((s, i) => add('season', s, `${path}/when/${i}`));
  if (p.scale?.tag) add('tag', p.scale.tag, `${path}/scale/tag`);
  if (['probe.mod', 'research.mod', 'order.restrict', 'token.add'].includes(p.op)) tagList('tags');
  if (p.op === 'unit.mod') tagList('unitTags');
  if (p.op === 'governance.rule') {
    tagList('scopeTags');
    (p.scopeOrders ?? []).forEach((o, i) => add('order', o, `${path}/scopeOrders/${i}`));
  }
  if (p.op === 'council.seat') { tagList('favor'); tagList('oppose'); }
  if (p.op === 'unit.spawn') add('unitType', p.type, `${path}/type`);
  if (p.op === 'order.unlock') add('order', p.order, `${path}/order`);
  if (p.op === 'order.restrict') p.orders.forEach((o, i) => add('order', o, `${path}/orders/${i}`));
  if (p.op === 'module.activate') add('module', p.module, `${path}/module`);
  if (p.op === 'meter') {
    add('meterDef', p.id, `${path}/id`);
    hookRefs(p.rise.on, `${path}/rise/on`, out);
  }
  if (p.op === 'meter.delta') add('meter', p.meter, `${path}/meter`);
  if (p.op === 'trigger') hookRefs(p.on, `${path}/on`, out);
  if (p.op === 'relation.delta' && !GROUP_TARGETS.has(p.people)) add('people', p.people, `${path}/people`);
  if (p.op === 'reveal' && p.scope === 'people' && !p.at.startsWith('$')) add('people', p.at, `${path}/at`);
  if (p.op === 'resource.flow' && p.scale?.per === 'units' && p.scale.tag) add('unitTag', p.scale.tag, `${path}/scale/tag`);
  if (p.if) conditionRefs(p.if, `${path}/if`, out);
}

const GROUP_TARGETS = new Set(['$target', 'neighbours', 'all']);

// A hook with an argument names an order type or an application (use:), a
// resource (shortfall:) or a probe tag (crit_success:, crit_fail:); a hook
// whose argument nothing carries never fires.
function hookRefs(on, path, out) {
  const at = on.indexOf(':');
  if (at < 0) return;
  const hook = on.slice(0, at);
  out.push({ kind: hook === 'use' ? 'use' : hook === 'shortfall' ? 'res' : 'tag', value: on.slice(at + 1), path });
}

function conditionRefs(cond, base, out) {
  eachCondition(cond, base, (c, path) => {
    if (c.meter !== undefined) out.push({ kind: 'meter', value: c.meter, path: `${path}/meter` });
    if (c.relation !== undefined && c.relation !== '$any') out.push({ kind: 'people', value: c.relation, path: `${path}/relation` });
    if (c.res) out.push({ kind: 'res', value: c.res, path: `${path}/res` });
    if (c.season) out.push({ kind: 'season', value: c.season, path: `${path}/season` });
    if (c.tagCount) out.push({ kind: 'tag', value: c.tagCount, path: `${path}/tagCount` });
    if (c.controls?.terrain) out.push({ kind: 'terrain', value: c.controls.terrain, path: `${path}/controls/terrain` });
    if (c.knows) out.push({ kind: 'development', value: c.knows, path: `${path}/knows` });
    if (c.lebensweise) out.push({ kind: 'development', value: c.lebensweise, path: `${path}/lebensweise` });
    if (c.module) out.push({ kind: 'module', value: c.module, path: `${path}/module` });
  });
}

function bagRefs(bag, path, out) {
  for (const k of Object.keys(bag ?? {})) out.push({ kind: 'res', value: k, path: `${path}/${k}` });
}

function entwicklungRefs(ent) {
  const out = [];
  ent.tags.forEach((t, i) => out.push({ kind: 'tag', value: t, path: `/tags/${i}` }));
  ent.origin.practiceTags.forEach((t, i) => out.push({ kind: 'tag', value: t, path: `/origin/practiceTags/${i}` }));
  bagRefs(ent.cost.resources, '/cost/resources', out);
  if (ent.prerequisites.if) conditionRefs(ent.prerequisites.if, '/prerequisites/if', out);
  for (const slot of ['effects', 'price', 'onAcquire']) eachPrimitive(ent[slot], `/${slot}`, (p, path) => primitiveRefs(p, path, out));
  const s = ent.spec;
  if (ent.kind === 'einheit') {
    bagRefs(s.recruitCost, '/spec/recruitCost', out);
    bagRefs(s.upkeep, '/spec/upkeep', out);
    s.tags.forEach((t, i) => out.push({ kind: 'tag', value: t, path: `/spec/tags/${i}` }, { kind: 'unitTagDef', value: t, path: `/spec/tags/${i}` }));
  }
  if (ent.kind === 'bauwerk') {
    s.terrains.forEach((t, i) => out.push({ kind: 'terrain', value: t, path: `/spec/terrains/${i}` }));
    bagRefs(s.buildCost, '/spec/buildCost', out);
    bagRefs(s.upkeep, '/spec/upkeep', out);
  }
  if (ent.kind === 'disziplin') {
    out.push({ kind: 'res', value: s.source, path: '/spec/source' });
    s.applications.forEach((a, i) => {
      const base = `/spec/applications/${i}`;
      out.push({ kind: 'appDef', value: a.id, path: `${base}/id` });
      bagRefs(a.cost, `${base}/cost`, out);
      a.tags.forEach((t, j) => out.push({ kind: 'tag', value: t, path: `${base}/tags/${j}` }));
      for (const [band, list] of Object.entries(a.outcomes)) eachPrimitive(list, `${base}/outcomes/${band}`, (p, path) => primitiveRefs(p, path, out));
    });
  }
  if (ent.kind === 'institution' && s.seat) {
    s.seat.favor.forEach((t, i) => out.push({ kind: 'tag', value: t, path: `/spec/seat/favor/${i}` }));
    s.seat.oppose.forEach((t, i) => out.push({ kind: 'tag', value: t, path: `/spec/seat/oppose/${i}` }));
  }
  if (ent.kind === 'lebensweise' && s.herdRules) {
    s.herdRules.pastureTerrains.forEach((t, i) => out.push({ kind: 'terrain', value: t, path: `/spec/herdRules/pastureTerrains/${i}` }));
  }
  return out;
}

// Vocabularies of the context; a kind without a vocabulary is not checked.
function vocabularies(ctx) {
  const v = {};
  if (ctx.regeln) {
    v.res = new Set(ctx.regeln.resources.map((r) => r.id));
    v.stat = new Set(ctx.regeln.stats.map((s) => s.id));
    v.season = new Set(ctx.regeln.calendar.seasons.map((s) => s.id));
    v.tag = new Set(Object.keys(ctx.regeln.vocabulary));
  }
  if (ctx.welt?.terrains) v.terrain = new Set(ctx.welt.terrains.map((t) => t.id));
  if (ctx.orders) v.order = new Set(Object.keys(ctx.orders));
  if (ctx.modules) v.module = new Set(Array.isArray(ctx.modules) ? ctx.modules : Object.keys(ctx.modules));
  const allowedTags = ctx.task?.limits?.tags;
  if (allowedTags?.length) v.tag = new Set(allowedTags.filter((t) => !v.tag || v.tag.has(t)));
  // Meters, applications and unit tags are defined by content, so they are
  // known only with a library: the core approval meter plus whatever the
  // library and the developments accepted earlier in this proposal define.
  if (ctx.library) {
    const ents = [...latestEntwicklungen(ctx.library), ...(ctx.batch ?? [])];
    v.meter = new Set([APPROVAL_METER, ...ents.flatMap((e) => meterDefs(e).map((m) => m.id))]);
    v.app = new Set(ents.flatMap((e) => (e.kind === 'disziplin' ? e.spec?.applications ?? [] : []).map((a) => a.id)));
    v.unitTag = new Set(ents.flatMap((e) => (e.kind === 'einheit' ? e.spec?.tags ?? [] : [])));
  }
  const people = peopleIds(ctx);
  if (people.size) v.people = people;
  return v;
}

/** Meter definitions of an Entwicklung's standing slots as { id, path }. */
function meterDefs(ent) {
  const out = [];
  for (const slot of ['effects', 'price']) {
    (Array.isArray(ent?.[slot]) ? ent[slot] : []).forEach((p, i) => {
      if (p?.op === 'meter') out.push({ id: p.id, path: `/${slot}/${i}/id` });
    });
  }
  return out;
}

// Ids the kernel uses as keys of plain objects (people.meters, state.peoples)
// must not name a property every object inherits, such as "constructor".
const isReserved = (id) => id in Object.prototype || id === 'prototype';
const KEYED_KINDS = new Set(['meter', 'meterDef', 'people']);

const REF_CODES = {
  res: 'unknown_resource', stat: 'unknown_tag', season: 'unknown_tag', tag: 'unknown_tag', terrain: 'unknown_tag', order: 'unknown_tag', module: 'unknown_tag',
  meter: 'dangling_ref', people: 'dangling_ref', unitTag: 'unknown_tag',
};
const REF_TEXT = {
  meter: (x) => `meter "${x}" is defined by no development`,
  people: (x) => `people "${x}" does not exist`,
  unitTag: (x) => `no unit type carries tag "${x}", the scaled flow counts nothing`,
  use: (x) => `hook use:${x} names no order type or application, it never fires`,
};

function vocabularyIssues(refs, ctx) {
  const v = vocabularies(ctx);
  // Definitions in the same object count as known.
  for (const r of refs) {
    if (r.kind === 'meterDef') v.meter?.add(r.value);
    if (r.kind === 'appDef') v.app?.add(r.value);
    if (r.kind === 'unitTagDef') v.unitTag?.add(r.value);
  }
  const out = [];
  for (const r of refs) {
    if (KEYED_KINDS.has(r.kind) && isReserved(r.value)) {
      out.push(issue('format', r.path, `"${r.value}" is a reserved name`));
      continue;
    }
    if (r.kind === 'meterDef' && r.value === APPROVAL_METER) {
      out.push(issue('conflict', r.path, `meter "${APPROVAL_METER}" is the core approval meter and cannot be redefined`));
      continue;
    }
    if (r.kind === 'use') {
      // An application id needs the library to be judged, an order type the catalogue.
      if (v.order && v.app && !v.order.has(r.value) && !v.app.has(r.value)) out.push(issue('unknown_tag', r.path, REF_TEXT.use(r.value)));
      continue;
    }
    const set = v[r.kind];
    if (set && !set.has(r.value)) out.push(issue(REF_CODES[r.kind], r.path, REF_TEXT[r.kind]?.(r.value) ?? `${r.kind} "${r.value}" is not in the world's vocabulary`));
  }
  return out;
}

// Duplicate fingerprints, cached per content object: exact ignores identity
// and prose, near compares kind, tag set and the effect skeleton without
// amounts (mechanics draft 5.2 rule 5).
// The path only files the content; the same mechanics on another path stay a duplicate.
const IDENTITY = new Set(['id', 'rev', 'name', 'summary', 'appearance', 'origin', 'pfad']);
const keyCache = new WeakMap();
function fingerprints(ent) {
  let k = keyCache.get(ent);
  if (!k) {
    const exact = hashValue(Object.fromEntries(Object.entries(ent).filter(([key]) => !IDENTITY.has(key))));
    const skeleton = (ent.effects ?? []).map((e) => canon(Object.fromEntries(Object.entries(e).filter(([key]) => key !== 'amount' && key !== 'label')))).sort();
    const near = hashValue({ kind: ent.kind, tags: [...new Set(ent.tags)].sort(), skeleton });
    k = { exact, near };
    keyCache.set(ent, k);
  }
  return k;
}

function latestEntwicklungen(library) {
  const latest = new Map();
  for (const e of library?.entries ?? []) {
    if (e.type !== 'entwicklung') continue;
    const cur = latest.get(e.data.id);
    if (!cur || cur.rev < e.data.rev) latest.set(e.data.id, e.data);
  }
  return [...latest.values()];
}

/** Sum of the practice ledger, strongest three tags (ties by tag). */
export function practiceTop(people, n = 3) {
  const sums = new Map();
  for (const row of people?.practice?.ledger ?? []) for (const [t, v] of Object.entries(row.tags)) sums.set(t, (sums.get(t) ?? 0) + v);
  return [...sums.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, n);
}

function knownEntwicklungen(people, ctx) {
  return (people?.developments?.known ?? [])
    .filter((k) => k.state === 'active')
    .map((k) => resolveRef(ctx.library, k.ref))
    .filter(Boolean);
}

/**
 * Highest tier whose people gate and world-age gate are open (TIERS gate):
 * enough known developments of the tier below, clans, settlements and
 * elapsed years (turn / seasons per year), capped by tuning.maxTier.
 */
export function openTier(people, ctx = {}) {
  if (Number.isInteger(ctx.openTier)) return ctx.openTier;
  const known = knownEntwicklungen(people, ctx);
  const seasons = ctx.regeln?.calendar?.seasons?.length || 4;
  const turn = ctx.turn ?? ctx.state?.turn ?? 0;
  const year = Math.floor(turn / seasons);
  const settlements = (ctx.state?.map?.settlements ?? []).filter((s) => s.people === people.id).length;
  const maxTier = ctx.regeln?.tuning?.maxTier ?? TIERS.length;
  let open = 1;
  for (const row of TIERS) {
    if (row.tier <= 1) continue;
    const g = row.gate;
    const below = known.filter((e) => e.tier >= row.tier - 1).length;
    if (below < g.prevTierKnown || people.population.core < g.clans || settlements < g.settlements || year < g.worldYear) break;
    open = row.tier;
  }
  return Math.min(open, maxTier);
}

function limitsOf(ctx) {
  const l = ctx.task?.limits;
  if (l) return l;
  const t = ctx.regeln?.tuning?.limits;
  return t ? { candidates: t.candidatesPerTurn, aboveTier: t.aboveTier, openPool: t.openCandidates, moduleActivations: t.moduleActivations } : null;
}

const activatesModule = (ent) => (ent.effects ?? []).some((p) => p.op === 'module.activate');

// Entwicklung

/** Prerequisite ids reachable from `start` through the library, for cycle detection. */
function reachesId(library, start, target) {
  const seen = new Set();
  const stack = [...start];
  while (stack.length) {
    const id = stack.pop();
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const e = resolveRef(library, id);
    if (e?.prerequisites) stack.push(...e.prerequisites.all, ...e.prerequisites.any);
  }
  return false;
}

function referenceIssues(ent, ctx) {
  const out = vocabularyIssues(entwicklungRefs(ent), ctx);
  if (ctx.regeln && ent.pfad !== undefined && !pathsOf(ctx).some((p) => p.id === ent.pfad)) {
    out.push(issue('dangling_ref', '/pfad', `path "${ent.pfad}" is not a path of this world`, { params: { pfad: ent.pfad } }));
  }
  const lib = ctx.library;
  if (!lib) return out;
  const prereqs = [
    ...ent.prerequisites.all.map((id, i) => [id, `/prerequisites/all/${i}`]),
    ...ent.prerequisites.any.map((id, i) => [id, `/prerequisites/any/${i}`]),
  ];
  for (const [id, path] of [...prereqs, ...ent.replaces.map((id, i) => [id, `/replaces/${i}`])]) {
    if (id !== ent.id && !resolveRef(lib, id)) out.push(issue('dangling_ref', path, `"${id}" is not in the library`));
  }
  if (reachesId(lib, prereqs.map(([id]) => id), ent.id)) out.push(issue('cycle', '/prerequisites', `a prerequisite path leads back to "${ent.id}"`));
  for (const r of entwicklungRefs(ent)) {
    if (r.kind === 'development' && !resolveRef(lib, r.value)) out.push(issue('dangling_ref', r.path, `"${r.value}" is not in the library`));
    if (r.kind === 'unitType') {
      const u = resolveRef(lib, r.value);
      if (!u || u.kind !== 'einheit') out.push(issue('dangling_ref', r.path, `"${r.value}" is not a unit type in the library`));
    }
  }

  // Revisions are sequential and immutable.
  const sameId = (lib.entries ?? []).filter((e) => e.type === 'entwicklung' && e.data.id === ent.id).map((e) => e.data);
  const stored = sameId.find((d) => d.rev === ent.rev);
  if (stored) {
    if (canon(stored) !== canon(ent)) out.push(issue('conflict', '/rev', `${refOf(ent)} already exists with other content`));
  } else {
    const latest = Math.max(0, ...sameId.map((d) => d.rev));
    if (ent.rev !== latest + 1) out.push(issue('conflict', '/rev', `revision of "${ent.id}" must be ${latest + 1}`));
  }

  const others = [...latestEntwicklungen(lib).filter((d) => d.id !== ent.id), ...(ctx.batch ?? []).filter((d) => d.id !== ent.id)];
  const name = ent.name.toLocaleLowerCase('de');
  const clash = others.find((d) => d.name.toLocaleLowerCase('de') === name);
  if (clash) out.push(issue('duplicate_name', '/name', `name "${ent.name}" is already used by "${clash.id}"`));
  const fp = fingerprints(ent);
  const twin = others.find((d) => {
    const o = fingerprints(d);
    return o.exact === fp.exact || o.near === fp.near;
  });
  if (twin) out.push(issue('duplicate', '', `same tags and effects as "${twin.id}"`, { refs: [refOf(twin)] }));
  // The kernel keeps the first definition of a meter id, so a second
  // development defining it would carry a meter that never charges.
  const owners = new Map();
  for (const d of others) for (const m of meterDefs(d)) owners.set(m.id, d.id);
  for (const m of meterDefs(ent)) {
    if (owners.has(m.id)) out.push(issue('conflict', m.path, `meter "${m.id}" is already defined by "${owners.get(m.id)}"`));
  }
  return out;
}

function tierIssues(ent, ctx) {
  const out = [];
  const lib = ctx.library;
  if (lib) {
    const ids = [...ent.prerequisites.all, ...ent.prerequisites.any];
    const higher = ids.map((id) => resolveRef(lib, id)).filter((p) => p && p.tier >= ent.tier);
    if (higher.length) out.push(issue('tier_gap', '/tier', `tier ${ent.tier} must exceed the tier of prerequisite "${higher[0].id}" (${higher[0].tier})`));
  }
  const maxTier = ctx.regeln?.tuning?.maxTier;
  if (maxTier !== undefined && ent.tier > maxTier) out.push(issue('tier_gap', '/tier', `tier ${ent.tier} exceeds the world's maxTier ${maxTier}`));
  // Tier 0 is a world's start endowment and uses the tier-1 budget row; an
  // agent candidate at tier 0 would get that row for half the research.
  if (ent.origin.source === 'agent' && ent.tier < 1) out.push(issue('tier_gap', '/tier', 'agent content starts at tier 1, tier 0 is the start endowment of a world'));
  if (ctx.people) {
    const open = openTier(ctx.people, ctx);
    if (ent.tier > open) out.push(issue('tier_gap', '/tier', `tier ${ent.tier} is above the open tier ${open} of "${ctx.people.id}"`));
    out.push(...pathGateIssues(ent, ctx, open));
  }
  return out;
}

// Path gate of a candidate (engine/core/pfade.js), judged with the known
// achievements the library resolves. Above the open tier, tier_gap has
// already said it, so pfad_tier names only the path's own limit.
function pathGateIssues(ent, ctx, open) {
  if (!ctx.regeln?.pfade) return [];
  const env = { regeln: ctx.regeln, entwicklung: (ref) => resolveRef(ctx.library, ref) };
  const pfad = pfadOf(env, ent);
  const who = ctx.people.id;
  if (!isOpen(env, ctx.people, pfad)) return [issue('pfad_closed', '/pfad', `path ${pfad} is not open for "${who}"`, { params: { pfad } })];
  const cap = Math.min(pathTier(env, ctx.people, pfad), open);
  if (ent.tier <= open && ent.tier > cap) return [issue('pfad_tier', '/tier', `tier ${ent.tier} is above tier ${cap} of path ${pfad} for "${who}"`, { params: { pfad, tier: ent.tier, cap } })];
  return [];
}

function driftIssues(ent, ctx) {
  const out = [];
  const s = ent.spec;
  const noPrice = ent.price.length === 0;
  const empty = (bag) => Object.keys(bag ?? {}).length === 0;
  if (ent.kind === 'einheit' && empty(s.upkeep)) out.push(issue('missing_upkeep', '/spec/upkeep', 'a unit needs upkeep'));
  if (ent.kind === 'bauwerk' && ent.tier >= 2 && noPrice && empty(s.upkeep)) out.push(issue('missing_upkeep', '/price', 'a building from tier 2 needs upkeep or a standing price'));
  if ((ent.kind === 'institution' || ent.kind === 'doktrin') && noPrice) out.push(issue('missing_upkeep', '/price', `a ${ent.kind} needs a standing price`));
  if (ent.kind === 'disziplin') {
    if (!ent.price.some((p) => p.op === 'meter' || p.op === 'dependency')) out.push(issue('missing_upkeep', '/price', 'a discipline needs a meter or a dependency in its price'));
    if (!s.applications.some((a) => Object.hasOwn(a.cost, s.source))) out.push(issue('missing_upkeep', '/spec/applications', `no application consumes the source "${s.source}"`));
  }
  if (ctx.people) {
    const sums = new Map();
    const addMods = (e) => (e.effects ?? []).filter((p) => p.op === 'probe.mod').forEach((p) => p.tags.forEach((t) => sums.set(t, (sums.get(t) ?? 0) + p.amount)));
    knownEntwicklungen(ctx.people, ctx).filter((e) => e.id !== ent.id).forEach(addMods);
    const before = new Map(sums);
    addMods(ent);
    for (const [t, v] of sums) {
      if (v > 3 && v !== before.get(t)) out.push(issue('stack_cap', '/effects', `probe modifiers on "${t}" would sum to ${v}, at most 3`));
    }
  }
  return out;
}

function groundingIssues(ent, ctx) {
  const people = ctx.people;
  if (!people || ent.origin.source !== 'agent') return [];
  const out = [];
  // Regelkern section 10: a breakthrough or impulse token grounds a
  // candidate; an order (institution, doctrine) only an impulse.
  const order = ent.kind === 'institution' || ent.kind === 'doktrin';
  const tokens = (people.tokens ?? []).filter((t) => t.kind === 'impulse' || (t.kind === 'breakthrough' && !order));
  const requests = people.developments?.requests ?? [];
  const o = ent.origin;
  if (o.token !== null && !(people.tokens ?? []).some((t) => t.id === o.token)) out.push(issue('dangling_ref', '/origin/token', `token "${o.token}" does not exist`));
  if (o.request !== null && !requests.some((r) => r.turn === o.request)) out.push(issue('dangling_ref', '/origin/request', `no research request of turn ${o.request}`));
  const top = (ctx.practiceTop ?? practiceTop(people)).map(([t]) => t);
  const basis = new Set([...top, ...tokens.flatMap((t) => t.tags), ...requests.flatMap((r) => r.tags)]);
  const grounded = ent.tags.some((t) => basis.has(t)) || tokens.some((t) => t.id === o.token);
  if (!grounded) out.push(issue('ungrounded', '/tags', `tags ${ent.tags.join(', ')} meet no practice tag, breakthrough token or research request of "${people.id}"`));
  return out;
}

function limitIssues(ent, ctx) {
  const limits = limitsOf(ctx);
  if (!ctx.people || !limits) return [];
  const out = [];
  const batch = ctx.batch ?? [];
  const maxKnown = Math.max(0, ...knownEntwicklungen(ctx.people, ctx).map((e) => e.tier));
  const fail = (what) => out.push(issue('limit', '', what));
  if (batch.length + 1 > limits.candidates) fail(`more than ${limits.candidates} candidates this turn`);
  if (ent.tier > maxKnown && batch.filter((e) => e.tier > maxKnown).length + 1 > limits.aboveTier) fail(`more than ${limits.aboveTier} candidates above tier ${maxKnown}`);
  if ((ctx.people.developments?.candidates?.length ?? 0) + batch.length + 1 > limits.openPool) fail(`more than ${limits.openPool} open candidates`);
  if (activatesModule(ent) && batch.filter(activatesModule).length + 1 > limits.moduleActivations) fail(`more than ${limits.moduleActivations} module activations this turn`);
  return out;
}

function allowedPrimitiveIssues(ent, ctx) {
  const allowed = ctx.task?.limits?.allowedPrimitives;
  if (!allowed?.length) return [];
  const set = new Set(allowed);
  const out = [];
  for (const slot of ['effects', 'price', 'onAcquire']) {
    eachPrimitive(ent[slot], `/${slot}`, (p, path) => {
      if (!set.has(p.op)) out.push(issue('unknown_primitive', `${path}/op`, `op "${p.op}" is not allowed by the task`));
    });
  }
  return out;
}

// Static verdict of a condition, 'never', 'always' or 'maybe', from the range
// each atom can take in any campaign: stocks and counts never below 0, meters
// -5..5, relations -3..3, no development above the world's maxTier, one
// season at a time. Only a condition no campaign can satisfy is 'never'.
function atomRange(c, ctx) {
  if (c.res !== undefined || c.tagCount !== undefined || c.controls !== undefined) return [0, Infinity];
  if (c.meter !== undefined) return [-5, 5];
  if (c.relation !== undefined) return [-3, 3];
  if (c.tierCount !== undefined) {
    const maxTier = ctx.regeln?.tuning?.maxTier;
    return [0, maxTier !== undefined && c.tierCount > maxTier ? 0 : Infinity];
  }
  return null;
}

function conditionVerdict(cond, ctx) {
  if (cond.all) {
    const seasons = new Set(cond.all.filter((c) => c.season !== undefined).map((c) => c.season));
    const vs = cond.all.map((c) => conditionVerdict(c, ctx));
    if (seasons.size > 1 || vs.includes('never')) return 'never';
    return vs.every((x) => x === 'always') ? 'always' : 'maybe';
  }
  if (cond.any) {
    const vs = cond.any.map((c) => conditionVerdict(c, ctx));
    if (vs.includes('always')) return 'always';
    return vs.every((x) => x === 'never') ? 'never' : 'maybe';
  }
  if (cond.not) {
    const x = conditionVerdict(cond.not, ctx);
    return x === 'never' ? 'always' : x === 'always' ? 'never' : 'maybe';
  }
  const range = atomRange(cond, ctx);
  if (!range) return 'maybe';
  const [lo, hi] = range;
  if (cond.cmp === 'gte') return cond.value <= lo ? 'always' : cond.value > hi ? 'never' : 'maybe';
  return cond.value > hi ? 'always' : cond.value <= lo ? 'never' : 'maybe';
}

// Constructs the kernel never acts on (content.inert): a duty, for which the
// kernel has no rule, a restriction naming neither orders nor tags, a
// condition no campaign satisfies, a winter hook in a calendar without
// winter. Counted as a price they would be free; counted as an effect they
// promise what never happens. A dependency penalty that helps is
// misplaced_effect, because the people would then seek the shortfall.
function inertIssues(list, base, ctx) {
  const out = [];
  const inert = (path, msg) => out.push(issue('content.inert', path, msg, { severity: 'error' }));
  const winter = ctx.regeln ? ctx.regeln.calendar.seasons.some((s) => s.winter) : true;
  eachPrimitive(list, base, (p, path) => {
    if (p.op === 'order.restrict' && p.mode === 'duty') inert(`${path}/mode`, 'the kernel has no rule for a duty, it is never enforced');
    else if (p.op === 'order.restrict' && !p.orders.length && !p.tags.length) inert(path, 'a restriction without orders and tags binds nothing');
    if (p.op === 'trigger' && p.on === 'winter' && !winter) inert(`${path}/on`, 'the calendar has no winter, the hook never fires');
    if (p.op === 'dependency' && sumWeights(p.penalty, ctx) > 0) out.push(issue('misplaced_effect', `${path}/penalty`, 'a dependency penalty must be a burden, a helpful one rewards the shortfall'));
    if (p.if && conditionVerdict(p.if, ctx) === 'never') inert(`${path}/if`, 'the condition can never hold');
  });
  return out;
}

/** Validates one Entwicklung; budget is null when the schema fails. */
export function validateEntwicklung(ent, ctx = {}) {
  const schema = checkSchema('entwicklung', ent);
  if (schema.length) return { ok: false, issues: schema, budget: null };
  const issues = [];
  for (const slot of ['effects', 'price', 'onAcquire']) issues.push(...inertIssues(ent[slot], `/${slot}`, ctx));
  if (ent.kind === 'disziplin') {
    ent.spec.applications.forEach((a, i) => {
      for (const [band, list] of Object.entries(a.outcomes)) issues.push(...inertIssues(list, `/spec/applications/${i}/outcomes/${band}`, ctx));
    });
  }
  if (ent.prerequisites.if && conditionVerdict(ent.prerequisites.if, ctx) === 'never') {
    issues.push(issue('content.inert', '/prerequisites/if', 'the prerequisite can never hold', { severity: 'error' }));
  }
  ent.effects.forEach((p, i) => {
    const w = primitiveWeight(p, ctx);
    if (w < 0) issues.push(issue('misplaced_effect', `/effects/${i}`, `effect "${p.op}" weighs ${w}, a burden belongs in price`));
  });
  ent.price.forEach((p, i) => {
    const w = primitiveWeight(p, ctx);
    if (w > 0) issues.push(issue('misplaced_effect', `/price/${i}`, `price "${p.op}" weighs ${w}, a benefit belongs in effects`));
  });
  issues.push(...allowedPrimitiveIssues(ent, ctx), ...referenceIssues(ent, ctx), ...tierIssues(ent, ctx));
  const budget = scoreEntwicklung(ent, ctx);
  issues.push(...budget.issues, ...driftIssues(ent, ctx), ...groundingIssues(ent, ctx), ...limitIssues(ent, ctx));
  return { ok: !hasErrors(issues), issues, budget };
}

// Event cards

/** Validates one event card against schema, vocabulary and its band. */
export function validateEreignis(ev, ctx = {}) {
  const schema = checkSchema('ereignis', ev);
  if (schema.length) return { ok: false, issues: schema, budget: null };
  const refs = ev.tags.map((t, i) => ({ kind: 'tag', value: t, path: `/tags/${i}` }));
  if (ev.if) conditionRefs(ev.if, '/if', refs);
  eachPrimitive(ev.effects, '/effects', (p, path) => primitiveRefs(p, path, refs));
  (ev.options ?? []).forEach((o, i) => eachPrimitive(o.effects, `/options/${i}/effects`, (p, path) => primitiveRefs(p, path, refs)));
  const issues = vocabularyIssues(refs, ctx);
  issues.push(...inertIssues(ev.effects, '/effects', ctx));
  (ev.options ?? []).forEach((o, i) => issues.push(...inertIssues(o.effects, `/options/${i}/effects`, ctx)));
  const budget = scoreEreignis(ev, ctx);
  issues.push(...budget.issues);
  return { ok: !hasErrors(issues), issues, budget };
}

// Bestimmung

function eachPredicate(pred, path, visit) {
  visit(pred, path);
  if (pred.pred === 'holds') eachPredicate(pred.predicate, `${path}/predicate`, visit);
}

function peopleIds(ctx) {
  return new Set([...(ctx.regeln?.peopleTemplates ?? []).map((p) => p.id), ...Object.keys(ctx.state?.peoples ?? {})]);
}

/** Validates one Bestimmung; budget is the difficulty score (null when the schema fails). */
export function validateBestimmung(b, ctx = {}) {
  const schema = checkSchema('bestimmung', b);
  if (schema.length) return { ok: false, issues: schema, budget: null };
  const refs = b.tags.map((t, i) => ({ kind: 'tag', value: t, path: `/tags/${i}` }));
  const issues = [];
  const ids = peopleIds(ctx);
  const seen = new Set();
  b.milestones.forEach((m, i) => {
    const base = `/milestones/${i}`;
    if (seen.has(m.id)) issues.push(issue('duplicate', `${base}/id`, `milestone id "${m.id}" appears twice`));
    seen.add(m.id);
    eachPredicate(m.predicate, `${base}/predicate`, (p, path) => {
      if (p.pred === 'stat.atLeast') refs.push({ kind: 'stat', value: p.key, path: `${path}/key` });
      if (p.pred === 'resource.atLeast') refs.push({ kind: 'res', value: p.key, path: `${path}/key` });
      if (p.pred === 'controls' && p.terrain) refs.push({ kind: 'terrain', value: p.terrain, path: `${path}/terrain` });
      if (p.pred === 'development.known') (p.tags ?? []).forEach((t, j) => refs.push({ kind: 'tag', value: t, path: `${path}/tags/${j}` }));
      const other = p.pred === 'relation' || p.pred === 'subjugated' ? p.people : null;
      if (!other || other === '$any' || other === '$all') return;
      if (isReserved(other)) issues.push(issue('format', `${path}/people`, `"${other}" is a reserved name`));
      else if (ids.size && !ids.has(other)) issues.push(issue('dangling_ref', `${path}/people`, `people "${other}" does not exist`));
    });
  });
  issues.push(...vocabularyIssues(refs, ctx));
  const budget = scoreBestimmung(b, ctx);
  issues.push(...budget.issues);
  return { ok: !hasErrors(issues), issues, budget };
}

// World package

// A world package's content may not yet satisfy the library's append rules,
// so validation builds a lenient lookup instead of a real library.
function packLibrary(pack) {
  const items = (key, type) => (Array.isArray(pack?.[key]?.items) ? pack[key].items : []).map((data) => ({ ref: refOf(data), type, data }));
  return { entries: [...items('entwicklungen', 'entwicklung'), ...items('ereignisse', 'ereignis'), ...items('bestimmungen', 'bestimmung')] };
}

// Developments a people can reach from the start endowment by research:
// prerequisites satisfiable and the tier gate's count of developments of
// the tier below reachable. Conditions in prerequisites.if are not decided
// statically.
function unreachable(ents, startIds, maxTier) {
  const reach = new Set(startIds);
  const byId = new Map(ents.map((e) => [e.id, e]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of byId.values()) {
      if (reach.has(e.id) || e.tier > maxTier) continue;
      const p = e.prerequisites;
      if (!p.all.every((id) => reach.has(id))) continue;
      if (p.any.length && !p.any.some((id) => reach.has(id))) continue;
      const row = TIERS.find((r) => r.tier === e.tier);
      if (row && row.tier >= 2) {
        const below = [...reach].map((id) => byId.get(id)).filter((x) => x && x.tier >= row.tier - 1).length;
        if (below < row.gate.prevTierKnown) continue;
      }
      reach.add(e.id);
      changed = true;
    }
  }
  return [...byId.values()].filter((e) => !reach.has(e.id));
}

// Order types and module ids of the kernel registry, so the vocabulary
// checks on orders, modules and use: hooks run for world packages and agent
// proposals even when the caller passes no catalogue.
let kernelCatalogue = null;
/** ctx with orders and modules from the kernel registry where the caller gave none. */
export function withCatalogue(ctx) {
  if (ctx.orders && ctx.modules) return ctx;
  kernelCatalogue ??= { orders: Object.fromEntries(Object.entries(registry()).map(([type, { origin }]) => [type, { origin }])), modules: [...MODULE_IDS] };
  return { ...ctx, orders: ctx.orders ?? kernelCatalogue.orders, modules: ctx.modules ?? kernelCatalogue.modules };
}

// regeln.pfade beyond its schema: unique ids, tags from the vocabulary, a
// fallback that names a path, unlock[0] = 0 and a world label per path.
function pathBlockIssues(regeln, labels) {
  const out = [];
  const { paths, unlock, fallback } = regeln.pfade;
  const base = '/regeln/pfade';
  const ids = new Set();
  paths.forEach((p, i) => {
    if (ids.has(p.id)) out.push(issue('duplicate', `${base}/paths/${i}/id`, `path "${p.id}" appears twice`, { params: { pfad: p.id } }));
    ids.add(p.id);
    const tags = [...p.tags.map((t, j) => [t, `${base}/paths/${i}/tags/${j}`]), ...(p.opens?.practice ?? []).map((t, j) => [t, `${base}/paths/${i}/opens/practice/${j}`])];
    for (const [t, path] of tags) if (!Object.hasOwn(regeln.vocabulary, t)) out.push(issue('unknown_tag', path, `tag "${t}" is not in the vocabulary`, { params: { tag: t } }));
    if (labels && !Object.hasOwn(labels.labels, `pfad.${p.id}`)) out.push(issue('missing_label', `/labels/labels/pfad.${p.id}`, `label "pfad.${p.id}" is missing`, { params: { key: `pfad.${p.id}` } }));
  });
  if (!ids.has(fallback)) out.push(issue('dangling_ref', `${base}/fallback`, `fallback "${fallback}" is not a path`, { params: { pfad: fallback } }));
  if (unlock[0] !== 0) out.push(issue('format', `${base}/unlock/0`, `unlock[0] must be 0, tier 1 of a path is always open, got ${unlock[0]}`, { params: { value: unlock[0] } }));
  return out;
}

const PACK_FILES = ['regeln', 'labels', 'style', 'entwicklungen', 'ereignisse', 'bestimmungen'];
const CONTENT_FILES = new Set(['entwicklungen', 'ereignisse', 'bestimmungen']);

/**
 * Validates a parsed world package { welt, regeln, labels, style,
 * entwicklungen, ereignisse, bestimmungen } (the files of welten/<id>/).
 * opts.labelKeys lists label keys the package must define (missing_label);
 * opts.destinyBand bounds Bestimmungen.
 */
export function validateWorldPackage(pack, opts = {}) {
  const issues = [];
  const welt = pack?.welt;
  if (!welt || typeof welt !== 'object') issues.push(issue('schema.required', '/welt', 'welt.json is missing'));
  else for (const k of WELT_REQUIRED_KEYS) if (!Object.hasOwn(welt, k)) issues.push(issue('schema.required', `/welt/${k}`, `welt.json lacks "${k}"`));

  const valid = {};
  for (const name of PACK_FILES) {
    const file = pack?.[name];
    if (file === undefined) {
      issues.push(issue('schema.required', `/${name}`, `${name} is missing`));
      continue;
    }
    // Content files are judged item by item below, so only their envelope
    // is checked here and a bad item does not hide the others.
    const envelope = CONTENT_FILES.has(name) && Array.isArray(file?.items) ? { ...file, items: [] } : file;
    const found = mapSchemaIssues(schemaIssues(SCHEMAS[name], envelope), envelope);
    issues.push(...prefix(`/${name}`, found));
    valid[name] = found.length === 0;
    if (welt?.id && file?.world !== undefined && file.world !== welt.id) issues.push(issue('format', `/${name}/world`, `file names world "${file.world}", the package is "${welt.id}"`));
  }

  const regeln = valid.regeln ? pack.regeln : undefined;
  const lib = packLibrary(pack);
  const ctx = withCatalogue({ regeln, welt: welt?.terrains ? welt : undefined, library: lib, destinyBand: opts.destinyBand, orders: opts.orders, modules: opts.modules });

  if (regeln) {
    const unique = (list, path, what) => {
      const seen = new Set();
      list.forEach((x, i) => {
        if (seen.has(x)) issues.push(issue('duplicate', `${path}/${i}`, `${what} "${x}" appears twice`));
        if (isReserved(x)) issues.push(issue('format', `${path}/${i}`, `${what} "${x}" is a reserved name`));
        seen.add(x);
      });
    };
    unique(regeln.resources.map((r) => r.id), '/regeln/resources', 'resource');
    unique(regeln.stats.map((s) => s.id), '/regeln/stats', 'stat');
    unique(regeln.calendar.seasons.map((s) => s.id), '/regeln/calendar/seasons', 'season');
    unique(regeln.peopleTemplates.map((t) => t.id), '/regeln/peopleTemplates', 'people');
    if (!regeln.calendar.seasons.some((s) => s.id === regeln.calendar.startSeason)) issues.push(issue('unknown_tag', '/regeln/calendar/startSeason', `season "${regeln.calendar.startSeason}" is not in the calendar`));
    const res = new Set(regeln.resources.map((r) => r.id));
    const councils = new Set(regeln.councilTemplates.map((c) => c.id));
    const profiles = new Set(regeln.aiProfiles.map((a) => a.id));
    regeln.peopleTemplates.forEach((t, i) => {
      const base = `/regeln/peopleTemplates/${i}`;
      const refCheck = (ref, path, type) => {
        const d = resolveRef(lib, ref);
        const fits = d && (type === 'bestimmung' ? Array.isArray(d.milestones) : d.format === 'realmcraft-entwicklung' && (type === 'entwicklung' || d.kind === type));
        if (!fits) issues.push(issue('dangling_ref', path, `"${ref}" is not ${type} content of this world`));
      };
      refCheck(t.lebensweise, `${base}/lebensweise`, 'lebensweise');
      t.developments.forEach((r, j) => refCheck(r, `${base}/developments/${j}`, 'entwicklung'));
      if (t.bestimmung) refCheck(t.bestimmung, `${base}/bestimmung`, 'bestimmung');
      if (!councils.has(t.council)) issues.push(issue('dangling_ref', `${base}/council`, `council template "${t.council}" does not exist`));
      if (t.agentProfile && !profiles.has(t.agentProfile)) issues.push(issue('dangling_ref', `${base}/agentProfile`, `ai profile "${t.agentProfile}" does not exist`));
      for (const k of Object.keys(t.resources)) if (!res.has(k)) issues.push(issue('unknown_resource', `${base}/resources/${k}`, `resource "${k}" is not in the world`));
    });
    for (const [mod, roles] of Object.entries(regeln.moduleBindings)) {
      for (const [role, key] of Object.entries(roles)) if (!res.has(key)) issues.push(issue('unknown_resource', `/regeln/moduleBindings/${mod}/${role}`, `resource "${key}" is not in the world`));
    }
    if (regeln.pfade) issues.push(...pathBlockIssues(regeln, valid.labels ? pack.labels : null));
  }

  if (valid.labels) {
    for (const key of opts.labelKeys ?? []) {
      if (!Object.hasOwn(pack.labels.labels, key)) issues.push(issue('missing_label', `/labels/labels/${key}`, `label "${key}" is missing`));
    }
  }

  const ents = [];
  (Array.isArray(pack?.entwicklungen?.items) ? pack.entwicklungen.items : []).forEach((e, i) => {
    const r = validateEntwicklung(e, ctx);
    issues.push(...prefix(`/entwicklungen/items/${i}`, r.issues));
    // Reachability needs only id, tier and prerequisites; an item failing its
    // schema elsewhere stays in the graph, so one error does not cascade into
    // unreachable findings for everything that builds on it.
    const p = e?.prerequisites;
    if (typeof e?.id === 'string' && Number.isInteger(e.tier) && Number.isInteger(e.rev) && Array.isArray(p?.all) && Array.isArray(p?.any)) ents.push(e);
  });
  (Array.isArray(pack?.ereignisse?.items) ? pack.ereignisse.items : []).forEach((e, i) => issues.push(...prefix(`/ereignisse/items/${i}`, validateEreignis(e, ctx).issues)));
  (Array.isArray(pack?.bestimmungen?.items) ? pack.bestimmungen.items : []).forEach((b, i) => issues.push(...prefix(`/bestimmungen/items/${i}`, validateBestimmung(b, ctx).issues)));

  if (regeln) {
    const start = regeln.peopleTemplates.flatMap((t) => [t.lebensweise, ...t.developments]).map((r) => r.split('@')[0]);
    const latest = new Map();
    for (const e of ents) if (!latest.has(e.id) || latest.get(e.id).rev < e.rev) latest.set(e.id, e);
    for (const e of unreachable([...latest.values()], start, regeln.tuning.maxTier)) {
      const i = pack.entwicklungen.items.indexOf(e);
      issues.push(issue('content.unreachable', `/entwicklungen/items/${i}`, `"${e.id}" cannot be reached from any start endowment`, { severity: 'error' }));
    }
  }
  return issues;
}

// Proposals

// Net weight a judge's direct correction may move, Agentenvertrag (item table).
export const CORRECTION_NET = Object.freeze({ min: -2, max: 2 });

function budgetLine(b, tierField = 'tier') {
  if (!b) return null;
  return { effect: b.effect, price: b.price, net: b.net, tier: b[tierField] };
}

const tagRefs = (list, path) => list.map((t, j) => ({ kind: 'tag', value: t, path: `${path}/${j}` }));

/**
 * Checks of one state-changing item beyond the proposal schema, which has
 * already passed. `run` holds the per-proposal counters and the Entwicklungen
 * accepted so far; `people` is the people the item acts on, `owner` the
 * people id of the proposal (orders must be its own).
 */
function checkStateItem(item, base, ctx, { people, owner, run }) {
  const issues = [];
  switch (item.type) {
    case 'entwicklung': {
      const r = validateEntwicklung(item.data, { ...ctx, people, batch: run.batch });
      if (!hasErrors(r.issues)) run.batch.push(item.data);
      return { issues: prefix(`${base}/data`, r.issues), budget: budgetLine(r.budget) };
    }
    case 'bestimmung':
      return { issues: prefix(`${base}/data`, validateBestimmung(item.data, { ...ctx, people }).issues), budget: null };
    case 'event': {
      const r = validateEreignis(item.data, ctx);
      issues.push(...prefix(`${base}/data`, r.issues));
      if (++run.events > MAX_EVENTS_PER_PROPOSAL) issues.push(issue('limit', base, `more than ${MAX_EVENTS_PER_PROPOSAL} events in one proposal`));
      return { issues, budget: budgetLine(r.budget, 'band') };
    }
    case 'feature': {
      if (++run.features > MAX_FEATURES_PER_PROPOSAL) issues.push(issue('limit', base, `more than ${MAX_FEATURES_PER_PROPOSAL} feature in one proposal`));
      const keys = ctx.welt?.resources ? new Set(ctx.welt.resources.map((r) => r.key)) : null;
      if (keys) {
        item.data.resources.forEach((r, j) => {
          if (!keys.has(r.key)) issues.push(issue('unknown_resource', `${base}/data/resources/${j}/key`, `deposit "${r.key}" is not in welt.json`));
        });
      }
      return { issues, budget: null };
    }
    case 'person':
    case 'goal': {
      const goal = item.type === 'person' ? item.data.goal : item.goal;
      const gbase = item.type === 'person' ? `${base}/data/goal` : `${base}/goal`;
      issues.push(...vocabularyIssues([...tagRefs(goal.favor, `${gbase}/favor`), ...tagRefs(goal.oppose, `${gbase}/oppose`)], { regeln: ctx.regeln }));
      if (item.type === 'goal' && people && !people.council.some((m) => m.id === item.member)) issues.push(issue('dangling_ref', `${base}/member`, `"${item.member}" is not a council member of "${people.id}"`));
      return { issues, budget: null };
    }
    case 'orders': {
      // The orders themselves are judged by the kernel preview; here the
      // owner and the draft invariants. An AI draft is for the coming turn,
      // so the turn is not compared.
      const d = item.data;
      if (d.people !== owner) issues.push(issue('target', `${base}/data/people`, `orders for "${d.people}" in a proposal for "${owner}"`));
      issues.push(...prefix(`${base}/data`, draftInvariants(d, people)));
      return { issues, budget: null };
    }
    case 'effects': {
      const refs = [];
      eachPrimitive(item.effects, `${base}/effects`, (prim, path) => primitiveRefs(prim, path, refs));
      issues.push(...vocabularyIssues(refs, ctx), ...inertIssues(item.effects, `${base}/effects`, ctx));
      const allowed = ctx.task?.limits?.allowedPrimitives;
      if (allowed?.length) {
        item.effects.forEach((prim, j) => {
          if (!allowed.includes(prim.op)) issues.push(issue('unknown_primitive', `${base}/effects/${j}/op`, `op "${prim.op}" is not allowed by the task`));
        });
      }
      const ws = item.effects.map((prim) => primitiveWeight(prim, ctx));
      const effect = ws.filter((w) => w > 0).reduce((a, b) => a + b, 0);
      const price = ws.filter((w) => w < 0).reduce((a, b) => a + b, 0);
      const net = effect + price;
      if (net < CORRECTION_NET.min || net > CORRECTION_NET.max) {
        issues.push(issue('budget_net', `${base}/effects`, `a correction moves at most ${CORRECTION_NET.min}..${CORRECTION_NET.max}, these effects weigh ${net}`));
      }
      return { issues, budget: { effect, price, net, tier: 0 } };
    }
    default:
      return { issues, budget: null };
  }
}

/** Whether an item of this type changes campaign state (everything but text and images). */
export function changesState(type) {
  return !TEXT_ITEMS.has(type) && type !== 'image';
}

/**
 * Finding ids a correction may cite: the judges' findings the chronicle of
 * the state still holds (ingest files each as an "ingest.finding" entry whose
 * first ref is the finding id). Null without a chronicle.
 */
export function findingsOf(state) {
  if (!Array.isArray(state?.chronicle)) return null;
  return state.chronicle.filter((e) => e.kind === 'ingest.finding' && e.refs?.length).map((e) => e.refs[0]);
}

/**
 * Validates an agent proposal against the campaign (ctx.state) and the task
 * it answers (ctx.task). Returns { ok, hash, duplicate, issues, items } with
 * one verdict per item; envelope issues reject every item. A proposal whose
 * id was already ingested with the same hash is a duplicate and validates
 * no items, the kernel files it without effect. ctx.findings may list the
 * finding ids of the judge's earlier proposals for corrections to cite,
 * otherwise they come from the state's chronicle. With ctx.requireTask a
 * proposal without ctx.task has every state-changing item rejected
 * (content.no_task); ingest passes it, so only a proposal that answers a
 * task changes the campaign.
 */
export function validateProposal(proposal, ctx = {}) {
  ctx = withCatalogue(ctx);
  let hash = null;
  try {
    hash = hashValue(proposal);
  } catch {
    // A value canon cannot represent (non-finite number) is caught by the schema below.
  }
  const all = schemaIssues(SCHEMAS.proposal, proposal);
  const n = Array.isArray(proposal?.items) ? proposal.items.length : 0;
  const itemIssues = Array.from({ length: n }, () => []);
  const envelope = [];
  for (const i of all) {
    const m = /^\/items\/(\d+)(\/|$)/.exec(i.path);
    if (m && Number(m[1]) < n) itemIssues[Number(m[1])].push(i);
    else envelope.push(i);
  }

  const state = ctx.state;
  const task = ctx.task;
  const p = proposal ?? {};
  const stale = (path, msg) => envelope.push(issue('stale', path, msg));
  if (state?.campaign && p.campaign !== state.campaign.id) stale('/campaign', `proposal for campaign "${p.campaign}", this is "${state.campaign.id}"`);
  const turn = task?.turn ?? state?.turn;
  if (turn !== undefined && p.turn !== turn) stale('/turn', `proposal for turn ${p.turn}, the campaign is at turn ${turn}`);
  if (task) {
    if (p.agent !== task.agent) stale('/agent', `task was given to "${task.agent}"`);
    if (p.proposalId !== task.respondAs.proposalId) stale('/proposalId', `task expects proposal "${task.respondAs.proposalId}"`);
    if (p.people !== task.people) stale('/people', `task is for people ${JSON.stringify(task.people)}`);
  }
  const ingested = state?.ingested?.[p.proposalId];
  if (ingested !== undefined && hash !== null) {
    if (ingested === hash) return { ok: true, hash, duplicate: true, issues: [], items: [] };
    envelope.push(issue('conflict', '/proposalId', `proposal "${p.proposalId}" was already ingested with other content`));
  }
  const expectRev = task?.rev ?? state?.rev;
  const revStale = expectRev !== undefined && p.basedOnRev !== expectRev;

  if (hasErrors(envelope)) {
    return { ok: false, hash, duplicate: false, issues: envelope, items: itemIssues.map((_, index) => ({ index, verdict: 'rejected', issues: [], budget: null })) };
  }

  const allowed = new Set(ITEMS_BY_AGENT[p.agent] ?? []);
  const taskItems = task?.limits?.items ? new Set(task.limits.items) : null;
  const peopleById = (id) => (id ? state?.peoples?.[id] ?? (ctx.people?.id === id ? ctx.people : undefined) : undefined);
  const owner = peopleById(p.people);
  const run = { batch: [], events: 0, features: 0 };
  const known = ctx.findings ?? findingsOf(state);
  const findings = new Set([...(known ?? []), ...p.items.filter((i) => i?.type === 'finding').map((i) => i.id)]);

  const items = p.items.map((item, index) => {
    const base = `/items/${index}`;
    const done = (issues, budget = null) => ({ index, verdict: hasErrors(issues) ? 'rejected' : 'accepted', issues, budget });
    // The schema already flags a non-object item; every check below reads its fields.
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return done(hasErrors(itemIssues[index]) ? itemIssues[index] : [issue('format', base, 'an item must be an object')]);
    }
    if (!allowed.has(item.type) || (taskItems && !taskItems.has(item.type))) {
      return done([issue('content.item_not_allowed', `${base}/type`, `agent "${p.agent}" may not send "${item.type}" items`, { severity: 'error' })]);
    }
    if (ctx.requireTask && !task && changesState(item.type)) {
      return done([issue('content.no_task', `${base}/type`, `no task of agent "${p.agent}" for ${p.people ? `"${p.people}"` : 'the world'} admits a "${item.type}" item`, { severity: 'error' })]);
    }
    const stalled = revStale && !TEXT_ITEMS.has(item.type) ? [issue('stale', '/basedOnRev', `based on revision ${p.basedOnRev}, the task is at ${expectRev}`)] : [];
    const own = itemIssues[index];

    if (TEXT_ITEMS.has(item.type)) {
      return done(own.map((i) => (i.code === 'schema.additional' ? issue('narrative_values', i.path, `text items carry no values: ${i.message}`) : i)));
    }
    // Entwicklungen and Bestimmungen repeat their schema in their own
    // validator, which also maps a wrong op to the agent-facing code.
    const selfChecked = (item.type === 'entwicklung' || item.type === 'bestimmung') && item.data && typeof item.data === 'object';
    if (!selfChecked && hasErrors(own)) return done([...stalled, ...own]);

    if (item.type === 'correction') {
      const issues = [...stalled];
      if (known && !findings.has(item.finding)) issues.push(issue('dangling_ref', `${base}/finding`, `finding "${item.finding}" is unknown`));
      // Ingest applies a correction to item.people, else to the proposal's
      // people, so the candidate checks must judge it against the same one.
      const targetId = item.people ?? p.people;
      const target = peopleById(targetId);
      if (targetId && state?.peoples && !target) issues.push(issue('dangling_ref', `${base}/people`, `people "${targetId}" does not exist`));
      const r = checkStateItem(item.item, `${base}/item`, ctx, { people: target, owner: targetId, run });
      return done([...issues, ...r.issues], r.budget);
    }
    const r = checkStateItem(item, base, ctx, { people: owner, owner: p.people, run });
    return done([...stalled, ...r.issues], r.budget);
  });
  return { ok: items.every((i) => i.verdict === 'accepted'), hash, duplicate: false, issues: envelope, items };
}

/**
 * Checks a task the kernel wrote: schema, and respondAs.path naming the same
 * proposal id as respondAs.proposalId (task.js).
 */
export function validateTask(task) {
  const issues = schemaIssues(SCHEMAS.task, task);
  if (issues.length) return { ok: false, issues };
  const expected = `agents/proposals/${task.respondAs.proposalId}.json`;
  if (task.respondAs.path !== expected) issues.push(issue('format', '/respondAs/path', `path must be ${expected}`));
  return { ok: issues.length === 0, issues };
}

// Drafts and campaign state

const sumValues = (m) => Object.values(m ?? {}).reduce((a, b) => a + b, 0);

function labourIssue(path, assign, core) {
  const sum = sumValues(assign);
  return sum > core ? [issue('labour', path, `${sum} clans assigned, the people has ${core}`)] : [];
}

// Invariants of a schema-valid draft (draft.js): the side maps name orders of
// this draft, a leader sits on the council, labour fits the clans.
function draftInvariants(d, people) {
  const out = [];
  const ids = new Set(d.orders.map((o) => o.id));
  for (const field of ['venture', 'lead', 'mandate']) {
    for (const k of Object.keys(d[field] ?? {})) if (!ids.has(k)) out.push(issue('dangling_ref', `/${field}/${k}`, `"${k}" is not an order of this draft`));
  }
  if (people) {
    const council = new Set(people.council.map((m) => m.id));
    for (const [k, member] of Object.entries(d.lead ?? {})) if (!council.has(member)) out.push(issue('dangling_ref', `/lead/${k}`, `"${member}" is not a council member of "${people.id}"`));
    out.push(...labourIssue('/assign', d.assign, people.population.core));
  }
  return out;
}

/**
 * Validates a draft (drafts/<peopleId>.json) against ctx.state: schema,
 * staleness by turn only (draft.js), the people exists, and the invariants
 * above. Returns { ok, issues }.
 */
export function validateDraft(draft, ctx = {}) {
  const schema = schemaIssues(SCHEMAS.draft, draft);
  if (schema.length) return { ok: false, issues: schema };
  const issues = [];
  const state = ctx.state;
  if (state && draft.turn !== state.turn) issues.push(issue('stale', '/turn', `draft for turn ${draft.turn}, the campaign is at turn ${state.turn}`));
  const people = ctx.people?.id === draft.people ? ctx.people : state?.peoples?.[draft.people];
  if (state?.peoples && !people) issues.push(issue('dangling_ref', '/people', `people "${draft.people}" does not exist`));
  issues.push(...draftInvariants(draft, people));
  return { ok: !hasErrors(issues), issues };
}

/**
 * Validates a campaign state: schema plus what it cannot express. status is
 * "ended" exactly when result is set, a winner is a people, no people id is
 * "all" (reserved by visibleTo), people ids match their keys, and the labour
 * of the turn fits each people's clans. Returns { ok, issues }.
 */
export function validateCampaign(state) {
  const schema = schemaIssues(SCHEMAS.campaign, state);
  if (schema.length) return { ok: false, issues: schema };
  const issues = [];
  const ended = state.status === 'ended';
  const result = state.result ?? null;
  if (ended !== (result !== null)) issues.push(issue('format', '/result', ended ? 'an ended campaign needs a result' : 'a campaign still playing carries no result'));
  if (result?.winner && !Object.hasOwn(state.peoples, result.winner)) issues.push(issue('dangling_ref', '/result/winner', `winner "${result.winner}" is not a people`));
  for (const [k, p] of Object.entries(state.peoples)) {
    const path = `/peoples/${k}`;
    if (k === 'all') issues.push(issue('format', path, 'people id "all" is reserved for visibleTo'));
    if (p.id !== k) issues.push(issue('format', `${path}/id`, `people "${p.id}" is stored under "${k}"`));
    if (p.population) issues.push(...labourIssue(`${path}/population/assigned`, p.population.assigned, p.population.core));
  }
  return { ok: !hasErrors(issues), issues };
}

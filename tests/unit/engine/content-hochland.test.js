// The Hochland world package: every file passes its schema and the world
// validator, the prerequisite graph is a DAG reachable from the start
// endowments, every label key the content implies exists, and every
// Entwicklung, event card and Bestimmung fits its power budget.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { SCHEMAS, AGENTS, PHASES, KINDS, LIFE_STAGES, BANDS } from '../../../engine/schemas/index.js';
import { validate } from '../../../engine/content/schema.js';
import { scoreEntwicklung, scoreEreignis, scoreBestimmung } from '../../../engine/content/budget.js';
import { kernelLabelKeys, validateWorldPackage } from '../../../engine/content/validate.js';
import { pfadOf } from '../../../engine/core/pfade.js';
import { registry } from '../../../engine/core/orders.js';
import { loyaltyBand } from '../../../engine/core/council.js';

const DIR = fileURLToPath(new URL('../../../welten/hochland/', import.meta.url));
const load = (file) => JSON.parse(readFileSync(join(DIR, file), 'utf8'));

const FILES = {
  regeln: 'regeln.json',
  labels: 'labels.json',
  style: 'style.json',
  entwicklungen: 'content/entwicklungen.json',
  ereignisse: 'content/ereignisse.json',
  bestimmungen: 'content/bestimmungen.json',
};
const pack = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, load(f)]));
pack.welt = load('welt.json');

const regeln = pack.regeln;
const ents = pack.entwicklungen.items;
const byId = new Map(ents.map((e) => [e.id, e]));
const byRef = new Map(ents.map((e) => [`${e.id}@${e.rev}`, e]));
const ctx = { regeln, resolve: (ref) => byRef.get(ref) };
const labels = pack.labels.labels;

for (const [name, file] of Object.entries(FILES)) {
  test(`${file} passes the ${name} schema`, () => {
    assert.deepEqual(validate(SCHEMAS[name], pack[name]), []);
  });
}

test('the world validator finds no issue in the package', () => {
  assert.deepEqual(validateWorldPackage(pack, { labelKeys: kernelLabelKeys() }).map(({ code, path, message }) => `${code} ${path} ${message}`), []);
});

test('prerequisites name existing developments and respect the tier rule', () => {
  for (const e of ents) {
    for (const id of [...e.prerequisites.all, ...e.prerequisites.any, ...e.replaces]) {
      assert.ok(byId.has(id), `${e.id} names unknown "${id}"`);
    }
    for (const id of [...e.prerequisites.all, ...e.prerequisites.any]) {
      assert.ok(e.tier >= byId.get(id).tier + 1, `${e.id} (tier ${e.tier}) needs ${id} (tier ${byId.get(id).tier})`);
    }
  }
});

test('the prerequisite graph is acyclic', () => {
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 'done') return;
    assert.notEqual(state.get(id), 'open', `cycle through ${[...trail, id].join(' > ')}`);
    state.set(id, 'open');
    const p = byId.get(id).prerequisites;
    for (const next of [...p.all, ...p.any]) visit(next, [...trail, id]);
    state.set(id, 'done');
  };
  for (const e of ents) visit(e.id, []);
});

test('every development is reachable from the start endowments through its prerequisites', () => {
  const reach = new Set(regeln.peopleTemplates.flatMap((t) => [t.lebensweise, ...t.developments]).map((r) => r.split('@')[0]));
  const roots = ents.filter((e) => e.prerequisites.all.length === 0 && e.prerequisites.any.length === 0).map((e) => e.id);
  for (const id of roots) reach.add(id);
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of ents) {
      if (reach.has(e.id)) continue;
      const p = e.prerequisites;
      if (p.all.every((id) => reach.has(id)) && (p.any.length === 0 || p.any.some((id) => reach.has(id)))) {
        reach.add(e.id);
        grew = true;
      }
    }
  }
  assert.deepEqual(ents.map((e) => e.id).filter((id) => !reach.has(id)), []);
});

test('start endowments and lifestyles refer to developments of the package', () => {
  for (const t of regeln.peopleTemplates) {
    assert.ok(byRef.has(t.lebensweise) && byRef.get(t.lebensweise).kind === 'lebensweise', `${t.id} lebensweise`);
    assert.ok(t.developments.includes(t.lebensweise), `${t.id} knows its lebensweise`);
    for (const r of t.developments) assert.ok(byRef.has(r), `${t.id} starts with unknown ${r}`);
  }
});

// Every label key the content implies: core views, phases, agents, probe
// bands, the order types of the kernel and the council's loyalty bands, plus
// whatever the package itself names (resources, stats, seasons,
// tags, roles, meters, statuses, orders, modules, kinds, tiers, peoples,
// settlement kinds). Probe bands keep their schema id with "_" as "-",
// because label keys allow no underscore.
function impliedLabelKeys() {
  const keys = new Set();
  const add = (prefix, ids) => { for (const id of ids) keys.add(`${prefix}.${String(id).replaceAll('_', '-')}`); };
  add('view', ['karte', 'lage', 'rat', 'entwicklungen', 'bestimmung', 'voelker', 'chronik', 'weltgeschehen', 'lebensweise']);
  add('phase', PHASES);
  add('agent', AGENTS);
  add('band', BANDS);
  add('eventband', [1, 2, 3, 4, 5]);
  add('lifestage', LIFE_STAGES);
  add('resource', regeln.resources.map((r) => r.id));
  add('stat', regeln.stats.map((s) => s.id));
  add('season', regeln.calendar.seasons.map((s) => s.id));
  add('tag', Object.keys(regeln.vocabulary));
  add('people', regeln.peopleTemplates.map((t) => t.id));
  add('role', regeln.councilTemplates.flatMap((c) => c.members.map((m) => m.role)));
  add('kind', KINDS);
  // The board falls back to the raw id when a label is missing, so only this test notices one.
  add('order', Object.keys(registry()));
  add('loyalty', Array.from({ length: 21 }, (_, i) => loyaltyBand(i - 10)));

  const modules = new Set(Object.keys(regeln.moduleBindings));
  regeln.resources.filter((r) => r.module).forEach((r) => modules.add(r.module));
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    if (node.op === 'module.activate') modules.add(node.module);
    if (node.op === 'order.unlock') add('order', [node.order]);
    if (node.op === 'order.restrict') add('order', node.orders);
    if (node.op === 'meter') add('meter', [node.id]);
    if (node.op === 'meter.delta') add('meter', [node.meter]);
    if (node.op === 'status.add') add('status', [node.id]);
    if (node.op === 'council.seat') add('role', [node.role]);
    for (const v of Object.values(node)) walk(v);
  };
  walk(ents);
  walk(pack.ereignisse.items);
  for (const e of ents) {
    add('tier', [e.tier]);
    if (e.kind === 'institution' && e.spec.seat) add('role', [e.spec.seat.role]);
  }
  add('view', modules);
  add('module', modules);
  for (const b of pack.bestimmungen.items) {
    for (const m of b.milestones) {
      const p = m.predicate.pred === 'holds' ? m.predicate.predicate : m.predicate;
      if (p.pred === 'settlement') add('settlement', [p.kind]);
    }
  }
  return [...keys].sort();
}

test('every label key the content implies has a text', () => {
  assert.deepEqual(impliedLabelKeys().filter((k) => !Object.hasOwn(labels, k)), []);
});

test('labels are short UI labels without sentences or middle dots', () => {
  for (const [k, v] of Object.entries(labels)) {
    assert.ok(!v.includes('·'), `${k} contains a middle dot`);
    // Templates with a {placeholder} are event card lines: one short sentence, not a label.
    if (/\{\w+\}/.test(v)) {
      assert.ok(v.length <= 100, `${k} is too long for a card line`);
      continue;
    }
    // issue.* texts are refusal reasons beside an order and may run a little longer than a label.
    assert.ok(v.length <= (k.startsWith('issue.') ? 50 : 40), `${k} is too long for a label`);
    assert.ok(!/[.:;!?]$/.test(v), `${k} reads like a sentence`);
  }
});

test('every tag the content uses is in the vocabulary', () => {
  const vocab = new Set(Object.keys(regeln.vocabulary));
  const used = new Set();
  const walk = (node, key) => {
    if (Array.isArray(node)) {
      if (['tags', 'favor', 'oppose', 'scopeTags', 'practiceTags', 'unitTags'].includes(key)) node.forEach((t) => used.add(t));
      else node.forEach((x) => walk(x));
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) walk(v, k);
  };
  walk([ents, pack.ereignisse.items, pack.bestimmungen.items, regeln.councilTemplates]);
  for (const t of regeln.peopleTemplates) used.add(t.identity.wesensart.plus.tag).add(t.identity.wesensart.minus.tag);
  for (const p of regeln.aiProfiles) Object.keys(p.weights).forEach((t) => used.add(t));
  assert.deepEqual([...used].filter((t) => !vocab.has(t)).sort(), []);
});

// Budget pinned per development as [effect, price, net]; research = net x (tier + 1).
const BUDGET = {
  nomadisch: [3, -1, 2],
  sippenrat: [3, -1, 2],
  sesshaft: [4, -3, 1],
  filzjurten: [2, -1, 1],
  saumpfad: [3, 0, 3],
  'hochweide-terrassen': [2, 0, 2],
  speertraeger: [2, 0, 2],
  rauchschau: [3, -1, 2],
  'markt-am-pass': [5, -2, 3],
  geleitrecht: [6, -4, 2],
  strassenbau: [3, -1, 2],
  steinmauer: [4, -1, 3],
  salpetersieden: [4, -2, 2],
  blutritus: [5, -3, 2],
  schuldknechtschaft: [5, -3, 2],
  bergschuetzen: [4, -1, 3],
  pulverwall: [8, -5, 3],
  bannfeuer: [8, -5, 3],
  'schwarzer-zirkel': [9, -5, 4],
  erdkeller: [3, -1, 2],
  salzlecke: [4, -2, 2],
  raeucherkammer: [3, -2, 1],
  heuwirtschaft: [4, -1, 3],
  almkaeserei: [4, -2, 2],
  gastrecht: [3, -1, 2],
  ahnenfeuer: [3, -1, 2],
  sippenbund: [3, -1, 2],
  landfrieden: [6, -2, 4],
  wachtfeuer: [4, -1, 3],
  fluchtburg: [3, 0, 3],
  koehlerei: [2, 0, 2],
  steinbruch: [3, 0, 3],
  rennofen: [6, -3, 3],
  kerbholz: [3, 0, 3],
  spaeher: [3, 0, 3],
  sternkunde: [3, 0, 3],
  sagenhalle: [6, -2, 4],
  kraeuterkunde: [3, 0, 3],
  wetterzauber: [3, -1, 2],
};

test('every development passes scoreEntwicklung with the pinned budget', () => {
  assert.deepEqual(ents.map((e) => e.id).sort(), Object.keys(BUDGET).sort());
  for (const e of ents) {
    const s = scoreEntwicklung(e, ctx);
    assert.deepEqual(s.issues, [], e.id);
    assert.deepEqual([s.effect, s.price, s.net], BUDGET[e.id], e.id);
    assert.equal(e.cost.research, s.research, e.id);
  }
});

test('Pulverwall and Bannfeuer fill the same role at the same cost with different prices', () => {
  const pulver = byId.get('pulverwall');
  const bann = byId.get('bannfeuer');
  const sp = scoreEntwicklung(pulver, ctx);
  const sb = scoreEntwicklung(bann, ctx);
  assert.equal(pulver.tier, bann.tier);
  assert.deepEqual(pulver.cost, bann.cost);
  assert.equal(sp.effect, sb.effect);
  assert.equal(sp.net, sb.net);
  assert.notDeepEqual(pulver.price, bann.price);
  assert.notEqual(pulver.kind, bann.kind);
});

// A new game finds something on every path before agents add more, and a
// path that holds a higher tier holds enough of the tier below to unlock it.
test('every path has seed achievements on its low tiers and enough to unlock its higher ones', () => {
  const { unlock, paths } = regeln.pfade;
  const env = { regeln, entwicklung: (ref) => byRef.get(ref) ?? byId.get(ref) };
  for (const { id } of paths) {
    const tiers = ents.filter((e) => e.tier >= 1 && pfadOf(env, e) === id).map((e) => e.tier);
    const atLeast = (k) => tiers.filter((t) => t >= k).length;
    assert.ok(tiers.filter((t) => t === 1).length >= unlock[1], `${id}: tier 1`);
    assert.ok(tiers.includes(2), `${id}: tier 2`);
    for (let k = 2; k <= Math.max(...tiers); k++) assert.ok(atLeast(k - 1) >= unlock[k - 1], `${id}: tier ${k} is reachable`);
  }
});

test('the two lifestyles replace each other in one direction only', () => {
  assert.deepEqual(byId.get('sesshaft').replaces, ['nomadisch']);
  assert.deepEqual(byId.get('nomadisch').replaces, []);
});

test('every event card fits its band, every option included', () => {
  for (const ev of pack.ereignisse.items) {
    const s = scoreEreignis(ev, ctx);
    assert.deepEqual(s.issues, [], ev.id);
  }
  const bands = new Set(pack.ereignisse.items.map((e) => e.band));
  assert.deepEqual([...bands].sort(), [1, 2, 3, 4, 5]);
});

// Difficulty band of this package for destinies at adoption, measured from the
// people template. regeln.json has no destiny band yet; this is the
// working band until the balance simulation sets one.
const DESTINY_BAND = { min: 28, max: 38 };
const PLAYER_ALTERNATIVES = ['herr-der-paesse', 'uneinnehmbare-feste', 'herrschaft-der-schauenden', 'hegemonie', 'bund-der-taeler'];

function templatePeople(t) {
  return { id: t.id, population: t.population, resources: t.resources, developments: { known: t.developments.map((ref) => ({ ref, state: 'active' })) } };
}

test('destinies have comparable difficulty for the peoples that hold or may adopt them', () => {
  const destinies = new Map(pack.bestimmungen.items.map((b) => [b.id, b]));
  const pairs = regeln.peopleTemplates.map((t) => [t, t.bestimmung.split('@')[0]]);
  const player = regeln.peopleTemplates.find((t) => t.id === 'bergnomaden');
  for (const id of PLAYER_ALTERNATIVES) pairs.push([player, id]);
  assert.deepEqual([...destinies.keys()].sort(), [...new Set(pairs.map(([, id]) => id))].sort());
  for (const [t, id] of pairs) {
    const s = scoreBestimmung(destinies.get(id), { ...ctx, people: templatePeople(t), destinyBand: DESTINY_BAND });
    assert.deepEqual(s.issues, [], `${id} for ${t.id}`);
  }
});

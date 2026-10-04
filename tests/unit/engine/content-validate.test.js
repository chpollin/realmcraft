// Content validator outside the corpus: a minimal world package, proposal
// envelopes on the shared fixtures, and browser portability of the content
// modules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changesState, findingsOf, openTier, validateBestimmung, validateCampaign, validateEntwicklung, validateEreignis, validateProposal, validateTask, validateWorldPackage, withCatalogue } from '../../../engine/content/validate.js';
import { libraryFrom } from '../../../engine/content/library.js';
import { hashValue } from '../../../engine/core/hash.js';

const DIR = fileURLToPath(new URL('../../fixtures/engine/', import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
const corpus = load('corpus/manifest.json').context;
const at = (issues) => issues.map((i) => [i.code, i.path]);

// A world package built from the corpus context plus a way of life, so the
// people templates start from real content of the package.
function minimalPack() {
  const head = (format) => ({ format, version: 1, world: 'korpus' });
  const wanderhirten = {
    format: 'realmcraft-entwicklung', version: 1, id: 'wanderhirten', rev: 1, kind: 'lebensweise', tier: 0,
    name: 'Wanderhirten', summary: 'Die Sippen ziehen mit den Herden.', appearance: '', tags: ['herde', 'zug'],
    prerequisites: { all: [], any: [], if: null }, cost: { research: 2, resources: {} },
    effects: [{ op: 'stat.mod', stat: 'mobilitaet', amount: 1 }],
    price: [{ op: 'resource.flow', res: 'nahrung', amount: -1, when: ['winter'] }],
    onAcquire: [], replaces: [],
    spec: { settlement: 'camp', migrates: true, consumption: { winter: 1 }, herdRules: { pastureTerrains: ['alm'], growth: 1, winterLoss: 1 } },
    origin: { source: 'world', practiceTags: [], token: null, request: null, proposal: null },
  };
  const regeln = structuredClone(corpus.regeln);
  for (const t of regeln.peopleTemplates) t.lebensweise = 'wanderhirten@1';
  return {
    welt: { id: 'korpus', name: 'Korpus', version: '0.1.0', generation: {}, terrains: corpus.welt.terrains, resources: corpus.welt.resources, start: {}, names: {} },
    regeln,
    labels: { ...head('realmcraft-labels'), locale: 'de', labels: { 'view.lage': 'Lage', 'view.rat': 'Rat' } },
    style: { ...head('realmcraft-style'), image: { base: 'Aquarell', negative: '' }, imageTypes: {}, accents: {} },
    entwicklungen: { ...head('realmcraft-entwicklungen'), items: [wanderhirten, ...structuredClone(corpus.library)] },
    ereignisse: { ...head('realmcraft-ereignisse'), items: [{ id: 'duerre', rev: 1, name: 'Dürre', text: 'Kein Regen.', band: 2, tags: ['winter'], if: null, effects: [{ op: 'resource.delta', res: 'nahrung', amount: -2 }], options: null }] },
    bestimmungen: { ...head('realmcraft-bestimmungen'), items: [load('bestimmung-ueberdauern.json')] },
  };
}

test('a minimal world package validates without issues', () => {
  assert.deepEqual(validateWorldPackage(minimalPack(), { labelKeys: ['view.lage', 'view.rat'] }), []);
  // World content is judged against an empty people: Überdauern then needs
  // 41 points (four clans from zero), outside the corpus band.
  assert.deepEqual(at(validateWorldPackage(minimalPack(), { destinyBand: corpus.destinyBand })), [['content.destiny_band', '/bestimmungen/items/0']]);
});

test('world package: missing welt key, missing label, foreign file, broken template', () => {
  const pack = minimalPack();
  delete pack.welt.names;
  pack.style.world = 'anderswo';
  pack.regeln.peopleTemplates[1].developments.push('fehlt@1');
  pack.regeln.peopleTemplates[1].lebensweise = 'filzjurten@1';
  assert.deepEqual(at(validateWorldPackage(pack, { labelKeys: ['view.lage', 'view.karte'] })), [
    ['schema.required', '/welt/names'],
    ['format', '/style/world'],
    ['dangling_ref', '/regeln/peopleTemplates/1/lebensweise'],
    ['dangling_ref', '/regeln/peopleTemplates/1/developments/2'],
    ['missing_label', '/labels/labels/view.karte'],
  ]);
});

test('world package: prerequisite cycle and unreachable development', () => {
  const pack = minimalPack();
  const items = pack.entwicklungen.items;
  const salz = items.find((e) => e.id === 'salzpfad');
  salz.prerequisites.all = ['erzschmelze'];
  salz.tier = 3;
  salz.cost.research = 4;
  const base = items.find((e) => e.id === 'erzschmelze');
  items.push({ ...structuredClone(base), id: 'stahlguss', name: 'Stahlguss', tier: 3, tags: ['erz', 'krieg'], prerequisites: { all: ['erzschmelze'], any: [], if: null }, cost: { research: 8, resources: {} },
    effects: [{ op: 'stat.mod', stat: 'verteidigung', amount: 2 }], price: [{ op: 'resource.flow', res: 'erz', amount: -1 }] });
  pack.regeln.peopleTemplates.forEach((t) => { t.developments = t.developments.filter((r) => r !== 'salzpfad@1'); });
  const codes = at(validateWorldPackage(pack));
  const salzAt = `/entwicklungen/items/${items.indexOf(salz)}`;
  assert.ok(codes.some(([c, p]) => c === 'cycle' && p === `${salzAt}/prerequisites`), JSON.stringify(codes));
  assert.ok(codes.some(([c, p]) => c === 'content.unreachable' && p === salzAt));
  assert.ok(codes.some(([c, p]) => c === 'content.unreachable' && p === `/entwicklungen/items/${items.length - 1}`), 'tier 3 without three reachable tier-2 developments');
});

test('a bad content item is reported without hiding the others', () => {
  const pack = minimalPack();
  pack.entwicklungen.items[1].effects.push({ op: 'resource.steal', res: 'nahrung', amount: 1 });
  pack.entwicklungen.items[2].price = [];
  const codes = at(validateWorldPackage(pack));
  assert.ok(codes.some(([c, p]) => c === 'unknown_primitive' && p === '/entwicklungen/items/1/effects/2/op'));
  assert.ok(codes.some(([c, p]) => c === 'budget_net' && p === '/entwicklungen/items/2'));
});

test('world package: orders against the kernel catalogue, reserved ids', () => {
  const pack = minimalPack();
  const salz = pack.entwicklungen.items.find((e) => e.id === 'salzpfad');
  const at0 = `/entwicklungen/items/${pack.entwicklungen.items.indexOf(salz)}`;
  salz.effects.push({ op: 'order.unlock', order: 'gibt.esnicht' });
  pack.regeln.resources[0].id = 'constructor';
  pack.regeln.peopleTemplates[1].id = 'constructor';
  const codes = at(validateWorldPackage(pack));
  assert.ok(codes.some(([c, p]) => c === 'unknown_tag' && p === `${at0}/effects/${salz.effects.length - 1}/order`), 'the kernel registry knows no order gibt.esnicht');
  assert.ok(codes.some(([c, p]) => c === 'format' && p === '/regeln/resources/0'));
  assert.ok(codes.some(([c, p]) => c === 'format' && p === '/regeln/peopleTemplates/1'));
});

test('proposal helpers: state-changing items, findings from the chronicle', () => {
  assert.deepEqual(['entwicklung', 'event', 'correction', 'narrative', 'finding', 'image'].map(changesState), [true, true, true, false, false, false]);
  assert.equal(findingsOf({}), null, 'no chronicle, no check');
  assert.deepEqual(findingsOf({ chronicle: [{ kind: 'ingest.finding', refs: ['f-1', 'T3-e2'] }, { kind: 'ingest.correction', refs: ['p', 'f-2'] }] }), ['f-1']);
  const ctx = withCatalogue({});
  assert.ok(Object.hasOwn(ctx.orders, 'explore') && ctx.modules.includes('handel'));
  assert.equal(withCatalogue({ orders: {}, modules: [] }).orders.explore, undefined, 'a caller catalogue wins');
});

test('open tier follows the gates of TIERS for the corpus people', () => {
  const library = libraryFrom(corpus.library);
  const ctx = { regeln: corpus.regeln, library, state: corpus.state };
  assert.equal(openTier(corpus.people, ctx), 2);
  assert.equal(openTier(corpus.people, { ...ctx, state: { ...corpus.state, turn: 7 } }), 1, 'world year 1 keeps tier 2 closed');
  assert.equal(openTier({ ...corpus.people, population: { core: 3, growth: 0 } }, ctx), 1, 'four clans needed');
});

test('proposal fixtures: a valid research proposal and a narrative carrying a value', () => {
  const research = validateProposal(load('proposal-research.json'), {});
  assert.equal(research.ok, true);
  assert.equal(research.hash, hashValue(load('proposal-research.json')));
  assert.deepEqual(research.items.map((i) => [i.verdict, i.budget]), [['accepted', { effect: 2, price: -1, net: 1, tier: 1 }]]);
  const narrative = validateProposal(load('proposal-invalid-narrative-value.json'), {});
  assert.deepEqual(narrative.items.map((i) => [i.verdict, at(i.issues)]), [['rejected', [['narrative_values', '/items/0/amount']]]]);
});

test('proposal envelope: duplicate ingest, conflict and stale revision', () => {
  const campaign = load('campaign-turn0.json');
  const feature = load('proposal-world-feature.json');
  const ctx = { state: campaign };
  const dup = validateProposal(feature, ctx);
  assert.equal(dup.duplicate, true, 'the campaign fixture already ingested this exact proposal');
  const changed = { ...feature, items: [{ ...feature.items[0], data: { ...feature.items[0].data, name: 'Erzader am Grat' } }] };
  const conflict = validateProposal(changed, ctx);
  assert.deepEqual(at(conflict.issues), [['conflict', '/proposalId']]);
  assert.deepEqual(conflict.items.map((i) => i.verdict), ['rejected']);
  const stale = validateProposal({ ...load('proposal-research.json'), campaign: campaign.campaign.id, basedOnRev: 0 }, ctx);
  // The fixture people has an empty practice ledger, so the candidate is also ungrounded.
  assert.deepEqual(stale.items.map((i) => [i.verdict, i.issues.map((x) => x.code)]), [['rejected', ['stale', 'ungrounded']]]);
});

test('validateEntwicklung reports the budget even when other stages fail', () => {
  const r = validateEntwicklung({ ...load('entwicklung/filzjurten.json'), tags: ['zug', 'unbekannt'] }, { regeln: corpus.regeln });
  assert.deepEqual(at(r.issues), [['unknown_tag', '/tags/1']]);
  assert.equal(r.budget.net, 1);
});

test('validateCampaign accepts the kernel slices people.modules.kern and state.modules.kern', () => {
  const state = load('campaign-midgame.json');
  const people = Object.values(state.peoples)[0];
  people.modules.kern = {
    flags: { 'ritus~blutritus': true }, seats: [{ role: 'pfadmeister', favor: ['wege'], oppose: ['mauern'], since: 3 }],
    honored: {}, served: {}, holds: { hochweide: 7 }, revealed: {}, pending: null, deaths: [{ member: 'garmund', turn: 3 }],
  };
  state.modules.kern = { draws: { 'kaelteeinbruch@1': { total: 1, last: { [people.id]: 0 } } } };
  assert.deepEqual(validateCampaign(state), { ok: true, issues: [] });
});

test('validateCampaign reports the labour code bare, without the content prefix', () => {
  const state = load('campaign-midgame.json');
  const p = Object.values(state.peoples)[0];
  p.population.assigned = { nahrung: p.population.core + 1 };
  const r = validateCampaign(state);
  assert.deepEqual(r.issues.map((i) => [i.code, i.severity]), [['labour', 'error']]);
});

test('content modules stay browser-safe: no node: imports', () => {
  for (const f of ['budget.js', 'validate.js', 'library.js', 'schema.js']) {
    const src = readFileSync(fileURLToPath(new URL(`../../../engine/content/${f}`, import.meta.url)), 'utf8');
    assert.doesNotMatch(src, /from\s+['"]node:/, f);
  }
});

test('judge proposals: findings and memory are text, a finding with a value is rejected', () => {
  for (const f of ['proposal-judge-coherence.json', 'proposal-judge-narrative.json', 'proposal-research-bestimmung.json']) {
    const r = validateProposal(load(f), {});
    assert.deepEqual(r.items.map((i) => [i.verdict, at(i.issues)]), r.items.map(() => ['accepted', []]), f);
  }
  const bad = validateProposal(load('proposal-invalid-finding-value.json'), {});
  assert.deepEqual(bad.items.map((i) => [i.verdict, at(i.issues)]), [['rejected', [['narrative_values', '/items/0/value']]]]);
});

test('a correction is checked like the item it wraps and bounded in net weight', () => {
  const base = load('proposal-judge-coherence.json');
  const withEffects = (effects) => ({ ...base, items: [base.items[1], { ...base.items[2], item: { type: 'effects', effects } }] });
  const ok = validateProposal(withEffects([{ op: 'resource.delta', res: 'salz', amount: 1 }]), {});
  assert.deepEqual(ok.items[1].budget, { effect: 1, price: 0, net: 1, tier: 0 });
  const heavy = validateProposal(withEffects([{ op: 'relation.delta', people: 'all', amount: -2 }]), {});
  assert.deepEqual(at(heavy.items[1].issues), [['budget_net', '/items/1/item/effects']]);
  const unknownFinding = validateProposal({ ...base, items: [base.items[2]] }, { findings: ['f-alt'] });
  assert.deepEqual(at(unknownFinding.items[0].issues), [['dangling_ref', '/items/0/finding']]);
  const wrapped = validateProposal({ ...base, items: [{ ...base.items[2], item: load('proposal-research.json').items[0] }] }, { regeln: corpus.regeln });
  assert.deepEqual(wrapped.items[0].budget, { effect: 2, price: -1, net: 1, tier: 1 }, 'a wrapped Entwicklung gets its full budget check');
});

test('validateTask: schema and respondAs path naming the proposal id', () => {
  const task = load('task-judge-balance.json');
  assert.deepEqual(validateTask(task), { ok: true, issues: [] });
  const moved = { ...task, respondAs: { ...task.respondAs, path: 'agents/proposals/judge-balance.T11.json' } };
  assert.deepEqual(at(validateTask(moved).issues), [['format', '/respondAs/path']]);
});

test('event and destiny bands come from regeln.tuning when the world sets them', () => {
  const regeln = { ...corpus.regeln, tuning: { ...corpus.regeln.tuning, eventBands: [1, 2, 3, 4, 5].map((band) => ({ band, roll: { min: 2 * band - 1, max: 2 * band }, net: { min: -1, max: 1 } })), bestimmungBand: { min: 30, max: 40 } } };
  const card = { id: 'gabe', rev: 1, name: 'Gabe', text: 'Ein Fund.', band: 5, tags: ['winter'], if: null, effects: [{ op: 'resource.delta', res: 'nahrung', amount: 2 }], options: null };
  assert.deepEqual(at(validateEreignis(card, { regeln }).issues), [['budget_net', '']]);
  const library = libraryFrom(corpus.library);
  const r = validateBestimmung(load('bestimmung-ueberdauern.json'), { regeln, library, people: corpus.people, state: corpus.state });
  assert.deepEqual(at(r.issues), [['content.destiny_band', '']], 'difficulty 29 lies below the world band 30..40');
});

test('impulse tokens ground orders, breakthroughs do not', () => {
  const library = libraryFrom(corpus.library);
  const inst = {
    format: 'realmcraft-entwicklung', version: 1, id: 'feuerrat', rev: 1, kind: 'institution', tier: 1, name: 'Feuerrat', summary: 'Hüter der Glut.', appearance: '',
    tags: ['feuer'], prerequisites: { all: [], any: [], if: null }, cost: { research: 4, resources: {} },
    effects: [{ op: 'governance.rule', rule: 'council', scopeTags: ['feuer'], scopeOrders: ['destiny.adopt'] }, { op: 'stat.mod', stat: 'wohlstand', amount: 1 }],
    price: [{ op: 'resource.flow', res: 'holz', amount: -1, when: ['winter'] }], onAcquire: [], replaces: [], spec: { seat: null },
    origin: { source: 'agent', practiceTags: [], token: null, request: null, proposal: null },
  };
  const ctx = { regeln: corpus.regeln, library, people: corpus.people, state: corpus.state };
  assert.deepEqual(at(validateEntwicklung(inst, ctx).issues), [['ungrounded', '/tags']], 'the feuer breakthrough does not ground an institution');
  const people = { ...corpus.people, tokens: [{ id: 'tok-t8-2', kind: 'impulse', tags: ['feuer'], turn: 8, source: 'T8:schar:o2' }] };
  assert.deepEqual(validateEntwicklung(inst, { ...ctx, people }).issues, []);
});

// Paths (regeln.pfade) over the corpus vocabulary; werk before krieg, so
// wachfeuer (wache, bau) falls to werk on the tie.
const PFADE = {
  paths: [
    { id: 'weide', tags: ['herde', 'weide', 'zug', 'winter', 'jagd', 'wege', 'weg'], opens: null },
    { id: 'werk', tags: ['bau', 'erz', 'schmiede', 'holz', 'salz', 'handel'], opens: null },
    { id: 'krieg', tags: ['krieg', 'gefecht', 'reiter', 'fuss', 'wache', 'befestigung', 'belagerung', 'pulver'], opens: null },
    { id: 'magie', tags: ['magie', 'geist', 'furcht', 'opfer', 'feuer'], opens: { practice: ['magie', 'geist', 'feuer'], min: 1 } },
  ],
  unlock: [0, 2, 2, 2, 2],
  fallback: 'weide',
};
const pathRegeln = () => ({ ...structuredClone(corpus.regeln), pfade: structuredClone(PFADE) });
const gate = (issues) => issues.filter((i) => i.code.startsWith('pfad_') || i.path === '/pfad').map((i) => [i.code, i.path, i.params]);
const pfadIssue = (code, path, params) => [code, path, params];

function candidate(over) {
  const base = structuredClone(corpus.library.find((e) => e.id === 'erzschmelze'));
  return { ...base, id: 'erzguss', name: 'Erzguss', origin: { source: 'agent', practiceTags: [], token: null, request: null, proposal: null }, ...over };
}

test('a candidate above the tier of its path is refused with pfad_tier, within it passes the gate', () => {
  const library = libraryFrom(corpus.library);
  const ctx = { regeln: pathRegeln(), library, people: corpus.people, state: corpus.state };
  assert.equal(openTier(corpus.people, ctx), 2);
  // Only salzpfad (tier 1) lies on werk, unlock[1] asks for two.
  assert.deepEqual(gate(validateEntwicklung(candidate({ tier: 2, tags: ['erz', 'salz'] }), ctx).issues), [pfadIssue('pfad_tier', '/tier', { pfad: 'werk', tier: 2, cap: 1 })]);
  const people = structuredClone(corpus.people);
  people.developments.known.push({ ref: 'wachfeuer@1', since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null });
  assert.deepEqual(gate(validateEntwicklung(candidate({ tier: 2, tags: ['erz', 'salz'] }), { ...ctx, people }).issues), []);
  // Above the open tier, tier_gap speaks and pfad_tier stays silent.
  const high = validateEntwicklung(candidate({ tier: 3, tags: ['erz', 'salz'] }), ctx).issues;
  assert.ok(high.some((i) => i.code === 'tier_gap'));
  assert.deepEqual(gate(high), []);
});

test('a candidate on a closed path is refused with pfad_closed until the path is open', () => {
  const library = libraryFrom(corpus.library);
  const ctx = { regeln: pathRegeln(), library, people: corpus.people, state: corpus.state };
  const magic = candidate({ tier: 1, tags: ['magie', 'geist'] });
  assert.deepEqual(gate(validateEntwicklung(magic, ctx).issues), [pfadIssue('pfad_closed', '/pfad', { pfad: 'magie' })]);
  const opened = { ...corpus.people, pfade: { opened: { magie: 8 } } };
  assert.deepEqual(gate(validateEntwicklung(magic, { ...ctx, people: opened }).issues), []);
  // An explicit pfad files the same tags on another path, and the gate follows it.
  assert.deepEqual(gate(validateEntwicklung({ ...magic, pfad: 'krieg' }, ctx).issues), []);
  // Without a people (world content) there is no gate.
  assert.deepEqual(gate(validateEntwicklung(magic, { regeln: pathRegeln(), library }).issues), []);
});

test('an unknown pfad is a dangling reference, also in a world without paths', () => {
  const library = libraryFrom(corpus.library);
  const ent = candidate({ tier: 1, tags: ['erz'], pfad: 'gibtsnicht' });
  const codes = (regeln) => validateEntwicklung(ent, { regeln, library }).issues.filter((i) => i.path === '/pfad').map((i) => i.code);
  assert.deepEqual(codes(pathRegeln()), ['dangling_ref']);
  assert.deepEqual(codes(structuredClone(corpus.regeln)), ['dangling_ref']);
  assert.deepEqual(validateEntwicklung({ ...ent, pfad: 'werk' }, { regeln: pathRegeln(), library }).issues.filter((i) => i.path === '/pfad'), []);
});

const PATH_LABELS = Object.fromEntries(PFADE.paths.map((p) => [`pfad.${p.id}`, p.id]));

test('world package: a pfade block with labels for every path validates', () => {
  const pack = minimalPack();
  pack.regeln.pfade = structuredClone(PFADE);
  Object.assign(pack.labels.labels, PATH_LABELS);
  assert.deepEqual(validateWorldPackage(pack, { labelKeys: ['view.lage', 'view.rat'] }), []);
});

test('world package: duplicate path, unknown tags, dangling fallback, unlock[0] and a missing label', () => {
  const pack = minimalPack();
  pack.regeln.pfade = structuredClone(PFADE);
  Object.assign(pack.labels.labels, PATH_LABELS);
  pack.regeln.pfade.paths[2].id = 'werk';
  pack.regeln.pfade.paths[0].tags.push('gibtsnicht');
  pack.regeln.pfade.paths[3].opens.practice.push('zauber');
  pack.regeln.pfade.fallback = 'wald';
  pack.regeln.pfade.unlock[0] = 1;
  assert.deepEqual(at(validateWorldPackage(pack)), [
    ['unknown_tag', '/regeln/pfade/paths/0/tags/7'],
    ['duplicate', '/regeln/pfade/paths/2/id'],
    ['unknown_tag', '/regeln/pfade/paths/3/opens/practice/3'],
    ['dangling_ref', '/regeln/pfade/fallback'],
    ['format', '/regeln/pfade/unlock/0'],
  ]);
  const unlabelled = minimalPack();
  unlabelled.regeln.pfade = structuredClone(PFADE);
  Object.assign(unlabelled.labels.labels, PATH_LABELS);
  delete unlabelled.labels.labels['pfad.krieg'];
  assert.deepEqual(at(validateWorldPackage(unlabelled)), [['missing_label', '/labels/labels/pfad.krieg']]);
});

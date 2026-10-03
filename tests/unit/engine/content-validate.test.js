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

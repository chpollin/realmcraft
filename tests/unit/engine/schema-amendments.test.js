// Contract amendment of docs/Vertragsaenderungen.md: each amended rule has one
// check here that goes red when the schema loses it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  SCHEMAS, AGENTS, JUDGES, BANDS, SUCCESS_BANDS, TOKEN_KINDS, ITEM_TYPES, ITEMS_BY_AGENT, PATTERNS, APPROVAL_METER,
} from '../../../engine/schemas/index.js';
import { validate } from '../../../engine/content/schema.js';

const DIR = fileURLToPath(new URL('../../fixtures/engine/', import.meta.url));
const WORLD = fileURLToPath(new URL('../../../welten/hochland/', import.meta.url));
const load = (file) => JSON.parse(readFileSync(join(DIR, file), 'utf8'));
const codes = (schema, value) => validate(SCHEMAS[schema], value).map(({ code, path }) => `${code} ${path}`);
const ok = (schema, value) => assert.deepEqual(codes(schema, value), []);
const bad = (schema, value) => assert.notDeepEqual(codes(schema, value), []);

const midgame = load('campaign-midgame.json');
const draftMid = load('draft-midgame.json');

// One valid item per type, taken from the fixtures where one exists.
const SAMPLE_ITEMS = (() => {
  const items = [
    ...load('proposal-research.json').items,
    ...load('proposal-world-feature.json').items,
    ...load('proposal-judge-coherence.json').items,
    ...load('proposal-judge-narrative.json').items,
    ...load('proposal-research-bestimmung.json').items,
  ];
  const byType = Object.fromEntries(items.map((i) => [i.type, i]));
  return {
    ...byType,
    event: { type: 'event', data: { id: 'steinschlag', rev: 1, name: 'Steinschlag', text: 'Ein Hang gibt nach.', band: 2, tags: ['gefahr'], if: null, effects: [{ op: 'resource.delta', res: 'material', amount: -1 }], options: null } },
    narrative: { type: 'narrative', refs: ['T11-e91'], text: 'Der Talbund zählt fünf Täler.' },
    voice: { type: 'voice', member: 'ortwin', refs: [], text: 'Der Vogt mahnt zur Geduld.' },
    stance: { type: 'stance', refs: [], text: 'Der Schädelklan wartet ab.' },
    person: { type: 'person', seat: 'seat-1', data: { id: 'hadmar', name: 'Hadmar', role: 'vogt', goal: { text: 'Ordnung', favor: [], oppose: [] }, age: 40, lifeStage: 'ruestig', appearance: '' } },
    goal: { type: 'goal', member: 'ortwin', goal: { text: 'Sichere Pässe', favor: ['weg'], oppose: [] } },
    orders: { type: 'orders', data: draftMid },
    image: { type: 'image', ref: 'hegemonie@1', path: 'narrative/images/hegemonie@1.png' },
  };
})();

test('every item type has a sample and every agent id names only known item types', () => {
  assert.deepEqual(Object.keys(SAMPLE_ITEMS).sort(), [...ITEM_TYPES].sort());
  assert.deepEqual(Object.keys(ITEMS_BY_AGENT).sort(), [...AGENTS].sort());
  for (const types of Object.values(ITEMS_BY_AGENT)) for (const t of types) assert.ok(ITEM_TYPES.includes(t), t);
  for (const j of JUDGES) assert.deepEqual(ITEMS_BY_AGENT[j].slice(0, 2), ['finding', 'correction'], j);
  assert.ok(ITEMS_BY_AGENT['judge-narrative'].includes('memory'));
  assert.ok(ITEMS_BY_AGENT.research.includes('bestimmung'));
});

for (const agent of AGENTS) {
  for (const people of [null, 'talbund']) {
    test(`a task for ${agent}${people ? ` and ${people}` : ''} and the proposal answering it are both valid`, () => {
      const proposalId = people ? `${agent}.${people}.T12` : `${agent}.T12`;
      const task = {
        ...load('task-judge-balance.json'),
        agent,
        people,
        respondAs: { proposalId, path: `agents/proposals/${proposalId}.json` },
        limits: { ...load('task-judge-balance.json').limits, items: [...ITEMS_BY_AGENT[agent]] },
      };
      ok('task', task);
      const proposal = {
        format: 'realmcraft-proposal', version: 1, proposalId, agent, campaign: 'hochland-mitte', turn: 12, basedOnRev: 37, people,
        items: ITEMS_BY_AGENT[agent].map((t) => SAMPLE_ITEMS[t]),
      };
      ok('proposal', proposal);
      assert.equal(task.respondAs.path, `agents/proposals/${proposal.proposalId}.json`);
    });
  }
}

test('proposal ids need literal dots and an upper-case T; the answer path follows the id', () => {
  const re = new RegExp(PATTERNS.proposal, 'u');
  for (const id of ['research.talbund.T12', 'world.T0', 'judge-coherence.T7', 'judge-balance.esk.T3']) assert.ok(re.test(id), id);
  for (const id of ['researchxtalbundxT12', 'world-T0', 'research.talbund.t12', 'Research.T1', 'research.talbund.T012']) assert.ok(!re.test(id), id);
  const task = load('task-judge-balance.json');
  bad('task', { ...task, respondAs: { ...task.respondAs, path: 'agents/proposals/judge-balance.t12.json' } });
  bad('task', { ...task, respondAs: { ...task.respondAs, path: 'agents/proposals/judge-balance.T12xjson' } });
});

test('one band list serves probes and application outcomes', () => {
  assert.deepEqual([...BANDS], ['crit_fail', 'setback', 'failure', 'narrow', 'success', 'crit_success']);
  for (const b of SUCCESS_BANDS) assert.ok(BANDS.includes(b));
  const outcomes = SCHEMAS.entwicklung.$defs.application.properties.outcomes;
  assert.deepEqual(Object.keys(outcomes.properties).sort(), [...BANDS].sort());
  assert.deepEqual([...outcomes.required].sort(), [...BANDS].sort());
});

test('a draft carries assign, choices, venture and lead, and never an order named "event"', () => {
  ok('draft', draftMid);
  ok('draft', load('draft-pending-roll.json'));
  bad('draft', { ...draftMid, venture: { o1: false } });
  bad('draft', { ...draftMid, assign: { nahrung: 100 } });
  bad('draft', { ...draftMid, lead: { event: 'ortwin' } });
  assert.deepEqual(codes('draft', load('draft-invalid-reserved-order-id.json')), ['schema.pattern /orders/0/id']);
  // The world-event roll keeps its probe id; only orders may not take the subject.
  assert.ok(new RegExp(PATTERNS.probe, 'u').test('T12:talbund:event'));
});

test('the campaign state carries draws, choices, result, contact, impulse, labour and approval', () => {
  ok('campaign', midgame);
  ok('campaign', load('campaign-turn0.json'));
  const ended = structuredClone(midgame);
  ended.status = 'ended';
  ended.result = { winner: 'talbund', kind: 'victory', turn: 15, reason: 'Hegemonie erfüllt' };
  ok('campaign', ended);
  ended.result = { winner: null, kind: 'collapse', turn: 15, reason: 'Die letzte Sippe ist fort' };
  ok('campaign', ended);
  ended.result.kind = 'draw';
  bad('campaign', ended);
  assert.deepEqual([...TOKEN_KINDS], ['breakthrough', 'impulse', 'crisis', 'grievance']);
  const noApproval = structuredClone(midgame);
  delete noApproval.peoples.talbund.meters[APPROVAL_METER];
  assert.deepEqual(codes('campaign', noApproval), ['schema.required /peoples/talbund/meters/zustimmung']);
  const contact = structuredClone(midgame);
  contact.relations['bergnomaden|talbund'].contact = 2;
  bad('campaign', contact);
  const caps = structuredClone(midgame);
  caps.derived.talbund.caps.nahrung = -1;
  bad('campaign', caps);
});

test('a log entry names its audience as people ids or ["all"], never both', () => {
  const entry = midgame.chronicle.find((e) => e.visibleTo.length);
  for (const visibleTo of [['all'], [], ['talbund', 'bergnomaden']]) ok('event', { ...entry, visibleTo });
  for (const visibleTo of [['all', 'talbund'], ['all', 'all'], 'all']) bad('event', { ...entry, visibleTo });
  const { visibleTo: _v, step: _s, ...legacy } = entry;
  ok('event', legacy);
});

test('regeln.tuning accepts exactly the documented kernel constants', () => {
  const regeln = JSON.parse(readFileSync(join(WORLD, 'regeln.json'), 'utf8'));
  const tuning = {
    ...regeln.tuning,
    spoilage: 2,
    loyaltyDecay: 1,
    machtprobeCap: 2,
    bestimmungBand: { min: 12, max: 20 },
    eventBands: [[1, 2, -6, -2], [3, 4, -3, 0], [5, 6, -2, 2], [7, 8, 0, 3], [9, 10, 2, 6]]
      .map(([lo, hi, nmin, nmax], i) => ({ band: i + 1, roll: { min: lo, max: hi }, net: { min: nmin, max: nmax } })),
    terrainRules: { gebirge: { defense: 2, yieldFactor: { winter: { nahrung: 0 } } }, wald: { defense: 1 } },
    knowledgeSpend: 2,
    approval: { min: -5, max: 5, start: 0 },
    featureYield: { eisenerz: { res: 'erz', amount: 1 } },
  };
  ok('regeln', { ...regeln, tuning });
  bad('regeln', { ...regeln, tuning: { ...tuning, perGroup: 2 } });
  bad('regeln', { ...regeln, tuning: { ...tuning, eventBands: tuning.eventBands.slice(1) } });
});

test('style accents are token names, not colours', () => {
  const style = JSON.parse(readFileSync(join(WORLD, 'style.json'), 'utf8'));
  ok('style', { ...style, accents: { primary: 'ochre', warn: 'rust-dark' } });
  bad('style', { ...style, accents: { primary: '#aa5522' } });
});

test('event cards take optional repeat control', () => {
  const card = SAMPLE_ITEMS.event.data;
  ok('ereignis', card);
  ok('ereignis', { ...card, once: true, cooldown: 4, maxPerCampaign: 2 });
  bad('ereignis', { ...card, cooldown: -1 });
  bad('ereignis', { ...card, maxPerCampaign: 0 });
});

test('governance.rule can scope order types beside order tags', () => {
  const base = load('entwicklung/filzjurten.json');
  const rule = { op: 'governance.rule', rule: 'council', scopeTags: ['befohlen'], scopeOrders: ['destiny.adopt', 'trade.cancel'] };
  ok('entwicklung', { ...base, effects: [...base.effects, rule] });
  bad('entwicklung', { ...base, effects: [...base.effects, { ...rule, scopeOrders: ['Destiny'] }] });
});

test('the view keeps the own people whole and strips foreign peoples', () => {
  const view = load('view-talbund.json');
  ok('view', view);
  const leaky = structuredClone(view);
  leaky.peoples.bergnomaden.meters = { zustimmung: 0 };
  bad('view', leaky);
  const revealed = structuredClone(view);
  revealed.peoples.bergnomaden.resources = { salz: 4 };
  ok('view', revealed);
  for (const key of ['rng', 'eventPool', 'ingested', 'rulesVersion']) bad('view', { ...view, [key]: midgame[key] });
});

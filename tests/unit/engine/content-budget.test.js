// Power budget: the manifest's hand-computed budgets, the weight rules where
// WEIGHTS leaves a choice (rounding, season factor, scale, breadth, meter
// severity), event bands and destiny difficulty.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { primitiveWeight, scoreBestimmung, scoreEntwicklung, scoreEreignis } from '../../../engine/content/budget.js';
import { libraryFrom } from '../../../engine/content/library.js';

const DIR = fileURLToPath(new URL('../../fixtures/engine/', import.meta.url));
const load = (f) => JSON.parse(readFileSync(join(DIR, f), 'utf8'));
const manifest = load('manifest.json').fixtures;
const corpus = load('corpus/manifest.json').context;
const ctx = { regeln: corpus.regeln };

for (const { file, budget } of manifest.filter((m) => m.budget)) {
  test(`${file} scores the manifest budget`, () => {
    const r = scoreEntwicklung(load(file), ctx);
    assert.deepEqual(
      { effect: r.effect, price: r.price, net: r.net, tier: r.tier, research: r.research, issues: r.issues.map((i) => i.code) },
      budget,
    );
  });
}

test('Pulverwall and Bannfeuer reach the same net with different price kinds', () => {
  const pulver = scoreEntwicklung(load('entwicklung/pulverwall.json'), ctx);
  const bann = scoreEntwicklung(load('entwicklung/bannfeuer.json'), ctx);
  assert.equal(pulver.net, bann.net);
  assert.ok(pulver.ok && bann.ok);
  const kinds = (r) => r.lines.filter((l) => l.side === 'price').map((l) => l.op).sort();
  assert.deepEqual(kinds(pulver), ['relation.delta', 'resource.flow']);
  assert.deepEqual(kinds(bann), ['meter', 'order.restrict', 'relation.delta']);
});

test('flow weight follows season count, resource value and scale', () => {
  const w = (p) => primitiveWeight({ op: 'resource.flow', res: 'nahrung', amount: 1, ...p }, ctx);
  assert.equal(w({}), 3);
  assert.equal(w({ when: ['fruehling', 'sommer', 'herbst', 'winter'] }), 3);
  assert.equal(w({ when: ['sommer', 'herbst', 'winter'] }), 2);
  assert.equal(w({ when: ['sommer', 'herbst'] }), 2);
  assert.equal(w({ when: ['winter'] }), 1);
  assert.equal(w({ res: 'herden' }), 6);
  assert.equal(w({ res: 'unbekannt' }), 3, 'unknown resources count with v = 1');
  // expected population 6 per step 4 = 1.5, so 3 x 1.5 = 4.5 rounds up for a benefit ...
  assert.equal(w({ scale: { per: 'population', step: 4 } }), 5);
  // ... and towards zero for a burden.
  assert.equal(w({ amount: -1, scale: { per: 'population', step: 4 } }), -4);
  assert.equal(w({ scale: { per: 'settlements', step: 4 } }), 3, 'a scale below 1 counts as 1');
});

test('tag breadth, stock caps, unit upkeep and signless ops', () => {
  assert.equal(primitiveWeight({ op: 'probe.mod', tags: ['zug'], amount: 2 }, ctx), 2);
  assert.equal(primitiveWeight({ op: 'probe.mod', tags: ['zug', 'krieg'], amount: 1 }, ctx), 2);
  assert.equal(primitiveWeight({ op: 'probe.mod', tags: ['alles'], amount: 1 }, ctx), 2, 'breadth 3 is priced as broad');
  assert.equal(primitiveWeight({ op: 'stock.cap', res: 'nahrung', amount: 3 }, ctx), 2);
  assert.equal(primitiveWeight({ op: 'stock.cap', res: 'nahrung', amount: -3 }, ctx), -1);
  assert.equal(primitiveWeight({ op: 'unit.mod', unitTags: ['reiter'], stat: 'upkeep', amount: 1 }, ctx), -1);
  assert.equal(primitiveWeight({ op: 'token.add', kind: 'crisis', tags: [] }, ctx), -1);
  assert.equal(primitiveWeight({ op: 'region.control', region: '$target', people: null }, ctx), -6);
  assert.equal(primitiveWeight({ op: 'status.add', id: 'lahm', effects: [{ op: 'stat.mod', stat: 'mobilitaet', amount: -1 }], duration: 2, endsOn: null }, ctx), -1);
});

test('meter severity comes from the worst threshold, cadence from the rise', () => {
  const meter = (effects, on) => ({ op: 'meter', id: 'm', min: 0, max: 5, rise: { on, amount: 1 }, decay: 0, thresholds: [{ at: 5, effects }] });
  assert.equal(primitiveWeight(meter([{ op: 'resource.delta', res: 'nahrung', amount: -2 }], 'use:x'), ctx), -1);
  assert.equal(primitiveWeight(meter([{ op: 'population.delta', amount: -1 }], 'use:x'), ctx), -2);
  assert.equal(primitiveWeight(meter([{ op: 'population.delta', amount: -2 }], 'season'), ctx), -6);
});

test('dependency and shortfall trigger count as prices', () => {
  assert.equal(primitiveWeight({ op: 'dependency', res: 'rauchkraut', amount: 1, penalty: [{ op: 'loyalty.delta', target: 'all', amount: -1 }] }, ctx), -10);
  assert.equal(primitiveWeight({ op: 'trigger', on: 'shortfall:salz', effects: [{ op: 'population.delta', amount: -1 }] }, ctx), -2);
  assert.equal(primitiveWeight({ op: 'trigger', on: 'winter', effects: [{ op: 'resource.delta', res: 'nahrung', amount: 2 }] }, ctx), 2);
});

test('unit.spawn weighs the strength of the resolved unit type', () => {
  const library = libraryFrom(corpus.library);
  assert.equal(primitiveWeight({ op: 'unit.spawn', type: 'reiterschar@1', tile: '$home' }, { ...ctx, library }), 2);
  assert.equal(primitiveWeight({ op: 'unit.spawn', type: 'reiterschar@1', tile: '$home' }, ctx), 1, 'an unresolvable type counts strength 1');
  const r = scoreEntwicklung({ ...corpus.library[0], onAcquire: [{ op: 'unit.spawn', type: 'reiterschar@1', tile: '$home' }] }, { ...ctx, library });
  assert.equal(r.lines.find((l) => l.op === 'unit.spawn').weight, 2);
});

test('research cost must equal net x (tier + 1)', () => {
  const e = { ...load('entwicklung/filzjurten.json'), cost: { research: 3, resources: {} } };
  assert.deepEqual(scoreEntwicklung(e, ctx).issues.map((i) => i.code), ['content.research_cost']);
});

test('event cards fit their band, decision cards per option', () => {
  const card = (band, effects, options = null) => ({ id: 'karte', rev: 1, name: 'Karte', text: 'Text', band, tags: ['winter'], if: null, effects, options });
  assert.equal(scoreEreignis(card(3, [{ op: 'resource.delta', res: 'nahrung', amount: 2 }]), ctx).ok, true);
  const bad = scoreEreignis(card(5, [{ op: 'resource.delta', res: 'nahrung', amount: -1 }]), ctx);
  assert.deepEqual(bad.issues.map((i) => [i.code, i.path]), [['budget_net', '']]);
  const choice = scoreEreignis(card(2, [], [
    { id: 'a', label: 'Zahlen', effects: [{ op: 'resource.delta', res: 'holz', amount: -2 }] },
    { id: 'b', label: 'Weigern', effects: [{ op: 'relation.delta', people: 'neighbours', amount: -2 }] },
  ]), ctx);
  assert.deepEqual(choice.issues.map((i) => [i.code, i.path]), [['budget_net', '/options/1']]);
});

test('destiny difficulty of the Überdauern fixture for the corpus people', () => {
  const library = libraryFrom(corpus.library);
  const r = scoreBestimmung(load('bestimmung-ueberdauern.json'), { regeln: corpus.regeln, library, people: corpus.people, state: corpus.state, destinyBand: corpus.destinyBand });
  assert.deepEqual(r.milestones, [
    { id: 'weiden', difficulty: 9 },
    { id: 'winter', difficulty: 8 },
    { id: 'pfade', difficulty: 9 },
    { id: 'wintersiedlung', difficulty: 3 },
  ]);
  assert.equal(r.difficulty, 29);
  assert.equal(r.ok, true);
});

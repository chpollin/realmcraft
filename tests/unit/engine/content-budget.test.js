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
  // A benefit counts the upper bound scaleBound 2 x expected population 6 = 12
  // per step 4 = 3, so 3 x 3 = 9 ...
  assert.equal(w({ scale: { per: 'population', step: 4 } }), 9);
  // ... a burden the expected 6 per step 4 = 1.5, 3 x 1.5 = 4.5 rounded towards zero.
  assert.equal(w({ amount: -1, scale: { per: 'population', step: 4 } }), -4);
  assert.equal(w({ amount: -1, scale: { per: 'settlements', step: 4 } }), -3, 'a scale below 1 counts as 1');
  assert.equal(w({ amount: 1, scale: { per: 'settlements', step: 3 } }), 4, 'upper bound 4 settlements per step 3, 3 x 4/3 rounds up');
});

test('a status weighs its standing effects for its share of the year', () => {
  const status = (effects, duration, endsOn = null) => primitiveWeight({ op: 'status.add', id: 's', effects, duration, endsOn }, ctx);
  const flows = ['nahrung', 'holz', 'erz'].map((res) => ({ op: 'resource.flow', res, amount: 5 }));
  assert.equal(status(flows, null), 45, 'a permanent status is its full standing weight, 3 x 15');
  assert.equal(status(flows, 8), 45, 'a status of a year or more counts the full year');
  assert.equal(status([{ op: 'stat.mod', stat: 'wohlstand', amount: 1 }], 2), 2, '3 x 2/4 = 1.5 rounds up');
  assert.equal(status([{ op: 'probe.mod', tags: ['zug'], amount: 1 }], 1), 1, 'a short narrow status keeps weight 1');
  assert.equal(status([{ op: 'stat.mod', stat: 'wohlstand', amount: -2 }], null), -6);
  assert.equal(status([{ op: 'stat.mod', stat: 'wohlstand', amount: -2 }], null, 'setback'), -1, 'a harmful status ending on setback counts one season, -6/4 towards zero');
});

test('recurring triggers count with their hook frequency', () => {
  const trig = (on, effects, extra = {}) => primitiveWeight({ op: 'trigger', on, effects, ...extra }, ctx);
  const pop = [{ op: 'population.delta', amount: 1 }];
  assert.equal(trig('season', pop), 9, 'a group every season is 3 x the flow factor 3');
  assert.equal(trig('season', [{ op: 'resource.delta', res: 'nahrung', amount: 1 }]), 3, 'as much as resource.flow +1');
  assert.equal(trig('use:explore', pop), 9, 'a benefit on a hook the people fires at will counts every season');
  assert.equal(trig('use:explore', [{ op: 'resource.delta', res: 'nahrung', amount: -2 }]), -2, 'a burden on use is a cost of use and counts once');
  assert.equal(trig('season', [{ op: 'resource.delta', res: 'nahrung', amount: -1 }]), -3);
  assert.equal(trig('season', [{ op: 'resource.delta', res: 'nahrung', amount: -1 }], { if: { season: 'winter' } }), -1, 'a burden under an if counts once');
  assert.equal(trig('contact', pop), 3, 'contact fires once');
  const noWinter = { regeln: { ...corpus.regeln, calendar: { ...corpus.regeln.calendar, seasons: corpus.regeln.calendar.seasons.map((s) => ({ ...s, winter: false })) } } };
  assert.equal(primitiveWeight({ op: 'trigger', on: 'winter', effects: [{ op: 'resource.delta', res: 'nahrung', amount: -2 }] }, noWinter), 0, 'no winter, no price');
});

test('a dependency counts only the harmful part of its penalty', () => {
  const dep = (penalty) => primitiveWeight({ op: 'dependency', res: 'rauchkraut', amount: 1, penalty }, ctx);
  assert.equal(dep([{ op: 'population.delta', amount: 3 }]), -9, 'a helpful penalty does not cancel the upkeep');
  assert.equal(dep([{ op: 'population.delta', amount: -1 }]), -12);
});

test('restrictions the kernel never charges weigh nothing', () => {
  const restrict = (extra) => primitiveWeight({ op: 'order.restrict', orders: [], tags: [], ...extra }, ctx);
  assert.equal(restrict({ mode: 'duty', orders: ['explore'] }), 0);
  assert.equal(restrict({ mode: 'forbid' }), 0);
  assert.equal(restrict({ mode: 'limit', limit: 1 }), 0);
  assert.equal(restrict({ mode: 'forbid', orders: ['explore'] }), -1);
});

test('a replaced development with negative net counts as shed burden', () => {
  const library = libraryFrom(corpus.library);
  const base = { ...corpus.library[0], id: 'ersatz', name: 'Ersatz', replaces: ['filzjurten'] };
  const plain = scoreEntwicklung(base, { ...ctx, library });
  assert.equal(plain.lines.some((l) => l.op === 'replaces'), false, 'a positive replaced development is not credited');
  const burden = { ...corpus.library[0], effects: [], price: [{ op: 'resource.flow', res: 'nahrung', amount: -1 }] };
  const r = scoreEntwicklung(base, { ...ctx, resolve: (id) => (id === 'filzjurten' ? burden : null) });
  assert.deepEqual(r.lines.filter((l) => l.op === 'replaces').map((l) => [l.path, l.weight, l.side]), [['/replaces/0', 3, 'effect']]);
  assert.equal(r.effect, plain.effect + 3);
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

test('a meter scores its thresholds by sign and reach', () => {
  const m = (thresholds, extra = {}) => primitiveWeight({ op: 'meter', id: 'm', min: 0, max: 5, rise: { on: 'use:x', amount: 1 }, decay: 0, thresholds, ...extra }, ctx);
  const pop = (amount) => [{ op: 'population.delta', amount }];
  assert.equal(m([{ at: 5, effects: pop(1) }]), 3, 'a beneficial threshold crossed once is an effect');
  assert.equal(m([{ at: 1, effects: pop(1) }], { max: 1, decay: 1 }), 6, 'a use meter with decay crosses again, x repeat 2');
  assert.equal(m([{ at: 1, effects: pop(1) }], { max: 1, decay: 1, rise: { on: 'season', amount: 1 } }), 3, 'a season meter never decays');
  assert.equal(m([{ at: 5, effects: pop(-1) }, { at: 3, effects: pop(1) }]), 1, 'gain 3 minus heavy x use 2');
  assert.equal(m([{ at: 5, effects: pop(-1) }], { max: 4 }), 0, 'a threshold above max is never reached');
  assert.equal(m([{ at: 0, effects: pop(-1) }], { rise: { on: 'season', amount: 1 } }), 0, 'a season meter never falls to a threshold at 0');
  assert.equal(m([{ at: 0, effects: pop(-1) }], { decay: 1 }), -2, 'a decaying use meter does');
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

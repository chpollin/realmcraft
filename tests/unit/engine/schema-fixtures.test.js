// Every engine fixture validates as tests/fixtures/engine/manifest.json says,
// and the manifest covers every fixture file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { SCHEMAS, TIERS, PRIMITIVES, WEIGHTS } from '../../../engine/schemas/index.js';
import { validate } from '../../../engine/content/schema.js';
import { hashValue } from '../../../engine/core/hash.js';

const DIR = fileURLToPath(new URL('../../fixtures/engine/', import.meta.url));
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')).fixtures;
const load = (file) => JSON.parse(readFileSync(join(DIR, file), 'utf8'));

function listJson(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return listJson(p);
    return e.name.endsWith('.json') && e.name !== 'manifest.json' ? [relative(DIR, p).replaceAll('\\', '/')] : [];
  });
}

test('manifest lists every fixture file exactly once', () => {
  const files = listJson(DIR).sort();
  const listed = manifest.map((m) => m.file).sort();
  assert.deepEqual(listed, files);
});

for (const entry of manifest) {
  test(`${entry.file} is ${entry.valid ? 'valid' : 'invalid'} as ${entry.schema}`, () => {
    const issues = validate(SCHEMAS[entry.schema], load(entry.file));
    if (entry.valid) assert.deepEqual(issues, []);
    else assert.deepEqual(issues.map(({ code, path }) => ({ code, path })), entry.issues);
  });
}

test('Pulverwall and Bannfeuer share effects, tier and cost but pay different prices', () => {
  const pulver = load('entwicklung/pulverwall.json');
  const bann = load('entwicklung/bannfeuer.json');
  assert.deepEqual(pulver.effects, bann.effects);
  assert.equal(pulver.tier, bann.tier);
  assert.deepEqual(pulver.cost, bann.cost);
  assert.notDeepEqual(pulver.price, bann.price);
  const budget = (f) => manifest.find((m) => m.file === f).budget;
  assert.equal(budget('entwicklung/pulverwall.json').net, budget('entwicklung/bannfeuer.json').net);
});

test('manifest budgets are arithmetically consistent with TIERS', () => {
  for (const { file, budget } of manifest.filter((m) => m.budget)) {
    const e = load(file);
    assert.equal(budget.tier, e.tier, file);
    assert.equal(budget.net, budget.effect + budget.price, file);
    assert.equal(budget.research, budget.net * (budget.tier + 1), file);
    assert.equal(e.cost.research, budget.research, file);
    const row = TIERS.find((t) => t.tier === Math.max(1, budget.tier));
    const expected = [];
    if (budget.effect > row.effectMax) expected.push('budget_effect');
    if (budget.net < row.netMin || budget.net > row.netMax) expected.push('budget_net');
    if (budget.price > row.priceMax) expected.push('budget_price');
    assert.deepEqual(budget.issues, expected, file);
  }
});

test('campaign fixture is internally consistent where the schema cannot see it', () => {
  const c = load('campaign-turn0.json');
  const ids = Object.keys(c.peoples);
  for (const [k, p] of Object.entries(c.peoples)) {
    assert.equal(p.id, k);
    assert.equal(p.council.filter((m) => m.leader).length, 1, `${k}: exactly one leader`);
  }
  assert.equal(c.peoples[c.campaign.player].controller, 'player');
  assert.equal(ids.filter((id) => c.peoples[id].controller === 'ai').length, 2);
  for (const key of Object.keys(c.relations)) {
    const [a, b] = key.split('|');
    assert.ok(a < b && ids.includes(a) && ids.includes(b), key);
  }
  for (const s of c.map.settlements) assert.ok(c.map.known[s.people][s.tile], `${s.id} lies on a known tile`);
  // The ingested hash of the world proposal is the hash of its fixture file.
  assert.equal(c.ingested['world.T0'], hashValue(load('proposal-world-feature.json')));
  const destiny = load('bestimmung-ueberdauern.json');
  const state = c.peoples.hochweide.bestimmung;
  assert.equal(state.ref, `${destiny.id}@${destiny.rev}`);
  assert.deepEqual(state.milestones.map((m) => m.id), destiny.milestones.map((m) => m.id));
});

test('mid-game fixtures hold what the acceptance tests start from', () => {
  const m = load('campaign-midgame.json');
  const tal = m.peoples.talbund;
  assert.equal(m.turn, 12);
  assert.equal(m.phase, 'planning');
  assert.equal(m.campaign.player, 'talbund');
  for (const s of m.map.settlements) assert.equal(m.map.control[s.regionId], s.people, `${s.id} lies in a region of its people`);
  assert.equal(tal.lebensweise, 'sesshaft@1');
  // Handel: the market that activates the module is known and built, and the module has its slices.
  assert.ok(tal.developments.known.some((d) => d.ref === 'markt-am-pass@1'));
  assert.ok(m.map.settlements.some((s) => s.people === 'talbund' && s.buildings.some((b) => b.ref === 'markt-am-pass@1')));
  assert.ok(m.modules.handel && tal.modules.handel);
  assert.equal(tal.units.length, 1);
  assert.equal(tal.bestimmung.milestones.length, 3);
  assert.equal(tal.bestimmung.milestones.filter((x) => x.reached).length, 2);
  assert.equal(Object.values(m.map.control).filter((p) => p === 'talbund').length, 5, 'milestone land: five regions');
  const [choice] = m.pendingChoices;
  assert.equal(choice.people, 'talbund');
  assert.ok(choice.deadline >= m.turn);
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  assert.ok(sum(tal.population.assigned) <= tal.population.core, 'labour within population');

  const d = load('draft-midgame.json');
  const orderIds = d.orders.map((o) => o.id);
  assert.equal(d.turn, m.turn);
  assert.ok(Object.keys(d.venture).every((id) => orderIds.includes(id)));
  assert.ok(Object.keys(d.lead).every((id) => orderIds.includes(id)));
  assert.ok(Object.values(d.lead).every((id) => tal.council.some((c) => c.id === id)));
  assert.equal(choice.options.includes(d.choices[choice.id]), true);
  assert.ok(sum(d.assign) <= tal.population.core);

  const v = load('view-talbund.json');
  assert.ok(v.chronicle.every((e) => e.visibleTo.includes('all') || e.visibleTo.includes('talbund')));
  assert.deepEqual(Object.keys(v.map.known), ['talbund']);
  assert.ok(Object.keys(v.relations).every((k) => k.split('|').includes('talbund')));

  const won = load('campaign-near-victory.json');
  const last = won.map.settlements.filter((s) => s.people === 'schaedelklan');
  assert.equal(last.length, 1, 'one settlement left to take');
  assert.equal(won.relations['schaedelklan|talbund'].atWar, true);
  assert.ok(won.peoples.talbund.units.some((u) => won.map.known.talbund[u.tile] === 'visible'));
  assert.equal(won.result, null);

  const lost = load('campaign-near-collapse.json');
  assert.equal(lost.peoples.talbund.population.core, 1);
  assert.equal(lost.peoples.talbund.resources.nahrung, 0);
  assert.ok(lost.peoples.talbund.shortfall.nahrung > 0);
  assert.equal(lost.result, null);

  // The report belongs to the kernel run behind the mid-game state.
  const r = load('report-T0011.json');
  assert.equal(r.turn, 11);
  assert.equal(r.revAfter > r.revBefore, true);
  assert.ok(r.events.every((e) => e.turn === 11));
});

test('every primitive op has a weight and every weight belongs to an op', () => {
  assert.deepEqual(Object.keys(WEIGHTS).sort(), Object.keys(PRIMITIVES).sort());
});

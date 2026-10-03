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

test('every primitive op has a weight and every weight belongs to an op', () => {
  assert.deepEqual(Object.keys(WEIGHTS).sort(), Object.keys(PRIMITIVES).sort());
});

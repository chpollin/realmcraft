import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, findStart, placePeoples, tileAt, neighbors, spiral, distance } from '../../engine/world/index.js';

const pack = JSON.parse(readFileSync(new URL('../../welten/hochland/welt.json', import.meta.url), 'utf8'));
const rules = pack.start;

function assertStartRequirements(world, t, minResources) {
  assert.ok(rules.terrains.includes(t.terrain), `terrain ${t.terrain}`);
  assert.ok(
    neighbors(t.q, t.r).some((n) => rules.adjacentTerrains.includes(tileAt(world, n.q, n.r).terrain)),
    'no adjacent mountain',
  );
  assert.ok(
    spiral(t, rules.waterRadius).some((h) => {
      const x = tileAt(world, h.q, h.r);
      return x.river || rules.waterTerrains.includes(x.terrain);
    }),
    'no water nearby',
  );
  const deposits = spiral(t, rules.resourceRadius).reduce((n, h) => n + tileAt(world, h.q, h.r).resources.length, 0);
  assert.ok(deposits >= minResources, `deposits ${deposits} < ${minResources}`);
}

test('start: found for 50 fixed seeds and meets every requirement', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const w = createWorld({ seed, pack });
    const t = findStart(w);
    assert.ok(t, `no start for seed ${seed}`);
    assertStartRequirements(w, t, rules.minResources);
  }
});

test('start: deterministic across fresh worlds and honours minResources', () => {
  const a = findStart(createWorld({ seed: 'nomaden', pack }));
  const b = findStart(createWorld({ seed: 'nomaden', pack }));
  assert.deepEqual(a, b);
  const w = createWorld({ seed: 'nomaden', pack });
  const rich = findStart(w, { minResources: 4 });
  assert.ok(rich, 'no start with 4 deposits');
  assertStartRequirements(w, rich, 4);
});

test('start: placePeoples keeps distance, terrain and water rules', () => {
  for (const seed of [3, 17, 'tal']) {
    const w = createWorld({ seed, pack });
    const home = findStart(w);
    const peoples = placePeoples(w, 4, 10);
    assert.equal(peoples.length, 4, `seed ${seed}`);
    const all = [home, ...peoples];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) assert.ok(distance(all[i], all[j]) >= 10);
    }
    for (const p of peoples) {
      assert.ok(rules.peopleTerrains.includes(p.terrain));
      assert.ok(spiral(p, rules.waterRadius).some((h) => {
        const x = tileAt(w, h.q, h.r);
        return x.river || rules.waterTerrains.includes(x.terrain);
      }));
    }
    assert.deepEqual(placePeoples(createWorld({ seed, pack }), 4, 10), peoples);
  }
});

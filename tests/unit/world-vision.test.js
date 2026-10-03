import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, tileAt, reveal, fade, isKnown, key, spiral, line, distance } from '../../engine/world/index.js';

const pack = JSON.parse(readFileSync(new URL('../../welten/hochland/welt.json', import.meta.url), 'utf8'));
const terrains = new Map(pack.terrains.map((t) => [t.id, t]));
const world = createWorld({ seed: 'vision-test-1', pack });
const origin = { q: 0, r: 0 };

const terrainOf = (h) => tileAt(world, h.q, h.r).terrain;
const blocks = (h) => terrains.get(terrainOf(h)).blocksSight === true;
const visibleKeys = (known) => Object.keys(known).filter((k) => known[k] === 'visible');

function findObserver(predicate, radius = 60) {
  return spiral(origin, radius).find(predicate) ?? null;
}

test('vision: reveal without world marks exactly the disc as visible and does not mutate the input', () => {
  const centre = { q: 2, r: -3 };
  const input = Object.freeze({});
  const out = reveal(input, centre, 3);
  assert.notEqual(out, input);
  assert.deepEqual(input, {});
  assert.deepEqual(new Set(Object.keys(out)), new Set(spiral(centre, 3).map((h) => key(h.q, h.r))));
  assert.ok(Object.values(out).every((v) => v === 'visible'));
});

test('vision: reveal keeps entries outside the radius and upgrades seen entries inside', () => {
  const known = Object.freeze({ '40,40': 'seen', '1,0': 'seen' });
  const out = reveal(known, origin, 2);
  assert.equal(out['40,40'], 'seen');
  assert.equal(out['1,0'], 'visible');
  assert.equal(known['1,0'], 'seen');
});

test('vision: fade turns every entry into seen and returns a new object', () => {
  const known = Object.freeze({ '0,0': 'visible', '1,0': 'visible', '5,5': 'seen' });
  const out = fade(known);
  assert.notEqual(out, known);
  assert.deepEqual(out, { '0,0': 'seen', '1,0': 'seen', '5,5': 'seen' });
  assert.equal(known['0,0'], 'visible');
  assert.deepEqual(fade({}), {});
});

test('vision: isKnown reports presence of a key, also for negative coordinates', () => {
  const known = { '0,0': 'seen', '-3,2': 'visible' };
  assert.equal(isKnown(known, 0, 0), true);
  assert.equal(isKnown(known, -3, 2), true);
  assert.equal(isKnown(known, 3, -2), false);
  assert.equal(isKnown(known, -0, 0), true);
  assert.equal(isKnown({}, 0, 0), false);
});

test('vision: observer terrain adjusts the radius by sightModifier', () => {
  const radius = 3;
  const alm = findObserver((h) => terrainOf(h) === 'alm');
  assert.ok(alm, 'no alm tile found');
  assert.equal(terrains.get('alm').sightModifier, 1);
  const out = reveal({}, alm, radius, world);
  const dists = visibleKeys(out).map((k) => {
    const [q, r] = k.split(',').map(Number);
    return distance(alm, { q, r });
  });
  assert.ok(Math.max(...dists) <= radius + 1);
  assert.ok(Math.max(...dists) === radius + 1, 'nothing visible at radius + 1');
  assert.equal(out[key(alm.q, alm.r)], 'visible');

  // The same radius from a forest tile (-1) shrinks the disc.
  const wald = findObserver((h) => terrainOf(h) === 'wald');
  assert.ok(wald, 'no wald tile found');
  const smaller = reveal({}, wald, radius, world);
  const wdists = visibleKeys(smaller).map((k) => {
    const [q, r] = k.split(',').map(Number);
    return distance(wald, { q, r });
  });
  assert.ok(Math.max(...wdists) <= radius - 1);
});

test('vision: a blocking tile hides the target behind it but is itself visible', () => {
  const radius = 5;
  let found = null;
  // Observer on non-blocking terrain, with at least one blocking tile strictly between it and the target.
  for (const observer of spiral(origin, 40)) {
    if (blocks(observer)) continue;
    const here = terrains.get(terrainOf(observer));
    const sight = radius + (here.sightModifier ?? 0);
    for (const target of spiral(observer, sight)) {
      const path = line(observer, target);
      if (path.length < 3) continue;
      const between = path.slice(1, -1);
      if (between.some(blocks)) {
        found = { observer, target, blocker: between.find(blocks) };
        break;
      }
    }
    if (found) break;
  }
  assert.ok(found, 'no observer with a blocking tile in line of sight found');
  const { observer, target, blocker } = found;
  const out = reveal({}, observer, radius, world);
  assert.equal(out[key(blocker.q, blocker.r)], 'visible');
  assert.equal(isKnown(out, target.q, target.r), false);

  // Without terrain the same target lies inside the plain disc and is visible.
  const plain = reveal({}, observer, radius + 3);
  assert.equal(plain[key(target.q, target.r)], 'visible');
});

test('vision: with world, a clear line still reveals tiles and never exceeds the plain disc plus modifier', () => {
  const observer = findObserver((h) => !blocks(h));
  const radius = 4;
  const out = reveal({}, observer, radius, world);
  const sight = radius + terrains.get(terrainOf(observer)).sightModifier;
  const disc = new Set(spiral(observer, sight).map((h) => key(h.q, h.r)));
  for (const k of visibleKeys(out)) assert.ok(disc.has(k));
  // Direct neighbours can only be hidden by blocking tiles in between, and there is none.
  for (const h of spiral(observer, 1)) assert.equal(out[key(h.q, h.r)], 'visible');
});

test('vision: reveal with world does not mutate its input', () => {
  const input = Object.freeze({ '99,99': 'seen' });
  const out = reveal(input, origin, 3, world);
  assert.notEqual(out, input);
  assert.deepEqual(input, { '99,99': 'seen' });
  assert.equal(out['99,99'], 'seen');
});

test('vision: from a mountain the observer looks over lower blocking tiles', () => {
  let found = null;
  for (const observer of spiral(origin, 40)) {
    if (terrainOf(observer) !== 'gebirge') continue;
    const here = tileAt(world, observer.q, observer.r);
    const sight = 3 + terrains.get('gebirge').sightModifier;
    for (const target of spiral(observer, sight)) {
      const between = line(observer, target).slice(1, -1).map((h) => tileAt(world, h.q, h.r));
      const blockers = between.filter((t) => terrains.get(t.terrain).blocksSight);
      if (blockers.length && blockers.every((t) => t.elevation <= here.elevation)) {
        found = { observer, target };
        break;
      }
    }
    if (found) break;
  }
  assert.ok(found, 'no mountain observer with a lower ridge in front found');
  const out = reveal({}, found.observer, 3, world);
  assert.equal(out[key(found.target.q, found.target.r)], 'visible');
});

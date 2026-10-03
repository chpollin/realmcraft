import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, tileAt, findPath, reachable, key, spiral, ring, distance, DIRECTIONS } from '../../engine/world/index.js';

const pack = JSON.parse(readFileSync(new URL('../../welten/hochland/welt.json', import.meta.url), 'utf8'));
const world = createWorld({ seed: 'path-test-1', pack });
const origin = { q: 0, r: 0 };
const BIG = 100000;
const RADIUS = 20;

const costByTerrain = new Map(pack.terrains.map((t) => [t.id, t.moveCost]));
const stepCost = (h) => costByTerrain.get(tileAt(world, h.q, h.r).terrain);
const isPassable = (h) => typeof stepCost(h) === 'number';

function firstTile(centre, radius, predicate) {
  return spiral(centre, radius).find((h) => predicate(h)) ?? null;
}

const start = firstTile(origin, RADIUS, isPassable);

// One passable target per ring radius, found by search, never by fixed coordinates.
const targets = [3, 6, 10, 15].map((k) => ring(start, k).find(isPassable));

test('path: setup finds a passable start and passable targets', () => {
  assert.ok(start);
  for (const t of targets) assert.ok(t);
});

test('path: findPath from a tile to itself costs 0 with a one-tile path', () => {
  assert.deepEqual(findPath(world, start, start), { path: [start], cost: 0 });
});

test('path: found path starts and ends correctly, is contiguous, passable and costs the sum of entered tiles', () => {
  for (const to of targets) {
    const result = findPath(world, start, to, { maxRadius: RADIUS * 2 });
    assert.ok(result, `no path to ${key(to.q, to.r)}`);
    const { path, cost } = result;
    assert.deepEqual(path[0], start);
    assert.deepEqual(path[path.length - 1], to);
    for (let i = 1; i < path.length; i++) assert.equal(distance(path[i - 1], path[i]), 1);
    for (const h of path) assert.ok(isPassable(h));
    assert.equal(cost, path.slice(1).reduce((sum, h) => sum + stepCost(h), 0));
  }
});

test('path: findPath cost equals the Dijkstra cost of reachable', () => {
  const opts = { maxRadius: RADIUS * 2 };
  const reach = reachable(world, start, BIG, opts);
  for (const to of targets) {
    const result = findPath(world, start, to, opts);
    assert.equal(result.cost, reach[key(to.q, to.r)]);
  }
});

test('path: findPath returns null for impassable targets', () => {
  const water = firstTile(start, 60, (h) => tileAt(world, h.q, h.r).terrain === 'see');
  const summit = firstTile(start, 60, (h) => tileAt(world, h.q, h.r).terrain === 'gipfel');
  assert.ok(water, 'no lake tile found');
  assert.ok(summit, 'no summit tile found');
  assert.equal(findPath(world, start, water, { maxRadius: 80 }), null);
  assert.equal(findPath(world, start, summit, { maxRadius: 80 }), null);
});

test('path: findPath returns null when the target lies beyond maxRadius', () => {
  const far = targets[2];
  assert.ok(distance(start, far) > 5);
  assert.equal(findPath(world, start, far, { maxRadius: 5 }), null);
  assert.ok(findPath(world, start, far, { maxRadius: 40 }));
});

test('path: a costOf that leaves only a straight corridor keeps the path inside it', () => {
  const dir = DIRECTIONS[0];
  const to = { q: start.q + dir.q * 6, r: start.r + dir.r * 6 };
  const corridor = new Set(Array.from({ length: 7 }, (_, i) => key(start.q + dir.q * i, start.r + dir.r * i)));
  const costOf = (tile) => (corridor.has(key(tile.q, tile.r)) ? 1 : Infinity);
  const result = findPath(world, start, to, { costOf, minCost: 1 });
  assert.equal(result.cost, 6);
  assert.equal(result.path.length, 7);
  for (const h of result.path) assert.ok(corridor.has(key(h.q, h.r)));
  // null and NaN mark impassable tiles just like Infinity.
  for (const blocked of [null, NaN]) {
    const alt = (tile) => (corridor.has(key(tile.q, tile.r)) ? 1 : blocked);
    assert.equal(findPath(world, start, to, { costOf: alt, minCost: 1 }).cost, 6);
  }
});

test('path: a blocked corridor yields null', () => {
  const dir = DIRECTIONS[0];
  const to = { q: start.q + dir.q * 6, r: start.r + dir.r * 6 };
  const corridor = new Set(Array.from({ length: 7 }, (_, i) => key(start.q + dir.q * i, start.r + dir.r * i)));
  const gap = key(start.q + dir.q * 3, start.r + dir.r * 3);
  const costOf = (tile) => (corridor.has(key(tile.q, tile.r)) && key(tile.q, tile.r) !== gap ? 1 : Infinity);
  assert.equal(findPath(world, start, to, { costOf, minCost: 1 }), null);
});

test('path: reachable includes the start at 0 and respects maxCost', () => {
  const maxCost = 6;
  const reach = reachable(world, start, maxCost);
  assert.equal(reach[key(start.q, start.r)], 0);
  assert.ok(Object.keys(reach).length > 1);
  for (const c of Object.values(reach)) assert.ok(c >= 0 && c <= maxCost);
});

test('path: every reachable entry matches the findPath cost and cheaper tiles are not missed', () => {
  const maxCost = 6;
  const reach = reachable(world, start, maxCost);
  for (const [k, c] of Object.entries(reach)) {
    const [q, r] = k.split(',').map(Number);
    assert.equal(findPath(world, start, { q, r }).cost, c, `cost mismatch at ${k}`);
  }
  for (const h of spiral(start, 8)) {
    if (reach[key(h.q, h.r)] !== undefined || !isPassable(h)) continue;
    const result = findPath(world, start, h);
    assert.ok(result === null || result.cost > maxCost, `${key(h.q, h.r)} missing from reachable`);
  }
});

test('path: identical queries return identical paths', () => {
  for (const to of targets) {
    assert.deepEqual(findPath(world, start, to), findPath(world, start, to));
  }
  const other = createWorld({ seed: 'path-test-1', pack });
  assert.deepEqual(findPath(other, start, targets[3]), findPath(world, start, targets[3]));
});

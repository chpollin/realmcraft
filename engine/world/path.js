// Movement over the hex map. Cost is paid for entering a tile; the start tile
// is free. Tiles are read through tileAt, so a search generates the chunks it
// touches. To route only over explored land, pass a costOf that returns
// Infinity for unknown tiles.

import { key, parseKey, neighbors, distance } from './hex.js';
import { tileAt } from './generate.js';
import { compilePack, moveCost } from './pack.js';

// Binary min-heap on (f, seq); seq makes equal-cost ties resolve in insertion
// order, so identical queries always return the identical path.
class Heap {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  less(a, b) {
    return a.f < b.f || (a.f === b.f && a.seq < b.seq);
  }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

function costFn(world, costOf) {
  if (costOf) return (tile) => costOf(tile, world);
  return (tile) => moveCost(world.pack, tile.terrain);
}

function usable(c) {
  return typeof c === 'number' && Number.isFinite(c) && c >= 0;
}

/**
 * A* from `from` to `to`. Returns { path: [{q, r}, ...] including both ends,
 * cost } or null when the target is impassable or unreachable within
 * `maxRadius` steps of `from`. `minCost` is the cheapest possible step and
 * keeps the heuristic admissible; it defaults to the pack's cheapest terrain,
 * so a custom costOf that goes below that must pass its own minCost.
 */
export function findPath(world, from, to, { costOf, maxRadius = 64, minCost } = {}) {
  const cost = costFn(world, costOf);
  const h = minCost ?? compilePack(world.pack).minMoveCost;
  const goal = key(to.q, to.r);
  const startKey = key(from.q, from.r);
  if (goal === startKey) return { path: [{ q: from.q, r: from.r }], cost: 0 };
  if (distance(from, to) > maxRadius) return null;
  if (!usable(cost(tileAt(world, to.q, to.r)))) return null;

  const g = new Map([[startKey, 0]]);
  const came = new Map();
  const closed = new Set();
  const open = new Heap();
  let seq = 0;
  open.push({ k: startKey, q: from.q, r: from.r, f: distance(from, to) * h, seq: seq++ });
  while (open.size) {
    const cur = open.pop();
    if (closed.has(cur.k)) continue;
    if (cur.k === goal) {
      const path = [];
      for (let k = goal; k !== undefined; k = came.get(k)) path.push(parseKey(k));
      return { path: path.reverse(), cost: g.get(goal) };
    }
    closed.add(cur.k);
    const gc = g.get(cur.k);
    for (const n of neighbors(cur.q, cur.r)) {
      if (distance(from, n) > maxRadius) continue;
      const nk = key(n.q, n.r);
      if (closed.has(nk)) continue;
      const step = cost(tileAt(world, n.q, n.r));
      if (!usable(step)) continue;
      const ng = gc + step;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, cur.k);
        open.push({ k: nk, q: n.q, r: n.r, f: ng + distance(n, to) * h, seq: seq++ });
      }
    }
  }
  return null;
}

/** All tiles reachable from `from` with total cost <= maxCost: { [key]: cost }, start included at 0. */
export function reachable(world, from, maxCost, { costOf, maxRadius = 64 } = {}) {
  const cost = costFn(world, costOf);
  const startKey = key(from.q, from.r);
  const best = { [startKey]: 0 };
  const done = new Set();
  const open = new Heap();
  let seq = 0;
  open.push({ k: startKey, q: from.q, r: from.r, f: 0, seq: seq++ });
  while (open.size) {
    const cur = open.pop();
    if (done.has(cur.k)) continue;
    done.add(cur.k);
    for (const n of neighbors(cur.q, cur.r)) {
      if (distance(from, n) > maxRadius) continue;
      const nk = key(n.q, n.r);
      if (done.has(nk)) continue;
      const step = cost(tileAt(world, n.q, n.r));
      if (!usable(step)) continue;
      const ng = cur.f + step;
      if (ng <= maxCost && ng < (best[nk] ?? Infinity)) {
        best[nk] = ng;
        open.push({ k: nk, q: n.q, r: n.r, f: ng, seq: seq++ });
      }
    }
  }
  return best;
}

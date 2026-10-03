// Regression tests of the kernel review findings (lane K): the seal lock,
// costs before orders, checks on the projection, decisions at resolve, ids
// that collide with Object.prototype or kernel probes, and the council
// forecast of the preview.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hochland, freshCampaign } from '../../fixtures/engine/k1/harness.js';
import { apply, emptyDraft, open, preview, seal, stateHash } from '../../../engine/core/turn.js';
import { checkDraft } from '../../../engine/core/orders.js';
import { forecastCouncil } from '../../../engine/core/council.js';
import { orderContext } from '../../../engine/core/orders.js';
import { createContext, addPeople, setPeople } from '../../../engine/core/log.js';
import { makeEnv } from '../../../engine/core/env.js';
import { reservedKeyPaths } from '../../../engine/core/canon.js';
import { hashValue } from '../../../engine/core/hash.js';
import { projectFor } from '../../../engine/core/project.js';
import { knownRegions, regionAt, reach, moveBudget, tileOf } from '../../../engine/core/map.js';
import { RULES } from '../../../engine/core/rules.js';
import { distance, key, neighbors, parseKey } from '../../../engine/world/index.js';

const { env } = hochland();
const PID = 'bergnomaden';

function planning(mutate = () => {}) {
  const s = freshCampaign(env);
  mutate(s);
  return open(s, env).state;
}

/** Player rolls for every player probe of a draft, fixed value, from the people's projection as the board sees it. */
function rolled(state, draft, value = 6) {
  const chk = checkDraft(projectFor(state, env, draft.people), env, draft, { as: draft.people, mode: 'preview' });
  for (const p of chk.probes) if (p.roller === 'player') draft.rolls[p.id] = { value, fingerprint: p.fingerprint };
  return draft;
}

const homeOf = (state, pid) => state.map.settlements.find((s) => s.people === pid);

test('H1: seal records the hash of every sealed draft and apply refuses an edited one', () => {
  const state = planning();
  const d = emptyDraft(state, PID);
  d.orders = [{ id: 'o1', type: 'explore', params: { tile: homeOf(state, PID).tile } }];
  rolled(state, d, 1);
  const s = seal(state, env, { [PID]: d });
  assert.ok(s.ok);
  assert.deepEqual(Object.keys(s.state.sealed).sort(), Object.keys(s.drafts).sort());
  for (const [pid, draft] of Object.entries(s.drafts)) assert.equal(s.state.sealed[pid], hashValue(draft));
  const swapped = structuredClone(s.drafts);
  for (const k of Object.keys(swapped[PID].rolls)) swapped[PID].rolls[k].value = 10;
  const bad = apply(s.state, env, swapped);
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((i) => i.code === 'tamper' && i.path === `/drafts/${PID}`));
  const good = apply(s.state, env, s.drafts);
  assert.ok(good.ok);
  assert.equal(good.state.sealed, undefined, 'the seal is lifted when the season is resolved');
  const missing = { ...s.drafts };
  delete missing[Object.keys(missing).find((p) => p !== PID)];
  assert.equal(apply(s.state, env, missing).ok, false, 'a sealed AI draft may not go missing');
});

test('H3: every people pays its order costs before any order of the season runs', () => {
  const ai = 'schaedelklan';
  const world = env.world(7);
  let nb;
  const state = planning((s) => {
    const home = homeOf(s, ai);
    const h = parseKey(home.tile);
    nb = neighbors(h.q, h.r).map((x) => key(x.q, x.r)).find((k) => regionAt(world, k) === home.regionId);
    const P = s.peoples[PID];
    P.statuses.push({ id: 'test-unlock', effects: [{ op: 'order.unlock', order: 'raubzug' }], until: null, endsOn: null });
    P.developments.known.push({ ref: 'speertraeger@1', since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null });
    P.units.push({ id: 'u-1', type: 'speertraeger@1', strength: 2, tile: nb, state: 'ready', since: 0 });
    const A = s.peoples[ai];
    A.developments.known.push({ ref: 'speertraeger@1', since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null });
    for (const k of Object.keys(A.resources)) A.resources[k] = 0;
    A.resources.nahrung = 2;
    A.resources.material = 1;
    A.population.core = Math.max(3, A.population.core);
  });
  const home = homeOf(state, ai);
  const dp = rolled(state, { ...emptyDraft(state, PID), orders: [{ id: 'o1', type: 'raubzug', params: { units: ['u-1'], region: home.regionId } }] }, 9);
  const da = { ...emptyDraft(state, ai), orders: [{ id: 'o1', type: 'recruit', params: { type: 'speertraeger@1', settlement: home.id } }] };
  const r = apply(state, env, { [PID]: dp, [ai]: da });
  assert.ok(r.ok, JSON.stringify(r.issues));
  const steps = r.events.filter((e) => e.step === 'orders');
  const lastCost = steps.map((e) => e.kind).lastIndexOf('order.cost');
  const firstRun = steps.findIndex((e) => e.kind === 'probe.resolved' || e.kind === 'unit.spawn');
  assert.ok(lastCost >= 0 && firstRun > lastCost, 'all costs are booked before the first order runs');
  const aiCosts = steps.filter((e) => e.kind === 'order.cost' && e.target.id === ai).reduce((n, e) => n + e.change.delta, 0);
  assert.equal(aiCosts, -3, 'the recruit is paid in full from the opening stock');
});

test('M1: seal checks drafts on the projection, so a hidden unit on the target neither rejects nor reveals', () => {
  const other = 'schaedelklan';
  let target;
  const state = planning((s) => {
    const homeTile = homeOf(s, PID).tile;
    const ppl = s.peoples[PID];
    ppl.developments.known.push({ ref: 'bergschuetzen@1', since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null });
    ppl.units.push({ id: 'u-1', type: 'bergschuetzen@1', strength: 3, tile: homeTile, state: 'ready', since: 0 });
    const known = s.map.known[PID];
    const r = reach(s, env.world(7), homeTile, moveBudget(2));
    target = Object.keys(r).filter((k) => k !== homeTile && known[k] !== 'visible').sort()[0];
    s.peoples[other].units.push({ id: 'u-9', type: 'speertraeger@1', strength: 2, tile: target, state: 'ready', since: 0 });
  });
  const d = { ...emptyDraft(state, PID), orders: [{ id: 'o1', type: 'move', params: { unit: 'u-1', tile: target } }] };
  rolled(state, d);
  const s = seal(state, env, { [PID]: d });
  assert.ok(s.ok, JSON.stringify(s.issues));
  const a = apply(s.state, env, s.drafts);
  assert.ok(a.ok);
  assert.ok(a.events.some((e) => e.kind === 'move.skipped'), 'the hidden unit decides at resolve');
  assert.notEqual(a.state.peoples[PID].units.find((u) => u.id === 'u-1').tile, target);
});

test('M2: two peoples founding in one region in the same season leave one settlement; the second founder gets its costs back', () => {
  const ai = 'schaedelklan';
  const world = env.world(7);
  let pick;
  const state = planning((s) => {
    const home = parseKey(homeOf(s, PID).tile);
    const cands = [];
    for (let q = -9; q <= 9; q++) {
      for (let r = -9; r <= 9; r++) {
        const t = { q: home.q + q, r: home.r + r };
        const d = distance(home, t);
        if (d < 4 || d > 9) continue;
        const k = key(t.q, t.r);
        if (!env.terrain(tileOf(world, k).terrain)?.buildable) continue;
        const reg = regionAt(world, k);
        if (s.map.control[reg] || s.map.settlements.some((x) => x.regionId === reg)) continue;
        cands.push({ k, reg });
      }
    }
    for (const a of cands) for (const b of cands) if (!pick && a.k !== b.k && a.reg === b.reg) pick = [a, b];
    s.peoples[PID].units.push({ id: 'u-1', type: 'speertraeger@1', strength: 2, tile: pick[0].k, state: 'ready', since: 0 });
    s.peoples[ai].units.push({ id: 'u-1', type: 'speertraeger@1', strength: 2, tile: pick[1].k, state: 'ready', since: 0 });
    s.peoples[PID].population.core = Math.max(2, s.peoples[PID].population.core);
    s.peoples[ai].population.core = Math.max(2, s.peoples[ai].population.core);
  });
  const mk = (p, tile) => rolled(state, { ...emptyDraft(state, p), orders: [{ id: 'o1', type: 'found', params: { tile } }] });
  const r = apply(state, env, { [PID]: mk(PID, pick[0].k), [ai]: mk(ai, pick[1].k) });
  assert.ok(r.ok, JSON.stringify(r.issues));
  assert.equal(r.state.map.settlements.filter((s) => s.regionId === pick[0].reg).length, 1);
  const blocked = r.events.find((e) => e.kind === 'order.blocked');
  assert.ok(blocked, 'the second founder gets a notice');
  assert.ok(r.events.some((e) => e.kind === 'resource.change' && /blocked founding return/.test(e.reason)));
});

test('H4: a reserved name is refused as a world id, a draft key and kept out of state paths', () => {
  const regeln = structuredClone(env.regeln);
  regeln.resources = [...regeln.resources, { ...regeln.resources[0], id: 'constructor' }];
  assert.throws(() => makeEnv({ welt: env.welt, regeln }), /reserved name/);
  assert.deepEqual(reservedKeyPaths({ a: { constructor: 1 }, b: ['x', 'constructor'] }), ['/a/constructor', '/b/1']);

  const state = planning();
  const d = { ...emptyDraft(state, PID), orders: [{ id: 'constructor', type: 'explore', params: { tile: homeOf(state, PID).tile } }] };
  const chk = checkDraft(state, env, d, { as: PID, mode: 'preview' });
  assert.ok(chk.issues.some((i) => i.code === 'format' && i.path === '/orders/0/id'));

  // The log helpers read and write own properties only.
  const tc = createContext(state, env);
  const res = addPeople(tc, PID, 'meters.constructor', 2, 'test', { min: -5, max: 5 });
  assert.equal(res.applied, 2);
  assert.equal(tc.state.peoples[PID].meters.constructor, 2);
  setPeople(tc, PID, 'modules.kern.flags.constructor', true, 'test');
  assert.equal(typeof stateHash(tc.state), 'string', 'the state stays hashable');
  assert.throws(() => setPeople(tc, PID, 'modules.__proto__.x', 1, 'test'), /reserved key/);
});

test('an order id that names a kernel probe (life-N, hollow-N) is refused', () => {
  const state = planning();
  for (const id of ['life-0', 'hollow-2']) {
    const d = { ...emptyDraft(state, PID), orders: [{ id, type: 'explore', params: { tile: homeOf(state, PID).tile } }] };
    const chk = checkDraft(state, env, d, { as: PID, mode: 'preview' });
    assert.ok(chk.issues.some((i) => i.code === 'duplicate' && i.path === '/orders/0/id'), id);
  }
});

test('D15: preview lists the loyalty and approval changes of council decisions and orders', () => {
  const state = planning((s) => {
    s.peoples[PID].council.find((m) => m.id === 'garmund').loyalty = -1;
  });
  const d = { ...emptyDraft(state, PID), orders: [{ id: 'o1', type: 'talk', params: { mode: 'honor', member: 'garmund' } }] };
  const pv = preview(state, env, d, { as: PID });
  assert.deepEqual(pv.council.loyalty, { garmund: 1 });
  assert.deepEqual(pv.orders[0].council, { loyalty: { garmund: 1 }, meters: {}, depends: null });

  // A decree: every no-voter loses one, approval falls; the order then counts against goals.
  const people = state.peoples[PID];
  const ox = orderContext(state, env, PID);
  const votes = people.council.map((m) => ({ member: m.id, vote: m.id === 'asgra' ? 'yes' : 'no' }));
  const entry = {
    def: {}, errors: [], order: { id: 'o2', type: 'x', params: {} }, tags: ['handel'],
    vote: { required: true, passed: false, decree: true, votes },
  };
  const f = forecastCouncil(ox, [entry]);
  assert.equal(f.meters.zustimmung, -1);
  // torhild opposes handel (-1) and voted no (-1); garmund favours handel (+1) and voted no (-1).
  assert.equal(f.loyalty.torhild, -2);
  assert.equal(f.loyalty.garmund ?? 0, 0);
  assert.equal(f.loyalty.asgra ?? 0, 0);
  const pending = forecastCouncil(ox, [{ ...entry, vote: { ...entry.vote, decree: false, override: true } }]);
  assert.equal(pending.orders[0].depends, 'machtprobe');
});

test('M2: a camp move onto a tile with a settlement the people cannot see is decided at resolve with a notice', () => {
  const world = env.world(7);
  let target;
  const state = planning((s) => {
    const camp = homeOf(s, PID);
    const known = s.map.known[PID];
    const r = reach(s, world, camp.tile, RULES.migrateRange * 2);
    target = Object.keys(r).sort().find((k) => k !== camp.tile && known[k] !== 'visible' && env.terrain(tileOf(world, k).terrain)?.buildable
      && [undefined, null, PID].includes(s.map.control[regionAt(world, k)]) && !s.map.settlements.some((x) => x.tile === k));
    // A foreign outpost on that tile; control stays as it is, so only the hidden settlement stands in the way.
    s.map.settlements.push({ id: 's-schaedelklan-x', name: 'Vorposten', people: 'schaedelklan', kind: 'lager', tile: target, regionId: regionAt(world, target), mobile: false, buildings: [] });
  });
  assert.ok(target, 'a reachable tile the people does not see');
  const d = rolled(state, { ...emptyDraft(state, PID), orders: [{ id: 'o1', type: 'migrate', params: { tile: target } }] });
  const s = seal(state, env, { [PID]: d });
  assert.ok(s.ok, JSON.stringify(s.issues));
  const a = apply(s.state, env, s.drafts);
  assert.ok(a.ok);
  assert.ok(a.events.some((e) => e.kind === 'order.blocked' && e.visibleTo.includes(PID)));
  assert.notEqual(homeOf(a.state, PID).tile, target);
});

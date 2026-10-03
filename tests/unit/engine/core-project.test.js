import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../../../engine/content/schema.js';
import { view as VIEW_SCHEMA } from '../../../engine/schemas/files.js';
import { projectFor, projectEvents } from '../../../engine/core/project.js';
import { emptyDraft, preview } from '../../../engine/core/turn.js';
import { kern } from '../../../engine/core/state.js';
import { regionAt } from '../../../engine/core/map.js';
import { MODULES } from '../../../engine/modules/index.js';
import { PLAYER, hochlandEnv, nextSeason, planning, withRolls } from '../../fixtures/engine/k1/views.js';

const FOREIGN_KEYS = ['controller', 'id', 'identity', 'lebensweise', 'name', 'standing', 'units'];

// A state with foreign data planted where the fog must hide it.
function planted() {
  const { env, state } = planning();
  const s = structuredClone(state);
  const world = env.world(s.map.seed);
  const known = s.map.known[PLAYER];
  const visible = Object.keys(known).filter((k) => known[k] === 'visible' && !s.map.settlements.some((x) => x.tile === k)).sort();
  const hidden = '31,-31';
  assert.equal(Object.hasOwn(known, hidden), false);
  const unit = (id, tile) => ({ id, type: 'reiterschar@1', strength: 2, tile, state: 'ready', since: 0 });
  s.peoples.esk.units = [unit('u-1', visible[0]), unit('u-2', hidden)];
  s.peoples.esk.resources.nahrung = 777;
  s.peoples.esk.developments.research = [{ ref: 'salzpfad@1', progress: 33 }];
  s.peoples.esk.shortfall = { nahrung: 9 };
  s.peoples.glutreiter.resources.erz = 555;
  const settle = (id, people, tile) => ({
    id, name: `Ort ${id}`, people, kind: 'dorf', tile, regionId: regionAt(world, tile), mobile: false, buildings: [],
  });
  s.map.settlements.push(settle('s-near', 'esk', visible[1]), settle('s-far', 'esk', hidden));
  s.map.features[hidden] = { id: 'f-far', kind: 'quelle', name: 'Ferne Quelle', tags: [], resources: [], since: 0, source: 'kernel' };
  s.map.control[regionAt(world, hidden)] = 'esk';
  s.map.known.esk = { ...s.map.known.esk, [visible[2]]: 'visible' };
  s.eventDraws = {
    [PLAYER]: { turn: 0, roll: 3, band: 2, roller: 'player', card: null },
    esk: { turn: 0, roll: 9, band: 5, roller: 'kernel', card: null },
  };
  const choice = (id, people) => ({ id, people, event: 'fremder-hirte@1', offeredAt: 0, deadline: 1, options: ['aufnehmen', 'abweisen'] });
  s.pendingChoices = [choice('c-own', PLAYER), choice('c-esk', 'esk')];
  const entry = (n, visibleTo) => ({
    id: `T0-e${n}`, turn: 0, source: 'kernel', kind: 'resource.change', target: { kind: 'people', id: 'esk' },
    change: { field: 'resources.nahrung', delta: 1 }, reason: 'planted', refs: [], visibleTo, step: 'events',
  });
  s.chronicle = [entry(901, ['esk']), entry(902, [PLAYER, 'esk']), entry(903, ['all']), entry(904, ['glutreiter'])];
  s.derived.esk = { caps: { nahrung: 30 } };
  s.ingested = { 'research.esk.T0': '0123456789abcdef' };
  return { env, state: s, visible, hidden };
}

describe('projectFor', () => {
  it('is valid against the view schema for every people over several seasons', () => {
    let { env, state } = planning();
    for (let i = 0; i < 4; i++) {
      for (const pid of Object.keys(state.peoples)) assert.deepEqual(validate(VIEW_SCHEMA, projectFor(state, env, pid)), [], `${pid} turn ${state.turn}`);
      state = nextSeason(state, env);
    }
  });

  it('is valid against the view schema on the real Hochland package', () => {
    const env = hochlandEnv();
    let { state } = planning(48213, env);
    for (let i = 0; i < 4; i++) {
      for (const pid of Object.keys(state.peoples)) assert.deepEqual(validate(VIEW_SCHEMA, projectFor(state, env, pid)), [], `${pid} turn ${state.turn}`);
      state = nextSeason(state, env);
    }
  });

  it('leaves out rulesVersion, rng, eventPool and ingested', () => {
    const { env, state } = planted();
    const v = projectFor(state, env, PLAYER);
    for (const k of ['rulesVersion', 'rng', 'eventPool', 'ingested']) assert.equal(Object.hasOwn(v, k), false, k);
  });

  it('keeps the own people complete and gives foreign peoples the foreignPeople shape only', () => {
    const { env, state } = planted();
    const v = projectFor(state, env, PLAYER);
    assert.deepEqual(v.peoples[PLAYER], state.peoples[PLAYER]);
    assert.notEqual(v.peoples[PLAYER], state.peoples[PLAYER], 'a copy, not the same object');
    for (const id of Object.keys(state.peoples).filter((x) => x !== PLAYER)) {
      assert.deepEqual(Object.keys(v.peoples[id]).sort(), FOREIGN_KEYS, id);
    }
  });

  it('shows foreign units only on visible tiles', () => {
    const { env, state, visible, hidden } = planted();
    const v = projectFor(state, env, PLAYER);
    assert.deepEqual(v.peoples.esk.units.map((u) => u.tile), [visible[0]]);
    assert.equal(JSON.stringify(v).includes(hidden), false, 'the hidden tile appears nowhere');
  });

  it('shows foreign settlements only on visible tiles and all own settlements', () => {
    const { env, state, visible } = planted();
    const v = projectFor(state, env, PLAYER);
    const ids = v.map.settlements.map((s) => s.id).sort();
    assert.deepEqual(ids, [`s-${PLAYER}`, 's-near'].sort());
    assert.equal(v.map.settlements.find((s) => s.id === 's-near').tile, visible[1]);
  });

  it('hides every foreign stock, research, shortfall and planted value', () => {
    const { env, state } = planted();
    const text = JSON.stringify(projectFor(state, env, PLAYER));
    for (const marker of ['777', '555', '"progress":33', '"shortfall":{"nahrung":9}']) assert.equal(text.includes(marker), false, marker);
    const v = projectFor(state, env, PLAYER);
    for (const id of ['esk', 'glutreiter']) {
      for (const k of ['resources', 'developments', 'meters', 'bestimmung', 'practice', 'tokens', 'statuses', 'shortfall', 'modules', 'council']) {
        assert.equal(Object.hasOwn(v.peoples[id], k), false, `${id}.${k}`);
      }
    }
  });

  it('shows a foreign stock only while a reveal of scope people covers the turn', () => {
    const { env, state } = planted();
    const reveal = (until) => {
      const s = structuredClone(state);
      kern(s.peoples[PLAYER]).revealed = { esk: until };
      return projectFor(s, env, PLAYER);
    };
    assert.deepEqual(reveal(state.turn).peoples.esk.resources, state.peoples.esk.resources);
    assert.equal(Object.hasOwn(reveal(state.turn - 1).peoples.esk, 'resources'), false);
    assert.equal(Object.hasOwn(reveal(state.turn).peoples.glutreiter, 'resources'), false);
  });

  it('filters control and features to known ground and known to the own key', () => {
    const { env, state, hidden } = planted();
    const v = projectFor(state, env, PLAYER);
    const known = state.map.known[PLAYER];
    assert.deepEqual(Object.keys(v.map.known), [PLAYER]);
    assert.deepEqual(v.map.known[PLAYER], known);
    for (const k of Object.keys(v.map.features)) assert.ok(Object.hasOwn(known, k), k);
    assert.equal(Object.hasOwn(v.map.features, hidden), false);
    const regions = new Set(Object.keys(known).map((k) => regionAt(env.world(state.map.seed), k)));
    for (const r of Object.keys(v.map.control)) assert.ok(regions.has(r), r);
    assert.equal(v.map.control[regionAt(env.world(state.map.seed), state.map.settlements.find((s) => s.people === PLAYER).tile)], PLAYER);
    assert.equal(Object.hasOwn(v.map.control, regionAt(env.world(state.map.seed), hidden)), false, 'control of an unknown region is hidden');
  });

  it('keeps own relations only, own draws, own choices and own derived', () => {
    const { env, state } = planted();
    const v = projectFor(state, env, PLAYER);
    assert.deepEqual(Object.keys(v.relations).sort(), ['esk|hochweide', 'glutreiter|hochweide']);
    assert.deepEqual(Object.keys(v.eventDraws), [PLAYER]);
    assert.deepEqual(v.pendingChoices.map((c) => c.id), ['c-own']);
    assert.deepEqual(Object.keys(v.derived), [PLAYER]);
    const e = projectFor(state, env, 'esk');
    assert.deepEqual(Object.keys(e.relations).sort(), ['esk|glutreiter', 'esk|hochweide']);
    assert.deepEqual(Object.keys(e.derived), ['esk']);
  });

  it('filters the chronicle by visibleTo', () => {
    const { env, state } = planted();
    assert.deepEqual(projectFor(state, env, PLAYER).chronicle.map((e) => e.id), ['T0-e902', 'T0-e903']);
    assert.deepEqual(projectFor(state, env, 'esk').chronicle.map((e) => e.id), ['T0-e901', 'T0-e902', 'T0-e903']);
  });

  it('shows module slices only through hooks.project', () => {
    const { env, state } = planting();
    const v = projectFor(state, env, PLAYER);
    const filtering = MODULES.filter((m) => m.hooks?.project && Object.hasOwn(state.modules, m.id)).map((m) => m.id);
    assert.deepEqual(Object.keys(v.modules).filter((k) => !filtering.includes(k)), [], 'a module slice without a project hook leaked');
    assert.equal(Object.hasOwn(v.modules, 'kern'), false, 'the kernel draw history is not projected');
    // Trade offers and contracts of other peoples are private.
    assert.deepEqual(v.modules.handel.offers.map((o) => o.id), ['of-2']);
    assert.deepEqual(v.modules.handel.contracts.map((c) => c.id), ['ct-2']);
  });

  it('does not mutate the state and is deterministic', () => {
    const { env, state } = planted();
    const before = JSON.stringify(state);
    const a = projectFor(state, env, PLAYER);
    const b = projectFor(state, env, PLAYER);
    assert.equal(JSON.stringify(state), before);
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    a.peoples[PLAYER].resources.nahrung = 1;
    assert.equal(JSON.stringify(state), before, 'the projection shares no object with the state');
  });

  it('throws for an unknown people', () => {
    const { env, state } = planning();
    assert.throws(() => projectFor(state, env, 'nobody'), RangeError);
  });
});

function planting() {
  const p = planted();
  const offer = (id, from, to) => ({ id, from, to, give: { salz: 1 }, get: { nahrung: 1 }, seasons: 2, expiresAt: 1 });
  const contract = (id, a, b) => ({ id, a, b, aGives: { salz: 1 }, bGives: { nahrung: 1 }, from: 0, until: 3 });
  p.state.modules.handel = {
    offers: [offer('of-1', 'esk', 'glutreiter'), offer('of-2', 'glutreiter', PLAYER)],
    contracts: [contract('ct-1', 'esk', 'glutreiter'), contract('ct-2', PLAYER, 'esk')],
    prices: { erz: 4 },
    seq: 2,
  };
  return p;
}

describe('projectEvents', () => {
  it('keeps entries naming the people or all', () => {
    const e = (id, visibleTo) => ({ id, visibleTo });
    const list = [e('a', ['esk']), e('b', ['hochweide', 'esk']), e('c', ['all'])];
    assert.deepEqual(projectEvents(list, 'hochweide').map((x) => x.id), ['b', 'c']);
    assert.deepEqual(projectEvents(list, 'esk').map((x) => x.id), ['a', 'b', 'c']);
    assert.deepEqual(projectEvents(list, 'glutreiter').map((x) => x.id), ['c']);
  });
});

describe('preview on the projection', () => {
  const eq = (state, env, draft, pid = PLAYER) => {
    const full = preview(state, env, draft, { as: pid });
    const proj = preview(projectFor(state, env, pid), env, draft, { as: pid });
    assert.deepEqual(proj.issues, full.issues, 'issues');
    assert.deepEqual(proj.probes, full.probes, 'probes with fingerprints');
    assert.deepEqual(proj.costs, full.costs, 'costs');
    assert.deepEqual(proj.slots, full.slots, 'slots');
    assert.deepEqual(proj.assign, full.assign, 'assign');
    assert.deepEqual(proj.orders, full.orders, 'orders');
    assert.deepEqual(proj.votes, full.votes, 'votes');
    assert.deepEqual(proj.forecast, full.forecast, 'forecast');
    return full;
  };
  const draftWith = (state, orders, extra = {}, pid = PLAYER) => ({ ...emptyDraft(state, pid), orders, ...extra });
  const okOrders = (full) => full.orders.filter((o) => o.ok).map((o) => o.type);

  it('equals the preview on the full state for representative drafts', () => {
    const { env, state } = planning();
    const home = state.map.settlements.find((s) => s.people === PLAYER);
    const candidate = state.peoples[PLAYER].developments.candidates[0]?.ref;
    const [q, r] = home.tile.split(',').map(Number);
    // The first known tile a migration is accepted on, found on the full state.
    const target = Object.keys(state.map.known[PLAYER]).sort().find((k) => preview(state, env, draftWith(state, [{ id: 'o1', type: 'migrate', params: { tile: k } }]), { as: PLAYER }).orders[0].ok);
    const drafts = [
      [draftWith(state, []), []],
      [draftWith(state, [{ id: 'o1', type: 'explore', params: { tile: `${q + 3},${r}` } }]), ['explore']],
      [draftWith(state, [{ id: 'o1', type: 'research.assign', params: { development: candidate } }]), ['research.assign']],
      [draftWith(state, [{ id: 'o1', type: 'migrate', params: { tile: target } }]), ['migrate']],
      [draftWith(state, [{ id: 'o1', type: 'talk', params: { member: 'ulrun', mode: 'listen' } }]), ['talk']],
      [draftWith(state, [{ id: 'o1', type: 'institute', params: { development: 'sippenrat@1' } }]), []],
      [draftWith(state, [{ id: 'o1', type: 'explore', params: { tile: `${q + 3},${r}` } }], { assign: { nahrung: 2, material: 1 } }), ['explore']],
      [draftWith(state, [{ id: 'o1', type: 'machtprobe', params: { aim: 'rally' } }]), []],
    ];
    assert.ok(target, 'a valid migration target exists');
    for (const [d, accepted] of drafts) {
      const full = eq(state, env, d);
      if (accepted.length) assert.deepEqual(okOrders(full), accepted, JSON.stringify(d.orders));
    }
  });

  it('equals the full preview of an AI people with units and a recruit order', () => {
    const { env, state } = planning();
    const pid = 'glutreiter';
    const home = state.map.settlements.find((s) => s.people === pid);
    const full = eq(state, env, draftWith(state, [{ id: 'o1', type: 'recruit', params: { type: 'reiterschar@1', settlement: home.id } }], {}, pid), pid);
    assert.deepEqual(okOrders(full), ['recruit']);
  });

  it('equals the full preview after several seasons and with rolls entered', () => {
    let { env, state } = planning();
    for (let i = 0; i < 3; i++) state = nextSeason(state, env);
    const home = state.map.settlements.find((s) => s.people === PLAYER);
    const [q, r] = home.tile.split(',').map(Number);
    const d = withRolls(state, env, draftWith(state, [{ id: 'o1', type: 'explore', params: { tile: `${q},${r + 3}` } }]));
    const full = eq(state, env, d);
    assert.ok(full.probes.length >= 2, 'the explore probe and the event probe are previewed');
  });

  // Known divergence: a foreign people shows no developments in a projection,
  // so handel's check cannot see that the partner trades (see report).
  it('equals the full preview of a trade offer', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    for (const pid of Object.keys(s.peoples)) s.peoples[pid].developments.known.push({ ref: 'salzpfad@1', since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null });
    for (const k of Object.keys(s.relations)) s.relations[k].contact = true;
    s.peoples[PLAYER].resources.salz = 3;
    const full = eq(s, env, draftWith(s, [{ id: 'o1', type: 'trade.offer', params: { partner: 'esk', give: { salz: 1 }, get: { nahrung: 1 }, seasons: 2 } }]));
    assert.deepEqual(okOrders(full), ['trade.offer']);
  });
});

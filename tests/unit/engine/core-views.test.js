import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LOYALTY_BANDS, labelKeys, loyaltyBand, selectView, viewsFor } from '../../../engine/core/views.js';
import { projectFor } from '../../../engine/core/project.js';
import { BANDS, bandLabelKey } from '../../../engine/core/probes.js';
import { registry } from '../../../engine/core/orders.js';
import { MODULES, activeModules } from '../../../engine/modules/index.js';
import { PATTERNS } from '../../../engine/schemas/common.js';
import { regionAt } from '../../../engine/core/map.js';
import { PLAYER, hochlandEnv, nextSeason, planning } from '../../fixtures/engine/k1/views.js';

const CORE = { karte: 10, lage: 20, rat: 30, entwicklungen: 40, bestimmung: 50, voelker: 70, chronik: 80 };

describe('viewsFor', () => {
  it('lists the core views with their orders, sorted, all active', () => {
    const { env, state } = planning();
    const list = viewsFor(state, env, PLAYER);
    const core = list.filter((v) => Object.hasOwn(CORE, v.id));
    assert.deepEqual(core.map((v) => [v.id, v.order]), Object.entries(CORE));
    for (const v of core) {
      assert.equal(v.labelKey, `view.${v.id}`);
      assert.equal(v.active, true);
      assert.ok(v.icon && v.scope && Array.isArray(v.sections));
    }
    const orders = list.map((v) => v.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
  });

  it('adds the views of active modules, and of dormant modules marked inactive', () => {
    const { env, state } = planning();
    const list = viewsFor(state, env, PLAYER);
    const active = new Set(activeModules(state, env, PLAYER).map((m) => m.id));
    for (const m of MODULES) {
      for (const v of m.views ?? []) {
        const found = list.find((x) => x.id === v.id);
        if (active.has(m.id)) assert.equal(found?.active, true, `${m.id}/${v.id}`);
        else assert.equal(found, undefined, `${m.id}/${v.id} appears without an active module or a slice`);
      }
    }
    // A slice without activation shows the module's views as inactive.
    const dormant = MODULES.find((m) => !m.always && !active.has(m.id) && (m.views ?? []).length);
    if (dormant) {
      const s = structuredClone(state);
      s.peoples[PLAYER].modules[dormant.id] = {};
      for (const v of dormant.views) assert.equal(viewsFor(s, env, PLAYER).find((x) => x.id === v.id).active, false);
    }
  });
});

describe('loyaltyBand', () => {
  it('maps -5..5 to the five bands of the Regelkern', () => {
    const band = (l) => loyaltyBand(l);
    assert.deepEqual([5, 4].map(band), ['ergeben', 'ergeben']);
    assert.deepEqual([3, 2, 1].map(band), ['treu', 'treu', 'treu']);
    assert.equal(band(0), 'schwankend');
    assert.deepEqual([-1, -2, -3].map(band), ['verstimmt', 'verstimmt', 'verstimmt']);
    assert.deepEqual([-4, -5].map(band), ['bruch', 'bruch']);
    assert.deepEqual([...new Set(Array.from({ length: 11 }, (_, i) => band(i - 5)))].sort(), [...LOYALTY_BANDS].sort());
  });
});

describe('selectView', () => {
  it('returns data for every listed view without throwing, and null for an unknown id', () => {
    let { env, state } = planning();
    for (let i = 0; i < 3; i++) {
      for (const pid of Object.keys(state.peoples)) {
        for (const v of viewsFor(state, env, pid)) {
          const data = selectView(state, env, pid, v.id);
          assert.equal(data.id, v.id, `${pid}/${v.id}`);
          assert.doesNotThrow(() => JSON.stringify(data));
        }
      }
      state = nextSeason(state, env);
    }
    assert.equal(selectView(state, env, PLAYER, 'nope'), null);
  });

  it('answers every listed view of every people on the real Hochland package', () => {
    const env = hochlandEnv();
    let { state } = planning(48213, env);
    for (let i = 0; i < 3; i++) {
      for (const pid of Object.keys(state.peoples)) {
        for (const v of viewsFor(state, env, pid)) assert.equal(selectView(state, env, pid, v.id).id, v.id, `${pid}/${v.id}`);
      }
      state = nextSeason(state, env);
    }
  });

  it('karte shows only what the projection holds', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    const world = env.world(s.map.seed);
    const hidden = '31,-31';
    s.map.settlements.push({ id: 's-far', name: 'Fern', people: 'esk', kind: 'dorf', tile: hidden, regionId: regionAt(world, hidden), mobile: false, buildings: [] });
    s.peoples.esk.units = [{ id: 'u-1', type: 'reiterschar@1', strength: 2, tile: hidden, state: 'ready', since: 0 }];
    const k = selectView(s, env, PLAYER, 'karte');
    assert.equal(k.settlements.some((x) => x.id === 's-far'), false);
    assert.equal(k.units.some((u) => u.tile === hidden), false);
    assert.equal(JSON.stringify(k).includes(hidden), false);
    assert.deepEqual(k.known, projectFor(s, env, PLAYER).map.known[PLAYER]);
    assert.equal(k.counts.visible + k.counts.seen, Object.keys(k.known).length);
    assert.ok(k.layers && typeof k.layers === 'object');
  });

  it('lage carries stock, forecast, slots, catalogue and labour', () => {
    const { env, state } = planning();
    const l = selectView(state, env, PLAYER, 'lage');
    assert.deepEqual(l.resources, state.peoples[PLAYER].resources);
    assert.deepEqual(l.assigned, state.peoples[PLAYER].population.assigned);
    assert.deepEqual(l.slots, { main: 1, minor: 2 });
    assert.ok(l.forecast && l.catalogue.some((c) => c.type === 'explore' && c.available));
  });

  it('rat labels every member with the loyalty band and lists open seats', () => {
    const { env, state } = planning();
    const r = selectView(state, env, PLAYER, 'rat');
    assert.equal(r.members.length, state.peoples[PLAYER].council.length);
    for (const m of r.members) {
      assert.equal(m.band, loyaltyBand(m.loyalty));
      assert.equal(m.labelKey, `loyalty.${m.band}`);
    }
    assert.deepEqual(r.seats, []);
  });

  it('entwicklungen names the known developments and the candidates', () => {
    const { env, state } = planning();
    const e = selectView(state, env, PLAYER, 'entwicklungen');
    assert.deepEqual(e.known.map((k) => k.ref), state.peoples[PLAYER].developments.known.map((k) => k.ref));
    assert.ok(e.known.every((k) => k.name && k.kind));
    assert.equal(e.candidates.length, state.peoples[PLAYER].developments.candidates.length);
    assert.ok(e.known.find((k) => k.ref === 'sippenrat@1').instituted);
  });

  it('bestimmung adds the milestone texts of the world', () => {
    const { env, state } = planning();
    const b = selectView(state, env, PLAYER, 'bestimmung');
    assert.equal(b.current.ref, 'ueberdauern@1');
    assert.deepEqual(b.current.milestones.map((m) => m.text), env.bestimmung('ueberdauern@1').milestones.map((m) => m.text));
    // Without contact no rival destiny is revealed.
    assert.deepEqual(selectView(state, env, 'esk', 'bestimmung'), {
      current: null, history: [], id: 'bestimmung', rivals: [{ people: 'glutreiter', destiny: null }, { people: 'hochweide', destiny: null }],
    });
  });

  it('voelker lists the foreign peoples as projected with their relation, without stocks', () => {
    const { env, state } = planning();
    const v = selectView(state, env, PLAYER, 'voelker');
    assert.deepEqual(v.peoples.map((p) => p.id), ['esk', 'glutreiter']);
    for (const p of v.peoples) {
      assert.equal(Object.hasOwn(p, 'resources'), false);
      assert.deepEqual(p.relation, state.relations[[PLAYER, p.id].sort().join('|')]);
    }
  });

  it('chronik shows the projected entries only', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    s.chronicle.push({
      id: 'T0-e999', turn: 0, source: 'kernel', kind: 'resource.change', target: { kind: 'people', id: 'esk' },
      change: { field: 'resources.nahrung', delta: 1 }, reason: 'hidden', refs: [], visibleTo: ['esk'], step: 'events',
    });
    const c = selectView(s, env, PLAYER, 'chronik');
    assert.equal(c.entries.some((e) => e.id === 'T0-e999'), false);
    assert.ok(c.entries.length > 0);
  });

  it('a module view answers from the module derive hook and reports a dormant module as inactive', () => {
    const { env, state } = planning();
    for (const m of MODULES) {
      for (const v of m.views ?? []) {
        const on = activeModules(state, env, PLAYER).some((x) => x.id === m.id);
        const data = selectView(state, env, PLAYER, v.id);
        assert.equal(data.active, on, `${m.id}/${v.id}`);
      }
    }
  });
});

describe('labelKeys', () => {
  it('covers the core views, bands, loyalty bands and every registered order, without underscores', () => {
    const { env } = planning();
    const keys = labelKeys(env);
    for (const id of Object.keys(CORE)) assert.ok(keys.includes(`view.${id}`), id);
    for (const b of BANDS) assert.ok(keys.includes(bandLabelKey(b)), b);
    for (const b of LOYALTY_BANDS) assert.ok(keys.includes(`loyalty.${b}`), b);
    for (const type of Object.keys(registry())) assert.ok(keys.includes(`order.${type}`), type);
    for (const k of keys) {
      assert.equal(k.includes('_'), false, k);
      assert.match(k, new RegExp(PATTERNS.labelKey), k);
    }
    assert.deepEqual(keys, [...new Set(keys)].sort());
    assert.ok(keys.includes('band.crit-success') && keys.includes('band.crit-fail'));
  });
});

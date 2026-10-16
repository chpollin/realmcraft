import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate } from '../../../engine/content/schema.js';
import { validateCampaign } from '../../../engine/content/validate.js';
import { checkDraft, orderContext, registry } from '../../../engine/core/orders.js';
import { emptyDraft, orderTile } from '../../../engine/core/turn.js';
import { MAX_TILE_COORDINATE, distance, isTileKey, key } from '../../../engine/world/index.js';
import { PRIMITIVES } from '../../../engine/schemas/effects.js';
import { COMMON_DEFS } from '../../../engine/schemas/common.js';
import { scenario, unit } from '../../fixtures/engine/k1/military.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { ingestProposal } from '../../../engine/harness/ingest.js';
import { buildTasks } from '../../../engine/harness/tasks.js';
import { freshCampaign, hochland, proposalFor, taskOf } from '../../fixtures/engine/k1/harness.js';

const { env, library } = hochland();
const state = freshCampaign(env);
const task = taskOf(buildTasks(state, env, { library, phase: 'resolving' }), 'world');
const feature = JSON.parse(readFileSync(new URL('../../fixtures/engine/proposal-world-feature.json', import.meta.url), 'utf8')).items[0];
const unsafeTiles = ['9007199254740992,0', `${'9'.repeat(400)},0`];

// The first world request only creates a turn context. Stop before derived
// state could send an untrusted coordinate into chunk/region iteration.
function guardedEnv() {
  let calls = 0;
  return {
    ...env,
    world(seed) {
      calls++;
      assert.ok(calls <= 1, 'unsafe feature reached derived world lookup');
      return env.world(seed);
    },
  };
}

describe('tile input boundaries', () => {
  for (const tile of unsafeTiles) {
    const label = tile.length > 40 ? 'overflowing decimal' : tile;
    it(`rejects ${label} in the agent schema`, () => {
      const proposal = proposalFor(task, [{ ...feature, tile }]);
      const issues = validate(SCHEMAS.proposal, proposal);
      assert.ok(issues.some((i) => i.path === '/items/0/tile'), JSON.stringify(issues));
    });

    it(`rejects ${label} before derived lookup and keeps campaign/library unchanged`, () => {
      const proposal = proposalFor(task, [{ ...feature, tile }]);
      const before = structuredClone(state);
      const beforeLibrary = structuredClone(library);
      const result = ingestProposal(state, guardedEnv(), proposal, { task, library });
      assert.equal(result.verdict, 'rejected');
      assert.equal(result.state, state);
      assert.equal(result.library, library);
      assert.deepEqual(state, before);
      assert.deepEqual(library, beforeLibrary);
      assert.deepEqual(result.events, []);
      assert.ok(result.items[0].issues.some((i) => i.path === '/items/0/tile'));
    });
  }
});


describe('shared tile coordinate range', () => {
  it('accepts both signs and both axes at the inclusive boundary in schema and runtime', () => {
    const inside = [0, 1, -1, MAX_TILE_COORDINATE - 1, MAX_TILE_COORDINATE, -MAX_TILE_COORDINATE];
    for (const q of inside) {
      for (const r of inside) {
        const tile = key(q, r);
        assert.equal(isTileKey(tile), true, tile);
        assert.deepEqual(validate(SCHEMAS.proposal, proposalFor(task, [{ ...feature, tile }])), [], tile);
      }
    }
    const far = { q: MAX_TILE_COORDINATE, r: MAX_TILE_COORDINATE };
    const opposite = { q: -far.q, r: -far.r };
    assert.equal(distance(far, opposite), 4 * MAX_TILE_COORDINATE);
    assert.ok(Number.isSafeInteger(distance(far, opposite)));
  });

  it('rejects adjacent out-of-range coordinates on either axis with either sign', () => {
    for (const n of [MAX_TILE_COORDINATE + 1, -MAX_TILE_COORDINATE - 1]) {
      for (const tile of [key(n, 0), key(0, n)]) {
        assert.equal(isTileKey(tile), false, tile);
        assert.ok(validate(SCHEMAS.proposal, proposalFor(task, [{ ...feature, tile }])).some((i) => i.path === '/items/0/tile'), tile);
      }
    }
  });

  it('keeps canonical integer syntax, without coercion or trailing line breaks', () => {
    for (const tile of [null, 1, {}, '-0,0', '0,-0', '01,0', '0,01', '+1,0', '1.0,0', '1e2,0', ' 1,0', '1,0 ', '1,0\n', '1,0\r\n']) {
      assert.equal(isTileKey(tile), false, JSON.stringify(tile));
      assert.ok(validate(SCHEMAS.proposal, proposalFor(task, [{ ...feature, tile }])).some((i) => i.path === '/items/0/tile'), JSON.stringify(tile));
    }
  });

  it('rejects unsafe coordinates in saved features, fog, settlements, units and council locations', () => {
    const tile = unsafeTiles[0];
    const player = state.campaign.player;
    const edits = [
      (s) => { s.map.features[tile] = { ...feature.data, since: 0, source: 'agent:world' }; },
      (s) => { s.map.known[player][tile] = 'seen'; },
      (s) => { s.map.settlements[0].tile = tile; },
      (s) => { s.peoples[player].units.push({ id: 'u-1', type: s.peoples[player].lebensweise, strength: 1, tile, state: 'ready', since: 0 }); },
      (s) => { s.peoples[player].council[0].at = tile; },
    ];
    assert.equal(validateCampaign(state).ok, true);
    for (const edit of edits) {
      const invalid = structuredClone(state);
      edit(invalid);
      const result = validateCampaign(invalid);
      assert.equal(result.ok, false);
      assert.ok(result.issues.some((i) => i.code === 'schema.pattern' || i.code === 'schema.property_name'));
    }
  });

  it('applies the same boundary inside coordinate-bearing one-off primitives', () => {
    for (const tile of [key(MAX_TILE_COORDINATE, -MAX_TILE_COORDINATE), unsafeTiles[0]]) {
      for (const primitive of [
        { op: 'unit.spawn', type: state.peoples[state.campaign.player].lebensweise, tile },
        { op: 'reveal', scope: 'tiles', at: tile, radius: 1 },
      ]) {
        const issues = validate({ ...PRIMITIVES[primitive.op].schema, $defs: COMMON_DEFS }, primitive);
        const coordinateIssues = issues.filter((i) => i.path === '/tile' || i.path === '/at');
        assert.equal(coordinateIssues.length === 0, isTileKey(tile), JSON.stringify(primitive));
      }
    }
  });

  it('keeps normal negative-coordinate feature ingest working', () => {
    const before = structuredClone(state);
    const result = ingestProposal(state, env, proposalFor(task, [feature]), { task, library });
    assert.equal(result.verdict, 'accepted', JSON.stringify(result.issues));
    assert.deepEqual(result.state.map.features[feature.tile], { ...feature.data, since: 0, source: 'agent:world' });
    assert.deepEqual(state, before);
  });

  it('rejects unsafe targets in core, migration and military checks before reading map geometry', () => {
    const fixture = scenario();
    const player = fixture.state.campaign.player;
    const home = fixture.state.map.settlements.find((s) => s.people === player);
    fixture.state.peoples[player].units.push(unit('u-1', 'speerwall@1', home.tile));
    home.mobile = false;
    const ox = {
      ...orderContext(fixture.state, fixture.env, player),
      path: '/orders/0',
      world: new Proxy({}, { get() { assert.fail('unsafe coordinate reached map geometry'); } }),
    };
    const orders = [
      ['found', {}], ['explore', {}], ['road', {}], ['road.pave', {}], ['migrate', {}],
      ['move', { unit: 'u-1' }], ['attack', { units: ['u-1'] }], ['ausfall', { settlement: home.id }],
    ];
    const definitions = registry();
    for (const [type, params] of orders) {
      const issues = definitions[type].def.check(ox, { id: 'o1', type, params: { ...params, tile: unsafeTiles[0] } });
      assert.ok(issues.some((i) => i.params?.reason === 'not-tile'), `${type}: ${JSON.stringify(issues)}`);
    }
    const draft = { ...emptyDraft(fixture.state, player), orders: [{ id: 'o1', type: 'explore', params: { tile: unsafeTiles[0] } }] };
    assert.ok(checkDraft(fixture.state, fixture.env, draft).issues.some((i) => i.params?.reason === 'not-tile'));
    assert.equal(orderTile(fixture.state, ox.world, player, draft.orders[0]), null);
  });
});

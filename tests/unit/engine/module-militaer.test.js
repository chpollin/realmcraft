// The militaer module: activation, orders (recruit, move, attack, retreat,
// ausfall, raubzug) through preview and full seasons, and the derive hook.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_IDS, activeModules } from '../../../engine/modules/index.js';
import militaer from '../../../engine/modules/militaer.js';
import { catalogueFor } from '../../../engine/core/orders.js';
import { preview, emptyDraft } from '../../../engine/core/turn.js';
import { route } from '../../../engine/core/map.js';
import { RULES } from '../../../engine/core/rules.js';
import { relKey } from '../../../engine/core/state.js';
import { addStatus, errorsOf, play, scenario, settlementAt, unit } from '../../fixtures/engine/k1/military.js';

const recruit = (id = 'o1', type = 'speerwall@1') => ({ id, type: 'recruit', params: { type, settlement: 's-hochweide' } });
const move = (id, u, tile) => ({ id, type: 'move', params: { unit: u, tile } });
const attack = (id, units, tile) => ({ id, type: 'attack', params: { units, tile } });
const codes = (errors) => errors.map((e) => e.code);
const unitOf = (state, pid, id) => state.peoples[pid].units.find((u) => u.id === id);
const spear = (id, tile, extra) => unit(id, 'speerwall@1', tile, extra);

test('module contract: id, tags, orders, views, labels, hints', () => {
  assert.equal(militaer.id, 'militaer');
  assert.ok(MODULE_IDS.includes('militaer'));
  assert.deepEqual(militaer.resourceRoles, []);
  assert.deepEqual(militaer.tags, { krieg: 2, angriff: 2, verteidigung: 2, fuss: 1, reiter: 1, schuetzen: 1, beute: 1 });
  assert.deepEqual(Object.keys(militaer.orders).sort(), ['attack', 'ausfall', 'move', 'raubzug', 'recruit', 'retreat']);
  assert.deepEqual(Object.entries(militaer.orders).filter(([, d]) => d.locked).map(([t]) => t).sort(), ['ausfall', 'raubzug']);
  assert.deepEqual(militaer.views, [{ id: 'militaer', labelKey: 'view.militaer', icon: 'shield', order: 60, scope: 'people', sections: ['units', 'recruit', 'battles'] }]);
  assert.deepEqual(militaer.labelKeys, ['view.militaer', 'order.recruit', 'order.move', 'order.attack', 'order.retreat', 'order.ausfall', 'order.raubzug']);
  assert.deepEqual(militaer.agentHints, { primitives: ['unit.mod', 'unit.spawn', 'probe.mod'], tags: ['krieg', 'angriff', 'verteidigung'] });
  assert.deepEqual(militaer.initPeople(), { recruited: 0 });
});

test('autoActive: a known, active unit development switches the module on', () => {
  const { env, state } = scenario();
  assert.ok(activeModules(state, env, 'hochweide').some((m) => m.id === 'militaer'));
  assert.ok(!activeModules(state, env, 'esk').some((m) => m.id === 'militaer'));
  const entry = state.peoples.hochweide.developments.known.find((k) => k.ref === 'speerwall@1');
  entry.effectiveFrom = 1;
  entry.state = 'active';
  state.peoples.hochweide.developments.known = state.peoples.hochweide.developments.known.filter((k) => k.ref !== 'reiterschar@1');
  assert.ok(!militaer.autoActive(state, env, 'hochweide'), 'not yet effective');
  entry.effectiveFrom = 0;
  entry.state = 'suspended';
  assert.ok(!militaer.autoActive(state, env, 'hochweide'), 'not active');
});

test('derive hook: units with effective stats, total strength, recruit limit', () => {
  const { env, state } = scenario();
  addStatus(state, 'hochweide', 'drill', [{ op: 'unit.mod', unitTags: ['fuss'], stat: 'strength', amount: 1 }]);
  state.peoples.hochweide.units = [spear('u-1', '0,1'), unit('u-2', 'reiterschar@1', '0,2', { state: 'routed' })];
  const d = militaer.hooks.derive(state, env, 'hochweide');
  assert.deepEqual(d.units, [
    { id: 'u-1', type: 'speerwall@1', tile: '0,1', state: 'ready', strength: 4, mobility: 1, upkeep: { nahrung: 1 }, tags: ['fuss'] },
    { id: 'u-2', type: 'reiterschar@1', tile: '0,2', state: 'routed', strength: 2, mobility: 3, upkeep: { nahrung: 1 }, tags: ['reiter'] },
  ]);
  assert.equal(d.strength, 6);
  assert.equal(d.recruitLimit, 1);
});

test('catalogue: ausfall and raubzug need an unlock, the rest is open to a people with units', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,1')];
  const find = (type) => catalogueFor(state, env, 'hochweide').find((c) => c.type === type);
  assert.equal(find('recruit').available, true);
  for (const t of ['move', 'attack', 'retreat']) assert.equal(find(t).available, true, t);
  for (const t of ['ausfall', 'raubzug']) assert.equal(find(t).reason, 'not unlocked', t);
  addStatus(state, 'hochweide', 'unlock', [{ op: 'order.unlock', order: 'raubzug' }]);
  assert.equal(find('raubzug').available, true);
  const bare = scenario();
  assert.equal(catalogueFor(bare.state, bare.env, 'hochweide').find((c) => c.type === 'move').reason, 'nothing to act on');
  assert.equal(catalogueFor(bare.state, bare.env, 'esk').find((c) => c.type === 'recruit').available, false, 'module inactive');
});

test('recruit: at most floor(core / recruitPerCore) per season', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.resources.material = 20;
  state.peoples.hochweide.resources.nahrung = 20;
  assert.deepEqual(errorsOf(state, env, [recruit('o1')]), []);
  assert.deepEqual(codes(errorsOf(state, env, [recruit('o1'), recruit('o2')])), ['slots']);
  state.peoples.hochweide.population.core = 6;
  assert.deepEqual(errorsOf(state, env, [recruit('o1'), recruit('o2')]), []);
  assert.deepEqual(codes(errorsOf(state, env, [recruit('o1'), recruit('o2'), recruit('o3')])), ['slots']);
  state.peoples.hochweide.population.core = 2;
  assert.deepEqual(codes(errorsOf(state, env, [recruit('o1')])), ['slots'], 'a people of fewer than three clans cannot recruit');
});

test('recruit: total strength of all units plus the recruit stays within core x strengthPerClan', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.resources.material = 20;
  state.peoples.hochweide.resources.nahrung = 20;
  const cap = 3 * RULES.strengthPerClan;
  state.peoples.hochweide.units = [spear('u-1', '0,1', { strength: 3 }), spear('u-2', '0,1', { strength: 3 })];
  assert.deepEqual(errorsOf(state, env, [recruit()]), [], `6 + 3 = ${cap}`);
  state.peoples.hochweide.units[1].strength = 4;
  assert.deepEqual(codes(errorsOf(state, env, [recruit()])), ['target'], `7 + 3 > ${cap}`);

  state.peoples.hochweide.population.core = 6;
  state.peoples.hochweide.units = [spear('u-1', '0,1', { strength: 7 }), spear('u-2', '0,1', { strength: 7 })];
  assert.deepEqual(errorsOf(state, env, [recruit('o1')]), [], '14 + 3 = 17 <= 18');
  assert.deepEqual(codes(errorsOf(state, env, [recruit('o1'), recruit('o2')])), ['target'], 'two recruits together would hold 20');
});

test('recruit: the type must be a known active unit and the settlement an own one; costs come from the opening stock', () => {
  const { env, state } = scenario();
  assert.deepEqual(codes(errorsOf(state, env, [recruit('o1', 'wachfeuer@1')])), ['target']);
  assert.deepEqual(codes(errorsOf(state, env, [{ id: 'o1', type: 'recruit', params: { type: 'speerwall@1', settlement: 's-esk' } }])), ['target']);
  state.peoples.hochweide.resources.material = 1;
  assert.deepEqual(codes(errorsOf(state, env, [recruit()])), ['cost'], 'speerwall costs 2 material');
  state.peoples.hochweide.resources.material = 3;
  state.peoples.hochweide.resources.nahrung = 6;
  state.peoples.hochweide.population.core = 6;
  assert.deepEqual(codes(errorsOf(state, env, [recruit('o1'), recruit('o2')])), ['cost'], 'two speerwall need 4 material, the opening stock holds 3');
  const pv = preview(state, env, { ...emptyDraft(state, 'hochweide'), orders: [recruit('o1', 'reiterschar@1')] }, { as: 'hochweide' });
  assert.deepEqual(pv.costs, { nahrung: 2, herden: 1 });
});

test('recruit season: the unit appears in the settlement, costs are paid, it is ready next season', () => {
  const { env, state } = scenario();
  const season = play(state, env, [recruit()]);
  const u = season.state.peoples.hochweide.units;
  assert.equal(u.length, 1);
  assert.deepEqual({ ...u[0] }, { id: 'u-1', type: 'speerwall@1', strength: 3, tile: '0,1', state: 'ready', since: 0 });
  assert.equal(season.state.peoples.hochweide.modules.militaer.recruited, 1);
  const paid = season.events.filter((e) => e.kind === 'order.cost').map((e) => [e.change.field, e.change.delta]).sort();
  assert.deepEqual(paid, [['resources.material', -2], ['resources.nahrung', -1]]);
  assert.deepEqual(errorsOf(season.state, env, [move('o1', 'u-1', '0,2')]), [], 'ready next season');
  assert.ok(season.events.some((e) => e.kind === 'unit.spawn' && e.visibleTo.includes('hochweide')));
});

test('move: within the budget of mobility x movePoints half steps, not onto the own tile', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,1')];
  assert.deepEqual(errorsOf(state, env, [move('o1', 'u-1', '0,2')]), []);
  assert.deepEqual(errorsOf(state, env, [move('o1', 'u-1', '0,3')]), [], 'two alm steps cost 4 half steps, the budget of mobility 1');
  assert.deepEqual(codes(errorsOf(state, env, [move('o1', 'u-1', '0,4')])), ['target']);
  assert.deepEqual(codes(errorsOf(state, env, [move('o1', 'u-1', '0,1')])), ['target']);
  assert.deepEqual(codes(errorsOf(state, env, [move('o1', 'u-9', '0,2')])), ['target']);
  state.peoples.hochweide.units.push(unit('u-2', 'reiterschar@1', '0,1'));
  assert.deepEqual(errorsOf(state, env, [move('o1', 'u-2', '0,4')]), [], 'mobility 3 reaches further');
});

test('move: a road makes a tile reachable that was not', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,1')];
  const far = [move('o1', 'u-1', '0,4')];
  assert.deepEqual(codes(errorsOf(state, env, far)), ['target']);
  const path = route(state, env.world(7), '0,1', '0,4').path.slice(1);
  assert.deepEqual(path, ['0,2', '0,3', '0,4']);
  for (const k of path) state.map.features[k] = { id: `weg-${k.replace(',', 'x')}`, kind: RULES.roadKind, name: 'Weg', tags: ['weg'], resources: [], since: 0, source: 'kernel' };
  assert.deepEqual(errorsOf(state, env, far), []);
  assert.equal(play(state, env, far).state.peoples.hochweide.units[0].tile, '0,4');
});

test('move: refused onto foreign units or settlements and for units that are not ready', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,1'), spear('u-2', '0,1', { state: 'routed' }), spear('u-3', '0,1', { state: 'moved' })];
  state.peoples.esk.units = [spear('e-1', '0,2')];
  settlementAt(state, 'glutreiter').tile = '1,1';
  assert.deepEqual(codes(errorsOf(state, env, [move('o1', 'u-1', '0,2')])), ['target']);
  assert.deepEqual(codes(errorsOf(state, env, [move('o1', 'u-1', '1,1')])), ['target']);
  assert.deepEqual(codes(errorsOf(state, env, [move('o1', 'u-2', '-1,2')])), ['target']);
  assert.deepEqual(codes(errorsOf(state, env, [move('o1', 'u-3', '-1,2')])), ['target']);
});

test('move season: the unit ends on the tile, ready, and a second order for the same unit is skipped with a notice', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,1')];
  const season = play(state, env, [move('o1', 'u-1', '0,2'), move('o2', 'u-1', '-1,2')]);
  const u = unitOf(season.state, 'hochweide', 'u-1');
  assert.equal(u.tile, '0,2');
  assert.equal(u.state, 'ready');
  assert.ok(season.events.some((e) => e.kind === 'move.skipped' && e.target.id === 'u-1'));
});

test('attack: needs a ready adjacent unit and a foreign unit or settlement on the tile', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,1'), spear('u-2', '0,1', { state: 'routed' }), spear('u-3', '-1,2')];
  state.peoples.esk.units = [spear('e-1', '0,0')];
  assert.deepEqual(errorsOf(state, env, [attack('o1', ['u-1'], '0,0')]), []);
  assert.deepEqual(codes(errorsOf(state, env, [attack('o1', ['u-2'], '0,0')])), ['target'], 'routed');
  assert.deepEqual(codes(errorsOf(state, env, [attack('o1', ['u-3'], '0,0')])), ['target'], 'not adjacent');
  assert.deepEqual(codes(errorsOf(state, env, [attack('o1', ['u-1'], '0,2')])), ['target'], 'nobody there');
  assert.deepEqual(codes(errorsOf(state, env, [attack('o1', [], '0,0')])), ['target']);
  assert.deepEqual(codes(errorsOf(state, env, [attack('o1', ['u-1'], 'x')])), ['target']);
});

test('attack probe: target from ratio and terrain, extra modifiers from the defender', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,1', { strength: 4 })];
  state.peoples.esk.units = [spear('e-1', '1,1', { strength: 3 })];
  settlementAt(state, 'esk').tile = '1,1';
  addStatus(state, 'esk', 'wall', [{ op: 'stat.mod', stat: 'verteidigung', amount: 1 }]);
  const pv = preview(state, env, { ...emptyDraft(state, 'hochweide'), orders: [attack('o1', ['u-1'], '1,1')] }, { as: 'hochweide' });
  const p = pv.probes.find((x) => x.order === 'o1');
  // A 4 against D 3 + garrison 2: 2A = 8 > 5, 3A = 12 > 10, so step 0; alm gives no terrain bonus.
  assert.equal(p.kind, 'attack');
  assert.equal(p.target, 5);
  assert.deepEqual(p.modifiers.map((m) => [m.source, m.value]), [['defender:verteidigung', -1]]);
  assert.ok(p.tags.includes('angriff'));
  assert.ok(p.tags.includes('krieg'));
});

test('attack season, success: the defender falls, the attacker moves in, war is declared', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,1')];
  state.peoples.esk.units = [spear('e-1', '0,0', { strength: 1 })];
  const season = play(state, env, [attack('o1', ['u-1'], '0,0')], { bands: { o1: 'success' } });
  assert.deepEqual(season.state.peoples.esk.units, []);
  const u = unitOf(season.state, 'hochweide', 'u-1');
  assert.equal(u.tile, '0,0');
  assert.equal(u.state, 'ready');
  assert.equal(season.state.relations[relKey('hochweide', 'esk')].atWar, true);
  assert.ok(season.report.sections.orders.some((o) => o.id === 'o1' && o.band === 'success'));
});

test('attack season, failure: routed units cannot act next season and recover after one', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,1', { strength: 9 })];
  state.peoples.esk.units = [spear('e-1', '0,0', { strength: 9 })];
  const first = play(state, env, [attack('o1', ['u-1'], '0,0')], { bands: { o1: 'failure' } });
  const u = unitOf(first.state, 'hochweide', 'u-1');
  assert.equal(u.state, 'routed');
  assert.equal(u.tile, '0,1');
  assert.ok(u.strength < 9);
  assert.deepEqual(first.state.peoples.esk.units.map((x) => x.strength), [9]);

  assert.deepEqual(codes(errorsOf(first.state, env, [move('o1', 'u-1', '0,2')])), ['target']);
  assert.deepEqual(codes(errorsOf(first.state, env, [attack('o1', ['u-1'], '0,0')])), ['target']);
  assert.deepEqual(errorsOf(first.state, env, [{ id: 'o1', type: 'retreat', params: { unit: 'u-1' } }]).map((e) => e.code), ['target'], 'already at home');

  const second = play(first.state, env, []);
  assert.equal(unitOf(second.state, 'hochweide', 'u-1').state, 'ready');
  assert.deepEqual(errorsOf(second.state, env, [move('o1', 'u-1', '0,2')]), []);
});

test('retreat: moves along the road-aware route towards the home settlement as far as the budget allows', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,4'), spear('u-2', '0,3', { state: 'routed' }), spear('u-3', '0,1')];
  const retreat = (u) => ({ id: 'o1', type: 'retreat', params: { unit: u } });
  assert.deepEqual(errorsOf(state, env, [retreat('u-1')]), []);
  assert.deepEqual(codes(errorsOf(state, env, [retreat('u-3')])), ['target'], 'already home');
  assert.deepEqual(codes(errorsOf(state, env, [retreat('u-9')])), ['target']);
  const a = play(state, env, [retreat('u-1')]);
  assert.equal(unitOf(a.state, 'hochweide', 'u-1').tile, '0,2', 'mobility 1 covers two alm steps of the three');
  const b = play(state, env, [retreat('u-2')]);
  assert.equal(unitOf(b.state, 'hochweide', 'u-2').tile, '0,1', 'a routed unit may retreat and gets home');
  assert.equal(unitOf(b.state, 'hochweide', 'u-2').state, 'ready');
});

test('ausfall: locked without an unlock, a sortie from an own village with garrison, the attackers stay', () => {
  const { env, state } = scenario();
  state.map.settlements.push({ id: 'x-village', name: 'Hochdorf', people: 'hochweide', kind: 'dorf', tile: '0,2', regionId: '-1:0:0', mobile: false, buildings: [] });
  state.peoples.hochweide.units = [spear('u-1', '0,2')];
  state.peoples.esk.units = [spear('e-1', '0,3', { strength: 1 })];
  const sortie = [{ id: 'o1', type: 'ausfall', params: { settlement: 'x-village', tile: '0,3' } }];
  assert.deepEqual(codes(errorsOf(state, env, sortie)), ['locked_order']);
  addStatus(state, 'hochweide', 'unlock', [{ op: 'order.unlock', order: 'ausfall' }]);
  assert.deepEqual(errorsOf(state, env, sortie), []);
  const pv = preview(state, env, { ...emptyDraft(state, 'hochweide'), orders: sortie }, { as: 'hochweide' });
  assert.ok(pv.probes.find((p) => p.order === 'o1').tags.includes('befestigung'));
  assert.deepEqual(codes(errorsOf(state, env, [{ id: 'o1', type: 'ausfall', params: { settlement: 's-hochweide', tile: '0,2' } }])), ['target'], 'a camp has no sortie');

  const season = play(state, env, sortie, { bands: { o1: 'success' } });
  assert.deepEqual(season.state.peoples.esk.units, []);
  assert.equal(unitOf(season.state, 'hochweide', 'u-1').tile, '0,2');
  assert.equal(season.state.map.settlements.find((s) => s.id === 'x-village').people, 'hochweide');
});

test('raubzug: locked without an unlock; loot by the ratio probe, units stay', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,1')];
  const raid = [{ id: 'o1', type: 'raubzug', params: { units: ['u-1'], region: '0:-1:1' } }];
  assert.deepEqual(codes(errorsOf(state, env, raid)), ['locked_order']);
  addStatus(state, 'hochweide', 'unlock', [{ op: 'order.unlock', order: 'raubzug' }]);
  assert.deepEqual(errorsOf(state, env, raid), []);
  const pv = preview(state, env, { ...emptyDraft(state, 'hochweide'), orders: raid }, { as: 'hochweide' });
  const p = pv.probes.find((x) => x.order === 'o1');
  assert.equal(p.kind, 'raubzug');
  assert.equal(p.target, 3, 'D 0 gives step -2');
  assert.ok(p.tags.includes('beute'));
  const own = [{ id: 'o1', type: 'raubzug', params: { units: ['u-1'], region: '-1:0:0' } }];
  assert.deepEqual(codes(errorsOf(state, env, own)), ['target']);

  const season = play(state, env, raid, { bands: { o1: 'success' } });
  const loot = season.events.filter((e) => e.reason.includes('plundered') || e.reason.includes('loot'));
  assert.equal(loot.length, 2);
  const taken = loot.find((e) => e.target.id === 'esk').change.delta;
  const given = loot.find((e) => e.target.id === 'hochweide').change.delta;
  assert.ok(taken < 0 && given === -taken);
  assert.equal(season.state.relations[relKey('hochweide', 'esk')].atWar, true);
  const u = unitOf(season.state, 'hochweide', 'u-1');
  assert.equal(u.tile, '0,1');
  assert.equal(u.state, 'ready');
});

test('raubzug failure: the raiders are routed for the next season', () => {
  const { env, state } = scenario();
  state.peoples.hochweide.units = [spear('u-1', '0,1', { strength: 9 })];
  addStatus(state, 'hochweide', 'unlock', [{ op: 'order.unlock', order: 'raubzug' }]);
  const raid = [{ id: 'o1', type: 'raubzug', params: { units: ['u-1'], region: '0:-1:1' } }];
  const season = play(state, env, raid, { bands: { o1: 'failure' } });
  const u = unitOf(season.state, 'hochweide', 'u-1');
  assert.equal(u.state, 'routed');
  assert.ok(u.strength < 9);
});

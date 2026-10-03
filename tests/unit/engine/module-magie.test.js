import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYER, PARTNER, startState, hochlandEnv, magieEnv, edited, learn, withResources, atTurn, contextOf, runHook,
  resolveOrder, checkOrders, rolledDraft, season, uncoveredPaths, BAND_AMOUNT, LABELS,
} from '../../fixtures/engine/k1/modules.js';
import magie from '../../../engine/modules/magie.js';
import { activeModules } from '../../../engine/modules/index.js';
import { catalogueFor } from '../../../engine/core/orders.js';
import { regionAt } from '../../../engine/core/map.js';
import { distance, parseKey } from '../../../engine/world/index.js';
import { homeSettlement, relKey } from '../../../engine/core/state.js';

const env = magieEnv();
const world = env.world(7);
const start = startState(env);
const home = homeSettlement(start, PLAYER);
const known = Object.keys(start.map.known[PLAYER]);
const edge = [...known].sort((a, b) => distance(parseKey(home.tile), parseKey(b)) - distance(parseKey(home.tile), parseKey(a)) || (a < b ? -1 : 1))[0];
const visible = known.filter((k) => start.map.known[PLAYER][k] === 'visible' && k !== home.tile).sort()[0];
const eskRegion = regionAt(world, homeSettlement(start, PARTNER).tile);
// The player learns the test discipline, holds source stock and a slice, and stands next to an esk unit.
const mage = edited(withResources(learn(start, PLAYER, 'zirkelkunst@1'), PLAYER, { rauchkraut: 4 }), (s) => {
  s.peoples[PLAYER].modules.magie = { withdrawal: {}, uses: {} };
  s.peoples[PLAYER].units.push({ id: 'u-1', type: 'speerwall@1', strength: 3, tile: home.tile, state: 'moved', since: 0 });
  s.peoples[PARTNER].units.push({ id: 'u-7', type: 'speerwall@1', strength: 3, tile: visible, state: 'moved', since: 0 });
});
const use = (application, target) => ({ development: 'zirkelkunst@1', application, ...(target === undefined ? {} : { target }) });
const errors = (issues) => issues.filter((i) => i.severity === 'error');
const order = (application, target) => [{ id: 'o1', type: 'discipline.use', params: use(application, target) }];
const def = magie.orders['discipline.use'];
const material = (s) => s.peoples[PLAYER].resources.material;

test('fixture precondition: a known edge tile, a visible tile and a known foreign region exist', () => {
  assert.ok(edge && visible);
  assert.ok(known.some((k) => regionAt(world, k) === eskRegion), 'part of the esk region is known');
});

test('magie is inactive without a disziplin and its order is locked', () => {
  assert.equal(magie.always, false);
  assert.equal(activeModules(start, env, PLAYER).some((m) => m.id === 'magie'), false);
  assert.ok(checkOrders(start, env, PLAYER, order('stille')).issues.some((i) => i.code === 'locked_order'));
  const cat = catalogueFor(start, env, PLAYER).find((c) => c.type === 'discipline.use');
  assert.equal(cat.available, false);
  assert.match(cat.reason, /magie is not active/);
});

test('a disziplin activates magie, with or without a module.activate effect, and the source binds from the world', () => {
  const viaEffect = learn(start, PLAYER, 'ahnensprache@1');
  assert.deepEqual(activeModules(viaEffect, env, PLAYER).find((m) => m.id === 'magie').bind, { source: 'rauchkraut' });
  const viaDiscipline = activeModules(mage, env, PLAYER).find((m) => m.id === 'magie');
  assert.deepEqual(viaDiscipline.bind, { source: 'rauchkraut' }, 'moduleBindings of the world');
  const suspended = edited(mage, (s) => { s.peoples[PLAYER].developments.known.find((k) => k.ref === 'zirkelkunst@1').state = 'suspended'; });
  assert.equal(activeModules(suspended, env, PLAYER).some((m) => m.id === 'magie'), false);
  const notYet = edited(mage, (s) => { s.peoples[PLAYER].developments.known.find((k) => k.ref === 'zirkelkunst@1').effectiveFrom = 1; });
  assert.equal(activeModules(notYet, env, PLAYER).some((m) => m.id === 'magie'), false, 'acts from the effective season');
});

test('real Hochland: the first disziplin activates magie and the world binds the source to opfer', () => {
  const real = hochlandEnv();
  const s = learn(startState(real), startState(real).campaign.player, 'rauchschau@1');
  const pid = s.campaign.player;
  assert.deepEqual(activeModules(s, real, pid).find((m) => m.id === 'magie').bind, { source: 'opfer' });
  assert.equal(activeModules(startState(real), real, pid).some((m) => m.id === 'magie'), false);
});

test('initial slice and the descriptor', () => {
  assert.deepEqual(magie.initPeople(), { withdrawal: {}, uses: {} });
  assert.deepEqual(magie.resourceRoles, [{ role: 'source', defaultId: null }]);
  assert.deepEqual(magie.views, [{ id: 'magie', labelKey: 'view.magie', icon: 'flame', order: 50, scope: 'people', sections: ['disciplines', 'sources', 'withdrawal'] }]);
  for (const k of magie.labelKeys) assert.ok(Object.hasOwn(LABELS, k), `${k} is missing in labels.json`);
  assert.ok(magie.agentHints.tags.includes('magie'));
});

test('slot and tags come from the application', () => {
  const entry = (app, target) => checkOrders(mage, env, PLAYER, order(app, target)).entries[0];
  assert.equal(entry('stille').slot, 'minor');
  assert.deepEqual(entry('stille').tags, ['magie', 'geist']);
  const main = entry('weihe', edge);
  assert.equal(main.slot, 'main');
  assert.ok(main.tags.includes('befohlen'));
});

test('check: development and application must exist, target by target kind', () => {
  const bad = (params) => errors(checkOrders(mage, env, PLAYER, [{ id: 'o1', type: 'discipline.use', params }]).issues);
  assert.equal(bad(use('stille')).length, 0);
  assert.equal(bad({ development: 'sippenrat@1', application: 'stille' }).length, 1, 'not a disziplin');
  assert.equal(bad({ development: 'ahnensprache@1', application: 'fernschau', target: edge }).length, 1, 'not known');
  assert.equal(bad({ development: 'zirkelkunst@1', application: 'unbekannt' }).length, 1, 'no such application');
  assert.equal(bad(use('stille', 'ignored')).length, 0, 'target none is ignored');
  // tile
  assert.equal(bad(use('sicht', edge)).length, 0);
  assert.equal(bad(use('sicht', '999,999')).length, 1, 'unknown tile');
  assert.equal(bad(use('sicht')).length, 1, 'missing target');
  // region: an id or a tile key of a known region
  assert.equal(bad(use('weihe', eskRegion)).length, 0);
  assert.equal(bad(use('weihe', known.find((k) => regionAt(world, k) === eskRegion))).length, 0);
  assert.equal(bad(use('weihe', '99:99:0')).length, 1);
  assert.equal(bad(use('weihe', 'esk')).length, 1);
  // people
  assert.equal(bad(use('gruss', PARTNER)).length, 0);
  assert.equal(bad(use('gruss', PLAYER)).length, 1, 'oneself');
  assert.equal(bad(use('gruss', 'niemand')).length, 1);
  // member
  assert.equal(bad(use('rufen', 'ulrun')).length, 0);
  assert.equal(bad(use('rufen', 'vesna')).length, 1, 'a member of another people');
  // unit: own by bare id or qualified, foreign only when its tile is visible
  assert.equal(bad(use('bann', 'u-1')).length, 0);
  assert.equal(bad(use('bann', `${PLAYER}:u-1`)).length, 0);
  assert.equal(bad(use('bann', `${PARTNER}:u-7`)).length, 0);
  assert.equal(bad(use('bann', 'u-7')).length, 1, 'a foreign unit needs its owner');
  assert.equal(bad(use('bann', `${PARTNER}:u-9`)).length, 1);
  const hidden = edited(mage, (s) => { s.map.known[PLAYER][visible] = 'seen'; });
  assert.equal(errors(checkOrders(hidden, env, PLAYER, order('bann', `${PARTNER}:u-7`)).issues).length, 1, 'not seen at present');
});

test('plan: the cost of the application against the opening stock, probe from the application', () => {
  const chk = checkOrders(mage, env, PLAYER, order('sicht', edge));
  assert.deepEqual(chk.costs, { rauchkraut: 1 });
  const p = chk.probes.find((x) => x.order === 'o1');
  assert.equal(p.kind, 'discipline.use');
  assert.equal(p.target, 5);
  assert.deepEqual(p.tags, ['magie', 'geist']);
  assert.ok(p.modifiers.every((m) => m.source !== 'withdrawal'));
  const empty = withResources(mage, PLAYER, { rauchkraut: 0 });
  assert.ok(errors(checkOrders(empty, env, PLAYER, order('sicht', edge)).issues).some((i) => i.code === 'cost'));
});

test('withdrawal of the source lowers the probe by its level', () => {
  const level = (n) => edited(mage, (s) => { s.peoples[PLAYER].modules.magie.withdrawal = { rauchkraut: n }; });
  const mod = (s) => checkOrders(s, env, PLAYER, order('stille')).probes.find((x) => x.order === 'o1').modifiers.find((m) => m.source === 'withdrawal');
  assert.equal(mod(mage), undefined);
  assert.equal(mod(level(1)).value, -1);
  assert.equal(mod(level(2)).value, -2);
  const other = edited(mage, (s) => { s.peoples[PLAYER].modules.magie.withdrawal = { psil: 3 }; });
  assert.equal(mod(other), undefined, 'only the withdrawal of the discipline source counts');
});

for (const [band, amount] of Object.entries(BAND_AMOUNT)) {
  test(`resolution in band ${band} applies the outcomes of that band and counts the use`, () => {
    const { tc, errors: e } = resolveOrder(mage, env, PLAYER, def, use('stille'), band);
    assert.deepEqual(e, []);
    assert.equal(material(tc.state), material(mage) + amount);
    assert.equal(tc.state.peoples[PLAYER].modules.magie.uses.stille, 1);
    assert.ok(tc.hooks.some((h) => h.people === PLAYER && h.hook === 'use:stille'), 'the meter hook of the application');
    assert.deepEqual(uncoveredPaths(tc, PLAYER), []);
    const twice = resolveOrder(tc.state, env, PLAYER, def, use('stille'), band);
    assert.equal(twice.tc.state.peoples[PLAYER].modules.magie.uses.stille, 2);
  });
}

test('outcome targets: tile reveals around the tile, region and people and member and unit reach their primitives', () => {
  const sicht = resolveOrder(mage, env, PLAYER, def, use('sicht', edge), 'success').tc;
  assert.ok(Object.keys(sicht.state.map.known[PLAYER]).length > known.length, 'radius 1 around the edge tile shows new tiles');

  const weihe = resolveOrder(mage, env, PLAYER, def, use('weihe', eskRegion), 'success').tc;
  assert.equal(weihe.state.map.control[eskRegion], PLAYER);
  const byTile = resolveOrder(mage, env, PLAYER, def, use('weihe', known.find((k) => regionAt(world, k) === eskRegion)), 'success').tc;
  assert.equal(byTile.state.map.control[eskRegion], PLAYER, 'a tile key names its region');

  const gruss = resolveOrder(mage, env, PLAYER, def, use('gruss', PARTNER), 'success').tc;
  assert.equal(gruss.state.relations[relKey(PLAYER, PARTNER)].value, 1);

  const rufen = resolveOrder(mage, env, PLAYER, def, use('rufen', 'torhild'), 'success').tc;
  const torhild = rufen.state.peoples[PLAYER].council.find((m) => m.id === 'torhild');
  assert.equal(torhild.hollow, true);

  const own = resolveOrder(mage, env, PLAYER, def, use('bann', 'u-1'), 'success').tc;
  assert.equal(own.state.peoples[PLAYER].units.find((u) => u.id === 'u-1').strength, 2);
  const foreign = resolveOrder(mage, env, PLAYER, def, use('bann', `${PARTNER}:u-7`), 'success').tc;
  assert.equal(foreign.state.peoples[PARTNER].units.find((u) => u.id === 'u-7').strength, 2);
  for (const tc of [sicht, weihe, gruss, rufen, own, foreign]) assert.deepEqual(uncoveredPaths(tc, PLAYER), []);
  // Other bands leave the target alone: the band-specific outcome list only moves material.
  const miss = resolveOrder(mage, env, PLAYER, def, use('gruss', PARTNER), 'failure').tc;
  assert.equal(miss.state.relations[relKey(PLAYER, PARTNER)].value, 0);
});

test('through a full season: the source is consumed, the outcome applies, the use is counted', () => {
  const s = edited(mage, (x) => {
    x.peoples[PLAYER].developments.known = x.peoples[PLAYER].developments.known.filter((k) => k.ref !== 'sippenrat@1');
    x.peoples[PLAYER].developments.instituted = [];
  });
  const draft = rolledDraft(s, env, PLAYER, order('stille'), { roll: { o1: 5 } });
  const r = season(s, env, { [PLAYER]: draft });
  const cost = r.events.find((e) => e.kind === 'order.cost' && e.target.id === PLAYER);
  assert.deepEqual([cost.change.field, cost.change.delta], ['resources.rauchkraut', -1]);
  assert.equal(r.report.sections.orders.find((o) => o.people === PLAYER && o.id === 'o1').band, 'narrow', 'roll 5 against target 5');
  assert.ok(r.events.some((e) => e.target.id === PLAYER && e.change?.field === 'resources.material' && e.change.delta === BAND_AMOUNT.narrow && /Anwendung stille/.test(e.reason)));
  assert.equal(r.state.peoples[PLAYER].modules.magie.uses.stille, 1);
});

const unpaid = (pid, res) => ({ [pid]: Object.fromEntries(res.map((r) => [r, true])) });
const withdrawalAfter = (state, scratch) => {
  const tc = contextOf(state, env);
  tc.scratch.dependencyUnpaid = scratch;
  runHook(tc, 'upkeep', PLAYER);
  return tc;
};
const levelOf = (tc, res = 'rauchkraut') => tc.state.peoples[PLAYER].modules.magie.withdrawal[res] ?? 0;

test('an unpaid dependency raises the withdrawal by one, up to three', () => {
  let s = mage;
  for (const expected of [1, 2, 3, 3]) {
    const tc = withdrawalAfter(s, unpaid(PLAYER, ['rauchkraut']));
    assert.equal(levelOf(tc), expected);
    assert.deepEqual(uncoveredPaths(tc, PLAYER), []);
    s = tc.state;
  }
  const tc = withdrawalAfter(mage, unpaid(PLAYER, ['rauchkraut', 'psil']));
  assert.equal(levelOf(tc, 'psil'), 1, 'every resource has its own level');
  assert.equal(levelOf(withdrawalAfter(mage, unpaid(PARTNER, ['rauchkraut']))), 0, 'another people owes');
  assert.equal(withdrawalAfter(mage, undefined).log.length, 0);
});

test('a raised level falls by one at the end of a year paid without a gap', () => {
  const raised = (n) => edited(mage, (s) => { s.peoples[PLAYER].modules.magie.withdrawal = { rauchkraut: n }; });
  const yearEnd = (s) => atTurn(s, 3);
  assert.equal(levelOf(withdrawalAfter(yearEnd(raised(2)), {})), 1);
  assert.equal(levelOf(withdrawalAfter(yearEnd(raised(1)), {})), 0);
  assert.equal(levelOf(withdrawalAfter(yearEnd(raised(0)), {})), 0, 'never below zero');
  assert.equal(levelOf(withdrawalAfter(atTurn(raised(2), 1), {})), 2, 'only at the year end');
  assert.equal(levelOf(withdrawalAfter(yearEnd(raised(2)), unpaid(PLAYER, ['rauchkraut']))), 3, 'an unpaid season raises instead');
});

test('real Hochland: Psilschau fernblick uses psil, reveals tiles and fires its meter hook', () => {
  const real = hochlandEnv();
  const base = startState(real);
  const pid = base.campaign.player;
  const s = edited(withResources(learn(base, pid, 'rauchschau@1'), pid, { psil: 2 }), (x) => { x.peoples[pid].modules.magie = { withdrawal: {}, uses: {} }; });
  const tile = Object.keys(s.map.known[pid]).sort((a, b) => distance(parseKey(homeSettlement(s, pid).tile), parseKey(b)) - distance(parseKey(homeSettlement(s, pid).tile), parseKey(a)) || (a < b ? -1 : 1))[0];
  const chk = checkOrders(s, real, pid, [{ id: 'o1', type: 'discipline.use', params: { development: 'rauchschau@1', application: 'fernblick', target: tile } }]);
  assert.deepEqual(errors(chk.issues), []);
  assert.deepEqual(chk.costs, { psil: 1 });
  assert.equal(chk.entries[0].slot, 'minor');
  const { tc } = resolveOrder(s, real, pid, def, { development: 'rauchschau@1', application: 'fernblick', target: tile }, 'success');
  assert.ok(Object.keys(tc.state.map.known[pid]).length > Object.keys(s.map.known[pid]).length);
  assert.ok(tc.hooks.some((h) => h.hook === 'use:fernblick'));
});

test('real Hochland: a target-less application (blutopfer) pays herden and its outcomes are the band list', () => {
  const real = hochlandEnv();
  const base = startState(real);
  const pid = base.campaign.player;
  const s = edited(learn(base, pid, 'blutritus@1'), (x) => { x.peoples[pid].modules.magie = { withdrawal: {}, uses: {} }; x.peoples[pid].resources.herden = 4; });
  const params = { development: 'blutritus@1', application: 'blutopfer' };
  const chk = checkOrders(s, real, pid, [{ id: 'o1', type: 'discipline.use', params }]);
  assert.deepEqual(errors(chk.issues), []);
  assert.deepEqual(chk.costs, { herden: 2 });
  const { tc } = resolveOrder(s, real, pid, def, params, 'success');
  assert.equal(tc.state.peoples[pid].resources.opfer, (s.peoples[pid].resources.opfer ?? 0) + 3);
});

test('derive lists disciplines, source stock and withdrawal', () => {
  const s = edited(mage, (x) => { x.peoples[PLAYER].modules.magie = { withdrawal: { rauchkraut: 2 }, uses: { sicht: 3 } }; });
  const d = magie.hooks.derive(s, env, PLAYER, { id: 'magie', bind: { source: 'rauchkraut' } });
  assert.equal(d.disciplines[0].ref, 'zirkelkunst@1');
  assert.equal(d.disciplines[0].applications.find((a) => a.id === 'sicht').uses, 3);
  assert.deepEqual(d.sources, { rauchkraut: 4 });
  assert.deepEqual(d.withdrawal, { rauchkraut: 2 });
});

test('refusals are machine-readable: code and reason per target kind', () => {
  const first = (s, params) => errors(checkOrders(s, env, PLAYER, [{ id: 'o1', type: 'discipline.use', params }]).issues)[0];
  const shape = (i) => [i.code, i.params];
  assert.deepEqual(shape(first(mage, { development: 'sippenrat@1', application: 'stille' })), ['target', { reason: 'not-application' }]);
  assert.deepEqual(shape(first(mage, use('sicht', '999,999'))), ['target', { reason: 'unknown-tile' }]);
  assert.deepEqual(shape(first(mage, use('weihe', '99:99:0'))), ['target', { reason: 'unknown-region' }]);
  assert.deepEqual(shape(first(mage, use('gruss', PLAYER))), ['target', { reason: 'not-other-people' }]);
  assert.deepEqual(shape(first(mage, use('rufen', 'vesna'))), ['target', { reason: 'not-own-member' }]);
  assert.deepEqual(shape(first(mage, use('bann', 'u-7'))), ['target', { reason: 'not-unit' }]);
  const hidden = edited(mage, (s) => { s.map.known[PLAYER][visible] = 'seen'; });
  assert.deepEqual(shape(first(hidden, use('bann', `${PARTNER}:u-7`))), ['target', { reason: 'unit-not-visible' }]);
});

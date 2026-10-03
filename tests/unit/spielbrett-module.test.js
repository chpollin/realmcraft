// tests/unit/spielbrett-module.test.js — module data of the Spielbrett
// (spielbrett/js/data/options.js, adapter trade routes) on a campaign the
// kernel CLI writes with trade, military, magic and way of life active
// (tests/fixtures/spielbrett/build-module.mjs). Expected values come from the
// kernel functions and the projection, not from literals.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildEnv, previewDraft } from '../../spielbrett/js/data/kernel.js';
import { makeLabels } from '../../spielbrett/js/data/labels.js';
import { draftFor } from '../../spielbrett/js/data/draft.js';
import { adoptCandidates, attackForecast, candidates, disciplineCandidates, marketQuote, moduleData, optionsFor, unitReach } from '../../spielbrett/js/data/options.js';
import { describeParams, tradeRoutes } from '../../spielbrett/js/data/adapter.js';
import { tradeRoute } from '../../engine/modules/handel.js';
import { distance, parseKey } from '../../engine/world/index.js';
import { createModuleCampaign } from '../fixtures/spielbrett/build-module.mjs';

const json = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../${p}`, import.meta.url)), 'utf8'));
const pack = {
  welt: json('welten/hochland/welt.json'),
  regeln: json('welten/hochland/regeln.json'),
  labels: json('welten/hochland/labels.json'),
  entwicklungen: json('welten/hochland/content/entwicklungen.json'),
  ereignisse: json('welten/hochland/content/ereignisse.json'),
  bestimmungen: json('welten/hochland/content/bestimmungen.json'),
};
const env = buildEnv(pack, []);
const t = makeLabels(pack.labels);

let root;
let fx;
let view;
let world;
let ctx;

before(() => {
  root = mkdtempSync(join(tmpdir(), 'rc-module-unit-'));
  fx = createModuleCampaign(root, 'unit');
  view = JSON.parse(readFileSync(join(fx.dir, 'view', 'bergnomaden.json'), 'utf8'));
  world = env.world(view.map.seed);
  const draft = draftFor(view, null);
  ctx = { view, env, t, draft, base: previewDraft(view, env, draft), world };
});

after(() => rmSync(root, { recursive: true, force: true }));

const at = (k) => { const { q, r } = parseKey(k); return { q, r }; };

describe('trade', () => {
  test('one route per people in contact; a reachable one follows the kernel trade route', () => {
    const routes = tradeRoutes(view, env, world, t);
    const rows = view.derived[view.people].trade.routes;
    assert.deepEqual(routes.map((r) => r.partner), rows.map((r) => r.partner));
    for (const r of routes) {
      const row = rows.find((x) => x.partner === r.partner);
      if (row.reachable) {
        assert.equal(r.state, 'open');
        assert.deepEqual(r.path, tradeRoute(view, world, view.people, r.partner).path.map(parseKey));
        assert.equal(r.label, t.fmt('board.trade.chip', { name: view.peoples[r.partner].name, n: row.length }));
      } else {
        assert.equal(r.state, 'closed');
        assert.deepEqual(r.path, []);
        assert.equal(r.reason, row.reason);
      }
    }
    assert.ok(routes.some((r) => r.state === 'open'), 'the fixture trades with a reachable partner');
  });

  test('module data are the derive hooks of the active modules on the projection', () => {
    const data = moduleData(view, env);
    assert.deepEqual(Object.keys(data).sort(), [...view.derived[view.people].modules].sort());
    assert.equal(data.militaer.units.length, view.peoples[view.people].units.length);
  });

  test('a market quote is null while the order would be refused', () => {
    assert.equal(marketQuote(view, env, { mode: 'buy', res: 'nahrung', amount: 0 }), null);
  });
});

describe('military', () => {
  test('a foreign unit in sight offers the attack first, with the bordering own units', () => {
    const list = candidates(view, env, { kind: 'unit', id: 'u-klan-1', ...at(fx.enemy) });
    assert.equal(list[0].type, 'attack');
    for (const id of list[0].params.units) {
      const u = view.peoples[view.people].units.find((x) => x.id === id);
      assert.equal(distance(parseKey(u.tile), parseKey(fx.enemy)), 1);
    }
    const opt = optionsFor(ctx, { kind: 'unit', id: 'u-klan-1', ...at(fx.enemy) }).find((o) => o.type === 'attack');
    assert.equal(opt.grund, null);
    assert.ok(opt.probe && opt.probe.chance >= 0);
    assert.deepEqual(opt.preview.tiles, [at(fx.enemy)]);
  });

  test('the battle forecast is the kernel battle rule: attack strength of the attackers against the defence', () => {
    const f = attackForecast(view, env, fx.enemy);
    const own = view.peoples[view.people].units.filter((u) => f.attackers.includes(u.id));
    assert.equal(f.A, own.reduce((n, u) => n + u.strength, 0));
    assert.ok(f.D > 0);
    assert.equal(attackForecast(view, env, fx.camp), null, 'no attack on an own tile');
  });

  test('an attack names what it attacks', () => {
    const name = describeParams(view, env, t, { type: 'attack', params: { units: ['u-speer-1'], tile: fx.enemy } }, world);
    assert.equal(name, `${env.entwicklung('speertraeger@1').name}, ${view.peoples.schaedelklan.name}`);
    assert.equal(describeParams(view, env, t, { type: 'retreat', params: { unit: 'u-speer-1' } }, world), env.entwicklung('speertraeger@1').name);
  });

  test('reach and sight of an own unit: tiles within the move budget, sight as the vision rule reveals it', () => {
    const r = unitReach(view, env, world, 'u-speer-1');
    assert.ok(r.tiles.length > 0);
    assert.ok(!r.tiles.includes(fx.unit));
    assert.ok(r.sight.includes(fx.unit) && r.sight.includes(fx.enemy));
    assert.equal(unitReach(view, env, world, 'u-klan-1'), null, 'a foreign unit has no reach on the board');
  });
});

describe('magic and way of life', () => {
  test('applications become candidates on the target kind they aim at', () => {
    const tile = disciplineCandidates(view, env, 'tile', fx.camp);
    assert.ok(tile.length > 0);
    assert.ok(tile.every((c) => c.type === 'discipline.use' && c.params.target === fx.camp));
    assert.deepEqual(disciplineCandidates(view, env, 'member', 'x'), []);
    const opt = optionsFor(ctx, { kind: 'tile', ...at(fx.camp) }).find((o) => o.type === 'discipline.use');
    assert.equal(opt.ziel, describeParams(view, env, t, { type: 'discipline.use', params: tile[0].params }, world));
  });

  test('a known other way of life is offered as adopt', () => {
    assert.deepEqual(adoptCandidates(view, env), [{ type: 'adopt', params: { lebensweise: 'sesshaft@1' } }]);
  });
});

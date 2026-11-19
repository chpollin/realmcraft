import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createModuleCampaign } from '../fixtures/spielbrett/build-module.mjs';
import { startServer } from '../lib/server.mjs';

let root;
let server;
let base;

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-weltenstrom-'));
  createModuleCampaign(root, 'module');
  for (const proto of ['strom', 'astrolabium', 'naturgemaelde', 'webstuhl']) {
    createModuleCampaign(root, `studio-${proto}`);
  }
  server = await startServer(root, { demo: true, port: process.env.SPEC_PORT });
  base = `http://127.0.0.1:${server.port}`;
});

test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

test('Weltenstrom renders all 7 strata, updates labour flows, rolls probes/world events, seals season, and navigates back and forth', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.addInitScript(() => {
    localStorage.setItem('realmcraft.settings', JSON.stringify({ language: 'de', reduced: true }));
  });

  await page.goto(`${base}/spielbrett/strom.html?campaign=module`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');

  // 1. Verify all 7 strata render with non-empty SVG / Canvas graphics
  const strata = [
    '#stratum-himmel',
    '#stratum-siedlung',
    '#stratum-fluesse',
    '#stratum-karte',
    '#stratum-rat',
    '#stratum-wissen',
    '#stratum-zeit',
  ];
  for (const sel of strata) {
    const section = page.locator(sel);
    await expect(section).toBeVisible();
  }

  // Check SVG strata have child elements and positive bounding boxes
  for (const vizId of ['#viz-himmel', '#viz-fluesse', '#viz-rat', '#viz-wissen', '#viz-zeit']) {
    const svg = page.locator(`${vizId} svg.strom-svg`);
    await expect(svg).toBeVisible();
    const childCount = await svg.evaluate((el) => el.children.length);
    expect(childCount).toBeGreaterThan(3);
  }

  // Check Canvas strata (#strom-gemeinschaft and #karte) have non-empty pixel buffers
  for (const canvasSel of ['#strom-gemeinschaft', '#karte']) {
    const hasPixels = await page.locator(canvasSel).evaluate((c) => {
      if (c.width === 0 || c.height === 0) return false;
      const ctx = c.getContext('2d');
      const data = ctx.getImageData(0, 0, Math.min(c.width, 200), Math.min(c.height, 200)).data;
      for (let i = 3; i < data.length; i += 16) {
        if (data[i] > 0) return true;
      }
      return false;
    });
    expect(hasPixels).toBe(true);
  }

  // 2. Click a '+' labour button in #viz-sippen and verify live alluvial flow updates in #viz-fluesse
  const beforeFlows = await page.locator('#viz-fluesse svg').innerHTML();
  const researchPlus = page.locator('#viz-sippen [data-strom-arbeit="research"] button').last();
  await researchPlus.click();
  await expect(page.locator('#viz-sippen [data-strom-arbeit="research"] .sippen-wert')).toContainText('1');
  const afterFlows = await page.locator('#viz-fluesse svg').innerHTML();
  expect(afterFlows).not.toBe(beforeFlows);

  // 3. Queue an explore order with a probe, roll order probe & world event, and seal/advance season in demo mode
  const initialTurn = await page.evaluate(() => window.weltenstrom.game.view.turn);
  await page.evaluate(() => {
    const { game, model } = window.weltenstrom;
    const opts = game.optionsFor({ kind: 'tile', q: model.home.q, r: model.home.r });
    const explore = opts.find((o) => o.type === 'explore' && !o.grund);
    if (explore) game.addOption(explore);
  });

  const orderDie = page.locator('[data-strom-roll-order]').first();
  await expect(orderDie).toBeVisible();
  await expect(orderDie).toContainText('▸');
  await orderDie.click();

  const worldDie = page.locator('#strom-weltwurf');
  await expect(worldDie).toBeVisible();
  await worldDie.click();

  // Every rolled die in the timeline is a d10 glyph carrying the raw face value.
  await expect.poll(() => page.evaluate(() => {
    const { game } = window.weltenstrom;
    const values = Object.values(game.draft.rolls ?? {}).map((r) => String(r.value));
    const faces = [...document.querySelectorAll('#viz-zeit path[d^="M0 -13"]')]
      .map((p) => p.parentElement.querySelector('text')?.textContent);
    return values.length >= 2 && values.every((v) => faces.includes(v));
  })).toBe(true);

  // The fixture carries a pending choice, which the player answers explicitly
  // because the seal no longer answers it on the player's behalf.
  await page.evaluate(() => {
    const { game } = window.weltenstrom;
    for (const c of game.unansweredChoices()) game.setChoice(c.id, c.options[0]);
  });

  const seal = page.locator('#strom-zug-siegel');
  await expect(seal).toHaveAttribute('data-ready-seal', 'true');
  await seal.click();

  await expect.poll(
    () => page.evaluate(() => window.weltenstrom?.game?.view?.turn),
    { timeout: 30000 },
  ).toBe(initialTurn + 1);

  // 4. Verify navigation back to /spielbrett/ and back to /spielbrett/strom.html
  await page.locator('#strom-zurueck').click();
  await expect(page).toHaveURL(/\/spielbrett\/\?campaign=module/);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');

  while (await page.locator('#dlg-ereignis').isVisible()) {
    await page.locator('#dlg-ereignis .ereignis-fuss .btn-primary').click();
  }

  const streamLink = page.locator('#ansichten [data-ansicht="strom"]');
  await expect(streamLink).toBeVisible();
  await streamLink.click();
  await expect(page).toHaveURL(/\/spielbrett\/strom\.html\?campaign=module/);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');

  expect(errors).toEqual([]);
});

test('Weltenstrom seal leaves an unanswered pending choice to the player and hands over to the main board', async ({ page }) => {
  await page.goto(`${base}/spielbrett/strom.html?campaign=module`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');

  // The decision runs before the first await of endTurn, so the draft can be
  // inspected in the same task, before the navigation to the main board lands.
  const choice = await page.evaluate(() => {
    const { game } = window.weltenstrom;
    game.view.pendingChoices = [{ id: 'spec-choice', options: [{ id: 'a' }, { id: 'b' }] }];
    game.endTurn();
    return game.draft.choices?.['spec-choice'] ?? null;
  });
  expect(choice).toBeNull();
  await expect(page).toHaveURL(/\/spielbrett\/\?campaign=module/);
});


for (const proto of ['strom', 'astrolabium', 'naturgemaelde', 'webstuhl']) {
  test(`${proto} preserves a rolled order when switching views and withdrawing it`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('realmcraft.settings', JSON.stringify({ language: 'de', reduced: true }));
    });
    await page.goto(`${base}/spielbrett/strom.html?campaign=studio-${proto}&proto=${proto}`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    const order = await page.evaluate(() => {
      const { game, model } = window.weltenstrom;
      const option = game.optionsFor({ kind: 'tile', q: model.home.q, r: model.home.r })
        .find((o) => o.type === 'explore' && !o.grund);
      if (!option) throw new Error('Fixture has no available exploration');
      game.addOption(option);
      const row = model.orders.find((o) => o.type === 'explore');
      const probe = game.base.probes.find((p) => p.order === row.id);
      return { id: row.id, probe: probe.id, target: probe.target, canonicalProbe: row.probe };
    });
    expect(order.canonicalProbe).toBe(order.probe);
    const surface = proto === 'strom' ? page.locator('#viz-zeit') : page.locator('#proto-stage');
    const die = surface.locator(`[data-strom-roll-order="${order.id}"]`).first();
    await expect(die).toContainText(String(order.target));
    await die.press(proto === 'astrolabium' || proto === 'webstuhl' ? 'Space' : 'Enter');
    await expect.poll(() => page.evaluate((id) => window.weltenstrom.game.draft.rolls[id]?.value ?? null, order.probe))
      .not.toBeNull();
    await expect(surface.locator(`[data-strom-remove-order="${order.id}"]`).first()).toBeFocused();
    const roll = await page.evaluate((id) => window.weltenstrom.game.draft.rolls[id], order.probe);
    for (const other of ['strom', 'astrolabium', 'naturgemaelde', 'webstuhl', proto]) {
      await page.locator(`[data-proto="${other}"]`).click();
    }
    expect(await page.evaluate((id) => window.weltenstrom.model.orders.find((o) => o.id === id).probe, order.id))
      .toBe(order.probe);
    await surface.locator(`[data-strom-remove-order="${order.id}"]`).first().click();
    const withdrawn = await page.evaluate(({ id, probe }) => {
      const { draft } = window.weltenstrom.game;
      return { exists: draft.orders.some((o) => o.id === id), roll: draft.rolls[probe] ?? null,
        withdrawn: draft.withdrawn.find((r) => r.probe === probe) };
    }, order);
    expect(withdrawn).toEqual({ exists: false, roll: null, withdrawn: { probe: order.probe, ...roll } });
  });
}


test('Astrolabium exposes non-spatial main actions as withdrawable H seals', async ({ page }) => {
  await page.goto(`${base}/spielbrett/strom.html?campaign=module&proto=astrolabium`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const option = await page.evaluate(() => {
    const { game, model } = window.weltenstrom;
    const action = game.optionsFor({ kind: 'tile', q: model.home.q, r: model.home.r })
      .find((o) => o.type === 'adopt' && !o.grund);
    if (!action) throw new Error('Fixture has no way-of-life action');
    return { label: action.titel, main: action.art === 'haupt' };
  });
  expect(option.main).toBe(true);
  await page.locator('#proto-stage').getByRole('button', { name: new RegExp(`^${option.label}:`) }).first().click();
  const id = await page.evaluate(() => window.weltenstrom.game.draft.orders.find((o) => o.type === 'adopt').id);
  const seal = page.locator(`#proto-stage [data-strom-remove-order="${id}"]`).first();
  await expect(seal).toContainText('H');
  await seal.press('Space');
  expect(await page.evaluate((id) => window.weltenstrom.game.draft.orders.some((o) => o.id === id), id)).toBe(false);
  await expect(page.locator('#strom-zug-siegel')).toBeFocused();
});

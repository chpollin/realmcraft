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

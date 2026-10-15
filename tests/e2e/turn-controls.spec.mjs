import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { startServer } from '../lib/server.mjs';

let root;
let server;
let base;
let campaign = 0;

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-turn-controls-'));
  server = await startServer(root);
  base = `http://localhost:${server.port}`;
});
test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});
test.beforeEach(async ({ page }) => {
  const cid = `turn-controls-${++campaign}`;
  createHochland(root, cid);
  await page.addInitScript(() => localStorage.setItem('realmcraft.settings', JSON.stringify({ language: 'de' })));
  await page.goto(`${base}/spielbrett/?campaign=${cid}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
});

async function brokenDraft(page) {
  const data = await page.evaluate(async () => {
    const { regionOf } = await import('/engine/world/index.js');
    const g = window.spielbrett.game;
    const camp = g.view.map.settlements.find((s) => s.people === g.pid).tile;
    const foreign = Object.keys(g.view.map.known[g.pid]).find((key) => {
      const [q, r] = key.split(',').map(Number);
      const owner = g.view.map.control[regionOf(g.world, q, r)];
      return owner && owner !== g.pid;
    });
    return {
      campaign: g.cid,
      people: g.pid,
      draft: {
        ...g.draft,
        orders: [
          { id: 'o1', type: 'found', params: { tile: camp } },
          { id: 'o2', type: 'migrate', params: { tile: foreign } },
          { id: 'o3', type: 'explore', params: { tile: camp } },
        ],
        rolls: {
          [`T${g.view.turn}:${g.pid}:o9`]: { value: 4, fingerprint: '0123456789abcdef' },
          [`T${g.view.turn}:${g.pid}:o3`]: { value: 6, fingerprint: 'fedcba9876543210' },
        },
      },
    };
  });
  const response = await page.request.post(`${base}/api/draft`, { data });
  expect((await response.json()).stored).toBe(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`blocked turn is readable, dismissible and keeps keyboard focus at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await brokenDraft(page);
    const end = page.locator('#zug-beenden');
    const toggle = page.locator('#blocker [data-blocker="probleme"]');
    const list = page.locator('#blocker-liste');
    await expect(end).toHaveClass(/has-problems/);
    await expect(end).toHaveAccessibleName('Zug beenden, zuerst 4 Probleme, 2 Würfe offen');
    await expect(end.locator('.zb-sub')).toHaveText('4 Probleme, 2 Würfe offen');
    await expect(toggle).toBeVisible();
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(list).toBeVisible();
    await expect(toggle).toBeFocused();
    await expect(list.locator('.blocker-eintrag')).toHaveCount(6);
    const bounds = await list.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    const orphan = list.locator('.be-wurf-verwaist');
    await expect(orphan).toContainText('Die Probe dieses Wurfs gibt es nicht mehr');
    await expect(orphan).toContainText('Wurf 4');
    await expect(orphan).not.toContainText('passt nicht mehr');
    await page.screenshot({ path: testInfo.outputPath(`turn-blockers-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
    await expect(toggle).toBeFocused();
    await expect(page.locator('dialog[open]')).toHaveCount(0);

    await end.click();
    await expect(list).toBeVisible();
    await list.locator('[data-blocker-close]').click();
    await expect(list).toBeHidden();
    await expect(end).toBeFocused();

    await toggle.click();
    const withdraw = list.locator('[data-blocker-id="befehl-o1"] [data-zuruecknehmen]');
    await withdraw.focus();
    await page.keyboard.press('Enter');
    await expect(list.locator('[data-blocker-id="befehl-o1"]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement.closest('#blocker-liste')?.id)).toBe('blocker-liste');
    await page.locator('#zeit').click();
    await expect(list).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('order target and removal control remain readable and focused after a draft refresh', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await brokenDraft(page);
  const order = page.locator('#befehle [data-order-id="o3"]');
  await order.scrollIntoViewIfNeeded();
  await expect(order.locator('.befehl-ziel')).toBeVisible();
  expect(await order.locator('.befehl-ziel').innerText()).not.toBe('');
  const remove = order.getByRole('button', { name: 'Erkunden zurücknehmen' });
  await remove.focus();
  await page.evaluate(async () => {
    const { renderOrders } = await import('/spielbrett/js/ui/leiste.js');
    renderOrders(window.spielbrett);
  });
  await expect(remove).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(order).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement.closest('#befehle')?.id)).toBe('befehle');
});

test('open rolls stay actionable without falsely marking a problem', async ({ page }) => {
  const end = page.locator('#zug-beenden');
  await expect(end).not.toHaveClass(/has-problems/);
  await expect(end).toHaveClass(/has-rolls/);
  await expect(end.locator('.zb-sub')).toHaveText('1 Wurf offen');
  await end.click();
  await expect(page.locator('#dlg-probe')).toBeVisible();
  await expect(page.locator('#dlg-probe [data-wuerfeln]')).toBeVisible();
});
test('wide top bar names resources and canvas has a visible keyboard focus indicator', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  const resources = page.locator('#ressourcen .res-name');
  await expect(resources.first()).toBeVisible();
  await expect(resources.first()).toHaveText('Nahrung');
  await page.locator('#karte').focus();
  await expect.poll(() => page.locator('#karte').evaluate((canvas) => getComputedStyle(canvas).outlineStyle)).toBe('solid');
  await page.screenshot({ path: testInfo.outputPath('turn-bar-1800.png') });
});

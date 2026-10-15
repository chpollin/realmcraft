import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { REPO, startServer } from '../lib/server.mjs';

let root;
let server;
let base;
const cli = (...args) => JSON.parse(execFileSync(process.execPath, ['engine/cli.mjs', ...args, '--json'], { cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8' }));
const campaign = (id, file) => JSON.parse(readFileSync(join(root, 'campaigns', id, file), 'utf8'));

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-fresh-game-'));
  mkdirSync(join(root, 'campaigns'), { recursive: true });
  server = await startServer(root);
  base = `http://127.0.0.1:${server.port}`;
});

test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

async function newGame(page) {
  await page.goto(`${base}/spielbrett/`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.locator('#start-new').click();
  await page.locator('#ng-seed').fill('7');
}

for (const narrative of ['en', 'de']) {
  test(`a fresh game preserves the selected ${narrative} narrative`, async ({ page }) => {
    await newGame(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    if (narrative === 'de') await page.locator('#ng-erzaehlung-de').check();
    const response = page.waitForResponse((r) => r.url().endsWith('/api/campaigns') && r.request().method() === 'POST');
    await page.locator('#ng-start').click();
    const created = await response;
    expect(created.status()).toBe(201);
    const { id } = await created.json();
    await page.waitForURL(`**/spielbrett/?campaign=${id}`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    expect(campaign(id, 'view/bergnomaden.json').settings.language).toBe(narrative);
    cli('open', '--campaign', id);
    await expect.poll(() => page.evaluate(() => window.spielbrett.model.kernPhase), { timeout: 15000 }).toBe('planning');
  });
}

test('a failed create request shows a reason and can be retried', async ({ page }) => {
  await newGame(page);
  await page.route('**/api/campaigns', (route) => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
  await page.locator('#ng-start').click();
  await expect(page.locator('.start-fehler[role="alert"]')).toBeVisible();
  await expect(page.locator('#ng-start')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#ng-start')).toHaveAttribute('aria-disabled', 'false');
  await page.unroute('**/api/campaigns');
  await page.locator('#ng-start').click();
  await page.waitForURL('**/spielbrett/?campaign=*');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
});

for (const width of [1440, 390]) {
  test(`labour assigns real research, keeps focus and survives reload at ${width}px`, async ({ page }, testInfo) => {
    // Each test gets its own CLI-created campaign, so parallel specs cannot share a draft.
    const id = `labour-${width}`;
    createHochland(root, id);
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/spielbrett/?campaign=${id}`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await page.evaluate(() => {
      const board = window.spielbrett;
      const home = board.model.home;
      board.select({ kind: 'unit', id: home.id, q: home.q, r: home.r });
    });
    const research = page.locator('[data-arbeit="research"]');
    await expect(research).toBeVisible();
    await expect(page.locator('[data-arbeit="wissen"]')).toHaveCount(0);
    const before = campaign(id, 'view/bergnomaden.json').derived.bergnomaden.pfade.points.total;
    const minus = page.locator('[data-arbeit="material"] button').first();
    await minus.focus();
    await page.keyboard.press('Enter');
    await expect(minus).toBeFocused();
    const plus = research.locator('button').last();
    await plus.click();
    await expect(plus).toBeFocused();
    await expect(research.locator('.arbeit-zahl')).toHaveText('1');
    await expect.poll(() => page.evaluate(() => window.spielbrett.game.base.assign.research)).toBe(1);
    await page.keyboard.press('Escape');
    await page.keyboard.press('e');
    await expect(page.locator('#dlg-entwicklungen .pf-nabe')).toHaveAttribute('aria-label', `${before + 1} research points per season`);
    await page.keyboard.press('Escape');
    await expect.poll(async () => {
      const response = await page.request.get(base + '/api/campaigns/' + id + '/draft');
      return (await response.json()).draft?.assign?.research;
    }).toBe(1);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    expect(await page.evaluate(() => window.spielbrett.game.draft.assign.research)).toBe(1);
    await page.evaluate(() => {
      const b = window.spielbrett;
      b.select({ kind: 'unit', id: b.model.home.id, q: b.model.home.q, r: b.model.home.r });
    });
    await research.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(root, `labour-${width}.png`) });
    await testInfo.attach(`labour-${width}`, { path: join(root, `labour-${width}.png`), contentType: 'image/png' });
    expect(errors).toEqual([]);
  });
}

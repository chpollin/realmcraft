import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { startServer, REPO } from '../lib/server.mjs';

let root, server, base;
test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-planning-entry-'));
  createHochland(root, 'entry');
  const cli = (...args) => execFileSync(process.execPath, ['engine/cli.mjs', ...args, '--json'], {
    cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8',
  });
  cli('new', 'hochland', '--seed', '20261003', '--as', 'talbund', '--id', 'settled');
  cli('open', '--campaign', 'settled');
  server = await startServer(root);
  base = 'http://127.0.0.1:' + server.port;
});
test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});
async function open(page, id = 'entry') {
  await page.addInitScript(() => localStorage.setItem('realmcraft.settings', JSON.stringify({ language: 'de', reduced: true })));
  await page.goto(base + '/spielbrett/?campaign=' + id);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}
for (const width of [390, 1440, 2192]) {
  test('planning entry opens labour without changing the draft at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const draftBefore = await (await page.request.get(base + '/api/campaigns/entry/draft')).json();
    const entry = page.getByRole('button', { name: 'Aktion planen', exact: true });
    await expect(entry).toBeInViewport();
    await expect(page.locator('#ratsleiste')).toHaveAttribute('data-zu', 'true');
    await expect(page.locator('.rl-loyal-badge').first()).toHaveText('+3');
    await entry.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#kontext')).toBeVisible();
    await expect(page.locator('#kontext-titel')).toBeFocused();
    await expect(page.locator('[data-arbeit="research"]')).toBeVisible();
    expect(await (await page.request.get(base + '/api/campaigns/entry/draft')).json()).toEqual(draftBefore);
    await page.keyboard.press('Escape');
    await expect(page.locator('#kontext')).toBeHidden();
    await expect(page.locator('#karte')).toBeFocused();
    await page.getByRole('button', { name: 'Zum Lager', exact: true }).click();
    await expect(page.locator('#kontext-titel')).toBeFocused();
    await expect(page.locator('[data-arbeit="research"]')).toBeVisible();
  });
}
test('the same planning entry opens the own settled community', async ({ page }) => {
  await open(page, 'settled');
  await page.getByRole('button', { name: 'Aktion planen', exact: true }).click();
  await expect(page.locator('#kontext-titel')).toBeFocused();
  await expect(page.locator('[data-arbeit="research"]')).toBeVisible();
});
test('an explicit expanded council preference survives and can be changed by keyboard', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('spielbrett.ratsleiste') === null) localStorage.setItem('spielbrett.ratsleiste', 'auf');
  });
  await open(page);
  await expect(page.locator('#ratsleiste')).toHaveAttribute('data-zu', 'false');
  const toggle = page.getByRole('button', { name: 'Rat einklappen', exact: true });
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Rat aufklappen', exact: true })).toBeFocused();
  await expect(page.locator('#ratsleiste')).toHaveAttribute('data-zu', 'true');
  await page.reload();
  await expect(page.locator('#ratsleiste')).toHaveAttribute('data-zu', 'true');
});

test('a settled labour warning opens the actual settlement', async ({ page }) => {
  await open(page, 'settled');
  await page.getByRole('button', { name: 'Aktion planen', exact: true }).click();
  await page.getByRole('button', { name: 'Nahrung weniger', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.meldung.warnung')).toHaveCount(1);
  await page.locator('.meldung.warnung').click();
  await expect(page.locator('#kontext-titel')).toBeFocused();
  await expect(page.locator('[data-arbeit="research"]')).toBeVisible();
});

test('selected home stays above the sheet when changing to a narrow layout', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await page.getByRole('button', { name: 'Aktion planen', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => {
    const board = window.spielbrett;
    const point = board.view.hexScreen(board.model.home.q, board.model.home.r);
    const canvas = document.getElementById('karte').getBoundingClientRect();
    const panel = document.getElementById('kontext').getBoundingClientRect();
    return point.x > 0 && point.x < canvas.width && point.y > 0 && point.y + canvas.top < panel.top;
  })).toBe(true);
});

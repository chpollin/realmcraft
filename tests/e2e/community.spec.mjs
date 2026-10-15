import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { REPO, startServer } from '../lib/server.mjs';

let root, server, base;
const cli = (...args) => execFileSync(process.execPath, ['engine/cli.mjs', ...args, '--json'], {
  cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8',
});
test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-community-'));
  createHochland(root, 'nomads');
  cli('new', 'hochland', '--seed', '20261003', '--as', 'talbund', '--id', 'settled');
  cli('open', '--campaign', 'settled');
  server = await startServer(root);
  base = 'http://127.0.0.1:' + server.port;
});
test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('realmcraft.settings', JSON.stringify({ language: 'de' }));
    localStorage.setItem('realmcraft.audio', JSON.stringify({ reduced: true }));
  });
});
async function open(page, id = 'nomads', community = true) {
  await page.goto(base + '/spielbrett/?campaign=' + id + (community ? '&ansicht=gemeinschaft' : ''));
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}
async function draft(page, id = 'nomads') {
  const response = await page.request.get(base + '/api/campaigns/' + id + '/draft');
  expect(response.ok()).toBe(true);
  return response.json();
}
const spot = (page, kind) => page.locator('[data-community-spot="' + kind + '"]');
async function expectCounts(page, assign) {
  for (const [kind, key] of [['food', 'nahrung'], ['material', 'material'], ['research', 'research']]) {
    await expect(spot(page, kind).locator('[data-community-count]')).toHaveText(String(assign[key] ?? 0));
  }
}
async function expectNoOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
async function expectCommunityFocus(page) {
  expect(await page.evaluate(() => {
    const active = document.activeElement;
    return document.getElementById('gemeinschaft').contains(active) && active.getClientRects().length > 0;
  })).toBe(true);
}
for (const width of [1440, 390]) {
  test('map remains the default and switching views preserves the draft at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, 'nomads', false);
    const before = await draft(page);
    await expect(page.locator('#gemeinschaft')).toBeHidden();
    await expect(page.locator('#karte')).toBeVisible();
    const community = page.getByRole('button', { name: 'Gemeinschaft', exact: true });
    const world = page.getByRole('button', { name: 'Weltkarte', exact: true });
    await expect(world).toHaveAttribute('aria-pressed', 'true');
    await expect(community).toBeInViewport();
    await community.focus();
    await page.keyboard.press('Enter');
    await expect(community).toHaveAttribute('aria-pressed', 'true');
    await expect(world).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#gemeinschaft')).toBeVisible();
    await expect(page.locator('#gemeinschaft-bild')).toBeVisible();
    await expect(page.locator('#karte')).toBeHidden();
    expect(new URL(page.url()).searchParams.get('ansicht')).toBe('gemeinschaft');
    for (const kind of ['food', 'material', 'research', 'home']) await expect(spot(page, kind)).toBeInViewport();
    await expect(page.locator('#gemeinschaft-saison')).toBeInViewport();
    await expectNoOverflow(page);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(community).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#gemeinschaft')).toBeVisible();
    await world.click();
    await expect(world).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#gemeinschaft')).toBeHidden();
    await expect(page.locator('#karte')).toBeVisible();
    await expectNoOverflow(page);
    expect(await draft(page)).toEqual(before);
    expect(errors).toEqual([]);
  });

  test('community labour uses the existing kernel preview and persists at ' + width, async ({ page }) => {
    const id = 'labour-' + width;
    createHochland(root, id);
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, id);
    const before = await draft(page, id);
    const assigned = await page.evaluate(() => {
      const g = window.spielbrett.game;
      return g.draft.assign ?? g.view.peoples[g.pid].population.assigned;
    });
    expect(assigned.nahrung).toBeGreaterThan(0);
    await expectCounts(page, assigned);
    for (const [kind, key] of [['food', 'nahrung'], ['material', 'material'], ['research', 'research']]) {
      await spot(page, kind).focus();
      await page.keyboard.press('Enter');
      const row = page.locator('[data-arbeit="' + key + '"]');
      await expect(row).toBeVisible();
      await expect(row.locator('button').first()).toBeFocused();
      await expect(row.locator('.arbeit-zahl')).toHaveText(String(assigned[key] ?? 0));
      await page.keyboard.press('Escape');
      await expect(page.locator('#kontext')).toBeHidden();
      await expectCommunityFocus(page);
    }
    expect(await draft(page, id)).toEqual(before);
    await spot(page, 'food').click();
    const expected = await page.evaluate(() => {
      const g = window.spielbrett.game;
      const assign = { ...(g.draft.assign ?? g.view.peoples[g.pid].population.assigned) };
      assign.nahrung -= 1;
      return g.deltasWith((dr) => ({ ...dr, assign }));
    });
    await expect.poll(() => page.evaluate(() => window.spielbrett.model.preview?.deltas)).toEqual(expected);
    expect(Object.values(expected).some((delta) => delta !== 0)).toBe(true);
    await expect(page.locator('#ressourcen .delta').first()).toBeVisible();
    await page.getByRole('button', { name: 'Nahrung weniger', exact: true }).click();
    await page.getByRole('button', { name: 'Forschung mehr', exact: true }).click();
    const next = { ...assigned, nahrung: assigned.nahrung - 1, research: (assigned.research ?? 0) + 1 };
    await expectCounts(page, next);
    await expect(page.locator('[data-arbeit="research"] .arbeit-zahl')).toHaveText(String(next.research));
    await expect.poll(async () => (await draft(page, id)).draft?.assign).toEqual(next);
    await page.keyboard.press('Escape');
    await expectCommunityFocus(page);
    await expectNoOverflow(page);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expectCounts(page, next);
    await spot(page, 'research').click();
    await expect(page.locator('[data-arbeit="research"] button').first()).toBeFocused();
    await expect(page.locator('[data-arbeit="research"] .arbeit-zahl')).toHaveText(String(next.research));
    expect(errors).toEqual([]);
  });
}

test('season preview changes only the scene and can return to the campaign season', async ({ page }) => {
  await open(page);
  const before = await draft(page);
  const time = await page.locator('#zeit').textContent();
  const current = await page.locator('#gemeinschaft').getAttribute('data-season');
  expect(['spring', 'summer', 'autumn', 'winter']).toContain(current);
  let winter;
  for (const season of ['winter', 'summer', 'autumn', 'spring']) {
    await page.locator('#gemeinschaft-saison').selectOption(season);
    await expect(page.locator('#gemeinschaft')).toHaveAttribute('data-season', season);
    await expect(page.locator('#zeit')).toHaveText(time);
    if (season === 'winter') winter = await page.locator('#gemeinschaft-bild').screenshot();
    if (season === 'summer') {
      await expect.poll(async () => (await page.locator('#gemeinschaft-bild').screenshot()).equals(winter)).toBe(false);
    }
  }
  await page.locator('#gemeinschaft-saison').selectOption('');
  await expect(page.locator('#gemeinschaft')).toHaveAttribute('data-season', current);
  expect(await draft(page)).toEqual(before);
});

for (const id of ['nomads', 'settled']) {
  test('community management selects the actual home for ' + id, async ({ page }) => {
    await open(page, id);
    const before = await draft(page, id);
    const home = await page.evaluate(() => {
      const board = window.spielbrett;
      return board.game.view.map.settlements.find((place) => place.id === board.model.home.id);
    });
    await page.getByRole('button', { name: 'Gemeinschaft verwalten', exact: true }).click();
    await expect(page.locator('#kontext-titel')).toHaveText(home.name);
    await expect(page.locator('#kontext-titel')).toBeFocused();
    await expect(page.locator('[data-arbeit="research"]')).toBeVisible();
    expect(await page.evaluate(() => window.spielbrett.model.selection.id)).toBe(home.id);
    expect(await draft(page, id)).toEqual(before);
  });
}


test('opening home from direct community entry retains a usable world map', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await spot(page, 'food').click();
  await expect(page.locator('[data-arbeit="nahrung"] button').first()).toBeFocused();
  await page.getByRole('button', { name: 'Weltkarte', exact: true }).click();
  await expect(page.locator('#karte')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const board = window.spielbrett;
    const home = board.model.home;
    const point = board.view.hexScreen(home.q, home.r);
    const next = board.view.hexScreen(home.q + 1, home.r);
    const bounds = document.getElementById('karte').getBoundingClientRect();
    const x = bounds.left + point.x;
    const y = bounds.top + point.y;
    const hit = document.elementFromPoint(x, y);
    return Math.hypot(next.x - point.x, next.y - point.y) >= 44
      && x > bounds.left && x < bounds.right && y > bounds.top && y < bounds.bottom
      && hit === document.getElementById('karte');
  })).toBe(true);
  await expect(page.locator('#kontext')).toBeHidden();
  const home = await page.evaluate(() => {
    const board = window.spielbrett;
    const own = board.game.view.map.settlements.find((place) => place.id === board.model.home.id);
    const point = board.view.hexScreen(board.model.home.q, board.model.home.r);
    const bounds = document.getElementById('karte').getBoundingClientRect();
    return { id: own.id, name: own.name, x: bounds.left + point.x, y: bounds.top + point.y };
  });
  await page.mouse.click(home.x, home.y);
  await expect(page.locator('#kontext-titel')).toHaveText(home.name);
  await expect(page.locator('[data-arbeit="research"]')).toBeVisible();
  expect(await page.evaluate(() => window.spielbrett.model.selection.id)).toBe(home.id);
});

test('all community hotspots and the council remain unobstructed by chrome at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const council = page.getByRole('button', { name: 'Rat', exact: true });
  const controls = [...['food', 'material', 'research', 'home'].map((kind) => spot(page, kind)), council];
  for (const control of controls) {
    await expect(control).toBeInViewport();
    expect(await control.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const dx = Math.min(8, box.width / 4);
      const dy = Math.min(8, box.height / 4);
      const points = [
        [box.left + box.width / 2, box.top + box.height / 2],
        [box.left + dx, box.top + dy], [box.right - dx, box.top + dy],
        [box.left + dx, box.bottom - dy], [box.right - dx, box.bottom - dy],
      ];
      return box.left >= 0 && box.top >= 0 && box.right <= innerWidth && box.bottom <= innerHeight
        && points.every(([x, y]) => button.contains(document.elementFromPoint(x, y)));
    })).toBe(true);
  }
  for (const [kind, key] of [['food', 'nahrung'], ['material', 'material'], ['research', 'research']]) {
    await spot(page, kind).click();
    await expect(page.locator('[data-arbeit="' + key + '"] button').first()).toBeFocused();
    await page.keyboard.press('Escape');
  }
  await spot(page, 'home').click();
  await expect(page.locator('#kontext-titel')).toBeFocused();
  await page.keyboard.press('Escape');
  await council.click();
  await expect(page.locator('#dlg-rat')).toBeVisible();
});


test('motion can resume and stop through viewer settings without altering the draft', async ({ page }) => {
  await open(page);
  const before = await draft(page);
  const scene = page.locator('#gemeinschaft-bild');
  const still = await scene.screenshot();
  expect((await scene.screenshot()).equals(still)).toBe(true);
  await page.locator('#menu-knopf').click();
  await page.locator('[data-menu="settings"]').click();
  await page.locator('#einst-bewegung').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'full');
  await page.locator('#dlg-einstellungen .overlay-kopf .icon-btn').click();
  await page.locator('[data-menu="resume"]').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect.poll(async () => (await scene.screenshot()).equals(still)).toBe(false);
  const moving = await scene.screenshot();
  await expect.poll(async () => (await scene.screenshot()).equals(moving)).toBe(false);
  await page.locator('#menu-knopf').click();
  await page.locator('[data-menu="settings"]').click();
  await page.locator('#einst-bewegung').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  await page.locator('#dlg-einstellungen .overlay-kopf .icon-btn').click();
  await page.locator('[data-menu="resume"]').click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const stopped = await scene.screenshot();
  expect((await scene.screenshot()).equals(stopped)).toBe(true);
  expect(await draft(page)).toEqual(before);
});

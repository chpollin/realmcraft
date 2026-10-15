import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { startServer } from '../lib/server.mjs';

let root, server, base, campaign = 0;

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-action-slots-'));
  server = await startServer(root);
  base = `http://127.0.0.1:${server.port}`;
});

test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

async function open(page, surface = 'gemeinschaft') {
  const id = `slots-${++campaign}`;
  createHochland(root, id);
  await page.addInitScript(() => localStorage.setItem('realmcraft.settings', JSON.stringify({ language: 'de', reduced: true })));
  await page.goto(`${base}/spielbrett/?campaign=${id}&ansicht=${surface}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  return id;
}

async function draft(page, id) {
  return (await page.request.get(`${base}/api/campaigns/${id}/draft`)).json();
}

for (const width of [1440, 390]) {
  test(`free action slots open the relevant choices without planning an order at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const id = await open(page);
    const before = await draft(page, id);
    const main = page.locator('#budget [data-plan-slot="haupt"][data-slot-index="0"]');
    const minor = page.locator('#budget [data-plan-slot="neben"][data-slot-index="1"]');
    const dialog = page.locator('#dlg-planen');
    await expect(main).toHaveAccessibleName('Hauptaktion planen');
    await expect(minor).toHaveAccessibleName('Nebenaktion 2 planen');
    await expect(main).toBeInViewport();
    await main.focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading').first()).toBeFocused();
    await expect(dialog.locator('[data-plan-type="migrate"]')).toBeVisible();
    await expect(dialog.locator('[data-plan-type="explore"]')).toHaveCount(0);
    await expect.poll(() => dialog.locator('.plan-action').evaluateAll((buttons) => buttons.every((button) => {
      const outer = button.getBoundingClientRect();
      return [...button.children].every((child) => {
        if (!child.getClientRects().length) return true;
        const inner = child.getBoundingClientRect();
        return inner.left >= outer.left && inner.right <= outer.right;
      });
    }))).toBe(true);
    await dialog.locator('[data-plan-type="migrate"]').click();
    const option = dialog.locator('#plan-option .befehl-option');
    await expect(option).toHaveAttribute('data-order', 'migrate');
    await expect(option).toHaveAttribute('data-slot', 'haupt');
    if (await option.getAttribute('aria-disabled') === 'true') {
      await expect(option.locator('.bo-grund')).not.toBeEmpty();
    }
    await page.screenshot({ path: testInfo.outputPath(`action-planner-default-${width}.png`) });
    const targets = dialog.locator('#plan-ziel');
    if (await targets.count()) {
      const values = await targets.locator('option').evaluateAll((options) => options.map((o) => o.value));
      if (values.length > 1) {
        const current = await targets.inputValue();
        await targets.selectOption(values.find((value) => value !== current));
        await expect(option).toHaveAttribute('data-order', 'migrate');
      }
    }
    expect(await draft(page, id)).toEqual(before);
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`action-planner-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(main).toBeFocused();

    await minor.click();
    await expect(dialog.locator('[data-plan-type="explore"]')).toBeVisible();
    await expect(dialog.locator('[data-plan-type="migrate"]')).toHaveCount(0);
    await dialog.locator('[data-plan-type="explore"]').click();
    const explore = dialog.locator('#plan-option .befehl-option[data-order="explore"]');
    await expect(explore).toHaveAttribute('aria-disabled', 'false');
    await expect(explore).toHaveAttribute('data-slot', 'neben');
    expect(await draft(page, id)).toEqual(before);
    await explore.click();
    await expect(page.locator('#dlg-probe')).toBeVisible();
    await expect(page.locator('#dlg-probe [data-wuerfeln]')).toBeVisible();
    expect(await draft(page, id)).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(page.locator('#dlg-probe')).toBeHidden();
    expect(await draft(page, id)).toEqual(before);
  });
}

test('occupied slots focus their queued order and leave the draft unchanged', async ({ page }) => {
  const id = await open(page, 'welt');
  const data = await page.evaluate(() => {
    const { game, model } = window.spielbrett;
    return {
      campaign: game.cid,
      people: game.pid,
      draft: { ...game.draft, orders: [{ id: 'o1', type: 'explore', params: { tile: `${model.home.q},${model.home.r}` } }] },
    };
  });
  const response = await page.request.post(`${base}/api/draft`, { data });
  expect((await response.json()).stored).toBe(true);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const before = await draft(page, id);
  const occupied = page.locator('#budget [data-order-focus="o1"]');
  await expect(occupied).toBeVisible();
  await occupied.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => document.activeElement.closest('#befehle [data-order-id]')?.dataset.orderId)).toBe('o1');
  await expect(page.locator('#dlg-planen')).toBeHidden();
  expect(await draft(page, id)).toEqual(before);
});

test('a free slot retains keyboard focus when the budget refreshes', async ({ page }) => {
  await open(page);
  const slot = page.locator('#budget [data-plan-slot="neben"][data-slot-index="1"]');
  await slot.focus();
  await page.evaluate(async () => {
    const { renderBudget } = await import('/spielbrett/js/ui/leiste.js');
    renderBudget(window.spielbrett);
  });
  await expect(slot).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#dlg-planen')).toBeVisible();
});

test('resolution disables free action slots without changing the draft', async ({ page }) => {
  const id = await open(page);
  const before = await draft(page, id);
  await page.evaluate(() => window.spielbrett.setPhase('A'));
  const slots = page.locator('#budget [data-plan-slot]');
  await expect(slots).toHaveCount(3);
  for (const slot of await slots.all()) await expect(slot).toBeDisabled();
  await expect(page.locator('#dlg-planen')).toBeHidden();
  expect(await draft(page, id)).toEqual(before);
});



test('the selected target and its focus survive an open planner refresh', async ({ page }) => {
  const id = await open(page);
  const before = await draft(page, id);
  await page.locator('#budget [data-plan-slot="haupt"]').click();
  await page.locator('#dlg-planen [data-plan-type="migrate"]').click();
  const target = page.locator('#plan-ziel');
  await expect(target).toBeVisible();
  const values = await target.locator('option').evaluateAll((options) => options.map((o) => o.value));
  expect(values.length).toBeGreaterThan(1);
  const previous = await target.inputValue();
  await target.selectOption(values.find((value) => value !== previous));
  const selected = await target.inputValue();
  await target.focus();
  await page.evaluate(() => window.spielbrett.rerenderDialog('planen'));
  await expect(target).toBeFocused();
  await expect(target).toHaveValue(selected);
  expect(await draft(page, id)).toEqual(before);
});


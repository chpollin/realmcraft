import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const output = new URL('./screenshots/strategy/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
const page = await browser.newPage();
const base = process.env.STRATEGY_URL || 'http://localhost:4190/spiel/winter.html';
const failures = [];
page.on('pageerror', error => failures.push(error.message));
page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()}: ${response.url()}`); });

try {
  for (const width of [1440, 1024, 736, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base);
    await page.evaluate(() => localStorage.removeItem('realmcraft.strategy.first-winter.v1'));
    await page.reload();
    await page.getByTestId('food-stock').waitFor();
    await page.screenshot({ path: fileURLToPath(new URL(`lage-${width}.png`, output)), fullPage: true });
    await page.locator('[data-action="minus"][data-job="wood"]').click();
    await page.locator('[data-action="minus"][data-job="wood"]').click();
    await page.locator('[data-action="project"]').click();
    await page.locator('[data-view="rat"]').click();
    await page.locator('[data-policy="pact"]').click();
    await page.screenshot({ path: fileURLToPath(new URL(`rat-${width}.png`, output)), fullPage: true });
    assert.equal(await page.locator('.advisor img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), true);
    await page.locator('[data-action="review"]').click();
    await page.screenshot({ path: fileURLToPath(new URL(`pruefung-${width}.png`, output)), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  }
  assert.deepEqual(failures, []);
  console.log('Visual captures completed at 1440, 1024, 736, 390 and 320 pixels; images loaded, no runtime or HTTP errors.');
} finally {
  await browser.close();
}

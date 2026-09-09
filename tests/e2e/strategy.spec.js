import { test, expect } from '@playwright/test';

const plus = (page, job) => page.locator(`[data-action="plus"][data-job="${job}"]`).click();
const minus = (page, job) => page.locator(`[data-action="minus"][data-job="${job}"]`).click();
const action = (page, name) => page.locator(`[data-action="${name}"]`).first().click();
const view = (page, name) => page.locator(`[data-view="${name}"]`).click();
async function commit(page) {
  await action(page, 'review');
  await action(page, 'execute');
}
async function build(page, project, policy) {
  await page.locator(`[data-action="place"][data-place="${project === 'mine' ? 'erz' : 'grau'}"]`).click();
  await page.locator(`[data-action="project"][data-project="${project}"]`).click();
  await view(page, 'rat');
  await page.locator(`[data-policy="${policy}"]`).click();
}

test('strategy: complete pact campaign, reload an open draft, enforce law and export/import', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/spiel/winter.html');
  await expect(page.getByRole('heading', { name: 'Frühling im ersten Jahr' })).toBeVisible();
  await minus(page, 'wood'); await minus(page, 'wood');
  await build(page, 'mine', 'pact');
  await page.reload();
  await view(page, 'rat');
  await expect(page.locator('[data-policy="pact"]')).toHaveAttribute('aria-pressed', 'true');
  await commit(page);
  await expect(page.getByTestId('food-stock')).toHaveText('18');
  await expect(page.getByTestId('material-stock')).toHaveText('6');
  await view(page, 'lage');
  await plus(page, 'mine'); await plus(page, 'mine');
  await commit(page);
  await view(page, 'lage');
  await minus(page, 'mine'); await minus(page, 'mine');
  await build(page, 'granary', 'majority');
  await view(page, 'lage');
  await minus(page, 'food');
  await plus(page, 'mine');
  await action(page, 'review');
  await expect(page.locator('[data-action="execute"]')).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Versorgungspakt');
  await view(page, 'lage');
  await minus(page, 'mine'); await plus(page, 'food');
  await commit(page);
  await view(page, 'lage');
  await plus(page, 'mine'); await plus(page, 'mine');
  await commit(page);
  await expect(page.getByTestId('campaign-result')).toContainText('Die Feuer brennen weiter.');
  await expect(page.getByTestId('food-stock')).toHaveText('14');
  await expect(page.getByTestId('material-stock')).toHaveText('18');
  const downloadPromise = page.waitForEvent('download');
  await action(page, 'export');
  const download = await downloadPromise;
  const path = await download.path();
  await action(page, 'new');
  await action(page, 'confirm-new');
  await expect(page.getByTestId('food-stock')).toHaveText('20');
  await page.locator('#save-file').setInputFiles(path);
  await expect(page.getByTestId('campaign-result')).toContainText('Die Feuer brennen weiter.');
  await page.reload();
  await expect(page.getByTestId('food-stock')).toHaveText('14');
  await expect(page.locator('[data-action="execute"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('strategy: loss, invalid file and isolated local data', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rc.history', 'untouched-legacy'));
  await page.goto('/spiel/winter.html');
  for (let i = 0; i < 4; i++) await minus(page, 'food');
  await commit(page);
  await commit(page);
  await expect(page.getByTestId('campaign-result')).toContainText('Die Vorräte reichen nicht.');
  const before = await page.getByTestId('food-stock').innerText();
  await page.locator('#save-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":99}') });
  await expect(page.locator('#notice')).toContainText('Laden fehlgeschlagen');
  await expect(page.getByTestId('food-stock')).toHaveText(before);
  expect(await page.evaluate(() => localStorage.getItem('rc.history'))).toBe('untouched-legacy');
});

test('strategy: corrupt autosave stays intact until an explicit new game', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('realmcraft.strategy.first-winter.v1', 'corrupt'));
  await page.goto('/spiel/winter.html');
  await expect(page.locator('#save-status')).toHaveText('Automatisches Sichern pausiert');
  await minus(page, 'food');
  expect(await page.evaluate(() => localStorage.getItem('realmcraft.strategy.first-winter.v1'))).toBe('corrupt');
  await action(page, 'new'); await action(page, 'confirm-new');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('realmcraft.strategy.first-winter.v1')).format)).toBe('realmcraft-strategy');
});

test('strategy: keyboard access, dialogs and small-screen layout', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/spiel/winter.html');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Zum Spiel', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  await page.locator('[data-action="help"]').click();
  await expect(page.locator('#help-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#help-dialog')).not.toBeVisible();
  await expect(page.locator('[data-action="help"]')).toBeFocused();
  for (const current of ['lage', 'rat', 'chronik']) {
    await view(page, current);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

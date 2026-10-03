import { test, expect } from '@playwright/test';

test('nachtmeer: plan, decide, restore the draft after reload, execute and close a dialog', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/spiel/');
  await expect(page.locator('#turn')).toHaveText('1');

  await page.locator('[data-place="aster"]').click();
  await page.locator('[data-order="explore"]').click();
  await expect(page.locator('#order-count')).toHaveText('1');

  await page.locator('#current-event').click();
  await page.locator('[data-choice="open"]').click();
  await expect(page.locator('#dialog')).not.toBeVisible();

  await page.reload();
  await expect(page.locator('#order-count')).toHaveText('1');
  await expect(page.locator('#orders')).toContainText('Seeweg erschließen');
  await expect(page.locator('#current-event')).toContainText('Entscheidung vorgemerkt');

  await page.locator('.advance').click();
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#dialog-title')).toHaveText('Die Befehle an die Küste');
  await page.locator('[data-action="execute"]').click();
  await expect(page.locator('#dialog-title')).toHaveText('Das letzte Hafenlicht');
  await expect(page.locator('#turn')).toHaveText('2');
  await expect(page.getByTestId('food-stock')).toHaveText('7');

  await page.keyboard.press('Escape');
  await expect(page.locator('#dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

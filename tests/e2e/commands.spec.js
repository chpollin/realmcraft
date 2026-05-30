import { test, expect } from '@playwright/test';

test.describe('Befehlsleiste', () => {
  test('ist immer sichtbar und zeigt die Standard-Befehle, auch ohne Speicherstand', async ({ page }) => {
    await page.goto('/');
    const bar = page.locator('[data-testid="command-bar"]');
    await expect(bar).toBeVisible();
    const cmds = page.locator('[data-testid="command"]');
    await expect(cmds.first()).toBeVisible();
    await expect(page.locator('[data-testid="command"]', { hasText: '/speichern' })).toHaveCount(1);
    // mindestens die sieben Standard-Befehle
    expect(await cmds.count()).toBeGreaterThanOrEqual(7);
  });

  test('Klick auf einen Befehl meldet das Kopieren per Toast', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await page.goto('/');
    await page.locator('[data-testid="command"]', { hasText: '/speichern' }).click();
    await expect(page.locator('[data-testid="toast"]')).toContainText('/speichern');
  });

  test('eigener Befehl laesst sich anlegen, bleibt nach Reload und laesst sich entfernen', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="command-add"]').click();
    await page.locator('[data-testid="command-name-input"]').fill('/kreatur');
    await page.locator('[data-testid="command-desc-input"]').fill('Die Kreatur im Neunten Stollen untersuchen');
    await page.locator('[data-testid="command-save"]').click();

    const eigen = page.locator('[data-testid="command"]', { hasText: '/kreatur' });
    await expect(eigen).toHaveCount(1);

    // bleibt nach Reload erhalten (localStorage)
    await page.reload();
    await expect(page.locator('[data-testid="command"]', { hasText: '/kreatur' })).toHaveCount(1);

    // entfernen
    await page.locator('[data-testid="command"]', { hasText: '/kreatur' })
      .locator('[data-testid="command-remove"]').click();
    await expect(page.locator('[data-testid="command"]', { hasText: '/kreatur' })).toHaveCount(0);
  });
});

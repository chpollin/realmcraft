// E2E: Export-Bundle mit eingebetteten Bildern und Re-Import ohne API-Call.
// Geschrieben gegen den Frontend-Vertrag, VOR der Implementierung (rot).
import { test, expect } from '@playwright/test';
import {
  FIXTURE_JSON,
  loadFile,
  loadContent,
  waitForLoaded,
  mockGeminiApi,
  setApiKey,
} from './_helpers.js';

test.describe('Export und Import', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        indexedDB.deleteDatabase('realmcraft');
      } catch {
        /* ignore */
      }
    });
    await page.goto('/');
    await loadFile(page, FIXTURE_JSON);
    await waitForLoaded(page);
  });

  test('Export enthält portrait.dataUrl, Re-Import zeigt Portraits ohne neuen API-Request', async ({
    page,
  }) => {
    const api = await mockGeminiApi(page);
    await setApiKey(page);

    // Portrait erzeugen (ein API-Request).
    await page.locator('[data-tab="berater"]').click();
    const firstCard = page.getByTestId('advisor-card').first();
    await firstCard.getByTestId('generate-portrait').click();
    await expect(firstCard.getByTestId('advisor-portrait')).toHaveAttribute(
      'src',
      /^data:image\/png;base64,/,
    );
    expect(api.count).toBe(1);

    // Export: Download abfangen und den Bundle-Inhalt lesen.
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-btn').click();
    const download = await downloadPromise;

    const fs = await import('node:fs/promises');
    const downloadPath = await download.path();
    const raw = await fs.readFile(downloadPath, 'utf-8');
    const bundle = JSON.parse(raw);

    // Das Bundle trägt mindestens ein eingebettetes portrait.dataUrl.
    const beraterMitPortrait = (bundle.berater ?? []).filter(
      (b) => b?.portrait?.dataUrl,
    );
    expect(beraterMitPortrait.length).toBeGreaterThanOrEqual(1);
    expect(beraterMitPortrait[0].portrait.dataUrl).toMatch(/^data:image\/png;base64,/);

    // Re-Import des Bundles in einer frischen Sitzung (leerer Cache, weiter gemockt).
    await page.evaluate(() => {
      try {
        indexedDB.deleteDatabase('realmcraft');
      } catch {
        /* ignore */
      }
    });
    await page.goto('/');

    const apiAfter = await mockGeminiApi(page);
    await loadContent(page, {
      name: 'bundle.json',
      mimeType: 'application/json',
      content: raw,
    });
    await waitForLoaded(page);

    // Portraits sind direkt da, befüllt aus dem Bundle, ohne Generieren-Klick.
    await page.locator('[data-tab="berater"]').click();
    const reImported = page.getByTestId('advisor-card').first().getByTestId('advisor-portrait');
    await expect(reImported).toHaveAttribute('src', /^data:image\/png;base64,/);

    // Kein neuer API-Request beim Import: der Cache wurde aus dataUrl gefüllt.
    expect(apiAfter.count).toBe(0);
  });
});

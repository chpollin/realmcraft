// E2E: Bildgenerierung (Portrait, Karte) mit gemockter Gemini-API und Cache.
// Geschrieben gegen den Frontend-Vertrag, VOR der Implementierung (rot).
import { test, expect } from '@playwright/test';
import {
  FIXTURE_JSON,
  loadFile,
  waitForLoaded,
  mockGeminiApi,
  setApiKey,
} from './_helpers.js';

test.describe('Bildgenerierung und Cache', () => {
  test.beforeEach(async ({ page }) => {
    // Sauberer Cache: IndexedDB der App leeren, bevor die Seite Skripte lädt.
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

  test('generate-portrait setzt ein data:image/png Portrait', async ({ page }) => {
    const api = await mockGeminiApi(page);
    await setApiKey(page);

    await page.locator('[data-tab="berater"]').click();
    const firstCard = page.getByTestId('advisor-card').first();

    await firstCard.getByTestId('generate-portrait').click();

    const portrait = firstCard.getByTestId('advisor-portrait');
    await expect(portrait).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(api.count).toBe(1);
  });

  test('zweiter Portrait-Versuch nutzt den Cache (kein neuer Request)', async ({ page }) => {
    const api = await mockGeminiApi(page);
    await setApiKey(page);

    await page.locator('[data-tab="berater"]').click();
    const firstCard = page.getByTestId('advisor-card').first();
    const portrait = firstCard.getByTestId('advisor-portrait');

    // Erster Klick: ein API-Request.
    await firstCard.getByTestId('generate-portrait').click();
    await expect(portrait).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(api.count).toBe(1);

    // Zweiter Klick auf dieselbe Card: aus dem Cache, KEIN neuer Request.
    await firstCard.getByTestId('generate-portrait').click();
    await expect(portrait).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(api.count).toBe(1);
  });

  test('Reload behält das Portrait aus dem Cache ohne neuen Request', async ({ page }) => {
    const api = await mockGeminiApi(page);
    await setApiKey(page);

    await page.locator('[data-tab="berater"]').click();
    const firstCard = page.getByTestId('advisor-card').first();
    await firstCard.getByTestId('generate-portrait').click();
    await expect(firstCard.getByTestId('advisor-portrait')).toHaveAttribute(
      'src',
      /^data:image\/png;base64,/,
    );
    expect(api.count).toBe(1);

    // Reload: Stand neu laden, dann Berater öffnen.
    await page.reload();
    await loadFile(page, FIXTURE_JSON);
    await waitForLoaded(page);
    await page.locator('[data-tab="berater"]').click();

    const reloadedPortrait = page.getByTestId('advisor-card').first().getByTestId('advisor-portrait');
    await expect(reloadedPortrait).toHaveAttribute('src', /^data:image\/png;base64,/);
    // Cache trägt das Bild: kein zusätzlicher API-Request nach dem ersten.
    expect(api.count).toBe(1);
  });

  test('generate-map setzt ein data:image/png Kartenbild', async ({ page }) => {
    const api = await mockGeminiApi(page);
    await setApiKey(page);

    await page.locator('[data-tab="karte"]').click();
    await page.getByTestId('generate-map').click();

    const mapImage = page.getByTestId('map-image');
    await expect(mapImage).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(api.count).toBe(1);
  });

  test('zweiter Karten-Versuch nutzt den Cache (kein neuer Request)', async ({ page }) => {
    const api = await mockGeminiApi(page);
    await setApiKey(page);

    await page.locator('[data-tab="karte"]').click();
    const mapImage = page.getByTestId('map-image');

    await page.getByTestId('generate-map').click();
    await expect(mapImage).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(api.count).toBe(1);

    await page.getByTestId('generate-map').click();
    await expect(mapImage).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(api.count).toBe(1);
  });
});

// E2E: Navigation (Tabs und Hash-Routing) und Inhalte der fünf Sichten.
// Geschrieben gegen den Frontend-Vertrag, VOR der Implementierung (rot).
import { test, expect } from '@playwright/test';
import { FIXTURE_JSON, EXPECT, loadFile, waitForLoaded } from './_helpers.js';

test.describe('Sichten und Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadFile(page, FIXTURE_JSON);
    await waitForLoaded(page);
  });

  test('Navigation per data-tab schaltet die Views', async ({ page }) => {
    // Lage ist die Default-View.
    await expect(page.locator('[data-view="lage"]')).toBeVisible();

    const tabs = ['berater', 'welt', 'karte', 'historie', 'lage'];
    for (const view of tabs) {
      await page.locator(`[data-tab="${view}"]`).click();
      await expect(page.locator(`[data-view="${view}"]`)).toBeVisible();
      // Der aktive Tab trägt aria-current="page".
      await expect(page.locator(`[data-tab="${view}"]`)).toHaveAttribute('aria-current', 'page');
      // Der Hash folgt dem aktiven Tab.
      await expect(page).toHaveURL(new RegExp(`#/${view}$`));
    }
  });

  test('Navigation per Hash schaltet die Views', async ({ page }) => {
    const views = ['berater', 'welt', 'karte', 'historie', 'lage'];
    for (const view of views) {
      await page.evaluate((v) => {
        window.location.hash = `#/${v}`;
      }, view);
      await expect(page.locator(`[data-view="${view}"]`)).toBeVisible();
      await expect(page.locator(`[data-tab="${view}"]`)).toHaveAttribute('aria-current', 'page');
    }
  });

  test('Deep-Link #/karte zeigt direkt die Karte', async ({ page }) => {
    // Frisch navigieren, dann Stand laden, damit die Route der Einstieg ist.
    await page.goto('/#/karte');
    await loadFile(page, FIXTURE_JSON);
    await waitForLoaded(page);

    await expect(page.locator('[data-view="karte"]')).toBeVisible();
    await expect(page.locator('[data-view="lage"]')).toBeHidden();
    await expect(page.getByTestId('map-place')).toHaveCount(EXPECT.karteOrteCount);
  });

  test('Berater-Sicht: 7 Cards mit Name, Loyalität und Portrait-Knopf', async ({ page }) => {
    await page.locator('[data-tab="berater"]').click();
    await expect(page.locator('[data-view="berater"]')).toBeVisible();

    const cards = page.getByTestId('advisor-card');
    await expect(cards).toHaveCount(EXPECT.beraterCount);

    // Jede Card trägt Name, Loyalität und einen Portrait-Generieren-Knopf.
    await expect(page.getByTestId('advisor-name')).toHaveCount(EXPECT.beraterCount);
    await expect(page.getByTestId('advisor-loyalty')).toHaveCount(EXPECT.beraterCount);
    await expect(page.getByTestId('generate-portrait')).toHaveCount(EXPECT.beraterCount);

    // Erste Card konkret prüfen: Sprecher-Name vorhanden, Portrait ist ein <img>.
    const first = cards.first();
    await expect(first.getByTestId('advisor-name')).not.toBeEmpty();
    await expect(first.getByTestId('advisor-portrait')).toHaveJSProperty('tagName', 'IMG');
  });

  test('Welt-Sicht: 5 Mächte und 7 Gruppen mit Sprechername', async ({ page }) => {
    await page.locator('[data-tab="welt"]').click();
    await expect(page.locator('[data-view="welt"]')).toBeVisible();

    await expect(page.getByTestId('power-card')).toHaveCount(EXPECT.maechteCount);

    const rows = page.getByTestId('group-row');
    await expect(rows).toHaveCount(EXPECT.gruppenCount);

    // Die erste Gruppe (Hirten, Sprecher idr → "Idr") trägt einen Sprechernamen.
    await expect(rows.first()).toContainText('Idr');
  });

  test('Karte-Sicht: 15 Orte in der Legende', async ({ page }) => {
    await page.locator('[data-tab="karte"]').click();
    await expect(page.locator('[data-view="karte"]')).toBeVisible();
    await expect(page.getByTestId('map-place')).toHaveCount(EXPECT.karteOrteCount);
  });

  test('Historie-Sicht: 3 Einträge, Fähigkeiten und Besitz vorhanden', async ({ page }) => {
    await page.locator('[data-tab="historie"]').click();
    await expect(page.locator('[data-view="historie"]')).toBeVisible();

    await expect(page.getByTestId('history-entry')).toHaveCount(EXPECT.historieCount);
    // faehigkeit und besitz sind als Listen vorhanden (≥1 Eintrag).
    await expect(page.getByTestId('faehigkeit').first()).toBeVisible();
    await expect(page.getByTestId('besitz').first()).toBeVisible();
  });
});

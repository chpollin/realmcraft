// E2E: Laden von Speicherständen (Hybrid-Markdown, reines JSON, Fehlerfall).
// Geschrieben gegen den Frontend-Vertrag, VOR der Implementierung (rot).
import { test, expect } from '@playwright/test';
import {
  FIXTURE_MD,
  FIXTURE_JSON,
  EXPECT,
  loadFile,
  loadContent,
  waitForLoaded,
} from './_helpers.js';

test.describe('Laden des Speicherstands', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Start zeigt den Leerzustand', async ({ page }) => {
    await expect(page.getByTestId('empty-state')).toBeVisible();
    // Vor dem Laden gibt es keinen Realm-Namen.
    await expect(page.getByTestId('realm-name')).toHaveCount(0);
  });

  test('lädt Hybrid-Markdown (.md) und zeigt die Lage', async ({ page }) => {
    await expect(page.getByTestId('empty-state')).toBeVisible();

    await loadFile(page, FIXTURE_MD);
    await waitForLoaded(page);

    // Nach dem Laden ist der Leerzustand verschwunden.
    await expect(page.getByTestId('empty-state')).toBeHidden();

    await expect(page.getByTestId('realm-name')).toHaveText(EXPECT.realmName);
    await expect(page.getByTestId('stat-nahrung')).toHaveText(EXPECT.statNahrung);
    await expect(page.getByTestId('stat-wissen')).toHaveText(EXPECT.statWissen);
    await expect(page.getByTestId('lage-verteidigung')).toContainText(EXPECT.lageVerteidigung);
  });

  test('lädt reines JSON (.json) und zeigt die Lage', async ({ page }) => {
    await expect(page.getByTestId('empty-state')).toBeVisible();

    await loadFile(page, FIXTURE_JSON);
    await waitForLoaded(page);

    await expect(page.getByTestId('empty-state')).toBeHidden();

    await expect(page.getByTestId('realm-name')).toHaveText(EXPECT.realmName);
    await expect(page.getByTestId('stat-nahrung')).toHaveText(EXPECT.statNahrung);
    await expect(page.getByTestId('stat-wissen')).toHaveText(EXPECT.statWissen);
    await expect(page.getByTestId('lage-verteidigung')).toContainText(EXPECT.lageVerteidigung);
  });

  test('kaputter Inhalt zeigt eine sichtbare Fehlermeldung', async ({ page }) => {
    await loadContent(page, {
      name: 'kaputt.json',
      mimeType: 'application/json',
      content: '{ das ist : kein gültiges JSON ,,, ',
    });

    // Fehler als Toast oder inline; beides erfüllt "sichtbare Fehlermeldung".
    const toast = page.getByTestId('toast');
    const errorMsg = page.getByTestId('error-message');
    await expect(toast.or(errorMsg)).toBeVisible();

    // Es wurde kein Stand übernommen: der Leerzustand bleibt, kein Realm-Name.
    await expect(page.getByTestId('realm-name')).toHaveCount(0);
  });
});

// tests/e2e/update-loop.spec.js — Auto-Restore, Delta-Banner, Kapitel-Historie.
// Jeder Test laeuft in eigenem Browser-Kontext (frische localStorage).
// Testids und Format folgen dem Frontend-Vertrag: Kapitel-Badge "chapter"
// traegt roemische Ziffern (z.B. "Kapitel IV").
import { test, expect } from '@playwright/test';
import { join } from 'node:path';

const ch3 = join(process.cwd(), 'examples', 'die-karren-kapitel-3.json');
const ch4 = join(process.cwd(), 'examples', 'die-karren-kapitel-4.json');

test('erstes Laden zeigt kein Delta-Banner', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-input').setInputFiles(ch4);
  await expect(page.getByTestId('realm-name')).toContainText('Die Karren');
  await expect(page.getByTestId('delta-banner')).toHaveCount(0);
});

test('zweites Laden zeigt das Delta-Banner mit Kapitelwechsel', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-input').setInputFiles(ch3);
  await expect(page.getByTestId('realm-name')).toContainText('Die Karren');
  await page.getByTestId('load-input').setInputFiles(ch4);

  const banner = page.getByTestId('delta-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Kapitel');
  await expect(page.getByTestId('delta-item').first()).toBeVisible();

  await page.getByTestId('delta-dismiss').click();
  await expect(banner).toHaveCount(0);
});

test('Auto-Restore stellt den Stand nach Reload wieder her', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-input').setInputFiles(ch4);
  await expect(page.getByTestId('realm-name')).toContainText('Die Karren');

  await page.reload();
  await expect(page.getByTestId('realm-name')).toContainText('Die Karren');
  await expect(page.getByTestId('chapter')).toContainText('Kapitel IV');
  // Auto-Restore zeigt kein Delta-Banner.
  await expect(page.getByTestId('delta-banner')).toHaveCount(0);
});

test('Kapitel-Historie schaltet zwischen Staenden um', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-input').setInputFiles(ch3);
  await page.getByTestId('load-input').setInputFiles(ch4);

  const sel = page.getByTestId('history-select');
  await expect(sel).toBeVisible();
  await expect(page.getByTestId('chapter')).toContainText('Kapitel IV');

  await sel.selectOption({ index: 0 });
  await expect(page.getByTestId('chapter')).toContainText('Kapitel III');
});

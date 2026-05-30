// tests/e2e/aktionen.spec.js — Aktionsbrett, Trends und Lebensstand (Kapitel-4-Stand).
// Geschrieben gegen den Frontend-Vertrag. Der Kapitel-4-Stand fuehrt runde,
// trends und lebensstand; der Kapitel-3-Stand fuehrt sie nicht (graceful).
import { test, expect } from '@playwright/test';
import { join } from 'node:path';

const ch3 = join(process.cwd(), 'examples', 'die-karren-kapitel-3.json');
const ch4 = join(process.cwd(), 'examples', 'die-karren-kapitel-4.json');

test('Aktionsbrett zeigt die drei Vorhaben mit Ziel und Modifikator', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-input').setInputFiles(ch4);
  await expect(page.getByTestId('realm-name')).toContainText('Die Karren');

  const brett = page.getByTestId('aktionsbrett');
  await expect(brett).toBeVisible();
  await expect(page.getByTestId('aktion')).toHaveCount(3);
  await expect(page.getByTestId('aktion-budget')).toContainText('Haupt 0/3');
  await expect(page.getByTestId('aktion-budget')).toContainText('Neben 0/2');

  const titel = page.getByTestId('aktion-titel');
  await expect(titel.nth(0)).toHaveText('Verwaltung');
  await expect(titel.nth(1)).toHaveText('Stadtausbau Süd');
  await expect(titel.nth(2)).toHaveText('Zuzugskampagne');
  await expect(brett).toContainText('Ziel 4');
  await expect(brett).toContainText('▶ 1d10');
});

test('Trends erscheinen an den Grundgrößen mit Richtung', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-input').setInputFiles(ch4);
  await expect(page.getByTestId('realm-name')).toContainText('Die Karren');

  await expect(page.getByTestId('trend-nahrung')).toHaveText('▼');
  await expect(page.getByTestId('trend-wissen')).toHaveText('▲');
  await expect(page.getByTestId('trend-material')).toHaveText('→');
  // Grund steht als Tooltip (title-Attribut).
  await expect(page.getByTestId('trend-nahrung')).toHaveAttribute('title', /Bergboden|Stadt/);
});

test('Lebensstand erscheint an den Berater-Karten', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-input').setInputFiles(ch4);
  await page.locator('[data-tab="berater"]').click();
  await expect(page.locator('[data-view="berater"]')).toBeVisible();
  // Alle sieben Rat-Mitglieder im Lebensabend.
  await expect(page.getByTestId('advisor-lebensstand')).toHaveCount(7);
  await expect(page.getByTestId('advisor-lebensstand').first()).toHaveText('Lebensabend');
});

test('Kapitel-3-Stand ohne runde zeigt kein Aktionsbrett', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-input').setInputFiles(ch3);
  await expect(page.getByTestId('realm-name')).toContainText('Die Karren');
  await expect(page.getByTestId('aktionsbrett')).toHaveCount(0);
  await expect(page.getByTestId('trend-nahrung')).toHaveCount(0);
});

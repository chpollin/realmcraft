// Gemeinsame Test-Helfer für die RealmCraft-Dashboard-Specs (E2E und Visual).
// Binden ausschließlich an den Frontend-Vertrag (data-testid, Hash-Routen,
// Test-Hooks, Mock-Pixel).
import { test as base, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MOCK_PIXEL_BASE64 } from '../fixtures/mock-pixel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Beispielstand "Die Karren", Kapitel 3 (kanonische Fixture) und Kapitel 4
// (führt runde, trends und lebensstand).
export const FIXTURE_MD = path.join(REPO_ROOT, 'examples', 'die-karren-kapitel-3.md');
export const FIXTURE_JSON = path.join(REPO_ROOT, 'examples', 'die-karren-kapitel-3.json');
export const FIXTURE_CH4_JSON = path.join(REPO_ROOT, 'examples', 'die-karren-kapitel-4.json');

export const MOCK_PIXEL = MOCK_PIXEL_BASE64;

/**
 * Schottet die Seite vom Server-Zustand ab, bevor sie lädt. Die App lädt sonst
 * beim Start die live geschriebene savegame.json der laufenden Partie oder,
 * ohne sie, den Demo-Stand aus dem Manifest bzw. dessen Einzelstand-Fallback;
 * /env.js reicht einen lokalen Gemini-Key aus .env durch. Jeder dieser Wege
 * machte das Ergebnis vom Arbeitsplatz abhängig. Specs, die Live-Modus oder
 * Demo gezielt prüfen, registrieren danach eigene Routen; die zuletzt
 * registrierte Route gewinnt.
 */
export async function isolate(page) {
  const notFound = (route) => route.fulfill({ status: 404, body: '' });
  await page.route('**/savegame.json', notFound);
  await page.route('**/examples/demo/manifest.json', notFound);
  await page.route('**/examples/die-gestrandeten.json', notFound);
  await page.route('**/env.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
}

// Dashboard-Specs importieren test von hier, damit keine Spec die Isolation vergisst.
export const test = base.extend({
  page: async ({ page }, use) => {
    await isolate(page);
    await use(page);
  },
});
export { expect };

// Erwartungswerte aus der Fixture (Vertrag §DOM und Beispielstand).
export const EXPECT = {
  realmName: 'Die Karren',
  statNahrung: '8',
  statMaterial: '5',
  statWissen: '16',
  statBevoelkerung: '300',
  lageVerteidigung: '+3',
  beraterCount: 7,
  maechteCount: 5,
  gruppenCount: 7,
  karteOrteCount: 15,
  historieCount: 3,
};

/**
 * Antwort des gemockten Gemini-Endpunkts laut Vertrag (Test-Hooks):
 * candidates[0].content.parts[0].inlineData{ mimeType:'image/png', data:<1x1-PNG> }.
 */
export function geminiMockBody(pixel = MOCK_PIXEL) {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: pixel,
              },
            },
          ],
        },
      },
    ],
  };
}

/**
 * Registriert die gemockte Bild-API auf der Seite und zählt Aufrufe.
 * Gibt ein Objekt mit { count } zurück; count erhöht sich pro abgefangenem Request.
 */
export async function mockGeminiApi(page, { pixel = MOCK_PIXEL } = {}) {
  const counter = { count: 0 };
  await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
    counter.count += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(geminiMockBody(pixel)),
    });
  });
  return counter;
}

/**
 * Öffnet den Settings-Dialog, trägt den API-Key ein und speichert.
 * Bindet an [data-testid=settings-btn|settings-dialog|api-key-input|save-settings].
 */
export async function setApiKey(page, apiKey = 'TEST-KEY-1234') {
  await page.getByTestId('settings-btn').click();
  const dialog = page.getByTestId('settings-dialog');
  await dialog.waitFor({ state: 'visible' });
  await page.getByTestId('api-key-input').fill(apiKey);
  await page.getByTestId('save-settings').click();
}

/**
 * Lädt eine Datei (Pfad) über das versteckte Datei-Input des Vertrags.
 * Das Input ist `hidden`, daher setInputFiles statt Klick.
 */
export async function loadFile(page, filePath) {
  await page.getByTestId('load-input').setInputFiles(filePath);
}

/**
 * Lädt einen In-Memory-Inhalt (z.B. kaputter Stand) über das Datei-Input.
 */
export async function loadContent(page, { name, mimeType, content }) {
  await page.getByTestId('load-input').setInputFiles({
    name,
    mimeType,
    buffer: Buffer.from(content, 'utf-8'),
  });
}

/**
 * Wartet, bis ein Stand geladen ist (Realm-Name sichtbar, Leerzustand weg).
 */
export async function waitForLoaded(page) {
  await page.getByTestId('realm-name').waitFor({ state: 'visible' });
}

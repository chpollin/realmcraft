// Gemeinsame Test-Helfer für die RealmCraft E2E-Specs.
// Reine Helfer ohne Seiteneffekte auf die App; binden ausschließlich an den
// Frontend-Vertrag (data-testid, Hash-Routen, Test-Hooks, Mock-Pixel).
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo-Root von tests/e2e/ aus: zwei Ebenen hoch.
export const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Pfade zur Test-Fixture (Beispielstand "Die Karren", Kapitel 3).
export const FIXTURE_MD = path.join(REPO_ROOT, 'examples', 'die-karren-kapitel-3.md');
export const FIXTURE_JSON = path.join(REPO_ROOT, 'examples', 'die-karren-kapitel-3.json');

// Einheitliches Mock-Pixel: 1x1 PNG als base64 (laut Auftrag/Vertrag).
export const MOCK_PIXEL =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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

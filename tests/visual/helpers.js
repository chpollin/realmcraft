// tests/visual/helpers.js
//
// Geteilte Hilfsfunktionen fuer die Playwright-Visual-Specs von RealmCraft.
//
// Alle Selektoren und Routen folgen exakt docs/Frontend-Contract.md:
//   - Speicherstand laden ueber das Datei-Input [data-testid="load-input"]
//     (setInputFiles mit examples/die-karren-kapitel-3.json).
//   - Hash-Routing: #/lage #/berater #/welt #/karte #/historie;
//     ohne/unbekannt -> #/lage. hashchange schaltet die View.
//   - Views: <section data-view="lage"> ... <section data-view="historie">;
//     inaktive Views tragen das Attribut hidden, die aktive nicht.
//   - Leerzustand vor dem Laden: [data-testid="empty-state"] sichtbar.
//   - Aktiver Tab: [data-tab="..."] mit aria-current="page".
//
// Keine externen Laufzeit-Abhaengigkeiten (nur @playwright/test als Dev-Tool).

import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo-Wurzel: tests/visual/ -> ../../
export const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Kanonische Test-Fixture (Beispielstand "Die Karren", Kapitel 3).
export const FIXTURE_JSON = path.resolve(
  REPO_ROOT,
  "examples",
  "die-karren-kapitel-3.json"
);

// View-Reihenfolge laut Aufgabe / Vertrag.
export const VIEWS = ["lage", "berater", "welt", "karte", "historie"];

// Kurzer, fester Timeout fuers Warten auf Google Fonts (ms).
const FONT_TIMEOUT = 1500;

/**
 * Laedt die App-Einstiegsseite. index.html laedt laut Vertrag das Modul
 * js/app.js. Der relative Pfad wird gegen die in playwright.config.mjs
 * gesetzte baseURL aufgeloest.
 */
export async function openApp(page) {
  await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  // Datei-Input und Leerzustand muessen vorhanden sein, bevor geladen wird.
  await page.waitForSelector('[data-testid="load-input"]', {
    state: "attached",
  });
}

/**
 * Laedt den Beispielstand ueber das Datei-Input und wartet, bis die App
 * den Stand gerendert hat. Signal: die aktive View (data-view="lage")
 * ist nicht mehr leer bzw. der Realm-Name steht.
 */
export async function loadFixture(page) {
  await page.setInputFiles('[data-testid="load-input"]', FIXTURE_JSON);

  // Nach dem Laden zeigt die Lage-View den Realm-Namen "Die Karren".
  // Das ist ein vertraglich definierter, stabiler Render-Anker.
  await page
    .waitForFunction(
      () => {
        const el = document.querySelector('[data-testid="realm-name"]');
        return !!el && el.textContent.trim().length > 0;
      },
      { timeout: 10000 }
    )
    .catch(async () => {
      // Fallback: auf die sichtbare Lage-Section warten.
      await page.waitForSelector('section[data-view="lage"]:not([hidden])', {
        state: "visible",
        timeout: 10000,
      });
    });

  await waitForFonts(page);
}

/**
 * Navigiert zu einer View ueber den Hash-Router und wartet, bis die
 * zugehoerige <section data-view="..."> sichtbar (nicht hidden) ist.
 * Anschliessend Fonts/Render stabilisieren.
 */
export async function gotoView(page, view) {
  await page.evaluate((v) => {
    window.location.hash = `#/${v}`;
  }, view);

  await page.waitForSelector(`section[data-view="${view}"]:not([hidden])`, {
    state: "visible",
    timeout: 10000,
  });

  await waitForFonts(page);
  await waitForRenderSettled(page);
}

/**
 * Wartet (mit kurzem Timeout) darauf, dass die Web-Fonts geladen sind,
 * damit Screenshots nicht durch Font-Swap flackern.
 */
export async function waitForFonts(page) {
  await page
    .evaluate(async (timeout) => {
      if (!document.fonts || !document.fonts.ready) return;
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, timeout)),
      ]);
    }, FONT_TIMEOUT)
    .catch(() => {});
}

/**
 * Stabilisiert das Rendering: zwei RAF-Ticks, damit Layout und etwaige
 * Uebergaenge abgeschlossen sind, bevor der Snapshot faellt.
 */
export async function waitForRenderSettled(page) {
  await page
    .evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    )
    .catch(() => {});
}

/**
 * Liefert Locator-Masken fuer instabile Bildbereiche (Platzhalter-Portraits
 * und Kartengrafik), damit die Snapshots deterministisch bleiben.
 * Nicht vorhandene Masken werden von Playwright ignoriert.
 *
 * Vertrags-Selektoren:
 *   - Portraits: [data-testid="advisor-portrait"] (ein <img> je Berater-Card)
 *   - Karte:     [data-testid="map-image"] (das generierte/Platzhalter-<img>)
 */
export function maskRegions(page) {
  return [
    page.locator('[data-testid="advisor-portrait"]'),
    page.locator('[data-testid="map-image"]'),
  ];
}

// Gemeinsame Optionen fuer alle Snapshot-Vergleiche.
export const SCREENSHOT_OPTS = {
  animations: "disabled",
  maxDiffPixelRatio: 0.02,
};

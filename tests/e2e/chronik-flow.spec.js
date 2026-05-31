// tests/e2e/chronik-flow.spec.js
// Der erzählte Verlauf (chronik-flow) fasst mehrfaches Speichern desselben Zuges
// zu einem Eintrag zusammen. Hintergrund: der Store entdupliziert nur exakt
// identische Stände; speichert man denselben Zug mit minimal verändertem State
// mehrfach, liegen mehrere store-verschiedene, aber anzeige-gleiche Stände vor.
// buildVerlauf darf sie nicht als Beinah-Dubletten wiederholen.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Voller, gültiger Beispielstand als Basis, damit Auto-Restore die App komplett
// rendert; nur Zeit, Status, Runde und ein nicht angezeigtes Markerfeld variieren.
const BASE = JSON.parse(readFileSync(join(process.cwd(), 'examples', 'die-karren-kapitel-3.json'), 'utf8'));

function zug({ jahreszeit, statusText, aktionen, weltereignis = 'offen', marker }) {
  const s = structuredClone(BASE);
  s.meta = { ...s.meta, kapitel: 1, zeit: { jahreszeit, jahr: 1 }, weltereignis };
  s.status = { ...(s.status || {}), text: statusText };
  s.runde = { aktionen };
  s.grundgroessen = { ...(s.grundgroessen || {}), _marker: marker }; // hält Stände store-verschieden, ohne die Anzeige zu ändern
  return s;
}

test('Verlauf fasst mehrfaches Speichern desselben Zuges zu einem Eintrag zusammen', async ({ page }) => {
  const fruehlingAktionen = [{ titel: 'Die Insel erkunden', ergebnis: 'Klarer Erfolg (9 gegen 5)' }];
  const fruehling = (marker) => zug({
    jahreszeit: 'Frühling', statusText: 'Die Lage im Frühling.', aktionen: fruehlingAktionen, marker,
  });
  const sommer = zug({
    jahreszeit: 'Sommer', statusText: 'Die Lage im Sommer.',
    aktionen: [{ titel: 'Eingraben', ergebnis: 'Erfolg (7 gegen 4)' }], weltereignis: 'gewürfelt', marker: 9,
  });

  // Drei anzeige-gleiche Frühling-Stände + ein abweichender Sommer.
  const history = [fruehling(1), fruehling(2), fruehling(3), sommer].map((state, i) => ({ savedAt: 1000 + i, state }));

  // Im Serve-Modus lädt die App beim Start savegame.json (Live-Reload). Diesen
  // Live-Stand isolieren, damit der Verlauf nur aus den gesetzten Ständen besteht.
  await page.route('**/savegame.json', (r) => r.fulfill({ status: 404, body: '' }));
  await page.addInitScript((h) => {
    localStorage.setItem('rc.history', JSON.stringify(h));
  }, history);
  await page.goto('/#/historie');

  const flow = page.getByTestId('chronik-flow');
  await expect(flow).toBeVisible();

  // Drei identische Frühling-Stände fallen zu einem zusammen; mit dem Sommer
  // bleiben genau zwei Einträge statt vier.
  await expect(page.getByTestId('chronik-entry')).toHaveCount(2);
  await expect(flow).toContainText('Frühling');
  await expect(flow).toContainText('Sommer');
});

# RealmCraft

Ein Lagebild-Dashboard für ein spielleitergeführtes, offenes Aufbau- und Erzählspiel. Man spielt das Spiel im Gespräch mit einem Sprachmodell als Spielleiter, lässt sich auf den Befehl "Speichern" einen Speicherstand ausgeben und lädt ihn hier hoch. RealmCraft rendert die aktuelle Lage auf einen Blick: Berater mit KI-Portraits, Grundgrößen, Lagewerte, Akteure und eine KI-generierte Karte.

RealmCraft ist das **System** (Spielmechanik plus Dashboard) und kampagnenunabhängig. Jeder regelkonforme Speicherstand lässt sich laden. "Die Karren" ist der erste Beispielstand.

> Status: einsatzbereit. Mechanik, Speicherstand-Format, JSON-Schema, zwei Beispielstände (Kapitel 3 und Kapitel 4), das vollständige Dashboard und die Tests (Unit, E2E, Visual) liegen vor.

## Wie es zusammenspielt
1. **Spielen.** Mit der Mechanik in [`docs/Spielmechanik.md`](docs/Spielmechanik.md) führt ein Spielleiter (Sprachmodell) das Spiel.
2. **Speichern.** Auf "Speichern" gibt der Spielleiter einen hybriden Speicherstand aus, lesbare Prosa plus einen kanonischen JSON-Block (siehe [`docs/Speicherstand-Format.md`](docs/Speicherstand-Format.md)).
3. **Hochladen.** Den Speicherstand (`.md` oder `.json`) ins Dashboard ziehen.
4. **Bilder erzeugen.** Mit einem eigenen Gemini-API-Key (Nano Banana) Portraits und Karte generieren. Der Key bleibt lokal im Browser und wird nie übertragen oder committet.

## Struktur
- `docs/` Mechanik und Format-Spezifikation
- `schema/` JSON-Schema des Speicherstands
- `examples/` Beispielstand "Die Karren" als Hybrid-Markdown und als reines JSON
- `index.html`, `css/`, `js/` das Dashboard (Vanilla JS, kein Build-Schritt)
- `tests/` Unit-Tests (node:test) und E2E/Visual-Tests (Playwright)
- `serve.mjs` kleiner lokaler Static-Server

## Lokal starten
```
npm install
npm run serve     # http://localhost:4173
npm test          # Unit- und E2E-Tests
```
Dann im Browser `http://localhost:4173` öffnen, oben rechts "Speicherstand laden" und einen Stand aus `examples/` wählen (z. B. `die-karren-kapitel-4.md`), oder die Datei ins Fenster ziehen.

## API-Key (Bildgenerierung)
Den Gemini-Key in eine Datei `.env` im Repo-Root legen (wird per `.gitignore` nie eingecheckt):
```
GEMINI_API_KEY=dein-key
```
`serve.mjs` liest die `.env` und reicht den Key der App über `/env.js` zu, sodass die Bildgenerierung ohne manuelle Eingabe funktioniert. Alternativ den Key direkt im Dashboard unter "Einstellungen" eintragen (dann nur im Browser-`localStorage`). Bei `file://` oder GitHub Pages gibt es kein `/env.js`; dort den Key über die Einstellungen setzen.

## Bildgenerierung
Bilder entstehen über die Gemini-Bild-API (Nano Banana). Portraits nutzen standardmäßig Nano Banana 2 (`gemini-3.1-flash-image`), die Karte Nano Banana Pro (`gemini-3-pro-image`) wegen der besseren, lesbaren Beschriftung. Beide Modell-IDs sind in den Einstellungen überschreibbar; sollte ein Aufruf mit `404`/Modellfehler scheitern, die `-preview`-Variante probieren (z. B. `gemini-3.1-flash-image-preview`). Erzeugte Bilder werden lokal (IndexedDB) gecacht; ohne Key zeigt das Dashboard edle Platzhalter.

## Lizenz
MIT

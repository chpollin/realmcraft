# RealmCraft

Ein Lagebild-Dashboard für ein spielleitergeführtes, offenes Aufbau- und Erzählspiel. Man spielt das Spiel im Gespräch mit einem Sprachmodell als Spielleiter, lässt sich auf den Befehl "Speichern" einen Speicherstand ausgeben und lädt ihn hier hoch. RealmCraft rendert die aktuelle Lage auf einen Blick: Berater mit KI-Portraits, Grundgrößen, Lagewerte, Akteure und eine KI-generierte Karte.

RealmCraft ist das **System** (Spielmechanik plus Dashboard) und kampagnenunabhängig. Jeder regelkonforme Speicherstand lässt sich laden. "Die Karren" ist der erste Beispielstand.

> Status: in Aufbau. Dieses Repository enthält bereits die Mechanik, das Speicherstand-Format, das JSON-Schema und einen Beispielstand. Das Frontend und die Tests folgen.

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

## Bildgenerierung
Die Bilder entstehen über die Gemini-Bild-API. Portraits nutzen standardmäßig Nano Banana 2 (`gemini-3.1-flash-image`), die Karte Nano Banana Pro (`gemini-3-pro-image`) wegen der besseren, lesbaren Beschriftung. Beides ist in den Einstellungen umstellbar. Es wird ein eigener API-Key benötigt; ohne Key funktioniert das Dashboard mit Platzhaltern.

## Lizenz
MIT

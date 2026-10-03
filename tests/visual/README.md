# Visual Tests (Playwright)

Visual-Regression-Specs fuer sechs Dashboard-Views, je eine Spec in fester Reihenfolge:
`lage`, `berater`, `welt`, `karte`, `historie`, `armee` (Reiter "Curriculum").
Sie laufen als eigenes Playwright-Projekt `visual`, getrennt vom Projekt `e2e`.

## Ablauf je Spec

1. `openApp` isoliert die Seite mit `isolate()` aus `tests/e2e/_helpers.js`. Die Live-`savegame.json`, das Demo-Manifest samt Einzelstand-Fallback und `/env.js` antworten leer, damit weder die laufende Partie noch ein lokaler API-Key das Bild bestimmt.
2. `loadFixture` laedt `examples/die-karren-kapitel-3.json` ueber `[data-testid=load-input]` und wartet auf `[data-testid=realm-name]`.
3. `gotoView` schaltet ueber den Hash-Router (`#/<view>`) und wartet, bis `section[data-view=<view>]` sichtbar ist.
4. Vor dem Snapshot werden Web-Fonts (kurzer Timeout) und zwei Animation-Frames abgewartet.

Verglichen wird mit `animations: "disabled"` und `maxDiffPixelRatio: 0.02`. Portraits (`[data-testid=advisor-portrait]`) und Kartengrafik (`[data-testid=map-image]`) sind maskiert.

## Baselines

Die Baselines sind eingecheckt unter
`tests/visual/<spec>.spec.js-snapshots/<view>-chromium-<plattform>.png`.
Der Name haengt nicht am Projektnamen (`snapshotPathTemplate` in `playwright.config.mjs`).
Baselines gibt es derzeit nur fuer `win32`. Auf einer anderen Plattform fehlen sie und muessen dort erst erzeugt werden.

Vergleich gegen die Baselines:

```sh
npm run test:visual
```

Baselines nach einer gewollten UI-Aenderung neu schreiben und die geaenderten PNGs pruefen, bevor sie committet werden:

```sh
npm run test:visual:update
```

## Browser und Port

Playwright startet `serve.mjs` selbst auf Port 4391 (ueberschreibbar mit `PORT`) und nutzt nie einen laufenden Server, auch nicht den Live-Server des Spielleiters auf 4173.
Fehlt das von Playwright mitgelieferte Chromium, laeuft der Test mit dem installierten Chrome:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:visual
```

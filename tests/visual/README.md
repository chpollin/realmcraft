# Visual Tests (Playwright)

Visual-Regression-Specs fuer die fuenf RealmCraft-Views, in fester Reihenfolge:
`lage`, `berater`, `welt`, `karte`, `historie`.

## Vertrags-Bezug

Die Specs greifen ausschliesslich auf die im `docs/Frontend-Contract.md`
definierten Hooks zu:

- Laden des Beispielstands ueber das Datei-Input `[data-testid=load-input]`
  (Fixture: `examples/die-karren-kapitel-3.json`).
- View-Wechsel ueber den Hash-Router (`#/lage`, `#/berater`, `#/welt`,
  `#/karte`, `#/historie`).
- View-Container `[data-testid=view-<name>]` als Sichtbarkeits-Anker.
- Ready-Hook `window.__realmcraft__.ready === true` nach dem Laden.

## Stabilisierung

- Warten auf Google Fonts (`document.fonts.ready`, kurzer Timeout) vor jedem
  Snapshot, plus RAF-Tick zum Layout-Settle.
- `animations: "disabled"` und `maxDiffPixelRatio: 0.02` pro Snapshot.
- Maskierung instabiler Bildbereiche (Platzhalter-Portraits, Kartengrafik)
  via `mask`-Option, damit die Baselines deterministisch bleiben.

## Baselines erzeugen

Baselines werden im Verify-Schritt erzeugt (nicht eingecheckt von diesem
Modul). Erzeugen bzw. aktualisieren:

```sh
npx playwright test tests/visual --update-snapshots
```

Vergleich gegen bestehende Baselines:

```sh
npx playwright test tests/visual
```

Die Baseline-PNGs landen unter
`tests/visual/<spec>.spec.js-snapshots/<view>-<browser>-<plattform>.png`.

## Abhaengigkeiten

Einzige Dev-Abhaengigkeit: `@playwright/test`. Keine externen
Laufzeit-Abhaengigkeiten (Vertragsregel).

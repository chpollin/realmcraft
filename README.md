# RealmCraft

## Entwicklung zum Echtzeitstrategiespiel

Das Ziel ist ein Echtzeitstrategiespiel im Browser mit Basisaufbau, organisierter Bevölkerung, Zuzug, Technologie und fortwirkenden politischen Entscheidungen. Friedliche Entwicklung, Umwelt- und Geschäftskonflikte sowie Verteidigung und offensiver Krieg gehören dazu. Neue Weltpakete sollen unterschiedliche Welten, Level und Gestaltungen ermöglichen. Die laufende Partie benötigt keine Modellantwort.

Der [Implementierungsplan](docs/RealmCraft-Echtzeitstrategie.md) konkretisiert Architektur und ersten Siedlungsausschnitt. [User Stories und Abnahme](docs/RealmCraft-User-Stories.md) vergleichen das Ziel mit der vorhandenen Umsetzung. Der [Arbeitsstand](docs/RealmCraft-Arbeitsstand.md) ermöglicht die Fortsetzung, [docs/INDEX.md](docs/INDEX.md) erschließt das Entwicklungswissen. Die Echtzeitlaufzeit ist noch nicht implementiert. Die folgenden Spiele bleiben Rundenprototypen.

## Strategiespiel Nachtmeer

Unter [spiel/](spiel/) führt eine vollständige Partie durch sechs Gezeiten. Du erschließt Inseln, versorgst den Hafen von Lys und baust ein Leuchtfeuernetz auf. Entscheidungen über Schutzsuchende, Gildenrechte und gemeinsames Wissen verändern spätere Handlungen. Die Partie läuft ohne Würfel und ohne Modellzugang und besitzt eigene Speicherstände einschließlich offener Befehle.

Nach `npm run serve` öffnet `http://localhost:4173/spiel/` das Strategiespiel. Umfang, Regeln und Prüfergebnisse stehen in [docs/Nachtmeer-Implementierung.md](docs/Nachtmeer-Implementierung.md). `npm run simulate:nachtmeer` führt zwei unterschiedliche Strategien ohne Oberfläche aus. Gestaltung, Geschichte und Spielbalance sind noch nicht vom Nutzer abgenommen.

Die [Kartenkammer](docs/Nachtmeer-Kartenkammer.md) verbindet eine gezeichnete Seekarte mit Ortsberichten und dem Beschlussregister. Eine [isolierte Gestaltungsprobe](design/nachtmeer/kartenkammer.html) zeigt die Sternwarte vor der Erschließung, im Bauentwurf und mit aktivem Feuer. Sie verändert keine gespeicherte Partie.

Die drei früheren [Designstudien](design/nachtmeer/vergleich.html) bleiben zum Vergleich verfügbar. Das frühere Szenario [Der erste Winter](spiel/winter.html) und seine [Regeldokumentation](docs/Strategiespiel-M1.md) sind weiterhin erreichbar.

## Spielleiterverfahren und Dashboard

RealmCraft ist zugleich ein erzählendes Strategie-Rollenspiel mit einem Large Language Model (LLM) als Spielleiter, dem Chronisten. Du führst ein Volk über Jahre und Kapitel. Der Chronist legt die Lage offen und nennt Zielwert und Modifikatoren, du entscheidest und würfelst 1d10 selbst. Ein mitlaufendes Dashboard spiegelt den Stand und erzeugt Bilder im einheitlichen Stil der Partie, etwa von Beratern, Mächten, Karte und Siedlungen.

Gespielt wird im Chat mit einem LLM oder im Terminal mit [Claude Code](https://claude.com/claude-code) gegen den lokalen Live-Server. Beide Wege beschreibt [CLAUDE.md](CLAUDE.md) im Abschnitt Zwei Spielweisen.

## Schnellstart

```bash
npm install
npm run serve                    # Bash: PORT=4173 node serve.mjs
```

```powershell
$env:PORT=4173; node serve.mjs   # PowerShell
```

Dann im Browser `http://localhost:4173` öffnen und einen Speicherstand laden, per Knopf, Drag and Drop oder Einfügen. Auf der veröffentlichten Seite ist ein Beispielstand voreingestellt, ein eigener lässt sich jederzeit darüberladen.

## Bildgenerierung (optional)

Für die Bilder braucht es einen Gemini-API-Key. Er wird entweder in den Einstellungen eingegeben oder in einer `.env` im Repository-Root abgelegt:

```
GEMINI_API_KEY=dein-key
```

Der Key bleibt lokal und wird nie committet.

## Tests

```bash
npm test                    # npm run check und Unit-Tests (node:test)
npm run test:e2e            # End-to-End-Tests (Playwright)
npm run test:visual         # Visual-Snapshots (Playwright)
npm run test:visual:update  # Baselines nach gewollter UI-Änderung neu schreiben
npm run validate:savegame   # savegame.json gegen das Schema prüfen
```

`npm run check` prüft die Syntax aller versionierten Module und die Schemakonformität der Beispielstände. Die Playwright-Tests starten ihren eigenen Server auf Port 4391 und greifen nie auf einen laufenden Server zu. Fehlt das mitgelieferte Chromium, laufen sie mit `PLAYWRIGHT_CHANNEL=chrome` im installierten Chrome. Details zu den Baselines stehen in [tests/visual/README.md](tests/visual/README.md).

## Struktur

- `index.html`, `anleitung.html`, `js/`, `css/` enthalten das Dashboard aus ES-Modulen ohne Build-Schritt.
- `fonts/` hält die lokal eingebundenen Schriften Inter und Space Grotesk mit ihren OFL-Lizenzen.
- `serve.mjs` ist der Entwicklungsserver mit Live-Reload.
- `spiel/` enthält die Rundenprototypen Nachtmeer und Der erste Winter.
- `design/` enthält Designstudien, Gestaltungsproben und Screenshot-Skripte.
- `schema/` enthält das JSON-Schema des Speicherstands.
- `examples/` enthält Beispielstände, Demostände für die veröffentlichte Seite und Sicherungen der Spielleiterpartien.
- `tools/` enthält Prüf-, Demo- und Bildwerkzeuge.
- `tests/` enthält Unit-, E2E- und Visual-Tests.
- `docs/` enthält das Entwicklungswissen, erschlossen über [docs/INDEX.md](docs/INDEX.md).
- `knowledge/` enthält das verdichtete Partie-Gedächtnis.

## Weiterlesen

- [docs/Spielmechanik.md](docs/Spielmechanik.md) mit den Regeln des Spielleiterverfahrens.
- [docs/UI-Gesamtbild.md](docs/UI-Gesamtbild.md) mit Stil, Architektur, Reitern, Bildpipeline und Live-Spiegelung des Dashboards.
- [docs/Frontend-Contract.md](docs/Frontend-Contract.md) mit den verbindlichen Feldern und testids.
- [docs/Speicherstand-Format.md](docs/Speicherstand-Format.md) mit dem Format des Speicherstands.
- [knowledge/INDEX.md](knowledge/INDEX.md) als Hub der Spielleiterpartien.

## Promptotyping

RealmCraft ist ein [Promptotyping](https://dhcraft.org/Promptotyping/)-Projekt von [Christopher Pollin](https://dhcraft.org) (DHCraft).

## Licence

The code in this repository is released under the MIT Licence (see `LICENSE`).
Documentation, knowledge documents, and other textual content are licensed under
CC BY 4.0. Any third-party material included retains the rights of its holders.

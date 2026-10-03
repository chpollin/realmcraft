# RealmCraft, Entwicklungswissen

## Einstieg

RealmCraft entwickelt sich zu einem Echtzeitstrategiespiel im Browser mit Basisaufbau, Bevölkerung, Forschung, Institutionen und friedlichen wie militärischen Entwicklungswegen. Unterschiedliche Weltpakete sollen neue Partien mit eigener Gestaltung und Regelkonstellation ermöglichen. Nachtmeer und Winter sind Rundenprototypen. Die Echtzeitlaufzeit ist noch nicht implementiert.

| Gegenstand | Maßgebliche Quelle |
|---|---|
| Aktueller Auftrag, tatsächlicher Stand und Wiedereinstieg | [RealmCraft-Arbeitsstand.md](RealmCraft-Arbeitsstand.md) |
| Echtzeitarchitektur, Umsetzungsfolge und nächster ausführbarer Abschnitt | [RealmCraft-Echtzeitstrategie.md](RealmCraft-Echtzeitstrategie.md) |
| Spielerabsichten, belegte Lücken und gestalterische Abnahme | [RealmCraft-User-Stories.md](RealmCraft-User-Stories.md) |
| Kartenkammer als Gestaltungsreferenz und ihre technische Prüfung | [Nachtmeer-Kartenkammer.md](Nachtmeer-Kartenkammer.md) |
| Nachtmeer als Rundenreferenz, implementierte Regeln und Simulationsumfang | [Nachtmeer-Implementierung.md](Nachtmeer-Implementierung.md) |
| Frühere Winter-Partie | [Strategiespiel-M1.md](Strategiespiel-M1.md) |
| Begründete Entwicklungsschritte | [Entwicklungsjournal.md](Entwicklungsjournal.md) |
| Frühere UI-Varianten | [Designstudien](../design/nachtmeer/README.md) |
| Regeln des Spielleiterverfahrens | [Spielmechanik.md](Spielmechanik.md) |
| Startprompt für den Chatmodus, von `anleitung.html` zum Herunterladen angeboten | [Spielstart-Prompt.md](Spielstart-Prompt.md) |
| Speicherstand, Felder und Bildfelder | [Speicherstand-Format.md](Speicherstand-Format.md), [JSON-Schema](../schema/savegame.schema.json) |
| Dashboard und Frontend-Vertrag | [UI-Gesamtbild.md](UI-Gesamtbild.md), [Frontend-Contract.md](Frontend-Contract.md) |
| Visual-Tests und ihre Baselines | [tests/visual/README.md](../tests/visual/README.md) |
| Laufende Spielleiterpartien | [Partie-Gedächtnis](../knowledge/INDEX.md) |

## Verantwortungsgrenzen

Das Datei-Eigentum zwischen Entwicklung und Spielleitung regelt [CLAUDE.md](../CLAUDE.md). Die Nachtmeer-Partie speichert unabhängig davon im Browser oder in einer exportierten Datei. Die Gestaltungsprobe unter `design/nachtmeer/kartenkammer.html` arbeitet ausschließlich im Speicher ihrer eigenen Seite.

Im Obsidian-Vault führen `Project Overview RealmCraft`, `RealmCraft Game Design` und `RealmCraft Interface Design` zu Zweck, Spielkonzept und Gestaltung. Der operative Projektstand steht in `ACTIVE-WORK.md`. Aktuelle technische Evidenz wird ausschließlich hier im Repository gepflegt.

## Prüfzugänge

```sh
npm test                    # npm run check und Unit-Tests
npm run check               # Syntax aller versionierten Module, Schemakonformität der Beispielstände
npm run validate:savegame   # prüft savegame.json gegen das Schema, falls vorhanden
npm run test:e2e            # Playwright, Projekt e2e
npm run test:visual         # Playwright, Projekt visual
npm run test:visual:update  # Visual-Baselines nach gewollter UI-Änderung neu schreiben
npm run simulate:nachtmeer  # zwei feste Strategien ohne Oberfläche
npm run serve               # Entwicklungsserver auf Port 4173
```

`npm test` ist die Qualitätsschwelle vor einem Commit. Playwright startet für E2E- und Visual-Tests einen eigenen Server auf Port 4391 und nutzt nie einen laufenden Server, auch nicht den Live-Server der Spielleitung. Fehlt das von Playwright mitgelieferte Chromium, laufen die Browsertests mit `PLAYWRIGHT_CHANNEL=chrome` im installierten Chrome. Diese Befehle prüfen das Dashboard und die vorhandenen Referenzspiele. Für die Echtzeitfunktion definiert der Echtzeitplan eigene Zugänge. Technische Tests, beobachtete Bedienung und fachliche oder gestalterische Nutzerabnahme werden getrennt geführt.

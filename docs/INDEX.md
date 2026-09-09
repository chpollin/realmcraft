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
| Dashboard und Frontend-Vertrag | [UI-Gesamtbild.md](UI-Gesamtbild.md), [Frontend-Contract.md](Frontend-Contract.md) |
| Laufende Spielleiterpartien | [Partie-Gedächtnis](../knowledge/INDEX.md) |

## Verantwortungsgrenzen

Die Entwicklung schreibt in Code, Tests und Entwicklungsdokumentation. `knowledge/` und `savegame.json` gehören zum Spielleiterverfahren und bleiben unter der Zuständigkeit der Spielleitung. Die Nachtmeer-Partie speichert unabhängig davon im Browser oder in einer exportierten Datei. Die Gestaltungsprobe unter `design/nachtmeer/kartenkammer.html` arbeitet ausschließlich im Speicher ihrer eigenen Seite.

Im Obsidian-Vault führen `Project Overview RealmCraft`, `RealmCraft Game Design` und `RealmCraft Interface Design` zu Zweck, Spielkonzept und Gestaltung. Der operative Projektstand steht in `ACTIVE-WORK.md`. Aktuelle technische Evidenz wird ausschließlich hier im Repository gepflegt.

## Prüfzugänge

```sh
npm run test:unit
npm run simulate:nachtmeer
npm run serve
```

Diese Befehle prüfen und öffnen die vorhandenen Referenzspiele. Sie belegen keine Echtzeitfunktion. Der Echtzeitplan definiert die künftig erforderlichen Zugänge. Technische Tests, beobachtete Bedienung und fachliche oder gestalterische Nutzerabnahme werden getrennt geführt.

# RealmCraft, Arbeitsstand und Wiedereinstieg

## Gegenwärtiger Auftrag

Maßgeblich ist die Nutzerentscheidung vom 9. September 2026 für ein Echtzeitstrategiespiel im Browser. Basisaufbau, Bevölkerung, Zuzug, Technologie, Ereignisse und Institutionen gehören zusammen. Verteidigung und offensiver Krieg sollen ebenso möglich sein wie friedlicher Aufbau mit Umwelt- und Geschäftskonflikten. Neue Weltpakete und Karten sollen wiederholte Partien mit eigenen Mechaniken und Gestaltungen ermöglichen.

Die Oberfläche soll deutlich ästhetischer werden und funktionale Symbole erhalten. Die Kartenkammer ist als endgültiges Zielbild beanstandet. Ihre erneute Freigabe ist keine offene Voraussetzung der Echtzeitentwicklung. Die grundsätzliche Rolle des Krieges ist geklärt, friedlicher Aufbau, Verteidigung und Offensive gehören alle zum Ziel. Detailwerte, Gefechtsregeln und ästhetische Qualität werden am jeweiligen spielbaren Ausschnitt beurteilt.

## Was tatsächlich vorliegt

Nachtmeer unter `spiel/` und Winter unter `spiel/winter.html` sind spielbare Rundenmodelle. Die Designstudien und die Kartenkammer bleiben Vergleichsmaterial. Ihre technischen Belege stehen in den jeweiligen Dokumenten. Das Dashboard des Spielleiterverfahrens ist davon getrennt und in [UI-Gesamtbild.md](UI-Gesamtbild.md) beschrieben.

Der Echtzeitbereich `rts/`, allgemeine Welterzeugung, bewegte Bewohner, Logistik, Technologiepfade und Kampf sind noch nicht implementiert. Der [Echtzeitplan](RealmCraft-Echtzeitstrategie.md) definiert den Aufbau. [User Stories und Abnahme](RealmCraft-User-Stories.md) benennen Referenzen und Lücken. Phaser mit TypeScript und Vite ist die technische Empfehlung. Installiert ist davon noch nichts.

## Nächste konkrete Arbeit

Der erste Implementierungsabschnitt ist E1, bewohnte Siedlung. Sein Prüffall verbindet Arbeit, Lieferung, einen abgeschlossenen Bau, Zuzug, ein erforschtes Verfahren und einen fortgeltenden Versorgungspakt. Implementierungsfolge und Abnahme stehen im [Echtzeitplan](RealmCraft-Echtzeitstrategie.md#nächster-milestone-e1-bewohnte-siedlung).

Beim Fortsetzen zuerst den Arbeitsbaum prüfen und den getrennten Einstieg `rts/` anlegen. Danach eine Spielszene mit Kamera, auswählbaren Objekten und einem von der Grafik unabhängigen Zeitmodell bauen. Von Beginn an gelten US16 und US17 für Weltansicht, Symbole und Informationsdichte. Die erste Welt erhält eine konkrete Gestaltung, die über das Weltpaket austauschbar bleibt.

## Orientierung und Schreibgrenzen

1. Für Vault-Rückschreibung im Vault `C:/Users/Chrisi/Documents/obsidian` starten und dessen Regeln anwenden.
2. `Projects/Eigenforschung/RealmCraft/Project Overview RealmCraft.md`, `RealmCraft Game Design.md` und `RealmCraft Interface Design.md` für Ziel, Mechaniken und Gestaltung lesen.
3. Im Repository `C:/Users/Chrisi/Documents/GitHub/realmcraft` die Entwicklungsanweisung in `CLAUDE.md` und `docs/INDEX.md` lesen, dann den Echtzeitplan und die zum Abschnitt gehörenden Stories.
4. Das Datei-Eigentum zwischen Entwicklung und Spielleitung regelt `CLAUDE.md`. Die Echtzeitentwicklung überschreibt nichts unter `knowledge/` und in `savegame.json`.

Der Entwicklungsserver läuft nach `npm run serve` auf `http://localhost:4173/`, ein anderer Port lässt sich über `PORT` setzen. Die Screenshot-Skripte unter `design/` folgen derselben Variable. Browsertests starten ihren eigenen Server auf Port 4391. Für Vite einen freien Port verwenden und laufende Server nicht pauschal beenden, weil der Live-Server der Spielleitung darunter sein kann. Der geplante Produktionsbuild bleibt eine statische Browseranwendung.

## Prüfung

Technische Tests, beobachtete Bedienung und fachliche oder gestalterische Nutzerabnahme werden getrennt geführt. Der Story-Abgleich beruht auf Code, dokumentierter Browserfunktion und Nutzerkritik. Die Prüfbefehle stehen in [INDEX.md](INDEX.md#prüfzugänge). Sie belegen die Rundenprototypen und das Dashboard. Für die Echtzeitfunktion definiert der Echtzeitplan eigene Prüfzugänge. Die Browserprüfungen der Kartenkammer sind in [Nachtmeer-Kartenkammer.md](Nachtmeer-Kartenkammer.md) abgegrenzt. Operative nächste Schritte stehen in ACTIVE-WORK, der technische Zuschnitt bleibt im Repository.

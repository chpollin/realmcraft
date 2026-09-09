# RealmCraft, Arbeitsstand und Wiedereinstieg

## Gegenwärtiger Auftrag

Maßgeblich ist die Nutzerentscheidung vom 9. September 2026 für ein Echtzeitstrategiespiel im Browser. Basisaufbau, Bevölkerung, Zuzug, Technologie, Ereignisse und Institutionen gehören zusammen. Verteidigung und offensiver Krieg sollen ebenso möglich sein wie friedlicher Aufbau mit Umwelt- und Geschäftskonflikten. Neue Weltpakete und Karten sollen wiederholte Partien mit eigenen Mechaniken und Gestaltungen ermöglichen.

Der zuletzt ausgeführte Auftrag ordnet Pläne und Wissen, prüft die User Stories gegen die Umsetzung und sichert diese Arbeit für den Sessionabschluss in Git. Die Oberfläche soll deutlich ästhetischer werden und funktionale Symbole erhalten. Die Kartenkammer ist als endgültiges Zielbild beanstandet. Ihre erneute Freigabe ist keine offene Voraussetzung der Echtzeitentwicklung.

## Was tatsächlich vorliegt

Nachtmeer unter `spiel/` und Winter unter `spiel/winter.html` sind spielbare Rundenmodelle. Die Designstudien und die Kartenkammer bleiben Vergleichsmaterial. Ihre technischen Belege stehen in den jeweiligen Dokumenten. Diese Überarbeitung betrifft das Projektwissen; sie installiert keine Laufzeit und verändert diese Spiele nicht.

Der Echtzeitbereich `rts/`, allgemeine Welterzeugung, bewegte Bewohner, Logistik, Technologiepfade und Kampf sind noch nicht implementiert. Der [Echtzeitplan](RealmCraft-Echtzeitstrategie.md) definiert den Aufbau. [User Stories und Abnahme](RealmCraft-User-Stories.md) benennen Referenzen und Lücken. Phaser mit TypeScript und Vite ist die technische Empfehlung, noch keine aktive Installation.

## Nächste konkrete Arbeit

Der erste Implementierungsabschnitt ist E1, bewohnte Siedlung. Sein Prüffall verbindet Arbeit, Lieferung, einen abgeschlossenen Bau, Zuzug, ein erforschtes Verfahren und einen fortgeltenden Versorgungspakt. Implementierungsfolge und Abnahme stehen im [Echtzeitplan](RealmCraft-Echtzeitstrategie.md#nächster-milestone-e1-bewohnte-siedlung).

Beim Fortsetzen zuerst den Arbeitsbaum prüfen und den getrennten Einstieg `rts/` anlegen. Danach eine Spielszene mit Kamera, auswählbaren Objekten und einem von der Grafik unabhängigen Zeitmodell bauen. Von Beginn an gelten US16 und US17 für Weltansicht, Symbole und Informationsdichte. Die erste Welt erhält eine konkrete Gestaltung, die über das Weltpaket austauschbar bleibt.

## Orientierung und Schreibgrenzen

1. Für Vault-Rückschreibung im Vault `C:/Users/Chrisi/Documents/obsidian` starten und dessen Regeln anwenden.
2. `Projects/Eigenforschung/RealmCraft/Project Overview RealmCraft.md`, `RealmCraft Game Design.md` und `RealmCraft Interface Design.md` für Ziel, Mechaniken und Gestaltung lesen.
3. Im Repository `C:/Users/Chrisi/Documents/GitHub/realmcraft` die Entwicklungsanweisung in `CLAUDE.md` und `docs/INDEX.md` lesen; dann den Echtzeitplan und die zum Abschnitt gehörenden Stories.
4. Code, Entwicklungsdokumente und Tests gehören zur Entwicklung. `knowledge/` und `savegame.json` bleiben bei der Spielleitung. Dort keine Inhalte für die Echtzeitentwicklung überschreiben.

Der Sessionabschluss sichert die Entwicklungsartefakte und das zugehörige Vault-Wissen in getrennten lokalen Commits. Der Arbeitsbaum enthält zusätzlich Änderungen aus anderen Arbeitszusammenhängen. Insbesondere geänderte Kampagnendokumente, gelöschte Beispiele und neue Spielleiterbestände bleiben außerhalb dieser Sicherung erhalten. Auch die gemeinsamen Vault-Verzeichnisse enthalten weitere Arbeit; ACTIVE-WORK, Repo-Verzeichnis und Erledigt-Log werden für diesen Abschluss nur mit ihren RealmCraft-Anteilen versioniert.

Auf `origin/main` liegt beim Abschluss ein lokal noch nicht integrierter WIP-Commit. Die Sicherung veröffentlicht nichts. Vor einer späteren Synchronisierung den dann aktuellen Git-Stand und den Inhalt dieses Commits prüfen.

Der bisher verwendete lokale Server ist `http://localhost:4190/`. Den Zustand beim Wiedereinstieg prüfen; für Vite einen freien Port verwenden. Laufende Server nicht pauschal beenden. Der geplante Produktionsbuild bleibt eine statische Browseranwendung.

## Beleg und Grenzen der Konsolidierung

Der Story-Abgleich beruht auf Code, dokumentierter Browserfunktion und Nutzerkritik. Der Abschluss dieser Überarbeitung prüft Dokumentverweise, Zuständigkeiten und den ACTIVE-WORK-Feldvertrag. Er führt keinen neuen Browser- oder Leistungstest aus.

Die Prüfung vom 9. September 2026 bestätigt 31 lokale Dokumentlinks einschließlich Überschriftzielen in sieben Entwicklungsdokumenten. Der auf RealmCraft begrenzte Vault-Audit meldet keine defekten Links, Anker- oder Frontmatter-Befunde. ACTIVE-WORK erfüllt den Feldvertrag und stimmt beim Repository- und Wissenseinstieg mit dem Repo-Verzeichnis überein. Der als noch nicht implementiert bezeichnete Echtzeitbereich fehlt tatsächlich im Repository.

Der globale Vault-Check findet im gemeinsamen Arbeitsverzeichnis ein fehlendes Frontmatter in einem unversionierten KUG-Workshop-README. Diese fremde Arbeit gehört nicht zum RealmCraft-Abschluss. Für die Vault-Sicherung wird deshalb der genaue Commit-Umfang in einem isolierten Git-Arbeitsverzeichnis mit demselben Commit-Check geprüft.

Beim abschließenden Prüflauf im vorhandenen Arbeitsbaum bestehen erneut alle 134 Unit-Tests. Die Simulationen Inselbund und Admiralität erreichen ihre unterschiedlichen erfolgreichen Abschlusszustände. Diese Ergebnisse gelten für die Rundenprototypen. Die bereits dokumentierten Browserprüfungen bleiben in [Nachtmeer-Kartenkammer.md](Nachtmeer-Kartenkammer.md) abgegrenzt.

Die grundsätzliche Rolle des Krieges ist geklärt. Friedlicher Aufbau, Verteidigung und Offensive gehören alle zum Ziel. Detailwerte, Gefechtsregeln und ästhetische Qualität werden am jeweiligen spielbaren Ausschnitt beurteilt. Operative nächste Schritte stehen in ACTIVE-WORK; der technische Zuschnitt bleibt im Repository.

# Entwicklungsjournal

## 2026-09-09 · Strategiespiel M1

Der Auftrag zur Umsetzung des nächsten Meilensteins wurde auf eine spielbare Jahrespartie mit Wirtschaft und bindender Ratsentscheidung konkretisiert. Der neue Einstieg `spiel/` enthält die deterministische Simulation, die direkte Bedienung und eigene Speicherstände. Das Winterlager ergänzt den Erzaußenposten, damit frühe Entscheidungen einen späteren Versorgungsnutzen haben und der Versorgungspakt an einem weiteren Vorhaben wirksam wird.

Die Umsetzung bleibt innerhalb der vorhandenen Architektur ohne Build-Schritt. Die Partiedokumente in `knowledge/`, `savegame.json` und das bestehende Dashboard wurden nicht verändert. Die fremden Änderungen im Arbeitsbaum blieben erhalten. Regeln, Zuschnitt und Prüfgrundlagen stehen in [Strategiespiel-M1.md](Strategiespiel-M1.md).

Regel- und Browserprüfungen zeigen die vollständige Jahrespartie, unterschiedliche erfolgreiche Handlungswege, Speicherfortsetzung und verständliche Fehlerzustände. Die Spielbalance ist als Entwurf gekennzeichnet. Die fachliche Nutzerabnahme steht noch aus.

## 2026-09-09 · Nachtmeer und drei UI-Entwürfe

Der Nutzer bewertet die Gestaltung von M1 als unzureichend und verlangt eine neue Geschichte. Der folgende Auftrag konzentriert die Arbeit auf drei Designvarianten. Als gemeinsame Ausgangslage dient der Vorschlag Nachtmeer mit einer überfluteten Inselwelt, erloschenen Leuchtfeuern und einem Konflikt um Schutzsuchende im Hafen von Lys.

Unter `design/nachtmeer/` sind Admiralität, Atlas und Signal als interaktive Gestaltungsstudien umgesetzt. Sie teilen dieselben Beispieldaten und unterscheiden sich in räumlicher Anordnung, Typografie und Farbgebung. Die Vergleichsseite `vergleich.html` zeigt alle Varianten. Die Weltillustration wurde mit dem integrierten Imagegen-Werkzeug erzeugt; Quelle und vollständiger Prompt stehen in `ART-DIRECTION.md`.

Die Browserprüfung erfasst Ortsauswahl, Aufträge, Ressourcenfolgen, sichtbare Leuchtfeuer, Ratsdialog und Chronik. Überlagerungen auf schmalen und mittleren Fenstern wurden korrigiert. Das Prüfprotokoll unter `design/nachtmeer/PRUEFUNG.md` trennt technische Verifikation von der offenen gestalterischen Nutzerabnahme. Die neuen Entwürfe verwenden einen flüchtigen Beispielzustand. Eine neue vollständige Kampagne und die Verbindung dieser Oberflächen mit dem Spielkern sind noch nicht umgesetzt.

## 2026-09-09 · Nachtmeer als vollständige Partie

Der anschließende Implementierungsauftrag verbindet die neue Welt mit einem eigenen Simulationskern unter `spiel/nachtmeer/`. Sechs Gezeiten, bindende Ratsentscheidungen, das Leuchtfeuernetz, Versorgung, Sturm und zwei politische Abschlussfassungen sind umgesetzt. `/spiel/` öffnet Nachtmeer; das frühere Winter-Szenario bleibt unter `/spiel/winter.html` erhalten. Eigene Speicherstände sichern auch offene Entwürfe.

129 Unit-Tests bestehen. Zwei feste Strategien erreichen mit unterschiedlichen Ordnungen und Ressourcenständen das Ziel. Eine vollständige Browserpartie, Datei-Import und Export, Fortsetzung nach Neuladen, Fehlerbehandlung und vier Ansichtsbreiten wurden geprüft. Umfang und Grenzen stehen in [Nachtmeer-Implementierung.md](Nachtmeer-Implementierung.md).

Der Nutzer bestätigt die maritime Richtung grundsätzlich, beschreibt die Gestaltung zugleich als noch zu generisch und verlangt eine ästhetisch anspruchsvollere Ausarbeitung. Die technische Umsetzung verwendet vorläufig Admiralität. Eine bevorzugte Variante oder eine endgültige Art Direction ist damit nicht freigegeben; die vergleichbaren Designstudien bleiben erhalten.

## 2026-09-09 · Kartenkammer und kanonisches Projektwissen

Der erneute Implementierungsauftrag konkretisiert die Oberfläche als Arbeitsinstrument des Hafenrats von Lys. Die Kartenkammer verbindet eine schematische SVG-Seekarte mit Ortsberichten und Beschlussregister. Papier, Tinte und sparsame Signalfarben erhalten feste Aufgaben. Eine unbekannte Verbindung, ein vorgemerkter Feuerbau und ein betriebenes Leuchtfeuer bleiben sichtbar unterscheidbar. Ortsprotokolle und Beschlüsse stammen aus der ausgeführten Zuggeschichte.

Die Gestaltungsprobe `design/nachtmeer/kartenkammer.html` zeigt den Sternwartenfall in drei regulär berechneten Zuständen. Sie verwendet dieselbe Darstellung und denselben Spielkern wie `/spiel/`, greift aber nicht auf die gespeicherte Partie zu. Die früheren Varianten bleiben als Vergleich erhalten. Plan, Implementierung und Prüfergebnisse stehen in [Nachtmeer-Kartenkammer.md](Nachtmeer-Kartenkammer.md).

134 Unit-Tests bestehen. Die beiden festen Strategien bleiben erfolgreich. Eine vollständige Browserpartie in der Kartenkammer und der unveränderte reguläre Spielstand nach den Gestaltungsproben wurden geprüft. Ortswahl, Gezeitenprüfung, Tastaturabschluss und schmale Ansichten wurden untersucht; Kontrast, Beschriftungen und Scrollverhalten wurden nachgebessert. Die fachliche Nutzerbeurteilung von Gestaltung, Geschichte und Spielbalance bleibt offen.

Auf ausdrücklichen Nutzerauftrag wurde RealmCraft als Eigenforschung in ACTIVE-WORK integriert. Im Vault ist der Project Overview auf beide Spielverfahren ausgerichtet, das Game Design nachgeführt und das Interface Design als eigener Pflegeort angelegt. `docs/INDEX.md` erschließt das Entwicklungswissen; Repo-Verzeichnis und ACTIVE-WORK verweisen auf denselben Einstieg. Die Spielleiterinhalte unter `knowledge/` und fremde Änderungen im Arbeitsbaum bleiben erhalten.

## 2026-09-09 · Echtzeitspiel und Konsolidierung des Projektwissens

Der Nutzer ersetzt das Rundenstrategieziel ausdrücklich durch ein Echtzeitspiel mit Basisaufbau, organisierter Bevölkerung, Zuzug und Technologie. Auf Rückfrage bestätigt er friedliche Entwicklung, Umwelt- und Geschäftskonflikte, Verteidigung und offensiven Krieg als Bestandteile desselben Spiels. Der Browser bleibt die bevorzugte Plattform. Neue Partien sollen aus unterschiedlichen geprüften Weltpaketen entstehen; die laufende Simulation benötigt keine Modellantwort.

Die Kartenkammer wird wegen zu vieler Linien und Strukturelemente sowie ihres Webseitencharakters beanstandet. Gewünscht sind eine deutlich ästhetischere Spielansicht und mehr funktionale Symbole. Die Nutzerfrage zur Kartenkammer ist damit beantwortet. Eine gestalterische Abnahme wurde nicht erteilt.

Der Auftrag konzentriert sich anschließend ausdrücklich auf saubere Ablage, Refactoring des Projektwissens und einen kontrollierten Wiedereinstieg. [Echtzeitplan](RealmCraft-Echtzeitstrategie.md), [User Stories](RealmCraft-User-Stories.md) und [Arbeitsstand](RealmCraft-Arbeitsstand.md) erfüllen jeweils diese getrennten Funktionen. Der erste ausführbare Abschnitt ist E1, bewohnte Siedlung. Phaser mit TypeScript und Vite ist für den erweiterten Spielumfang empfohlen; die Simulation soll unabhängig von Grafik und Browser bleiben. Eine neue Laufzeit wurde in diesem Auftrag nicht installiert.

Game Design, Interface Design und Project Overview im Vault wurden auf die neue Richtung ausgerichtet. Der frühere Saisonentwurf bleibt als gekennzeichneter Referenzfall erhalten. ACTIVE-WORK führt das neue Ziel und den ersten Implementierungsabschnitt. README und Entwicklungsindex erschließen denselben Stand. Der Story-Abgleich trennt vorhandene Referenzfunktionen von noch fehlenden Echtzeitfunktionen und der beanstandeten Gestaltung.

## 2026-09-09 · Kontrollierter Sessionabschluss

Der abschließende Auftrag sichert die vorhandenen Rundenprototypen, Gestaltungsstudien, Tests und Entwicklungsdokumente zusammen mit der Ausrichtung auf das Echtzeitspiel. Der Wiedereinstieg führt zu E1, bewohnte Siedlung. Der Abschluss enthält keine Implementierung dieses neuen Spielkerns und keine gestalterische Nutzerabnahme.

Im vorhandenen Arbeitsbaum bestehen erneut alle 134 Unit-Tests; Inselbund und Admiralität erreichen ihre erfolgreichen Abschlüsse. Dokumentlinks und der RealmCraft-Bestand im Vault wurden geprüft. Die Sicherung erfolgt in getrennten lokalen Commits für Repository und Vault. Fremde Änderungen, Kampagnengedächtnis und private Speicherstände bleiben erhalten. Der auf `origin/main` vorhandene, lokal noch nicht integrierte WIP-Stand wird bei diesem Abschluss nicht zusammengeführt oder veröffentlicht.

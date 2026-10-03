# Entwicklungsjournal

## 2026-05-30, Dashboard und Spielleiterverfahren

Das Repository entsteht als Skelett aus Mechanik, Speicherstand-Format, JSON-Schema und Beispielstand. Darauf baut das Dashboard aus ES-Modulen ohne Build-Schritt mit Bildpipeline über Gemini und eigener Testsuite auf. Ein Designlauf mit vier Prototypen unter `design/prototypes/` führt zunächst zur Richtung War Table und noch am selben Tag zum Theme Anthrazit. Update-Loop mit Delta-Banner und Kapitelhistorie, Aktionsbrett, Trends und Lebensstand sowie Live-Reload über Server-Sent Events machen das Dashboard zum Spiegel des Terminal-Spielleiters, dessen Rolle `CLAUDE.md` festlegt. Für den Chatmodus hält [Spielstart-Prompt.md](Spielstart-Prompt.md) den Startprompt fest. Eine Befehlsleiste im Dashboard wurde gebaut und wieder entfernt, die Befehle stehen seitdem im Spielmechanik-Prompt.

## 2026-05-31, Armee, Lebenswelt, Recht und Machtprofil

An diesem Tag arbeiteten drei Sitzungen parallel, eine Spielleitung und zwei Entwicklerrollen mit getrennten Dateien. Ihre Abstimmung lief über ein Koordinationsdokument und Auftragsbriefe, in denen die Spielleitung das Datenmodell vorgab und die Entwicklung die Anzeige baute. Das Datei-Eigentum ist inzwischen auf zwei Rollen verdichtet und steht in `CLAUDE.md`.

Der Reiter `armee` zeigt Gesamtstärke und Moral, die Verbände mit Führung über `fuehrungId`, stehende Modifikatoren und ein Verlustlogbuch. Heerschau und Verbände erhalten Bilder über `meta.armeeStyle` mit `meta.visualStyle` als Rückfall. Fehlt `armee`, rendert der Reiter einen leeren Zustand. Gleichzeitig wurde der Hero auf eine kompakte Leiste aus Grundgrößen und Lagewerten umgestellt.

Ein Auftrag für einen Reiter Stadt mit einem einzelnen Objekt `siedlung` wurde vor der Umsetzung durch den Reiter Lebenswelt ersetzt. `lebenswelt.leben` beschreibt das Leben der ganzen Bevölkerung, `lebenswelt.siedlungen[]` die Siedlungen, von denen genau eine `hauptstadt: true` trägt. Einwohner und Verteidigung liest die Sicht live aus `grundgroessen` und `lagewerte`, damit kein Wert doppelt gepflegt wird. Das alte `siedlung`-Objekt wurde migriert und bleibt als Rückfall lesbar. Verfassung und Setzungen wanderten aus der Chronik in den neuen Reiter Recht, der Besitz in die Lebenswelt.

Der Welt-Reiter zeigt nun das `profil` jeder Macht als signierte Werte mit Vorzeichenfarbe. Negative Werte sind als ausnutzbare Schwäche markiert, eine Legende nennt die eigene Skala von etwa −2 bis +3. Drei Erweiterungen des Welt-Reiters blieben offen, nämlich die Trennung von dauerhaftem Wesen (`erscheinung`) und aktueller Lage (`haltung`), ein verschleiertes Profil für noch nicht begegnete Mächte mit der Karte als Gerücht und ein Beziehungstrend mit Anlass der letzten Änderung. Ebenfalls offen ist ein zentrales Symbolregister, das jedem Spielbegriff ein festes SVG zuordnet, die über Renderer und `index.html` verstreuten Inline-Symbole ersetzt und in `anleitung.html` als Legende erscheint. Ein geplantes nicht kumulatives Lagefeld je Stand wurde nicht angelegt. Sein Anlass, der Zugverlauf in der Chronik, entfiel noch am selben Tag (siehe folgender Eintrag).

## 2026-05-31, Karten-Chronik, Ereignisbilder und veröffentlichte Beispielstände

Die Karte wird zur Folge von Ständen. `karte.chronik` führt je Stand Zeit, Anlass, Prompt und den Vorgänger `basiertAuf`, `karte.aktuellerStand` den gezeigten Stand. Der Karte-Reiter blättert über eine Zeitleiste und entwickelt einen Stand per Bild-zu-Bild aus dem Bild seines Vorgängers weiter. Ohne Chronik bleibt es bei einem Kartenbild aus `karte.prompt`. Inhalt und Prompts der Chronik gehören der Spielleitung, Anzeige, Pipeline und Cache-Schlüssel der Entwicklung.

Die Spielleitung baute `historie[]` auf einen Eintrag je Jahreszeit um und gab jedem Eintrag ein optionales `bild` mit Anlass und englischem Prompt. Die Übergabe dazu benannte drei Redundanzen im Chronik-Reiter, die behoben wurden. Gegenwart steht nur noch am jüngsten Eintrag, das Kapitel erscheint einmal als Gruppenkopf, und der aus Snapshots gebaute Abschnitt Verlauf dieser Partie entfiel, weil die Zeitleiste dieselbe Abfolge mit Text und Bild trägt. Jeder Eintrag erhält ein Ereignisbild als Text-zu-Bild aus `bild.prompt` und `meta.visualStyle`.

Porträts, Heerschau, Verbände, Mächte, Gruppen und Siedlungen können seitdem fortgeschrieben werden. Das bisherige Bild dient als Vorlage, der Stand liefert den Kontext, und jede Fassung bleibt als Version im Browser wählbar. Der Export bettet das gewählte Bild jeder Entität, die Ereignisbilder und die vollständige Versionsliste `bildChronik` ein, damit die veröffentlichte Seite alle Bilder ohne API-Zugang zeigt. Für GitHub Pages lädt das Dashboard ohne Live-Server einen voreingestellten Stand. `tools/prepare-demo.mjs` lagert die Bilder der Demostände als WebP-Dateien aus, ein Auswahlfeld lädt sie aus `examples/demo/manifest.json`. Damit sind die in der Übergabe offenen Punkte Bildauslagerung und Standwähler umgesetzt.

## 2026-06-01, Partiebewusstes Laden

Deltas entstehen nur noch innerhalb derselben Partie, erkannt an `meta.spielname`. Ein Wechsel zwischen Partien gilt als Erstladung. Snapshots tragen den Spielnamen, und der Versionsspeicher der Bilder ist je Partie getrennt, sodass erzeugte und fortgeschriebene Bilder ein Neuschreiben von `savegame.json` überstehen. Demostände und eigener Stand teilen ein Auswahlfeld. Die Demostände Die Karren und Die Ordnenden wurden entfernt.

## 2026-06-04, Frontend-Härtung und Multi-Partie-Hub

Das Schema erlaubt für `personen[].lebensstand` Freitext und für `runde.aktionen[].mod` neben der ganzen Zahl eine offene Aufschlüsselung als Text. `beziehungenAnsehen` erscheint in der Welt-Sicht. Das Delta erkennt neue und verschwundene Mächte, Beziehungsänderungen, die Gesamtstärke der Armee und Trendwechsel. Die Lage-Sicht zeigt zusätzlich das Wesen des Volkes und die stehenden Modifikatoren. `knowledge/INDEX.md` wurde zum Hub mehrerer paralleler Partien mit einem Protokoll für den Wechsel.

## 2026-09-09, Strategiespiel M1

Der Auftrag zur Umsetzung des nächsten Meilensteins wurde auf eine spielbare Jahrespartie mit Wirtschaft und bindender Ratsentscheidung konkretisiert. Der neue Einstieg `spiel/` enthält die deterministische Simulation, die direkte Bedienung und eigene Speicherstände. Das Winterlager ergänzt den Erzaußenposten, damit frühe Entscheidungen einen späteren Versorgungsnutzen haben und der Versorgungspakt an einem weiteren Vorhaben wirksam wird.

Die Umsetzung bleibt innerhalb der vorhandenen Architektur ohne Build-Schritt. Die Partiedokumente in `knowledge/`, `savegame.json` und das bestehende Dashboard wurden nicht verändert. Die fremden Änderungen im Arbeitsbaum blieben erhalten. Regeln, Zuschnitt und Prüfgrundlagen stehen in [Strategiespiel-M1.md](Strategiespiel-M1.md).

Regel- und Browserprüfungen zeigen die vollständige Jahrespartie, unterschiedliche erfolgreiche Handlungswege, Speicherfortsetzung und verständliche Fehlerzustände. Die Spielbalance ist als Entwurf gekennzeichnet. Die fachliche Nutzerabnahme steht noch aus.

## 2026-09-09, Nachtmeer und drei UI-Entwürfe

Der Nutzer bewertet die Gestaltung von M1 als unzureichend und verlangt eine neue Geschichte. Der folgende Auftrag konzentriert die Arbeit auf drei Designvarianten. Als gemeinsame Ausgangslage dient der Vorschlag Nachtmeer mit einer überfluteten Inselwelt, erloschenen Leuchtfeuern und einem Konflikt um Schutzsuchende im Hafen von Lys.

Unter `design/nachtmeer/` sind Admiralität, Atlas und Signal als interaktive Gestaltungsstudien umgesetzt. Sie teilen dieselben Beispieldaten und unterscheiden sich in räumlicher Anordnung, Typografie und Farbgebung. Die Vergleichsseite `vergleich.html` zeigt alle Varianten. Die Weltillustration wurde mit dem integrierten Imagegen-Werkzeug erzeugt. Quelle und vollständiger Prompt stehen in `ART-DIRECTION.md`.

Die Browserprüfung erfasst Ortsauswahl, Aufträge, Ressourcenfolgen, sichtbare Leuchtfeuer, Ratsdialog und Chronik. Überlagerungen auf schmalen und mittleren Fenstern wurden korrigiert. Das Prüfprotokoll unter `design/nachtmeer/PRUEFUNG.md` trennt technische Verifikation von der offenen gestalterischen Nutzerabnahme. Die neuen Entwürfe verwenden einen flüchtigen Beispielzustand. Eine neue vollständige Kampagne und die Verbindung dieser Oberflächen mit dem Spielkern sind noch nicht umgesetzt.

## 2026-09-09, Nachtmeer als vollständige Partie

Der anschließende Implementierungsauftrag verbindet die neue Welt mit einem eigenen Simulationskern unter `spiel/nachtmeer/`. Sechs Gezeiten, bindende Ratsentscheidungen, das Leuchtfeuernetz, Versorgung, Sturm und zwei politische Abschlussfassungen sind umgesetzt. `/spiel/` öffnet Nachtmeer, das frühere Winter-Szenario bleibt unter `/spiel/winter.html` erhalten. Eigene Speicherstände sichern auch offene Entwürfe.

Die Unit-Tests bestehen. Zwei feste Strategien erreichen mit unterschiedlichen Ordnungen und Ressourcenständen das Ziel. Eine vollständige Browserpartie, Datei-Import und Export, Fortsetzung nach Neuladen, Fehlerbehandlung und vier Ansichtsbreiten wurden geprüft. Umfang und Grenzen stehen in [Nachtmeer-Implementierung.md](Nachtmeer-Implementierung.md).

Der Nutzer bestätigt die maritime Richtung grundsätzlich, beschreibt die Gestaltung zugleich als noch zu generisch und verlangt eine ästhetisch anspruchsvollere Ausarbeitung. Die technische Umsetzung verwendet vorläufig Admiralität. Eine bevorzugte Variante oder eine endgültige Art Direction ist damit nicht freigegeben. Die vergleichbaren Designstudien bleiben erhalten.

## 2026-09-09, Kartenkammer und kanonisches Projektwissen

Der erneute Implementierungsauftrag konkretisiert die Oberfläche als Arbeitsinstrument des Hafenrats von Lys. Die Kartenkammer verbindet eine schematische SVG-Seekarte mit Ortsberichten und Beschlussregister. Papier, Tinte und sparsame Signalfarben erhalten feste Aufgaben. Eine unbekannte Verbindung, ein vorgemerkter Feuerbau und ein betriebenes Leuchtfeuer bleiben sichtbar unterscheidbar. Ortsprotokolle und Beschlüsse stammen aus der ausgeführten Zuggeschichte.

Die Gestaltungsprobe `design/nachtmeer/kartenkammer.html` zeigt den Sternwartenfall in drei regulär berechneten Zuständen. Sie verwendet dieselbe Darstellung und denselben Spielkern wie `/spiel/`, greift aber nicht auf die gespeicherte Partie zu. Die früheren Varianten bleiben als Vergleich erhalten. Plan, Implementierung und Prüfergebnisse stehen in [Nachtmeer-Kartenkammer.md](Nachtmeer-Kartenkammer.md).

Die Unit-Tests bestehen. Die beiden festen Strategien bleiben erfolgreich. Eine vollständige Browserpartie in der Kartenkammer und der unveränderte reguläre Spielstand nach den Gestaltungsproben wurden geprüft. Ortswahl, Gezeitenprüfung, Tastaturabschluss und schmale Ansichten wurden untersucht, Kontrast, Beschriftungen und Scrollverhalten wurden nachgebessert. Die fachliche Nutzerbeurteilung von Gestaltung, Geschichte und Spielbalance bleibt offen.

Auf ausdrücklichen Nutzerauftrag wurde RealmCraft als Eigenforschung in ACTIVE-WORK integriert. Im Vault ist der Project Overview auf beide Spielverfahren ausgerichtet, das Game Design nachgeführt und das Interface Design als eigener Pflegeort angelegt. `docs/INDEX.md` erschließt das Entwicklungswissen, Repo-Verzeichnis und ACTIVE-WORK verweisen auf denselben Einstieg. Die Spielleiterinhalte unter `knowledge/` und fremde Änderungen im Arbeitsbaum bleiben erhalten.

## 2026-09-09, Echtzeitspiel und Konsolidierung des Projektwissens

Der Nutzer ersetzt das Rundenstrategieziel ausdrücklich durch ein Echtzeitspiel mit Basisaufbau, organisierter Bevölkerung, Zuzug und Technologie. Auf Rückfrage bestätigt er friedliche Entwicklung, Umwelt- und Geschäftskonflikte, Verteidigung und offensiven Krieg als Bestandteile desselben Spiels. Der Browser bleibt die bevorzugte Plattform. Neue Partien sollen aus unterschiedlichen geprüften Weltpaketen entstehen, die laufende Simulation benötigt keine Modellantwort.

Die Kartenkammer wird wegen zu vieler Linien und Strukturelemente sowie ihres Webseitencharakters beanstandet. Gewünscht sind eine deutlich ästhetischere Spielansicht und mehr funktionale Symbole. Die Nutzerfrage zur Kartenkammer ist damit beantwortet. Eine gestalterische Abnahme wurde nicht erteilt.

Der Auftrag konzentriert sich anschließend ausdrücklich auf saubere Ablage, Refactoring des Projektwissens und einen kontrollierten Wiedereinstieg. [Echtzeitplan](RealmCraft-Echtzeitstrategie.md), [User Stories](RealmCraft-User-Stories.md) und [Arbeitsstand](RealmCraft-Arbeitsstand.md) erfüllen jeweils diese getrennten Funktionen. Der erste ausführbare Abschnitt ist E1, bewohnte Siedlung. Phaser mit TypeScript und Vite ist für den erweiterten Spielumfang empfohlen, die Simulation soll unabhängig von Grafik und Browser bleiben. Eine neue Laufzeit wurde in diesem Auftrag nicht installiert.

Game Design, Interface Design und Project Overview im Vault wurden auf die neue Richtung ausgerichtet. Der frühere Saisonentwurf bleibt als gekennzeichneter Referenzfall erhalten. ACTIVE-WORK führt das neue Ziel und den ersten Implementierungsabschnitt. README und Entwicklungsindex erschließen denselben Stand. Der Story-Abgleich trennt vorhandene Referenzfunktionen von noch fehlenden Echtzeitfunktionen und der beanstandeten Gestaltung.

## 2026-09-09, Kontrollierter Sessionabschluss

Der abschließende Auftrag sichert die vorhandenen Rundenprototypen, Gestaltungsstudien, Tests und Entwicklungsdokumente zusammen mit der Ausrichtung auf das Echtzeitspiel. Der Wiedereinstieg führt zu E1, bewohnte Siedlung. Der Abschluss enthält keine Implementierung dieses neuen Spielkerns und keine gestalterische Nutzerabnahme.

Im vorhandenen Arbeitsbaum bestehen erneut alle Unit-Tests, Inselbund und Admiralität erreichen ihre erfolgreichen Abschlüsse. Dokumentlinks und der RealmCraft-Bestand im Vault wurden geprüft. Die Sicherung erfolgt in getrennten lokalen Commits für Repository und Vault. Fremde Änderungen, Kampagnengedächtnis und private Speicherstände bleiben erhalten. Der damals auf `origin/main` liegende WIP-Stand wurde bei diesem Abschluss nicht zusammengeführt und ist inzwischen integriert.

## 2026-10-03, Härtung, Testgrenzen und Oberfläche des Dashboards

In Nachtmeer wird die Hoffnung jetzt vor den Verlusten auf ihre Obergrenze gekappt, weil ein Überschuss über 100 zuvor Verluste aus Beschlüssen, Sturm und Hunger verschluckte. Ungenutzte Stylesheets und feste Literale der Rundenprototypen wurden entfernt. Der Entwicklungsserver weist Dotfile-Pfade auch in der Schreibweise mit Backslash ab und akzeptiert bei Bindung an die Loopback-Adresse nur lokale Host-Header, was DNS-Rebinding verhindert, bei dem eine fremde Domain auf 127.0.0.1 zeigt. `/env.js` geht nur noch an Aufrufe derselben Herkunft, damit keine fremde Seite den Schlüssel über ein Script-Tag auslesen kann (Cross-Site Script Inclusion). Ist das localStorage-Kontingent erschöpft, verwirft der Verlauf seine ältesten Einträge, statt still einzufrieren und beim nächsten Start einen veralteten Stand wiederherzustellen.

Browsertests starten ihren eigenen Server auf Port 4391 und greifen nie auf einen laufenden Server oder die Live-Partie zu. E2E- und Visual-Tests sind getrennte Playwright-Projekte. `tools/check.mjs` prüft die Syntax aller versionierten Module und die Schemakonformität der Beispielstände, `npm test` verbindet diese Prüfung mit den Unit-Tests.

Die Oberfläche bezieht alle Farben und Maße aus `:root` in `css/style.css`, `design/design-tokens.css` entfiel. Inter und Space Grotesk liegen mit ihren OFL-Lizenzen unter `fonts/`. Eyebrows und stehende Erklärtexte wurden entfernt, Abschnitte tragen echte Überschriften, Kontrast und die Darstellung bei 360 Pixeln Breite wurden nachgebessert. `js/app.js` wurde in Module für Live-Spiegelung, Demoauswahl, Export, Hero sowie Prompts, Register und Versionen der Bilder zerlegt. Dashboard und Bildwerkzeuge unter `tools/` teilen seitdem dieselben Prompt- und Schlüsselbausteine. Dabei wurden Fehler in Export, Neurendern und kostenpflichtigen Bildanfragen behoben. `tests/unit/keys.test.js` hält jeden Cache-Schlüssel gegen den Stand vor der Zerlegung fest, damit kein bereits bezahltes Bild verwaist. Die Visual-Baselines wurden für die überarbeitete Oberfläche neu erzeugt.

Die Entwicklungsdokumentation wurde auf diesen Stand gebracht, die einmaligen Aufträge und die Koordinationsnotiz vom Mai 2026 gingen in die obigen Einträge ein. Offen sind die Beschriftung des Reiters `armee`, der seit Juni 2026 als Curriculum mit didaktischen Begriffen erscheint, während Daten und Vertrag weiter `armee` heißen, und der weitere Status von `STAND-UND-VISION.md`. Die Herkunftsprüfung für `/env.js` ist eine bewusste Zwischenlösung. Sie entfällt erst mit einem serverseitigen Bild-Proxy, über den der Schlüssel den Browser nie erreicht.

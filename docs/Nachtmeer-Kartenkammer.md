# Nachtmeer, Kartenkammer

## Gestaltungsauftrag

Die Kartenkammer verbindet eine lesbare Seekarte mit Ortsberichten und den Beschlüssen des Hafenrats. Die maritime Atmosphäre der bisherigen Entwürfe bleibt die Grundlage. Linien, Schrift und Farbe erhalten festgelegte Aufgaben. Die Zeichnung zeigt den Zustand der bestehenden Simulation.

## Implementierungsplan

| Umsetzung | Prüfkriterium |
|---|---|
| Eigene Formensprache aus Papier, Tinte, Küstenzeichnung und sparsamer Signalfarbe | Ein gemeinsames Token-System trägt Karte, Dossier, Rat und Berichte; keine dekorativen Koordinaten oder unbegründeten Maßstäbe |
| SVG-Seekarte mit festen Küsten und aus dem Spielzustand abgeleiteten Verbindungen | Unerkundete, vorgemerkte und offene Wege unterscheiden sich; aktive Feuer bleiben von Bauentwürfen unterscheidbar |
| Sternwarte als durchgehender Entscheidungsfall | Erkundung, vorgemerkter Bau und aktives Feuer erscheinen jeweils konsistent auf der Karte, im Dossier und im Protokoll |
| Sichtbare politische Ordnung | Beschlüsse besitzen einen Titel, ihre tatsächliche Entstehungsgezeit und konkrete Wirkungen; vorgemerkte Entscheidungen gelten visuell noch als Entwurf |
| Überarbeitete Bedienung | Vorschau, Stimmen, Fehler, Kosten und Bilanz sind vor Ausführung zugänglich; bestehende Speicherung funktioniert weiter |
| Interaktive Gestaltungsprobe | Derselbe Sternwartenfall lässt sich in drei real berechneten Zuständen vergleichen, ohne die gespeicherte Partie zu verändern |
| Prüfung | Relevante Darstellungstests, bestehende Regeltests, vollständige Browserpartie und schmale Ansichten bestehen |

## Formale Festlegungen

Die Karte verwendet blasses Meergrün und einen warmen, hellen Landton. Dunkle Tinte trägt Namen und Zahlen. Durchgezogene Seewege bezeichnen erschlossene Verbindungen; unterbrochene Linien kennzeichnen unbekannte Wege. Ocker markiert aktive Leuchtfeuer. Rostrot mit einer zusätzlichen Beschriftung kennzeichnet vorgemerkte Befehle. Die Auswahl erhält eine eigene Kontur.

Serifenschrift trägt Ortsnamen und die Titel von Dokumenten. Bedienelemente, Mengen und Zustände verwenden eine gut lesbare serifenlose Schrift. Linien und Abstände gliedern die Oberfläche. Die großen Landschaftsbilder konzentrieren sich auf die ausgewählte Insel.

Die Karte stellt die bestehenden Verbindungen schematisch dar. Sie behauptet keine Entfernungen, Fahrzeiten, Sichtweiten oder durch die Simulation nicht modellierte Gebietsrechte. Die Ansicht Ordnungen zeigt geltende Regelwirkungen an den betroffenen Orten.

Der politische Ursprung wird aus der gespeicherten Zuggeschichte gelesen. Ein begonnener Entwurf erhält noch keinen Eintrag im Beschlussregister. Historische Ausführungen bleiben in der Chronik erhalten.

## Umsetzung und Abnahme

Die Umsetzung erfolgt unter `/spiel/`. Die drei früheren Designstudien bleiben als Vergleich erhalten. Spielregeln und Speicherformat bleiben maßgeblich in `spiel/nachtmeer/engine.js` und `storage.js`.

Die Umsetzung ist abgeschlossen. `chart.js` leitet die Seekarte aus Spielstand und Entwurf ab. `records.js` erschließt die ausgeführte Zuggeschichte für das Register und die Ortsprotokolle. `chamber-view.js`, `chamber.css` und `chamber-tokens.css` tragen die neue Darstellung. Die unabhängige Gestaltungsprobe unter `/design/nachtmeer/kartenkammer.html` verwendet dieselben Module und regulär berechnete Zustände.

## Technischer Prüfstand am 9. September 2026

| Prüfung | Ergebnis |
|---|---|
| `npm run test:unit` | 134 Tests bestanden, keine Fehler; davon 15 Nachtmeer-Regeltests und fünf neue Darstellungstests |
| `npm run simulate:nachtmeer` | Inselbund und Admiralität erreichen weiterhin ihre unterschiedlichen erfolgreichen Abschlusszustände |
| Drei Sternwarten-Zustände im Browser | Unbekannter Zugang, vorgemerkter Feuerbau und aktives Feuer konsistent auf Karte, im Ortsbericht und im Register gelesen |
| Vollständige Partie in der Kartenkammer | Sechs Gezeiten mit Ratsentscheidungen, Befehlen, Vorschau und Berichten ausgeführt; Inselbund mit drei Feuern, 21 Vorräten, 14 Baustoffen, einem Äther und 100 Zuversicht erreicht |
| Speicherisolation der Gestaltungsprobe | Nach den Beispielwechseln und der vollständigen Probepartie die reguläre Partie neu geladen; erste Gezeit, keine Befehle und unverändert 18 Vorräte, 12 Baustoffe, vier Äther, 64 Zuversicht |
| Speicherdarstellung | Unit-Test erhält Ortszustand und Beschlussherkunft beim Kodieren und erneuten Laden; Darstellung verändert den Spielstand nicht |
| Schmale und niedrige Fenster | Gestaltungsprobe bei 1440 × 720, 1024 × 800, 390 × 844 und 320 × 800 CSS-Pixeln geprüft; kein seitenweiter horizontaler Überlauf, keine überlappenden Ortsbeschriftungen in den vermessenen Kartenansichten |
| Mobile Bedienung | Seitliches Verschieben bleibt auf die Karte begrenzt; Ortswahl erreicht den Bericht; gültige Bauprüfung bei 320 Pixeln ohne horizontalen Dialogüberlauf bedienbar |
| Tastatur | Escape schließt die Gezeitenprüfung und gibt den Fokus zurück; Hafenrat der regulären Partie ebenfalls geöffnet und per Escape geschlossen |

Die Browserprüfungen erfolgten über die In-App-Browsersteuerung. Die vollständige Partie lief in der isolierten Gestaltungsprobe mit demselben Spielkern und derselben Bedienung. Die reguläre Partie blieb am Ausgangszustand erhalten. Datei-Import und Export wurden beim vorherigen Nachtmeer-Ausbau geprüft; der aktuelle UI-Durchgang hat diese Browserabläufe nicht erneut ausgeführt. Die damalige Evidenz steht in [Nachtmeer-Implementierung.md](Nachtmeer-Implementierung.md).

Bei schmalen Fenstern bleibt die Karte absichtlich breiter als ihre sichtbare Fläche. Ein Hinweis erklärt das seitliche Verschieben. Auf niedrigen Fenstern erfordern Register und Ortsbericht vertikales Scrollen. Die Illustrationen bleiben statisch; die Zustandsdarstellung liegt in Karte, Text und Protokoll.

Die anschließende Nutzerbeurteilung beanstandet zu viele horizontale Linien, unnötige Strukturelemente und den Webseitencharakter. Die Kartenkammer ist als endgültiges Zielbild unzureichend. Das neue Ziel ist eine symbolgestützte Echtzeitoberfläche mit deutlich stärkerer Ästhetik und wechselnder Weltgestaltung. [User Stories und Abnahme](RealmCraft-User-Stories.md) führen die Kriterien; der [Echtzeitplan](RealmCraft-Echtzeitstrategie.md) beschreibt die Umsetzung. Die obigen technischen Ergebnisse bleiben auf den geprüften Rundenprototyp begrenzt.

## Korrektur der Zuversichtsgrenze am 3. Oktober 2026

Bis zu dieser Korrektur wurden Gewinne und Verluste der Zuversicht gemeinsam verrechnet und erst danach auf 100 begrenzt. Ein Überschuss über 100 verdeckte so Verluste durch Erlass, Sturm oder Hunger. In der sechsten Gezeit der Inselbund-Strategie meldete der Bericht zwei Punkte Sturmschaden, während die Zuversicht bei 100 blieb. Die Engine begrenzt nun zuerst die Gewinne und zieht die Verluste danach ab. Der oben dokumentierte Endstand mit 100 Zuversicht gilt für die frühere Rechnung.

| Prüfung | Ergebnis |
|---|---|
| `npm run simulate:nachtmeer` | Inselbund gewinnt mit drei Feuern, 21 Vorräten, 14 Baustoffen, einem Äther und 98 Zuversicht (zuvor 100). Admiralität unverändert mit drei Feuern, 15 Vorräten, 10 Baustoffen, einem Äther und 64 Zuversicht |
| Regressionstest | Bei 96 Zuversicht und einem per Erlass gebauten Leuchtfeuer endet die Gezeit mit 96 statt 100 Zuversicht |
| Browser-Smoke-Test `tests/e2e/nachtmeer.spec.js` | Auftrag vergeben, Ratsentscheidung vorgemerkt, Entwurf nach Neuladen erhalten, Gezeit ausgeführt, Bericht per Escape geschlossen |

## Kanonische Einordnung

`docs/INDEX.md` erschließt das Entwicklungswissen im Repository. Das Kampagnengedächtnis unter `knowledge/` bleibt dem Spielleiterverfahren zugeordnet. Im Obsidian-Vault bilden `Project Overview RealmCraft`, `RealmCraft Game Design` und `RealmCraft Interface Design` den konzeptionellen Zusammenhang. ACTIVE-WORK führt das neue Echtzeitziel und den nächsten Siedlungsausschnitt. Repo-Verzeichnis und ACTIVE-WORK verweisen beide auf `docs/INDEX.md` als Entwicklungseinstieg.

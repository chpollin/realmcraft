# Nachtmeer, Implementierung der ersten Partie

## Ergebnis des Auftrags

Eine vollständige Partie führt Lys durch sechs Gezeiten. Der Spieler erkundet Inseln, sichert die Versorgung und entzündet zwei weitere Leuchtfeuer. Der Hafenrat entscheidet über Schutzsuchende, Gildenrechte und den Umgang mit den alten Linsen. Die Entscheidungen verändern Ressourcen und erlaubte Handlungen über mehrere Runden. Der Abschluss erklärt, welche Gesellschaft und welche Versorgungslage entstanden sind.

Die Oberfläche verwendet die [Kartenkammer](Nachtmeer-Kartenkammer.md) mit einer aus dem Spielzustand abgeleiteten Seekarte, Ortsberichten und Beschlussregister. Die anschließende Nutzerkritik beanstandet ihre Gliederung und den Webseitencharakter. Das aktuelle Entwicklungsziel steht im [Echtzeitplan](RealmCraft-Echtzeitstrategie.md); diese Partie und die Designstudien bleiben Referenzen.

## Implementierungsfolge und Abnahmekriterien

| Schritt | Umsetzung | Prüfkriterium |
|---|---|---|
| 1 | Szenario und reine Simulationsfunktionen | Sechs Gezeiten mit zwei Befehlen, nachvollziehbaren Kosten, Inselzugang, Lichtnetz und Versorgung; gleiche Befehle liefern gleiche Ergebnisse |
| 2 | Erzählung und politische Ordnung | Jede Gezeit besitzt eine eigene Entscheidung; Gildenvertrag und Gemeingutordnung binden spätere Handlungen; Ratsmehrheit und Erlass besitzen unterschiedliche Folgen |
| 3 | Spieloberfläche | Karte, Rat, Chronik und Befehlsprüfung beziehen ihren Zustand aus derselben Simulation; Anordnungen sind bis zur Ausführung änderbar |
| 4 | Vollständiger Spielablauf | Einführung, sechs Gezeiten, Rundenberichte, erklärter Sieg oder Niederlage und Neustart funktionieren |
| 5 | Speicherung | Lokale Sicherung und Datei-Import/Export erhalten abgeschlossene Züge und offene Entwürfe; fehlerhafte Stände ersetzen keine laufende Partie |
| 6 | Prüfung und Dokumentation | Unterschiedliche erfolgreiche Strategien sowie Niederlage, Regelgrenzen, Wiederherstellung und Browserbedienung sind nachgewiesen |

## Verbindlicher Umfang

Der neue Einstieg liegt unter `/spiel/`. Das frühere Winter-Szenario bleibt unter `/spiel/winter.html` erreichbar. Nachtmeer erhält eigene Module und einen eigenen Speicherschlüssel. Laufende Spielleiterpartien und ihr Gedächtnis gehören weiterhin zur bisherigen Anwendung.

Die Simulationsschnittstelle ist ohne Browser nutzbar. Ein automatisierter Prüflauf kann unterschiedliche Befehlsfolgen ausführen. Das Sprachmodell erzeugt während einer Partie keine neuen Regeln. Die Texte und Ereignisse dieses Szenarios sind verfasst und ihre Folgen festgelegt.

Ein Sieg verlangt am Ende der sechsten Gezeit drei brennende Feuer, mindestens vier Vorräte und mindestens 20 Zuversicht. Anhaltender Hunger oder der Zusammenbruch der Zuversicht können die Partie früher beenden. Diese Anforderungen stehen auch in der Oberfläche.

Die folgende fachliche Abnahme bleibt beim Nutzer. Sie prüft die Wirkung der Gestaltung, das Verständnis der Entscheidungen und die Qualität der Geschichte. Technische Tests belegen den implementierten Umfang.

## Implementierte Regeln

Die Partie beginnt mit 18 Vorräten, zwölf Baustoffen, vier Äther und 64 Zuversicht. Lys und die Salzwerft sind zugänglich; nur Lys besitzt ein aktives Feuer. Je Gezeit sind eine Ratsentscheidung und bis zu zwei Befehle möglich. Aufträge bleiben bis zur gemeinsamen Ausführung änderbar.

Die Vorschau prüft alle Kosten gegen die Bestände zu Beginn der Gezeit. Neue Seewege, Feuer, die Kaimauer und Ertragsboni wirken ab der nächsten Gezeit. Neu beschlossene Verpflichtungen gelten sofort. Der offene Hafen erhöht beispielsweise schon in seiner ersten Gezeit den Verbrauch; seine zusätzlichen Versorgungserträge entstehen erst später.

Ein Leuchtfeuer benötigt zwei von drei Ratsstimmen. Ein Erlass kostet vier Zuversicht und reduziert das Vertrauen widersprechender Ratsmitglieder. Der Gildenvertrag verlangt nach allen Kosten drei Baustoffe Reserve beim Leuchtfeuerbau. Die Gemeingutordnung begrenzt Äthergewinnung und Linsenforschung gemeinsam auf einen Auftrag pro Gezeit. Auch ein Erlass bleibt an diese Ordnungen gebunden.

Die sechs Grundverbräuche betragen 4, 4, 5, 5, 6 und 7 Vorräte. Zusätzliche aktive Feuer liefern je einen Vorrat und mindern den Sturmdruck. Fehlende Vorräte werden als Versorgungslücke geführt und kosten je drei Zuversicht. Zwölf kumulierte fehlende Vorräte oder null Zuversicht beenden die Partie vorzeitig. Die Zuversicht bleibt zwischen null und 100.

`spiel/nachtmeer/engine.js` berechnet die Folgen ohne Oberfläche. `storage.js` speichert die ausgeführten Befehle und den offenen Entwurf im eigenen Format `realmcraft-nachtmeer`, Version 1. Beim Laden wird jeder ausgeführte Zug erneut regelkonform berechnet. Der Browserschlüssel lautet `realmcraft.nachtmeer.v1`.

## Prüfung der ersten Spielintegration am 9. September 2026

Die folgende Tabelle dokumentiert die erste vollständige Spielintegration vor dem Umbau zur Kartenkammer. Die erneute Prüfung der aktuellen Oberfläche und der ergänzten Darstellungstests steht in [Nachtmeer-Kartenkammer.md](Nachtmeer-Kartenkammer.md).

| Prüfung | Beobachtetes Ergebnis |
|---|---|
| Gesamte Unit-Suite | 129 Tests bestanden, davon 15 für Nachtmeer |
| Zwei feste Strategien ohne Browser | Inselbund und Admiralität erreichen jeweils drei Feuer; unterschiedliche Institutionen und Endbestände |
| Vollständige Browserpartie | Sechs Gezeiten mit Ratsentscheidung, Aufträgen, Vorschau, Berichten und erklärtem Inselbund-Abschluss ausgeführt |
| Speicherung | Datei-Import mit zwei abgeschlossenen Gezeiten und offenem Entwurf korrekt übernommen; Neuladen erhält beides |
| Ungültiger Import | Fehlermeldung angezeigt; aktuelle Partie und Entwurf erhalten |
| Datei-Export | Heruntergeladene JSON-Datei eingelesen und mit denselben Ressourcen und offenen Befehlen rekonstruiert |
| Bedienung | Ortsauswahl, Rat, Auftragsvergabe und Neustart ausgeführt; Escape schließt den Dialog und gibt den Fokus zurück |
| Layout | 1440, 1024, 390 und 320 CSS-Pixel geprüft; kein horizontaler Überlauf und keine Überschneidung zwischen Ortsbeschriftungen, Ziel und Ratsmeldung |

Die Browserprüfung fand über die In-App-Browsersteuerung statt. Ein Fehler durch einen beim Neuzeichnen entfernten DOM-Knoten wurde behoben; die anschließende vollständige Partie lief durch. Die heruntergeladene Datei wurde am Dateisystem verifiziert, da die Browsersteuerung kein Download-Ereignis meldete. Nach der Prüfung liegt eine neue Partie am ersten Zug bereit.

Die beiden festen Strategien sind reproduzierbare Regelfälle. Eine umfassende Balanceprüfung, eine selbstständig spielende Modellinstanz und eine fachliche Nutzerprüfung sind noch offen. Die früheren Winter-Browsertests wurden auf den erhaltenen Einstieg umgestellt, in diesem Durchlauf aber nicht erneut ausgeführt.

Die maritime Richtung wurde grundsätzlich positiv bewertet. Die anschließende Kartenkammer genügt der gewünschten ästhetischen Qualität noch nicht. Die weitere Ausarbeitung orientiert sich am Echtzeitspiel und an dessen [User Stories](RealmCraft-User-Stories.md).

```sh
npm run test:unit
npm run test:nachtmeer
npm run simulate:nachtmeer
npm run serve
```

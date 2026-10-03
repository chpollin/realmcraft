# Strategiespiel M1

## Meilenstein

M1 ist eine abgeschlossene, direkt bedienbare Partie vom Frühling bis über den ersten Winter. Der Spieler verteilt Arbeitsgruppen, baut Anlagen und entscheidet über Anträge des Rats. Eine eingeführte Institution bindet weitere Bauvorhaben. Die Partie besitzt einen begründeten Saisonbericht, einen Abschluss und übertragbare Speicherstände.

Der Einstieg liegt nach der Ergänzung von Nachtmeer unter `spiel/winter.html`, beim bestehenden Entwicklungsserver unter `/spiel/winter.html`. `/spiel/` öffnet jetzt Nachtmeer. Die bisherigen Spielleiterpartien bleiben unter dem bisherigen Dashboard erreichbar. Der lokale Strategieentwurf greift weder auf `savegame.json` noch auf die bisherigen Speicherschlüssel zu.

## Erfüllungskriterien

| Kriterium | Implementierung und Prüfung |
|---|---|
| Vier Jahreszeiten selbstständig spielen | Frühling, Sommer, Herbst und Winter mit unterschiedlichem Nahrungsertrag |
| Materielle Entscheidungen treffen | Versorgung, Materialgewinnung, Erzabbau und Bau konkurrieren um Arbeitsgruppen |
| Folgen aus den Regeln berechnen | Reine Zustandsübergänge mit Vorschau, Kapazitäts- und Kostenprüfung |
| Politische Ordnung wirksam verändern | Versorgungspakt gilt für den zweiten Bauantrag; Veto umgeht geltendes Recht nicht |
| Mehrere Handlungswege ermöglichen | Pakt, Veto und Vorsorge ohne Anlagen sind als erfolgreiche Verläufe geprüft |
| Rückschläge und Abschluss darstellen | Nahrungsmangel reduziert Kapazität und Loyalität; kumulierte Lücken können das Szenario beenden |
| Speichern und Fortsetzen | Automatische lokale Sicherung, Datei-Export und validierter Import einschließlich offenem Entwurf |
| Zustände wiederfinden | Regionenauswahl, Ratsansicht und Chronik mit erklärten Ressourcenänderungen |
| Direkt bedienen | Tastaturzugang, native Dialoge und Darstellung bis 320 Pixel Breite |

## Regelumfang

Die ausführbaren Werte stehen in `spiel/scenario.js`. M1 startet mit 20 Nahrung, 12 Material und sechs Arbeitsgruppen. Eine Versorgungsgruppe erzeugt im Jahresverlauf 4, 5, 5 und 2 Nahrung. Der normale Saisonverbrauch beträgt 18, der Winterverbrauch 22. Eine Materialgruppe gewinnt zwei Einheiten. Ein bereits fertiger Erzaußenposten ermöglicht fünf Material je Erzgruppe.

Der Erzaußenposten kostet sechs Material, das Winterlager acht. Beide binden zwei Arbeitsgruppen für eine Saison. Vor Beginn des Winters fertiggestellt senkt das Winterlager den Winterverbrauch um sechs Nahrung. Ein erst im Winter gebautes Lager wirkt in diesem Winter noch nicht.

Baukapazität wird ausdrücklich freigegeben und zugewiesen. Ein Klick auf einen Bauauftrag verschiebt keine Arbeitskräfte aus einer anderen Tätigkeit. Vormerken reserviert freie Gruppen; Entfernen des Auftrags gibt sie frei. Zuweisungen laufender Tätigkeiten werden in die folgende Saison übernommen. Baugruppen stehen danach wieder zur Verfügung. Bei Kapazitätsverlust werden überzählige Gruppen zuerst aus dem Erzabbau, dann der Materialgewinnung und schließlich der Versorgung genommen.

Die fünf Ratsmitglieder entscheiden nach ihren Interessen. Drei Stimmen bilden die Mehrheit. Bei einer Loyalität von höchstens minus drei verweigert eine Figur neue Bauanträge. Ein Veto kostet bei jedem widersprechenden Ratsmitglied zwei Loyalitätspunkte. Der Versorgungspakt verlangt mindestens 18 Nahrung nach Saisonverbrauch. Diese Bedingung gilt bereits für das Bauvorhaben, mit dem er beschlossen wird, und danach für jedes weitere. Eine Aufhebung des Pakts gehört nicht zu M1; die Oberfläche benennt seine Geltung für den Rest des Szenarios.

Eine Versorgungslücke wird separat ausgewiesen. Die Vorräte werden auf null begrenzt. Jede betroffene Saison kostet eine Arbeitsgruppe und einen Loyalitätspunkt bei allen Ratsmitgliedern. Eine kumulierte Lücke von zwölf Nahrung beendet das Szenario als Niederlage. Wer den Winter ohne diesen Zusammenbruch beendet, hat das Szenario überstanden. Ausbau, politische Ordnung und Versorgungslücken erscheinen im Abschlussbericht. Diese konkrete Niederlageregel ist eine Abstraktion des ersten Szenarios und keine vollständige Bevölkerungssimulation.

## Berechnung und Speicherung

`spiel/engine.js` hält Vorschau, Ratsentscheidung und Saisonauflösung. Ein Entwurf gehört zu genau einer Saison. Veraltete Befehle und weitere Züge nach Szenarioende werden abgewiesen. Die Vorschau verändert den Stand nicht. Baukosten werden aus dem bestehenden Vorrat bezahlt; laufende Erträge finanzieren keinen gleichzeitig gestarteten Bau. Neue Gebäude wirken erst ab der folgenden Saison.

`spiel/storage.js` speichert die ausgeführten Befehle und den noch offenen Entwurf. Das Laden rekonstruiert die Partie und prüft dabei jeden ausgeführten Zug erneut. Der Spielstand trägt ein eigenes Format, Szenario und eine Version. Inkompatible oder beschädigte Dateien ersetzen die aktuelle Partie nicht. Der eigene lokale Schlüssel lautet `realmcraft.strategy.first-winter.v1`.

Ist der automatische Speicher beschädigt, wird das automatische Überschreiben ausgesetzt. Die Oberfläche bietet Laden und den bewussten Beginn einer neuen Partie an. Bei fehlender Browser-Speicherkapazität bleibt der aktuelle Stand im Arbeitsspeicher spielbar und kann als Datei gesichert werden.

## Technischer Zuschnitt

M1 verwendet native JavaScript-Module ohne zusätzliche Laufzeitbibliothek. HTML, Gestaltung, Regeln und Darstellung liegen in getrennten Dateien. Die vorhandene Webanwendung benötigt dafür keinen neuen Build-Schritt. Für diesen begrenzten Stand genügen JSDoc, Laufzeitvalidierung und Verhaltenstests. Die frühere Empfehlung eines TypeScript-Kerns wird bei größerem Regelumfang erneut geprüft.

Die Porträts und das Siedlungsbild kommen aus den bereits vorhandenen Demo-Assets. Die Küste ist eine schematische Karte mit fest gesichertem Weg. Gegner, freie Weltgenerierung und Gefechte sind nicht implementiert. Die Chronik verwendet aus den Regeln erzeugte Texte und benötigt keinen Modellzugang. Die Ausrichtung folgt dem Game Design im Vault unter `Projects/Eigenforschung/RealmCraft/RealmCraft Game Design.md`.

## Prüfen und starten

```bash
npm run serve
npm run test:unit
npm run test:strategy
```

`npm run test:strategy` kombiniert die neuen Regeltests mit den Browserprüfungen. Playwright verwendet standardmäßig sein installiertes Chromium. Auf einem Rechner mit installiertem Edge lässt sich `PLAYWRIGHT_CHANNEL=msedge` setzen. Ein abweichender Testport wird über `PORT` gewählt. Die konkreten Aufrufe unter PowerShell lauten beispielsweise:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:PORT = '4185'
npm run test:strategy
```

`design/strategy-screenshot.mjs` erzeugt Ansichten in mehreren Bildschirmbreiten unter `design/screenshots/strategy/`. Es erwartet einen laufenden Server auf dem Port aus `PORT`, ohne diese Angabe auf `http://localhost:4173/spiel/winter.html`. Eine andere URL lässt sich über `STRATEGY_URL` übergeben, den Browserkanal bestimmt wie bei den Tests `PLAYWRIGHT_CHANNEL`.

## Verifikation

Am 9. September 2026 bestanden die Unit-Tests des gesamten Repositorys einschließlich der Strategieprüfungen sowie die neuen Browsertests in Edge. Geprüft wurden eine vollständige Jahrespartie, Fortsetzung eines offenen Entwurfs, ein unerfüllter Pakt, der Datei-Rundlauf nach Spielende, Versorgungskollaps, ein beschädigter automatischer Speicher und Tastaturbedienung. Die Darstellung wurde in unterschiedlichen Breiten visuell geprüft; die lokalen Bilder waren ladbar.

Die vollständige visuelle Testsuite des bisherigen Dashboards wurde für diesen eigenständigen Einstieg nicht neu abgenommen. Die spielerische Beurteilung von Schwierigkeit und langfristiger Wirkung der Institutionen sowie die Nutzerabnahme stehen aus.

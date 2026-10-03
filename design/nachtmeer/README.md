# Nachtmeer, drei UI-Entwürfe

Die drei Entwürfe dokumentieren einen früheren Gestaltungsschritt vom 9. September 2026. Die erste Strategieoberfläche wurde als visuell unzureichend bewertet. Der damalige Auftrag verlangte eine neue Geschichte und drei stärkere Gestaltungen zum Vergleich. Die Studien bleiben Referenzen; [der aktuelle Arbeitsstand](../../docs/RealmCraft-Arbeitsstand.md) führt zum inzwischen maßgeblichen Echtzeitspiel.

## Gemeinsame Ausgangslage

Das Leuchtfeuernetz einer Inselwelt ist erloschen. Lys hält seinen Hafen offen, während die See steigt. Drei Feuer sollen die Inseln bis zur sechsten Flut wieder verbinden. Die Flüchtlingsschiffe vor Lys erzeugen einen Konflikt zwischen Schutz, Versorgung und Wiederaufbau. Rhea Voss führt den Hafen, Jorek Senn vertritt die Gilden und Ilyra Sen hütet die alten Linsen.

Alle Varianten zeigen dieselbe Ausgangslage in der dritten Gezeit. Variantenwechsel erhalten den Beispielzustand. So lassen sich Unterschiede in der Gestaltung bei gleichen Informationen vergleichen.

| Entwurf | Räumlicher Aufbau | Visueller Schwerpunkt | Zu prüfende Frage |
|---|---|---|---|
| Admiralität | Schmale Navigation, große Karte, festes Ortsfenster, durchgehende Befehlsleiste | Maritime Weltillustration, dunkle Flächen, Messing, Serifentitel | Trägt die Atmosphäre bei ausreichender Lesbarkeit? |
| Atlas | Beschriftete Navigation, Karte mit eigener Überschrift, helles Ortsdossier, Auftragsbuch | Papier, Kartografie, deutlich getrennte Verwaltungsbereiche | Erleichtert die Gliederung das Planen und Vergleichen? |
| Signal | Große Bildfläche, breite Entscheidungskonsole, kompakte Navigation unter der Karte | Große Schrift, reduzierte Elemente, heller Handlungsakzent | Ist die nächste Entscheidung sofort erkennbar und bleibt genug Welt sichtbar? |

## Bedienbare Funktionen

- Zwischen den drei Entwürfen wechseln.
- Fünf Orte auf der Karte auswählen und das zugehörige Dossier lesen.
- Bis zu zwei Beispielaufträge vormerken oder entfernen.
- Ressourcenfolgen prüfen und eine Beispielrunde ansehen.
- Entzündete Leuchtfeuer auf der Karte wiederfinden.
- Den Hafenrat, seine Interessen und die Chronik öffnen.
- Über die Aufnahme von Schutzsuchenden entscheiden und die Beispielwerte verändern.

Diese Funktionen illustrieren die Bedienung. Der Entwurf enthält keine vollständige neue Kampagne, keine belastbar ausbalancierte Wirtschaft und keinen angeschlossenen KI-Spieler. Der Beispielzustand bleibt im Arbeitsspeicher. Ein Neuladen setzt ihn zurück. Die bestehende Strategiepartie unter `/spiel/` und ihre Speicherschlüssel werden nicht verändert.

## Verifikation und Validierung

Die Verifikation prüft die Umsetzung anhand beobachtbarer Kriterien. Die Validierung prüft, ob diese Umsetzung die gewünschte Spielerfahrung erzeugt. Die technische Prüfung ersetzt die gestalterische Nutzerabnahme nicht.

| Ziel | Nachweis | Abnahmestufe |
|---|---|---|
| Drei eigenständige Gestaltungen | Unterschiedliche Anordnung von Navigation, Karte, Ortsdossier und Befehlen; visuelle Browserprüfung jeder Variante | Technisch und visuell prüfbar |
| Vergleichbare Spielsituation | Gleiche Daten und Interaktionen; Variantenwechsel verändert keine Ressourcen | Funktional prüfbar |
| Verständliche Handlungsfolgen | Auftrag vormerken, Folgen öffnen, Beispielrunde ausführen, Karte und Chronik prüfen | Funktional prüfbar; Verständnis durch Nutzer prüfen |
| Bedienbarkeit mit Tastatur | Fokussierbare Karte und Schalter; native Dialoge mit Escape und Fokusrückgabe | Funktional prüfbar |
| Lesbarkeit bei mehreren Fenstergrößen | Desktop, mittleres Fenster und schmale Ansicht auf Überlagerung und Überlauf prüfen | Visuell prüfbar |
| Eigenständige neue Geschichte | Neue Orte, Figuren, Konflikt und Zielsetzung in jeder Variante sichtbar | Inhaltlicher Vorschlag; Nutzerabnahme offen |
| Beeindruckende Spieloberfläche | Direkter Vergleich durch den Nutzer anhand identischer Aufgaben | Nutzerabnahme offen |

### Kurze Abnahmeaufgabe

In jeder Variante ohne zusätzliche Erklärung die Sternwarte auswählen, ihr Leuchtfeuer vormerken und vor Ausführung die Kosten benennen. Danach den Hafenrat öffnen und den Konflikt um die Flüchtlingsschiffe in eigenen Worten beschreiben.

Die Beobachtung hält fest, welche Information gesucht wurde, welche Stelle irritierte und ob Kosten und Folgen richtig verstanden wurden. Eine bevorzugte Variante kann anschließend gezielt verfeinert und mit dem vollständigen Spielkern verbunden werden.

## Start

Nach `npm run serve` läuft der Repository-Server auf Port 4173. Bei einem über `PORT` gesetzten anderen Port ändert sich die Adresse entsprechend.

- [Admiralität](http://localhost:4173/design/nachtmeer/?variant=admiralitaet)
- [Atlas](http://localhost:4173/design/nachtmeer/?variant=atlas)
- [Signal](http://localhost:4173/design/nachtmeer/?variant=signal)

Die Weltillustration liegt unter `assets/nachtmeer.png`. Sie wurde mit dem integrierten Imagegen-Werkzeug erzeugt. Der vollständige Prompt steht in `ART-DIRECTION.md`. SVG-Symbole, Beschriftungen und Interaktionen werden im Browser gezeichnet.

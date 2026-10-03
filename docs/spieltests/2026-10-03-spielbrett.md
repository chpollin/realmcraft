# Spieltest Spielbrett, 3. Oktober 2026

Gegenstand ist der UI-Prototyp unter `spielbrett/` mit vorgefertigten Spieldaten. Die Karte stammt aus dem echten Generator, Vorschau, Prüferurteile und Zwischenzug sind Attrappen. Getestet wird der eingefrorene Stand `44bb892` in einem eigenen Worktree (`../realmcraft-spieltest`, Port 4186). Die Entwicklung auf `main` läuft unabhängig davon weiter.

Jede Rückmeldung erhält eine Kategorie, die betroffene Stelle und die Umsetzung mit Verweis auf Lane oder Commit. Kategorien sind Bedienung, Gestaltung, Mechanik, Inhalt und Balance.

## Rückmeldungen vor dem Einfrieren

| Nr | Kategorie | Stelle | Rückmeldung | Umsetzung |
|---|---|---|---|---|
| 1 | Mechanik | Ressourcen | Ein fester Kern in jeder Welt, dazu weltspezifische Güter | Nahrung, Material, Wissen, Volk und Zustimmung als Kern, Holz und Stein in Material zusammengelegt, Güter nur bei Besitz sichtbar. Lanes C und K1, Prototyp `44bb892` |
| 2 | Gestaltung | Detailfläche, obere Leiste | Abgeschnittene Detailfläche bei breitem Fenster, überlaufende Leiste | Layout für 390 bis 2560 Pixel geprüft, `44bb892` |
| 3 | Gestaltung | gesamte Oberfläche | Zu textlastig, mehr Symbole, einheitliche Farben, aufklappbare Tooltips | Eigene Symbolfamilie, feste Farbbedeutung, zweistufige Tooltips, `44bb892` |
| 4 | Mechanik | Kartenebenen | Handelsebene gelungen, echtes Wegenetz gewünscht | Wege als Feldmerkmale mit Ausbaustufen, Handel folgt dem Wegenetz. Kern K1, Prototyp `44bb892` |
| 5 | Gestaltung | Entwicklungen | Wirkt nicht wie ein Spiel und erschlägt | Radialer Entwicklungsbaum mit Vorschlägen als Zweigen, Details in Seitenfläche, `44bb892` |
| 6 | Gestaltung | Rat | Bessere Zustimmungs- und Stimmsymbole, weniger Text, echte Porträts | Stimmbalken, Handsymbole, Zitate im Tooltip, `44bb892`. Porträts warten auf einen gültigen Gemini-Key |
| 7 | Mechanik | Rat, alle Entscheidungen | Folgenvorschau vor dem Beschluss ausdrücklich gelobt | Als Gestaltungsprinzip D15 festgehalten und auf Befehle, Forschung, Veto und Proben übertragen, `44bb892` |

## Rückmeldungen aus dem Spieltest

Ab hier betreffen die Einträge die echte Partie `hochland-1` auf dem an den Kern angeschlossenen Spielbrett (Port 4187).

| Nr | Kategorie | Stelle | Rückmeldung | Umsetzung |
|---|---|---|---|---|
| 8 | Mechanik | Entwicklungen | Statt einzelner Technologien Pfade je Bereich denken (Nahrung, Gemeinschaft, Militär, Industrie, Forschung, Magie), auf denen man forscht | Vorschlag Pfade mit Stufen plus agentenerzeugte Errungenschaften je Stufe, wartet auf Bestätigung und auf die Zusammenführung der Fix-Lanes |
| 9 | Mechanik | Forschung | Forschungspunkte aus dem Wissen der Gesellschaft, komplexere Forschung braucht mehr Punkte | Teil des Pfadmodells, Forschung als eigener Haushalt neben den Aktionsplätzen |
| 10 | Inhalt | Begriffe | „Entwicklung“ passt nicht recht, besseres Wort gesucht | Vorschlag „Pfade“ und „Errungenschaften“, wartet auf Bestätigung |
| 11 | Gestaltung | Entwicklungsbaum | Muss besser aussehen | Neugestaltung als Rad mit einer Speiche je Pfad, nach Bestätigung des Pfadmodells |
| 12 | Bedienung | Probe, Rat | Würfelfeld gelungen. Sichtbar machen, wen man schickt, welche Boni Berater haben und wo sie sind | UI-Lane: dauerhafte Rat-Leiste mit Ort, Aufgabe und Stärken, in der Probe Bonus und Chance je Person aus der Kernvorschau |
| 13 | Bedienung | Aktionsplätze | Haupt- und Nebentätigkeiten prominenter markieren | UI-Lane: große Platzanzeige, Platzsymbol an jedem Befehl, Vorschau des belegten Platzes |
| 14 | Gestaltung, Mechanik | Karte | Regionen schöner markieren, Namen zuordnen, Provinzsystem mit Eroberung | UI-Lane: Grenzen, Namen in der Regionsmitte, Provinzansicht. Kern führt Regionen bereits als Provinzen mit Kontrolle |
| 15 | Bedienung | Forschung | Englische Meldung „research.assign is allowed once per season“ blockiert eine zweite Wahl | UI-Lane: neue Wahl ersetzt die bisherige, Begründungen des Kerns auf Deutsch über Beschriftungsschlüssel |
| 16 | Mechanik, Bedienung | Bestimmungen | Was ist eine Bestimmung, lässt sich die Ansicht optimieren. Befund: Ziele der Rivalen erscheinen als wählbar, alle Bestimmungen stehen sofort zur Wahl, zu viel Text | Kern-Fix-Lane: Angebote nur nach §13 und ohne fremde Bestimmungen. UI-Lane: Meilensteine als Symbol mit Fortschritt, Rivalen nur aufgedeckt |
| 17 | Gestaltung | Weltgeschehen | Live-Anzeige der Agents mit Symbolen gefällt, soll noch klarer werden | UI-Lane: Gliederung in Kernergebnisse und Agents, Ergebnis je Agent, wartend, laufend, fertig, gescheitert unterscheidbar, Richter am Ende |
| 18 | Bedienung, Mechanik | Ereignisse | Ereignisse sollen in der Mitte als eigene Fenster erscheinen, mit Weiter bestätigt, mit Reaktionsmöglichkeiten | UI-Lane: Ereigniskarten nacheinander, Optionen mit Kernvorschau, passende Befehle als Reaktion |
| 19 | Gestaltung | Ton | Ton und Audio einbauen | Vorschlag Web Audio mit Atmosphäre, Rückmeldung und Musik je Welt, zunächst im Browser erzeugte Klänge, offen |
| 20 | Inhalt | Sprache | Spiel und Oberfläche auf Englisch, Regeln klarer | Vorschlag Mehrsprachigkeit über Beschriftungen je Sprache und ein Nachschlagewerk im Spiel, Standardsprache offen |
| 21 | Bedienung | Menü, Spielstart | Neues Spiel muss initialisiert werden, Menüführung klären | Vorschlag Startbildschirm mit Welt, Startwert, Volk oder erschaffenem Volk, Rivalen und Schwierigkeit, Spielmenü über Escape, offen |
| 22 | Mechanik | Rivalen | Befund im ersten Zug: Rivale Talbund riet Befehlsparameter, Befehle abgelehnt | Kern-Fix-Lane: Aufträge der Rivalen enthalten den Befehlskatalog mit Parametern und gültigen Zielen |

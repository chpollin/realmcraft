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

| Nr | Kategorie | Stelle | Rückmeldung | Umsetzung |
|---|---|---|---|---|

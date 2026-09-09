# RealmCraft, User Stories und Abnahme

## Geltungsbereich

Die Stories konkretisieren das am 9. September 2026 festgelegte Echtzeitspiel. Die zusätzliche Nutzerkritik verlangt eine ästhetisch stärkere, symbolgestützte Spieloberfläche mit weniger dauerhaften Strukturelementen.

Der Abgleich bezieht sich auf Dashboard, Winter-Prototyp und Nachtmeer einschließlich der Kartenkammer. Ein ausführbarer Echtzeitbereich fehlt. Die vorhandenen Regel- und Browserprüfungen belegen ihre dokumentierten Referenzabläufe. Keine Story ist damit bereits als vollständige Echtzeit-Spielerfahrung abgenommen.

`Referenz` bedeutet, dass ein Teilprinzip im Rundenmodell vorhanden ist. `Offen` bezeichnet eine fehlende Funktion. `Beanstandet` bezeichnet eine ausdrücklich kritisierte Ausarbeitung. E1 bis E5 verweisen auf den [Implementierungsplan](RealmCraft-Echtzeitstrategie.md).

## Abgleich mit der Umsetzung

| ID | Spielerabsicht | Beobachtbares Abnahmekriterium | Aktueller Befund | Umsetzung |
|---|---|---|---|---|
| US01 | Eine bewohnte Welt unmittelbar steuern | Kamera, Objektwahl und Kontextbefehl funktionieren in derselben Welt. | Offen. Nachtmeer besitzt eine feste Ortsübersicht. | E1 |
| US02 | Eine Basis an geeigneten Orten errichten | Bauvorschau prüft Fläche und Zugang; Lieferung und Bauarbeit ergeben ein nutzbares Gebäude. | Referenz. Kosten werden geprüft; Platzierung und kontinuierlicher Bau fehlen. | E1 |
| US03 | Bevölkerung sinnvoll organisieren | Zielbesetzung und Priorität verändern Tätigkeiten realer Bewohner; Arbeitsausfall ist erklärbar. | Referenz. Winter weist abstrakte Arbeitsgruppen zu. | E1, E2 |
| US04 | Ursachen von Versorgungslücken beheben | Bestand, Reservierung, Transport und Verbrauch stimmen zusammen; eine blockierte Lieferung lässt sich finden und beheben. | Referenz. Bestandsrechnung ist vorhanden, räumliche Logistik fehlt. | E1 |
| US05 | Neue Menschen aufnehmen | Eine Gruppe verändert Personenbestand, Arbeit, Unterkunft und Bedarf genau einmal. | Referenz. Nachtmeer hat eine Aufnahmeentscheidung; individuelle Ankommende fehlen. | E1 |
| US06 | Wirksame Technologien entwickeln | Forschung bindet Personen und Voraussetzungen; ihr Abschluss verändert ein Verfahren oder eröffnet eine Funktion. | Offen. Nachtmeers Linsenforschung ist ein Ressourcenauftrag. | E1, E2 |
| US07 | Auf eine fortlaufende Welt reagieren | Ereignisse beachten Lage und Vorgeschichte; Warnungen erlauben Gegenmaßnahmen; Wiederholung bleibt begrenzt. | Referenz. Nachtmeer hat verfasste Ereignisse je Runde. | E1, E2 |
| US08 | Eine eigene gesellschaftliche Ordnung prägen | Eine Institution verändert spätere Handlungen; Ursprung, Betroffene und Änderungsverfahren sind auffindbar. | Referenz. Versorgungspakt und Verträge wirken im Rundenmodell. | E1, E2 |
| US09 | Friedlich erfolgreich aufbauen | Ein äußerer Konflikt lässt sich durch Versorgung, Technik, Handel oder Einigung lösen; Erfolg erfordert keinen Angriff. | Offen für das Zielspiel. Militärische Alternativen fehlen bisher ebenfalls. | E3 |
| US10 | Handel treiben und Geschäftskonflikte lösen | Waren werden geliefert; Verträge wirken; Ausfälle eröffnen erklärbare Alternativen. | Offen. Gildenentscheidungen bilden kein Handelssystem. | E3 |
| US11 | Die Gemeinschaft verteidigen | Alarm und Schutzbefehl mobilisieren Personen; Abwehr und Verluste wirken auf die Siedlung zurück. | Offen. Kämpfende Verbände werden nicht simuliert. | E3 |
| US12 | Militärisch expandieren | Ausgerüstete Verbände bewegen sich, greifen an und ziehen sich zurück; Versorgung und politische Folgen bleiben wirksam. | Offen. Anzeigen früherer Spielleiterpartien belegen keine Echtzeitsteuerung. | E3 |
| US13 | Die eigene Geschichte wiederfinden | Eine Folge lässt sich zur Ursache und zu beteiligten Personen zurückverfolgen. | Referenz. Chronik, Beschlussregister und Ortsprotokoll sind vorhanden. | E2, E3 |
| US14 | Pausieren und später konsistent fortsetzen | Personen, Waren, Bau, Forschung und Ereignisse setzen korrekt fort; verdeckte Tabs lösen keine Aufholsimulation aus. | Referenz. Rundenstände und Entwürfe werden gespeichert; Echtzeitstände fehlen. | E1, E5 |
| US15 | Immer wieder eine andere Welt spielen | Seeds verändern räumliche Entscheidungen; geprüfte Weltpakete ändern Mechaniken und Gestaltung bei gemeinsamer Laufzeit. | Offen. Nachtmeer enthält feste Orte und Sonderregeln im Code. | E4, E5 |
| US16 | Eine ästhetisch anspruchsvolle Spieloberfläche erleben | Welt, Figuren, Gebäude und Symbole bilden eine konsistente Gestaltung; Bedienflächen begleiten aktuelle Handlungen. | Beanstandet. Zu viele Linien und Strukturelemente; Webseitencharakter. | Ab E1, in E4 erneut |
| US17 | Zustände schnell erkennen und bedienen | Ressourcen, Tätigkeiten und Probleme sind durch Symbole und Hinweise erkennbar; Auswahl und Hauptbefehle funktionieren per Tastatur. | Referenz. Symbole und Tastaturdialoge bestehen; die neue Spielszene fehlt. | E1, E5 |

## Gestalterische Abnahme

US16 und US17 werden an derselben Siedlung in verschiedenen Situationen geprüft. Ein leerer Bauplatz erklärt die beabsichtigte Handlung. Im Betrieb werden Arbeit und Versorgung erkennbar. Bei einer Störung fällt das Problem am betroffenen Ort auf. Alle Zustände verwenden denselben Gestaltungssatz.

- Die Welt besitzt gegenüber Markenname, Navigation und Beschreibungstexten deutliches visuelles Gewicht.
- Kontur, Perspektive, Größenverhältnisse, Licht und Farbe passen zwischen Gelände, Gebäuden und Figuren zusammen.
- Symbole tragen erkennbare Funktionen. Ihre Bedeutung bleibt konsistent; Erklärungen sind bei Bedarf zugänglich.
- Linien, Kästen und Beschriftungen enthalten tatsächliche Information. Wiederholte Überschriften und leere Auftragsflächen verdrängen keine Spielwelt.
- Auswahl, Bau, Lieferung und Fertigstellung erhalten angemessene Rückmeldung. Bewegung und Klang lassen sich reduzieren beziehungsweise abschalten.
- Die Darstellung behauptet keine nicht modellierten Entfernungen, Reichweiten oder Besitzverhältnisse.

Der Nutzer beurteilt die ästhetische Wirkung. Ein Screenshot ohne Überlauf oder ein bestandener Klicktest bestätigt diese Wirkung nicht. Ein fachlicher Spieltest untersucht zusätzlich, ob der Spieler eine passende Handlung aus der Darstellung ableiten kann.

## Nachweise für neue Implementierungen

Ein Nachweis nennt Story-ID, Ausgangslage, Handlung, beobachtetes Ergebnis und Grenze der Aussage. Automatisierte Tests dokumentieren Regelergebnisse. Browserbeobachtung dokumentiert ausgeführte Bedienung. Gestalterische Beurteilung und fachliche Nutzerabnahme werden gesondert festgehalten.

Ein funktionsfähiger Teilablauf erhält den Befund `Teilweise umgesetzt` mit genauer Einschränkung. `Abgenommen` wird nur nach tatsächlicher Beurteilung verwendet. Frühere Nachtmeer-Testzahlen werden nicht als Nachweis neuer Echtzeitfunktionen übernommen. Bei verändertem Umfang wird diese Zuordnung nachgeführt.

## Referenzen

- [Nachtmeer-Implementierung](Nachtmeer-Implementierung.md) dokumentiert Regeln, Rundenablauf und Speicherprüfung.
- [Kartenkammer](Nachtmeer-Kartenkammer.md) dokumentiert Ortszustände und politische Herkunft.
- [Winter-Prototyp](Strategiespiel-M1.md) dokumentiert Arbeitszuweisung und Versorgungspakt.
- Der Gesamtzuschnitt steht im [Echtzeitplan](RealmCraft-Echtzeitstrategie.md); der nächste Einstieg steht im [Arbeitsstand](RealmCraft-Arbeitsstand.md).

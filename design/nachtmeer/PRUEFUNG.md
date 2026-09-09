# Prüfung der Nachtmeer-Entwürfe

Prüfstand vom 9. September 2026. Geprüft wurde die lokal laufende Designstudie unter `/design/nachtmeer/` im Codex-Browser. Dieser Bericht gilt für die UI-Entwürfe Admiralität, Atlas und Signal.

## Beobachtete Funktion

In jeder der drei Varianten wurde derselbe Ablauf ausgeführt. Ein Leuchtfeuer wurde an der Sternwarte vorgemerkt, anschließend ein Bergungsauftrag an der Salzwerft. Der zweite Auftrag wurde entfernt und erneut hinzugefügt. Danach wurden die Folgen geöffnet und die Beispielrunde ausgeführt.

| Prüfung | Beobachtung |
|---|---|
| Ortsauswahl | Ortsdossier und hervorgehobene Kartenmarkierung ändern sich gemeinsam |
| Doppeltes Leuchtfeuer | Bereits vorgemerkter Bau lässt sich nicht ein zweites Mal hinzufügen |
| Befehlsgrenze | Bei zwei Aufträgen sind weitere Aufträge deaktiviert |
| Auftrag entfernen | Freier Platz und verfügbare Aktionen werden wiederhergestellt |
| Ressourcen vor Ausführung | Ausgangsbestand bleibt erhalten; Folgen erscheinen in der Vorschau |
| Beispielrunde in allen drei Varianten | 24 Vorräte, 16 Baustoffe, 5 Äther und 80 Prozent Zuversicht nach Leuchtfeuer und Bergung |
| Kartenfolge | Die Sternwarte erscheint als entzündet; der Zähler steigt von einem auf zwei Feuer |
| Zeit und Aufträge | Anzeige wechselt von Gezeit drei auf vier; beide Auftragsplätze werden frei |
| Variantenwechsel | Ressourcen und Zeitstand bleiben beim Wechsel erhalten |
| Ratsansicht über Tastatur | Enter öffnet den Dialog; Escape schließt ihn und gibt den Fokus an den Ratsknopf zurück |
| Ereignis | Die Aufnahme aller Schutzsuchenden verändert den Beispielbestand um minus sechs Vorräte, plus zwei Baustoffe und plus zehn Zuversicht |
| Chronik | Ausgeführte Befehle und Ratsentscheidung erscheinen zusätzlich zur Ausgangsgeschichte |
| Laufzeitmeldungen | In den beobachteten Browserabläufen keine Fehler oder Warnungen protokolliert |

Die Ereignisprüfung erfolgte nach einer separaten Beispielrunde mit ausschließlich dem Leuchtfeuer. Deshalb enthält dieser Prüfpfad nach der Aufnahme 18 Vorräte, 13 Baustoffe, 5 Äther und 90 Prozent Zuversicht.

## Darstellung

Alle Varianten wurden bei tatsächlichen Inhaltsbreiten von 1440, 1024, 390 und 320 CSS-Pixeln geprüft. Es wurde kein horizontaler Seitenüberlauf beobachtet. Die rechte Ortsansicht besitzt auf dem Desktop einen eigenen vertikalen Scrollbereich. Auf schmalen Fenstern folgen Karte und Ortsansicht untereinander.

Die Prüfung verglich zusätzlich die tatsächlichen Begrenzungsflächen der Kartenknöpfe mit Kapitelziel, Überschrift und Ereignisfenster. Dabei wurden Überlagerungen in Atlas und Signal sowie in Admiralität bei mittlerer Breite gefunden und korrigiert. Bei der letzten Korrektur in Admiralität beträgt der Abstand zwischen der Glasgärten-Markierung und dem Ereignisfenster bei 1024 Pixeln rund elf Pixel. Die übrigen geprüften Kombinationen zeigen keine Überschneidungen dieser Flächen.

Die visuelle Sichtprüfung bestätigt die unterschiedlichen Anordnungen und die korrigierte schmale Atlas-Ansicht. Der Screenshot-Export des eingebetteten Browsers erzeugte bei zusammengesetzten Aufnahmen teilweise doppelte Bildstreifen. Solche Exportbilder wurden nicht als unverfälschte Nachweise abgelegt. Die Geometrieprüfung verwendet die tatsächlichen Elemente der gerenderten Seite.

Die JavaScript-Dateien bestehen `node --check`. Diese Prüfung ist keine umfassende Prüfung nach einem Barrierefreiheitsstandard. Screenreader, weitere Browser und sämtliche möglichen Beispielzustände wurden nicht vollständig geprüft.

## Offene Validierung

Die drei Gestaltungsrichtungen sind noch nicht vom Nutzer abgenommen. Die technische Funktion belegt weder eine beeindruckende Wirkung noch die Verständlichkeit für einen erstmals spielenden Menschen.

Die gemeinsame Abnahmeaufgabe lautet, die Sternwarte auszuwählen, ihr Leuchtfeuer vorzumerken und seine Folgen vor der Ausführung zu erklären. Danach soll der Nutzer im Hafenrat den Konflikt um die Schutzsuchenden erfassen. Festzuhalten sind Orientierungsprobleme, fehlende Informationen und die bevorzugte Gestaltung. Zusätzlich braucht der Vorschlag Nachtmeer eine inhaltliche Bestätigung.

Der aktuelle Auftrag zur Bereitstellung dreier vergleichbarer UI-Studien ist umgesetzt. Das Gesamtziel eines vollständigen neuen Strategiespiels bleibt darüber hinaus offen. Die neue Kampagne, ihre Wirtschaft und die Verbindung zum vollständigen Simulationskern sind nicht Bestandteil dieses technischen Nachweises.

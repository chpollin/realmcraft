# Speicherstand-Format (RealmCraft)

RealmCraft lädt einen Speicherstand und rendert daraus das Lagebild. Neben der Prosa trägt der Speicherstand deshalb einen maschinenlesbaren Kern. Die formale Prüfung steckt in [`schema/savegame.schema.json`](../schema/savegame.schema.json), ein vollständiges Beispiel in [`examples/die-karren-kapitel-3.md`](../examples/die-karren-kapitel-3.md). `npm run validate:savegame` prüft `savegame.json`, `npm run check` alle versionierten Beispielstände gegen das Schema.

## Zwei zulässige Eingaben

1. Hybrid-Markdown (empfohlen) ist eine `.md`-Datei mit lesbarer Prosa und genau einem eingebetteten ```json-Codeblock. Der JSON-Block ist die kanonische Quelle, die Prosa dient Mensch und Spielleiter.
2. Reines JSON ist eine `.json`-Datei, die direkt dem Schema entspricht.

Beim Hybrid-Format extrahiert das Dashboard den ersten ```json-Block. Enthält die Datei keinen JSON-Block, wird sie als reines JSON interpretiert. Schlägt auch das fehl, erscheint eine Fehlermeldung.

## Konventionen

- `id` folgt dem Muster `^[a-z0-9][a-z0-9_-]*$` und bleibt über Speicherstände hinweg konstant. Daran hängen Bild-Cache und Bildversionen, damit Bilder nicht bei jedem Laden neu erzeugt werden.
- `erscheinung` ist eine knappe, stabile Bildbeschreibung je Figur, Macht und Ort. Sie speist den Bild-Prompt und sorgt für Wiedererkennbarkeit.
- `meta.visualStyle` (Porträts und Szenen), `meta.mapStyle` (Karte) und optional `meta.armeeStyle` (Heerschau und Verbände, Rückfall `visualStyle`) halten die Optik einer Partie konsistent.
- `meta.spielname` identifiziert die Partie. Deltas, Verlauf und Bildversionen werden je Spielname getrennt geführt.
- `meta.zeit.jahreszeit` steht in Umlautform (`Frühling`, `Sommer`, `Herbst`, `Winter`), `meta.weltereignis` ist `offen` oder `gewürfelt`. Eine Jahreszeit ohne Umlaut weist schon die Ladeprüfung in `js/parse.js` ab, beide Felder prüft das Schema.
- Grundgrößen sind ganze Zahlen. Lagewerte und Beziehungswerte liegen grob bei −2 bis +3, Loyalität bei −5 bis +5 (siehe [Spielmechanik](Spielmechanik.md)).

## Felder

Pflichtfelder sind `schemaVersion`, `meta`, `volk`, `grundgroessen`, `lagewerte`, `berater` und `maechte`. Alle übrigen Felder sind optional, damit ältere Stände gültig bleiben.

| Pfad | Bedeutung |
|---|---|
| `schemaVersion` | Formatversion, aktuell `1`. |
| `meta` | Spielname, Kapitel, Zeit (Jahreszeit, Jahr), `rundeOffen`, Weltereignis, Stil-Anker. |
| `volk` | Name, Wesensart, Ausrichtung, Erscheinung, Region mit Geländewerten. |
| `status` | Lagebeschreibung und Ansehen (Stufe, Label). |
| `grundgroessen` | Nahrung, Material, Wissen und Bevölkerung (Zahl, Label). |
| `lagewerte` | Verteidigung, Mobilität, Wohlstand und Ausbeuten (Schlüssel, Wert, Quelle). |
| `modifikatoren` | Gelände- und Lage-Modifikatoren mit Begründung. |
| `faehigkeiten` | Was der Wissensstand konkret beherrscht. |
| `gruppen` | Tragende Gruppen mit Sprecher (`sprecherId` verweist auf einen Berater oder eine Person) und Kompetenz. |
| `berater` | Rat mit Rolle, Ziel, Loyalität (−5 bis +5), Generation, Lebensstand, Erscheinung, Porträt und optionalem Referenzbild `referenz`. |
| `personen` | Weitere benannte Figuren mit Rolle, Lebensstand und Erscheinung. |
| `maechte` | Nachbarvölker und Mächte mit Typ, Erscheinung, `profil` (Kennwerte, negative Werte als Schwäche), Beziehung (Wert, Label) und Haltung. |
| `beziehungenAnsehen` | Freitext (`text`) dazu, wie andere das Reich sehen. |
| `besitz` | Bauten, Orte und Güter im Besitz als Liste von Texten. |
| `verfassung` | Regierungsform und Rechtsordnung als Text. |
| `setzungen` | Die vereinbarten Sonderregeln der Partie, je mit Titel und Text. |
| `historie` | Ein Eintrag je Abschnitt der Zeitachse mit Kapitel, Jahren, Zusammenfassung und optionalem Ereignisbild `bild` (`anlass`, `prompt`, `bildCacheKey`). Der letzte Eintrag ist die Gegenwart. |
| `offeneFaeden` | Lose Enden für das nächste Kapitel. |
| `karte` | Kartenprompt, Orte (Name, Typ, Richtung, Beziehung) und optional die Karten-Chronik. |
| `karte.chronik` | Folge der Kartenstände, je mit `id`, `zeit`, `anlass`, `prompt`, Vorgänger `basiertAuf` (`null` für die erste Karte) und `bildCacheKey`. Ein Stand mit Vorgänger wird aus dessen Bild weiterentwickelt. |
| `karte.aktuellerStand` | `id` des gezeigten Chronik-Eintrags. Ohne Chronik zeigt der Karte-Reiter ein Bild aus `karte.prompt`. |
| `armee` | Gesamtstärke `gesamt`, Lagesatz `moral`, `verbaende` (je `id`, Name, Typ, Führung `fuehrungId` als Berater-Id, Stärke, Verfassung, Ausrüstung, Hinweis), `stehendeModifikatoren` als Kennwerte und `verluste` (Zeit, Zahl, Anlass). |
| `lebenswelt.leben` | Das Leben der ganzen Bevölkerung mit Stimmung, Nahrung, Trinken, Glaube, Alltag und Bräuchen. |
| `lebenswelt.siedlungen` | Siedlungen mit `id`, Name, Typ, Gründung, Lage, Beschreibung, Stimmung, Versorgung, Bauten, Eigenschaften und Bild-Prompt. Genau eine trägt `hauptstadt: true`. Einwohner und Verteidigung stehen nicht hier, sie kommen aus `grundgroessen` und `lagewerte`. Ein älteres Einzelobjekt `siedlung` wird als Hauptstadt gelesen. |

## Felder der laufenden Partie

Die Mechanik schreibt nach jedem Zug `trends`, `runde` und `setzungen` fort. Im Schema sind diese Felder optional, damit ältere Speicherstände gültig bleiben. Im laufenden Spiel werden sie erwartet und mitgeführt.

- `trends` führt je Grundgröße eine `richtung` (`steigend`, `fallend`, `gleichbleibend`) und einen kurzen `grund`.
- `runde` ist das Aktionsbrett mit den Budgets `haupt` und `neben` (`used`, `max`) und den `aktionen` (Art `haupt` oder `neben`, Titel, Kern, Folge, Ziel, Modifikator, Status `gewaehlt` oder `frei`, Wurf, Ergebnis).
- `runde.aktionen[].mod` darf eine ganze Zahl oder eine offene Aufschlüsselung als Text sein (etwa `+2 / +1 = +3`), damit die ganze Rechnung sichtbar bleibt.
- `berater[].lebensstand` folgt dem Enum `ruestig | lebensabend | hinfaellig`. `personen[].lebensstand` ist Freitext (etwa `tot (verbrannt)`), weil benannte Figuren auch Zustände außerhalb dieser Stufen annehmen.

## Bilder im Speicherstand

Im normalen Betrieb liegt ein erzeugtes Bild im lokalen Cache (IndexedDB) unter einem Schlüssel, den das Dashboard aus Prompt und Modell bildet. Für portable Stände bettet der Export das Bild als `dataUrl` mit base64-Daten ein. Beim Laden füllt die eingebettete Fassung die Anzeige, ohne neu zu generieren. In den Demoständen unter `examples/demo/` steht an derselben Stelle ein Pfad zu einer Bilddatei.

| Bildtyp | Feld mit `dataUrl` |
|---|---|
| Berater | `berater[].portrait.dataUrl` |
| Referenzfoto eines Beraters als Vorlage für sein Porträt | `berater[].referenz.dataUrl` |
| Mächte | `maechte[].bild.dataUrl` |
| Gruppen | `gruppen[].bild.dataUrl` |
| Heerschau | `armee.bild.dataUrl` |
| Verbände | `armee.verbaende[].avatar.dataUrl` |
| Siedlungen | `lebenswelt.siedlungen[].bild.dataUrl` |
| Ereignisbilder | `historie[].bild.dataUrl` |
| Karte ohne Chronik | `karte.dataUrl` |
| Kartenstände | `karte.chronik[].dataUrl`, für den aktuellen Stand älterer Exporte auch `karte.dataUrl` |

Das Schema erlaubt zusätzlich `personen[].portrait`. Das Dashboard erzeugt dafür derzeit kein Bild.

Das Feld `bildChronik` auf oberster Ebene gehört dem Frontend und wird nur beim Export geschrieben. Es enthält je Bildidentität (`armee` oder `<typ>:<id>`, etwa `berater:<id>`) die gewählte Version `aktiv` und die Liste `versionen` mit `key`, `label`, `savedAt` und, soweit im Browser vorhanden, `dataUrl`. Beim Laden spielt das Dashboard diese Versionen in Cache und Versionsspeicher zurück, sodass fortgeschriebene Bilder auf einem fremden Browser durchblätterbar bleiben. Die Spielleitung schreibt dieses Feld nicht.

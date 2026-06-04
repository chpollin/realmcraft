# Speicherstand-Format (RealmCraft)

RealmCraft lädt einen Speicherstand und rendert daraus das Lagebild. Damit das verlässlich gelingt, hat der Speicherstand neben der Prosa einen maschinenlesbaren Kern. Dieses Dokument beschreibt das Format; die formale Prüfung steckt in [`schema/savegame.schema.json`](../schema/savegame.schema.json), ein vollständiges Beispiel in [`examples/die-karren-kapitel-3.md`](../examples/die-karren-kapitel-3.md).

## Zwei zulässige Eingaben
1. **Hybrid-Markdown (empfohlen).** Eine `.md`-Datei mit lesbarer Prosa und genau einem eingebetteten ```json-Codeblock. Der JSON-Block ist die kanonische Quelle, die Prosa dient Mensch und Spielleiter.
2. **Reines JSON.** Eine `.json`-Datei, die direkt dem Schema entspricht.

Beim Hybrid-Format extrahiert das Dashboard den **ersten** ```json-Block. Enthält die Datei keinen JSON-Block, wird sie als reines JSON interpretiert; schlägt auch das fehl, erscheint eine klare Fehlermeldung.

## Konventionen
- **Stabile IDs.** `id` ist kebab-/snake-tauglich (`^[a-z0-9][a-z0-9_-]*$`) und bleibt über Speicherstände hinweg konstant. Daran hängt der Bild-Cache, damit Portraits nicht bei jedem Laden neu erzeugt werden.
- **Erscheinung.** `erscheinung` ist eine knappe, stabile Bildbeschreibung je Figur, Macht und Ort. Sie speist den Bild-Prompt und sorgt für Wiedererkennbarkeit.
- **Stil-Anker.** `meta.visualStyle` (Portraits) und `meta.mapStyle` (Karte) halten die Optik konsistent.
- **Skalen.** Grundgrößen sind ganze Zahlen. Lagewerte und Beziehungswerte liegen grob bei -2 bis +3, Loyalität bei -5 bis +5 (siehe Spielmechanik).

## Felder (Kurzreferenz)
| Pfad | Bedeutung |
|---|---|
| `schemaVersion` | Formatversion, aktuell `1`. |
| `meta` | Kampagnenname, Kapitel, Zeit (Jahreszeit, Jahr), Rundenstatus, Weltereignis, Stil-Anker. |
| `volk` | Name, Wesensart, Ausrichtung, Region mit Geländewerten. |
| `status` | Lagebeschreibung und Ansehen (Stufe, Label). |
| `grundgroessen` | Nahrung, Material, Wissen, Bevölkerung. |
| `lagewerte` | Verteidigung, Mobilität, Wohlstand, Ausbeuten. |
| `modifikatoren` | Gelände- und Lage-Modifikatoren mit Begründung. |
| `faehigkeiten` | Was der Wissensstand konkret beherrscht. |
| `gruppen` | Tragende Gruppen mit Sprecher (`sprecherId` verweist auf einen Berater). |
| `berater` | Sprecher mit Rolle, Ziel, Loyalität (-5..+5), Erscheinung, optionalem Portrait. |
| `personen` | Weitere benannte Figuren (Anführer, Verwalter, Gesandte). |
| `maechte` | Nachbarvölker und Mächte mit Profil, Beziehung und Haltung. |
| `besitz` | Bauten, Orte, Güter im Besitz. |
| `verfassung` | Regierungsform und Rechtsordnung. |
| `historie` | Kapitel mit Jahren und Kurzfassung. |
| `offeneFaeden` | Lose Enden für das nächste Kapitel. |
| `karte` | Kartenprompt und minimale Ortsliste (Name, Typ, Richtung). |

## Laufende-Partie-Felder (erwartet, technisch optional)
Die Mechanik schreibt nach jedem Zug `trends` (je Grundgröße), `runde` (das Aktionsbrett) und `setzungen` (die vereinbarten Sonderregeln) fort. Im JSON-Schema sind diese Felder **optional** (nicht `required`), damit ältere Speicherstände ohne sie weiterhin gültig bleiben (abwärtskompatibel). Im laufenden Spiel werden sie erwartet und mitgeführt.

Zwei Lockerungen, die der Regel "jeden Modifikator offen nennen" folgen bzw. dem unterschiedlichen Charakter der beiden Figurenlisten Rechnung tragen:
- `runde.aktionen[].mod` darf eine **ganze Zahl** ODER ein **offener Modifikator-Text** sein (z. B. `+2 / +1 = +3`); das Schema wurde entsprechend gelockert, damit die ganze Rechnung sichtbar bleibt.
- `personen[].lebensstand` ist **Freitext-Status** (z. B. `tot (verbrannt)`), während `berater[].lebensstand` das strenge Enum `rüstig | lebensabend | hinfällig` bleibt.

## Bilder im Speicherstand
`berater[].portrait`, `personen[].portrait` und `karte` können ein erzeugtes Bild referenzieren. Im normalen Betrieb liegt das Bild im lokalen Cache (IndexedDB); für portable Bundles kann ein `portrait.dataUrl` mit eingebettetem base64-Bild gespeichert werden, das beim Import den Cache füllt, ohne neu zu generieren.

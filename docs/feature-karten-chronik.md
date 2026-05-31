# Auftrag: Karten-Chronik (Karten-Evolution mit Verlauf) im Karte-Reiter

**Für den Programmier-Claude.** Spielleiter-Teil erledigt: Der Speicherstand trägt jetzt eine **Karten-Chronik** unter `karte.chronik` plus `karte.aktuellerStand`, abwärtskompatibel zum bestehenden `karte.prompt`/`karte.orte`. Aufgabe ist das Frontend: aus dem einen Kartenbild eine **Folge von Karten** machen, die man (a) **Stand für Stand erzeugt, indem die jeweils vorige Karte als Bild-Vorlage dient** (Bild-zu-Bild), (b) im UI **durchblättern** kann, und bei der (c) **dokumentiert** ist, welcher Spielstand sie zeigt. Bestehenden Frontend-Vertrag nicht brechen. Vorbild für die Bild-Erzeugung bleibt der Karte-Reiter ([js/render/map.js](../js/render/map.js) + `onGenerateMap` in [js/app.js](../js/app.js)).

## Warum

Die Welt verändert sich über die Saisons (umkämpfte Erzklippen, ein drohender Sturm, ein Schleier überm Lager). Statt die alte Karte zu überschreiben, soll jede neue Karte **auf der vorigen aufbauen** (gleicher Stil, gleiche Küste, nur fortentwickelt) und die alte erhalten bleiben — ein visuelles Logbuch der Partie, parallel zur Chronik in Worten.

## Datenmodell (liegt schon in `savegame.json`)

```jsonc
"karte": {
  "prompt": "…",                 // bleibt: der Prompt des AKTUELLEN Standes (= chronik-Eintrag aktuellerStand)
  "orte": [ … ],                 // bleibt: die Orte (wie bisher)
  "aktuellerStand": "fruehling-j2",   // id des aktuell gezeigten chronik-Eintrags
  "chronik": [
    {
      "id": "gruendung-j1",      // stabil, klein, ohne Umlaute
      "zeit": "Fruehling Jahr 1",// welcher Spielstand
      "anlass": "Landung und Gruendung …",  // was diese Karte zeigt / warum sie entstand
      "basiertAuf": null,        // id des Vorgaengers (null = Ur-Karte)
      "bildCacheKey": "",        // Cache-Key des erzeugten Bildes (Frontend füllt/liest)
      "prompt": "…"              // der (Evolutions-)Prompt dieses Standes
    },
    {
      "id": "fruehling-j2",
      "zeit": "Fruehling Jahr 2",
      "anlass": "Klan an den Erzklippen, Sturm droht …",
      "basiertAuf": "gruendung-j1",   // <- nimmt die vorige Karte als Bild-Vorlage
      "bildCacheKey": "",
      "prompt": "Entwickle die vorige Seekarte weiter …"
    }
  ]
}
```

`karte.chronik` ist optional. Fehlt sie, verhält sich der Reiter wie bisher (ein Bild aus `karte.prompt`). Die **Reihenfolge** der Chronik ist die Zeitachse; der Spielleiter pflegt sie (er fügt je Stand einen Eintrag an und setzt `aktuellerStand`). Das Frontend **liest** Chronik und `prompt`/`anlass`/`zeit`, **schreibt** nur den erzeugten `bildCacheKey` je Eintrag zurück (in localStorage/State, nicht in die Datei — der Spielleiter besitzt `savegame.json`).

## Zu ändernde Dateien

### 1. Bild-Pipeline: Bild-zu-Bild ([js/images/gemini.js](../js/images/gemini.js))
`generateImage` so erweitern, dass es **optional ein Eingabebild** annimmt (Gemini kann Bild+Text → Bild). Signatur etwa `generateImage(prompt, { model, inputImage })`. Ist `inputImage` gesetzt, wird die vorige Karte als Vorlage mitgeschickt; sonst reines Text-zu-Bild wie bisher (keine Regression).

### 2. `onGenerateKarteStand` ([js/app.js](../js/app.js))
Einen Handler nach Vorbild `onGenerateMap`, der:
- den chronik-Eintrag `aktuellerStand` (oder einen gewählten) nimmt,
- falls `basiertAuf` gesetzt: das Bild des Vorgaengers aus dem Cache holt (`cacheGet(vorgaenger.bildCacheKey)`) und als `inputImage` übergibt,
- mit `entry.prompt` + `meta.mapStyle` das neue Bild erzeugt,
- unter einem stabilen Key `makeKey(['karte', entry.id, entry.prompt])` cacht und den Key dem Eintrag zuordnet (State/localStorage).

### 3. `render/map.js` — Verlauf + Umschalter
- **Aktuelles Bild** wie bisher (jetzt aus dem gewählten chronik-Eintrag), mit „Karte erzeugen“ (bzw. „Aus der vorigen weiterentwickeln“, wenn `basiertAuf` gesetzt).
- **Zeitleiste/Umschalter:** eine Reihe der chronik-Einträge (testid `karte-chronik`), je als anklickbarer Knopf mit `zeit` + `anlass` (testid `karte-stand`), aktiver Stand hervorgehoben. Klick wechselt das angezeigte Bild.
- Die Orte-Liste bleibt; sie gilt für den aktuellen Stand.

### 4. `schema/savegame.schema.json`
`karte` um `aktuellerStand` (string) und `chronik` (Array) erweitern, optional. chronik-Eintrag: `id` (id), `zeit`, `anlass`, `prompt` (string), `basiertAuf` (string|null), `bildCacheKey` (string). Nicht in `required`.

### 5. `docs/Frontend-Contract.md`
Abschnitt „Karte“ um die testids erweitern: `karte-chronik`, `karte-stand`, `karte-stand-aktiv`, und den Knopf `generate-karte-stand`. Notieren: Bild-zu-Bild über `basiertAuf`; ohne `chronik` Verhalten wie bisher.

### 6. Tests
- `tests/visual/04-karte.spec.js` erweitern: Chronik-Umschalter sichtbar, Wechsel zeigt anderen Stand; Stand ohne `chronik` rendert wie bisher.
- Bild-Erzeugung in Tests nicht real aufrufen (kein Key) — nur Struktur/Knöpfe/Umschalten prüfen.

## Abnahmekriterien
- Der Karte-Reiter zeigt eine **Zeitleiste aller Karten-Stände** mit Zeit und Anlass; man kann zwischen ihnen wechseln, das Bild folgt.
- „Weiterentwickeln“ erzeugt das neue Bild **mit der vorigen Karte als Vorlage** (Bild-zu-Bild über `basiertAuf`), im `mapStyle`, gecacht je Stand (bleibt über Sitzungen erhalten).
- Speicherstand ohne `chronik` lädt und rendert fehlerfrei (eine Karte wie bisher).
- Bestehende Reiter und Tests grün; Live-Reload spiegelt neue chronik-Einträge sofort.

## Hinweis zur Arbeitsteilung
`karte.chronik`/`prompt`/`orte`/`anlass`/`zeit` sind **Spielinhalt** und gehören dem Spielleiter (er fügt je Saison einen Stand an). Das Frontend besitzt die **Anzeige, die Bild-zu-Bild-Pipeline und den `bildCacheKey`**. Nicht den `prompt`-Text in `savegame.json` umschreiben.

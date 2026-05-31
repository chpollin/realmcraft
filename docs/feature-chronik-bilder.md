# Auftrag: Ereignis-Bilder in der Chronik (Historie-Reiter)

**Für den Programmier-Claude.** Spielleiter-Teil erledigt: Ein Historie-Eintrag kann jetzt ein **Ereignis-Bild** tragen — ein optionales Feld `bild` an einem Eintrag in `historie[]` (`savegame.json`). Aufgabe ist das Frontend: dieses Bild im Historie-Reiter **anzeigen** und, wenn noch keins erzeugt wurde, per Knopf **erzeugen** (Text-zu-Bild im `meta.visualStyle`), gecacht wie Porträts und Karten. Vorbild für die Bild-Erzeugung bleibt der Karte-Reiter ([js/render/map.js](../js/render/map.js) + `onGenerateMap` in [js/app.js](../js/app.js)) und die Porträt-Pipeline. Bestehenden Frontend-Vertrag nicht brechen; ohne `bild` rendert die Historie wie bisher.

## Warum

Die Chronik erzählt den langen Bogen in Worten. Prägende Ereignisse — der Sturm am Wall, der Scheiterhaufen des Stillen — sollen zusätzlich **ein Bild** tragen, eine Feldskizze aus dem Tagebuch des Chronisten, im selben gezeichneten Stil wie die übrigen Bilder. Anders als die Karten-Chronik (eine fortlaufende Bild-zu-Bild-Evolution **einer** Karte) ist dies ein **eigenständiges Bild pro Ereignis**, reines Text-zu-Bild aus dem `prompt` des Eintrags. Kein img2img nötig.

## Datenmodell (liegt schon in `savegame.json`)

```jsonc
"historie": [
  {
    "kapitel": 1,
    "jahre": "Jahr 2, Fruehling",
    "zusammenfassung": "…",         // bleibt: der Kapitel-/Saisontext
    "bild": {                          // NEU, optional
      "anlass": "Der Scheiterhaufen des Stillen",  // kurzer Bildtitel
      "bildCacheKey": "",            // Cache-Key des erzeugten Bildes (Frontend füllt/liest)
      "prompt": "Gritty dark fantasy oil painting … (englischer Bild-Prompt)"
    }
  }
]
```

`bild` ist optional. Fehlt es, rendert der Eintrag wie bisher (nur Text). Mehrere Einträge dürfen je ein `bild` haben. Das Frontend **liest** `anlass`/`prompt`, **schreibt** nur den erzeugten `bildCacheKey` zurück (in Cache/State/localStorage, **nicht** in die Datei — der Spielleiter besitzt `savegame.json`).

Hinweis zum Bild-Prompt: Er ist bewusst englisch und beschreibt **das Ereignis**; den **Stil** liefert `meta.visualStyle` (Tuschelavierung/Kohle, Chronisten-Tagebuch). Beim Erzeugen wie bei der Karte `visualStyle` an den Prompt anhängen, damit alle Bilder stilistisch zusammenpassen.

## Zu ändernde Dateien

### 1. `onGenerateEreignisbild` ([js/app.js](../js/app.js))
Handler nach Vorbild `onGenerateMap`/`onGeneratePortrait`, der:
- den Historie-Eintrag (per Index oder stabilem Schlüssel) nimmt,
- mit `eintrag.bild.prompt` + `meta.visualStyle` ein Bild **text-zu-Bild** erzeugt (kein `inputImage`),
- unter einem stabilen Key `makeKey(['ereignis', eintrag.jahre, eintrag.bild.prompt])` cacht und den Key dem Eintrag im State/localStorage zuordnet,
- denselben Lade-/Fehlerpfad nutzt wie die übrigen Bild-Knöpfe (Toast bei 429 etc.).

### 2. `render/history.js` — Bild je Ereignis ([js/render/history.js](../js/render/history.js))
Im `timeline`-Block (die `epoch`-Einträge): wenn `h.bild` gesetzt ist, unter `esum`
- entweder das **gecachte Bild** anzeigen (`cacheGet(h.bild.bildCacheKey)` bzw. der State-Key), mit `anlass` als Bildunterschrift (testid `ereignis-bild`),
- oder, solange keins da ist, einen Knopf **„Bild erzeugen"** (testid `generate-ereignisbild`), der `onGenerateEreignisbild` auslöst.
Layout dezent halten (Feldskizze im Tagebuch), nicht den Textfluss sprengen.

### 3. `schema/savegame.schema.json`
`historie`-Eintrag um `bild` (object, optional) erweitern: `anlass` (string), `prompt` (string), `bildCacheKey` (string). Nicht in `required`; der Eintrag bleibt mit nur `kapitel`/`jahre`/`zusammenfassung` gültig.

### 4. `docs/Frontend-Contract.md`
Abschnitt „Historie" um die testids erweitern: `ereignis-bild`, `generate-ereignisbild`. Notieren: `historie[].bild` optional, reines Text-zu-Bild aus `bild.prompt` + `meta.visualStyle`; ohne `bild` Verhalten wie bisher.

### 5. Tests
- Vorhandenen Historie-/Visual-Test erweitern: Eintrag mit `bild` zeigt Bildunterschrift/Knopf; Eintrag ohne `bild` rendert wie bisher (nur Text).
- Bild-Erzeugung in Tests nicht real aufrufen (kein Key) — nur Struktur/Knöpfe prüfen.

## Abnahmekriterien
- Ein Historie-Eintrag mit `bild` zeigt im Chronik-Reiter ein Ereignis-Bild (bzw. einen Erzeugen-Knopf), Bildunterschrift = `anlass`.
- „Bild erzeugen" liefert ein Bild im `visualStyle`, gecacht je Ereignis (bleibt über Sitzungen erhalten), Fehlerpfad wie bei den übrigen Bildern.
- Speicherstand ohne `bild` lädt und rendert fehlerfrei (Historie wie bisher).
- Bestehende Reiter und Tests grün; Live-Reload spiegelt neue Einträge sofort.

## Hinweis zur Arbeitsteilung
`historie[].bild.anlass`/`prompt` und der `zusammenfassung`-Text sind **Spielinhalt** und gehören dem Spielleiter (er fügt Ereignisse an und schreibt die Prompts). Das Frontend besitzt **Anzeige, Erzeugung und `bildCacheKey`**. Nicht den `prompt`-Text in `savegame.json` umschreiben.

## Teil 2: Redundanz im Historie-Reiter beheben (vom Spielleiter gemeldet, Stand Herbst J2)

Der Nutzer hat den Reiter `#/historie` angeschaut; die Timeline zeigt **echte Redundanz**. Bitte zusammen mit Teil 1 beheben.

**Daten sind jetzt bereit:** Der Spielleiter hat `historie[]` auf **einen Eintrag pro Jahreszeit** umgebaut (8 Einträge: „vor Jahr 1", „Jahr 1, Fruehling", „… Sommer", „… Herbst", „… Winter", „Jahr 2, Fruehling", „… Sommer", „… Herbst"), und **jeder Eintrag hat ein `bild`** (anlass + prompt im `visualStyle`). Die Reihenfolge ist die Zeitachse, der letzte Eintrag ist die Gegenwart.

**Die drei Redundanzen:**
1. **„Gegenwart" steht auf JEDEM Eintrag.** Ursache: `cur = h.kapitel === kapitelJetzt` ([js/render/history.js](../js/render/history.js) ~Z. 109) — da alle Einträge Kapitel 1 sind, ist jeder „Gegenwart". **Fix:** „Gegenwart" nur auf dem **letzten** Eintrag der Liste (dem zeitlich jüngsten), nicht pro Kapitel.
2. **„Kapitel I" wird auf jedem Eintrag wiederholt** (Roman-Node + `etitle: "Kapitel I"`). **Fix:** Einträge **nach Kapitel gruppieren** und das „Kapitel I" **einmal** als Gruppenkopf zeigen (wie es `buildVerlauf`/`gruppiereNachKapitel` unten bereits tut); je Eintrag nur noch `jahre` (z. B. „Jahr 2, Herbst") als Titel.
3. **Doppelte Erzählung:** Die obere Timeline (`historie[]`) und die untere Sektion „Verlauf dieser Partie" (`buildVerlauf` aus den Snapshots) erzählen beide die Abfolge. **Fix:** Eine von beiden. Empfehlung: die **Timeline behalten** (sie hat jetzt pro Jahreszeit Text + Bild) und „Verlauf dieser Partie" entfernen oder nur als knappe, andersartige Ansicht behalten (z. B. nur die ausgewürfelten Vorhaben je Zug, ohne den Lagetext zu wiederholen).

**Per-Eintrag-Bild (Teil 1) hier einhängen:** In jeder `epoch`-Karte unter `esum` das `h.bild` rendern — gecachtes Bild via `imageFrame` (Bildunterschrift = `h.bild.anlass`, testid `ereignis-bild`) bzw. solange keins da ist `imageButton` „Bild erzeugen" (testid `generate-ereignisbild`), der `onGenerateEreignisbild(index)` auslöst. Wiring analog `buildKarteOpts`/`onGenerateMap` in [js/images/controls.js](../js/images/controls.js): ein `buildHistorieOpts(state)` mit je-Eintrag `{ key, url, busy }` und reiner Text-zu-Bild-Erzeugung (`generateImage(prompt + visualStyle)`, kein `inputImage`), Key `makeKey(['ereignis', h.jahre, h.bild.prompt])`.

**Akzeptanz Teil 2:** „Gegenwart" nur einmal (jüngster Eintrag); „Kapitel I" nur als ein Gruppenkopf; keine doppelte Abfolge-Erzählung mehr; jede Jahreszeit-Karte trägt Bild/Erzeugen-Knopf. Frontend-Vertrag und übrige Reiter grün.

## Randnotiz
Im Kopf von [js/render/history.js](../js/render/history.js) wirkt ein Kommentarblock doppelt/verschachtelt (ca. Z. 14–20) — beim Anfassen gern glätten.

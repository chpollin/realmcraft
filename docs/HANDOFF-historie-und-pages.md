# Übergabe an den Entwickler-Claude: Historie-Reiter, Ereignis-Bilder, Pages

Stand: Herbst Jahr 2 der Partie „Die Gestrandeten". Geschrieben vom Spielleiter (Claude 0). Alles, was du wissen musst, um (1) den Historie-Reiter zu verbessern, (2) Ereignis-Bilder je Chronik-Eintrag zu bauen, (3) alle Beispielstände mit Bildern auf GitHub Pages zu zeigen. Die ausführliche Feature-Spec liegt zusätzlich in [feature-chronik-bilder.md](feature-chronik-bilder.md); dieses Dokument ist der Gesamtüberblick.

## 0. Lane / Eigentum (wichtig, sonst überschreiben wir uns)

Aus [KOORDINATION.md](KOORDINATION.md):
- **Claude 0 (Spielleiter):** `savegame.json`, `examples/*`, `knowledge/*`. Schreibt Inhalt und Bild-**Prompts**, nicht die Anzeige.
- **Claude 1 (Entwickler/Koordinator):** `js/app.js`, `index.html`, `css/style.css`, `schema/`, Repo-Hygiene, `README.md`, **Pages/Deploy**.
- **Claude 2 (Entwickler/Code):** `js/render/history.js`, `js/format.js`.
- **Geteilt:** `docs/Frontend-Contract.md` (vor dem Schreiben neu lesen, nur eigenen Abschnitt).

Der Historie-Umbau berührt **`js/render/history.js` (Claude 2)** und **`js/app.js` + `schema/` (Claude 1)** — also bitte abstimmen, wer welche Datei nimmt. Inhalt/Prompts in `savegame.json`/`examples/` nicht umschreiben.

## 1. Was der Spielleiter schon geliefert hat (Daten sind bereit)

In `savegame.json` **und** `examples/die-gestrandeten.json`:

- `historie[]` ist auf **8 Einträge umgebaut, einen pro Jahreszeit** (vorher 3 grobe Blöcke):
  `vor Jahr 1`, `Jahr 1, Fruehling`, `… Sommer`, `… Herbst`, `… Winter`, `Jahr 2, Fruehling`, `… Sommer`, `… Herbst`.
- **Jeder** Eintrag hat ein optionales Feld:
  ```jsonc
  "bild": { "anlass": "Der Scheiterhaufen des Stillen", "bildCacheKey": "", "prompt": "<englischer Bild-Prompt, Ereignis>" }
  ```
- Reihenfolge = Zeitachse, **letzter Eintrag = Gegenwart**.
- Der Bild-Prompt beschreibt das Ereignis; den Stil liefert `meta.visualStyle` (Tuschelavierung/Kohle, Chronisten-Tagebuch). Beim Erzeugen `visualStyle` voranstellen, wie es `karte`/`siedlung` tun.

Außerdem neu im Stand (nur zur Kenntnis, kein To-do): Karten-Stand `herbst-j2` (img2img aus `fruehling-j2`), erneuerte Graulandung-/Lebenswelt-Prompts, Yssa „gezeichnet".

## 2. Drei Redundanzen im Historie-Reiter (vom Nutzer gemeldet)

URL `#/historie`. Die rechte Timeline zeigt:

1. **„Gegenwart" auf JEDEM Eintrag.** Ursache in [../js/render/history.js](../js/render/history.js) ~Z. 109: `const cur = h.kapitel === kapitelJetzt;` — da alle Einträge Kapitel 1 sind, ist jeder „Gegenwart".
   **Fix:** nur der letzte Eintrag ist Gegenwart:
   ```js
   const letzteIdx = kapitelListe.length - 1;
   kapitelListe.map((h, i) => { const cur = i === letzteIdx; /* … */ })
   ```
2. **„Kapitel I" pro Eintrag wiederholt** (Roman-Node + `etitle: "Kapitel I"`).
   **Fix:** Einträge nach Kapitel gruppieren (es gibt schon `gruppiereNachKapitel`), „Kapitel I" **einmal** als Gruppenkopf (Klasse wie `chronik-kapitel-titel`); je Eintrag nur noch `h.jahre` als Titel.
3. **Doppelte Erzählung:** die obere Timeline (`historie[]`) UND die untere Sektion „Verlauf dieser Partie" (`buildVerlauf` aus Snapshots) erzählen dasselbe.
   **Fix:** „Verlauf dieser Partie" entfernen — den `flow`-Block und den `buildVerlauf(...)`-Aufruf in `renderHistorie` streichen. Die Timeline trägt jetzt pro Jahreszeit Text **und** Bild und ersetzt ihn. `verdichteZuege`/`gruppiereNachKapitel`/`firstSentence` nur entfernen, wenn nirgends sonst genutzt.

Randnotiz: Der Kommentarblock im Kopf von `history.js` (~Z. 14–20) wirkt doppelt/verschachtelt — beim Anfassen gern glätten.

## 3. Ereignis-Bild je Eintrag

Reines **Text-zu-Bild** (kein img2img). Muster: `onGenerateSiedlung` / `buildSiedlungPrompt` in `app.js`, Frame wie `map.js`.

### 3a. In `js/render/history.js` (Claude 2)
Unter `esum` jeder `epoch`-Karte:
```js
h.bild ? el('div', { class: 'epoch-bild' }, [
  el('img', { class: 'epoch-img', 'data-testid': 'ereignis-bild',
              'data-jahre': h.jahre, alt: h.bild.anlass || '' }),
  el('div', { class: 'epoch-bild-cap' }, [
    h.bild.anlass ? el('span', { text: h.bild.anlass }) : null,
    el('button', { class: 'btn btn-ghost gen-ereignis', type: 'button',
      'data-testid': 'generate-ereignisbild', dataset: { jahre: h.jahre },
      text: 'Bild erzeugen',
      onClick: () => opts.onGenerateEreignisbild?.(i) }),   // i = Index in historie[]
  ]),
]) : null
```
`renderHistorie(root, state, opts)` nutzt `opts` bereits (für `chronik`). `opts.onGenerateEreignisbild` einfach durchreichen.

### 3b. In `js/app.js` (Claude 1)
**Wichtig — heutiger Bug:** `renderHistorie` wird als einziger Reiter **ohne** `handlers` gerufen (Z. 192):
```js
renderHistorie(els.views.historie, state, { chronik: store.all() });
```
Ändern zu:
```js
renderHistorie(els.views.historie, state, { ...handlers, chronik: store.all() });
```
und `onGenerateEreignisbild` ins `handlers`-Objekt (Z. 69) aufnehmen.

Funktionen analog zu den vorhandenen (`generateInto`, `makeKey`, `cacheGet`, `portraitModel()` existieren schon):
```js
function buildEreignisPrompt(entry, state) {
  return [state.meta?.visualStyle || '', entry.bild?.prompt || '']
    .map(s => s.trim()).filter(Boolean).join('. ');
}
function ereignisKey(entry, state) {
  return entry.bild?.bildCacheKey
    || makeKey(['ereignis', entry.jahre, buildEreignisPrompt(entry, state), portraitModel()]);
}
function ereignisImg(jahre) {
  return document.querySelector(`[data-testid="ereignis-bild"][data-jahre="${CSS.escape(jahre)}"]`);
}
async function onGenerateEreignisbild(index) {
  const state = getState();
  const entry = (state?.historie || [])[index];
  if (!entry?.bild) return;
  await generateInto({
    img: ereignisImg(entry.jahre),
    key: ereignisKey(entry, state),
    model: portraitModel(),
    prompt: buildEreignisPrompt(entry, state),
    aspectRatio: '16:9',
  });
}
```
`hydrateImages` um einen Historie-Zweig erweitern (wie der Siedlungs-Zweig, ohne `applyAktiveBild`):
```js
for (const [i, h] of (state.historie || []).entries()) {
  if (!h.bild) continue;
  const img = ereignisImg(h.jahre);
  if (!img || img.getAttribute('src')) continue;
  const cached = await cacheGet(ereignisKey(h, state));
  if (cached) img.src = cached;
}
```
Optional: in `onExport` die Ereignis-Bilder einbetten (wie Siedlungen) — `h.bild.dataUrl = cached`, damit ein exportierter Stand die Chronik-Bilder mitträgt. Das ist die Voraussetzung für „alle Bilder auf Pages" (siehe §5).

## 4. Schema, Vertrag, Tests, CSS

- **`schema/savegame.schema.json`** (Claude 1): `historie`-Eintrag um optionales `bild` (`anlass`, `prompt`, `bildCacheKey`, alle string), **nicht** in `required`. Ein Eintrag mit nur `kapitel`/`jahre`/`zusammenfassung` muss gültig bleiben.
- **`docs/Frontend-Contract.md`** (geteilt): Abschnitt Historie um testids `ereignis-bild`, `generate-ereignisbild` erweitern; notieren: „Gegenwart" nur auf jüngstem Eintrag, „Kapitel" als ein Gruppenkopf, „Verlauf dieser Partie" entfällt, `historie[].bild` optional (Text-zu-Bild aus `bild.prompt` + `meta.visualStyle`).
- **Tests**: Historie-Test anpassen — kein doppeltes „Gegenwart"/„Kapitel"; `history-entry` × Anzahl Jahreszeiten; Eintrag mit `bild` zeigt Knopf. Bild-Erzeugung in Tests **nicht** real aufrufen (kein Key). Visual-Baselines des Historie-Reiters neu erzeugen.
- **CSS** (Claude 1): `.epoch-bild` / `.epoch-img` schlicht, an `.map-image` / `.siedlung-bild` anlehnen (kleines gerahmtes Bild im Eintrag).

**Abnahme:** „Gegenwart" genau einmal; ein „Kapitel I"-Kopf; keine doppelte Abfolge; jede Jahreszeit-Karte trägt Bild bzw. Erzeugen-Knopf; Stand ohne `bild` rendert fehlerfrei; übrige Reiter + Tests grün; Live-Reload zeigt neue Einträge sofort.

## 5. Alle Beispielstände mit Bildern auf GitHub Pages

Ziel des Nutzers: die veröffentlichte Seite zeigt die Partien **mit allen Bildern**.

**Wie Bilder in den Stand kommen:** Bilder werden im Browser per Gemini erzeugt (`generateImage`, Key aus Einstellungen oder `.env`), im IndexedDB-Cache abgelegt und beim **Export** (`onExport`) als `dataUrl` in den Stand eingebettet. Es gibt keinen Terminal-Weg, Bilder zu erzeugen.

**Reihenfolge, die funktioniert:**
1. Diese Feature-Arbeit (§2–§4) mergen, damit der Chronik-Bild-Knopf existiert.
2. Der Nutzer öffnet jeden Stand im Dashboard, erzeugt die fehlenden Bilder (Porträts, Mächte, Gruppen, Armee/Verbände, Karte je Stand, Siedlung, **und die 8 Ereignisbilder im Historie-Reiter**), klickt **Export**, legt die Datei über `examples/<name>.json`.
3. Pages einrichten/deployen (Claude 1 + GitHub-Zugang des Nutzers).

**Status der Beispielstände heute:**
- `examples/die-gestrandeten.json` — **Herbst J2**, lädt, **22 Bilder schon eingebettet** (6 Porträts, 4 Mächte, Gruppen, Armee+Verbände, Karte, Siedlung). Es fehlen: die Karten-Stände `fruehling-j2`/`herbst-j2` und die **8 Ereignisbilder** (erst nach §3 erzeugbar). Datei ist groß (~28 MB durch base64) — **Hinweis:** evtl. später Bilder als separate Dateien auslagern statt base64 im JSON, falls Pages/Repo-Größe stört.
- `examples/die-karren-kapitel-3.json`, `…-kapitel-4.json`, `die-ordnenden-kapitel-1.json` — laden alle korrekt (Umlaute `jahreszeit`/`weltereignis` ok), eigene/abgeschlossene Partien, kein `lebenswelt`/wenige Setzungen (älteres Format). Wenn sie auf Pages „vorzeigbar" sein sollen, brauchen auch sie erzeugte Bilder + Export.

**Default-Sample:** `app.js` lädt auf Pages automatisch `examples/die-gestrandeten.json` (Funktion `loadDefaultSample`), wenn kein Live-Server und kein gespeicherter Stand. Für „mehrere Stände herzeigen" wäre ein kleiner **Stand-Wähler** im Leerzustand schön (Dropdown über die `examples/*.json`) — optionales Extra, Claude 1.

## 6. Parser-Fallen (gilt für alle Stände, nicht brechen)

`js/parse.js` validiert clientseitig still:
- `meta.zeit.jahreszeit` MUSS Umlautform sein: `Frühling|Sommer|Herbst|Winter`.
- `meta.weltereignis` MUSS `offen` oder `gewürfelt` (mit ü) sein.
Bei Verstoß rendert das Frontend **nichts** (stiller Fehlschlag). Diese Felder also nie „entumlauten". Freitext sonst ASCII (ue/ae/oe), wie im Bestand.

## 7. Aktueller Commit-Stand

- Branch `main`, **1 Commit ahead von origin, noch nicht gepusht**: „Gestrandeten: Gedaechtnis und Beispielstand auf Herbst Jahr 2" — nur Inhalt (examples + knowledge + diese Specs).
- Uncommitted im Working Tree: `js/app.js`, `js/render/history.js` (euer Revier), `.claude/settings.json`.
- Pushen/mergen nach `main` (→ Pages) macht der Nutzer / Claude 1 bewusst, nicht der Spielleiter.

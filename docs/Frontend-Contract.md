# Frontend-Vertrag (RealmCraft)

Verbindliche Schnittstelle zwischen Tests und Implementierung. Tests werden gegen diesen Vertrag geschrieben (zuerst, rot), die Module erfüllen ihn (grün). Alle Pfade relativ zum Repo-Root. Vanilla ES Modules, kein Build. `index.html` lädt `<script type="module" src="js/app.js">`.

## Architektur und Datei-Eigentum
- `index.html` (Eigentum: scaffold) — vollständiges DOM nach diesem Vertrag, lädt alle Module, leere View-Container.
- `css/style.css` (scaffold): Styling token-basiert aus `design/design-tokens.css` (Theme "Anthrazit", Schwarz/Blau, Orange-nach-Rot-Signatur `--flame`).
- `js/app.js` (core) — Bootstrap, Hash-Routing, Datei-Upload (Klick/Drag-Drop/Paste), Settings-Dialog, ruft Render-Funktionen.
- `js/parse.js` (core) — Speicherstand laden und prüfen.
- `js/state.js` (core) — In-Memory-Stand.
- `js/render/{overview,advisors,actors,map,history}.js` (render) — je eine View.
- `js/images/{gemini,cache}.js` (images) — Bild-API und Cache.
- `js/components/ui.js` (components) — DOM-Helfer.

Implementierer ändern `index.html` NICHT (nur scaffold). Module kommunizieren ausschließlich über die hier definierten Exporte.

## Modul-APIs (exakt)

### js/parse.js
- `export function extractJsonBlock(text): string | null` — Inhalt des ersten ```json-Codeblocks, sonst null.
- `export function parseSavegame(text): { ok: boolean, data?: object, error?: string }` — akzeptiert Hybrid-Markdown (mit ```json-Block) oder reines JSON; extrahiert, parst, führt `validateSavegame` aus; bei Fehler `ok:false` und lesbare `error`.
- `export function validateSavegame(data): { valid: boolean, errors: string[] }` — leichte strukturelle Prüfung: `schemaVersion` Zahl; `meta.kapitel` Zahl, `meta.zeit.jahreszeit` aus [Frühling,Sommer,Herbst,Winter], `meta.zeit.jahr` Zahl; `volk.name` String; `grundgroessen.{nahrung,material,wissen}` Zahlen; `lagewerte.{verteidigung,mobilitaet,wohlstand}` Zahlen; `berater` Array, jedes mit `id,name,loyalitaet(-5..5)`; `maechte` Array.

### js/state.js
- `export function setState(data): void`
- `export function getState(): object | null`
- `export function subscribe(fn): () => void` — fn wird bei jedem setState mit dem neuen State gerufen; Rückgabe entfernt das Abo.

### js/diff.js
- `export function diffStates(prev, next): { hasChanges, isFirst, eintraege }` — rein, ohne Seiteneffekt. `isFirst:true`, wenn kein Vorgänger existiert (kein Delta). `eintraege[]` mit `{ art, label, from?, to?, delta?, richtung }`; erkannt werden Kapitelwechsel, Grundgrößen, Lagewerte, Ansehen, Loyalität, neue/weggefallene Berater und Orte, neue Setzungen.

### js/store.js
Lokaler Verlauf über localStorage (Schlüssel `rc.history`), trägt Auto-Restore und Kapitel-Historie.
- `export function saveSnapshot(state): number` — hängt an; identischer Stand erzeugt kein Duplikat; gibt den Index zurück.
- `export function loadLast(): object | null`
- `export function list(): Array<{ index, spielname, kapitel, jahreszeit, jahr, savedAt }>`
- `export function getAt(index): object | null`
- `export function all(): object[]` — alle gespeicherten Stände in chronologischer Reihenfolge (für den erzählten Verlauf der Historie-Sicht).
- `export function clear(): void`

### js/render/*.js (jeweils reine Render-Funktion, leert root und baut neu)
- `overview.js`  → `export function renderLage(root, state, opts): void` (opts optional `{ delta }` fürs Delta-Banner)
- `advisors.js`  → `export function renderBerater(root, state, handlers): void` (handlers `{ onGeneratePortrait(beraterId) }`)
- `actors.js`    → `export function renderWelt(root, state): void`
- `map.js`       → `export function renderKarte(root, state, handlers): void` (handlers `{ onGenerateMap() }`)
- `history.js`   → `export function renderHistorie(root, state, opts): void` (opts optional `{ chronik }` für den erzählten Verlauf)

### js/images/gemini.js
- `export const MODELS = { portrait: 'gemini-3.1-flash-image', map: 'gemini-3.1-flash-image' }` — die Karte läuft standardmäßig auf dem Flash-Bildmodell (Nano Banana 2), weil `gemini-3-pro-image` im Gemini-Free-Tier ein Kontingent von 0 hat; Pro bleibt in den Einstellungen wählbar (mit Billing).
- `export function endpoint(model): string` → `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
- `export async function generateImage({ apiKey, model, prompt, refImages = [], aspectRatio }): Promise<{ dataUrl: string, mimeType: string }>`
  - POST via `fetch(endpoint(model), { method:'POST', headers:{ 'x-goog-api-key': apiKey, 'Content-Type':'application/json' }, body })`.
  - body: `{ contents:[{ parts:[{ text: prompt }, ...refImages.map(d=>({inlineData:{mimeType:'image/png',data:d}}))] }], generationConfig:{ responseModalities:['IMAGE'] , ...(aspectRatio?{imageConfig:{aspectRatio}}:{}) } }`.
  - Antwort: erstes `candidates[0].content.parts[].inlineData` → `dataUrl = 'data:'+mimeType+';base64,'+data`.
  - Fehlt der Key oder schlägt der Call fehl: `throw new Error(...)` mit lesbarer Meldung.

### js/images/cache.js
- `export function makeKey(parts): string` — stabiler Hash (z.B. FNV/sha-lite) aus den zusammengefügten Teilen.
- `export async function cacheGet(key): Promise<string | null>` — dataUrl oder null (IndexedDB `realmcraft`, Store `images`).
- `export async function cachePut(key, dataUrl): Promise<void>`

### js/components/ui.js
- `export function el(tag, attrs = {}, children = []): HTMLElement` — kleiner Hyperscript-Helfer (attrs inkl. `dataset`, `class`, `text`, Event `on*`).
- `export function gauge(value, min, max): HTMLElement` — Balken mit Nullpunkt für Lagewerte (Skala -2..+3).
- `export function loyaltyMeter(value): HTMLElement`: Schiene -5..+5, Farbe rot, neutral, grün.
- `export function statCard({ label, value, sub }): HTMLElement`
- `export function modal({ title, body, actions }): HTMLElement`
- `export function toast(message): void`

## DOM-Vertrag (index.html, data-testid)
- Topbar: `[data-testid="topbar"]`, Titel "RealmCraft", `<button data-testid="load-btn">`, `<input type="file" data-testid="load-input" hidden>`, `<select data-testid="history-select" hidden>` (Kapitel-Historie, sichtbar ab zwei gespeicherten Ständen; Auswahl lädt den Stand), `<button data-testid="settings-btn">`.
- Nav: 5 Buttons `[data-tab="lage|berater|welt|karte|historie"]`; aktiver trägt `aria-current="page"`.
- Views: `<section data-view="lage">` … `historie`; inaktive haben das Attribut `hidden`.
- Routing: Hash `#/lage` … `#/historie`; ohne/unbekannt → `#/lage`. Tab-Klick setzt den Hash, `hashchange` schaltet die View.
- Leerzustand (kein Stand geladen): `[data-testid="empty-state"]` sichtbar, Views leer.

### Lage (`data-view="lage"`)
- `[data-testid="realm-name"]` (Text "Die Karren"), `[data-testid="chapter"]`, `[data-testid="season"]`, `[data-testid="worldevent"]`, `[data-testid="ansehen"]`.
- Delta-Banner (nur nach echtem Laden mit Änderungen, nicht bei Erst-Laden/Auto-Restore): `[data-testid="delta-banner"]` mit `[data-testid="delta-item"]` je Änderung. Die Einträge sind nach Bereichen gruppiert (Grundgrößen, Lagewerte, Rat, Welt & Stand), tragen ein Bereichs-Icon und das Delta als richtungsgefärbte Marke. Das Banner wird beim nächsten Laden neu aufgebaut; es gibt keinen Schließen-Knopf mehr.
- Trends (optional, je Grundgröße aus `trends`): `[data-testid="trend-<key>"]` (z.B. `trend-nahrung`), Text ▲/▼/→, `title` = Grund. Fehlt `trends`, fehlt das Element.
- Aktionsbrett (optional, aus `runde`): `[data-testid="aktionsbrett"]` mit `[data-testid="aktion-budget"]` (Text "Haupt u/m · Neben u/m") und je Aktion `[data-testid="aktion"]` mit `[data-testid="aktion-titel"]`; nach dem Wurf `[data-testid="aktion-ergebnis"]`. Fehlt `runde`/leere `aktionen`, fehlt das Brett.
- Stat-Werte als Text: `[data-testid="stat-nahrung"]`=8, `stat-material`=5, `stat-wissen`=16, `stat-bevoelkerung` (enthält 300).
- Lagewerte: `[data-testid="lage-verteidigung"]` (enthält "+3"), `lage-mobilitaet` ("0"), `lage-wohlstand` ("+1").
- `[data-testid="offene-faeden"]` Liste mit ≥1 Eintrag.

### Berater (`data-view="berater"`)
- `[data-testid="advisor-list"]` enthält genau `state.berater.length` × `[data-testid="advisor-card"]`.
- Pro Card: `[data-testid="advisor-name"]`, `[data-testid="advisor-role"]`, `[data-testid="advisor-goal"]`, `[data-testid="advisor-loyalty"]` (zeigt Zahl/Marke), `[data-testid="advisor-portrait"]` (ein `<img>`), `[data-testid="generate-portrait"]` (Button). Die Card trägt `data-id` = berater.id.
- Optional `[data-testid="advisor-lebensstand"]` (aus `berater.lebensstand`: Rüstig, Lebensabend, Hinfällig), nur wenn gesetzt.

### Armee (`data-view="armee"`)
- Kopf `[data-testid="armee-kopf"]` mit `[data-testid="armee-gesamt"]` (Kampffähig-Zahl), optionaler Moral-Zeile, optionalem Heerschau-Bild `[data-testid="armee-bild"]` (`<img>`) und `[data-testid="generate-armee-bild"]` (Button → `onGenerateArmeeBild()`).
- Verbände-Panel `[data-testid="armee-verbaende"]` mit Karten `[data-testid="verband"]` (dataset.id). Je Karte: `[data-testid="verband-name"]`, `[data-testid="verband-staerke"]`, optional Typ, Führung (`fuehrungId`→Berater), Verfassung, Ausrüstung, Hinweis, ein Avatar `[data-testid="verband-avatar"]` (`<img>`) und `[data-testid="generate-verband"]` (Button → `onGenerateVerband(verbandId)`).
- Optional `[data-testid="armee-verluste"]` (Verluste-Logbuch) und ein Panel mit stehenden Modifikatoren.
- `armee` ist optional: ohne das Feld rendert die View leer (Kampffähig 0), ohne Fehler. Bildstil aus `meta.armeeStyle` (Rückfall `meta.visualStyle`).

### Welt (`data-view="welt"`)
- Optional `[data-testid="beziehungen-ansehen"]` (erzählender Lagesatz aus `state.beziehungenAnsehen.text`), nur wenn gesetzt.
- `[data-testid="power-card"]` × `state.maechte.length`, je mit `[data-testid="power-name"]`, `power-relation`, `power-stance`, einem Bild `[data-testid="power-bild"]` (`<img>`) und `[data-testid="generate-macht"]` (Button → `onGenerateMacht(machtId)`). Optionales Cache-Feld `maechte[].bild`.
- `[data-testid="group-row"]` × `state.gruppen.length`, je mit Gruppenname und Sprechername (aus `berater`/`personen` via `sprecherId`), einem Bild `[data-testid="gruppe-bild"]` (`<img>`) und `[data-testid="generate-gruppe"]` (Button → `onGenerateGruppe(gruppeId)`). Optionales Cache-Feld `gruppen[].bild`. Bildstil aus `meta.armeeStyle` (Rückfall `meta.visualStyle`).

### Karte (`data-view="karte"`)
- `[data-testid="map-image"]` (`<img>`, anfangs Platzhalter/leer), `[data-testid="generate-map"]` (Button), `[data-testid="map-legend"]` mit `[data-testid="map-place"]` × `state.karte.orte.length`.
- Karten-Chronik (optional, nur wenn `state.karte.chronik` vorhanden): `[data-testid="chronik-panel"]` mit `[data-testid="karte-chronik"]` als Zeitleiste; je Stand ein Knopf `[data-testid="karte-stand"]` (Zeit + Anlass), der aktive `[data-testid="karte-stand-aktiv"]`. Klick → `handlers.onSelectKarteStand(id)` (wechselt das gezeigte Bild). Der Erzeugen-Knopf nutzt dann `handlers.onGenerateKarteStand(aktiverStand.id)`; trägt der Stand `basiertAuf`, wird das Bild des Vorgängers als `refImages` mitgegeben (Bild-zu-Bild), Label „Aus der vorigen weiterentwickeln". Schlüssel je Stand: `makeKey(['map', entry.id, entry.prompt, mapStyle, model])`. Handlers zusätzlich: `onSelectKarteStand(id)`, `onGenerateKarteStand(id)`, `getKarteStandId()`. Ohne `chronik` Verhalten wie bisher.

### Historie (`data-view="historie"`)
- `[data-testid="history-entry"]` × `state.historie.length` (chronologisch), `[data-testid="faehigkeit"]` × n, `[data-testid="besitz"]` × n.
- Erzählter Verlauf (optional, nur ab zwei gespeicherten Ständen aus `opts.chronik`): `[data-testid="chronik-flow"]` mit `[data-testid="chronik-entry"]` je verdichtetem Zug. Pro Zug eine knappe Lage (`.chronik-text`, erster Satz des Statustexts, gegen den Vorgänger entdupliziert), die abgeschlossenen Vorhaben (`.chronik-acts`) und bei Weltereignis (`meta.weltereignis === "gewürfelt"`) `.chronik-event`. Inhaltsleere Stände entfallen, und aufeinanderfolgende Stände mit identischer Signatur (Zeit, Lage, Weltereignis, Vorhaben) fallen zu einem Eintrag zusammen — mehrfaches Speichern desselben Zuges erscheint also nur einmal.

### Settings
- `[data-testid="settings-dialog"]` (per `settings-btn` geöffnet), `[data-testid="api-key-input"]`, `[data-testid="model-portrait"]`, `[data-testid="model-map"]`, `[data-testid="save-settings"]`.

## Bildgenerierung im UI
- Portrait-Klick: `generateImage({ apiKey, model: MODELS.portrait, prompt })`, prompt = `meta.visualStyle + ' Portrait von ' + name + ', ' + rolle + '. ' + erscheinung`. Ergebnis cachen (`makeKey([berater.id, erscheinung, visualStyle, model])`) und in `[data-testid="advisor-portrait"]` als `img.src` setzen. Nach Erfolg beginnt `src` mit `data:image/png;base64,`.
- Karte-Klick: `MODELS.map`, prompt = `state.karte.prompt`, aspectRatio `'16:9'`; in `[data-testid="map-image"]` setzen, cachen via `makeKey([ 'map', karte.prompt, mapStyle, model ])`.
- API-Key aus `localStorage['realmcraft.apiKey']`; ohne Key zeigt der Klick einen `toast` mit Hinweis und öffnet Settings.

## Live-Modus (Terminal-Spielleiter)
- `serve.mjs` serviert `savegame.json` aus dem Repo-Root (Standard-Static-Handler) und bietet `/events` als Server-Sent-Events. Es beobachtet das Repo-Verzeichnis; ändert sich `savegame.json`, sendet es `event: savegame`.
- `app.js` (`wireLive`) lädt beim Start `savegame.json` per `fetch` und abonniert `/events` nur dann, wenn die Datei existiert (HTTP 200). Fehlt sie (404), passiert nichts; der Leerzustand bleibt und die Tests sind unberührt. Bei `file://`/Pages (kein http) ist der Live-Modus aus.
- Jede SSE-Meldung lädt `savegame.json` neu über denselben Pfad wie ein Datei-Upload (Delta-Banner, Verlauf, Render). So spiegelt der Browser, was Claude Code im Terminal schreibt.

## Test-Hooks
- Persistenz/localStorage-Keys: `realmcraft.apiKey`, `realmcraft.model.portrait`, `realmcraft.model.map`, `rc.history` (Verlauf für Auto-Restore und Kapitel-Historie).
- Bild-API in E2E gemockt per Playwright `route('**/generativelanguage.googleapis.com/**')` → JSON mit `candidates[0].content.parts[0].inlineData{mimeType:'image/png', data:<1x1-PNG-base64>}`.
- Export-Bundle: `[data-testid="export-btn"]` erzeugt einen Download eines JSON-Stands mit eingebetteten `portrait.dataUrl`; Import erkennt `dataUrl` und füllt den Cache (kein API-Call). E2E prüft den Roundtrip über das Cache-Verhalten.

---

## Sicht „Lebenswelt" (`data-view=lebenswelt`)

Die Sicht rendert `js/render/lebenswelt.js`. Reihenfolge der Blöcke: Der Ort, Was hier steht (Gebäude), Wie sie leben. Liest `state.lebenswelt` (optional) und spiegelt die Bevölkerungszahl aus `state.grundgroessen.bevoelkerung`. Ist nichts erfasst, zeigt sie nur `lebenswelt-leer` mit einem Hinweis.

### Der Ort

- `lw-ort` — Panel des Startorts.
- `ort-name` — Name des Ortes (`lebenswelt.ort.name`), Typ als Eyebrow.
- `ort-bild` — `<img>` des Ortes (16:9), Rahmen `.ort-bild-frame` (nur sichtbar mit Bild). Knopf `generate-ort` erzeugt es über `handlers.onGenerateOrt`.
- `ort.eigenschaften` werden als kennwert-Chips (`.ort-eig`, signiert) gezeigt.

### Gebäude

- `lw-gebaeude` — Panel, nur wenn `lebenswelt.gebaeude` Einträge hat.
- `gebaeude` — eine Karte je Anlage: Name, Zustand-Chip, optionaler Hinweis.

### Wie sie leben

- `lw-leben` — Panel mit Bevölkerung (gespiegelt aus `grundgroessen.bevoelkerung`), Stimmung, Nahrung, Trinken, Glaube, Alltag und Bräuchen. Nur befüllte Zeilen erscheinen.

### app.js / Bild-Pipeline

- `handlers.onGenerateOrt` erzeugt das Ortsbild über `generateInto` (16:9, `portraitModel`), Cache-Schlüssel `ortKey(state)` über `buildOrtPrompt(state)`.
- `hydrateImages` lädt das Ortsbild aus `lebenswelt.ort.bild.dataUrl` oder dem Cache; `onExport` bettet es ins Bundle ein.

# Frontend-Vertrag (RealmCraft)

Tests und Implementierung binden an die hier festgelegten testids, gelesenen Felder, Handler und Modulsignaturen. Alle Pfade sind relativ zum Repo-Root. Das Dashboard besteht aus Vanilla ES Modules ohne Build-Schritt. `index.html` lädt `<script src="env.js">` und `<script type="module" src="js/app.js">`.

## Architektur

Alle Design-Tokens stehen im `:root` von `css/style.css`, der einzigen Token-Quelle. Die Schriften Inter und Space Grotesk liegen lokal unter `fonts/` (OFL). Render- und UI-Module erzeugen nur DOM mit Klassennamen und injizieren keine Styles.

| Datei | Aufgabe |
|---|---|
| `index.html` | statisches Gerüst mit Topbar, Navigation, leeren View-Containern und Settings-Dialog |
| `js/app.js` | Bootstrap, Hash-Routing, Laden (Upload, Drag-and-Drop, Einfügen), Settings, Bildfluss, Hydration, Wiederherstellen der Bild-Chronik |
| `js/parse.js` | Speicherstand lesen und strukturell prüfen |
| `js/state.js` | In-Memory-Stand mit Abonnement |
| `js/diff.js` | Delta zwischen zwei Ständen |
| `js/store.js` | lokaler Verlauf in localStorage, Partie-Identität |
| `js/live.js` | Live-Modus gegen `serve.mjs` |
| `js/demo.js` | Demo-Picker und Standard-Demo |
| `js/export.js` | Export-Bundle mit eingebetteten Bildern |
| `js/format.js` | interne Formatierhelfer (`roman`, `initials`, `signed`, `signedZeroPlus`) |
| `js/components/ui.js` | DOM-Helfer und kleine Bausteine |
| `js/render/*.js` | Kopfleiste und je Sicht eine Render-Funktion |
| `js/images/prompts.js` | DOM-freie Prompt-Builder und Cache-Schlüssel |
| `js/images/registry.js` | Tabelle der Bildtypen |
| `js/images/versions.js` | Versionslisten für „Bild fortschreiben" |
| `js/images/gemini.js` | Bild-API-Client |
| `js/images/cache.js` | Schlüssel-Hash und Bild-Cache |

Module kommunizieren über die unten festgelegten Exporte. `prompts.js`, `registry.js` und `gemini.js` nutzen auch die Generator-Werkzeuge unter `tools/`, damit ein Klick im Dashboard und ein Werkzeuglauf für denselben Stand denselben Prompt und Schlüssel erzeugen.

## Modul-APIs

### js/parse.js

- `extractJsonBlock(text): string | null` liefert den Inhalt des ersten ```json-Codeblocks, sonst null. Nach der Sprachkennung verlangt es einen Zeilenumbruch, damit ein in Prosa erwähntes ```json nicht als Fence gilt.
- `parseSavegame(text): { ok, data?, error? }` akzeptiert Hybrid-Markdown mit ```json-Block oder reines JSON, parst und ruft `validateSavegame`. Bei Fehler gilt `ok:false` mit lesbarer `error`.
- `validateSavegame(data): { valid, errors[] }` prüft leicht strukturell `schemaVersion` (Zahl), `meta.kapitel` (Zahl), `meta.zeit.jahreszeit` (Frühling, Sommer, Herbst oder Winter), `meta.zeit.jahr` (Zahl), `volk.name` (String), `grundgroessen.{nahrung,material,wissen}` (Zahlen), `lagewerte.{verteidigung,mobilitaet,wohlstand}` (Zahlen), `berater` als Array mit `id` und `name` als String und `loyalitaet` von -5 bis +5 sowie `maechte` als Array. Die strenge Prüfung liegt bei `schema/savegame.schema.json` in den Unit-Tests.

### js/state.js

- `setState(data): void`
- `getState(): object | null`
- `subscribe(fn): () => void` ruft `fn` bei jedem `setState` mit dem neuen Stand. Die Rückgabe beendet das Abo.

### js/diff.js

`diffStates(prev, next): { hasChanges, isFirst, eintraege, differentGame? }` ist rein und ohne Seiteneffekt. `isFirst` ist true, wenn kein Vorgänger existiert oder beide Stände einen verschiedenen `gameKey` tragen. Im zweiten Fall ist zusätzlich `differentGame: true` gesetzt, und es entsteht kein Delta. Jeder Eintrag hat die Form `{ art, label, key?, from?, to?, delta?, richtung }` mit `richtung` aus `up`, `down` und `flat`.

| `art` | Auslöser |
|---|---|
| `kapitel` | `meta.kapitel` geändert |
| `grundgroesse` | `nahrung`, `material`, `wissen` oder `bevoelkerung` geändert (Zahl oder `{ zahl }`) |
| `lagewert` | `verteidigung`, `mobilitaet` oder `wohlstand` geändert |
| `ansehen` | `status.ansehen.stufe` geändert |
| `loyalitaet` | Loyalität eines Beraters geändert, der in beiden Ständen steht |
| `berater-neu`, `berater-weg` | Berater-id kommt hinzu oder entfällt |
| `ort-neu`, `ort-weg` | Ort in `karte.orte` (nach id) kommt hinzu oder entfällt |
| `setzung-neu` | neuer Titel in `setzungen` |
| `macht-neu`, `macht-weg` | Macht (nach id) kommt hinzu oder entfällt |
| `beziehung` | `maechte[].beziehung.wert` geändert |
| `armee-stat` | `armee.gesamt` geändert |
| `armee-neu` | `armee.gesamt` erstmals gesetzt |
| `trend` | `trends[key].richtung` gewechselt |

### js/store.js

Der Verlauf liegt in localStorage unter `rc.history` und hält höchstens `MAX` Einträge.

- `gameKey(state): string | null` liefert die Partie-Identität, `meta.spielname` mit Rückfall auf `volk.name`. Delta, Verlaufsauswahl und Bildversionen sind nach ihr getrennt.
- `saveSnapshot(state): number` legt den Stand als neuen Eintrag ab und entfernt dabei jedes Feld `dataUrl` außer unter `referenz`, weil das Referenzfoto eines Beraters Prompt-Eingabe ist und in keinem Cache liegt. Ist der Stand inhaltlich gleich dem letzten Eintrag (Vergleich unabhängig von der Schlüsselreihenfolge), entsteht kein Duplikat und der bestehende Index kommt zurück. Bei erschöpftem Kontingent fallen die ältesten Einträge weg, bis der Rest passt. Die Rückgabe ist -1, wenn kein Stand übergeben wurde oder er nicht abgelegt werden konnte. `app.js` zeigt dann einen Fehler-Toast.
- `lastForParty(name): object | null` liefert den jüngsten Eintrag derselben Partie, die Basis des Delta-Banners.
- `loadLast(): object | null`
- `list(): Array<{ index, spielname, kapitel, jahreszeit, jahr, savedAt }>`
- `getAt(index): object | null`
- `all(): object[]` in chronologischer Reihenfolge
- `clear(): void`

### js/live.js

`wireLive({ apply, ohneLive }): Promise<void>` arbeitet nur unter `http:` oder `https:`. Es holt `savegame.json` ohne Cache und mit Timeout. Gelingt das, ruft es `apply(text)`, zeigt einen Hinweis-Toast und abonniert `/events`. Sonst wartet es auf `ohneLive()`.

### js/demo.js

`demoPicker({ select, loadInput, apply, hasState, beforeSwitch })` liefert `{ wire, loadDefault }`. `wire()` füllt `demo-select` aus `examples/demo/manifest.json`, `loadDefault()` lädt den Standard-Demo-Stand. Das Verhalten steht unter Demo-Stände.

### js/export.js

- `buildExportBundle(state, { partie, modelFor }): Promise<object>` baut das Export-Bundle (siehe Export und Import). `modelFor(role)` liefert das konfigurierte Modell, weil es in jeden Schlüssel eingeht.
- `downloadBundle(bundle): void` lädt das Bundle als `realmcraft-<spielname>.json` herunter, der Name in Kleinbuchstaben mit Bindestrichen.

### js/render/*.js

Jede Funktion leert `root` und baut neu. Ohne Stand bleibt `root` leer. `app.js` übergibt allen Sichten mit Bildern dasselbe `handlers`-Objekt.

| Modul | Signatur | genutzte Handler |
|---|---|---|
| `hero.js` | `renderHero(root, state)` | keine |
| `overview.js` | `renderLage(root, state, opts)` | `opts.delta` für das Delta-Banner |
| `lebenswelt.js` | `renderLebenswelt(root, state, handlers)` | `onGenerateSiedlung(id)` |
| `advisors.js` | `renderBerater(root, state, handlers)` | `onGeneratePortrait(beraterId)` |
| `armee.js` | `renderArmee(root, state, handlers)` | `onGenerateArmeeBild()`, `onGenerateVerband(verbandId)` |
| `actors.js` | `renderWelt(root, state, handlers)` | `onGenerateMacht(machtId)`, `onGenerateGruppe(gruppeId)` |
| `map.js` | `renderKarte(root, state, handlers)` | `onGenerateMap()`, `onGenerateKarteStand(id)`, `onSelectKarteStand(id)`, `getKarteStandId()` |
| `history.js` | `renderHistorie(root, state, handlers)` | `onGenerateEreignisbild(index)` |
| `recht.js` | `renderRecht(root, state)` | keine |

Die Bildleiste (`bildLeiste` aus `ui.js`) an jedem fortschreibbaren Bild nutzt zusätzlich `bildVersionen(typ, id)`, `aktiveBildVersion(typ, id)`, `onBildFortschreiben(typ, id)` und `onWaehleBildVersion(typ, id, value)`.

### js/images/prompts.js

Das Modul ist DOM-frei und enthält je Bildtyp einen Prompt-Builder (`buildPortraitPrompt`, `buildHeerschauPrompt`, `buildVerbandPrompt`, `buildMachtPrompt`, `buildGruppePrompt`, `buildSiedlungPrompt`, `buildEreignisPrompt`, `karteStandPrompt`) und eine Schlüsselfunktion (`portraitKey`, `armeeBildKey`, `verbandKey`, `machtKey`, `gruppeKey`, `siedlungKey`, `ereignisKey`, `mapKey`, `karteStandKey`). Dazu kommen `karteChronik(state)`, `aktiverKarteStand(state, selectedId)`, `siedlungenAus(state)`, `siedlungId(s)`, `identityOf(typ, id)`, `kontextHauch(state)`, `fortschreibenPrompt(basePrompt, state)`, `versionKey(identity, vnum, prompt, model)`, `bildVersLabel(state, vnum)` und `partieTag(partie)`.

Die Zusammensetzung der Prompts und Schlüssel lebt allein hier. Jeder Schlüssel hasht den vollständigen Prompt-Text und das Modell, sodass jede Byte-Änderung an einem Builder bereits erzeugte und bezahlte Bilder verwaist. `tests/unit/keys.test.js` pinnt Prompts und Schlüssel byte-genau und prüft, dass die Registry auf sie auflöst. Ein vom Spielleiter gesetzter `bildCacheKey` an einem Kartenstand oder an `historie[].bild` hat Vorrang vor dem berechneten Schlüssel.

### js/images/registry.js

`BILDTYPEN` hält je Bildtyp einen Eintrag mit `list(state)`, `id(entity)`, `embedded(e, state)`, `setEmbedded(e, url)`, `prompt(e, state)`, `key(e, state, model)`, `role` (`portrait` oder `map`, wählt das konfigurierte Modell), `aspect`, `versioned`, `img(id)` und `button(id)`. Erzeugen, Hydration, Versionen, Export und die Generator-Werkzeuge leiten sich aus dieser Tabelle ab. Weitere Exporte sind `findBild(state, typ, id)` und `fortschreibenButton(typ, id)`, der Selektor des Fortschreiben-Knopfs.

| Typ | Entitäten | Bild (testid) | Erzeugen-Knopf (testid) | Handler | eingebettetes Feld | Format | fortschreibbar |
|---|---|---|---|---|---|---|---|
| `berater` | `berater[]` | `advisor-portrait` in `advisor-card` | `generate-portrait` | `onGeneratePortrait(id)` | `portrait.dataUrl` | 4:3 | ja |
| `armee` | `armee` | `armee-bild` | `generate-armee-bild` | `onGenerateArmeeBild()` | `armee.bild.dataUrl` | 16:9 | ja |
| `verband` | `armee.verbaende[]` | `verband-avatar` in `verband` | `generate-verband` | `onGenerateVerband(id)` | `avatar.dataUrl` | 4:3 | ja |
| `macht` | `maechte[]` | `power-bild` in `power-card` | `generate-macht` | `onGenerateMacht(id)` | `bild.dataUrl` | 4:3 | ja |
| `gruppe` | `gruppen[]` | `gruppe-bild` in `group-row` | `generate-gruppe` | `onGenerateGruppe(id)` | `bild.dataUrl` | 4:3 | ja |
| `siedlung` | `lebenswelt.siedlungen[]`, Rückfall `siedlung` | `siedlung-bild` in `siedlung` | `generate-siedlung` | `onGenerateSiedlung(id)` | `bild.dataUrl` | 16:9 | ja |
| `ereignis` | `historie[]` mit `bild` | `ereignis-bild[data-jahre]` | `generate-ereignisbild[data-jahre]` | `onGenerateEreignisbild(index)` | `historie[].bild.dataUrl` | 16:9 | nein |
| `karte` | `karte` ohne `chronik` | `map-image` | `generate-map` | `onGenerateMap()` | `karte.dataUrl` | 16:9 | nein |
| `karte-stand` | `karte.chronik[]` | `map-image` | `generate-map` | `onGenerateKarteStand(id)` | `karte.chronik[].dataUrl`, für `aktuellerStand` Rückfall `karte.dataUrl` | 16:9 | nein |

`karte` und `karte-stand` laufen auf dem Kartenmodell, alle übrigen Typen auf dem Portraitmodell. Die Karten-id einer Siedlung ist `id`, ersatzweise `name`.

### js/images/versions.js

Die Versionslisten fortgeschriebener Bilder leben clientseitig in localStorage. Sie sind nach Partie getrennt unter `rc.imgver.<partieTag>` (Identität auf `[{ key, label, savedAt }]`) und `rc.imgakt.<partieTag>` (Identität auf den aktiven Cache-Schlüssel), wobei `partieTag` aus dem `gameKey` gebildet wird. Die Identität ist `armee` oder `<typ>:<id>`.

- `migrateLegacy(partie)` verschiebt die Listen aus der Zeit vor den Partie-Namensräumen (`rc.imgver`, `rc.imgakt`) einmalig zur ersten geladenen Partie.
- `versionsAll(partie)`, `verList(partie, identity)`, `verPush(partie, identity, entry)`
- `aktGet(partie, identity)`, `aktSet(partie, identity, key)`, wobei `key` null die aktive Version löscht.

Die Partie wird ausdrücklich übergeben, damit ein Aufruf, der einen Partiewechsel überdauert, in die Partie schreibt, in der er begann.

### js/images/gemini.js

- `MODELS = { portrait: 'gemini-3.1-flash-image', map: 'gemini-3.1-flash-image' }`. Die Karte läuft standardmäßig auf dem Flash-Bildmodell, weil `gemini-3-pro-image` im Gemini-Free-Tier ein Kontingent von 0 hat. Pro bleibt in den Einstellungen wählbar und braucht Billing.
- `endpoint(model)` liefert `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`.
- `generateImage({ apiKey, model, prompt, refImages = [], aspectRatio, timeoutMs = 60000 }): Promise<{ dataUrl, mimeType }>` sendet `POST` mit den Headern `x-goog-api-key` und `Content-Type: application/json`. Der Body ist `{ contents:[{ parts:[{ text: prompt }, ...inlineData je Referenzbild] }], generationConfig:{ responseModalities:['IMAGE'], imageConfig?:{ aspectRatio } } }`. Ein Referenzbild ist entweder ein bloßer Base64-String, der als `image/png` gilt, oder `{ data, mimeType }` mit dem echten Typ. Die Antwort liefert aus dem ersten Part mit `inlineData` die `dataUrl = 'data:' + mimeType + ';base64,' + data`.
- `generateImage` wirft mit lesbarer Meldung, wenn der Key fehlt (vor dem Netzaufruf), bei Zeitüberschreitung, bei HTTP 429 oder Kontingentfehler (Hinweis auf Billing), bei jedem anderen HTTP-Fehler und wenn die Antwort kein Bild enthält.
- `toRefImage(url): Promise<{ data, mimeType } | null>` macht aus einer Data-URL, einem Pfad oder einer Blob-URL ein Referenzbild. Kann das Bild nicht gelesen werden, kommt null zurück, und der Aufrufer erzeugt allein aus dem Text-Prompt.

### js/images/cache.js

- `makeKey(parts): string` bildet einen FNV-1a-Hash (32 bit) über die längenpräfigierten Teile und gibt ihn als achtstelligen Hex-String zurück.
- `cacheGet(key): Promise<string | null>` liest zuerst IndexedDB (Datenbank `realmcraft`, Store `images`, erst beim Aufruf geöffnet), dann den localStorage-Spiegel.
- `cachePut(key, dataUrl): Promise<void>` schreibt in IndexedDB und in den Spiegel.

Der Spiegel liegt unter `realmcraft.img.<key>` mit dem Index `realmcraft.img.index`. Er nimmt nur kleine Bilder und nur wenige Einträge auf (`MIRROR_MAX_CHARS`, `MIRROR_MAX_ENTRIES`), die ältesten fallen zuerst, weil er sich das Kontingent mit `rc.history` teilt.

### js/components/ui.js

- `el(tag, attrs = {}, children = []): HTMLElement` ist ein Hyperscript-Helfer. `attrs` kennt `class` bzw. `className`, `text`, `html`, `dataset`, `on` als Objekt von Events, Funktionen unter `on*`, `hidden`, boolesche Attribute und sonst `setAttribute`. Null-Werte entfallen, verschachtelte Kinder werden abgeflacht.
- `gauge(value, min = -2, max = 3, { label, valueText }): HTMLElement` ist ein Balken mit Nullpunkt für Lagewerte, `role="meter"`.
- `loyaltyMeter(value, { label, valueText }): HTMLElement` ist eine Schiene von -5 bis +5 mit Marke, `role="meter"`.
- `toast(message, { error }): void` hängt eine Meldung `[data-testid="toast"]` an den Host `[data-testid="toast-host"]`. Jede Meldung trägt einen Schließen-Knopf. Fehler und Meldungen über 120 Zeichen tragen `role="alert"` und bleiben stehen, bis sie geschlossen werden. Hinweise tragen `role="status"` und verschwinden nach einigen Sekunden.
- `bildLeiste(typ, id, handlers): HTMLElement` baut die Steuerleiste unter einem fortschreibbaren Bild (siehe Bild fortschreiben).

## DOM-Vertrag

### Gerüst (index.html)

- Topbar `[data-testid="topbar"]` mit `load-btn`, `<input type="file" data-testid="load-input" hidden>` (`.md`, `.json`, `.txt`), `<select data-testid="demo-select" hidden>`, `<select data-testid="history-select" hidden>`, `export-btn`, `settings-btn` und dem Link `anleitung-link` auf `anleitung.html`.
- Navigation in `.nav-bar` vor `<main>`, darin `nav.tabs` mit acht Links `<a class="tab" href="#/<view>" data-tab="<view>">` in der Reihenfolge `lage`, `lebenswelt`, `berater`, `armee` (Beschriftung „Curriculum"), `welt`, `karte`, `historie` (Beschriftung „Chronik"), `recht`. Der aktive Tab trägt `aria-current="page"`. Ohne geladenen Stand ist `nav.tabs` verborgen.
- Views in `<main class="wrap">` als `<section class="view" data-view="<view>">` für dieselben acht Namen. Inaktive Views tragen `hidden`.
- Leerzustand `[data-testid="empty-state"]` mit `empty-load-btn`, sichtbar, solange kein Stand geladen ist.
- Settings-Dialog `<dialog data-testid="settings-dialog">` mit `api-key-input`, `model-portrait`, `model-map`, `save-settings`, `settings-cancel` und `settings-close`.

Ein Stand wird über `load-input`, per Drag-and-Drop auf das Fenster oder, nur im Leerzustand, per Einfügen eines Speicherstand-Textes geladen.

### Routing

Die Route ist der Hash `#/<view>`. Ohne Hash oder bei unbekanntem Namen zeigt das Dashboard `lage`, ohne den Hash umzuschreiben. Ein Tab-Klick setzt den Hash, `hashchange` schaltet die View.

### Kopfleiste (js/render/hero.js)

`app.js` setzt `<section class="hero" id="realm-hero">` an den Anfang von `<main>`. Sie ist auf jeder Route sichtbar, sobald ein Stand geladen ist, und trägt die `h1` der Seite. Ohne Stand ist sie leer, `realm-name` existiert dann nicht.

- `[data-testid="chapter"]` mit „Kapitel <römische Ziffer>", `[data-testid="season"]` mit „<Jahreszeit>, Jahr <n>", `[data-testid="worldevent"]` mit „Weltereignis gewürfelt" oder „Weltereignis noch offen" je nach `meta.weltereignis`.
- `[data-testid="realm-name"]` in der `h1`, Text aus `volk.name` (in der Fixture „Die Karren").
- `[data-testid="core-strip"]` mit `core-nahrung`, `core-material`, `core-wissen`, `core-bevoelkerung`, `core-verteidigung`, `core-mobilitaet` und `core-wohlstand`. Die Lagewerte stehen mit Vorzeichen und richtungsgefärbt.
- `[data-testid="ansehen"]` mit der Überschrift „Ansehen <stufe> von 3", Sternen und dem Label aus `status.ansehen`.

### Lage (`data-view="lage"`)

- Delta-Banner `[data-testid="delta-banner"]` mit `[data-testid="delta-item"]` je Änderung. Es erscheint nur nach einem echten Laden mit Änderungen gegen den letzten gespeicherten Stand derselben Partie. Beim ersten Laden einer Partie, bei Auto-Restore, bei Verlaufswahl und bei Demo-Wechsel bleibt es aus. Neu-Renderings desselben Stands (etwa nach einer Bildwahl) behalten es. Die Einträge sind nach Bereichen gruppiert (Grundgrößen mit Trends, Lagewerte, Rat, Wehr, Welt & Stand), unbekannte Arten folgen ungruppiert. Numerische Einträge zeigen „<label>: <von> → <nach>" und das Delta als richtungsgefärbte Marke, die übrigen das Label mit Richtungsmarke. Einen Schließen-Knopf gibt es nicht.
- Das optionale Panel `[data-testid="volk-identitaet"]` zeigt aus `state.volk` je nach gesetzten Feldern `volk-wesensart`, `volk-ausrichtung`, `volk-erscheinung` und `volk-region` (Regionsname und Geländewerte). Fehlen alle Felder, fehlt das Panel.
- Die Grundgrößen stehen als Text in `[data-testid="stat-nahrung"]`, `stat-material`, `stat-wissen` und `stat-bevoelkerung` (`zahl`, ersatzweise `label`). In der Fixture sind das 8, 5, 16 und 300. Ausbeuten aus `lagewerte.ausbeuten`, deren `key` einer Grundgröße entspricht, stehen als Quellen an deren Karte.
- Optionale Trends aus `trends` erscheinen je Grundgröße als `[data-testid="trend-<key>"]`, etwa `trend-nahrung`. Die Zeile zeigt das Zeichen ▲, ▼ oder →, die Richtung in Worten (steigend, fallend, gleichbleibend) und den Grund als sichtbaren Text nach einem Gedankenstrich. Ohne Eintrag fehlt das Element.
- Das optionale Aktionsbrett `[data-testid="aktionsbrett"]` aus `runde` enthält `[data-testid="aktion-budget"]` (Text „Haupt u/m, Neben u/m") und je Aktion `[data-testid="aktion"]` (`data-id`) mit `[data-testid="aktion-titel"]`, Zielwert „Ziel n" und Modifikator. Vor dem Wurf steht „▶ 1d10", nach dem Wurf `[data-testid="aktion-ergebnis"]` mit `ergebnis`, ersatzweise „Wurf n". Fehlt `runde` oder sind die `aktionen` leer, fehlt das Brett.
- Die Lagewerte stehen in `[data-testid="lage-verteidigung"]`, `lage-mobilitaet` und `lage-wohlstand` mit Vorzeichen (Fixture „+3", „0", „+1") und je einem `gauge`. Ausbeuten ohne passende Grundgröße stehen darunter.
- `[data-testid="offene-faeden"]` als Liste aus `offeneFaeden`.
- Das optionale Panel `[data-testid="modifikatoren"]` aus `state.modifikatoren` enthält `[data-testid="mod-item"]` je Eintrag aus `.gelaende` und `.lage`, richtungsgefärbt und mit Grund. Fehlen beide, fehlt das Panel.

### Lebenswelt (`data-view="lebenswelt"`)

`js/render/lebenswelt.js` liest `lebenswelt.leben`, die Siedlungen aus `lebenswelt.siedlungen` (Rückfall auf das ältere Einzelobjekt `state.siedlung`, dann als Hauptstadt) und den Besitz aus `state.besitz`. Ist nichts davon erfasst, zeigt die Sicht nur `[data-testid="lebenswelt-leer"]` mit Hinweis.

- `[data-testid="lw-bevoelkerung"]` zeigt die Bevölkerung (gespiegelt aus `grundgroessen.bevoelkerung`), Stimmung, Nahrung, Trinken, Glaube, Alltag und Bräuche. Nur befüllte Zeilen erscheinen.
- `[data-testid="lw-siedlungen"]` erscheint nur mit Siedlungen und enthält je Siedlung eine Karte `[data-testid="siedlung"]` (`data-id` = `id`, ersatzweise `name`), die Hauptstadt zuerst. Jede Karte trägt `[data-testid="siedlung-bild"]` (`<img>`), `[data-testid="siedlung-name"]`, an der Hauptstadt die Marke „Hauptstadt", sonst den Typ als schlichte Metaangabe, dazu Lage, Beschreibung, Stimmung, Versorgung, Bauten, Eigenschaften als signierte Chips, `[data-testid="generate-siedlung"]` (ruft `onGenerateSiedlung(id)`) und die Bildleiste.
- Nur an der Hauptstadt steht `[data-testid="siedlung-live"]` mit `siedlung-einwohner` (aus `grundgroessen.bevoelkerung`) und `siedlung-verteidigung` (aus `lagewerte.verteidigung`), damit beide Werte sichtbar sind, ohne doppelt gepflegt zu werden.
- `[data-testid="lw-besitz"]` erscheint nur mit Besitz und enthält `[data-testid="besitz-liste"]` mit `[data-testid="besitz"]` je Eintrag.

### Berater (`data-view="berater"`)

- `[data-testid="advisor-list"]` enthält genau `state.berater.length` Karten `[data-testid="advisor-card"]` mit `data-id` = `berater.id`.
- Pro Karte `[data-testid="advisor-name"]`, `advisor-role`, `advisor-goal` (ohne `ziel` als leeres, verborgenes Element), `[data-testid="advisor-loyalty"]` mit Vorzeichenzahl und Wortzustand, ein `loyaltyMeter`, `[data-testid="advisor-portrait"]` (`<img>`), `[data-testid="generate-portrait"]` und die Bildleiste.
- Optional `[data-testid="advisor-lebensstand"]` aus `berater.lebensstand` (Rüstig, Lebensabend, Hinfällig), nur wenn gesetzt.

### Armee (`data-view="armee"`, Tab „Curriculum")

Die Sicht liest `state.armee` und ist im aktuellen UI didaktisch beschriftet (Modulfortschritt, Themenblöcke, Kompetenzen, Lücken).

- Kopf `[data-testid="armee-kopf"]` mit `[data-testid="armee-gesamt"]` (Text „Fortschritt <gesamt>"), optionaler Moral-Zeile, Bild `[data-testid="armee-bild"]` (`<img>`), `[data-testid="generate-armee-bild"]` (ruft `onGenerateArmeeBild()`) und der Bildleiste.
- `[data-testid="armee-verbaende"]` mit Karten `[data-testid="verband"]` (`data-id`). Je Karte `[data-testid="verband-name"]`, `[data-testid="verband-staerke"]`, optional Typ, Zuständigkeit (`fuehrungId` auf einen Berater), Verfassung, Ausrüstung und Hinweis, dazu `[data-testid="verband-avatar"]` (`<img>`), `[data-testid="generate-verband"]` (ruft `onGenerateVerband(verbandId)`) und die Bildleiste.
- Optional ein Panel aus `armee.stehendeModifikatoren` und `[data-testid="armee-verluste"]` aus `armee.verluste`.
- Ohne `armee` rendert die Sicht ohne Fehler mit Gesamtwert 0 und leerem Verbände-Panel.

### Welt (`data-view="welt"`)

- Optional `[data-testid="beziehungen-ansehen"]` mit dem Lagesatz aus `state.beziehungenAnsehen.text`, nur wenn gesetzt.
- `[data-testid="power-profil-legende"]` mit dem Text „Profil: Stärken (+) und Schwächen (−), Maßstab −2 bis +3".
- `[data-testid="power-card"]` je Eintrag in `state.maechte` (`data-id`), mit `[data-testid="power-name"]`, optional Typ und Erscheinung, `power-relation` (Pips und Label aus `beziehung`), `power-stance` (`haltung`), `[data-testid="power-bild"]` (`<img>`), `[data-testid="generate-macht"]` (ruft `onGenerateMacht(machtId)`) und der Bildleiste.
- Das optionale Profil einer Macht `[data-testid="power-profil"]` enthält `[data-testid="profil-mod"]` je Stärke oder Schwäche. Ein negativer Wert ist die ausnutzbare Schwäche und trägt die Klasse `schwaeche`. Ohne Profil fehlt der Block.
- `[data-testid="group-row"]` je Eintrag in `state.gruppen` (`data-id`), mit Gruppenname, Kompetenz, Sprechername (aus `berater` oder `personen` über `sprecherId`), `[data-testid="gruppe-bild"]` (`<img>`), `[data-testid="generate-gruppe"]` (ruft `onGenerateGruppe(gruppeId)`) und der Bildleiste.

### Karte (`data-view="karte"`)

- `[data-testid="map-image"]` (`<img>`, anfangs ohne `src`), `[data-testid="generate-map"]`, `[data-testid="map-legend"]` mit `[data-testid="map-place"]` je Eintrag in `state.karte.orte`.
- Die Karten-Chronik `[data-testid="chronik-panel"]` erscheint nur bei nicht leerem `karte.chronik` und enthält die Zeitleiste `[data-testid="karte-chronik"]`. Je Stand steht ein Knopf mit Zeit und Anlass, der aktive als `[data-testid="karte-stand-aktiv"]`, die übrigen als `[data-testid="karte-stand"]`, jeweils mit `aria-pressed`. Ein Klick ruft `onSelectKarteStand(id)` und wechselt das gezeigte Bild.
- Aktiv ist der gewählte Stand, sonst `karte.aktuellerStand`, sonst der jüngste. Die Wahl verfällt bei Partiewechsel und wenn der Spielleiter `aktuellerStand` weiterrückt.
- Mit Chronik ruft `generate-map` `onGenerateKarteStand(aktiverStand.id)`. Trägt der aktive Stand `basiertAuf`, lautet die Beschriftung „Aus der vorigen weiterentwickeln", und das Bild des Vorgängers geht als Referenzbild mit. Ohne Chronik ruft der Knopf `onGenerateMap()` mit der Beschriftung „Karte erzeugen".

### Historie (`data-view="historie"`, Tab „Chronik")

- `[data-testid="history-entry"]` je Eintrag in `state.historie`, chronologisch, nach `kapitel` gruppiert mit einer Überschrift „Kapitel <römische Ziffer>" je Gruppe. „Gegenwart" steht nur am jüngsten Eintrag.
- Trägt ein Eintrag `bild`, folgen `[data-testid="ereignis-bild"][data-jahre]` (`<img>`) und `[data-testid="generate-ereignisbild"][data-jahre]`, der `onGenerateEreignisbild(index)` mit dem Index in `historie[]` ruft.
- `[data-testid="faehigkeit"]` je Eintrag in `state.faehigkeiten`. Leere Listen zeigen einen Hinweis.

### Recht (`data-view="recht"`)

Die Sicht dient dem Nachschlagen der vereinbarten Ordnung und ist reine Anzeige.

- `[data-testid="verfassung"]` zeigt `state.verfassung.text`, sofern gesetzt.
- `[data-testid="setzungen"]` erscheint mit Einträgen in `state.setzungen` und enthält `[data-testid="setzung"]` je Sonderregel (Titel und Text).
- Sind weder Verfassung noch Setzungen erfasst, erscheint `[data-testid="recht-leer"]` mit Hinweis.

### Verlauf und Bildleiste

- `history-select` listet die gespeicherten Stände der aktuellen Partie mit Kapitel, Jahreszeit, Jahr und Speicherzeitpunkt, den jüngsten mit „(neuester)". Es ist ab zwei Ständen der Partie sichtbar. Eine Auswahl lädt den Stand ohne Delta.
- Die Bildleiste an jedem fortschreibbaren Bild enthält `<button data-testid="bild-fortschreiben" data-typ data-id>` und, sobald fortgeschriebene Versionen vorliegen, `<select data-testid="bild-versionen" data-typ data-id>`. Die Option `__basis` („Ursprung") steht für das Ursprungsbild, jede weitere Option für eine Version mit Label „Stand n, <Jahreszeit Jahr>".

## Bildfluss

### Erzeugen

Ein Erzeugen-Knopf ruft über seinen Handler `generate(typ, id)` in `app.js`. Die Reihenfolge ist durch E2E-Tests gepinnt.

1. Läuft für denselben Schlüssel bereits ein Aufruf, bleibt der Klick wirkungslos. Der Knopf trägt während des Aufrufs `aria-busy="true"`, ein Doppelklick bezahlt also nur ein Bild.
2. Ein Cache-Treffer unter dem Schlüssel wird gezeigt, ohne Request.
3. Ohne API-Key zeigt ein Toast einen Hinweis, und der Settings-Dialog öffnet sich, ohne Request.
4. Sonst werden die Referenzbilder aufgelöst, `generateImage` gerufen und das Ergebnis gecacht. Das `<img>` wird nach dem Aufruf neu gesucht, weil ein Live-Rendering es inzwischen ersetzt haben kann, und erhält das Bild nur, wenn der Schlüssel der Entität unverändert ist und bei einem Kartenstand dieser noch aktiv ist. Danach beginnt `src` mit `data:<mimeType>;base64,`.
5. Fehler erscheinen als Fehler-Toast.

Der API-Key kommt aus `localStorage['realmcraft.apiKey']`, ersatzweise aus `window.__RC_ENV__.GEMINI_API_KEY`, das `serve.mjs` über `/env.js` aus `.env` liefert. Der Settings-Dialog zeigt nur den gespeicherten Key, ein leeres Feld entfernt ihn. Die Modelle stehen unter `realmcraft.model.portrait` und `realmcraft.model.map` mit `MODELS` als Vorgabe.

Referenzbilder sind das Referenzfoto eines Beraters (`referenz.dataUrl`) und bei einem Kartenstand mit `basiertAuf` das Bild des Vorgängerstands. `toRefImage` wandelt jedes in `{ data, mimeType }`.

### Anzeige-Vorrang

Nach jedem Rendering füllt `hydrateImages` alle Bilder ohne API-Aufruf. Für jedes Bild gilt dieselbe Reihenfolge:

1. die aktive fortgeschriebene Version aus `rc.imgakt` (nur fortschreibbare Typen)
2. eine gecachte Data-URL unter dem Prompt-Schlüssel, das in diesem Browser erzeugte und womöglich bezahlte Bild
3. die im Stand eingebettete URL (Data-URL oder Pfad), wobei eine Data-URL in den Cache gespiegelt wird
4. ein gecachter Pfad aus einem schlanken Demo-Stand

Ein `<img>`, das bereits eine `src` trägt, behält sie, sofern keine aktive Version greift. Die Karte zeigt nur den aktiven Stand.

### Bild fortschreiben

`onBildFortschreiben(typ, id)` leitet aus dem gezeigten Bild und dem aktuellen Zeitpunkt der Partie ein neues Bild ab. Vorlage ist die aktive Version, sonst die jüngste, sonst das Basisbild nach dem Anzeige-Vorrang, sonst die aktuelle `src`. Der Prompt ist `fortschreibenPrompt(basePrompt, state)`, der Schlüssel `versionKey(...)` mit der Versionsnummer, sodass jede Version einen Cache-Fehltreffer und damit ein neues Bild erzwingt. Die neue Version wird in die Liste der Partie geschrieben und aktiv gesetzt. Ein zweiter Klick während eines laufenden Aufrufs für dieselbe Identität bleibt wirkungslos, der Knopf trägt `aria-busy="true"`. `onWaehleBildVersion(typ, id, value)` schaltet die aktive Version um, `__basis` kehrt zum Ursprung zurück. Die Karte führt statt Versionen ihre savegame-getriebene Karten-Chronik.

## Export und Import

`[data-testid="export-btn"]` lädt ein Bundle herunter, eine tiefe Kopie des Stands mit eingebetteten Bildern:

- je Entität jedes Bildtyps das gewählte Bild als primäres `dataUrl` im Feld der Registry-Tabelle, also die aktive Version, sonst das gecachte Bild unter dem Prompt-Schlüssel. Das umfasst `berater[].portrait`, `armee.bild`, `armee.verbaende[].avatar`, `maechte[].bild`, `gruppen[].bild`, `lebenswelt.siedlungen[].bild` bzw. beim älteren Einzelobjekt `siedlung.bild`, `historie[].bild`, `karte.dataUrl` ohne Chronik und `karte.chronik[].dataUrl` je Stand mit Chronik.
- unter dem frontend-eigenen Root-Feld `bildChronik` die vollständige Versionschronik der Partie als `{ [identity]: { aktiv, versionen: [{ key, label, savedAt, dataUrl? }] } }`. Das Schema lässt zusätzliche Root-Felder zu.

Beim Laden eines Bundles zeigt der Anzeige-Vorrang die eingebetteten Bilder, und ihre Data-URLs gehen in den Cache. `restoreBildChronik` spielt `bildChronik` in Cache und Versionslisten der Partie zurück, einmal je Partie und Identität pro Sitzung, und setzt `aktiv` nur, wenn noch keine Version aktiv ist. So erscheinen fortgeschriebene Bilder samt allen Ständen auf einem fremden Browser (GitHub Pages) ohne API-Aufruf. Ein Demo-Wechsel setzt diese Markierungen zurück. Da `saveSnapshot` generierte `dataUrl`-Felder nicht im Verlauf ablegt, trägt nach einem Reload der Cache die Bilder.

## Live-Modus (Terminal-Spielleiter)

`serve.mjs` serviert das Repo-Verzeichnis einschließlich `savegame.json`, liefert `/env.js` und `/events`. Es beobachtet das Repo-Verzeichnis und sendet `event: savegame`, wenn sich `savegame.json` ändert, und `event: reload` bei Änderungen an `.js`, `.mjs`, `.css` oder `.html` außerhalb versteckter Ordner und der Testbericht-Ordner. Bei Bindung an Loopback nimmt es nur Loopback-Host-Header an, Dotfiles beantwortet es mit 404.

Der Start in `app.js` verläuft in dieser Reihenfolge:

1. Auto-Restore des zuletzt gespeicherten Stands ohne Delta-Banner.
2. Verdrahten des Demo-Pickers.
3. `wireLive` lädt `savegame.json`. Existiert die Datei, läuft sie über denselben Pfad wie ein Datei-Upload (Delta-Banner, Verlauf, Render), und `/events` wird abonniert.
4. Fehlt die Datei oder läuft die Seite ohne `http`, lädt `ohneLive` den Standard-Demo-Stand, sofern bis dahin kein Stand geladen ist.

### SSE-Live-Reload-Vertrag (`/events`)

- Das Frontend abonniert `/events` per `EventSource('events')`.
- Event `savegame` lädt `savegame.json` neu und rendert über denselben Pfad wie ein Upload.
- Event `reload` ruft `location.reload()`, damit kein offener Tab auf altem JS, HTML oder CSS hängen bleibt.
- Transiente Aussetzer fängt `EventSource` selbst. Nur bei `readyState === CLOSED` (etwa nach einem Serverneustart) baut das Frontend die Verbindung nach kurzem Backoff neu auf.

## Demo-Stände (GitHub Pages)

Demo-Stände werden schlank ausgeliefert. Ihre Bilder liegen als `.webp`-Dateien vor, und die `dataUrl`-Felder enthalten root-relative Pfade wie `examples/demo/<slug>/bilder/<hash>.webp`. Das braucht keine Loader-Änderung, weil `img.src` einen Pfad genauso annimmt wie eine Data-URL.

- `node tools/prepare-demo.mjs <export.json> <slug> ["Titel"]` lagert alle Data-URIs eines Export-Bundles als Dateien aus (mit `sharp` verkleinert und als WebP, inhaltsgleiche Bilder dedupliziert), ersetzt sie durch Pfade und pflegt `examples/demo/manifest.json`.
- Das Manifest hat die Form `{ default: <slug>, staende: [{ slug, titel, pfad, bilder, kapitel, jahreszeit, jahr }] }`.
- `wire()` füllt `demo-select` aus dem Manifest. Die letzte Option „Eigenen Speicherstand laden …" öffnet das Datei-Input. Eine Demo-Auswahl lädt `pfad` als Demo, also ohne Delta-Banner und ohne Verlaufseintrag, nachdem `beforeSwitch` die Wiederherstellungsmarken der Bild-Chronik zurückgesetzt hat.
- `loadDefault()` lädt den `default`-Eintrag des Manifests (sonst den ersten), nur wenn kein Stand geladen ist. Nach jedem `await` prüft es erneut, damit eine inzwischen geladene Datei nicht überschrieben wird. Ohne Manifest fällt es auf `examples/die-gestrandeten.json` zurück, das wie ein regulärer Stand mit Verlaufseintrag lädt.
- Fehlt das Manifest (404, Tests, `file://`), bleibt `demo-select` verborgen.

## Test-Hooks

- Die localStorage-Schlüssel sind `realmcraft.apiKey`, `realmcraft.model.portrait`, `realmcraft.model.map`, `rc.history`, `rc.imgver.<partieTag>`, `rc.imgakt.<partieTag>` und der Bild-Spiegel `realmcraft.img.*`.
- `isolate(page)` in `tests/e2e/_helpers.js` beantwortet `savegame.json`, `examples/demo/manifest.json` und `examples/die-gestrandeten.json` mit 404 und `env.js` mit einem leeren Skript. Jede E2E-Spec startet damit im Leerzustand, unabhängig von laufender Partie und lokalem Key.
- Die Bild-API ist in E2E per Playwright `route('**/generativelanguage.googleapis.com/**')` gemockt, die Antwort ist `candidates[0].content.parts[0].inlineData{ mimeType:'image/png', data:<1x1-PNG-base64> }`.
- Ladefehler erscheinen als `[data-testid="toast"]`, und der bisherige Zustand bleibt unverändert.
- Roundtrips von Export und Import prüfen `tests/e2e/export-import.spec.js` und `tests/e2e/images-registry.spec.js` über das Cache-Verhalten, ohne neuen API-Aufruf.
- `tests/e2e/strategy.spec.js` und `tests/e2e/nachtmeer.spec.js` prüfen die Rundenprototypen unter `spiel/` und binden nicht an diesen Vertrag.

## Gelesene Felder je Sicht

Fehlt ein optionales Feld, fehlt der zugehörige Block.

| Sicht | gelesene `state`-Felder |
|---|---|
| Kopfleiste | `meta` (kapitel, zeit, weltereignis), `volk.name`, `grundgroessen`, `lagewerte`, `status.ansehen` |
| `lage` | `volk` (wesensart, ausrichtung, erscheinung, region), `grundgroessen`, `trends`, `runde`, `lagewerte` (mit `ausbeuten`), `offeneFaeden`, `modifikatoren` (`.gelaende`, `.lage`) |
| `lebenswelt` | `lebenswelt.leben`, `lebenswelt.siedlungen` (Rückfall `siedlung`), `besitz`, `grundgroessen.bevoelkerung`, `lagewerte.verteidigung` |
| `berater` | `berater[]` (id, name, rolle, ziel, generation, loyalitaet, lebensstand, portrait) |
| `armee` | `armee` (gesamt, moral, verbaende, stehendeModifikatoren, verluste, bild), `berater` (Zuständigkeit) |
| `welt` | `beziehungenAnsehen.text`, `maechte[]` (id, name, typ, erscheinung, profil, beziehung, haltung, bild), `gruppen[]` (id, name, kompetenz, sprecherId, bild), `berater` und `personen` (Sprecher) |
| `karte` | `karte` (orte, chronik, aktuellerStand, dataUrl) |
| `historie` | `historie[]` (kapitel, jahre, zusammenfassung, bild), `faehigkeiten` |
| `recht` | `verfassung.text`, `setzungen[]` |

Die Bild-Prompts lesen zusätzlich `meta.visualStyle`, `meta.armeeStyle`, `meta.mapStyle`, `karte.prompt`, `volk.region`, `volk.erscheinung`, `berater[].erscheinung` und `berater[].referenz`. Welche Felder genau eingehen, legt `js/images/prompts.js` fest.

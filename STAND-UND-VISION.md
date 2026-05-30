# RealmCraft, Stand und Vision

Kompaktes Arbeitsdokument zum Mitnehmen über Sitzungs- und Kontextgrenzen. Es hält fest, was RealmCraft ist, was gebaut ist, und wohin es geht. Es ist die eine Quelle, aus der eine frische Claude-Code-Sitzung weiterarbeiten kann.

Stand: 2026-05-30. Repo: `github.com/chpollin/realmcraft` (public). Lokaler Pfad: `C:\Users\Chrisi\Documents\GitHub\chpollin\realmcraft`. Autor: Christopher Pollin, DHCraft. Methode: Promptotyping.

## 1. Was RealmCraft ist

Ein Lagebild-Dashboard und Gedächtnis für ein spielleitergeführtes, offenes Aufbau- und Erzählspiel. Man spielt im Gespräch mit einem Frontier-Sprachmodell als Spielleiter, führt ein eigenes Volk über viele Jahre und Kapitel, lässt sich auf den Befehl "Speichern" einen Speicherstand ausgeben und lädt ihn hier hoch. RealmCraft rendert die Lage: Volk, Berater, Grundgrößen, Lagewerte, Mächte, Karte, Historie.

RealmCraft ist das **System** (Mechanik plus Dashboard), kampagnenunabhängig. "Die Karren" ist die erste, laufende Partie.

Leitsatz aus der Mechanik: *Der Kern bleibt klein, die Hebel werden viele.* Wenige stabile Grundgrößen, viel Wachstum als Statuswerte, Institutionen, Erzählzustände.

## 2. Die zentrale neue Einsicht (diese Sitzung)

Weil man mit einem Frontier-LLM spielt, ist die **Weiterentwicklung der Regeln selbst Teil der Spielmechanik**. Eine Partie wächst nicht nur in der Geschichte, sondern auch im Regelwerk (siehe die "Setzungen" in Kapitel 4: Lebensstand, Nachfolge, Delegationsregiment). Daraus folgt, was RealmCraft leisten muss:

1. **Eigene Regelanpassungen während des Spiels sichtbar machen.** Setzungen/Sonderregeln sind kein Beiwerk, sondern ein eigener, wachsender Teil des Stands, den man sieht und teilt.
2. **Die eigene Geschichte mitdokumentieren und zurückblicken.** Die Partie soll als erlebbare Chronik lesbar sein, Kapitel für Kapitel, nicht nur als aktueller Zustand.
3. **Wissen komprimieren als Kontext fürs LLM.** Die Welt einer langen Partie sprengt das Kontextfenster. RealmCraft hält darum **komprimierte Markdown-Dokumente** (Chronik, Welt-Wissen, Regel-Evolution, Personen), die zwei Zwecke zugleich erfüllen: lesbare Geschichte für den Menschen **und** gezielt nachschlagbarer Kontext für den Spielleiter (das LLM bzw. Claude Code), damit eine komplexere Welt überhaupt konsistent bespielbar bleibt.
4. **Einen Spielstand herzeigen und vermitteln.** Ein geladener Stand plus Chronik ist etwas, das man jemandem zeigt, der die Partie nicht kennt, und das die Lage in einem Blick vermittelt.

Das ist der Kern: RealmCraft wird vom Anzeige-Tool zum **Gedächtnis- und Regel-Layer** einer fortlaufenden Partie.

## 3. Aktueller Stand (gebaut, getestet, deployed)

Vanilla-JS Single-Page-App, kein Build-Schritt. ES-Module, Google Fonts als einzige externe Laufzeit-Abhängigkeit.

- **Dashboard, fünf Sichten**: Lage, Berater, Welt, Karte, Historie. Hash-Routing (`#/lage` … `#/historie`), Upload per Klick, Drag-Drop, Paste. Funktional fertig; Optik im Theme "Anthrazit" (Schwarz/Blau, Orange-nach-Rot-Signatur, siehe Abschnitt 5).
- **Zwei Spielweisen**: Chat (Upload des JSON ins Dashboard, eigenständig pro Projekt) und Terminal (Claude Code als Spielleiter via `CLAUDE.md`, schreibt `savegame.json` + `knowledge/` fort). `docs/Spielmechanik.md` ist auf die Vollfassung gehoben (Trends, Lebenszyklus, Delegation, Aktionen, Statuskonsole, Befehle).
- **Update-Loop**: `js/store.js` (localStorage-Verlauf `rc.history`), `js/diff.js` (Delta), Auto-Restore, Delta-Banner in der Lage, Kapitel-Historie-Auswahl in der Topbar.
- **Aktionsbrett/Trends/Lebensstand**: im Schema (`trends`, `runde`, `lebensstand`), in Lage- und Berater-Sicht gerendert, im Kapitel-4-Stand befüllt. Das Dashboard zeigt jetzt genau das ASCII-Lagebild als echte UI (Haupt/Neben-Zähler, Ziel/Mod/▶1d10, Trend-Pfeile, Lebensstand-Marken).
- **Befehlsleiste** (`js/commands.js`): immer sichtbar über den Tabs, Slash-Befehle (`/speichern`, `/würfeln`, `/rat`, `/status`, `/ressourcen`, `/karte`, `/info`), Klick kopiert den Befehl für den Spielleiter-Chat; eigene Befehle anlegbar und in localStorage (`rc.commands`) gehalten.
- **Beispielstände**: `die-karren-kapitel-3/4` und `die-ordnenden-kapitel-1` (hybrides Markdown + deep-equal json, gegen das Schema validiert). Der Spielstart-Prompt steht in `docs/Spielstart-Prompt.md` mit validiertem Beispiel.
- **Live-Reload**: `serve.mjs` watcht `savegame.json` und sendet SSE `/events`; `app.js` (`wireLive`) lädt die Datei automatisch und spiegelt jede Änderung. Im Chat-Modus (keine Datei) und in Tests inaktiv (No-op). Per Probe verifiziert.
- **Bild-Pipeline**: Gemini (Nano Banana). Portraits und Karte auf `gemini-3.1-flash-image` (Free-Tier). `gemini-3-pro-image` (Pro, beste Kartenbeschriftung) hat Free-Tier-Kontingent 0, in den Einstellungen umstellbar bei aktivem Billing. Key aus `.env` über `serve.mjs` → `/env.js` oder Einstellungen (localStorage). IndexedDB-Cache, Export/Import-Bundle mit eingebetteten base64-Bildern.
- **knowledge/**: Wissensbasis nach Promptotyping (INDEX, welt, chronik, regeln, personen) mit der Karren-Partie befüllt.
- **Tests grün**: Unit 70 (node:test), E2E 25 + Visual 5 (Playwright). `npm test`. Visual-Baselines müssen nach jedem Design-/Theme-Wechsel mit `npx playwright test tests/visual --update-snapshots` neu erzeugt werden.
- **Git**: alles committet, sauberer Baum, noch nicht gepusht.
- **Permissions**: `.claude/settings.json` mit Allowlist für node/npm/npx/git/Edit/Write, damit Subagenten nicht ständig Freigaben brauchen; destruktive Befehle bleiben blockiert.

### Dateistruktur (Ist)
```
realmcraft/
├── index.html                  Vertrags-DOM (Topbar, Tabs, 5 Views, Settings-Dialog, env.js + app.js)
├── css/style.css               Theme "Anthrazit" (Schwarz/Blau, Orange-nach-Rot-Signatur)
├── js/
│   ├── app.js                  Bootstrap, Routing, Upload, Settings, Bildgenerierung, Export, Hero
│   ├── parse.js                extractJsonBlock, parseSavegame, validateSavegame
│   ├── state.js                setState/getState/subscribe (rein In-Memory; Persistenz folgt)
│   ├── render/{overview,advisors,actors,map,history}.js
│   ├── images/{gemini,cache}.js
│   └── components/ui.js        el, gauge, loyaltyMeter, statCard, modal, toast
├── schema/savegame.schema.json JSON-Schema (Draft-07), inkl. optionaler "setzungen"
├── examples/
│   ├── die-karren-kapitel-3.{json,md}
│   └── die-karren-kapitel-4.{json,md}   ← die laufende Partie
├── docs/
│   ├── Spielmechanik.md        Wissensdokument I (Regeln), sauberes UTF-8, mit Frontend-Erweiterungen
│   ├── Speicherstand-Format.md
│   └── Frontend-Contract.md    VERBINDLICH: Modul-APIs, DOM-Testids, Routen, Test-Hooks
├── design/
│   ├── prototypes/{war-table,chronicle,codex,console}.html   Design-Lauf A
│   ├── design-tokens.css       kanonische Tokens des Themes "Anthrazit"
│   └── screenshot.mjs, app-screenshot.mjs
├── tests/{unit,e2e,visual,fixtures}/
├── serve.mjs                   zero-dep Static-Server, liest .env → /env.js
├── playwright.config.mjs, package.json, .gitignore (.env ignoriert)
└── .env                        GEMINI_API_KEY (nie committet)
```

### Server starten
```
npm install
PORT=4173 node serve.mjs      # http://localhost:4173
```
Hinweis: alte serve.mjs-Instanzen vor Neustart beenden (Windows: über PowerShell die node-Prozesse mit serve.mjs killen), sonst Port belegt und /env.js 404 von der alten Instanz.

## 4. Die laufende Partie "Die Karren"

Beginn Kapitel 4, Frühling Jahr 19, Runde offen, Weltereignis noch nicht gewürfelt. Bergvolk, Ausrichtung Technologie, Hochgebirge plus Korntal. Nahrung 8, Material 5, Wissen 16, Bevölkerung Kern ~400. Verteidigung +3 (Festung), Mobilität 0, Wohlstand +1, Ausbeute Erz +1. Ansehen 3/3, Leuchtfeuer der Freien.

Bogen: Kapitel 1 (Jahr 0-4) hungerndes Häuflein → Vasallenschaft. Kapitel 2 (6-9) Erzfalle gebrochen, Bund freier Völker, Kriegsherr Torv zerschlagen. Kapitel 3 (12-14) Großmacht Aurelan abgewehrt und Anerkennung gewonnen. Kapitel 4 (ab 19) Frieden, der Bund lockert sich ohne Feind, Generationenwechsel um Tova, der Sprecher (Gründer, Lebensabend) übergibt die Felder an den Rat.

Sieben Berater alle +5 (Borka, Idr, Mell, Yann, Harn, Renja, Soren), Generation des Lebensabends. Tova führt als Person (nicht Berater) die neue Verwaltung. Mächte: Bund der Freien, Lir, Drenn, Aurelan, der weite Kontinent.

Aktuelle Setzungen (Regel-Evolution dieser Partie): Lebensstand (Altern mit Lebenswürfen), Nachfolge (Tod des Sprechers, was bleibt/zurücksetzt), Delegationsregiment (Berater führen Felder eigenständig), Bevölkerung (Wachstum als Hebel statt Kopfzahl).

Offene Fäden u.a.: Was eint die Freien ohne gemeinsame Furcht. Dauerhafte freie Ordnung des Kontinents. Nachfolge nach den Gründern. Nahrungsdruck der wachsenden Stadt. Knappes Material. Eigenmächtige Berater. Drei entschiedene, noch nicht ausgewürfelte Vorhaben: Verwaltung, Stadtausbau Süd, Zuzugskampagne.

## 5. Designentscheidung: Theme "Anthrazit" (gewählt 2026-05-30)

Frühere Richtungen (dunkles "War Table" mit Messing und Garamond, helles "Atlas") sind abgelöst. Gewählt ist ein sachlich-neutrales, professionelles Dashboard:

- **Gerüst** Anthrazit und Schwarz, neutral, ohne Fantasy-Furnier.
- **Leitakzent** ein kräftiges, kultiviertes Blau (futuristisch, aber kulturell): Kicker, Linien, Gauges, Fokus, Portrait-Ringe, Links.
- **Signatur** ein Orange-nach-Rot-Verlauf (Token `--flame`) als wiederkehrender Glanzpunkt: Primär-Button, Augenbraue über dem Volksnamen (Gradient-Text), aktiver Tab-Unterstrich, aktueller Kapitel-Knoten der Historie, Hauptaktion-Marke im Aktionsbrett. Ansehen-Sterne in Orange.
- **Typografie** Space Grotesk über Inter.
- Vertrags-DOM und alle `data-testid` unverändert (Tests gültig). Umgestellt: `css/style.css` und `design/design-tokens.css`, dazu Google-Fonts-Link und Marken-Sigil in `index.html`. Visual-Baselines neu erzeugt.

## 6. Update-Loop (der "gute Überblick")

Wenn man im LLM weiterspielt und einen neuen Stand lädt, soll RealmCraft:
- **Auto-Restore**: den letzten Stand beim Öffnen automatisch laden (localStorage), kein erneutes Hochladen.
- **Delta zum letzten Stand**: beim Laden zeigen, was sich geändert hat — Ressourcen (↑/↓), Loyalitäten, Ansehen, neue/weggefallene Berater und Orte, Kapitelwechsel, neue Setzungen.
- **Kapitel-Historie lokal**: mehrere geladene Stände behalten, zwischen Kapiteln/Ständen umschalten, zurückblättern.
- **Erklärung & Tooltips**: Skalen erklärt (Lagewerte −2..+3, Loyalität −5..+5, was Wohlstand ist), Modifikator-Herkunft on hover, kurzer Erstnutzer-Hinweis.

## 7. Seitenfunktionen (Soll)

- **Lage**: Volk-Kopf, Grundgrößen, Lagewerte (Gauge mit Nullpunkt) — plus Delta-Pfeile, ein "Was ansteht"-Block (offene Fäden + nicht ausgewürfelte Vorhaben als Handlungsliste), Skalen-Tooltips.
- **Berater**: Karten mit Loyalitäts-Band (ergeben/treu/schwankend/verstimmt/am Bruch), Delta seit letztem Stand, geführtes Feld, Portrait erzeugen. Loyalitäts-Legende.
- **Welt**: Mächte mit Beziehungs-Skala + Haltung; Gruppen als "Lanes" der Entwicklung (Feld, Sprecher, Kompetenz). Sprecher kann Berater oder Person sein (Tova).
- **Karte**: KI-Karte (Flash-Modell) plus **schematische Orts-Karte** aus `karte.orte` (Richtungen N/O/S/W/Mitte, anklickbar), die immer funktioniert, auch ohne Bild-Quota.
- **Historie**: Kapitel-Zeitstrahl, Fähigkeiten, Besitz, **Setzungen/Sonderregeln** (Regel-Evolution, bereits gerendert).
- **Neu, Chronik**: die erlebbare Geschichte der Partie, Kapitel für Kapitel lesbar, teilbar. Speist sich aus der Historie plus den komprimierten Wissensdokumenten (siehe 8).

## 8. Wissens-Layer: komprimierte Markdown-Dokumente (Promptotyping)

Damit eine lange, komplexe Partie konsistent bleibt, hält das Repo eine **komprimierte Wissensbasis** nach der Promptotyping-Konvention (`knowledge/`-Ordner). Sie ist beides: lesbare Chronik für den Menschen und gezielt nachschlagbarer Kontext für den Spielleiter/Claude Code. Distillation-Prinzip: maximale Information, minimale Tokens; eine Funktion pro Dokument; das Wichtigste zuerst und zuletzt.

Vorgeschlagene Dokumente (Funktion vor Dateiname):
- `knowledge/INDEX.md` — Navigation plus Begriffslexikon (was liegt hier, welche Begriffe sind konstitutiv).
- `knowledge/welt.md` — Welt-Wissen: Geographie, Orte, Mächte, Beziehungen, kompakt.
- `knowledge/chronik.md` — die Geschichte Kapitel für Kapitel, verdichtet (Rückblick + LLM-Kontext).
- `knowledge/regeln.md` — Regel-Evolution: die Setzungen und Sonderregeln dieser Partie, mit Begründung und Datum/Kapitel ihrer Einführung.
- `knowledge/personen.md` — Berater und benannte Figuren, Ziele, Bögen, Loyalitätsverläufe.
- (optional) `knowledge/project.md`, `design.md`, `journal.md` nach Konvention, für das Tool selbst.

Pflichtkern-Frontmatter je Dokument: `title, project, method, status, created, updated` (siehe Konvention Promptotyping Documents). Verhältnis zum Speicherstand: Der JSON-Speicherstand ist der **maschinenlesbare Zustand jetzt**; die `knowledge/`-Dokumente sind das **verdichtete Gedächtnis über die Zeit**. Idealerweise kann RealmCraft aus geladenen Ständen die Chronik mitschreiben/aktualisieren.

## 9. Bild-Situation

`gemini-3-pro-image` (Pro, beste lesbare Kartenbeschriftung) hat im Free-Tier Kontingent 0 → 429. Beschluss: Karte ebenfalls auf `gemini-3.1-flash-image` stellen (läuft im Free-Tier), in den Einstellungen auf Pro umstellbar, wenn Billing aktiv. Portraits laufen auf Flash. Auth, Endpoint und Request-Form sind verifiziert korrekt (Live-Test erreichte das Modell, scheiterte nur am Kontingent). Modell-IDs ggf. mit `-preview`-Suffix probieren, falls ein 404 kommt.

## 10. Offene Entscheidungen

- Theme-Feinschliff: Dosierung der Flamme und Karten-Rahmen erst nach der ersten echten Sitzung beurteilen.
- Chronik: rein aus dem Stand gerendert, oder zusätzlich aus den `knowledge/`-Markdown-Dokumenten gespeist (Letzteres ist das Ziel, aber zweistufig).
- Soll RealmCraft die `knowledge/`-Dokumente nur anzeigen, oder beim Laden eines neuen Stands auch fortschreiben (Chronik-Eintrag je Kapitel)?
- Mechanik-Erweiterung im Schema: ein optionaler Block für "Vorhaben/Aktionen dieser Runde" (entschieden, ausgewürfelt, Ergebnis), damit das "Was ansteht" und der Verlauf strukturiert sind.

## 11. Nächste Schritte (priorisiert)

Erledigt (2026-05-30): Bild-Fix (Karte auf Flash), knowledge/-Wissensbasis, Update-Loop (Auto-Restore/Delta/Kapitel-Historie), Mechanik-Vollfassung + `CLAUDE.md`-Spielleiter, Aktionsbrett/Trends/Lebensstand in Schema/Render/Kapitel-4-Stand, Live-Reload (`serve.mjs` SSE + `savegame.json`-Spiegelung).

Offen:
1. **Neuer Spielstand**: Der nächste Stand des Nutzers wird geladen/eingespielt; ggf. Schema-Anpassung, falls er Felder bringt, die das Schema noch nicht kennt. Erst prüfen, dann rendern.
2. **Theme-Feinschliff** (optional): Detailpolitur am Anthrazit-Theme nach der ersten echten Sitzung (Kontraste, Dosierung der Flamme, Karten-Rahmen).
3. **Erklärung & Tooltips, schematische Orts-Karte** aus `karte.orte` (quota-unabhängiger Fallback, immer funktionierend).
4. **Chronik-Sicht** im Frontend, die `knowledge/` + Historie erlebbar und teilbar macht.
5. Optional: Würfeln im Dashboard (Aktion wählen, 1d10 eintragen, Rechnung zeigen). Der Wurf gehört aber eigentlich zum Spielleiter.
6. Erste echte Live-Partie: `npm run serve`, Browser offen, in einer Claude-Code-Terminal-Sitzung mit `CLAUDE.md` als Spielleiter spielen.

## 12. Arbeitsweise und Konventionen

- Frontend-Vertrag (`docs/Frontend-Contract.md`) ist verbindlich; DOM-Testids nicht ohne Grund ändern, sonst brechen Tests.
- Nach jeder Änderung: `node --test "tests/unit/**/*.test.js"` und `npx playwright test`. Bei beabsichtigten Optikänderungen Visual-Baselines neu erzeugen.
- Keine Emojis, keine Dashes als Satzzeichen (Autor-Präferenz). Deutsch im UI, englische Fachbegriffe wo üblich.
- Promptotyping-Methode: komprimierte Knowledge Documents, Distillation, Funktion vor Dateiname.
- Sammel-Commits über eine Arbeitseinheit, nicht viele Einzelcommits. `.env` und Screenshots bleiben gitignored.

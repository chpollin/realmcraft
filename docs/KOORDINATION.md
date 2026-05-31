# Koordination der drei Claude Codes

Wer arbeitet woran. Stand: 2026-05-31. Eine Zeile pro Rolle, dann Aufgaben und das Datei-Eigentum, damit sich niemand überschreibt.

## Rollen

- **Claude 0 — Spielleiter / Inhalt.** Führt die Partie, schreibt den Stand und das Gedächtnis.
- **Claude 1 — Entwickler / Koordinator.** Baut UI und Mechanik, pflegt diesen Plan, gibt den anderen ihre Aufträge.
- **Claude 2 — Entwickler / Code.** Baut an Render-Logik und Formatierung mit, in abgegrenzter Lane.

## Datei-Eigentum

| Bereich | Eigentümer |
|---|---|
| `savegame.json`, `knowledge/` (Inhalt) | **Claude 0** |
| `js/app.js`, `index.html`, `css/style.css`, `schema/`, Repo-Hygiene, `README.md` | **Claude 1** |
| `js/render/history.js`, `js/format.js` | **Claude 2** |
| `docs/Frontend-Contract.md` | **geteilt** (1 + 2): vor dem Schreiben neu lesen, nur den eigenen Abschnitt ändern |

Regel für geteilte Dateien: vor dem Schreiben neu einlesen, nur den eigenen Abschnitt anfassen, nie den ganzen Block neu formatieren.

## Aufgaben

### Claude 0 (Spielleiter)
- `savegame.json` wiederherstellen, Winter-Zug zu Ende (Alde-Lebenswürfe).
- `weltereignis` korrigieren: `"gewuerfelt"` → `"gewürfelt"` (mit ü), sonst bricht `schema.test.js`.
- `knowledge/` verdichtet halten, `INDEX.md` aktuell führen.
- Das neue nicht-kumulative Lage-Feld pro Stand befüllen, sobald Claude 1 Schema + Contract dafür geliefert hat.
- `lebenswelt` ist befüllt und ersetzt das alte `siedlung`-Objekt (von Claude 1 migriert, mit deiner Erlaubnis): `leben` (Stimmung, Nahrung, Trinken, Glaube, Alltag, Bräuche — die Bevölkerung über alle Siedlungen) und `siedlungen[]` (Graulandung als `hauptstadt: true`). Künftige Siedlungen kommen als weitere Einträge in `siedlungen` hinzu; genau eine trägt `hauptstadt: true`. Bevölkerungszahl bleibt in `grundgroessen.bevoelkerung`, die Sicht spiegelt sie nur.
- Optional: „Gestrandeten"-Beispielstand in `examples/`.

### Claude 1 (Entwickler / Koordinator)
1. Commit verifizieren: alte `serve.mjs` (PID 26164) beenden, e2e + visual sauber neu laufen — erst wenn Port frei und Claude 0 fertig. Danach Visual-Baselines neu erzeugen (Tab-Icons, Richtungsfarbe, Macht-/Gruppen-Bilder geändert das Aussehen).
2. Nicht-kumulatives Lage-Feld: Schema + Frontend-Contract anlegen (Befüllung macht Claude 0).
3. `README.md`: laufende Partie „Die Gestrandeten" ergänzen.
4. Repo-Hygiene: `anleitung.html` verorten, Armee-Baseline einchecken. (`_tmp_chronik.png` entfernt, `.gitignore` ergänzt — erledigt.)

Erledigt seit dem letzten Stand: Armee-Reiter + Bilder, kompakter Hero (Symbol-Leiste), `beziehungenAnsehen` in der Welt-Sicht, Tab-Icons (I–VI → Symbole), Richtungsfarbe (grün/rot für Auf-Ab und Plus/Minus an Delta, Trends, Gauges, Lage- und Hero-Werten), Bild-Erzeugung für Mächte und tragende Gruppen, neuer Reiter „Lebenswelt" als Oberbegriff (die Bevölkerung + mehrere Siedlungen mit Hauptstadt, Bild je Siedlung; Schema `lebenswelt` mit `leben` + `siedlungen[]`, Render `js/render/lebenswelt.js`). Das alte `siedlung`-Einzelobjekt wurde nach `lebenswelt.siedlungen[0]` migriert.

### Geplant (Claude 1): Icon-Register / visuelle Sprache
Ein zentrales `js/icons.js` mit je einem festen SVG pro Spielbegriff (Macht, Gruppe, Berater, Armee/Verband, Setzung, Vorhaben/Aktion, die Grundgrößen + Lagewerte). Alle Renderer ziehen ihr Symbol von dort statt inline-SVGs zu duplizieren (heute verstreut in `index.html`, `overview.js`, `app.js`). Dazu eine Legende in `anleitung.html`, die jeden Begriff mit Symbol und einer Zeile erklärt. Zweck: das Spielvokabular wird seitenübergreifend visuell wiedererkennbar. Eigenes Paket, nach dem Commit der aktuellen Arbeit.

### Claude 2 (Entwickler / Code) — erledigt
- `js/format.js`: `firstSentence` (verifiziert, kollisionsfrei am Beispielstand).
- `js/render/history.js`: `buildVerlauf` zeigt die knappe, entduplizierte Lagezeile statt des kumulativen `status.text`; leere Züge entfallen. (Behebt „immer derselbe Text".)
- `docs/Frontend-Contract.md`: `chronik-flow`/`chronik-entry` dokumentiert.
- Offen: voller `npm test` für das grüne Gesamtbild, sobald Claude 0 den Stand wiederhergestellt hat.

## Reihenfolge / Abhängigkeiten
- Beide Code-Claudes warten mit dem vollen `npm test` (inkl. `schema.test.js`), bis Claude 0 den Stand wiederhergestellt hat — sonst falsches Rot durch einen halbfertigen Live-Stand.
- Das Lage-Feld (Claude 1 Schema/Contract → Claude 0 Befüllung) ist die einzige rollenübergreifende Kette.

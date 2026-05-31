# RealmCraft-Dashboard, das Gesamtbild

Dieses Dokument beschreibt das **Gesamterlebnis und die Design-Absicht** des RealmCraft-Dashboards, damit eine andere Sitzung genau dieses Interface nachbauen kann. Es ist die *Warum*-Ebene. Die verbindlichen Details — testids, Feldnamen, DOM-Verträge — führt [`Frontend-Contract.md`](Frontend-Contract.md); bei Widerspruch gewinnt der Vertrag. Die Spielregeln stehen in [`Spielmechanik.md`](Spielmechanik.md), das Datenformat im Speicherstand und in [`Speicherstand-Format.md`](Speicherstand-Format.md).

## Was das Dashboard ist

Ein **Lagetisch des Rates**: die visuelle Spiegelung eines RealmCraft-Spielstands. Es trifft keine Spielentscheidungen und würfelt nicht — es *zeigt* den Zustand, den der Chronist (Sprachmodell oder Claude Code) in `savegame.json` schreibt. Die ASCII-Statuskonsole, die der Chronist am Ende jeder Antwort ausgibt, und dieses Dashboard sind Zwillinge: dieselben Zahlen, einmal als Text, einmal als Oberfläche.

Ein Stand pro Projekt. Das Dashboard ist eigenständig nutzbar (Stand laden, ansehen, Bilder erzeugen, exportieren), ganz ohne Terminal.

## Grundhaltung und Stil

Ruhig, dokumentarisch, **Asche und Eisen**. Monochromes Grau, ein einzelner gedämpfter Erdton als Akzent, viel Weißraum, keine grellen Farben. Die erzeugten Bilder tragen denselben Stil wie das Spiel: Tuschelavierung und Kohle auf getöntem, geborgenem Papier, eine Feldskizze aus dem Tagebuch eines überlebenden Chronisten (der genaue Prompt-Baustein steht als `meta.visualStyle` im Stand, der Kartenstil als `meta.mapStyle`). Die Chrome ist still und tritt hinter den Inhalt zurück; einzig Vorzeichen-Farben (Stärke grün, Schwäche rot, neutral grau) tragen Bedeutung.

## Architektur in Kürze

- **Reine ES-Module, kein Framework.** `js/app.js` ist Bootstrap: Hash-Routing, Datei-Upload, Einstellungen, Bildgenerierung, Export.
- **Render-Module** `js/render/*.js` füllen je eine `[data-view="…"]`-Sektion per `replaceChildren`, gebaut mit dem Helfer `el()` aus `js/components/ui.js`. Formatierungshelfer (`signed`, `roman`, `initials`) in `js/format.js`.
- **Zustand:** `js/state.js` (Store mit `setState`/`getState`/`subscribe`), `js/parse.js` (Validierung beim Laden), `js/diff.js` (Deltas für die Update-Animation), `js/store.js` (localStorage-Persistenz, `loadLast`).
- **Server:** `serve.mjs`, ein Null-Abhängigkeits-Statikserver. Beobachtet `savegame.json` und schickt bei Änderung ein **Server-Sent-Event** auf `/events` (Live-Reload). Reicht den Gemini-Key aus `.env` über `/env.js` an den Browser, ohne ihn ins Repo zu schreiben.
- **Bilder:** `js/images/gemini.js` (`generateImage`, `MODELS`), `js/images/cache.js` (`makeKey`/`cacheGet`/`cachePut`, IndexedDB mit localStorage-Spiegel für Dauerhaftigkeit).

## Laden und Live-Reload

Beim Start lädt das Dashboard zuerst den letzten Stand aus localStorage (`loadLast`), dann holt es `savegame.json` per `fetch` — die **Datei gewinnt** über den localStorage-Spiegel. Ändert der Chronist die Datei, feuert der Server das SSE, das Dashboard holt neu und rendert. So spiegelt der Browser jeden geschriebenen Zug von selbst. Ohne geladenen Stand zeigt es einen **Leerzustand** mit „Speicherstand laden“ (Datei wählen, hierher ziehen oder mit Strg+V einfügen; akzeptiert reines JSON oder hybrides Markdown mit eingebettetem ```json-Block).

## Der Rahmen

- **Kopf:** Wortmarke „RealmCraft“ mit Eyebrow „Lagetisch des Rates“. Rechts: „Speicherstand laden“, ein Kapitel/Jahr-Navigator (blättert durch die Historie der Stände), „Exportieren“, „Einstellungen“ (Gemini-Key, Modellwahl).
- **Reiterleiste** (`nav.tabs`): die sieben Sichten, per Hash erreichbar (`#/lage` usw.), aktiver Reiter hervorgehoben.
- **Hero** (persistent, auf jeder Route sichtbar, sobald ein Stand geladen ist): Badges (Kapitel, Jahreszeit + Jahr, Weltereignis offen/gewürfelt), „Das Volk“ + Reichsname, die **Kernzustand-Leiste** (Grundgrößen Nahrung/Material/Wissen/Volk und Lagewerte Verteidigung/Mobilität/Wohlstand als Icon+Zahl, Lagewerte mit Vorzeichen und Richtungsfarbe), und das Ansehen als Sterne + Titel.
- **Sichtbereich:** die umschaltbaren `[data-view]`-Sektionen.
- **Fuß:** Projektzeile (Promptotyping, DHCraft, Repo).

## Die sieben Reiter

`VIEWS = ['lage', 'lebenswelt', 'berater', 'armee', 'welt', 'karte', 'historie']`. Jeder Reiter hat ein Render-Modul und einen Vertragsabschnitt; exakte testids im Frontend-Contract.

| Reiter | Modul | Zweck und Inhalt |
|---|---|---|
| **Lage** | `render/overview.js` | Das Lagebild: erzählender Statustext, Stat-Karten der Grund- und Lagewerte mit Trends, das **Aktionsbrett** der laufenden Runde (`runde`: Haupt/Neben-Budget, gewählte Vorhaben mit Ziel/Mod/Wurf/Ergebnis). |
| **Lebenswelt** | `render/lebenswelt.js` | Die gelebte Welt: wie das Volk in seiner Siedlung lebt — Bild der Hauptstadt (generierbar), Lage, Bauten, Versorgung, ein erzählender Absatz. Liest `siedlung`, Einwohner live aus `grundgroessen.bevoelkerung`, Verteidigung aus `lagewerte`. (Jüngster Reiter.) |
| **Berater** | `render/advisors.js` | Der Rat: Porträt je Berater (generierbar), Loyalitätsmesser (−5..+5), Rolle, Ziel, Lebensstand. |
| **Armee** | `render/armee.js` | Die Streitmacht: Gesamtstärke und Moral, die Verbände (Name, Typ, Stärke, Führung über `fuehrungId`→Berater), stehende Modifikatoren, das Verluste-Logbuch. Liest `armee`. |
| **Welt** | `render/actors.js` | Diplomatie: Machtkarten (generierbares Bild, Erscheinung, Beziehungsmesser + Label, Haltung, **Profil** der Stärken/Schwächen) und die tragenden Gruppen mit ihren Sprechern. Liest `maechte` und `gruppen`. |
| **Karte** | `render/map.js` | Die Insel: generierbares Kartenbild im `mapStyle`, dazu die Orte mit Richtung und Beziehung. Liest `karte`. |
| **Chronik** | `render/history.js` | Das Gedächtnis: Historie Kapitel für Kapitel, die Setzungen (Regel-Evolution), die offenen Fäden. |

Fehlt ein optionaler Block im Stand (`armee`, `siedlung`, `maechte[].profil` …), rendert der Reiter ohne Fehler einen leeren Zustand.

## Die Bild-Pipeline (überall gleich)

Jedes Bildmotiv — Porträts, Karte, Mächte, Gruppen, Siedlung — nutzt dieselbe Kette: ein „Bild erzeugen“-Knopf ruft den passenden Handler (`onGeneratePortrait`, `onGenerateMap`, `onGenerateArmeeBild`, `onGenerateVerband`, `onGenerateMacht`, `onGenerateGruppe`, `onGenerateSiedlung`), der aus dem motivspezifischen Prompt plus `visualStyle`/`mapStyle` über `generateImage` ein Bild holt und unter einem stabilen Cache-Key (`makeKey([...])`) in IndexedDB samt localStorage-Spiegel ablegt. Ohne hinterlegten Gemini-Key (Einstellungen oder `.env` über `/env.js`) erscheint ein klarer Hinweis-Toast statt eines Fehlers. Einmal erzeugte Bilder bleiben über Sitzungen erhalten.

## Konsole und Oberfläche als Zwillinge

Was der Chronist in die ASCII-Statuskonsole schreibt (Jahreszeit, Grundgrößen, Lagewerte, Loyalitäten, Aktionsbrett, Ansehen), zeigt das Dashboard als Hero und Lage-Sicht — dieselbe Wahrheit, zweimal dargestellt. Wer das Interface nachbaut, hält diese Spiegelung ein: die Konsole ist der Textmodus desselben Lagebilds.

## Was bewusst nicht im Dashboard liegt

Keine Spiellogik (würfeln, Folgen deuten, Regeln) — das ist Sache des Chronisten. Kein Schreiben in den Stand außer Export. Der Gemini-Key wird nie in den Stand, ins Gedächtnis oder in einen Commit geschrieben; er lebt allein in `.env`/Einstellungen und wird zur Laufzeit durchgereicht.

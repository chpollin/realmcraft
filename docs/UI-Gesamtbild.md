# RealmCraft-Dashboard, das Gesamtbild

Das Dashboard ist die visuelle Spiegelung eines RealmCraft-Spielstands. Es trifft keine Spielentscheidungen und würfelt nicht. Es zeigt den Zustand, den der Chronist (ein LLM im Chat oder Claude Code im Terminal) in `savegame.json` schreibt. Die ASCII-Statuskonsole am Ende jeder Antwort des Chronisten und das Dashboard tragen dieselben Zahlen, einmal als Text und einmal als Oberfläche. Das Dashboard ist auch ohne Terminal nutzbar, um einen Stand zu laden, anzusehen, Bilder zu erzeugen und zu exportieren, mit einem Stand pro Projekt.

Verbindliche testids, Feldnamen und DOM-Verträge führt [Frontend-Contract.md](Frontend-Contract.md), bei Widerspruch gilt der Vertrag. Die Spielregeln stehen in [Spielmechanik.md](Spielmechanik.md), das Datenformat in [Speicherstand-Format.md](Speicherstand-Format.md).

## Grundhaltung und Stil

Die Oberfläche ist ruhig und monochrom. Weiß, helle Grautöne und Anthrazit als Kernfarbe bilden die Richtung Anthrazit-Licht. Tiefe entsteht durch Schichtung von grauer Seite, weißen Karten und anthrazitfarbenen Ankern. Status spricht über Glyphen (▲▼), Position, Vorzeichen und Tonwert. Farbe trägt nur die Richtung einer Veränderung, gedämpft grün für Zuwachs und gedämpft rot für Verlust.

Alle Farben, Abstände und Schriften kommen als Tokens aus `:root` in `css/style.css`, der einzigen Tokenquelle. Space Grotesk dient als Display-Schrift, Inter als Textschrift. Beide liegen mit ihren OFL-Lizenzen unter `fonts/` und werden ohne externes CDN geladen. Die Oberfläche verzichtet auf Eyebrows und stehende Erklärtexte, Abschnitte tragen echte Überschriften.

Die erzeugten Bilder folgen dem Stil der jeweiligen Partie. `meta.visualStyle` gilt für Porträts und Szenen, `meta.mapStyle` für die Karte und `meta.armeeStyle` mit `meta.visualStyle` als Rückfall für Heerschau und Verbände.

## Architektur in Kürze

- `js/app.js` ist der Bootstrap mit Hash-Routing, Datei-Upload, Einstellungen, Bilderzeugung und Verdrahtung der Module.
- Render-Module unter `js/render/*.js` füllen je eine `[data-view="…"]`-Sektion per `replaceChildren`, gebaut mit dem Helfer `el()` aus `js/components/ui.js`. `js/render/hero.js` baut die Reichsleiste über den Sichten. Formatierungshelfer wie `signed`, `roman` und `initials` liegen in `js/format.js`.
- Zustand und Laden verteilen sich auf `js/state.js` (Store mit `setState`, `getState`, `subscribe`), `js/parse.js` (Validierung beim Laden), `js/diff.js` (Deltas innerhalb derselben Partie) und `js/store.js` (Verlauf in localStorage, `loadLast`, `lastForParty`).
- `js/live.js` spiegelt im Terminalmodus `savegame.json`, `js/demo.js` lädt Demostände aus `examples/demo/manifest.json`, `js/export.js` baut das Export-Bundle mit eingebetteten Bildern.
- Die Bilder laufen über `js/images/gemini.js` (`generateImage`, `MODELS`), `js/images/cache.js` (IndexedDB mit localStorage-Spiegel), `js/images/prompts.js` (Prompts und Cache-Schlüssel ohne DOM, auch von den Werkzeugen unter `tools/` genutzt), `js/images/registry.js` (eine Zeile je Bildtyp) und `js/images/versions.js` (Versionen fortgeschriebener Bilder je Partie).
- `serve.mjs` ist ein Statikserver ohne Abhängigkeiten. Er beobachtet `savegame.json` und meldet Änderungen als Server-Sent Event auf `/events`. Den Gemini-Key aus `.env` reicht er über `/env.js` nur an Aufrufe derselben Herkunft weiter.

## Laden und Live-Reload

Beim Start lädt das Dashboard zuerst den letzten Stand aus localStorage (`loadLast`) und holt dann `savegame.json` per `fetch`. Die Datei gewinnt über den localStorage-Spiegel. Ändert der Chronist die Datei, sendet der Server das Ereignis, und das Dashboard lädt neu und rendert. Ohne Live-Datei, etwa auf GitHub Pages, lädt es den voreingestellten Demostand. Ohne jeden Stand zeigt es einen Leerzustand mit der Möglichkeit, einen Speicherstand per Dateiwahl, Drag and Drop oder Strg+V einzufügen. Akzeptiert werden reines JSON und hybrides Markdown mit eingebettetem ```json-Block.

## Der Rahmen

- Der Kopf trägt die Wortmarke RealmCraft. Rechts liegen Speicherstand laden, die Auswahl der Demostände, ein Navigator durch die Kapitelhistorie der Stände, Exportieren, Einstellungen (Gemini-Key, Modellwahl) und die Anleitung.
- Die Reiterleiste (`nav.tabs`) führt die acht Sichten, je per Hash erreichbar (`#/lage` usw.), mit hervorgehobenem aktivem Reiter.
- Der Hero ist auf jeder Route sichtbar, sobald ein Stand geladen ist. Er zeigt Kapitel, Jahreszeit mit Jahr und den Zustand des Weltereignisses, den Namen des Volkes, die Kernzustand-Leiste aus Grundgrößen (Nahrung, Material, Wissen, Volk) und Lagewerten (Verteidigung, Mobilität, Wohlstand) als Symbol und Zahl sowie das Ansehen.
- Der Sichtbereich enthält die umschaltbaren `[data-view]`-Sektionen.
- Der Fuß nennt Projekt, Anleitung und Repository.

## Die acht Reiter

`VIEWS = ['lage', 'lebenswelt', 'berater', 'armee', 'welt', 'karte', 'historie', 'recht']`. Jeder Reiter hat ein Render-Modul und einen Vertragsabschnitt, die exakten testids stehen im Frontend-Contract.

| Reiter | Modul | Inhalt |
|---|---|---|
| Lage | `render/overview.js` | Grund- und Lagewerte mit Skala, Trend und Quellen, Wesen des Volkes, stehende Modifikatoren, das Aktionsbrett der laufenden Runde (`runde`), offene Fäden und die Änderungen seit dem letzten Stand. |
| Lebenswelt | `render/lebenswelt.js` | Das Leben der Bevölkerung, die Siedlungen mit Hauptstadt, Bild je Siedlung, Bauten und Versorgung sowie der Besitz. Liest `lebenswelt` und fällt auf das ältere Einzelobjekt `siedlung` zurück. Einwohner und Verteidigung kommen live aus `grundgroessen.bevoelkerung` und `lagewerte`. |
| Berater | `render/advisors.js` | Der Rat mit Porträt je Berater, Loyalitätsmesser (−5 bis +5), Rolle, Ziel und Lebensstand. |
| Armee, beschriftet als Curriculum | `render/armee.js` | Gesamtwert und Lagesatz, die Verbände mit Zuständigkeit über `fuehrungId`, stehende Modifikatoren und ein Verlustlogbuch, mit Bildern für Gesamtbild und Verbände. Liest `armee`. Die Beschriftung verwendet seit Juni 2026 didaktische Begriffe, während Daten und Vertrag `armee` heißen. |
| Welt | `render/actors.js` | Die Mächte mit Bild, Erscheinung, Beziehungsmesser, Haltung und Profil, die tragenden Gruppen mit ihren Sprechern und das Ansehen des Reiches bei anderen (`beziehungenAnsehen`). |
| Karte | `render/map.js` | Das Kartenbild im `mapStyle`, die Karten-Chronik als Zeitleiste der Stände mit Weiterentwicklung aus dem Vorgängerbild und die Orte mit Richtung und Beziehung. Liest `karte`. |
| Chronik | `render/history.js` | Der Weg des Volkes als Zeitleiste je Jahreszeit, nach Kapiteln gruppiert, mit Ereignisbild je Eintrag, dazu die Fähigkeiten. Route und Datenfeld heißen `historie`. |
| Recht | `render/recht.js` | Die Verfassung und die Setzungen der Partie, angezeigt als Sonderregeln. Liest `verfassung` und `setzungen`. |

Fehlt ein optionaler Block im Stand, etwa `armee`, `lebenswelt` oder `maechte[].profil`, rendert der Reiter ohne Fehler einen leeren Zustand oder lässt den Block weg.

## Die Bildpipeline

Jeder Bildtyp ist in `js/images/registry.js` mit Prompt, Cache-Schlüssel, Seitenverhältnis und DOM-Ziel eingetragen. Ein Erzeugen-Knopf ruft den passenden Handler (`onGeneratePortrait`, `onGenerateMap`, `onGenerateKarteStand`, `onGenerateArmeeBild`, `onGenerateVerband`, `onGenerateMacht`, `onGenerateGruppe`, `onGenerateSiedlung`, `onGenerateEreignisbild`). Der Handler holt über `generateImage` ein Bild und legt es unter einem stabilen Schlüssel in IndexedDB samt localStorage-Spiegel ab. Die Schlüssel hängen am vollständigen Prompt, `tests/unit/keys.test.js` hält sie fest, damit bereits erzeugte Bilder auffindbar bleiben.

Porträts, Heerschau, Verbände, Mächte, Gruppen und Siedlungen lassen sich fortschreiben (`onBildFortschreiben`). Das bisherige Bild dient als Vorlage, der aktuelle Stand liefert den Kontext, und jede Fassung bleibt je Partie als wählbare Version erhalten (`onWaehleBildVersion`). Karten entwickeln sich stattdessen über die Karten-Chronik weiter, Ereignisbilder entstehen einmal je Eintrag. Ohne hinterlegten Gemini-Key erscheint ein Hinweis statt eines Fehlers. Der Export bettet alle im Browser vorhandenen Bilder ein, sodass ein exportierter Stand auf einem fremden Browser dieselben Bilder zeigt.

## Konsole und Oberfläche

Was der Chronist in die ASCII-Statuskonsole schreibt (Jahreszeit, Grundgrößen, Lagewerte, Loyalitäten, Aktionsbrett, Ansehen), zeigt das Dashboard in Hero und Lage-Sicht. Ein Nachbau hält diese Spiegelung ein, die Konsole ist der Textmodus desselben Lagebilds.

## Abgrenzung

Spiellogik wie Würfeln, Folgen deuten und Regeln anwenden bleibt beim Chronisten. Das Dashboard schreibt nur über den Export in einen Stand. Der Gemini-Key gelangt nie in den Stand, ins Gedächtnis oder in einen Commit, er lebt allein in `.env` oder den Einstellungen des Browsers.

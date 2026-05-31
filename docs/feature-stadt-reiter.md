# Auftrag: neuer Reiter „Stadt" (Hauptstadt) im Dashboard

**Für den Programmier-Claude.** Spielleiter-Teil erledigt: Der Speicherstand trägt ein neues Top-Level-Feld `siedlung`. Aufgabe ist das Frontend: ein neuer Reiter, der die Hauptstadt zeigt — **ein generierbares Bild** (wie der Karte-Reiter), die Kennzahlen, die Bauten und einen erzählenden Text. Bestehenden Frontend-Vertrag nicht brechen. Direktes Vorbild für die Bild-Erzeugung ist der **Karte-Reiter** (`js/render/map.js` + Handler `onGenerateMap` in `js/app.js`).

## Datenmodell (liegt schon in `savegame.json`)

```jsonc
"siedlung": {
  "name": "Graulandung",
  "typ": "Hauptstadt, die einzige Siedlung",
  "gegruendet": "Kapitel 1, Jahr 1",
  "prompt": "…Bild-Prompt im visualStyle…",   // für die Bild-Erzeugung
  "lage": "graue Kieselbucht; Erzklippen im Norden …",
  "bauten": ["Steinwall mit Wallgraben", "Torhaus", "Spaehtuerme", "…"],
  "versorgung": "geraeucherter Fisch, Doerrwild, Wurzeln …",
  "stimmung": "entflammt, 'Feuer in der Nacht' …",
  "beschreibung": "…erzählender Absatz, wie die Stadt aussieht und lebt…"
}
```

`siedlung` ist optional und enthält **bewusst keine** Zahlen, die anderswo leben: **Einwohner** kommt aus `grundgroessen.bevoelkerung`, **Verteidigung** aus `lagewerte.verteidigung` — der Reiter liest diese live, damit nichts doppelt gepflegt werden muss. Fehlt `siedlung`, zeigt der Reiter einen leeren Zustand ohne Fehler.

## Zu ändernde Dateien

### 1. `index.html` — Tab + Sektion
Nav-Button (Position nach Wahl, `tnum` ist dekorativ):
```html
<button class="tab" type="button" data-tab="stadt"><span class="tnum">III</span> Stadt</button>
```
Ziel-Sektion analog zu den bestehenden `[data-view="…"]`-Containern:
```html
<section class="view" data-view="stadt" hidden></section>
```

### 2. `js/app.js` — Verdrahtung
- `VIEWS` erweitern: `const VIEWS = ['lage', 'berater', 'stadt', 'armee', 'welt', 'karte', 'historie'];` (Reihenfolge frei)
- Import: `import { renderStadt } from './render/stadt.js';`
- Im Render-Block (neben `renderKarte(...)`): `renderStadt(els.views.stadt, state, handlers);`
- **Bild-Handler:** einen `onGenerateStadt` ergänzen, der **exakt wie `onGenerateMap`** funktioniert, nur mit `state.siedlung.prompt` und `state.meta.visualStyle` (statt mapStyle) als Prompt-Bausteine und einem eigenen Cache-Key (z. B. `makeKey(['stadt', state.siedlung.name, state.siedlung.prompt])`). Bild-Pipeline und Cache unverändert (`js/images/gemini.js` `generateImage`, `js/images/cache.js`).

### 3. `js/render/stadt.js` — neues Render-Modul (Muster: `render/map.js`)
```js
// Sicht "Stadt": Stadtbild (generierbar), Kennzahlen, Bauten, erzählender Text.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Stadt (data-view=stadt)".
import { el } from '../components/ui.js';

export function renderStadt(root, state, handlers = {}) {
  root.replaceChildren();
  if (!state) return;
  const s = state.siedlung || {};
  const einwohner = state.grundgroessen?.bevoelkerung?.zahl;
  const verteidigung = state.lagewerte?.verteidigung;

  // Bild + "Stadt erzeugen"-Knopf (wie der Karte-Reiter)
  const img = el('img', { class: 'stadt-image', 'data-testid': 'stadt-image',
    alt: s.name ? `Ansicht von ${s.name}` : 'Stadtansicht (noch nicht erzeugt)' });
  const genBtn = el('button', { class: 'btn primary', 'data-testid': 'generate-stadt',
    type: 'button', text: 'Stadt erzeugen', onClick: () => handlers.onGenerateStadt?.() });
  const frame = el('div', { class: 'stadt-frame' }, [img, genBtn]);

  // Kennzahlen
  const fakten = el('section', { class: 'panel pad', 'data-testid': 'stadt-fakten' }, [
    el('h3', { 'data-testid': 'stadt-name', text: s.name || 'Hauptstadt' }),
    s.typ ? el('div', { class: 'stadt-typ', text: s.typ }) : null,
    typeof einwohner === 'number' ? el('div', { 'data-testid': 'stadt-einwohner', text: `Einwohner: ${einwohner}` }) : null,
    typeof verteidigung === 'number' ? el('div', { text: `Verteidigung: ${verteidigung}` }) : null,
    s.lage ? el('div', { class: 'stadt-lage', text: s.lage }) : null,
    s.versorgung ? el('div', { class: 'stadt-versorgung', text: `Versorgung: ${s.versorgung}` }) : null,
  ]);

  // Bauten
  const bauten = (s.bauten || []).length ? el('section', { class: 'panel pad', 'data-testid': 'stadt-bauten' }, [
    el('h3', { text: 'Bauten' }),
    el('ul', {}, s.bauten.map((b) => el('li', { text: b }))),
  ]) : null;

  // Erzählung
  const text = s.beschreibung ? el('section', { class: 'panel pad', 'data-testid': 'stadt-beschreibung' }, [
    el('p', { text: s.beschreibung }),
  ]) : null;

  root.append(frame, fakten, ...(bauten ? [bauten] : []), ...(text ? [text] : []));
}
```

### 4. `css/style.css`
`.stadt-image` / `.stadt-frame` an `.map-image` / `.map-frame` anlehnen (gleiches Rahmen-/Bildformat), im Asche-/Eisen-Stil.

### 5. `schema/savegame.schema.json`
`siedlung` als optionales Objekt ergänzen (nicht in `required`): `name`, `typ`, `gegruendet`, `prompt`, `lage`, `versorgung`, `stimmung`, `beschreibung` (alle string), `bauten` (Array von strings).

### 6. `docs/Frontend-Contract.md`
Abschnitt „Stadt (data-view=stadt)" mit testids: `stadt-image`, `generate-stadt`, `stadt-name`, `stadt-einwohner`, `stadt-fakten`, `stadt-bauten`, `stadt-beschreibung`.

### 7. Tests
- `tests/visual/07-stadt.spec.js` + Snapshot (Muster: `04-karte.spec.js`).
- Bild-Erzeugung in Tests nicht real aufrufen (kein API-Key); nur Struktur/Knopf prüfen, wie beim Karte-Test.
- Prüfen, dass kein bestehender Test auf Tab-Anzahl/Reihenfolge bricht.

## Abnahmekriterien
- Neuer Reiter „Stadt", per `#/stadt` erreichbar, Tab-Highlight korrekt.
- Zeigt Stadtbild mit „Stadt erzeugen"-Knopf (gleiche Bild-Pipeline wie die Karte), Name/Typ, **live** Einwohner und Verteidigung, Lage, Versorgung, die Bauten-Liste und den erzählenden Text aus `siedlung.beschreibung`.
- Speicherstand ohne `siedlung` lädt fehlerfrei (leerer Zustand).
- Bestehende Reiter und Tests grün; Live-Reload spiegelt Änderungen an `siedlung` sofort.

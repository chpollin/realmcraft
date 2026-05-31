# Auftrag: neuer Reiter „Armee" im Dashboard

**Für den Programmier-Claude.** Der Spielleiter-Teil (Datenmodell + Spielzustand) ist erledigt: Der Speicherstand trägt bereits ein neues Top-Level-Feld `armee`. Aufgabe ist nur noch das Frontend: ein neuer Reiter, der `armee` anzeigt. Bricht nicht den bestehenden Frontend-Vertrag.

## Datenmodell (liegt schon in `savegame.json`)

```jsonc
"armee": {
  "gesamt": 85,                        // Gesamtzahl kampffaehiger Koepfe
  "moral": "gefestigt nach der Rede",  // kurzer Lage-Satz
  "verbaende": [                        // die Truppenteile
    {
      "id": "orkschar",                // stabil, klein, ohne Umlaute
      "name": "die Orkschar",
      "typ": "Sturmtruppe",            // Sturmtruppe | Kundschafter | Aufgebot | ...
      "fuehrungId": "grask",           // Verweis auf berater[].id (Anfuehrer)
      "staerke": 35,                    // Kopfzahl
      "verfassung": "kampfbereit, einige Wunden",
      "ausruestung": "geflickte Ruestung, gerettete Waffen",
      "hinweis": "Rueckgrat im offenen Kampf; 6 am Wall gefallen"
    }
    // ... weitere Verbaende
  ],
  "stehendeModifikatoren": [           // kennwert { key, value }, wie sonst im Schema
    { "key": "hinterm Wall", "value": 2 },
    { "key": "im offenen Wald", "value": -1 }
  ],
  "verluste": [                         // Logbuch der Verluste
    { "zeit": "Sommer Jahr 1", "zahl": 6, "anlass": "Schaedelklan-Ueberfall am Wall" }
  ]
}
```

`armee` ist optional: Faelle ohne Feld muessen ohne Fehler durchlaufen (Reiter zeigt dann einen leeren Zustand).

## Zu ändernde Dateien

### 1. `index.html` — Tab + Sektion
Nav-Button nach „Berater" einfügen (Numerale sind dekorativ, `tnum` anpassen):
```html
<button class="tab" type="button" data-tab="armee"><span class="tnum">III</span> Armee</button>
```
Und eine Ziel-Sektion analog zu den bestehenden `[data-view="…"]`-Containern anlegen:
```html
<section class="view" data-view="armee" hidden></section>
```
(Eine bestehende View-Sektion als Vorlage kopieren; `js/render/armee.js` füllt sie per `replaceChildren`.)

### 2. `js/app.js` — Verdrahtung
- `VIEWS` erweitern: `const VIEWS = ['lage', 'berater', 'armee', 'welt', 'karte', 'historie'];`
- Import ergänzen: `import { renderArmee } from './render/armee.js';`
- Im `setState`/Render-Block neben `renderBerater(...)`:
  `renderArmee(els.views.armee, state, handlers);`
- `els.views` wird automatisch aus `VIEWS` über `[data-view="…"]` gebildet — keine weitere Verdrahtung nötig.

### 3. `js/render/armee.js` — neues Render-Modul (Muster: `render/advisors.js`)
```js
// Sicht "Armee": Gesamtstärke, Verbände, stehende Modifikatoren, Verluste.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Armee (data-view=armee)".
import { el } from '../components/ui.js';
import { signed } from '../format.js';

export function renderArmee(root, state, handlers = {}) {
  root.replaceChildren();
  if (!state) return;
  const a = state.armee || { verbaende: [] };
  const beraterById = Object.fromEntries((state.berater || []).map((b) => [b.id, b]));

  // Kopf: Gesamtstärke + Moral
  root.append(el('section', { class: 'panel pad', 'data-testid': 'armee-kopf' }, [
    el('h3', { text: 'Heerschau' }),
    el('span', { class: 'eyebrow', 'data-testid': 'armee-gesamt', text: `Kampffähig ${a.gesamt ?? 0}` }),
    a.moral ? el('div', { class: 'armee-moral', text: a.moral }) : null,
  ]));

  // Verbände
  const list = (a.verbaende || []).map((v) => el('article', {
    class: 'verband', 'data-testid': 'verband', 'data-id': v.id || '',
  }, [
    el('div', { class: 'verband-top' }, [
      el('span', { class: 'verband-name', 'data-testid': 'verband-name', text: v.name || '' }),
      el('span', { class: 'verband-typ', text: v.typ || '' }),
      el('span', { class: 'verband-staerke', 'data-testid': 'verband-staerke', text: `${v.staerke ?? 0}` }),
    ]),
    v.fuehrungId && beraterById[v.fuehrungId]
      ? el('div', { class: 'verband-fuehrung', text: `Führung: ${beraterById[v.fuehrungId].name}` }) : null,
    v.verfassung ? el('div', { class: 'verband-verfassung', text: v.verfassung }) : null,
    v.ausruestung ? el('div', { class: 'verband-ausruestung', text: v.ausruestung }) : null,
    v.hinweis ? el('div', { class: 'verband-hinweis', text: v.hinweis }) : null,
  ]));
  root.append(el('section', { class: 'panel pad armee-verbaende', 'data-testid': 'armee-verbaende' }, list));

  // Stehende Modifikatoren (kennwert)
  if ((a.stehendeModifikatoren || []).length) {
    root.append(el('section', { class: 'panel pad' }, [
      el('h3', { text: 'Stehende Modifikatoren' }),
      ...a.stehendeModifikatoren.map((k) =>
        el('div', { class: 'armee-mod', text: `${k.key}: ${signed(k.value)}` })),
    ]));
  }

  // Verluste-Logbuch
  if ((a.verluste || []).length) {
    root.append(el('section', { class: 'panel pad', 'data-testid': 'armee-verluste' }, [
      el('h3', { text: 'Verluste' }),
      ...a.verluste.map((x) =>
        el('div', { class: 'armee-verlust', text: `${x.zeit}: ${x.zahl} (${x.anlass})` })),
    ]));
  }
}
```

### 4. `css/style.css`
Stile für `.verband`, `.armee-verbaende`, `.verband-staerke` usw. — am besten an `.advisor-grid`/Karten anlehnen, im Asche-/Eisen-Stil des Spiels.

### 5. `schema/savegame.schema.json`
`armee` als optionales Objekt ergänzen (nicht in `required`): `verbaende` als Array von Objekten mit `id`, `name`, `typ`, `fuehrungId`, `staerke` (integer), `verfassung`, `ausruestung`, `hinweis`; `gesamt` (integer), `moral` (string), `stehendeModifikatoren` als kennwert-Array, `verluste` als Array.

### 6. `docs/Frontend-Contract.md`
Abschnitt „Armee (data-view=armee)" mit den testids: `armee-kopf`, `armee-gesamt`, `armee-verbaende`, `verband`, `verband-name`, `verband-staerke`, `armee-verluste`.

### 7. Tests
- `tests/visual/06-armee.spec.js` + Snapshot (Muster: `02-berater.spec.js`).
- Prüfen, dass kein bestehender Test auf der Tab-Anzahl/Reihenfolge bricht.
- Optional Unit-Test: `renderArmee` mit/ohne `armee`-Feld rendert ohne Fehler.

## Abnahmekriterien
- Neuer Reiter „Armee" sichtbar, per Hash `#/armee` erreichbar, Tab-Highlight korrekt.
- Zeigt Gesamtstärke, jeden Verband (Name, Typ, Stärke, Führung über `fuehrungId`→Berater), stehende Modifikatoren und das Verluste-Logbuch.
- Speicherstand ohne `armee` lädt fehlerfrei (leerer Zustand).
- Bestehende Reiter und Tests unverändert grün; Live-Reload spiegelt Änderungen an `armee` sofort.

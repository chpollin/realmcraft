# Auftrag: das Machtprofil im Welt-Reiter sichtbar machen

**Für den Programmier-Claude.** Der Spielleiter-Teil (Datenmodell + Inhalt) ist erledigt: Jede Macht im Speicherstand trägt seit jeher ein `profil` — einen kleinen Satz Kennwerte (Stärken und Schwächen). Der Welt-Reiter zeigt es **bisher gar nicht**: [js/render/actors.js](../js/render/actors.js) liest `m.profil` nie. Aufgabe ist nur das Frontend: das `profil` je Machtkarte anzeigen, lesbar und im Maßstab. Bestehenden Frontend-Vertrag nicht brechen.

## Warum das die wichtigste fehlende Information ist

Die Machtkarte zeigt heute Name, Typ, `erscheinung`, den Beziehungsmesser und `haltung` — alles Stimmung. Das `profil` ist die **strategische** Information: woran eine Macht stark ist und, vor allem, ihre **eine ausnutzbare Schwäche**. Das ist der Hebel, den der Rat sucht. Beispiele aus dem laufenden Stand:

- das Finstere: Reichweite 3 · Hunger 3 · **Gestalt zum Schlagen −2** (kaum zu treffen)
- das Eisenkonkordat: Technik 3 · Heer 2 · **Magie −2** (blind für Zauber)
- die Stillen: Magie 3 · Wissen der Insel 2 · **Zahl −2** (sie sind wenige)
- die Schädelklans: Wildheit 2 · Zahl 1 · **Ordnung −2** (zersplittert)

Der negative Wert ist jeweils die Erzählung *und* der Spielhebel — er muss als Schwäche **erkennbar** sein, nicht als eine Zahl unter anderen untergehen.

## Datenmodell (liegt schon in `savegame.json`)

```jsonc
"maechte": [
  {
    "id": "das-finstere",
    "name": "das Finstere",
    "typ": "Schattenmacht ueber See",
    "erscheinung": "…",
    "profil": [                                  // <-- bisher nicht gerendert
      { "key": "Reichweite", "value": 3 },
      { "key": "Hunger", "value": 3 },
      { "key": "Gestalt zum Schlagen", "value": -2 }
    ],
    "beziehung": { "wert": -3, "label": "Todfeind, noch fern" },
    "haltung": "…"
  }
]
```

`profil` ist ein Array von `kennwert` (`{ key: string, value: integer }`), genau wie sonst im Schema. Es ist optional: Mächte ohne `profil` rendern ohne Fehler (kein Profil-Block).

**Maßstab.** Die Profilwerte liegen bewusst auf einer breiteren Achse als die −2..+2-Aktionsmodifikatoren: etwa **−2 bis +3**, wobei `+` eine Stärke und `−` eine ausnutzbare Schwäche bezeichnet. Es ist eine *Macht-Größenordnung*, kein Würfelmodifikator — darum die eigene Skala. Eine kurze Legende im Reiter macht das klar.

## Zu ändernde Dateien

### 1. `js/render/actors.js` — Profil-Block je Machtkarte
Im `map`-Callback der Mächte, **nach** `pdesc` (erscheinung) und **vor** `rel` (Beziehung), einen Profil-Block einfügen. Vorschlag:

```js
import { signed } from '../format.js';   // bereits vorhandenes Helfermodul

// … innerhalb der map((m) => { … }) …
const profil = (m.profil || []).length
  ? el('div', { class: 'profil', 'data-testid': 'power-profil' },
      m.profil.map((k) => {
        const dir = k.value > 0 ? 'up' : k.value < 0 ? 'down' : 'flat';
        const schwaeche = k.value < 0;        // die ausnutzbare Schwäche
        return el('span', {
          class: `profil-mod ${dir}${schwaeche ? ' schwaeche' : ''}`,
          'data-testid': 'profil-mod',
          title: schwaeche ? `Schwäche: ${k.key}` : k.key,
        }, [
          el('span', { class: 'profil-key', text: k.key }),
          el('span', { class: 'profil-val', text: signed(k.value) }),
        ]);
      }))
  : null;
```

Diesen `profil`-Knoten in die Karte einreihen (zwischen `pdesc` und `rel`). Reihenfolge der Werte **so lassen, wie im Stand** — sie ist bewusst Stärke→Schwäche gesetzt.

### 2. `css/style.css`
- `.profil` als kleine, umbrechende Chip-Reihe (flex-wrap, gap), an die Karten-Optik angelehnt.
- `.profil-mod` als Chip: `profil-key` gedämpft, `profil-val` betont; Vorzeichenfarbe wie die Kernzustand-Leiste im Hero (`.core-val.up` / `.down` / `.flat` in `app.js`/`style.css`) — grün für Stärke, rot/akzent für Schwäche, neutral für 0. Konsistenz mit dem schon gesetzten Vorzeichen-Farbschema.
- `.profil-mod.schwaeche` zusätzlich hervorheben (z. B. dünner Rahmen oder ein „⚑/▼“-Marker), damit die ausnutzbare Schwäche sofort ins Auge fällt.
- Asche-/Eisen-Stil des Spiels halten.

### 3. Kleine Legende (einmal pro Reiter)
Unter der Sektions-Unterzeile „Nachbarvölker und Großmächte …“ eine knappe Legende ergänzen, z. B.:
`Profil: Stärken (+) und Schwächen (−) einer Macht; Maßstab −2 bis +3.`
testid `power-profil-legende`.

### 4. `schema/savegame.schema.json`
Falls `profil` an `maechte[]` noch nicht beschrieben ist: als optionales Array von `kennwert` (`{ key: string, value: integer }`) ergänzen, **nicht** in `required`. (Bricht keine bestehenden Stände, das Feld existiert längst in den Daten.)

### 5. `docs/Frontend-Contract.md`
Den Abschnitt „Welt (data-view=welt)“ um die neuen testids erweitern: `power-profil`, `profil-mod`, `power-profil-legende`. Notieren: Profilwerte signiert, negative Werte als Schwäche markiert, Block entfällt ohne `profil`.

### 6. Tests
- `tests/visual/03-welt.spec.js` (+ Snapshot) aktualisieren: Profil-Chips sind sichtbar, die Schwäche ist markiert.
- Prüfen, dass eine Macht **ohne** `profil` fehlerfrei und ohne leeren Block rendert.
- Sicherstellen, dass kein bestehender Welt-Test an den neuen Knoten bricht.

## Abnahmekriterien
- Jede Machtkarte zeigt ihr `profil` als Chip-Reihe zwischen Erscheinung und Beziehung.
- Werte sind signiert; Stärke/Schwäche/Neutral sind farblich unterschieden; die **negative** Schwäche ist klar als solche markiert.
- Eine kurze Legende erklärt Skala und Bedeutung einmal pro Reiter.
- Mächte ohne `profil` rendern fehlerfrei (kein Block).
- Bestehende Reiter und Tests grün; Live-Reload spiegelt Änderungen am `profil` sofort.

## Ausblick (nicht Teil dieses Auftrags)
Drei weitere Verbesserungen am Welt-Reiter stehen noch an und werden separat beauftragt, wenn der Spielleiter sie vorbereitet hat: **Wesen vs. Lage trennen** (erscheinung statisch, haltung dynamisch beschriften), **Wissen statt Allwissen** (unbegegneten Mächten wie dem Konkordat das Profil verschleiern, Karte als Gerücht markieren) und **Beziehungs-Trend** (Pfeil + Anlass der letzten Änderung, analog zu den Trends der Lage-Sicht).

# Regelkern

Der Regelkern legt die bindenden Regeln des rundenbasierten RealmCraft fest, wie sie der deterministische Kern unter `engine/` ausführt. Er löst [Spielmechanik.md](Spielmechanik.md) ab, das als Referenz des Spielleiterverfahrens unverändert bleibt. Wozu die Regeln dienen, beschreibt [Spieldesign.md](Spieldesign.md). Dateien, Formate und Grenzen der Agenten regelt [Agentenvertrag.md](Agentenvertrag.md), die Umsetzungsfolge [RealmCraft-Plan.md](RealmCraft-Plan.md), die Begründungen der Grundsatzentscheidungen [Entscheidungen.md](Entscheidungen.md).

Die Datenverträge sind die Schemata unter `engine/schemas/` mit den Änderungen aus [Vertragsaenderungen.md](Vertragsaenderungen.md). Bei Abweichung zwischen diesem Dokument und einem Schema gilt das Schema, und die Abweichung wird hier nachgezogen. Was dieses Dokument braucht und die Schemata noch nicht führen, steht unter [Offene Vertragsfragen](#18-offene-vertragsfragen) und gilt bis zu seiner Aufnahme als Vorschlag. Gewichte und Stufentabellen des Machtbudgets stehen ausschließlich in `engine/schemas/effects.js` (`WEIGHTS`, `SPEC_WEIGHTS`, `TIERS`, als `TUNING` markiert). Weitere Startwerte heißen hier `tuning.<name>`. Sie stehen in `regeln.json/tuning`, soweit das Schema sie führt (`maxTier`, `lossAfter`, `newMemberLoyalty`, `slots`, `limits`, `expected`), alle übrigen bis zu einer Erweiterung des Schemas als `TUNING`-Tabelle im zuständigen Kernmodul. Alle Startwerte gelten für alle Völker gleich und werden durch die Balancesimulation festgelegt (siehe [Plan](RealmCraft-Plan.md#teststrategie)).

## 1 Grundsätze

1. Ein Zustand, eine Wahrheit. `state.json` schreibt allein der Kern über `engine/cli.mjs` oder die Serverendpunkte, die dieselben Funktionen aufrufen. Ansicht, Agentenaufträge und Chronik sind daraus abgeleitet oder Vorschläge an ihn (D10).
2. Jede Zahl stammt aus einer Regel. Alle Werte sind ganze Zahlen. Jede Zufallsziehung kommt aus dem gespeicherten RNG (sfc32) oder aus einem offen gemeldeten Spielerwurf (D5). Erzählung setzt nie einen Wert.
3. Alles innerhalb einer Runde liest den Eröffnungsstand `S0`. Kosten werden gegen den Eröffnungsvorrat geprüft, Wirkungen neuer Dinge beginnen in der Folgerunde. Dadurch sind alle Proben einer Runde voneinander unabhängig und in beliebiger Reihenfolge würfelbar.
4. Gleichbehandlung. Spieler und KI-Völker teilen Zustandsform, Befehlskatalog, Inhaltsbudget, Vorschlagsgrenzen und Sichtfilter. Nur `controller` unterscheidet sie.
5. Herkunft. Jede Zustandsänderung erzeugt einen Eintrag im Ereignisprotokoll mit Quelle, Runde, Ziel, Änderung und Grund (D7, Abschnitt 15).

Namenskonvention. Mechanische Bausteine (Primitive, Issue-Codes, allgemeine Befehle, Ergebnisbänder, Agenten-ids) tragen englische ids. Spielbegriffe mit Glossareintrag behalten ihre deutsche id, also Module (`lebensweise`, `handel`, `magie`, `militaer`), Entwicklungsarten, Ressourcen, Lagewerte und der Befehl `machtprobe`. Beschriftungen kommen ausschließlich aus `labels.json`. Deutsche Rollennamen im Text bezeichnen immer die Agenten-id des Schemas, Welt-Agent `world`, Rats-Agent `council`, Rivalen-Agent `rival`, Forschungs-Agent `research`, Chronist `chronicler`, Kohärenzrichter `judge-coherence`, Balancerichter `judge-balance`, Erzählrichter `judge-narrative`.

## 2 Welt, Regeln und Kampagne

Ein Weltpaket liegt unter `welten/<welt>/` (D3).

| Datei | Inhalt | Schema | Eigentum |
|---|---|---|---|
| `welt.json` | Generatorparameter, Geländearten mit Bewegungskosten, Sicht, Bebaubarkeit und Grunderträgen, Lagerstätten, Startregeln, Namensbausteine | `engine/world` (Pflichtschlüssel in `WELT_REQUIRED_KEYS`) | Lane W |
| `regeln.json` | Kalender, Ressourcen mit Wert `v` und Lagergrenze, Lagewerte mit Basis, Tag-Vokabular mit Breite, Völkervorlagen (Spielervolk Bergnomaden, KI-Völker Schädelklan und Talbund), Ratsvorlagen, `tuning`, KI-Profile, Modulbindungen | `regeln` | Inhaltslane |
| `labels.json` | alle sichtbaren Texte einschließlich der Sichtbeschriftungen | `labels` | Inhaltslane |
| `style.json` | Bildstil und Akzent-Tokens | `style` | Inhaltslane |
| `content/entwicklungen.json` | Seed-Entwicklungen und Pool | `entwicklungen` | Inhaltslane |
| `content/ereignisse.json` | Ereigniskarten je Band | `ereignisse` | Inhaltslane |
| `content/bestimmungen.json` | Start-Bestimmungen und Bestimmungsvorlagen | `bestimmungen` | Inhaltslane |

Eine Kampagne heftet das Weltpaket per Hash an (`campaign.world.hash`). Die Karte selbst wird nie gespeichert. Sie entsteht deterministisch aus `createWorld({ seed, pack })` mit `map.seed` und dem angehefteten `welt.json`. Eine geänderte Weltdatei wirkt erst in einer neuen Kampagne.

Ressourcen stehen in `regeln.json/resources` mit `id`, Wert `value` (das `v` des Budgets), Lagergrenze `cap` und optional dem Modul, das sie einführt. Modulrollen (`currency` des Handels, `source` der Magie) werden über `moduleBindings` und `module.activate` an eine Ressource gebunden. Unbekannte Ressourcenschlüssel sind ein Validierungsfehler. Forschung ist ein Fluss je Runde ohne Vorrat (Abschnitt 8).

## 3 Zustandsmodell

### Gesamtform

Das Schema ist `campaign` in `engine/schemas/campaign.js`.

```json
{
  "format": "realmcraft-campaign",
  "version": 1,
  "rulesVersion": 1,
  "campaign": { "id": "hochland-1", "world": { "id": "hochland", "version": "0.1.0", "hash": "9f2c0a1b44e7d310" }, "player": "bergnomaden" },
  "rev": 14,
  "turn": 6,
  "phase": "planning",
  "rng": { "algo": "sfc32", "s": [2654435769, 1013904223, 1664525, 22695477] },
  "map": {
    "seed": 48213,
    "packId": "hochland",
    "control": { "0:0:1": "bergnomaden", "1:0:0": null },
    "settlements": [ { "id": "lager-1", "name": "Winterlager am Grauhang", "people": "bergnomaden", "kind": "camp", "tile": "3,-2", "regionId": "0:0:1", "mobile": true, "buildings": [] } ],
    "known": { "bergnomaden": { "3,-2": "visible", "4,-2": "seen" } },
    "features": { "5,-4": { "id": "glutschlot-1", "kind": "quelle", "name": "Glutschlot", "tags": ["quelle", "feuer"], "resources": [ { "key": "glut", "amount": 30 } ], "since": 4, "source": "agent:world" } }
  },
  "peoples": { "bergnomaden": { }, "schaedelklan": { }, "talbund": { } },
  "relations": { "bergnomaden|talbund": { "value": 1, "atWar": false, "since": 3, "contact": 2 } },
  "modules": { "handel": { "offers": [], "contracts": [], "prices": { "salz": 3 } } },
  "eventPool": ["ev-lawine@1", "ev-wanderhaendler@1"],
  "eventDraws": { "bergnomaden": { "roll": 4, "band": 2, "card": null } },
  "pendingChoices": [],
  "ingested": { "research.bergnomaden.T5": "a71c55e0b2d94f18" },
  "chronicle": [ ],
  "status": "playing",
  "result": null,
  "derived": { "bergnomaden": { "caps": { "nahrung": 12, "holz": 8 } } }
}
```

`map` hält nur das Veränderliche (D2). `control` ist nach Region-id (`cq:cr:i` aus `regions.js`) geschlüsselt, `settlements` ist eine Liste mit Tile und Region, `known` hält je Volk und Tile den Zustand `seen` oder `visible` in der Form von `reveal()` der Welt-API, `features` hält je Tile höchstens ein Merkmal, das der Welt-Agent über einen geprüften Vorschlag hinzugefügt hat. Merkmale, die der Generator aus Lagerstätten erzeugt, sind aus dem Seed ableitbar und werden nicht gespeichert.

`phase` ist `planning`, `resolving` oder `agents` (Abschnitt 14). Relationsschlüssel sind die beiden Volks-ids alphabetisch mit `|` verbunden. Ein Relationseintrag entsteht beim ersten Kontakt, also wenn ein Volk eine Einheit oder Siedlung des anderen sichtbar hat. `contact` ist die Kontaktstufe, ab 1 gesichtet, ab 2 begegnet. Handel und Diffusion verlangen Stufe 2. `eventDraws` hält je Volk Wurf, Band und gewählte Karte des Weltereignisses der laufenden Auflösung (Abschnitt 12), `pendingChoices` die offenen Entscheidungen aus Ereigniskarten mit Optionen, `result` nach dem Ende der Kampagne Sieger und Grund (Abschnitt 13). `chronicle` ist das Ereignisprotokoll (Abschnitt 15). `derived` wird bei jedem Schreiben neu berechnet, ist nie Eingabe einer Regel und geht nicht in den Zustands-Hash ein. Es hält je Volk unter anderem die Lagergrenzen (`derived[people].caps`).

### Volk

Jedes Volk hat exakt diese Form, ob vom Spieler oder von einem Agenten geführt.

```json
{
  "id": "bergnomaden",
  "name": "Hochvolk der Grauen Kämme",
  "controller": "player",
  "agentProfile": null,
  "identity": {
    "wesensart": { "plus": { "tag": "wege", "text": "…" }, "minus": { "tag": "bleiben", "text": "…" } },
    "ausrichtung": "herde",
    "appearance": "…"
  },
  "lebensweise": "wanderhirten@1",
  "population": { "core": 4, "growthPoints": 2, "assigned": { "nahrung": 2, "holz": 1, "research": 1 } },
  "resources": { "nahrung": 9, "holz": 4, "stein": 1, "herden": 6 },
  "standing": 1,
  "developments": {
    "known": [ { "ref": "wanderhirten@1", "since": 0, "effectiveFrom": 0, "state": "active", "suspendedSince": null } ],
    "research": [ { "ref": "saumpfade@1", "progress": 4 } ],
    "candidates": [ { "ref": "filzjurten@1", "offeredAt": 4, "expiresAt": 8, "origin": "pool" } ],
    "requests": [ { "turn": 5, "tags": ["handel", "salz"], "note": "…" } ],
    "instituted": ["sippenrat@1"]
  },
  "units": [ { "id": "u-bn-2", "type": "reiterschar@1", "strength": 2, "tile": "4,-3", "state": "ready", "since": 3 } ],
  "council": [ { "id": "m-1", "name": "Ulrun", "role": "hirtenaelteste", "goal": { "text": "…", "favor": ["nomadisch", "herde"], "oppose": ["mauer"] }, "loyalty": 3, "hollow": false, "age": 58, "lifeStage": "lebensabend", "leader": false, "appearance": "…" } ],
  "practice": { "ledger": [ { "turn": 5, "tags": { "herde": 2, "weg": 1 } } ] },
  "tokens": [ { "id": "tok-t4-1", "kind": "breakthrough", "tags": ["weg"], "turn": 4, "source": "T4:bergnomaden:o2" } ],
  "statuses": [ { "id": "autoritaet", "effects": [ { "op": "probe.mod", "tags": ["befohlen"], "amount": 1 } ], "until": null, "endsOn": "setback" } ],
  "meters": { "begehrlichkeit": 2 },
  "shortfall": { "nahrung": 0 },
  "bestimmung": { "ref": "ueberdauern@1", "adoptedAt": 0, "milestones": [ { "id": "weiden", "reached": true, "reachedAt": 3, "progress": 0 }, { "id": "winter", "reached": false, "reachedAt": null, "progress": 2 }, { "id": "wintersiedlung", "reached": false, "reachedAt": null, "progress": 0 } ], "history": [] },
  "modules": { "lebensweise": { "transition": null }, "magie": { "withdrawal": {} } }
}
```

Erläuterungen, die das Schema nicht zeigt:

- `lebensweise` verweist auf eine bekannte Entwicklung der Art `lebensweise`. Deren `spec` legt Siedlungsart, Zug, Verbrauch und Herdenregeln fest (Abschnitt 11).
- `population.core` zählt Sippen als Spieleinheit, `population.growthPoints` die Wachstumspunkte zur nächsten Sippe, `population.assigned` die Arbeitsverteilung der laufenden Runde (Abschnitt 8).
- `shortfall` hält je Ressource den ungedeckten Fehlbetrag der letzten Runde, jeder Fehlbetrag erzeugt zusätzlich einen Protokolleintrag der Art `shortfall`.
- `developments.research` hält bis zu drei Forschungsprojekte. Forschung fließt in das erste, die übrigen behalten ihren Fortschritt.
- Lagewerte berechnet der Kern bei Bedarf aus `regeln.json/stats` plus `stat.mod` aller aktiven Entwicklungen und Status und kappt sie auf −2..+3.
- Institutionen sind bekannte Entwicklungen der Art `institution`, die zusätzlich in `instituted` stehen.
- `meters` hält die Werte der stehenden `meter`-Primitive, nach Meter-id geschlüsselt.
- `practice.ledger` ist ein Ringpuffer der letzten acht Runden und die mechanische Grundlage dafür, dass der Entwicklungsbaum aus dem Tun des Volkes wächst (Abschnitt 8).

### Invarianten

Was ein Schema nicht ausdrücken kann, prüft `validate.js` beim Laden und nach jedem Schreiben:

- Jeder `ref` existiert in der Bibliothek, jede Region-id und jeder Tile-Schlüssel ist in der Welt gültig, das Tile einer Siedlung liegt in ihrer `regionId`.
- Ressourcenschlüssel stehen in `regeln.json/resources`, Vorräte liegen zwischen 0 und Lagergrenze plus dem Überschuss der laufenden Runde.
- Genau ein Ratsmitglied je Volk hat `leader: true`.
- Jede Siedlung liegt auf einem bebaubaren Tile einer Region, die ihr Volk kontrolliert.
- Die Lebensweise des Volkes steht unter `developments.known`.

## 4 Karte

### Tiles und Regionen

Die Karte ist eine wachsende Hex-Welt aus `engine/world` (D2). Tiles tragen Gelände, Bewegungskosten, Sichtmodifikator, Sichtsperre, Bebaubarkeit und Grunderträge aus `welt.json`. Regionen aus `regions.js` sind die Einheit von Kontrolle, Ertrag und Besiedlung. Der Kern nutzt ausschließlich die Funktionen der Welt-API (`createWorld`, `tileAt`, `ensureChunk`, `chunkOf`, `regionOf`, `regionInfo`, `reveal`, `findPath`, `reachable`, `findStart`, `placePeoples`, Hex-Helfer). Zwei Erweiterungen braucht der Kern von Lane W, die Geländezählung über die ganze Region (`regionInfo(...).terrainCounts`) und die Nachbarschaft der Regionen (`regionNeighbors(world, id)`), beide deterministisch und unabhängig davon, welche Chunks schon erzeugt sind.

### Kontrolle

Ein Volk erwirbt die Kontrolle einer Region durch eine eigene Siedlung oder ein Lager in ihr, durch einen gewonnenen Kampf oder durch die Wirkung `region.control`. Die Kontrolle bleibt, bis ein anderes Volk die Region auf einem dieser Wege übernimmt oder `region.control` sie auf `null` setzt. Eine Region hat höchstens einen Kontrolleur. Gründet ein Volk ohne Kampf in einer fremd kontrollierten Region, ist das ein Issue `target`.

Bewirtschaftet werden nur kontrollierte Regionen, die eine eigene Siedlung enthalten oder an eine Region mit eigener Siedlung grenzen.

### Ertrag einer Region

Der Ertrag einer bewirtschafteten Region `R` für eine Ressource `res` in der Jahreszeit `s` ist

```
ertrag(R, res, s) = floor( Σ_terrain count(R, terrain) × (yield(terrain, res) + yieldMod(terrain, res, s)) × saison(res, terrain, s)
                           / tuning.tilesPerYield )
                  + Σ Lagerstätten und Merkmale in R mit Ressource res, je tuning.depositYield
```

`yield(terrain, res)` stammt aus `welt.json`, `yieldMod` ist die Summe der `yield.mod` des Kontrolleurs für dieses Gelände und diese Jahreszeit, `saison` (0, 1 oder 2) ist ein `TUNING`-Wert je Ressource, Gelände und Jahreszeit. Der Ertrag ist eine Obergrenze. Tatsächlich geerntet wird, was die Sippen schaffen (Abschnitt 8).

### Sicht und Nebel

`known` hält je Volk die gesehenen Tiles. `visible` sind in der laufenden Runde die Tiles im Sichtradius eigener Siedlungen und Einheiten, berechnet mit `reveal` aus `tuning.sight` plus `sight.mod` plus `sightModifier` des Beobachter-Tiles, gesperrt durch Gelände mit `blocksSight`. Am Rundenende fallen nicht mehr sichtbare Tiles auf `seen` zurück. `seen` zeigt Gelände und feste Merkmale, `visible` zusätzlich fremde Einheiten und Siedlungen. Die Projektion für ein Volk (Abschnitt 16) folgt dieser Unterscheidung.

### Merkmale

Merkmale sind Orte auf Tiles, etwa Quellen, Ruinen, Schreine oder Pässe, mit `id`, `kind`, `name`, `tags` und optionalen Ressourcen. Generierte Merkmale kommen aus den Lagerstätten in `welt.json`. Der Welt-Agent kann neue Merkmale vorschlagen ([Agentenvertrag](Agentenvertrag.md#vorschlag)). Der Validator lässt ein vorgeschlagenes Merkmal nur zu, wenn sein Tile keinem Volk bekannt ist, mindestens `tuning.featureMinDistance` Tiles von jeder Siedlung entfernt liegt, seine Art im Vokabular steht und seine Ressourcen als Fluss gewichtet höchstens `tuning.featureMaxWeight` ergeben.

## 5 Befehle

### Entwurf

Jedes Volk hat je Runde einen Entwurf `drafts/<peopleId>.json` nach dem Schema `draft`.

```json
{
  "format": "realmcraft-draft",
  "version": 1,
  "people": "bergnomaden",
  "turn": 6,
  "baseRev": 14,
  "orders": [
    { "id": "o2", "type": "migrate", "params": { "tile": "6,-5" } },
    { "id": "o3", "type": "explore", "params": { "unit": "u-bn-2", "tile": "9,-7" }, "venture": true },
    { "id": "o4", "type": "institute", "params": { "development": "geleitrecht@1" }, "lead": "m-3" }
  ],
  "assign": { "nahrung": 2, "holz": 1, "research": 1 },
  "choices": { "ev-lawine@1": "fliehen" },
  "mandate": { "o4": "decree" },
  "rolls": {
    "T6:bergnomaden:o3": { "value": 7, "fingerprint": "c0de4a1b2c3d4e5f" },
    "T6:bergnomaden:event": { "value": 4, "fingerprint": "e1f09a8b7c6d5e4f" }
  },
  "withdrawn": [],
  "sealed": false
}
```

`assertDraft` prüft die genaue Schlüsselmenge und die Typen und wirft bei Formfehlern. Parameter jedes Befehls prüft die Registratur des Kerns oder des Moduls. Inhaltliche Mängel meldet die Vorschau als Issues. Jeder Befehl kann `lead` tragen, das Ratsmitglied, das ihn führt, und `venture: true`, das eine Hauptaktion zum Wagnis erklärt (Abschnitt 6). `assign` ist die Arbeitsverteilung der Runde (Abschnitt 8), `choices` beantwortet offene Entscheidungen aus `pendingChoices` mit der id einer Option.

### Aktionsplätze

Die Grundausstattung steht in `tuning.slots` (Haupt- und Nebenaktionen je Runde) und wächst durch `order.slot`. Befehle mit Platz `free` kosten keinen Platz. Die erste Machtprobe einer Runde ist frei, eine zweite belegt eine Hauptaktion, eine dritte ist ausgeschlossen.

### Katalog

Der Katalog eines Volkes enthält die Kernbefehle und die Befehle aktiver Module, soweit sie freigeschaltet sind. Jeder Befehlstyp ist mit Platz, Probe, Tags, Wert für das Budget und Prüf- und Planfunktion registriert.

| Typ | Herkunft | Platz | Probe | Parameter | Wirkung |
|---|---|---|---|---|---|
| `research.assign` | Kern | free | keine | `development` aus `candidates` | Forschungsziel an die erste Stelle |
| `research.direct` | Kern | free | keine | `tags` (1 bis 3), `note` | Forschungsanfrage |
| `build` | Kern | main | keine, als Wagnis Ziel 6 | `development` (bauwerk), `tile` | Bauwerk entsteht, wirkt ab Folgerunde |
| `found` | Kern | main | keine | `tile` (bebaubar, in Reichweite einer eigenen Einheit oder Siedlung) | neue Siedlung der Lebensweise, kostet `tuning.foundCost` und eine Sippe |
| `institute` | Kern | main | keine, Ratsbeschluss | `development` (institution) | Institution gilt ab Folgerunde |
| `explore` | Kern | minor | Ziel 5, Tags `erkundung` | `unit` oder `settlement`, `tile` | Tiles im Radius `tuning.exploreRadius` um das Ziel werden `seen` |
| `discipline.use` | magie | aus der Anwendung | aus der Anwendung | `development`, `application`, `target` | Ausgänge der Anwendung |
| `machtprobe` | Kern | free, zweite main | ja | `aim`, `against`, `approach`, `cause` | Abschnitt 7 |
| `talk` | Kern | free | keine | `member`, `mode` (`listen`, `ask`, `honor`, `honor-dead`) | nur `honor` setzt Werte |
| `destiny.adopt` | Kern | main | keine, Ratsbeschluss | `bestimmung` | Abschnitt 13 |
| `migrate` | lebensweise | main | Ziel 3, im Winter 5, Tags `zug` | `tile` in Reichweite | Lager zieht, Kontrolle folgt |
| `adopt` | lebensweise | main | Ziel 6, Tags `wandel` | `lebensweise` (bekannte Entwicklung) | Übergang über zwei Runden |
| `recruit` | militaer | minor | keine | `unitType`, `settlement` | Einheit steht ab Folgerunde bereit |
| `move` | militaer | minor | keine | `units`, `path` | Bewegung bis zur Bewegungsweite |
| `attack` | militaer | main | ja, Abschnitt 11 | `units`, `tile` (benachbart) | Gefecht, Kontrolle |
| `trade.offer` | handel | minor | keine | `partner`, `give`, `get`, `seasons` | Angebot bis Ende der Folgerunde |
| `trade.accept` | handel | free | keine | `offer` | Vertrag ab Folgerunde |
| `trade.cancel` | handel | free | keine | `contract` | Vertragsbruch, Beziehung −1 |
| `trade.market` | handel | minor | keine | `sell` oder `buy`, `res`, `amount` | Tausch zum Marktpreis in der Währung |

Alle Hauptaktionen tragen zusätzlich den Tag `befohlen`. Befehle, deren Tags in `governance.scopeTags` des Volkes liegen, brauchen einen Ratsbeschluss (Abschnitt 7). In der Grundausstattung sind das `institute`, `attack`, `adopt`, `destiny.adopt` und `trade.cancel`.

### Vorschau und Phasenübergänge

```js
// engine/core/turn.js
export function preview(state, world, library, drafts, { as }) -> { issues, probes, costs, gains, votes, projection, unresolved }
export function seal(state, world, library, drafts) -> { state: next, drafts }    // planning -> resolving, Befehle gesperrt
export function apply(state, world, library, drafts) -> { state: next, record }   // resolving -> agents, wirft bei error-Issues
export function open(state, world, library) -> { state: next }                    // agents -> planning, Pool-Kandidaten
```

`preview` ist rein und verändert weder Zustand noch RNG. Sie arbeitet auf `projectFor(state, as)`, sodass der Browser dieselbe Funktion auf der Ansichtsdatei aufrufen kann, und enthält keine Ausgänge fremder Würfe. Beim Abschluss rechnet der Kern auf dem vollen Zustand nach. Weicht das Ergebnis für das Spielervolk von der Browser-Vorschau ab, entsteht `view_stale`. Die Vorschau liefert alles, was die Oberfläche nach D15 vor der Entscheidung am Ort der Wirkung zeigt, die Veränderung je Ressource, die Loyalitätsänderung und Stimme je Ratsmitglied, die betroffenen Tiles und Regionen und jede Probe mit Wahrscheinlichkeit. Die Oberfläche rechnet nichts selbst.

`seal` sperrt die Befehle der Runde. Es versiegelt den Spielerentwurf, ergänzt fehlende KI-Entwürfe durch die Ersatzpolitik `engine/ai/fallback.js`, zieht die Ereigniswürfe der KI-Völker aus dem RNG, trägt Wurf und Band jedes Volkes in `eventDraws` ein und schreibt den Auftrag des Welt-Agenten für Phase A (Abschnitt 12). `apply` löst die Saison auf.

### Issue-Codes des Kerns

Module ergänzen eigene Codes mit ihrem Präfix.

| Code | Schwere | Bedeutung |
|---|---|---|
| `finished` | error | Kampagne beendet |
| `phase` | error | Zustand erlaubt den Vorgang in dieser Phase nicht |
| `stale` | error | `draft.turn` passt nicht zur Runde des Zustands. Eine andere `baseRev` allein macht einen Entwurf nicht ungültig, weil das Einlesen von Vorschlägen die Revision während der Planung erhöht |
| `format` | error | Entwurf verletzt sein Schema |
| `unknown_order`, `locked_order` | error | Befehl unbekannt oder nicht freigeschaltet |
| `slots` | error | mehr Haupt- oder Nebenaktionen als verfügbar, dritte Machtprobe |
| `cost` | error | Kosten übersteigen den Eröffnungsvorrat |
| `labour` | error | Zuweisung übersteigt `population.core` |
| `target` | error | Tile, Region, Einheit, Partner oder Entwicklung ungültig oder unerreichbar |
| `duplicate` | error | einmaliger Befehl doppelt |
| `restricted` | error | Befehl durch `order.restrict` verboten oder Grenze erreicht |
| `council_rejected` | error | keine Mehrheit und kein Erlass |
| `roll_missing` | error (nur bei `seal` und `apply`) | Spielerprobe ohne Wurf |
| `roll_stale` | error | Fingerabdruck des Wurfs passt nicht mehr zur Probe |
| `view_stale` | error | Browser-Vorschau weicht vom Zustand ab |
| `tamper` | error | `state.json` passt nicht zum Hash des letzten Schreibvorgangs des Kerns |
| `free_slots` | warning | ungenutzte Plätze |
| `shortfall` | warning | Fehlbetrag am Rundenende zu erwarten |
| `softcap` | warning | Modifikatoren über der Kappung werden gestrichen |
| `upkeep_risk` | warning | Unterhalt nicht gedeckt, Aussetzung droht |
| `idle_labour` | warning | Sippen ohne Tätigkeit |

## 6 Proben

### Ziel, Modifikatoren, Wahrscheinlichkeit

Zielwerte liegen bei 3 bis 8 (3 bis 4 leicht, 5 normal, 7 bis 8 schwer). Eine Probe gelingt, wenn Wurf plus Modifikatorsumme das Ziel erreicht. Die Marge ist `m = roll + mod − target`. Der Spieler sieht vor dem Wurf Ziel, jeden Modifikator mit Quelle und die Erfolgswahrscheinlichkeit

```
P = clamp((11 − target + mod) / 10, 0.1, 0.9)
```

Die Klemme bildet ab, dass eine natürliche 1 immer scheitert und eine natürliche 10 immer gelingt.

Stapelregel. Jeder einzelne Modifikator liegt in −2..+2. Je Tag-Familie zählt nur der höchste Bonus und der tiefste Malus. Modifikatoren aus Entwicklungen ergeben zusammen höchstens +3. Die Gesamtsumme wird auf −4..+4 gekappt. Gestrichene Modifikatoren erscheinen in der Rechnung mit Grund, und die Vorschau meldet `softcap`.

Feste Modifikatorquellen des Kerns:

- Wesensart, +2 bei einem Probentag aus `wesensart.plus.tag`, −2 aus `wesensart.minus.tag`, symmetrisch für alle Völker,
- führendes Ratsmitglied (`lead`), +1 bei Loyalität +4 oder +5, −1 im Lebensabend, −2 hinfällig,
- Status, etwa Autorität +1 auf Proben mit Tag `befohlen`,
- Gelände und Lagewerte, soweit die Probenart sie nennt.

### Ergebnisbänder

| Band | id | Bedingung |
|---|---|---|
| Glücksfall | `crit_success` | natürliche 10 oder `m >= 4` |
| Erfolg | `success` | `1 <= m <= 3` |
| Knapp | `narrow` | `m = 0` |
| Fehlschlag | `failure` | `−3 <= m <= −1` |
| Rückschlag | `setback` | `m <= −4` |
| kritischer Fehlschlag | `crit_fail` | natürliche 1 |

`crit_success` bringt die Erfolgswirkung und den Zusatz der Aktionsdefinition, `narrow` die Erfolgswirkung mit einem kleinen Preis, `failure` die Fehlschlagwirkung bei verbrauchten Kosten, `setback` und `crit_fail` zusätzlich den Rückschlag. Die Bänder sind dieselben wie in den Ausgängen der Anwendungen (`application.outcomes` im Schema `entwicklung`). `failure`, `setback` und `crit_fail` beenden jeden Status mit `endsOn: "setback"`. Nur die natürlichen Würfe lösen die Haken `crit_success:<tag>` und `crit_fail:<tag>` aus und erzeugen Marken.

### Wer würfelt

Der Spieler würfelt 1d10 über die Oberfläche für jede Probe, die sein Volk als Handelnder ablegt, und für das Weltereignis seines Volkes. Alle übrigen Proben, also Proben der KI-Völker einschließlich ihrer Angriffe auf das Spielervolk, Lebenswürfe und Proben hohler Loyalität, zieht der Kern aus dem gespeicherten RNG, sortiert nach Proben-id (D5).

Ein offener Spielerwurf steht im Entwurf unter `rolls` mit Proben-id `T<turn>:<people>:<kind>` (für das Weltereignis `T6:bergnomaden:event`, für eine Befehlsprobe die Befehls-id), Wert und Fingerabdruck. Der Fingerabdruck ist der Hash aus Proben-id, Art, Ziel, Modifikatorliste und Befehlsparametern. Ändert sich danach etwas, das die Probe verändert, auch durch einen eingelesenen Agentenvorschlag, passt der Fingerabdruck nicht mehr (`roll_stale`). Wer einen gewürfelten Befehl zurückzieht, erzeugt einen Eintrag in `withdrawn`, der im Rundenbericht und in der Chronik erscheint.

### Wagnis und Durchbruch

Jede Hauptaktion kann als Wagnis erklärt werden. Ein Befehl ohne Probe wird dann zur Probe mit Ziel 6 und seinen Tags, ein Befehl mit Probe erhält Ziel +1. Bei `failure` und schlechter tritt die Wirkung nicht ein, die Kosten sind verbraucht.

Eine natürliche 10 auf ein Wagnis erzeugt eine Marke `breakthrough` mit den Tags des Befehls, höchstens eine je Volk und Jahr. Der Forschungs-Agent zieht daraus Vorschläge der offenen Stufe des Volkes, nie einer höheren. Ein Kandidat mit `origin: "breakthrough"` kostet die Hälfte der Forschung (abgerundet). Eine natürliche 1 auf ein Wagnis erzeugt eine Marke `crisis` mit denselben Tags. Eine unverbrauchte Durchbruchsmarke verfällt nach `tuning.tokenLife` Runden.

### Probenarten

| Art | Ziel | Wichtige Modifikatoren | Ausgänge |
|---|---|---|---|
| `explore` | 5 | Mobilität ab +2 ergibt +1, `probe.mod` mit `erkundung` | `success` und `narrow` decken den Radius auf, `crit_success` den Radius +1, `failure` den halben Radius, `setback` und `crit_fail` kosten die Einheit 1 Stärke |
| `migrate` | 3, Winter 5 | `probe.mod` mit `zug`, Wesensart | `failure` kostet Herden 1, `setback` und `crit_fail` 2, das Lager zieht trotzdem |
| `adopt` | 6 | `probe.mod` mit `wandel` | Erfolg beginnt den Übergang, Misserfolg verschiebt ihn um eine Runde |
| `attack` | Abschnitt 11 | Gelände, Verteidigung, `probe.mod` mit `angriff` | Abschnitt 11 |
| `discipline.use` | aus der Anwendung | Entzug −1 je Stufe | `outcomes` der Anwendung |
| `machtprobe` | 5 | Abschnitt 7 | Abschnitt 7 |
| `event` | kein Ziel, roher Wurf | keine | Band 1 bei 1 bis 2, 2 bei 3 bis 4, 3 bei 5 bis 6, 4 bei 7 bis 8, 5 bei 9 bis 10 |
| `life` | Lebensabend 4, hinfällig 5 | Frieden +1, Fehlbetrag −1 | Misserfolg eine Stufe tiefer, aus hinfällig Tod, natürliche 10 ein rüstiges Jahr ohne Alterung |
| `hollow` | 5 plus Stärke der Verlockung | Loyalität ab +3 ergibt +1 | Misserfolg löst Verrat aus (Abschnitt 7) |

Die vollständige Rechnung jeder Probe steht im Rundenbericht, also Wurf, jeder Modifikator mit Quelle, gestrichene Modifikatoren, Summe, Ziel, Marge und Band.

## 7 Rat und Herrschaft

### Abstimmung

Ein Befehl im Bereich `governance.scopeTags` braucht einen Ratsbeschluss. Die Stimmen sind deterministisch:

1. Ein Mitglied mit Loyalität −4 oder darunter stimmt nein.
2. Sonst stimmt es ja, wenn die Befehlstags `goal.favor` schneiden, nein, wenn sie `goal.oppose` schneiden. Schneiden sie beides, entscheidet `oppose`.
3. Ohne Schnitt stimmt es ja bei Loyalität 0 oder höher.

`governance.rule` legt fest, was genügt. `leader` entscheidet ohne Abstimmung, `council` mit einfacher Mehrheit, `assembly` mit Zweidrittelmehrheit. Ohne Mehrheit ist der Befehl `council_rejected`, es sei denn, `mandate[orderId]` ist `decree`. Ein Erlass führt den Befehl aus und senkt die Loyalität jedes Neinsagers um 1. Ein Erlass gegen ein Mitglied am Bruch erzeugt zusätzlich eine Marke `grievance`. Geltendes Recht aus `order.restrict` bindet auch den Erlass.

### Loyalität

Loyalität liegt in −5..5 mit den Bändern ergeben (+4, +5), treu (+1..+3), schwankend (0), verstimmt (−1..−3) und am Bruch (−4, −5). Jeder ausgeführte ratspflichtige Befehl verändert die Loyalität aus dem Abgleich, +1 für Mitglieder, deren `favor` die Befehlstags schneidet, −1 für Mitglieder, deren `oppose` sie schneidet. Aus allen Quellen zusammen ändert sich die Loyalität eines Mitglieds um höchstens ±2 je Runde. Jede Änderung trägt im Protokoll ihren Grund.

Ergebenheit verfällt. Im Winter sinkt jedes ergebene Mitglied um 1, wenn im abgelaufenen Jahr kein ausgeführter Befehl seine `favor`-Tags bediente.

Hohle Loyalität entsteht durch `loyalty.bind` (`hollow: true`). Sie zählt wie gewöhnliche Loyalität. Eine Ereigniskarte mit dem Tag `verlockung` löst für jedes hohl gebundene Mitglied eine Probe `hollow` aus dem RNG aus, die Stärke der Verlockung ist das Band der Karte minus 3, mindestens 0. Bei Misserfolg zieht der Kern eine Verratshandlung aus der festen Liste `TUNING.betrayals` (jede als einmalige Primitive formuliert), der Rats-Agent gibt ihr eine Stimme.

### Machtprobe

Die Machtprobe hat Ziel 5. Der Spieler wählt einen `approach` als Tag, über den die Wesensart mit ±2 wirkt. Weitere Modifikatoren:

- Ansehen, +1 bei Stufe 1, +2 ab Stufe 2,
- `cause: "need"` +1, wenn der Kern Not belegt (Fehlbetrag in der Vorrunde oder fremde Einheiten in eigener Region),
- zugewandter Rat +1, wenn die Mehrheit Loyalität 1 oder höher hat,
- Gegner (`against`) −1 ab Loyalität −1, −2 ab −4,
- offene Marke `grievance` −2.

Eine Rede gibt keinen Bonus, weil ihr Urteil eine Erzählentscheidung über einen Wert wäre. Die Ziele (`aim`) sind `override` (ein abgelehnter Befehl gilt ohne Erlasskosten), `rally` (+1 auf alle Hauptaktionsproben der Folgerunde), `reconcile` (Loyalität eines Mitglieds +1) und `quell` (eine Marke `grievance` entfernen). Machtproben werden vor allen anderen Befehlen aufgelöst, weil `override` entscheidet, ob ein abgelehnter Befehl ausgeführt wird. Ihr Ausgang verändert keine andere Probe derselben Runde.

| Band | Wirkung |
|---|---|
| `crit_success` | Ziel erreicht, Status `autoritaet` (+1 auf Proben mit Tag `befohlen`, endet beim nächsten Fehlschlag), Marke `impulse` mit den Tags von `approach` und `aim` |
| `success` | Ziel erreicht, Gegner −1, bei `m >= 2` Marke `impulse` |
| `narrow` | Ziel erreicht, Gegner −1, alle Neinsager −1 |
| `failure` | gescheitert, Gegner −1, alle Neinsager −1 |
| `setback`, `crit_fail` | gescheitert, Gegner −2, Marke `crisis` mit Tag `absetzung` |

Die Marke `impulse` ist der politische Anstoß, aus dem Forschung (`research`) eine Doktrin oder Institution verankern darf (Abschnitt 10). So entstanden in den Partien die Doktrinen aus gelungenen Machtproben.

### Gespräch

Das freie Gespräch kostet nichts und setzt außer bei `honor` keinen Wert. `honor` hebt die Loyalität eines Mitglieds unter 0, das nicht hohl gebunden ist, um 1, höchstens einmal je Mitglied und Jahr. `honor-dead` ist nach einem Tod in der Vorrunde möglich und hebt alle um 1, einmal je Todesfall. Jedes Gespräch geht als Kontext in den Auftrag des Rats-Agenten.

### Lebensstand, Tod, Nachfolge

Im Winter altern alle Ratsmitglieder um ein Jahr. Ab `tuning.ageLebensabend` wechselt ein rüstiges Mitglied in den Lebensabend. Mitglieder im Lebensabend und hinfällige legen eine Probe `life` ab. Tod öffnet einen Sitz, den der Rats-Agent mit einer Person besetzt, mit Loyalität `tuning.newMemberLoyalty`.

Stirbt die Leitung, geht sie an das Mitglied mit Status `nachfolge` oder, ohne vorbereitete Nachfolge, an das loyalste Mitglied. Was dem Volk gehört, bleibt. Ansehen fällt auf `floor(standing / 2)`, jede Loyalität auf höchstens `tuning.successionLoyalty`. Eine unvorbereitete Nachfolge erzeugt zusätzlich eine Marke `crisis` und ein Ereignis des Bands 2.

## 8 Wirtschaft

### Arbeit

Sippen sind die Einheit der Bevölkerung (`population.core`). Jede Sippe ist eine Arbeitsgruppe und arbeitet je Runde an einer Vorratsressource, an Forschung (`research`) oder an einer Modultätigkeit (`hueten` der Lebensweise, `adepten` der Magie). Die Verteilung steht im Entwurf unter `assign` und wird bei der Auflösung nach `population.assigned` übernommen. Fehlt sie, verteilt der Kern nach fester Vorgabe, zuerst Nahrung bis zur Deckung des Verbrauchs, dann den Rest gleichmäßig in der Reihenfolge von `regeln.json/resources`.

Geerntet wird je Ressource

```
ernte(res) = min( Σ ertrag(R, res, s) über bewirtschaftete Regionen,  assigned[res] × tuning.perGroup[res] )
```

Der Forschungsfluss einer Runde ist `assigned.research × tuning.researchPerGroup` plus die `research.mod` aller aktiven Entwicklungen, deren Tags das Forschungsziel teilt.

### Reihenfolge der Ökonomie in einer Saison

1. Ernte und `resource.flow` mit positivem Betrag.
2. Verbrauch der Bevölkerung nach `spec.consumption` der Lebensweise je Jahreszeit und Sippe.
3. Unterhalt in der Reihenfolge der ältesten Entwicklung zuerst (negative `resource.flow`, `spec.upkeep` von Bauwerken), danach Einheitenunterhalt aus `spec.upkeep` der Einheitentypen, danach `dependency`.
4. Nicht gedeckter Unterhalt setzt die Entwicklung aus (`state: "suspended"`), sie wirkt nicht. Nach `tuning.lossAfter` Runden Aussetzung geht sie verloren. Nicht gedeckter Einheitenunterhalt senkt die Stärke der Einheit um 1.
5. Nahrungsfehlbetrag. Je zwei fehlende Nahrung (aufgerundet) verliert das Volk eine Sippe, jedes Ratsmitglied verliert 1 Loyalität, `people.shortfall.nahrung` wird fortgeschrieben, und ein Protokolleintrag der Art `shortfall` hält den Fehlbetrag fest. Für andere Ressourcen gilt dasselbe ohne Sippenverlust.
6. Wachstum. Ohne Fehlbetrag erhält das Volk `tuning.baseGrowth` plus Σ `population.growth` (Primitiv) Wachstumspunkte in `population.growthPoints`. Vier Punkte ergeben eine Sippe, solange `core` unter der Bevölkerungsgrenze liegt (Siedlungskapazität aus `tuning.settlementCapacity` plus `population.cap`).

### Lagergrenzen und Verfall

Jeder Vorrat hat eine Lagergrenze aus `regeln.json/resources[].cap` plus `stock.cap`, abgelegt in `derived[people].caps`. Gewinne werden vor Verlusten gedeckelt, sodass Überschuss keine Verluste puffern kann. Am Ende der Runde verliert ein Vorrat über seiner Grenze die Hälfte des Überschusses (aufgerundet). Meter verfallen um ihren `decay`. Es gibt keinen Wissensvorrat. Forschung fließt in das laufende Projekt, was über dessen Abschluss hinausgeht oder ohne Projekt anfällt, verfällt.

### Forschung

Die wirksamen Forschungskosten eines Kandidaten sind

```
kosten = cost.research + floor(cost.research × n / 16)        n = Zahl bekannter Entwicklungen
kosten = kosten − floor(kosten / 4)                            wenn ein Volk mit Kontakt sie kennt (Diffusion)
kosten = floor(kosten / 2)                                     wenn der Kandidat origin "breakthrough" hat
```

Erreicht der Fortschritt die Kosten, wird die Entwicklung bekannt mit `effectiveFrom = turn + 1`. Kandidaten verfallen nach `tuning.candidateLife` Runden. Das Praxisbuch hält je Runde die Tags ausgeführter Befehle (Hauptaktion 2, Nebenaktion 1, `success` oder besser +1, Machtprobe nach Abschnitt 7) als Ringpuffer der letzten acht Runden. Seine drei stärksten Tags sind die Praxistags des Volkes.

### Möglichkeitsraum ohne Agenten

Damit Spiel und Tests ohne Agenten laufen, bietet `open` deterministisch Pool-Entwicklungen der Welt an, deren `origin.practiceTags` die Praxistags schneiden und deren Voraussetzungen und Stufentore erfüllt sind, sortiert nach Überschneidung und dann nach id, bis die Grenzen aus `tuning.limits` erreicht sind. Agentenvorschläge haben Vorrang und verbrauchen dieselben Grenzen.

## 9 Entwicklung und Primitive

### Format

Das Schema ist `entwicklung` in `engine/schemas/entwicklung.js`, eine geschlossene Variante je Art.

```json
{
  "format": "realmcraft-entwicklung",
  "version": 1,
  "id": "markt-am-pass",
  "rev": 1,
  "kind": "bauwerk",
  "tier": 2,
  "name": "Markt am Pass",
  "summary": "…",
  "appearance": "…",
  "tags": ["handel", "siedlung"],
  "prerequisites": { "all": ["saumpfade", "feste-siedlung"], "any": [], "if": { "relation": "$any", "cmp": "gte", "value": -3 } },
  "cost": { "research": 9, "resources": {} },
  "effects": [
    { "op": "module.activate", "module": "handel", "bind": { "currency": "salz" } },
    { "op": "stat.mod", "stat": "wohlstand", "amount": 1 },
    { "op": "order.unlock", "order": "trade.offer" }
  ],
  "price": [
    { "op": "meter", "id": "begehrlichkeit", "min": 0, "max": 5, "rise": { "on": "season", "amount": 1 }, "decay": 0,
      "thresholds": [ { "at": 4, "effects": [ { "op": "resource.delta", "res": "salz", "amount": -2 } ] } ] }
  ],
  "onAcquire": [],
  "replaces": [],
  "spec": { "terrains": ["alm", "wiese"], "buildCost": { "holz": 3 }, "perRegion": 1, "upkeep": {} },
  "origin": { "source": "agent", "practiceTags": ["handel", "weg"], "token": null, "request": null, "proposal": "research.bergnomaden.T7" }
}
```

`cost.research` ist die Forschung, `cost.resources` ein einmaliger Erwerbspreis in Ressourcen. `effects` sind dauerhafte Wirkungen mit nichtnegativem Gewicht, `price` dauerhafte Lasten mit nichtpositivem Gewicht, `onAcquire` einmalige Wirkungen beim Wirksamwerden. `replaces` nennt abgelöste Entwicklungen, die mit dem Wirksamwerden enden. Erzähltext (`summary`, `appearance`) hat keine Wirkung.

| kind | wird wirksam durch | wirkt | `spec` |
|---|---|---|---|
| `technik` | Forschungsabschluss | für das ganze Volk | null |
| `doktrin` | Forschungsabschluss | für das ganze Volk, zählt gegen die Höchstzahl stehender Ordnungen | null |
| `institution` | Forschungsabschluss, dann `institute` mit Ratsbeschluss | solange eingesetzt, zählt gegen die Höchstzahl | `{ seat }`, ein Ratssitz oder null |
| `disziplin` | Forschungsabschluss | `effects` dauerhaft, Anwendungen über `discipline.use` | `{ source, applications }`, je Anwendung `{ id, name, slot, target, cost, tags, targetKind, outcomes }` mit einer Liste einmaliger Primitive je Band |
| `einheit` | Forschungsabschluss schaltet `recruit` frei | je Einheit | `{ strength, mobility, recruitCost, upkeep, tags }` |
| `bauwerk` | Forschungsabschluss schaltet `build` frei | je gebautem Exemplar, in seiner Siedlung und Region | `{ terrains, buildCost, perRegion, upkeep }` |
| `lebensweise` | Forschungsabschluss, dann `adopt` | ersetzt die bisherige Lebensweise | `{ settlement, migrates, consumption, herdRules }` |

Die Höchstzahl stehender Institutionen und Doktrinen ist `2 + floor(core / 3)`. Eine neue Ordnung über der Höchstzahl braucht `replaces`.

### Kanonischer Primitivsatz

Die Primitive mit ihren Parametern sind in `engine/schemas/effects.js` als je ein geschlossenes Schema definiert (`PRIMITIVES`, `STANDING_OPS`, `ONCE_OPS`). Dauerhafte Primitive stehen in `effects`, `price` und Status und wirken, solange ihre Quelle aktiv ist. Einmalige Primitive stehen in `onAcquire`, Anwendungsausgängen, Auslösern, Meterschwellen, Strafen und Ereigniskarten und wirken genau einmal. Ein Status darf weder `module.activate`, `order.slot`, `trigger`, `dependency`, `meter` noch `governance.rule` tragen. Module dürfen weitere Primitive registrieren, die derselben Gewichtung und Prüfung unterliegen.

Dauerhafte Primitive:

| op | Parameter | Semantik |
|---|---|---|
| `resource.flow` | `res`, `amount`, `when` (Jahreszeiten), `scale` `{ per, tag?, step }` | Fluss je Runde, negativ ist Unterhalt, mit `scale` je `step` Einheiten von `per` (Bevölkerung, Einheiten, Regionen, Siedlungen) |
| `yield.mod` | `res`, `terrain`, `amount`, `when` | verschiebt den Grundertrag jedes bewirtschafteten Tiles dieses Geländes |
| `stock.cap` | `res`, `amount` | verschiebt die Lagergrenze |
| `population.cap` | `amount` | verschiebt die Bevölkerungsgrenze |
| `population.growth` | `amount` | Wachstumspunkte je Runde |
| `stat.mod` | `stat`, `amount` | Lagewert, Summe gekappt auf −2..+3 |
| `probe.mod` | `tags`, `amount`, `if`, `label` | Modifikator jeder Probe, deren Tags `tags` schneiden, solange `if` gilt |
| `research.mod` | `tags`, `amount` | zusätzliche Forschung, wenn das Forschungsziel einen Tag teilt |
| `unit.mod` | `unitTags`, `stat` (`strength`, `mobility`, `upkeep`), `amount` | wirkt auf Einheiten mit Tag |
| `order.unlock` | `order`, `limit` (je Runde) | schaltet einen Befehlstyp eines aktiven Moduls frei |
| `order.slot` | `slot`, `amount` 1 | zusätzlicher Aktionsplatz |
| `order.restrict` | `mode` (`forbid`, `limit`, `duty`), `orders`, `tags`, `limit`, `per`, `if`, `breach` | Verbot, Grenze oder Pflicht je Saison oder Jahr, `breach` wirkt beim Bruch, bindet auch den Erlass |
| `module.activate` | `module`, `bind` (Rolle auf Ressource) | aktiviert ein Mechanikmodul |
| `governance.rule` | `rule` (`leader`, `council`, `assembly`), `scopeTags` | Abstimmungsregel |
| `dependency` | `res`, `amount`, `penalty` | Pflichtverbrauch je Runde, unbezahlt tritt `penalty` ein |
| `meter` | `id`, `min`, `max`, `rise` `{ on, amount }`, `decay`, `thresholds` [{ `at`, `effects` }] | Zähler mit Anstieg je Saison oder je Anwendung eines Befehls (`use:<order>`), Verfall und Schwellenfolgen |
| `sight.mod` | `amount` | Sichtradius, stehende Aufklärung |
| `trigger` | `on`, `if`, `effects` | einmalige Wirkung, wenn der Haken feuert, keine Verschachtelung |

Einmalige Primitive:

| op | Parameter | Semantik |
|---|---|---|
| `resource.delta` | `res`, `amount` | Vorrat ändern, nie unter 0, Rest ist Fehlbetrag |
| `population.delta` | `amount` | Sippen ändern, mindestens 1 bleibt |
| `loyalty.delta` | `target` (Mitglieds-id, `all`, `favor:<tag>`, `oppose:<tag>`), `amount` | gekappt, höchstens ±2 je Mitglied und Runde |
| `loyalty.bind` | `target`, `value` | setzt hohle Loyalität |
| `relation.delta` | `people` (id, `$target`, `neighbours`, `all`), `amount` | gekappt auf −3..3 |
| `standing.delta` | `amount` | Ansehen 0..3 |
| `status.add` | `id`, `effects`, `duration` oder null, `endsOn` | zeitweiliger oder benannter Zustand des Volkes |
| `token.add` | `kind` (`breakthrough`, `impulse`, `crisis`, `grievance`), `tags` | Marke für Forschung, Welt und Rat |
| `unit.spawn` | `type`, `tile` (`$home` oder Tile) | neue Einheit mit Grundstärke |
| `unit.delta` | `unit` (`$target`, `$all-on-tile`), `strength` | Stärke 0 löst die Einheit auf |
| `region.control` | `region` (`$target` oder Region-id), `people` (`$self` oder null) | Kontrolle wechseln |
| `council.seat` | `role`, `favor`, `oppose` | öffnet einen Sitz, der Rats-Agent schlägt die Person vor |
| `flag.set` | `flag` (Präfix ist die Entwicklungs-id), `value` | benannter Schalter für Bedingungen |
| `meter.delta` | `meter`, `amount` | Meterwert ändern |
| `reveal` | `scope` (`tiles`, `region`, `people`), `at`, `radius` | Nebel über Tiles oder einer Region entfernen, bei `people` Vorräte und Absicht eines Volkes für eine Runde aufdecken |

Die Abbildung auf die elf Wirkungsprimitive der Generalisierung aus den Spielleiterpartien steht als Kommentartabelle in `effects.js`. In Kurzform werden `modify` zu `probe.mod` und `unit.mod`, `bonus` zu `stat.mod`, `order.slot`, `stock.cap` und `population.cap`, `flow` zu `resource.flow`, `yield.mod`, `research.mod`, `population.growth` und `dependency`, `adjust` zu den Deltas, `grant` zu `order.unlock` und den Grants im `spec` der Arten Einheit, Bauwerk und Disziplin, `restrict` zu `order.restrict` und `governance.rule`, `meter` und `trigger` bleiben, `spawn` wird zu `unit.spawn`, `council.seat` und `population.delta`, `tag` zu `status.add`, `token.add`, `flag.set` und `loyalty.bind`, `reveal` zu `reveal` und `sight.mod`. Neue Mächte und Orte entstehen als geprüfte Merkmale des Welt-Agenten.

### Bedingungen

Bedingungen stehen unter dem Schlüssel `if` und haben die Form eines Atoms oder einer Verknüpfung.

```json
{ "all": [ { "season": "winter" }, { "res": "nahrung", "cmp": "lt", "value": 3 } ] }
```

Atome sind `season`, `res`, `meter`, `knows` (id ohne Version), `lebensweise`, `module`, `tagCount`, `tierCount`, `atWar`, `flag`, `controls` (Zahl kontrollierter Regionen, optional nur mit diesem dominanten Gelände) und `relation` (Volk oder `$any`). Vergleiche nutzen `cmp` mit `gte` oder `lt` und `value`. Verknüpfungen sind `all`, `any` (je bis zu vier Glieder) und `not`, bis zur Tiefe drei.

Haken für `trigger` sind `season`, `winter`, `war`, `contact`, `death`, `crit_success:<tag>`, `crit_fail:<tag>`, `shortfall:<res>` und `use:<order>`.

## 10 Validator und Machtbudget

### Stufen des Validators

`validate(kind, object, ctx)` gibt `{ ok, issues, budget }` zurück. `ctx` enthält Welt, Regeln, Bibliothek, aktive und verfügbare Module und bei Kandidaten für ein Volk dessen Projektion. Jede Stufe sammelt alle Issues ihrer Stufe.

1. Schema. Hülle, dann Parameter jedes Primitivs (`unknown_primitive`, `format`).
2. Platzierung. `effects` nur mit nichtnegativem, `price` nur mit nichtpositivem Gewicht (`misplaced_effect`).
3. Bezüge. Voraussetzungen existieren (`dangling_ref`), keine Zyklen (`cycle`), Ressourcen existieren in `regeln.json` oder als gebundene Rolle eines Moduls, das die Entwicklung oder eine Voraussetzung aktiviert (`unknown_resource`), Befehle, Module, Lagewerte, Gelände und Tags stehen in den Vokabularen, Tags nur aus aktiven oder durch die Entwicklung aktivierten Modulen und dem Grundvokabular (`unknown_tag`), Name nicht doppelt ohne Rücksicht auf Groß- und Kleinschreibung (`duplicate_name`).
4. Stufen. `tier >= 1 + max(tier der Voraussetzungen)` (`tier_gap`), Kandidat eines Volkes höchstens auf dessen offener Stufe (`tier_locked`), `tier <= tuning.maxTier`.
5. Machtbudget, siehe unten (`budget_effect`, `budget_net`, `budget_price`, `research_cost`).
6. Drift-Schutz. Eine `einheit` braucht Unterhalt im `spec` (`missing_upkeep`). Jede `institution` und `doktrin` braucht einen Preis, auch auf Stufe 1 (`missing_upkeep`). Eine `disziplin` braucht eine Anwendung mit Kosten in ihrer Quellressource und einen `meter` oder eine `dependency` im Preis (`missing_source`). Kein Kandidat hebt die Summe aller `probe.mod` des Volkes auf einen Tag über +3 (`stack_cap`). Keine Entwicklung, deren einzige Wirkung über einer erreichten Klemme liegt (`clamp_dead`). Kein Duplikat mit gleicher Tag-Menge und gleichem Wirkungsgerüst wie eine bekannte Entwicklung (`duplicate`). Eine Anwendung erzeugt im Erfolgsausgang höchstens `SPEC_WEIGHTS.application.maxOutcomePerUse` (`outcome_cap`).
7. Verankerung. Eine Agenten-Entwicklung ist begründet durch mindestens einen Praxistag des Volkes, eine offene Marke `breakthrough` oder `impulse` (Doktrin und Institution nur über `impulse` oder Praxis) oder eine offene Forschungsanfrage, deren Tags sie schneidet (`ungrounded`). Eine verwendete Marke wird verbraucht.
8. Grenzen je Runde und Volk aus `tuning.limits`, also neue Kandidaten je Runde, davon über der höchsten bekannten Stufe, offene Kandidaten, Entwicklungen mit `module.activate` (`limit`). Dieselben Grenzen gelten für jedes Volk.

### Gewichte

Jedes Primitiv hat ein ganzzahliges Machtgewicht `w(e)` nach `WEIGHTS` in `effects.js`. Die Tabelle legt je op die Bemessung fest, also je Punkt des Betrags, nach Tag-Breite (eng bei Breite 1 im Vokabular, breit ab 2), nach Zahl der Jahreszeiten eines Flusses, nach Zweckbindung, nach Schwere und Takt eines Meters oder als fester Wert. Grants im `spec` einer Entwicklung gewichtet `SPEC_WEIGHTS`, eine Einheit nach Stärke, ein Bauwerk ohne eigene Wirkung mit festem Wert, eine Anwendung mit festem Wert, höher, wenn ihr Erfolgsausgang eine stehende Folge hat. Einträge, die in der Generalisierung keine eigene Zeile hatten, sind in `effects.js` als abgeleitet markiert und begründet.

Das Gewicht eines Meters ist `−(Schwere × Takt)`. Die Schwere folgt aus dem Betrag des Gewichts der schwersten Schwellenwirkung, der Takt aus dem Anstieg je Anwendung oder je Saison. Ein Auslöser, der bei Unterlassen eine negative Folge bringt, hat ein festes negatives Gewicht, jeder andere die Summe seiner Wirkungen. Kosten einer Anwendung, der Rekrutierung und der Unterhalt einer Einheit sind Kosten des Gebrauchs und zählen nicht zum Preis der Entwicklung.

### Formel

```
E = Σ w(e) über effects und die positiven Gewichte in onAcquire, plus SPEC_WEIGHTS der Grants im spec     Wirkung
P = Σ w(e) über price und die negativen Gewichte in onAcquire                                            Preis, P <= 0
N = E + P                                                                                                Nettowert

gültig, wenn mit der Zeile von TIERS für die Stufe (Stufe 0 nutzt die Zeile von Stufe 1)
  E <= effectMax                       budget_effect
  netMin <= N <= netMax                budget_net      weder Schnäppchen noch Totgewicht
  P <= priceMax                        budget_price    ab Stufe 2 trägt jede Stärke eine dauerhafte Last
  cost.research = N × (tier + 1)       research_cost   die Forschung bezahlt den Nettowert
```

Damit legen Stufe und Nettowert die Forschungskosten fest. `cost.resources` ist ein einmaliger Erwerbspreis außerhalb des Budgets, begrenzt durch das Schema. Die Budgetaufschlüsselung `E`, `P`, `N` je Primitiv gibt `node engine/cli.mjs budget <datei>` aus. Ein durchgerechneter Pfad mit den Startwerten steht in [Spieldesign.md](Spieldesign.md#durchgerechneter-pfad) und ist als Fixture des Validatorkorpus gepinnt.

### Stufen und Tore

`TIERS` legt je Stufe die Grenzen des Budgets und das Tor fest. Das Volkstor verlangt eine Zahl bekannter Entwicklungen der Stufe darunter (`prevTierKnown`), eine Mindestzahl Sippen (`groups`) und gegebenenfalls Siedlungen (`settlements`), das Weltalter ein Mindestjahr der Kampagne (`worldYear`). Die offene Stufe eines Volkes ist die höchste Stufe, deren beide Tore erfüllt sind. Ein Lager zählt als Siedlung. Stufe 0 ist die Startausstattung einer Welt und kommt nur aus dem Weltpaket.

## 11 Module

### Schnittstelle

Ein Modul ist ein DOM-freies, deterministisches ES-Modul mit Standardexport `{ id, version, requires, resourceRoles, tags, slice { people, global }, orders, primitives, hooks { resolve, upkeep, derive }, views, labelKeys, agentHints }`. `ctx` gibt Lesezugriff auf `S0`, Schreibzugriff nur über die Puffer der Runde und die Slices des eigenen Moduls in `people.modules` und `state.modules`, RNG nur über `ctx.rng` mit festem Namensraum. Ein Modul verändert nie den Zustand eines anderen Moduls. Neue Module sind Codeänderungen der Entwicklung und nie Agentenausgabe (D10).

`module.activate` setzt das Modul für das Volk in der Abschlussphase auf aktiv, legt die Slices an und bindet Rollen an Ressourcen. Fällt die aktivierende Entwicklung weg, ruht das Modul. Seine Befehle verschwinden aus dem Katalog, seine Sicht zeigt den ruhenden Zustand, sein Slice bleibt erhalten.

### Sicht-Deskriptoren

`viewsFor(state, world, peopleId)` liefert eine sortierte Liste aus Kernsichten (`karte`, `lage`, `rat`, `entwicklungen`, `bestimmung`, `voelker`, `chronik`, `weltgeschehen`) und den Sichten aktiver Module, jede mit `id`, `labelKey`, `icon`, `order`, `scope`, `sections`, `active`. `selectView(state, world, peopleId, viewId)` liefert die Daten rein aus dem Kern. Die Karte ist die Hauptfläche, alle anderen Sichten sind Tafeln über ihr. Fehlt im Frontend ein Renderer, stellt ein generischer Renderer die Daten als beschriftete Liste dar. Der Weltvalidator verlangt für jeden `labelKey` aus Kern und aktivierbaren Modulen einen Eintrag in `labels.json` (`missing_label`).

### Lebensweise

Immer aktiv. Die Lebensweise eines Volkes ist eine Entwicklung der Art `lebensweise`, ihr `spec` legt die Regeln fest:

- `settlement` ist `camp` (beweglich, Mobilität +1, nur Bauwerke mit Tag `mobil`) oder `village` (fest, Mobilität −1, alle Bauwerke),
- `migrates` schaltet `migrate` frei,
- `consumption` nennt den Nahrungsverbrauch je Sippe und Jahreszeit,
- `herdRules` nennt Weidegelände, Herdenwachstum und Winterverlust.

Herden sind ein Vorrat. In bewirtschafteten Regionen mit Weidegelände wachsen sie in den Jahreszeiten mit Weide um `herdRules.growth` je zwei Sippen `hueten`. Im Winter verliert ein Volk `herdRules.winterLoss` Herden je angefangene `tuning.herdsPerLoss` Herden. Herden liefern Nahrung nach `tuning.herdFood`. `adopt` wechselt auf eine andere bekannte Lebensweise über zwei Runden. Während des Übergangs gelten Siedlungsart und Verbrauch der alten, Mobilität ist 0, die neue wirkt ab der dritten Runde. Lager werden zu Dörfern oder umgekehrt.

### Handel

Aktiviert durch eine Entwicklung mit `module.activate handel`, die Rolle `currency` gebunden an eine Ressource (in Hochland `salz`). Ein Vertrag gilt zwischen zwei Völkern mit Kontakt und Beziehung ab 0. Er wird je Runde ausgeführt, wenn beide Seiten zahlen können und eine Route besteht, also ein Pfad über benachbarte Regionen durch eigene, neutrale oder Partnerregionen, nicht durch Regionen eines Kriegsgegners, mit Länge bis `tuning.routeRange`. `trade.market` tauscht zum Marktpreis in der Währung. Der Preis bewegt sich je Runde um höchstens 1 nach dem Saldo der Marktgeschäfte aller Völker.

### Magie

Aktiviert durch die erste `disziplin`. Ihre Quelle ist eine Ressource, die ein Merkmal oder eine Lagerstätte mit dieser Ressource in einer bewirtschafteten Region liefert, solange mindestens eine Sippe als `adepten` arbeitet (`tuning.sourceYield` je Runde). Anwendungen aus `spec.applications` verbrauchen die Quelle über ihre `cost`. `dependency` verlangt einen Pflichtverbrauch je Runde. Bleibt er unbezahlt, tritt `penalty` ein, und die Entzugsstufe der Disziplin im Slice `magie` steigt um 1. Jede Entzugsstufe gibt −1 auf Anwendungen dieser Disziplin und sinkt um 1 je Jahr mit bezahltem Pflichtverbrauch. Preise einer Disziplin sind ihre `meter`.

### Militär

Aktiviert durch die erste Entwicklung der Art `einheit`. Die Regeln sind bewusst einfach gehalten und werden nach der Balancesimulation verfeinert.

- Rekrutierung. `recruit` in einer eigenen Siedlung, Kosten aus `spec.recruitCost` gegen den Eröffnungsvorrat, höchstens `floor(core / 3)` Rekrutierungen je Runde, Gesamtstärke aller Einheiten höchstens `core × tuning.strengthPerSippe`. Die Einheit steht ab der Folgerunde bereit.
- Bewegung. `move` entlang eines Pfades über Tiles, Pfadkosten aus `moveCost` des Geländes (`findPath`), Bewegungsweite `mobility × tuning.movePoints`. Eine Einheit in einer Region eines Volkes, mit dem kein Krieg besteht, senkt die Beziehung um 1 je Runde.
- Gefecht. `attack` richtet bereite Einheiten auf einem Tile gegen ein benachbartes Tile mit fremden Einheiten oder einer fremden Siedlung. Angriffsstärke `A` ist die Summe der angreifenden Stärken einschließlich `unit.mod`, Verteidigungsstärke `D` die Summe der Stärken auf dem Ziel-Tile plus `tuning.garrison[kind]` einer Siedlung. Das Ziel ist `5 + Verhältnisstufe + Geländebonus`. Die Verhältnisstufe ist −2 bei `A >= 2D`, −1 bei `2A >= 3D`, +1 bei `3A <= 2D`, +2 bei `2A <= D`, sonst 0. Der Geländebonus des Verteidiger-Tiles ist ein `TUNING`-Wert je Gelände (0 bis 2). Der Lagewert Verteidigung des Verteidigers wirkt als negativer Modifikator, wenn er eine Siedlung hält.

| Band | Ausgang |
|---|---|
| `crit_success` | Verteidiger verliert `2 + max(m, 0)` Stärke, Angreifer 0 |
| `success` | Verteidiger verliert `1 + m`, Angreifer 1 |
| `narrow` | Verteidiger verliert 1, Angreifer 2 |
| `failure` | Angreifer verliert `1 − m`, seine Einheiten sind `routed` |
| `setback`, `crit_fail` | Angreifer verliert `2 − m`, `routed`, Ansehen −1 |

Verluste werden auf die Einheiten vom stärksten abwärts verteilt. Fällt die Verteidigung auf dem Tile auf 0, rücken die Angreifer ein. Eine eroberte Siedlung wechselt das Volk, ein erobertes Lager wird aufgelöst, und die Kontrolle der Region wechselt. Ein Angriff ohne erklärten Krieg setzt `atWar`, senkt die Beziehung um 2 und das Ansehen des Angreifers um 1. `routed` verhindert die Bewegung in der Folgerunde.

## 12 Ereignisse

Jedes Volk erhält je Saison genau ein Weltereignis. Den Wurf legt der Spieler für sein Volk während der Planung ab, für KI-Völker zieht ihn der Kern bei `seal`. `seal` trägt Wurf und Band jedes Volkes in `eventDraws` ein.

Den Inhalt liefert der Welt-Agent in Phase A, nachdem die Befehle gesperrt sind und bevor die Saison aufgelöst wird. Sein Auftrag nennt je Volk Band und Lage, er schlägt je Volk eine Karte vor, deren `if` auf die Lage dieses Volkes passt. `ingest` prüft sie gegen Schema `ereignis`, Band und Primitivsatz, hängt sie an die Bibliothek und an `eventPool` und trägt sie in `eventDraws[people].card` ein, wenn ihr `if` für das Volk gilt. Bei `apply` verwendet der Kern je Volk diese Karte, sonst wählt er per RNG unter den zulässigen Karten dieses Bands im `eventPool`. Gibt es keine, geschieht nichts, und der Bericht vermerkt es. Ohne Agenten läuft das Spiel damit vollständig aus dem Pool.

Eine Karte hat `{ id, rev, name, text, band, tags, if, effects, options }`. Ihr Nettogewicht, bei Optionen das jeder Option, muss zum Band passen. Die Spannen sind `TUNING`-Werte des Validators, als Startwerte Band 1 von −6 bis −2, Band 2 von −3 bis 0, Band 3 von −2 bis 2, Band 4 von 0 bis 3, Band 5 von 2 bis 6, gemessen mit `WEIGHTS`.

Eine Karte mit `options` wird zur offenen Entscheidung des Volkes in `pendingChoices` und in der folgenden Planung über `choices` im Entwurf beantwortet. Bleibt sie unbeantwortet, gilt beim Abschluss die erste Option. KI-Völker wählen über ihren Entwurf.

## 13 Bestimmung

Jedes Volk hat eine Bestimmung nach dem Schema `bestimmung` mit drei oder vier Meilensteinen (D6). Jeder Meilenstein ist ein Prädikat aus einer festen Bibliothek, die der Kern prüft:

| Prädikat | Parameter | wahr, wenn |
|---|---|---|
| `controls` | `count`, `terrain` | das Volk mindestens so viele Regionen kontrolliert, optional nur mit diesem dominanten Gelände |
| `stat.atLeast` | `key`, `value` | der Lagewert mindestens erreicht ist |
| `resource.atLeast` | `key`, `value` | der Vorrat mindestens erreicht ist |
| `population.atLeast` | `value` | `population.core` mindestens erreicht ist |
| `relation` | `people` (id, `$any`, `$all`), `cmp`, `value` | die Beziehung die Schwelle erfüllt |
| `development.known` | `count`, `kind`, `tier`, `tags` | das Volk so viele Entwicklungen kennt, optional nach Art, Mindeststufe und Tags |
| `subjugated` | `people` | alle Siedlungen dieses Volkes erobert sind oder es untergegangen ist |
| `settlement` | `kind`, `count` | das Volk so viele Siedlungen dieser Art hat |
| `holds` | `predicate` (eines der übrigen), `seasons` | das innere Prädikat so viele Saisons in Folge wahr war |

Am Ende jeder Saison prüft der Kern die Meilensteine. Ein erreichter Meilenstein rastet ein (`reached`, `reachedAt`). `holds` zählt seine Serie in `progress`. Wer als erstes Volk alle Meilensteine eingerastet hat, gewinnt im Modus Wettstreit, und `history` erhält den Ausgang `fulfilled`. Erreichen mehrere Völker es in derselben Saison, gewinnt das Volk mit der höheren Schwierigkeit seiner Bestimmung, dann das mit der kleineren id.

### Schwierigkeit

Der Validator bewertet eine Bestimmung mit derselben Budgetidee wie Entwicklungen. Jeder Meilenstein hat eine Schwierigkeit `d`, gemessen am Stand des Volkes bei der Annahme, als Summe von Abständen mit `TUNING`-Gewichten je Prädikat, also Regionen über den kontrollierten, Punkte über dem aktuellen Wert, Saisons eines `holds`, Abstand einer Beziehung, Stufe und Zahl gekannter Entwicklungen. Gültig ist eine Bestimmung, wenn jeder Meilenstein `d >= TUNING.destinyMinStep` hat, höchstens ein Meilenstein bei der Annahme schon wahr ist und die Summe `D` im Band `TUNING.destinyBand` liegt, gleich für alle Völker (`destiny_band`).

### Wechsel

Ein Volk kann eine neue Bestimmung annehmen, wenn seine Praxistags vier Runden in Folge keinen Tag seiner Bestimmung schneiden. Dann schlägt Forschung (`research`) über das Item `bestimmung` bis zu zwei Bestimmungen vor, die die Praxistags aufnehmen. Ohne Agenten wählt `open` passende aus `content/bestimmungen.json`. `destiny.adopt` ist ratspflichtig, kostet `standing.delta −1` und `loyalty.delta −2` für Mitglieder, deren `favor` die Tags der alten Bestimmung schneidet, und ist höchstens einmal je Jahr möglich. Die alte Bestimmung geht mit Ausgang `switched` in `history`, ihre eingerasteten Meilensteine verfallen.

### Untergang

Ein Volk geht unter, wenn es keine Siedlung mit mindestens einer Sippe mehr hat, wenn `population.core` unter `tuning.collapseCore` fällt oder wenn alle seine Siedlungen erobert sind. Geht das Spielervolk unter oder gewinnt ein KI-Volk, endet die Kampagne mit Niederlage. `status` wird `ended`, und `result` hält Sieger und Grund. Der Modus Offene Chronik ohne Sieg folgt nach dem MVP.

## 14 Phasen und Reihenfolge einer Saison

Die Zugphasen sind `planning`, `resolving` und `agents` (D7).

| Phase | Eintritt | Was geschieht | Spieler |
|---|---|---|---|
| `planning` | `open` | Entwürfe offen | plant, sieht Vorschau, würfelt |
| `resolving` | `seal` (Klick auf „Zug beenden") | Befehle gesperrt, Phase A mit dem Welt-Agenten und Einlesen der Ereigniskarten, dann `apply` | wartet |
| `agents` | `apply` | Phase B mit Rat, Rivalen, Forschung und Chronist parallel, Einlesen ihrer Vorschläge, KI-Entwürfe der Rivalen werden versiegelt | plant bereits die nächste Runde |

In `agents` darf der Spieler seinen Entwurf der neuen Runde bearbeiten, Vorschau ansehen und würfeln. Eingelesene Vorschläge können dabei Würfe ungültig machen (`roll_stale`). `open` führt von `agents` nach `planning`, sobald alle Aufträge der Phase B abgeschlossen oder als gescheitert markiert sind. Klickt der Spieler „Zug beenden", während Aufträge noch laufen, ruft `seal` zuerst `open` auf und markiert die offenen Aufträge als gescheitert. Fehlende KI-Entwürfe ersetzt dann die Ersatzpolitik, und das Protokoll vermerkt jeden Ersatz.

`resolveSeason` liest `S0` und schreibt in einen Klon. Völker werden in der Reihenfolge ihrer ids abgearbeitet, innerhalb eines Volkes `free`, Machtproben, `main`, `minor` in Entwurfsreihenfolge. Kernproben werden nach Proben-id sortiert gezogen.

1. Wächter. Phase und Revision stimmen, alle Entwürfe versiegelt, keine error-Issues, alle Spielerwürfe vorhanden und passend.
2. Entscheidungen und Befehle. Die Arbeitsverteilung aus `assign` wird übernommen, offene Ereigniswahlen aus `choices` werden angewandt. Jeder Befehl wird gegen `S0` geprüft und geplant. Kosten werden gegen den Eröffnungsvorrat summiert und abgezogen. Machtproben werden zuerst aufgelöst, dann Ratsabstimmungen und Erlasse gebucht, dann alle übrigen Proben, auch Gefechte gegen die Stellungen aus `S0`. Ausgänge gehen in zwei Puffer, `now` (einmalige Primitive) und `next` (dauerhafte Wirkungen und neue Dinge mit `effectiveFrom = turn + 1`).
3. Module. Jedes aktive Modul ruft `resolve` in der Registraturreihenfolge `lebensweise`, `handel`, `magie`, `militaer`.
4. Ökonomie nach Abschnitt 8.
5. Forschung.
6. Militär. Bewegungen, Gefechtsverluste, Eroberungen, Kontrollwechsel. Rekrutierte Einheiten erscheinen mit Zustand `moved` und sind ab der Folgerunde bereit.
7. Ereignisse. Weltereignisse aller Völker nach Abschnitt 12, im Winter Alterung und Lebenswürfe, Auslöser, Puffer `now`, Marken, Nachfolge, Proben hohler Loyalität.
8. Kappung und Verfall. Lagergrenzen, Meter, Loyalität, Beziehungen, Ansehen, im Winter Verfall der Ergebenheit, Verlust lange ausgesetzter Entwicklungen, Ablauf von Status, Marken und Kandidaten.
9. Bestimmung. Meilensteine prüfen, Sieg und Untergang feststellen.
10. Abschluss. Puffer `next` wird wirksam, Module aus `module.activate` werden aktiviert, Sicht und `known` werden fortgeschrieben, `derived` neu berechnet, Praxisbuch, Rundenbericht und Ereignisprotokoll geschrieben, `turn + 1`, `rev + 1`, `phase = "agents"`, Aufträge der Phase B und Ansichten geschrieben.

## 15 Ereignisprotokoll und Herkunft

Jede Zustandsänderung, ob aus der Auflösung, aus einem eingelesenen Agentenvorschlag oder aus einer Spielerentscheidung, erzeugt einen Eintrag nach dem Schema `event`:

```json
{
  "id": "T6-e42",
  "turn": 6,
  "source": "kernel",
  "kind": "economy.consumption",
  "target": { "kind": "people", "id": "bergnomaden" },
  "change": { "field": "resources.nahrung", "before": 9, "after": 7 },
  "reason": "Verbrauch von vier Sippen im Herbst",
  "refs": ["wanderhirten@1"],
  "step": "economy",
  "visibleTo": ["bergnomaden"]
}
```

`source` ist `kernel`, `player` oder `agent:<id>`. `change` ist `{ field, before, after }` für Zustandswerte, `{ field, delta }` für gezählte Ströme oder null für reine Meldungen. Die Einträge stehen in `state.chronicle` und je Runde vollständig in `log/T0006.json`. `step` nennt den Schritt der Saison (Abschnitt 14) oder `ingest`. `visibleTo` setzt der Kern beim Schreiben auf die Völker, deren Projektion den Eintrag erhält, also bei eigenem Volk, eigenem Ratsmitglied, eigener Einheit oder Siedlung, eigener Beziehung, sichtbarem Tile oder bekannter Region. Die Oberfläche zeigt zu jedem Wert seine Herkunft und eine Liste der Änderungen dieser Runde.

## 16 Sichtfilter

`projectFor(state, peopleId)` ist die einzige Ansicht, die ein Volk erhält, im Browser wie in Agentenaufträgen (D9). Sie enthält den vollständigen eigenen Zustand, bekannte Tiles mit Gelände und festen Merkmalen, fremde Einheiten und Siedlungen nur auf `visible`-Tiles, Kontrolle nur über bekannte Regionen, eigene Beziehungen und die projizierten Protokolleinträge. Fremde Vorräte, Entwürfe, Kandidaten, Forschung, Meter und Bestimmungen fehlen, es sei denn, ein `reveal` mit `scope: "people"` deckt Vorräte und Absicht für eine Runde auf. Die Vorschau eines Volkes enthält keine Ausgänge fremder Würfe.

## 17 Kommandozeile

`node engine/cli.mjs <befehl> [optionen]`. `--campaign <cid>` ist optional, wenn `campaigns/index.json` genau eine aktive Kampagne nennt. `--json` liefert maschinenlesbare Ausgabe, Fehler gehen als Issues nach stderr.

| Befehl | Wirkung | Exit |
|---|---|---|
| `new <welt> --seed <n> --as <volksvorlage> [--id cid]` | legt den Kampagnenordner an, platziert die Völker (`findStart`, `placePeoples`), kopiert Seed-Inhalte in die Bibliothek, Runde 0 in Phase `agents`, schreibt Aufträge | 0, 2 bei ungültiger Welt |
| `status [--as people]` | Phase, Runde, Jahreszeit, Vorräte, offene Proben, Aufträge, eingegangene Vorschläge | 0 |
| `seal` | `planning` nach `resolving`, versiegelt alle Entwürfe, ergänzt fehlende KI-Entwürfe, zieht KI-Ereigniswürfe, schreibt den Auftrag der Phase A | 0, 3 Würfe fehlen, 4 bei falscher Phase |
| `apply [--expect-rev n]` | Abschluss der Runde | 0, 2 Issues, 4 Revisions- oder Phasenkonflikt |
| `open` | `agents` nach `planning`, Pool-Kandidaten, Ansichten | 0, 4 |
| `preview [--as people] [--draft datei]` | Vorschau als JSON | 0, 2 mit error-Issues, 3 bei fehlenden Würfen |
| `roll <probeId> <1-10>` | trägt den Wurf mit aktuellem Fingerabdruck ein und zeigt die Rechnung | 0, 2 |
| `ingest [--dry-run] [--phase a\|b]` | liest `agents/proposals/` ein, in Phase A nur Ereigniskarten und Merkmale des Welt-Agenten | 0, 2 wenn ein Vorschlag abgewiesen wurde |
| `withdraw <proposalId> --reason <text>` | die Spielleitung zieht einen Vorschlag vor dem Einlesen zurück, protokolliert mit Grund | 0, 2 |
| `consent <proposalId> yes\|no` | Zustimmung des Spielers zu einer Korrektur aus einem schweren Richterbefund, protokolliert mit Quelle `player` | 0, 2 |
| `validate <pfad>` | prüft Weltordner, Entwicklung, Ereigniskarte, Bestimmung, Vorschlag, Entwurf oder Kampagne | 0, 2 |
| `budget <datei>` | Aufschlüsselung `E`, `P`, `N` bzw. `d` und `D` | 0, 2 |
| `tasks [--agent id]` | offene Aufträge | 0 |
| `run start\|end` | Laufmarke für Harness und Hooks | 0, 4 |
| `status-note <json>` | Statuseintrag für `status.json`, aufgerufen von Hooks und `/zug` | 0, 2 |
| `replay [--to turn]` | spielt alle Runden aus `new`, Entwürfen, Würfen und eingelesenen Vorschlägen nach und vergleicht Zustands-Hashes | 0, 5 bei Abweichung |
| `schema <name>` | gibt ein Schema aus `engine/schemas/` als JSON aus | 0 |

Das Dashboard schreibt keine Dateien selbst. `serve.mjs` bietet `POST /api/campaigns/<cid>/draft` (Antwort ist die Vorschau, geschrieben wird nur `drafts/<player>.json`) und `POST /api/campaigns/<cid>/seal` mit `{ expectRev }` für „Zug beenden". In einer Kampagne ohne Agenten führt `seal` die Runde direkt bis `open` durch. Alle Endpunkte prüfen Host und `Sec-Fetch-Site`, nehmen nur `application/json` bis 64 KB an und akzeptieren nur Entwürfe für `campaign.player`. Ausgeliefert werden nur `view/<player>/`, `status.json` und `narrative/`. Der Server streamt über Server-Sent-Events `view`, `events`, `status`, `findings` und `chronicle`.

## 18 Offene Vertragsfragen

Diese Punkte beschreibt der Regelkern, die Schemata führen sie nach dem Stand von [Vertragsaenderungen.md](Vertragsaenderungen.md) noch nicht. Sie gelten als Vorschlag, bis Lane V sie aufnimmt oder anders entscheidet.

1. Tuning-Felder. `regeln.json/tuning` kennt `maxTier`, `lossAfter`, `newMemberLoyalty`, `slots`, `limits` und `expected`. Alle übrigen `tuning.<name>` dieses Dokuments (etwa `tilesPerYield`, `depositYield`, `perGroup`, `researchPerGroup`, `sight`, `exploreRadius`, `foundCost`, `baseGrowth`, `settlementCapacity`, `candidateLife`, `tokenLife`, `ageLebensabend`, `successionLoyalty`, `collapseCore`, `routeRange`, `sourceYield`, `strengthPerSippe`, `movePoints`, `garrison`, `herdsPerLoss`, `herdFood`, `featureMinDistance`, `featureMaxWeight`, `agentTimeout`) stehen bis dahin als `TUNING`-Tabelle im zuständigen Kernmodul. Dasselbe gilt für die Spannen der Ereignisbänder, das Schwierigkeitsband der Bestimmung, die Jahreszeitenfaktoren der Erträge, den Geländebonus im Gefecht und die Verratsliste.
2. Rundenbericht. `log/T<turn>.json` mit Probenrechnungen, Ereigniseinträgen und dem Zustands-Hash für die `tamper`-Prüfung hat kein Schema.
3. Ansichten und Ordnerdateien. `view/<people>/state.json`, `campaigns/index.json` und `run.json` haben kein Schema.
4. Muster der `proposalId` und des Antwortpfads. Das Muster in `common.js` lässt im Agententeil keinen Bindestrich zu, die Agenten-ids der Spielrichter (`judge-coherence` und weitere) tragen einen. Das Muster von `respondAs.path` im Schema `task` erlaubt nur Kleinbuchstaben, die `proposalId` verlangt ein großes `T`. Zudem steht `\.` im Muster der `proposalId` in einem einfachen JavaScript-String und passt deshalb auf jedes Zeichen.
5. Schwere eines Befunds und Zustimmung. Ob das Item `finding` eine Schwere (`light`, `severe`) und das Item `correction` ein Merkmal für nötige Zustimmung des Spielers trägt, legt [Vertragsaenderungen.md](Vertragsaenderungen.md) fest. Der Agentenvertrag setzt beides voraus.
6. Kommandozeile. `seal`, `withdraw`, `consent`, `run` und `status-note` sind Befehle des Harness ohne eigenes Datenformat außer dem Status.

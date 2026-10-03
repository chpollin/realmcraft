# Vertragsänderungen

Die Datenverträge des rundenbasierten Kerns sind die Schemata unter `engine/schemas/`. Dieses Dokument führt jede Änderung an ihnen mit dem alten und dem neuen Stand, dem Grund und den Lanes, die nachziehen müssen. [Regelkern.md](Regelkern.md) und [Agentenvertrag.md](Agentenvertrag.md) werden an diesen Stand angeglichen. Bei Abweichung gilt das Schema.

## Änderung vom 2026-10-03

Anlass waren die Lücken, die Lane Q beim Schreiben der Abnahmetests zwischen Schemata und Regelkern gefunden hat, ergänzt um Punkte aus Lane C (Inhalt Hochland) und aus dem Abgleich der Dokumente. `SCHEMA_VERSION` in `engine/schemas/index.js` steigt von 1 auf 2, weil Bänder, Akzentfarben und zwei Muster inkompatibel geändert wurden. Die Versionen der einzelnen Dateiformate bleiben 1, da noch keine gespeicherte Kampagne vor dieser Änderung existiert.

Neue Felder im Kampagnenzustand sind optional und haben einen festgelegten Ausgangswert, damit Zustände aus der Zeit vor der Änderung gültig bleiben und `engine/harness/io.js` beim Schreiben nicht scheitert. Der Kern schreibt sie trotzdem bei jedem Schreibvorgang. Sobald Lane K1 sie überall schreibt, können sie Pflichtfelder werden.

### Gemeinsame Bausteine (`common.js`)

| Feld | bisher | neu | Grund | Lanes |
|---|---|---|---|---|
| `BANDS` | Liste nur in `entwicklung.js`, `crit_success`, `strong`, `success`, `fail`, `bad_fail`, `crit_fail` | exportiert aus `common.js` und `index.js`, schlechtestes zuerst `crit_fail`, `setback`, `failure`, `narrow`, `success`, `crit_success` | eine kanonische Bandliste für Proben, Anwendungsausgänge und Beschriftungen (Entscheidung der Orchestrierung) | K1, K2, C, Q, Doku |
| `SUCCESS_BANDS` | fehlte, im Kern als `SUCCESS` in `probes.js` | `narrow`, `success`, `crit_success` | dieselbe Erfolgsmenge an einer Stelle | K1 |
| `TOKEN_KINDS` | Aufzählung zweimal ohne `impulse` | `breakthrough`, `impulse`, `crisis`, `grievance`, genutzt von `people.tokens` und `token.add` | Marke `impulse` aus Machtproben, die der Regelkern schon führt | K1, K2 |
| `APPROVAL_METER` | fehlte | `zustimmung` | Kernmeter in jedem Volk, siehe Zustand | K1, C |
| `JUDGES`, `AGENTS` | sechs Agenten-ids | zusätzlich `judge-coherence`, `judge-balance`, `judge-narrative` | Spielrichter brauchen ids für Auftrag, Vorschlag und Status | H, K2, C, Doku |
| `PATTERNS.proposal` | `^[a-z]+(\.…)?\.T…` in einem einfachen JavaScript-String, dadurch passte `.` auf jedes Zeichen, Bindestrich im Agententeil unmöglich | `^[a-z][a-z0-9-]{1,24}(\\.[a-z][a-z0-9-]{1,40})?\\.T(0\|[1-9][0-9]*)$`, Punkte als echte Punkte | Fehler der Maskierung behoben, Richter-ids mit Bindestrich zulässig | H, K2 |
| `PATTERNS.orderId` | fehlte, Befehls-ids im Entwurf nach `id` | `id` ohne das reservierte Wort `event` | die Proben-id `T<turn>:<people>:event` des Weltereigniswurfs kann mit keinem Befehl kollidieren | K1, Q |
| `PATTERNS.probe` | Muster unverändert, Kommentar nannte nur Befehle | Kommentar legt fest, dass das dritte Segment die Befehls-id oder das reservierte `event` ist, also `T6:talbund:event` | Lane Q fragte nach dem Muster des Ereigniswurfs, die Form `T<turn>:<people>:event` gilt | Q, Doku |

### Entwurf (`draft.js`)

| Feld | bisher | neu | Grund | Lanes |
|---|---|---|---|---|
| `orders[].id` | `id` | `orderId`, also ohne `event` | siehe `PATTERNS.orderId` | K1 |
| `assign` | fehlte | optional, Ausgangswert `{}`, Sippen je Ziel (Ressourcenschlüssel, `research` oder Modultätigkeit), ganzzahlig 0 bis 99 | Arbeitsverteilung der Runde als Teil des Entwurfs | K1, Q, Doku |
| `choices` | fehlte | optional, Ausgangswert `{}`, id aus `pendingChoices` auf Options-id | Antworten auf offene Entscheidungen | K1, Q, Doku |
| `venture` | fehlte | optional, Ausgangswert `{}`, Befehls-id auf `true` | Wagnis als Erklärung des Entwurfs mit Bezug auf einen Befehl | K1, Q, Doku |
| `lead` | fehlte | optional, Ausgangswert `{}`, Befehls-id auf Ratsmitglied-id | führendes Ratsmitglied je Befehl | K1, Q, Doku |
| Veralterung | `baseRev` galt als Prüfgröße | ein Entwurf ist nur veraltet, wenn `turn` von `state.turn` abweicht, `baseRev` ist eine Angabe ohne Prüfwirkung, `seal` und `apply` rechnen die Vorschau auf dem aktuellen Zustand neu | Entwürfe aus der Phase `agents` bleiben nach späterem Einlesen nutzbar | K1, Q, Doku |

Die Zuordnung von `venture` und `lead` liegt auf Ebene des Entwurfs. Der Regelkern zeigt sie derzeit an den einzelnen Befehlen und muss angeglichen werden. `assign` ist flach je Ziel, weil die Ernteformel des Regelkerns je Volk und Ressource rechnet und keine Regel eine Verteilung je Siedlung liest.

### Kampagnenzustand (`campaign.js`)

| Feld | bisher | neu | Grund | Lanes |
|---|---|---|---|---|
| `eventDraws` | fehlte | optional, Ausgangswert `{}`, je Volk `{ turn, roll, band, roller, card }`, `roller` ist `player` oder `kernel`, `card` ist null bis eine Karte feststeht | Wurf und Band des Weltereignisses je Volk für die laufende Auflösung | K1, Q, Doku |
| `pendingChoices` | fehlte | optional, Ausgangswert `[]`, Einträge `{ id, people, event, offeredAt, deadline, options }` mit zwei oder drei Options-ids | offene Entscheidungen aus Ereigniskarten mit Frist | K1, Q, Doku |
| `result` | fehlte | optional, Ausgangswert null, sonst `{ winner, kind, turn, reason }`, `kind` ist `victory` oder `collapse`, `winner` darf null sein | Ausgang der Kampagne, `status` ist genau dann `ended`, wenn `result` gesetzt ist (Prüfung im Validator) | K1, K2, Q |
| `relations[*].contact` | fehlte | optional, Wahrheitswert, fehlend gleich `false` | erster Kontakt zweier Völker, der Kern legt Beziehungen schon bei Spielbeginn an | K1, Q, Doku |
| `people.tokens[].kind` | ohne `impulse` | mit `impulse` | siehe `TOKEN_KINDS` | K1 |
| `people.population.assigned` | fehlte | optional, Ausgangswert `{}`, gleiche Form wie `draft.assign` | übernommene Arbeitsverteilung der Runde | K1, Q |
| `people.population.growth` | Wachstumspunkte zur nächsten Sippe, 0 bis 3 | unverändert, als das Feld festgelegt, das der Regelkern `growthPoints` nennt | ein zusätzliches Feld `growthPoints` hätte denselben Wert doppelt geführt, und Volksvorlagen in `regeln.json` tragen bereits `growth` | K1, Doku |
| `people.meters` | offene Karte | `zustimmung` ist Pflichtschlüssel mit −5 bis 5, weitere Meter wie bisher | Zustimmung ist nach Entscheidung des Eigentümers ein Kernwert jeder Welt neben Nahrung, Material, Wissen und Volk, der Kern schreibt den Meter schon seit Runde 0 | K1, C, Doku |
| `derived` | offenes Objekt | Karte nach Volks-id (oder Kartenschicht) auf offene Objekte, `caps` darin als Ressourcenschlüssel auf Ganzzahl 0 bis 9999 | Lagergrenzen als `derived[people].caps` | K1, Q |
| interne Definitionen | `campaign.campaign`, `map`, `relations` inline | als `campaignRef`, `campaignMap`, `relations` herausgezogen, dazu `eventDraw`, `pendingChoice`, `result`, `derived`, `foreignPeople` | Wiederverwendung im Schema `view` | keine |

Im Zustand zählt `population.core` die Sippen und ist der Kernwert Volk, `population.growth` die Wachstumspunkte, `population.assigned` die Arbeit der Runde. `meters.zustimmung` ist der Kernwert Zustimmung, verändert über die vorhandenen Primitive `meter.delta` und abgefragt über die Bedingung `meter`, sodass Gewichte und Budgetmodell unverändert bleiben. Grenzen und Startwert legt `regeln.tuning.approval` fest.

Der Fehlbetrag bleibt `people.shortfall`. Ein Fehlbetrag erzeugt zusätzlich einen Protokolleintrag der Art `shortfall`, dessen `kind` das bestehende Muster schon zulässt.

### Ereignisprotokoll (`event.js`)

| Feld | bisher | neu | Grund | Lanes |
|---|---|---|---|---|
| `visibleTo` | fehlte, der Kern markierte Sichtbarkeit über Verweise `p:<people>` in `refs` | optional, Liste von Volks-ids oder genau `["all"]`, die Mischung ist ungültig | `projectFor` filtert allein nach diesem Feld, ein Eintrag ohne `visibleTo` erreicht keine Projektion, nur den vollständigen Rundenbericht und die Richter | K1, Q, Doku |
| `step` | fehlte | optional, Name des Saisonschritts nach Regelkern Abschnitt 14 oder `ingest` | Herkunft eines Eintrags innerhalb der Auflösung | K1, Doku |

Die Form der übrigen Felder bleibt, also `target` als `{ kind, id }` und `change` als `{ field, before, after }`, `{ field, delta }` oder null.

### Vorschlag, Auftrag und Status (`proposal.js`, `task.js`, `status.js`)

| Feld | bisher | neu | Grund | Lanes |
|---|---|---|---|---|
| `ITEM_TYPES` | zehn Typen | zusätzlich `bestimmung`, `memory`, `correction`, `finding` | Bestimmungsvorschläge, Gedächtnis und Richterbefunde | K2, H, Doku |
| Item `bestimmung` | fehlte | `{ type, data }` mit `data` nach Schema `bestimmung` | Wechsel der Bestimmung über den Forschungs-Agenten (D6) | K2 |
| Item `memory` | fehlte | `{ type, refs, text }`, Text bis 8000 Zeichen, keine Wertfelder | verdichtetes Kampagnengedächtnis des Erzählrichters | K2, H |
| Item `finding` | fehlte | `{ type, id, severity, for, refs, text }`, `severity` ist `info`, `warn` oder `severe`, `for` nennt Agenten-ids, mindestens ein Verweis, keine Wertfelder | Befund eines Richters als Teil seines Vorschlags | K2, H, Doku |
| Item `correction` | fehlte | `{ type, finding, needsConsent, people, item }`, `item` ist eines der zustandsändernden Items (`entwicklung`, `event`, `feature`, `person`, `goal`, `bestimmung`) oder `effects` mit einem bis drei einmaligen Primitiven | die Korrektur läuft durch denselben Validator wie das korrigierte Item, `needsConsent: true` heißt, dass die Spielleitung sie dem Spieler vorlegt und `ingest` auf `consent yes` wartet | K2, H, Doku |
| `ITEMS_BY_AGENT` | sechs Zeilen | `research` darf zusätzlich `bestimmung`, die drei Richter dürfen `finding` und `correction`, `judge-narrative` zusätzlich `memory` | Rechte der neuen Items | K2, H |
| `task.respondAs.path` | `^agents/proposals/[a-z0-9.-]{3,80}\.json$`, schloss das große `T` der `proposalId` aus | aus `PATTERNS.proposal` gebildet, `agents/proposals/<proposalId>.json` | es konnte kein gültiger Auftrag existieren | H, K2 |
| `status.steps[].agent`, `proposals[].kind`, `task.agent`, `task.limits.items` | folgten `AGENTS` und `ITEM_TYPES` | folgen ihnen weiter und kennen damit Richter und neue Items | keine eigene Änderung | H |

Ein eigenes Schema für die Befundedatei `richter/T<turn>-<richter>.json` des Agentenvertrags gibt es nicht. Befunde reisen als Items im Vorschlag des Richters. Der Agentenvertrag muss Ablage und Schwerestufen daran angleichen (bisher `light` und `severe`).

### Weltpaket (`world.js`, `effects.js`, `entwicklung.js`)

| Feld | bisher | neu | Grund | Lanes |
|---|---|---|---|---|
| `application.outcomes` | Schlüssel `crit_success`, `strong`, `success`, `fail`, `bad_fail`, `crit_fail` | Schlüssel aus `BANDS` | kanonische Bänder | C, K2, K1 |
| `regeln.tuning` | geschlossen mit `maxTier`, `lossAfter`, `newMemberLoyalty`, `slots`, `limits`, `expected` | weiter geschlossen, zusätzlich optional `spoilage` (Teiler des Überschusses über der Lagergrenze, 1 bis 10), `loyaltyDecay` (0 bis 3 je Winter), `machtprobeCap` (1 bis 4 je Runde), `bestimmungBand` `{ min, max }`, `eventBands` (genau fünf Einträge `{ band, roll { min, max }, net { min, max } }`), `terrainRules` (je Gelände `defense` 0 bis 3 und `yieldFactor` je Jahreszeit und Ressource 0 bis 2), `knowledgeSpend` (0 bis 10), `approval` `{ min, max, start }` im Bereich −5 bis 5, `featureYield` (je Lagerstätten- oder Merkmalsschlüssel `{ res, amount }`) | Lane C setzt diese Kernkonstanten je Welt, fehlend gilt der Wert der `TUNING`-Tabelle des Kerns | C, K1, K2 |
| `style.accents` | Werte als Hexfarbe `#rrggbb` | Werte als Token-Name nach `^[a-z][a-z0-9-]*$` | Farbwerte gehören in die Token-Tabelle der Oberfläche | C, UI |
| `ereignis` | ohne Wiederholungssteuerung | optional `once` (Wahrheitswert, Ausgangswert `false`), `cooldown` (Runden 0 bis 99, Ausgangswert 0), `maxPerCampaign` (1 bis 99, fehlend unbegrenzt) | Ereigniskarten sollen sich nicht beliebig wiederholen | C, K1, K2 |
| `governance.rule` | `scopeTags` | zusätzlich optional `scopeOrders` mit Befehlstypen wie `destiny.adopt` und `trade.cancel` | Befehlstypen tragen einen Punkt und passen deshalb nicht auf das Tag-Muster, `scopeTags` bleibt für Befehls-Tags wie `befohlen` | C, K1 |
| `token.add.kind` | ohne `impulse` | mit `impulse` | siehe `TOKEN_KINDS` | C, K2 |
| Beschriftungsschlüssel | Punkte und Bindestriche | unverändert, ein Band wie `crit_success` steht unter `band.crit-success` | Schlüssel bleiben ohne Unterstrich | C |

Das Budgetmodell bleibt `WEIGHTS`, `SPEC_WEIGHTS` und `TIERS` in `effects.js` ohne Änderung.

### Neue Schemata (`files.js`)

| Schema | Datei | Inhalt | Lanes |
|---|---|---|---|
| `report` | `log/T<turn>.json` | `{ format, version, campaign, turn, revBefore, revAfter, hashBefore, hashAfter, sections, events }`, `sections` hält die Berichtsteile des Kerns nach Namen in kerneigener Form, `events` das vollständige ungefilterte Protokoll der Runde. `hashAfter` des jüngsten Berichts ist die Vergleichsgröße der `tamper`-Prüfung | K1, H, Q |
| `view` | `view/<people>.json` | Projektion eines Volkes in der Form des Zustands ohne `rulesVersion`, `rng`, `eventPool` und `ingested`. Das eigene Volk behält die volle Form, fremde Völker haben die Form `foreignPeople` mit Name, Steuerung, Wesensart, Lebensweise, Ansehen, sichtbaren Einheiten und Vorräten nur bei Aufdeckung. Karte, Beziehungen, Ziehungen, Entscheidungen, Chronik und `derived` sind nach den Regeln im Schema gefiltert | K1, H, Q, UI |
| `campaignIndex` | `campaigns/index.json` | `{ format, version, campaigns }` mit Zeilen `{ id, world, player, turn, status, updatedAt }`, `status: playing` kennzeichnet eine aktive Kampagne | H, K1 |

Der Agentenvertrag nennt die Ansicht unter `view/<people>/state.json`, `engine/harness/io.js` schreibt `view/<people>.json`. Das Schema gilt für die Datei unabhängig vom Pfad, die Ablage entscheidet Lane H.

### Fixtures und Tests

Neue Fixtures unter `tests/fixtures/engine/` sind `campaign-midgame.json` (Runde 12, Spielervolk Talbund sesshaft, Handel aktiv über den gebauten Markt am Pass, eine Einheit, eine offene Entscheidung, Bestimmung `hegemonie@1` mit zwei von drei Meilensteinen), die Varianten `campaign-near-victory.json` und `campaign-near-collapse.json`, dazu `draft-midgame.json`, `view-talbund.json`, `report-T0011.json`, `campaigns-index.json`, `task-judge-balance.json` und Vorschläge für Richter und Bestimmung samt ungültiger Gegenbeispiele. Die Zustands-Fixtures erzeugt `build-state-fixtures.mjs` aus einem echten Kernlauf auf dem Hochland-Paket mit Seed 7. `campaign-turn0.json` trägt nun den Meter `zustimmung`. Die Regeln dieser Änderung prüft `tests/unit/engine/schema-amendments.test.js`, die inhaltliche Stimmigkeit der neuen Fixtures `schema-fixtures.test.js`.

### Was die Lanes nachziehen

K1 (Kern)

- Bänder in `probes.js`, `orders.js` und `turn.js` auf `BANDS` und `SUCCESS_BANDS` aus den Schemata umstellen und die Schwellen nach dem Regelkern setzen.
- `assign`, `choices`, `venture` und `lead` aus dem Entwurf lesen, `population.assigned` schreiben, Veralterung nur über `turn`.
- `eventDraws`, `pendingChoices`, `result`, `relations[*].contact` und `visibleTo` bei jedem Schreiben setzen und `projectFor` allein über `visibleTo` filtern.
- Marken `impulse` erzeugen, `derived[people].caps` schreiben, Rundenbericht und Ansicht in den Formen `report` und `view` schreiben.
- `new --from-state <file>` mit den neuen Zustands-Fixtures als Eingabe.
- `createCampaign` setzt bei Seed 48213 die Startsiedlungen von Bergnomaden und Talbund in dieselbe Region `-1:0:0`, sodass ein Volk in einer fremd kontrollierten Region beginnt. Das ist der Standard-Seed der Abnahmetests.

K2 (Validator)

- Validatorkorpus auf die neuen Bandschlüssel umstellen, betroffen sind die Disziplinen `rauchschau`, `salzlesen` und `salzlesen-fremd`.
- Neue Items prüfen, darunter `correction` wie das eingeschlossene Item, `finding` und `memory` als reine Textobjekte, `bestimmung` mit Schwierigkeitsband.
- Invarianten ergänzen, die das Schema nicht ausdrückt. `status` und `result` passen zueinander, `respondAs.path` nennt dieselbe id wie `respondAs.proposalId`, Schlüssel von `venture` und `lead` sind Befehle des Entwurfs, die Summe von `assign` übersteigt `population.core` nicht, keine Volks-id lautet `all`.

C (Inhalt Hochland)

- Anwendungsausgänge in `content/entwicklungen.json` auf die neuen Schlüssel umstellen (`rauchschau`, `bannfeuer`, `blutritus`). Solange das fehlt, ist `schwarzer-zirkel` als Folge unerreichbar.
- In `labels.json` die Schlüssel `band.*` nach `BANDS` und `agent.judge-coherence`, `agent.judge-balance`, `agent.judge-narrative` ergänzen. `content-hochland.test.js` sollte die Bandliste aus `BANDS` importieren statt sie zu wiederholen.
- Neue Tuning-Felder, Akzent-Token und Wiederholungssteuerung nach Bedarf nutzen.

Q (Abnahme)

- `FORTUNE` und `SETBACK` im Harness auf `crit_success` und `crit_fail` festlegen. Annahme A4 entfällt, weil der Entwurf `assign`, `choices`, `venture` und `lead` nun kennt.
- Ereigniswurf unter `T<turn>:<people>:event`, Protokolleinträge in der Form von `event.js` mit `visibleTo`, Rundenbericht und Ansicht nach `report` und `view`.

Dokumentation

- Regelkern und Agentenvertrag an diese Tabellen angleichen, insbesondere `venture` und `lead` auf Entwurfsebene, `choices` nach der id aus `pendingChoices`, `contact` als Wahrheitswert, `eventDraws` mit `turn` und `roller`, `population.growth` statt `growthPoints`, Schwere `info`, `warn`, `severe`, Befunde als Items statt eigener Datei, Abschnitt 18 der offenen Fragen kürzen.

### Offen

- `endsOn: "setback"` an Status heißt weiterhin, dass der Status bei jedem Misserfolg endet, also bei `failure`, `setback` und `crit_fail`. Seit `setback` auch ein Band ist, ist der Name doppeldeutig. Eine Umbenennung wurde nicht entschieden.
- Ob `growthPoints` als Name `growth` ablösen soll, ist eine Entscheidung der Orchestrierung. Eine Umbenennung beträfe Volksvorlagen in `regeln.json`, den Kern und alle Zustands-Fixtures.
- Die Schwellen der Bänder sind Regelsache des Kerns und des Regelkerns. Das Schema legt nur ids und Reihenfolge fest.

## Ergänzung vom 2026-10-03, Kern- und CLI-Integrität (Lane K)

Anlass waren die Befunde der Prüfung von Regelkern und Kommandozeile, also eine nur beratende Siegelsperre, Neuwürfe über eine eingereichte Vorschau, ein fälschbarer Manipulationsschutz und Lecks im Sichtfilter. Jedes neue Feld ist optional und additiv, darum bleibt `SCHEMA_VERSION` bei 2 und jeder vorher geschriebene Zustand gültig.

| Schema | Feld | bisher | neu | Grund | Lanes |
|---|---|---|---|---|---|
| `campaign.js` | `sealed` | fehlte | optional, Volks-id auf Hash des versiegelten Entwurfs, gesetzt von `seal`, entfernt von `apply` | `apply` löst genau die Entwürfe auf, deren Hash `seal` festgehalten hat, ein auf der Platte geänderter Entwurf ergibt `tamper` | K, Q |
| `bestimmung.js` | `bestimmungState.offers` | fehlte | optional, höchstens zwei Einträge `{ ref, offeredAt, origin }` mit `origin` gleich `agent` oder `pool`, fehlend heißt kein Angebot | `destiny.adopt` verlangt nach Regelkern Abschnitt 13 die Praxisbedingung und ein Angebot, das Angebot schließt die Bestimmungen anderer Völker aus | K, F, Agenten |
| `bestimmung.js` | `bestimmungState.difficulty` | fehlte | optional, ganzzahlig 0 bis 999, bei der Annahme gemessen, fehlend misst der Kern bei Bedarf | Gleichstand mehrerer Sieger entscheidet die höhere Schwierigkeit | K |
| `status.js` | `resolved` | fehlte | optional `{ turn, steps }`, von `apply` mit den Schritten der aufgelösten Runde gesetzt, von `open` entfernt | das Dashboard zeigt die abgeschlossene Runde einschließlich des Weltschritts der Phase A bis zur nächsten Planung, `phase` folgt bei jedem Übergang dem Zustand | F |
| `status.js` | `$defs.steps` | inline | als Definition herausgezogen | Wiederverwendung in `resolved` | keine |
| `task.js` | `limits.slots` | fehlte | optional `{ main, minor }`, nur im Auftrag `rival` | Rivalen planen innerhalb der Kapazität der Saison, Befehle mit Platz `free` belegen keinen Platz | Agenten |

Ohne Schemaänderung kamen hinzu:

- Der Auftrag `rival` trägt in `context.orders` je verfügbarem Befehl die Parameter, bis zu sechs gültige Zielbelegungen und ein Beispiel. Jede Belegung besteht die Prüfung des Befehls auf der Projektion des Volkes. `limits.tags` enthält nur noch Tags aus `regeln.vocabulary`, weil der Validator jeden anderen Tag abweist.
- Die Vorschau liefert `council` mit den sicheren Folgen für Loyalität je Ratsmitglied und für Meter wie `zustimmung`, je Befehl in `orders[].council` und als Summe unter der Kappung je Runde. Befehle, deren Folge von einer Probe abhängt, tragen `depends`.
- `log/journal.json` schreibt Einträge im Format 2. Jeder Eintrag trägt `kernel`, `prev` (Hash des Vorgängers), `hash`, `libraryCount` und `libraryHash` des Bibliothekspräfixes, `draftsHash`, `rolls` mit Zahl und Hash des Würfelbuchs und `worldHash`. Der erste solche Eintrag nach einem älteren Journal trägt `base` mit einem Anker des Ausgangszustands unter `anchors/`.
- `rolls.json` ist das Würfelbuch der Kampagne, nur fortschreibbar, mit Einträgen `{ turn, people, probe, fingerprint, value }`. Die Würfe eines Spielerentwurfs werden daraus abgeleitet.
- Der Befehl `repin` bindet eine Kampagne nach geprüftem Weltpaket an dessen aktuellen Hash, schreibt einen Protokolleintrag `campaign.repin` mit Quelle `player` und einen Anker unter `anchors/`, aus dem `replay` startet. Ein geändertes Weltpaket sperrt jeden Übergang bis zu diesem Schritt.
- Ids, die einen Namen von `Object.prototype` tragen (`constructor`), weist der Kern in Weltpaket, Entwurf und Vorschlag ab. Befehls-ids der Form `life-N` und `hollow-N` sind reserviert, weil Kernproben diese Subjekte tragen.

Bestehende Kampagnen bleiben ladbar. Ein Journal ohne Kette wird angenommen, der nächste Übergang beginnt die Kette und verankert den Zustand, von dem er ausgeht. Ein gespeicherter Spielerentwurf mit Würfen der laufenden Runde füllt das Würfelbuch beim ersten Zugriff. Hat sich das Weltpaket seit dem Anlegen geändert, ist vor dem nächsten Übergang `repin` nötig.

Offen bleibt, dass `engine/schemas/world.js` `tuning.collapseCore` noch nicht kennt. Der Kern liest den Wert mit Ausgangswert 1, also Untergang erst bei null Sippen, aber kein Weltpaket kann ihn setzen, bis das Weltschema das Feld aufnimmt.

# RealmCraft-Plan

Der Plan führt das rundenbasierte RealmCraft bis zu einem spielbaren MVP in der Welt Hochland. Er ordnet die Arbeit in Wellen W0 bis W3, jede Welle in Lanes mit eigenem Dateibestand. Was gebaut wird, beschreiben [Spieldesign](Spieldesign.md), [Regelkern](Regelkern.md) und [Agentenvertrag](Agentenvertrag.md), warum, steht in [Entscheidungen](Entscheidungen.md).

## Arbeitsweise

Die Entwicklung folgt D13. Zuerst stehen die Verträge fest, also diese Dokumente und die Schemata im Code. Danach arbeiten Lanes parallel auf disjunkten Dateibeständen. Jede Lane hat eine Leitung auf Opus, die ihre Arbeit an Sonnet-Worker für abgegrenzte Teile vergibt, deren Ergebnisse gegen den Dateistand prüft und die Lane abnimmt. Abnahmetests schreibt eine eigene Lane aus der Spezifikation, ohne die Implementierung zu kennen. Vor jedem Zusammenführen steht ein Gate, am Ende jeder Welle der Abgleich der Dokumente mit dem Code.

Regeln für alle Lanes:

- Eine Lane schreibt nur in ihren Dateibestand. Braucht sie eine Änderung in fremdem Bestand, meldet sie sie der Leitung jener Lane.
- Weicht der Code vom Regelkern ab, entscheidet die Orchestrierung, ob Code oder Dokument nachgezogen wird. Kein stilles Abweichen.
- Zahlenwerte für Inhalte und Tuning stammen aus `regeln.json`, nie aus dem Code. Testwerte stammen aus Fixtures, die gegen die Regeln geprüft sind.
- Die alten Spiele bleiben bis zum Ende von W3 unangetastet auf `main` und liegen zusätzlich im lokalen Zweig `archiv/vor-neuaufbau` (D1).

## W0 Verträge

| Lane | Leitung und Worker | Dateibestand | Lieferung | Abnahme |
|---|---|---|---|---|
| D Dokumente | Opus-Leitung | `docs/Spieldesign.md`, `docs/Regelkern.md`, `docs/Agentenvertrag.md`, `docs/RealmCraft-Plan.md`, `docs/Entscheidungen.md` | kanonische Entwurfs- und Plandokumente | unabhängige Konsistenzprüfung der Dokumente untereinander, Stilprüfung, Lektüre durch den Eigner |
| W Weltgenerator | Opus-Leitung, Sonnet-Worker | `engine/world/`, `welten/hochland/welt.json`, `tests/unit/world/` | Welt-API mit `createWorld`, `tileAt`, `ensureChunk`, `chunkOf`, `regionOf`, `regionInfo`, `reveal`, `findPath`, `reachable`, `findStart`, `placePeoples`, Hex-Helfern, dazu `regionInfo(...).terrainCounts` und `regionNeighbors` für den Kern | gleiche Tiles und Regionen unabhängig von der Reihenfolge der Chunk-Erzeugung, Regionszugehörigkeit vollständig und eindeutig, `findPath` respektiert `moveCost` und unpassierbares Gelände, `reveal` respektiert `blocksSight`, Startplätze erfüllen die Startregeln für alle Völker |
| S Spielbrett | Opus-Leitung, Sonnet-Worker | `spielbrett/` | kartenzentrierte Oberfläche auf Mock-Daten mit Karte, Tafeln für Rat, Entwicklungen, Bestimmung, Völker, Chronik und Weltgeschehen | Eigner beurteilt die Gestaltung, Browser-Smoke auf einer leeren Kampagne |
| V Verträge im Code | Opus-Leitung, Sonnet-Worker | `engine/schemas/`, `engine/content/schema.js`, `tests/fixtures/`, `tests/unit/schemas/` | Schemata für Kampagne, Entwurf, Entwicklung, Ereigniskarte, Bestimmung, Vorschlag, Auftrag, Status, Ereigniseintrag und Weltpaket mit Primitivsatz und Budgettabellen in `effects.js` (eingefroren), danach die Änderungen aus [Vertragsaenderungen.md](Vertragsaenderungen.md) und die [offenen Vertragsfragen](Regelkern.md#18-offene-vertragsfragen), Interpreter der genutzten Schema-Teilmenge | jedes JSON-Beispiel aus Regelkern und Agentenvertrag besteht sein Schema, der Interpreter urteilt auf dem Fixture-Korpus wie Ajv, jede Erweiterung lässt alle bestehenden Fixtures gültig |

Gate W0. Dokumente und Schemata sind konsistent, bei Abweichung gilt das Schema, die Welt-API ist mit Tests geliefert, die Orchestrierung verlinkt die neuen Dokumente in `docs/INDEX.md` und markiert den Echtzeitplan als abgelöst.

## W1 Kern

| Lane | Leitung und Worker | Dateibestand | Lieferung | Abnahme |
|---|---|---|---|---|
| K1 Grundlagen | Opus-Leitung, Sonnet-Worker | `engine/core/canon.js`, `hash.js`, `rng.js`, `issues.js`, `calendar.js`, `conditions.js`, `effects.js`, `probes.js`, `tests/unit/core/` | Serialisierung, Hash, sfc32 mit d10 durch Verwerfungsziehung, Bedingungssprache, Primitivsatz mit Schema, Gewicht und Anwendung, Proben mit Fingerabdruck, Stapelregel und Bändern | feste Referenzfolge des RNG, Hash unabhängig von Schlüsselreihenfolge, `P` an allen Grenzwerten, 1 und 10 unabhängig von Modifikatoren, jedes Band an seinen Grenzen, Stapelregel mit gestrichenen Modifikatoren |
| K2 Validator | Opus-Leitung, Sonnet-Worker | `engine/content/budget.js`, `validate.js`, `library.js`, `tests/unit/content/`, `tests/fixtures/validator/` | Validatorstufen, Machtbudget, Schwierigkeit von Bestimmungen, Bibliothek nur anhängend | jeder Issue-Code entsteht an genau seinem Fixture, der durchgerechnete Pfad aus dem Spieldesign ergibt genau die dort genannten Werte und Ergebnisse, Budgetaufschlüsselung als Snapshot gepinnt |
| K3 Runde | Opus-Leitung, Sonnet-Worker | `engine/core/orders.js`, `turn.js`, `economy.js`, `council.js`, `events.js`, `destiny.js`, `map.js`, `derive.js`, `project.js`, `views.js`, `tests/unit/turn/` | `preview`, `seal`, `apply`, `open`, Saisonreihenfolge, Ökonomie, Rat, Machtprobe, Leben und Nachfolge, Ereignisse, Bestimmung, Karte mit Kontrolle, Siedlungen, Nebel und Merkmalen, Projektion, Sicht-Deskriptoren, Ereignisprotokoll | `preview` verändert weder Zustand noch RNG, Kosten nur aus dem Eröffnungsvorrat, Wirkung neuer Dinge ab Folgerunde, jedes Issue des Kerns an einem minimalen Entwurf, `roll_stale` nach Parameteränderung, Fehlbetrag und Aussetzung, Lebenswürfe, Prädikate der Bestimmung, Projektion ohne fremde Vorräte, Entwürfe und verdeckte Einheiten, jede Zustandsänderung hat einen Protokolleintrag |
| I Inhalt Hochland | Opus-Leitung, Sonnet-Worker | `welten/hochland/regeln.json`, `labels.json`, `style.json`, `content/` | Kalender, Ressourcen, Völkervorlagen Bergnomaden, Schädelklan und Talbund, Ratsvorlagen, Vokabular, Tuning, KI-Profile, Seed- und Pool-Entwicklungen, Ereigniskarten für alle Bänder, Start-Bestimmungen | `node engine/cli.mjs validate welten/hochland` ohne Issues, jede Seed-Entwicklung besteht den Validator, jede Ereigniskarte passt zu ihrem Band, jeder `labelKey` hat einen Text |
| A Abnahmetests | Opus-Leitung, Sonnet-Worker, getrennt von K1 bis K3 | `tests/acceptance/` | Tests aus Regelkern und Agentenvertrag, ohne Kenntnis der Implementierung geschrieben | laufen zunächst rot gegen Stubs, werden von den Kern-Lanes nicht verändert |

Gate W1. Alle Abnahmetests des Kerns grün, eine Kampagne lässt sich über die Kommandozeile ohne Agenten anlegen und über viele Runden spielen, `replay` reproduziert den Zustands-Hash.

## W2 Module, Harness, Oberfläche

| Lane | Leitung und Worker | Dateibestand | Lieferung | Abnahme |
|---|---|---|---|---|
| M1 Lebensweise und Militär | Opus-Leitung, Sonnet-Worker | `engine/modules/lebensweise.js`, `militaer.js`, `tests/unit/modules/lebensweise*`, `militaer*` | Varianten nomadisch und sesshaft mit Zug, Herden und Übergang, Rekrutierung, Bewegung über Tiles, Gefecht | Herdenwachstum auf Weide und Winterverlust, Zug in Reichweite, Übergang über zwei Runden, Rekrutierungsgrenze, Bewegung nach Pfadkosten, Gefechtsziel aus Stärkeverhältnis und Gelände an allen Stufen, Verluste je Band, Eroberung und Kontrollwechsel, Angriff ohne Krieg setzt Krieg |
| M2 Handel und Magie | Opus-Leitung, Sonnet-Worker | `engine/modules/handel.js`, `magie.js`, `engine/modules/index.js`, `tests/unit/modules/handel*`, `magie*` | Verträge, Routen über Regionen, Markt mit beweglichem Preis, Disziplinen mit Quelle, Anwendungen, Abhängigkeit und Entzug | Befehle gesperrt ohne aktivierende Entwicklung, Vertrag ab Folgerunde, Route durch Kriegsgegner unterbricht, Quelle nur mit Kontrolle und Adepten, unbezahlte Abhängigkeit löst Strafe und Entzug aus, ruhendes Modul nach Verlust der Entwicklung |
| H Harness | Opus-Leitung, Sonnet-Worker | `engine/harness/`, `engine/cli.mjs`, `engine/ai/fallback.js`, `serve.mjs`, `.claude/agents/`, `.claude/commands/zug.md`, `.claude/hooks/`, `.claude/settings.json`, `.gitignore`, `tests/unit/harness/` | Kommandozeile, atomares Schreiben mit Sperre, Einlesen, Aufträge, Status, Ersatzpolitik, Serverendpunkte und Server-Sent-Events, die Subagenten der Zugarbeiter und Spielrichter mit Modell im Frontmatter, `/zug`, Hooks mit Pfadfilter, `campaigns/` gitignored | Exit-Codes jedes Befehls, Idempotenz, `conflict`, `stale`, teilweise gültiger Vorschlag, Abbruch beim Schreiben lässt den Zustand unverändert, `tamper` bei manipuliertem Zustand, Hook lehnt Schreiben in `state.json` ab und lässt Entwicklungsdateien unberührt, kein `node:`-Import außerhalb des Harness |
| F Oberfläche am Kern | Opus-Leitung, Sonnet-Worker | `spielbrett/`, `docs/Frontend-Contract.md` | Spielbrett liest die Projektion statt des Mocks, Folgen jeder Entscheidung am Ort der Wirkung aus `preview()` (D15), Befehlstafel, Probenkarten mit Wahrscheinlichkeit und Rechnung, Würfelfeld, „Zug beenden", Herkunft je Wert, Änderungen der Runde, Agentenstatus, Weltgeschehen | jede angezeigte Folge stammt aus `preview()` und stimmt mit dem Ergebnis von `apply()` überein, keine Spiellogik im Frontend, Navigation aus Sicht-Deskriptoren, generischer Renderer für Module ohne eigene Tafel, keine Beschriftung außerhalb von `labels.json`, Frontend-Vertrag neu gegen den Code geschrieben |
| B Balance | Opus-Leitung, Sonnet-Worker | `tools/simulate.mjs`, `tests/balance/` | Simulation mit KI-Profilen auf verschiedenen Pfaden über viele Jahre, Machtindex je Volk | Bericht mit Empfehlungen für `tuning`, die Lane I übernimmt oder begründet ablehnt |

Gate W2. Eine Runde läuft im Browser von der Planung über „Zug beenden" und `/zug` bis zur nächsten Planung, mit aufgezeichneten Agentenausgaben statt Live-Agenten.

## W3 Integration und Abnahme

| Lane | Leitung und Worker | Dateibestand | Lieferung | Abnahme |
|---|---|---|---|---|
| P Probelauf | Opus-Leitung, Sonnet-Worker | `examples/campaigns/`, `tests/harness/` | eingecheckte Testkampagnen und ein Probelauf des Harness mit aufgezeichneten Agentenausgaben, darunter ungültige, verspätete, doppelte und widersprüchliche | jede Fehlerart aus dem Agentenvertrag führt zur dokumentierten Folge und Markierung, die Runde läuft weiter |
| E Browser-Ende-zu-Ende | Opus-Leitung, Sonnet-Worker | `tests/e2e/` | Playwright-Abläufe für Planung, Würfeln, Zug beenden, Herkunft, Nebel, Bestimmung | grün im eigenen Testserver, unabhängig von laufenden Kampagnen |
| R Rückbau | Opus-Leitung | alte Spiele, `CLAUDE.md`, `docs/INDEX.md`, `docs/Spielmechanik.md`, `docs/Speicherstand-Format.md`, `schema/savegame.schema.json` | alte Spiele nach Spielbarkeit des MVP von `main` entfernt (D1), Spielleiterkapitel der `CLAUDE.md` durch die Agentenrollen ersetzt, Eigentumstabelle neu, alte Dokumente archiviert | Zweig `archiv/vor-neuaufbau` enthält den alten Stand vollständig, `npm test` grün ohne alte Spiele |

Gate W3 ist die Abnahme durch den Eigner (siehe unten).

## Teststrategie

| Ebene | Gegenstand | Ort |
|---|---|---|
| Unit | jede Funktion des Kerns, jedes Modul, Welt-API, Harness | `tests/unit/` |
| Reproduktion | gleicher Seed, gleiche Entwürfe, Würfe und Vorschläge ergeben denselben Zustands-Hash, zweimal hintereinander und nach `replay` | `tests/unit/turn/`, `tests/harness/` |
| Langlauf-Invarianten | Kampagnen mit Ersatzpolitik für alle Völker über viele Jahre, nach jeder Runde alle Invarianten des Regelkerns, keine negativen Vorräte, Werte in ihren Klemmen, `rev` monoton, Protokolleintrag zu jeder Änderung | `tests/balance/` |
| Validatorkorpus | gültige und gezielt ungültige Entwicklungen, Ereigniskarten, Bestimmungen und Vorschläge, je Issue-Code mindestens ein Fall, der durchgerechnete Pfad als Fixture | `tests/fixtures/validator/` |
| Balancesimulation | KI-Profile auf Handel, Befestigung, Magie und Krieg, Machtindex je Volk, Erkennung dominanter Pfade und davonziehender Völker | `tools/simulate.mjs` |
| Harness-Probelauf | aufgezeichnete Agentenausgaben statt Live-Agenten, Phase A und B, Richterbefunde, Fehlerfälle | `tests/harness/` |
| Browser-Ende-zu-Ende | Abläufe in Playwright gegen einen eigenen Testserver | `tests/e2e/` |
| Abnahme durch den Eigner | Spielen einer Kampagne im Browser mit Live-Agenten | Kriterien unten |

Technische Tests, beobachtete Bedienung und die gestalterische und fachliche Abnahme durch den Eigner werden getrennt geführt und getrennt berichtet.

### Abnahmekriterien des Eigners

1. Eine neue Kampagne in Hochland startet mit Bergnomaden, Schädelklan und Talbund auf einer erzeugten Karte, die beim Erkunden wächst.
2. Die Karte ist die Hauptfläche. Planen, Würfeln und „Zug beenden" gelingen ohne Terminal außer dem Tippen von `/zug`.
3. Jede Entscheidung zeigt ihre Folgen vor dem Festlegen dort, wo sie wirken, und jede Probe vor dem Wurf Ziel, Modifikatoren mit Quelle und Wahrscheinlichkeit, nach dem Wurf die ganze Rechnung.
4. Zu jedem Wert ist sichtbar, woher er kommt, und die Änderungen der Runde sind vollständig aufgelistet.
5. Neue Entwicklungen passen erkennbar zu dem, was das Volk getan hat, und eine eigene Forschungsrichtung führt zu einem passenden Kandidaten.
6. Ein Pfad wie im [durchgerechneten Fall](Spieldesign.md#durchgerechneter-pfad) ist spielbar, mindestens bis zum Markt am Pass oder zum Steinwall.
7. Rivalen handeln sichtbar und nach erkennbarer Haltung, ihre Vorräte und Pläne bleiben verborgen.
8. Ein scheiternder Agent ist markiert, die Runde läuft weiter.
9. Die Bestimmung ist mit Meilensteinen sichtbar, ein Wechsel ist möglich, Sieg und Untergang sind in einer Testkampagne erreichbar.
10. Weltgeschehen zeigt die Befunde der Spielrichter, und ein schwerer Befund wird vor der nächsten Runde vorgelegt.
11. Die Wartezeit einer Runde liegt beim Welt-Agenten, Rat, Rivalen, Forschung und Chronist laufen, während der Eigner plant.

## Gates

Vor dem Zusammenführen einer Lane:

1. `npm test` grün, darin `npm run check` und alle Unit- und Abnahmetests.
2. `npm run test:e2e` grün, sobald die Lane Oberfläche oder Server berührt.
3. Linter und Syntaxprüfung ohne Befund.
4. Unabhängige Durchsicht durch einen Opus-Agenten, der an der Lane nicht mitgearbeitet hat, gegen Regelkern, Agentenvertrag und Diff.
5. Selbstberichte von Workern gelten erst nach Prüfung gegen den Dateistand als erledigt.

Am Ende jeder Welle:

1. Dokumentabgleich. Die Orchestrierung gleicht Regelkern, Agentenvertrag und Frontend-Vertrag gegen den Code ab und löst jede Abweichung durch eine Entscheidung auf.
2. Journal. Ein Eintrag in [Entwicklungsjournal.md](Entwicklungsjournal.md) hält fest, was sich geändert hat, was entschieden wurde und was offen bleibt.
3. Neue Grundsatzentscheidungen kommen nach [Entscheidungen.md](Entscheidungen.md).

## Dokumentationspflichten

| Dokument | gepflegt von | Anlass |
|---|---|---|
| Regelkern | Orchestrierung, Änderungsvorschläge aus K1 bis K3, M1, M2 | jede Regeländerung, mit Erhöhung von `rulesVersion`, wenn gespeicherte Kampagnen betroffen sind |
| Agentenvertrag | Orchestrierung, Änderungsvorschläge aus H | jede Änderung an Formaten, Rollen, Pfaden oder Hooks |
| Spieldesign | Orchestrierung | geänderte Absicht oder beantwortete Eignerfrage |
| Frontend-Vertrag | Lane F | jede Änderung an Sichten, Feldern oder testids |
| Entscheidungen | Orchestrierung | jede neue Grundsatzentscheidung und jede Revision |
| Entwicklungsjournal | Orchestrierung | Ende jeder Welle |
| `docs/INDEX.md` | Orchestrierung | neue oder abgelöste Dokumente |

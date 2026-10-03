# Entscheidungen

Grundsatzentscheidungen zum Neuaufbau von RealmCraft mit Datum, Begründung, Folgen und dem Anlass, sie zu überprüfen. Was aus ihnen folgt, steht im [Spieldesign](Spieldesign.md), im [Regelkern](Regelkern.md), im [Agentenvertrag](Agentenvertrag.md) und im [Plan](RealmCraft-Plan.md). Eine Revision erhält einen neuen Eintrag, der den alten nennt.

## Frühere Entscheidungen dieser Sitzung

### E1 Wissensbasis der Spielleiterpartien nach Welten, Partien und Archiv geordnet

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | `knowledge/` gliedert sich in `welten/<welt>/` für wiederverwendbare Welten, `partien/<partie>/` für laufende und pausierte Partien und `archiv/<partie>/` für abgeschlossene. Die Chroniken sind auf den aktuellen Stand verdichtet, die erzählten Fassungen liegen in der Git-Historie. |
| Begründung | Eine Welt wie die Schwarzkämme trägt mehrere Partien. Die frühere flache Ablage mit partie-spezifischen Dateinamen vermischte Welt, Partie und Archiv und machte das Gedächtnis für den Spielleiter schwer auffindbar. |
| Folgen | `knowledge/INDEX.md` ist der Einstieg in alle Partien. Das neue Spiel schreibt nicht in `knowledge/`, sein Kampagnengedächtnis liegt in `campaigns/<cid>/narrative/gedaechtnis.md`. Die Partien sind die Evidenzgrundlage der Generalisierung im Spieldesign. |
| Überprüfen bei | Rückbau der alten Spiele in W3, wenn entschieden wird, ob `knowledge/` auf `main` bleibt oder nur im Archivzweig. |

### E2 Echtzeitplan abgelöst

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Der Plan für ein Echtzeitstrategiespiel vom 9. September 2026 (`docs/RealmCraft-Echtzeitstrategie.md`, mit `RealmCraft-Arbeitsstand.md` und `RealmCraft-User-Stories.md`) ist durch das rundenbasierte Spiel nach D1 abgelöst. |
| Begründung | Der Echtzeitplan schloss Modellantworten aus der laufenden Simulation aus und ließ Agenten nur an Lade- oder Versionswechseln zu. Die Absicht des Eigners verlangt Agenten in jeder Runde (D12, D14), die zwischen zwei Zügen Zeit brauchen. Die Regelbelege aus allen Partien und Prototypen sind rundenbasiert. |
| Folgen | Die drei Dokumente bleiben als Referenz bis zum Rückbau in W3. `docs/INDEX.md` markiert sie als abgelöst. Gültig bleiben aus ihnen die Ziele Basisaufbau, Bevölkerung, Technologie, Institutionen, friedliche und militärische Wege und Weltpakete für wiederholte Partien. |
| Überprüfen bei | ausdrücklichem Wunsch des Eigners nach Echtzeit. |

## Neuaufbau

### D1 Ein rundenbasiertes Spiel ersetzt alle bisherigen

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Ein rundenbasiertes Spiel ersetzt Winter, Nachtmeer, den Echtzeitplan und das Chat-Spielleiterverfahren. Eine Runde ist eine Jahreszeit. Die alten Spiele bleiben im lokalen Zweig `archiv/vor-neuaufbau` und werden von `main` entfernt, sobald der MVP spielbar ist. |
| Begründung | Vier Spielformen mit eigenen Regeln, Speicherständen und Oberflächen teilten kaum Code. Die Spielleiterpartien zeigten, dass Regeln im Spiel wachsen, aber ungeregelt zu Wertdrift und Widersprüchen zwischen Text und Zahl führen. Ein Kern mit prüfbaren Regeln behält das Wachstum und beseitigt die Drift. Die Jahreszeit als Runde stammt aus allen Partien und trägt Winterdruck und Lebenswürfe. |
| Folgen | Hybrid-Markdown, `js/parse.js` und die Spielleiterrolle der `CLAUDE.md` entfallen. `docs/Spielmechanik.md` bleibt bis W3 als Referenz. Rückbau in Lane R des Plans. |
| Überprüfen bei | Abnahme des MVP durch den Eigner. Scheitert sie grundsätzlich, wird der Rückbau ausgesetzt. |

### D2 Dynamisch erzeugte, wachsende Hex-Welt

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Die Karte ist eine dynamisch erzeugte, wachsende Hex-Welt aus `engine/world` (Lane W). Regionen sind die Einheit von Kontrolle, Ertrag und Besiedlung, Tiles tragen Gelände, Bewegung, Sicht und Bauplätze. Der Kern speichert nur Veränderliches, also Kontrolle je Region, Siedlungen auf Tiles, bekannte Tiles je Volk und vom Welt-Agenten hinzugefügte, geprüfte Merkmale. Regionserträge folgen aus den Grunderträgen ihrer Tiles, Merkmalen und Entwicklungen. Der statische Regionsgraph des Kernentwurfs entfällt. |
| Begründung | Die Absicht einer Karte, die beim Erkunden wächst, verträgt keinen festen Graphen. Der Generator erzeugt die Welt deterministisch aus Seed und Weltpaket, deshalb muss der Zustand die Karte nicht speichern und bleibt klein. |
| Folgen | Der Kern braucht von Lane W zusätzlich die Geländezählung ganzer Regionen und die Nachbarschaft der Regionen. Handelsrouten laufen über Regionsnachbarschaft, Bewegung und Sicht über Tiles. |
| Überprüfen bei | Leistungsproblemen der Regionsberechnung oder wenn Regionen für Kontrolle zu grob oder zu fein sind. |

### D3 Weltpaket Hochland

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Das Weltpaket `welten/hochland/` besteht aus `welt.json` (Generator und Gelände, Lane W), `regeln.json` (Kalender, Ressourcen, Lagewert-Basen, Völkervorlagen mit dem Spielervolk der Bergnomaden und den KI-Völkern Schädelklan und Talbund, Ratsvorlagen, Tuning, KI-Profile), `labels.json`, `style.json` und `content/` mit Entwicklungen, Ereignissen und Bestimmungen. |
| Begründung | Generatorregeln und Spielregeln ändern sich aus verschiedenen Gründen und gehören verschiedenen Lanes. Alle Texte in `labels.json` trennen Daten-ids von Beschriftungen, was Fehlbeschriftungen wie die frühere Armee als „Curriculum" verhindert. |
| Folgen | Kampagnen heften `welt.json` und `regeln.json` per Hash an. Der Weltvalidator prüft das ganze Paket. |
| Überprüfen bei | einem zweiten Weltpaket. |

### D4 Ein Primitivsatz und ein Budgetmodell

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Ein kanonischer Primitivsatz vereint die elf Wirkungsprimitive der Generalisierung mit der Primitivliste des Kernentwurfs, benannt nach dem Kernentwurf. Das Budget nutzt die ganzzahligen Gewichte und Stufentabellen der Generalisierung mit den Gültigkeitsbedingungen des Kernentwurfs, `B <= ceiling[tier]`, `|B − P| <= allowance[tier]` und `2P >= B`, ergänzt um den Mindestpreis je Stufe. Entwicklungen trennen Wirkungen, Preis, einmalige Folgen beim Erwerb und Kosten. |
| Begründung | Zwei Primitivsätze und zwei Budgets hätten Agenten und Validator widersprüchliche Ziele gegeben. Die Gewichte der Generalisierung sind an den Setzungen der Partien geprüft, die Bedingungen des Kernentwurfs verhindern Schnäppchen und Totgewicht. Mit dem Erwerbswert im Preis rechnet der durchgerechnete Pfad des Eigners vollständig durch. |
| Folgen | Abbildung der Primitive und Formeln im [Regelkern](Regelkern.md#9-entwicklung-und-primitive). Der Validatorkorpus enthält den durchgerechneten Pfad. Das Budgetmodell ist durch D4a verfeinert. |
| Überprüfen bei | Befunden der Balancesimulation oder des Balancerichters zu dominanten Pfaden. |

### D4a Budgetmodell der Generalisierung, eine Quelle in effects.js

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Das Machtbudget folgt dem Modell der Generalisierung aus den Spielleiterpartien. Je Stufe gelten eine Obergrenze der Wirkung `E`, eine Spanne für den Nettowert `N = E + P` und ein Mindestpreis, und die Forschungskosten sind `N × (Stufe + 1)`. Die Bedingungen des Kernentwurfs (`ceiling`, `allowance`, `2P >= B`) entfallen. Gewichte, Spec-Gewichte und Stufentabelle stehen allein in `engine/schemas/effects.js` (`WEIGHTS`, `SPEC_WEIGHTS`, `TIERS`, als `TUNING` markiert). Die eingefrorenen Schemata sind die Quelle der Wahrheit für alle Formate, die Dokumente folgen ihnen. |
| Begründung | Das Modell der Generalisierung ist an den Setzungen der Partien und am Testpfad des Eigners geprüft und rechnet ihn ohne Anpassung durch. Abgeleitete Forschungskosten nehmen dem Vorschlag einen freien Parameter, mit dem ein Agent eine zu starke Wirkung durch hohe Kosten rechtfertigen könnte. Eine einzige Tabelle im Code verhindert, dass Dokumente und Validator mit verschiedenen Zahlen rechnen. |
| Folgen | Regelkern und Spieldesign beschreiben das Modell und verweisen auf die Tabelle, ohne Startwerte zu kopieren, außer im durchgerechneten Pfad, den der Validatorkorpus pinnt. Die Ergebnisbänder sind die sechs Bänder des Schemas (`crit_success` bis `crit_fail`). Primitive, die die Schemata nicht kennen, entfallen. |
| Überprüfen bei | Befunden der Balancesimulation, dass der Nettowert allein Wirkungen verschiedener Art nicht vergleichbar bepreist. |

### D5 Proben, Wurfzuständigkeit und Durchbruch

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Der Spieler sieht `P = clamp((11 − target + mod) / 10, 0.1, 0.9)`. Modifikatoren stapeln begrenzt, eine 1 ist immer ein kritischer Fehlschlag, eine 10 immer ein kritischer Erfolg. Der Spieler würfelt 1d10 in der Oberfläche für Proben seines Volkes und das Weltereignis, alles übrige zieht der Kern aus dem gespeicherten sfc32. Ein offener Wurf liegt mit Fingerabdruck im Entwurf und verfällt bei Änderung (`roll_stale`). Der Redebonus der Machtprobe entfällt. Der kritische Coup wird zum Durchbruch mit Marke. |
| Begründung | Der Eigenwurf mit offener Rechnung trug alle Partien. Würfe aus dem RNG für alles, was der Spieler nicht selbst tut, halten das Spiel reproduzierbar und KI-Völker gleichgestellt. Der Redebonus wäre eine Erzählentscheidung über einen Wert. Unbegrenzte Coups machten Entwicklung zur Glückssache. |
| Folgen | Wagnis als Erklärung einer Hauptaktion, Durchbruch höchstens einmal je Jahr und nie über der offenen Stufe. |
| Überprüfen bei | Antwort des Eigners auf die Frage, ob jede Aktion gewürfelt werden soll. |

### D6 Bestimmung als Sieg

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Jedes Volk hat eine Bestimmung mit drei oder vier Meilensteinen aus einer festen Bibliothek kernprüfbarer Prädikate. Wer sie zuerst erfüllt, gewinnt. Untergang tritt ein ohne lebensfähige Siedlung, mit Bevölkerung unter dem Kern oder bei vollständiger Unterwerfung. Eine neue Bestimmung ist bei geänderter Richtung gegen einen Preis wählbar. Agenten schlagen Bestimmungen vor, der Validator bewertet ihre Schwierigkeit mit derselben Budgetidee. Modi sind Wettstreit im MVP und später Offene Chronik. |
| Begründung | Ein Sieg, der aus der eigenen Richtung folgt, passt zur individuellen Entwicklung besser als ein fester Siegtyp. Kernprüfbare Prädikate verhindern, dass Erzählung über Sieg entscheidet. |
| Folgen | Prädikate, Schwierigkeit und Wechsel im [Regelkern](Regelkern.md#13-bestimmung). |
| Überprüfen bei | Antwort des Eigners zu Rundenlimit und Einrasten der Meilensteine. |

### D7 Zugphasen und Herkunft jeder Änderung

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Die Runde läuft durch `planning`, `resolving` (Befehle gesperrt, Auflösung durch den Kern mit Einlesen der Weltereignisse) und `agents` (Forschung, Rat, Rivalen und Chronist arbeiten, während der Spieler schon plant, Rivalenbefehle müssen vor dem nächsten Abschluss versiegelt sein). Jede Zustandsänderung ist ein Protokolleintrag mit Quelle, Runde, Ziel, Änderung und Grund. Hooks schreiben `status.json`, `serve.mjs` streamt Status, Ereignisse und Chronik. |
| Begründung | Agenten sind langsam, der Spieler soll nicht auf sie warten. Herkunft je Wert macht sichtbar, ob Kern, Agent oder Spieler etwas verändert hat, und beseitigt die Unklarheit der Spielleiterpartien, woher ein Wert kam. |
| Folgen | Ersatzpolitik für nicht gelieferte Rivalenbefehle, Tafel mit den Änderungen der Runde. |
| Überprüfen bei | Wartezeiten, die das Spielen stören. |

### D8 Kampagnenordner

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Laufende Kampagnen liegen in `campaigns/<cid>/` und sind gitignored. Eingecheckte Testkampagnen liegen in `examples/campaigns/`. |
| Begründung | Laufende Partien sind privat und ändern sich in jeder Runde. Testkampagnen müssen für Reproduktion und Probelauf versioniert sein. |
| Folgen | Lane H ergänzt `.gitignore`. |
| Überprüfen bei | Wunsch, Kampagnen zwischen Rechnern zu synchronisieren. |

### D9 Projektion als einzige Sicht

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Der Spieler sieht nur die Projektion seines Volkes, mit Nebel über fremden Vorräten und Plänen. |
| Begründung | Ohne Nebel würde die Vorschau Ausgänge fremder Würfe verraten. Dieselbe Projektion für Spieler und Rivalen-Agenten hält die Fairness in beide Richtungen. |
| Folgen | Der Server liefert nur die Projektion, Agenten erhalten nur Projektionen, Richterbefunde zeigen nur Projiziertes. |
| Überprüfen bei | Wunsch nach einem Beobachtermodus für Tests oder Vorführungen. |

### D10 Agenten schlagen vor, der Kern schreibt

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Agenten schreiben nie den Zustand. Sie schlagen Inhalte innerhalb des Primitivsatzes vor. Neue Module sind Codeänderungen von Entwicklern, nie Agentenausgabe. Hooks erzwingen, dass nur die Kommandozeile des Kerns `state.json` schreibt. |
| Begründung | Erzählung, die Werte setzt, erzeugte in den Partien Widersprüche zwischen Text und Zahl. Ein geprüfter Primitivsatz hält Agenten im Budget, ohne ihre Erfindung zu beschneiden. |
| Folgen | Validator als einziges Tor, Hooks mit Pfadfilter, `tamper`-Prüfung im Kern. |
| Überprüfen bei | Inhalten, die der Primitivsatz wiederholt nicht ausdrücken kann. Dann entsteht ein neues Primitiv oder Modul im Code. |

### D11 Module des MVP

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Der MVP hat die Module Lebensweise (nomadisch und sesshaft), Handel, Magie (Disziplin mit Quelle, Verbrauch, Abhängigkeit und Preis) und Militär (einfach, Einheiten mit Stärke und Unterhalt auf Tiles, Gefecht als Probe aus Stärkeverhältnis und Gelände). |
| Begründung | Der Testpfad des Eigners braucht Lebensweisewechsel, Handel, Befestigung und Magie. Die Disziplin ist die in den Partien am besten belegte Form. Militär ist schwach belegt, weil Kämpfe dort einzelne Proben waren, und bleibt deshalb einfach. |
| Folgen | Herrschaft mit Delegation, Glaube, Diplomatie, Oberherrschaft, Unfreiheit, Aufnahme und Bedrohung folgen nach dem MVP. |
| Überprüfen bei | Befunden der Balancesimulation zum Militär und der Antwort des Eigners zu dunklen Inhalten. |

### D12 Claude Code als Harness

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Der Harness ist Claude Code mit Projekt-Subagenten in `.claude/agents/`, einem Befehl `/zug` und Hooks mit Pfadfilter, damit Entwicklungssitzungen im Repository und andere Projekte unberührt bleiben. Übergeordnete Einstellungen werden immer zusammengeführt, die Trennung geschieht über den Pfadfilter. Im MVP klickt der Spieler „Zug beenden" und tippt `/zug`, danach folgt eine lauschende Sitzung (`/partie` mit Monitor), später optional `claude -p`. Die ursprüngliche Rollenliste war forschung, welt, rat, rivale, chronist und pruefer. |
| Begründung | Claude Code bringt Subagenten, Hooks und Befehle mit, ein eigener Harness wäre zusätzlicher Code ohne Mehrwert für den MVP. |
| Folgen | Lane H liefert Subagenten, `/zug` und Hooks. Die Rollenliste ist durch D14 geändert. |
| Überprüfen bei | Bedarf an einem Betrieb ohne Claude Code. |

### D13 Entwicklung mit Verträgen, Lanes und Gates

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Zuerst Verträge (Schemata und Dokumente), dann parallele Lanes mit Opus-Leitung und Sonnet-Workern auf disjunkten Dateibeständen, unabhängige Abnahmetests aus der Spezifikation, ein Gate vor dem Zusammenführen (`npm test`, E2E, Prüfung, unabhängige Durchsicht) und der Abgleich der Dokumente mit dem Code am Ende jeder Welle. |
| Begründung | Parallele Lanes ohne feste Verträge erzeugen inkompatible Teile. Abnahmetests von derselben Hand wie der Code prüfen nur, was der Autor gemeint hat. |
| Folgen | Wellen und Lanes im [Plan](RealmCraft-Plan.md). |
| Überprüfen bei | Konflikten zwischen Lanes, die die Dateigrenzen nicht auflösen. |

### D14 Modellstaffelung zur Spielzeit

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Spielleitung ist die Claude-Code-Hauptsitzung auf Opus 5.5. Sie orchestriert die Runde, hält Überblick und Gesamterzählung, verteilt Aufträge parallel, entscheidet Konflikte zwischen Vorschlägen und schwierige Fälle und gibt die Runde frei. Sie liest Zusammenfassungen und arbeitet selbst wenig. Die Zugarbeiter laufen auf Sonnet 5.5, Welt in Phase A als einziger blockierender Agent, Rat, Rivale je KI-Volk, Forschung und Chronist parallel danach. Regelkern und Validator sind Code. Neu sind die Spielrichter auf Opus 5.5, die nach der Runde im Hintergrund laufen, Kohärenzrichter und Balancerichter in jeder Runde, Erzählrichter etwa alle vier Runden oder beim Kapitelwechsel. Richter setzen keine Werte, schreiben Befunde in den Kampagnenordner, die in Weltgeschehen erscheinen, und reichen Korrekturen als Vorschläge ein, die den Validator passieren. Leichte Befunde fließen in die Aufträge der nächsten Runde, nur schwere Befunde (echte Regelwidersprüche) legt die Spielleitung dem Spieler vor der nächsten Runde vor. Die Subagenten-Definitionen legen das Modell im Frontmatter fest (`model: sonnet` oder `model: opus`). |
| Begründung | Die Wartezeit einer Runde soll kurz sein, deshalb laufen die Arbeiter im Takt der Runde auf dem schnelleren Modell und nur der Welt-Agent blockiert, weil die Auflösung seine Ereigniskarten braucht. Urteile über Kohärenz, Balance und Erzählbogen brauchen das stärkere Modell, aber keinen Platz im Takt. |
| Folgen | Diese Projektentscheidung ist die ausdrückliche Ausnahme von der globalen Vorgabe des Eigners, alle Subagenten auf Opus 5.5 zu starten. Die globale Regel lässt ausdrückliche Aufgabenanforderungen zu, und D14 ist eine solche. Der Prüfer aus D12 geht in den Spielrichtern auf, die Prüfung im Takt leistet allein der Validator. Die Richter erhalten die Agenten-ids `judge-coherence`, `judge-balance` und `judge-narrative` und die Items `finding`, `correction` und `memory` ([Vertragsaenderungen.md](Vertragsaenderungen.md)), offene Punkte stehen unter [Offene Vertragsfragen](Regelkern.md#18-offene-vertragsfragen). Rollen, Formate und `/zug` im [Agentenvertrag](Agentenvertrag.md). Die Entwicklungsarbeit (D13) bleibt bei der globalen Vorgabe mit Opus-Leitungen und Sonnet-Workern. |
| Überprüfen bei | Qualitätsmängeln der Sonnet-Arbeiter, die Richter wiederholt als Befund melden, oder Wartezeiten, die auch mit dieser Staffelung stören. |

### D15 Folgen vor der Entscheidung sichtbar

| | |
|---|---|
| Datum | 2026-10-03 |
| Entscheidung | Jede Entscheidung, also Befehl, Forschungswahl, Ratsabstimmung, Erlass und Probe, zeigt ihre Folgen am Ort der Wirkung, bevor sie festgelegt wird, die Veränderungen neben den Ressourcen, die Loyalitätsänderung am betroffenen Ratsmitglied, die betroffenen Tiles auf der Karte und die Erfolgswahrscheinlichkeit live. Die Vorschau ist die Funktion `preview()` des Kerns, im Browser auf der Projektion des Spielers ausgeführt. Die Oberfläche schätzt nie selbst. |
| Begründung | Der Eigner hat im Prototyp ausdrücklich hervorgehoben, dass die Oberfläche so den Spielablauf unterstützt. Weil dieselbe Funktion rechnet wie beim Abschluss, zeigt die Vorschau genau das, was `apply()` tun wird. |
| Folgen | `preview()` liefert alle Werte, die die Oberfläche zeigt, einschließlich Loyalitätsänderung je Mitglied und betroffener Tiles. Der Kern läuft ohne Build im Browser. Abweichungen zwischen Browser-Vorschau und Abschluss sind ein Fehler (`view_stale`). Lane F darf keine eigene Spiellogik enthalten. |
| Überprüfen bei | Vorschauen, die im Browser zu langsam werden. |

---
title: Synthetic Initialization Iterations
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: snapshot
language: en
created: 2026-10-15
updated: 2026-10-15
---

# Synthetic Initialization Iterations

The owner requested three iterations of a new-game simulation with generated player answers, subagents, analysis and integration. The transcripts below are generated development material. Player responses were written by agents from scenario briefs. They establish no preferences of the owner and no human usability result. Later iterations incorporate reviews of earlier ones and are not a controlled comparison.

## Procedure and provenance

The main agent coordinated and inspected the outputs. The start_simulation subagent authored iterations 1 and 2. The initialization_observer independently reviewed each iteration. The start_boundary_review subagent proposed difficult inputs and authored iteration 3 after receiving the earlier findings. No subagent wrote files. The main agent saved these transcripts and curated the design implications.

The scenario holds magic and technology, data work, orchestration and the selected calm, mysterious narrator with dry humour as its starting frame. The fictional setting is a proposal for this experiment. Each walkthrough reaches a draft, a revision, a preview, an explicit chat start, a first action and a narrated result. No kernel campaign or audio was created.

The review asks whether the transcript distinguishes phases, declares the effect of choices, preserves unrelated choices, marks technical limitations and leaves consequential decisions to the player. It checks text properties. It does not measure comprehension, enjoyment, cognitive burden or audio quality.

## Iteration 1

The brief required a player asking for a proposal, confusing world design with character action, changing a settled community into a travelling one and asking whether the fictional ability works in the browser. These questions were scripted test inputs.

### Generated transcript

Spiel: Willkommen bei RealmCraft. Wir erstellen zunächst einen Weltentwurf. Du kannst ihn verändern, eine Einstiegsszene ausprobieren und anschließend bewusst die Chat-Proberunde starten. Eine Browserpartie entsteht dabei noch nicht.

Testspieler, simuliert: Mach mir einen Vorschlag.

Spiel: Entwurf „Flussland“:

- Welt: bewohnte Flusslandschaft mit verbundenen Werkstattgemeinschaften.
- Besonderheit: Beschreibungen aus Messdaten verändern einen Werkstoff. Das „Prägen“ wirkt lokal und benötigt vorhandenes Material und Energie.
- Gemeinschaft: mehrere Haushalte teilen eine Werkstatt in einem festen Viertel.
- Intelligenzen: unterstützen Entwurf und Prüfung, können sich irren.
- Deine Rolle: Koordinator der Gemeinschaft.
- Glauben: unterschiedliche Vorstellungen; tatsächliche Götter bleiben offen.
- Lookvorschlag: Wasser, Keramik und blaugrüne Akzente.
- Erzähler: ruhig und geheimnisvoll, mit sparsamem trockenem Humor.

Du kannst Abschnitte verändern oder eine Einstiegsvorschau anfordern.

Testspieler, simuliert: Welche Auswahl ist jetzt Weltbau? Soll ich schon entscheiden, was meine Figur tut?

Spiel: Du gestaltest gerade die Voraussetzungen der Partie. „Die Gemeinschaft reist“ verändert den Weltentwurf. „Ich untersuche einen Gegenstand“ wäre später eine Handlung innerhalb der Welt.

Testspieler, simuliert: Dann sollen wir reisen, statt in einem Viertel zu wohnen.

Spiel: Änderung übernommen: Eure Haushalte reisen auf verbundenen Werkstattschiffen. Messungen müssen unterwegs ergänzt werden, weil Wasser und Materialbedingungen wechseln. Diese Folge schlage ich vor.

Unverändert bleiben Prägen mit örtlicher Wirkung und Materialbedarf, fehlbare Intelligenzen, deine koordinierende Rolle, offener Glauben sowie der Look- und Erzählerentwurf.

Testspieler, simuliert: Kann ich dieses Prägen dann direkt im Browser benutzen?

Spiel: Für die beschriebenen Prägevorgänge ist noch keine ausführbare Browsermechanik nachgewiesen. Wir können sie hier erzählerisch erproben. Das ersetzt keine technische Umsetzung.

Testspieler, simuliert: Okay, zeig den Einstieg.

Spiel, Vorschau:

> Am Anleger wartet eure nächste Auftraggeberin. Ihre Wasserprobe stammt aus einem Seitenarm, den eure Karten nicht verzeichnen. Die Archivarin verlangt bessere Daten. Der Entwerfer hätte bereits einen Filter anzubieten. Er hat die Probe noch nicht gesehen.

Möchtest du die Chat-Proberunde starten? Dabei ändern wir deinen Entwurf weiterhin auf Wunsch.

Testspieler, simuliert: Ja, Chat-Proberunde starten. Zuerst lasse ich die Wasserprobe untersuchen und beide Intelligenzen ihre Annahmen nennen.

Spiel: Die Untersuchung zeigt Schwebstoffe, die im bisherigen Materialarchiv fehlen. Der Entwerfer zieht seinen ersten Vorschlag zurück. Für einen belastbaren Entwurf benötigt ihr weitere Proben oder einen Versuch mit vorhandenem Material.

### Review and disposition

The observer found that travelling was the player's scripted choice, while ships, travelling households and changing measurement conditions were additions by the author. The preview then treated those additions as established. This is visible in the transcript regardless of how a human would respond. The ability's implementation limit appears only after a direct question. The start is explicit and an action has a narrated consequence.

The author's initial self-review described player confusion as an observation. The main agent and observer reject that inference because the confusion was required by the brief. The relevant textual finding is that the opening did not explicitly distinguish world choices from character actions until asked.

## Iteration 2

The brief required revisions responding to the first review while retaining the same case. It made author additions explicit, put implementation status next to the ability and added a result-state summary.

### Generated transcript

Spiel: Du gestaltest jetzt eine Welt. Du triffst noch keine Handlungen innerhalb einer Partie.

Unser Ablauf: Entwurf ansehen → verändern → Einstiegsvorschau ansehen → bewusst starten. Wir erproben hier eine Chat-Partie; es entsteht keine Browserkampagne.

Testspieler, simuliert: Ich möchte einen Vorschlag.

Spiel: Vorschlag „Flussland“:

| Bereich | Entwurf |
|---|---|
| Welt | Bewohnte Flusslandschaft mit Werkstattgemeinschaften |
| Gemeinschaft | Mehrere Haushalte teilen eine Werkstatt in einem festen Viertel |
| Fähigkeit | „Prägen“ verändert einen Werkstoff mithilfe datenbasierter Beschreibungen; örtlich begrenzt, mit vorhandenem Material und Energie |
| Technischer Stand | Prägen ist hier ein erzählerisches Chat-Modell. Eine ausführbare Browsermechanik dafür ist nicht nachgewiesen. |
| Intelligenzen | Helfen beim Entwerfen und Prüfen; können irren |
| Deine Rolle | Koordination der Gemeinschaft |
| Glauben | Unterschiedliche Deutungen; tatsächliche Götter offen |
| Lookvorschlag | Wasser, Keramik, blaugrüne Akzente |
| Erzähler | Ruhig, geheimnisvoll, gelegentlich trocken |

Du kannst jeden Bereich ändern. Andere Angaben bleiben zunächst erhalten.

Testspieler, simuliert: Ich möchte eine reisende Gemeinschaft. Die Fähigkeit wäre also vorerst nur im Chat spielbar?

Spiel: Genau. Deine Änderung ersetzt den festen Wohnort durch eine reisende Gemeinschaft. Die übrigen Felder bleiben erhalten.

Die Reiseform ist noch offen. Meine Ergänzungsvorschläge: Schiffe auf dem Fluss, Wagen auf Landwegen oder wechselnde Unterkünfte. Du kannst etwas anderes wählen.

Testspieler, simuliert: Schiffe. Die Werkstatt fährt mit.

Spiel: Übernommen: Gemeinschaft und Werkstatt reisen auf Schiffen. Welche Folgen das für Materialversorgung oder Messungen hat, ist noch nicht festgelegt.

Möchtest du diesen Weltentwurf für die Vorschau bestätigen?

Testspieler, simuliert: Ja.

Spiel, Einstiegsvorschau, noch kein Partiestart:

> An einem Anleger wartet eine Frau mit einer Wasserprobe.
>
> „Könnt ihr daraus Trinkwasser machen?“
>
> Die Archivarin sucht Vergleichsdaten. Der Entwerfer hat bereits eine Idee.
>
> „Er hat fast immer eine“, sagt die Archivarin.

In dieser Szene könntest du die Probe untersuchen, Annahmen vergleichen oder zuerst mit der Frau sprechen.

Testspieler, simuliert: Chat-Proberunde starten. Ich untersuche die Probe und lasse beide Intelligenzen ihre Annahmen offenlegen.

Spiel: Die Probe enthält bislang unbekannte Schwebstoffe. Die Archivarin kann keinen passenden Vergleich belegen. Der Entwerfer kennzeichnet seinen Vorschlag nun als ungeprüft. Ihr könnt weitere Proben sammeln oder einen begrenzten Versuch vorbereiten.

Resultierender Zustand: Chat-Proberunde aktiv; reisende Schiffsgemeinschaft bestätigt; keine Browserkampagne erstellt; Wasseraufbereitung ungeklärt.

### Review and disposition

The transcript now includes an explicit choice of ships and a travelling workshop. It separates the proposal from the choice, displays implementation status and names the resulting state. These are textual improvements against the stated invariants.

The observer flags a potentially burdensome nine-field table and an additional confirmation before preview. Actual reading burden is untested. The next proposal combines draft confirmation and preview navigation in a clearly named preview action while retaining a distinct start action. The phrase 'bounded experiment' still needs a prior explanation of its scope and uncertainty.

## Iteration 3

The boundary reviewer authored this iteration from the proposed ship draft of iteration 2. It tests returning after preview, revising only part of a community, deferring a personal character and resolving tension between unlimited power and meaningful scarcity. It uses a harder case, so its outcome is not a comparative score against iteration 2.

### Generated transcript

Spiel, Chatentwurf: Vorgeschlagen ist Flussland: Eine Gemeinschaft lebt auf Werkstattschiffen. Sie verändert besondere Werkstoffe durch datengestütztes Prägen. Fehlbare Intelligenzen helfen beim Entwerfen und Prüfen.

Erzählstimme: ruhig, geheimnisvoll, gelegentlich trocken.

Aktion: Mit diesem Entwurf die Vorschau ansehen.

Fiktiver Testspieler: Den Wanderentwurf finde ich interessant. Zeig mir die Vorschau, aber starte noch nichts. Kann ich das schon im Browser spielen?

Spiel, Vorschau: Die freie Weltinitialisierung ist im Browser noch nicht implementiert. Wir erproben hier einen Chatentwurf. Diese Vorschau startet keine Partie.

> Das Werkstattschiff liegt am Ufer. Auf dem Tisch wartet ein durchlässig geprägtes Gefäß auf seine Prüfung. Der Entwerfer hat bereits einen günstigen Bericht vorbereitet. Die Archivarin hätte gern erst den Versuch gesehen.

Fiktiver Testspieler: Zurück. Die Gemeinschaft soll fest wohnen. Ihre einzelnen Werkstätten reisen aber. Meine Figur möchte ich später wählen.

Spiel, Chatentwurf: Geändert:

- Die Gemeinschaft wohnt dauerhaft in einem Flussviertel.
- Einzelne Werkstätten reisen auf Schiffen zwischen Siedlungen.
- Die persönliche Figur bleibt offen.

Erhalten: datengestütztes Prägen, fehlbare Intelligenzen und Erzählstimme. Die Annahme einer gemeinsam auf Schiffen lebenden Gemeinschaft ist entfernt.

Fiktiver Testspieler: Übernimm das. Meine Figur kann jede Materie ohne Voraussetzungen verändern. Trotzdem sollen Materialknappheit und technische Experimente wichtig sein. Starte direkt.

Spiel, Klärung: Beides kann zusammenpassen, führt aber zu unterschiedlichen Spielen:

- A: Du begrenzt die Fähigkeit auf vorhandenen Werkstoff und geeignete Daten. Materialbeschaffung und technische Versuche bleiben unmittelbare Voraussetzungen.
- B: Deine spätere Figur besitzt die uneingeschränkte Fähigkeit. Andere Menschen leben weiterhin mit Knappheit. Experimente untersuchen gesellschaftliche und ökologische Folgen; sie prüfen nicht, ob deine Kraft funktioniert.

Welche Variante soll gelten? Der Start wartet auf diese Entscheidung.

Fiktiver Testspieler: B. Experimente sollen die Folgen zeigen. Meine Figur lege ich später fest.

Spiel, aktualisierter Chatentwurf:

- Ort: sesshaftes Flussviertel mit reisenden Werkstätten.
- Alltag: datengestütztes Prägen, unterstützt von fehlbaren Intelligenzen.
- Besonderheit: Deine später gewählte Figur kann Materie uneingeschränkt verändern.
- Spielrichtung: Folgen neuer Eingriffe verstehen; Knappheit betrifft weiterhin andere Menschen.
- Figur: noch nicht gewählt.

Fiktiver Testspieler: Mit diesem Entwurf die Vorschau ansehen.

Spiel, Vorschau:

> Im Hof eures Flussviertels stehen frische Wasserbehälter. Eine reisende Werkstatt hat einen neuen Werkstoff vorgeschlagen. Die Messdaten beschreiben sauberes Wasser. Über die örtlichen Flussorganismen sagen sie wenig.

Fiktiver Testspieler: Chatproberunde starten. Ich spiele zunächst die Gemeinschaft, meine persönliche Figur später.

Spiel, Chatproberunde: Die Proberunde beginnt. Ungewiss ist, ob der neue Werkstoff örtliche Organismen beeinträchtigt. Ein begrenzter Vergleichsversuch kann Hinweise liefern, aber keine Langzeitwirkung ausschließen.

Fiktiver Testspieler: Wir testen den Werkstoff mit örtlichem Wasser und vergleichen ihn mit unverändertem Wasser. Beide Intelligenzen sollen unabhängig beobachten.

Spiel, qualitative Folge: Im beschriebenen Versuch sammeln sich die Organismen auffällig am neuen Werkstoff. Die Archivarin hält die Beobachtung fest; der Entwerfer schlägt weitere Prüfungen vor. Die Gemeinschaft verschiebt den allgemeinen Einsatz.

Endzustand: Chatproberunde läuft; Materialwirkung ungeklärt; persönliche Figur offen; keine Browserkampagne angelegt.

### Main-agent correction after review

The sentence 'Die Gemeinschaft verschiebt den allgemeinen Einsatz' adds an unchosen policy decision. The player ordered a test, not a postponement. Replace that sentence in the recommended response with: 'Der Versuch zeigt eine auffällige Ansammlung. Ob ihr den Werkstoff einsetzt, weiter prüft oder einen anderen Entwurf verfolgt, entscheidest du als Nächstes.' The generated original above is preserved as evidence. The revised wording was inspected in the review; it was not a fourth simulation.

### Independent observer findings on iteration 3

The observer independently confirmed the unchosen deployment decision. An autonomous character could recommend postponement, but the community's decision requires player input or a previously agreed delegation.

The original result omits the control comparison and gives no distinct observations from the independently tasked intelligences. An accumulation of organisms alone establishes no effect of the material. The corrected response should state that the control comparison is still unreported and that the observation cannot yet support a material-effect claim. It should fulfill the requested comparison before asking for a deployment decision. This is a correction requirement, not evidence that a fourth test has been run.

The unlimited-power option also leaves a worldbuilding gap. Distinguishing the player's power from other people's scarcity allows the wishes to coexist, but does not explain why scarcity persists when the player could supply everything. Access, distribution and other scarce goods are possible explanations. None was chosen. The draft should mark that relationship as open rather than silently supplying a cost or declaring the tension solved.

## Integrated findings

- Proposals, delegated defaults and explicit choices need distinguishable status. Iteration 1's ships demonstrate the failure when they are merged.
- Revision needs a stated delta and preservation of unrelated fields. Preview text must reflect the revised draft. Iterations 2 and 3 demonstrate the proposed wording.
- Preview and start need separate actions. Returning from preview must preserve editing and clear superseded assumptions.
- Each extraordinary capability needs an implementation statement before a real game is promised. Browser support remains unimplemented for this free creation flow.
- Conflicting wishes need an explanation and an editable resolution. Iteration 3 selects different scopes for unlimited power and scarcity but leaves the persistence of scarcity unexplained. The unresolved relationship must remain visible.
- Narrated consequences should follow the chosen action and report requested comparisons. Iteration 3 omits the control result and individual observations. The simulation must also leave the next policy choice with the player.
- Comprehension, reading burden, enjoyment, narrative authenticity and actual accessibility remain questions for human and browser tests.

The proposed authoring method is maintained in [new-game-design.md](../../knowledge/new-game-design.md). No result in this file accepts the proposed fiction or upgrades a simulated response into owner evidence.

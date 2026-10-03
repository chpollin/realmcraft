# Harness

Der Harness führt eine Runde des rundenbasierten RealmCraft mit Claude Code als Spielleitung und spezialisierten Subagenten aus (D12, D14 in [Entscheidungen.md](Entscheidungen.md)). Rollen, Formate und Rechte regelt der [Agentenvertrag](Agentenvertrag.md), die Regeln der Kern im [Regelkern](Regelkern.md). Der Harness besteht aus acht Subagenten, zwei Befehlen, drei Hooks und einigen Helfern ohne eigene Spiellogik. Jede Zustandsänderung geht durch `node engine/cli.mjs`.

## Eine Spielsitzung

1. Claude Code im Repository starten, auf Opus. Die Befehle setzen das Modell für ihre Runde selbst auf `opus`.
2. Für den Browser `npm run serve` in einem eigenen Terminal. Die Oberfläche liest die Ansicht des Spielervolkes und `status.json` und zeigt laufende und gescheiterte Agenten.
3. `/partie` zeigt die Kampagnen aus `campaigns/index.json`. `/partie neu hochland 48213 bergnomaden hochland-1` legt eine neue an, `/partie hochland-1` zeigt den Stand einer bestehenden.
4. Der Spieler plant im Browser oder nennt der Spielleitung seine Befehle. Würfe legt er selbst ab, auch den Ereigniswurf seines Volkes.
5. `/zug` führt den Zug. Die Spielleitung fragt fehlende Würfe ab, versiegelt, startet den Welt-Agenten, löst die Saison auf, startet die Agenten der Phase B parallel, liest ihre Vorschläge ein, gibt die nächste Planung frei und startet die Richter im Hintergrund. Am Ende steht ein kurzer Bericht.

Eine neue Kampagne beginnt in Runde 0 in der Phase `agents`. Der erste `/zug` führt deshalb nur Phase B aus und gibt danach die Planung von Runde 0 frei.

## Rollen und Modelle

| Rolle | Subagent | Modell | Phase | Items |
|---|---|---|---|---|
| Spielleitung | Hauptsitzung mit `/zug` | Opus | ganze Runde | keine, nur Kommandos des Kerns |
| Welt | `rc-world` | Sonnet | A, blockierend | `event`, `feature` |
| Forschung | `rc-research` | Sonnet | B, je Volk | `entwicklung`, `bestimmung` |
| Rat | `rc-council` | Sonnet | B, Spielervolk | `person`, `goal`, `voice` |
| Rivale | `rc-rival` | Sonnet | B, je KI-Volk | `orders`, `stance` |
| Chronist | `rc-chronicler` | Sonnet | B | `narrative` |
| Kohärenzrichter | `rc-judge-coherence` | Opus | nach der Runde | `finding`, `correction` |
| Balancerichter | `rc-judge-balance` | Opus | nach der Runde | `finding`, `correction` |
| Erzählrichter | `rc-judge-narrative` | Opus | alle vier Runden | `finding`, `correction`, `memory` |

Der Dateiname der Subagenten ist `rc-<agenten-id>.md`, die Abbildung auf die ids aus `AGENTS` in `engine/schemas/common.js` steht in `tools/harness/lib.mjs`. Jeder Subagent liest seinen Auftrag und die darin genannten Dateien und schreibt genau eine Vorschlagsdatei. Keiner hat das Werkzeug `Agent`, Subagenten starten also keine weiteren Subagenten. `omitClaudeMd` hält die Projektanweisungen der Entwicklung aus ihrem Kontext fern. Kein Subagent hat eine Shell. Mit Bash erreichte ein Agent die Kommandos des Kerns (`roll`, `ingest`, `seal`, `apply`, `open`, `preview --draft`) und jede Schreibumgehung, die ein Filter über Befehlstexte nicht schließt. Die Schemas lesen die Agenten unter `engine/schemas/`, die Budgetaufschlüsselung je Item meldet ihnen die Vorprüfung nach jedem Schreiben.

## Dateifluss einer Runde

```
planning   preview, roll ... (Spieler würfelt)         drafts/<spieler>.json        Kern
           seal                                        agents/tasks/T0006/world-all.json
resolving  rc-world schreibt                           agents/proposals/world.T6.json
           ingest <datei>                              library.json, state.json      Kern
           apply --expect-rev <rev>                    log/T0006.json, Aufträge Phase B
agents     rc-research, rc-council, rc-rival,          agents/proposals/<id>.json
           rc-chronicler parallel
           ingest <datei> je Vorschlag                 agents/ingested/ oder rejected/,
                                                       agents/verdicts/, status.json
           open                                        Planung der nächsten Runde
planning   tasks --agent judge-*                       agents/tasks/T0007/judge-*-all.json
           Richter im Hintergrund                      agents/proposals/judge-*.T7.json
           nächster /zug liest sie zuerst ein, mit --consent nach Zustimmung des Spielers
```

Aufträge liegen unter `agents/tasks/T<runde4>/<agent>-<volk|all>.json`, Vorschläge unter dem Pfad aus `respondAs.path`. Die Schritte in `status.json` heißen wie die Aufträge, `<agent>-<volk>` oder `<agent>-all`. Unter diesem Namen trägt auch `ingest` seine Verdikte ein.

Die Spielleitung liest Vorschläge immer einzeln ein (`ingest <datei>`). Ein `ingest` ohne Datei würde auch Richtervorschläge mit Korrekturen einlesen, über die der Spieler noch nicht entschieden hat. Eine Korrektur mit `needsConsent` wird nur mit `--consent <proposalId>` übernommen, ohne Zustimmung weist der Kern sie ab und behält die Befunde.

## Laufmarke und Helfer

Die Helfer unter `tools/harness/` schreiben nur Laufmarke und Statusansicht, beide über die Sperre und das atomare Umbenennen aus `engine/harness/io.js`.

- `active-campaign.mjs` nennt die Kampagne, an der gearbeitet wird. Eine aktive Laufmarke gewinnt, sonst die zuletzt aktualisierte laufende Kampagne aus `campaigns/index.json`.
- `run-marker.mjs start|end` schreibt `campaigns/<cid>/run.json`. Solange die Marke aktiv ist, ordnen die Hooks gestartete Subagenten ihren Schritten zu (`agents`) und halten genau zugeordnete Agenten an ihren Vorschlag (`bound`). `end` gleicht den Status ein letztes Mal mit den Dateien ab.
- `status-note.mjs init|plan|step|sync` legt den Status der Runde an, trägt die offenen Aufträge als wartende Schritte ein, setzt einzelne Schritte, etwa einen hängenden Agenten auf `failed`, und gleicht mit `sync` den Status mit den Dateien ab.
- `reconcile.mjs` ist dieser Abgleich. Die Phase folgt `state.json`. Ein Schritt ist erledigt, sobald der Vorschlag seines Auftrags vorliegt, eingelesen oder abgewiesen ist. Gescheitert ist er, wenn die Phase seines Auftrags vorbei ist und kein Vorschlag vorliegt. Richter laufen im Hintergrund durch die Planung und scheitern dabei nie. Die Hooks rufen den Abgleich nach jedem Start und Ende eines Agenten auf.
- `dryrun.mjs` ist der Probelauf ohne Sprachmodell, siehe unten.

Der Agentenvertrag sieht für Laufmarke und Statuseinträge die Kommandos `run` und `status-note` des Kerns vor. Bis der Kern sie anbietet, übernehmen die Helfer diese Aufgabe mit denselben Dateien.

## Hooks

Projekt-Hooks wirken in jeder Claude-Code-Sitzung, die im Repository läuft, also auch in Entwicklungssitzungen. Jedes Skript beendet sich deshalb sofort mit Erfolg und ohne Ausgabe, wenn das Ereignis keine Datei einer laufenden Kampagne unter `campaigns/<cid>/` betrifft. `examples/campaigns/` gehört der Entwicklung und bleibt frei. Kontext beim Sitzungsstart injiziert der Harness nicht, weil er in jede Entwicklungssitzung gelangen würde. `/partie` und `/zug` lesen den Stand selbst. Beide Befehle tragen `disable-model-invocation`, das Modell einer Entwicklungssitzung startet sie also nie von sich aus.

| Skript | Ereignis | Wirkung |
|---|---|---|
| `tools/hooks/guard-state.mjs` | `PreToolUse` für `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | verweigert jedes Schreiben unter `<wurzel>/campaigns/` außer `<cid>/agents/proposals/<proposalId>.json`. Ein RealmCraft-Subagent schreibt nur den Vorschlag seines eigenen Auftrags und sonst nichts, auch keinen Code, keine Hooks und nichts unter `.claude/` |
| `tools/hooks/guard-state.mjs` | `PreToolUse` für `Bash`, `PowerShell` | verweigert einem RealmCraft-Subagenten jeden Aufruf. In der Hauptsitzung verweigert er Befehle, die unter `campaigns/` schreiben, verschieben oder löschen, ausgenommen ein schlichter Aufruf von `node engine/cli.mjs` oder eines Helfers unter `tools/harness/` |
| `tools/hooks/guard-state.mjs` | `PreToolUse` für `Read`, `Glob`, `Grep` | lässt einen RealmCraft-Subagenten nur seinen Auftrag, die Dateien unter dessen `read`, seinen eigenen Vorschlag, die in seiner Definition genannten Ordner der Richter, `welten/` und `engine/schemas/` lesen. `log/journal.json`, `drafts/` und die Ansichten fremder Völker bleiben zu. Die Hauptsitzung betrifft er nicht |
| `tools/hooks/proposal-check.mjs` | `PostToolUse` für `Write`, `Edit`, `MultiEdit` | prüft einen geschriebenen Vorschlag mit `validateProposal` gegen Auftrag, Zustand, Bibliothek und Weltpaket. Bei Fehlern endet er mit Exit 2, und die Fehlerliste geht an den schreibenden Agenten zurück. Bei Erfolg trägt er die Items als `pending` in `status.json` ein, setzt den Schritt auf `done` und gibt die Budgetaufschlüsselung je Item als Zusatzkontext zurück |
| `tools/hooks/subagent-status.mjs` | `SubagentStart`, `SubagentStop` mit Matcher `^rc-` | setzt den Schritt eines RealmCraft-Agenten auf `running` und am Ende, ohne Vorschlag und bei genauer Zuordnung, auf `failed`. Danach gleicht er den Status mit den Dateien ab (`reconcile.mjs`) |

Die Hooks lesen die Hook-Eingabe von stdin und normalisieren Windows-Pfade, Git-Bash-Pfade und relative Pfade auf eine Form. Sie werden in Exec-Form aufgerufen (`"command": "node"` mit dem Skript in `args`), damit weder Git Bash noch PowerShell die Pfade zerlegen. Der Hook-Block für `.claude/settings.json` steht als Vorlage in `harness/hooks.settings.json`.

Der Wächter wirkt nur innerhalb der Projektwurzel (`REALMCRAFT_ROOT`, sonst `CLAUDE_PROJECT_DIR`, sonst `cwd`) und nur auf `<wurzel>/campaigns/`. Vor dem Vergleich löst er jeden Pfad so auf, wie das Dateisystem ihn öffnen würde. Er entfernt die Präfixe `\\?\` und `\\.\`, bildet Administrationsfreigaben dieses Rechners (`\\localhost\C$`) auf ihr Laufwerk ab, streicht Punkte und Leerzeichen am Namensende und löst den längsten vorhandenen Teil mit `realpath` auf, das 8.3-Kurznamen, Groß- und Kleinschreibung, Junctions und Symlinks auflöst. Unter Windows und macOS vergleicht er ohne Groß- und Kleinschreibung.

Welchem Auftrag ein Subagent dient, liest der Wächter aus dem Startdatensatz, den Claude Code neben dem Sitzungsprotokoll ablegt (`<sitzung>/subagents/agent-<agent_id>.meta.json` mit Typ und Beschreibung, erste Zeile von `agent-<agent_id>.jsonl` mit dem Startauftrag). `/zug` nennt dort Auftragspfad und `proposalId`. Fehlt der Datensatz, gilt die genaue Bindung aus `run.json` (`bound`). Ohne beides darf ein Agent nur einen Vorschlag schreiben, den irgendein Auftrag seiner Rolle nennt, und lesen, was die Aufträge seiner Rolle der neuesten Runde nennen. Dann kann ein Rivale noch den Vorschlag und die Ansicht eines anderen KI-Volkes erreichen. Das Ablageformat ist keine dokumentierte Schnittstelle von Claude Code, und eine neue Version kann es ändern.

Laut Dokumentation trägt jeder Werkzeugaufruf eines Subagenten `agent_id` und `agent_type`. Fehlt `agent_type` dennoch, bestimmt der Wächter die Rolle aus dem Startdatensatz oder aus `run.json` (`agents`). Kennt keine der beiden Quellen die `agent_id`, behält der Aufruf die Rechte der Hauptsitzung. Diese Lücke ist bewusst offen gelassen, weil ein geschlossenes Verhalten jeden fremden Subagenten ohne `agent_type` sperren würde.

Der Shell-Wächter der Hauptsitzung ist eine Heuristik über den Befehlstext. Er verweigert, sobald ein Befehl `campaigns` erwähnt und zugleich in eine Datei unter `campaigns/` oder in ein Ziel aus einer Variablen umleitet, mit `cd` in `campaigns/` wechselt und danach relativ schreibt, ein schreibendes Werkzeug aufruft (auch hinter `&`, `$(...)` und Backticks, dazu Download-, Archiv- und Kopierwerkzeuge und schreibende `git`-Kommandos), eine Schreibfunktion von Node, Python oder .NET enthält oder eine verschachtelte Shell oder Auswertung startet. `powershell -EncodedCommand` verweigert er immer. Verschleierte Pfade fängt er nicht. Die verlässliche Sicherung liegt im Kern, der jeden Übergang mit dem Hash des letzten Journaleintrags abgleicht und einen fremd veränderten `state.json` mit `tamper` zurückweist.

## Fehlerbehandlung

Ein gescheiterter Agent hält die Runde nicht auf. Ohne Vorschlag, mit ungültigem Vorschlag oder nach Ablauf seiner Zeit steht sein Schritt auf `failed`, und der Kern greift auf seinen Ersatz zurück, also Karten aus dem Vorrat, Pool-Kandidaten, die Ersatzpolitik `engine/ai/fallback.js` oder eine Chronik ohne Erzählung. Ein teilweise gültiger Vorschlag wendet seine gültigen Items an.

Meldet der Kern Exit 4 bei `seal`, `apply` oder `open`, wiederholt die Spielleitung nichts. Sie liest die Lage mit `status` und meldet sie dem Spieler. Hängt ein Agent, markiert sie seinen Schritt mit `status-note.mjs step <schritt> failed` und macht weiter. Ein Vorschlag, der nach dem nächsten `seal` eintrifft, ist veraltet und wird abgewiesen.

Ohne eingepflegte Hooks funktioniert `/zug` weiter. Es fehlen dann die Vorprüfung beim Schreiben, die Sperre gegen Schreibzugriffe und die automatischen Statusschritte. `ingest` prüft trotzdem jeden Vorschlag und trägt seine Verdikte ein.

## Probelauf ohne Sprachmodell

`tools/harness/dryrun.mjs` führt die Schritte von `/zug` mit aufgezeichneten Vorschlägen aus `tests/fixtures/harness/T<runde4>/` aus. Je Auftrag sucht er `<agent>-<volk|all>.json` oder `<agent>.json`, füllt die Hülle aus dem Auftrag, schreibt die Datei an den Antwortpfad und lässt den Kern sie einlesen. Ein Auftrag ohne Vorlage gilt als gescheiterter Agent. In den Vorlagen dürfen `$people`, `$player`, `$member0`, `$lastEvent` und `$proposalId` stehen.

```
node engine/cli.mjs new hochland --seed 48213 --as bergnomaden --id probe-1 --json
node tools/harness/dryrun.mjs --campaign probe-1 --fixtures tests/fixtures/harness --rolls 6,3,8 --judges
node tools/harness/dryrun.mjs --campaign probe-1 --fixtures tests/fixtures/harness --rolls 6,3,8
```

Der erste Lauf führt Phase B von Runde 0 und die Richter aus, der zweite einen vollständigen Zug mit Würfen, Versiegeln, Welt, Auflösung, Phase B und Freigabe. Der Forschungsvorschlag der Vorlagen ist absichtlich ungültig und zeigt, wie ein abgewiesener Vorschlag im Status erscheint, als erledigter Schritt mit abgewiesenem Verdikt. Mit `--hooks` schreibt der Probelauf den Status nicht selbst, sondern startet die echten Hooks mit den Eingaben, die Claude Code liefert. Alle Agenten einer Phase starten gleichzeitig und ohne Auftragsbeschreibung, jeder Vorschlag durchläuft die Vorprüfung, und jedes zweite Ende kommt ohne letzte Nachricht. `tests/unit/harness-dryrun.test.js` führt beide Läufe in einem temporären Wurzelverzeichnis aus und prüft Phasen, Statusschritte, Ablage der Vorschläge und die Gleichheit zweier Läufe mit demselben Seed. `tests/unit/harness-hooks.test.js` füttert die Hooks mit Hook-Eingaben und prüft Pfadfilter, Verweigerungen, Windows-Pfade und die Vorprüfung.

## Lauschender Modus

Im nächsten Ausbauschritt ersetzt eine lauschende Sitzung das Tippen von `/zug`. `/partie` startet dann mit dem Monitor-Werkzeug ein Wachskript, das eine Zeile meldet, sobald der Klick auf „Zug beenden" die Phase auf `resolving` setzt, und die Spielleitung führt den Zug ab Phase A aus. Der Monitor läuft unter Windows nur mit Git Bash und endet nach höchstens 30 Minuten, das Wachskript muss danach neu gestartet werden. Später kann eine Kopfloslauf-Sitzung mit `claude -p` denselben Ablauf übernehmen.

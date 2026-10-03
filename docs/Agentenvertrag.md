# Agentenvertrag

Der Agentenvertrag regelt, welche Agenten an einer Runde mitwirken, welche Dateien sie lesen und schreiben, in welchen Formaten sie vorschlagen und wie der Kern ihre Vorschläge einliest. Grundlage sind D7, D8, D10, D12 und D14 in [Entscheidungen.md](Entscheidungen.md). Die Formate sind die Schemata `task`, `proposal` und `status` unter `engine/schemas/` mit den Änderungen aus [Vertragsaenderungen.md](Vertragsaenderungen.md), bei Abweichung gilt das Schema. Was hier vorausgesetzt wird und noch fehlt, steht im Regelkern unter [Offene Vertragsfragen](Regelkern.md#18-offene-vertragsfragen). Die Regeln, gegen die jeder Vorschlag geprüft wird, stehen im [Regelkern](Regelkern.md), ihre spielerische Absicht im [Spieldesign](Spieldesign.md).

Agenten schreiben nie den Zustand. Sie liefern Vorschläge innerhalb des kanonischen Primitivsatzes, die der Validator zulässt oder abweist. Neue Module sind Codeänderungen der Entwicklung und nie Agentenausgabe.

## Rollen und Modelle

Die Spielleitung ist die Claude-Code-Hauptsitzung auf Opus 5.5. Sie startet die Runde mit `/zug`, verteilt die Aufträge parallel, hält Überblick und Gesamterzählung, entscheidet Konflikte zwischen Vorschlägen und schwierige Fälle und gibt die Runde frei. Sie liest Zusammenfassungen und arbeitet selbst wenig. Sie schreibt keinen Zustand und handelt ausschließlich über die Kommandozeile des Kerns.

Alle übrigen Rollen sind Projekt-Subagenten unter `.claude/agents/`. Das Modell steht fest im Frontmatter der Definition (`model: sonnet` oder `model: opus`, D14). Maßgeblich ist die englische Agenten-id aus `AGENTS` in `engine/schemas/common.js`. Der deutsche Rollenname erscheint nur im Text und als Name der Subagenten-Datei.

| Rolle | Agenten-id | Datei | Modell | Phase | je | liest | Items (`ITEMS_BY_AGENT`) |
|---|---|---|---|---|---|---|---|
| Welt | `world` | `welt.md` | sonnet | A, blockierend | Kampagne | Ereignisbänder und Lage aller Völker, Rundenbericht | `event`, `feature` |
| Rat | `council` | `rat.md` | sonnet | B | Spielervolk | Projektion, Rat, Gespräche, Rundenbericht | `person`, `goal`, `voice` |
| Rivale | `rival` | `rivale.md` | sonnet | B | KI-Volk | eigene Projektion, Profil, Rundenbericht | `orders`, `stance` |
| Forschung | `research` | `forschung.md` | sonnet | B | Volk, auch KI | Projektion, Praxis, Marken, Anfragen, Bibliothek | `entwicklung`, `bestimmung` |
| Chronist | `chronicler` | `chronist.md` | sonnet | B | Kampagne | Projektion des Spielervolkes, projizierte Ereignisse, Chronik | `narrative` |
| Kohärenzrichter | `judge-coherence` | `kohaerenzrichter.md` | opus | nach der Runde, im Hintergrund | Kampagne | vollständiger Rundenbericht, Chronik, Gedächtnis, Weltpaket | `finding`, `correction` |
| Balancerichter | `judge-balance` | `balancerichter.md` | opus | nach der Runde, im Hintergrund | Kampagne | Rundenberichte aller Völker, Bibliothek, Machtindex | `finding`, `correction` |
| Erzählrichter | `judge-narrative` | `erzaehlrichter.md` | opus | alle vier Runden und beim Kapitelwechsel, im Hintergrund | Kampagne | Chronik, Gedächtnis, Bestimmungen, Rundenberichte | `finding`, `memory` |

Das Schema kennt zusätzlich den Bildagenten `image` mit dem Item `image`. Er gehört nicht zur Runde des MVP und kann später im Hintergrund laufen. Der Prüfer aus D12 ist in den Spielrichtern aufgegangen. Die Prüfung im Takt der Runde leistet allein der Validator als Code, die inhaltliche Prüfung leisten die Richter nach der Runde, ohne sie aufzuhalten (D14).

Die Spielrichter sehen den vollständigen Zustand, weil Kohärenz und Balance nur über alle Völker beurteilbar sind. Was der Spieler von ihnen sieht, sind Befunde in der Tafel Weltgeschehen. Ein Befund darf über fremde Völker nur enthalten, was in der Projektion des Spielers steht. Das prüft der Kern beim Schreiben der Ansicht über die Projektion der referenzierten Protokolleinträge.

## Kampagnenordner

Kampagnen liegen in `campaigns/<cid>/`, gitignored (D8). Eingecheckte Testkampagnen liegen in `examples/campaigns/<cid>/` mit derselben Struktur.

```
campaigns/
  index.json                         Liste der Kampagnen, Kern
  <cid>/
    state.json                       Zustand, Kern
    library.json                     Inhaltsbibliothek, nur anhängend, Kern
    run.json                         Laufmarke einer /zug-Ausführung, Kern über `run start|end`
    status.json                      Status der Runde, Kern über `status-note`
    drafts/<peopleId>.json           Entwürfe, Kern (Spielerentwurf über Server oder CLI)
    view/<peopleId>/state.json       Projektion je Volk, Kern
    view/<peopleId>/events/T0006.json  projiziertes Ereignisprotokoll, Kern
    log/T0006.json                   Rundenbericht mit vollständigem Ereignisprotokoll und Zustands-Hash, Kern
    agents/tasks/T0006/<agent>-<people>.json   Aufträge, Kern
    agents/proposals/<proposalId>.json         Vorschläge, der beauftragte Agent
    agents/ingested/<proposalId>.json          eingelesene Vorschläge mit Bericht, Kern
    agents/rejected/<proposalId>.json          abgewiesene Vorschläge mit Issues, Kern
    narrative/chronik/T0006.md       Chronik, Kern aus eingelesenem `narrative`
    narrative/gedaechtnis.md         verdichtetes Kampagnengedächtnis, Kern aus dem Vorschlag des Erzählrichters
```

Agenten und Spielrichter schreiben genau eine Vorschlagsdatei unter dem Pfad aus ihrem Auftrag. Alles andere schreibt der Kern.

## Auftrag

Der Kern schreibt den Auftrag der Phase A bei `seal`, die Aufträge der Phase B bei `apply` und die Aufträge der Spielrichter auf Abruf der Spielleitung (`node engine/cli.mjs tasks --agent <id>`). Das Schema ist `task`.

```json
{
  "format": "realmcraft-task",
  "version": 1,
  "campaign": "hochland-1",
  "turn": 7,
  "rev": 31,
  "agent": "research",
  "people": "bergnomaden",
  "respondAs": { "proposalId": "research.bergnomaden.T7", "path": "agents/proposals/research.bergnomaden.T7.json" },
  "read": ["view/bergnomaden/state.json", "view/bergnomaden/events/T0006.json", "library.json"],
  "context": {
    "phase": "b",
    "practiceTop": [["handel", 5], ["herde", 4], ["weg", 2]],
    "openTier": 2,
    "maxTierKnown": 1,
    "tokens": [ { "id": "tok-t4-1", "kind": "breakthrough", "tags": ["weg"] } ],
    "requests": [ { "turn": 6, "tags": ["handel", "salz"], "note": "…" } ],
    "findings": [ { "proposalId": "judge-balance.T6", "severity": "light", "text": "…" } ]
  },
  "limits": {
    "items": ["entwicklung"],
    "candidates": 3, "aboveTier": 1, "openPool": 6, "moduleActivations": 1,
    "allowedPrimitives": ["probe.mod", "stat.mod", "resource.flow"],
    "tags": ["handel", "weg", "herde"],
    "budget": [ { "tier": 1, "effectMax": 4, "netMin": 1, "netMax": 3, "priceMax": 0 } ]
  }
}
```

`context` ist je Rolle verschieden und vom Kern erzeugt. Ein Auftrag mit Volksbezug enthält nur die Projektion dieses Volkes. `limits.budget` übernimmt die Zeilen aus `TIERS` in `effects.js`, die für das Volk offen sind. `context.findings` enthält die leichten Befunde der Spielrichter aus der Vorrunde, die diese Rolle betreffen. Der Auftrag des Welt-Agenten in Phase A enthält in `context` je Volk das Ereignisband und die Bedingungsfakten, gegen die eine Karte geprüft wird. Ein Agent liest genau seinen Auftrag und die darin genannten Dateien. `node engine/cli.mjs schema <name>` gibt ihm die Schemata aus.

## Vorschlag

Das Schema ist `proposal`. Die `proposalId` vergibt der Kern im Auftrag, für Aufträge mit Volksbezug als `<agent>.<people>.T<turn>`, für kampagnenweite als `<agent>.T<turn>`.

```json
{
  "format": "realmcraft-proposal",
  "version": 1,
  "proposalId": "research.bergnomaden.T7",
  "agent": "research",
  "campaign": "hochland-1",
  "turn": 7,
  "basedOnRev": 31,
  "people": "bergnomaden",
  "items": [
    { "type": "entwicklung", "data": { "format": "realmcraft-entwicklung", "version": 1, "id": "markt-am-pass", "rev": 1, "…": "…" } }
  ]
}
```

Welche Items eine Rolle senden darf, legt `ITEMS_BY_AGENT` fest. Ein Item eines nicht erlaubten Typs wird mit `item_not_allowed` abgewiesen.

| Item | Rolle | Inhalt und Grenzen |
|---|---|---|
| `entwicklung` | `research` | Format nach [Regelkern, Abschnitt 9](Regelkern.md#9-entwicklung-und-primitive), alle Validatorstufen, Grenzen je Runde und Volk |
| `bestimmung` | `research` | Bestimmung nach Schema `bestimmung`, nur nach einem Richtungswechsel des Volkes, höchstens zwei je Runde, Schwierigkeitsband ([Regelkern, Abschnitt 13](Regelkern.md#13-bestimmung)) |
| `event` | `world` | Ereigniskarte nach Schema `ereignis`, Nettogewicht im Band. In Phase A je Volk eine Karte im Band seines Wurfs, deren `if` auf die Lage dieses Volkes passt, dazu höchstens zwei Karten für den Pool |
| `feature` | `world` | `{ tile, data { id, kind, name, tags, resources } }`, höchstens eines je Runde, Abstands- und Budgetregeln aus [Regelkern, Abschnitt 4](Regelkern.md#merkmale) |
| `orders` | `rival` | vollständiger Entwurf des KI-Volkes für die nächste Runde, muss die Vorschau ohne error-Issues bestehen, Würfe zieht der Kern |
| `stance` | `rival` | Text zur Haltung mit `refs` |
| `voice` | `council` | Text eines Mitglieds zu einer Abstimmung, einem Gespräch oder einem Verrat, mit `member` und `refs` |
| `person` | `council` | Person für einen offenen Sitz (`seat`), Loyalität setzt der Kern auf `tuning.newMemberLoyalty` |
| `goal` | `council` | Zielrevision eines Mitglieds, einmal je Mitglied und Jahr, Tags aus dem Vokabular |
| `narrative` | `chronicler` | Prosa mit `refs` auf Protokolleinträge |
| `finding` | `judge-coherence`, `judge-balance`, `judge-narrative` | Befund mit Schwere, Text, Verweisen und den Rollen, deren nächste Aufträge ihn erhalten |
| `correction` | `judge-coherence`, `judge-balance` | Korrektur zu einem Befund als einmalige Primitive mit kleinem Nettogewicht |
| `memory` | `judge-narrative` | verdichtetes Kampagnengedächtnis mit Abschnitten Bogen, Figuren, offene Fäden, Orte und `refs` |
| `image` | `image` | Bilddatei unter `narrative/images/` mit Bezug |

`narrative`, `voice`, `stance` und `memory` sind geschlossene Textobjekte ohne Wertfelder. Eine Zahl im Text ist erlaubt, wird aber nie gelesen. Jede Behauptung über Werte muss sich auf einen Protokolleintrag in `refs` stützen. Ob sie das tut, prüft der Kohärenzrichter nach der Runde.

## Befunde der Spielrichter

Ein Spielrichter liefert seine Befunde als Items `finding` in seinem Vorschlag. Ein Befund ist leicht oder schwer. Schwer ist er nur bei einem echten Regelwiderspruch, also wenn der Zustand eine Invariante des Regelkerns verletzt oder zwei Regeln für denselben Fall Unvereinbares verlangen. `ingest` legt jeden Befund als Protokolleintrag ohne Zustandsänderung mit Quelle `agent:<judge-id>` ab. Leichte Befunde fließen in `context.findings` der nächsten Aufträge der genannten Rollen. Schwere Befunde legt die Spielleitung dem Spieler vor der nächsten Runde vor.

Korrekturen kommen als Items `correction` und passieren denselben Validator wie jeder andere Vorschlag. Eine Korrektur zu einem schweren Befund wird erst eingelesen, wenn der Spieler über `node engine/cli.mjs consent <proposalId> yes` zugestimmt hat, das Protokoll führt die Zustimmung mit Quelle `player`. Ein schwerer Befund, der auf einen Fehler im Kern zeigt, ist zusätzlich ein Fehlerbericht an die Entwicklung. Die Tafel Weltgeschehen zeigt alle Befunde mit Richter, Schwere, Text und Verweisen sowie den Stand ihrer Korrekturen. Ein Befund darf über fremde Völker nur enthalten, was in der Projektion des Spielers steht, und erscheint dort nur über die projizierten Protokolleinträge.

## Einlesen

`node engine/cli.mjs ingest` arbeitet alle Dateien in `agents/proposals/` in der Reihenfolge ihrer `proposalId` ab, in Phase A (`--phase a`) nur den Vorschlag des Welt-Agenten.

1. Hülle. `campaign` stimmt, `turn` und `basedOnRev` gleich dem Auftrag, `agent` gleich dem Auftrag, Phase passend. Sonst `stale`. Text-Items (`narrative`, `voice`, `stance`, `memory`, `finding`) sind auch nach einem Revisionswechsel derselben Runde noch zulässig.
2. Idempotenz. `hash = hash64(canon(proposal))`. Steht `proposalId` in `state.ingested` mit gleichem Hash, ist der Vorschlag ein Duplikat, die Datei wandert nach `ingested/`, nichts geschieht. Mit anderem Hash ist es `conflict`, die Datei wandert nach `rejected/`. Je Auftrag gibt es genau einen gültigen Vorschlag.
3. Rückzug. Hat die Spielleitung den Vorschlag mit `withdraw` zurückgezogen, wandert er mit ihrem Grund nach `rejected/`.
4. Items. Jedes Item wird einzeln validiert. Abgewiesene Items erscheinen mit Issues im Bericht, gültige werden angewandt. Entwicklungen, Ereigniskarten und Bestimmungen werden als `id@rev` an `library.json` angehängt und eingetragen (Kandidat, `eventPool` und `eventDraws`, Angebot zum Wechsel), Merkmale in `map.features`, Personen in offene Sitze, KI-Entwürfe nach `drafts/` und versiegelt, Text-Items in die Erzähldateien und die Ansicht, Befunde ins Protokoll, Korrekturen als Wirkungen mit Quelle des Richters.
5. Schreiben. Alles eines Vorschlags geschieht in einem atomaren Schreibvorgang (Sperre, temporäre Datei, Umbenennen) mit `rev + 1`. Jede Änderung wird mit Quelle `agent:<id>` und der `proposalId` in `refs` protokolliert. `state.ingested` hält die ids der letzten acht Runden.

Inhalte sind unveränderlich, sobald ein Volk sie kennt oder erforscht. Eine Revision eines unbekannten Kandidaten ist ein neuer Eintrag `id@rev+1`. Jede Datei trägt `format` und `version`, der Kern lehnt unbekannte Hauptversionen ab.

## Status und Ereignisse

`status.json` nach dem Schema `status` hält den Lauf der Runde für Oberfläche und Spielleitung. Es ist eine Ansicht, nichts liest es in den Zustand zurück.

```json
{
  "format": "realmcraft-status",
  "version": 1,
  "campaign": "hochland-1",
  "turn": 7,
  "phase": "agents",
  "steps": [
    { "id": "world-a", "agent": "world", "state": "done", "startedAt": "2026-10-03T18:02:11Z", "endedAt": "2026-10-03T18:02:40Z", "summary": "…",
      "proposals": [ { "proposalId": "world.T7", "kind": "event", "title": "Lawine am Grauhang", "verdict": "accepted", "budget": null, "reason": null } ] },
    { "id": "rival-talbund", "agent": "rival", "state": "failed", "startedAt": "2026-10-03T18:03:01Z", "endedAt": null, "summary": "Zeitgrenze überschritten, Ersatzpolitik", "proposals": [] }
  ]
}
```

`state` ist `waiting`, `running`, `done` oder `failed`, `verdict` ist `accepted`, `rejected` oder `pending`. Entwicklungen und Ereigniskarten tragen ihre Budgetaufschlüsselung. Es schreiben ausschließlich Hooks, `/zug` und `ingest`, alle über `node engine/cli.mjs status-note`, das Sperre und atomares Umbenennen nutzt.

`serve.mjs` beobachtet `view/<player>/`, `status.json` und `narrative/` und sendet über Server-Sent-Events die Ereignisse `view`, `events`, `status`, `findings` und `chronicle`. Die Oberfläche zeigt laufende und gescheiterte Agenten, die Herkunft jedes Werts und die Änderungen der Runde (D7).

## Ablauf von /zug

Im MVP klickt der Spieler im Browser „Zug beenden" und tippt dann `/zug` in Claude Code (D12). Der Klick ruft `POST /seal` auf, der Kern sperrt die Befehle und schreibt den Auftrag der Phase A. `/zug` (Datei `.claude/commands/zug.md`) führt die Spielleitung durch diese Schritte:

1. Lage lesen. `node engine/cli.mjs status --json`. Liegen schwere Befunde ohne Entscheidung vor, legt die Spielleitung sie dem Spieler vor und wartet auf seine Zustimmung oder Ablehnung (`consent`). Steht die Kampagne nicht in `resolving`, endet `/zug` mit dieser Meldung.
2. Laufmarke. `node engine/cli.mjs run start`.
3. Phase A. Die Spielleitung startet den Welt-Agenten mit seinem Auftrag und wartet auf ihn. Danach `node engine/cli.mjs ingest --phase a`.
4. Auflösung. `node engine/cli.mjs apply --expect-rev <rev>`. Die Kampagne steht in `agents`, der Spieler sieht das Ergebnis und kann planen.
5. Phase B. Die Spielleitung startet Rat, alle Rivalen, Forschung je Volk und Chronist parallel. Sie liest ihre Zusammenfassungen, entscheidet Konflikte zwischen Vorschlägen, etwa zwei Personen für denselben Sitz oder eine Chronik, die einem Ratsvorschlag widerspricht, und zieht unhaltbare Vorschläge mit `withdraw` und Grund zurück. Danach `node engine/cli.mjs ingest --phase b`.
6. Freigabe. `node engine/cli.mjs open`, die Kampagne steht in `planning`.
7. Richter. Die Spielleitung startet Kohärenz- und Balancerichter im Hintergrund, in jeder vierten Runde und beim Kapitelwechsel zusätzlich den Erzählrichter. `/zug` wartet nicht auf sie. Ihre Vorschläge mit Befunden, Korrekturen und Gedächtnis liest `node engine/cli.mjs ingest` ein, sobald sie vorliegen, spätestens das `ingest` der nächsten Runde.
8. `node engine/cli.mjs run end`.

Spätere Stufen ersetzen das Tippen von `/zug` durch eine lauschende Sitzung (`/partie` mit einem Monitor auf `status.json`) und danach optional durch eine Kopfloslauf-Sitzung mit `claude -p`. Der Ablauf bleibt derselbe.

## Hooks

Projekt-Hooks stehen in `.claude/settings.json`, ihre Skripte unter `.claude/hooks/`. Einstellungen übergeordneter Ebenen werden in Claude Code immer zusammengeführt, die Trennung von Entwicklungssitzungen und anderen Projekten geschieht deshalb über Pfadfilter im Skript (D12). Jedes Skript beendet sich sofort mit Erfolg, wenn der betroffene Pfad nicht unter `campaigns/` oder `examples/campaigns/` liegt.

| Hook | Auslöser | Wirkung |
|---|---|---|
| `guard-campaign.mjs` | `PreToolUse` für `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | lehnt jedes Schreiben unter `campaigns/` ab, außer `agents/proposals/<proposalId>.json`. Nennt die Hook-Eingabe den Agententyp, muss die `proposalId` zur Rolle passen |
| `guard-campaign.mjs` | `PreToolUse` für `Bash` | lehnt Befehle ab, die Pfade unter `campaigns/` schreiben, verschieben oder löschen, es sei denn, der Befehl ist ein Aufruf von `node engine/cli.mjs` |
| `agent-status.mjs` | `SubagentStart`, `SubagentStop` | schreibt Start und Ende der Rollen über `status-note`, nur wenn `run.json` eine laufende Ausführung nennt und der Subagent eine der Rollen ist |

Der Bash-Wächter ist eine Heuristik. Die verlässliche Sicherung ist der Kern selbst. Jeder Rundenbericht und jeder Einleseschritt hält den Hash des Zustands, den er geschrieben hat, und der Kern verweigert mit `tamper` jeden Vorgang auf einem `state.json`, dessen Hash nicht dazu passt. Bietet die installierte Claude-Code-Version `SubagentStart` nicht an, schreibt `/zug` den Start jedes Agenten selbst über `status-note`.

## Lese- und Schreibrechte

| Wer | liest | schreibt |
|---|---|---|
| Kern (CLI, Server) | alles | alles außer Vorschlägen |
| Spielleitung | `status.json`, Zusammenfassungen, Vorschläge, Rundenberichte | nichts direkt, nur über CLI-Befehle |
| Welt, Rat, Rivale, Forschung, Chronist | den eigenen Auftrag und die darin genannten Dateien | den eigenen Vorschlag |
| Spielrichter | Auftrag, `state.json`, `log/`, `library.json`, `narrative/`, Weltpaket | den eigenen Vorschlag |
| Browser | `view/<player>/`, `status.json`, `narrative/` über den Server | Spielerentwurf über `POST /draft`, „Zug beenden" über `POST /seal` |

## Fehlerbehandlung

Ein Agent kann scheitern, ohne dass die Runde scheitert. Gescheitert ist ein Auftrag, wenn keine Vorschlagsdatei kommt, wenn sie kein gültiges JSON ist, wenn die Hülle `stale` oder `conflict` ergibt oder wenn die Zeitgrenze `tuning.agentTimeout` überschritten ist. Der Status zeigt den Schritt als `failed` mit Grund.

| Rolle | Folge des Scheiterns | Markierung in der Oberfläche |
|---|---|---|
| Welt | Ereigniskarten aus dem Pool per RNG, keine neuen Merkmale | Weltereignis „aus dem Vorrat" |
| Rat | keine Stimmen in Worten, offene Sitze bleiben eine Runde frei | Ratstafel „ohne Stimmen" |
| Rivale | Ersatzpolitik `engine/ai/fallback.js` für dieses Volk | im Status vermerkt, für den Spieler nur als gescheiterter Schritt sichtbar |
| Forschung | Pool-Kandidaten aus `open` | Kandidaten „aus dem Vorrat" |
| Chronist | knapper Rundenbericht aus Beschriftungen statt Prosa | Chronik „Bericht ohne Erzählung" |
| Spielrichter | kein Befund für diese Runde | Weltgeschehen „Richter nicht gelaufen" |

Ein teilweise gültiger Vorschlag wendet seine gültigen Items an und berichtet die ungültigen. Ein Abbruch mitten im Schreiben lässt `state.json` unverändert, weil der Kern über eine temporäre Datei und Umbenennen schreibt. Läuft ein Agent der Phase B noch, wenn der Spieler die nächste Runde beendet, markiert `seal` seinen Auftrag als gescheitert, und ein später eintreffender Vorschlag wird als `stale` abgewiesen.

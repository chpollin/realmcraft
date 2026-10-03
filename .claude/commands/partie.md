---
description: "RealmCraft: eine Kampagne beginnen oder fortsetzen und ihren Stand zeigen"
argument-hint: "[neu <welt> <seed> <volksvorlage> <kampagnen-id> | <kampagnen-id>]"
disable-model-invocation: true
model: opus
---

Du bist die Spielleitung von RealmCraft. Dieser Befehl beginnt oder setzt eine Kampagne fort. Einen Zug führt danach `/zug`. Du schreibst keine Datei unter `campaigns/`, du handelst nur über `node engine/cli.mjs` und die Helfer unter `tools/harness/`.

Argumente: `$ARGUMENTS`

## Kampagnen zeigen

Ohne Argument liest du `campaigns/index.json` und nennst je Kampagne id, Welt, Spielervolk, Runde und Stand (`playing` oder `ended`), die zuletzt gespielte zuerst. Gibt es keine, nennst du die Welten unter `welten/` und wie man mit `/partie neu` beginnt. Dann fragst du, welche Kampagne fortgesetzt oder ob eine neue begonnen werden soll.

## Neue Kampagne

Mit `neu <welt> <seed> <volksvorlage> <kampagnen-id>`:

`node engine/cli.mjs new <welt> --seed <seed> --as <volksvorlage> --id <kampagnen-id> --json`

Fehlt ein Teil, fragst du danach. Die Volksvorlagen stehen in `welten/<welt>/regeln.json`. Die neue Kampagne beginnt in Runde 0 in der Phase `agents`, ihre ersten Aufträge liegen bereit. Der Spieler startet sie mit `/zug`, der dann Phase B der Runde 0 ausführt.

## Kampagne fortsetzen und Stand zeigen

Mit einer Kampagnen-id oder nach der Wahl:

1. `node tools/harness/active-campaign.mjs --campaign <cid>` und `node engine/cli.mjs status --campaign <cid> --json`.
2. Du nennst in wenigen Sätzen Jahreszeit und Jahr, Phase, Vorräte, Meter und Sippen des Spielervolkes, offene Würfe und Aufträge. Liegen Richtervorschläge mit schweren Befunden unter `agents/proposals/`, erwähnst du, dass `/zug` sie zuerst vorlegt.
3. Du sagst, wie es weitergeht. In `planning` plant der Spieler im Browser (`npm run serve`, dann die Spielbrett-Ansicht) oder nennt dir seine Befehle, danach `/zug`. In `agents` oder `resolving` ist ein Zug unterbrochen worden, und `/zug` setzt ihn fort.

Keine Empfehlung, welche Aktion der Spieler wählen soll.

## Lauschender Modus (nächster Ausbauschritt)

Noch nicht eingerichtet. Geplant ist, dass `/partie` mit dem Monitor-Werkzeug ein kleines Wachskript auf `campaigns/<cid>/state.json` startet, das eine Zeile meldet, sobald der Spieler im Browser „Zug beenden" klickt und die Phase auf `resolving` wechselt. Die Spielleitung führt dann ohne getipptes `/zug` die Schritte ab Phase A aus. Der Monitor läuft unter Windows nur mit Git Bash und hat eine Frist von höchstens 30 Minuten, das Wachskript muss deshalb nach Ablauf neu gestartet werden. Beschrieben in `knowledge/agents-harness.md`.

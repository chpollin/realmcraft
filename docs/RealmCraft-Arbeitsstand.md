# RealmCraft, Arbeitsstand und Wiedereinstieg

Stand 3. Oktober 2026, Sitzungsende vor einem Compact.

## Gegenwärtiger Auftrag

Am 3. Oktober 2026 hat der Nutzer die Richtung neu gesetzt. RealmCraft wird ein zugbasiertes Strategiespiel, in dem ein Volk sich ohne festen Forschungsbaum individuell entwickelt und Mechaniken mit der eingeschlagenen Richtung hinzukommen. Ein deterministischer Regelkern rechnet, spezialisierte Agents schlagen Inhalte vor, ein Prüfer mit Machtbudget hält es fair, gespielt wird auf einem kartenzentrierten Spielbrett im Browser. Der Echtzeitplan vom 9. September und die alten Spiele sind abgelöst ([Entscheidungen](Entscheidungen.md), D1 bis D15). Spieldesign, Regeln, Agentenvertrag und Plan stehen in [Spieldesign](Spieldesign.md), [Regelkern](Regelkern.md), [Agentenvertrag](Agentenvertrag.md), [Harness](Harness.md) und [Plan](RealmCraft-Plan.md). Vertragsänderungen sind in [Vertragsaenderungen](Vertragsaenderungen.md) protokolliert.

## Was vorliegt

| Baustein | Ort | Stand |
|---|---|---|
| Wachsende Sechseckwelt | `engine/world/`, `welten/hochland/welt.json` | fertig, getestet |
| Datenverträge (Schema-Version 2) | `engine/schemas/` | fertig, getestet |
| Regelkern mit vier Modulen, Ersatz-KI, CLI | `engine/core/`, `engine/modules/`, `engine/ai/`, `engine/cli.mjs` | fertig, Unit- und Abnahmetests grün |
| Prüfer, Machtbudget, Bibliothek, Partie-IO | `engine/content/`, `engine/harness/` | fertig, Korpus grün |
| Weltpaket Hochland | `welten/hochland/` | fertig, validiert |
| Harness | `.claude/agents/rc-*.md`, `.claude/commands/zug.md`, `partie.md`, `tools/hooks/`, Hooks in `.claude/settings.json` | fertig, Probelauf ohne Modell grün, Live-Zug mit Agents noch nicht beobachtet |
| Spielbrett | `spielbrett/`, Endpunkte in `serve.mjs` | an den Kern angeschlossen, E2E grün, `?demo` zeigt den Prototyp |
| Unabhängige Abnahmetests | `tests/acceptance/` | grün, in `npm test` eingebunden |

Sicherungszweig des Stands vor dem Neuaufbau ist `archiv/vor-neuaufbau`. Alte Spiele und das alte Dashboard liegen noch auf `main` und werden erst nach dem ersten spielbaren Durchstich entfernt.

## Laufende Umgebung

- Spielpartie `campaigns/hochland-1` (gitignored, Startwert 20261003, Volk bergnomaden), Zug 0 in der Planung, Weltereigniswurf offen.
- Spielserver `http://localhost:4187/spielbrett/?campaign=hochland-1` aus dem Arbeitsbaum.
- Eingefrorener UI-Prototyp für den Spieltest `http://localhost:4186/spielbrett/` aus dem Worktree `../realmcraft-spieltest` (Stand `44bb892`).
- Spieltest-Protokoll [spieltests/2026-10-03-spielbrett.md](spieltests/2026-10-03-spielbrett.md).

## Zugwechsel

Der Spieler plant im Browser und klickt „Zug beenden“, der Server versiegelt. Die Spielleitung führt danach `/zug` aus, also `apply`, Welt-Agent, Forschung, Rat, Rivalen und Chronist parallel, Ingest durch den Prüfer, Richter im Hintergrund und `open`. Einzelheiten stehen in [Harness](Harness.md).

## Offene Punkte

- Kern: Vorschau liefert keine Loyalitäts- und Zustimmungsdeltas, Begründungen von Ablehnungen sind englisch, `status.json` hinkt der Phase nach und verliert den Welt-Schritt der Phase A, Handelsrouten fehlen noch in der Kartenebene, Diffusion und Praxisbedingung für Bestimmungswechsel fehlen.
- Prüfer: wiederkehrende Auslöser sind im Budget zu billig gerechnet.
- Spielbrett: keine Ansichten für die Module Handel, Magie, Militär und Lebensweise, Angriff und Handel ohne Bedienung.
- Dokumente: Agentenvertrag nennt andere Hook- und Agent-Dateinamen und den Ansichtspfad `view/<pid>/state.json` statt `view/<pid>.json`.
- Balance: Ersatz-KI gerät oft in Knappheit, dunkler Pfad erreicht Macht früher.
- Das unabhängige Review des Commits `b8ad4c4` fand eine kritische Lücke (Agents mit Shell-Zugriff umgehen den Wächter) und elf schwere, darunter austauschbare versiegelte Entwürfe, Neuwürfeln über die Vorschau, Ressourcen aus Raubzug vor Kostenzahlung und zu billig bepreiste dauerhafte und wiederkehrende Wirkungen. Drei Fix-Lanes arbeiten in eigenen Worktrees: Harness-Sicherheit, Kern und CLI, Prüfer und Budget. Ihre Zweige werden nach Prüfung zusammengeführt, bestehende Partien bleiben ladbar.
- Porträts: der Gemini-Key in `.env` wird abgelehnt, ein gültiger Key fehlt.
- Entscheidungen des Nutzers: Rückbau der alten Spiele und des Dashboards, `STAND-UND-VISION.md`, Aufteilung von `CLAUDE.md` nach Rollen, Umgang mit dem ungetrackten `schwarzkaemme/`, Grundsatzfragen aus [Spieldesign](Spieldesign.md).

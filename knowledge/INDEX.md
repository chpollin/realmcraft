---
title: Wissensbasis, Navigation und Begriffslexikon
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://dhcraft.org/Promptotyping/
status: active
created: 2026-05-31
updated: 2026-10-03
language: de
kampagnen: ["Der Löwe und die Sonne", "Talustan", "Die Gestrandeten", "Die letzten Wälle"]
---

# Wissensbasis, Navigation und Begriffslexikon

Dieser Ordner ist das verdichtete Gedächtnis der Spielleiterpartien, lesbar für Menschen und gezielt nachschlagbar für den Spielleiter. RealmCraft ist das kampagnenunabhängige System, jede Partie eine laufende Geschichte darin. Den Zahlenstand jetzt führt der Speicherstand, das Gedächtnis hier trägt Zusammenhang und Begründung über die Zeit.

## Aufbau

- `welten/<welt>/` enthält wiederverwendbare Spielwelten, die mehrere Partien tragen können. Derzeit liegt dort [Die Schwarzkämme](welten/schwarzkaemme/WELT.md) mit den ausgearbeiteten Republiken [Talustan](welten/schwarzkaemme/republiken/talustan.md) und [Nochtien](welten/schwarzkaemme/republiken/nochtien.md) sowie der [Vorlage für weitere Republiken](welten/schwarzkaemme/_template.md).
- `partien/<partie>/` enthält das Gedächtnis je laufender oder pausierter Partie, in der Regel `chronik.md` (Bogen, Kapitel, offene Fäden), `regeln.md` (Setzungen), `rat.md` (Figuren und Bögen) und `welt.md` (Orte und Mächte, sofern die Partie keine gemeinsame Welt nutzt).
- `archiv/<partie>/` enthält abgeschlossene oder zurückgelegte Partien.

Die ausführlich erzählten Fassungen früherer Chroniken liegen in der Git-Historie.

## Partien

Geladen ist immer genau eine Partie, die in `savegame.json` steht. Welche das ist, zeigt `meta.spielname`. Derzeit ist dort „Der Löwe und die Sonne" geladen. Pausierte Partien liegen als datiertes Backup in `examples/` und sind jederzeit wieder aufnehmbar.

| Partie | Genre | Welt | Status | Stand | Gedächtnis | Neuestes Backup in `examples/` |
|---|---|---|---|---|---|---|
| Der Löwe und die Sonne | historisch, Iran ab 1800 | eigene, [welt.md](partien/loewe-und-sonne/welt.md) | geladen | Kapitel 1, Frühling 1800 | [partien/loewe-und-sonne/](partien/loewe-und-sonne/chronik.md) | noch keines, Stand nur in `savegame.json` |
| Talustan | Near-Future-Dystopie | [Die Schwarzkämme](welten/schwarzkaemme/WELT.md) | pausiert | Kapitel 1, Sommer 2051 | [partien/talustan/](partien/talustan/partie.md) | [talustan-LIVE-backup-2026-07-23.json](../examples/talustan-LIVE-backup-2026-07-23.json) |
| Die Gestrandeten | Fantasy | eigene, [welt.md](partien/gestrandete/welt.md) | pausiert | Kapitel 2, Sommer Jahr 8 | [partien/gestrandete/](partien/gestrandete/chronik.md) | [die-gestrandeten-LIVE-backup-2026-06-09.json](../examples/die-gestrandeten-LIVE-backup-2026-06-09.json) |
| Die letzten Wälle | Wikinger, Horror | eigene, [welt.md](partien/letzte-waelle/welt.md) | pausiert | Kapitel 1, Sommer Jahr 7 | [partien/letzte-waelle/](partien/letzte-waelle/chronik.md) | [die-letzten-waelle-LIVE-backup-2026-06-05.json](../examples/die-letzten-waelle-LIVE-backup-2026-06-05.json) |
| Die Mehrung | Finanz-Strategie mit echten Marktdaten | eigene, [welt.md](archiv/die-mehrung/welt.md) | archiviert | Kapitel 1, Sommer 2026 | [archiv/die-mehrung/](archiv/die-mehrung/chronik.md) | [die-mehrung-LIVE-backup-2026-06-04.json](../examples/die-mehrung-LIVE-backup-2026-06-04.json) |
| Die Karren | Fantasy, Aufbau eines Bergvolks | eigene, [welt.md](archiv/die-karren/welt.md) | archiviert | Kapitel 4, Frühling Jahr 19 | [archiv/die-karren/](archiv/die-karren/INDEX.md) | [die-karren-kapitel-4.json](../examples/die-karren-kapitel-4.json) |

Talustan führt statt der vier Partiedokumente ein Aufstellungsdokument, [partie.md](partien/talustan/partie.md). Seine Setzungen stehen bisher nur im Speicherstand unter `setzungen`. Die Karren führen ihre Figuren in `personen.md` statt `rat.md` und haben ein eigenes [INDEX](archiv/die-karren/INDEX.md).

## Lesereihenfolge für den Spielleiter

1. [`docs/Spielmechanik.md`](../docs/Spielmechanik.md), die bindende Grundmechanik.
2. Dieses INDEX, um über `meta.spielname` in `savegame.json` die geladene Partie und ihren Gedächtnisordner zu finden.
3. Die `chronik.md` der Partie (wo sie steht, warum, welche Fäden offen sind), danach ihre `regeln.md` (die Setzungen). Für Talustan stattdessen [partie.md](partien/talustan/partie.md) und die Setzungen im Speicherstand.
4. Nach Bedarf `rat.md` und `welt.md`, bei einer Partie in einer gemeinsamen Welt die Dokumente unter `welten/`.
5. Für den Zahlenstand `savegame.json`. Bei Widerspruch gilt der Speicherstand für Zahlenwerte, das Gedächtnis für Zusammenhang und Begründung.

Eine neue Setzung gehört in die `regeln.md` der jeweiligen Partie unter `partien/<partie>/`. Für Talustan entsteht diese Datei mit der ersten neu vereinbarten Setzung.

## Partie wechseln

Das Dashboard aktualisiert sich nach jedem Schritt per Live-Reload.

1. Die geladene Partie an `meta.spielname` in `savegame.json` erkennen.
2. Vor dem Überschreiben den aktuellen Stand als neues datiertes Backup sichern, `examples/<partie>-LIVE-backup-<datum>.json`. Der Dateiname nutzt das Präfix der bisherigen Backups dieser Partie (Tabelle oben), das vom Ordnernamen unter `partien/` abweichen kann.
3. Das gewünschte Backup nach `savegame.json` kopieren, in PowerShell mit `Copy-Item examples/<partie>-LIVE-backup-<datum>.json savegame.json`, in bash mit `cp examples/<partie>-LIVE-backup-<datum>.json savegame.json`.
4. Das Gedächtnis der neuen Partie über die Tabelle lesen.

## Grundbegriffe

Die Skalen gelten für die Anzeige im Dashboard. Die Grundmechanik steht in [`docs/Spielmechanik.md`](../docs/Spielmechanik.md), das Speicherstand-Format in [`docs/Speicherstand-Format.md`](../docs/Speicherstand-Format.md). Einzelne Partien deuten die Größen um, etwa Talustan (siehe [partie.md](partien/talustan/partie.md)).

### Grundgrößen

Ganze Zahlen von 0 bis 5 für die abstrakten Kapazitäten des Volkes, Nahrung, Material und Wissen.

### Lagewerte

Verteidigung, Mobilität und Wohlstand auf der Skala −2 bis +3.

### Wesensart

Der charakterprägende Modifikator eines Volkes, +2 auf Passendes, −2 auf Widerstrebendes.

### Ansehen

Der Ruf auf der Skala 0 bis 3. Er wächst mit bewiesener Leistung.

### Loyalität

Die Bindung eines Beraters auf der Skala −5 bis +5. Aktuelle Werte stehen im Speicherstand.

### Macht und Beziehung

Eine äußere Kraft oder ein Gegenspieler, geführt mit Label und Zahlenanker.

### Runde, Saison und Weltereignis

Zeit rückt nur auf Saison-Turns vor und löst dann genau ein Weltereignis aus (1d10).

### Setzung

Eine in einer Partie vereinbarte Sonderregel. Sie gehört in die `regeln.md` der jeweiligen Partie.

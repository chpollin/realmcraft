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
updated: 2026-06-04
language: de
kampagnen: ["Die letzten Wälle", "Die Gestrandeten", "Die Mehrung"]
related: ["[[chronik-letzte-waelle]]", "[[regeln-letzte-waelle]]", "[[rat-letzte-waelle]]", "[[welt-letzte-waelle]]", "[[chronik-gestrandete]]", "[[regeln-gestrandete]]", "[[rat-der-gestrandeten]]", "[[welt-gestrandete]]", "[[chronik-mehrung]]", "[[regeln-mehrung]]", "[[rat-mehrung]]", "[[welt-mehrung]]"]
---

# Wissensbasis, Navigation und Begriffslexikon

Dieser Ordner ist das verdichtete Gedächtnis der laufenden Partien. Er erfüllt zwei Zwecke zugleich: lesbare Chronik für den Menschen und gezielt nachschlagbarer Kontext für den Spielleiter (das Sprachmodell oder Claude Code, das die Partie führt). RealmCraft ist das kampagnenunabhängige System; die jeweilige Partie ist eine laufende Geschichte darin.

## Kampagnen-Übersicht (Multi-Partie-Hub)

RealmCraft führt derzeit **drei Partien parallel**. Es ist immer genau eine in `savegame.json` geladen (die aktuell aktive); die übrigen sind pausiert und liegen als Backup in `examples/`. Welche aktiv ist, erkennt man an `meta.spielname` in `savegame.json`.

| Partie | Status | Stand | Gedächtnis | Backup |
|---|---|---|---|---|
| **Die letzten Wälle** (Wikinger / Horror) | **aktuell geladen** (`savegame.json`) | Kapitel 1, Sommer Jahr 7 | [chronik-letzte-waelle.md](chronik-letzte-waelle.md) · [regeln-letzte-waelle.md](regeln-letzte-waelle.md) · [rat-letzte-waelle.md](rat-letzte-waelle.md) · [welt-letzte-waelle.md](welt-letzte-waelle.md) | — (frische Partie, noch kein Backup) |
| **Die Gestrandeten** (Fantasy) | pausiert | Kapitel 2, Sommer Jahr 8 | [chronik-gestrandete.md](chronik-gestrandete.md) · [regeln-gestrandete.md](regeln-gestrandete.md) · [rat-der-gestrandeten.md](rat-der-gestrandeten.md) · [welt-gestrandete.md](welt-gestrandete.md) | [`examples/die-gestrandeten-LIVE-backup-2026-06-03.json`](../examples/die-gestrandeten-LIVE-backup-2026-06-03.json) |
| **Die Mehrung** (Finanz-Strategie) | pausiert | Kapitel 1, Sommer 2026 | [chronik-mehrung.md](chronik-mehrung.md) · [regeln-mehrung.md](regeln-mehrung.md) · [rat-mehrung.md](rat-mehrung.md) · [welt-mehrung.md](welt-mehrung.md) | [`examples/die-mehrung-LIVE-backup-2026-06-04.json`](../examples/die-mehrung-LIVE-backup-2026-06-04.json) |

Alle Partien sind **nicht abgeschlossen, nur die jeweils pausierten ruhen** — ihr Gedächtnis bleibt vollständig und ist jederzeit wieder aufnehmbar. Die abgeschlossene erste Partie *Die Karren* liegt unter [archiv/die-karren/](archiv/die-karren/).

## Partie-Details: **Die letzten Wälle** (Wikinger / Horror, aktuell geladen)

Eine düster-realistische Nordländer-Partie. **Vargvik**, die Wolfsbucht am Vargfjord, hält seit sieben Jahren gegen die **Wiedergänger** und lebt nur noch vom Fisch. Spielerfigur ist **Philipp mit den schwarzen Locken**, Hauptmann der Wache (Wesensart *Unbeugsam hinter der Mauer*: +2 Verteidigung / −2 nach außen). Magie gibt es nur als **Kunst** — Witcher-artige Alchemie und Geisterzwiesprache weniger Eingeweihter, in Vargvik gehütet von Philipps Bruder **Christopher**; sie ist zugleich der verdächtige Ursprung der Pest. Philipps **Familienkern** (Brüder Christopher & Stephan, Söhne Finn & Felix) ist hochloyal; die Reibung kommt aus den Stadt-Fraktionen (Jarl Harald, Brandr, Halla, Gríma). Kern: die Stadt halten **und** den Ursprung verstehen, um einen Ausweg zu finden. Hintergrundfiguren für später: **Auðun der Krähenmantel** (forschender Druide am Kai) und **Ragnars Clan** (befreundeter Stamm, unterwegs). Gedächtnis siehe Tabelle oben; Zahlenstand in `savegame.json`. Lesereihenfolge: [chronik-letzte-waelle.md](chronik-letzte-waelle.md) → [regeln-letzte-waelle.md](regeln-letzte-waelle.md) → [rat-letzte-waelle.md](rat-letzte-waelle.md) / [welt-letzte-waelle.md](welt-letzte-waelle.md).

## Partie wechseln

Wechsel-Protokoll (Dashboard aktualisiert sich danach per Live-Reload):

1. Aktuelle Partie an `meta.spielname` in `savegame.json` erkennen.
2. **Vor dem Überschreiben** den aktuellen Stand als neues datiertes Backup in `examples/` sichern (`examples/<partie>-LIVE-backup-<datum>.json`).
3. Das gewünschte Backup nach `savegame.json` kopieren — PowerShell: `Copy-Item examples/<partie>-LIVE-backup-<datum>.json savegame.json`, bash: `cp examples/<partie>-LIVE-backup-<datum>.json savegame.json`.

Danach gilt das partie-spezifische Gedächtnis (oben verlinkt); für den Zahlenstand `savegame.json`.

## Partie-Details: **Die Mehrung** (Finanz-Strategie, pausiert)

Christian und Christopher, zwei Digital Humanists, mehren 50.000 € zu echtem Vermögen — **mit echten Daten in echter Zeit**. Statt eines Fantasy-Volks führt der Rat hier sechs Investment-Archetypen; statt Feinden vor den Toren stehen Börse, Krypto, sicherer Hafen, der stille Zehrer (Inflation) und der Fiskus. Der maschinenlesbare Zustand jetzt steht in `savegame.json` im Repo-Root.

| Dokument | Funktion | Wann nachschlagen |
|---|---|---|
| [chronik-mehrung.md](chronik-mehrung.md) | Die Geschichte Saison für Saison + Logbuch der echten Marktdaten | wo die Partie steht, was als Nächstes ansteht, welche Kurse galten |
| [regeln-mehrung.md](regeln-mehrung.md) | Die Setzungen dieser Partie (echte Daten, Inflation, Fiskus, Wesensart) | wie in dieser Partie entschieden wird |
| [rat-mehrung.md](rat-mehrung.md) | Der Rat: die sechs Berater-Archetypen, Ziele, Reibungen | wer was will, woran sich die Stimmen entzünden |
| [welt-mehrung.md](welt-mehrung.md) | Die Mächte (Anlageklassen) und das „Vermögens-Reich" als Karte | Marktlage, Nachbarn, Karte |

## Lesereihenfolge für den Spielleiter

Zuerst [chronik-mehrung.md](chronik-mehrung.md) (wo stehen wir und welche Daten galten), dann [regeln-mehrung.md](regeln-mehrung.md) (wie entscheidet diese Partie), dann [rat-mehrung.md](rat-mehrung.md) und [welt-mehrung.md](welt-mehrung.md) nach Bedarf. Für den aktuellen Zahlenstand `savegame.json` laden. **Wichtig:** Diese Partie verlangt vor jedem folgenreichen Zug echte, aktuelle Marktdaten per Websuche (siehe Setzung „Echte Daten, echte Zeit").

## Partie-Details: Die Gestrandeten (Fantasy, aktuell geladen)

Die Fantasy-Partie *Die Gestrandeten* ist die derzeit in `savegame.json` geladene, aktive Partie (Kapitel 2, Sommer Jahr 8). Ihr Gedächtnis:

- [welt-gestrandete.md](welt-gestrandete.md) · [chronik-gestrandete.md](chronik-gestrandete.md) · [regeln-gestrandete.md](regeln-gestrandete.md) · [rat-der-gestrandeten.md](rat-der-gestrandeten.md)
- Letzter Live-Stand gesichert in [`examples/die-gestrandeten-LIVE-backup-2026-06-03.json`](../examples/die-gestrandeten-LIVE-backup-2026-06-03.json).

## Begriffslexikon (Die Mehrung)

Skalen gelten für die Anzeige im Dashboard. Die Grundmechanik steht in [`docs/Spielmechanik.md`](../docs/Spielmechanik.md), das Speicherstand-Format in [`docs/Speicherstand-Format.md`](../docs/Speicherstand-Format.md).

- **Grundgrößen** (ganze Zahlen 0–5), hier umgedeutet auf den Vermögensaufbau: **Nahrung = Liquidität** (trockenes Pulver / Cash-Puffer), **Material = Substanz** (produktiv angelegtes Vermögen), **Wissen = Marktwissen** (Recherche, Edge). Das echte Euro-Vermögen führt `lagewerte.ausbeuten` als Geld-Ledger; die Grundgrößen sind die abstrakten Kapazitäten dahinter.
- **Lagewerte** (−2 bis +3): **Verteidigung = Risikoschutz/Drawdown-Puffer**, **Mobilität = Handlungsfähigkeit/Agilität**, **Wohlstand = Rendite-Lage**.
- **Wesensart**: „Aus Daten geschmiedet" — +2 auf Recherche/Analyse/Geduld, −2 auf Hype/Bauch/FOMO. Siehe [regeln-mehrung.md](regeln-mehrung.md).
- **Ansehen** (0–3): Ruf am Markt; wächst mit bewiesener Disziplin und realer Rendite nach Steuern, nicht mit Glückstreffern. Start: 0 „Frischlinge mit Plan".
- **Loyalität** (−5 bis +5): Bindung eines Beraters; aktuelle Werte im Speicherstand.
- **Macht / Beziehung**: eine Anlageklasse oder Marktkraft (Börse, Krypto, Hafen) bzw. ein Gegenspieler (Inflation, Fiskus), label-geführt mit Zahlenanker.
- **Der stille Zehrer**: die Inflation (~2,4 % p.a.) — der ferne, geduldige Feind dieser Partie, Analog zum „Finsteren". Frisst jeden Euro, der still liegt.
- **Der Fiskus**: nimmt KESt 27,5 % (Österreich, anpassbar) von jedem realisierten Gewinn; tritt im Winter (Jahresabschluss) auf — der „Lebenswurf" dieser Partie.
- **Runde / Saison / Weltereignis**: Eine Saison = ein realer Zeitraum (Frühling Mär–Mai, Sommer Jun–Aug, Herbst Sep–Nov, Winter Dez–Feb). Der Saisonwechsel zieht echte Daten und das reale Marktgeschehen als Weltereignis.
- **Setzung**: eine in dieser Partie vereinbarte Sonderregel. Siehe [regeln-mehrung.md](regeln-mehrung.md).

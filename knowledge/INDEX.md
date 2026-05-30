---
title: Wissensbasis "Die Karren", Navigation und Begriffslexikon
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://dhcraft.org/Promptotyping/
status: active
created: 2026-05-30
updated: 2026-05-30
language: de
related: ["[[welt]]", "[[chronik]]", "[[regeln]]", "[[personen]]"]
---

# Wissensbasis "Die Karren", Navigation und Begriffslexikon

Dieser Ordner ist das verdichtete Gedächtnis einer laufenden Partie. Er erfüllt zwei Zwecke zugleich: lesbare Chronik für den Menschen und gezielt nachschlagbarer Kontext für den Spielleiter, also das Sprachmodell oder Claude Code, das die Partie führt. Damit eine lange, komplexe Welt konsistent bespielbar bleibt, ohne das Kontextfenster zu sprengen, hält die Wissensbasis das Wesentliche komprimiert vor: Welt, Geschichte, Regel-Evolution und Personen.

RealmCraft ist das kampagnenunabhängige System. "Die Karren" ist die erste laufende Partie; diese Wissensbasis ist ihr Substrat und zugleich das Muster, nach dem jede weitere Partie ihr Wissen führt.

## Was hier liegt

| Dokument | Funktion | Wann nachschlagen |
|---|---|---|
| [welt.md](welt.md) | Geographie, Orte, Mächte, Beziehungen | Schauplatz, Nachbarn, Karte, wer wo liegt |
| [chronik.md](chronik.md) | Die Geschichte Kapitel für Kapitel | Vorgeschichte, Bogen, offene Fäden, was als Nächstes ansteht |
| [regeln.md](regeln.md) | Regel-Evolution: die Setzungen dieser Partie | wie in dieser Partie gewürfelt und entschieden wird, abweichend von der Grundmechanik |
| [personen.md](personen.md) | Berater und benannte Figuren | Ziele, Loyalität, Bögen, Generationenlage |

Der maschinenlesbare Zustand jetzt steht nicht hier, sondern im Speicherstand [`examples/die-karren-kapitel-4.json`](../examples/die-karren-kapitel-4.json) (Werte, Loyalitäten, Karte). Die Grundmechanik des Systems steht in [`docs/Spielmechanik.md`](../docs/Spielmechanik.md), das Speicherstand-Format in [`docs/Speicherstand-Format.md`](../docs/Speicherstand-Format.md). Diese Wissensbasis ist das Gedächtnis über die Zeit, der Speicherstand ist der Schnitt durch die Gegenwart.

## Lesereihenfolge für den Spielleiter

Wer die Partie übernimmt, liest zuerst [chronik.md](chronik.md) (wo stehen wir und warum), dann [regeln.md](regeln.md) (wie entscheidet diese Partie), dann [personen.md](personen.md) und [welt.md](welt.md) nach Bedarf. Für den aktuellen Zahlenstand den Speicherstand laden.

## Was hier bewusst nicht liegt

Keine Zahlenwerte des aktuellen Stands (die führt der Speicherstand, doppelte Pflege erzeugt Drift). Keine vollständige Grundmechanik (die führt `docs/Spielmechanik.md`). Keine Projektdokumentation des Tools RealmCraft selbst (Identität, Architektur, Design); käme bei Bedarf als `project.md`, `architecture.md`, `design.md` nach der Promptotyping-Konvention hinzu, getrennt vom Partie-Wissen.

## Begriffslexikon

Konstitutive Begriffe dieser Partie und des Systems. Wo eine Skala genannt ist, gilt sie für die Anzeige im Dashboard.

- **Grundgrößen**: die wenigen harten Ressourcen, ganze Zahlen. Nahrung, Material, Wissen, Bevölkerung. Der Kern, der klein bleibt.
- **Lagewerte**: situative Modifikatoren auf der Skala −2 bis +3. Verteidigung, Mobilität, Wohlstand, dazu Ausbeute je Rohstoff. Ergeben sich aus Gelände plus Lage.
- **Modifikatoren**: Herkunft der Lagewerte, getrennt nach Gelände (dauerhaft) und Lage (durch Bauten, Bündnisse, Zustände).
- **Ansehen**: Stufenwert 0 bis 3, wie das Volk auf dem Kontinent gesehen wird. Hier 3, Leuchtfeuer der Freien.
- **Loyalität**: Bindung eines Beraters, Skala −5 bis +5 (am Bruch, verstimmt, schwankend, treu, ergeben). Der Rat steht auf +5.
- **Beziehung**: Verhältnis zu einer fremden Macht, label-geführt (verbündet, befreundet, treu, wachsamer Friede), mit grobem Zahlenanker.
- **Feld**: das stehende Ressort eines Beraters (Wache, Ernte, Bau, Späh, Schmiede, Tal, Bund). Siehe [personen.md](personen.md).
- **Setzung**: eine in dieser Partie vereinbarte Sonderregel, jederzeit änderbar. Die Regel-Evolution. Siehe [regeln.md](regeln.md).
- **Vorhaben**: eine entschiedene, noch nicht ausgewürfelte Unternehmung der Runde (hier Verwaltung, Stadtausbau Süd, Zuzugskampagne).
- **Runde / Weltereignis**: die Zeiteinheit; zu ihrem Beginn wird ein Weltereignis gewürfelt. "Runde offen, Weltereignis offen" heißt: noch nicht gewürfelt.
- **Kapitel**: ein größerer Erzählbogen über mehrere Jahre, abgeschlossen durch einen Zeitsprung. Die Partie steht in Kapitel 4.
- **Primus**: der Sprecher als erster unter Gleichen im Rat, mit Veto und letztem Wort, vom Spieler geführt.
- **Bund der Freien**: die Föderation eigenständiger Völker um die Karren, im Krieg geeint, im Frieden sich lockernd. Siehe [welt.md](welt.md).
- **Generation / Lebensstand**: Alter als Spielgröße. Rüstig, Lebensabend (−1 auf eigene Feldaktionen), Hinfällig (−2), Tod. Siehe [regeln.md](regeln.md).
- **Delegationsregiment**: die Setzung, dass Berater ihre Felder eigenständig führen und erst danach berichten.

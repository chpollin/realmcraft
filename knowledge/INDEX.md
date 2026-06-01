---
title: Wissensbasis "Die Gestrandeten", Navigation und Begriffslexikon
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://dhcraft.org/Promptotyping/
status: active
created: 2026-05-31
updated: 2026-05-31
language: de
partie: Die Gestrandeten
related: ["[[welt-gestrandete]]", "[[chronik-gestrandete]]", "[[regeln-gestrandete]]", "[[rat-der-gestrandeten]]"]
---

# Wissensbasis "Die Gestrandeten", Navigation und Begriffslexikon

Dieser Ordner ist das verdichtete Gedächtnis der laufenden Partie. Er erfüllt zwei Zwecke zugleich: lesbare Chronik für den Menschen und gezielt nachschlagbarer Kontext für den Spielleiter, also das Sprachmodell oder Claude Code, das die Partie führt. Damit eine lange, komplexe Welt konsistent bespielbar bleibt, ohne das Kontextfenster zu sprengen, hält die Wissensbasis das Wesentliche komprimiert vor: Welt, Geschichte, Regel-Evolution und Personen.

RealmCraft ist das kampagnenunabhängige System. "Die Gestrandeten" ist die laufende Partie. Die abgeschlossene erste Partie "Die Karren" liegt unter [archiv/die-karren/](archiv/die-karren/) und bleibt als Muster und Vorgeschichte des Systems erhalten.

## Was hier liegt

| Dokument | Funktion | Wann nachschlagen |
|---|---|---|
| [welt-gestrandete.md](welt-gestrandete.md) | Geographie, Orte, Mächte, Beziehungen | Schauplatz, Nachbarn, Karte, wer wo liegt |
| [chronik-gestrandete.md](chronik-gestrandete.md) | Die Geschichte Kapitel für Kapitel | Vorgeschichte, Bogen, offene Fäden, was als Nächstes ansteht |
| [regeln-gestrandete.md](regeln-gestrandete.md) | Regel-Evolution: die Setzungen dieser Partie | wie in dieser Partie entschieden wird, abweichend von der Grundmechanik |
| [rat-der-gestrandeten.md](rat-der-gestrandeten.md) | Der Rat: Porträts und Charakterbögen | Aussehen, Ziele, Bögen, woran sich die Figuren entzünden |

Der maschinenlesbare Zustand jetzt steht nicht hier, sondern im Speicherstand `savegame.json` im Repo-Root (Werte, Loyalitäten, Karte). Die Grundmechanik des Systems steht in [`docs/Spielmechanik.md`](../docs/Spielmechanik.md), das Speicherstand-Format in [`docs/Speicherstand-Format.md`](../docs/Speicherstand-Format.md). Diese Wissensbasis ist das Gedächtnis über die Zeit, der Speicherstand ist der Schnitt durch die Gegenwart.

## Lesereihenfolge für den Spielleiter

Wer die Partie übernimmt, liest zuerst [chronik-gestrandete.md](chronik-gestrandete.md) (wo stehen wir und warum), dann [regeln-gestrandete.md](regeln-gestrandete.md) (wie entscheidet diese Partie), dann [rat-der-gestrandeten.md](rat-der-gestrandeten.md) und [welt-gestrandete.md](welt-gestrandete.md) nach Bedarf. Für den aktuellen Zahlenstand `savegame.json` laden.

## Was hier bewusst nicht liegt

Keine Zahlenwerte des aktuellen Stands (die führt der Speicherstand, doppelte Pflege erzeugt Drift). Keine vollständige Grundmechanik (die führt `docs/Spielmechanik.md`). Keine Projektdokumentation des Tools RealmCraft selbst (Identität, Architektur, Design).

## Begriffslexikon

Konstitutive Begriffe dieser Partie und des Systems. Wo eine Skala genannt ist, gilt sie für die Anzeige im Dashboard.

- **Grundgrößen**: die wenigen harten Ressourcen, ganze Zahlen. Nahrung, Material, Wissen, Bevölkerung. Der Kern, der klein bleibt; den aktuellen Stand führt der Speicherstand.
- **Lagewerte**: situative Modifikatoren auf der Skala −2 bis +3. Verteidigung, Mobilität, Wohlstand, dazu Ausbeute je Rohstoff. Ergeben sich aus Gelände plus Lage.
- **Modifikatoren**: Herkunft der Lagewerte, getrennt nach Gelände (dauerhaft) und Lage (durch Bauten, Bündnisse, Zustände).
- **Wesensart**: die prägende Eigenart des Volkes als Modifikator. Hier "Aus Vielen geschmiedet" (+2 bei Vielfalt und Improvisation, −2 bei geschlossenem, einmütigem Handeln). Siehe [regeln-gestrandete.md](regeln-gestrandete.md).
- **Ansehen**: Stufenwert 0 bis 3, wie das Volk gesehen wird, mit einem Beinamen je Stufe.
- **Loyalität**: Bindung eines Beraters, Skala −5 bis +5 (am Bruch, verstimmt, schwankend, treu, ergeben); die aktuellen Werte je Berater führt der Speicherstand.
- **Beziehung**: Verhältnis zu einer fremden Macht, label-geführt, mit grobem Zahlenanker.
- **Feld / Gruppe**: das Ressort eines Sprechers (Krieg, Zauber, Werk, Versorgung, Kundschaft, Zivile). Siehe [rat-der-gestrandeten.md](rat-der-gestrandeten.md).
- **Setzung**: eine in dieser Partie vereinbarte Sonderregel, jederzeit änderbar. Die Regel-Evolution. Siehe [regeln-gestrandete.md](regeln-gestrandete.md).
- **Der Mehrheitsbescheid**: die Verfassung dieser Partie. Folgenreiche Fragen entscheidet die Mehrheit des Rates; der oder die Erste stellt die Frage, stimmt mit, gibt bei Gleichstand den Ausschlag; ein Veto kostet Loyalität.
- **Runde / Weltereignis**: die Zeiteinheit; zu ihrem Beginn wird ein Weltereignis gewürfelt. "Runde offen, Weltereignis offen" heißt: noch nicht gewürfelt.
- **Kapitel**: ein größerer Erzählbogen über mehrere Jahre. Die Partie steht in Kapitel 1.
- **Disziplin**: eine erschlossene Form der schwachen Magie, ein echter Hebel mit Preis. Erste: **Das Verhüllen** (Frühling J2, schirmende Magie aus Aldes Buch aus Khar, nicht den Ringen). Zweite: **Das Verwahren** (Frühling J3, aus Khars Schutz-Lehre und dem Verhüllen — ein früher Wall gegen den Griff des Finsteren, die Methode hinter dem wärmenden Feuer). Yssas Pfad zu den Stummen Ringen — der „harte Weg" — bleibt bewusst gemieden.
- **Das Finstere**: die gesichtslose Schattenmacht über See, die Khar verschlang. Der große ferne Schatten der Partie — seit Frühling J2 **nicht mehr blind** (es erblickte durch den verbrannten Stillen die Insel; Henk ist der erste Berührte). Siehe [regeln-gestrandete.md](regeln-gestrandete.md).
- **Die zwei Feuer**: die Identitätsachse seit Jahr 2. **Das reinigende Feuer** (Härte, +Eifer/−Gnade gegen das Finstere) gegen **Das Feuer, das wärmt** (Mut und Zusammenhalt). Beide gelten als Setzung; das Volk wählt von Fall zu Fall. Seit Frühling J3 hat die Wärme mit der Disziplin **Das Verwahren** eine bewiesene Methode (ein früh Berührter kam zurück) und dem reinigenden Feuer das Monopol genommen — der Streit ist nun politisch. Siehe [regeln-gestrandete.md](regeln-gestrandete.md).
- **Khar**: das verlorene Festland jenseits der Schwarzen See, die alte Heimat, vom Finsteren verschlungen. Der Bewahrer **Eskil Buchwart** kam mit dem vierten Boot (Sommer J2) von dort, ein Augenzeuge des Falls.
- **Generation / Lebensstand**: Alter als Spielgröße. Rüstig, Lebensabend (−1 auf eigene Feldaktionen), Hinfällig (−2), Tod. Im Lebensabend steht Alde Graumahl; Eskil Buchwart, anfangs ebenso, kam im Winter J2 wieder zu Kräften (rüstig).

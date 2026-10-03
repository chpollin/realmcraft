---
title: "Partie Talustan, Aufstellung, Umdeutung und Frontend"
project:
  name: RealmCraft
  spielwelt: Die Schwarzkämme
  partie: Talustan
status: bereit
updated: 2026-10-03
language: de
---

# Partie Talustan

Die spielbereite Aufstellung der ersten Schwarzkämme-Partie. Der Zahlenstand liegt im Speicherstand, pausiert in [`examples/talustan-LIVE-backup-2026-07-23.json`](../../../examples/talustan-LIVE-backup-2026-07-23.json), das eigene dystopische Dashboard unter `schwarzkaemme/`. Welt und Republik stehen in [WELT.md](../../welten/schwarzkaemme/WELT.md) und [talustan.md](../../welten/schwarzkaemme/republiken/talustan.md), die Nachbarrepublik in [nochtien.md](../../welten/schwarzkaemme/republiken/nochtien.md).

## Die Spielerfigur

Statthalterin Aminat stammt aus einem Awuren-Hochtal Talustans, als Junge in die Weiße Zitadelle gegangen, im Daten- und Verwaltungsapparat des Zentrums aufgestiegen, mit hohem Rang. Jetzt vom Zentrum als saubere, moderne Statthalterin zurückgeschickt, um Talustan ruhigzustellen und die Mine reibungslos zu machen. Heimlich dem eigenen Volk zugewandt. Sie trägt die drei Widerstandsfäden in einer Person, das Analoge (Herkunft, Bund), die Aneignung (Systemkenntnis) und das Band (ihre Schwester Leyla in der Diaspora).

Ihre Zwiegesichtigkeit ist die Wesensart, +2 mit den Werkzeugen des Zentrums, −2 auf gewachsenes Vertrauen des Volks. Ihre Stärke im System ist ihre Schwäche daheim.

## Umdeutung der RealmCraft-Größen

Das Schema bleibt unangetastet, die generischen Felder tragen hier neue Bedeutung, wie schon bei der archivierten Partie „Die Mehrung". Das Frontend `schwarzkaemme/app.js` hält diese Zuordnung.

| Schema-Feld | Talustan | Bedeutung |
|---|---|---|
| `grundgroessen.nahrung` | Versorgung | Wasser, Brot, Fisch unter Dürre und sterbendem Salzmeer |
| `grundgroessen.material` | Werk | eigenes Werk und Infrastruktur (das Erz fließt ab) |
| `grundgroessen.wissen` | Gedächtnis | Sprache, Erinnerung, das Eigene gegen die Löschung |
| `lagewerte.verteidigung` | Deckung | Schutz vor dem Zugriff des Auges |
| `lagewerte.mobilitaet` | Spielraum | freier Zug ohne Erlaubnis (Autonomie) |
| `lagewerte.wohlstand` | Auskommen | wie es den Menschen wirtschaftlich geht |
| `modifikatoren.lage` „Rang der Statthalterin" | Rang | Aminats Score beim Zentrum (Kapital und Fessel) |
| `modifikatoren.lage` „Aufmerksamkeit des Auges" | Sichtbarkeit | Hitze, ab einer Schwelle fällt Repression |
| `lagewerte.ausbeuten` | Abfluss nach oben | Erz, Rekruten, vergifteter Transfer |
| `berater[].loyalitaet` | Loyalität zu Aminat | -5..+5 |
| `berater[].achse` (Zusatzfeld) | Achse Zentrum↔Volk | -5 zentrumstreu … +5 volksnah |

Die Setzungen dieser Partie (die neuen Hebel) liegen ausführlich im `savegame.json` unter `setzungen` und werden im Dashboard-Panel „Setzungen" gespiegelt.

## Das Frontend

Eigenständiges, dunkles Sci-Fi-Dashboard unter `schwarzkaemme/` (eigene `index.html`, `style.css`, `app.js`). Es liest denselben `savegame.json` wie das Haupt-Dashboard, verwendet dessen Lade- und UI-Module wieder (`js/parse.js`, `js/components/ui.js`) und lässt `index.html` und den Frontend-Contract des Haupt-Dashboards unberührt. Aufgerufen wird es über den Live-Server unter `http://localhost:4173/schwarzkaemme/`. Live-Reload läuft über dieselbe SSE-Leitung (`/events`), jedes Schreiben von `savegame.json` spiegelt sich sofort.

Als mögliche nächste Ausbaustufe fehlen noch KI-Bilder (Porträts, Karte) über die vorhandene Gemini-Pipeline, ein Delta-Banner nach dem Zug und eine gezeichnete Lagekarte.

## Der Rat (Kurzschlüssel)

Loyalität zu Aminat bei Partiebeginn, laut Speicherstand.

| Berater | Volk | Feld | Loy. |
|---|---|---|---|
| Scheich Nurudin | Awuren | Alte Ordnung, volksnah, misstraut Aminat | −1 |
| Oberst Timur Aslanow | Kumane | Sicherheit und Netz, das Ohr des Zentrums im Rat | +1 |
| Ingenieurin Saida Charsi | Darginin | die Mine, Arbeit gegen Zerstörung | +2 |
| Marat, der Draht | Lese | Schattennetz und Aneignung, jung und riskant | +3 |
| Lehrerin Patimat | | Gedächtnis und Zunge, die verbotene Schule | +2 |
| Kaufmann Rustam | Kumane | Handel und das Band nach außen, käuflich | 0 |

## Stand und offene Fäden (Kapitel 1, Sommer 2051)

Aminat ist seit einer Woche im Amt, der Rat tagt zum ersten Mal unter ihr, noch ist kein Zug gespielt. Sie weiß, dass mindestens ein Ohr im Raum jedes Wort nach oben trägt.

- Der Völkerschlüssel-Posten des verstorbenen Wasservogts eines Küstenbezirks ist frei. Drei Bünde, Awuren, Kumanen und Lesen, greifen danach, und jede Vergabe kränkt zwei.
- Die Erzunion will die Mine auf einen zweiten Hang ausweiten, mitten in altes Bruderschaftsland. Nurudin nennt es Frevel, Saida nennt es Arbeit.
- Patimats verbotene Schule ist Timurs Netz womöglich schon aufgefallen.
- Marat drängt, einen gekaperten Aufklärer anzuzapfen, eigene Augen im Netz bei Risiko fürs Auge.
- Das Salzmeer stirbt, die Küstendörfer verlieren Wasser und Fisch, die Jungen wandern ab oder gehen zu den Reinen.

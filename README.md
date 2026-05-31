# RealmCraft

**Erzählendes Strategie-Rollenspiel mit einem Sprachmodell als Spielleiter.**

Du führst ein Volk über Jahre und Kapitel. Ein Sprachmodell ist der Spielleiter („der Chronist"): es legt die Lage offen, nennt Zielwert und Modifikatoren, du entscheidest und würfelst 1d10 selbst. Ein mitlaufendes Dashboard („Lagetisch des Rates") spiegelt den Stand und erzeugt Bilder im einheitlichen Stil — Berater, Mächte, Karte und die eigene Siedlung.

## Zwei Spielweisen

**(a) Im Chat** mit einem Frontier-Sprachmodell als Chronist. Man spielt, lässt sich auf „speichern" einen hybriden Speicherstand (lesbares Markdown plus eingebetteter `json`-Block) ausgeben und lädt das JSON ins Dashboard. Das Dashboard ist dafür eigenständig nutzbar, ein Stand pro Projekt.

**(b) Im Terminal** mit [Claude Code](https://claude.com/claude-code) als Chronist gegen den lokal laufenden Live-Server. Der Chronist führt die Partie und schreibt den Stand fort; jeder geschriebene Zug spiegelt sich per Live-Reload sofort ins offene Dashboard.

## Schnellstart

```bash
npm install
npm run serve          # oder: PORT=4173 node serve.mjs
```

Dann im Browser auf `http://localhost:4173`. Einen Speicherstand laden (Knopf oder Drag & Drop), und das Lagebild erscheint. Auf der veröffentlichten Seite ist ein Beispielstand voreingestellt; ein eigener lässt sich jederzeit darüberladen.

## Bildgenerierung (optional)

Für die Bilder braucht es einen Gemini-API-Key. Entweder in den Einstellungen (Zahnrad) eingeben oder in eine `.env` legen:

```
GEMINI_API_KEY=dein-key
```

Der Key bleibt lokal und wird **nie committet**.

## Tests

```bash
npm test            # Unit-Tests (node:test)
npm run test:e2e    # End-to-End und Visual-Snapshots (Playwright)
```

## Struktur

- `index.html`, `js/`, `css/` — das Dashboard (vanilla ES-Module, kein Build).
- `schema/` — JSON-Schema des Speicherstands.
- `examples/` — Beispielstände (u. a. der voreingestellte Stand der laufenden Partie).
- `docs/` — siehe unten.
- `knowledge/` — verdichtetes Partie-Gedächtnis.

## Weiterlesen

- [docs/Spielmechanik.md](docs/Spielmechanik.md) — die Regeln (Spielfluss, Zugarten).
- [docs/UI-Gesamtbild.md](docs/UI-Gesamtbild.md) — Stil, Architektur, die Reiter, Bild-Pipeline und Live-Spiegelung.
- [docs/Frontend-Contract.md](docs/Frontend-Contract.md) — die verbindlichen Felder und testids des Dashboards.
- [knowledge/INDEX.md](knowledge/INDEX.md) — Navigation der laufenden Partie.

## Promptotyping

RealmCraft ist ein [Promptotyping](https://dhcraft.org/Promptotyping/)-Projekt von [Christopher Pollin](https://dhcraft.org) (DHCraft).

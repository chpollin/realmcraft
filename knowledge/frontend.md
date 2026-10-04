---
title: Frontend
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: complete
language: en
created: 2026-10-03
updated: 2026-10-04
authors: [Christopher Pollin]
generated-with: Claude Code (Claude Opus 5.5)
related: [game-design, architecture, data-contracts, playtests, testing, plan-m1]
---

# Frontend

The game board (Spielbrett) under `spielbrett/` is the map-first browser surface of RealmCraft. It is plain ES modules and CSS without a build step, served by `serve.mjs`, and it imports the kernel modules from `/engine/` directly. The board contains no game logic. Every number it shows comes from the player's projection or from a kernel function, and every consequence shown before a decision comes from `preview()` on the projection ([decisions.md](decisions.md), D15).

## Entry and modes

`spielbrett/index.html` loads `js/main.js`. Without parameters the board shows the start screen with new game, continue, settings and rules (`ui/start.js`), and `?campaign=<cid>` opens that campaign. A campaign that cannot be read shows the reason and the way back to the start screen.

For looking at the board without a live game, `node tests/fixtures/spielbrett/build-module.mjs --keep` writes two campaigns through the kernel CLI into a temporary root and prints that root. The campaign `module` has every board module in play (trade, a war band in sight, magic, a change of way of life) and opens on an event decision. The campaign `agenten` stands in the agents phase with waiting, running and finished agent steps and judge findings of every severity. `REALMCRAFT_ROOT=<root> PORT=<port> node serve.mjs` serves them at `?campaign=module` and `?campaign=agenten`. The former prototype on hand-written fixtures stays preserved at commit `44bb892` ([playtests.md](playtests.md)).

## Data layer

| Module | Role |
|---|---|
| `js/data/server.js` | client of the dev server that reads the campaign index, the player's view and events, `status.json`, chronicle and report summaries, writes through `POST /api/draft` and `POST /api/seal` |
| `js/data/kernel.js` | the kernel as the browser uses it, with the environment from the pinned world package plus the released content, and `preview`, probes, bands, loyalty bands, map layers and research cost |
| `js/data/game.js` | a real campaign on the board, which loads view, package and content, keeps the draft, previews every change, stores the draft through the server and follows server-sent events |
| `js/data/adapter.js` | maps the projection and the preview to the board model, pure and DOM-free so unit tests run it in Node, and holds the lookups the views make on that model (tile, region, objects on a tile, people and resource names) |
| `js/data/draft.js` | immutable updates of the player's draft (orders, rolls, mandates, choices, labour) |
| `js/data/options.js` | orders a selection allows, decided by previewing each candidate with the kernel |
| `js/data/ereignisse.js` | event cards after a turn change from the projected log, open decisions and library cards |
| `js/data/labels.js` | label lookup over the board labels (`spielbrett/labels/`) and the label files of the world in the chosen language, and the signed number format the views share |

The server releases only fog-safe campaign files ([architecture.md](architecture.md), trust boundaries). The route table at the head of `serve.mjs` is the reference for every endpoint the board calls and for the server-sent events on `/events`.

## Surface

The map is the main surface. Everything else is a panel or overlay over it.

- Top bar (`ui/leiste.js`). People, season, stores with changes from the preview, destiny summary and overlay shortcuts.
- Map (`map/renderer.js`, `map/terrain.js`, `map/minimap.js`). Canvas 2D with the layers Gelände, Besitz, Bedrohung and Handel (terrain, ownership, threat, trade, with control, threat, roads and trade routes from the kernel's `mapLayers`), painted terrain marks, region borders and names at the region centre, hover and a minimap. It draws on demand and runs a frame loop only while something moves.
- Council strip (`ui/ratsleiste.js`). Every member with portrait or initials, role symbol, current activity, lead effect on probes and loyalty, always visible.
- Context panel (`ui/kontext.js`). What the selected tile, unit, place, region or people is and which orders it allows, each previewed on hover.
- Place list (`ui/ortsliste.js`). Keyboard and screen-reader equivalent of the canvas.
- Turn bar. Orders of the turn with slot indicator and slot icon per order, messages, the blocker summary next to "Zug beenden" with fixes in place, and the button itself.
- Overlays as native `<dialog>` (`ui/dialoge.js`). Developments as the paths wheel with one spoke per research path and one ring per tier (`ui/pfade.js` on `data/pfade.js`), council with vote meter, cards and decree or Machtprobe (`ui/rat.js`), chronicle (`ui/chronik.js`), destinies with milestones as symbol and progress (`ui/bestimmung.js`), probe dialog with target, every modifier, the chance per leading member and the roll (`ui/probe.js`), and event cards (`ui/ereignisse.js`).
- Weltgeschehen (`ui/weltgeschehen.js`). Kernel results and agent steps grouped, with waiting, running, done and failed states and the judges at the end. A judge's findings show the severity that `status.json` records under its step.

The playtest of 3 October 2026 shaped this surface ([playtests.md](playtests.md)). Research forms its own budget beside the slots, a new research choice replaces the previous one, the world event roll is its own step, and event cards appear one after another as centred modal cards confirmed with "Weiter", with options previewed by the kernel and fitting orders as quick reactions.

## Design rules

- Colours and sizes are tokens on `:root` in `spielbrett/css/tokens.css`. The canvas reads them once (`map/palette.js`) and only shifts lightness, chroma or alpha of a token.
- One icon family for DOM and canvas (`js/icons.js`), 24×24 stroke drawings rendered as inline SVG and as `Path2D`.
- Icons and two-stage tooltips over text (`ui/tip.js`). Hover or focus shows name and value, a click, Enter or Space pins the detail with calculation and origin, Escape closes it.
- No standing explanatory prose, no eyebrow labels above headings and no decorative counters.
- Text always goes through `textContent` (`js/dom.js`), so agent strings can never inject markup.
- Accessibility. Native dialogs with focus trapping and focus return, keyboard panning of the map, the place list as alternative to the canvas, and visible focus.
- Labels come from the board's label files and the world's label files. Kernel issues are shown through the label `issue.<code>`, with a generic fallback.
- Acknowledged event cards are remembered per campaign and turn in `localStorage`, a convenience the board works without.

## Open data gap

The UI round of 3 October 2026 listed data the kernel did not deliver, and M1 closed most of it ([plan-m1.md](plan-m1.md)). Issues carry machine-readable reasons, the view carries council location and strengths, trade routes and orders and revealed rival destinies, the preview honours `draft.choices` and the consequences of `destiny.adopt`, and `status.json` records judge findings with their severity. The event cards still read some facts from the English reason text of log entries, namely a council member's death and successor and the option an event decision closed with (`data/ereignisse.js`).

## M1 additions

M1 adds a start screen with new game, continue, settings and rules, an Escape menu in game, English as default UI language with German selectable and labels per language, synthesised Web Audio with volumes and reduced motion, polished event cards, victory and defeat screens with a campaign summary and the research paths view ([decisions.md](decisions.md), D16 to D21). Their contracts are in [plan-m1.md](plan-m1.md).

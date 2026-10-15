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
updated: 2026-10-15
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
- Map (`map/renderer.js`, `map/terrain.js`, `map/minimap.js`). Canvas 2D with the layers Gelände, Besitz, Bedrohung and Handel (terrain, ownership, threat, trade, with control, threat, roads and trade routes from the kernel's `mapLayers`), painted terrain marks, region borders and names at the region centre, hover and a minimap. It initially fits the known tiles into the area left free by the council and open panels. A map control restores that fit, resizing retains it until the player moves the camera, and a selected object is centred above the narrow-screen sheet. Province names use the UI face with viewport and label collision checks. It draws on demand and runs a frame loop only while something moves.
- Council strip (`ui/ratsleiste.js`). Every member with portrait or initials, role symbol, current activity, lead effect on probes and loyalty, always visible.
- Context panel (`ui/kontext.js`). What the selected tile, unit, place, region or people is and which orders it allows, each previewed on hover.
- Place list (`ui/ortsliste.js`). Keyboard and screen-reader equivalent of the canvas.
- Turn bar. Orders of the turn with slot indicator and slot icon per order, messages, the blocker summary next to "Zug beenden" with fixes in place, and the button itself. Problems can be dismissed by Escape, close or outside click, and repair navigation closes the list. Focus survives draft refreshes. The end-turn control lists both problems and outstanding rolls.
- Overlays as native `<dialog>` (`ui/dialoge.js`). Developments as the paths wheel with one spoke per research path and one ring per tier (`ui/pfade.js` on `data/pfade.js`), council with vote meter, cards and decree or Machtprobe (`ui/rat.js`), chronicle (`ui/chronik.js`), destinies with milestones as symbol and progress (`ui/bestimmung.js`), probe dialog with target, every modifier, the chance per leading member and the roll (`ui/probe.js`), and event cards (`ui/ereignisse.js`).
- Weltgeschehen (`ui/weltgeschehen.js`). Kernel results and agent steps grouped, with waiting, running, done and failed states and the judges at the end. A judge's findings show the severity that `status.json` records under its step.

The playtest of 3 October 2026 shaped this surface ([playtests.md](playtests.md)). Research forms its own budget beside the slots, a new research choice replaces the previous one, the world event roll is its own step, and event cards appear one after another as centred modal cards confirmed with "Weiter", with options previewed by the kernel and fitting orders as quick reactions.

## Design rules

- Colours and sizes are tokens on `:root` in `spielbrett/css/tokens.css`. The canvas reads them once (`map/palette.js`) and only shifts lightness, chroma or alpha of a token.
- One icon family for DOM and canvas (`js/icons.js`), 24×24 stroke drawings rendered as inline SVG and as `Path2D`.
- Icons and two-stage tooltips over text (`ui/tip.js`). Hover or focus shows name and value, a click, Enter or Space pins the detail with calculation and origin, Escape closes it.
- No standing explanatory prose, no eyebrow labels above headings and no decorative counters.
- Text always goes through `textContent` (`js/dom.js`), so agent strings can never inject markup.
- Accessibility. Native dialogs with focus trapping and focus return, keyboard panning of the map, the place list as alternative to the canvas, and visible focus. Single-key overview shortcuts work from the map or page background and leave dialogs and focused controls intact.
- Labels come from the board's label files and the world's label files. Kernel issues are shown through the label `issue.<code>`, with a generic fallback.
- Acknowledged event cards are remembered per campaign and turn in `localStorage`, a convenience the board works without.

## Planning entry and hierarchy

The first planning task is to find the own community, inspect its available actions and assign labour. On the world map, an empty order area offers a labelled planning action that opens the own camp or settlement context. The home map control follows the same selection path and moves focus to the context heading. Neither action changes the draft or spends a turn. Labour-warning navigation uses the same home selection path for camps and settled communities. Crossing into or out of the narrow layout keeps a selected location centred in the map area left free by the panel. A missing home retains the neutral empty state, and resolution has no planning shortcut.

Action slots are planning entry points. An empty main or minor slot opens a native action dialog filtered to that budget. Action type and destination selection inspect kernel previews without changing the draft. Known fields and projected objects provide deduplicated candidates; foreign units require current sight. Blocked destinations retain their kernel reason. A concrete option uses the existing order control, including costs, probes, council checks and replacement. Institution and destiny actions link to their existing editors. Research keeps its separate budget. Occupied slots show the concrete order glyph and focus the queued order. Empty slots use a plus, and the main/minor labels remain visible in narrow layouts. Resolution disables empty slots. Dialog and budget updates retain keyboard focus and target selection.

The world-status panel only offers a kernel disclosure when actual results exist. A fresh status has an explicit empty state, without a completion tick or disclosure chevron. Optional native DOM children are filtered before replacement so an absent pipeline never renders as `null`. Populated results retain their native disclosure, open state and keyboard focus across updates.

The council starts compact when the viewer has not stored an explicit preference. Every member remains available, with a visible signed loyalty badge and a full card on activation. Expanding preserves the existing detail view. A previous expanded or collapsed choice remains effective. A turn with outstanding rolls remains actionable but uses a subdued surface, keeping attention on planning and the actual outstanding roll. The ready end-turn action retains the warm accent.

This pass retains the map-first composition, current world tokens, all resource values, keyboard equivalents and the existing language preference. It establishes an interaction hierarchy; the owner has not accepted a new artistic treatment. Map texture, world-specific portraits and the wider community-first composition remain design explorations.

## Community prototype

The October 15 owner request adds an optional code-drawn community view beside the existing world map. The task is to find the own community's work areas, inspect the current allocation and edit it with the existing kernel preview. The map remains the default. The view buttons and the address parameter `ansicht=gemeinschaft` expose the two views, and browser Back/Forward restores the chosen view.

The resource and destiny bar, council, module controls, order slots, world-event roll, blockers and end-turn action remain shared. Community buttons for food, material and research show the assigned clan count with its unit, open the actual home context and focus its corresponding labour control. The home button uses the actual camp or settlement kind as its visible name and opens the home heading. The empty-order planning shortcut is omitted in community mode because the home button already provides it. Escape returns focus to the selected community button. The scene is decorative canvas with native HTML controls as its interaction equivalent; the skip link targets those controls in community mode. A narrow layout uses a two-column work-area dock and the existing bottom sheet. The council stays available through its top-bar button there, while the portrait rail is hidden to avoid covering the dock.

`js/community/scene.js` is a deterministic Canvas 2D illustration with reusable terrain, tents or cottages, work areas and figures. `js/community/view.js` arranges the canvas and HTML controls around the actual council and context bounds. The Hochland calendar, home kind, labour assignment and herds come from the player's projection or draft. The scene is an authored Hochland illustration, not a spatial building inventory or a complete rendering vocabulary for arbitrary worlds. Decorative passers-by do not represent extra clans. Work figures and visible herds are bounded representations, while the controls retain the exact assignment values.

Normal play always follows the actual campaign season. An explicit debug URL parameter, `debug=1`, exposes a labelled visual season preview for development only; leaving debug clears its override. The real season and all resources remain in the shared top bar. No image model, raster scene, dependency or client API call is used. Motion stops in reduced-motion mode and while the view or document is hidden. The hidden map retains its camera and dimensions and is not centred by community selection.

This is an executable visual and interaction experiment. Seasonal graphic treatment is distinct from new seasonal rules. Scene growth, world-specific architectural grammars and new institution mechanics remain unimplemented. The drawing follows the existing Hochland token direction; artistic acceptance remains open.

## Planning safeguards

The labour picker offers the canonical food and material resources and research. Existing assignment keys remain visible so an older allocation can be corrected. A research assignment uses the kernel key `research`; `wissen` remains a stock resource. Labour step controls retain keyboard focus after preview and save refreshes.

A turn with no orders or with withdrawn rolls opens a review before sealing. The review names the withdrawn rolls, offers a return to planning and requires a separate confirmation. Confirmation is bound to the reviewed draft, so a changed draft is checked again. All campaign writes still pass through the server and kernel.

## Open data gap

The UI round of 3 October 2026 listed data the kernel did not deliver, and M1 closed most of it ([plan-m1.md](plan-m1.md)). Issues carry machine-readable reasons, the view carries council location and strengths, trade routes and orders and revealed rival destinies, the preview honours `draft.choices` and the consequences of `destiny.adopt`, and `status.json` records judge findings with their severity. The event cards still read some facts from the English reason text of log entries, namely a council member's death and successor and the option an event decision closed with (`data/ereignisse.js`).

## M1 additions

The board provides a start screen with new game, continue, settings and rules, an Escape menu, English and German UI labels, synthesized Web Audio with volumes and reduced motion, event cards, end screens and the research paths view ([decisions.md](decisions.md), D16 to D21). [plan-m1.md](plan-m1.md) retains their milestone contract and evidence limits; [plan.md](plan.md) routes current work.

## Product integration boundaries

The new-game form still creates a campaign from a world package and a people template. Free description, an editable generated creation draft and its reversible first-scene preview remain the requirements in [new-game-design.md](new-game-design.md), not capabilities of the current form. Save/load endpoints exist, but the board menu and client do not expose named saves. Free player intentions have no in-game translation interface, and the agent round still uses the external harness described in [agents-harness.md](agents-harness.md).

The Rules dialog is a generated read-only reference. Viewer settings currently cover language, audio and reduced motion. Campaign-rule editing and a broader mechanics configuration remain product scope decisions. Audio supplies synthesized ambience and cues; spoken narration is not integrated. The community prototype's visual limits are stated above. A source review of old handoff items must be reproduced against current code before treating them as unfinished work.

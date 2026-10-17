---
title: Design
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: complete
language: en
created: 2026-10-17
updated: 2026-10-17
authors: [Christopher Pollin]
generated-with: Antigravity
related: [frontend, game-design, new-game-design, architecture]
---

# Design

The visual surface of RealmCraft (`spielbrett/`) follows the Weltenwerkstatt direction, a cartographic command table that pairs an illustrated world map with a dark slate and brass instrument frame. The browser board uses plain ES modules, native HTML5 `<dialog>` elements, SVG diagrams and Canvas 2D without a build step or external framework. While the AI harness chat acts as the conversational control deck for world creation and season planning, the browser surfaces render spatial geography, resource flows, council standing and historical stratigraphy from the player's fog-safe projection and kernel `preview()`.

## Token architecture and typography

All colors in `spielbrett/css/tokens.css` are defined in perceptual OKLCH space so lightness and chroma steps maintain readable contrast across dark slate panels and warm cartographic pigments. DOM stylesheets reference semantic custom properties, and the Canvas 2D palette reader (`spielbrett/js/map/palette.js`) reads computed `:root` tokens once per theme or resize to derive shaded and translucent stops.

### Surface hierarchy

| Token | OKLCH value | Role |
|---|---|---|
| `--bg-abyss` | `oklch(0.14 0.015 160)` | Deepest canvas backdrop behind unexplored fog of war |
| `--bg-canvas` | `oklch(0.18 0.018 160)` | Explored map margin and vertical stream backdrop |
| `--bg-panel` | `oklch(0.21 0.016 158 / 0.94)` | Primary HUD bar surface for top bar, bottom turn dock and context drawer |
| `--bg-elevated` | `oklch(0.25 0.018 158)` | Action slots, council medallions and dialog surfaces |
| `--bg-interactive` | `oklch(0.29 0.022 158)` | Hover and active state for interactive controls and slot pills |
| `--bg-glass` | `oklch(0.19 0.016 158 / 0.86)` | Floating map controls, minimap frame and translucent overlays |

### Ink and accent hierarchy

| Token | OKLCH value | Role |
|---|---|---|
| `--ink-primary` | `oklch(0.93 0.022 85)` | Primary titles, active numbers and selected names |
| `--ink-secondary` | `oklch(0.77 0.024 85)` | Secondary labels, action descriptions and body copy |
| `--ink-muted` | `oklch(0.62 0.020 85)` | Metadata, keyboard shortcut hints and empty-slot labels |
| `--ink-map-label` | `oklch(0.95 0.028 82)` | Cartographic region and settlement labels on canvas |
| `--ink-map-halo` | `oklch(0.15 0.015 160 / 0.88)` | Outer stroke halo for map typography |
| `--accent-brass` | `oklch(0.76 0.125 78)` | Primary active decision, selected hex ring and ready end-turn seal |
| `--accent-brass-dim` | `oklch(0.48 0.075 78 / 0.45)` | Hairline brass bevel border on active panels and medallions |
| `--accent-sage` | `oklch(0.73 0.110 152)` | Food flows, positive resource delta, high loyalty and safe probe margin |
| `--accent-river` | `oklch(0.68 0.115 235)` | Research budget, knowledge paths and trade or river highlights |
| `--accent-amber` | `oklch(0.78 0.145 72)` | Pending world roll, warnings and contested borders |
| `--accent-ember` | `oklch(0.65 0.185 28)` | Negative delta, blocker issue, threat layer and low loyalty |

### Cartographic biome palette

| Biome id | Token | OKLCH value | Cartographic character |
|---|---|---|---|
| `wasser`, `kueste` | `--terrain-wasser` | `oklch(0.32 0.058 232)` | Deep bathymetric slate-blue with lighter coastal shallows |
| `auen` | `--terrain-auen` | `oklch(0.46 0.068 148)` | Alluvial river-meadow green with warm silt undertone |
| `grasland` | `--terrain-grasland` | `oklch(0.50 0.072 132)` | Sunlit olive-meadow ochre-green |
| `wald` | `--terrain-wald` | `oklch(0.39 0.066 152)` | Deep canopy pine and oak forest green |
| `sumpf` | `--terrain-sumpf` | `oklch(0.38 0.048 168)` | Brackish reed and peat teal-olive |
| `heide` | `--terrain-heide` | `oklch(0.49 0.064 82)` | Dry gorse, heather and wind-swept ochre |
| `huegel` | `--terrain-huegel` | `oklch(0.47 0.056 68)` | Warm umber foothills with directional relief shading |
| `gebirge` | `--terrain-gebirge` | `oklch(0.41 0.026 60)` | Granite ridge grey-brown with high-contrast crest lines |
| `steppe`, `oedland` | `--terrain-oedland` | `oklch(0.53 0.068 74)` | Sun-baked salt pan and arid sandstone |

### Typographic tiers and frame geometry

| Tier | Token | Stack and usage |
|---|---|---|
| Diegetic world | `--font-world` | `'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif` for realm and people names, context headers, dialog headings and italic tracked province labels on the canvas |
| Tactical UI | `--font-ui` | `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif` for buttons, order chips, tooltips and council activities |
| Telemetry numerals | `--font-nums` | `var(--font-ui)` with `font-variant-numeric: tabular-nums` on resource stocks, signed deltas, probe leads, loyalty badges and slot counters so columns stay aligned across preview updates |

Spatial layout follows a `4px` base unit (`--sp-1` through `--sp-5`) with restrained corner radii (`4px` to `6px` on frames, `999px` on pills). Panels use a `1px` outer border paired with an inset top highlight (`inset 0 1px 0 oklch(1 0 0 / 0.06)`) to separate slate and brass instruments without heavy drop shadows.

## Five-pass procedural cartography

The Canvas 2D map (`spielbrett/js/map/renderer.js`, `spielbrett/js/map/terrain.js`, `spielbrett/js/map/palette.js`) renders known tiles through a five-pass off-screen terrain cache (`terrainCanvas`) combined with a per-frame dynamic foreground pass.

```
+-------------------------------------------------------------------------+
|                    OFF-SCREEN TERRAIN CACHE (5 PASSES)                  |
|                                                                         |
|  Pass 1: Crisp Hex Base Fill + Seeded Per-Tile Micro-Variation          |
|          (L +/- 0.018, C +/- 0.008 via deterministic tile hash)         |
|                                  |                                      |
|  Pass 2: Biome Transition Feathering & Inner Relief Vignette            |
|          (Linear gradient per hex: sunlit NW rim, shaded SE slope)      |
|                                  |                                      |
|  Pass 3: Coastline Double-Ripples & Wetland Water Mirrors               |
|          (2 concentric shore lines on water-land edges; marsh pools)    |
|                                  |                                      |
|  Pass 4: Tapered Hydraulic Rivers & Road Splines                        |
|          (Outer bank casing + inner water channel scaled by flow rank)  |
|                                  |                                      |
|  Pass 5: Multi-Layered Cartographic Relief & Vegetation Marks           |
|          (Ridge hachures, multi-crown groves, reed clusters, dunes)     |
+-------------------------------------------------------------------------+
                                   |
                                   v
+-------------------------------------------------------------------------+
|                    DYNAMIC FOREGROUND PASS (PER FRAME)                  |
|  - Single-Stroke Province Borders + Asymmetric Inner Realm Tint         |
|  - Settlements (Camp/Village/City architectural silhouettes + banner)   |
|  - Units & Foreign Detachments (Framed shield tokens + movement arrows) |
|  - Serif Cartographic Labels (Collision-checked, tracked italic)        |
+-------------------------------------------------------------------------+
```

- Crisp hex fill and directional relief (Passes 1 and 2). Every hex polygon is filled crisply using its biome base color shifted by a deterministic hash `hash2(q, r)`. A northwest-to-southeast linear gradient (`315deg` highlight to `135deg` shadow) and a faint inner rim give each tile physical relief without blurring the canvas.
- Coastline ripples and marsh water mirrors (Pass 3). Where a `wasser` or `kueste` hex meets land, two concentric shoreline contour lines are inset into the water side with decaying alpha. In `sumpf` and `auen` tiles, horizontal water-mirror ellipses sit beneath the vegetation marks.
- Tapered hydraulic rivers with bank casings (Pass 4). `drawRivers()` computes a deterministic flow rank from connected river edges, strokes a wider dark alluvial bank casing underneath, and overlays the inner water channel and a central specular thread. Confluences and estuaries receive smooth round caps so segments join without gaps.
- Hand-inked terrain motifs (Pass 5). `drawTerrainMark()` in `spielbrett/js/map/terrain.js` draws interconnected ridge spines with sunlit northwest facets and southeast slope hachures for `gebirge` and `huegel`, back-to-front clustered tree canopies with ground shadows for `wald`, alluvial channels with `Typha` reed stalks for `auen` and `sumpf`, and multi-plane grass or dune contours for `grasland`, `heide`, `steppe` and `oedland`.
- Single-stroke province borders and cartographic labels (Foreground). `drawRegionBorders()` deduplicates shared edges between adjacent regions so each boundary is stroked once along the hex edge with an asymmetric inner realm tint. `drawRegionLabels()` renders province names in tracked italic `--font-world` serif with a dark halo and viewport collision checks.

## Instrument HUD and council medallions

```
+------------------------------------------------------------------------------------+
| [Volk & Lebensweise] [Season/Year] | [Nahrung] [Material] [Wissen] | [Dest] [Menu] |
+--------+----------------------------------------------------------+----------------+
|        |                                                          |                |
| [MV]   |                                                          |  CONTEXT       |
| +4  +1 |                                                          |  DRAWER        |
|        |                                                          |  (360px)       |
| [JK]   |                   CARTOGRAPHIC CANVAS                    |                |
| +1  +2 |                   (Full Viewport Canvas)                 |  - Tile/Home   |
|        |                                                          |  - Labour      |
| [ST]   |                                                          |    Steppers    |
| +0  +0 |                                                          |  - Available   |
|        |                                                          |    Orders      |
|        |  +---------------+                                       |                |
|        |  | Minimap &     |                                       |                |
|        |  | Layer Pills   |                                       |                |
|        |  +---------------+                                       |                |
+--------+----------------------------------------------------------+----------------+
| [Haupt 1/1] [Neben 1/2] [Forschung: Futterpontons +3] | [Order Chips] | [Zug Ende] |
+------------------------------------------------------------------------------------+
```

- Scroll-free bottom turn dock (`spielbrett/js/ui/leiste.js`, `spielbrett/css/brett.css`). `.zugleiste` uses a three-zone grid (`#budget`, `#befehle`, `.zug-abschluss`) that fits within the viewport without a horizontal browser scrollbar. When the `#budget` research pill (`[data-forschung]`) is present, the queued `research.assign` order chip in `#befehle` collapses into a compact icon-only badge so the achievement title is never duplicated side by side while `[data-order-id]` remains in the DOM for test queries. Remaining order chips truncate long descriptions with an ellipsis and expose the full text via tooltip.
- Tactile council medallions (`spielbrett/css/rat-leiste.css`, `spielbrett/js/ui/rat-leiste.js`). Each `.rat-mitglied` in the collapsed left rail renders as a `52px × 64px` medallion tile with a `38px` brass-rimmed circular portrait badge, role-tinted radial backdrop and serif monogram above two non-overlapping micro-pills for probe leadership (`.rat-fuehrung`) and signed loyalty (`.rat-loyalitaet`). Expanding the rail reveals the full name, office and current assignment.
- Campaign language synchronization (`spielbrett/js/main.js`). When loading a campaign, the board aligns its UI locale (`setLanguage`) with `game.view.settings.language` unless the viewer has recorded an explicit language override in `localStorage`.

## Community diorama and landscape toponyms

- Multi-landscape community diorama (`spielbrett/js/community/scene.js`, `spielbrett/js/community/view.js`). The deterministic Canvas 2D settlement scene is enabled across all three canonical landscapes (`highlands`, `riverlands` and `drylands`, read from `game.pack.welt.creation.world.landscape`). In `riverlands`, `scene.js` renders an alluvial delta horizon, marsh reed beds, wide river channels, timber stilts and sluice weirs. In `drylands`, `scene.js` renders flat-topped sandstone mesas, shimmering salt pans, sunken oasis cisterns with stepped terraces, desert acacia and thorn scrub, and mud-brick wind-tower (`badgir`) dwellings with sun-sail awnings or desert nomad pavilions across all four seasonal lighting palettes (`spring`, `summer`, `autumn`, `winter`) while preserving reduced-motion guarantees.
- Setting-aware procedural toponyms (`engine/creation/realm.js`). `landscape()` selects German and English region name prefixes and suffixes matched to `draft.landscape`:
  - `riverlands` uses delta, weir, silt and reed roots (`Schilf`, `Wehr`, `Flut`, `Schlick`, `Auen`, `Fähr`, `Siel`, `Kiel` with `delta`, `werder`, `furt`, `wasser`, `bruch`, `ufer`).
  - `highlands` uses ridge, stone and valley roots (`Nord`, `Süd`, `Klar`, `Stein`, `Weiden`, `Grat`, `Firn`, `Kamm` with `hain`, `fels`, `grund`, `tal`, `wacht`, `höhe`).
  - `drylands` uses salt, thorn and basin roots (`Salz`, `Dorn`, `Staub`, `Ocker`, `Glut`, `Wüsten`, `Klippen`, `Wind` with `senke`, `pfanne`, `kamm`, `brunnen`, `öd`, `steppe`).

## Vertical Weltenstrom visualization

Alongside the instrument-framed board at `/spielbrett/`, `spielbrett/strom.html` (`spielbrett/css/strom.css`, `spielbrett/js/strom.js`) provides a self-contained top-to-bottom visual scroll (`Weltenstrom`) reachable from the top bar and community view switch (`board.community.view.strom`). It eliminates dashboard cards, prose paragraphs, modal sheets and percentage bars in favor of seven continuous visual strata that encode game state through position, flow width, discrete unit blocks and topological links.

| Stratum | Visual encoding | Direct manipulation |
|---|---|---|
| I. Celestial arc (`#stratum-himmel`) | SVG meridian arc with four seasonal stations (`I · Frühling` to `IV · Winter`), glowing solar marker at the active season and Roman turn numeral | Read-only seasonal and realm header |
| II. Settlement diorama and Isotype clans (`#stratum-siedlung`) | Full-bleed `1200×640` Canvas 2D landscape diorama (`drawCommunity`) paired with an Isotype clan figure strip along the shoreline | Clicking `+` / `−` on food, knowledge or material stations reallocates clans via `game.setAssign()` and updates the alluvial ribbons below |
| III. Alluvial resource streams (`#stratum-fluesse`) | SVG Sankey ribbons flowing from the three labour stations into five resource vessels (`Nahrung`, `Volk`, `Wissen`, `Zustimmung`, `Material`), with red outflow branches for consumption and discrete unit blocks or a `-5..+5` balance scale | Live preview of income, upkeep and net delta |
| IV. Topographic world map (`#stratum-karte`) | Full-width 5-pass cartographic hex canvas (`MapView`) with floating layer sigils (`Gelände`, `Besitz`, `Bedrohung`, `Handel`) and zoom controls | Clicking a hex displays floating action sigils (`#strom-ort-aktionen`) that queue orders via `game.addOption()` |
| V. Council scales and destiny constellation (`#stratum-rat`) | Left: horizontal `-5..+5` loyalty balance scales for each council member with role emblem and signed value. Right: three triangular destiny milestone rings with discrete `done/total` arc segments | Visual inspection of council standing and destiny progress without percentages |
| VI. Practice roots and knowledge tree (`#stratum-wissen`) | Organic bottom-to-top SVG graph linking weighted practice roots (`praxis`) at the bottom through two-line known developments (`bekannt`) in the trunk to clickable research candidates (`forschung` / `vorschlaege`) in the crown | Clicking a crown node assigns the active `research.assign` target |
| VII. Stratigraphic timeline (`#stratum-zeit`) | Vertical turn-by-turn geological timeline (`I`, `II`, `III`, `IV`) with resource stock sparklines on the left, d10 glyphs with the raw face and probe results (`roll+mod ▸ target`) on the right, and the active turn's queued `H`/`N` order seals, open probe dice (`[data-strom-roll-order]`), world-event die (`#strom-weltwurf`) and turn-end seal (`#strom-zug-siegel`) | Clicking an open d10 rolls the order probe (`game.rollOrder()`) or world event (`game.rollWorld()`); clicking a queued `H`/`N` seal withdraws the order; clicking `#strom-zug-siegel` rolls any pending die or seals the season (`game.endTurn()`, with automatic offline demo continuation when enabled) |

Every die on these surfaces is a d10, because probes and world events roll 1d10 in the kernel ([rules-kernel.md](rules-kernel.md), section 6, and [decisions.md](decisions.md), D5). The shared glyph `d10Glyph` in `spielbrett/js/prototypen.js` draws the kite silhouette of a d10 with the raw face value and stays blank while the roll is open.

## Round dial and alternative visualization prototypes

`strom.html` carries a prototype dock (`#proto-dock`) that switches between four renderings of the same live projection, addressable as `?proto=strom|astrolabium|naturgemaelde|webstuhl`. The Weltenstrom remains the default. The three alternatives live in `spielbrett/js/prototypen.js` and use the same game calls as the Weltenstrom (`game.setAssign`, `game.addOption`, `game.removeOrder`, `game.rollOrder`, `game.rollWorld`, `game.endTurn`), so each is playable. Routes, shared-state boundary and seal behaviour are kept in [frontend.md](frontend.md#visualization-prototypes). All four are prototypes awaiting the owner's artistic acceptance.

### Round dial (Astrolabium)

The round dial follows the owner's idea of October 17 that one round closes a circle. The whole state of a season sits on a single disc whose four quadrants fill clockwise as the player decides, so the dial looks different, and fuller, at every point of the round.

The kernel season has three phases (`planning`, `resolving`, `agents`, [rules-kernel.md](rules-kernel.md), section 14). The dial therefore spreads the four decision steps of `planning` over the quadrants and lets the seal at twelve o'clock stand for the step into `resolving`. The quadrant names are display names for these steps and introduce no new game phase.

```
                       12 o'clock: season seal (#strom-zug-siegel)
                  IV  rolls and chronicle  |  I  labour and harvest
                 (turn spokes T1..Tn,      |  (three clan arcs with
                  open d10, world roll)    |   -/+ and harvest chords)
          9 ---------------------- [ hub: diorama, five stores ] ---------------------- 3
                  III council, destiny     |  II space and orders
                  and knowledge            |  (known tiles on distance
                 (loyalty pendulums,       |   orbits d=0, d=1, d>=2,
                  milestones, practices,   |   H and N per tile)
                  research crown)          |
                                       6 o'clock
```

| Quadrant | Planning step | Encoding | Fill measure |
|---|---|---|---|
| I (0° to 90°) | Clan labour | Three concentric arcs for food, research and material with Isotype clan figures, `−`/`+` controls and a chord into the matching store of the hub | Assigned clans over `population.core` |
| II (90° to 180°) | Main and minor orders | Known tiles (`model.known`) placed on three orbits by hex distance to the home, each with `H` and `N` controls, a beam from the hub to every tile with a queued order | Used over available action slots from the preview (`model.slots`) |
| III (180° to 270°) | Research target, read-only council and destiny | Loyalty pendulums (`-5..+5`), destiny milestones as diamonds, weighted practices, clickable research crown (`done/total`) | Whether a research target is set |
| IV (270° to 360°) | Probe and world rolls | One radial spoke per played turn with its rolled d10s, the open order probes and the world roll near twelve o'clock | Rolled over required rolls of the turn |

The hub holds the circular community diorama (`drawCommunity`) and the five stores with their net change. The clock hand stands at 90° times the sum of the four fills, so it advances with whichever step the player completes and reaches the seal only when all four are complete. Every fill is a count taken from the projection or the preview, in line with the rule that the board shows only kernel numbers ([decisions.md](decisions.md), D15).

### Elevation section (Naturgemälde) and causal loom (Kräfte-Webstuhl)

The elevation section, after Humboldt's Naturgemälde of the Andes, orders the known tiles by an elevation assigned to their terrain on a landscape profile, places the labour sluices and the knowledge veins below the ground line and stacks every played turn as a sediment layer with its rolls. The causal loom draws the five resources as vertical warp threads, from current stock at the top to projected stock at the bottom, and crosses them with horizontal weft threads for labour, tile orders and research, with a bead at each crossing whose size follows the effect.

### Open questions of the prototypes

- The dial's quadrant III fills by a yes or no, and quadrant IV is already full in a turn without required rolls, so the hand can stand in a quadrant whose own step is still empty.
- Quadrant labels, the elevation table of terrains and the resource glyphs are hard-coded in German in `prototypen.js` and do not yet pass through the board labels.
- The dial and the elevation section show at most twelve known tiles, chosen by home, queued orders, available actions and distance.
- The loom links each tile order to a resource thread by its position in the list, which is a placeholder for a real effect lookup from the preview.
- The alternative renderers read `o.slot`, `o.ort` and `ms.erfuellt`, which the order rows and destiny milestones do not carry (they carry `art`, `params` and `erreicht`). Every queued order therefore shows as minor, the beam to a queued tile never appears and milestones stay unfilled. Both studio files also overwrite `o.probe` in `model.orders` with an object, so withdrawing a rolled order cannot move its roll to `withdrawn`. A review of 17 October 2026 found these defects, and they await the planned simplification.

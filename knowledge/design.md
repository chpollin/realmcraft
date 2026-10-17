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

- Multi-landscape community diorama (`spielbrett/js/community/scene.js`, `spielbrett/js/community/view.js`). The deterministic Canvas 2D settlement scene is enabled across both `highlands` and `riverlands` campaigns (`landscape` read from `game.pack.welt.creation.world.landscape`). In `riverlands`, `scene.js` renders an alluvial delta horizon, marsh reed beds, wide river channels, timber stilts and sluice weirs around the settlement and work stations while preserving the seasonal lighting palette (`spring`, `summer`, `autumn`, `winter`) and reduced-motion guarantees.
- Setting-aware procedural toponyms (`engine/creation/realm.js`). `landscape()` selects German and English region name prefixes and suffixes matched to `draft.landscape`:
  - `riverlands` uses delta, weir, silt and reed roots (`Schilf`, `Wehr`, `Flut`, `Schlick`, `Auen`, `Fähr`, `Siel`, `Kiel` with `delta`, `werder`, `furt`, `wasser`, `bruch`, `ufer`).
  - `highlands` uses ridge, stone and valley roots (`Nord`, `Süd`, `Klar`, `Stein`, `Weiden`, `Grat`, `Firn`, `Kamm` with `hain`, `fels`, `grund`, `tal`, `wacht`, `höhe`).
  - `drylands` uses salt, thorn and basin roots (`Salz`, `Dorn`, `Staub`, `Ocker`, `Glut`, `Wüsten`, `Klippen`, `Wind` with `senke`, `pfanne`, `kamm`, `brunnen`, `öd`, `steppe`).

## Vertical Weltenstrom visualization

Alongside the instrument-framed board at `/spielbrett/`, `spielbrett/strom.html` (`spielbrett/css/strom.css`, `spielbrett/js/strom.js`) provides a unified top-to-bottom visual scroll (`Weltenstrom`) reachable from the top bar and community view switch (`board.community.view.strom`). It eliminates dashboard cards, prose paragraphs, modal sheets and percentage bars in favor of seven continuous visual strata that encode game state through position, flow width, discrete unit blocks and topological links.

| Stratum | Visual encoding | Direct manipulation |
|---|---|---|
| I. Celestial arc (`#stratum-himmel`) | SVG meridian arc with four seasonal stations (`I · Frühling` to `IV · Winter`), glowing solar marker at the active season and Roman turn numeral | Read-only seasonal and realm header |
| II. Settlement diorama and Isotype clans (`#stratum-siedlung`) | Full-bleed `1200×640` Canvas 2D landscape diorama (`drawCommunity`) paired with an Isotype clan figure strip along the shoreline | Clicking `+` / `−` on food, knowledge or material stations reallocates clans via `game.setAssign()` and updates the alluvial ribbons below |
| III. Alluvial resource streams (`#stratum-fluesse`) | SVG Sankey ribbons flowing from the three labour stations into five resource vessels (`Nahrung`, `Volk`, `Wissen`, `Zustimmung`, `Material`), with red outflow branches for consumption and discrete unit blocks or a `-5..+5` balance scale | Live preview of income, upkeep and net delta |
| IV. Topographic world map (`#stratum-karte`) | Full-width 5-pass cartographic hex canvas (`MapView`) with floating layer sigils (`Gelände`, `Besitz`, `Bedrohung`, `Handel`) and zoom controls | Clicking a hex displays floating action sigils (`#strom-ort-aktionen`) that queue orders via `game.addOption()` |
| V. Council scales and destiny constellation (`#stratum-rat`) | Left: horizontal `-5..+5` loyalty balance scales for each council member with role emblem and signed value. Right: three triangular destiny milestone rings with discrete `done/total` arc segments | Visual inspection of council standing and destiny progress without percentages |
| VI. Practice roots and knowledge tree (`#stratum-wissen`) | Organic bottom-to-top SVG graph linking weighted practice roots (`praxis`) at the bottom through two-line known developments (`bekannt`) in the trunk to clickable research candidates (`forschung` / `vorschlaege`) in the crown | Clicking a crown node assigns the active `research.assign` target |
| VII. Stratigraphic timeline (`#stratum-zeit`) | Vertical turn-by-turn geological timeline (`I`, `II`, `III`, `IV`) with resource stock sparklines on the left, 2d6 die-face glyphs and probe results (`roll+mod ▸ target`) on the right, and the active turn's queued `H`/`N` order seals above the turn-end seal | Clicking a queued `H`/`N` order seal removes it from the draft; clicking the bottom seal returns to the turn dock |

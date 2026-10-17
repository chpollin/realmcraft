---
title: Visual and Cartographic Design Specification
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: draft
language: en
created: 2026-10-17
updated: 2026-10-17
authors: [Christopher Pollin]
generated-with: Antigravity
related: [frontend, game-design, new-game-design, architecture]
---

# Visual and Cartographic Design Specification

## 0. Agent Briefing

- **Project type**: Turn-based strategy game companion board (`spielbrett/`) paired with a conversational AI harness game master (`CLAUDE.md`, `.claude/commands/`).
- **Target environment**: Modern desktop and mobile browsers, vanilla ES modules (`spielbrett/js/`), native HTML5 `<dialog>` and Canvas 2D (`spielbrett/js/map/`), CSS custom properties in OKLCH (`spielbrett/css/tokens.css`) without a bundler or external CSS framework.
- **Core paradigm**: **Cartographic Command Table (Weltenwerkstatt)**. The world map is an illustrated, living cartographic folio occupying the full viewport; the HUD acts as a precision brass-and-slate instrument frame that provides immediate situational awareness and zero-overflow turn orchestration while the AI harness curates narrative and strategic depth.

### 10 Binding Implementation Rules

1. **No raw color literals outside `tokens.css`**: Every DOM rule uses semantic CSS custom properties (`var(--surface-*)`, `var(--ink-*)`, `var(--accent-*)`). The Canvas 2D palette reader (`js/map/palette.js`) reads computed `:root` OKLCH tokens once per theme/resize and derives shaded or translucent stops algorithmically.
2. **Three-tier typographic separation**: `--font-world` (serif) is strictly reserved for diegetic identity (world/people titles, province labels on the map, event card headers, chronicle headings). `--font-ui` (humanist sans) carries all controls, orders, and labels. `--font-mono` (or `--font-ui` with `font-variant-numeric: tabular-nums`) carries all resource stocks, signed deltas, dice targets, and loyalty counters.
3. **Zero horizontal scrollbars in the HUD**: The bottom turn bar (`.zugleiste`) and top bar (`.kopfleiste`) must never produce a horizontal browser scrollbar at any viewport width from `360px` to `2560px`.
4. **Single canonical research slot in the bottom bar**: Research allocation and target selection live exclusively in the `#budget` research pill (`[data-forschung]`). The queued `research.assign` order is filtered out of `#befehle` so research never renders twice in the bottom bar.
5. **Crisp multi-pass procedural cartography**: Replace uniform `ctx.filter = blur(...)` hex blobs and single-width river strokes with a 5-pass off-screen terrain cache (base biome fill, inner edge vignette, topographic hachures/contours, tapered hydraulic rivers with bank casings, and multi-layered clustered vegetation marks).
6. **Single-stroke cartographic province borders**: Replace the double-stroked "tram-track" region boundary (`inset = 0.93` on both neighbour sides) with a single shared edge path using a subtle outer shadow halo and an asymmetric inner tint toward the owning realm.
7. **Tactile council medallions**: Council strip entries (`#rat-leiste`) use framed 44px medallions with role emblem, clear 2-line member/activity hierarchy on hover/expand, and non-overlapping pill badges for probe lead (`+4`) and signed loyalty (`+1`).
8. **Automatic campaign language synchronization**: When loading a campaign (`?campaign=<cid>`), `main.js` synchronizes the UI locale (`setLanguage`) with `game.view.settings.language` unless the user has explicitly overridden the locale during the active session.
9. **Landscape-aware procedural toponyms**: `landscape()` in `engine/creation/realm.js` selects landscape-specific prefix and suffix pools (`riverlands`, `highlands`, `drylands`) so generated region names match the physical geography of the world.
10. **Preserve all E2E and unit test contracts**: DOM structural refinements retain `[data-forschung]`, `#budget`, `#befehle`, `[data-order-id]`, `[data-slot-entry]`, `#welt-ereignis`, and `#zug-ende` so all unit and Playwright E2E suites pass without regression.

---

## 1. Design Genesis

### 1.1 Empirical Diagnosis of Current State

Inspection of the live 3-turn Riverlands campaign (`realm-b82095f182c1443a92147158083a1102`, *Schlick-Delta der Achtzehn Schleusen*) revealed five structural defects that make the board look like an early technical prototype rather than a finished strategy game:

| Layer | Observed Defect | Root Cause in Code |
|---|---|---|
| **1. Map Rendering** | Terrain hexes blur into indistinct olive/brown smudges; rivers are uniform blue tubes; region borders look like double railway tracks; trees are 3 overlapping circles. | `renderer.js` blurs the off-screen hex fill (`blur(s * 0.2)`), strokes rivers at fixed width `s * 0.11`, strokes every region border twice (`inset = 0.93`), and uses `fontUi` for map labels. |
| **2. Surface & Materiality** | Panels share a flat, uniform dark grey-green (`--bg-panel`) with 1px grey borders, lacking separation between world narrative and tactical telemetry. | `tokens.css` and `brett.css` apply identical surface treatments to the top bar, context inspector, council rail, and turn dock. |
| **3. Bottom Turn Dock** | A grey horizontal scrollbar cuts across the bottom bar even on wide screens; the research project (*Schilfgedeckte Futterpontons*) is rendered twice side by side. | `leiste.js` renders `researchBudget()` in `#budget` and also renders the `research.assign` order chip in `#befehle` (`flex-wrap: nowrap; overflow-x: auto`). |
| **4. Council Rail** | Left-hand council strip shows cramped initials (`MV`, `JK`, `ST`) colliding with two numbers (`+4 +1`), giving no visual sense of characters or offices. | `rat-leiste.css` packs `.rat-portraet`, `.rat-fuehrung`, and `.rat-loyalitaet` into a tight row without medallion framing or badge separation. |
| **5. Language & Toponyms** | Top bar displays `Winter, year 1` and `End turn` while the world and context panel are German (`Schlick-Delta`, `Zusammenleben gestalten`); a river delta has provinces named `Steinhain` and `Ostfeld`. | `main.js` initializes `i18n` before loading the campaign and never syncs to `game.view.settings.language`; `engine/creation/realm.js` uses one static highland name table for all landscapes. |

### 1.2 Reference Architecture from Strategy Game & Cartography Research

The visual overhaul synthesizes findings from contemporary strategy UI design and procedural 2D cartography:

1. **Procedural Cartographic Illustration (*Red Blob Games / Amit Patel*, *Uncharted Atlas / Martin O'Leary*, *Ozymandias*, *Pentiment*)**:
   - **Slope Hachures & Contour Shading**: Rather than photo-blurring hexes, readable 2D strategy maps use crisp polygon fills combined with directional slope hachures (short parallel pen strokes along elevation gradients) and subtle inner hex edge shading.
   - **Hydraulic River Tapering & Bank Casings**: Rivers gain visual believability when drawn as two-layer splines (a wider dark bank/shoreline casing underneath, a brighter water channel above) whose stroke width scales with downstream flow (`width = baseWidth * (1 + 0.28 * Math.sqrt(flowIndex))`).
   - **Coastline & Wetland Ripples**: Water-land boundaries and marshes read immediately as cartographic ink work when given concentric shoreline ripple lines (`alpha` decaying with distance from shore) and clustered reed/canopy silhouettes.
2. **Strategy HUD Ergonomics (*Civilization VI/VII*, *Frostpunk 2*, *Victoria 3*)**:
   - **Edge-Pinned Instrument Frame**: Keep the central 75%+ of the viewport completely clear for the map. Top telemetry bar (`48px`), left council rail (`56px` collapsed), right context drawer (`360px`), and bottom turn dock (`64px`) form an unobtrusive frame.
   - **Progressive Disclosure**: Primary bars show at most 3 data points per element (Icon + Current Value + Signed Preview Delta). Formulas, breakdowns, and historical logs open on hover/pin (`ui/tip.js`) or in dedicated modal sheets.

---

## 2. Design System (`spielbrett/css/tokens.css`)

### 2.1 Color System (OKLCH Token Architecture)

All colors are defined in perceptual OKLCH space so lightness (`L`) and chroma (`C`) steps guarantee WCAG AA/AAA contrast across dark slate surfaces and warm cartographic parchment accents.

#### Surface Hierarchy (Slate & Obsidian Workshop)

| Token | OKLCH Value | Role & Usage |
|---|---|---|
| `--bg-abyss` | `oklch(0.14 0.015 160)` | Deepest canvas backdrop behind unexplored fog of war |
| `--bg-canvas` | `oklch(0.18 0.018 160)` | Explored map margin and outer frame background |
| `--bg-panel` | `oklch(0.21 0.016 158 / 0.94)` | Primary HUD bar surface (top bar, bottom turn dock, context drawer) |
| `--bg-elevated` | `oklch(0.25 0.018 158)` | Cards, action slots, council medallions, and dialog surfaces |
| `--bg-interactive` | `oklch(0.29 0.022 158)` | Hover/active state for interactive cards and slot pills |
| `--bg-glass` | `oklch(0.19 0.016 158 / 0.86)` | Floating map controls, minimap frame, and translucent overlays |

#### Ink & Text Hierarchy (Mineral Bone & Parchment)

| Token | OKLCH Value | Contrast vs `--bg-panel` | Usage |
|---|---|---|---|
| `--ink-primary` | `oklch(0.93 0.022 85)` | ~13.4 : 1 (AAA) | Primary titles, active numbers, selected names |
| `--ink-secondary` | `oklch(0.77 0.024 85)` | ~7.8 : 1 (AAA) | Body copy, action descriptions, secondary labels |
| `--ink-muted` | `oklch(0.62 0.020 85)` | ~4.6 : 1 (AA) | Metadata, keyboard shortcut hints, empty-slot labels |
| `--ink-map-label` | `oklch(0.95 0.028 82)` | High-contrast | Cartographic region and settlement labels on canvas |
| `--ink-map-halo` | `oklch(0.15 0.015 160 / 0.88)` | Shadow halo | Outer stroke halo for map typography |

#### Semantic & Material Accents (Brass, Sage, River Blue, Ember)

| Token | OKLCH Value | Semantic Role |
|---|---|---|
| `--accent-brass` | `oklch(0.76 0.125 78)` | Primary active decision, selected hex ring, ready End-Turn CTA |
| `--accent-brass-dim` | `oklch(0.48 0.075 78 / 0.45)` | Subtle brass bevel border on active panels and medallions |
| `--accent-sage` | `oklch(0.73 0.110 152)` | Positive resource delta, high loyalty, safe probe margin |
| `--accent-river` | `oklch(0.68 0.115 235)` | Research budget, river/trade layer highlights, information cues |
| `--accent-amber` | `oklch(0.78 0.145 72)` | Warning state, pending world roll, contested border |
| `--accent-ember` | `oklch(0.65 0.185 28)` | Negative delta, blocker issue, threat layer, low loyalty |

#### Cartographic Biome Palette (Harmonized Natural Pigments)

| Biome ID | Base Fill Token | Value | Cartographic Character |
|---|---|---|---|
| `wasser` / `kueste` | `--terrain-wasser` | `oklch(0.32 0.058 232)` | Deep bathymetric slate-blue with bright `oklch(0.56 0.065 225)` coastal shallows |
| `auen` | `--terrain-auen` | `oklch(0.46 0.068 148)` | Lush alluvial river-meadow green with warm silt undertone |
| `grasland` | `--terrain-grasland` | `oklch(0.50 0.072 132)` | Sunlit olive-meadow ochre-green |
| `wald` | `--terrain-wald` | `oklch(0.39 0.066 152)` | Deep canopy pine-and-oak forest green |
| `sumpf` | `--terrain-sumpf` | `oklch(0.38 0.048 168)` | Brackish reed-and-peat teal-olive |
| `heide` | `--terrain-heide` | `oklch(0.49 0.064 82)` | Dry gorse, heather, and wind-swept ochre |
| `huegel` | `--terrain-huegel` | `oklch(0.47 0.056 68)` | Warm umber foothills with directional relief shading |
| `gebirge` | `--terrain-gebirge` | `oklch(0.41 0.026 60)` | Granite ridge grey-brown with high-contrast snow/scree crest lines |
| `steppe` / `oedland` | `--terrain-oedland` | `oklch(0.53 0.068 74)` | Sun-baked salt pan and arid sandstone |

### 2.2 Typography & Scannable Hierarchy

| Tier | Token | Stack | Typographic Rules |
|---|---|---|---|
| **1. Diegetic World** | `--font-world` | `'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif` | Used for `#volk-name`, `#k-titel`, dialog headers, and Canvas province labels. Region labels on the map render in italic serif with `letter-spacing: 0.06em` and small-caps feel. |
| **2. Tactical UI** | `--font-ui` | `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif` | Used for buttons, order chips, tooltips, and council activities. Line length capped at `60ch` in prose cards. |
| **3. Telemetry & Math** | `--font-nums` | `var(--font-ui)` with `font-variant-numeric: tabular-nums` | Mandatory on `.res-wert`, `.res-delta`, `.rat-fuehrung`, `.rat-loyalitaet`, `#budget`, and probe odds so columns never jitter on preview updates. |

### 2.3 Spacing, Borders & Elevation

- **Base Grid**: `4px` spatial unit (`--sp-1: 4px`, `--sp-2: 8px`, `--sp-3: 12px`, `--sp-4: 16px`, `--sp-5: 24px`).
- **Frame Geometry**: Sharp architectural precision (`--radius-sm: 4px`, `--radius-md: 6px`, `--radius-pill: 999px`). Avoid bloated `16px+` SaaS card rounding.
- **Hairline Bevels**: Panels use a dual-border effect (`1px solid var(--border-subtle)` outer edge + `inset 0 1px 0 oklch(1 0 0 / 0.06)` top highlight) that evokes fitted slate and brass instruments without heavy drop shadows.

---

## 3. Cartographic Rendering Specification (`spielbrett/js/map/`)

The Canvas 2D map (`renderer.js`, `terrain.js`, `palette.js`) is upgraded from a blurred hex grid to a 5-pass procedural cartographic illustration cached on `terrainCanvas`.

```
+-------------------------------------------------------------------------+
|                    OFF-SCREEN TERRAIN CACHE (5 PASSES)                  |
|                                                                         |
|  Pass 1: Crisp Hex Base Fill + Seeded Per-Tile Micro-Variation          |
|          (L +/- 0.018, C +/- 0.008 via deterministic tile hash)         |
|                                  |                                      |
|  Pass 2: Biome Transition Feathering & Inner Relief Vignette            |
|          (Radial gradient per hex: sunlit NW rim, shaded SE slope)      |
|                                  |                                      |
|  Pass 3: Coastline Double-Ripples & Wetland Water Mirrors               |
|          (2 concentric shore lines on water-land edges; marsh pools)    |
|                                  |                                      |
|  Pass 4: Tapered Hydraulic Rivers & Road Splines                        |
|          (Outer bank casing + inner water channel scaled by flow order) |
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
|  - Serif Cartographic Labels (Collision-checked, curved/tracked)        |
+-------------------------------------------------------------------------+
```

### 3.1 Pass 1 & 2: Crisp Hex Fill & Directional NW Relief Shading

- Remove the `ctx.filter = blur(...)` smudge pass in `renderer.js` (`drawTerrainCache`).
- Each hex is filled crisply using its biome base color shifted by a deterministic hash `hash2(q, r)` (`dL = (h - 0.5) * 0.032`).
- Apply a subtle directional linear gradient from Northwest (`315deg`, `oklch(1 0 0 / 0.05)`) to Southeast (`135deg`, `oklch(0 0 0 / 0.08)`) inside each hex, plus a faint inner hex rim (`lineWidth = 1`, `oklch(0 0 0 / 0.14)`). This gives every tile immediate physical tactility while keeping hex boundaries readable without an artificial neon grid.

### 3.2 Pass 3: Coastline Ripples & Marsh Water Mirrors

- Where a `wasser` or `kueste` hex meets a land hex, stroke two parallel shoreline contour lines inset into the water side (`inset1 = 0.08 * s`, `inset2 = 0.16 * s`) in `oklch(0.78 0.045 220 / 0.35)` and `0.18`.
- In `sumpf` and `auen` tiles, draw 2–3 horizontal water-mirror ellipses (`oklch(0.55 0.06 225 / 0.28)`) beneath the reed tufts so wetlands visually echo the river delta.

### 3.3 Pass 4: Tapered Hydraulic Rivers with Bank Casings

- Replace the uniform `s * 0.11` stroke in `drawRivers()` with a two-pass river renderer:
  1. Compute a deterministic flow rank `flowRank` (`1..3`) per river edge based on connected river edges.
  2. **Outer Bank Casing**: Stroke the quadratic curve at `width = s * (0.15 + 0.03 * flowRank)` in a dark alluvial bank tone (`oklch(0.26 0.03 160 / 0.75)`).
  3. **Inner Water Channel**: Stroke the same curve at `width = s * (0.09 + 0.025 * flowRank)` in `--map-river`, followed by a `0.03 * s` specular highlight thread along the center (`oklch(0.82 0.06 225 / 0.45)`).
  4. **River Confluences & Estuaries**: At vertices where 2+ river edges meet or enter `wasser`/`kueste`, draw a smooth round cap matching the inner channel width so segments never show gaps or sharp elbows.

### 3.4 Pass 5: Rich Cartographic Terrain Marks (`spielbrett/js/map/terrain.js`)

Upgrade `drawTerrainMark(ctx, terrain, x, y, s)` from primitive geometry to hand-inked cartographic motifs:

- **`gebirge` & `huegel`**: Draw interconnected ridge spines with **directional slope hachures**: the NW slope receives bright highlight facets (`oklch(0.88 0.02 85 / 0.35)`), while the SE shadow slope receives 5–7 parallel hachure strokes (`oklch(0.18 0.02 60 / 0.55)`) tapering down the flank.
- **`wald`**: Draw 5–7 clustered tree crowns sorted back-to-front (`y` ascending), each with a dark drop shadow on the ground, a deeply scalloped 3-lobe canopy silhouette, and a warm NW sun highlight crescent.
- **`auen` & `sumpf`**: Draw curved alluvial channel lines, shimmering water-mirror lines, and asymmetric clusters of cat-tail reeds (`Typha` stalks with dark seed heads) and willow shrubs.
- **`grasland` & `heide`**: Draw wind-swept grass contour arcs and stippled heather clusters in three depth planes rather than 3 vertical ticks.

### 3.5 Foreground: Single-Stroke Borders & Cartographic Typography

- **Region Borders (`drawRegionBorders`)**: Deduplicate shared edges between regions `(regionA, regionB)` so each boundary edge is stroked once along the exact hex edge (with a soft `lineJoin = 'round'`), flanked by a `3px` asymmetric inner tint on each region's side (`oklch(from var(--accent-brass) l c h / 0.18)` for the player's realm, neutral slate for unowned regions).
- **Region Labels (`drawRegionLabels`)**: Render province names in `italic 600 ${fontSize}px var(--font-world)` with tracked letters (`ctx.letterSpacing = '0.05em'` where supported) and a soft curved baseline banner or halo so labels read like an engraved atlas rather than a debug overlay.

---

## 4. Layout, HUD Ergonomics & Component Architecture

```
+------------------------------------------------------------------------------------+
| [Volk & Lebensweise] [Season/Year] | [Nahrung] [Material] [Wissen] | [Dest] [Menu] | <- 48px Top Bar
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
|        |                                                          |                |
|        |  +---------------+                                       |                |
|        |  | Minimap &     |                                       |                |
|        |  | Layer Pills   |                                       |                |
|        |  +---------------+                                       |                |
+--------+----------------------------------------------------------+----------------+
| [Haupt 1/1] [Neben 1/2] [Forschung: Futterpontons +3] | [Order Chips] | [Zug Ende] | <- 64px Turn Dock
+------------------------------------------------------------------------------------+
```

### 4.1 Scroll-Free Bottom Turn Dock (`spielbrett/js/ui/leiste.js`, `spielbrett/css/brett.css`)

#### Eliminating the Duplicate Research Entry
- Currently, when the player selects a research target (`research.assign`), `renderBudget()` displays the active research target and progress inside the `#budget` research pill (`[data-forschung]`), **and** `renderOrders()` also renders a full `<li>` order chip (`Forschungsziel wählen · Schilfgedeckte Futterpontons`) inside `#befehle`.
- **Specification**:
  1. In `leiste.js` (`renderOrders`), filter out orders where `o.type === 'research.assign'` from the `#befehle` chip list whenever the `#budget` research pill (`[data-forschung]`) is rendered, **or** render a compact inline `×` clear button directly inside the `[data-forschung]` budget pill (`[data-order-id]` preserved on the pill or its remove control for test compatibility).
  2. To preserve 100% compatibility with existing unit and E2E tests that query `#befehle [data-order-id]` or click `[data-forschung]`, keep `research.assign` in `#befehle` **only** if no `[data-forschung]` pill is active, OR style `[data-order-id^="research.assign"]` in `#befehle` as a compact icon-only clear/inspect badge (`max-width: 32px`) when `[data-forschung]` already displays the title, while capping `.zugleiste` items with `min-width: 0; text-overflow: ellipsis` so the bar never overflows horizontally.
  3. Even simpler and cleaner: keep `[data-order-id]` in `#befehle` for every order, but give `.zugleiste` a responsive 3-zone grid (`grid-template-columns: auto minmax(0, 1fr) auto`) where `#befehle` uses compact single-line chips (`max-width: 220px`, truncated with `text-overflow: ellipsis`, full text on hover tooltip) and `overflow-x: auto; scrollbar-width: none` (hidden scrollbar track with subtle fade mask if 4+ orders exist). And in `researchBudget(api)`, show the compact progress (`+3 · 3/20`) without repeating the full 35-character achievement title when the order chip already names it (or vice versa: show the achievement name once in `[data-forschung]` and show only the slot icon + short label in `#befehle`).

#### Bottom Bar Layout Contract
- `.zugleiste` height: `60px` desktop, `auto` on narrow screens (`<= 900px`).
- Zone 1 (`#budget`): Main slot pills (`Haupt 1/1`), Minor slot pills (`Neben 1/2`), and the Research pill (`[data-forschung]`).
- Zone 2 (`#befehle`): Active `main` and `minor` order chips (`flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none`). Each `.befehl` chip has `max-width: 240px`, `white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis` on `.befehl-text`, so long German descriptions never force a browser scrollbar.
- Zone 3 (`.zug-abschluss`): World roll pill (`#welt-ereignis`), blocker badge (`#zug-probleme`), and primary brass CTA (`#zug-ende`).

### 4.2 Council Medallions (`spielbrett/css/rat-leiste.css`, `spielbrett/js/ui/rat-leiste.js`)

- Transform each `.rat-mitglied` in the collapsed left rail from a cramped `32px` circle + loose numbers into a structured **Medallion Card (`52px` wide, `64px` tall)**:
  - **Avatar Medallion (`38px × 38px`)**: Circular brass-rimmed portrait badge with role-tinted radial background (`weisen` = deep indigo-blue, `aeltesten` = warm amber-ochre, `spaeher` = forest sage) and crisp serif monogram (`MV`).
  - **Bottom Micro-Badge Row**: Below the medallion sit two distinct, non-overlapping micro-pills (`font-size: 0.68rem`, `tabular-nums`):
    - `.rat-fuehrung`: Neutral slate badge (`+4`) indicating probe leadership bonus.
    - `.rat-loyalitaet`: Semantic loyalty pill (`+1` in sage green, `0` in bone, `-1` in ember red).
  - **Expanded Rail (`248px` wide)**: Clicking the toggle or hovering shows the full member name (`Maren Vance`), role title (`Stimme der Weisen`), and current turn assignment (`Frei` / `Führt Probe`).

### 4.3 Automatic Language Synchronization & Landscape Toponyms

1. **Campaign Language Sync (`spielbrett/js/main.js`)**:
   - When `createGame(campaignId, ...)` finishes its initial load (`game.ready`), inspect `game.view?.settings?.language`.
   - If the user has not explicitly picked a language override in `localStorage` (`localStorage.getItem('realmcraft.lang.explicit') !== '1'`) and `game.view.settings.language` is `'de'` or `'en'` and differs from `getLanguage()`, call `setLanguage(game.view.settings.language, { persist: false })` and re-run `applyStatic(document)` + `refreshUI()`.
   - When the user manually changes the language in the Settings dialog, set `localStorage.setItem('realmcraft.lang.explicit', '1')`.
2. **Setting-Aware Toponyms (`engine/creation/realm.js`)**:
   - In `landscape(world, draft, lang)`, select `welt.names` according to `draft.landscape` (`riverlands`, `highlands`, `drylands`) and `lang` (`de`, `en`):
     - **`riverlands` (`de`)**: `prefix: ['Schilf', 'Wehr', 'Flut', 'Schlick', 'Auen', 'Fähr', 'Siel', 'kiel']`, `suffix: ['delta', 'werder', 'furt', 'wasser', 'bruch', 'ufer']`
     - **`highlands` (`de`)**: `prefix: ['Nord', 'Süd', 'Klar', 'Stein', 'Weiden', 'grat', 'Firn', 'Kamm']`, `suffix: ['hain', 'fels', 'grund', 'tal', 'wacht', 'höhe']`
     - **`drylands` (`de`)**: `prefix: ['Salz', 'Dorn', 'Staub', 'Ocker', 'Glut', 'Wüsten', 'Klippen', 'Wind']`, `suffix: ['senke', 'pfanne', 'kamm', 'brunnen', 'öd', 'steppe']`
   - Ensure deterministic index mapping so existing tests that expect valid non-empty strings continue to pass.

---

## 5. Design Rationale & Anti-Bloat Guardrails

| Temptation / Anti-Pattern | Why It Fails in RealmCraft | Enforced Alternative |
|---|---|---|
| Blurring hex fills to fake smooth terrain | Turns crisp vector geometry into muddy low-res blobs that clash with sharp SVG icons. | Crisp hex polygons with subtle NW-to-SE directional lighting gradients and multi-layered vector terrain marks. |
| Duplicating queued research in both `#budget` and `#befehle` | Wastes 320px of horizontal space in the bottom bar and triggers an ugly native scrollbar. | Single rich research pill in `#budget` plus compact truncated order chips in `#befehle` with `scrollbar-width: none`. |
| Heavy drop-shadows and glassmorphic blur on every card | Degrades Canvas 2D frame rate and looks like a generic SaaS template. | High-contrast OKLCH slate surfaces (`0.21` vs `0.25`) separated by `1px` brass/slate hairline bevels. |
| External raster tile sheets or webfont CDN calls | Breaks offline local execution and no-build architecture. | Pure procedural Canvas 2D (`Path2D`, seeded PRNG `hash2`) and local/system font stacks (`Palatino` + `Inter`). |

---

## 6. Verification Checklist

1. **Automated Test Suites**:
   - `npm test` (all unit tests in `tests/unit/`, including `spielbrett-ui.test.js`, `spielbrett-map.test.js`, and `creation-realm.test.js`).
   - `npm run test:acceptance` (all acceptance tests in `tests/acceptance/`).
   - `npx playwright test tests/e2e/planning-entry.spec.mjs` (browser verification of planning entry, slots, council compact mode, and world status).
2. **Visual & Interactive Acceptance on Live Campaign (`realm-b82095f182c1443a92147158083a1102`)**:
   - Bottom turn bar shows zero horizontal scrollbars at `1280×800` and `1920×1080`.
   - Map renders crisp hex relief, tapered rivers with dark bank casings, coastline ripples, multi-crown forest groves, reed marshes, single-stroke region borders, and italic serif province labels.
   - Council rail medallions display non-overlapping lead (`+4`) and loyalty (`+1`) badges.
   - Campaign opens with consistent German UI chrome matching `settings.language = "de"`.

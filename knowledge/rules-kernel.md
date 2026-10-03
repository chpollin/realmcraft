---
title: Rules Kernel
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: complete
language: en
created: 2026-10-03
updated: 2026-10-03
authors: [Christopher Pollin]
generated-with: Claude Code (Claude Opus 5.5)
related: [game-design, data-contracts, world-packages, architecture, agents-harness, glossary]
---

# Rules Kernel

The binding rules of RealmCraft as the deterministic kernel under `engine/` executes them. The code is authoritative. Every constant lives in `RULES` of `engine/core/rules.js` (bound to `RULES_VERSION`), in the optional `tuning` of the world's `regeln.json` read through `tune()`, or in `WEIGHTS`, `SPEC_WEIGHTS` and `TIERS` of `engine/schemas/effects.js`. This document names constants by their key and quotes values only where they define a rule. The intent behind the rules is in [game-design.md](game-design.md), the file formats in [data-contracts.md](data-contracts.md). Code comments that cite "Regelkern section N" refer to the section of the same number here.

## 1 Principles

1. One state, one truth. Only `engine/cli.mjs` writes `state.json`. Views, tasks and chronicle are derived from it or are proposals to it ([decisions.md](decisions.md), D10).
2. Every number comes from a rule. All values are integers. Every random draw comes from the stored sfc32 generator (`state.rng`) or from an openly reported player roll. Narration never sets a value.
3. Everything within a turn reads the opening state `S0`. Costs are checked against the opening stock, and whatever a turn adds acts from the next turn (`effectiveFrom = turn + 1`). Therefore all probes of a turn are independent and can be rolled in any order.
4. Equal treatment. Player and AI peoples share state shape, order catalogue, content budget, proposal limits and fog. Only `controller` tells them apart.
5. Origin. Every state change writes a log entry with source, turn, target, change and reason through `engine/core/log.js`, the only sanctioned way to change state (section 15).

## 2 World package and campaign

A campaign pins its world package by hash in `world.lock.json`. The map is never stored, tiles are a pure function of `map.seed` and the pinned `welt.json`. A changed world package refuses every transition until `repin` validates the package and pins the campaign to it ([operations.md](operations.md)). Package contents are described in [world-packages.md](world-packages.md).

## 3 State

The state shape is the schema `campaign` in `engine/schemas/campaign.js` ([data-contracts.md](data-contracts.md)). Every people has exactly the same shape. The content validator checks what the schema cannot express. Every ref exists, tile keys lie in their region, resource keys exist in `regeln.json`, there is exactly one leader per council and the way of life of a people is a known development.

Core values every world carries ([decisions.md](decisions.md), D22) are Nahrung, Material, Wissen, Volk (`population.core`) and Zustimmung (`meters.zustimmung`). Stats are computed on demand from `regeln.json/stats` plus `stat.mod` and clamped to −2..+3. `derived` is recomputed on every write, is never input to a rule and stays out of the state hash.

## 4 Map

Regions from `engine/world/regions.js` are the unit of control, yield and settlement, tiles carry terrain, movement cost, sight and buildability from `welt.json` ([decisions.md](decisions.md), D2). A region has at most one controller. A people gains control by a settlement in it, by conquest, by `region.control`, or by presence when its units alone stand in an uncontrolled region without settlement. A camp that moves on keeps its region as grazing hold for `campHold` turns.

`known` holds per people and tile `seen` or `visible`. After each season every tile fades to `seen`, then settlements (`settlementSight`) and units (`unitSight`) reveal their radius, extended by `sight.mod`. `seen` shows terrain and fixed features, `visible` also foreign units and settlements. Features are places on tiles (sources, ruins, shrines, roads) stored in `map.features`, at most one per tile. Features generated from deposits are derived from the seed and not stored. The world agent may add a feature on a tile no people knows, far enough from every settlement and within the budget.

Movement, reach and routes use road-aware step costs in half steps. A tile costs its terrain `moveCost × 2`, a road tile 2 less per road level, never below 1, and impassable terrain stays impassable.

## 5 Orders

Each people has one draft per turn, `drafts/<people>.json` (schema `draft`). Beside `orders` it carries `assign` (labour), `choices` (answers to open event decisions), `venture` and `lead` (order id to venture flag or leading council member), `mandate` (order id to `decree`), `rolls` and `withdrawn`. A draft is stale only when its `turn` differs from the state.

The base slots are `tuning.slots` of the world (Hochland one main and two minor actions per turn) and grow by `order.slot`. Orders of slot `free` take no slot. The catalogue of a people holds the core orders and the orders of its active modules, locked orders only after an `order.unlock`. Every main order carries the tag `befohlen` in addition to its own tags.

| Type | Owner | Slot | Probe | Effect |
|---|---|---|---|---|
| `research.assign` | core | free, once per draft | none | puts an open candidate or a running project first on the research list |
| `research.direct` | core | free | none | research request with one to three tags and a note |
| `build` | core | main | target 5, tag `bau` | a known building is built in an own settlement on a fitting terrain, within `spec.perRegion` |
| `found` | core | main | none | new settlement of the way of life, costs `RULES.foundCost` |
| `institute` | core | main | none, council | an institution takes effect from the next turn |
| `explore` | core | minor | target 5, tag `erkundung` | tiles around the target become known |
| `road`, `road.pave` | core | main | none | road tiles of level 1, or one level more, locked until unlocked by a path development |
| `machtprobe` | core | first free, further ones main up to `machtprobeCap` | target 5 | section 7 |
| `talk` | core | free | none | only `honor` and `honor-dead` set values |
| `destiny.adopt` | core | main | none, council | section 13 |
| `migrate` | lebensweise | main | target 3, winter 5, tag `zug` | the camp moves, control follows |
| `adopt` | lebensweise | main | target 6, tag `wandel` | change of way of life over two turns |
| `recruit` | militaer | minor, limited per turn by clans | none | unit ready from the next turn |
| `move`, `retreat` | militaer | minor | none | movement along a path |
| `attack`, `ausfall`, `raubzug` | militaer | main | yes | battle, sortie, raid (section 11) |
| `trade.offer`, `trade.market` | handel | minor | none | offer to a partner, exchange at market price |
| `trade.accept`, `trade.cancel` | handel | free | none | contract from the next turn, breach |
| `discipline.use` | magie | from the application | from the application | outcomes of the application |

A venture (`draft.venture`) turns a main order without probe into a probe with target `RULES.ventureTarget` and raises the target of an order with probe by 1. A failed venture brings no effect and its costs are spent.

`preview(state, env, draft, { as })` in `engine/core/turn.js` is pure and changes neither state nor RNG. It works on `projectFor(state, env, as)`, so the browser calls the same function on the view file. It returns the issues, the probes with target, modifiers and chance, the costs, slots and labour of the draft, a row per order, the council votes, the economy forecast per store, the order catalogue, unresolved items and the certain council consequences per order (loyalty per member and meters such as Zustimmung, with `depends` where a probe decides). Affected tiles are not yet part of the preview. At `seal` and `apply` the kernel recomputes everything on the full state.

## 6 Probes

A probe is 1d10 plus modifiers against a target from 3 to 8. With margin `m = roll + mod − target` the bands are these.

| Band | Condition |
|---|---|
| `crit_success` | natural 10 or `m >= 4` |
| `success` | `1 <= m <= 3` |
| `narrow` | `m = 0` |
| `failure` | `−3 <= m <= −1` |
| `setback` | `m <= −4` |
| `crit_fail` | natural 1 |

`narrow`, `success` and `crit_success` count as success. The player sees `P = clamp((11 − target + mod) / 10, 0.1, 0.9)` before the roll. Each modifier is clamped to ±2, modifiers from developments add up to at most +3, the total is clamped to ±4, and every cut is listed with its reason and raises the warning `softcap`. Fixed modifier sources are the nature of the people (+2 on a probe tag of `wesensart.plus`, −2 on `wesensart.minus`), the leading council member (+1 at loyalty `RULES.leadLoyalty` or more, −1 in old age, −2 when frail), statuses and the terrain or stats a probe kind names.

The player rolls for every probe of the own people and for its world event. The kernel draws all other probes from sfc32 in probe-id order. A roll sits in the append-only ledger `rolls.json` under its probe id (`T<turn>:<people>:<order id>`, for the world event `T<turn>:<people>:event`) with the fingerprint of the probe. The fingerprint covers everything the roll was made against, so a later change makes it stale (`roll_stale`). A probe keeps the first value rolled for its fingerprint, and a roll whose probe left the draft is listed as withdrawn and logged. Only natural rolls fire the hooks `crit_success:<tag>` and `crit_fail:<tag>` and open tokens. A natural 10 on a venture opens a `breakthrough` token, a natural 1 a `crisis` token.

## 7 Council and rule

An order needs a council vote when its tags meet `scopeTags` or its type is in `scopeOrders` of the people's `governance.rule`. Votes are deterministic. A member at loyalty −4 or below votes no. Otherwise a member votes no when the order's tags meet its opposed tags, yes when they meet its favoured tags (oppose decides when both meet), and without a match yes at loyalty 0 or above. The rule `leader` passes every order, `council` needs a simple majority and `assembly` two thirds. Machtprobe and talk never need the council.

Without majority the order is rejected unless the draft decrees it. A decree costs every no-voter 1 loyalty, opens a `grievance` token for a member at the breaking point and lowers Zustimmung by 1. An executed council order gives +1 loyalty to members whose favoured tags meet its tags and −1 to those whose opposed tags do. From all sources together a member's loyalty changes by at most `RULES.loyaltyPerTurnCap` per turn. Loyalty lies in −5..5. In winter a devoted member (loyalty 4 or more) loses 1 when no executed order served its favoured tags during the past year, and a world may add a flat winter decay with `tuning.loyaltyDecay`. Hollow loyalty (`loyalty.bind`) counts like ordinary loyalty, but every winter the kernel rolls a `hollow` probe for each hollow member (target `hollowTarget`, +1 at loyalty 3 or more). On a failure the member betrays the people, its loyalty is set to −2 and the bond ends.

The Machtprobe has target 5 and the aims `override` (a rejected order runs without decree costs), `rally` (status `sammlung` with +1 on main-order probes next turn), `reconcile` (one member +1) and `quell` (removes the oldest grievance). A `crit_success` also gives the lasting status `autoritaet` and an `impulse` token, a `success` costs the named opponent 1 loyalty and gives an `impulse` token at margin 2 or more. A `narrow` result reaches the aim but costs the opponent 1 and every other member below 0 another 1, a `failure` costs the same without reaching the aim, and a `setback` or `crit_fail` costs the opponent 2 and opens a `crisis` token.

The talk `honor` raises a member below 0 who is not bound hollow by 1, once per member and year. `honor-dead` is possible in the season after a death and raises all members by 1. In winter all council members age by one year. From `ageLebensabend` a member enters old age and from `ageHinfaellig` frailty, and members in these stages take a life roll. Death opens a seat for the council agent. When the leader dies the most loyal member leads, standing halves and loyalty is capped at `successionLoyalty`.

## 8 Economy and research

### Labour and harvest

Each controlled region offers `RULES.slotsPerRegion` work slots. Each clan assigned to a resource works one slot and harvests the best base yield of the region's land once, where the land is the dominant terrain plus, in a region with an own settlement, the terrains of the settlement tile and its neighbours. Base yields come from `welt.json` (Holz and Stein fold into Material), scaled by the world's `yieldFactor` per terrain, season and resource plus `yield.mod`, never below 0. Groups are placed greedily, resources in world order, each into the free slot with the highest yield. A clan assigned to `research` yields research points, `hueten` and `adepten` are read by their modules. Without a new assignment the previous one stays.

### Order of a season's economy

The season of a people is planned by `planEconomy`, which the preview shares, and resolved in this order.

1. Gains, capped before losses so that a surplus cannot cushion consumption. Harvest, deposits near settlements, features of worked regions, `knowledgePerSettlement` Wissen per settlement and positive `resource.flow`.
2. Consumption of food per clan by the way of life's `spec.consumption` for the season.
3. Upkeep, oldest development first. Developments, buildings and units are paid whole or not at all. An unpaid development is suspended and lost after `tuning.lossAfter` turns, an unpaid building stands idle, an unpaid unit loses strength. Way of life flows, status and building flows and dependencies are paid as far as possible and the rest is shortfall. An unpaid dependency triggers its penalty.
4. Famine. Missing food costs one clan per `famineDivisor` missing (rounded up) and lowers Zustimmung by 1.
5. Growth. Without famine the people gains `baseGrowth` plus `population.growth` points, `growthPerClan` points make a clan while the clan capacity allows (`popCapPerSettlement` per settlement plus `population.cap`). A winter without famine raises Zustimmung by 1.

Every stock has a cap from `regeln.json` plus `stock.cap`. At cleanup a stock above its cap loses part of the surplus by `tuning.spoilage`. Herds grow on controlled regions whose dominant terrain is a pasture terrain of the way of life and shrink in winter by its `herdRules` (module Lebensweise).

### Research

A people researches the first project of `developments.research`. Each season the project gains `researchBase` plus labour on research plus `research.mod` of standing effects whose tags the project shares plus up to `tuning.knowledgeSpend` Wissen burned from stock. The effective cost is `cost.research + floor(cost.research × n / complexityDivisor)` for `n` known developments, halved for a breakthrough candidate, within 1..`maxProgress`. When progress reaches the cost and the one-off resource cost is at hand, the development becomes known and acts from the next turn. `replaces` ends the developments it names, and `onAcquire` applies once.

The open tier of a people is the highest tier of `TIERS` whose gate is met by known developments of the tier below, clans, settlements and world year. Candidates expire after `candidateLife` turns unless under research. Tokens `breakthrough`, `impulse` and `crisis` expire after `tokenLife` turns, a grievance stays until quelled.

The practice ledger keeps, per turn, the tags of executed orders weighted by slot (main 2, minor 1) plus 1 for a successful probe, for the last eight turns. Its three strongest tags are the practice tags. Without agents `open` offers world pool developments whose practice tags and tags overlap the practice tags, whose prerequisites hold and whose tier is open, ranked by overlap and id, within `tuning.limits`. Agent candidates use the same limits. Diffusion between peoples, planned in the first design, is not implemented.

From M1 research is organised in six paths with tiers and research points from Wissen ([decisions.md](decisions.md), D16). The binding rules of the paths model are fixed in [plan-m1.md](plan-m1.md).

## 9 Developments and primitives

A development (`entwicklung`) is the one generic content object. Its effects and price consist only of primitives of the canonical set in `engine/schemas/effects.js`, standing primitives in `effects`, `price` and statuses, one-off primitives in `onAcquire`, application outcomes, triggers, meter thresholds and event cards. Each subsystem reads the standing ops it owns (`engine/core/effects.js`). Narrative text has no effect. Kinds, `spec` per kind, the primitive list and the condition language are in [data-contracts.md](data-contracts.md). The first design limited standing institutions and doctrines to `2 + floor(core / 3)` with `replaces` above the limit. That limit is not implemented, `institute` only refuses an institution already in force and caps the list at 20.

## 10 Validator and power budget

`engine/content/validate.js` checks every development, event card, destiny, world package and proposal in stages, and `engine/content/budget.js` prices it with `WEIGHTS`, `SPEC_WEIGHTS` and `TIERS`. A development is valid when its effect stays within the tier's ceiling, its net value lies in the tier's range, its price reaches the tier's minimum and its research cost equals net value times tier plus one. Stages, codes and the refined weight rules are in [data-contracts.md](data-contracts.md).

## 11 Modules

A module is a DOM-free deterministic ES module registered in `engine/modules/index.js` with its own slices, orders, tags, hooks and views. A development with `module.activate` switches it on for a people, Lebensweise is always active. Without the activating development the module rests, its orders leave the catalogue and its slice is kept. New modules are code, never agent output (D10).

- Lebensweise. The way of life's `spec` sets settlement kind (`camp` or `village`), migration, consumption and herd rules. `migrate` moves the camp within `migrateRange`, and the region left behind keeps a grazing hold for `campHold` turns. `adopt` changes the way of life over two turns.
- Handel. Active with a development that binds the role `currency` (Salz in Hochland). Offers, contracts and a market with prices from 1 to 9 per traded resource. Trade range is measured in road-aware path cost up to `tradeRadius`.
- Magie. Active with a known discipline. `discipline.use` runs one application with costs from the opening stock, a probe from the application and outcomes per band as one-off primitives. An unpaid dependency on the source raises withdrawal, which costs on every application of that source.
- Militär. Active with a known unit development. Recruitment in an own settlement within limits per clan, movement by mobility times `movePointsPerMobility` steps, battle with attack strength `A` and defence `D` (units plus `garrison` of a settlement). The target is `5 + ratio step + terrain defence`, where the ratio step is −2 at `A >= 2D`, −1 at `2A >= 3D`, +2 at `2A <= D`, +1 at `3A <= 2D` and 0 otherwise. Losses follow the band, a conquered settlement changes owner and an attack without war sets war.

## 12 Events

Every people gets exactly one world event per season. The player rolls it during planning, the kernel draws it for AI peoples at `seal`. The raw roll maps to bands 1 to 5 by `tuning.eventBands`. In phase A the world agent proposes one card per people that fits the band and the people's situation. At resolution the kernel uses that card, or otherwise draws among the admissible cards of the band in the event pool, respecting `once`, `cooldown` and `maxPerCampaign`. Without a card nothing happens and the log says so. A card with options becomes an open decision in `pendingChoices`, answered in the next planning through `draft.choices`, and the first option applies when the deadline passes. The net weight of a card or of each option must fit its band ([data-contracts.md](data-contracts.md)).

Meters rise per season or per use and cross thresholds relative to their opening value. Triggers fire on the hooks `season`, `winter`, `war`, `contact`, `death`, `crit_success:<tag>`, `crit_fail:<tag>`, `shortfall:<res>` and `use:<order or application>`.

## 13 Destiny, victory and collapse

Every people has a Bestimmung (schema `bestimmung`) with three or four milestones. Each milestone is one predicate the kernel evaluates on the end-of-turn state, one of `controls`, `stat.atLeast`, `resource.atLeast`, `population.atLeast`, `relation`, `development.known`, `subjugated`, `settlement` and `holds` (an inner predicate true for a number of seasons in a row). A reached milestone locks. The first people with all milestones locked wins. When several reach it in the same season, the higher difficulty of the destiny wins, then the smaller id.

A switch needs the practice condition. The practice ledger must have entries for the last four turns, and none of them may meet a tag of the current destiny. Then up to two offers can be open, from the research agent (item `bestimmung`) or from the world pool at `open` by tag overlap with recent practice. Offers live `candidateLife` turns and never include the own destiny or one another people holds. `destiny.adopt` is a council order that needs the condition and a live offer, at most once per year (a people without destiny chooses freely). It costs 1 standing and 2 loyalty of every member whose favoured tags meet the old destiny's tags. The old destiny enters the history as `switched`, and the milestones of the new one count from the next season.

A people collapses when it has no settlement or when `population.core` falls below `tuning.collapseCore` (default 1). Collapse of the player people, or victory of another people, ends the campaign with `status: ended` and `result { winner, kind, turn, reason }`.

## 14 Phases and order of a season

| Phase | Entered by | What happens | Player |
|---|---|---|---|
| `planning` | `open` | drafts are open, pool candidates and pool destiny offers are made | plans, previews, rolls |
| `resolving` | `seal` | orders locked, missing AI drafts filled by the fallback policy, world event rolls of AI peoples drawn, the phase A task for the world agent written | waits |
| `agents` | `apply` | the season is resolved, the phase B tasks written | already plans the next turn |

A new campaign starts in turn 0 in phase `agents`. `seal` records a hash of every sealed draft in `state.sealed`, and `apply` resolves exactly those drafts or refuses with `tamper`.

`apply` reads `S0` everywhere and writes into a clone in this order (`tc.step`).

1. `orders`. Labour from `draft.assign` becomes `population.assigned`. Player rolls come from the drafts, kernel rolls from sfc32 in probe-id order. Machtproben are resolved first, because an override decides whether a rejected order runs. Then council votes and decrees are booked. Then the costs of every people are paid against the opening stock in a separate pass before any order runs, all or nothing per order (status `unpaid`). Then all other orders run, per people by slot (`free`, `main`, `minor`) and draft order.
2. `modules`. Every active module resolves in registry order `lebensweise`, `handel`, `magie`, `militaer`, then the global hooks.
3. `economy` (section 8).
4. `research` (section 8).
5. `military`. Unit states for the next turn, control by presence.
6. `vision`. Sight and known tiles.
7. `events`. Open decisions, world events, winter ageing and life rolls, succession, meters and triggers (section 12).
8. `council`. Served goals, winter decay, hollow loyalty.
9. `cleanup`. Stock caps, loss of long-suspended developments, expiry of candidates, tokens and requests.
10. `bestimmung`. Collapse, milestones, victory (section 13).
11. `finalize`. Derived values, report, views and tasks, `turn + 1`, `rev + 1`, phase `agents`.

Found, migrate and destiny adoption are re-checked at resolution on the full state, because the draft check ran on the projection. A founding blocked by a hidden owner returns its costs (`order.blocked`).

## 15 Event log and origin

Every state change, whether from resolution, an ingested proposal or a player decision, writes a log entry (schema `event`) with source (`kernel`, `player` or `agent:<id>`), turn, target, change, reason, refs, the season step and `visibleTo`. The entries of the last turns stay in `state.chronicle`, the full log of each turn in `log/T<turn>.json`. `visibleTo` names the peoples whose projection receives the entry. The board shows for every value its origin and lists the changes of the season.

## 16 Fog

`projectFor(state, env, people)` in `engine/core/project.js` is the only view a people and every agent working for it receives ([decisions.md](decisions.md), D9). It leaves out `rulesVersion`, `rng`, `eventPool` and `ingested`, keeps the full own people, shows foreign peoples in the `foreignPeople` shape with stocks only under a `reveal` of scope people, shows foreign units and settlements only on visible tiles, and filters log entries by their `visibleTo`. Module slices of other peoples never leave the kernel. The preview of a people contains no outcome of a foreign roll. Hidden conflicts, such as a founding in a region the projection did not show as taken, are decided at resolution.

## 17 Command line

`node engine/cli.mjs <command> [args] [--campaign <cid>] [--json]` is the only writer of campaign state. The root is `REALMCRAFT_ROOT` or the working directory.

| Command | Effect |
|---|---|
| `new <world> --seed <n> --as <template> --id <cid> [--from-state <file>]` | creates the campaign folder, places the peoples, turn 0 in phase `agents`, writes tasks |
| `status [--as <people>]` | phase, turn, season, stocks, open probes, tasks |
| `preview --as <people> [--draft <file>]` | preview as JSON. With a draft of the player people it also stores the draft and its rolls |
| `roll <probeId> <1-10>` | enters a roll with the current fingerprint and shows the calculation |
| `seal` | planning to resolving |
| `apply [--expect-rev <n>]` | resolves the season |
| `open` | agents to planning |
| `tasks [--agent <id>]` | writes missing task files of the phase and lists them, judge tasks on request |
| `ingest [<proposal file>] [--consent <proposalId>]` | ingests proposals |
| `validate <path> [--campaign <cid> or --world <id>]` | validates a world folder, development, card, destiny, proposal, draft or campaign |
| `budget <file>` | budget breakdown |
| `replay [--to <turn>]` | replays the journal from `new` or the latest anchor and compares hashes |
| `repin` | pins the campaign to the current world package |
| `schema <name>` | prints a schema |

Exit codes are 0 ok, 1 internal error, 2 rejected or invalid, 3 missing input, 4 phase, revision, world or tamper conflict and 5 replay mismatch. Every transition (`new`, `seal`, `apply`, `open`, `ingest`, `repin`) appends to the hash chain `log/journal.json`, a guard before each transition checks chain, state hash, library prefix, roll ledger and world hash, one campaign lock serialises transitions, rolls and stored previews, and an interrupted commit is rolled forward by the next transition ([architecture.md](architecture.md)).

## 18 Issues

Issues are plain data `{ code, severity, path, message }` from `engine/core/issues.js`, shared by kernel, validator and schema interpreter. Module codes carry their module id as prefix. Errors block `seal` and `apply`, warnings inform the board. Kernel codes include `finished`, `phase`, `stale`, `format`, `unknown_order`, `locked_order`, `slots`, `cost`, `labour`, `target`, `duplicate`, `restricted`, `council_rejected`, `roll_missing`, `roll_stale`, `view_stale` and `tamper` as errors and `free_slots`, `shortfall`, `softcap`, `upkeep_risk` and `idle_labour` as warnings. CLI codes carry the prefix `cli.`. M1 adds machine-readable reason keys with parameters to every issue, so the board never parses English text ([plan-m1.md](plan-m1.md)).

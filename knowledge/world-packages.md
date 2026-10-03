---
title: World Packages
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
related: [rules-kernel, data-contracts, game-design, glossary]
---

# World Packages

A world package under `welten/<id>/` carries everything that makes a world different, from generator and terrain to calendar, resources, stats, peoples, councils, tuning, AI profiles, labels, image style and the content from which the game draws developments, events and destinies ([decisions.md](decisions.md), D3). The kernel reads a package only through `engine/core/env.js`. Every file names its world id, so a file copied into the wrong package is caught. Hochland is the first and only package.

## Files

| File | Content | Validated by |
|---|---|---|
| `welt.json` | generator parameters (chunk size, elevation, moisture, temperature, thresholds), terrains with move cost, sight, buildability and base yields, deposits, start rules, name parts | `engine/world` |
| `regeln.json` | calendar, resources with value and cap, stats with base, tag vocabulary with breadth, people templates, council templates, `tuning`, AI profiles, module bindings | schema `regeln` |
| `labels.json` | every visible text by key, with `locale` | schema `labels`, `missing_label` for every view and module label key |
| `style.json` | image style and image types, accent tokens | schema `style` |
| `content/entwicklungen.json` | start endowment (tier 0) and world pool developments | schema `entwicklungen` plus the validator |
| `content/ereignisse.json` | event cards per band | schema `ereignisse` plus band budget |
| `content/bestimmungen.json` | start destinies and destinies for later switches | schema `bestimmungen` plus difficulty |

`node engine/cli.mjs validate welten/<id>` validates the whole package, including that every development is reachable from a start endowment and every label key exists.

## Pinning and repin

A campaign pins the package by hash in `world.lock.json` and in `state.campaign.world.hash`. The map is never stored, so a changed `welt.json` would change the world of a running campaign. Therefore a changed package refuses every transition (`cli.world_drift`, exit 4) until `node engine/cli.mjs repin --campaign <cid>` validates the package and pins the campaign to its new hash. `repin` refuses during `resolving`, logs `campaign.repin` with source `player`, writes an anchor under `anchors/` from which `replay` starts, and answers `changed: false` when nothing changed ([operations.md](operations.md)).

## Tuning

`regeln.json/tuning` is a closed object. Its keys are `maxTier`, `lossAfter`, `newMemberLoyalty`, `slots { main, minor }`, `limits` (candidates per turn, above the highest known tier, open candidates, module activations) and `expected` (counts the budget assumes for scaled flows), plus the optional kernel overrides `spoilage`, `loyaltyDecay`, `machtprobeCap`, `bestimmungBand`, `eventBands`, `terrainRules` (defence and yield factor per terrain and season), `knowledgeSpend`, `approval` and `featureYield`. A missing optional key falls back to `RULES` in `engine/core/rules.js`. `collapseCore` is read by the kernel but not yet accepted by the schema.

## Hochland

Hochland is a highland of lakes, moor, meadow, heath, forest, alpine pasture, mountain forest, mountains and peaks (terrain ids `see`, `moor`, `wiese`, `heide`, `wald`, `alm`, `bergwald`, `gebirge`, `gipfel`). The calendar has four seasons, Frühling, Sommer, Herbst and Winter, and starts in spring of year 1.

- Resources. The core resources Nahrung, Material and Wissen, the goods Herden, Erz and Salz, and the magic sources Psil and Opferkraft (`opfer`), which belong to the module Magie. Deposits on tiles such as iron ore, salt, game or peat fold onto these resources.
- Stats. Verteidigung, Mobilität and Wohlstand, each with base 0.
- Peoples. Bergnomaden (Hochvolk der Grauen Kämme), a nomadic people whose nature favours migration (`zug`) and resists building (`bau`), with the start destiny `ueberdauern`. Schädelklan, nomadic raider bands with the destiny `schaedeljoch`. Talbund, a settled trade league of the valley towns with the destiny `salzstrasse`. Each has its own council template.
- AI profiles. `raub` (raid and pass rule), `handel` and `weide`, each with a stance text and weights over tags.
- Module bindings. Handel binds its currency to Salz, Magie its source role to Opferkraft by default.
- Slots. One main and two minor actions per turn.

The content implements the developments of the worked path in [game-design.md](game-design.md). The start endowment holds the ways of life `nomadisch` and the institution `sippenrat`. The pool holds, among others, the way of life `sesshaft`, the techniques `filzjurten`, `saumpfad`, `strassenbau`, `salpetersieden` and `pulverwall`, the buildings `hochweide-terrassen`, `markt-am-pass` and `steinmauer`, the units `speertraeger` and `bergschuetzen`, the disciplines `rauchschau`, `bannfeuer` and `blutritus`, and the institutions `geleitrecht`, `schuldknechtschaft` and `schwarzer-zirkel`. The destinies besides the start destinies are `herr-der-paesse`, `uneinnehmbare-feste`, `herrschaft-der-schauenden`, `hegemonie` and `bund-der-taeler`.

## Paths from M1

M1 adds an optional `pfade` block to `regeln.json` with the paths of the world, their tags, an opening condition per path, the number of completed achievements that unlocks each path tier and a fallback path. A world without the block has no paths and researches as before. Hochland ships the six paths `nahrung`, `gemeinschaft`, `militaer`, `werk`, `erkenntnis` and `magie`, of which only `magie` waits for a practice condition, with `gemeinschaft` as fallback. The contract, the tag lists and the path tier rule are in [plan-m1.md](plan-m1.md). World labels gain a key `pfad.<id>` per path and English label files beside the German ones ([decisions.md](decisions.md), D16 and D17).

## Known content findings

The live judges and the budget review reported content issues that wait for the balance work of M1 ([plan-m1.md](plan-m1.md)).

- Herds do not grow in mountain regions. Herd growth counts only controlled regions whose dominant terrain is a pasture terrain of the way of life (`alm`, `wiese` and `heide` for nomads), plus one per two herding clans.
- Defence options are missing.
- Agent proposals lean towards exploration.
- The dark path (`blutritus`, `schuldknechtschaft`, `schwarzer-zirkel`) is too cheap, because some of its prices are avoidable or one-off but are counted like standing burdens.

## A second world

A second package is a new folder with the same files. It needs its own labels for every key the kernel and its activatable modules use, may bind module roles to its own resources and may override tuning within the schema. Everything outside the core resources is world data and handled generically by the kernel. Packages are validated as a whole before a campaign can pin them.

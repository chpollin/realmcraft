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
updated: 2026-10-04
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
| `labels.json` | every visible text by key, with `locale` | schema `labels`, `missing_label` for every kernel label key of `kernelLabelKeys()` in `engine/content/validate.js` (probe bands, loyalty bands, order types), and the content test of the package requires a text for every further label key the content implies |
| `style.json` | image style and image types, accent tokens | schema `style` |
| `content/entwicklungen.json` | start endowment (tier 0) and world pool developments | schema `entwicklungen` plus the validator |
| `content/ereignisse.json` | event cards per band | schema `ereignisse` plus band budget |
| `content/bestimmungen.json` | start destinies and destinies for later switches | schema `bestimmungen` plus difficulty |

`node engine/cli.mjs validate welten/<id>` validates the whole package, including that every development is reachable from a start endowment and every label key exists. `new` and `repin` run the same check and refuse a package that fails it.

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

## Balance of M1

The live judges, the budget review and the balance simulation (`npm run sim:balance`, [testing.md](testing.md)) reported content findings that the balance lane of M1 answered with a simulation before and after each change. The figures of a run live in the report under `tools/sim/out/`, not here.

- Seed achievements on every path. Under the path gate a path needs two achievements of tier 1 before it offers tier 2, and the original pool left Gemeinschaft and Erkenntnis without tier 1 and Werk and Militär with one each, so research stalled on the first tier. Every path now holds several tier 1 achievements and at least one of tier 2, and a path with tier 3 holds enough tier 2 achievements to unlock it. New achievements name their path in `pfad`, and so do `steinmauer` (Militär) and `schuldknechtschaft` (Gemeinschaft), which the tag mapping placed by a tie. A unit test checks the seed rule.
- Magic opens through practice. The `ahnenfeuer` building carries the tag `feuer`, so a people that builds it touches magic in its practice and the Magie path opens without a magic achievement.
- Herds in the mountains. Herd growth counts a region as pasture when its dominant terrain or the land around an own settlement in it is a pasture terrain, the rule the harvest already follows. Start camps stand on an alm, often inside a mountain region, and lost their herds before.
- Defence options. Militär offers `wachtfeuer` and `fluchtburg` on tier 1 beside `speertraeger`, and `steinmauer` and `bergschuetzen` on tier 2. Under threat the fallback recruits and builds defences first.
- The dark path. `blutritus` and `bannfeuer` paid their minimum price only on use or once, and `schwarzer-zirkel` counted its dependency twice. Under the budget rules of [data-contracts.md](data-contracts.md) the blood rite takes a herd every winter, the arcane fire Opferkraft in autumn and winter, and the circle costs more research.
- Surplus and scarcity. `salzlecke` turns salt into herds, `raeucherkammer` herds into winter food, `almkaeserei` herds into food the year round and `rennofen` ore into material.
- Exploration in agent proposals is a matter of the research agent's instructions (lane H). In the fallback, exploring is one minor order beside founding, building, research and the care of the council.

The fallback policy (`engine/ai/fallback.js`) decides by the weights of its profile plus the nature of its people (Wesensart and Ausrichtung of the template), declines candidates its leanings reject, keeps a winter food reserve, puts clans the land cannot employ on research or the herds, founds settlements once it can spare a clan, moves a camp or a unit towards free ground when nothing lies within founding reach, uses minor discipline applications and honours aggrieved council members. Open findings of the simulation are the convergence of cheap tier 1 achievements across peoples, ore at its cap for the nomads, the rarity of a finished destiny within forty seasons and the absence of wars under the fallback, so that battles and the defence options are not measured by the simulation.

## A second world

A second package is a new folder with the same files. It needs its own labels for every key the kernel and its activatable modules use, may bind module roles to its own resources and may override tuning within the schema. Everything outside the core resources is world data and handled generically by the kernel. Packages are validated as a whole before a campaign can pin them.

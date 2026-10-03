---
title: Decisions
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: active
language: en
created: 2026-10-03
updated: 2026-10-03
authors: [Christopher Pollin]
generated-with: Claude Code (Claude Opus 5.5)
related: [vision, game-design, rules-kernel, agents-harness, plan-m1, journal]
---

# Decisions

Standing fundamental decisions of the rebuild with date, decision, reason, consequences and the occasion to revisit them. A revision gets a new entry that names the old one. What follows from them is specified in [game-design.md](game-design.md), [rules-kernel.md](rules-kernel.md), [agents-harness.md](agents-harness.md) and [plan-m1.md](plan-m1.md).

## Earlier decisions of 3 October 2026

### E1 Campaign memory ordered by worlds, campaigns and archive

- Date 2026-10-03, revised by D23.
- Decision. `knowledge/` was split into `welten/`, `partien/` and `archiv/` for the memory of the chat game-master campaigns.
- Reason. One world carried several campaigns, and the flat layout mixed world, campaign and archive.
- Consequence. The new game never wrote into `knowledge/`. Its campaign memory lives in `campaigns/<cid>/narrative/`.

### E2 Real-time plan replaced

- Date 2026-10-03.
- Decision. The plan of 9 September 2026 for a real-time strategy game is replaced by the turn-based game of D1.
- Reason. The real-time plan allowed model answers only at loading or version changes. The owner wants agents in every turn (D12, D14), and they need time between two turns. All rule evidence from campaigns and prototypes is turn-based.
- Consequence. The goals that remain valid are base building, population, technology, institutions, peaceful and military ways and world packages for repeated games.
- Revisit when the owner explicitly asks for real time.

## Rebuild

### D1 One turn-based game replaces all earlier games

- Date 2026-10-03.
- Decision. One turn-based game replaces Winter, Nachtmeer, the real-time plan and the chat game-master procedure. One turn is one season. The old games stay in the local branch `archiv/vor-neuaufbau` and are removed from `main` once the game is playable.
- Reason. Four game forms with their own rules, saves and surfaces shared little code. The campaigns showed that rules grow during play, but without a frame they drift and text contradicts number. A kernel with checkable rules keeps the growth and removes the drift. The season as turn comes from all campaigns and carries winter pressure and life rolls.
- Consequence. The hybrid Markdown save, `js/parse.js` and the game-master role of `CLAUDE.md` are dropped. The removal of the legacy code is open.
- Revisit when the owner's acceptance fails in principle.

### D2 Generated, growing hex world

- Date 2026-10-03.
- Decision. The map is a generated hex world from `engine/world`. Regions are the unit of control, yield and settlement, tiles carry terrain, movement, sight and building sites. The state stores only what changes, namely control per region, settlements on tiles, known tiles per people and validated features added by the world agent.
- Reason. A map that grows when explored cannot be a fixed graph. The generator is a pure function of seed and world package, so the state stays small.
- Consequence. Trade routes and movement run over tiles with road-aware costs, control over regions.
- Revisit when region computation becomes slow or regions prove too coarse or too fine.

### D3 World package Hochland

- Date 2026-10-03.
- Decision. A world package `welten/<id>/` consists of `welt.json` (generator and terrain), `regeln.json` (calendar, resources, stats, people and council templates, tuning, AI profiles), `labels.json`, `style.json` and `content/` with developments, events and destinies. Hochland is the first package.
- Reason. Generator rules and game rules change for different reasons. Labels separate data ids from visible text and prevent mislabelling.
- Consequence. A campaign pins its package by hash ([world-packages.md](world-packages.md)).
- Revisit with a second world package.

### D4 One primitive set and one budget model

- Date 2026-10-03, refined by D4a.
- Decision. One canonical primitive set unites the effect primitives generalised from the campaigns with the kernel draft. Developments separate effects, price, one-off consequences on acquisition and costs.
- Reason. Two primitive sets and two budgets would have given agents and validator contradictory goals.
- Revisit on balance findings about dominant paths.

### D4a Budget model in one table

- Date 2026-10-03.
- Decision. Each tier has a ceiling for the effect `E`, a range for the net value `N = E + P` and a minimum price, and the research cost is `N × (tier + 1)`. Weights and tier table live only in `engine/schemas/effects.js` (`WEIGHTS`, `SPEC_WEIGHTS`, `TIERS`).
- Reason. The model was checked against the rules that grew in the campaigns and computes the owner's test path without adjustment. A derived research cost takes away the free parameter with which an agent could justify a too strong effect by a high cost. One table prevents documents and validator from using different numbers.
- Consequence. Documents describe the model and point to the table.
- Revisit when the net value alone proves unable to price effects of different kinds comparably.

### D5 Probes, roll ownership and breakthrough

- Date 2026-10-03.
- Decision. The player sees `P = clamp((11 − target + mod) / 10, 0.1, 0.9)`. Modifiers stack in a limited way, a natural 1 always fails critically and a natural 10 always succeeds critically. The player rolls 1d10 in the board for the probes of the own people and for the world event, the kernel draws everything else from the stored sfc32 generator. An open roll carries a fingerprint and goes stale when its probe changes. The speech bonus of the Machtprobe is dropped. The critical coup becomes a breakthrough token.
- Reason. The own roll with an open calculation carried all campaigns. Kernel rolls for everything else keep the game reproducible and AI peoples equal. A speech bonus would be a narrative decision about a value.
- Revisit when the owner wants every action rolled.

### D6 Destiny as victory

- Date 2026-10-03.
- Decision. Every people has a Bestimmung with three or four milestones from a fixed library of predicates the kernel checks. Whoever fulfils all first wins. A people collapses without a viable settlement or with too few clans. A new destiny can be adopted after a change of direction. Agents propose destinies, the validator rates their difficulty.
- Reason. A victory that follows from the own direction suits individual development better than a fixed victory type. Kernel predicates keep narration from deciding victory.
- Revisit on the owner's answer about a turn limit and locked milestones.

### D7 Turn phases and origin of every change

- Date 2026-10-03.
- Decision. A turn runs through `planning`, `resolving` and `agents`. Every state change is a log entry with source, turn, target, change and reason. `status.json` shows the agent round, the server streams it.
- Reason. Agents are slow and the player should not wait for them. Origin per value shows whether kernel, agent or player changed something.
- Revisit when waiting disturbs play.

### D8 Campaign folder

- Date 2026-10-03.
- Decision. Running campaigns live in `campaigns/<cid>/`, ignored by git. Checked-in test campaigns were planned under `examples/campaigns/`.
- Reason. Running games are private and change every turn.
- Consequence. `examples/campaigns/` was never created. The tests build their campaigns in temporary roots, and the hooks leave `examples/campaigns/` to development.
- Revisit when campaigns should synchronise between machines.

### D9 Projection as the only view

- Date 2026-10-03.
- Decision. The player and every agent working for a people see only the projection of that people, with fog over foreign stocks and plans.
- Reason. Without fog the preview would reveal outcomes of foreign rolls. The same projection for player and rival agents keeps fairness in both directions.
- Revisit on a wish for an observer mode.

### D10 Agents propose, the kernel writes

- Date 2026-10-03.
- Decision. Agents never write state. They propose content within the primitive set. New modules are code written by developers, never agent output. Hooks and the kernel's tamper check enforce that only `engine/cli.mjs` writes `state.json`.
- Reason. Narration that set values produced contradictions between text and number in the campaigns.
- Revisit when the primitive set repeatedly cannot express needed content. Then a new primitive or module is written as code.

### D11 Modules of the first playable version

- Date 2026-10-03.
- Decision. Modules are Lebensweise (nomadic and settled), Handel (trade), Magie (discipline with source, use, dependency and price) and Militär (units with strength and upkeep on tiles, battle as probe of strength ratio and terrain).
- Reason. The owner's test path needs a change of way of life, trade, fortification and magic. The discipline is the best evidenced form from the campaigns.
- Consequence. Rule, faith, diplomacy, overlordship, bondage and threats follow later.
- Revisit on balance findings about the military and the owner's answer about dark content.

### D12 Claude Code as harness

- Date 2026-10-03, roles changed by D14.
- Decision. The harness is Claude Code with project subagents in `.claude/agents/`, the commands `/zug` and `/partie` and hooks with a path filter, so development sessions stay unaffected. The player clicks "end turn" and types `/zug`. A listening session and a headless mode are later steps.
- Reason. Claude Code brings subagents, hooks and commands, and an own harness would be extra code without benefit.
- Revisit when operation without Claude Code is needed.

### D13 Development with contracts, lanes and gates

- Date 2026-10-03.
- Decision. Contracts first (schemas and documents), then parallel lanes on disjoint files, acceptance tests written from the specification by a separate lane, a gate before every merge and a reconciliation of documents with code at the end of each wave.
- Reason. Parallel lanes without fixed contracts produce incompatible parts. Tests by the same hand as the code check only what the author meant.
- Revisit on conflicts between lanes that file boundaries do not resolve.

### D14 Model staging at play time

- Date 2026-10-03.
- Decision. The game master is the Claude Code main session on Opus 5.5. The turn workers (world, research, council, rival, chronicler) run on Sonnet 5.5, the world agent as the only blocking step. The judges (coherence, balance, narrative) run on Opus 5.5 in the background after the turn, set no values, write findings and may submit corrections that pass the validator. The model is fixed in the frontmatter of each subagent definition.
- Reason. The waiting time of a turn should be short, so the workers run on the faster model and only the world agent blocks. Judgements about coherence, balance and arc need the stronger model but no place in the turn's rhythm.
- Consequence. This project decision is the explicit exception from the owner's global default of starting every subagent on Opus 5.5. Development work keeps the global default.
- Revisit when judges repeatedly report quality defects of the workers or waiting remains disturbing.

### D15 Consequences visible before the decision

- Date 2026-10-03.
- Decision. Every decision (order, research choice, council vote, decree, probe) shows its consequences where they act before it is fixed. The preview is the kernel function `preview()` run in the browser on the player's projection. The board never estimates.
- Reason. The owner singled out this support of play in the prototype. Because the same function computes as at resolution, the preview shows what `apply()` will do.
- Consequence. `preview()` returns every value the board shows. The board contains no game logic.
- Revisit when previews become too slow in the browser.

## Milestone M1, owner decisions of 3 October 2026

The owner settled the open questions for M1 as follows. Each can be revised by the owner.

### D16 Research paths and achievements

- Decision. Research is organised in six fixed paths, Nahrung (food), Gemeinschaft (community), Militär (military), Werk (craft and industry), Erkenntnis (knowledge) and Magie (magic). Each path has tiers matching the kernel `TIERS`. Concrete items on a path are Errungenschaften (achievements), which are the existing development objects, still generated by agents from the practice of the people and priced by the power budget, never a fixed tree. Research points come from the people's Wissen each season and form the research budget beside the action slots. Higher-tier achievements cost more points, and research accumulates over seasons until the cost is reached. A path's tier rises with its completed achievements and gates higher tiers on that path. Magie opens only when the practice of the people touches magic. Internal ids may keep `entwicklung`, player-facing terms are Pfad and Errungenschaft in German and Path and Achievement in English.
- Reason. Playtest entries 8 to 11 asked for paths per domain instead of single technologies, for research points from the society's knowledge and for a better word than Entwicklung.
- Revisit after the first campaign played with paths.

### D17 Language

- Decision. The UI default is English, German is selectable in the settings, labels exist per language. The narrative language is a campaign setting, and hochland-1 stays German.
- Reason. Playtest entry 20.

### D18 Start screen and menus

- Decision. A start screen offers New game (world package, seed with a random button, people from the package's start templates, rivals, difficulty), Continue (campaign list), Settings (language, audio volumes, reduced motion) and Rules (an in-game reference built from kernel and world rules). In game an Escape menu offers resume, settings, rules and back to menu. A new game is created in the browser through the server, which calls the kernel CLI command `new`.
- Reason. Playtest entry 21.

### D19 Audio

- Decision. Audio is synthesised with Web Audio in the browser without audio files. It covers ambience per world style, UI feedback, dice, event and turn stingers, mute and volume, with reduced intensity when reduced motion is set.
- Reason. Playtest entry 19.

### D20 Event cards

- Decision. Event cards appear as central modal cards confirmed with Continue, with choices and reactions. They are built and need polish only.
- Reason. Playtest entry 18.

### D21 End of game

- Decision. Victory and defeat screens follow the kernel status and show a summary of the campaign.
- Reason. Victory and collapse exist in the kernel (D6) but had no screen.

## Further decisions

### D22 Core resources and approval

- Date 2026-10-03.
- Decision. Every world carries the core values Nahrung (food), Material, Wissen (knowledge), Volk (the clans of `population.core`) and Zustimmung (approval, a kernel meter from −5 to 5). Holz and Stein are merged into Material. World-specific goods appear only when a people holds them.
- Reason. Playtest entry 1 asked for a fixed core in every world plus world-specific goods.
- Consequence. `RULES` in `engine/core/rules.js` names the core resources, `zustimmung` is a required meter of every people ([data-contracts.md](data-contracts.md)).

### D23 Knowledge base as project specification

- Date 2026-10-03, revises E1.
- Decision. `knowledge/` holds the specification and architecture of the project as a Promptotyping knowledge base in English. The memory of the former game-master campaigns is removed from `main` and stays in the branch `archiv/vor-neuaufbau`. `docs/` is dissolved into `knowledge/` except for legacy documents that legacy code still references.
- Reason. The owner wants one place that holds the whole specification, and the old campaigns are no longer played.

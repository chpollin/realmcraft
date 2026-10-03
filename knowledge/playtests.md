---
title: Playtests
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
related: [frontend, game-design, decisions, plan-m1, journal]
---

# Playtests

The owner's feedback from playtests with category, place, the request and its state. Categories are operation, design, mechanics, content and balance. All entries 1 to 22 are requirements of milestone M1 ([vision.md](vision.md), [plan-m1.md](plan-m1.md)). A state names where an entry stands on `main` and what M1 still owes.

## Playtest of 3 October 2026, game board

The first entries concern the UI prototype under `spielbrett/` with prepared game data, frozen at commit `44bb892` and served from a separate worktree. From entry 8 the entries concern the live campaign `hochland-1` on the board connected to the kernel.

### Before freezing the prototype

| No | Category | Place | Request | State |
|---|---|---|---|---|
| 1 | Mechanics | resources | a fixed core in every world plus world-specific goods | done. Nahrung, Material, Wissen, Volk and Zustimmung are the core, Holz and Stein merged into Material, goods visible only when held ([decisions.md](decisions.md), D22) |
| 2 | Design | detail panel, top bar | detail panel cut off on wide windows, top bar overflowing | done in the prototype, layout checked from 390 to 2560 pixels |
| 3 | Design | whole surface | too text-heavy, more symbols, consistent colours, expandable tooltips | done. One icon family, fixed colour meaning, two-stage tooltips |
| 4 | Mechanics | map layers | trade layer liked, a real road network wanted | done. Roads as tile features with levels, trade follows the road network |
| 5 | Design | developments | does not feel like a game and overwhelms | done in the prototype as a radial tree with proposals as branches and details in a side panel, superseded by the paths wheel of entry 11 |
| 6 | Design | council | better approval and vote symbols, less text, real portraits | symbols done (vote bar, hand symbols, quotes in tooltips). Portraits wait for a valid image key |
| 7 | Mechanics | council, all decisions | preview of consequences before the resolution explicitly praised | kept as design principle D15 and extended to orders, research, veto and probes |

### Live campaign hochland-1

| No | Category | Place | Request | State |
|---|---|---|---|---|
| 8 | Mechanics | developments | think in paths per domain (food, community, military, industry, research, magic) instead of single technologies | decided as six paths with tiers and agent-made achievements (D16), implementation in M1 |
| 9 | Mechanics | research | research points from the society's knowledge, more complex research needs more points | decided within D16, research points from Wissen as own budget beside the slots, implementation in M1 |
| 10 | Content | terms | "Entwicklung" does not fit well | decided as Pfad and Errungenschaft, in English Path and Achievement (D16) |
| 11 | Design | development tree | must look better | redesign as a wheel with one spoke per path in M1 |
| 12 | Operation | probe, council | the dice field is good. Show whom one sends, which bonuses advisers have and where they are | council strip and lead choice with chance per member done. Location and strengths of council members are missing in the kernel view (M1) |
| 13 | Operation | action slots | mark main and minor actions more prominently | done. Large slot indicator, slot icon on every order, preview of the occupied slot |
| 14 | Design, mechanics | map | nicer region marking, names, a province system with conquest | done. Borders, names at region centres, province panel. Regions already work as provinces with control and conquest in the kernel |
| 15 | Operation | research | the English message "research.assign is allowed once per season" blocks a second choice | done. A new choice replaces the previous one, issue texts come from labels. Machine-readable reason keys in the kernel are M1 |
| 16 | Mechanics, operation | destinies | what is a destiny, can the view be improved. Rivals' goals appear selectable, all destinies are offered at once, too much text | done. Offers only under the practice condition and without destinies other peoples hold, milestones as symbol with progress, rival destinies only when revealed. Revealed rival destinies in the view are M1 |
| 17 | Design | Weltgeschehen | live display of the agents with symbols is liked, should be clearer | done. Grouped into kernel results and agents, result per agent, waiting, running, done and failed distinguishable, judges at the end |
| 18 | Operation, mechanics | events | events should appear centred as own windows, confirmed with Continue, with reactions | done. Event cards one after another, options with kernel preview, fitting orders as reactions. Polish in M1 (D20) |
| 19 | Design | sound | add sound and audio | decided as synthesised Web Audio (D19), implementation in M1 |
| 20 | Content | language | game and surface in English, clearer rules | decided as English default with German selectable and a rules reference in the game (D17, D18), implementation in M1 |
| 21 | Operation | menu, game start | a new game must be initialised, menu navigation unclear | decided as start screen and Escape menu (D18), implementation in M1 |
| 22 | Mechanics | rivals | in the first turn the rival Talbund guessed order parameters and its orders were refused | done. Rival tasks carry the order catalogue with parameters, valid targets and an example |

### Live campaign hochland-1, evening of 3 October 2026

| No | Category | Place | Request | State |
|---|---|---|---|---|
| 23 | Design | map | the map fills a small part of the screen, most of it is empty | open, UI round. Default view fits the known world to the viewport |
| 24 | Design | map | region names collide and the letter-spaced italic face is hard to read | open, UI round. Centroid placement with collision avoidance, readable face, halo |
| 25 | Design | top bar | the game title is clipped at the top edge, resources show icon and number only, milestones appear as unexplained diamonds | open, UI round |
| 26 | Operation | turn panel | the bottom bar is overloaded, order and blocker chips are truncated, a scrollbar appears, overflowing main orders look like extra slots | open, UI round. A turn panel with order cards, one expandable blocker list with in-place fixes, overflow read as swap |
| 27 | Design | council | chips do not say whether they are strengths, tasks or places, loyalty has no symbol, the header is an unlabeled icon | open, UI round |
| 28 | Design | map | border colours, the dots under the settlement and the river course carry no visible meaning | open, UI round. Legend or tooltip for every map mark |
| 29 | Operation | options | the language switch belongs in an options menu with language, audio and reduced motion | partly done by the shell lane, open in the UI round |
| 30 | Operation | main menu | a main menu at game start with Continue, New game, Load, Options and Quit | partly done by the shell lane (start screen, Escape menu), Load and Quit open in the UI round |
| 31 | Operation | saving | the player must be able to save a game under a name and load it later, from the main menu and the in-game menu | kernel, CLI and server done (named saves, crash-safe load with automatic save first). Menu entries open in the UI round |
| 32 | Operation | overlays | the owner could not leave the developments overlay | not reproducible in a fresh browser; likely a tab loaded before a server restart. Open in the UI round: every overlay closable under all conditions, the board offers a reload when its modules changed |
| 33 | Content | paths view | tag names of the own-direction panel appear in English while the world is German; nodes and labels overlap; the tree fills a third of the view | open, UI round (paths wheel of the frontend lane replaces the old tree) |
| 34 | Mechanics | paths | owner confirmation: predefined paths plus an own branch described in a prompt is right | confirmed (D16). Owner idea as decision candidate: configure the set of paths anew for every game at game creation, kept fair by the budget |
| 35 | Operation | sealing | turn 1 was sealed with no orders after the two rolled orders had been withdrawn, the board did not say so | open, UI round. Warn before sealing an empty turn and name withdrawn rolls |
| 36 | Mechanics | labour | a clan assigned to Wissen worked for nothing: the board writes the labour key wissen, research counts only research, the kernel accepted the unknown key | in work by the kernel-fix lane: valid labour keys in one place, unknown keys refused, migration |

## Findings of the live judges

The judges of the first live turns reported findings that count as M1 input beside the entries above.

| Kind | Finding | State |
|---|---|---|
| Balance | herds do not grow in mountain regions | answered in M1, pasture counts the land around an own settlement ([world-packages.md](world-packages.md)) |
| Balance | defence options are missing | answered in M1, defensive achievements on the Militär path |
| Balance | agent proposals lean towards exploration | open for the research agent's instructions (lane H), the fallback no longer explores more than it does anything else |
| Balance | the dark path is too cheap | answered in M1, the minimum price counts only standing prices and a dependency weighs the lighter of payment and penalty ([data-contracts.md](data-contracts.md)) |
| Narrative | the chronicle claimed a migration that did not happen | open, M1 |
| Narrative | names drift between turns (Rauchschau and Psilschau) | open, M1 |
| Narrative | stances get overwritten instead of continued | open, M1 |

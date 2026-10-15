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
updated: 2026-10-15
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
| 23 | Design | map | the map fills a small part of the screen, most of it is empty | done in the October 15 usability pass. Known tiles fit between board controls; a fit control restores the view |
| 24 | Design | map | region names collide and the letter-spaced italic face is hard to read | done in the October 15 usability pass. Upright UI face, viewport checks and label collision avoidance |
| 25 | Design | top bar | the game title is clipped at the top edge, resources show icon and number only, milestones appear as unexplained diamonds | partly done. Resource names appear on wide screens; compact and milestone explanations remain open |
| 26 | Operation | turn panel | the bottom bar is overloaded, order and blocker chips are truncated, a scrollbar appears, overflowing main orders look like extra slots | partly done. Order names and targets wrap, mobile order reel uses the full width, problem list stays in the viewport and retains focus. Slot-overflow presentation remains open |
| 27 | Design | council | chips do not say whether they are strengths, tasks or places, loyalty has no symbol, the header is an unlabeled icon | open, UI round |
| 28 | Design | map | border colours, the dots under the settlement and the river course carry no visible meaning | open, UI round. Legend or tooltip for every map mark |
| 29 | Operation | options | the language switch belongs in an options menu with language, audio and reduced motion | partly done by the shell lane, open in the UI round |
| 30 | Operation | main menu | a main menu at game start with Continue, New game, Load, Options and Quit | partly done by the shell lane (start screen, Escape menu), Load and Quit open in the UI round |
| 31 | Operation | saving | the player must be able to save a game under a name and load it later, from the main menu and the in-game menu | kernel, CLI and server done (named saves, crash-safe load with automatic save first). Menu entries open in the UI round |
| 32 | Operation | overlays | the owner could not leave the developments overlay | partly done. Overview shortcuts leave open dialogs and focused controls intact; stale-module reload remains open |
| 33 | Content | paths view | tag names of the own-direction panel appear in English while the world is German; nodes and labels overlap; the tree fills a third of the view | open, UI round (paths wheel of the frontend lane replaces the old tree) |
| 34 | Mechanics | paths | owner confirmation: predefined paths plus an own branch described in a prompt is right | confirmed (D16). Owner idea as decision candidate: configure the set of paths anew for every game at game creation, kept fair by the budget |
| 35 | Operation | sealing | turn 1 was sealed with no orders after the two rolled orders had been withdrawn, the board did not say so | done in the October 15 usability pass. Empty turns and withdrawn rolls require an explicit review before sealing |
| 36 | Mechanics | labour | a clan assigned to Wissen worked for nothing: the board writes the labour key wissen, research counts only research, the kernel accepted the unknown key | done for the picker. It offers canonical food/material and research, preserves older assignment rows for correction and previews the actual research gain |

## Planning entry and hierarchy, October 15

The owner screenshot of hochland-3 showed a dominant expanded council, an empty order strip and a bright end-turn action with an outstanding roll. Browser inspection confirmed that the home map button moved the camera without opening actions or labour.

The pass adds an actionable empty order state, routes home and labour-warning navigation into actual camp or settlement selection, starts the council compact while preserving an explicit viewer preference and keeps signed loyalty visible. Outstanding-roll end-turn styling is subdued. No game rule or campaign draft is changed by these navigation actions.

Browser regressions exercise entry visibility at 390, 1440 and 2192 px, pointer and keyboard activation, heading focus, Escape focus return, unchanged stored draft, settled-community labour warnings, council preference persistence and selected-home visibility after a narrow-layout transition. The labour-warning regression failed before the shared home routing correction and passed afterwards. The complete browser and project suites passed on the final code.

Manual review inspected the live hochland-3 at wide and narrow viewport overrides, including scrolling to the research row. The embedded browser retained its existing zoom; the wide override of 1440 by 900 corresponded to a measured CSS viewport of 1920 by 1200. The entry and outstanding-roll end-turn text contrasts were calculated from their rendered foreground and background colours and exceed the normal-text criterion. The entry target meets the larger touch target size. The new focus ring and reduced-motion path were exercised by the keyboard regressions. Actual 200-percent browser zoom remains unverified because the embedded browser did not change zoom in response to its shortcuts. The independent review covered source and regression design, and the main agent performed visual inspection. Artistic acceptance remains with the owner.

## Community-view experiment, October 15

The complete project and browser suites passed on the final code. One concurrent run timed out waiting for a new campaign phase notification; the separate complete browser rerun passed without a server change.

The owner asked for executable prototypes after restricting runtime scenes to code-generated graphics. The optional community view exercises an actual Hochland campaign with existing labour controls, kernel previews and turn controls. World navigation remains available and the map stays the default. The buildings and landscape are an authored illustration, not a complete spatial inventory. No image model or runtime scene asset was used.

Independent source review found that hidden-map resize could destroy the return camera and that the narrow council rail overlapped work-area buttons. The shared map renderer now skips hidden resize, community selection leaves its camera alone, and the narrow community layout retains council access through the top-bar button. Browser regressions exercise the actual map return and home click, hit-test work-area and council controls and activate them by ordinary pointer gestures. A fixed coordinate in the audio regression was moved outside the new view navigation; its audio assertions remain unchanged.

| Criterion | Evidence and limit |
|---|---|
| Rules and state | Browser cases compare stored drafts across navigation and season preview, edit actual labour, inspect the existing kernel delta and reload the stored assignment. Nomadic and settled homes are exercised. |
| Keyboard | View switching and work-area activation use Enter; context focus and Escape return to the visible community control are asserted. Native HTML buttons are the canvas interaction equivalent. |
| Responsive layout | Tests exercise 1440 and 390 CSS px. Manual screenshots inspect wide, narrow and scrolled labour states. The embedded browser's existing zoom means a 1440 by 900 override measures 1920 by 1200 CSS px; the 390 override measures 520 CSS px across. |
| Motion | The viewer's actual audio settings key is used for reduced motion. An interaction test compares rendered stills, resumes motion through settings, observes changed pixels and freezes it again without changing the draft. |
| Targets and contrast | New controls reuse the existing solid night and ink/ember tokens. DOM measurement confirms 44 px view and work-area targets. No new text colour pair is introduced. A full accessibility audit was not performed. |
| Zoom | The embedded browser did not change its measured viewport or device-pixel ratio after the zoom shortcut. Actual 200-percent browser zoom remains unverified. |
| Review and acceptance | Independent review covered source and regression design. The main agent inspected actual wide, winter and narrow screenshots. Artistic and gameplay acceptance remain with the owner. |

## Clarifying community controls, October 15

The owner interpreted the visual season preview as a gameplay choice and asked whether the work-area values were stocks or mechanics. The owner also identified the duplicate management and planning entries and asked whether the illustration belonged to the freely authored world.

Normal play now uses the campaign season without a season selector. The visual override is available only through an explicit debug URL. Work areas show the clan unit with the assignment count; stock values remain in the top bar. The home entry uses the camp or settlement kind, and the redundant empty-order planning shortcut is omitted only in community mode. Accessible names include the visible kind or assignment and unit. Browser cases assert the normal/debug distinction, retained map planning shortcut, real assignment editing and keyboard/hit-test paths. Wide and narrow screenshots with a scrolled work panel were visually inspected.

The illustration belongs to the selected existing campaign. The actual Hochland campaign and its named save were read through the CLI to answer the owner's question. The community prototype did not instantiate the free worldbuilding draft. The basic distinction remains important for the future initialization preview.

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

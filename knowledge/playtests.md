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
updated: 2026-10-16
authors: [Christopher Pollin]
generated-with: Claude Code (Claude Opus 5.5)
related: [frontend, game-design, decisions, plan-m1, journal]
---

# Playtests

The owner's feedback from playtests with category, place, the request and its state. Categories are operation, design, mechanics, content and balance. All entries 1 to 22 are requirements of milestone M1 ([vision.md](vision.md), [plan-m1.md](plan-m1.md)). The reconciled states below distinguish implemented behavior from remaining design and playtest work. Current work is routed by [plan.md](plan.md).

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
| 6 | Design | council | better approval and vote symbols, less text, real portraits | symbols done (vote bar, hand symbols, quotes in tooltips). Portraits use a manifest and initials fallback. New portrait assets remain optional owner-authorized work |
| 7 | Mechanics | council, all decisions | preview of consequences before the resolution explicitly praised | kept as design principle D15 and extended to orders, research, veto and probes |

### Live campaign hochland-1

| No | Category | Place | Request | State |
|---|---|---|---|---|
| 8 | Mechanics | developments | think in paths per domain (food, community, military, industry, research, magic) instead of single technologies | implemented. Six paths with tiers and agent-made achievements (D16), covered by kernel and browser path tests |
| 9 | Mechanics | research | research points from the society's knowledge, more complex research needs more points | implemented. Research points from Wissen form their own budget beside the action slots (D16) |
| 10 | Content | terms | "Entwicklung" does not fit well | decided as Pfad and Errungenschaft, in English Path and Achievement (D16) |
| 11 | Design | development tree | must look better | implemented as the paths wheel. Narrow layout and long-label readability remain UI review work |
| 12 | Operation | probe, council | the dice field is good. Show whom one sends, which bonuses advisers have and where they are | implemented. Council strip and lead choice show member location, strength and chance from the derived council view |
| 13 | Operation | action slots | mark main and minor actions more prominently | done. Large slot indicator, slot icon on every order, preview of the occupied slot |
| 14 | Design, mechanics | map | nicer region marking, names, a province system with conquest | done. Borders, names at region centres, province panel. Regions already work as provinces with control and conquest in the kernel |
| 15 | Operation | research | the English message "research.assign is allowed once per season" blocks a second choice | done. A new choice replaces the previous one, issue texts come from labels. Kernel reason keys are machine-readable and localized |
| 16 | Mechanics, operation | destinies | what is a destiny, can the view be improved. Rivals' goals appear selectable, all destinies are offered at once, too much text | done. Offers only under the practice condition and without destinies other peoples hold, milestones as symbol with progress, rival destinies only when revealed. Revealed rival destinies are included in the view |
| 17 | Design | Weltgeschehen | live display of the agents with symbols is liked, should be clearer | done. Grouped into kernel results and agents, result per agent, waiting, running, done and failed distinguishable, judges at the end |
| 18 | Operation, mechanics | events | events should appear centred as own windows, confirmed with Continue, with reactions | done. Event cards one after another, options with kernel preview, fitting orders as reactions. Polish in M1 (D20) |
| 19 | Design | sound | add sound and audio | implemented as synthesized Web Audio with viewer controls (D19). Spoken narration remains separate work |
| 20 | Content | language | game and surface in English, clearer rules | implemented. English default, German selection and generated rules reference (D17, D18). World prose language remains a separate UI limitation |
| 21 | Operation | menu, game start | a new game must be initialised, menu navigation unclear | implemented as start screen and Escape menu (D18). Free realm authoring remains planned in new-game-design.md |
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
| 29 | Operation | options | the language switch belongs in an options menu with language, audio and reduced motion | implemented. Settings persist UI language, channel volumes, mute and reduced motion |
| 30 | Operation | main menu | a main menu at game start with Continue, New game, Load, Options and Quit | partly done by the shell lane (start screen, Escape menu), Load and Quit open in the UI round |
| 31 | Operation | saving | the player must be able to save a game under a name and load it later, from the main menu and the in-game menu | kernel, CLI and server done (named saves, crash-safe load with automatic save first). Menu entries open in the UI round |
| 32 | Operation | overlays | the owner could not leave the developments overlay | partly done. Overview shortcuts leave open dialogs and focused controls intact; stale-module reload remains open |
| 33 | Content | paths view | tag names of the own-direction panel appear in English while the world is German; nodes and labels overlap; the tree fills a third of the view | partly implemented. Tags are translated and the wheel exists; label collisions and a narrow-screen alternative remain review work |
| 34 | Mechanics | paths | owner confirmation: predefined paths plus an own branch described in a prompt is right | confirmed (D16). Owner idea as decision candidate: configure the set of paths anew for every game at game creation, kept fair by the budget |
| 35 | Operation | sealing | turn 1 was sealed with no orders after the two rolled orders had been withdrawn, the board did not say so | done in the October 15 usability pass. Empty turns and withdrawn rolls require an explicit review before sealing |
| 36 | Mechanics | labour | a clan assigned to Wissen worked for nothing: research counts only research, while the kernel accepted the stock resource as a labour key | fixed in the picker. It offers canonical food/material and research and retains older allocations for correction. Kernel rejection and migration of non-producing labour keys remain open in plan.md |

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
| Balance | agent proposals lean towards exploration | instructions and fallback were revised. Actual diversity of generated proposals still needs a multi-turn playtest |
| Balance | the dark path is too cheap | answered in M1, the minimum price counts only standing prices and a dependency weighs the lighter of payment and penalty ([data-contracts.md](data-contracts.md)) |
| Narrative | the chronicle claimed a migration that did not happen | grounding instructions and resolved-event context exist. Actual generated narrative quality remains to be tested |
| Narrative | names drift between turns (Rauchschau and Psilschau) | grounding instructions and resolved-event context exist. Actual generated narrative quality remains to be tested |
| Narrative | stances get overwritten instead of continued | grounding instructions and resolved-event context exist. Actual generated narrative quality remains to be tested |

## Action slots and empty results, October 15

The owner requested direct planning from the main/minor budget and clearer glyphs. Empty slots now open matching action types and known destinations, with existing kernel costs, refusals and probes. Occupied slots identify and focus their queued order. Target choice and navigation do not alter the draft. Regression cases cover wide/narrow layout, target changes, resolution locking and focus across redraws. An independent review found and corrected a mobile card overflow and lost select focus.

The apparently unresponsive kernel disclosure had no results in a fresh planning turn. It now has an explicit empty state without a false disclosure or completion tick. Optional native DOM children are filtered instead of rendering null. A real report fixture retains pointer/keyboard disclosure behavior, state and focus. Project and browser gates passed for these changes. Actual 200-percent zoom and artistic acceptance remain unverified.

## Historical review inputs, October 3 and 4

The following observations were received before the later board passes. Their item numbers identify that audit, not the owner-feedback table above. They are retained as dated source material. The old priority labels, lane routes and proposed fixes describe the audit's original context and do not authorize work. Current findings and product work are in [plan.md](plan.md).

The October 15 source review confirms that action replacement, manifest-based portrait fallback, grounded agent contexts and several labels or accessible names have since changed. It does not constitute a fresh visual audit of every old observation. In particular, tooltip placement, narrow paths, world-prose language, council comprehension and contrast or touch-target measurements still require concrete current cases.

### UI design audit of the board, 4 October 2026

- Received. 2026-10-04
- Source. UI audit agent of `realmcraft-refactor-verify`, read-only on `main` at `61c4948` (before the refactor wave), fixture campaigns in a temp root, screenshots at 390, 1280, 1920 and 2560 px in English and German, contrast and Tab order measured by script.
- Target. The UI optimisation lane, [frontend.md](frontend.md), [playtests.md](playtests.md).
- Context. Wave 2 resolved the refused-order reason, research in progress in paths view and turn bar, German tag names in the German paths view and the map strip at phone width. The rest of the turn-1 audit above and of playtest entries 23 to 36 is still present. The refactor wave removed the `?demo` mode, so recheck each item on the current `main`. The items below stand in order of impact on play.
- Next action. Resolve the remaining items below, move results into the playtest table, then remove this point and the turn-1 audit point. The October 15 usability pass integrated the camera fit, labour picker, empty-turn review, blocker dismissal, narrow-screen selection, province labels and scoped shortcuts ([frontend.md](frontend.md), [playtests.md](playtests.md)).

4. The turn bar still repeats the problem count and shows slot overflow as an extra red slot instead of a swap (entry 26).
7. Type and controls keep their 1280 px sizes at 2560 px, dialogs stay small.
8. Agents' round shows two contradictory states, judge findings with severity reach the player view, durations read 0 s.
9. Tooltips stack, open on dialog focus and cover controls, and are clipped at 390 px.
11. Paths wheel labels overlap at 1280 and 1920 px and shrink to about 7 px at 390 px. Needs collision-free labels and a list below about 600 px (entry 33).
12. Effect chips in council questions are empty arrows with the raw key `flag.set` as accessible name, event effects are icons only, which breaks D15.
13. German world content in the English UI carries `lang="en"`. Content language policy still open.
14. Top bar hides the people name and path, council and chronicle labels below 1920 px, milestone diamonds lack a reading, resources overflow at 390 px without a cue (entry 25).
15. Council strip chips mix lead modifier, favoured and opposed topics by small glyphs, loyalty has no symbol, the header toggle has no tooltip (entry 27).
16. Camp dots, region flags, border lines and the ownership colour have no tooltip or legend (entry 28).
19. Save and Load are missing from start screen and game menu although kernel and server support named saves (entries 30, 31).
20. Tab order jumps across regions and reaches the hidden place-list button.
21. Proposals messages use the trade glyph and show only an icon.
22. Place list opens far from its trigger over the council strip, with an empty Places heading and the camp listed as a unit.
23. Threat and Trade layers have no empty-state cue.
24. Council dialog actions sit below the cards, Honour appears for one member only, members show no vote on the open question, cards are too large at 390 px.
25. Event card uses the trade glyph for a magic event, a placeholder figure, "Decide by Autumn" during autumn and an unexplained reaction glyph.
26. Chronicle labels spring as "Summer, year 1" and repeats the date as title.
27. Panels repeat the same name in title, targets and chips.
28. Numbers on order options, the camp shield (clan count, not a kernel value) and the army panel have no icon or tooltip.
29. Colour and glyph meaning is inconsistent (rival chips on the start screen, failure bands, defeat triangle, Community path and council share a glyph).
30. Research pill truncates the name and omits progress.
31. End screen has plural errors, a season that differs from the top bar, and a collapse summary that counts a settlement beside zero clans.
32. The Narrow cell of the chance band in the Rules dialog fails WCAG AA contrast.
33. Problem and roll buttons, sliders and probe radios are below 24 px targets.
34. Probe dialog at 390 px opens scrolled past its target block.
35. Settings toggles at 390 px are misaligned with the sliders.
36. Start screen rows cannot be told apart, the seed is a raw field with an unlabelled die, people-card chevrons have no tooltip.
37. Heading icons of panels and dialogs use different shapes for the same role.
38. "Research direct here" looks like a text link, its text field has no label.
39. German start screen and board name the player people differently.
40. Missing portraits produce 404s in the console on every load.

### Read-only audit of the live game, turn 1

- Received. 2026-10-03
- Source. Six-lens audit of `hochland-1` on the board before wave 2 was merged, every finding reproduced independently at least once.
- Target. [frontend.md](frontend.md), [playtests.md](playtests.md), the UI optimisation round.
- Context. The audit saw the board of wave 1. Wave 2 rebuilt the shell, the paths view, the council and the modules, so part of the list may be resolved. Routes name the lane that owned the area at the time.
- Next action. Check each item against `main`, fix what remains in the UI round, move the result into the playtest table, then remove this point.

Blocker:

- turn panel. Problem list opens off-screen at phone widths, so no fix button can be reached. Route F1 shell.

Major:

- turn panel. A failed draft save is silent and leaves a rejected pending save. Route F1 shell, in the shared save path.
- turn panel. Problem list covers the fix it points to, cannot be dismissed, and loses focus. Route F1 shell.
- turn panel. Order-chip and message tooltips in the turn bar are clipped and never visible. Route F1 shell. Render tips outside the scroll container, using the same mechanism as the council-bar tooltip item..
- turn panel. Refused targets all read 'Target not possible here'; the kernel's reason is dropped. Route F1 shell: add issue.target.<reason> labels with {people}/{owner} resolved to display names.
- turn panel. Below 1800 px order chips hide their targets, and problem chips scroll out of sight. Route F1 shell, with layout follow-up in (b).
- turn panel. Slot overflow has no fix in place, and the board asks for a roll for the surplus order. Route F1 shell.
- game state. Sealed turn has no orders, and two rolled orders were withdrawn without notice. Route F1 shell to render withdrawn rolls and orders, and (c) kernel to establish whether a re-pin withdraws rolled orders and should block the seal or warn. The draft does not record the cause..
- top bar. Top-bar forecasts come from the refused preview during resolution. Route F1 shell for the forecast fallback. For the 1/1/1 vs 2/1 assignment mismatch, (c) kernel has to decide whether draft.assign or kernel population is authoritative..
- research. Research in progress (Saumpfad 4 of 7) is shown as a mere proposal. Route F2 paths and council. Optionally (c) kernel could drop a researched ref from candidates..
- research. Path state (tiers, done/needed, closed paths, research points) is not shown; a candidate on a closed path looks open. Route F2 paths and council.
- turn panel. World events entry is missing until a language switch, so a closed panel cannot be reopened. Route F1 shell: recompute meldungen in the shared path after ensureZz/applyStatus.
- turn panel. Board says the kernel is working while the turn is waiting for the game master. Route F1 shell, and (d) harness if status.json should publish an explicit awaiting-master state instead of the board inferring it.
- events. World events shows results from the earlier agents phase under the current resolution span, with wrong status labels. Route harness: record the phase of origin, prune or mark superseded proposals, write real step timestamps. (a) F1 shell: span label, rival status text, duration guard..
- data truth. Fog of war leaks: World events shows rival research and the judges' internal QA findings. Route harness for a per-player status projection, and (a) F1 shell to filter the judge role and foreign research in shapeSteps.
- destiny. Rival destinies are offered to the player as 'New destiny'. Route content: a people binding or availability rule per destiny. (a) F2 to filter on it. (c) kernel only to confirm that destiny.adopt refuses a rival-held ref..
- events. Agent texts are cut at 80 characters mid-word; full texts and council voices cannot be read. Route harness: keep the full text, change both slice sites together, keep the dedupe key stable. Then (a) F1 for an expandable row and F2 for the voice on the member..
- map. At phone width the map shrinks to a strip under the chrome and sheets. Route UI optimisation round, with F1 and F3 executing the CSS.
- map. At phone width the camp sits under the bottom sheet and stays hidden after selection; the panel title runs under the close button. Route F3 modules and map, with sheet sizing in (b).
- research. Development tree keeps the fit of its first opening on later openings and resizes. Route F2 paths and council.
- top bar. Tooltips stay open after a dialog closes, stack, and cannot be dismissed or hovered. Route F1 shell, in tip.js/base.css, shared by every tip.
- a11y. Single-key shortcuts E/R/C/B fire from any control and inside open dialogs. Route F1 shell.
- map. Keyboard map navigation gives no feedback; Enter on an unrevealed tile is silent; the canvas has no focus ring. Route F3 modules and map.
- a11y. Values carried by icons are missing from accessible names. Route F1 for event chips, F2 for the tree and council.
- i18n. English UI shows German world content, with no lang markup and no stated content language. Route Needs a decision on policy. (e) content for English fields, (d) harness for the agent prose language, (a) F1 to set lang='de' on .world content and show the content language.

Minor:

- chronicle. Chronicle entry about spring is labelled 'Summer, year 1', and the label appears twice. Route Decision between (a) F1 (label with e.turn-1, no title fallback to the date) and (d) harness (the chronicler files or stamps the narrated turn).
- data truth. Agent prose diverges from kernel state and content names. Route harness: feed agents the content display names and the resolved events, per people.
- turn panel. Problems are duplicated as warning triangles; the locked phase shows as a red warning with repeated text. Route F1 shell (suppress phase/draft-closed while resolving, drop the duplicate entries); wording consolidation in (b).
- research. Development effect badges use one icon for different effects. Route F2 paths and council; (e) content for the missing winter price.
- research. Development tree nodes overlap and are unreadable at phone width; focus looks like selection. Route F2 paths and council.
- map. Place list opens over the council bar, far from its trigger, with an empty 'Places' heading; the camp is listed as a unit. Route F3 modules and map; the classification of the camp as unit or place is a design decision.
- map. Threat and Trade layers have no empty-state cue, and Trade can never show routes. Route F3 modules and map.
- council. Council bar and destiny tooltips grow past the screen edge or are clipped by their container. Route F1 shell for shared tip placement (white-space normal, edge flip or portal) and F2 for the council list.
- dialogs. Event card: no season, closing with Esc or X does not count as read, focus is lost, a placeholder figure. Route F1 shell; layout in (b).
- chronicle. Chronicle dialog never becomes a full-width sheet on phones, and its reading column is off-centre. Route F1 shell; the two-column decision belongs in (b).
- council. Council dialog actions sit detached below the cards and are disabled with no reason. Route F2 paths and council.
- map. Region labels share one row and cross mountain icons, borders and the river. Route F3 modules and map.
- map. On large screens the map is not fitted to the known area. Route F3 for the camera fit; type scaling in (b).
- map. Map zoom, home and list buttons have no tooltip. Route F3 modules and map.
- map. Order options show 'Free action' for every order during resolution. Route F3 modules and map: fall back to base.catalogue[].slot.
- map. Camp shows a shield 'strength' of 3/5 that is the clan count, not a kernel value. Route F3, after a decision on what camp strength means.
- turn panel. Swap offer does not say which order it replaces, and the dialog hides the replacement. Route F3 modules and map.
- turn panel. End-turn button looks ready while problems block it, and its label names only rolls. Route F1 shell.
- turn panel. Orphan-roll entry contradicts itself and names nothing. Route F1 shell.
- dialogs. Re-roll dialog for a stale roll shows no previous value or reason. Route F3 modules and map.
- a11y. End-turn spinner ignores prefers-reduced-motion. Route F1 shell.

Polish:

- council. Council information gaps: lead strength missing, third favour dropped, loyalty bands coarse. Route F2 paths and council.
- council. Icons carry several meanings: leader badge, Proposals and Trade. Route F2 for one shared role map; the glyph choice belongs in (b).
- top bar. Developer explanations in tooltips. Route F1 shell.
- map. Selection panels repeat the same name several times. Route F3 modules and map.
- turn panel. Ambiguous icons on order chips and option cards. Route UI optimisation round.
- i18n. Label wording: 'Sommer 1 nach Herbst 1' and 'weg' as 'Roads'. Route F1 for de.json; (e) content for the tag wording decision.
- top bar. Realm name and h1 hidden at 1366 px and below. Route UI optimisation round.
- a11y. Non-interactive tab stops and empty structures. Route F1 and F2, together with the accessible-names item.
- a11y. Tab order jumps between map controls, places list and World events. Route UI optimisation round.
- destiny. Destiny milestone progress field reads 0 while the board shows 1 of 3. Route kernel: clarify or rename in the data contract; the board is right.
- a11y. Raw i18n keys used as aria-labels. Route F1 shell, after a check of the data-t-aria-label resolution timing.

## Chat-workshop review, October 16, 2026

The owner rejected the flat text-led start screen, then asked whether the subsequent relief-based studio still had redundant and generic AI-interface elements. Source review identified repeated instructions and an oversized unformed study. The owner then explicitly approved a compact pre-draft entry. It is implemented with replacement status feedback and the large studio gated on a loaded shared draft. The copy fallback, early questions and independent form route remain available. [frontend.md](frontend.md#chat-workshop-composition) describes the current composition; conversation quality and broader artistic acceptance remain in [plan.md](plan.md#current-ui-review).

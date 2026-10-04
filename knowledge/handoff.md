---
title: Handoff
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: active
created: 2026-10-03
updated: 2026-10-04
---

# Handoff

This process inbox holds only open hand-over points. Before using a point, check its source and current target. Integrate durable content into the responsible declarative or action document, record subject, source, target and result or reason for discarding briefly in [journal.md](journal.md), and then remove the point completely.

## Open handoff points

### plan-m1.md cites removed docs paths

- Received. 2026-10-03
- Source. Lane D of M1, after merging commit `4f7ed7e`.
- Target. [plan-m1.md](plan-m1.md), owned by the contracts agent and the integrator.
- Context. The plan cites `docs/Spieldesign.md`, `docs/Regelkern.md`, `docs/Agentenvertrag.md`, `docs/Harness.md`, `docs/Entscheidungen.md` and `docs/spieltests/2026-10-03-spielbrett.md`, which moved into this knowledge base. Lane D does not edit the plan.
- Next action. Replace the paths by [game-design.md](game-design.md), [rules-kernel.md](rules-kernel.md), [agents-harness.md](agents-harness.md), [decisions.md](decisions.md) (M1-1 to M1-6 are D16 to D21) and [playtests.md](playtests.md), following the mapping in [INDEX.md](INDEX.md).

### Documents to update after the M1 merges

- Received. 2026-10-03
- Source. Lane D brief, the knowledge base describes `main` at `4f7ed7e` plus the M1 plan.
- Target. Every document of this folder, in particular [rules-kernel.md](rules-kernel.md), [data-contracts.md](data-contracts.md), [frontend.md](frontend.md), [agents-harness.md](agents-harness.md), [operations.md](operations.md), [testing.md](testing.md) and [playtests.md](playtests.md).
- Context. The lanes of M1 change the kernel (paths, issue params, view additions, settings), the server (`server/`, new game endpoints), the board (shell, i18n, audio, wheel, module views), the harness and remove the legacy code and the remaining `docs/` files.
- Next action. The final docs agent reconciles each document with the merged code and moves the states of the playtest table.

### Remaining steps of milestone M1

- Received. 2026-10-03, updated 2026-10-04
- Source. Sessions of 3 and 4 October 2026. The second ended in a controlled way after the refactor wave of `realmcraft-refactor-verify` was merged, while its UI phase was running.
- Target. [plan-m1.md](plan-m1.md), every knowledge document, the saved workflow.
- Context. Wave 1, wave 2, the lanes SL and KB and the refactor wave of 4 October are merged on `main` ([journal.md](journal.md)). Audit, refactor and merge of the saved workflow are done and must not run again. The UI optimisation lane, the verification (full-loop e2e, completeness critic, docs truth check) and the close phase did not run, so the fix round, the handoff points below and the final documentation pass are still open.
- Next action. Run only the phases UI, Verify and Close of `realmcraft-refactor-verify`, starting the UI lane from the design audit below instead of a new audit. Change the saved script together with [agents-harness.md](agents-harness.md) or [operations.md](operations.md) where they describe it, and drop its stale core-lane mention of `views.js` and the unused constants `OWNER_DECISIONS` and `KERNEL_GAPS`, which still cite removed `docs/` paths. Mark the acceptance criteria of the plan honestly afterwards.

### UI design audit of the board, 4 October 2026

- Received. 2026-10-04
- Source. UI audit agent of `realmcraft-refactor-verify`, read-only on `main` at `61c4948` (before the refactor wave), fixture campaigns in a temp root, screenshots at 390, 1280, 1920 and 2560 px in English and German, contrast and Tab order measured by script.
- Target. The UI optimisation lane, [frontend.md](frontend.md), [playtests.md](playtests.md).
- Context. Wave 2 resolved the refused-order reason, research in progress in paths view and turn bar, German tag names in the German paths view and the map strip at phone width. The rest of the turn-1 audit above and of playtest entries 23 to 36 is still present. The refactor wave removed the `?demo` mode, so recheck each item on the current `main`. The items below stand in order of impact on play.
- Next action. Resolve every item in the UI lane, move the result into the playtest table, then remove this point and the turn-1 audit point.

1. Problem list at 390 px opens off-screen, Escape opens the game menu instead of closing it. Needs a bottom sheet in the viewport, Escape and a close button, focus back to End turn.
2. Labour rows in `labour()` (`spielbrett/js/ui/kontext.js`) are built from the first three resources, so they offer Knowledge (`wissen`, which yields nothing) and never Research. Fix together with kernel defect 1 below.
3. Sealing a turn with no orders or after withdrawn rolls gives no warning, `draft.withdrawn` is never shown (entry 35).
4. Turn bar truncates order chips at every width, shows no order chips at 390 px, counts problems three times and shows overflow as an extra red slot instead of a swap (entry 26).
5. End turn looks ready while problems block it and its label counts only rolls.
6. The camera centres on the camp at fixed zoom instead of fitting the known tiles between the panels (entry 23).
7. Type and controls keep their 1280 px sizes at 2560 px, dialogs stay small.
8. Agents' round shows two contradictory states, judge findings with severity reach the player view, durations read 0 s.
9. Tooltips stack, open on dialog focus and cover controls, and are clipped at 390 px.
10. At 390 px the selected camp sits under the bottom sheet and the panel title runs under the close button.
11. Paths wheel labels overlap at 1280 and 1920 px and shrink to about 7 px at 390 px. Needs collision-free labels and a list below about 600 px (entry 33).
12. Effect chips in council questions are empty arrows with the raw key `flag.set` as accessible name, event effects are icons only, which breaks D15.
13. German world content in the English UI carries `lang="en"`. Content language policy still open.
14. Top bar hides the people name and path, council and chronicle labels below 1920 px, milestone diamonds lack a reading, resources overflow at 390 px without a cue (entry 25).
15. Council strip chips mix lead modifier, favoured and opposed topics by small glyphs, loyalty has no symbol, the header toggle has no tooltip (entry 27).
16. Camp dots, region flags, border lines and the ownership colour have no tooltip or legend (entry 28).
17. Region names are letter-spaced italic and run off the edge at 390 px (entry 24).
18. Shortcuts E, R, C, B fire inside open dialogs and from focused buttons, because the handler in `board.js` checks shortcuts before open dialogs.
19. Save and Load are missing from start screen and game menu although kernel and server support named saves (entries 30, 31).
20. Tab order jumps across regions and reaches the hidden place-list button, the canvas has no visible focus ring.
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

### Judge follow-ups from the live game

- Received. 2026-10-03
- Source. Coherence and balance judges of `hochland-1`, turns 0 and 1.
- Target. [world-packages.md](world-packages.md), [agents-harness.md](agents-harness.md), the content of the Hochland package.
- Next action. Check against `main` whether lanes C and H resolved them, fix the rest.

1. Path assignment by tag majority with ties to the earlier path leaves the Erkenntnis path empty for every people and lets Nahrung collect almost everything. Research proposals need an explicit `pfad`, and the tie rule or the tag lists need review.
2. The player's people has no unit, defence 0 and no candidate on the Militaer path; the open candidate list is full until round 4. The pool should keep room for path diversity.
3. Stock cap raises without reachable use (knowledge cap while knowledge burns every season, herd cap while herds cannot grow in mountains) are priced by the budget as full effect.
4. New world cards are unevenly spread between nomadic and settled peoples.
5. A rival stacks herd growth effects and may hit its cap early.
6. Judge findings that cite knowledge outside the player's projection must not reach the player view.
7. Narrative agents must phrase what lies outside the projection as worry or rumour (a knowledge gain that did not happen, knowledge about a people without contact).

### Kernel defects found by fuzzing, not yet fixed

- Received. 2026-10-03
- Source. Lane KB and its ingest fuzzing helper.
- Target. [rules-kernel.md](rules-kernel.md), [testing.md](testing.md), `engine/`.
- Next action. Fix each at its root cause with a regression test.

1. Labour key `wissen`. `checkLabour` (`engine/core/orders.js`) accepts any resource id, no terrain yields Wissen, `placeLabour` puts such a clan into idle and no issue reports it; in the live game a clan worked a whole season for nothing. Proposed fix: one exported list of valid labour keys (resources with a terrain base yield or a standing `yield.mod`, plus the activities), `checkLabour` refuses other keys with `params.reason: 'not-labour'`, `migrate()` moves `assigned.wissen` to `research` with a log entry. The board's labour rows (`spielbrett/js/ui/kontext.js`, `labour()`) must take the kernel's key list and show `research`.
2. Research cost shown without the complexity surcharge. The surcharge is intended (rules-kernel §8, `researchCost` in `engine/core/research.js`, shared with the board adapter), but the agent views, `pathsView` and the research and judge context show only the library cost; the kernel computes against the working state, the board against the opening state. Add the effective cost to the views and contexts.
3. Idle labour on an invalid key is not raised as `idle_labour`.
4. A world feature on an extremely far tile (for example `12345678901234567890,1`) hangs the CLI for about half a minute and then crashes ingest with `RangeError` in `candidateSeeds` (`engine/world/regions.js`). `PATTERNS.tile` admits any number of digits and neither the validator nor ingest checks a feature tile against the world. Bound the tile pattern or check the range.
5. A refused destiny item still stores its content in the returned library: `storeContent` runs before `offerDestiny` in `engine/harness/ingest.js`, so a destiny refused for `practice-touches-destiny` (or own, held by a rival, offered already, offers full) leaves an unreferenced card in `library.json`, and a later proposal with the same id fails as a duplicate. Run the offer preconditions before storing, or restore the library on refusal.
6. Replay of journals written by an older kernel is not covered by a test. Any behaviour change (including the labour trim of lane KB) changes replay hashes. Proposed: raise `JOURNAL_FORMAT` in `engine/cli.mjs` and write a base anchor at the next transition when the last entry has an older kernel format.
7. An ingest fuzz test written by the helper of lane KB covers both ingest defects and stays red until they are fixed. It lies on the local branch `wip/fuzz-ingest` (`tests/unit/sim/fuzz-ingest.test.js`), not on `main`; bring it over with the fixes and add it to the file list of `tools/sim/fuzz.mjs`.

### Overengineering review before further building

- Received. 2026-10-03
- Source. Owner and main session, honest assessment at the end of the M1 session.
- Target. [architecture.md](architecture.md), [decisions.md](decisions.md), [plan-m1.md](plan-m1.md), the refactor workflow.
- Context. The foundation carries the idea and stays: the deterministic kernel with the CLI as only writer, the power budget and validator, fog-safe projections, hooks that confine agents (agent output is untrusted input), tests and migrations. Two layers exceed what the problem needs. The integrity layer (journal hash chain, anchors, roll ledger with fingerprints, sealed draft hashes, tamper detection, roll-forward recovery in every step) is anti-cheat architecture for a single-player game; every behaviour change drags repin, migration and replay questions behind it. The process built faster than it learned: contracts, many parallel lanes and two merge waves came before anyone had played five turns in a row, and lanes fixed the same defects twice. Open measurement questions are the number of agent runs per turn (world, research per people, council, rivals, chronicler, two judges every turn) and the paths model, whose structure runs ahead of its content (Erkenntnis empty, Magie hard to open, no military candidate for the player).
- Progress. The refactor wave of 4 October removed the roll ledger `rolls.json` (rolls live only in the draft). Journal hash chain, anchors, sealed draft hashes and tamper detection stay, and no decision on them is recorded yet.
- Next action. Build no new feature before the game has been played over several turns in a row and the refactor workflow has run. In that workflow, take the integrity layer as first simplification candidate, aiming at a state hash plus replay for debugging, and measure whether research and rival runs can be batched and judges run every few turns. Record what is kept, simplified or removed as a decision.

### Housekeeping

- Received. 2026-10-03
- Source. Session of 3 October 2026.
- Next action. Owner decisions.

1. `design/` in the working tree holds untracked screenshots of the removed dashboard. Delete or keep them outside the repository.
2. The worktree `../realmcraft-spieltest` (frozen prototype `44bb892`) and the local branch `archiv/vor-neuaufbau` are no longer needed for development; the branch preserves the state before the rebuild and stays local.
3. Portraits wait for a valid image generation key in `.env`.

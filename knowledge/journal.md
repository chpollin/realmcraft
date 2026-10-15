---
title: Journal
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
related: [decisions, playtests, handoff, plan-m1]
---

# Journal

The curated backward-looking provenance index of the project. Current specification and rules live in the declarative documents, future work in [plan-m1.md](plan-m1.md), open inputs in [handoff.md](handoff.md). Earlier wordings are kept by git.

## Entries

### 2026-10-03 condensed development history before the rebuild

- Predecessor state. `docs/Entwicklungsjournal.md` at commit `7bfa6ab`, and the branch `archiv/vor-neuaufbau`.
- Scope. entries from 2026-05-30 to 2026-10-03 about the savegame dashboard, the chat game-master procedure, the round prototypes Winter and Nachtmeer, the design studies and the real-time plan.
- Result. kept as history in [vision.md](vision.md) (origin) and in the decisions E1, E2 and D1 ([decisions.md](decisions.md)). The details of dashboard tabs, image pipeline, demo pages, Nachtmeer rules and the real-time plan are kept only in git, because the new game replaces them.

### 2026-10-03 integrated turn-based game core

- Source. commit `b8ad4c4` and the German design documents `docs/Spieldesign.md`, `docs/Regelkern.md`, `docs/Agentenvertrag.md`, `docs/Harness.md`, `docs/RealmCraft-Plan.md`, `docs/Entscheidungen.md`.
- Target. [game-design.md](game-design.md), [rules-kernel.md](rules-kernel.md), [agents-harness.md](agents-harness.md), [decisions.md](decisions.md), [testing.md](testing.md).
- Result. rules kernel, validator, Hochland world package, harness agents and hooks, and the board connected to the kernel. The wave plan W0 to W3 with lanes and gates is kept as decision D13 and as the testing layers.

### 2026-10-03 integrated contract amendments

- Source. `docs/Vertragsaenderungen.md` with the amendment of `SCHEMA_VERSION` 2, the budget and validator revision and the kernel and CLI integrity supplement.
- Target. [data-contracts.md](data-contracts.md), [rules-kernel.md](rules-kernel.md).
- Result. bands, tokens, approval meter, judge ids and items, draft maps, event draws, pending choices, result, sealed drafts, destiny offers and difficulty, status resolved steps, rival slots, roll ledger, journal hash chain, anchors and `repin`, and the refined weights of status, trigger, dependency, meter, restriction, scaled flow and `replaces`.

### 2026-10-03 integrated fix lanes K, V and S and UI round 2

- Source. merges into `main` up to `7bfa6ab` and the orchestrator notes of the knowledge consolidation.
- Target. [rules-kernel.md](rules-kernel.md), [data-contracts.md](data-contracts.md), [agents-harness.md](agents-harness.md), [frontend.md](frontend.md), [playtests.md](playtests.md).
- Result. lane K made the CLI tamper-evident and crash-safe (seal lock, separate cost pass, re-checks at resolution, reserved names, destiny switch with practice condition and offers, council forecast in the preview, fog fixes, rival order catalogue). Lane V priced statuses, recurring triggers and meters by what the kernel charges and refused inert and unkeyed content. Lane S removed the shell from rc agents, bound their writes and reads to their task and added status reconciliation. UI round 2 built the playtest entries 12 to 18 into the board. The independent review of `b8ad4c4` (one critical and eleven severe findings) is closed by these lanes.

### 2026-10-03 integrated playtest log and M1 owner decisions

- Source. `docs/spieltests/2026-10-03-spielbrett.md` and the owner's direction for M1.
- Target. [playtests.md](playtests.md), [decisions.md](decisions.md) D16 to D22, [vision.md](vision.md).
- Result. entries 1 to 22 with their state on `main`, the findings of the live judges, and the decisions on paths and achievements, language, start screen and menus, audio, event cards, end of game and core resources.

### 2026-10-03 corrected statements of the German design documents

- Source. the German documents of `docs/` compared with the code on `main` at `7bfa6ab`.
- Target. the documents of this knowledge base, which follow the code.
- Result. research gains points from a base rate, labour, modifiers and burned Wissen instead of a per-group flow alone, and diffusion between peoples is not implemented. The harvest works slots per controlled region. Hollow loyalty is tested by a kernel probe every winter, not by temptation cards. The CLI has no commands `withdraw`, `consent`, `run` and `status-note`. Consent is `ingest --consent`, run marker and status are helpers under `tools/harness/`. Views lie at `view/<people>.json`, subagents are `rc-<agent id>.md`, hooks live in `tools/hooks/`. Validator codes `tier_locked`, `clamp_dead`, `missing_source` and `outcome_cap` do not exist, the checks report `tier_gap`, `missing_upkeep` and `budget_effect`, and the budget codes carry the prefix `content.`. The worked path of the design is not pinned as a validator fixture. Checked-in test campaigns under `examples/campaigns/` do not exist.

### 2026-10-03 discarded campaign memory on main

- Source. `knowledge/partien/`, `knowledge/archiv/`, `knowledge/welten/schwarzkaemme/` and the old `knowledge/INDEX.md`.
- Target. [decisions.md](decisions.md) D23.
- Reason. the chat game-master campaigns are no longer played, and `knowledge/` now holds the project specification. The memory stays in the branch `archiv/vor-neuaufbau`.

### 2026-10-03 integrated docs into knowledge

- Source. `docs/*.md` except the legacy documents that legacy code still references.
- Target. this knowledge base, with `README.md`, `CLAUDE.md`, `.claude/commands/` and code comments pointing to it.
- Result. `docs/` keeps only `Frontend-Contract.md`, `Spielmechanik.md` and `Spielstart-Prompt.md` for the legacy dashboard and the dice tool until their removal.

### 2026-10-03 milestone M1 merged in two waves

- Changed. Wave 1 merged the removal of the earlier games, the split server with campaign creation, the label layer with English default and German, synthesized audio, the balance simulation and fuzzing, the paths model with research points and the machine-readable kernel data for the board, and this knowledge base. Wave 2 merged the game shell (start screen, menus, settings, rules, end screens), the paths wheel and council strip, the module views and map plans, the Hochland content for every path with an expanding and defending fallback AI, and the harness on paths. Lanes for named saves with crash-safe load and for kernel defects found by fuzzing followed. The remaining legacy files (`docs/`, `harness/`, `examples/`) were removed.
- Decided. Paths and achievements, English as default UI language, start screen and menus, synthesized audio and end screens as M1 decisions. The owner confirmed the paths model with an own branch described in a prompt and proposed configuring the set of paths per game, recorded as a decision candidate in [playtests.md](playtests.md).
- Verified. Unit, acceptance and all board end-to-end specs green on the merged `main`. The live campaign `hochland-1` played through turn 2 on the new kernel, was repinned after content changes, and its journal replays.
- Open. The independent reviews, the fix round and the reconciliation of every knowledge document with the merged code did not run. The owner's UI feedback (playtest entries 23 to 36), a read-only audit of the live game and kernel defects found by fuzzing wait in [handoff.md](handoff.md) for the saved workflow `realmcraft-refactor-verify`.

### 2026-10-04 refactor wave merged

- Changed. Six lanes of the saved workflow `realmcraft-refactor-verify` were merged into `main`. Core removed the dead forwarders, the view descriptor layer and duplicate alive checks and names labour units clans. Content made `validate`, `new` and `repin` refuse a world package that lacks a kernel label key and replaced stale citations. Harness reads candidate limits, maximum tier and member loyalty from the world rules, shares one campaign path parser between guard and proposal check, keeps the player's rolls only in the draft without the ledger `rolls.json`, and trims the portrait client. Server dropped the `/env.js` route, serves static files only from the board's folders and shares one test server starter. Board removed the `?demo` prototype. Tests pinned the acceptance driver to the field names the CLI emits and dropped dead guards and unplayed fixtures.
- Decided. Core and content resolved the unwired label-key option in opposite directions. The merge keeps the refusal at `validate`, `new` and `repin` and takes the keys from `kernelLabelKeys()` in `engine/content/validate.js` (probe bands, loyalty bands, order types), since the view keys left with the view descriptors and stay covered by the Hochland content test. Server and tests lanes both built the shared server starter, the server lane's `tests/lib/server.mjs` stays and refuses a pinned owner port.
- Verified. Check, unit, acceptance and the board end-to-end specs green on the merged `main`. The golden replays of every lane, run against the pre-merge `main` and the merged `main`, give identical hashes once the intended changes are normalised (no `rolls.json`, no `rolls` anchor in journal entries, no budget alias `N`, no null severity on finding rows, no `upkeepRisk`, harvest `clans`). The stored draft, the journal input and the round reports list the player's rolls in a different key order, with equal content. The live campaign `hochland-1` repinned without change, and its preview answers exit 3 for the unrolled event probe of the turn.
- Open. The session ended in a controlled way during the UI phase, so UI optimisation, verification and close did not run. Their next step and the findings of the UI design audit wait in [handoff.md](handoff.md). `bestimmung.js` and `tools/sim/simulate.js` keep their own alive checks, the saved workflow still names `views.js` in its core lane description, the module spec keeps fixed waits until the board exposes a settled event queue, the swap button of an order option has no browser test, and some dead board CSS and labels outside the accepted candidates remain.

### 2026-10-15 corrected board planning and map usability

- Source. Owner request for a fresh optimized playtest and the UI audit of October 4 in [handoff.md](handoff.md).
- Target. Board camera, planning controls and their browser regressions, [frontend.md](frontend.md) and [playtests.md](playtests.md).
- Result. Known-world fit, readable province names, scoped shortcuts, a canonical research labour row, dismissible in-viewport blockers, retained control focus and explicit empty-turn/withdrawn-roll review. Existing campaign state and world rules remain compatible. Conceptual directions discussed in the chat remain proposals.

### 2026-10-15 integrated campaign-authoring requirements and corrected proposal status

- Source. Owner conversation requesting free world creation, editable drafts, campaign-dependent presentation and an observed chat initialization.
- Target. [new-game-design.md](new-game-design.md), [vision.md](vision.md) and [INDEX.md](INDEX.md).
- Result. Separated owner requirements, exploratory preferences, assistant-created worlds and untested conversation hypotheses. The proposed short-question method remains a design experiment. Inspection of server/newgame.mjs confirms that browser creation still uses world templates. The new chat simulation begins with no selected world sketch or accepted visual style.

### 2026-10-15 corrected the first initialization question after owner feedback

- Source. The owner rejected the bare activity question and requested concrete worldbuilding choices, including atmosphere, colour, beliefs and social organization. Images are permitted where useful.
- Target. [new-game-design.md](new-game-design.md).
- Result. Revised the proposed conversation to offer combinable alternatives and begin with atmosphere. The next chat simulation will test this revised wording. No fictional world details were adopted through this correction.

### 2026-10-15 integrated spoken narrator requirement from the start simulation

- Source. Owner request to hear the offered scenes from a storyteller and retain that feature in the game.
- Target. [new-game-design.md](new-game-design.md).
- Result. Recorded narration as a presentation requirement with voice characteristics and proposed playback controls still open. Board inspection confirmed synthesized cues and ambience only. The local voice check found only an English desktop voice, so no German recording or in-game narration was delivered.

### 2026-10-15 integrated delegated setup and confirmed narrator delivery

- Source. Owner selection of calm, mysterious narration with dry humour, followed by delegation of the starting concept and setup.
- Target. [new-game-design.md](new-game-design.md) and [the prototype setup snapshot](../snapshots/initialization-2026-10-15.md).
- Result. Added a provisional delegated-start path and recorded the fictional setup separately from kernel state. The observer distinguishes authorized defaults from adopted world preferences. The next observation concerns the first player action, so effectiveness remains unassessed.

### 2026-10-15 integrated synthetic initialization walkthroughs and independent reviews

- Source. Owner request for generated answers, subagents and iterative evaluation, followed by start_simulation, start_boundary_review and initialization_observer outputs inspected by the main agent.
- Target. [new-game-design.md](new-game-design.md) and [the source transcripts](../research-artefacts/initialization/synthetic-iterations-2026-10-15.md).
- Result. Revised the method toward an editable draft, explicit change effects, reversible preview and separate start. Recorded failures involving unchosen ships, an unchosen community decision, a missing control comparison and unresolved scarcity. Simulated answers remain generated research material; human acceptance and browser behavior remain untested.

### 2026-10-15 corrected planning entry and board hierarchy

- Source. Owner screenshot and request to improve the actual UI, followed by browser inspection and independent source review.
- Target. Shared home selection, empty-order action, council default and loyalty badge, pending-roll turn styling, responsive camera and [frontend.md](frontend.md), [playtests.md](playtests.md).
- Result. Planning opens the own camp or settlement with context focus. The review exposed the settled labour-warning fallback, which now uses the same route. Selected home remains visible across the narrow breakpoint. Final project and browser suites pass. Wide and narrow states were visually inspected; actual 200-percent zoom remains unverified. The map-first composition and current world tokens are retained.

### 2026-10-15 added an executable community-view experiment

- Source. Owner requests for code-generated runtime graphics and working UI prototypes after comparing community-first concepts.
- Target. Community scene and view, shared board navigation, hidden-map camera lifecycle, [frontend.md](frontend.md#community-prototype) and [new-game-design.md](new-game-design.md).
- Result. An optional community view uses real work assignments and existing context editing, with reversible visual season preview. Independent source review found hidden-map camera loss and narrow council overlap; regression cases cover both corrected paths. Final project and browser suites pass. Wide, winter and narrow labour states were visually inspected; actual 200-percent browser zoom remains unverified. This experiment does not add game mechanics or accept an art style.

### 2026-10-15 separated development preview from community play

- Source. Owner correction that the season should not be selectable in play, unclear work-area values and duplicate planning entry.
- Target. Community view and styles, shared empty-order entry, browser regressions and [frontend.md](frontend.md#community-prototype).
- Result. Normal play follows the campaign season. Visual preview requires explicit debug mode. Work-area counts identify clans; the home entry names its kind; community mode omits the duplicate planning shortcut. CLI reads establish that the selected campaign and save are the fresh Hochland game, not an instantiated free-world draft. Final project and browser suites pass; wide and narrow controls were visually inspected.

---
title: Development plan
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: active
language: en
created: 2026-10-15
updated: 2026-10-17
related: [vision, new-game-design, design, frontend, testing, playtests, plan-m1, journal, handoff]
---

# Development plan

The implemented baseline is a turn-based strategy kernel, world packages, an external agent harness and a browser board. The board has chat-led realm creation through a copied prompt and shared workshop, optional direct editing and pure map previews, a separate template start, five-pass procedural cartography, `highlands`, `riverlands` and `drylands` community views, the self-contained vertical Weltenstrom visualization (`strom.html`), direct main/minor planning, research, council medallions, module views, named saves with pre-load recovery, audio cues and a rules reference. The shared Weltenwerkstatt direction frames these controls, with a compact native research view on phones. Its artistic acceptance remains open. [frontend.md](frontend.md) and [design.md](design.md) describe the current controls, visual specification and product boundaries. Existing campaigns remain private and are never development fixtures.

## Continuation

Continue from the relevant section below with one bounded task and its acceptance checks. The M1 build and its first refactor wave are already integrated. The old complete refactor workflow is retired from the executable workflow directory; its source remains in Git history. The supported shared-draft, preview, explicit-start and save/load journey now has a continuous developer browser regression, including retained orders and recoverable backups ([testing.md](testing.md#chat-workshop-coverage)). A documentation reconciliation or passing fixture suite does not establish completion of a live multi-turn game or the owner's artistic acceptance.

[plan-m1.md](plan-m1.md) retains the milestone contract and its current evidence limits. [playtests.md](playtests.md) retains owner feedback and the historical UI audits. [handoff.md](handoff.md) is only an inbox for material awaiting integration, not a second backlog.

## Playable candidate 0.2.0

REALMCRAFT-PLAYABLE-INCREMENT-2026-10-17 implements the season planning and continuation journey as a local candidate. The application version advances from package 0.1.0 to 0.2.0. Campaign schema, kernel rules version and knowledge schema keep their own existing versions.

- Provide one Season plan that distinguishes assigned clans, resource stocks and reserved order costs, economic preview and the separate research budget. Reuse existing assignment, action and research controls. Explain forecast limits rather than presenting unresolved effects as certain totals.
- Refuse explicit positive assignments to resources without terrain yields or a positive standing yield modifier. Preserve inherited allocations so legacy rival work cannot block an unrelated season. Old allocations remain readable and can be reduced in the UI. Local production still depends on the kernel forecast.
- Show the previous season's own logged resource changes with its actual season and a return to planning. Preserve partial/missing report states and foreign visibility boundaries.
- Offer an explicit loopback-only demo capability on a temporary campaign root. It resumes an already sealed turn through the existing offline harness with no proposal templates or provider calls. The normal owner-root server never offers it. Repeated, stale and unsealed requests and an already active harness must refuse safely. The dedicated temporary root is for fallback testing only and must not run concurrent external /zug commands.
- Preserve free realm authoring, reviewed explicit start, named saves, pre-load backup and reload recovery. Exercise several season transitions, review results, continue planning and restore an earlier plan on broad and phone layouts.

Acceptance requires focused kernel and server regressions, complete project and browser gates, and inspected broad/narrow screenshots from an isolated playable candidate. The demo uses kernel fallback, not live LLM agents or human gameplay evidence. Arbitrary new mechanics, narrated audio and external raster artwork remain outside this increment. Production changes and final evidence are recorded in the responsible documents before local commit. No tag, push or release is authorized.

## Readiness evidence

The 17 October readiness check repeated the authored-realm and season-restoration journeys at desktop and phone widths and prepared an isolated assessment campaign with a named opening save. The route is documented in [operations.md](operations.md#guided-assessment-and-recovery), with verification limits in [testing.md](testing.md#readiness-recheck-of-17-october-2026). Technical delivery is recorded in [journal.md](journal.md). Human gameplay and artistic acceptance remain open.

## Completion criteria

- A player can create, revise, preview and start a realm whose supported mechanics pass kernel validation.
- Planning, saves, agent progress and continued play have explicit, working UI paths with truthful consequences and no loss of drafts.
- Regression checks and observed play cover the implemented behavior; artistic and gameplay acceptance remain separate human decisions.

## Milestones and dependencies

| Milestone | Entry condition | Exit evidence |
|---|---|---|
| Kernel boundaries | Reproduce each listed input or projection gap on a temporary fixture | Focused regressions reject or correct the case and preserve unrelated state/library, followed by the project gates |
| UI corrections | Reproduce a current task with a relevant dense or narrow fixture | The specific interaction works by pointer and keyboard, with inspected screenshots and retained draft state |
| Realm creation | Define the creation-draft contract and supported mechanical vocabulary from new-game-design.md | A reversible editable preview creates a separate valid campaign only after explicit Start |
| Intentions and agent integration | Define the intention-to-order contract and service boundary before execution | Costs and consequences are reviewed before commitment; a real harness run can resume and return to planning |
| Narration | Settle the voice implementation | Playback controls work in their actual user flows, with narration quality heard and accepted separately |
| Sustained play | The relevant flow is implemented and runnable | Observed multi-turn evidence, remaining findings and human acceptance are recorded without turning scripted tests into live-agent claims |

These dependencies constrain individual implementations. They do not assign deadlines or authorize every task at once. The owner's current assignment selects the bounded work.

## Kernel corrections and trust boundaries

| Work | Evidence and acceptance boundary |
|---|---|
| Productive labour validation | Implemented in candidate 0.2.0. Explicit unsupported work is refused, positive standing yields remain valid and local idle work is reported. Inherited allocations retain their semantics so legacy rival plans do not block unrelated seasons. The kernel, adapter and browser regressions are described in [testing.md](testing.md#season-planning-and-offline-continuation). |
| Expose effective research costs to agents | Implemented on 2026-10-17. `developmentsFor(state, env, pid)` in `engine/harness/tasks.js` attaches `effectiveCost: researchCost(state, env, pid, item.ref)` to `research` and `candidates` across research, rival and judge task contexts, validated by `engine/schemas/campaign.js` and `tests/unit/harness-tasks.test.js`. |
| Bound other spatial inputs | Tile keys now share bounded schema/runtime validation before geometry. Numeric region-id bounds and pathological world-package chunkSize values remain separate input gaps. Reproduce them without invoking dangerous geometry before selecting their supported contract. |
| Avoid library residue after a refused destiny | Implemented on 2026-10-17. In `engine/harness/ingest.js`, `applyItem` (`case 'bestimmung'`) snapshots `run.lib` before `storeContent` and restores `run.lib` and `holder.library` whenever `offerDestiny` refuses the offer, covered by `tests/unit/engine/cli-ingest.test.js`. |
| Align configurable collapse with the world schema | Implemented on 2026-10-17. `WORLD_DEFS.regeln.properties.tuning` in `engine/schemas/world.js` accepts optional `collapseCore: int(0, 99)` matching `tune(env, 'collapseCore')` in `engine/core/rules.js`, covered by `tests/unit/engine/schema-amendments.test.js`. |
| Review sequential trade identifiers | Source inspection confirms that new `of-<turn>-<seq>` and `ct-<turn>-<seq>` identifiers expose the shared ledger counter. Player projection filtering alone does not prevent inference from gaps. A compatible identifier change and a regression comparing otherwise equal player-visible states remain open. |
| Review status metadata projection | Implemented on 2026-10-17. `recordVerdict` and `projectStatus(status, player)` in `engine/harness/status.js` and `handleCampaignFile` in `server/campaigns.mjs` redact foreign people summaries and proposal items as well as unshown judge findings from player-projected `status.json`, covered by `tests/unit/engine/harness-io-status.test.js` and `tests/unit/spielbrett-serve.test.js`. |

Legacy journal anchors and their regression tests already exist. Do not repeat the old task to add them. The local `wip/fuzz-ingest` branch is recovery evidence for proposed tests; inspect its cases before adopting any part and verify the long-fuzz runner's coverage after a fix.

## Product integrations

- The free realm start and active season planning (`planning`) use the existing harness chat as the primary conversational control deck, while the browser board acts as the visual perception and observation companion. A copied prompt and versioned shared draft connect initialization to the browser through silent background calls to `realm-workshop.mjs` without exposing internal enum keys, JSON paths or revision numbers. Responses use a pure Markdown layout without fenced code blocks or bullet lists (`### REALMCRAFT v0.2.0` during discovery and `### REALMCRAFT v0.2.0 · <World Name>` once named, browser sync status line, `>` scene impulse, and `####` option subheadings with short paragraphs and bold key terms). A two-stage diagnostic funnel (`draft: null` with open `questions` to a derived `draft`) progresses from general concepts (core conflict and drive, community organization and movement) to story-concrete setting elements at the end (science fiction, fantasy, historical or real-world, or custom setting), closing each step with the conversational control set (`Direktwahl`, `Verbinden`, `Eigenes Konzept / freie Intention`, and `Synthese-Modus` for coherent/professional combinations, high-tension combinations or unconventional new perspectives). Supported mechanics, a reversible generated-map preview and explicit independent campaign creation are implemented, with a separate manual draft retained. [new-game-design.md](new-game-design.md) defines its contract and limits. A standalone model service remains outside this implementation. Earlier fictional chat drafts are not imported automatically.
- In `planning`, the game master uses fast subagents and kernel `preview` / catalogue reads to curate concrete Season Action Packages (combining 1 main action, up to 2 minor actions, clan labour allocation and research) in the same `### REALMCRAFT v0.2.0 · <World Name>` Markdown layout and `Steuerungs-Modi`, translates free player intentions into executable orders, writes the draft via `node engine/cli.mjs preview --as <player> --draft <file> --campaign <cid> --json` and records rolls via `node engine/cli.mjs roll`, while live `draft` SSE events immediately synchronize `drafts/<player>.json` to the open browser board. A standalone in-browser intention interface and a background agent service are not built.
- Continue work on the distinction between labour, resource stocks, research points, main/minor actions and free actions. Retain `board.labour.full-hint` when all clans (`core`) are assigned so disabled `+` buttons are self-explanatory, and keep shared order and preview paths rather than introducing competing draft editors.
- The code-drawn community view (`js/community/scene.js`, `js/community/view.js`) supports all three canonical landscapes (`highlands`, `riverlands`, `drylands`) alongside the self-contained vertical Weltenstrom visualization (`strom.html`). Extending the scene to a complete spatial inventory of individual built structures and institutions remains optional future work.
- Add spoken narration and playback controls for the owner's calm, mysterious narrator with dry humour. Existing synthesized interaction and event cues do not supply narration. A voice/provider choice and audio-quality acceptance remain open.

## Current UI review

Reproduce a specific current case before implementing an old audit recommendation. The historical observation alone does not establish a current defect.

- Correct the visualization studio's automatic selection of the first option for unanswered pending choices in `js/strom.js` before sealing. Require an explicit player choice, preserve the unfinished draft and cover the behavior with a focused regression. Source inspection confirms the behavior.
- Verify that the studio's dice glyphs preserve the raw 1d10 face and distinguish an open roll from a rolled value. A general season-transition browser check does not by itself establish glyph fidelity.
- Review the added Astrolabium, Naturgemälde and Kräfte-Webstuhl renderers for keyboard operation, language handling, narrow layouts and decision-flow parity. These are alternatives to the same campaign, not additional kernel phases. Existing Weltenstrom browser coverage does not by itself exercise their tabs and interactions.

- Observe the compact chat entry, two-stage game-master funnel and harness-curated Season Action Packages in actual play. The copy action, replacement status and short process line are implemented. The view stays compact with open questions while `draft` is `null` during general-to-concrete discovery and reveals the large studio once the derived shared draft is loaded. [frontend.md](frontend.md#chat-workshop-composition) records this interaction contract. Broader artistic acceptance remains open.

- Check remaining tooltip edge cases and scrolling containers, additional long labels, actual browser zoom and contrast in states beyond the inspected palette pairs. Retain the tested compact research navigation, aligned visible/accessibility tier labels, focus restoration and creator validation/step-orientation fixes.
- Clarify world-prose language within a translated interface, map symbols and empty layers, the place-list layout, council actions and the meaning of camp strength.
- Review chronicle turn/date semantics and event-card icon/deadline wording on appropriate fixtures. A surviving settlement after population collapse is not by itself an invalid end summary.
- Retain the verified planning, draft-save, empty-turn review, slot replacement, portrait fallback, `board.labour.full-hint` reallocation guidance and focus fixes. Update the owner-feedback table only for behavior that was actually inspected.
- Retain the serialized live-refresh queue, live `draft` SSE synchronization from `drafts/<player>.json` to the open board, matching public-view/content fingerprints, visible-page reconciliation and save/load barriers. Deterministic regressions reproduce a transient read failure and overlapping notifications independently of the earlier intermittent suite timeouts. The cause of those earlier timeouts was not established. Assess further polling or chronicle-index optimization only from observed campaign behavior.

## Verification and acceptance

- Run a complete multi-turn browser game with the real agent harness, recording resolved actions, research, narrative grounding, reload and continued planning. Existing scripted CLI acceptance and separate browser cases are not that live-agent test.
- Exercise simulation profiles over a stated scenario and inspect balance and proposal diversity. The simulation and acceptance-measurement tools exist; their presence is not a live measurement result.
- Reassess integrity-layer simplification and possible agent batching from observed operation. The separate roll ledger has been removed. Journal chains, anchors, sealed drafts and recovery remain; changing them needs an explicit decision and compatibility evidence.
- Reproduce remaining M1/playtest criteria with fixture evidence and separate technical verification from human artistic and gameplay acceptance. [testing.md](testing.md) owns the quality gates and their current gaps.

## Owner decisions and preserved material

Per-campaign path configuration, editable campaign rules and the final artistic direction remain product decisions. The owner has requested freely described worlds; that does not establish a decision to let arbitrary runtime rule changes bypass the kernel. Viewer settings remain distinct from campaign configuration.

The untracked `design/`, `schwarzkaemme/` and owner save material, the frozen `realmcraft-spieltest` worktree and the local `archiv/vor-neuaufbau` branch remain untouched. Keeping or removing those artifacts is an owner decision. New portrait assets are optional; key readiness was not inspected.

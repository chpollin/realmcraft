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
updated: 2026-10-16
related: [vision, new-game-design, frontend, testing, playtests, plan-m1, journal, handoff]
---

# Development plan

The implemented baseline is a turn-based strategy kernel, world packages, an external agent harness and a browser board. The board has free realm creation with editable drafts and pure map previews, a separate template start, map and optional community views, direct main/minor planning, research, council, module views, named saves with pre-load recovery, audio cues and a rules reference. The shared Weltenwerkstatt direction frames these controls, with a compact native research view on phones. Its artistic acceptance remains open. [frontend.md](frontend.md) describes the current controls and product boundaries. Existing campaigns remain private and are never development fixtures.

## Continuation

Continue from the relevant section below with one bounded task and its acceptance checks. The M1 build and its first refactor wave are already integrated. The old complete refactor workflow is retired from the executable workflow directory; its source remains in Git history. A documentation reconciliation or passing fixture suite does not establish completion of a live multi-turn game or the owner's artistic acceptance.

[plan-m1.md](plan-m1.md) retains the milestone contract and its current evidence limits. [playtests.md](playtests.md) retains owner feedback and the historical UI audits. [handoff.md](handoff.md) is only an inbox for material awaiting integration, not a second backlog.

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
| Validate productive labour keys and account for idle work | `checkLabour` accepts all resource ids, so an assignment to Wissen can pass without producing research. The board picker is corrected, but kernel validation and legacy-allocation migration still need a regression proving refusal or explicit correction and a truthful forecast. |
| Expose effective research costs to agents | `pathsView` carries refs, while the board adapter computes the complexity surcharge through `researchCost`. Research and judge contexts must receive the effective cost, with the relevant opening/working-state semantics tested. |
| Bound other spatial inputs | Tile keys now share bounded schema/runtime validation before geometry. Numeric region-id bounds and pathological world-package chunkSize values remain separate input gaps. Reproduce them without invoking dangerous geometry before selecting their supported contract. |
| Avoid library residue after a refused destiny | `storeContent` precedes `offerDestiny`. A partially accepted proposal can keep a refused destiny card in its returned library. Test partial acceptance and prevent that residue without losing accepted items. |
| Align configurable collapse with the world schema | `tuning.collapseCore` is read by the kernel but rejected by the closed world schema. Decide the supported package contract and test it before exposing the setting. |
| Review sequential trade identifiers | The data contract records a global trade-id counter. Check the player-visible inference before changing ids or making a fog-safety claim. |
| Review status metadata projection | Full judge text is gated by visible cited events, but the server exposes raw status metadata and the board shapes foreign research proposal titles/reasons. Test what each player can see before choosing the projection/filter change. |

Legacy journal anchors and their regression tests already exist. Do not repeat the old task to add them. The local `wip/fuzz-ingest` branch is recovery evidence for proposed tests; inspect its cases before adopting any part and verify the long-fuzz runner's coverage after a fix.

## Product integrations

- The free realm start is implemented through descriptions, editable neutral defaults, supported mechanics, a reversible generated-map preview and explicit independent campaign creation. [new-game-design.md](new-game-design.md) defines its contract and limits. Further adaptive questions, LLM-generated suggestions and a rendering vocabulary for authored worlds remain outside this implementation. Earlier fictional chat drafts are not imported automatically.
- Translate free player intentions into existing executable orders, or ask for a missing target or unsupported mechanic. Show the actual kernel costs and consequences before confirmation. An in-game intention interface and a background agent service are not built.
- Continue work on the distinction between labour, resource stocks, research points, main/minor actions and free actions. Keep shared order and preview paths rather than introducing competing draft editors.
- Extend the code-drawn community view from the authored Hochland scene to actual building/institution changes and a tested rendering vocabulary for authored worlds. The current scene does not represent a complete spatial inventory.
- Add spoken narration and playback controls for the owner's calm, mysterious narrator with dry humour. Existing synthesized interaction and event cues do not supply narration. A voice/provider choice and audio-quality acceptance remain open.

## Current UI review

Reproduce a specific current case before implementing an old audit recommendation. The historical observation alone does not establish a current defect.

- Check remaining tooltip edge cases and scrolling containers, additional long labels, actual browser zoom and contrast in states beyond the inspected palette pairs. Retain the tested compact research navigation, aligned visible/accessibility tier labels, focus restoration and creator validation/step-orientation fixes.
- Clarify world-prose language within a translated interface, map symbols and empty layers, the place-list layout, council actions and the meaning of camp strength.
- Review chronicle turn/date semantics and event-card icon/deadline wording on appropriate fixtures. A surviving settlement after population collapse is not by itself an invalid end summary.
- Retain the verified planning, draft-save, empty-turn review, slot replacement, portrait fallback and focus fixes. Update the owner-feedback table only for behavior that was actually inspected.
- Retain the serialized live-refresh queue, matching public-view/content fingerprints, visible-page reconciliation and save/load barriers. Deterministic regressions reproduce a transient read failure and overlapping notifications independently of the earlier intermittent suite timeouts. The cause of those earlier timeouts was not established. Assess further polling or chronicle-index optimization only from observed campaign behavior.

## Verification and acceptance

- Run a complete multi-turn browser game with the real agent harness, recording resolved actions, research, narrative grounding, reload and continued planning. Existing scripted CLI acceptance and separate browser cases are not that live-agent test.
- Exercise simulation profiles over a stated scenario and inspect balance and proposal diversity. The simulation and acceptance-measurement tools exist; their presence is not a live measurement result.
- Reassess integrity-layer simplification and possible agent batching from observed operation. The separate roll ledger has been removed. Journal chains, anchors, sealed drafts and recovery remain; changing them needs an explicit decision and compatibility evidence.
- Reproduce remaining M1/playtest criteria with fixture evidence and separate technical verification from human artistic and gameplay acceptance. [testing.md](testing.md) owns the quality gates and their current gaps.

## Owner decisions and preserved material

Per-campaign path configuration, editable campaign rules and the final artistic direction remain product decisions. The owner has requested freely described worlds; that does not establish a decision to let arbitrary runtime rule changes bypass the kernel. Viewer settings remain distinct from campaign configuration.

The untracked `design/`, `schwarzkaemme/` and owner save material, the frozen `realmcraft-spieltest` worktree and the local `archiv/vor-neuaufbau` branch remain untouched. Keeping or removing those artifacts is an owner decision. New portrait assets are optional; key readiness was not inspected.

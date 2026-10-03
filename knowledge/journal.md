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
updated: 2026-10-03
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

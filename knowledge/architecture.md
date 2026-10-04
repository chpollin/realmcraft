---
title: Architecture
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
related: [rules-kernel, data-contracts, agents-harness, frontend, testing, operations]
---

# Architecture

RealmCraft is plain ES modules without a build step on Node 21 or later. Four parts cooperate around one campaign folder, namely the deterministic rules kernel with its CLI, the world packages, the agent harness in Claude Code and the map-first game board served by a small Node server. The only writer of campaign state is `engine/cli.mjs`.

## Components

| Part | Location | Role |
|---|---|---|
| World generator | `engine/world/` | Pure hex world from seed and `welt.json` (`createWorld`, `tileAt`, `regionOf`, `regionInfo`, `reveal`, `findPath`, `reachable`, `findStart`, `placePeoples`, hex helpers). Chunks are generated on demand with identical results regardless of order |
| Rules kernel | `engine/core/` | Turn pipeline (`createCampaign`, `preview`, `seal`, `apply`, `open`, `repin`), orders, probes, economy, research, council, events, destiny, map, military, fog (`projectFor`), log and hashing |
| Modules | `engine/modules/` | Lebensweise, Handel, Magie and Militär as DOM-free deterministic modules in a fixed registry order |
| Content | `engine/content/` | Schema interpreter, validator, power budget and append-only campaign library |
| Schemas | `engine/schemas/` | Data contracts of every file, the primitive set and the budget tables ([data-contracts.md](data-contracts.md)) |
| Harness IO | `engine/harness/` | Atomic file IO with locks, task building, ingest of proposals, `status.json` (Node only) |
| Fallback AI | `engine/ai/fallback.js` | Deterministic draft for an AI people without a valid agent draft, computed on its projection |
| CLI | `engine/cli.mjs` | The only writer of `campaigns/<cid>/`, with journal, roll ledger, campaign lock, replay and named saves |
| World packages | `welten/<id>/` | Generator, rules, labels, style and content of a world ([world-packages.md](world-packages.md)) |
| Agent harness | `.claude/agents/`, `.claude/commands/`, `tools/hooks/`, `tools/harness/`, `.claude/settings.json` | Subagents, `/zug` and `/partie`, guard and status hooks, helpers ([agents-harness.md](agents-harness.md)) |
| Game board | `spielbrett/` | Map-first browser surface that runs the kernel's preview on the player's projection ([frontend.md](frontend.md)) |
| Dev server | `serve.mjs` | Static files, fog-safe campaign files, draft and seal endpoints, server-sent events |
| Tests | `tests/` | Unit, acceptance, end-to-end and visual tests ([testing.md](testing.md)) |

The kernel never imports Node modules outside `engine/harness/`, `engine/cli.mjs` and the tools, so `engine/core/`, `engine/modules/`, `engine/content/`, `engine/schemas/` and `engine/world/` load unchanged in the browser. `engine/core/env.js` builds the read-only environment from the pinned package and a content resolver, so the core does not need the library module.

## Data flow of a turn

```
browser (spielbrett)                 serve.mjs                          engine/cli.mjs                 Claude Code
--------------------                 ---------                          --------------                 -----------
reads view/<player>.json      <-     GET /campaigns/<cid>/...
preview() on the projection
POST /api/draft {draft}        ->    cli preview --draft  ----------->  stores drafts/<player>.json
POST /api/seal                 ->    cli seal  ---------------------->  planning -> resolving
                                                                        tasks for the world agent      /zug: rc-world
                                                                        ingest world proposal    <-    agents/proposals/
                                                                        apply: resolving -> agents
SSE view, status, chronik,     <-    watches campaigns/             <-  view, log, status, narrative
report                                                                  tasks for phase B         ->   rc-research, rc-council,
                                                                        ingest proposals         <-    rc-rival, rc-chronicler
                                                                        open: agents -> planning       judges in background
```

The server never computes game logic. A draft change becomes a CLI `preview --draft` call that also stores the draft, and "end turn" becomes `seal`. CLI calls of one campaign are queued in the server and serialised by the campaign lock in the CLI.

## Trust boundaries

- Agents to kernel. Agents write only one proposal file. The validator checks every item against schema, primitive set, budget, grounding and limits, and `ingest` applies only accepted items. Text items carry no values.
- Agents to files. Hooks deny rc subagents any shell, any write except their own proposal and any read beyond their task, the files it lists, their proposal, `welten/` and `engine/schemas/` ([agents-harness.md](agents-harness.md)). `saves/` and the staging folder `.restore/` stay closed even when a task lists a file in them. The hooks are a guard, the kernel is the proof.
- Kernel to files on disk. Every transition appends to `log/journal.json`, a hash chain over state, library prefix, drafts, roll ledger and world package. A transition on files that do not match the last entry is refused (`tamper`). An interrupted commit is rolled forward by the next transition. `replay` re-runs the campaign from `new` or the latest anchor and compares hashes, which is the full proof.
- Browser to server. Campaign files are served from a strict whitelist, namely the campaign index, the player's view and events, `status.json`, narrative files and a player-filtered summary of round reports. POST endpoints accept only loopback clients, same-origin requests, `application/json` up to 64 KB (1 KB for save and load) and drafts of the campaign's player people. Save labels and slot ids are checked against the kernel's limits before the CLI runs, and a label is the player's text, which the board shows as text only. The server binds to 127.0.0.1 by default and checks the `Host` header.
- Secrets. The `.env` key serves only the legacy dashboard's image generation. It never enters campaign files, knowledge or commits.

## Saves

`save` copies the campaign folder under the campaign lock into a hidden folder below `saves/` and renames it to the slot once the copy and the manifest are complete. `load` stages the slot in `.restore/new` and checks the staged copy with the checks of a transition (journal chain, state hash, library and roll ledger prefixes, world drift allowed) and against its manifest. It then writes `autosave-<rev>` of the current files and only after that `.restore/step.json`. The swap moves the current entries into `.restore/old` (step `staged`), rewrites the marker to `swapped` and moves the staged entries in. Every rename is atomic, so the next command of any kind drops a staging without marker and completes one with marker, as an interrupted commit is rolled forward. After the swap the CLI checks the campaign again and rewrites the player views, the index row and `status.json`. The server then pushes `view` and `status` over the event stream, because its watcher reports no event for a renamed folder ([decisions.md](decisions.md), D24).

## Determinism

The kernel uses integer arithmetic only, the sfc32 generator in `state.rng`, canonical JSON with sorted keys for hashing (`engine/core/canon.js`) and a synchronous 64-bit FNV-based hash (`engine/core/hash.js`) that is identical in Node and browser. The same seed, drafts, rolls and proposals produce the same state hash, which `replay` and the determinism tests check.

## Campaign folder

```
campaigns/
  index.json                         campaign list
  <cid>/
    state.json                       state, kernel only
    world.lock.json                  pinned world package (id, version, hash, folder), seed, player, rules version
    library.json                     append-only content library
    rolls.json                       append-only roll ledger
    status.json                      agent round for the board
    run.json                         run marker of a /zug execution
    .campaign.lock                   campaign lock of transitions
    drafts/<people>.json             drafts
    view/<people>.json               projection per people
    view/<people>/events/T0006.json  projected log of a turn
    log/T0006.json                   round report with full log and state hash
    log/journal.json                 hash chain of transitions
    anchors/                         anchor states of repin and chain start
    agents/tasks/T0006/<agent>-<people|all>.json
    agents/proposals/<proposalId>.json
    agents/ingested/, agents/rejected/  proposal files after ingest
    agents/verdicts/                 ingest verdict per proposal
    narrative/chronik/T0006.md       chronicle per turn
    narrative/images/                images
    saves/<slot>/manifest.json       manifest of a named save or an autosave
    saves/<slot>/campaign/           copy of the folder without saves/, lock files and run.json
    .restore/                        staging of a load (new/, old/, step.json), removed when it ends
```

The formats are described in [data-contracts.md](data-contracts.md).

---
title: Index
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: complete
language: en
version: 1.0
created: 2026-10-03
updated: 2026-10-03
authors: [Christopher Pollin]
generated-with: Claude Code (Claude Opus 5.5)
related: [vision, glossary, plan-m1, journal, handoff]
---

# Index

RealmCraft is a turn-based open-world strategy game in the browser. A deterministic rules kernel computes every value, language-model agents in Claude Code propose content that the kernel validates against a power budget, and the player plans on a map-first game board. This folder holds the specification and architecture of the project. Code, schemas and tests remain the source of truth for every number, and a document that disagrees with them is corrected.

## Reading order

A new session reads the action layer [CLAUDE.md](../CLAUDE.md), then this index, then [handoff.md](handoff.md), then the document of the task. Game design work starts with [vision.md](vision.md) and [game-design.md](game-design.md). Kernel or content work starts with [rules-kernel.md](rules-kernel.md) and [data-contracts.md](data-contracts.md). Harness work starts with [agents-harness.md](agents-harness.md). Board work starts with [frontend.md](frontend.md). Running a game starts with [operations.md](operations.md).

## Documents

| Document | Question it answers | Kind |
|---|---|---|
| [vision.md](vision.md) | What RealmCraft is, for whom, and which intentions bind it | Charter |
| [game-design.md](game-design.md) | How a season plays, what the player decides and why the mechanics look the way they do | Specification |
| [rules-kernel.md](rules-kernel.md) | Which rules the kernel executes, in which order, with which formulas | Specification |
| [architecture.md](architecture.md) | Which components exist, how data flows between them and where the trust boundaries lie | Architecture |
| [data-contracts.md](data-contracts.md) | Which files and schemas carry state, content, tasks and proposals, and how they evolve | Specification |
| [world-packages.md](world-packages.md) | What a world package contains and how Hochland is built | Domain knowledge |
| [agents-harness.md](agents-harness.md) | Which agents take part in a turn, what they may read and write and how `/zug` runs | Action |
| [frontend.md](frontend.md) | How the game board is built, which data it reads and which UI rules bind it | Design |
| [testing.md](testing.md) | What the tests guarantee, how to run them and where the gaps are | Quality assurance |
| [decisions.md](decisions.md) | Which fundamental decisions stand, why, and when to revisit them | Decision record |
| [playtests.md](playtests.md) | What the owner reported in playtests and what became of each entry | Specification input |
| [glossary.md](glossary.md) | What the German project terms mean | Navigation |
| [operations.md](operations.md) | How to start the server, play a turn, create a game, repin and recover | Action |
| [plan-m1.md](plan-m1.md) | The binding plan and contracts of milestone M1, written by the contracts agent | Planning |
| [journal.md](journal.md) | How the project got here | Provenance |
| [handoff.md](handoff.md) | Which hand-over points wait for integration | Handoff |

## Terms and naming

German game terms keep German ids in code and data (`lebensweise`, `bestimmung`, `entwicklung`, resource and stat ids) and are explained in [glossary.md](glossary.md). Mechanical building blocks carry English ids (primitives, issue codes, agent ids, bands). In English prose the documents use the English explanation of a term after its first German mention. From milestone M1 the player-facing terms for research are Pfad and Errungenschaft in German and Path and Achievement in English, while internal ids may keep `entwicklung` ([decisions.md](decisions.md), D16).

## Former document names

Code comments and tests still cite the German documents that this knowledge base replaced. Regelkern is [rules-kernel.md](rules-kernel.md), whose section numbers match the cited ones. Spieldesign is [game-design.md](game-design.md), Agentenvertrag and Harness are [agents-harness.md](agents-harness.md), Vertragsaenderungen is [data-contracts.md](data-contracts.md), Entscheidungen is [decisions.md](decisions.md), the Spielbrett playtest log is [playtests.md](playtests.md), and the test strategy and acceptance criteria of the first wave plan (RealmCraft-Plan) are in [testing.md](testing.md) and [vision.md](vision.md). Their German wording is kept in the git history.

## Versions

The schema version of these documents is the `version` field of this index, and the other documents inherit it. Independently versioned contracts are `SCHEMA_VERSION` in `engine/schemas/index.js`, `RULES_VERSION` in `engine/core/rules.js` and the `format` and `version` fields of every campaign file ([data-contracts.md](data-contracts.md)).

## Outside this folder

The legacy round prototypes, the old savegame dashboard and their documents (`docs/Frontend-Contract.md`, `docs/Spielmechanik.md`, `docs/Spielstart-Prompt.md`) remain on `main` until their removal, because legacy code still references them. The memory of the former game-master campaigns and all earlier documents live in the local branch `archiv/vor-neuaufbau` and in the git history. The Obsidian vault holds the project overview and the owner's design notes under `Project Overview RealmCraft`.

## License

Code is MIT, text and documentation are CC BY 4.0.

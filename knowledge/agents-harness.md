---
title: Agents and Harness
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: complete
language: en
created: 2026-10-03
updated: 2026-10-03
authors: [Christopher Pollin]
generated-with: Claude Code (Claude Opus 5.5)
related: [architecture, data-contracts, rules-kernel, operations, decisions]
---

# Agents and Harness

Which agents take part in a turn, what they read and write, in which formats they propose, how the kernel ingests their proposals and how `/zug` runs a turn. The harness is Claude Code with project subagents, two commands, three hook scripts and helpers without game logic ([decisions.md](decisions.md), D12 and D14). Every state change goes through `node engine/cli.mjs`. Agents never write state, they propose content within the canonical primitive set that the validator accepts or refuses (D10).

## Roles and models

The game master is the Claude Code main session on Opus. It starts the turn with `/zug`, dispatches the tasks in parallel, keeps the overall narrative, decides conflicts between proposals and hard cases and releases the turn. It writes no state and acts only through the kernel CLI and the helpers under `tools/harness/`. It never rolls for the player and never recommends an action.

All other roles are project subagents under `.claude/agents/rc-<agent id>.md`. The model is fixed in their frontmatter. The agent id from `AGENTS` in `engine/schemas/common.js` is authoritative, the German role name appears only in prose and labels.

| Role | Agent id | Subagent | Model | Phase | Per | Items (`ITEMS_BY_AGENT`) |
|---|---|---|---|---|---|---|
| World | `world` | `rc-world` | sonnet | A, blocking | campaign | `event`, `feature` |
| Research | `research` | `rc-research` | sonnet | B | people, also AI | `entwicklung`, `bestimmung` |
| Council | `council` | `rc-council` | sonnet | B | player people | `person`, `goal`, `voice` |
| Rival | `rival` | `rc-rival` | sonnet | B | AI people | `orders`, `stance` |
| Chronicler | `chronicler` | `rc-chronicler` | sonnet | B | campaign | `narrative` |
| Coherence judge | `judge-coherence` | `rc-judge-coherence` | opus | after the turn, background | campaign | `finding`, `correction` |
| Balance judge | `judge-balance` | `rc-judge-balance` | opus | after the turn, background | campaign | `finding`, `correction` |
| Narrative judge | `judge-narrative` | `rc-judge-narrative` | opus | every fourth turn and at a chapter change, background | campaign | `finding`, `correction`, `memory` |

The schema also knows the image agent `image` with the item `image`, which is not part of a turn. The turn workers have the tools `Read` and `Write`, the judges additionally `Glob` and `Grep`. No subagent has a shell or the tool to start further agents, and `omitClaudeMd` keeps the development instructions out of their context. The judges see more of the campaign than the workers, because coherence and balance can only be judged across all peoples. What the player sees of them are findings in the panel Weltgeschehen.

## Tasks

The kernel writes the phase A task at `seal`, the phase B tasks at `apply` and the judge tasks on request (`node engine/cli.mjs tasks --agent <id>`). Tasks lie under `agents/tasks/T<turn4>/<agent>-<people or all>.json` (schema `task`). A task with a people reference carries only data derived from that people's projection, so an agent never sees a stock or draft of another people. `read` lists the files the agent may read, `context` is role-specific, and `limits` carries the allowed items, primitives, tags from the world vocabulary, budget rows of the open tiers and, for rivals, the slots of the season. Every task that asks for player-facing text names the narrative language of the campaign in `context.language`.

| Role | Context beyond phase and language |
|---|---|
| World | season, event draws and the situation of every people |
| Research | practice, open tier, tokens, requests with their path, known developments and `pfade`, the derived path view with research points, tier and cap per path |
| Rival | the order catalogue with parameters, up to six valid target settings and an example per order, `pfade`, stock, units, the canonical `names` and the people's own earlier `stances` |
| Council | council, seats, loyalty of new members and the canonical `names` |
| Chronicler | season, chapter, `resolved` (id, turn, kind and reason of every entry the kernel resolved for the player since the previous season began, without phase and turn bookkeeping) and the canonical `names` |

The canonical names are those of the people's projection, peoples, settlements, council members, known developments, research, candidates and features, so a name stays the same from turn to turn. Light findings of the judges (`info`, `warn`) reach `context.findings` of the roles a finding names (`for`) for two turns, and severe findings go to the player through `/zug`. The task builder stays free of file access. The CLI reads these notes, the accepted findings of judge proposals and the accepted stances of each rival, from `agents/ingested/` and the matching verdicts and passes them to `buildTasks`.

## Proposals

An agent writes exactly one file, the path `respondAs.path` of its task, `agents/proposals/<proposalId>.json` with the proposal id `<agent>.<people>.T<turn>` or `<agent>.T<turn>` (schema `proposal`).

| Item | Role | Content and limits |
|---|---|---|
| `entwicklung` | research | an achievement with its `pfad` on an open path of its people, at most at the path's cap, within all validator stages and the limits per turn and people |
| `bestimmung` | research | a destiny after a change of direction, at most two, within the difficulty band |
| `event` | world | in phase A one card per people in the band of its roll whose condition fits that people, plus pool cards |
| `feature` | world | at most one new place per turn on a tile no people knows, far enough from settlements and within the budget |
| `orders` | rival | the complete draft of the AI people for the next turn, which must pass the preview without errors |
| `stance` | rival | text about the people's stance with refs |
| `voice` | council | text of a member about a vote, talk or betrayal |
| `person` | council | a person for an open seat, the kernel sets the loyalty |
| `goal` | council | a goal revision of a member, once per member and year, tags from the vocabulary |
| `narrative` | chronicler | prose with refs to log entries |
| `finding` | judges | finding with severity `info`, `warn` or `severe`, text, refs and the roles whose next tasks receive it |
| `correction` | judges | correction of a finding as a state-changing item or one to three one-off primitives, with `needsConsent` |
| `memory` | narrative judge | condensed campaign memory |

Text items carry no value fields. A number in prose is allowed but never read, and every claim about values must rest on a log entry in `refs`, which the coherence judge checks. A finding is severe only on a real rule contradiction, when the state breaks an invariant or two rules demand incompatible things for the same case.

## Ingest

`node engine/cli.mjs ingest <proposal file>` reads one proposal, `--consent <proposalId>` admits a correction that needs the player's consent. The game master ingests proposals one by one. An ingest without a file would also read judge proposals whose corrections the player has not yet decided.

1. Envelope. Campaign, turn, base revision, agent and phase must match the task, otherwise `stale`. Text items stay admissible after a revision change within the same turn. A proposal for a phase that has not come yet is `deferred` and stays in place.
2. Idempotence. The proposal hash is compared with `state.ingested`. The same hash is a duplicate, a different one a `conflict`. The first verdict stays.
3. Task. Only `agents/proposals/*.json` whose basename equals the proposal id and starts with the agent's id are read. State-changing items need a matching task (`content.no_task`).
4. Items. Every item is validated on its own. Accepted items are applied, refused ones are reported. Developments, event cards and destinies are appended to `library.json` as `id@rev` and entered as candidate, pool card or offer, features go to `map.features`, persons to open seats, rival drafts to `drafts/` and are sealed, text items into the narrative files and views, findings into the log, corrections as effects with the judge as source.
5. Commit. All changes of one proposal happen in one transition with `rev + 1`, logged with source `agent:<id>` and the proposal id in `refs`. The file moves to `agents/ingested/` or `agents/rejected/`, the verdict goes to `agents/verdicts/` and `status.json`.

A proposal without any accepted item is rejected and leaves state and library untouched. A partly valid proposal applies its valid items.

## The turn command /zug

The player clicks "end turn" in the board, which seals the turn, and types `/zug` in Claude Code. `.claude/commands/zug.md` carries the procedure in German.

1. Campaign. `node tools/harness/active-campaign.mjs [--campaign <cid>]` names the campaign. `node tools/harness/run-marker.mjs start` sets the run marker that lets the hooks record agent steps.
2. Leftover judge proposals. Judge proposals of the previous turn are read first. Severe findings are put to the player, and corrections with `needsConsent` are ingested with `--consent` only after the player agrees.
3. Planning. In `planning` the game master runs `preview`, asks for missing rolls with target, modifiers and probability, enters them with `roll` and seals with `seal`.
4. Phase A. `tasks` gives the world task, `rc-world` runs in the foreground, its proposal is ingested, and `apply --expect-rev <rev>` resolves the season. The player can already plan.
5. Phase B. `tasks` gives research per people, rival per AI people, council for the player and chronicler. `tools/harness/status-note.mjs plan` records them as waiting steps, all agents start at once in the background, and each proposal is ingested when its agent ends. Conflicts between proposals are resolved before ingest, by asking the agent for a correction or by ingesting the proposal that fits the events and leaving the other. When every task is ingested or failed, `open` returns the campaign to `planning`, and `status-note.mjs sync` updates the board.
6. Judges. Coherence and balance judges run every turn, the narrative judge when the turn is divisible by four or the player announces a chapter change. `/zug` does not wait for them, the next `/zug` handles their proposals. `run-marker.mjs end` closes the run.
7. Report. A short German report of at most eight sentences, with numbers only from the kernel's answers and no recommendation.

A new campaign starts in turn 0 in phase `agents`, so the first `/zug` runs only phase B and releases the planning of turn 0. A new game is created in the browser, where the server calls `new`, or through `/partie neu` with the options of `new` (rivals, difficulty, language). `/partie` lists campaigns, shows the state of an existing one and offers to run the first turn of a new one by the procedure of `/zug` ([operations.md](operations.md)). The game master speaks to the player in the narrative language the status names (`settings.language`). Both commands carry `disable-model-invocation`, so a development session never starts them on its own. A listening mode in which `/partie` watches the phase and runs the turn without typing `/zug` is planned and not built.

## Hooks

Project hooks in `.claude/settings.json` act in every Claude Code session in the repository, also in development sessions. Every script exits at once without output when the event does not concern a file of a live campaign under `<root>/campaigns/`. The hooks are called in exec form (`command: node` with the script in `args`). A template of the hook block lies in `harness/hooks.settings.json`.

| Script | Event | Effect |
|---|---|---|
| `tools/hooks/guard-state.mjs` | `PreToolUse` for `Write`, `Edit`, `MultiEdit`, `NotebookEdit` | denies every write under `campaigns/` except a proposal file. An rc subagent writes only the proposal of its own task and nothing else, no code and nothing under `.claude/` |
| `tools/hooks/guard-state.mjs` | `PreToolUse` for `Bash`, `PowerShell` | denies an rc subagent every call. In the main session it denies commands that would write under `campaigns/`, except plain calls of the kernel CLI and the harness helpers |
| `tools/hooks/guard-state.mjs` | `PreToolUse` for `Read`, `Glob`, `Grep` | lets an rc subagent read only its task, the files under its `read`, its own proposal, role folders of the judges, `welten/` and `engine/schemas/`. The journal, drafts and foreign views stay closed |
| `tools/hooks/proposal-check.mjs` | `PostToolUse` for `Write`, `Edit`, `MultiEdit` | validates a written proposal with `validateProposal` against task, state, library and world package, and holds two agent duties the kernel does not enforce at ingest. A research achievement names its path (`pfad_missing`), and every ref of a chronicle, a voice or a stance names a log entry the people has seen (`dangling_ref`). On errors it exits 2 and the agent gets the issue list, on success it records the items as pending in `status.json` and returns the budget per item |
| `tools/hooks/subagent-status.mjs` | `SubagentStart`, `SubagentStop` with matcher `^rc-` | sets an agent's step to running and at the end, without proposal and with exact attribution, to failed, then reconciles the status with the files |

The guard and the proposal check act only inside the project root (`REALMCRAFT_ROOT`, else `CLAUDE_PROJECT_DIR`, else the working directory) and read a path with the same helpers (`campaignRel`, `proposalOf` in `tools/harness/lib.mjs`), so the check runs on exactly the proposal writes the guard admits. It resolves every path the way the file system would open it, including `\\?\` prefixes, administrative shares of the local machine, trailing dots and spaces, 8.3 short names, junctions and symlinks, and compares case-insensitively on Windows and macOS. Which task a subagent serves it reads from the launch record Claude Code keeps beside the session transcript (`agent-<id>.meta.json` and the first line of `agent-<id>.jsonl`), where `/zug` names task path and proposal id, or from the binding in `run.json`. This storage format is not a documented interface of Claude Code. When neither source knows the agent, the call keeps the rights of the main session. This fail-open gap is deliberate, because a closed behaviour would block every foreign subagent without `agent_type`.

The shell guard of the main session is a heuristic over the command text and does not catch obfuscated paths. The reliable protection is the kernel, which compares every transition with the hash chain of `log/journal.json` and refuses a state changed outside it (`tamper`).

## Helpers

The helpers under `tools/harness/` write only the run marker and the status view, both through the lock and atomic rename of `engine/harness/io.js`.

- `active-campaign.mjs` names the campaign a run works on, from an active run marker, else the newest playing campaign of `campaigns/index.json`, else the only campaign folder.
- `run-marker.mjs start|end|show` writes `campaigns/<cid>/run.json`.
- `status-note.mjs init|plan|step|sync` starts the turn status, records open tasks as waiting steps, sets single steps (for example a hanging agent to failed) and reconciles with the files.
- `reconcile.mjs` is that reconciliation. The phase follows `state.json`, a step is done once the proposal of its task exists, and a step without proposal failed once the kernel phase has moved past its task. Judges run through planning and never fail here.
- `dryrun.mjs` runs the `/zug` procedure without a language model, with recorded proposals from `tests/fixtures/harness/T<turn4>/` ([testing.md](testing.md)).
- `acceptance.mjs` measures how often the live agents' proposals pass, read-only from `agents/verdicts/`, per agent and item type with the most frequent refusal reasons, optionally limited by turn and agent.

## Failure handling

A failed agent never stops the turn. Without a proposal, with an invalid one or after its time its step is failed in `status.json`, Weltgeschehen shows it as failed, and the kernel falls back.

| Role | Fallback |
|---|---|
| World | event cards drawn from the pool by RNG, no new features |
| Council | no voices in words, open seats stay open |
| Rival | fallback policy `engine/ai/fallback.js` for that people |
| Research | pool candidates from `open` |
| Chronicler | no chronicle text for the turn, the round report remains |
| Judge | no finding this turn |

Exit 4 at `seal`, `apply` or `open` means wrong phase or a foreign change. The game master repeats nothing, reads the state with `status` and reports it. A proposal that arrives after the next `seal` is stale and refused. Without the hooks `/zug` still works, but the pre-check at writing, the write guard and the automatic status steps are missing, while `ingest` still validates every proposal.

## Known findings from live turns

- A rival guessed order parameters and its orders were refused, which led to the order catalogue with valid targets in the rival task ([playtests.md](playtests.md), entry 22).
- The chronicler claimed a migration that did not happen, names drifted between turns (Rauchschau and Psilschau), and stances were overwritten instead of continued. M1 answers them with `context.resolved` and the ref check of the proposal hook, the canonical `names` in every prose task, and the earlier `stances` in the rival task, and the coherence judge looks for all three.

---
title: Operations
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
related: [agents-harness, architecture, world-packages, testing]
---

# Operations

Runbook for playing RealmCraft with Claude Code as game master. All commands run in the repository root with Node 21 or later. Every write to a campaign goes through `node engine/cli.mjs`, and nothing under `campaigns/` is edited by hand.

## Start the server

```sh
npm run serve                 # http://localhost:4173
PORT=4200 node serve.mjs      # another port (Git Bash)
$env:PORT=4200; node serve.mjs   # PowerShell
```

The board is at `http://localhost:<port>/spielbrett/`, a specific campaign at `/spielbrett/?campaign=<cid>`, the prototype at `/spielbrett/?demo`. The server binds to 127.0.0.1 unless `HOST` says otherwise and serves campaigns from `<REALMCRAFT_ROOT or repository>/campaigns/`. It reloads open pages when code changes and pushes campaign changes over server-sent events.

## Start a game master session

Start Claude Code in the repository on Opus. The commands set their model themselves.

- `/partie` lists the campaigns of `campaigns/index.json`, newest first, or the worlds under `welten/` when there is none.
- `/partie neu <world> <seed> <template> <cid>` creates a campaign, for example `/partie neu hochland 48213 bergnomaden hochland-2`.
- `/partie <cid>` shows season, phase, stocks, meters, clans, open rolls and tasks of a campaign and says how to continue.

## New game

From the terminal the CLI creates a campaign directly.

```sh
node engine/cli.mjs new hochland --seed 48213 --as bergnomaden --id hochland-2 --json
```

`--as` names the player template from `welten/<world>/regeln.json` (Bergnomaden, Schädelklan or Talbund in Hochland). Campaign ids match `^[a-z][a-z0-9-]{1,40}$`. The new campaign starts in turn 0 in phase `agents` with its first tasks written. The first `/zug` runs phase B of turn 0 and opens the planning. Without agents, `node engine/cli.mjs open --campaign <cid>` opens the planning directly. From M1 the start screen of the board creates a game through the server ([decisions.md](decisions.md), D18).

## Play a turn

1. Plan in the board. Assign clans, choose orders and research, talk to the council, roll the probes of the own people and the world event roll. The blocker summary next to "Zug beenden" names everything that still prevents sealing.
2. Click "Zug beenden". The server runs `seal`, and the campaign is in `resolving`.
3. Type `/zug` in Claude Code. The game master presents leftover severe judge findings, runs the world agent, resolves the season, runs research, council, rivals and chronicler in parallel, ingests their proposals, opens the next planning and starts the judges in the background ([agents-harness.md](agents-harness.md)).
4. Plan the next turn while the phase B agents still work. Their accepted proposals appear on the board.

Without the board the player can name orders to the game master, who previews them with `node engine/cli.mjs preview` and enters rolls with `node engine/cli.mjs roll <probeId> <1-10>`.

## Inspect

```sh
node engine/cli.mjs status --campaign <cid> --json        # phase, turn, season, stocks, open probes, tasks
node engine/cli.mjs preview --as <people> --campaign <cid> --json
node engine/cli.mjs tasks --campaign <cid> --json
node engine/cli.mjs replay --campaign <cid>                # full proof of the campaign
node engine/cli.mjs validate welten/hochland               # world package
node engine/cli.mjs budget <file>                          # budget breakdown of a development or card
```

Exit codes of the CLI are 0 ok, 1 internal error, 2 rejected or invalid, 3 missing input (roll, file, campaign), 4 phase, revision, world or tamper conflict and 5 replay mismatch.

## Repin after a world change

A changed world package (a new label, a content fix, tuning) blocks every transition of a campaign pinned to the old hash with `cli.world_drift` and exit 4. After checking that the change is intended:

```sh
node engine/cli.mjs repin --campaign <cid> --json
```

`repin` validates the package, refuses during `resolving`, records `campaign.repin` with source `player`, updates `world.lock.json`, writes an anchor under `anchors/` from which `replay` starts, and answers `changed: false` when nothing changed.

## Save and load

Saving and loading work in phase planning while no `/zug` run is active. A load also works after the campaign has ended.

```sh
node engine/cli.mjs save --name "Vor dem Winter" --campaign <cid> --json   # -> save.slot, e.g. save-37
node engine/cli.mjs saves --campaign <cid> --json                          # manifests, newest first
node engine/cli.mjs load --slot save-37 --campaign <cid> --json            # -> autosave names the replaced files
```

A load restores the save in place and keeps the files it replaces as `autosave-<rev>`, so loading that slot undoes the load. A save made under another world package restores into the drift state and needs `repin` before the next transition. The board reaches the same commands through `GET` and `POST /api/campaigns/<cid>/saves` and `POST /api/campaigns/<cid>/load` ([data-contracts.md](data-contracts.md)). Saves stay under `campaigns/<cid>/saves/` and are deleted with the campaign folder. Agents never read them.

## Recovery

| Symptom | Meaning | Action |
|---|---|---|
| exit 4 with `tamper` | a campaign file was changed outside the kernel | do not repeat the step and do not edit further. Run `replay` to see where the files diverge from the journal and report to development |
| warning `cli.recovered` | an interrupted commit was rolled forward from its journal entry | nothing, the transition is complete |
| exit 4 with `cli.interrupted` | an interrupted commit could not be repeated | read `status`, run `replay`, report to development |
| warning `cli.downstream` | a view, report or text file after the commit could not be written | the state is committed. The next transition rewrites the derived files |
| exit 4 with `cli.stale_rev` or `phase` | wrong phase or a newer revision | read `status` and continue from the actual phase, `/zug` resumes an interrupted turn |
| exit 4 with `cli.world_drift` | the world package changed | `repin` as above |
| exit 4 with `cli.turn_running` | save or load during an active `/zug` run | finish the turn. After a crashed run, `node tools/harness/run-marker.mjs end --campaign <cid>` |
| exit 4 with `cli.locked` | another command holds the campaign lock | repeat when it has finished |
| warning `cli.recovered` with reason `load-completed` or `load-dropped` | a load was interrupted and the next command completed or dropped it | nothing. A completed load names its autosave |
| exit 4 with `tamper` on `load` | the save differs from its manifest or journal | load another slot. The campaign is unchanged |
| an agent hangs | a phase B step does not end | `node tools/harness/status-note.mjs step <agent>-<people or all> failed --summary "<reason>" --campaign <cid>` and continue, the kernel uses the fallback |
| the board shows an outdated agent status | status and files disagree | `node tools/harness/status-note.mjs sync --campaign <cid>` |
| a lock file remains after a crash | `.campaign.lock` or another `.<name>.lock` in the campaign folder nothing. A lock whose process is gone or which is older than its stale limit is broken by the next writer, an empty or unreadable lock after 2 seconds |

## Boundaries

- `.env` holds the image key of the portrait generator `tools/portraits/generate.mjs`. It never enters campaign files, knowledge or commits, and agents never read it.
- `campaigns/` is private and ignored by git. Back up a campaign by copying its whole folder while no transition runs.
- The ports of the owner's running servers are not used by tests or development sessions.

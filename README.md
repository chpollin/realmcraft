# RealmCraft

RealmCraft is a turn-based open-world strategy game in the browser. You lead a people through the seasons of a generated hex world that grows as you explore it. There is no fixed technology tree. Research runs along paths per domain (food, community, military, craft, knowledge, magic), and the achievements on these paths grow out of what your people actually does: language-model agents propose achievements, events, council voices, rival moves and a chronicle, and a deterministic rules kernel checks every proposal against a power budget before it counts. Every decision shows its consequences before you make it, and victory comes from fulfilling your people's destiny.

The specification and architecture live in [knowledge/](knowledge/INDEX.md).

## How it works

- A deterministic rules kernel under `engine/` computes every value. `engine/cli.mjs` is the only writer of campaign state, and a journal hash chain makes edits outside the kernel detectable.
- World packages under `welten/` hold generator, rules, paths, labels in German and English, and content. Hochland is the first world.
- The game board under `spielbrett/` is a map-first browser client with start screen, game menu, settings, rules reference, paths wheel, module views for trade, military, magic and lifestyle, event cards, synthesized audio and an English or German interface. It runs the kernel's preview on your people's view.
- The development server `serve.mjs` with the modules under `server/` serves the board, pushes live updates and offers campaign creation, saving and loading.
- Claude Code is the game master. The command `/zug` runs a turn with subagents for world, research, council, rivals and chronicle, and judges check coherence, balance and narrative in the background.

## Requirements

Node 21 or later, and Claude Code for play with agents. There is no build step.

```sh
npm install
```

## Run

```sh
npm run serve
```

Open `http://localhost:4173/`. The start screen offers a new game, the campaigns to continue, settings and the rules.

## Play with Claude Code

1. Start Claude Code in the repository.
2. Create a campaign on the start screen, with `/partie neu hochland 48213 bergnomaden hochland-1`, or in the terminal with `node engine/cli.mjs new hochland --seed 48213 --as bergnomaden --id hochland-1`.
3. Type `/zug` to run the first agent round, then plan in the browser.
4. Roll your probes on the board, end the turn on the board and type `/zug`. The game master resolves the season and the agents work while you plan the next one.

A game can be saved under a name and loaded again in the planning phase (`node engine/cli.mjs save --name <label> --campaign <cid>`, `saves`, `load --slot <slot>`); loading first saves the current state automatically. Without agents a campaign also runs from the CLI alone, with pool content and a fallback policy for the rivals. The runbook is [knowledge/operations.md](knowledge/operations.md).

## Tests

```sh
npm test                                   # static check, unit and acceptance tests
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e # browser tests in the installed Chrome
npm run test:fuzz                          # seeded fuzzing of validator, kernel and ingest
npm run sim:balance                        # headless balance simulation over many seeds
```

Details in [knowledge/testing.md](knowledge/testing.md).

## Structure

- `engine/` rules kernel, modules, content validator, schemas, world generator, fallback AI, harness IO and CLI.
- `welten/` world packages.
- `spielbrett/` game board.
- `serve.mjs`, `server/` development server with the campaign bridge.
- `.claude/` subagents, the commands `/zug` and `/partie`, hook settings and saved workflows.
- `tools/hooks/`, `tools/harness/` hooks and helpers of the agent harness. `tools/sim/` balance simulation and fuzzing, `tools/portraits/` portrait generation.
- `tests/` unit, acceptance and end-to-end tests.
- `knowledge/` specification, architecture, decisions, playtests, handoff and journal.
- `campaigns/` running campaigns, private and ignored by git.

The earlier games and the old savegame dashboard are preserved in the git history and the local branch `archiv/vor-neuaufbau`.

## Promptotyping

RealmCraft is a [Promptotyping](https://dhcraft.org/Promptotyping/) project by [Christopher Pollin](https://dhcraft.org) (DHCraft).

## License

Code is released under the MIT License (see `LICENSE`). Documentation, knowledge documents and other text are licensed under CC BY 4.0. Third-party material keeps the rights of its holders.

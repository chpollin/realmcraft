# RealmCraft

RealmCraft is a turn-based open-world strategy game in the browser. You lead a people through the seasons of a generated hex world that grows as you explore it. There is no fixed technology tree. Your people develops from what it actually does, language-model agents propose new achievements, events, council voices, rival moves and a chronicle, and a deterministic rules kernel checks every proposal against a power budget before it counts. Every decision shows its consequences before you make it, and victory comes from fulfilling your people's destiny.

The specification and architecture live in [knowledge/](knowledge/INDEX.md).

## How it works

- A deterministic rules kernel under `engine/` computes every value. `engine/cli.mjs` is the only writer of campaign state.
- World packages under `welten/` hold generator, rules, labels and content. Hochland is the first world.
- The game board under `spielbrett/` is a map-first browser surface that runs the kernel's preview on your people's view.
- Claude Code is the game master. The command `/zug` runs a turn with subagents for world, research, council, rivals and chronicle, and judges check coherence, balance and narrative in the background.

## Requirements

Node 21 or later and Claude Code for play with agents. There is no build step.

```sh
npm install
```

## Run

```sh
npm run serve
```

Open `http://localhost:4173/spielbrett/`. Without a campaign the board shows how to create one, and `?demo` shows the design prototype.

## Play with Claude Code

1. Start Claude Code in the repository.
2. Create a campaign with `/partie neu hochland 48213 bergnomaden hochland-1`, or in the terminal with `node engine/cli.mjs new hochland --seed 48213 --as bergnomaden --id hochland-1`.
3. Type `/zug` to run the first agent round, then plan in the browser at `http://localhost:4173/spielbrett/?campaign=hochland-1`.
4. Roll your probes on the board, click "Zug beenden" and type `/zug`. The game master resolves the season and the agents work while you plan the next one.

Without agents a campaign also runs from the CLI alone, with pool content and a fallback policy for the rivals. The runbook is [knowledge/operations.md](knowledge/operations.md).

## Tests

```sh
npm test                                   # static check, unit and acceptance tests
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e # browser tests in the installed Chrome
```

Details in [knowledge/testing.md](knowledge/testing.md).

## Structure

- `engine/` rules kernel, modules, content validator, schemas, world generator, harness IO and CLI.
- `welten/` world packages.
- `spielbrett/` game board.
- `serve.mjs` development server with the campaign bridge.
- `.claude/` subagents, the commands `/zug` and `/partie`, and hook settings.
- `tools/hooks/`, `tools/harness/` hooks and helpers of the agent harness.
- `tests/` unit, acceptance, end-to-end and visual tests.
- `knowledge/` specification, architecture, decisions and journal.
- `campaigns/` running campaigns, private and ignored by git.

The savegame dashboard of the former chat game-master procedure (`index.html`, `anleitung.html`, `js/`, `css/`, `schema/`, `examples/`), the round prototypes (`spiel/`, `design/`) and the documents in `docs/` belong to earlier versions and are kept until their removal.

## Promptotyping

RealmCraft is a [Promptotyping](https://dhcraft.org/Promptotyping/) project by [Christopher Pollin](https://dhcraft.org) (DHCraft).

## License

Code is released under the MIT License (see `LICENSE`). Documentation, knowledge documents and other text are licensed under CC BY 4.0. Third-party material keeps the rights of its holders.

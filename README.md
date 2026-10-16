# RealmCraft

RealmCraft is a turn-based open-world strategy game played through an AI harness chat and a companion browser board. You lead a people through the seasons of a generated hex world that grows as you explore it. There is no fixed technology tree. Research runs along paths per domain (food, community, military, craft, knowledge, magic), and the achievements on these paths grow out of what your people actually does: language-model agents propose achievements, events, council voices, rival moves and a chronicle, and a deterministic rules kernel checks every proposal against a power budget before it counts. Planning uses kernel previews, and victory comes from fulfilling your people's destiny.

The specification and architecture live in [knowledge/](knowledge/INDEX.md). Current implementation limits and remaining work are in the [development plan](knowledge/plan.md).

## How it works

- A deterministic rules kernel under `engine/` computes every value. `engine/cli.mjs` is the only writer of campaign state, and a journal hash chain makes edits outside the kernel detectable.
- World packages under `welten/` hold generator, rules, paths, labels in German and English, and content. Hochland is the first world.
- The game board under `spielbrett/` has a world map, an optional code-drawn community view for Hochland, a start screen, game menu, settings, rules reference, paths wheel, module views, event cards, synthesized audio and an English or German interface. Empty main/minor action slots open matching actions and targets; occupied slots open their planned order. Costs, availability and consequences come from the kernel preview.
- The development server `serve.mjs` with the modules under `server/` serves the board, pushes live updates and offers campaign creation, saving and loading.
- Claude Code is the game master. The command `/zug` runs a turn with subagents for world, research, council, rivals and chronicle, and judges check coherence, balance and narrative in the background.

## Current scope

The interface follows a shared Weltenwerkstatt direction: warm charcoal, mineral text, restrained brass and code-drawn landscape marks. The chat workshop shows a layered landscape study, the shared community and supported choices. The independent form editor retains its schematic folio. Both routes lead to a separate actual-map preview. The board, council, research, rules, settings and saved-games surfaces share controls and typography. On phones, readable path buttons replace the scaled-down research wheel. [The frontend design contract](knowledge/frontend.md#art-direction-and-interaction-hierarchy) records the hierarchy and research basis.

New game opens a shared chat workshop. Copy its starting prompt into the existing harness chat to develop the world, people and supported rules. Confirmed publications appear on the board, with open questions and unsupported rule ideas kept visible. Review the actual kernel map before explicitly starting. A separate manual draft and reversible map preview remain available. Landscape, way of life, strengths, council, neighbour and goal are explicit choices. Start creates an independent package and campaign and opens planning immediately. Existing campaigns and their saved plans remain available. The package/template start remains a separate option. The optional community view uses actual labour assignments and the campaign season; its visual season override is development-only. Open a campaign with `?campaign=<id>&ansicht=gemeinschaft` to try it. The map remains the default view.

The existing harness chat authors the shared draft, while the compiler validates its supported structured choices. No additional LLM service runs in the browser, and prose cannot invent executable mechanics. Authored worlds use the world map. Free intentions in an in-game chat, world-specific community scenes and spoken narration remain planned in [new-game-design.md](knowledge/new-game-design.md). Named saves are available in the game menu. The start screen opens each campaign’s saved games, including automatic backups. Agent rounds still use Claude Code, as described below. The board has no background agent service.

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
2. Open New game, copy its starting prompt into the existing harness chat, develop and review the shared draft, then explicitly start it on the board. Alternatively use the separate manual/template start, `/partie neu hochland 48213 bergnomaden hochland-1`, or in the terminal with `node engine/cli.mjs new hochland --seed 48213 --as bergnomaden --id hochland-1`.
3. A freely authored realm opens planning directly with validated pool content. A package/template or CLI start first needs `/zug` to run the initial agent round.
4. Roll your probes on the board, end the turn on the board and type `/zug`. The game master resolves the season and the agents work while you plan the next one.

Use Save or Load in the game menu, or Saved games beside a campaign on the start screen. Pending orders and labour changes are flushed before saving or loading. Loading asks for confirmation and first retains the current plan as an automatic backup. A completed game can also load an earlier save. The same commands remain available in the planning phase (`node engine/cli.mjs save --name <label> --campaign <cid>`, `saves`, `load --slot <slot>`); loading first saves the current state automatically. Without agents a campaign also runs from the CLI alone, with pool content and a fallback policy for the rivals. The runbook is [knowledge/operations.md](knowledge/operations.md).

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
- `.claude/` subagents, the commands `/zug` and `/partie`, hook settings.
- `tools/hooks/`, `tools/harness/` hooks and helpers of the agent harness. `tools/sim/` balance simulation and fuzzing, `tools/portraits/` portrait generation.
- `tests/` unit, acceptance and end-to-end tests.
- `knowledge/` specification, architecture, decisions, playtests, handoff and journal.
- `campaigns/` running campaigns, private and ignored by git. Authored packages under `welten/realm-*/` and start receipts under `authoring/` are private runtime data too. Back up the campaign together with its package.

The earlier games and the old savegame dashboard are preserved in the git history and the local branch `archiv/vor-neuaufbau`.

## Promptotyping

RealmCraft is a [Promptotyping](https://dhcraft.org/Promptotyping/) project by [Christopher Pollin](https://dhcraft.org) (DHCraft).

## License

Code is released under the MIT License (see `LICENSE`). Documentation, knowledge documents and other text are licensed under CC BY 4.0. Third-party material keeps the rights of its holders.

# CLAUDE.md, RealmCraft

RealmCraft is a turn-based open-world strategy game with a deterministic rules kernel, world packages, an agent harness in Claude Code and a map-first browser board. The knowledge base starts at [knowledge/INDEX.md](knowledge/INDEX.md). Read it, then [knowledge/plan.md](knowledge/plan.md) and any incoming material in [knowledge/handoff.md](knowledge/handoff.md), then the document of the task. Code, schemas and tests are the source of truth for every number, and a knowledge document that disagrees with them is corrected.

## Roles

A session in this repository is either game master or developer.

- Game master. Runs a campaign through `/partie` and `/zug` ([knowledge/agents-harness.md](knowledge/agents-harness.md), [knowledge/operations.md](knowledge/operations.md)). Acts only through `node engine/cli.mjs` and the helpers under `tools/harness/`. Never rolls for the player, never recommends an action, reports in German with numbers only from the kernel's answers.
- Developer. Builds kernel, content, harness and board on the owner's tasks, following [knowledge/rules-kernel.md](knowledge/rules-kernel.md), [knowledge/data-contracts.md](knowledge/data-contracts.md), [knowledge/frontend.md](knowledge/frontend.md) and the current [development plan](knowledge/plan.md). The [M1 contract](knowledge/plan-m1.md) records the historical build and its evidence limits.

## File ownership

| Area | Owner |
|---|---|
| `campaigns/` | the kernel CLI only. Agents write only their own proposal file, guarded by hooks |
| `engine/`, `welten/`, `spielbrett/`, `serve.mjs`, `server/`, `tools/`, `tests/`, `.claude/` | developer |
| `knowledge/` | developer, in English, following the Promptotyping convention of the vault |

`savegame.json` and `schwarzkaemme/` are untracked files of the owner and stay untouched.

## Boundaries

- Never read, print or commit `.env` or any API key.
- Never write under `campaigns/` by hand, the live campaign of the owner lives there. Read it through `node engine/cli.mjs`.
- Existing campaigns stay loadable. A schema or state change is additive or carries a migration with a test on a fixture campaign in a temporary directory, and a changed world package needs `repin`.
- Agents propose, the kernel writes. New mechanics are code, never agent output.
- The board contains no game logic. Every consequence it shows comes from the kernel's `preview()`.
- Tests and development servers never use the owner's ports 4173, 4185, 4186, 4187 and 4190.
- `npm test` is green before a commit. Board or server changes also need `npm run test:e2e`.
- Agent briefs, subagents and saved workflows (`.claude/agents/`, `.claude/workflows/`) change only together with the knowledge document that describes them.

## Continuing development

Current implementation limits and accepted work live in [knowledge/plan.md](knowledge/plan.md). Choose a bounded task there or follow the owner's current instruction. Verify an old playtest finding against current code before fixing it. The M1 build and first refactor wave are integrated; do not rerun their audit/refactor/merge lanes. The obsolete complete workflow has been retired.

Keep implemented features distinct from proposals. Browser creation currently uses world packages and people templates; free realm authoring, an in-game intention interface, named-save menu entries, a background agent service and spoken narration are not implemented. The optional community illustration is authored for Hochland. Read [knowledge/new-game-design.md](knowledge/new-game-design.md) and [knowledge/frontend.md](knowledge/frontend.md) before extending those flows.

Before an authorized merge while the owner plays, read the live campaign phase through the CLI. Merge only in planning and repin only when the world package changed. Pushes, merges, tags and releases require the owner's instruction; this documentation does not authorize them.

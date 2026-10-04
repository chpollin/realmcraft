# Acceptance tests of the rules kernel

Black-box tests for the turn-based RealmCraft kernel, written from the specification without knowledge of the implementation (lane A of the first plan, see [knowledge/testing.md](../../knowledge/testing.md)). They drive the kernel only through `node engine/cli.mjs` and check the JSON files it writes, using the schemas in `engine/schemas/` through Ajv. The readings in `lib/harness.js` are pinned to the field names the delivered `engine/cli.mjs` emits, and a changed CLI contract is reconciled in that file or in the assumption block of the affected test.

## Running

```
node --test "tests/acceptance/**/*.test.js"
node --test tests/acceptance/03-probes.test.js
```

Node 21 or later. Every campaign lives in its own temp root under the system temp directory, which receives a copy of `welten/hochland` and is removed after the test. The repository's own `campaigns/` folder is never touched as long as the CLI honours its working directory (assumption A1). The long runs of groups 2, 4 and 9 spawn the CLI a few hundred times, so the whole suite takes minutes.

Environment variables:

- `RC_ACCEPT_WORLD` sets the world id passed to `new` (default `hochland`).
- `RC_ACCEPT_AS` sets the player template passed to `new --as` (default `bergnomaden`).
- `RC_ACCEPT_KEEP=1` keeps the temp roots for inspection.

## Files

| File | Group | Source in the specification |
|---|---|---|
| `lib/harness.js` | CLI driver, schema checks, helpers, assumptions A1 to A9 | Regelkern sections 5, 6, 15 and 17, Agentenvertrag |
| `01-lifecycle.test.js` | new, status, preview, seal, apply, open | Regelkern sections 3, 14, 17 |
| `02-determinism.test.js` | identical state and reports for identical input, replay, stale `--expect-rev` | Regelkern sections 1 and 17 |
| `03-probes.test.js` | target, modifiers, probability, roll_stale, natural 1 and 10 | Regelkern section 6 |
| `04-economy.test.js` | invariants over 50 seasons with the fallback policy | Regelkern sections 3 and 8 |
| `05-agents.test.js` | tasks, idempotent ingest, stale and value-carrying proposals, power budget | Agentenvertrag, Regelkern section 10 |
| `06-fog.test.js` | no foreign stocks or drafts in anything shown to the player | Regelkern section 16 |
| `07-phases.test.js` | locked orders in resolving, phase guards of seal, apply and open | Regelkern section 14 |
| `08-bestimmung.test.js` | victory, collapse, AI victory, tamper guard | Regelkern section 13 |
| `09-eventlog.test.js` | an entry with source, target and change for every changed field | Regelkern section 15 |
| `10-pfade.test.js` | paths in the projection, research requests on a path, points that accumulate until an achievement completes | plan-m1, owner decision M1-1 |
| `11-migration.test.js` | a campaign from before the paths model loads after `repin` and keeps its developments | plan-m1, kernel contracts, Migration |
| `12-board-data.test.js` | options of `new`, machine-readable issues, council, trade, rivals, outcome, judges' findings in `status.json` | plan-m1, View additions for the board |
| `13-saves.test.js` | save, list and load of named saves, state, journal, roll ledger and replay restored, play on after a load | plan-m1, D24 |
| `harness-turn.test.js` | a turn of `/zug` with scripted agents through the CLI, the proposal hook and the harness helpers, research on a path, findings and stances in the next tasks, the acceptance tool | `.claude/commands/zug.md`, agents-harness |

Each test file opens with the assumptions it adds to those of `lib/harness.js`.

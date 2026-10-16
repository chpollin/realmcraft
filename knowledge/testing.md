---
title: Testing
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: complete
language: en
created: 2026-10-03
updated: 2026-10-16
authors: [Christopher Pollin]
generated-with: Claude Code (Claude Opus 5.5)
related: [architecture, rules-kernel, agents-harness, frontend, operations]
---

# Testing

What the tests guarantee, how to run them and where the gaps are. Technical tests, observed operation and the owner's design and domain acceptance are separate kinds of evidence and are reported separately ([vision.md](vision.md)). Current test counts and coverage are measured by running the suites, never copied into documents.

## Commands

```sh
npm test                    # npm run check, then unit and acceptance tests
npm run check               # syntax of every tracked JS module
npm run test:unit           # node --test "tests/unit/**/*.test.js"
npm run test:acceptance     # node --test "tests/acceptance/**/*.test.js"
npm run test:e2e            # Playwright, project e2e
npm run test:fuzz           # long sweep of tests/unit/sim/fuzz-*.test.js, node tools/sim/fuzz.mjs --runs <n> --seeds 1,2,3
npm run sim                 # headless campaigns under the fallback policy, invariants and balance report
npm run sim:balance         # configured multi-seed, multi-season balance sweep
```

`npm test` is the quality gate before a commit. Without the bundled Chromium the browser tests run in the installed Chrome with `PLAYWRIGHT_CHANNEL=chrome`. The Playwright config starts no server. Every board spec and every server unit test starts its own `serve.mjs` with a temporary `REALMCRAFT_ROOT` through `startServer` in `tests/lib/server.mjs`, on a free port or, in the specs, on the port given by `SPEC_PORT`. A run limited to one assigned port sets `SPEC_PORT` together with `--workers=1`, since the specs of one run would otherwise compete for that port. The ports 4173, 4185, 4186, 4187 and 4190 belong to the owner's running servers, `startServer` refuses them and no test uses them. `test-results/` and `playwright-report/` are ignored artifacts and are deleted after a run.

## Layers

| Layer | Subject | Location |
|---|---|---|
| Unit, kernel | every core function, modules, content validator, budget, library, schemas and their interpreter against Ajv, CLI commands, integrity and ingest, harness IO and status | `tests/unit/engine/` |
| Unit, world | hex geometry, generator order independence, paths, start placement, vision, RNG | `tests/unit/world-*.test.js` |
| Unit, fuzz | random drafts of player and AI peoples over seasons in a row (no crash, valid integer state, determinism, fog), validator and budget over mutated content, and the smallest reproduction of every finding in `fuzz-findings.test.js`. `FUZZ_SEED` also picks the campaign seeds, `FUZZ_RUNS` scales the cases | `tests/unit/sim/` |
| Unit, harness | hooks fed with hook inputs (path filter, denials, Windows paths, pre-check) and the dry run of `/zug` in a temporary root | `tests/unit/harness-hooks.test.js`, `tests/unit/harness-dryrun.test.js` |
| Unit, board and server | adapter, blockers, event cards, Weltgeschehen, the campaign bridge, the API, saves, static files and access protection of `serve.mjs` against real server processes | `tests/unit/spielbrett-*.test.js`, `tests/unit/server/` |
| Acceptance | black-box tests of the kernel written from the specification without knowledge of the implementation, driving only `node engine/cli.mjs` and checking its files with Ajv | `tests/acceptance/` |
| End to end | the board against real campaigns. Load, preview, roll and seal, the blocker flow from the playtest, the paths wheel with council strip and destinies, the module views with event cards, provinces, attack, trade and the agent round, the game shell with start screen, menu and end screens, the language switch, synthesized audio, community labour and navigation, typed action-slot planning, kernel-result disclosure and named save/load recovery | `tests/e2e/` |

The acceptance groups cover lifecycle, determinism with replay, probes, the economy over many seasons with the fallback policy, agents and ingest, fog, phases, destiny with victory and collapse, and the event log. Each acceptance file opens with the assumptions it adds to those of `tests/acceptance/lib/harness.js`. The harness reads every value under the one field name the CLI emits, so a renamed field fails the suite instead of passing through a fallback. A changed CLI contract is reconciled in the harness file or in the assumption block of the affected test.

## Fixtures

- `tests/fixtures/engine/` holds the turn-0 campaign state, drafts, tasks and proposals with invalid counterexamples, and the validator corpus `corpus/manifest.json` with hand-computed expectations for the synthetic world `korpus`. The mid-game set (`campaign-midgame.json`, `draft-midgame.json`, `view-talbund.json`, `report-T0011.json`) is a frozen shape of an earlier kernel run on an older Hochland package. It is kept deliberately as older-package input, for `--from-state` in the CLI tests and for the board adapter test that expects a package hash differing from the current one, and it has no builder. Its provenance lies in the git history.
- `tests/lib/server.mjs` starts `serve.mjs` on a temporary root and holds the raw HTTP client of the server tests.
- `tests/fixtures/harness/T<turn4>/` holds the recorded agent proposals for the dry run. The research proposal there is deliberately invalid to show a refused proposal in the status.
- `tests/fixtures/spielbrett/` holds views and event logs of Hochland for the board tests, rebuilt with `build.mjs` and `build-events.mjs` when the world hash changes. `build-module.mjs` writes the campaigns `module` (every board module in play) and `agenten` (agent steps and judge findings in `status.json`) through the CLI for the module tests, and with `--keep` as fixture campaigns for looking at the board ([frontend.md](frontend.md)).

Campaigns of tests live in temporary roots. No test touches `campaigns/`.

## Dry run without a language model

`tools/harness/dryrun.mjs` runs the `/zug` procedure with recorded proposals.

```sh
node engine/cli.mjs new hochland --seed 48213 --as bergnomaden --id probe-1 --json
node tools/harness/dryrun.mjs --campaign probe-1 --fixtures tests/fixtures/harness --rolls 6,3,8 --judges
node tools/harness/dryrun.mjs --campaign probe-1 --fixtures tests/fixtures/harness --rolls 6,3,8
```

Run these with `REALMCRAFT_ROOT` set to a temporary folder or with `--root <dir>`, because they create a campaign. The first run executes phase B of turn 0 and the judges, the second a full turn with rolls, seal, world, resolution, phase B and open. `--hooks` drives `status.json` through the real hooks with the inputs Claude Code sends.

## Guarantees

- Determinism. The same seed, drafts, rolls and proposals give the same state hash, twice in a row and after `replay`.
- Purity of the preview. `preview` changes neither state nor RNG.
- Openings. Costs only from the opening stock, effects of new things from the next turn.
- Fog. Nothing shown to the player or to an agent of a people carries foreign stocks or drafts.
- Origin. Every changed field has a log entry with source, target and change.
- Integrity. A state, sealed draft or library changed outside the kernel is refused with `tamper`, an interrupted commit rolls forward, and campaigns written before an additive change stay loadable.
- Validator. The corpus pins issue codes and hand-computed budgets of its cases independently of the implementation.

## Simulation and agent evidence

`tools/sim/run.mjs` drives campaigns with the deterministic fallback policy, rotates player templates and accepts a player-profile override. Its seed and season options support longer balance sweeps. Reports describe that policy and the world pool. They do not measure live LLM decisions or establish the balance of agent-generated content.

`tools/harness/acceptance.mjs` reads campaign verdicts and reports acceptance by agent and item type, with refusal reasons. A new live measurement requires an explicit run on the relevant campaign and turns. The existence of the helper establishes no current acceptance rate.

The browser regressions `community.spec.mjs`, `action-slots.spec.mjs` and `world-results.spec.mjs` cover responsive and keyboard navigation, reuse of the stored draft and kernel preview, disabled action slots during resolution, and disclosure only for actual kernel results. They run against temporary campaigns.

The draft-persistence checks exercise serial writes, edits arriving during a write, refusal/retry and exclusion of stale writes after restoration. The `saves.spec.mjs` browser regression uses temporary campaigns for pending and in-flight drafts, same-season restore, recoverable automatic backups, menu navigation, cancellation, failures, phase/run guards, ended-game recovery, lost or malformed load responses and start-screen access. These checks exercise the actual snapshot API without changing the owner’s games. Wide and phone-width snapshot lists with long names were visually inspected. Actual 200-percent browser zoom remains unverified in this pass.

## Gaps

- Live-agent balance and proposal quality over a sustained campaign still require observed play.
- No browser end-to-end test of a full turn including live agents.
- Intermittent live-refresh timeouts occurred while project and browser gates ran together. A standalone full browser run passed without source changes. The remaining reproduction and reconciliation work is recorded in [plan.md](plan.md#current-ui-review).
- The module spec still waits a fixed time before it looks for event cards in the agent-round campaign and after a reload, because the board exposes no signal that its card queue has settled.

## Realm start coverage

`realm-creation.test.js` checks the closed authored contract, verbatim prose, deterministic immutable packages and supported landscape/way/goal/language combinations against the real kernel. `realm-context.test.js` checks optional metadata validation and fiction scope in research, rival, council, world, chronicler and judge tasks, including a neighbour chosen as template player.

The server Realm tests use temporary roots and verify a write-free preview, preview/start identity, explicit-start-only campaign creation, package conflicts, same-key retries, server-restart recovery and safe refusal of obsolete reserved previews. Existing campaign/save files and source packages are compared byte for byte. Browser Realm cases cover editing and back navigation, real start/reload, field errors, request failures, lost responses, activation retry, narrow keyboard operation and seed boundaries. Existing template creation stays under its previous cases. These checks do not run a real LLM or establish the artistic quality of an authored world.

A deterministic fresh-game browser regression changes the fixture before the intercepted SSE connection and supplies only hello. It fails without canonical catch-up and passes with it; no view broadcast is needed.

The shared UI design pass retains the existing creator, planning, save/load and dialog regressions. Creator cases also cover an invalid required field in a closed disclosure, visible primary actions at the working viewport and preserved step orientation. Mobile research cases use native path buttons through path, achievement and return navigation, including a data refresh and width changes, with pending input and draft-write behavior checked. Colour contrast is checked from the actual palette values; visual inspection remains separate from automated behavior and artistic acceptance.

The audio browser regression instruments real Web Audio source starts, stops and ended signals. It checks finite, non-looping interaction and outcome cues and silence after they settle on both start and board surfaces, including preference, reduced-motion, visibility and hover changes. Legacy ambience settings are ignored while supported preferences and mute survive storage and reload. These checks establish scheduling and lifecycle behavior, not a listening assessment of sound quality.

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
updated: 2026-10-03
authors: [Christopher Pollin]
generated-with: Claude Code (Claude Opus 5.5)
related: [architecture, rules-kernel, agents-harness, frontend, operations]
---

# Testing

What the tests guarantee, how to run them and where the gaps are. Technical tests, observed operation and the owner's design and domain acceptance are separate kinds of evidence and are reported separately ([vision.md](vision.md)). Current test counts and coverage are measured by running the suites, never copied into documents.

## Commands

```sh
npm test                    # npm run check, then unit and acceptance tests
npm run check               # syntax of every tracked JS module, schema conformance of tracked example saves
npm run test:unit           # node --test "tests/unit/**/*.test.js"
npm run test:acceptance     # node --test "tests/acceptance/**/*.test.js"
npm run test:e2e            # Playwright, project e2e
npm run test:visual         # Playwright, project visual (legacy dashboard)
```

`npm test` is the quality gate before a commit. Without the bundled Chromium the browser tests run in the installed Chrome with `PLAYWRIGHT_CHANNEL=chrome`. Playwright's own web server uses port 4391 (`playwright.config.mjs`) and never reuses a running server. The board specs that need a campaign start their own `serve.mjs` on a port given by `PORT` with a temporary `REALMCRAFT_ROOT`. The ports 4173, 4185, 4186, 4187 and 4190 belong to the owner's running servers and are never used by tests. `test-results/` and `playwright-report/` are ignored artifacts and are deleted after a run.

## Layers

| Layer | Subject | Location |
|---|---|---|
| Unit, kernel | every core function, modules, content validator, budget, library, schemas and their interpreter against Ajv, CLI commands, integrity and ingest, harness IO and status | `tests/unit/engine/` |
| Unit, world | hex geometry, generator order independence, paths, start placement, vision, RNG | `tests/unit/world-*.test.js` |
| Unit, harness | hooks fed with hook inputs (path filter, denials, Windows paths, pre-check) and the dry run of `/zug` in a temporary root | `tests/unit/harness-hooks.test.js`, `tests/unit/harness-dryrun.test.js` |
| Unit, board and server | adapter, blockers, event cards, Weltgeschehen, the campaign bridge and access protection of `serve.mjs` against real server processes | `tests/unit/spielbrett-*.test.js`, `tests/unit/serve.test.js` |
| Acceptance | black-box tests of the kernel written from the specification without knowledge of the implementation, driving only `node engine/cli.mjs` and checking its files with Ajv | `tests/acceptance/` |
| End to end | the board against a real campaign (load, preview, roll, seal) and the blocker flow from the playtest | `tests/e2e/spielbrett-real.spec.js`, `tests/e2e/spielbrett-blocker.spec.js` |
| Legacy | dashboard, Nachtmeer and strategy prototype tests, visual baselines of the dashboard | other files in `tests/unit/`, `tests/e2e/`, `tests/visual/` |

The acceptance groups cover lifecycle, determinism with replay, probes, the economy over many seasons with the fallback policy, agents and ingest, fog, phases, destiny with victory and collapse, and the event log. Each acceptance file opens with the assumptions it adds to those of `tests/acceptance/lib/harness.js`. The kernel lanes do not change these tests, a changed CLI contract is reconciled in the harness file or in the assumption block of the affected test.

## Fixtures

- `tests/fixtures/engine/` holds campaign states (turn 0, midgame, near victory, near collapse) built by `build-state-fixtures.mjs` from a real kernel run on Hochland with seed 7, drafts, views, a report, tasks and proposals with invalid counterexamples, and the validator corpus `corpus/manifest.json` with hand-computed expectations for the synthetic world `korpus`.
- `tests/fixtures/harness/T<turn4>/` holds the recorded agent proposals for the dry run. The research proposal there is deliberately invalid to show a refused proposal in the status.
- `tests/fixtures/spielbrett/` holds views and event logs of Hochland for the board tests, rebuilt with `build.mjs` and `build-events.mjs` when the world hash changes.

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
- Integrity. A state, draft, roll ledger or library changed outside the kernel is refused with `tamper`, an interrupted commit rolls forward, and campaigns written before an additive change stay loadable.
- Validator. The corpus pins issue codes and hand-computed budgets of its cases independently of the implementation.

## Gaps

- No balance simulation over many years with AI profiles on different paths.
- No fuzzing of validator and kernel.
- No measurement of live agent proposal acceptance.
- No browser end-to-end test of a full turn including live agents.
- The legacy dashboard e2e and visual tests are obsolete and wait for the removal of the legacy code.
- One concurrency test of `harness-io-status` failed once on Windows and is considered flaky.

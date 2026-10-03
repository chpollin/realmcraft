---
title: Data Contracts
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
related: [rules-kernel, architecture, agents-harness, world-packages, testing]
---

# Data Contracts

The data contracts of RealmCraft are the schemas under `engine/schemas/`. Where this document and a schema differ, the schema holds and this document is corrected. Every file carries `format` and `version`, and the kernel refuses unknown major versions. The schemas are interpreted by `engine/content/schema.js`, a dependency-free interpreter of the JSON Schema subset the schemas use, which judges like Ajv on the fixture corpus and runs in Node and browser alike.

## Versions and evolution

- `SCHEMA_VERSION` in `engine/schemas/index.js` moves when a contract changes incompatibly. It stands at 2 since the amendment of 3 October 2026 (band ids, accent tokens, stricter proposal and order id patterns). No persisted campaign predates it, so the per-file versions stay 1.
- `RULES_VERSION` in `engine/core/rules.js` moves when a kernel constant changes the outcome of stored campaigns.
- Changes after the first freeze are additive. A new state field is optional with a stated default, the kernel writes it on every write, and states written before stay valid. The exception is the core meter `zustimmung`, which the kernel has written since turn 0.
- Existing campaigns must stay loadable. A schema or state change is additive or carries a migration, proven by a test on a fixture campaign built in a temporary directory.

## Schemas

| Schema | File | Format id |
|---|---|---|
| `campaign` | `campaigns/<cid>/state.json` | `realmcraft-campaign` |
| `draft` | `drafts/<people>.json` | `realmcraft-draft` |
| `view` | `view/<people>.json` | `realmcraft-view` |
| `report` | `log/T<turn>.json` | `realmcraft-report` |
| `campaignIndex` | `campaigns/index.json` | `realmcraft-campaigns` |
| `task` | `agents/tasks/T<turn>/<agent>-<people or all>.json` | `realmcraft-task` |
| `proposal` | `agents/proposals/<proposalId>.json` | `realmcraft-proposal` |
| `status` | `status.json` | `realmcraft-status` |
| `event` | log entry in `state.chronicle` and reports | |
| `entwicklung`, `ereignis`, `bestimmung` | content objects in the library and world package | `realmcraft-entwicklung` and others |
| `regeln`, `labels`, `style`, `entwicklungen`, `ereignisse`, `bestimmungen` | files of a world package | `realmcraft-regeln` and others |

`welt.json` is validated by `engine/world` (required keys in `WELT_REQUIRED_KEYS`). `node engine/cli.mjs schema <name>` prints any schema as JSON.

Files without a schema of their own are `world.lock.json`, `rolls.json` (append-only roll ledger, format `realmcraft-rolls`, entries `{ turn, people, probe, fingerprint, value }`), `log/journal.json` (hash chain, entries of format 2 carry `kernel`, `prev`, `hash`, `libraryCount`, `libraryHash`, `draftsHash`, `rolls` with count and hash, and `worldHash`, the first chained entry after an older journal carries `base` with an anchor), `anchors/` (anchor states of `repin` and of the chain start), `run.json` and the save manifests (section Saves).

## Campaign state

The state holds references to world content and the mutable part of the map. Generated tiles are a function of `map.seed` and the pinned package and are never stored.

- Envelope. `format`, `version`, `rulesVersion`, `campaign { id, world { id, version, hash }, player }`, `rev`, `turn`, `phase` (`planning`, `resolving`, `agents`), `rng { algo: sfc32, s }`, `status` (`playing` or `ended`) and `result`.
- `map`. `seed`, `packId`, `control` by region id (`cq:cr:i`), `settlements` with tile, region, kind and buildings, `known` per people and tile (`seen` or `visible`) and `features` per tile, at most one each.
- `peoples`. One entry per people with exactly the same shape, consisting of `controller`, `agentProfile`, `identity` (nature pair, orientation, appearance), `lebensweise`, `population { core, growth, assigned }`, `resources`, `standing` (0..3), `developments { known, research, candidates, requests, instituted }`, `units`, `council`, `practice.ledger`, `tokens`, `statuses`, `meters` (with the required core meter `zustimmung` in −5..5), `shortfall`, `bestimmung` and module slices under `modules`.
- `relations` by the two people ids in alphabetical order joined by `|`, with `value` (−3..3), `atWar`, `since` and `contact`.
- `modules` (global module slices), `eventPool`, `eventDraws` (per people `{ turn, roll, band, roller, card }`), `pendingChoices` (`{ id, people, event, offeredAt, deadline, options }`), `ingested` (proposal id to hash), `chronicle` (log entries of the last turns), `sealed` (people id to hash of the sealed draft, set by `seal` and removed by `apply`) and `derived` (per people values such as stock caps, recomputed on every write and outside the state hash).

`population.growth` holds the growth points towards the next clan, the field earlier documents called `growthPoints`.

## Draft

`{ format, version, people, turn, baseRev, orders, assign, choices, venture, lead, mandate, rolls, withdrawn, sealed }`. Orders are `{ id, type, params }`, with order ids from `PATTERNS.orderId`, where `event` and the kernel subjects `life-N` and `hollow-N` are reserved. `assign` maps a resource key, `research` or a module activity to clans. `choices` maps an id of `pendingChoices` to an option id. `venture` and `lead` map order ids to `true` and to a council member. `rolls` maps probe ids (`T<turn>:<people>:<order id or event>`) to `{ value, fingerprint }`, derived from the roll ledger. A draft is stale only when `turn` differs from the state, `baseRev` is informational.

## Content objects

An `entwicklung` is one closed variant per `kind` (`technik`, `doktrin`, `institution`, `disziplin`, `einheit`, `bauwerk`, `lebensweise`) with `id`, `rev`, `tier`, `name`, `summary`, `appearance`, `tags`, `prerequisites { all, any, if }`, `cost { research, resources }`, `effects` (standing primitives, weight 0 or more), `price` (standing primitives, weight 0 or less), `onAcquire` (one-off primitives), `replaces`, `spec` by kind and `origin`. Content is immutable once a people knows or researches it, and a revision is a new library entry `id@rev+1`.

| Kind | Takes effect by | `spec` |
|---|---|---|
| `technik`, `doktrin` | research | none |
| `institution` | research, then `institute` with council | `{ seat }` |
| `disziplin` | research, applications through `discipline.use` | `{ source, applications }` with outcomes per band |
| `einheit` | research unlocks `recruit` | `{ strength, mobility, recruitCost, upkeep, tags }` |
| `bauwerk` | research unlocks `build` | `{ terrains, buildCost, perRegion, upkeep }` |
| `lebensweise` | research, then `adopt` | `{ settlement, migrates, consumption, herdRules }` |

An `ereignis` (event card) has `{ id, rev, name, text, band, tags, if, effects, options }` and optional `once`, `cooldown` and `maxPerCampaign`. A `bestimmung` has three or four milestones, each `{ id, text, predicate }`, with the predicates `controls`, `stat.atLeast`, `resource.atLeast`, `population.atLeast`, `relation`, `development.known`, `subjugated`, `settlement` and `holds`. Its state per people adds `adoptedAt`, `milestones` with `reached`, `reachedAt` and `progress`, `history` with the outcomes `fulfilled`, `switched` and `abandoned`, and the optional `offers` (at most two `{ ref, offeredAt, origin }`) and `difficulty`.

## Primitive set

Primitives are defined in `engine/schemas/effects.js`, one closed schema per op.

- Standing primitives act while their source is active. They are `resource.flow`, `yield.mod`, `stock.cap`, `population.cap`, `population.growth`, `stat.mod`, `probe.mod`, `research.mod`, `unit.mod`, `order.unlock`, `order.slot`, `order.restrict`, `module.activate`, `governance.rule`, `dependency`, `meter`, `sight.mod` and `trigger`.
- One-off primitives act exactly once. They are `resource.delta`, `population.delta`, `loyalty.delta`, `loyalty.bind`, `relation.delta`, `standing.delta`, `status.add`, `token.add`, `unit.spawn`, `unit.delta`, `region.control`, `council.seat`, `flag.set`, `meter.delta` and `reveal`.

A status may not carry `module.activate`, `order.slot`, `trigger`, `dependency`, `meter` or `governance.rule`. Conditions under `if` are atoms (`season`, `res`, `meter`, `knows`, `lebensweise`, `module`, `tagCount`, `tierCount`, `atWar`, `flag`, `controls`, `relation`) or `all`, `any` and `not` up to depth three. Trigger hooks are `season`, `winter`, `war`, `contact`, `death`, `crit_success:<tag>`, `crit_fail:<tag>`, `shortfall:<res>` and `use:<order or application>`. `effects.js` carries a comment table that maps the eleven effect primitives generalised from the campaigns onto these ops.

## Power budget

Every primitive has an integer weight from `WEIGHTS`, grants in a `spec` are weighted by `SPEC_WEIGHTS`, and `engine/content/budget.js` evaluates them. Rounding never favours the content.

```
E = sum of positive weights over effects and onAcquire, plus SPEC_WEIGHTS of the grants     effect
P = sum of negative weights over price and onAcquire, plus a burden shed through replaces    price, P <= 0
S = the part of P from price primitives that are not use-bound                                 standing price
N = E + P                                                                                      net value

valid with the TIERS row of the tier (tier 0 uses the row of tier 1)
  E <= effectMax                      budget_effect
  netMin <= N <= netMax               budget_net
  S <= priceMax                       budget_price
  cost.research = N × (tier + 1)      research_cost
```

The weight rules that are not plain per-point weights were refined on 3 October 2026. A status counts the standing weight of its effects scaled by its duration within a year. A trigger counts its effects times the frequency of its hook. A dependency weighs the lighter of its payment and its penalty taken in every season of the year, because a people either pays or suffers the penalty, and a penalty that harms nothing leaves the dependency free. A meter counts the helpful thresholds it can reach minus severity times rate of the harmful ones. A `duty` restriction and an empty restriction weigh 0. A scaled flow counts a benefit at twice the expected count and a burden at the expected count. A replaced development with negative net counts its net as effect. `node engine/cli.mjs budget <file>` prints the breakdown.

The tier's minimum price is met only by the standing price `S`. A one-off burden in `onAcquire` and a use-bound price, a meter that rises on `use:` or a trigger on `use:`, still count in `P` but not in `S`, because a people can take the one and avoid the other while it keeps the effects. This rule and the dependency rule come from the balance work of M1 on the dark path ([world-packages.md](world-packages.md)).

## Validator

`engine/content/validate.js` validates developments, event cards, destinies, world packages and proposals and never throws on bad content. Its stages follow one order.

1. Schema (`schema.*`, `format`, `unknown_primitive`).
2. Sign (`misplaced_effect`), effects weigh 0 or more and prices 0 or less.
3. References (`dangling_ref`, `cycle`, `unknown_resource`, `unknown_tag`, `duplicate_name`, `conflict` for a meter id defined twice or the core meter redefined).
4. Tiers (`tier_gap`), a tier above its prerequisites, within the world's `maxTier`, at least 1 for agent content and at most the open tier of the people a candidate is for.
5. Budget (`budget_effect`, `budget_net`, `budget_price`, `content.research_cost`), including the cap on what one application outcome may produce.
6. Drift protection (`missing_upkeep` for units, buildings from tier 2, institutions, doctrines and disciplines without source use or meter, `stack_cap`, `duplicate` for the same tags and effects as a known development).
7. Grounding (`ungrounded`), anchored in a practice tag, an open token or an open research request.
8. Limits per turn and people (`limit`).

Inert content that could never take effect is `content.inert`, a world development no start endowment can reach is `content.unreachable`, an item type the agent may not send is `content.item_not_allowed` and a state-changing item without a task is `content.no_task`. Reserved ids that an object inherits from `Object.prototype` are refused as `format`. Event cards must keep their net weight, or that of each option, in the range of their band. A destiny must keep its total difficulty in the destiny band (`content.destiny_band`), and each milestone above a minimum with at most one milestone already holding at adoption (`content.destiny_trivial`).

## Agent files

A `task` carries `campaign`, `turn`, `rev`, `agent`, `people`, `respondAs { proposalId, path }`, `read` (files the agent may read), a role-specific `context` derived from the people's projection and `limits` (allowed items, candidates, tiers, primitives, tags from the world vocabulary, budget rows and for rivals the slots). A `proposal` carries `proposalId`, `agent`, `campaign`, `turn`, `basedOnRev`, `people` and `items`. The proposal id is `<agent>.<people>.T<turn>` or `<agent>.T<turn>`. Which item types an agent may send is `ITEMS_BY_AGENT` in `engine/schemas/proposal.js` ([agents-harness.md](agents-harness.md)). Text items (`narrative`, `voice`, `stance`, `memory`, `finding`) are closed objects without value fields. A `finding` carries a severity `info`, `warn` or `severe`. A `correction` names its finding, `needsConsent`, a people and one state-changing item or one to three one-off primitives.

`status` holds the agent round of a turn with `phase`, `steps` with `id`, `agent`, `state` (`waiting`, `running`, `done`, `failed`), times, summary and `proposals` with verdict (`accepted`, `rejected`, `pending`) and budget, and `resolved { turn, steps }` for the round just resolved until the next planning.

## Log entries, reports and views

A log entry (`event`) is `{ id, turn, source, kind, target { kind, id }, change, reason, refs, step, visibleTo }`. `source` is `kernel`, `player` or `agent:<id>`. `change` is `{ field, before, after }`, `{ field, delta }` or null. `visibleTo` lists the peoples whose projection shows the entry, or exactly `["all"]`. An entry without `visibleTo` reaches no projection.

A round report `log/T<turn>.json` holds `revBefore`, `revAfter`, `hashBefore`, `hashAfter`, `sections` (calendar, orders, probes, draws, substitutions and more in kernel form) and `events`, the full unfiltered log of the turn. The view `view/<people>.json` is the projection of the state ([rules-kernel.md](rules-kernel.md), section 13) without `rulesVersion`, `rng`, `eventPool` and `ingested`, with foreign peoples in the `foreignPeople` shape.

## Saves

A save lives in `saves/<slot>/` of its campaign, with the copy of the campaign folder under `campaign/` and the manifest `manifest.json` (format `realmcraft-save`, version 1, no schema of its own). Slot ids match the campaign id pattern `^[a-z][a-z0-9-]{1,40}$`. The kernel names them `save-<rev>` and `autosave-<rev>` and appends `-2`, `-3` and so on instead of overwriting a slot.

```js
{
  format: 'realmcraft-save', version: 1,
  slot,                        // folder name under saves/
  label,                       // the player's text, 1 to 80 characters without control or bidi override characters; null for an autosave
  auto,                        // null, or { reason: 'load', slot } for the files a load replaced
  campaign, turn, season, year, phase, status, rev,
  created,                     // ISO time
  stateHash,                   // kernel hash of the saved state
  journalHead,                 // hash of the last journal entry of the copy
  world: { id, hash },         // the package hash the copy is pinned to
}
```

The CLI answers `save` with `{ save: manifest }`, `saves` with `{ saves: [manifest] }` newest first, and `load` with `{ slot, autosave, turn, phase, status, rev, stateHash, drift }`. Refusals are `cli.missing_input` (no `--name` or `--slot`, exit 3), `format` with reason `label`, `slot-id` or `fork-unsupported` (exit 2), `cli.no_save` (exit 3), `phase` with reason `save-needs-planning` or `load-needs-planning`, `cli.turn_running` while `run.json` is active, `cli.locked` while another command holds the campaign lock, and `tamper` with reason `save-edited` or `save-campaign` for a copy that fails its checks (all exit 4). Warnings are `cli.world_drift` with reason `save-world` after loading a save of another package, and `cli.recovered` with reason `load-completed` or `load-dropped` after an interrupted load.

The dev server relays these commands ([architecture.md](architecture.md), route table in `serve.mjs`).

| Method and path | Body | Answer |
|---|---|---|
| `GET /api/campaigns/<cid>/saves` | none | 200 `{ ok, exit, saves, issues }` |
| `POST /api/campaigns/<cid>/saves` | `{ label }` | 201 `{ ok, exit, save, issues }` |
| `POST /api/campaigns/<cid>/load` | `{ slot }` | 200 `{ ok, exit, slot, autosave, turn, phase, status, rev, stateHash, drift, issues }`, then the events `view` and `status` |

Bodies are JSON objects of at most 1 KB without other fields. Errors answer `{ error, issues }` with 400 for an invalid field, 404 for an unknown campaign or slot, 409 for the phase, a running turn or a held lock, and 413 for a larger body.

## Gaps known on main

- `engine/schemas/world.js` does not yet accept `tuning.collapseCore`, so no world can set it and the kernel default applies.
- Issues carry an English message but no machine-readable reason key with parameters. The board maps issue codes to labels `issue.<code>`.
- Trade ids reveal a global sequence counter.
- The journal chain is tamper-evident only, `replay` is the full proof.

M1 closes several of these gaps in additive steps ([plan-m1.md](plan-m1.md)).

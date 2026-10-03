---
title: Game Design
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
related: [vision, rules-kernel, decisions, playtests, plan-m1, world-packages]
---

# Game Design

How a season of RealmCraft plays, what the player decides and why the mechanics look the way they do. The binding rules and formulas are in [rules-kernel.md](rules-kernel.md), the intentions in [vision.md](vision.md). Where M1 changes the design, the change is named and specified in [plan-m1.md](plan-m1.md).

## Consequences before the decision

Every decision shows its consequences where they act before it is fixed ([decisions.md](decisions.md), D15). Next to the stocks stand the changes, at the council member the loyalty change, on the map the affected tiles, at the probe the success probability, recomputed after every change. The preview is the kernel's `preview()` run in the browser on the player's projection, so what the board shows is what `apply()` will do. Only outcomes of foreign rolls stay open and are marked as such. The owner singled out this support of play in the first playtest ([playtests.md](playtests.md), entry 7).

## A season

A turn is one season and passes three phases.

1. Planning. The player assigns clans to work, chooses one main action and the minor actions the slots allow, sets the research target and uses free actions such as talks or a first Machtprobe. For every probe the board shows target, every modifier with its source and the probability, then the player rolls 1d10 on the board. The player also rolls the world event of the own people, whose band is thereby fixed before resolution.
2. Resolution. "End turn" seals the orders. The world agent writes an event card for each people's band, the validator checks it, and the kernel resolves the season in a fixed order ([rules-kernel.md](rules-kernel.md), section 4).
3. Agents. Research, council, rivals and chronicler work in parallel while the player plans the next season. Their accepted proposals appear as new candidates, council voices, destiny offers and chronicle. The rival agents deliver the AI peoples' orders for the next season.

Every change carries its origin (kernel, agent or player) with a reason. The board shows for every value where it comes from and lists the changes of the season.

## Game master, turn workers and judges

The game master is the Claude Code main session ([decisions.md](decisions.md), D12 and D14). It starts the turn with `/zug`, dispatches the tasks in parallel, keeps the overall narrative, decides conflicts between proposals and releases the turn. The turn workers run on the faster model, the world agent as the only blocking step, council, rivals, research and chronicler in parallel afterwards. After the turn the judges run in the background on the stronger model. The coherence judge finds contradictions with chronicle, world and characters, the balance judge finds runaway peoples, dominant paths and extreme stocks, and the narrative judge checks arc, dropped threads and destinies every fourth turn or at a chapter change and condenses the campaign memory. Judges set no values. Light findings are meant to flow into the next tasks (not yet wired), severe findings (real rule contradictions) are put to the player before the next turn ([agents-harness.md](agents-harness.md)).

## People and council

A people consists of clans, which are population and labour at once. Each clan works one slot of a controlled region for a resource, does research or a module activity such as herding. What is harvested is limited by the assigned clans and by the controlled land, a pattern taken from the work groups of the Winter prototype, where labour as bottleneck made building decisions concrete.

The nature of a people is a pair of tags, +2 on probes that suit it and −2 on those that go against it. In Hochland the Bergnomaden are the default player people, a nomadic highland people. The AI peoples are the Schädelklan, raider bands that close passes and steal herds, and the Talbund, a trade league of the valley towns. Any template of the world can be the player people.

The council is the political engine, as it was in every game-master campaign. Every member has a goal with favoured and opposed tags, a loyalty from −5 to +5, a life stage and an age. Consequential orders need a council vote. The kernel computes the votes from the match of order tags and goals, the council agent gives them words. The player can act against the majority by decree and pays in loyalty and approval, or break resistance in a Machtprobe. Members age and die, and succession resets standing and loyalty.

The approval of the people (Zustimmung) is a kernel meter from −5 to 5 beside the council. Famine and decrees lower it, a winter without famine raises it ([decisions.md](decisions.md), D22).

## Development without a fixed tree

Developments are the generic object from which a people grows, whether technique, doctrine, institution, discipline, unit, building or way of life. Each has effects, a lasting price, one-off consequences on acquisition and costs. Effect and price consist only of primitives of the canonical set ([data-contracts.md](data-contracts.md)). Narrative text describes and never acts.

The tree is not given. It grows out of the practice of the people.

- The practice ledger holds the tags of executed orders of the last eight seasons. Its three strongest tags are what the people actually does.
- The research agent proposes candidates anchored in practice, in a token or in a research request, within the power budget of their tier.
- With a research request the player sets an own direction of one to three tags and a sentence, which the research agent translates into a candidate within the budget.
- A main action can be declared a venture. It becomes harder or becomes a probe at all, and a natural 10 opens a breakthrough token whose candidate costs half the research. This is the regulated form of the critical coups that drove research in the campaigns.
- A Machtprobe with a lucky or clear success gives an `impulse` token, the political push from which research may anchor a doctrine or institution. Doctrines arose from power tests and orders from council resolutions in the campaigns.
- Without agents the kernel offers pool developments of the world that fit the practice.

Tiers and gates keep growth in frame. A tier opens for a people only when it knows enough developments of the tier below, has enough clans and settlements and the world is old enough. Research gains a base rate, labour, research modifiers and Wissen burned from stock each season and flows into one project. Its cost grows with the number of known developments.

### Paths and achievements from M1

From M1 research is organised in six fixed paths per domain, Nahrung (food), Gemeinschaft (community), Militär (military), Werk (craft and industry), Erkenntnis (knowledge) and Magie (magic). Each path has tiers matching the kernel tiers. Concrete items on a path are achievements (Errungenschaften), which are the existing development objects, generated by agents from the practice of the people and priced by the power budget, never a fixed tree. Research points come from the people's Wissen each season and form a research budget beside the action slots. Higher-tier achievements cost more points, and research accumulates over seasons. A path's tier rises with its completed achievements and gates higher tiers on that path. Magie opens only when the practice of the people touches magic ([decisions.md](decisions.md), D16, [playtests.md](playtests.md), entries 8 to 11).

## Modules

A module is a mechanics block in code with its own state, orders, primitives and panel. A development activates it, and only then may agents use its tags and orders. So the mechanics adapt to the chosen direction without an agent inventing rules. New modules are written by developers, never by agents (D10).

- Lebensweise, always active, nomadic or settled. Nomads move with camp and herds over high pastures and hold land by grazing right. Settled peoples build villages, fields and walls. The change takes two seasons and needs the council.
- Handel, activated by a market development. Contracts between peoples run over road-aware routes, a market exchanges at a moving price in the currency Salz.
- Magie, activated by the first discipline. A discipline has a source at a place, applications that consume it, a threatening dependency and a price as a meter that leads to threshold events. This was the strongest generative mechanic of the campaigns.
- Militär, deliberately simple. Units with strength and upkeep move over tiles, a battle is a probe of strength ratio and terrain, raids and sorties exist. The campaigns gave little evidence for war, because battles there were single probes.

Further modules generalised from the campaigns may follow, such as rule with delegation and change of constitution, faith and legitimacy, diplomacy, overlordship, bondage, absorption of foreign groups and threats. Combinations of active modules are where peoples differ.

## Map and growing world

The world is a generated, growing hex map ([decisions.md](decisions.md), D2). It is created from a seed and the generator rules of the world in chunks as someone comes near, so it is never finished. Tiles carry terrain, movement cost, sight and building sites. Regions group tiles and are the unit of control, yield and settlement. On the board regions appear as provinces with borders and names.

Every people sees only what it explored, and foreign units only where it currently looks (D9). The world agent may propose new places at the edge of the known, sources, ruins or shrines, when no people knows the tile, it lies far enough from all settlements and stays within the budget. So the world grows with the game without placing gifts at a people's door. Roads are features with levels that lower movement cost, built by road orders once a path development unlocks them.

## Probes and chance

The economy computes deterministically, harvest, consumption, upkeep and research without dice. Dice decide where the outcome is open, at exploration, migration, change of way of life, building, Machtprobe, battle, applications of disciplines, ventures and the world event.

A probe is 1d10 plus modifiers against a target of 3 to 8. A 1 always fails, a 10 always succeeds. Modifiers stack only in a limited way, so the die never becomes meaningless, and rolls like "12 against 7" from the campaigns are impossible. Six bands from critical success to critical failure grade every result. The player rolls for the own people and its world event, everything else comes from the kernel's stored generator. A roll is bound to its probe and goes visibly stale when the probe changes. A speech gives no bonus, because narration may not set a value.

## Destiny, victory and collapse

Every people has a destiny with three or four milestones ([decisions.md](decisions.md), D6), such as securing pastures, surviving a winter without hunger or building a winter settlement with stores. Each milestone is a predicate the kernel can check, such as control of regions, a state over several seasons, a minimum value, a relation, or knowledge of developments of a kind and tier. The first people with all milestones wins.

A people that changes its direction can adopt a new destiny once its practice has left the old one for four seasons. Research proposes destinies that fit the new practice, and without agents they come from the world package. Adoption costs standing and the loyalty of those attached to the old destiny. The destinies of rivals are hidden until revealed.

A people collapses when it has no settlement left or too few clans. The game mode is competition. An open chronicle without victory may follow later. M1 adds victory and defeat screens with a campaign summary ([decisions.md](decisions.md), D21).

## Fairness and protection against value drift

The power budget is the core of fairness. Every primitive has an integer weight. The effect of a development may not exceed the ceiling of its tier, effect and price give a net value that must lie in the tier's range, from tier 2 the price must reach a minimum, and the research cost follows from net value and tier. A proposal can be neither a bargain nor dead weight, and no agent can justify a too strong effect by high research cost. This mirrors the campaigns' rule that every strength is paid for and the nature pair whose +2 is bound to a −2. The weights and the tier table live only in `engine/schemas/effects.js`.

AI peoples share state shape, order catalogue, preview, validator, budget, proposal rate and fog with the player. Their agents see only the projection of their people. Each AI people has a profile of weighted interests so that not all play the same best line.

Several brakes work against value drift, each with evidence from the campaigns.

| Brake | Rule | Evidence |
|---|---|---|
| Stock caps | a surplus above the cap spoils | stocks far above scale in two campaigns |
| No knowledge store for research | research flows into one project, Wissen is burned up to a limit per season | knowledge far above scale in two campaigns |
| Upkeep | units, buildings and orders cost permanently | a guild that "wants to be fed" and a standing army never booked |
| Clamps | stats −2..+3, gains capped before losses | the hope value of Nachtmeer |
| Stacking limit | each modifier ±2, developments +3, total ±4 | rolls "12 against 7" and five modifiers in one throne room scene |
| Fading devotion | in winter a devoted member loses 1 when no order served its goal during the year, and loyalty moves at most two points per turn | whole councils frozen at +5 in two campaigns |
| Limited Machtprobe | one free, further ones cost a main action | four power tests in one season |
| Breakthrough instead of coup | only from a venture, never a higher tier | the coup lever of all campaigns |
| Number beats text | narration carries no values | contradictory text and numbers in one save |

## Worked path

The path the owner named as test case leads a mountain nomad people through the fixed settlement to trade and fortification and then forks into gunpowder, arcane fire or dark magic. It showed in the design that budget and validator admit each of these ways without one becoming cheaper. The values below are design values computed with the first weights. They are not pinned as fixture, and the Hochland content implements the path with its own developments (`saumpfad`, `sesshaft`, `hochweide-terrassen`, `markt-am-pass`, `geleitrecht`, `steinmauer`, `pulverwall`, `bannfeuer`, `blutritus`, `schuldknechtschaft`, `schwarzer-zirkel`, [world-packages.md](world-packages.md)).

| Development | Tier | E | P | N | Research | Result |
|---|---|---|---|---|---|---|
| Mountain paths | 1 | 3 | 0 | 3 | 6 | valid |
| The fixed settlement | 1 | 4 | −3 | 1 | 2 | valid, change of way of life |
| Terrace fields | 1 | 2 | 0 | 2 | 4 | valid |
| Market at the pass | 2 | 5 | −2 | 3 | 9 | valid, activates trade |
| Escort and toll right | 2 | 5 | −3 | 2 | 6 | valid |
| Stone wall | 2 | 4 | −1 | 3 | 9 | valid |
| Gunpowder | 3 | 9 | −5 | 4 | 16 | valid |
| Bastion, first proposal | 3 | 5 | −3 | 2 | none | rejected, `budget_net` |
| Bastion, revised | 3 | 5 | −2 | 3 | 12 | valid |
| Arcane fire | 3 | 9 | −5 | 4 | 16 | valid, activates magic |
| Blood rite | 2 | 6 | −4 | 2 | 6 | valid, activates magic |
| Debt bondage | 2 | 6 | −4 | 2 | 6 | valid, needs a bondage module |
| The Black Circle | 3 | 9 | −6 | 3 | 12 | valid |

`E` is the effect, `P` the (negative) price and `N = E + P` the net value, and research is `N × (tier + 1)`. The bastion shows the normal agent loop. Its first proposal carries running upkeep, its net 2 lies below the tier 3 range, and the validator reports `budget_net`. The revised proposal replaces upkeep by winter repairs and a narrow ban on leaving the bastion in winter. Arcane fire has the same effect frame, tier and research as gunpowder and differs in tags, source and kind of price, so one role can be filled technically or magically without one variant being cheaper.

The dark path reaches the same gross effect earlier and with less research. Its coupling arises without special rules, because the circle makes sacrifices of the unfree fearless, bondage supplies them, every raid drives unrest, and the circle vetoes the abolition of bondage. Whether the meters catch up with the lead is a balance question. The live balance judge reported the dark path as too cheap. Since M1 the minimum price of a tier counts only prices a people pays while it holds the development, and a dependency weighs the lighter of payment and penalty, so the blood rite and the arcane fire carry standing prices and the circle costs more research ([data-contracts.md](data-contracts.md), [world-packages.md](world-packages.md)).

## Taken over and dropped

Taken over from the campaigns and prototypes are the dice culture with open target, open modifiers and own roll, the council with own goals and loyalty, the discipline with source, applications and price, the nature as a bound pair, ageing with life rolls and succession, the season change with exactly one world event, work groups as bottleneck, costs from the opening stock with effects from the next season, council votes with visible reasons and decree with a price, binding institutions that also bind the leader, pure preview and reconstruction by recomputing, and rules that grow during play, now as validated developments.

Dropped are the chat game master with a hybrid Markdown save (text and number contradicted each other), free-text rulings as rule carriers, an open "overflow" range of base values, a scalar knowledge level that mixed store, research and memory, unlimited power tests, the speech bonus, trends as estimates instead of computed flows, a free hand with hollow loyalty, real market data and real time (they make games irreproducible), real-time play, the ASCII status console and tone of voice as rule (now configuration of the chronicler per world).

## Open owner questions

1. Chance. Should every action be rolled as in the game-master campaigns, instead of only the open outcomes?
2. Scale. Modifiers, stats and loyalty stay at the small integers of the campaigns, stocks in the low two-digit range, population in clans. Does this scale carry built units and trade quantities?
3. Council and ruler. Should the council step back behind people, units and map, and should the player figure be immortal?
4. Dark content. Should bondage and human sacrifice appear as playable institutions with full mechanics, and may AI peoples choose such paths on their own? A bondage module depends on the answer.
5. End of competition. Is there a turn limit, does a locked milestone count after its condition is lost (so far it does), and should the growing world produce more peoples than Schädelklan and Talbund?

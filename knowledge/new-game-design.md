---
title: New Game Design
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: active
language: en
created: 2026-10-15
updated: 2026-10-16
related: [vision, game-design, frontend, world-packages, journal]
---

# New Game Design

The owner requests an in-game conversation that turns a free description of a world and people into an editable campaign draft, then starts a fresh game. A chat simulation is being used to investigate that conversation. The browser now implements free descriptions, editable neutral defaults, a reversible kernel map preview and explicit creation. Adaptive questions, LLM interpretation and the visual treatment of arbitrary worlds remain under exploration.

## Owner requirements

The October 15 conversation establishes these requirements.

- Players can describe a world and people freely, receive questions that develop their idea, edit the resulting draft and start a separate campaign.
- Setting, characters, player role and desired experience can be defined per campaign. A campaign's visual treatment should respond to that definition.
- Questions should be targeted, easy and enjoyable to answer. The conversation should help the player understand story and worldbuilding.
- The owner wants process observation, documentation and curation alongside the simulated initialization.

The extent of supported mechanics and changes to the interface structure remains an open product decision. The existing kernel executes implemented primitives and modules, as described in [game-design.md](game-design.md). Free prose alone cannot add executable rules.

The owner subsequently constrained runtime game graphics to code-generated scenes. Image generation may support icons or design elements, but a world must not depend on generating a new raster scene for each change. The community-first composition is the preferred current exploration. The executable Hochland experiment and its limits are described in [frontend.md](frontend.md#community-prototype). This preference does not establish acceptance of the current drawing style or a visual grammar for every possible world.

## Evidence from the design conversation

The source is the owner conversation of October 15, 2026. Quotations below are short source excerpts. Interpretations are stated separately.

| Source statement or response | Design consequence |
|---|---|
| The owner requests free description, an editable generated draft and a new game. | The authoring conversation needs an explicit draft review before campaign creation. |
| The owner likes the layout with a community view beside a map, but rejects the style. | That arrangement is a candidate for a suitable campaign. It has no visual acceptance. |
| The owner calls the relief-map study too similar to Civilization. | Repeating that visual language would repeat an identified mismatch for this exploration. |
| The owner selects painterly 2.5D, then rejects the resulting image as cold and inauthentic. | The selected direction was exploratory. Increased image detail did not establish acceptance. |
| The owner asks for magic and technology and says “arbeiten mti daten cool” and “sie orchestreirt”. | These are interests for the current world exploration. Their fictional role remains to be developed. |
| The owner considers psykers and science fiction. | Both remain possibilities. Neither defines the campaign. |
| The owner likes the Dune 2 reference and expressly rejects copying it. | The specific effects of that reference still need to be identified before deriving a style. |
| The owner asks for three worlds, then questions their slop and clichés. | None of those worlds has been selected. Their names, peoples and laws remain assistant proposals. |

## Draft-led conversation to test

The owner chose to test a proposed whole-world draft after asking for a clearer overview of creation and the effects of decisions. The earlier activity question, scene choices and mood menu remain exploratory predecessors. The current proposal begins with a compact explanation of what the player is doing and how creation leads to play.

1. Propose a compact editable draft from the player's stated interests, with assistant defaults identified as proposals. World, community, extraordinary capabilities and player agency are the core fields. Show further details where requested.
2. Accept free changes or concrete alternatives. State what changed, preserve unrelated choices and distinguish added suggestions from the player's actual choices. Propagate changes into the next preview.
3. Offer a clearly named action to view a first-scene preview using the current draft. Preview is reversible. It can combine review and navigation, while the actual start remains a separate explicit action.
4. Begin the chat trial only on an explicit start choice. Show the first action's outcome and resulting state. A browser campaign requires its own supported creation flow and verified mechanics.

This is a revised design hypothesis. Generated walkthroughs show its wording and structural failure cases. Human comprehension, enjoyment and reading burden remain untested.

Ask follow-up questions where a decision affects the draft. Concrete alternatives can be combined or replaced. A philosophical question should be phrased through a situation the player can imagine. The authoring dimensions include atmosphere, moral character, colour, gods, belief, social organization, capabilities and their limits. A compassionate world can be serious, so those dimensions remain independently editable. Images may help communicate appearance, and the narrator's delivery has its own selected character.

## Findings from synthetic walkthroughs

The owner requested generated player responses and iterative subagent review. The [source transcripts and review dispositions](../research-artefacts/initialization/synthetic-iterations-2026-10-15.md) preserve the scripted scenarios. Their responses establish no owner preferences or human usability result. The iterations build on prior findings and use a harder final case, so they are not a controlled comparison.

The textual review yields these correction requirements for the next prototype.

- A request to travel leaves the travel form open. Mark a boat or wagon as an author suggestion until the player selects it or delegates the detail. Iteration 1 silently promoted ships into fact.
- A revision can change a community's residence while preserving mobile workshops. Remove superseded assumptions from the preview. A personal character can remain open while the player explicitly chooses community-level control for a chat trial.
- Describe an extraordinary capability's technical status before promising it in a real campaign. The fictional abilities in these transcripts remain chat prototypes; the implemented start exposes only supported mechanics.
- When wishes are in tension, explain possible scopes and ask for the intended relationship. Unlimited personal power and societal scarcity can coexist, but the reason scarcity persists remains a separate worldbuilding question in the final walkthrough.
- State what a proposed trial can reveal and what it leaves uncertain. Report the comparisons and independent observations the player requested. An unexplained observation is insufficient to claim a material effect.
- Narrate the consequences of the chosen action and leave further player-controlled decisions open. A test order does not also authorize a community policy decision. Autonomous participants need established scope for their own actions.

The synthetic review does not establish an accepted visual style or narrator audio quality. The browser implementation described below has its own regression evidence. The owner's confirmation of the next concrete prototype remains the acceptance step.

## Delegated setup

After the scene cards were formalized, the owner asked the facilitator to choose what fits best and set up a new game. This authorizes provisional defaults for the current chat prototype. It does not establish agreement with every fictional detail or a general preference for automatic creation.

The facilitator selects collaboration with intelligences because the owner explicitly expressed interest in data work and orchestration. Show the selected basis and a compact editable setup, then move to a first playable situation. Further authoring questions can arise from play. Whether this produces a better start remains a hypothesis until the player acts and reviews the experience.

The initial prototype state and observation cutoff are recorded in [the dated setup snapshot](../snapshots/initialization-2026-10-15.md). Canonical kernel campaigns remain subject to CLI-only writes.

## Free intentions during play

The owner also requests decisions beyond the predefined order list and considers direct conversation with the harness as the means of expressing them. The current board offers implemented orders, research direction and council controls. Its action-slot picker groups existing main or minor orders and targets and reuses the kernel preview. It supplies no LLM conversation.

The proposed extension translates a freely described intention into a reviewable supported action, asks for missing details and shows kernel-derived costs and consequences before confirmation. An intention outside the primitive set remains a design or development request until a supported implementation exists. Whether the external harness remains open or a background service is integrated into the game is an implementation decision still to be made.

## Spoken narrator

During the full-start simulation the owner requested that the offered scenes be read by a compelling storyteller and that the same experience be available in the game. None of the offered starting scenes had been selected when this request arrived. Spoken delivery is therefore a new presentation requirement, while its effect on world selection remains untested.

The narrator should have a recognizable delivery and accompany campaign creation. The owner selected calm, mysterious delivery with some dry humour. Gender, timbre, fictional identity and relation to the world remain open. This establishes a narration preference, while the emotional character of the world remains editable. The existing choices and transcripts should remain available, with playback, interruption, replay and voice volume controls. These interaction details are proposed acceptance criteria.

Inspection of the board audio module found synthesized Web Audio cues and ambience, with no speech synthesis integration. The current tool inventory exposed no speech generation tool. A local System.Speech check exposed only an English desktop voice, so no German audio preview was produced. Narration quality and playback behavior have not been tested. Provider selection and implementation remain open.

## Observation and curation

Keep the following evidence distinctions throughout the simulation.

- Owner statements record what the player actually supplies or adopts.
- Assistant proposals preserve their tentative status until adopted.
- Observations describe what happened in the exchange and point to the relevant question or response.
- Hypotheses explain what might improve the process and require a later exchange to test them.

After a substantive exchange, note which question was asked, what it elicited, what remains unclear and whether the next question follows from the answer. Ask for clarification where the interpretation would materially shape the draft. Process notes should be brief enough to preserve the flow of play.

The earlier exchange supports a specific observation. The assistant repeatedly supplied extensive explanations and finished world sketches before a short adaptive question sequence was completed. This suggests that shorter exchanges may better fit the owner's request. The first bare activity question was subsequently rejected for offering too little. Short exchanges therefore need substantive examples or alternatives. Their effectiveness remains untested.

The assistant's critique of its sketches supplies provisional review criteria. A people needs social practices beyond an invented name and profession. Extraordinary effects need intelligible causal limits. Generated dilemmas need relationships and context. Test these criteria against later drafts and the owner's responses before treating them as accepted design principles.

Curate repeated findings into the responsible design section and record a coherent integration in [journal.md](journal.md). Fiction produced during play belongs to campaign memory under the [operations contract](operations.md). This development conversation does not authorize manual campaign-state writes.

## Implementation boundary and review

The owner authorized implementation of a free realm start on October 16. The browser workflow in `spielbrett/js/ui/realm-start.js` preserves the descriptions, supplies neutral defaults and offers explicit mechanical choices. The pure compiler in `engine/creation/realm.js` produces an independent package with authored identities, a curated development pool, new event cards and supported goals. It never infers mechanics from keywords. Landscape changes the real generator; way of life, strength, weakness and goal change kernel inputs. Council names and role labels remain descriptive; positions retain their supported council behavior.

`POST /api/realms/draft` creates the draft, `preview` validates and opens an in-memory campaign, and `start` installs the immutable package and creates a separate campaign through the CLI. The preview shows the known map, home, resources, council and goal that the compiled start uses. It supplies no generated first-scene artwork. The interface explains this boundary before the mechanical choices. The authoring contract and retry guarantees are in [data-contracts.md](data-contracts.md#realm-creation).

Existing packages and campaigns remain unchanged. Authored worlds start on the map because the Hochland community drawing has no rendering vocabulary for arbitrary fiction. Full prose is retained in the package and passed to the relevant later agent tasks. No runtime text LLM, adaptive worldbuilding interview, arbitrary capability compiler or spoken narrator is part of this implementation. Browser tests establish executable behavior; comprehension, enjoyment and artistic acceptance still require the owner's review.

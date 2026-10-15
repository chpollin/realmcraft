---
title: New Game Design
project:
  name: RealmCraft
  repository: https://github.com/chpollin/realmcraft
method:
  name: Promptotyping
  url: https://lisa.gerda-henkel-stiftung.de/digitale_geschichte_pollin
status: draft
language: en
created: 2026-10-15
updated: 2026-10-15
related: [vision, game-design, frontend, world-packages, journal]
---

# New Game Design

The owner requests an in-game conversation that turns a free description of a world and people into an editable campaign draft, then starts a fresh game. A chat simulation is being used to investigate that conversation. The creation flow is a design requirement. Its questions and presentation remain under exploration.

## Owner requirements

The October 15 conversation establishes these requirements.

- Players can describe a world and people freely, receive questions that develop their idea, edit the resulting draft and start a separate campaign.
- Setting, characters, player role and desired experience can be defined per campaign. A campaign's visual treatment should respond to that definition.
- Questions should be targeted, easy and enjoyable to answer. The conversation should help the player understand story and worldbuilding.
- The owner wants process observation, documentation and curation alongside the simulated initialization.

The extent of supported mechanics and changes to the interface structure remains an open product decision. The existing kernel executes implemented primitives and modules, as described in [game-design.md](game-design.md). Free prose alone cannot add executable rules.

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

## Conversation method to test

Ask one question, wait for an answer and choose the follow-up from that answer. Offer concrete alternatives that the player can combine, replace or leave open. On October 15 the owner rejected the bare question about desired activity because it offered too little to react to, and requested choices concerning the character of the world, colours, gods, belief and social concepts. This observation revises the earlier open-question proposal. The next simulation begins with examples of the desired atmosphere. Its effectiveness remains to be tested.

A candidate sequence begins with the desired atmosphere, then explores a concrete place or situation and the activity the player wants. From there it can explore an unusual capability, its prerequisites, limits, failure modes and observable consequences. Relationships, everyday life and competing interests help develop a community. Role, stakes, presentation and a playable opening follow where the answers support them. The sequence is provisional and may change with the player's starting idea.

Philosophical questions guide the facilitator's follow-ups. They concern what exists, how knowledge is established, who can act, who controls access and what obligations arise. Their player-facing wording should use situations that the player can imagine. A philosophical checklist has not been tested as an enjoyable onboarding experience.

The facilitator proposes consequences explicitly. A proposed consequence becomes part of the world when the player adopts it. An unanswered proposal remains open. At draft review, the player can revise earlier choices and inspect unresolved points. Any mechanical capability must be checked against implemented support before a browser campaign is promised.

The owner requests coverage of moral character, seriousness, colour, gods, belief and social organization, and permits images when they help communicate feeling and appearance. These are authoring dimensions. No particular religion, social order or visual treatment follows from listing them. A compassionate world may also be serious, so these dimensions should remain separately editable.

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

The current browser creation handler in [server/newgame.mjs](../server/newgame.mjs) validates a world package, seed, template people, rivals, difficulty and language, then invokes the kernel CLI. It does not implement the free-description conversation. This statement was checked against the handler during this documentation pass.

Before implementation, review a completed chat draft with the player. Check that its accepted statements can be traced to the exchange, unresolved points remain visible, its first decisions are understandable and its mechanical promises have supported implementations. Evaluate the visual treatment separately through the owner's response to a concrete design. A chat simulation is evidence about the conversation, while kernel and browser behavior require their own checks.

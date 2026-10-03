---
title: Vision
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
related: [game-design, decisions, architecture, plan-m1]
---

# Vision

RealmCraft is a turn-based open-world strategy game in the browser in which a people develops its own way over the seasons. A deterministic rules kernel keeps every number, language-model agents in Claude Code propose events, achievements, council voices, rival moves and chronicle, and a validator with a power budget keeps their proposals fair. It is a Promptotyping research project of DHCraft and the owner's own game. Code is MIT, text CC BY 4.0.

## Intentions

The owner's intention combines goals that depend on each other.

1. Individual development. Every people takes a way that grows out of what it does. Two campaigns with the same start should end in different peoples.
2. Mechanics follow the direction. A trading people gets trade mechanics, a people that discovers magic gets a magic economy. The rules grow with the people, and nobody invents a rule during play.
3. A fair frame. Whatever a people gains it pays for. AI peoples play by the same rules, with the same view and the same budget.
4. An agent harness. Language models propose content and the kernel checks and books every proposal. No agent sets a value.
5. The map first. The surface is a growing hex map on which the people moves, settles, explores and fights. Council, research and chronicle are panels over the map.
6. Consequences before the decision. Every decision shows its consequences where they act before it is fixed, computed by the same kernel function that later resolves the turn ([decisions.md](decisions.md), D15).

## Shape of the game

One turn is one season. The player plans orders, assigns clans to work, chooses research, talks to the council and rolls 1d10 for the probes of the own people. Clicking "end turn" seals the orders, the game master session runs `/zug`, the world agent writes the season's event cards, the kernel resolves the season, and the other agents work in parallel while the player already plans the next season ([game-design.md](game-design.md)).

Victory comes from the Bestimmung, a destiny with three or four milestones that the kernel can check. Collapse of the own people is defeat. A people that changes its direction can adopt a new destiny.

## Origin

RealmCraft began in May 2026 as a dashboard for game-master campaigns played in chat with a language model. Those campaigns showed that rules grow during play, but without a frame they drifted, and text and numbers contradicted each other in the same save. Round prototypes (Winter, Nachtmeer) and a real-time plan followed in September 2026. On 3 October 2026 the owner replaced all of them with one turn-based game built on a kernel with checkable rules, which keeps the growth of rules and removes the drift ([decisions.md](decisions.md), D1, E2). The evidence from the former campaigns stands behind many rules of [game-design.md](game-design.md).

## Milestone M1

The owner's direction for M1 is to implement the game to completion. M1 adds the research paths model, English as default UI language with German selectable, a start screen and menus, synthesized audio, polished event cards and end-of-game screens, and turns the playtest entries into requirements ([decisions.md](decisions.md), D16 to D21, [playtests.md](playtests.md)). The binding plan and the lane contracts are in [plan-m1.md](plan-m1.md).

## Acceptance by the owner

The owner accepts the game by playing a campaign in the browser with live agents. The criteria carried over from the first plan are these:

1. A new campaign in Hochland starts with Bergnomaden, Schädelklan and Talbund on a generated map that grows when explored.
2. The map is the main surface. Planning, rolling and ending the turn work without the terminal apart from running `/zug`.
3. Every decision shows its consequences before it is fixed where they act, and every probe shows target, modifiers with source and probability before the roll and the full calculation after it.
4. For every value its origin is visible, and the changes of the season are listed completely.
5. New achievements visibly fit what the people did, and an own research direction leads to a fitting candidate.
6. A path like the worked example in [game-design.md](game-design.md) is playable, at least up to the market at the pass or the stone wall.
7. Rivals act visibly and with a recognisable stance, while their stocks and plans stay hidden.
8. A failing agent is marked and the turn continues.
9. The destiny is visible with milestones, a switch is possible, and victory and collapse are reachable in a test campaign.
10. World events show the judges' findings, and a severe finding is put to the player before the next turn.
11. The waiting time of a turn lies with the world agent, while council, rivals, research and chronicler work as the owner plans.

Technical tests, observed operation and the owner's design and domain acceptance are reported separately ([testing.md](testing.md)).

---
title: Glossary
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
related: [INDEX, game-design, rules-kernel, world-packages]
---

# Glossary

German project terms with their id in code where one exists and an English explanation. German terms keep their German ids in code and data, mechanical building blocks carry English ids. Visible texts come from the `labels.json` of the world package, so the label of a term can differ by world.

## Game and people

| Term | Id | Explanation |
|---|---|---|
| Volk | `people`, `peoples` | A people, the actor of the game, led by the player or by an agent with the same shape and rules |
| Sippe | `population.core` | Clan, the unit of population and labour. The core value Volk counts clans |
| Wesensart | `identity.wesensart` | The nature of a people as a bound pair of tags, +2 on fitting probes and −2 on contrary ones |
| Lebensweise | `lebensweise` | Way of life, a development of kind `lebensweise` (`nomadisch`, `sesshaft`) and the always active module of the same name |
| Lager, Dorf | settlement kinds `lager`, `dorf` | Camp of a nomadic people that moves with it, and village of a settled people |
| Weiderecht | module `lebensweise`, `RULES.campHold` | Grazing right, the hold a camp keeps on its region for a few turns after moving on |
| Zug, Weiterziehen | order `migrate` | Migration of the camp to another tile |
| Hüten, Adepten | activities `hueten`, `adepten` | Labour activities of a clan for herds and for a magic source |
| Ansehen | `standing` | Standing of a people from 0 to 3 |
| Lagewerte | `stats` | Stats from −2 to +3. In Hochland Verteidigung (defence), Mobilität (mobility) and Wohlstand (prosperity) |
| Zustimmung | `meters.zustimmung` | Approval of the people, a kernel meter from −5 to 5 |
| Kernwerte | | Core values every world carries, Nahrung (food), Material, Wissen (knowledge), Volk and Zustimmung |
| Herden, Erz, Salz, Psil, Opferkraft | resource ids `herden`, `erz`, `salz`, `psil`, `opfer` | World goods of Hochland. Salz is the trade currency, Psil and Opferkraft are magic sources |
| Meter | `meters`, primitive `meter` | A bounded counter with rise, decay and threshold consequences, the typical price of a discipline (Begehrlichkeit, Furcht, Aufruhr, Glutzehrung, Psilhunger in Hochland) |

## Council and rule

| Term | Id | Explanation |
|---|---|---|
| Rat, Ratsmitglied | `council` | The council and its members, each with a goal of favoured and opposed tags, loyalty, age and life stage |
| Loyalität | `loyalty` | Loyalty from −5 to 5 with the bands ergeben (devoted), treu (loyal), schwankend (wavering), verstimmt (disgruntled) and am Bruch (at breaking point) |
| hohle Loyalität | `hollow` | Hollow loyalty set by `loyalty.bind`, tested by a kernel probe every winter and broken into betrayal on failure |
| Lebensstand | `lifeStage` | Life stage, `ruestig` (vigorous), `lebensabend` (old age) or `hinfaellig` (frail) |
| Leitung | `leader` | The leading council member |
| Ratsbeschluss | `councilVote` | Council resolution required for orders in the governance scope |
| Erlass | mandate `decree` | Decree that executes an order against the council majority at a loyalty and approval price |
| Machtprobe | order `machtprobe` | Power probe against or with the council, with the aims override, rally, reconcile and quell |
| Gespräch | order `talk` | Free talk with a council member, of which only honouring changes values |
| Autorität, Sammlung | statuses `autoritaet`, `sammlung` | Statuses from a Machtprobe that add +1 to probes of main orders |

## Development and research

| Term | Id | Explanation |
|---|---|---|
| Entwicklung | `entwicklung` | Development, the one generic content object for technique, doctrine, institution, discipline, unit, building and way of life |
| Errungenschaft | `entwicklung` | Achievement, the player-facing term for a development on a research path from M1 on (D16) |
| Pfad | | Research path. From M1 the six paths Nahrung, Gemeinschaft, Militär, Werk, Erkenntnis and Magie, each with tiers (D16) |
| Stufe | `tier` | Tier of a development, which fixes its budget row and gate |
| Art | `kind` | Kind of a development, `technik`, `doktrin`, `institution`, `disziplin`, `einheit`, `bauwerk`, `lebensweise` |
| Kandidat | `developments.candidates` | A development offered to a people for research, from the pool or from an agent |
| Forschungsanfrage | order `research.direct` | Research request, the player's own direction of one to three tags and a sentence |
| Forschungspunkte | | Research points of a season, from base rate, labour, research modifiers and burned Wissen |
| Praxis, Praxisbuch | `practice.ledger` | Practice ledger of the tags of executed orders over the last eight turns, whose strongest tags anchor new developments |
| Marke | `tokens` | Token, `breakthrough`, `impulse`, `crisis` or `grievance` |
| Wagnis | draft `venture` | Venture, a main order declared risky, which makes it a probe and can open a breakthrough |
| Durchbruch | token `breakthrough` | Breakthrough from a natural 10 on a venture, which halves the research cost of a resulting candidate |
| Disziplin, Quelle, Anwendung, Entzug | kind `disziplin` | Discipline of magic with a source resource, applications that use it, and withdrawal when its dependency goes unpaid |
| Machtbudget | `WEIGHTS`, `TIERS` | Power budget that prices every proposal by the weights of its primitives |

## Destiny

| Term | Id | Explanation |
|---|---|---|
| Bestimmung | `bestimmung` | Destiny, the victory track of a people with three or four milestones |
| Meilenstein | `milestones` | Milestone, one predicate the kernel checks and that locks once reached |
| Untergang | `result.kind collapse` | Collapse of a people without settlement or with too few clans, a defeat when it hits the player |

## Turn and world

| Term | Id | Explanation |
|---|---|---|
| Runde, Saison, Jahreszeit | `turn` | One turn is one season. Seasons in Hochland are Frühling, Sommer, Herbst and Winter |
| Zug beenden | `POST /api/seal` | End turn, the button that seals the player's orders |
| Probe, Wurf | `probes`, `rolls` | Probe and roll, 1d10 plus modifiers against a target |
| Band | `BANDS` | Outcome band of a probe from `crit_fail` to `crit_success`, also the five bands of the world event roll |
| Weltereignis, Ereigniskarte | `eventDraws`, content `ereignis` | World event of a people each season and the event card that carries it |
| Weltpaket | `welten/<id>/` | World package with generator, rules, labels, style and content |
| Hochland | `welten/hochland` | The first world package, a highland with the peoples Bergnomaden, Schädelklan and Talbund |
| Region, Provinz | `regionId` | Region of tiles, the unit of control, yield and settlement, shown as province on the board |
| Merkmal | `map.features` | Feature on a tile, such as a source, ruin, shrine or road |
| Weg, Straßenbau | feature kind `weg`, orders `road`, `road.pave` | Road tiles with levels that lower movement cost |
| Raubzug, Ausfall | orders `raubzug`, `ausfall` | Raid and sortie of the military module |
| Kampagne, Partie | `campaigns/<cid>/` | A campaign, one game in one world package |

## Harness and board

| Term | Id | Explanation |
|---|---|---|
| Spielleitung | main session with `/zug` | Game master, the Claude Code main session that runs a turn |
| Zugarbeiter | `world`, `research`, `council`, `rival`, `chronicler` | Turn workers, the agents of a turn |
| Welt-Agent, Forschung, Rat, Rivale, Chronist | agent ids as above | World agent, research agent, council agent, rival agent, chronicler |
| Spielrichter | `judge-coherence`, `judge-balance`, `judge-narrative` | Judges that check coherence, balance and narrative arc after the turn |
| Befund, Korrektur | items `finding`, `correction` | Finding and correction of a judge |
| Regelkern | `engine/` | The rules kernel |
| Spielbrett | `spielbrett/` | The map-first game board in the browser |
| Weltgeschehen | view `weltgeschehen` | Panel of kernel results, agent steps and judge findings |
| Spieltest | `docs/spieltests` in the history, now [playtests.md](playtests.md) | Playtest by the owner |

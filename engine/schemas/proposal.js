// Proposal (agent to kernel, agents/proposals/<proposalId>.json). Text items
// (narrative, voice, stance, memory, finding) are closed objects without value
// fields, so a number can appear in prose but never as data the kernel reads.
// Which item types an agent may send is a table of the content validator
// (ITEMS_BY_AGENT below is that table, exported so task limits and validator
// share it).

import { AGENTS, COMMON_DEFS, LIFE_STAGES, arr, bundle, int, nullable, obj, ref, str, text } from './common.js';
import { EFFECT_DEFS } from './effects.js';
import { ENTWICKLUNG_DEFS } from './entwicklung.js';
import { BESTIMMUNG_DEFS } from './bestimmung.js';
import { CAMPAIGN_DEFS } from './campaign.js';
import { WORLD_DEFS } from './world.js';
import { DRAFT_DEFS } from './draft.js';

export const ITEM_TYPES = Object.freeze([
  'entwicklung', 'event', 'feature', 'narrative', 'voice', 'stance', 'person', 'goal', 'orders', 'image',
  'bestimmung', 'memory', 'correction', 'finding',
]);

const JUDGE_ITEMS = Object.freeze(['finding', 'correction']);

export const ITEMS_BY_AGENT = Object.freeze({
  research: Object.freeze(['entwicklung', 'bestimmung']),
  rival: Object.freeze(['orders', 'stance']),
  council: Object.freeze(['person', 'goal', 'voice']),
  world: Object.freeze(['event', 'feature']),
  chronicler: Object.freeze(['narrative']),
  image: Object.freeze(['image']),
  'judge-coherence': JUDGE_ITEMS,
  'judge-balance': JUDGE_ITEMS,
  'judge-narrative': Object.freeze([...JUDGE_ITEMS, 'memory']),
});

const refs = arr(text(80, 1), 12);
const goal = obj({ text: text(200, 1), favor: arr(ref('tag'), 4), oppose: arr(ref('tag'), 4) });
const item = (type, props) => obj({ type: { const: type }, ...props });

// Items that change state; a judge's correction wraps exactly one of them, and
// the validator checks it as if the owning agent had sent it. "effects" exists
// only inside a correction: one-off primitives against `people` whose net
// weight the validator bounds.
const STATE_ITEMS = {
  entwicklung: item('entwicklung', { data: ref('entwicklung') }),
  event: item('event', { data: ref('ereignis') }),
  // The kernel stamps since and source when it stores the feature.
  feature: item('feature', {
    tile: ref('tile'),
    data: obj({ id: ref('id'), kind: ref('id'), name: text(60, 2), tags: arr(ref('tag'), 4), resources: arr(obj({ key: ref('key'), amount: int(1, 999) }), 4) }),
  }),
  // Loyalty of a new member is set by the kernel (tuning.newMemberLoyalty), never proposed.
  person: item('person', {
    seat: ref('id'),
    data: obj({ id: ref('id'), name: text(60, 2), role: ref('id'), goal, age: int(12, 120), lifeStage: { enum: [...LIFE_STAGES] }, appearance: text(200) }),
  }),
  goal: item('goal', { member: ref('id'), goal }),
  // Destiny proposal of the research agent for a people that may switch (D6).
  bestimmung: item('bestimmung', { data: ref('bestimmung') }),
};

export const PROPOSAL_DEFS = Object.freeze({
  proposal: obj({
    format: { const: 'realmcraft-proposal' },
    version: { const: 1 },
    proposalId: ref('proposalId'),
    agent: { enum: [...AGENTS] },
    campaign: ref('id'),
    turn: ref('turn'),
    basedOnRev: int(0, 999999),
    people: nullable(ref('id')),
    items: arr({
      oneOf: [
        ...Object.values(STATE_ITEMS),
        item('narrative', { refs, text: text(4000, 1) }),
        item('voice', { member: ref('id'), refs, text: text(1000, 1) }),
        item('stance', { refs, text: text(1000, 1) }),
        item('orders', { data: ref('draft') }),
        item('image', { ref: text(80, 1), path: str('^narrative/images/[a-z0-9@._-]{1,80}\\.(png|jpg|webp)$') }),
        // Distilled campaign memory of the narrative judge (narrative/gedaechtnis.md), text only.
        item('memory', { refs, text: text(8000, 1) }),
        // A judge's finding. severe marks a real rule contradiction the game
        // master puts to the player; info and warn reach the roles in `for`
        // through context.findings of their next tasks.
        item('finding', {
          id: ref('id'),
          severity: { enum: ['info', 'warn', 'severe'] },
          for: arr({ enum: [...AGENTS] }, AGENTS.length),
          refs: arr(text(80, 1), 12, 1),
          text: text(1000, 1),
        }),
        // A judge's correction of a finding (an id of a finding in this or an
        // earlier proposal of the same judge). needsConsent true: the game
        // master puts it to the player, and ingest waits for "consent yes".
        item('correction', {
          finding: ref('id'),
          needsConsent: { type: 'boolean' },
          people: nullable(ref('id')),
          item: {
            oneOf: [
              ...Object.values(STATE_ITEMS),
              item('effects', { effects: arr(ref('oncePrimitive'), 3, 1) }),
            ],
          },
        }),
      ],
    }, 12, 1),
  }),
});

export const proposal = bundle('proposal/1', PROPOSAL_DEFS.proposal,
  COMMON_DEFS, EFFECT_DEFS, ENTWICKLUNG_DEFS, BESTIMMUNG_DEFS, CAMPAIGN_DEFS, WORLD_DEFS, DRAFT_DEFS, PROPOSAL_DEFS);

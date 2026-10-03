import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { validate } from '../../../engine/content/schema.js';
import { stateHash, open, emptyDraft } from '../../../engine/core/turn.js';
import { buildJudgeTask, buildTasks } from '../../../engine/harness/tasks.js';
import { ingestProposal } from '../../../engine/harness/ingest.js';
import { agentEntwicklung, freshCampaign, hochland, proposalFor, taskOf, withPractice } from '../../fixtures/engine/k1/harness.js';

const { env, library } = hochland();
const base = freshCampaign(env);
const player = base.campaign.player;
const ai = Object.keys(base.peoples).find((id) => id !== player);
const state = withPractice(base, player);
const tasks = buildTasks(state, env, { library });
const fixture = (name) => JSON.parse(readFileSync(new URL(`../../fixtures/engine/${name}`, import.meta.url), 'utf8'));
const research = taskOf(tasks, 'research', player);
const chronicler = taskOf(tasks, 'chronicler');
const entwicklungProposal = (id = 'karawanenpfad', over = {}) => proposalFor(research, [{ type: 'entwicklung', data: agentEntwicklung(env, research.respondAs.proposalId, id) }], over);
const ingest = (s, p, task, extra = {}) => ingestProposal(s, env, p, { task, library, ...extra });
const overBudget = (proposalId) => {
  const over = fixture('entwicklung/donnerkeil-over-budget.json');
  return { type: 'entwicklung', data: { ...over, origin: { ...over.origin, source: 'agent', proposal: proposalId } } };
};

describe('ingestProposal, research', () => {
  const res = ingest(state, entwicklungProposal(), research);

  it('stores the Entwicklung as candidate and in the library, with one revision step', () => {
    assert.equal(res.verdict, 'accepted', JSON.stringify(res.issues));
    assert.deepEqual(res.state.peoples[player].developments.candidates, [{ ref: 'karawanenpfad@1', offeredAt: 0, expiresAt: 4, origin: 'agent' }]);
    assert.ok(res.library.entries.some((e) => e.ref === 'karawanenpfad@1'));
    assert.equal(res.state.rev, state.rev + 1);
    assert.equal(res.state.ingested[research.respondAs.proposalId], res.hash);
    assert.deepEqual(validate(SCHEMAS.campaign, res.state), []);
  });

  it('logs every change with the agent as source and the proposal id in refs', () => {
    assert.ok(res.events.some((e) => e.change));
    for (const e of res.events) {
      assert.equal(e.source, 'agent:research');
      assert.ok(e.refs.includes(research.respondAs.proposalId));
      assert.equal(e.step, 'ingest');
    }
    assert.ok(res.state.chronicle.some((e) => e.kind === 'ingest.candidate'));
  });

  it('is idempotent: the same proposal again changes nothing', () => {
    const again = ingest(res.state, entwicklungProposal(), research, { library: res.library });
    assert.equal(again.verdict, 'duplicate');
    assert.equal(again.state, res.state);
    assert.equal(again.library, res.library);
  });

  it('reports a conflict for the same id with other content and leaves the state alone', () => {
    const other = entwicklungProposal();
    other.items[0].data.name = 'Anderer Pfad';
    const r = ingest(res.state, other, research, { library: res.library });
    assert.equal(r.verdict, 'rejected');
    assert.ok(r.issues.some((i) => i.code === 'conflict'));
    assert.equal(stateHash(r.state), stateHash(res.state));
  });

  it('rejects a stale basedOnRev with the stale code and no change', () => {
    const r = ingest(state, entwicklungProposal('karawanenpfad', { basedOnRev: research.rev + 1 }), research);
    assert.equal(r.verdict, 'rejected');
    assert.ok(r.items.every((i) => i.issues.some((x) => x.code === 'stale')));
    assert.equal(r.state, state);
  });

  it('accepts the valid items of a partial proposal and drops the over-budget one', () => {
    const p = entwicklungProposal();
    p.items.push(overBudget(p.proposalId));
    const r = ingest(state, p, research);
    assert.equal(r.verdict, 'partial');
    assert.deepEqual(r.items.map((i) => i.verdict), ['accepted', 'rejected']);
    assert.ok(!r.library.entries.some((e) => e.ref.startsWith('donnerkeil')));
    assert.equal(r.state.peoples[player].developments.candidates.length, 1);
  });

  it('rejects a proposal without any accepted item and keeps state and library', () => {
    const r = ingest(state, proposalFor(research, [overBudget(research.respondAs.proposalId)]), research);
    assert.equal(r.verdict, 'rejected');
    assert.equal(r.state, state);
    assert.equal(r.library, library);
  });

  it('spends the breakthrough token a candidate names and marks its origin', () => {
    const tok = structuredClone(state);
    tok.peoples[player].tokens = [{ id: 'tok-t0-1', kind: 'breakthrough', tags: ['weg'], turn: 0, source: 'natural 10' }];
    const p = entwicklungProposal();
    p.items[0].data.origin.token = 'tok-t0-1';
    const r = ingest(tok, p, research);
    assert.equal(r.verdict, 'accepted', JSON.stringify(r.issues));
    assert.equal(r.state.peoples[player].developments.candidates[0].origin, 'breakthrough');
    assert.deepEqual(r.state.peoples[player].tokens, []);
  });

  it('keeps at most six candidates', () => {
    const full = structuredClone(state);
    full.peoples[player].developments.candidates = Array.from({ length: 6 }, (_, i) => ({ ref: `x${i}pfad@1`, offeredAt: 0, expiresAt: 4, origin: 'pool' }));
    const r = ingest(full, entwicklungProposal(), research);
    assert.equal(r.verdict, 'rejected');
    assert.ok(r.issues.some((i) => i.code === 'limit'));
  });
});

describe('ingestProposal, text and phases', () => {
  const narrative = (text, over = {}) => proposalFor(chronicler, [{ type: 'narrative', refs: [], text }], over);

  it('rejects a narrative that carries a value field', () => {
    const raw = fixture('proposal-invalid-narrative-value.json');
    const p = { ...raw, campaign: chronicler.campaign, turn: chronicler.turn, basedOnRev: chronicler.rev, proposalId: chronicler.respondAs.proposalId };
    const r = ingest(state, p, chronicler);
    assert.equal(r.verdict, 'rejected');
    assert.ok(r.issues.some((i) => /narrative_values|schema/.test(i.code)));
    assert.equal(r.state, state);
  });

  it('writes a narrative to the chronicle file without a state change beyond the bookkeeping', () => {
    const r = ingest(state, narrative('Der Rauch steht still über dem Kamm.'), chronicler);
    assert.equal(r.verdict, 'accepted');
    assert.deepEqual(r.texts, [{ path: 'narrative/chronik/T0000.md', text: 'Der Rauch steht still über dem Kamm.\n' }]);
    assert.equal(r.state.rev, state.rev + 1);
    assert.deepEqual(r.state.peoples, state.peoples);
  });

  it('still admits text after a revision change of the same turn', () => {
    const later = { ...state, rev: state.rev + 3 };
    assert.equal(ingest(later, narrative('Ein späterer Absatz.'), chronicler).verdict, 'accepted');
  });

  it('defers a proposal whose items the phase does not admit', () => {
    const planning = open(state, env).state;
    const r = ingest(planning, entwicklungProposal(), research);
    assert.equal(r.verdict, 'deferred');
    assert.ok(r.issues.some((i) => i.code === 'phase'));
    assert.equal(r.state, planning);
    assert.equal(ingest(planning, narrative('Text im Plan.'), chronicler).verdict, 'accepted');
  });

  it('prunes ingested ids older than eight turns', () => {
    const old = { ...state, turn: 20, ingested: { 'chronicler.T3': 'a'.repeat(16), 'chronicler.T15': 'b'.repeat(16) } };
    const task = { ...chronicler, turn: 20, respondAs: { proposalId: 'chronicler.T20', path: 'agents/proposals/chronicler.T20.json' } };
    const r = ingest(old, proposalFor(task, [{ type: 'narrative', refs: [], text: 'Neu.' }]), task);
    assert.deepEqual(Object.keys(r.state.ingested).sort(), ['chronicler.T15', 'chronicler.T20']);
  });
});

describe('ingestProposal, world and rival', () => {
  it('stores a feature with since and source', () => {
    const world = taskOf(buildTasks(state, env, { library, phase: 'resolving' }), 'world');
    const raw = fixture('proposal-world-feature.json');
    const r = ingest(state, proposalFor(world, raw.items), world);
    assert.equal(r.verdict, 'accepted', JSON.stringify(r.issues));
    assert.deepEqual(r.state.map.features['-9,-7'], { ...raw.items[0].data, since: 0, source: 'agent:world' });
    assert.deepEqual(validate(SCHEMAS.campaign, r.state), []);
    const next = { ...world, turn: 0, respondAs: { proposalId: 'world.T0', path: 'agents/proposals/world.T0.json' } };
    const second = ingest({ ...r.state, ingested: {} }, proposalFor(next, raw.items), next);
    assert.equal(second.verdict, 'rejected', 'a tile holds one feature');
  });

  it('adds an event card to the pool and assigns it to a matching open draw while resolving', () => {
    const card = structuredClone(env.content.ereignisse[0]);
    card.id = 'wetterumschwung';
    card.if = null;
    const resolving = { ...structuredClone(state), phase: 'resolving', eventDraws: { [player]: { turn: 0, roll: 4, band: card.band, roller: 'player', card: null } } };
    const world = taskOf(buildTasks(resolving, env, { library }), 'world');
    const r = ingest(resolving, proposalFor(world, [{ type: 'event', data: card }]), world);
    assert.equal(r.verdict, 'accepted', JSON.stringify(r.issues));
    assert.ok(r.state.eventPool.includes('wetterumschwung@1'));
    assert.equal(r.state.eventDraws[player].card, 'wetterumschwung@1');
  });

  it('turns an orders item into a sealed draft for an AI people', () => {
    const rival = taskOf(tasks, 'rival', ai);
    const draft = emptyDraft(state, ai);
    const r = ingest(state, proposalFor(rival, [{ type: 'orders', data: draft }]), rival);
    assert.equal(r.verdict, 'accepted', JSON.stringify(r.issues));
    assert.equal(r.drafts[ai].sealed, true);
    assert.equal(r.drafts[ai].people, ai);
    assert.deepEqual(r.state.peoples, state.peoples, 'orders change no state');
    const bad = proposalFor(rival, [{ type: 'orders', data: { ...draft, orders: [{ id: 'o1', type: 'no-such-order', params: {} }] } }]);
    assert.equal(ingest(state, bad, rival).verdict, 'rejected');
    const foreign = proposalFor(rival, [{ type: 'orders', data: emptyDraft(state, player) }]);
    assert.equal(ingest(state, foreign, rival).verdict, 'rejected');
  });
});

describe('ingestProposal, council and judges', () => {
  it('fills an open seat with the kernel loyalty and revises a goal', () => {
    const seated = structuredClone(state);
    seated.peoples[player].modules.kern.seats = [{ role: 'schamane', favor: [], oppose: [], since: 0 }];
    const council = taskOf(buildTasks(seated, env, { library }), 'council', player);
    const member = seated.peoples[player].council[0];
    const goal = { text: 'Das Volk soll den Winter überstehen.', favor: ['winter'], oppose: [] };
    const p = proposalFor(council, [
      { type: 'person', seat: 'schamane', data: { id: 'neue-seherin', name: 'Neue Seherin', role: 'schamane', goal, age: 30, lifeStage: 'ruestig', appearance: 'Grau gekleidet' } },
      { type: 'goal', member: member.id, goal },
    ]);
    const r = ingest(seated, p, council);
    assert.equal(r.verdict, 'accepted', JSON.stringify(r.issues));
    const added = r.state.peoples[player].council.find((m) => m.id === 'neue-seherin');
    assert.deepEqual([added.loyalty, added.hollow, added.leader], [env.regeln.tuning.newMemberLoyalty, false, false]);
    assert.deepEqual(r.state.peoples[player].modules.kern.seats, []);
    assert.deepEqual(r.state.peoples[player].council.find((m) => m.id === member.id).goal, goal);
    assert.deepEqual(validate(SCHEMAS.campaign, r.state), []);
    const noSeat = ingest(state, p, council);
    assert.deepEqual(noSeat.items.map((i) => i.verdict), ['rejected', 'accepted']);
  });

  it('logs a finding and applies a correction only with consent', () => {
    const judge = buildJudgeTask(state, env, 'judge-balance').task;
    const items = [
      { type: 'finding', id: 'nahrung-zu-hoch', severity: 'warn', for: ['research'], refs: ['T0-e1'], text: 'Die Nahrung steigt zu schnell.' },
      { type: 'correction', finding: 'nahrung-zu-hoch', needsConsent: true, people: player, item: { type: 'effects', effects: [{ op: 'resource.delta', res: 'nahrung', amount: -1 }] } },
    ];
    const p = proposalFor(judge, items);
    const without = ingest(state, p, judge);
    assert.equal(without.verdict, 'partial', JSON.stringify(without.issues));
    assert.deepEqual(without.items.map((i) => i.verdict), ['accepted', 'rejected']);
    assert.ok(without.items[1].issues.some((i) => i.code === 'consent.required'));
    assert.equal(without.state.peoples[player].resources.nahrung, state.peoples[player].resources.nahrung);
    const consented = ingest(state, p, judge, { consent: [p.proposalId] });
    assert.equal(consented.verdict, 'accepted', JSON.stringify(consented.issues));
    assert.equal(consented.state.peoples[player].resources.nahrung, state.peoples[player].resources.nahrung - 1);
    const sources = new Set(consented.events.map((e) => e.source));
    assert.ok(sources.has('player') && sources.has('agent:judge-balance'));
  });
});

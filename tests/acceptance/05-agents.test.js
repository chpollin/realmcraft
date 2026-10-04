// Group 5, the agents contract: tasks, ingest, idempotency, stale proposals,
// value-free narrative and the power budget.
// Spec: Agentenvertrag (Auftrag, Vorschlag, Einlesen), Regelkern sections 10
// and 17 (ingest, budget), engine/schemas task.js and proposal.js, fixtures in
// tests/fixtures/engine.
//
// Assumptions beyond lib/harness.js (A1 to A9):
// G1 After apply (phase agents) the kernel has written the tasks of phase B.
//    `tasks --json` lists them, each as a full realmcraft-task document, and
//    the same documents lie under agents/tasks/. Agent names follow the task
//    schema enum (research, rival, council, world, chronicler, image), not the
//    German role names of the Agentenvertrag.
// G2 Phase B holds exactly one research task per people (AI included), one
//    rival task per AI people and none for the player, and one chronicler task
//    for the campaign. task.rev equals state.rev, task.turn equals state.turn.
// G3 A test writes a proposal exactly where the task says (respondAs.path),
//    as the agent would. Ingest moves it to agents/ingested/ or
//    agents/rejected/, records the proposal hash in state.ingested and raises
//    rev by one for an accepted proposal. A second ingest of the identical
//    proposal is a duplicate: exit 0, state unchanged.
// G4 A proposal whose only items are rejected counts as rejected: ingest
//    exits 2 and state.json stays unchanged. A rejected proposal does not
//    block a later valid proposal under the same id, since only accepted
//    proposals enter state.ingested.
// G5 A stale basedOnRev is tested with an entwicklung item, because the
//    Agentenvertrag still admits text items after a revision change.
// G6 `budget <file> --json` answers with the breakdown including the net
//    value as net; exit 0 when the budget holds, exit 2 with an issue whose
//    code starts with "budget" when it does not. Both answers are pure and
//    need no campaign context beyond the --campaign flag the harness always
//    passes.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  FIXTURES, T_SHORT, assertSchema, codesOf, collect, createCampaign, dice, expectExit, fixture, removeRoot, stateHash,
} from './lib/harness.js';

const isTask = (o) => o && typeof o === 'object' && o.format === 'realmcraft-task';

function textProposal(task, state) {
  const refs = (state.chronicle ?? []).slice(-1).map((e) => e.id).filter(Boolean);
  const base = {
    format: 'realmcraft-proposal',
    version: 1,
    proposalId: task.respondAs.proposalId,
    agent: task.agent,
    campaign: task.campaign,
    turn: task.turn,
    basedOnRev: task.rev,
    people: task.people,
  };
  return { ...base, items: [{ type: 'narrative', refs, text: 'Die Sippen ziehen weiter, der Rauch der Lager steht still über dem Kamm.' }] };
}

function researchProposal(task, data, basedOnRev = task.rev) {
  return {
    format: 'realmcraft-proposal',
    version: 1,
    proposalId: task.respondAs.proposalId,
    agent: 'research',
    campaign: task.campaign,
    turn: task.turn,
    basedOnRev,
    people: task.people,
    items: [{ type: 'entwicklung', data: { ...data, origin: { ...data.origin, source: 'agent', proposal: task.respondAs.proposalId } } }],
  };
}

describe('agents contract', { timeout: T_SHORT }, () => {
  let c;
  let tasks;
  const next = dice(41);
  before(() => {
    c = createCampaign({ label: 'agents', id: 'acc-agents' });
    c.playTurn({ next, stopAt: 'agents' });
    assert.equal(c.state().phase, 'agents');
  });
  after(() => removeRoot(c?.root));

  it('tasks lists one schema-valid task per agent and scope', () => {
    const s = c.state();
    const res = expectExit(c.run('tasks'), [0], 'tasks');
    tasks = collect(res.json, isTask);
    assert.ok(tasks.length > 0, 'tasks lists at least one task');
    for (const t of tasks) {
      assertSchema('task', t, `task ${t.respondAs?.proposalId}`);
      assert.equal(t.campaign, c.id);
      assert.equal(t.turn, s.turn, 'task.turn is the current turn');
      assert.equal(t.rev, s.rev, 'task.rev is the current rev');
      assert.equal(t.respondAs.path, `agents/proposals/${t.respondAs.proposalId}.json`);
    }
    const keys = tasks.map((t) => `${t.agent}|${t.people ?? '*'}`);
    assert.equal(new Set(keys).size, keys.length, `duplicate tasks: ${keys.join(', ')}`);
    const ids = tasks.map((t) => t.respondAs.proposalId);
    assert.equal(new Set(ids).size, ids.length, 'proposal ids are unique');

    const peoples = Object.entries(s.peoples);
    for (const [id] of peoples) assert.equal(tasks.filter((t) => t.agent === 'research' && t.people === id).length, 1, `one research task for ${id}`);
    for (const [id, p] of peoples) {
      const n = tasks.filter((t) => t.agent === 'rival' && t.people === id).length;
      assert.equal(n, p.controller === 'ai' ? 1 : 0, `rival tasks for ${id} (${p.controller})`);
    }
    assert.equal(tasks.filter((t) => t.agent === 'chronicler').length, 1, 'one chronicler task for the campaign');

    const onDisk = c.tasksFromFiles().filter((t) => t.turn === s.turn).map((t) => t.respondAs.proposalId).sort();
    assert.deepEqual(onDisk, [...ids].sort(), 'tasks on disk match the CLI listing');
  });

  it('a narrative item with a numeric value field is rejected', () => {
    const task = tasks.find((t) => t.agent === 'chronicler');
    const raw = fixture('proposal-invalid-narrative-value.json');
    // Runs before the valid chronicle proposal, so the shared proposal id is not yet in state.ingested.
    const proposal = { ...raw, campaign: c.id, turn: task.turn, basedOnRev: task.rev, proposalId: task.respondAs.proposalId };
    const before = c.raw('state.json');
    c.writeProposal(proposal);
    const res = expectExit(c.run('ingest'), [2], 'ingest of a narrative with a value');
    assert.ok(codesOf(res).some((code) => /narrative_values|additional|format|schema/.test(code)),
      `expected narrative_values or a schema issue, got ${codesOf(res).join(', ')}`);
    assert.equal(c.raw('state.json'), before, 'state.json unchanged');
  });

  it('ingest of a valid proposal is idempotent', () => {
    const task = tasks.find((t) => t.agent === 'chronicler');
    const proposal = textProposal(task, c.state());
    assertSchema('proposal', proposal, 'test proposal');
    const s0 = c.state();
    c.writeProposal(proposal);
    expectExit(c.run('ingest'), [0], 'first ingest');
    const s1 = c.state();
    assert.ok(s1.ingested[proposal.proposalId], 'state.ingested records the proposal');
    assert.equal(s1.rev, s0.rev + 1, 'an accepted proposal is one atomic write with rev + 1');
    assert.ok(!c.has(`agents/proposals/${proposal.proposalId}.json`), 'the proposal leaves agents/proposals');
    assert.ok(c.has(`agents/ingested/${proposal.proposalId}.json`), 'the proposal lands in agents/ingested');

    c.writeProposal(proposal);
    expectExit(c.run('ingest'), [0], 'second ingest of the same proposal');
    const s2 = c.state();
    assert.equal(stateHash(s2), stateHash(s1), 'the duplicate changes nothing');
    assert.equal(s2.rev, s1.rev);
    assert.ok(!c.has(`agents/proposals/${proposal.proposalId}.json`), 'the duplicate leaves agents/proposals');
  });

  it('a proposal with a stale basedOnRev is rejected and changes nothing', () => {
    const s = c.state();
    const task = tasks.find((t) => t.agent === 'research' && t.people === s.campaign.player);
    const proposal = researchProposal(task, fixture('entwicklung/filzjurten.json'), task.rev - 1);
    assertSchema('proposal', proposal, 'stale test proposal');
    const before = c.raw('state.json');
    c.writeProposal(proposal);
    const res = expectExit(c.run('ingest'), [2], 'ingest of a stale proposal');
    assert.ok(codesOf(res).includes('stale'), `stale proposal reports stale, got ${codesOf(res).join(', ')}`);
    assert.equal(c.raw('state.json'), before, 'state.json unchanged');
    assert.ok(c.has(`agents/rejected/${proposal.proposalId}.json`), 'the proposal lands in agents/rejected');
  });

  it('an over-budget development is rejected by budget with a budget issue', () => {
    const res = expectExit(c.run('budget', join(FIXTURES, 'entwicklung', 'donnerkeil-over-budget.json')), [2], 'budget donnerkeil');
    assert.ok(codesOf(res).some((code) => /^budget/.test(code)), `expected a budget issue, got ${codesOf(res).join(', ')}`);
  });

  it('an over-budget development proposed by the research agent does not enter the library', () => {
    const s = c.state();
    const task = tasks.find((t) => t.agent === 'research' && t.people !== s.campaign.player)
      ?? tasks.find((t) => t.agent === 'research');
    const proposal = researchProposal(task, fixture('entwicklung/donnerkeil-over-budget.json'));
    const before = c.raw('state.json');
    c.writeProposal(proposal);
    const res = expectExit(c.run('ingest'), [2], 'ingest of an over-budget development');
    assert.equal(c.raw('state.json'), before, 'state.json unchanged');
    const library = c.has('library.json') ? JSON.stringify(c.read('library.json')) : '';
    assert.ok(!library.includes('"donnerkeil'), 'donnerkeil is not appended to library.json');
    assert.ok(res.issues.length > 0, 'the ingest report names the reasons');
  });

  it('Pulverwall and Bannfeuer both pass the budget with equal net value', () => {
    const net = (file) => {
      const res = expectExit(c.run('budget', join(FIXTURES, 'entwicklung', file)), [0], `budget ${file}`);
      const n = res.json.net;
      assert.ok(Number.isInteger(n), `budget ${file} reports no integer net value: ${res.stdout.slice(0, 400)}`);
      return n;
    };
    assert.equal(net('pulverwall.json'), net('bannfeuer.json'));
  });
});

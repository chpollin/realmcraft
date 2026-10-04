import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { validate } from '../../../engine/content/schema.js';
import { stateHash } from '../../../engine/core/turn.js';
import { CAMPAIGN, REPO, cli, makeRoot, proposalFor, removeRoot } from '../../fixtures/engine/k1/harness.js';

const read = (root, rel) => JSON.parse(readFileSync(join(root, 'campaigns', CAMPAIGN, rel), 'utf8'));
const raw = (root, rel) => readFileSync(join(root, 'campaigns', CAMPAIGN, rel), 'utf8');
const has = (root, rel) => existsSync(join(root, 'campaigns', CAMPAIGN, rel));
const run = (root, cmd, ...args) => cli(root, [cmd, ...args, '--campaign', CAMPAIGN]);
const fixturePath = (name) => join(REPO, 'tests', 'fixtures', 'engine', name);

function writeInput(root, name, doc) {
  const p = join(root, '_input', name);
  mkdirSync(join(root, '_input'), { recursive: true });
  writeFileSync(p, JSON.stringify(doc));
  return p;
}

function writeProposal(root, proposal) {
  const dir = join(root, 'campaigns', CAMPAIGN, 'agents', 'proposals');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${proposal.proposalId}.json`), JSON.stringify(proposal));
}

/** Rolls every player probe of the current preview with fixed values, then returns the preview. */
function rollAll(root, rolls = [5, 6, 7]) {
  const pv = run(root, 'preview');
  const probes = pv.json.probes.filter((p) => p.roller === 'player');
  probes.forEach((p, i) => assert.equal(run(root, 'roll', p.id, String(rolls[i % rolls.length])).code, 0));
  return probes;
}

describe('cli lifecycle', () => {
  let root;
  let player;
  before(() => {
    root = makeRoot();
  });
  after(() => removeRoot(root));

  it('new creates a valid campaign at turn 0 with lock, library, views, journal, index and phase B tasks', () => {
    const r = cli(root, ['new', 'hochland', '--seed', '7', '--as', 'bergnomaden', '--id', CAMPAIGN]);
    assert.equal(r.code, 0, r.stderr + r.stdout);
    const state = read(root, 'state.json');
    player = state.campaign.player;
    assert.equal(player, 'bergnomaden');
    assert.deepEqual(validate(SCHEMAS.campaign, state), []);
    assert.deepEqual([state.turn, state.phase, state.rev], [0, 'agents', 0]);
    const lock = read(root, 'world.lock.json');
    assert.deepEqual([lock.id, lock.seed, lock.player, lock.hash], ['hochland', 7, 'bergnomaden', state.campaign.world.hash]);
    assert.ok(read(root, 'library.json').entries.length > 10);
    for (const pid of Object.keys(state.peoples)) assert.deepEqual(validate(SCHEMAS.view, read(root, `view/${pid}.json`)), [], pid);
    const index = JSON.parse(readFileSync(join(root, 'campaigns', 'index.json'), 'utf8'));
    assert.deepEqual(validate(SCHEMAS.campaignIndex, index), []);
    const journal = read(root, 'log/journal.json');
    assert.deepEqual(journal.map((e) => e.op), ['new']);
    assert.equal(journal[0].hashAfter, stateHash(state));
    const tasks = readdirSync(join(root, 'campaigns', CAMPAIGN, 'agents', 'tasks', 'T0000'));
    assert.ok(tasks.includes(`research-${player}.json`) && tasks.includes('chronicler-all.json'));
  });

  it('refuses an existing id, an unknown world and an unknown template', () => {
    assert.equal(cli(root, ['new', 'hochland', '--seed', '7', '--as', 'bergnomaden', '--id', CAMPAIGN]).code, 2);
    assert.equal(cli(root, ['new', 'nirgendwo', '--seed', '7', '--as', 'bergnomaden', '--id', 'x-1']).code, 3);
    assert.equal(cli(root, ['new', 'hochland', '--seed', '7', '--as', 'gibtsnicht', '--id', 'x-2']).code, 2);
  });

  it('status reports the campaign, the player and the tasks', () => {
    const r = run(root, 'status');
    assert.equal(r.code, 0);
    assert.deepEqual([r.json.turn, r.json.phase, r.json.rev, r.json.player.id], [0, 'agents', 0, player]);
    assert.ok(r.json.tasks.length >= 5);
    assert.equal(run(root, 'status', '--as', 'nobody').code, 2);
  });

  it('refuses seal in agents, then open moves to planning and apply is refused there', () => {
    const before = raw(root, 'state.json');
    assert.equal(run(root, 'seal').code, 4);
    assert.equal(run(root, 'apply').code, 4);
    assert.equal(run(root, 'open').code, 0);
    assert.equal(read(root, 'state.json').phase, 'planning');
    assert.notEqual(raw(root, 'state.json'), before);
    const planning = raw(root, 'state.json');
    assert.equal(run(root, 'apply').code, 4);
    assert.equal(run(root, 'open').code, 4);
    assert.equal(raw(root, 'state.json'), planning);
  });

  it('preview stores the draft, answers 3 while the roll is missing, and seal waits for it', () => {
    const state = read(root, 'state.json');
    const draft = { format: 'realmcraft-draft', version: 1, people: player, turn: state.turn, baseRev: state.rev, orders: [], mandate: {}, rolls: {}, withdrawn: [], sealed: false };
    const pv = run(root, 'preview', '--as', player, '--draft', writeInput(root, 'draft.json', draft));
    assert.equal(pv.code, 3, pv.stdout);
    assert.ok(has(root, `drafts/${player}.json`));
    const event = pv.json.probes.find((p) => p.roller === 'player');
    assert.equal(event.id, `T0:${player}:event`);
    const before = raw(root, 'state.json');
    const sealed = run(root, 'seal');
    assert.equal(sealed.code, 3);
    assert.ok(sealed.codes.includes('roll_missing'));
    assert.equal(raw(root, 'state.json'), before);
    assert.equal(run(root, 'roll', 'T0:nobody:o1', '4').code, 2);
    assert.equal(run(root, 'roll', event.id, '11').code, 2);
  });

  it('roll binds the value and the fingerprint, shows band and calculation, and refuses a second roll', () => {
    const r = run(root, 'roll', `T0:${player}:event`, '6');
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.json.probe.roll, 6);
    assert.match(r.json.probe.calculation, /roll 6/);
    const stored = read(root, `drafts/${player}.json`);
    assert.equal(stored.rolls[`T0:${player}:event`].value, 6);
    assert.equal(stored.rolls[`T0:${player}:event`].fingerprint, r.json.probe.fingerprint);
    assert.equal(run(root, 'roll', `T0:${player}:event`, '2').code, 2);
  });

  it('seal locks the orders, and drafts and rolls are refused while resolving', () => {
    const r = run(root, 'seal');
    assert.equal(r.code, 0, r.stdout);
    const state = read(root, 'state.json');
    assert.equal(state.phase, 'resolving');
    assert.equal(read(root, `drafts/${player}.json`).sealed, true);
    assert.deepEqual(Object.keys(state.eventDraws).sort(), Object.keys(state.peoples).sort());
    assert.ok(has(root, 'agents/tasks/T0000/world-all.json'));
    const draftBefore = raw(root, `drafts/${player}.json`);
    const stateBefore = raw(root, 'state.json');
    const draft = { format: 'realmcraft-draft', version: 1, people: player, turn: 0, baseRev: state.rev, orders: [], mandate: {}, rolls: {}, withdrawn: [], sealed: false };
    const pv = run(root, 'preview', '--as', player, '--draft', writeInput(root, 'late.json', draft));
    assert.notEqual(pv.code, 0);
    assert.ok(pv.codes.includes('phase'));
    assert.ok(run(root, 'roll', `T0:${player}:event`, '3').codes.includes('phase'));
    assert.equal(raw(root, `drafts/${player}.json`), draftBefore);
    assert.equal(raw(root, 'state.json'), stateBefore);
    assert.equal(run(root, 'seal').code, 4);
    assert.equal(run(root, 'open').code, 4);
  });

  it('apply with a wrong expected revision exits 4 and writes nothing', () => {
    const before = raw(root, 'state.json');
    const wrong = run(root, 'apply', '--expect-rev', String(read(root, 'state.json').rev + 1));
    assert.equal(wrong.code, 4);
    assert.ok(wrong.codes.includes('cli.stale_rev'));
    assert.equal(raw(root, 'state.json'), before);
    assert.ok(!has(root, 'log/T0000.json'));
  });

  it('apply resolves the season, writes report, views, events and the tasks of the new turn', () => {
    const rev = read(root, 'state.json').rev;
    const r = run(root, 'apply', '--expect-rev', String(rev));
    assert.equal(r.code, 0, r.stdout);
    const state = read(root, 'state.json');
    assert.deepEqual([state.turn, state.phase, state.rev], [1, 'agents', rev + 1]);
    assert.deepEqual(validate(SCHEMAS.campaign, state), []);
    const report = read(root, 'log/T0000.json');
    assert.deepEqual(validate(SCHEMAS.report, report), []);
    assert.equal(report.hashAfter, stateHash(state));
    assert.deepEqual(readdirSync(join(root, 'campaigns', CAMPAIGN, 'drafts')), []);
    assert.deepEqual(validate(SCHEMAS.view, read(root, `view/${player}.json`)), []);
    const events = read(root, `view/${player}/events/T0000.json`);
    assert.ok(events.length > 0 && events.every((e) => e.visibleTo.includes(player)));
    assert.ok(has(root, `agents/tasks/T0001/research-${player}.json`));
    assert.equal(read(root, 'status.json').turn, 1);
    assert.equal(run(root, 'apply').code, 4);
  });

  it('lists the current tasks as full documents', () => {
    const r = run(root, 'tasks');
    assert.equal(r.code, 0);
    assert.ok(r.json.tasks.every((t) => t.format === 'realmcraft-task' && t.turn === 1));
    assert.equal(r.json.tasks.filter((t) => t.agent === 'rival').length, 2);
    assert.deepEqual(run(root, 'tasks', '--agent', 'chronicler').json.tasks.map((t) => t.agent), ['chronicler']);
    const judge = run(root, 'tasks', '--agent', 'judge-balance');
    assert.equal(judge.json.tasks[0].respondAs.proposalId, 'judge-balance.T1');
    assert.ok(has(root, 'agents/tasks/T0001/judge-balance-all.json'));
  });

  it('ingest accepts a proposal once, moves it, writes the text and treats a repeat as duplicate', () => {
    const task = run(root, 'tasks', '--agent', 'chronicler').json.tasks[0];
    const proposal = proposalFor(task, [{ type: 'narrative', refs: [], text: 'Die Sippen ziehen in den Sommer.' }]);
    const revBefore = read(root, 'state.json').rev;
    writeProposal(root, proposal);
    const r = run(root, 'ingest');
    assert.equal(r.code, 0, r.stdout);
    const state = read(root, 'state.json');
    assert.equal(state.rev, revBefore + 1);
    assert.ok(state.ingested[proposal.proposalId]);
    assert.ok(!has(root, `agents/proposals/${proposal.proposalId}.json`));
    assert.ok(has(root, `agents/ingested/${proposal.proposalId}.json`));
    assert.equal(read(root, `agents/verdicts/${proposal.proposalId}.json`).verdict, 'accepted');
    assert.match(raw(root, 'narrative/chronik/T0001.md'), /Sippen ziehen/);
    assert.equal(read(root, 'status.json').steps.find((s) => s.id === 'chronicler-all').proposals[0].verdict, 'accepted');
    const hash = stateHash(state);
    writeProposal(root, proposal);
    assert.equal(run(root, 'ingest').code, 0);
    assert.equal(stateHash(read(root, 'state.json')), hash);
    assert.ok(!has(root, `agents/proposals/${proposal.proposalId}.json`));
  });

  it('ingest rejects a stale proposal into agents/rejected and leaves the state', () => {
    const task = run(root, 'tasks', '--agent', 'research').json.tasks.find((t) => t.people === player);
    const proposal = proposalFor(task, [{ type: 'narrative', refs: [], text: 'x' }]);
    const bad = { ...proposal, items: [{ type: 'entwicklung', data: { id: 'nichts' } }], basedOnRev: task.rev - 1 };
    const before = raw(root, 'state.json');
    writeProposal(root, bad);
    const r = run(root, 'ingest');
    assert.equal(r.code, 2);
    assert.ok(has(root, `agents/rejected/${proposal.proposalId}.json`));
    assert.equal(raw(root, 'state.json'), before);
  });

  it('ingest turns a rival proposal into a draft the seal then uses', () => {
    const task = run(root, 'tasks', '--agent', 'rival').json.tasks[0];
    const state = read(root, 'state.json');
    const draft = { format: 'realmcraft-draft', version: 1, people: task.people, turn: state.turn, baseRev: state.rev, orders: [], mandate: {}, rolls: {}, withdrawn: [], sealed: false };
    writeProposal(root, proposalFor(task, [{ type: 'orders', data: draft }, { type: 'stance', refs: [], text: 'Der Klan wartet ab.' }]));
    assert.equal(run(root, 'ingest').code, 0);
    assert.equal(read(root, `drafts/${task.people}.json`).sealed, true);
    assert.match(raw(root, 'narrative/haltungen/T0001.md'), /wartet ab/);
  });

  it('replays the whole journal to the stored state and stops at a given turn', () => {
    assert.equal(run(root, 'open').code, 0);
    const r = run(root, 'replay');
    assert.equal(r.code, 0, r.stdout);
    assert.equal(r.json.hash, stateHash(read(root, 'state.json')));
    const partial = run(root, 'replay', '--to', '1');
    assert.equal(partial.code, 0);
    assert.equal(partial.json.turn, 1);
  });

  it('plays a second season, then refuses every transition on a tampered state and fails the replay', () => {
    rollAll(root);
    assert.equal(run(root, 'seal').code, 0);
    assert.equal(run(root, 'apply').code, 0);
    assert.equal(run(root, 'replay').code, 0);
    const state = read(root, 'state.json');
    state.peoples[player].resources.nahrung += 5;
    writeFileSync(join(root, 'campaigns', CAMPAIGN, 'state.json'), JSON.stringify(state));
    const tampered = raw(root, 'state.json');
    for (const cmd of ['open', 'seal', 'apply']) {
      const r = run(root, cmd);
      assert.equal(r.code, 4, cmd);
      assert.ok(r.codes.includes('tamper'), cmd);
    }
    assert.equal(raw(root, 'state.json'), tampered);
    assert.equal(run(root, 'replay').code, 5);
  });
});

describe('cli from a fixture state', () => {
  let root;
  before(() => {
    root = makeRoot();
  });
  after(() => removeRoot(root));

  it('loads campaign-midgame.json, anchors the journal and plays a season', () => {
    const r = cli(root, ['new', 'hochland', '--seed', '7', '--as', 'talbund', '--id', CAMPAIGN, '--from-state', fixturePath('campaign-midgame.json')]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    const loaded = read(root, 'state.json');
    assert.equal(loaded.campaign.id, CAMPAIGN);
    assert.equal(read(root, 'log/journal.json')[0].hashAfter, stateHash(loaded));
    if (loaded.phase === 'agents') assert.equal(run(root, 'open').code, 0);
    assert.equal(read(root, 'state.json').phase, 'planning');
    const probes = rollAll(root);
    assert.ok(probes.length >= 1);
    const sealed = run(root, 'seal');
    assert.equal(sealed.code, 0, sealed.stdout);
    const applied = run(root, 'apply');
    assert.equal(applied.code, 0, applied.stdout);
    const after = read(root, 'state.json');
    assert.equal(after.turn, loaded.turn + 1);
    assert.deepEqual(validate(SCHEMAS.campaign, after), []);
    assert.equal(run(root, 'replay').code, 0);
  });

  it('refuses a fixture that does not validate against the campaign schema', () => {
    const bad = writeInput(root, 'bad-state.json', { format: 'realmcraft-campaign', version: 1 });
    assert.equal(cli(root, ['new', 'hochland', '--seed', '7', '--as', 'talbund', '--id', 'x-3', '--from-state', bad]).code, 2);
  });
});

describe('cli validate, budget and schema', () => {
  let root;
  before(() => {
    root = makeRoot();
  });
  after(() => removeRoot(root));

  it('validates the Hochland package and single documents', () => {
    assert.equal(cli(root, ['validate', join(REPO, 'welten', 'hochland')]).code, 0);
    assert.equal(cli(root, ['validate', fixturePath('entwicklung/filzjurten.json')]).code, 0);
    assert.equal(cli(root, ['validate', fixturePath('entwicklung/invalid-unknown-op.json')]).code, 2);
    assert.equal(cli(root, ['validate', fixturePath('proposal-invalid-narrative-value.json')]).code, 2);
    assert.equal(cli(root, ['validate', fixturePath('campaign-midgame.json')]).code, 0);
    assert.equal(cli(root, ['validate', join(root, 'missing.json')]).code, 3);
  });

  it('validate, new and repin refuse a world package that lacks a kernel label key', () => {
    const own = makeRoot();
    try {
      const dir = join(own, 'welten', 'hochland');
      cpSync(join(REPO, 'welten', 'hochland'), dir, { recursive: true });
      assert.equal(cli(own, ['new', 'hochland', '--seed', '7', '--as', 'bergnomaden', '--id', CAMPAIGN]).code, 0);
      const file = join(dir, 'labels.json');
      const labels = JSON.parse(readFileSync(file, 'utf8'));
      delete labels.labels['view.lage'];
      writeFileSync(file, JSON.stringify(labels));
      for (const r of [
        cli(own, ['validate', dir]),
        cli(own, ['new', 'hochland', '--seed', '7', '--as', 'bergnomaden', '--id', 'kaputt']),
        run(own, 'repin'),
      ]) {
        assert.equal(r.code, 2, r.stdout);
        assert.ok(r.json.issues.some((i) => i.code === 'missing_label' && i.path === '/labels/labels/view.lage'), r.stdout);
      }
    } finally {
      removeRoot(own);
    }
  });

  it('scores a development and rejects an over-budget one', () => {
    const ok = cli(root, ['budget', fixturePath('entwicklung/pulverwall.json')]);
    assert.equal(ok.code, 0);
    assert.ok(Number.isInteger(ok.json.net));
    assert.equal(ok.json.N, ok.json.net);
    assert.equal(cli(root, ['budget', fixturePath('entwicklung/bannfeuer.json')]).json.net, ok.json.net);
    const over = cli(root, ['budget', fixturePath('entwicklung/donnerkeil-over-budget.json')]);
    assert.equal(over.code, 2);
    assert.ok(over.codes.some((c) => /^budget/.test(c)));
  });

  it('prints a schema and refuses unknown commands', () => {
    const schema = cli(root, ['schema', 'task']);
    assert.equal(schema.code, 0);
    assert.equal(schema.json.name, 'task');
    assert.equal(cli(root, ['schema', 'nope']).code, 2);
    assert.equal(cli(root, ['frobnicate']).code, 2);
    assert.equal(cli(root, ['status']).code, 3);
  });
});

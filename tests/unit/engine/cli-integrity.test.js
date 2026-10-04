// Regression tests of the CLI review findings: campaign ids, the
// rolls ledger, the seal lock on disk, the journal hash chain, interrupted
// commits, the proposal path and envelope, tasks for state-changing items,
// duplicate verdicts, appended texts, status.json and the existing-campaign
// migration.

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateHash } from '../../../engine/core/turn.js';
import { hashValue } from '../../../engine/core/hash.js';
import { CAMPAIGN, REPO, cli, makeRoot, proposalFor, removeRoot } from '../../fixtures/engine/k1/harness.js';

const dirOf = (root) => join(root, 'campaigns', CAMPAIGN);
const read = (root, rel) => JSON.parse(readFileSync(join(dirOf(root), rel), 'utf8'));
const raw = (root, rel) => readFileSync(join(dirOf(root), rel), 'utf8');
const has = (root, rel) => existsSync(join(dirOf(root), rel));
const write = (root, rel, doc) => writeFileSync(join(dirOf(root), rel), typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2));
const run = (root, cmd, ...args) => cli(root, [cmd, ...args, '--campaign', CAMPAIGN]);

function create(root) {
  const r = cli(root, ['new', 'hochland', '--seed', '7', '--as', 'bergnomaden', '--id', CAMPAIGN]);
  assert.equal(r.code, 0, r.stdout + r.stderr);
}

function inputFile(root, name, doc) {
  mkdirSync(join(root, '_input'), { recursive: true });
  const p = join(root, '_input', name);
  writeFileSync(p, JSON.stringify(doc));
  return p;
}

function writeProposal(root, proposal, name = proposal.proposalId) {
  const dir = join(dirOf(root), 'agents', 'proposals');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.json`), JSON.stringify(proposal));
  return join(dir, `${name}.json`);
}

/** An explore order on the home tile: one player probe besides the world event. */
function exploreDraft(root, id = 'o1') {
  const state = read(root, 'state.json');
  const home = state.map.settlements.find((s) => s.people === 'bergnomaden').tile;
  return { format: 'realmcraft-draft', version: 1, people: 'bergnomaden', turn: state.turn, baseRev: state.rev, orders: [{ id, type: 'explore', params: { tile: home } }], mandate: {}, rolls: {}, withdrawn: [], sealed: false };
}

const playerProbes = (pv) => pv.json.probes.filter((p) => p.roller === 'player');

describe('cli campaign ids', () => {
  let root;
  before(() => {
    root = makeRoot();
  });
  after(() => removeRoot(root));

  it('refuses a campaign id that leaves campaigns/ or breaks the id pattern, for new and every other command', () => {
    for (const id of ['../evil', 'a/b', 'UPPER', 'x', 'test-1.']) {
      const r = cli(root, ['new', 'hochland', '--seed', '7', '--id', id]);
      assert.equal(r.code, 2, id);
    }
    assert.ok(!existsSync(join(root, 'evil')));
    assert.equal(cli(root, ['status', '--campaign', '../x']).code, 2);
  });
});

describe('cli rolls ledger and seal lock', () => {
  let root;
  before(() => {
    root = makeRoot();
    create(root);
    assert.equal(run(root, 'open').code, 0);
  });
  after(() => removeRoot(root));

  it('H2: a draft submitted through preview cannot change a value already rolled', () => {
    const draft = exploreDraft(root);
    assert.equal(run(root, 'preview', '--draft', inputFile(root, 'd0.json', draft)).code, 3);
    const probe = playerProbes(run(root, 'preview')).find((p) => p.order === 'o1');
    assert.equal(run(root, 'roll', probe.id, '2').code, 0);
    const ledger = read(root, 'rolls.json').entries;
    assert.equal(ledger.length, 1);

    const forged = { ...draft, rolls: { [probe.id]: { value: 10, fingerprint: probe.fingerprint } } };
    const r = run(root, 'preview', '--draft', inputFile(root, 'd1.json', forged));
    assert.ok(r.codes.includes('duplicate'), 'the kept roll is reported');
    assert.equal(read(root, 'drafts/bergnomaden.json').rolls[probe.id].value, 2);
    assert.deepEqual(read(root, 'rolls.json').entries, ledger, 'the ledger only grows by new rolls');
    assert.equal(run(root, 'roll', probe.id, '9').code, 2, 'a probe is rolled once');

    // Dropping the order withdraws the roll; bringing it back restores the first value.
    run(root, 'preview', '--draft', inputFile(root, 'd2.json', { ...draft, orders: [], rolls: {} }));
    const dropped = read(root, 'drafts/bergnomaden.json');
    assert.deepEqual(dropped.withdrawn.map((w) => [w.probe, w.value]), [[probe.id, 2]]);
    run(root, 'preview', '--draft', inputFile(root, 'd3.json', { ...draft, rolls: { [probe.id]: { value: 10, fingerprint: probe.fingerprint } } }));
    const back = read(root, 'drafts/bergnomaden.json');
    assert.equal(back.rolls[probe.id].value, 2);
    assert.deepEqual(back.withdrawn, []);
  });

  it('H2: seal refuses a draft file whose rolls differ from the ledger', () => {
    for (const p of playerProbes(run(root, 'preview'))) if (!read(root, 'drafts/bergnomaden.json').rolls[p.id]) assert.equal(run(root, 'roll', p.id, '5').code, 0);
    const stored = read(root, 'drafts/bergnomaden.json');
    const edited = structuredClone(stored);
    for (const k of Object.keys(edited.rolls)) edited.rolls[k].value = 10;
    write(root, 'drafts/bergnomaden.json', edited);
    const r = run(root, 'seal');
    assert.equal(r.code, 4);
    assert.ok(r.codes.includes('tamper'));
    write(root, 'drafts/bergnomaden.json', stored);
  });

  it('H1: apply refuses a sealed draft edited on disk', () => {
    assert.equal(run(root, 'seal').code, 0);
    const state = read(root, 'state.json');
    assert.equal(state.sealed.bergnomaden, hashValue(read(root, 'drafts/bergnomaden.json')));
    const sealed = raw(root, 'drafts/bergnomaden.json');
    const edited = JSON.parse(sealed);
    for (const k of Object.keys(edited.rolls)) edited.rolls[k].value = 10;
    write(root, 'drafts/bergnomaden.json', edited);
    const r = run(root, 'apply');
    assert.equal(r.code, 4);
    assert.ok(r.codes.includes('tamper'));
    write(root, 'drafts/bergnomaden.json', sealed);
  });

  it('status.json keeps the resolved turn\'s steps until open and its phase follows the state', () => {
    assert.equal(read(root, 'status.json').phase, 'resolving');
    const before = read(root, 'status.json');
    assert.equal(run(root, 'apply').code, 0);
    const after = read(root, 'status.json');
    assert.deepEqual([after.turn, after.phase], [1, 'agents']);
    assert.deepEqual(after.resolved, { turn: 0, steps: before.steps });
    assert.equal(run(root, 'open').code, 0);
    const opened = read(root, 'status.json');
    assert.deepEqual([opened.turn, opened.phase, opened.resolved], [1, 'planning', undefined]);
  });
});

describe('cli journal chain and interrupted commits', () => {
  let root;
  before(() => {
    root = makeRoot();
    create(root);
  });
  after(() => removeRoot(root));

  it('H9: every journal entry is chained and anchors library, drafts, rolls and world', () => {
    assert.equal(run(root, 'open').code, 0);
    const j = read(root, 'log/journal.json');
    assert.equal(j.length, 2);
    assert.equal(j[1].prev, j[0].hash);
    for (const e of j) {
      const { hash, ...body } = e;
      assert.equal(hash, hashValue(body));
      assert.equal(e.kernel, 2);
      assert.ok(e.libraryHash && e.worldHash && e.draftsHash && e.rolls);
    }
  });

  it('H9: a state edit with a forged journal entry, an edited library or an edited ledger is refused', () => {
    const state0 = raw(root, 'state.json');
    const journal0 = raw(root, 'log/journal.json');
    const s = JSON.parse(state0);
    s.peoples.bergnomaden.resources.nahrung = 99;
    write(root, 'state.json', s);
    const j = JSON.parse(journal0);
    j.push({ ...j.at(-1), revAfter: s.rev + 1, hashAfter: stateHash(s) });
    write(root, 'log/journal.json', j);
    let r = run(root, 'seal');
    assert.equal(r.code, 4);
    assert.ok(r.codes.includes('tamper'));
    write(root, 'state.json', state0);
    write(root, 'log/journal.json', journal0);

    const lib0 = raw(root, 'library.json');
    const lib = JSON.parse(lib0);
    lib.entries[0].data.name = 'Gefälscht';
    write(root, 'library.json', lib);
    r = run(root, 'seal');
    assert.equal(r.code, 4);
    write(root, 'library.json', lib0);
  });

  it('H9: a changed world package is an error at a transition', () => {
    const lock0 = raw(root, 'world.lock.json');
    const copy = join(root, 'welten', 'hochland');
    cpSync(join(REPO, 'welten', 'hochland'), copy, { recursive: true });
    const welt = JSON.parse(readFileSync(join(copy, 'welt.json'), 'utf8'));
    welt.name = `${welt.name} (verändert)`;
    writeFileSync(join(copy, 'welt.json'), JSON.stringify(welt));
    write(root, 'world.lock.json', { ...JSON.parse(lock0), worldDir: 'welten/hochland' });
    const r = run(root, 'seal');
    assert.equal(r.code, 4);
    assert.ok(r.codes.includes('cli.world_drift'));

    // repin validates the changed package, pins the campaign to it with a logged entry, and transitions run again.
    const oldHash = JSON.parse(lock0).hash;
    const pinned = run(root, 'repin');
    assert.equal(pinned.code, 0, pinned.stdout);
    assert.deepEqual([pinned.json.from, pinned.json.changed], [oldHash, true]);
    const lock = read(root, 'world.lock.json');
    const state = read(root, 'state.json');
    assert.notEqual(lock.hash, oldHash);
    assert.equal(state.campaign.world.hash, lock.hash);
    const entry = state.chronicle.find((e) => e.kind === 'campaign.repin');
    assert.equal(entry.source, 'player');
    assert.deepEqual([entry.change.before.hash, entry.change.after.hash], [oldHash, lock.hash]);
    const last = read(root, 'log/journal.json').at(-1);
    assert.deepEqual([last.op, last.input.from, last.input.to, last.worldHash], ['repin', oldHash, lock.hash, lock.hash]);
    assert.equal(run(root, 'repin').json.changed, false);
    assert.equal(run(root, 'replay').code, 0, 'replay starts from the repin anchor');
  });

  it('H10: a commit interrupted after its journal entry is completed by the next transition', () => {
    const before = raw(root, 'state.json');
    // A seal needs rolls; ingest a text proposal instead, then put the old state back as a crash would leave it.
    const task = run(root, 'tasks', '--agent', 'chronicler').json.tasks[0];
    writeProposal(root, proposalFor(task, [{ type: 'narrative', refs: [], text: 'Erster Schnee.' }]));
    assert.equal(run(root, 'ingest').code, 0);
    const journal = read(root, 'log/journal.json');
    write(root, 'state.json', before);
    const r = run(root, 'preview', '--draft', inputFile(root, 'd.json', exploreDraft(root)));
    assert.ok(r.codes.includes('cli.recovered'), r.stdout);
    assert.equal(stateHash(read(root, 'state.json')), journal.at(-1).hashAfter);
    assert.equal(run(root, 'replay').code, 0);
  });
});

describe('cli ingest boundaries', () => {
  let root;
  before(() => {
    root = makeRoot();
    create(root);
  });
  after(() => removeRoot(root));

  it('H11: ingest reads only files in agents/proposals and leaves any other file where it is', () => {
    const task = run(root, 'tasks', '--agent', 'chronicler').json.tasks[0];
    const outside = inputFile(root, `${task.respondAs.proposalId}.json`, proposalFor(task, [{ type: 'narrative', refs: [], text: 'x' }]));
    const r = run(root, 'ingest', outside);
    assert.equal(r.code, 2);
    assert.ok(existsSync(outside));
    const pkg = join(root, 'package.json');
    writeFileSync(pkg, '{}');
    assert.equal(run(root, 'ingest', pkg).code, 2);
    assert.ok(existsSync(pkg));
  });

  it('H11: a proposal must be filed under its own id and its id must name its agent', () => {
    const task = run(root, 'tasks', '--agent', 'chronicler').json.tasks[0];
    const p = proposalFor(task, [{ type: 'narrative', refs: [], text: 'x' }]);
    writeProposal(root, p, 'chronicler.T9');
    let r = run(root, 'ingest');
    assert.equal(r.code, 2);
    assert.ok(has(root, 'agents/rejected/chronicler.T9.json'));
    writeProposal(root, { ...p, agent: 'world' });
    r = run(root, 'ingest');
    assert.equal(r.code, 2);
    assert.equal(read(root, 'state.json').ingested[p.proposalId], undefined);
  });

  it('H7: a state-changing proposal without a matching task is rejected', () => {
    const state = read(root, 'state.json');
    const task = run(root, 'tasks', '--agent', 'rival').json.tasks[0];
    const draft = { format: 'realmcraft-draft', version: 1, people: task.people, turn: state.turn + 3, baseRev: state.rev, orders: [], mandate: {}, rolls: {}, withdrawn: [], sealed: false };
    const forged = proposalFor({ ...task, turn: state.turn + 3, respondAs: { proposalId: `rival.${task.people}.T${state.turn + 3}` } }, [{ type: 'orders', data: draft }]);
    writeProposal(root, forged);
    const r = run(root, 'ingest');
    assert.equal(r.code, 2);
    assert.match(JSON.stringify(r.json.proposals), /items that change state need one/);
    assert.ok(!has(root, `drafts/${task.people}.json`));
  });

  it('a duplicate ingest keeps the first verdict; texts of several proposals for one file add up', () => {
    const tasks = run(root, 'tasks', '--agent', 'rival').json.tasks;
    for (const t of tasks) writeProposal(root, proposalFor(t, [{ type: 'stance', refs: [], text: `Haltung von ${t.people}.` }]));
    assert.equal(run(root, 'ingest').code, 0);
    const text = raw(root, 'narrative/haltungen/T0000.md');
    for (const t of tasks) assert.match(text, new RegExp(`Haltung von ${t.people}`));
    const first = read(root, `agents/verdicts/${tasks[0].respondAs.proposalId}.json`);
    writeProposal(root, proposalFor(tasks[0], [{ type: 'stance', refs: [], text: `Haltung von ${tasks[0].people}.` }]));
    assert.equal(run(root, 'ingest').code, 0);
    assert.deepEqual(read(root, `agents/verdicts/${tasks[0].respondAs.proposalId}.json`), first);
  });
});

describe('cli on a campaign written before the integrity changes', () => {
  let root;
  before(() => {
    root = makeRoot();
    create(root);
  });
  after(() => removeRoot(root));

  it('a legacy journal and a draft with rolls but no ledger keep working and the chain starts after them', () => {
    // Strip what the new kernel writes: chain fields of the journal and the ledger.
    const journal = read(root, 'log/journal.json').map(({ op, turn, revAfter, hashAfter, input }) => ({ op, turn, revAfter, hashAfter, input }));
    write(root, 'log/journal.json', journal);
    unlinkSync(join(dirOf(root), 'rolls.json'));
    const legacyState = read(root, 'state.json');
    assert.equal(run(root, 'open').code, 0);
    const j = read(root, 'log/journal.json');
    assert.equal(j[0].kernel, undefined);
    assert.equal(j[1].prev, hashValue(j[0]));
    assert.deepEqual(read(root, j[1].base.anchor), legacyState, 'the first chained entry anchors the state it starts from');
    // A draft with a roll entered before the ledger existed seeds the ledger.
    const draft = exploreDraft(root);
    run(root, 'preview', '--draft', inputFile(root, 'd.json', draft));
    const probe = playerProbes(run(root, 'preview')).find((p) => p.order === 'o1');
    const stored = read(root, 'drafts/bergnomaden.json');
    unlinkSync(join(dirOf(root), 'rolls.json'));
    write(root, 'drafts/bergnomaden.json', { ...stored, rolls: { [probe.id]: { value: 4, fingerprint: probe.fingerprint } } });
    assert.equal(run(root, 'roll', probe.id, '9').code, 2, 'the legacy roll is held');
    const event = playerProbes(run(root, 'preview')).find((p) => p.kind === 'event');
    assert.equal(run(root, 'roll', event.id, '3').code, 0);
    assert.deepEqual(read(root, 'rolls.json').entries.map((e) => [e.probe, e.value]), [[probe.id, 4], [event.id, 3]]);
    assert.equal(run(root, 'replay').code, 0);
  });
});

describe('cli tasks for rival agents', () => {
  let root;
  before(() => {
    root = makeRoot();
    create(root);
  });
  after(() => removeRoot(root));

  it('a rival task names its orders with parameters, valid targets and an example, the slot capacity and only vocabulary tags', () => {
    const tasks = run(root, 'tasks', '--agent', 'rival').json.tasks;
    const regeln = JSON.parse(readFileSync(join(REPO, 'welten', 'hochland', 'regeln.json'), 'utf8'));
    for (const t of tasks) {
      assert.ok(t.limits.tags.every((tag) => Object.hasOwn(regeln.vocabulary, tag)));
      assert.deepEqual(Object.keys(t.limits.slots).sort(), ['main', 'minor']);
      const explore = t.context.orders.find((o) => o.type === 'explore');
      assert.ok(explore.params.tile);
      assert.ok(explore.targets.length > 0);
      assert.deepEqual(explore.example, { id: 'o1', type: 'explore', params: explore.targets[0] });
      const research = t.context.orders.find((o) => o.type === 'research.assign');
      assert.ok(research.params.development);
    }
    // An example drafted from the task passes ingest as the rival's orders.
    const t = tasks[0];
    const state = read(root, 'state.json');
    const example = t.context.orders.find((o) => o.type === 'explore').example;
    const draft = { format: 'realmcraft-draft', version: 1, people: t.people, turn: state.turn, baseRev: state.rev, orders: [example], mandate: {}, rolls: {}, withdrawn: [], sealed: false };
    writeProposal(root, proposalFor(t, [{ type: 'orders', data: draft }]));
    const r = run(root, 'ingest');
    assert.equal(r.code, 0, JSON.stringify(r.json.proposals));
  });
});

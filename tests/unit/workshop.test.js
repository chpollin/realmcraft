import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { creationDraft } from '../../engine/creation/realm.js';
import { createWorkshop, finishWorkshopStart, publishWorkshop, readWorkshop, reserveWorkshopStart, reviewWorkshop, workshopPrompt, workshopSchema } from '../../engine/harness/workshop.js';

const helper = fileURLToPath(new URL('../../tools/harness/realm-workshop.mjs', import.meta.url));
const draft = creationDraft({ world: 'Eine Flusslandschaft mit messbaren Erinnerungsspuren.', people: 'Die Ufergemeinschaft bewahrt Wissen gemeinsam.', seed: 7, language: 'de' });
const data = () => ({ draft: structuredClone(draft), questions: [], ruleIdeas: [] });
let root, id;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'rc-workshop-')); id = randomUUID(); });
afterEach(() => { assert.ok(root.startsWith(join(tmpdir(), 'rc-workshop-'))); rmSync(root, { recursive: true, force: true }); });
const reason = (expected) => (error) => error.issues?.[0]?.params?.reason === expected;
const create = () => createWorkshop(root, { id, language: 'de' });
const publish = (input = data(), rev = 0, generation = null) => publishWorkshop(root, id, input, { expectRev: rev, generation });
const ref = (rev = 1) => ({ id, rev });
const start = () => ({ draft, fingerprint: '1234567890abcdef', startKey: randomUUID() });

test('unknown reads create nothing; creation is idempotent and keeps a private validated draft', () => {
  assert.throws(() => readWorkshop(root, id), reason('workshop-not-found'));
  assert.deepEqual(readdirSync(root), []);
  const first = create();
  assert.equal(first.rev, 0); assert.equal(first.draft, null); assert.equal(first.state, 'draft');
  assert.deepEqual(create(), first);
  const next = publish();
  assert.equal(next.rev, 1); assert.deepEqual(next.draft, draft);
  assert.deepEqual(readWorkshop(root, id), next);
  assert.ok(!existsSync(join(root, 'campaigns')));
});

test('early conversation can publish open decisions without inventing a complete draft', () => {
  create();
  const current = publish({ draft: null, questions: ['Wie bewahrt diese Gemeinschaft Wissen?'], ruleIdeas: ['Erinnerungen als Ressource'] });
  assert.equal(current.rev, 1); assert.equal(current.draft, null);
  assert.deepEqual(readWorkshop(root, id), current);
  assert.throws(() => reviewWorkshop(root, ref(), draft));
  assert.throws(() => reserveWorkshopStart(root, ref(), start()));
  assert.equal(readWorkshop(root, id).state, 'draft');
  const complete = publish(data(), 1);
  assert.deepEqual(complete.draft, draft);
  assert.doesNotThrow(() => reviewWorkshop(root, ref(2), draft));
});

test('closed packet validation and compare-and-swap preserve the last complete publication', () => {
  create(); const saved = publish();
  for (const input of [
    { ...data(), arbitraryRules: [] }, { draft, questions: [] }, { ...data(), draft: { ...draft, unknown: true } },
    { ...data(), questions: [''] }, { ...data(), ruleIdeas: Array(9).fill('Noch offen') },
    { ...data(), questions: ['x'.repeat(401)] }, { ...data(), ruleIdeas: ['Nicht\u202eanzeigen'] },
  ]) assert.throws(() => publish(input, 1));
  assert.throws(() => publish(data(), 0), reason('workshop-stale'));
  assert.throws(() => publish(data(), 1, 'f'.repeat(32)), reason('library-reset'));
  assert.deepEqual(readWorkshop(root, id), saved);
});

test('concurrent harness publications cannot silently overwrite each other', async () => {
  create();
  const paths = ['a', 'b'].map((name) => {
    const path = join(root, name + '.json'), packet = data(); packet.draft.world.name = name;
    writeFileSync(path, JSON.stringify(packet)); return path;
  });
  const results = await Promise.all(paths.map((path) => new Promise((done, reject) => {
    const child = spawn(process.execPath, [helper, 'publish', '--root', root, '--id', id, '--file', path, '--expect-rev', '0', '--generation', 'legacy']);
    let output = ''; child.stdout.on('data', (part) => { output += part; }); child.on('error', reject);
    child.on('close', (code) => done({ code, json: JSON.parse(output) }));
  })));
  assert.deepEqual(results.map((result) => result.code).sort(), [0, 4]);
  assert.equal(results.find((result) => result.code === 4).json.issues[0].params.reason, 'workshop-stale');
  assert.equal(readWorkshop(root, id).draft.world.name, results.find((result) => result.code === 0).json.workshop.draft.world.name);
  assert.equal(readWorkshop(root, id).rev, 1);
});

test('a confirmed reset rejects reads, publishes and idempotent recreation of an old workshop', () => {
  create(); publish();
  mkdirSync(join(root, 'campaigns'));
  const generation = randomUUID().replaceAll('-', '');
  writeFileSync(join(root, 'campaigns/index.json'), JSON.stringify({ format: 'realmcraft-campaigns', version: 1, campaigns: [], generation }));
  for (const action of [() => readWorkshop(root, id), () => publish(data(), 1), create]) assert.throws(action, reason('library-reset'));
  const freshId = randomUUID();
  assert.equal(createWorkshop(root, { id: freshId, language: 'en' }).generation, generation);
});

test('invalid ids and junctions cannot escape authoring storage', () => {
  for (const bad of ['../escape', id + ':stream', id + '.', 'con', null]) assert.throws(() => readWorkshop(root, bad), reason('workshop-id'));
  const outside = join(root, 'outside'); mkdirSync(outside); mkdirSync(join(root, 'authoring'));
  symlinkSync(outside, join(root, 'authoring/workshops'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(create, reason('unsafe-workshop-path'));
  assert.throws(() => readWorkshop(root, id), reason('unsafe-workshop-path'));
  assert.deepEqual(readdirSync(outside), []);
});

test('open questions and unsupported rule ideas block review and snapshot reservation', () => {
  create();
  for (const field of ['questions', 'ruleIdeas']) {
    const current = readWorkshop(root, id), packet = data(); packet[field] = ['Erinnerungen als zusätzliche Ressource?'];
    const next = publish(packet, current.rev);
    assert.throws(() => reviewWorkshop(root, ref(next.rev), draft), reason('workshop-unresolved'));
    assert.throws(() => reserveWorkshopStart(root, ref(next.rev), start()), reason('workshop-unresolved'));
    assert.equal(readWorkshop(root, id).state, 'draft');
  }
});

test('a changed revision or draft refuses an older preview without freezing the session', () => {
  create(); publish(); const changed = data(); changed.draft.world.name = 'Neuer Flussname'; publish(changed, 1);
  assert.throws(() => reserveWorkshopStart(root, ref(1), start()), reason('workshop-stale'));
  assert.throws(() => reserveWorkshopStart(root, ref(2), start()), reason('workshop-draft-changed'));
  assert.equal(readWorkshop(root, id).state, 'draft');
});

test('explicit reservation freezes one immutable snapshot; same-key retries and completion are idempotent', () => {
  create(); publish(); const attempt = start();
  const reserved = reserveWorkshopStart(root, ref(), attempt);
  assert.equal(reserved.state, 'starting'); assert.equal(reserved.rev, 1);
  assert.throws(() => publish(data(), 1), reason('workshop-frozen'));
  assert.throws(() => reserveWorkshopStart(root, ref(), { ...attempt, startKey: randomUUID() }), reason('workshop-frozen'));
  assert.deepEqual(reserveWorkshopStart(root, ref(), attempt), reserved);
  const completed = finishWorkshopStart(root, ref(), { ...attempt, campaign: 'realm-' + attempt.startKey.replaceAll('-', '') });
  assert.equal(completed.state, 'started');
  assert.deepEqual(finishWorkshopStart(root, ref(), { ...attempt, campaign: completed.start.campaign }), completed);
  assert.deepEqual(reserveWorkshopStart(root, ref(), attempt), completed);
});

test('prompt and CLI schema describe the actual isolated root and do not fabricate a campaign', () => {
  const workshop = create();
  const prompt = workshopPrompt(root, workshop);
  assert.ok(prompt.includes(root)); assert.ok(prompt.includes(id)); assert.ok(prompt.includes('--generation legacy'));
  assert.match(prompt, /Keine Kampagne erzeugen/);
  const schema = workshopSchema(workshop);
  assert.deepEqual(schema.packet.questions, []); assert.deepEqual(schema.supported.landscape, ['highlands', 'riverlands', 'drylands']);
  const cli = spawnSync(process.execPath, [helper, 'schema', '--root', root, '--id', id], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stdout); assert.equal(JSON.parse(cli.stdout).workshop.id, id);
  assert.ok(!existsSync(join(root, 'campaigns')));
});

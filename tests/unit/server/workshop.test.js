import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { REPO, http, startServer } from '../../lib/server.mjs';
import { creationDraft } from '../../../engine/creation/realm.js';
import { hashValue } from '../../../engine/core/hash.js';
import { publishWorkshop, readWorkshop } from '../../../engine/harness/workshop.js';

let root, server;
const draft = creationDraft({ world: 'Eine Flusslandschaft mit messbaren Erinnerungsspuren.', people: 'Die Ufergemeinschaft bewahrt Wissen gemeinsam.', seed: 7, language: 'de' });
const packet = () => ({ draft: structuredClone(draft), questions: [], ruleIdeas: [] });
const get = (path) => http(server.port, 'GET', path);
const post = (path, body, headers = {}) => http(server.port, 'POST', path, { headers: { 'Content-Type': 'application/json', ...headers }, body });
const create = async () => {
  const id = randomUUID(), result = await post('/api/realms/workshops', { id, language: 'de' });
  assert.equal(result.status, 200, result.text); return result.json.workshop;
};
const publish = (workshop, data = packet()) => publishWorkshop(root, workshop.id, data, { expectRev: workshop.rev, generation: workshop.generation });
const binding = (workshop) => ({ id: workshop.id, rev: workshop.rev });
const ready = async (workshop) => {
  const current = publish(workshop);
  const preview = await post('/api/realms/preview', { draft: current.draft, workshop: binding(current) });
  assert.equal(preview.status, 200, preview.text);
  return { current, preview: preview.json, request: { draft: current.draft, fingerprint: preview.json.fingerprint, startKey: randomUUID(), workshop: binding(current) } };
};
before(async () => { root = mkdtempSync(join(tmpdir(), 'rc-server-workshop-')); server = await startServer(root); });
after(async () => { await server?.stop(); assert.ok(root.startsWith(join(tmpdir(), 'rc-server-workshop-'))); rmSync(root, { recursive: true, force: true }); });

test('workshop GET is read-only and create is guarded, closed and idempotent', async () => {
  const id = randomUUID();
  const missing = await get(`/api/realms/workshops/${id}`);
  assert.equal(missing.status, 404); assert.deepEqual(readdirSync(root), []);
  assert.equal((await post('/api/realms/workshops', { id, language: 'de' }, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await post('/api/realms/workshops', { id, language: 'de', extra: true })).status, 400);
  assert.equal((await post('/api/realms/workshops', { id: '../escape', language: 'de' })).status, 400);
  assert.deepEqual(readdirSync(root), []);
  const first = await post('/api/realms/workshops', { id, language: 'de' });
  const again = await post('/api/realms/workshops', { id, language: 'de' });
  assert.equal(first.status, 200); assert.deepEqual(first.json, again.json);
  assert.equal(first.json.workshop.draft, null); assert.match(first.json.prompt, new RegExp(id));
  assert.equal((await get(`/authoring/workshops/${id}.json`)).status, 404);
  assert.ok(!existsSync(join(root, 'campaigns')));
});

test('the real harness helper publishes the draft the browser reads', async () => {
  const current = await create(), path = join(root, 'confirmed-workshop.json');
  writeFileSync(path, JSON.stringify(packet()));
  const cli = spawnSync(process.execPath, [join(REPO, 'tools/harness/realm-workshop.mjs'), 'publish', '--root', root, '--id', current.id, '--file', path, '--expect-rev', '0', '--generation', 'legacy'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stdout);
  const response = await get(`/api/realms/workshops/${current.id}`);
  assert.equal(response.status, 200); assert.deepEqual(response.json.workshop, JSON.parse(cli.stdout).workshop);
  assert.deepEqual(response.json.workshop.draft, draft); assert.equal(response.json.workshop.rev, 1);
  assert.ok(!existsSync(join(root, 'campaigns')));
});

test('incomplete conversation publishes questions to the browser while preview and start remain blocked', async () => {
  const current = await create();
  const early = publish(current, { draft: null, questions: ['Wie bewahrt diese Gemeinschaft Wissen?'], ruleIdeas: [] });
  const read = await get(`/api/realms/workshops/${current.id}`);
  assert.equal(read.status, 200); assert.equal(read.json.workshop.draft, null);
  assert.deepEqual(read.json.workshop.questions, early.questions);
  const pure = await post('/api/realms/preview', { draft }); assert.equal(pure.status, 200, pure.text);
  const body = { draft, workshop: binding(early) };
  assert.equal((await post('/api/realms/preview', body)).status, 409);
  assert.equal((await post('/api/realms/start', { ...body, fingerprint: pure.json.fingerprint, startKey: randomUUID() })).status, 409);
  assert.equal(readWorkshop(root, current.id).state, 'draft');
  assert.ok(!existsSync(join(root, 'campaigns')));
});

test('unanswered questions and unsupported rules block bound preview and start without a campaign', async () => {
  const pure = await post('/api/realms/preview', { draft }); assert.equal(pure.status, 200, pure.text);
  for (const field of ['questions', 'ruleIdeas']) {
    const current = await create(), data = packet(); data[field] = ['Erinnerungen als zusätzliche Ressource?'];
    const changed = publish(current, data), body = { draft, workshop: binding(changed) };
    const preview = await post('/api/realms/preview', body);
    assert.equal(preview.status, 409, preview.text); assert.equal(preview.json.issues[0].params.reason, 'workshop-unresolved');
    const start = await post('/api/realms/start', { ...body, fingerprint: pure.json.fingerprint, startKey: randomUUID() });
    assert.equal(start.status, 409, start.text); assert.equal(start.json.issues[0].params.reason, 'workshop-unresolved');
    assert.equal(readWorkshop(root, current.id).state, 'draft');
  }
  assert.ok(!existsSync(join(root, 'campaigns')));
});

test('a new chat revision refuses an older browser preview before reserving or creating a campaign', async () => {
  const { current, request } = await ready(await create());
  const next = packet(); next.draft.world.name = 'Gemeinsam überarbeitete Welt'; publish(current, next);
  const response = await post('/api/realms/start', request);
  assert.equal(response.status, 409, response.text); assert.equal(response.json.issues[0].params.reason, 'workshop-stale');
  assert.equal(readWorkshop(root, current.id).state, 'draft');
  assert.ok(!existsSync(join(root, 'campaigns')));
});

test('explicit start freezes publication before async CLI creation and retries recover one campaign', async () => {
  const { current, request } = await ready(await create());
  request.startKey = request.startKey.toUpperCase();
  const pending = post('/api/realms/start', request);
  let observed = null;
  for (let attempt = 0; attempt < 150; attempt++) {
    observed = readWorkshop(root, current.id);
    if (observed.state !== 'draft') break;
    await new Promise((done) => setTimeout(done, 10));
  }
  assert.equal(observed.state, 'starting');
  assert.throws(() => publish(current), (error) => error.issues[0].params.reason === 'workshop-frozen');
  const first = await pending; assert.equal(first.status, 201, first.text);
  const started = readWorkshop(root, current.id);
  assert.equal(started.state, 'started'); assert.equal(started.start.campaign, first.json.id);
  await server.stop(); server = await startServer(root);
  const retried = await post('/api/realms/start', request);
  assert.equal(retried.status, 201, retried.text); assert.deepEqual(retried.json, first.json);
  assert.equal(JSON.parse(readFileSync(join(root, 'campaigns/index.json'))).campaigns.length, 1);
  const wrongKey = await post('/api/realms/start', { ...request, startKey: randomUUID() });
  assert.equal(wrongKey.status, 409, wrongKey.text);
});

test('ready retries recover a frozen workshop after compiler fingerprint drift without creating another campaign', async () => {
  const { current, request } = await ready(await create());
  const made = await post('/api/realms/start', request); assert.equal(made.status, 201, made.text);
  const earlierFingerprint = hashValue({ compiler: 'earlier-workshop-fixture', draft });
  const receiptPath = join(root, 'authoring/receipts', request.startKey + '.json');
  const receipt = JSON.parse(readFileSync(receiptPath)); writeFileSync(receiptPath, JSON.stringify({ ...receipt, fingerprint: earlierFingerprint }));
  const workshopPath = join(root, 'authoring/workshops', current.id + '.json');
  const stored = readWorkshop(root, current.id); writeFileSync(workshopPath, JSON.stringify({ ...stored, start: { ...stored.start, fingerprint: earlierFingerprint } }));
  const before = JSON.parse(readFileSync(join(root, 'campaigns/index.json'))).campaigns.length;
  const recovered = await post('/api/realms/start', { ...request, fingerprint: earlierFingerprint });
  assert.equal(recovered.status, 201, recovered.text); assert.deepEqual(recovered.json, made.json);
  assert.equal(JSON.parse(readFileSync(join(root, 'campaigns/index.json'))).campaigns.length, before);
});

test('failed package installation keeps the reserved snapshot frozen for an exact retry', async () => {
  const current = await create(), data = packet(); data.draft.world.name = 'Paketkonflikt der Werkstatt';
  const published = publish(current, data);
  const preview = await post('/api/realms/preview', { draft: published.draft, workshop: binding(published) }); assert.equal(preview.status, 200, preview.text);
  const packageDir = join(root, 'welten', preview.json.pack.welt.id); mkdirSync(packageDir);
  writeFileSync(join(packageDir, 'welt.json'), '{"existing":"keep"}');
  const request = { draft: published.draft, fingerprint: preview.json.fingerprint, startKey: randomUUID(), workshop: binding(published) };
  const refused = await post('/api/realms/start', request);
  assert.equal(refused.status, 500, refused.text); assert.equal(readWorkshop(root, current.id).state, 'starting');
  assert.throws(() => publish(published, data), (error) => error.issues[0].params.reason === 'workshop-frozen');
  assert.equal((await post('/api/realms/start', request)).status, 500);
});

test('a rotated library generation refuses old workspaces and start recovery', async () => {
  const { current, request } = await ready(await create());
  const indexPath = join(root, 'campaigns/index.json'), index = JSON.parse(readFileSync(indexPath));
  writeFileSync(indexPath, JSON.stringify({ ...index, generation: randomUUID().replaceAll('-', '') }));
  for (const response of [await get(`/api/realms/workshops/${current.id}`), await post('/api/realms/workshops', { id: current.id, language: 'de' }), await post('/api/realms/start', request)]) {
    assert.equal(response.status, 409, response.text); assert.equal(response.json.issues[0].params.reason, 'library-reset');
  }
});

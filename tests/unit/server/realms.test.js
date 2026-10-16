import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, http, startServer } from '../../lib/server.mjs';
import { hashValue } from '../../../engine/core/hash.js';

let root, server, draft, firstPreview, started;
const brief = {
  world: 'Zwischen versunkenen Beobachtungsstationen verändert jede gespeicherte Erinnerung die Landschaft.',
  people: 'Die Archivgemeinschaft teilt Werkstätten und entscheidet öffentlich über den Einsatz ihrer Instrumente.',
  language: 'de', seed: 7,
};
const get = (path) => http(server.port, 'GET', path);
const post = (path, body, headers = {}) => http(server.port, 'POST', path, { headers: { 'Content-Type': 'application/json', ...headers }, body });
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const digest = (data) => createHash('sha256').update(data).digest('hex');

function snapshot(dir) {
  const out = {};
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [name, value] of Object.entries(snapshot(path))) out[entry.name + '/' + name] = value;
    } else if (entry.isFile()) out[entry.name] = digest(readFileSync(path));
  }
  return out;
}

function cli(...args) {
  const result = spawnSync(process.execPath, [join(REPO, 'engine/cli.mjs'), ...args, '--json'], {
    cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8', timeout: 120000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-server-realms-'));
  cli('new', 'hochland', '--seed', '7', '--id', 'existing');
  cli('open', '--campaign', 'existing');
  cli('save', '--campaign', 'existing', '--name', 'Vor der Realm-Erstellung');
  server = await startServer(root);
});
after(async () => {
  await server?.stop();
  if (root) {
    assert.ok(root.startsWith(join(tmpdir(), 'rc-server-realms-')));
    rmSync(root, { recursive: true, force: true });
  }
});

test('draft and repeated preview keep prose and create no files', async () => {
  const beforeRoot = snapshot(root);
  const beforeBase = snapshot(join(REPO, 'welten/hochland'));
  const made = await post('/api/realms/draft', brief);
  assert.equal(made.status, 200, made.text);
  draft = made.json.draft;
  assert.equal(draft.world.description, brief.world);
  assert.equal(draft.people.description, brief.people);
  const first = await post('/api/realms/preview', { draft });
  assert.equal(first.status, 200, first.text);
  const second = await post('/api/realms/preview', { draft });
  assert.equal(second.status, 200, second.text);
  assert.deepEqual(first.json, second.json);
  firstPreview = first.json;
  assert.match(firstPreview.fingerprint, /^[0-9a-f]{16}$/);
  assert.equal(firstPreview.view.phase, 'planning');
  assert.equal(firstPreview.view.turn, 0);
  assert.equal(firstPreview.view.peoples[firstPreview.view.people].name, draft.people.name);
  assert.deepEqual(firstPreview.pack.welt.creation, draft);
  assert.deepEqual(new Set(firstPreview.tiles.map((tile) => tile.key)), new Set(Object.keys(firstPreview.view.map.known[firstPreview.view.people])));
  for (const tile of firstPreview.tiles) {
    assert.equal(tile.key, `${tile.q},${tile.r}`);
    assert.ok(firstPreview.pack.welt.terrains.some((terrain) => terrain.id === tile.terrain));
  }
  assert.deepEqual(snapshot(root), beforeRoot);
  assert.deepEqual(snapshot(join(REPO, 'welten/hochland')), beforeBase);
});

test('malformed authoring input and stale previews are refused before writes', async () => {
  const before = snapshot(root);
  for (const value of [
    { ...brief, unexpected: true }, { ...brief, world: '' }, { ...brief, people: 'x'.repeat(3001) },
    { ...brief, seed: -1 }, { ...brief, language: 'zz' },
  ]) assert.equal((await post('/api/realms/draft', value)).status, 400);
  for (const value of [
    { ...draft, unexpected: true }, { ...draft, seed: -1 },
    { ...draft, people: { ...draft.people, strength: draft.people.weakness } },
  ]) assert.equal((await post('/api/realms/preview', { draft: value })).status, 400);
  assert.equal((await post('/api/realms/preview', { draft, unexpected: true })).status, 400);
  assert.equal((await post('/api/realms/preview', { draft }, { Origin: 'https://foreign.example' })).status, 403);
  const changed = structuredClone(draft);
  changed.world.name += ' neu';
  assert.equal((await post('/api/realms/start', { draft: changed, fingerprint: firstPreview.fingerprint, startKey: randomUUID() })).status, 409);
  assert.equal((await post('/api/realms/start', { draft, fingerprint: firstPreview.fingerprint, startKey: '../escape' })).status, 400);
  assert.deepEqual(snapshot(root), before);
});

test('an explicit start opens the exact preview as a separate campaign and keeps existing saves', async () => {
  const beforeExisting = snapshot(join(root, 'campaigns/existing'));
  const beforeBase = snapshot(join(REPO, 'welten/hochland'));
  const startKey = randomUUID();
  const request = { draft, fingerprint: firstPreview.fingerprint, startKey };
  const responses = await Promise.all([post('/api/realms/start', request), post('/api/realms/start', request)]);
  for (const response of responses) assert.equal(response.status, 201, response.text);
  assert.deepEqual(responses[0].json, responses[1].json);
  started = { ...responses[0].json, request };
  assert.notEqual(started.id, 'existing');
  const status = cli('status', '--campaign', started.id);
  assert.equal(status.phase, 'planning');
  assert.equal(status.turn, 0);
  assert.equal(status.player.name, draft.people.name);
  const view = (await get(`/campaigns/${started.id}/view/${firstPreview.view.people}.json`)).json;
  assert.deepEqual(view.peoples, firstPreview.view.peoples);
  assert.deepEqual(view.map, firstPreview.view.map);
  assert.equal(view.campaign.world.id, firstPreview.pack.welt.id);
  assert.equal(json(join(root, 'authoring/receipts', startKey + '.json')).state, 'ready');
  assert.deepEqual(snapshot(join(root, 'campaigns/existing')), beforeExisting);
  assert.deepEqual(snapshot(join(REPO, 'welten/hochland')), beforeBase);
  assert.deepEqual(json(join(root, 'campaigns/index.json')).campaigns.map((campaign) => campaign.id).sort(), ['existing', started.id].sort());
});

test('a lost-response retry survives server restart and a changed draft cannot reuse its start key', async () => {
  await server.stop();
  server = await startServer(root);
  const before = snapshot(join(root, 'campaigns', started.id));
  const retried = await post('/api/realms/start', started.request);
  assert.equal(retried.status, 201, retried.text);
  assert.equal(retried.json.id, started.id);
  assert.deepEqual(snapshot(join(root, 'campaigns', started.id)), before);
  const changed = structuredClone(draft);
  changed.world.name += ' verändert';
  const next = await post('/api/realms/preview', { draft: changed });
  assert.equal(next.status, 200, next.text);
  const conflict = await post('/api/realms/start', { draft: changed, fingerprint: next.json.fingerprint, startKey: started.request.startKey });
  assert.equal(conflict.status, 409, conflict.text);
  assert.equal(json(join(root, 'campaigns/index.json')).campaigns.length, 2);
});

test('authored package files use the same resolver as the CLI and expose only the allowlist', async () => {
  const keys = { welt: 'welt.json', regeln: 'regeln.json', labels: 'labels.json', style: 'style.json', entwicklungen: 'content/entwicklungen.json', ereignisse: 'content/ereignisse.json', bestimmungen: 'content/bestimmungen.json' };
  for (const [key, file] of Object.entries(keys)) {
    const response = await get(`/welten/${started.world}/${file}`);
    assert.equal(response.status, 200, file);
    assert.deepEqual(response.json, firstPreview.pack[key]);
  }
  const worlds = await get('/api/worlds');
  assert.ok(worlds.json.some((world) => world.id === started.world));
  writeFileSync(join(root, 'welten', started.world, 'private.json'), '{"private":true}');
  for (const file of ['private.json', 'creation.json', 'content/private.json', '.private', 'world.lock.json', 'labels.json:stream', 'content%5Centwicklungen.json']) {
    assert.equal((await get(`/welten/${started.world}/${file}`)).status, 404, file);
  }
  assert.equal((await get(`/welten/${started.world}/labels.en.json`)).status, 404);
});

test('package directory and content junctions cannot escape their allowed root', () => {
  const outside = join(root, 'private');
  mkdirSync(outside);
  writeFileSync(join(outside, 'welt.json'), '{"id":"escape-world"}');
  writeFileSync(join(outside, 'entwicklungen.json'), '{"private":true}');
  symlinkSync(outside, join(root, 'welten/escape-world'), process.platform === 'win32' ? 'junction' : 'dir');
  const safe = join(root, 'welten/escape-content');
  mkdirSync(safe);
  writeFileSync(join(safe, 'welt.json'), '{"id":"escape-content"}');
  symlinkSync(outside, join(safe, 'content'), process.platform === 'win32' ? 'junction' : 'dir');
  return Promise.all([
    get('/welten/escape-world/welt.json').then((response) => assert.equal(response.status, 404)),
    get('/welten/escape-content/content/entwicklungen.json').then((response) => assert.equal(response.status, 404)),
  ]);
});

test('a start interrupted after CLI creation resumes its reserved campaign', async () => {
  const startKey = randomUUID();
  const id = 'realm-' + startKey.replaceAll('-', '');
  const receipt = { ...json(join(root, 'authoring/receipts', started.request.startKey + '.json')), startKey, id, state: 'reserved' };
  writeFileSync(join(root, 'authoring/receipts', startKey + '.json'), JSON.stringify(receipt));
  cli('new', started.world, '--seed', String(draft.seed), '--as', firstPreview.view.people,
    '--difficulty', draft.difficulty, '--lang', draft.language, '--id', id);
  assert.equal(cli('status', '--campaign', id).phase, 'agents');
  const response = await post('/api/realms/start', { ...started.request, startKey });
  assert.equal(response.status, 201, response.text);
  assert.equal(response.json.id, id);
  assert.equal(cli('status', '--campaign', id).phase, 'planning');
  assert.equal(json(join(root, 'authoring/receipts', startKey + '.json')).state, 'ready');
});

test('a conflicting installed package is preserved instead of overwritten', async () => {
  const changed = structuredClone(draft);
  changed.world.name += ' Paketkonflikt';
  const prepared = await post('/api/realms/preview', { draft: changed });
  assert.equal(prepared.status, 200, prepared.text);
  const dir = join(root, 'welten', prepared.json.pack.welt.id);
  mkdirSync(dir);
  const sentinel = '{"existing":"keep exactly"}\n';
  writeFileSync(join(dir, 'welt.json'), sentinel);
  const startKey = randomUUID();
  const response = await post('/api/realms/start', { draft: changed, fingerprint: prepared.json.fingerprint, startKey });
  assert.equal(response.status, 500, response.text);
  assert.equal(readFileSync(join(dir, 'welt.json'), 'utf8'), sentinel);
  assert.ok(!existsSync(join(root, 'campaigns', 'realm-' + startKey.replaceAll('-', ''))));
});

test('a ready start from an earlier compiler remains findable without recompiling or writing', async () => {
  const request = { draft, fingerprint: firstPreview.fingerprint, startKey: randomUUID() };
  const made = await post('/api/realms/start', request);
  assert.equal(made.status, 201, made.text);
  const path = join(root, 'authoring/receipts', request.startKey + '.json');
  const receipt = json(path);
  // A previous compiler/base produced a different accepted preview fingerprint.
  const earlierFingerprint = hashValue({ compiler: 'previous-fixture', draft });
  assert.notEqual(earlierFingerprint, firstPreview.fingerprint);
  writeFileSync(path, JSON.stringify({ ...receipt, fingerprint: earlierFingerprint }));
  await server.stop();
  server = await startServer(root);
  const before = snapshot(root);
  const recovered = await post('/api/realms/start', { ...request, fingerprint: earlierFingerprint });
  assert.equal(recovered.status, 201, recovered.text);
  assert.deepEqual(recovered.json, made.json);
  assert.deepEqual(snapshot(root), before);
  const changed = structuredClone(draft);
  changed.people.name += ' anders';
  const refused = await post('/api/realms/start', { ...request, draft: changed, fingerprint: earlierFingerprint });
  assert.equal(refused.status, 409, refused.text);
  assert.deepEqual(snapshot(root), before);
});

test('an earlier reserved start with a changed compiler stays safely uncreated', async () => {
  const startKey = randomUUID();
  const id = 'realm-' + startKey.replaceAll('-', '');
  const receipt = { ...json(join(root, 'authoring/receipts', started.request.startKey + '.json')), startKey, id, state: 'reserved', fingerprint: hashValue({ compiler: 'previous-reserved-fixture', draft }) };
  writeFileSync(join(root, 'authoring/receipts', startKey + '.json'), JSON.stringify(receipt));
  const before = snapshot(root);
  const response = await post('/api/realms/start', { draft, fingerprint: receipt.fingerprint, startKey });
  assert.equal(response.status, 409, response.text);
  assert.equal(response.json.issues[0].params.reason, 'stale-preview');
  assert.ok(!existsSync(join(root, 'campaigns', id)));
  assert.deepEqual(snapshot(root), before);
});

test('a confirmed library reset invalidates legacy ready and reserved attempts without writes', async () => {
  const receipt = json(join(root, 'authoring/receipts', started.request.startKey + '.json'));
  const reservedKey = randomUUID();
  const legacy = { ...receipt };
  delete legacy.generation;
  writeFileSync(join(root, 'authoring/receipts', started.request.startKey + '.json'), JSON.stringify(legacy));
  writeFileSync(join(root, 'authoring/receipts', reservedKey + '.json'), JSON.stringify({ ...legacy, startKey: reservedKey, id: 'realm-' + reservedKey.replaceAll('-', ''), state: 'reserved' }));
  const indexPath = join(root, 'campaigns/index.json');
  writeFileSync(indexPath, JSON.stringify({ ...json(indexPath), generation: randomUUID().replaceAll('-', '') }));
  const before = snapshot(root);
  for (const startKey of [started.request.startKey, reservedKey]) {
    const refused = await post('/api/realms/start', { ...started.request, startKey });
    assert.equal(refused.status, 409, refused.text);
    assert.equal(refused.json.issues[0].params.reason, 'library-reset');
    assert.deepEqual(snapshot(root), before);
  }
});

test('an offline reset clears campaigns and snapshots, keeps packages and blocks old start retries', async () => {
  const request = { ...started.request, startKey: randomUUID() };
  const made = await post('/api/realms/start', request);
  assert.equal(made.status, 201, made.text);
  const ready = json(join(root, 'authoring/receipts', request.startKey + '.json'));
  const reservedKey = randomUUID();
  writeFileSync(join(root, 'authoring/receipts', reservedKey + '.json'), JSON.stringify({ ...ready, startKey: reservedKey, id: 'realm-' + reservedKey.replaceAll('-', ''), state: 'reserved' }));
  cli('save', '--campaign', made.json.id, '--name', 'Vor dem Reset');
  const packages = snapshot(join(root, 'welten'));
  await server.stop();
  const reset = cli('reset', '--all', '--offline');
  assert.ok(reset.deleted.includes(made.json.id));
  assert.notEqual(reset.generation, ready.generation);
  assert.deepEqual(json(join(root, 'campaigns/index.json')).campaigns, []);
  server = await startServer(root);
  const afterReset = snapshot(root);
  for (const startKey of [request.startKey, reservedKey]) {
    const refused = await post('/api/realms/start', { ...request, startKey });
    assert.equal(refused.status, 409, refused.text);
    assert.equal(refused.json.issues[0].params.reason, 'library-reset');
    assert.deepEqual(snapshot(root), afterReset);
  }
  assert.deepEqual((await get('/api/campaigns')).json, []);
  assert.deepEqual(snapshot(join(root, 'welten')), packages);
  const fresh = { ...request, startKey: randomUUID() };
  const created = await post('/api/realms/start', fresh);
  assert.equal(created.status, 201, created.text);
  assert.notEqual(created.json.id, made.json.id);
  assert.equal(json(join(root, 'authoring/receipts', fresh.startKey + '.json')).generation, reset.generation);
  assert.equal(cli('status', '--campaign', created.json.id).phase, 'planning');
  assert.equal(json(join(root, 'campaigns/index.json')).generation, reset.generation);
});

// New game, campaign list, world list and campaign choice of the dev server,
// against a real serve.mjs on a throwaway REALMCRAFT_ROOT.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, http, startServer } from '../../fixtures/server.mjs';

const regeln = JSON.parse(readFileSync(join(REPO, 'welten/hochland/regeln.json'), 'utf8'));
const TEMPLATES = regeln.peopleTemplates.map((t) => t.id);
const [PLAYER, ...OTHERS] = TEMPLATES;

let root;
let server;
const get = (path) => http(server.port, 'GET', path);
const post = (path, body, headers = {}) => http(server.port, 'POST', path, { headers: { 'Content-Type': 'application/json', ...headers }, body });
const create = (fields) => post('/api/campaigns', { world: 'hochland', seed: 7, people: PLAYER, ...fields });
const campaignsDir = () => join(root, 'campaigns');

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-server-api-'));
  // A package in the campaign root that cannot start a game is left out of the list.
  mkdirSync(join(root, 'welten', 'leer'), { recursive: true });
  writeFileSync(join(root, 'welten', 'leer', 'welt.json'), JSON.stringify({ id: 'leer', name: 'Leer' }));
  server = await startServer(root);
});

after(() => {
  server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

test('GET /api/worlds lists the packages with templates, languages and options', async () => {
  const r = await get('/api/worlds');
  assert.equal(r.status, 200);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.deepEqual(r.json.map((w) => w.id), ['hochland']);
  const [w] = r.json;
  assert.deepEqual(w.templates.map((t) => t.id), TEMPLATES);
  assert.ok(w.templates.every((t) => typeof t.name === 'string' && t.name));
  assert.equal(w.languages[0], 'de');
  assert.deepEqual(w.difficulties, ['easy', 'normal', 'hard']);
  assert.equal(w.defaultDifficulty, 'normal');
  assert.deepEqual(w.seed, { min: 0, max: 0xffffffff });
  assert.equal((await post('/api/worlds', {})).status, 405);
});

test('POST /api/campaigns refuses every field the package does not offer', async () => {
  const cases = [
    [{ extra: 1 }, '/extra', 'unknown-field'],
    [{ world: '../welten' }, '/world', 'id'],
    [{ world: 'nirgends' }, '/world', 'unknown-world'],
    [{ seed: -1 }, '/seed', 'seed-range'],
    [{ seed: 1.5 }, '/seed', 'seed-range'],
    [{ seed: 0x100000000 }, '/seed', 'seed-range'],
    [{ seed: '7' }, '/seed', 'seed-range'],
    [{ people: 'niemand' }, '/people', 'unknown-template'],
    [{ people: undefined }, '/people', 'unknown-template'],
    [{ rivals: [] }, '/rivals', 'rivals-count'],
    [{ rivals: 'talbund' }, '/rivals', 'rivals-count'],
    [{ rivals: [OTHERS[0], OTHERS[0]] }, '/rivals', 'rivals-duplicate'],
    [{ rivals: [PLAYER] }, '/rivals/0', 'rival-is-player'],
    [{ rivals: ['fremde'] }, '/rivals/0', 'unknown-template'],
    [{ difficulty: 'brutal' }, '/difficulty', 'unknown-difficulty'],
    [{ language: 'xx' }, '/language', 'unknown-language'],
    [{ id: 'Bad Id' }, '/id', 'id'],
    [{ id: 'campaigns/../x' }, '/id', 'id'],
  ];
  for (const [fields, path, reason] of cases) {
    const r = await create(fields);
    assert.equal(r.status, 400, JSON.stringify(fields));
    const hit = r.json.issues.find((i) => i.path === path);
    assert.ok(hit, `${JSON.stringify(fields)} -> ${JSON.stringify(r.json.issues)}`);
    assert.equal(hit.params.reason, reason);
    assert.equal(hit.severity, 'error');
    assert.equal(typeof r.json.error, 'string');
  }
  assert.equal(existsSync(campaignsDir()), false, 'no refused request reaches the CLI');
});

test('POST /api/campaigns passes the browser guards first', async () => {
  const body = { world: 'hochland', seed: 7, people: PLAYER };
  assert.equal((await post('/api/campaigns', body, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post('/api/campaigns', body, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await post('/api/campaigns', body, { 'Content-Type': 'text/plain' })).status, 415);
  const big = await post('/api/campaigns', { ...body, pad: 'x'.repeat(70 * 1024) });
  assert.equal(big.status, 413);
  assert.equal(big.json.issues[0].code, 'server.too_large');
  assert.equal((await http(server.port, 'PUT', '/api/campaigns')).status, 405);
});

test('a new game is created through the CLI, a taken id is 409 and never overwritten', async () => {
  const first = await create({ difficulty: 'hard', language: 'de', rivals: OTHERS });
  assert.equal(first.status, 201, JSON.stringify(first.json));
  assert.deepEqual(first.json, { id: 'hochland-1' });
  const dir = join(campaignsDir(), 'hochland-1');
  assert.ok(existsSync(join(dir, 'state.json')));
  assert.ok(existsSync(join(dir, 'view', `${PLAYER}.json`)));

  const second = await create({ seed: 8, people: OTHERS[0], rivals: [PLAYER] });
  assert.equal(second.status, 201, JSON.stringify(second.json));
  assert.equal(second.json.id, 'hochland-2');
  const view = JSON.parse(readFileSync(join(campaignsDir(), 'hochland-2', 'view', `${OTHERS[0]}.json`), 'utf8'));
  assert.equal(view.people, OTHERS[0]);
  assert.equal(view.map.seed, 8);

  const before = readFileSync(join(dir, 'state.json'), 'utf8');
  const taken = await create({ id: 'hochland-1', seed: 99 });
  assert.equal(taken.status, 409);
  assert.equal(taken.json.issues[0].code, 'duplicate');
  assert.equal(readFileSync(join(dir, 'state.json'), 'utf8'), before);

  const named = await create({ id: 'meine-partie', seed: 0xffffffff });
  assert.equal(named.status, 201);
  assert.equal(named.json.id, 'meine-partie');
});

test('GET /api/campaigns lists the campaigns newest first with the player-side fields', async () => {
  // An ended campaign as the kernel leaves it, reduced to what the list reads.
  const ended = join(campaignsDir(), 'alt-ende');
  mkdirSync(join(ended, 'view'), { recursive: true });
  writeFileSync(join(ended, 'view', `${OTHERS[1]}.json`), JSON.stringify({
    format: 'realmcraft-view', people: OTHERS[1], turn: 9, phase: 'planning', status: 'ended',
    result: { winner: null, kind: 'collapse', turn: 9, reason: 'gone under' },
    peoples: { [OTHERS[1]]: { name: 'Talvolk' } },
  }));
  writeFileSync(join(ended, 'state.json'), JSON.stringify({ status: 'ended', campaign: { id: 'alt-ende', player: OTHERS[1] } }));
  const indexPath = join(campaignsDir(), 'index.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  index.campaigns.push({ id: 'alt-ende', world: 'hochland', player: OTHERS[1], turn: 9, status: 'ended', updatedAt: '2000-01-01T00:00:00Z' });
  index.campaigns.push({ id: '../evil', world: 'hochland', player: PLAYER, turn: 0, status: 'playing', updatedAt: '2999-01-01T00:00:00Z' });
  writeFileSync(indexPath, JSON.stringify(index));

  const r = await get('/api/campaigns');
  assert.equal(r.status, 200);
  const ids = r.json.map((c) => c.id);
  assert.deepEqual(ids.slice().sort(), ['alt-ende', 'hochland-1', 'hochland-2', 'meine-partie']);
  assert.equal(ids.at(-1), 'alt-ende');
  const stamps = r.json.map((c) => c.updatedAt);
  assert.deepEqual(stamps, stamps.slice().sort().reverse());

  const one = r.json.find((c) => c.id === 'hochland-1');
  assert.equal(one.world, 'hochland');
  assert.equal(one.player, PLAYER);
  assert.equal(one.people.id, PLAYER);
  assert.equal(typeof one.people.name, 'string');
  assert.equal(one.turn, 0);
  assert.equal(one.season, regeln.calendar.startSeason);
  assert.equal(one.year, regeln.calendar.startYear);
  assert.equal(one.phase, 'agents');
  assert.equal(one.status, 'playing');
  assert.equal(one.outcome, null);

  const end = r.json.find((c) => c.id === 'alt-ende');
  assert.equal(end.people.name, 'Talvolk');
  assert.equal(end.status, 'ended');
  assert.deepEqual(end.outcome, { kind: 'collapse', winner: null, won: false, turn: 9, reason: 'gone under', summary: null });
  assert.equal(end.language, 'de');
  assert.equal(end.difficulty, 'normal');
});

test('POST /api/campaigns/<cid>/activate records the choice the harness reads', async () => {
  const r = await post('/api/campaigns/hochland-1/activate', {});
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(r.json, { id: 'hochland-1', active: true, via: 'selected' });
  const marker = JSON.parse(readFileSync(join(campaignsDir(), 'active.json'), 'utf8'));
  assert.equal(marker.campaign, 'hochland-1');

  // A running /zug keeps its campaign; the answer says so instead of claiming the switch.
  const marker2 = (cmd) => execFileSync(process.execPath, ['tools/harness/run-marker.mjs', cmd, '--campaign', 'hochland-2', '--root', root], { cwd: REPO, encoding: 'utf8' });
  marker2('start');
  try {
    const busy = await post('/api/campaigns/hochland-1/activate', {});
    assert.deepEqual(busy.json, { id: 'hochland-1', active: false, current: 'hochland-2', via: 'run' });
  } finally {
    marker2('end');
  }
  // An ended campaign is never handed to /zug, whatever the browser chose.
  const ended = await post('/api/campaigns/alt-ende/activate', {});
  assert.equal(ended.json.active, false);

  // The marker file is no campaign and stays out of reach of the browser.
  assert.equal((await get('/campaigns/active.json')).status, 404);
  assert.equal((await post('/api/campaigns/nocamp/activate', {})).status, 404);
  assert.equal((await post('/api/campaigns/Bad%20Id/activate', {})).status, 404);
  assert.equal((await get('/api/campaigns/hochland-1/activate')).status, 405);
  assert.equal((await post('/api/campaigns/hochland-1/activate', {}, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
});

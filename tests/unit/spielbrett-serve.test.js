// tests/unit/spielbrett-serve.test.js — campaign bridge of serve.mjs against a
// real server process and a throwaway campaign root (REALMCRAFT_ROOT). The
// port is free and never one of the operator ports (4173/4185/4186/4190).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { request } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO as ROOT, http, startServer } from '../lib/server.mjs';

const CID = 't1';
const PLAYER = 'bergnomaden';
const PROBE = 'T0:bergnomaden:event';
let server;
let port;
let tempRoot;

// Raw path without URL normalisation, so %5C and %2f arrive as written.
const get = (path, headers) => http(port, 'GET', path, { headers });
const post = (path, body, headers = {}) =>
  http(port, 'POST', path, { headers: { 'Content-Type': 'application/json', ...headers }, body });

const cli = (...args) =>
  execFileSync(process.execPath, ['engine/cli.mjs', ...args, '--json'], {
    cwd: ROOT,
    env: { ...process.env, REALMCRAFT_ROOT: tempRoot },
    encoding: 'utf8',
  });

const emptyDraft = (baseRev, rolls = {}) => ({
  format: 'realmcraft-draft',
  version: 1,
  people: PLAYER,
  turn: 0,
  baseRev,
  orders: [],
  mandate: {},
  rolls,
  withdrawn: [],
  sealed: false,
});

before(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'rc-spielbrett-'));
  cli('new', 'hochland', '--seed', '7', '--id', CID);
  cli('open', '--campaign', CID);
  server = await startServer(tempRoot);
  port = server.port;
});

after(async () => {
  await server?.stop();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('campaign index and the static handler still work', async () => {
  const r = await get('/campaigns/index.json');
  assert.equal(r.status, 200);
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.equal(r.json.campaigns[0].id, CID);
  assert.equal((await get('/index.html')).status, 200);
});

test('only the player view is served, foreign views are fog', async () => {
  const mine = await get(`/campaigns/${CID}/view/${PLAYER}.json`);
  assert.equal(mine.status, 200);
  assert.equal(mine.json.people, PLAYER);
  assert.equal((await get(`/campaigns/${CID}/view/talbund.json`)).status, 404);
  assert.equal((await get(`/campaigns/${CID}/view/schaedelklan/events/T0000.json`)).status, 404);
  assert.equal((await get(`/campaigns/${CID}/status.json`)).status, 200);
});

test('kernel internals are not reachable', async () => {
  const paths = [
    'state.json', 'library.json', 'world.lock.json', 'log/journal.json', `drafts/${PLAYER}.json`,
    'agents/tasks/T0000/council-bergnomaden.json', 'agents/tasks/T0000', 'agents', 'drafts', 'view', 'log', 'log/T0000.json',
    'narrative/../state.json', 'narrative/.hidden.md', 'narrative/chronik/T0001.txt',
  ];
  for (const p of paths) assert.equal((await get(`/campaigns/${CID}/${p}`)).status, 404, p);
  assert.equal((await post(`/campaigns/${CID}/status.json`, {})).status, 404);
  assert.equal((await get('/campaigns/')).status, 404);
  assert.equal((await get('/campaigns')).status, 404);
});

// A literal ../ is collapsed by the URL parser before routing and is then an ordinary
// static request, so only encoded spellings are meaningful here.
test('traversal and path spelling tricks into campaigns are refused', async () => {
  const paths = [
    `/campaigns/${CID}%2f..%2f..%2fpackage.json`,
    `/campaigns%5c${CID}%5cstate.json`,
    `/Campaigns/${CID}/state.json`,
    `/campaigns./${CID}/state.json`,
    `/campaigns/${CID}%5c..%5cstate.json`,
    `/x%2f..%2fcampaigns/${CID}/state.json`,
  ];
  for (const p of paths) {
    const r = await get(p);
    assert.ok([403, 404].includes(r.status), `${p} -> ${r.status}`);
  }
});

test('log reports are served as a player summary only', async () => {
  // No report exists before the first apply, the pattern still must not leak the journal.
  assert.equal((await get(`/campaigns/${CID}/log/T0000.json`)).status, 404);
  assert.equal((await get(`/campaigns/${CID}/log/journal.json`)).status, 404);
});

test('content endpoint returns only items whose refs occur in the view', async () => {
  const libPath = join(tempRoot, 'campaigns', CID, 'library.json');
  const original = readFileSync(libPath, 'utf8');
  const lib = JSON.parse(original);
  const view = (await get(`/campaigns/${CID}/view/${PLAYER}.json`)).text;
  const decoy = { ref: 'decoy-item@1', type: 'entwicklung', data: { id: 'decoy-item', rev: 1 } };
  writeFileSync(libPath, JSON.stringify({ ...lib, entries: [...lib.entries, decoy] }));
  try {
    const r = await get(`/api/campaigns/${CID}/content`);
    assert.equal(r.status, 200);
    assert.equal(r.json.format, 'realmcraft-content');
    assert.ok(r.json.items.length > 0);
    assert.ok(!r.json.items.some((i) => i.id === 'decoy-item'));
    for (const i of r.json.items) assert.ok(view.includes(`"${i.id}@${i.rev}"`), `${i.id}@${i.rev}`);
    const expected = lib.entries.filter((e) => view.includes(`"${e.ref}"`));
    assert.equal(r.json.items.length, expected.length);
  } finally {
    writeFileSync(libPath, original);
  }
});

test('draft and chronik endpoints answer before any draft exists', async () => {
  assert.deepEqual((await get(`/api/campaigns/${CID}/draft`)).json, { draft: null });
  assert.deepEqual((await get(`/api/campaigns/${CID}/chronik`)).json, { entries: [] });
  assert.equal((await get('/api/campaigns/NOPE/draft')).status, 404);
  assert.equal((await get('/api/campaigns/nocamp/draft')).status, 404);
  assert.equal((await post(`/api/campaigns/${CID}/draft`, {})).status, 405);
});

test('POST guards answer in order', async () => {
  const good = { campaign: CID, people: PLAYER, draft: emptyDraft(1) };
  assert.equal((await get('/api/draft')).status, 405);
  assert.equal((await get('/api/seal')).status, 405);
  assert.equal((await post('/api/draft', good, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post('/api/draft', good, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await post('/api/draft', good, { 'Sec-Fetch-Site': 'same-site' })).status, 403);
  assert.equal((await post('/api/draft', good, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await post('/api/draft', good, { Origin: `http://localhost:${port + 1}` })).status, 403);
  assert.equal((await post('/api/draft', 'x'.repeat(70 * 1024))).status, 413);
  assert.equal((await post('/api/draft', '{not json')).status, 400);
  assert.equal((await post('/api/draft', { ...good, people: 'talbund' })).status, 400);
  assert.equal((await post('/api/draft', { ...good, campaign: 'Bad Id' })).status, 400);
  assert.equal((await post('/api/draft', { ...good, campaign: 'nocamp' })).status, 400);
  assert.equal((await post('/api/draft', { ...good, draft: [] })).status, 400);
  assert.equal((await post('/api/draft', { campaign: CID, people: PLAYER })).status, 400);
  assert.equal((await post('/api/seal', { campaign: '../x' })).status, 400);
  // Same-origin browser headers pass the guards.
  const ok = await post('/api/draft', good, { 'Sec-Fetch-Site': 'same-origin', Origin: `http://localhost:${port}` });
  assert.equal(ok.status, 200);
});

test('draft preview, seal without rolls, then seal with the roll', async () => {
  const view = (await get(`/campaigns/${CID}/view/${PLAYER}.json`)).json;
  assert.equal(view.phase, 'planning');

  const first = await post('/api/draft', { campaign: CID, people: PLAYER, draft: emptyDraft(view.rev) });
  assert.equal(first.status, 200);
  assert.equal(first.json.exit, 3);
  assert.equal(first.json.stored, true);
  const probe = first.json.preview.probes.find((p) => p.id === PROBE);
  assert.ok(probe, 'preview lists the event probe');
  assert.ok(probe.fingerprint);

  const stored = await get(`/api/campaigns/${CID}/draft`);
  assert.equal(stored.json.draft.people, PLAYER);
  assert.equal(stored.json.draft.turn, 0);

  const unsealed = await post('/api/seal', { campaign: CID });
  assert.equal(unsealed.status, 200);
  assert.equal(unsealed.json.ok, false);
  assert.equal(unsealed.json.exit, 3);
  assert.ok(unsealed.json.issues.some((i) => i.code === 'roll_missing'), JSON.stringify(unsealed.json.issues));

  const rolls = { [PROBE]: { value: 4, fingerprint: probe.fingerprint } };
  const second = await post('/api/draft', { campaign: CID, people: PLAYER, draft: emptyDraft(view.rev, rolls) });
  assert.equal(second.status, 200);
  assert.equal(second.json.stored, true);
  assert.equal(second.json.exit, 0, JSON.stringify(second.json.issues));

  // Listen before sealing: the seal rewrites the view files the watcher reports.
  const sse = await openEvents();
  try {
    const sealed = await post('/api/seal', { campaign: CID });
    assert.equal(sealed.status, 200);
    assert.equal(sealed.json.ok, true, JSON.stringify(sealed.json));
    assert.equal(sealed.json.exit, 0);
    const after = (await get(`/campaigns/${CID}/view/${PLAYER}.json`)).json;
    assert.equal(after.phase, 'resolving');
    const hit = await sse.waitFor((e) => e.event === 'view' && e.data?.campaign === CID, 5000);
    assert.match(hit.data.file, /^view\//);
    assert.equal(hit.data.file.includes('talbund'), false);
  } finally {
    sse.close();
  }
});

test('existing SSE hello still arrives', async () => {
  const sse = await openEvents();
  try {
    assert.ok(sse.seen.some((e) => e.event === 'hello') || (await sse.waitFor((e) => e.event === 'hello', 2000)));
  } finally {
    sse.close();
  }
});

// Minimal SSE client collecting parsed events, JSON data decoded where possible.
function openEvents() {
  return new Promise((resolve, reject) => {
    const seen = [];
    const waiters = [];
    let buffer = '';
    const req = request({ host: '127.0.0.1', port, path: '/events', headers: { Host: `localhost:${port}` } }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buffer += chunk;
        let cut;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const raw = /^data: (.*)$/m.exec(block)?.[1];
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch {
            // plain text data such as "changed"
          }
          const entry = { event, data };
          seen.push(entry);
          for (const w of [...waiters]) if (w.match(entry)) w.done(entry);
        }
      });
      resolve({
        seen,
        close: () => req.destroy(),
        waitFor: (match, ms) =>
          new Promise((ok, fail) => {
            const hit = seen.find(match);
            if (hit) return ok(hit);
            const w = { match, done: (e) => { clearTimeout(timer); waiters.splice(waiters.indexOf(w), 1); ok(e); } };
            const timer = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); fail(new Error('SSE event timeout')); }, ms);
            waiters.push(w);
          }),
      });
    });
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
    req.end();
  });
}

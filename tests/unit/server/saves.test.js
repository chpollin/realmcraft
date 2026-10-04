// Save, list and load endpoints of the dev server against a real serve.mjs
// on a throwaway REALMCRAFT_ROOT, with the campaign created through the CLI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, http, startServer } from '../../lib/server.mjs';

const CID = 'spiel-1';
let root;
let server;
const dir = () => join(root, 'campaigns', CID);
const state = () => JSON.parse(readFileSync(join(dir(), 'state.json'), 'utf8'));
const get = (path) => http(server.port, 'GET', path);
const post = (path, body, headers = {}) => http(server.port, 'POST', path, { headers: { 'Content-Type': 'application/json', ...headers }, body });
const saves = (body, headers) => post(`/api/campaigns/${CID}/saves`, body, headers);
const load = (body, headers) => post(`/api/campaigns/${CID}/load`, body, headers);

function cli(...args) {
  const r = spawnSync(process.execPath, [join(REPO, 'engine', 'cli.mjs'), ...args, '--json'], { cwd: root, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8', timeout: 120000 });
  return { code: r.status, json: JSON.parse(r.stdout) };
}

/** Collects SSE events until `until(event, data)` holds or the time is up. */
function listen(until, ms = 8000) {
  return new Promise((resolve, reject) => {
    const seen = [];
    const req = request({ host: '127.0.0.1', port: server.port, path: '/events', headers: { Host: `localhost:${server.port}` } }, (res) => {
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          seen.push([event, data]);
          if (until(event, data)) {
            clearTimeout(timer);
            req.destroy();
            resolve(seen);
          }
        }
      });
    });
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error(`no matching event within ${ms} ms: ${JSON.stringify(seen)}`));
    }, ms);
    req.on('error', () => {});
    req.end();
  });
}

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-server-saves-'));
  assert.equal(cli('new', 'hochland', '--seed', '7', '--as', 'bergnomaden', '--id', CID).code, 0);
  server = await startServer(root);
});

after(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

test('save and load are refused outside planning with 409', async () => {
  const r = await saves({ label: 'Zu früh' });
  assert.equal(r.status, 409);
  assert.equal(r.json.issues[0].params.reason, 'save-needs-planning');
  assert.equal(cli('open', '--campaign', CID).code, 0);
});

test('every field is checked before the CLI runs', async () => {
  const cases = [
    [saves, {}, '/label', 'label'],
    [saves, { label: 7 }, '/label', 'label'],
    [saves, { label: '   ' }, '/label', 'label'],
    [saves, { label: 'x'.repeat(81) }, '/label', 'label'],
    [saves, { label: 'a\u0000b' }, '/label', 'label'],
    [saves, { label: 'ok', slot: 'x' }, '/slot', 'unknown-field'],
    [load, {}, '/slot', 'slot-id'],
    [load, { slot: 'Bad Slot' }, '/slot', 'slot-id'],
    [load, { slot: '../save-1' }, '/slot', 'slot-id'],
    [load, { slot: ['save-1'] }, '/slot', 'slot-id'],
    [load, { slot: 'save-1', label: 'x' }, '/label', 'unknown-field'],
  ];
  for (const [send, body, path, reason] of cases) {
    const r = await send(body);
    assert.equal(r.status, 400, JSON.stringify(body));
    const hit = r.json.issues.find((i) => i.path === path);
    assert.equal(hit?.params?.reason, reason, `${JSON.stringify(body)} -> ${JSON.stringify(r.json.issues)}`);
  }
  assert.deepEqual((await get(`/api/campaigns/${CID}/saves`)).json.saves, []);
});

test('unknown campaigns, oversized bodies and foreign requests are refused', async () => {
  for (const path of ['/api/campaigns/nirgends-1/saves', '/api/campaigns/Bad/saves', '/api/campaigns/nirgends-1/load']) {
    const r = path.endsWith('saves') ? await get(path) : await post(path, { slot: 'save-1' });
    assert.equal(r.status, 404, path);
    assert.equal(r.json.issues[0].code, 'server.unknown_campaign');
  }
  const big = await saves({ label: 'x', pad: 'y'.repeat(2000) });
  assert.equal(big.status, 413);
  assert.equal(big.json.issues[0].params.max, 1024);
  assert.equal((await saves({ label: 'x' }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await load({ slot: 'save-1' }, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await saves({ label: 'x' }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await http(server.port, 'PUT', `/api/campaigns/${CID}/saves`)).status, 405);
  assert.equal((await http(server.port, 'GET', `/api/campaigns/${CID}/load`)).status, 405);
});

test('a save is created, listed, loaded back and pushed to the board', async () => {
  const created = await saves({ label: '  Vor dem Pass  ' });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const m = created.json.save;
  assert.deepEqual([m.label, m.campaign, m.phase, m.rev], ['Vor dem Pass', CID, 'planning', state().rev]);

  const list = await get(`/api/campaigns/${CID}/saves`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.saves.map((s) => s.slot), [m.slot]);

  assert.equal((await load({ slot: 'nirgends' })).status, 404);

  // A chronicle text moves the campaign on by one revision without rolls.
  const task = cli('tasks', '--agent', 'chronicler', '--campaign', CID).json.tasks[0];
  const proposal = {
    format: 'realmcraft-proposal', version: 1, proposalId: task.respondAs.proposalId, agent: task.agent, campaign: CID,
    turn: task.turn, basedOnRev: task.rev, people: null, items: [{ type: 'narrative', refs: [], text: 'Schnee am Pass.' }],
  };
  writeFileSync(join(dir(), task.respondAs.path), JSON.stringify(proposal));
  assert.equal(cli('ingest', '--campaign', CID).code, 0);
  assert.equal(state().rev, m.rev + 1);

  const events = listen((event, data) => event === 'view' && JSON.parse(data).campaign === CID);
  // The stream is open before the load starts.
  await new Promise((r) => setTimeout(r, 300));
  const loaded = await load({ slot: m.slot });
  assert.equal(loaded.status, 200, JSON.stringify(loaded.json));
  assert.deepEqual([loaded.json.slot, loaded.json.rev, loaded.json.autosave], [m.slot, m.rev, `autosave-${m.rev + 1}`]);
  assert.equal(state().rev, m.rev);
  const seen = await events;
  assert.ok(seen.some(([e, d]) => e === 'view' && JSON.parse(d).file === 'view/bergnomaden.json'));
});

test('save and load are refused with 409 while a turn runs', async () => {
  writeFileSync(join(dir(), 'run.json'), JSON.stringify({ format: 'realmcraft-run', version: 1, campaign: CID, turn: 0, active: true }));
  try {
    const slot = (await get(`/api/campaigns/${CID}/saves`)).json.saves[0].slot;
    for (const r of [await saves({ label: 'Mitten im Zug' }), await load({ slot })]) {
      assert.equal(r.status, 409);
      assert.equal(r.json.issues[0].code, 'cli.turn_running');
    }
  } finally {
    rmSync(join(dir(), 'run.json'));
  }
});

// Campaign folder IO: atomic state writes, revision check, lock contention
// and recovery after a writer died mid-write. Crashes and contention run in
// real child processes, because a lock and a rename only mean something
// across processes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LAYOUT, LockError, ensureLayout, readCampaign, readJson, turnStem, withLock, writeJsonAtomic, writeState } from '../../../engine/harness/io.js';

const IO = pathToFileURL(fileURLToPath(new URL('../../../engine/harness/io.js', import.meta.url))).href;
const state0 = JSON.parse(readFileSync(fileURLToPath(new URL('../../fixtures/engine/campaign-turn0.json', import.meta.url)), 'utf8'));
const next = (s) => ({ ...structuredClone(s), rev: s.rev + 1 });

function tempCampaign(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rc-k2-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  ensureLayout(dir);
  return dir;
}

// Runs a module snippet in a child process; resolves on exit, `onLine` sees stdout lines.
function child(code, onLine = () => {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stdout.setEncoding('utf8').on('data', (d) => d.split('\n').filter(Boolean).forEach(onLine));
    p.stderr.setEncoding('utf8').on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('exit', (status) => resolve({ status, err }));
  });
}

test('writeState writes atomically and readCampaign loads the folder', (t) => {
  const dir = tempCampaign(t);
  assert.deepEqual(writeState(dir, state0), { ok: true, rev: 1, issues: [] });
  writeJsonAtomic(join(dir, LAYOUT.drafts, 'hochweide.json'), { people: 'hochweide' });
  writeJsonAtomic(join(dir, LAYOUT.log, `${turnStem(6)}.json`), { turn: 6 });
  writeFileSync(join(dir, LAYOUT.log, `${turnStem(7)}.json.123.abcd.tmp`), '{"half":');
  const c = readCampaign(dir);
  assert.deepEqual(c.state, state0);
  assert.deepEqual(c.library, { format: 'realmcraft-library', version: 1, entries: [] });
  assert.equal(c.worldLock, null);
  assert.deepEqual(c.drafts, { hochweide: { people: 'hochweide' } });
  assert.deepEqual(c.log, { T0006: { turn: 6 } }, 'temp files of an interrupted write are ignored');
  assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith('.')), [], 'lock released');
});

test('a schema-invalid state is not written', (t) => {
  const dir = tempCampaign(t);
  const r = writeState(dir, { ...state0, phase: 'feiern' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues.map((i) => i.code), ['schema.enum']);
  assert.equal(existsSync(join(dir, LAYOUT.state)), false);
});

test('expectRev guards against a stale writer', (t) => {
  const dir = tempCampaign(t);
  writeState(dir, state0);
  const wrongBase = writeState(dir, { ...next(state0), rev: 3 }, { expectRev: 2 });
  assert.deepEqual([wrongBase.ok, wrongBase.rev, wrongBase.issues.map((i) => i.code)], [false, 1, ['stale']]);
  assert.deepEqual(wrongBase.issues[0].params, { reason: 'rev-moved', rev: 1, expected: 2 });
  const noBump = writeState(dir, state0, { expectRev: 1 });
  assert.deepEqual([noBump.ok, noBump.issues.map((i) => i.code)], [false, ['stale']]);
  assert.deepEqual(noBump.issues[0].params, { reason: 'rev-not-next', rev: 1, expected: 2 });
  assert.equal(readJson(join(dir, LAYOUT.state)).rev, 1);
  const empty = writeState(tempCampaign(t), state0, { expectRev: 1 });
  assert.deepEqual(empty.issues[0].params, { reason: 'rev-moved', expected: 1 }, 'a missing state reports no revision');
  assert.deepEqual(writeState(dir, next(state0), { expectRev: 1 }), { ok: true, rev: 2, issues: [] });
});

test('a failure between write and rename keeps the old state and cleans up', (t) => {
  const dir = tempCampaign(t);
  writeState(dir, state0);
  assert.throws(() => writeState(dir, next(state0), { onBeforeRename: () => { throw new Error('power cut'); } }), /power cut/);
  assert.equal(readJson(join(dir, LAYOUT.state)).rev, 1);
  assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith('.tmp') || f.endsWith('.lock')), []);
});

test('a writer killed mid-write leaves the old state readable and its lock breakable', async (t) => {
  const dir = tempCampaign(t);
  writeState(dir, state0);
  const code = `
    import { writeState } from ${JSON.stringify(IO)};
    const s = JSON.parse(process.env.STATE);
    writeState(${JSON.stringify(dir)}, s, { onBeforeRename: () => process.exit(9) });`;
  process.env.STATE = JSON.stringify(next(state0));
  const { status } = await child(code);
  delete process.env.STATE;
  assert.equal(status, 9);
  const left = readdirSync(dir);
  assert.ok(left.includes('.state.lock'), 'the dead writer left its lock');
  assert.ok(left.some((f) => f.startsWith('state.json.') && f.endsWith('.tmp')), 'and its temp file');
  assert.equal(readCampaign(dir).state.rev, 1, 'state.json is the old, complete state');
  assert.deepEqual(writeState(dir, next(state0), { expectRev: 1 }), { ok: true, rev: 2, issues: [] }, 'the lock of a dead process is broken');
});

test('lock contention: a second writer waits, or gives up after its timeout', async (t) => {
  const dir = tempCampaign(t);
  writeState(dir, state0);
  const code = `
    import { withLock } from ${JSON.stringify(IO)};
    withLock(${JSON.stringify(dir)}, 'state', () => {
      console.log('locked');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
    });`;
  let release;
  const locked = new Promise((r) => { release = r; });
  const holder = child(code, (line) => line === 'locked' && release());
  await locked;
  assert.throws(() => writeState(dir, next(state0), { lock: { timeoutMs: 100 } }), (err) => err instanceof LockError && err.code === 'ELOCKED');
  const started = Date.now();
  assert.equal(writeState(dir, next(state0), { expectRev: 1, lock: { timeoutMs: 5000 } }).ok, true);
  assert.ok(Date.now() - started >= 100, 'waited for the holder');
  assert.equal((await holder).status, 0);
});

test('withLock releases on error and an old lock of a live process is broken after staleMs', (t) => {
  const dir = tempCampaign(t);
  assert.throws(() => withLock(dir, 'x', () => { throw new Error('boom'); }), /boom/);
  assert.equal(existsSync(join(dir, '.x.lock')), false);
  writeFileSync(join(dir, '.x.lock'), JSON.stringify({ pid: process.pid, at: Date.now() - 60000, token: 'old' }));
  assert.equal(withLock(dir, 'x', () => 'ran', { staleMs: 30000 }), 'ran');
});

test('an empty or unparseable lock blocks only briefly, an old one is broken', (t) => {
  const dir = tempCampaign(t);
  const path = join(dir, '.x.lock');
  const old = new Date(Date.now() - 10_000);
  for (const content of ['', '{"pid":', 'null']) {
    writeFileSync(path, content);
    assert.throws(() => withLock(dir, 'x', () => 'ran', { timeoutMs: 50 }), LockError, `a fresh lock ${JSON.stringify(content)} may belong to a writer between create and write`);
    utimesSync(path, old, old);
    assert.equal(withLock(dir, 'x', () => 'ran', { timeoutMs: 50 }), 'ran', `an old lock ${JSON.stringify(content)} is stale`);
    assert.equal(existsSync(path), false);
  }
});

test('readJson: fallback for missing files, readable errors otherwise', (t) => {
  const dir = tempCampaign(t);
  assert.equal(readJson(join(dir, 'fehlt.json'), { fallback: 7 }), 7);
  assert.throws(() => readJson(join(dir, 'fehlt.json')), /not found/);
  writeFileSync(join(dir, 'kaputt.json'), '{');
  assert.throws(() => readJson(join(dir, 'kaputt.json')), /kaputt\.json is not valid JSON/);
  writeFileSync(join(dir, 'gross.json'), JSON.stringify({ x: 'y'.repeat(100) }));
  assert.throws(() => readJson(join(dir, 'gross.json'), { maxBytes: 50 }), /exceeds 50 bytes/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validate } from '../../engine/content/schema.js';
import { SCHEMAS } from '../../engine/schemas/index.js';
import { CLI, cli, makeRoot, removeRoot } from '../fixtures/engine/k1/harness.js';

const RESET = ['reset', '--all', '--offline'];
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const reason = (result) => result.json?.issues?.[0]?.params?.reason;
function rootFor(t) { const root = makeRoot(); t.after(() => removeRoot(root)); return root; }
function put(root, name, value) { const path = join(root, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value)); }
function campaign(root, id) {
  const made = cli(root, ['new', 'hochland', '--seed', '7', '--as', 'bergnomaden', '--id', id]);
  assert.equal(made.code, 0, made.stdout + made.stderr);
  assert.equal(cli(root, ['open', '--campaign', id]).code, 0);
}
function snapshot(root, prefix = '') {
  return Object.fromEntries(readdirSync(root).sort().flatMap((name) => {
    const path = join(root, name);
    const rel = prefix + name;
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return [[rel, { link: readlinkSync(path) }]];
    return stat.isDirectory() ? [[rel + '/', null], ...Object.entries(snapshot(path, rel + '/'))] : [[rel, readFileSync(path, 'utf8')]];
  }));
}

// Every root is temporary. No owner campaigns or protected files are fixtures.
test('reset removes campaigns, snapshots and staged restore files, preserves packages and owner material, and rotates its generation', (t) => {
  const root = rootFor(t);
  for (const id of ['first-game', 'second-game']) campaign(root, id);
  const save = cli(root, ['save', '--name', 'Vor dem Winter', '--campaign', 'first-game']);
  assert.equal(save.code, 0, save.stdout);
  put(root, 'campaigns/second-game/.restore/new/state.json', '{unfinished restore');
  put(root, 'campaigns/active.json', { campaign: 'first-game' });
  for (const name of ['welten/reusable/welt.json', 'authoring/receipts/keep.json', 'design/sketch.svg', 'schwarzkaemme/keep.json', 'savegame.json']) put(root, name, 'owner fixture: keep');
  const protectedPaths = ['welten', 'authoring', 'design', 'schwarzkaemme'];
  const before = Object.fromEntries(protectedPaths.map((name) => [name, snapshot(join(root, name))]));
  const result = cli(root, RESET);
  assert.equal(result.code, 0, result.stdout);
  assert.deepEqual(result.json.deleted, ['first-game', 'second-game']);
  assert.match(result.json.generation, /^[0-9a-f]{32}$/);
  assert.deepEqual(readdirSync(join(root, 'campaigns')), ['index.json']);
  assert.deepEqual(read(join(root, 'campaigns/index.json')), { format: 'realmcraft-campaigns', version: 1, campaigns: [], generation: result.json.generation });
  assert.deepEqual(validate(SCHEMAS.campaignIndex, read(join(root, 'campaigns/index.json'))), []);
  for (const name of protectedPaths) assert.deepEqual(snapshot(join(root, name)), before[name], name);
  assert.equal(readFileSync(join(root, 'savegame.json'), 'utf8'), 'owner fixture: keep');
  const again = cli(root, RESET);
  assert.equal(again.code, 0, again.stdout);
  assert.deepEqual(again.json.deleted, []);
  assert.notEqual(again.json.generation, result.json.generation);
  campaign(root, 'first-game');
  assert.equal(read(join(root, 'campaigns/index.json')).generation, again.json.generation, 'new campaign retains reset generation');
});

test('reset can remove corrupt states and metadata without attempting normal campaign recovery', (t) => {
  const root = rootFor(t);
  campaign(root, 'corrupt-game');
  put(root, 'campaigns/corrupt-game/state.json', '{broken');
  put(root, 'campaigns/corrupt-game/.restore/new/state.json', '{broken restore');
  put(root, 'campaigns/index.json', '{broken index');
  put(root, 'campaigns/active.json', '{broken active');
  const result = cli(root, RESET);
  assert.equal(result.code, 0, result.stdout);
  assert.deepEqual(result.json.deleted, ['corrupt-game']);
  assert.deepEqual(read(join(root, 'campaigns/index.json')).campaigns, []);
});

test('reset requires both explicit confirmations and refuses other arguments before any write', (t) => {
  const root = rootFor(t);
  campaign(root, 'keep-game');
  const before = snapshot(root);
  for (const args of [['reset'], ['reset', '--all'], ['reset', '--offline'], [...RESET, '--campaign', 'keep-game'], [...RESET, 'extra'], [...RESET, '--name', 'no'], ['reset', '--all', 'false', '--offline']]) {
    const result = cli(root, args);
    assert.equal(result.code, 2, result.stdout);
    assert.equal(reason(result), 'reset-confirmation');
    assert.deepEqual(snapshot(root), before);
  }
});

test('active and unreadable run markers refuse the entire reset before any campaign is removed', (t) => {
  const root = rootFor(t);
  campaign(root, 'first-game'); campaign(root, 'last-game');
  for (const marker of [{ active: true }, '{broken', {}, null]) {
    put(root, 'campaigns/last-game/run.json', typeof marker === 'string' ? marker : JSON.stringify(marker));
    const before = snapshot(root);
    const result = cli(root, RESET);
    assert.equal(result.code, marker?.active === true ? 4 : 2, result.stdout);
    assert.equal(reason(result), marker?.active === true ? 'run-active' : 'unreadable-run');
    assert.deepEqual(snapshot(root), before);
  }
});

test('live metadata, campaign and harness locks refuse the entire reset without changing data', (t) => {
  const root = rootFor(t);
  campaign(root, 'first-game'); campaign(root, 'last-game');
  for (const rel of ['campaigns/.index.lock', 'campaigns/.active.lock', 'campaigns/last-game/.run.lock', 'campaigns/last-game/.campaign.lock', 'campaigns/last-game/.status.lock']) {
    put(root, rel, { pid: process.pid, at: Date.now(), token: 'held-for-reset-test' });
    const before = snapshot(root);
    const result = cli(root, RESET);
    assert.equal(result.code, 4, result.stdout);
    assert.equal(reason(result), 'lock-held');
    assert.deepEqual(snapshot(root), before);
    // The test releases its own fixture lock, never an owner lock.
    unlinkSync(join(root, rel));
  }
});

test('unknown campaign-storage entries and aliases refuse without deleting valid campaigns', (t) => {
  const root = rootFor(t);
  campaign(root, 'keep-game');
  put(root, 'campaigns/not-a-campaign/keep.txt', 'unknown');
  const before = snapshot(root);
  const result = cli(root, RESET);
  assert.equal(result.code, 2, result.stdout);
  assert.equal(reason(result), 'unknown-entry');
  assert.deepEqual(snapshot(root), before);
});

test('reset rejects junctions in its root, storage, campaign, nested target and metadata', (t) => {
  const parent = rootFor(t);
  const outside = join(parent, 'outside'); mkdirSync(outside);
  put(outside, 'keep.txt', 'outside fixture');
  const expected = snapshot(outside);
  for (const kind of ['root', 'storage', 'campaign', 'nested', 'metadata']) {
    const root = join(parent, kind); mkdirSync(root);
    if (kind === 'root') {
      symlinkSync(outside, join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
      const result = cli(join(root, 'alias'), RESET);
      assert.equal(result.code, 2, result.stdout); assert.equal(reason(result), 'unsafe-root');
    } else {
      if (kind !== 'storage') campaign(root, 'keep-game');
      const path = kind === 'storage' ? join(root, 'campaigns') : kind === 'campaign' ? join(root, 'campaigns/alias-game') : kind === 'nested' ? join(root, 'campaigns/keep-game/escape') : join(root, 'campaigns/active.json');
      symlinkSync(outside, path, process.platform === 'win32' ? 'junction' : 'dir');
      const before = snapshot(root);
      const result = cli(root, RESET);
      assert.equal(result.code, 2, result.stdout); assert.equal(reason(result), 'unsafe-path');
      assert.deepEqual(snapshot(root), before);
    }
    assert.deepEqual(snapshot(outside), expected);
  }
});

test('reset creates only empty campaign metadata under an absent runtime root', (t) => {
  const parent = rootFor(t);
  const root = join(parent, 'new-runtime');
  const result = spawnSync(process.execPath, [CLI, ...RESET, '--json'], { cwd: parent, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(readdirSync(root), ['campaigns']);
  assert.deepEqual(readdirSync(join(root, 'campaigns')), ['index.json']);
  assert.deepEqual(read(join(root, 'campaigns/index.json')).campaigns, []);
});

test('reset refuses aliased root spellings without touching the intended project', (t) => {
  const root = rootFor(t);
  campaign(root, 'keep-game');
  const before = snapshot(root);
  const result = spawnSync(process.execPath, [CLI, ...RESET, '--json'], { cwd: root, env: { ...process.env, REALMCRAFT_ROOT: root + '.' }, encoding: 'utf8' });
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).issues[0].params.reason, 'unsafe-root');
  assert.deepEqual(snapshot(root), before);
});

test('a partially removed campaign remains retryable and unlisted unknown folders still refuse', (t) => {
  const root = rootFor(t);
  for (const id of ['first-game', 'partial-game', 'third-game']) campaign(root, id);
  const script = [
    'import fs from "node:fs";',
    'import { join } from "node:path";',
    'import { pathToFileURL } from "node:url";',
    'import { syncBuiltinESMExports } from "node:module";',
    'const [entry, root] = process.argv.slice(1);',
    'const target = join(root, "campaigns", "partial-game");',
    'const original = fs.rmSync;',
    'fs.rmSync = (path, options) => {',
    '  if (path !== target) return original(path, options);',
    '  fs.unlinkSync(join(target, "state.json"));',
    '  fs.unlinkSync(join(target, "world.lock.json"));',
    '  throw Object.assign(new Error("simulated partial filesystem removal"), { code: "EACCES" });',
    '};',
    'syncBuiltinESMExports();',
    'process.argv = [process.execPath, entry, "reset", "--all", "--offline", "--json"];',
    'await import(pathToFileURL(entry));',
  ].join('\n');
  const interrupted = spawnSync(process.execPath, ['--input-type=module', '-e', script, CLI, root], { cwd: root, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8' });
  assert.equal(interrupted.status, 1, interrupted.stdout + interrupted.stderr);
  const result = JSON.parse(interrupted.stdout);
  assert.equal(result.issues[0].params.reason, 'reset-incomplete');
  assert.deepEqual(result.deleted, ['first-game']);
  assert.deepEqual(result.remaining, ['partial-game', 'third-game']);
  assert.ok(!existsSync(join(root, 'campaigns/partial-game/state.json')));
  assert.ok(!existsSync(join(root, 'campaigns/partial-game/world.lock.json')));
  const index = read(join(root, 'campaigns/index.json'));
  assert.equal(index.generation, result.generation);
  assert.deepEqual(index.resetPending, ['first-game', 'partial-game', 'third-game']);
  assert.deepEqual(validate(SCHEMAS.campaignIndex, index), []);
  put(root, 'campaigns/unlisted-game/keep.txt', 'unlisted unknown directory');
  const before = snapshot(root);
  const refused = cli(root, RESET);
  assert.equal(refused.code, 2, refused.stdout);
  assert.equal(reason(refused), 'unknown-entry');
  assert.deepEqual(snapshot(root), before);
  rmSync(join(root, 'campaigns/unlisted-game'), { recursive: true });
  const retried = cli(root, RESET);
  assert.equal(retried.code, 0, retried.stdout);
  assert.deepEqual(retried.json.deleted, ['partial-game', 'third-game']);
  assert.deepEqual(read(join(root, 'campaigns/index.json')), { format: 'realmcraft-campaigns', version: 1, campaigns: [], generation: retried.json.generation });
  assert.deepEqual(readdirSync(join(root, 'campaigns')), ['index.json']);
});

test('invalid or unknown maintenance fields cannot authorize an unknown directory', (t) => {
  const root = rootFor(t);
  put(root, 'campaigns/partial-game/keep.txt', 'layout is missing');
  const canonical = { format: 'realmcraft-campaigns', version: 1, campaigns: [], generation: '0'.repeat(32), resetPending: ['partial-game'] };
  for (const changes of [
    { resetPending: ['partial-game', '../escape'] },
    { resetPending: ['partial-game', 'partial-game'] },
    { resetPending: ['partial-game', 'Uppercase'] },
    { resetPending: 'partial-game' },
    { generation: 'invalid' },
    { unrelated: true },
    { campaigns: [{ id: 'partial-game' }] },
  ]) {
    put(root, 'campaigns/index.json', { ...canonical, ...changes });
    const before = snapshot(root);
    const refused = cli(root, RESET);
    assert.equal(refused.code, 2, refused.stdout);
    assert.equal(reason(refused), 'unknown-entry');
    assert.deepEqual(snapshot(root), before);
  }
});

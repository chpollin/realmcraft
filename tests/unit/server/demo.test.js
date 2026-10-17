import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, startServer, http } from '../../lib/server.mjs';

test('offline continuation is opt-in, phase/revision guarded, serialized and does not roll for the player', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rc-demo-test-'));
  let server;
  const cli = (...args) => JSON.parse(execFileSync(process.execPath, ['engine/cli.mjs', ...args, '--campaign', 'demo-1', '--json'],
    { cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8' }));
  const state = () => JSON.parse(readFileSync(join(root, 'campaigns/demo-1/state.json'), 'utf8'));
  const post = (body, headers = {}) => http(server.port, 'POST', '/api/campaigns/demo-1/demo-turn', {
    headers: { 'Content-Type': 'application/json', ...headers }, body });
  try {
    cli('new', 'hochland', '--seed', '7', '--as', 'bergnomaden', '--id', 'demo-1');
    server = await startServer(root);
    assert.equal((await http(server.port, 'GET', '/api/app')).json.demo, false);
    assert.equal((await post({ turn: state().turn, rev: state().rev })).status, 404);
    await server.stop();
    server = await startServer(root, { demo: true });
    assert.equal((await http(server.port, 'GET', '/api/app')).json.demo, true);
    cli('open');
    let before = state();
    assert.equal((await post({ turn: before.turn, rev: before.rev })).status, 409);
    assert.deepEqual(state(), before);
    const refused = spawnSync(process.execPath, ['tools/harness/dryrun.mjs', '--campaign', 'demo-1', '--root', root,
      '--fixtures', join(root, 'no-templates'), '--sealed-only', '--expect-turn', String(before.turn), '--expect-rev', String(before.rev)], { cwd: REPO });
    assert.equal(refused.status, 1);
    assert.deepEqual(state(), before, 'child guard never rolls or seals an unsealed plan');
    assert.equal((await post({ turn: before.turn, rev: before.rev }, { Origin: 'https://example.org' })).status, 403);
    assert.equal((await post({ turn: before.turn, rev: before.rev, roll: 10 })).status, 400);
    cli('roll', cli('status').probes[0], '6');
    cli('seal');
    before = state();
    assert.equal((await post({ turn: before.turn, rev: before.rev - 1 })).status, 409);
    execFileSync(process.execPath, ['tools/harness/run-marker.mjs', 'start', '--campaign', 'demo-1', '--root', root], { cwd: REPO });
    assert.equal((await post({ turn: before.turn, rev: before.rev })).status, 409);
    execFileSync(process.execPath, ['tools/harness/run-marker.mjs', 'end', '--campaign', 'demo-1', '--root', root], { cwd: REPO });
    const responses = await Promise.all([post({ turn: before.turn, rev: before.rev }), post({ turn: before.turn, rev: before.rev })]);
    assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
    assert.equal(responses.find((r) => r.status === 200).json.mode, 'kernel-fallback');
    assert.equal(state().turn, before.turn + 1);
    assert.equal(state().phase, 'planning');
    assert.equal((await post({ turn: before.turn, rev: before.rev })).status, 409);
  } finally { await server?.stop(); rmSync(root, { recursive: true, force: true }); }
});

test('an absent campaign root does not abort ordinary server startup or enable the demo', async () => {
  const root = mkdtempSync(join(tmpdir(), 'rc-demo-missing-'));
  let server;
  try {
    for (const demo of [false, true]) {
      server = await startServer(join(root, 'absent'), { demo });
      assert.equal((await http(server.port, 'GET', '/api/app')).json.demo, false);
      await server.stop();
    }
  } finally { await server?.stop(); rmSync(root, { recursive: true, force: true }); }
});

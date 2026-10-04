// Static handler and Host check of the dev server against a real serve.mjs
// with an empty campaign root, so the test never sees the owner's campaigns.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { http, startServer } from '../../fixtures/server.mjs';

let server;
let root;

// Raw paths, so %5C and %2f arrive as written.
const status = async (path, headers) => (await http(server.port, 'GET', path, { headers })).status;

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-static-'));
  server = await startServer(root);
});

after(() => {
  server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

test('a plain file is served', async () => {
  assert.equal(await status('/index.html'), 200);
});

test('backslash-encoded dotfiles are not served', async () => {
  // .git exists in every checkout, .env only on the owner's machines.
  for (const p of ['/%5C.env', '/%5C.git/config', '/%5c.git%5cconfig']) {
    assert.ok([403, 404].includes(await status(p)), p);
  }
});

test('path traversal is refused', async () => {
  for (const p of ['/..%2f', '/..%2fpackage.json', '/js/..%5c..%5c..%5cWindows%5cwin.ini']) {
    assert.ok([403, 404].includes(await status(p)), p);
  }
});

test('no route hands .env values to the browser', async () => {
  assert.equal(await status('/env.js'), 404);
});

test('a foreign Host header is refused (DNS rebinding)', async () => {
  assert.equal(await status('/index.html', { Host: `evil.example:${server.port}` }), 403);
  assert.equal(await status('/savegame.json', { Host: 'evil.example' }), 403);
  assert.equal(await status('/index.html', { Host: `127.0.0.1:${server.port}` }), 200);
});

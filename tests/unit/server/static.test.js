// Static handler and Host check of the dev server against a real serve.mjs
// with an empty campaign root, so the test never sees the owner's campaigns.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { http, startServer } from '../../lib/server.mjs';

let server;
let root;

// Raw paths, so %5C and %2f arrive as written.
const status = async (path, headers) => (await http(server.port, 'GET', path, { headers })).status;

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-static-'));
  server = await startServer(root);
});

after(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

test('a plain file is served', async () => {
  assert.equal(await status('/index.html'), 200);
});

test('only index.html and the folders of the board are served', async () => {
  for (const p of ['/', '/spielbrett/', '/engine/core/turn.js', '/welten/hochland/welt.json', '/fonts/inter-latin.woff2']) {
    assert.equal(await status(p), 200, p);
  }
  // savegame.json exists only on the owner's machines, package.json always.
  // No route hands .env values to the browser, so /env.js answers 404 as well.
  for (const p of ['/savegame.json', '/package.json', '/serve.mjs', '/server/config.mjs', '/tools/check.mjs', '/knowledge/INDEX.md', '/tests/lib/server.mjs', '/env.js']) {
    assert.equal(await status(p), 404, p);
  }
});

test('backslash-encoded dotfiles are not served', async () => {
  // .git exists in every checkout, .env only on the owner's machines.
  for (const p of ['/%5C.env', '/%5C.git/config', '/%5c.git%5cconfig']) {
    assert.ok([403, 404].includes(await status(p)), p);
  }
});

test('path traversal is refused', async () => {
  for (const p of ['/..%2f', '/..%2fpackage.json', '/js/..%5c..%5c..%5cWindows%5cwin.ini', '/spielbrett/..%2fpackage.json', '/spielbrett%5c..%5cpackage.json']) {
    assert.ok([403, 404].includes(await status(p)), p);
  }
});

test('a foreign Host header is refused (DNS rebinding)', async () => {
  assert.equal(await status('/index.html', { Host: `evil.example:${server.port}` }), 403);
  assert.equal(await status('/savegame.json', { Host: 'evil.example' }), 403);
  assert.equal(await status('/index.html', { Host: `127.0.0.1:${server.port}` }), 200);
});

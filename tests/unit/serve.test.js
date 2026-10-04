// tests/unit/serve.test.js — Zugriffsschutz des Dev-Servers gegen einen echten
// Prozess auf freiem Port (nie die Ports des Betreibers) und mit leerem
// REALMCRAFT_ROOT, damit der Test die echten Partien nie sieht.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { http, startServer } from '../lib/server.mjs';

let server;
let tempRoot;

// Roher Pfad ohne Normalisierung durch fetch/URL, damit %5C und %2f so ankommen.
const get = async (path, headers) => (await http(server.port, 'GET', path, { headers })).status;

before(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'rc-serve-'));
  server = await startServer(tempRoot);
});

after(async () => {
  await server?.stop();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('normale Datei wird ausgeliefert', async () => {
  assert.equal(await get('/index.html'), 200);
});

test('nur index.html und die Ordner des Spielbretts werden ausgeliefert', async () => {
  for (const p of ['/', '/spielbrett/', '/engine/core/turn.js', '/welten/hochland/welt.json', '/fonts/inter-latin.woff2']) {
    assert.equal(await get(p), 200, p);
  }
  // savegame.json gibt es nur auf Betreiber-Maschinen, package.json immer.
  for (const p of ['/savegame.json', '/package.json', '/serve.mjs', '/server/config.mjs', '/tools/check.mjs', '/knowledge/INDEX.md', '/tests/lib/server.mjs', '/env.js']) {
    assert.equal(await get(p), 404, p);
  }
});

test('Backslash-kodierte Punktdateien werden nicht ausgeliefert', async () => {
  // .git/config existiert im Repo immer; .env nur auf Betreiber-Maschinen.
  for (const p of ['/%5C.env', '/%5C.git/config', '/%5c.git%5cconfig']) {
    assert.ok([403, 404].includes(await get(p)), p);
  }
});

test('Pfad-Traversal wird abgewiesen', async () => {
  for (const p of ['/..%2f', '/..%2fpackage.json', '/js/..%5c..%5c..%5cWindows%5cwin.ini', '/spielbrett/..%2fpackage.json', '/spielbrett%5c..%5cpackage.json']) {
    assert.ok([403, 404].includes(await get(p)), p);
  }
});

test('fremder Host-Header wird abgewiesen (DNS-Rebinding)', async () => {
  assert.equal(await get('/index.html', { Host: `evil.example:${server.port}` }), 403);
  assert.equal(await get('/savegame.json', { Host: 'evil.example' }), 403);
  assert.equal(await get('/index.html', { Host: `127.0.0.1:${server.port}` }), 200);
});

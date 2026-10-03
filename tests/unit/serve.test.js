// tests/unit/serve.test.js — Zugriffsschutz des Dev-Servers gegen einen echten
// Prozess auf freiem Port (nie die Ports des Betreibers) und mit leerem
// REALMCRAFT_ROOT, damit der Test die echten Partien nie sieht.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
let proc;
let port;
let tempRoot;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port: p } = srv.address();
      srv.close(() => resolve(p));
    });
  });
}

// Roher Pfad ohne Normalisierung durch fetch/URL, damit %5C und %2f so ankommen.
function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: 'GET', headers: { Host: `localhost:${port}`, ...headers } },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

before(async () => {
  port = await freePort();
  tempRoot = mkdtempSync(join(tmpdir(), 'rc-serve-'));
  proc = spawn(process.execPath, ['serve.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', REALMCRAFT_ROOT: tempRoot },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    proc.once('exit', (code) => reject(new Error(`serve.mjs beendet (${code})`)));
    proc.stdout.on('data', (d) => {
      if (String(d).includes('dev server')) resolve();
    });
  });
});

after(() => {
  proc?.kill();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('normale Datei wird ausgeliefert', async () => {
  assert.equal(await get('/index.html'), 200);
});

test('Backslash-kodierte Punktdateien werden nicht ausgeliefert', async () => {
  // .git/config existiert im Repo immer; .env nur auf Betreiber-Maschinen.
  for (const p of ['/%5C.env', '/%5C.git/config', '/%5c.git%5cconfig']) {
    assert.ok([403, 404].includes(await get(p)), p);
  }
});

test('Pfad-Traversal wird abgewiesen', async () => {
  for (const p of ['/..%2f', '/..%2fpackage.json', '/js/..%5c..%5c..%5cWindows%5cwin.ini']) {
    assert.ok([403, 404].includes(await get(p)), p);
  }
});

test('/env.js nur same-origin oder ohne Fetch-Metadaten', async () => {
  assert.equal(await get('/env.js', { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Dest': 'script' }), 403);
  assert.equal(await get('/env.js', { 'Sec-Fetch-Site': 'same-site' }), 403);
  assert.equal(await get('/env.js', { 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Dest': 'script' }), 200);
  assert.equal(await get('/env.js'), 200);
});

test('fremder Host-Header wird abgewiesen (DNS-Rebinding)', async () => {
  assert.equal(await get('/index.html', { Host: `evil.example:${port}` }), 403);
  assert.equal(await get('/savegame.json', { Host: 'evil.example' }), 403);
  assert.equal(await get('/index.html', { Host: `127.0.0.1:${port}` }), 200);
});

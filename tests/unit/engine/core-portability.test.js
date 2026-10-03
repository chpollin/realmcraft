// The kernel must load in the browser: no node: imports, no Node globals and
// no hidden randomness outside engine/harness/ and engine/cli.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIRS = ['engine/core', 'engine/modules', 'engine/ai', 'engine/world', 'engine/content', 'engine/schemas'];

function files(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

const sources = DIRS.flatMap(files).map((f) => ({ file: relative(ROOT, join(ROOT, f)).replaceAll('\\', '/'), text: readFileSync(join(ROOT, f), 'utf8') }));
// Comments may name forbidden things to explain why they are absent.
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

test('browser modules exist to check', () => {
  assert.ok(sources.length > 20);
});

test('no node: imports or Node-only globals outside harness and cli', () => {
  for (const { file, text } of sources) {
    const c = code(text);
    assert.doesNotMatch(c, /from\s+['"]node:/, `${file} imports a node: module`);
    assert.doesNotMatch(c, /import\(\s*['"]node:/, `${file} imports a node: module dynamically`);
    assert.doesNotMatch(c, /\brequire\s*\(/, `${file} uses require`);
    assert.doesNotMatch(c, /\bprocess\.|\bBuffer\b|__dirname/, `${file} uses a Node global`);
  }
});

test('no Math.random or Date in rules modules', () => {
  for (const { file, text } of sources.filter((s) => /engine\/(core|modules|ai)\//.test(s.file))) {
    const c = code(text);
    assert.doesNotMatch(c, /Math\.random/, `${file} uses Math.random`);
    assert.doesNotMatch(c, /\bDate\b/, `${file} uses Date`);
  }
});

test('every kernel module loads without Node built-ins', async () => {
  for (const { file } of sources.filter((s) => /engine\/(core|modules|ai)\//.test(s.file))) {
    await import(new URL(`../../../${file}`, import.meta.url));
  }
});

test('every kernel module loads as the first import of a fresh process (no import cycle)', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const { file } of sources.filter((s) => /engine\/(core|modules|ai)\//.test(s.file))) {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(`./${file}`)});`], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, `${file}: ${r.stderr.split('\n').slice(0, 4).join(' ')}`);
  }
});

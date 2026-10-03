// Prompt, person selection, manifest merge and key lookup of the portrait tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO, mergeManifest, persons, portraitPrompt, readApiKey } from '../../tools/portraits/generate.mjs';

const VIEW = join(REPO, 'tests', 'fixtures', 'spielbrett', 'view-hochland-t0.json');
const view = JSON.parse(readFileSync(VIEW, 'utf8'));
const style = JSON.parse(readFileSync(join(REPO, 'welten', 'hochland', 'style.json'), 'utf8'));
const labels = JSON.parse(readFileSync(join(REPO, 'welten', 'hochland', 'labels.json'), 'utf8')).labels;

test('persons: council members with appearance, unsafe ids skipped', () => {
  const ids = persons(view).map((p) => p.id);
  assert.deepEqual(ids, view.peoples.bergnomaden.council.filter((m) => m.appearance).map((m) => m.id));
  const bad = { peoples: { x: { council: [{ id: '../evil', name: 'A', appearance: 'b' }, { id: 'ok', name: 'B' }] } } };
  assert.deepEqual(persons(bad), []);
});

test('portraitPrompt: world medium first, role label, appearance, negatives last', () => {
  const p = persons(view).find((m) => m.id === 'ulrun');
  const prompt = portraitPrompt(p, style, labels);
  assert.ok(prompt.startsWith(style.image.base.replace(/\.$/, '')));
  assert.ok(prompt.includes(`${p.name}, ${labels[`role.${p.role}`]}`));
  assert.ok(prompt.includes(p.appearance));
  assert.ok(prompt.endsWith(style.image.negative));
  assert.ok(!prompt.includes('..'));
});

test('mergeManifest: replaces the same id, keeps others, sorted', () => {
  const list = [{ id: 'torhild', file: 'torhild.webp' }, { id: 'asgra', file: 'old.webp' }];
  assert.deepEqual(mergeManifest(list, { id: 'asgra', file: 'asgra.webp' }), [
    { id: 'asgra', file: 'asgra.webp' },
    { id: 'torhild', file: 'torhild.webp' },
  ]);
  assert.deepEqual(mergeManifest(null, { id: 'a', file: 'a.webp' }), [{ id: 'a', file: 'a.webp' }]);
});

test('readApiKey: environment first, else the .env line, else empty', async () => {
  const saved = process.env.GEMINI_API_KEY;
  const root = mkdtempSync(join(tmpdir(), 'rc-portrait-key-'));
  try {
    delete process.env.GEMINI_API_KEY;
    assert.equal(await readApiKey(root), '');
    writeFileSync(join(root, '.env'), '# GEMINI_API_KEY=commented\nGEMINI_API_KEY="from-file"\n');
    assert.equal(await readApiKey(root), 'from-file');
    process.env.GEMINI_API_KEY = ' from-env ';
    assert.equal(await readApiKey(root), 'from-env');
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
    rmSync(root, { recursive: true, force: true });
  }
});

test('dry run prints the prompts without a key and writes nothing', () => {
  const manifest = join(REPO, 'spielbrett', 'assets', 'portraits', 'manifest.json');
  const before = readFileSync(manifest, 'utf8');
  const env = { ...process.env };
  delete env.GEMINI_API_KEY;
  const r = spawnSync(process.execPath, [join(REPO, 'tools', 'portraits', 'generate.mjs'), VIEW, '--dry-run', '--only', 'ulrun', '--force'], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^ulrun \[2:3\]/);
  assert.equal(readFileSync(manifest, 'utf8'), before);
});

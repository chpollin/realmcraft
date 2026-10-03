// Regenerates the Spielbrett fixtures through the kernel CLI, the only writer
// of campaign state: a Hochland campaign (seed 7) is created in a temporary
// root, opened for planning, and the player's projection is copied here.
//   node tests/fixtures/spielbrett/build.mjs

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const HERE = fileURLToPath(new URL('.', import.meta.url));

/** Creates campaign `cid` (Hochland, seed 7) under `root` and opens turn 0 for planning. */
export function createHochland(root, cid = 'hochland-t0') {
  const run = (...args) => execFileSync(process.execPath, ['engine/cli.mjs', ...args, '--json'], { cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8' });
  run('new', 'hochland', '--seed', '7', '--id', cid);
  run('open', '--campaign', cid);
  return join(root, 'campaigns', cid);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = mkdtempSync(join(tmpdir(), 'rc-spielbrett-'));
  try {
    const dir = createHochland(root);
    copyFileSync(join(dir, 'view', 'bergnomaden.json'), join(HERE, 'view-hochland-t0.json'));
    console.log('view-hochland-t0.json written');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

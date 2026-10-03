// Regenerates the event fixtures of the Spielbrett through the kernel CLI: a
// Hochland campaign plays empty turns with chosen world-event rolls, and the
// player's projection and event logs of the resolved turns are copied here.
//   node tests/fixtures/spielbrett/build-events.mjs

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHochland } from './build.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const HERE = fileURLToPath(new URL('.', import.meta.url));
const PEOPLE = 'bergnomaden';
const stem = (turn) => `T${String(turn).padStart(4, '0')}`;

/**
 * Plays one empty turn per roll (the player's world-event roll, d10): roll,
 * seal, apply, open. Returns the campaign directory after the last turn.
 */
export function playTurns(root, cid, rolls) {
  const dir = createHochland(root, cid);
  const run = (...args) => execFileSync(process.execPath, ['engine/cli.mjs', ...args, '--campaign', cid, '--json'], { cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8' });
  rolls.forEach((roll, turn) => {
    run('roll', `T${turn}:${PEOPLE}:event`, String(roll));
    run('seal');
    run('apply');
    run('open');
  });
  return dir;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // Roll 4 draws Ueberfall (a decision), roll 10 draws Salzfund (a plain gain), both in the opening spring.
  // The second season closes the unanswered Ueberfall (first option) and draws Streit im Rat.
  const cases = { ueberfall: [4], salzfund: [10], ratsstreit: [4, 6] };
  for (const [name, rolls] of Object.entries(cases)) {
    const root = mkdtempSync(join(tmpdir(), 'rc-ereignisse-'));
    try {
      const dir = playTurns(root, `ev-${name}`, rolls);
      const last = rolls.length - 1;
      copyFileSync(join(dir, 'view', `${PEOPLE}.json`), join(HERE, `view-hochland-${name}-t${rolls.length}.json`));
      const log = join(dir, 'view', PEOPLE, 'events', `${stem(last)}.json`);
      if (existsSync(log)) copyFileSync(log, join(HERE, `events-hochland-${name}-t${last}.json`));
      console.log(`${name} fixtures written`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
}

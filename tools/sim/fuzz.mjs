#!/usr/bin/env node
// Long fuzz sweep: the property tests of tests/unit/sim/fuzz-*.test.js
// with FUZZ_RUNS times the default case count, over one or more seeds.
//
//   node tools/sim/fuzz.mjs [--runs <n>] [--seeds 1,2,3]
//
// The default unit run (npm run test:unit) uses FUZZ_RUNS 1 and seed 1.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = ['fuzz-content.test.js', 'fuzz-kernel.test.js'].map((f) => resolve(REPO, 'tests', 'unit', 'sim', f));

let runs = '20';
let seeds = ['1', '2', '3'];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--runs' && /^\d+$/.test(argv[i + 1] ?? '')) runs = argv[++i];
  else if (argv[i] === '--seeds' && /^[\w,-]+$/.test(argv[i + 1] ?? '')) seeds = argv[++i].split(',');
  else {
    process.stderr.write(`usage: node tools/sim/fuzz.mjs [--runs <n>] [--seeds 1,2,3]\n`);
    process.exit(2);
  }
}

let failed = false;
for (const seed of seeds) {
  process.stdout.write(`FUZZ_SEED=${seed} FUZZ_RUNS=${runs}\n`);
  const r = spawnSync(process.execPath, ['--test', ...FILES], { cwd: REPO, stdio: 'inherit', env: { ...process.env, FUZZ_SEED: seed, FUZZ_RUNS: runs } });
  if (r.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);

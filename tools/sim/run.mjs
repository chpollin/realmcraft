#!/usr/bin/env node
// Balance simulation from the command line.
//
//   node tools/sim/run.mjs [--world <dir>] [--seeds <n> | --seed-list 1,2,3] [--first-seed <n>]
//                          [--seasons <n>] [--as <template>] [--no-rotate]
//                          [--player-profile <id|none>] [--out <file>]
//
// Without --as the player template rotates over the seeds, so every people of
// the package plays the player's seat in some runs. The report goes to --out
// or to stdout; a short summary of the findings goes to stderr.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld, runSimulation } from './simulate.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function parse(argv) {
  const a = { world: resolve(REPO, 'welten', 'hochland'), seeds: 12, firstSeed: 1, seedList: null, seasons: 40, as: null, rotate: true, playerProfile: undefined, out: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${k} needs a value`);
      return x;
    };
    const int = (lo, hi) => {
      const x = v();
      if (!/^-?\d+$/.test(x) || Number(x) < lo || Number(x) > hi) throw new Error(`${k} must be an integer in ${lo}..${hi}`);
      return Number(x);
    };
    if (k === '--world') a.world = resolve(v());
    else if (k === '--seeds') a.seeds = int(1, 10000);
    else if (k === '--first-seed') a.firstSeed = int(0, 2 ** 31);
    else if (k === '--seed-list') a.seedList = v().split(',').map((s) => {
      if (!/^\d+$/.test(s)) throw new Error('--seed-list takes comma-separated integers');
      return Number(s);
    });
    else if (k === '--seasons') a.seasons = int(1, 1000);
    else if (k === '--as') a.as = v();
    else if (k === '--no-rotate') a.rotate = false;
    else if (k === '--player-profile') { const p = v(); a.playerProfile = p === 'none' ? null : p; }
    else if (k === '--out') a.out = resolve(v());
    else throw new Error(`unknown argument ${k}`);
  }
  return a;
}

let args;
try {
  args = parse(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`${err.message}\n`);
  process.exit(2);
}

const env = loadWorld(args.world);
if (args.as && !env.regeln.peopleTemplates.some((t) => t.id === args.as)) {
  process.stderr.write(`no people template ${args.as} in ${args.world}\n`);
  process.exit(2);
}
if (args.playerProfile && !(env.regeln.aiProfiles ?? []).some((p) => p.id === args.playerProfile)) {
  process.stderr.write(`no ai profile ${args.playerProfile} in ${args.world}\n`);
  process.exit(2);
}
const seeds = args.seedList ?? Array.from({ length: args.seeds }, (_, i) => args.firstSeed + i);
const report = runSimulation(env, { seeds, seasons: args.seasons, rotate: args.rotate, as: args.as, playerProfile: args.playerProfile });
const text = `${JSON.stringify(report, null, 2)}\n`;
if (args.out) {
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, text);
} else process.stdout.write(text);

process.stderr.write(`outcomes ${JSON.stringify(report.outcomes)}\n`);
for (const f of report.findings) process.stderr.write(`${f.people ?? '-'} ${f.kind} ${f.resource ?? f.ref ?? f.order ?? f.issue ?? ''} ${JSON.stringify(f.evidence)}\n`);
if (report.failures.length) process.exitCode = 1;

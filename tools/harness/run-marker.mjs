// Run marker campaigns/<cid>/run.json of one /zug execution. While it is
// active, the SubagentStart and SubagentStop hooks record RealmCraft agents
// in status.json of that campaign. The Agentenvertrag foresees
// `node engine/cli.mjs run start|end` for this; until the CLI offers it, this
// helper writes the same file under the io.js lock.
//
//   node tools/harness/run-marker.mjs start|end|show [--campaign <cid>] [--root <dir>]
//
// start: { format, version, campaign, turn, active: true, startedAt, endedAt: null, agents: {}, bound: {} }
// agents maps agent ids to status steps, bound to the proposal id an agent
// is held to (both written by tools/hooks/subagent-status.mjs).
// end:   active false, endedAt set. Both print the marker as JSON.

import { campaignFromArgs, parseArgs, readJsonFile } from './lib.mjs';
import { withLock, writeJsonAtomic } from '../../engine/harness/io.js';
import { reconcileStatus } from './reconcile.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
const cmd = pos[0];
if (!['start', 'end', 'show'].includes(cmd)) {
  process.stderr.write('usage: run-marker.mjs start|end|show [--campaign <cid>] [--root <dir>]\n');
  process.exit(2);
}
const { cid, dir, state } = campaignFromArgs(opt, 'run-marker');

const path = `${dir}/run.json`;
const marker = withLock(dir, 'run', () => {
  const cur = readJsonFile(path, null);
  if (cmd === 'show') return cur;
  const now = new Date().toISOString();
  const next = cmd === 'start'
    ? { format: 'realmcraft-run', version: 1, campaign: cid, turn: state.turn, active: true, startedAt: now, endedAt: null, agents: {}, bound: {} }
    : { ...(cur ?? { format: 'realmcraft-run', version: 1, campaign: cid, turn: state.turn, startedAt: now, agents: {} }), active: false, endedAt: now };
  writeJsonAtomic(path, next);
  return next;
});
// The end of a run is the last moment the status view hears of it, so it
// follows the files once more (phase after open, steps of agents whose stop
// event was not attributed).
if (cmd === 'end') {
  try {
    await reconcileStatus(dir);
  } catch {
    // status.json is a view; the marker is written either way
  }
}
process.stdout.write(`${JSON.stringify(marker, null, 2)}\n`);

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

import { activeCampaign, normPath, parseArgs, readJsonFile, rootDir } from './lib.mjs';
import { withLock, writeJsonAtomic } from '../../engine/harness/io.js';

const { pos, opt } = parseArgs(process.argv.slice(2));
const cmd = pos[0];
if (!['start', 'end', 'show'].includes(cmd)) {
  process.stderr.write('usage: run-marker.mjs start|end|show [--campaign <cid>] [--root <dir>]\n');
  process.exit(2);
}
const root = opt.root ? normPath(opt.root) : rootDir();
const cid = typeof opt.campaign === 'string' ? opt.campaign : activeCampaign(root)?.cid;
const dir = cid ? `${root}/campaigns/${cid}` : null;
const state = dir ? readJsonFile(`${dir}/state.json`, null) : null;
if (!state) {
  process.stderr.write(`run-marker: no campaign found (${cid ?? 'none'}) under ${root}/campaigns\n`);
  process.exit(3);
}

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
process.stdout.write(`${JSON.stringify(marker, null, 2)}\n`);

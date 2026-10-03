// Status entries of /zug in campaigns/<cid>/status.json, through
// engine/harness/status.js (lock, atomic rename, schema check). The
// Agentenvertrag foresees `node engine/cli.mjs status-note`; this helper is
// the same write without a kernel process.
//
//   node tools/harness/status-note.mjs init [--campaign <cid>]
//   node tools/harness/status-note.mjs plan [--campaign <cid>]
//   node tools/harness/status-note.mjs step <stepId> <waiting|running|done|failed> [--agent <id>] [--summary <text>]
//
// init starts the status of the current turn (kept when it exists). plan adds
// a waiting step for every task of the current or previous turn whose
// proposal has not been written yet. Prints the resulting status as JSON.

import { activeCampaign, normPath, parseArgs, proposalLocation, readJsonFile, rootDir, stepIdOf, listTasks } from './lib.mjs';
import { initTurnStatus, updateStep } from '../../engine/harness/status.js';

const { pos, opt } = parseArgs(process.argv.slice(2));
const root = opt.root ? normPath(opt.root) : rootDir();
const cid = typeof opt.campaign === 'string' ? opt.campaign : activeCampaign(root)?.cid;
const dir = cid ? `${root}/campaigns/${cid}` : null;
const state = dir ? readJsonFile(`${dir}/state.json`, null) : null;
if (!state) {
  process.stderr.write(`status-note: no campaign found (${cid ?? 'none'}) under ${root}/campaigns\n`);
  process.exit(3);
}

const ensure = () => {
  const cur = readJsonFile(`${dir}/status.json`, null);
  if (cur) return cur;
  const r = initTurnStatus(dir, state.turn, { campaign: cid, phase: state.phase });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.status;
};

function check(r) {
  if (!r.ok) {
    process.stderr.write(`${JSON.stringify(r.issues)}\n`);
    process.exit(2);
  }
  return r.status;
}

let out;
switch (pos[0]) {
  case 'init': {
    const r = initTurnStatus(dir, state.turn, { campaign: cid, phase: state.phase });
    out = check(r);
    break;
  }
  case 'plan': {
    out = ensure();
    const tasks = listTasks(dir).filter((t) => t.turn === state.turn || t.turn === state.turn - 1);
    for (const t of tasks) {
      if (proposalLocation(dir, t.respondAs.proposalId)) continue;
      const id = stepIdOf(t);
      if (out.steps.some((s) => s.id === id)) continue;
      out = check(updateStep(dir, { id, agent: t.agent, state: 'waiting' }));
    }
    break;
  }
  case 'step': {
    const [, id, st] = pos;
    if (!id || !['waiting', 'running', 'done', 'failed'].includes(st)) {
      process.stderr.write('usage: status-note.mjs step <stepId> <waiting|running|done|failed> [--agent <id>] [--summary <text>]\n');
      process.exit(2);
    }
    ensure();
    const agent = typeof opt.agent === 'string' ? opt.agent : (id.match(/^(judge-[a-z]+|[a-z]+)/)?.[1] ?? 'kernel');
    out = check(updateStep(dir, { id, agent, state: st, summary: typeof opt.summary === 'string' ? opt.summary : undefined }));
    break;
  }
  default:
    process.stderr.write('usage: status-note.mjs init|plan|step ... [--campaign <cid>]\n');
    process.exit(2);
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);

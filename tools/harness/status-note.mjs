// Status entries of /zug in campaigns/<cid>/status.json, through
// engine/harness/status.js (lock, atomic rename, schema check), without a
// kernel process.
//
//   node tools/harness/status-note.mjs init [--campaign <cid>]
//   node tools/harness/status-note.mjs plan [--campaign <cid>]
//   node tools/harness/status-note.mjs step <stepId> <waiting|running|done|failed> [--agent <id>] [--summary <text>]
//   node tools/harness/status-note.mjs sync [--campaign <cid>]
//
// init starts the status of the current turn (kept when it exists). plan adds
// a waiting step for every task of the current or previous turn whose
// proposal has not been written yet. sync lets the status follow the files
// (tools/harness/reconcile.mjs): phase from state.json, done where a proposal
// exists, failed where the phase has moved past a task without one; /zug runs
// it after open. Prints the resulting status as JSON.

import { campaignFromArgs, parseArgs, proposalLocation, readJsonFile, stepIdOf, listTasks } from './lib.mjs';
import { initTurnStatus, updateStep } from '../../engine/harness/status.js';
import { reconcileStatus } from './reconcile.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2));
const { cid, dir, state } = campaignFromArgs(opt, 'status-note');

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
  case 'sync': {
    out = await reconcileStatus(dir);
    if (!out) {
      process.stderr.write(`status-note: status of ${cid} could not be reconciled\n`);
      process.exit(2);
    }
    break;
  }
  default:
    process.stderr.write('usage: status-note.mjs init|plan|step|sync ... [--campaign <cid>]\n');
    process.exit(2);
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);

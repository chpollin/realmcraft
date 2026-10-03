// SubagentStart and SubagentStop hook of the game harness (docs/Harness.md).
// For RealmCraft subagents (agent_type rc-<id>) it records the start and end
// of their status step in status.json of the active campaign. The matcher in
// the settings already limits it to ^rc-; the check here keeps it silent if
// the matcher is widened. It never exits 2, because exit 2 on SubagentStop
// would keep the subagent running.
//
// Step assignment. Exact sources first: the launch record next to the
// transcript (the task path in the prompt, the proposal id that /zug puts
// into the description), a task_description in the hook input, on stop the
// "Vorschlag: <proposalId>" line of the agent's last message and the binding
// recorded at start. Only without any of them the start takes the first free
// task of the role, chosen under the run lock so parallel starts do not all
// take the same one; such a guess never marks a step failed.
//
// After every event the whole status is reconciled with the files
// (tools/harness/reconcile.mjs): a step whose proposal exists is done, the
// phase follows state.json.

import { activeCampaign, agentOfType, boundTask, canonPath, findTask, listTasks, proposalIdIn, proposalLocation, readHookInput, readJsonFile, rootDir, stepIdOf, subagentLaunch, subagentTypeOf } from '../harness/lib.mjs';
import { reconcileStatus } from '../harness/reconcile.mjs';

const input = await readHookInput();
const event = input?.hook_event_name;
if (event !== 'SubagentStart' && event !== 'SubagentStop') process.exit(0);
const launch = subagentLaunch(input);
const agent = agentOfType(subagentTypeOf(input) ?? launch?.agentType);
if (!agent) process.exit(0);

try {
  const root = canonPath(rootDir(input));
  const found = activeCampaign(root);
  const state = found ? readJsonFile(`${found.dir}/state.json`, null) : null;
  if (state && state.status !== 'ended') {
    const { initTurnStatus, updateStep } = await import('../../engine/harness/status.js');
    const { withLock, writeJsonAtomic } = await import('../../engine/harness/io.js');
    const dir = found.dir;
    const agentId = typeof input.agent_id === 'string' ? input.agent_id : null;
    if (!readJsonFile(`${dir}/status.json`, null)) initTurnStatus(dir, state.turn, { campaign: found.cid, phase: state.phase });

    const runPath = `${dir}/run.json`;
    const pidIn = (text) => proposalIdIn(text, agent);
    const bound = boundTask(input, root, agent, launch);
    const launchedPid = bound?.cid === found.cid ? bound.task.respondAs.proposalId : null;
    // Tasks of this role for the current turn, newest first; a judge task of
    // the previous turn may still be answered.
    const tasks = listTasks(dir)
      .filter((t) => t.agent === agent && (t.turn === state.turn || t.turn === state.turn - 1))
      .sort((a, b) => b.turn - a.turn || stepIdOf(a).localeCompare(stepIdOf(b)));
    // A role with a single task this turn (world, chronicler, council, each
    // judge) needs no naming: the one task is exact.
    const only = tasks.filter((t) => t.turn === tasks[0]?.turn).length === 1 ? tasks[0].respondAs.proposalId : null;

    if (event === 'SubagentStart') {
      const named = launchedPid ?? pidIn(input.task_description ?? input.prompt ?? input.description) ?? only;
      // run.json keeps agent_id -> step id between start and stop, and under
      // `bound` the proposal id of an agent whose task is known exactly; the
      // write guard then holds that agent to this one proposal.
      const task = withLock(dir, 'run', () => {
        const run = readJsonFile(runPath, null);
        const taken = new Set(Object.values(run?.agents ?? {}));
        const open = tasks.filter((t) => !proposalLocation(dir, t.respondAs.proposalId));
        const exact = tasks.find((t) => t.respondAs.proposalId === named) ?? null;
        const pick = exact ?? open.find((t) => !taken.has(stepIdOf(t))) ?? null;
        if (run?.active && agentId && pick) {
          const next = { ...run, agents: { ...(run.agents ?? {}), [agentId]: stepIdOf(pick) } };
          if (exact) next.bound = { ...(run.bound ?? {}), [agentId]: exact.respondAs.proposalId };
          writeJsonAtomic(runPath, next);
        }
        return pick;
      });
      if (task && !proposalLocation(dir, task.respondAs.proposalId)) updateStep(dir, { id: stepIdOf(task), agent, state: 'running', summary: 'arbeitet' });
    } else {
      const run = readJsonFile(runPath, null);
      const named = launchedPid ?? pidIn(input.last_assistant_message) ?? run?.bound?.[agentId] ?? only;
      const guessed = run?.agents?.[agentId];
      const task = named ? findTask(dir, named) : (tasks.find((t) => stepIdOf(t) === guessed) ?? null);
      if (task) {
        const where = proposalLocation(dir, task.respondAs.proposalId);
        // A stop without a proposal fails the step only when the step is
        // known exactly; a guessed step may belong to a sibling still running.
        if (!where && named) updateStep(dir, { id: stepIdOf(task), agent, state: 'failed', summary: 'kein Vorschlag geschrieben' });
      }
    }
    await reconcileStatus(dir);
  }
} catch {
  // status.json is a view; a lock timeout or a missing file must not disturb the session.
}
process.exit(0);

// SubagentStart and SubagentStop hook of the game harness (docs/Harness.md).
// For RealmCraft subagents (agent_type rc-<id>) it records the start and end
// of their status step in status.json of the active campaign. The matcher in
// the settings already limits it to ^rc-; the check here keeps it silent if
// the matcher is widened. It never exits 2, because exit 2 on SubagentStop
// would keep the subagent running.
//
// Step assignment: tasks of the current turn for this agent without a
// proposal yet. /zug names the proposal id in the launch description, which
// reaches SubagentStart as task_description and makes the match exact;
// otherwise the first free task is taken, which is only a display question
// among parallel agents of the same role. The agent's last message names its
// proposal id, which corrects the step on stop.

import { activeCampaign, agentOfType, boundTask, canonPath, findTask, listTasks, proposalIdIn, proposalLocation, readHookInput, readJsonFile, rootDir, stepIdOf, subagentTypeOf } from '../harness/lib.mjs';

const input = await readHookInput();
const event = input?.hook_event_name;
const agent = agentOfType(subagentTypeOf(input));
if (!agent || (event !== 'SubagentStart' && event !== 'SubagentStop')) process.exit(0);

try {
  const found = activeCampaign(rootDir(input));
  const state = found ? readJsonFile(`${found.dir}/state.json`, null) : null;
  if (state && state.status !== 'ended') {
    const { initTurnStatus, updateStep } = await import('../../engine/harness/status.js');
    const { withLock, writeJsonAtomic } = await import('../../engine/harness/io.js');
    const dir = found.dir;
    const agentId = input.agent_id ?? null;
    if (!readJsonFile(`${dir}/status.json`, null)) initTurnStatus(dir, state.turn, { campaign: found.cid, phase: state.phase });

    // run.json keeps agent_id -> step id between start and stop, and under
    // `bound` the proposal id of an agent whose task was named exactly; the
    // write guard then holds that agent to this one proposal.
    const runPath = `${dir}/run.json`;
    const remember = (stepId, exactPid) => withLock(dir, 'run', () => {
      const run = readJsonFile(runPath, null);
      if (!run?.active || !agentId) return;
      const next = { ...run, agents: { ...(run.agents ?? {}), [agentId]: stepId } };
      if (exactPid) next.bound = { ...(run.bound ?? {}), [agentId]: exactPid };
      writeJsonAtomic(runPath, next);
    });

    const pidIn = (text) => proposalIdIn(text, agent);

    if (event === 'SubagentStart') {
      const run = readJsonFile(runPath, null);
      const taken = new Set(Object.values(run?.agents ?? {}));
      const open = listTasks(dir)
        .filter((t) => t.agent === agent && (t.turn === state.turn || t.turn === state.turn - 1))
        .filter((t) => !proposalLocation(dir, t.respondAs.proposalId))
        .sort((a, b) => b.turn - a.turn || stepIdOf(a).localeCompare(stepIdOf(b)));
      const launched = boundTask(input, canonPath(rootDir(input)), agent);
      const named = pidIn(input.task_description ?? input.prompt ?? input.description) ?? (launched?.cid === found.cid ? launched.task.respondAs.proposalId : null);
      const exact = open.find((t) => t.respondAs.proposalId === named) ?? null;
      const task = exact ?? open.find((t) => !taken.has(stepIdOf(t))) ?? null;
      const stepId = task ? stepIdOf(task) : agent;
      updateStep(dir, { id: stepId, agent, state: 'running', summary: 'arbeitet' });
      remember(stepId, exact?.respondAs.proposalId ?? null);
    } else {
      const run = readJsonFile(runPath, null);
      const named = pidIn(input.last_assistant_message);
      const task = named ? findTask(dir, named) : null;
      const stepId = task ? stepIdOf(task) : (run?.agents?.[agentId] ?? agent);
      const pid = task?.respondAs.proposalId ?? listTasks(dir).find((t) => stepIdOf(t) === stepId && t.agent === agent)?.respondAs.proposalId;
      const where = pid ? proposalLocation(dir, pid) : null;
      updateStep(dir, where
        ? { id: stepId, agent, state: 'done', summary: where === 'rejected' ? 'Vorschlag abgewiesen' : 'Vorschlag geschrieben' }
        : { id: stepId, agent, state: 'failed', summary: 'kein Vorschlag geschrieben' });
    }
  }
} catch {
  // status.json is a view; a lock timeout or a missing file must not disturb the session.
}
process.exit(0);

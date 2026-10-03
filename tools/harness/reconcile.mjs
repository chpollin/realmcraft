// Brings status.json of a campaign in line with the files: the phase follows
// state.json, and a step is done as soon as the proposal of its task exists
// (written, ingested or rejected). Hooks attribute starts and stops to steps
// from what the hook input offers, which can miss among parallel agents of
// one role; the proposal file is the fact that decides.
//
// Once the kernel phase has moved past a task (Phase B after open), its step
// without a proposal failed. Judges run in the background through planning
// and are never failed here.

import { listTasks, proposalLocation, readJsonFile, stepIdOf } from './lib.mjs';

const SUMMARY = {
  proposals: 'Vorschlag geschrieben',
  ingested: 'Vorschlag eingelesen',
  rejected: 'Vorschlag abgewiesen',
};

// The phase in which an agent's task must be answered.
const phaseOf = (agent) => (agent === 'world' ? 'resolving' : agent.startsWith('judge-') ? null : 'agents');

export async function reconcileStatus(dir) {
  const { initTurnStatus, setPhase, updateStep } = await import('../../engine/harness/status.js');
  const state = readJsonFile(`${dir}/state.json`, null);
  if (!state) return null;
  let status = readJsonFile(`${dir}/status.json`, null);
  if (!status || status.turn !== state.turn) {
    const r = initTurnStatus(dir, state.turn, { campaign: state.campaign?.id, phase: state.phase });
    if (!r.ok) return null;
    status = r.status;
  }
  if (status.phase !== state.phase) status = setPhase(dir, state.phase).status ?? status;
  for (const task of listTasks(dir).filter((t) => t.turn === status.turn)) {
    const id = stepIdOf(task);
    const step = status.steps.find((s) => s.id === id);
    const where = proposalLocation(dir, task.respondAs.proposalId);
    if (where) {
      const summary = SUMMARY[where];
      if (step?.state !== 'done' || (where !== 'proposals' && step.summary !== summary)) {
        status = updateStep(dir, { id, agent: task.agent, state: 'done', summary }).status ?? status;
      }
      continue;
    }
    const due = phaseOf(task.agent);
    if (due && state.phase !== due && step?.state !== 'failed') {
      status = updateStep(dir, { id, agent: task.agent, state: 'failed', summary: 'kein Vorschlag geschrieben' }).status ?? status;
    }
  }
  return status;
}

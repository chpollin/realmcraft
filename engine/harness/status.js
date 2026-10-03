// status.json of a campaign (Node only): which agent works on the turn and
// what the validator decided on each proposal item. Hooks, the turn command
// and ingest write it from separate processes, so every change is a locked
// read-modify-write with an atomic rename. The file is a view for the
// dashboard; nothing reads it back into the state. Each call validates the
// result against engine/schemas/status.js and writes nothing when it fails.

import { join } from 'node:path';
import { SCHEMAS, AGENTS } from '../schemas/index.js';
import { validate } from '../content/schema.js';
import { LAYOUT, readJson, withLock, writeJsonAtomic } from './io.js';

const now = () => new Date().toISOString();

// Text fields are a view, so overlong prose is cut instead of rejecting the
// whole update. Code points, as the schema counts them.
function clip(s, max) {
  const chars = [...String(s ?? '')];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
}

function commit(dir, mutate, lockOpts) {
  const path = join(dir, LAYOUT.status);
  return withLock(dir, 'status', () => {
    const next = mutate(readJson(path, { fallback: null }));
    const issues = validate(SCHEMAS.status, next);
    if (issues.length) return { ok: false, issues, status: next };
    writeJsonAtomic(path, next);
    return { ok: true, issues: [], status: next };
  }, lockOpts);
}

/**
 * Starts the status of a turn. Campaign id and phase default to those in
 * state.json. Idempotent for the same turn: an existing status of this turn
 * is kept, so a late hook cannot wipe recorded steps.
 */
export function initTurnStatus(dir, turn, { campaign, phase, lock } = {}) {
  const state = campaign && phase ? null : readJson(join(dir, LAYOUT.state), { fallback: null });
  return commit(dir, (cur) => {
    if (cur && cur.turn === turn) return cur;
    return {
      format: 'realmcraft-status',
      version: 1,
      campaign: campaign ?? state?.campaign?.id,
      turn,
      phase: phase ?? state?.phase ?? 'agents',
      steps: [],
    };
  }, lock);
}

function requireStatus(cur, dir) {
  if (!cur) throw new Error(`status: ${join(dir, LAYOUT.status)} does not exist, call initTurnStatus first`);
  return structuredClone(cur);
}

function applyState(step, state) {
  if (!state || state === step.state) return;
  step.state = state;
  if (state === 'running') {
    step.startedAt ??= now();
    step.endedAt = null;
  } else if (state === 'done' || state === 'failed') {
    step.startedAt ??= now();
    step.endedAt = now();
  } else {
    step.startedAt = null;
    step.endedAt = null;
  }
}

/**
 * Creates or updates one step. A new step needs `agent`; state moves set
 * startedAt (running) and endedAt (done, failed). summary is kept when
 * omitted.
 */
export function updateStep(dir, { id, agent, state, summary }, { lock } = {}) {
  return commit(dir, (cur) => {
    const status = requireStatus(cur, dir);
    let step = status.steps.find((s) => s.id === id);
    if (!step) {
      step = { id, agent, state: 'waiting', startedAt: null, endedAt: null, summary: '', proposals: [] };
      status.steps.push(step);
    } else if (agent !== undefined) {
      step.agent = agent;
    }
    applyState(step, state);
    if (summary !== undefined) step.summary = clip(summary, 400);
    return status;
  }, lock);
}

/** Sets the phase shown with the steps, so the view follows the kernel phase after apply and open. */
export function setPhase(dir, phase, { lock } = {}) {
  return commit(dir, (cur) => {
    const status = requireStatus(cur, dir);
    status.phase = phase;
    return status;
  }, lock);
}

// Agent named by a proposal id ("research.schar.T6" -> research), for steps
// that a verdict reaches before any hook announced them.
function agentOf(proposalId) {
  const head = String(proposalId).split('.')[0];
  return AGENTS.includes(head) ? head : 'kernel';
}

/**
 * Records the validator's verdict on one proposal item under a step. An
 * entry with the same proposalId, kind and title is replaced, so re-running
 * ingest does not duplicate lines. budget may be a full score object; only
 * effect, price, net and tier are kept (event cards pass their band as tier).
 */
export function recordVerdict(dir, stepId, { proposalId, kind, title, verdict, budget = null, reason = null }, { lock } = {}) {
  return commit(dir, (cur) => {
    const status = requireStatus(cur, dir);
    let step = status.steps.find((s) => s.id === stepId);
    if (!step) {
      step = { id: stepId, agent: agentOf(proposalId), state: 'done', startedAt: now(), endedAt: now(), summary: '', proposals: [] };
      status.steps.push(step);
    }
    const entry = {
      proposalId,
      kind,
      title: clip(title, 80),
      verdict,
      budget: budget ? { effect: budget.effect, price: budget.price, net: budget.net, tier: budget.tier ?? budget.band } : null,
      reason: reason === null || reason === undefined || reason === '' ? null : clip(reason, 400),
    };
    const at = step.proposals.findIndex((p) => p.proposalId === proposalId && p.kind === kind && p.title === entry.title);
    if (at >= 0) step.proposals[at] = entry;
    else step.proposals.push(entry);
    return status;
  }, lock);
}

/**
 * Records an accepted finding of a judge under a step, { id, judge, severity,
 * text, refs }. The caller passes only findings the player may see. A finding
 * with the same id and judge is replaced, so re-running ingest does not
 * duplicate it.
 */
export function recordFinding(dir, stepId, { id, judge, severity, text, refs = [] }, { lock } = {}) {
  return commit(dir, (cur) => {
    const status = requireStatus(cur, dir);
    let step = status.steps.find((s) => s.id === stepId);
    if (!step) {
      step = { id: stepId, agent: judge, state: 'done', startedAt: now(), endedAt: now(), summary: '', proposals: [] };
      status.steps.push(step);
    }
    const entry = { id, judge, severity, text: clip(text, 1000), refs: refs.slice(0, 12).map((r) => clip(r, 80)) };
    const list = (step.findings ??= []);
    const at = list.findIndex((f) => f.id === id && f.judge === judge);
    if (at >= 0) list[at] = entry;
    else list.push(entry);
    // The schema holds 24 per step; the oldest give way.
    while (list.length > 24) list.shift();
    return status;
  }, lock);
}

/**
 * Brings status.json in line with the campaign state after a kernel
 * transition: the phase always follows the state. When apply moves to a new
 * turn, the steps of the resolved turn (phase B before it, the world step of
 * phase A) move to `resolved`, so the dashboard can show the round that just
 * ended; open drops them when planning starts.
 */
export function followState(dir, state, { lock } = {}) {
  return commit(dir, (cur) => {
    const base = { format: 'realmcraft-status', version: 1, campaign: state.campaign.id, turn: state.turn, phase: state.phase, steps: [] };
    if (!cur) return base;
    if (cur.turn !== state.turn) {
      return cur.turn === state.turn - 1 && state.phase === 'agents' ? { ...base, resolved: { turn: cur.turn, steps: cur.steps } } : base;
    }
    const next = { ...structuredClone(cur), phase: state.phase };
    if (state.phase === 'planning') delete next.resolved;
    return next;
  }, lock);
}

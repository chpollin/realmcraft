// PostToolUse check of the game harness (docs/Harness.md). When a tool has
// written campaigns/<cid>/agents/proposals/<proposalId>.json, the proposal is
// validated with validateProposal against its task, the campaign state and
// the world package, the same function ingest uses. On failure the hook exits
// 2 and names the issues on stderr, which Claude Code hands back to the
// writing agent so it corrects the file in the same run. On success it marks
// the proposal items as pending in status.json; the verdict that counts is
// the one ingest records.
//
// Every other event exits 0 without output.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { campaignPath, findTask, itemTitle, proposalIdOfRel, readHookInput, readJsonFile, stepIdOf } from '../harness/lib.mjs';

const MAX_LISTED = 12;
const PROPOSAL_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);

const input = await readHookInput();
const target = input?.tool_input?.file_path;
const loc = input && PROPOSAL_TOOLS.has(input.tool_name) ? campaignPath(target, input.cwd) : null;
const pid = loc?.cid ? proposalIdOfRel(loc.rel) : null;
if (!pid) process.exit(0);

function fail(lines) {
  process.stderr.write(`${[`RealmCraft: proposal ${pid} is not valid. Correct ${loc.rel} and write it again.`, ...lines].join('\n')}\n`);
  process.exit(2);
}

const file = `${loc.dir}/${loc.rel}`;
let proposal;
try {
  proposal = JSON.parse(readFileSync(file, 'utf8'));
} catch (err) {
  fail([`- the file is not valid JSON: ${err.message}`]);
}

const task = findTask(loc.dir, pid);
if (!task) fail([`- no task under agents/tasks/ names respondAs.proposalId "${pid}"; write exactly the path given in your task`]);

const { validateProposal } = await import('../../engine/content/validate.js');
const { createLibrary } = await import('../../engine/content/library.js');
const state = readJsonFile(`${loc.dir}/state.json`, null);
// The world package as the CLI pins it: world.lock.json names its folder
// (relative to the root or absolute), else welten/<id> under the root, else
// the repository's welten/ (the CLI's own fallback).
const lock = readJsonFile(`${loc.dir}/world.lock.json`, null);
const worldId = lock?.id ?? state?.campaign?.world?.id;
const worldDirs = [
  lock?.worldDir && (/^([a-zA-Z]:)?[\\/]/.test(lock.worldDir) ? lock.worldDir : `${loc.root}/${lock.worldDir}`),
  worldId && `${loc.root}/welten/${worldId}`,
  worldId && fileURLToPath(new URL(`../../welten/${worldId}`, import.meta.url)),
].filter(Boolean);
const world = (name) => {
  for (const d of worldDirs) {
    const v = readJsonFile(`${d}/${name}.json`, null);
    if (v) return v;
  }
  return undefined;
};
const ctx = {
  state: state ?? undefined,
  task,
  library: readJsonFile(`${loc.dir}/library.json`, null) ?? createLibrary(),
  regeln: world('regeln'),
  welt: world('welt'),
};
// The validator reads state.peoples for owner checks; drop a missing state
// instead of passing null.
if (!ctx.state) delete ctx.state;
let result;
try {
  result = validateProposal(proposal, ctx);
} catch (err) {
  // A validator crash is a kernel bug, not the agent's fault; ingest decides.
  process.stderr.write(`RealmCraft: pre-check of ${pid} crashed (${err.message}); ingest will decide.\n`);
  process.exit(0);
}

const errors = [
  ...result.issues.filter((i) => i.severity !== 'warning').map((i) => ({ ...i, where: '' })),
  ...result.items.flatMap((it) => it.issues.filter((i) => i.severity !== 'warning').map((i) => ({ ...i, where: `item ${it.index}` }))),
];

async function note(fn) {
  // status.json is a view: a failure to record must never block the agent.
  try {
    const status = await import('../../engine/harness/status.js');
    const cur = readJsonFile(`${loc.dir}/status.json`, null);
    if (cur && cur.campaign !== loc.cid) return;
    if (!cur) status.initTurnStatus(loc.dir, task.turn, { campaign: loc.cid, phase: state?.phase ?? 'agents' });
    fn(status);
  } catch {
    // lock timeout or schema mismatch of the view; ignore
  }
}

const stepId = stepIdOf(task);
if (errors.length) {
  await note((s) => s.updateStep(loc.dir, { id: stepId, agent: task.agent, state: 'running', summary: `Vorprüfung: ${errors.length} Fehler, Agent korrigiert` }));
  const lines = errors.slice(0, MAX_LISTED).map((i) => `- ${i.where ? `${i.where} ` : ''}${i.path || '/'} [${i.code}] ${i.message}`);
  if (errors.length > MAX_LISTED) lines.push(`- … and ${errors.length - MAX_LISTED} more`);
  fail(lines);
}

if (!result.duplicate) {
  await note((s) => {
    proposal.items.forEach((item, i) => {
      s.recordVerdict(loc.dir, stepId, {
        proposalId: pid,
        kind: item.type,
        title: itemTitle(item),
        verdict: 'pending',
        budget: result.items[i]?.budget ?? null,
        reason: null,
      });
    });
    s.updateStep(loc.dir, { id: stepId, agent: task.agent, summary: 'Vorschlag liegt vor, Vorprüfung bestanden' });
  });
}
process.exit(0);

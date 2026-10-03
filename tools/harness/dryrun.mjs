// Deterministic dry run of the /zug procedure without any language model.
// Recorded proposals stand in for the agents: for every task the run looks
// up a template in <fixtures>/<turn stem>/ and fills its envelope from the
// task, writes it to respondAs.path as the agent would, lets the kernel
// ingest it and records the steps in status.json like the hooks do. A task
// without a template counts as a failed agent, which exercises the kernel's
// substitutes (pool cards, fallback policy).
//
//   node tools/harness/dryrun.mjs --campaign <cid> --fixtures <dir> [--root <dir>] [--rolls 6,3,9] [--judges]
//
// From planning: rolls, seal, phase A (world), apply, phase B, open.
// From agents (a fresh campaign): phase B, open. --judges also runs the
// judge tasks after open. Prints a JSON summary; exit 0 when the turn reached
// planning again, 1 when a kernel step failed.
//
// Template lookup per task: <agent>-<people|all>.json, then <agent>.json.
// Strings in the template items may use $people, $player, $member0 (first
// council member of the task's people or the player), $lastEvent (id of
// the newest chronicle entry) and $proposalId, filled from the task and state.json.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normPath, parseArgs, readJsonFile, stepIdOf, turnStem } from './lib.mjs';
import { initTurnStatus, updateStep } from '../../engine/harness/status.js';
import { JUDGES } from '../../engine/schemas/index.js';

const CLI = fileURLToPath(new URL('../../engine/cli.mjs', import.meta.url));
const { opt } = parseArgs(process.argv.slice(2));
const root = normPath(opt.root ?? process.env.REALMCRAFT_ROOT ?? process.cwd());
const cid = opt.campaign;
const fixtures = typeof opt.fixtures === 'string' ? resolve(opt.fixtures) : null;
if (typeof cid !== 'string' || !fixtures) {
  process.stderr.write('usage: dryrun.mjs --campaign <cid> --fixtures <dir> [--root <dir>] [--rolls 6,3,9] [--judges]\n');
  process.exit(2);
}
const dir = `${root}/campaigns/${cid}`;
const rolls = String(typeof opt.rolls === 'string' ? opt.rolls : '6').split(',').map(Number);
let rollAt = 0;
const nextRoll = () => rolls[rollAt++ % rolls.length];

const log = [];
const steps = new Map();

function cli(...args) {
  const r = spawnSync(process.execPath, [CLI, ...args, '--campaign', cid, '--json'], {
    cwd: root, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8', timeout: 120_000, maxBuffer: 64 * 1024 * 1024,
  });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // prose or empty output; the exit code still counts
  }
  log.push({ cmd: args.join(' '), exit: r.status });
  return { code: r.status, json, stderr: r.stderr };
}

function stop(stage, res) {
  process.stdout.write(`${JSON.stringify({ ok: false, stage, exit: res.code, issues: res.json?.issues ?? res.stderr, log }, null, 2)}\n`);
  process.exit(1);
}

const state = () => readJsonFile(`${dir}/state.json`);

function fill(value, ctx) {
  if (typeof value === 'string') return value.replace(/\$(people|player|member0|lastEvent)\b/g, (_, k) => ctx[k] ?? '');
  if (Array.isArray(value)) return value.map((v) => fill(v, ctx)).filter((v) => v !== '');
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, ctx)]));
  return value;
}

function templateFor(task) {
  const base = `${fixtures}/${turnStem(task.turn)}`;
  for (const name of [`${task.agent}-${task.people ?? 'all'}.json`, `${task.agent}.json`]) {
    if (existsSync(`${base}/${name}`)) return readJsonFile(`${base}/${name}`);
  }
  return null;
}

/** Writes the proposal of one task from its template; false when there is none. */
function answer(task) {
  const tpl = templateFor(task);
  const id = stepIdOf(task);
  steps.set(id, { id, agent: task.agent, proposalId: task.respondAs.proposalId });
  updateStep(dir, { id, agent: task.agent, state: 'running', summary: 'Probelauf' });
  if (!tpl) {
    updateStep(dir, { id, agent: task.agent, state: 'failed', summary: 'kein Vorschlag (Probelauf ohne Vorlage)' });
    steps.get(id).state = 'failed';
    return false;
  }
  const s = state();
  const owner = s.peoples[task.people ?? s.campaign.player];
  const ctx = {
    people: task.people ?? '',
    player: s.campaign.player,
    member0: owner?.council?.[0]?.id ?? '',
    lastEvent: s.chronicle?.at(-1)?.id ?? '',
    proposalId: task.respondAs.proposalId,
  };
  const proposal = {
    format: 'realmcraft-proposal',
    version: 1,
    proposalId: task.respondAs.proposalId,
    agent: task.agent,
    campaign: task.campaign,
    turn: task.turn,
    basedOnRev: task.rev,
    people: task.people,
    items: fill(tpl.items, ctx),
  };
  const file = `${dir}/${task.respondAs.path}`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(proposal, null, 2)}\n`);
  return file;
}

/** Closes the steps of the given proposals from an ingest report. */
function settle(res) {
  for (const r of res.json?.proposals ?? []) {
    const step = [...steps.values()].find((s) => s.proposalId === r.proposalId);
    if (!step) continue;
    const accepted = r.verdict === 'accepted' || r.verdict === 'partial' || r.verdict === 'duplicate';
    const n = (r.items ?? []).filter((i) => i.verdict === 'accepted').length;
    const summary = accepted ? `${n} von ${(r.items ?? []).length} Items angenommen` : `abgewiesen: ${[...new Set((r.issues ?? []).map((i) => i.code))].join(', ')}`.slice(0, 400);
    updateStep(dir, { id: step.id, agent: step.agent, state: accepted ? 'done' : 'failed', summary });
    Object.assign(step, { state: accepted ? 'done' : 'failed', verdict: r.verdict });
  }
}

function tasksOf(phaseFilter) {
  const res = cli('tasks');
  if (res.code !== 0) stop('tasks', res);
  return (res.json?.tasks ?? []).filter(phaseFilter);
}

const run = (cmd) => spawnSync(process.execPath, [fileURLToPath(new URL('./run-marker.mjs', import.meta.url)), cmd, '--campaign', cid, '--root', root], { encoding: 'utf8' });

const from = state();
if (from.status === 'ended') stop('status', { code: 4, json: { issues: [{ code: 'finished', message: 'campaign has ended' }] } });
run('start');
initTurnStatus(dir, from.turn, { campaign: cid, phase: from.phase });

if (state().phase === 'planning') {
  const st = cli('status');
  for (const probe of st.json?.probes ?? []) cli('roll', probe, String(nextRoll()));
  let res = cli('seal');
  if (res.code === 3) {
    const ids = [...new Set(JSON.stringify(res.json?.issues ?? []).match(/T\d+:[a-z0-9-]+:[a-z0-9-]+/g) ?? [])];
    for (const id of ids) cli('roll', id, String(nextRoll()));
    res = cli('seal');
  }
  if (res.code !== 0) stop('seal', res);
}

if (state().phase === 'resolving') {
  for (const task of tasksOf((t) => t.agent === 'world')) {
    const file = answer(task);
    if (file) settle(cli('ingest', file));
  }
  const res = cli('apply', '--expect-rev', String(state().rev));
  if (res.code !== 0) stop('apply', res);
  initTurnStatus(dir, state().turn, { campaign: cid, phase: 'agents' });
}

if (state().phase === 'agents' && state().status !== 'ended') {
  const written = tasksOf((t) => t.agent !== 'world' && !JUDGES.includes(t.agent)).map(answer).filter(Boolean);
  if (written.length) {
    const res = cli('ingest');
    if (![0, 2].includes(res.code)) stop('ingest', res);
    settle(res);
  }
  const res = cli('open');
  if (res.code !== 0) stop('open', res);
}

if (opt.judges && state().status !== 'ended') {
  const written = [];
  for (const judge of JUDGES) {
    const res = cli('tasks', '--agent', judge);
    if (res.code !== 0) stop(`tasks ${judge}`, res);
    for (const task of res.json?.tasks ?? []) {
      const file = answer(task);
      if (file) written.push(file);
    }
  }
  if (written.length) {
    const res = cli('ingest');
    if (![0, 2, 4].includes(res.code)) stop('ingest judges', res);
    settle(res);
  }
}

run('end');
const to = state();
process.stdout.write(`${JSON.stringify({
  ok: to.phase === 'planning' || to.status === 'ended',
  campaign: cid,
  from: { turn: from.turn, phase: from.phase, rev: from.rev },
  to: { turn: to.turn, phase: to.phase, rev: to.rev, status: to.status },
  steps: [...steps.values()],
  log,
}, null, 2)}\n`);

// Deterministic harness test: a campaign in a temp root is driven through
// two /zug cycles by tools/harness/dryrun.mjs with the recorded proposals of
// tests/fixtures/harness/, without any language model. Checks the kernel
// transitions, the status steps and where ingest filed each proposal.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = join(REPO, 'engine', 'cli.mjs');
const DRYRUN = join(REPO, 'tools', 'harness', 'dryrun.mjs');
const FIXTURES = join(REPO, 'tests', 'fixtures', 'harness');
const SEED = '48213';

function newCampaign(root, cid) {
  const r = spawnSync(process.execPath, [CLI, 'new', 'hochland', '--seed', SEED, '--as', 'bergnomaden', '--id', cid, '--json'], {
    cwd: root, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8', timeout: 120_000,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}

function dryrun(root, cid, ...extra) {
  const r = spawnSync(process.execPath, [DRYRUN, '--campaign', cid, '--root', root, '--fixtures', FIXTURES, '--rolls', '6,3,8', ...extra], {
    cwd: root, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8', timeout: 300_000,
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return JSON.parse(r.stdout);
}

const read = (root, cid, rel) => JSON.parse(readFileSync(join(root, 'campaigns', cid, rel), 'utf8'));
const step = (summary, id) => summary.steps.find((s) => s.id === id);

describe('harness dry run', () => {
  let root;
  let first;
  let second;

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'rc-harness-dryrun-'));
    newCampaign(root, 'probe-1');
    first = dryrun(root, 'probe-1', '--judges');
    second = dryrun(root, 'probe-1');
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('phase B of the new campaign ends in planning of turn 0', () => {
    assert.equal(first.ok, true);
    assert.deepEqual([first.from.phase, first.to.phase, first.to.turn], ['agents', 'planning', 0]);
  });

  it('records accepted text proposals as done steps and files them under ingested', () => {
    for (const id of ['chronicler-all', 'council-bergnomaden', 'rival-talbund', 'rival-schaedelklan', 'judge-coherence-all']) {
      assert.equal(step(first, id)?.state, 'done', id);
      assert.equal(step(first, id).verdict, 'accepted', id);
      assert.ok(existsSync(join(root, 'campaigns', 'probe-1', 'agents', 'ingested', `${step(first, id).proposalId}.json`)), id);
    }
  });

  it('a rejected proposal is a delivered one (done), only a missing proposal fails its step', () => {
    const research = step(first, 'research-bergnomaden');
    assert.equal(research.state, 'done');
    assert.equal(research.verdict, 'rejected');
    assert.ok(existsSync(join(root, 'campaigns', 'probe-1', 'agents', 'rejected', 'research.bergnomaden.T0.json')));
    assert.equal(step(first, 'research-talbund').state, 'failed', 'no template means no proposal');
    assert.equal(step(first, 'research-talbund').verdict, undefined);
  });

  it('the second cycle seals, runs the world agent, applies and opens turn 1', () => {
    assert.equal(second.ok, true);
    assert.deepEqual([second.from.phase, second.from.turn, second.to.phase, second.to.turn], ['planning', 0, 'planning', 1]);
    assert.deepEqual(second.log.map((l) => l.cmd.split(' ')[0]).filter((c) => ['seal', 'apply', 'open'].includes(c)), ['seal', 'apply', 'open']);
    assert.equal(step(second, 'world-all').verdict, 'accepted');
    const library = JSON.stringify(read(root, 'probe-1', 'library.json'));
    assert.ok(library.includes('probelauf-frost'), 'the world card entered the library');
  });

  it('status.json carries the kernel verdicts of the latest turn', () => {
    const status = read(root, 'probe-1', 'status.json');
    assert.equal(status.turn, 1);
    const chron = status.steps.find((s) => s.id === 'chronicler-all');
    assert.equal(chron.state, 'done');
    assert.deepEqual(chron.proposals.map((p) => [p.proposalId, p.kind, p.verdict]), [['chronicler.T1', 'narrative', 'accepted']]);
  });

  it('status.json follows the kernel phase after open', () => {
    assert.equal(read(root, 'probe-1', 'status.json').phase, 'planning');
  });

  it('leaves the run marker inactive', () => {
    const marker = read(root, 'probe-1', 'run.json');
    assert.equal(marker.active, false);
    assert.ok(marker.endedAt);
  });

  it('the proposal check reads the pinned world and library of a real campaign', () => {
    newCampaign(root, 'probe-3');
    const dir = join(root, 'campaigns', 'probe-3');
    const tpl = JSON.parse(readFileSync(join(FIXTURES, 'T0000', 'research-bergnomaden.json'), 'utf8'));
    const proposal = {
      format: 'realmcraft-proposal', version: 1, proposalId: 'research.bergnomaden.T0', agent: 'research', campaign: 'probe-3', turn: 0, basedOnRev: 0, people: 'bergnomaden',
      items: JSON.parse(JSON.stringify(tpl.items).replaceAll('$proposalId', 'research.bergnomaden.T0')),
    };
    const file = join(dir, 'agents', 'proposals', 'research.bergnomaden.T0.json');
    writeFileSync(file, JSON.stringify(proposal));
    const r = spawnSync(process.execPath, [join(REPO, 'tools', 'hooks', 'proposal-check.mjs')], {
      input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file }, agent_type: 'rc-research', cwd: root }),
      encoding: 'utf8', env: { ...process.env, REALMCRAFT_ROOT: root, CLAUDE_PROJECT_DIR: REPO },
    });
    assert.equal(r.status, 2);
    // unknown_resource needs regeln.json, conflict the campaign library, ungrounded the state.
    for (const code of ['unknown_resource', 'conflict', 'ungrounded']) assert.match(r.stderr, new RegExp(code));
  });

  it('is deterministic: a second campaign with the same seed and fixtures reaches the same state', () => {
    newCampaign(root, 'probe-2');
    dryrun(root, 'probe-2', '--judges');
    dryrun(root, 'probe-2');
    // Proposal hashes cover the campaign id, so only their keys are compared.
    const strip = (s) => JSON.stringify({ ...s, ingested: Object.keys(s.ingested).sort() }).replaceAll('probe-2', 'probe-1');
    assert.equal(strip(read(root, 'probe-2', 'state.json')), strip(read(root, 'probe-1', 'state.json')));
  });
});

// The live finding behind this block: phase B agents run in parallel, Claude
// Code's SubagentStart carries no task description, and steps ended failed or
// waiting although every agent delivered, with the status phase stuck in
// agents. Here the real hooks write the status from Claude Code's payloads.
describe('harness dry run through the hooks', () => {
  let root;
  let first;
  let second;
  const status = () => read(root, 'probe-h', 'status.json');
  const states = () => Object.fromEntries(status().steps.map((s) => [s.id, s.state]));

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'rc-harness-hooks-dryrun-'));
    newCampaign(root, 'probe-h');
    first = dryrun(root, 'probe-h', '--judges', '--hooks');
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('every delivered proposal ends done, every missing one failed, and the phase is planning', () => {
    assert.equal(first.ok, true);
    assert.equal(status().phase, 'planning');
    assert.deepEqual(states(), {
      'chronicler-all': 'done',
      'council-bergnomaden': 'done',
      'research-bergnomaden': 'done',
      'research-schaedelklan': 'failed',
      'research-talbund': 'failed',
      'rival-schaedelklan': 'done',
      'rival-talbund': 'done',
      'judge-coherence-all': 'done',
      'judge-balance-all': 'failed',
      'judge-narrative-all': 'failed',
    });
    assert.equal(status().steps.find((s) => s.id === 'research-bergnomaden').summary, 'Vorschlag abgewiesen');
  });

  it('a full turn through the hooks ends in planning of turn 1 with the same rule', () => {
    second = dryrun(root, 'probe-h', '--hooks');
    assert.deepEqual([second.to.phase, second.to.turn], ['planning', 1]);
    assert.equal(status().phase, 'planning');
    const s = states();
    for (const id of ['chronicler-all', 'council-bergnomaden', 'rival-schaedelklan', 'rival-talbund']) assert.equal(s[id], 'done', id);
    for (const id of ['research-bergnomaden', 'research-schaedelklan', 'research-talbund']) assert.equal(s[id], 'failed', id);
  });
});

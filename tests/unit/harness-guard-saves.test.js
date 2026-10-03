// guard-state keeps RealmCraft agents and file tools out of the saves of a
// campaign and out of the staging folder of a load, also when a task lists
// such a file under read.

import { after, before, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const CID = 'hochland-saves';
const TURN = 3;
let root;
let dir;

function guard(input) {
  const r = spawnSync(process.execPath, [join(REPO, 'tools', 'hooks', 'guard-state.mjs')], {
    input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, REALMCRAFT_ROOT: root, CLAUDE_PROJECT_DIR: root }, timeout: 30_000,
  });
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : 'allow';
}

const judge = { agent_type: 'rc-judge-balance', agent_id: 'jb-saves' };
const read = (file_path, who = judge) => ({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path }, cwd: root, ...who });
const glob = (path, who = judge) => ({ hook_event_name: 'PreToolUse', tool_name: 'Glob', tool_input: { path, pattern: '*.json' }, cwd: root, ...who });
const write = (file_path, who = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path, content: '{}' }, cwd: root, ...who });

const SAVED = ['saves/save-4/campaign/state.json', 'saves/save-4/campaign/log/T0002.json', 'saves/save-4/campaign/view/talbund.json', 'saves/save-4/manifest.json', '.restore/new/state.json'];

before(() => {
  root = mkdtempSync(join(tmpdir(), 'rc-guard-saves-'));
  dir = join(root, 'campaigns', CID);
  for (const sub of [`agents/tasks/T000${TURN}`, 'log', 'saves/save-4/campaign/log', '.restore/new']) mkdirSync(join(dir, sub), { recursive: true });
  const proposalId = `judge-balance.T${TURN}`;
  writeFileSync(join(dir, `agents/tasks/T000${TURN}/judge-balance-all.json`), JSON.stringify({
    format: 'realmcraft-task', version: 1, campaign: CID, turn: TURN, rev: 9, agent: 'judge-balance', people: null,
    respondAs: { proposalId, path: `agents/proposals/${proposalId}.json` },
    read: ['state.json', ...SAVED], context: {}, limits: {},
  }));
});
after(() => rmSync(root, { recursive: true, force: true }));

it('a judge reads its task files but no save and no staged load, even when its task lists them', () => {
  assert.equal(guard(read(join(dir, 'state.json'))), 'allow');
  assert.equal(guard(read(join(dir, 'log', 'T0002.json'))), 'allow');
  for (const rel of SAVED) assert.equal(guard(read(join(dir, rel))), 'deny', rel);
  assert.equal(guard(read(join(dir, 'SAVES', 'save-4', 'manifest.json'))), 'deny', 'case folded');
  assert.equal(guard(glob(join(dir, 'saves', 'save-4', 'campaign', 'log'))), 'deny');
  assert.equal(guard(glob(join(dir, '.restore'))), 'deny');
});

it('no agent and no main-session file tool writes into saves/', () => {
  assert.equal(guard(write(join(dir, 'saves', 'save-4', 'campaign', 'agents', 'proposals', `judge-balance.T${TURN}.json`), judge)), 'deny');
  assert.equal(guard(write(join(dir, 'saves', 'save-4', 'manifest.json'))), 'deny');
  assert.equal(guard(write(join(dir, '.restore', 'step.json'))), 'deny');
});

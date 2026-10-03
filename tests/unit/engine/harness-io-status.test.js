// status.json: step lifecycle, verdict records, schema validity and
// concurrent writers in separate processes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initTurnStatus, recordVerdict, updateStep } from '../../../engine/harness/status.js';
import { LAYOUT, ensureLayout, readJson, writeState } from '../../../engine/harness/io.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { validate } from '../../../engine/content/schema.js';

const STATUS = pathToFileURL(fileURLToPath(new URL('../../../engine/harness/status.js', import.meta.url))).href;
const state0 = JSON.parse(readFileSync(fileURLToPath(new URL('../../fixtures/engine/campaign-turn0.json', import.meta.url)), 'utf8'));

function tempCampaign(t) {
  const dir = mkdtempSync(join(tmpdir(), 'rc-k2-status-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  ensureLayout(dir);
  writeState(dir, state0);
  return dir;
}

const read = (dir) => readJson(join(dir, LAYOUT.status));

test('initTurnStatus takes campaign and phase from the state and is idempotent per turn', (t) => {
  const dir = tempCampaign(t);
  const r = initTurnStatus(dir, 0);
  assert.equal(r.ok, true);
  assert.deepEqual(read(dir), { format: 'realmcraft-status', version: 1, campaign: 'hochweide-1', turn: 0, phase: 'agents', steps: [] });
  updateStep(dir, { id: 'world', agent: 'world', state: 'running' });
  initTurnStatus(dir, 0);
  assert.equal(read(dir).steps.length, 1, 'a second init of the same turn keeps the steps');
  initTurnStatus(dir, 1);
  assert.deepEqual(read(dir).steps, [], 'a new turn starts empty');
});

test('step lifecycle sets timestamps and keeps the summary unless given', (t) => {
  const dir = tempCampaign(t);
  initTurnStatus(dir, 0);
  updateStep(dir, { id: 'research-hochweide', agent: 'research' });
  let s = read(dir).steps[0];
  assert.deepEqual([s.state, s.startedAt, s.endedAt], ['waiting', null, null]);
  updateStep(dir, { id: 'research-hochweide', state: 'running', summary: 'liest die Praxis' });
  s = read(dir).steps[0];
  assert.match(s.startedAt, /Z$/);
  assert.equal(s.endedAt, null);
  updateStep(dir, { id: 'research-hochweide', state: 'done' });
  s = read(dir).steps[0];
  assert.match(s.endedAt, /Z$/);
  assert.equal(s.summary, 'liest die Praxis');
  assert.deepEqual(validate(SCHEMAS.status, read(dir)), []);
});

test('recordVerdict replaces the same item, clips prose and keeps only the budget fields', (t) => {
  const dir = tempCampaign(t);
  initTurnStatus(dir, 0);
  const budget = { effect: 2, price: -1, net: 1, tier: 1, research: 2, ok: true, issues: [], lines: [] };
  recordVerdict(dir, 'research-hochweide', { proposalId: 'research.hochweide.T0', kind: 'entwicklung', title: 'Filzjurten', verdict: 'pending', budget });
  recordVerdict(dir, 'research-hochweide', { proposalId: 'research.hochweide.T0', kind: 'entwicklung', title: 'Filzjurten', verdict: 'rejected', budget, reason: 'x'.repeat(500) });
  const step = read(dir).steps[0];
  assert.equal(step.agent, 'research', 'a step first seen through a verdict takes the agent from the proposal id');
  assert.equal(step.proposals.length, 1);
  assert.deepEqual(step.proposals[0].budget, { effect: 2, price: -1, net: 1, tier: 1 });
  assert.equal([...step.proposals[0].reason].length, 400);
  recordVerdict(dir, 'world', { proposalId: 'world.T0', kind: 'event', title: 'Dürre', verdict: 'accepted', budget: { effect: 0, price: -2, net: -2, band: 2 } });
  assert.deepEqual(read(dir).steps[1].proposals[0].budget, { effect: 0, price: -2, net: -2, tier: 2 });
  assert.deepEqual(validate(SCHEMAS.status, read(dir)), []);
});

test('an update the schema rejects writes nothing; a missing status throws', (t) => {
  const dir = tempCampaign(t);
  assert.throws(() => updateStep(dir, { id: 'world', agent: 'world' }), /initTurnStatus first/);
  initTurnStatus(dir, 0);
  const before = read(dir);
  const r = recordVerdict(dir, 'world', { proposalId: 'world.T0', kind: 'feature', title: 'Erzader', verdict: 'vielleicht' });
  assert.equal(r.ok, false);
  assert.deepEqual(r.issues.map((i) => i.code), ['schema.enum']);
  assert.deepEqual(read(dir), before);
});

test('concurrent writers in four processes lose no update', async (t) => {
  const dir = tempCampaign(t);
  initTurnStatus(dir, 0);
  const worker = (n) => `
    import { updateStep, recordVerdict } from ${JSON.stringify(STATUS)};
    const dir = ${JSON.stringify(dir)};
    for (let j = 0; j < 8; j++) {
      const r = updateStep(dir, { id: 'c${n}-s' + j, agent: 'rival', state: 'running' });
      if (!r.ok) process.exit(2);
      if (j < 5) {
        const v = recordVerdict(dir, 'ingest', { proposalId: 'rival.p${n}.T0', kind: 'orders', title: 't' + j, verdict: 'accepted' });
        if (!v.ok) process.exit(3);
      }
    }`;
  const runs = await Promise.all([0, 1, 2, 3].map((n) => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', worker(n)], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.setEncoding('utf8').on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('exit', (status) => resolve({ status, err }));
  })));
  assert.deepEqual(runs.map((r) => r.status), [0, 0, 0, 0], runs.map((r) => r.err).join('\n'));
  const status = read(dir);
  assert.deepEqual(validate(SCHEMAS.status, status), []);
  assert.equal(status.steps.filter((s) => s.id.startsWith('c')).length, 32);
  assert.equal(status.steps.find((s) => s.id === 'ingest').proposals.length, 20);
});

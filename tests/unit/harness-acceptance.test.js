// tools/harness/acceptance.mjs over hand-written verdicts in the shape ingest
// files them: rates per agent and item type, refusal reasons, an envelope
// refusal counted once, duplicates apart, filters, and no write anywhere.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO } from '../fixtures/engine/k1/harness.js';

const TOOL = join(REPO, 'tools', 'harness', 'acceptance.mjs');
const CID = 'quote-1';
let root;
let dir;

const item = (index, type, verdict, issues = []) => ({ index, type, title: type, verdict, budget: null, issues });
const err = (code, reason, path = '/items/0') => ({ code, severity: 'error', path, message: code, ...(reason ? { params: { reason } } : {}) });
const VERDICTS = [
  { proposalId: 'research.talbund.T3', agent: 'research', verdict: 'partial', issues: [], items: [item(0, 'entwicklung', 'accepted'), item(1, 'entwicklung', 'rejected', [err('budget_net'), { code: 'tier_note', severity: 'warning', path: '/items/1', message: 'w' }])] },
  { proposalId: 'research.talbund.T4', agent: 'research', verdict: 'rejected', issues: [err('pfad_tier')], items: [item(0, 'entwicklung', 'rejected', [err('pfad_tier')])] },
  { proposalId: 'rival.talbund.T4', agent: 'rival', verdict: 'rejected', issues: [err('stale', null, '/turn')], items: [item(0, 'orders', 'rejected'), item(1, 'stance', 'rejected')] },
  { proposalId: 'rival.talbund.T5', agent: 'rival', verdict: 'accepted', issues: [], items: [item(0, 'orders', 'accepted'), item(1, 'stance', 'accepted')] },
  { proposalId: 'rival.talbund.T5', agent: 'rival', verdict: 'duplicate', issues: [], items: [] },
  { proposalId: 'chronicler.T5', agent: 'chronicler', verdict: 'rejected', issues: [err('target', 'no-task', '/proposalId')], items: [] },
];

function run(...args) {
  const r = spawnSync(process.execPath, [TOOL, '--root', root, '--campaign', CID, ...args], { encoding: 'utf8', timeout: 30_000 });
  return { code: r.status, json: r.status === 0 ? JSON.parse(r.stdout) : null, stderr: r.stderr };
}

const snapshot = (d) => readdirSync(d, { recursive: true }).sort().map((n) => `${n}:${statSync(join(d, n)).mtimeMs}`);

describe('acceptance tool', () => {
  before(() => {
    root = mkdtempSync(join(tmpdir(), 'rc-acceptance-'));
    dir = join(root, 'campaigns', CID);
    mkdirSync(join(dir, 'agents', 'verdicts'), { recursive: true });
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ campaign: { id: CID }, turn: 6 }));
    VERDICTS.forEach((v, i) => writeFileSync(join(dir, 'agents', 'verdicts', `${v.proposalId}${v.verdict === 'duplicate' ? `.dup${i}` : ''}.json`), JSON.stringify(v)));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('counts proposals, items and refusal reasons per agent', () => {
    const before = snapshot(dir);
    const { code, json } = run();
    assert.equal(code, 0);
    assert.deepEqual(snapshot(dir), before, 'the tool writes nothing');
    assert.deepEqual(json.turns, { from: 3, to: 5 });
    const r = json.agents.research;
    assert.deepEqual(r.verdicts, { partial: 1, rejected: 1 });
    assert.deepEqual(r.items, { sent: 3, accepted: 1, rate: 0.33 });
    assert.deepEqual(r.refusals, [{ code: 'budget_net', reason: null, count: 1 }, { code: 'pfad_tier', reason: null, count: 1 }]);
    const rival = json.agents.rival;
    assert.equal(rival.proposals, 3);
    assert.deepEqual(rival.verdicts, { rejected: 1, accepted: 1, duplicate: 1 });
    assert.deepEqual(rival.items, { sent: 4, accepted: 2, rate: 0.5 });
    assert.deepEqual(rival.byType.stance, { sent: 2, accepted: 1, rate: 0.5 });
    assert.deepEqual(rival.refusals, [{ code: 'stale', reason: null, count: 1 }], 'an envelope refusal counts once');
    assert.deepEqual(json.agents.chronicler.refusals, [{ code: 'target', reason: 'no-task', count: 1 }]);
    assert.deepEqual(json.agents.chronicler.items, { sent: 0, accepted: 0, rate: null });
    assert.deepEqual(json.items, { sent: 7, accepted: 3, rate: 0.43 });
  });

  it('filters by turn and agent', () => {
    const { json } = run('--from', '4', '--to', '4', '--agent', 'rival');
    assert.deepEqual(Object.keys(json.agents), ['rival']);
    assert.equal(json.agents.rival.proposals, 1);
    assert.deepEqual(json.turns, { from: 4, to: 4 });
  });

  it('refuses a bad turn and a missing campaign', () => {
    assert.equal(run('--from', 'drei').code, 2);
    const r = spawnSync(process.execPath, [TOOL, '--root', root, '--campaign', 'fehlt'], { encoding: 'utf8' });
    assert.equal(r.status, 3);
  });
});

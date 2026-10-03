// Group 1, lifecycle of a campaign through one full season.
// Spec: Regelkern sections 3, 5, 14, 17; orchestrator decision on the phase
// cycle planning -> resolving -> agents.
//
// Assumptions beyond lib/harness.js (A1 to A9):
// L1 `new` leaves turn 0 in phase agents (Regelkern section 17) or already in
//    planning. "status shows turn 0 planning" is checked after the `open` that
//    a phase agents start needs.
// L2 `status --json` carries the campaign's phase and turn as the shallowest
//    `phase` and `turn` fields of its answer.
// L3 preview of an empty draft may answer exit 3 because the world-event roll
//    is still missing (Regelkern: preview exits 3 on missing rolls), but it
//    reports no issue with severity error, since roll_missing is an apply-time
//    error only (Regelkern section 5 issue table).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { assertSchema, createCampaign, dice, errorIssues, expectExit, pick, removeRoot, T_SHORT, codesOf } from './lib/harness.js';

describe('lifecycle', { timeout: T_SHORT }, () => {
  let c;
  const next = dice(11);
  before(() => { c = createCampaign({ label: 'life', id: 'acc-life' }); });
  after(() => removeRoot(c?.root));

  it('new writes a schema-valid campaign at turn 0 with world lock and library', () => {
    const s = c.state();
    assertSchema('campaign', s, 'state.json after new');
    assert.equal(s.turn, 0);
    assert.ok(['agents', 'planning'].includes(s.phase), `phase after new is ${s.phase}`);
    assert.equal(s.status, 'playing');
    assert.equal(s.campaign.id, 'acc-life');
    assert.ok(s.peoples[s.campaign.player], 'campaign.player names a people of the state');
    assert.equal(s.peoples[s.campaign.player].controller, 'player');
    assert.ok(Object.values(s.peoples).some((p) => p.controller === 'ai'), 'the world places at least one AI people');
    assert.ok(c.has('world.lock.json'), 'world.lock.json pins the world');
    assert.ok(c.has('library.json'), 'library.json holds the seed content');
  });

  it('status shows turn 0 in phase planning once the campaign is opened', () => {
    c.toPlanning();
    const res = expectExit(c.run('status', '--as', c.player), [0], 'status');
    assert.equal(pick(res.json, 'phase'), 'planning');
    assert.equal(pick(res.json, 'turn'), 0);
    assertSchema('campaign', c.state(), 'state.json after open');
  });

  it('preview of an empty draft reports no error issue and stores the draft', () => {
    const draft = c.emptyDraft();
    const res = expectExit(c.submit(draft), [0, 3], 'preview of an empty draft');
    assert.deepEqual(errorIssues(res), [], `error issues: ${codesOf(res).join(', ')}`);
    assert.ok(Array.isArray(pick(res.json, 'probes')), 'preview answer lists probes');
    const stored = c.storedDraft();
    assert.ok(stored, 'preview --draft stores drafts/<player>.json (assumption A4)');
    assertSchema('draft', stored, 'stored player draft');
    assert.deepEqual(stored.orders, []);
    assert.equal(stored.turn, 0);
    c.rollPending(res, next);
  });

  let revBeforeApply;
  it('seal moves planning to resolving, keeps the turn and seals the player draft', () => {
    const rev0 = c.state().rev;
    expectExit(c.seal(next), [0], 'seal');
    const s = c.state();
    assertSchema('campaign', s, 'state.json after seal');
    assert.equal(s.phase, 'resolving');
    assert.equal(s.turn, 0);
    assert.ok(s.rev >= rev0, 'rev never decreases');
    assert.equal(c.storedDraft()?.sealed, true, 'the player draft is sealed');
    for (const [id, p] of Object.entries(s.peoples)) {
      if (p.controller !== 'ai') continue;
      const d = c.storedDraft(id);
      assert.ok(d, `drafts/${id}.json exists after seal (fallback policy fills missing AI drafts)`);
      assertSchema('draft', d, `drafts/${id}.json`);
      assert.equal(d.sealed, true, `AI draft of ${id} is sealed`);
      assert.equal(d.turn, 0);
    }
    revBeforeApply = s.rev;
  });

  it('apply resolves the season into phase agents with turn + 1 and a round report', () => {
    expectExit(c.apply(revBeforeApply), [0], 'apply');
    const s = c.state();
    assertSchema('campaign', s, 'state.json after apply');
    assert.equal(s.phase, 'agents');
    assert.equal(s.turn, 1);
    assert.ok(s.rev > revBeforeApply, 'apply increases rev');
    assert.ok(c.roundLog(0), 'log/T0000.json exists after the first apply');
  });

  it('open returns to planning for turn 1', () => {
    const rev = c.state().rev;
    expectExit(c.open(), [0], 'open');
    const s = c.state();
    assertSchema('campaign', s, 'state.json after open');
    assert.equal(s.phase, 'planning');
    assert.equal(s.turn, 1);
    assert.ok(s.rev >= rev);
    const res = expectExit(c.run('status', '--as', c.player), [0], 'status');
    assert.equal(pick(res.json, 'phase'), 'planning');
    assert.equal(pick(res.json, 'turn'), 1);
  });
});

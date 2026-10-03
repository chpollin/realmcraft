// Group 7, phases: orders are locked while a season resolves, and each phase
// transition is only possible from its own phase.
// Spec: Regelkern section 14 (phase table, players may plan the next turn in
// agents), section 5 (issue `phase`), section 17 (exit 4 on a wrong phase for
// seal, open and apply).
//
// Assumptions beyond lib/harness.js (A1 to A9):
// H1 A draft submitted in phase resolving (preview --draft) answers with an
//    issue `phase` of severity error and a non-zero exit, and the stored,
//    sealed player draft stays byte-identical. The same holds for `roll`.
// H2 A draft for the new turn submitted in phase agents is accepted (no
//    `phase` issue), since Regelkern section 14 lets the player plan while
//    agents work.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { T_SHORT, codesOf, createCampaign, dice, expectExit, removeRoot } from './lib/harness.js';

describe('phases', { timeout: T_SHORT }, () => {
  let c;
  let probeIds = [];
  const next = dice(71);
  before(() => {
    c = createCampaign({ label: 'phase', id: 'acc-phase' });
    c.toPlanning();
  });
  after(() => removeRoot(c?.root));

  it('apply and open are refused in phase planning', () => {
    const before = c.raw('state.json');
    expectExit(c.apply(), [4], 'apply in planning');
    expectExit(c.open(), [4], 'open in planning');
    assert.equal(c.raw('state.json'), before);
  });

  it('seal locks the orders: phase resolving with a sealed player draft', () => {
    const pv = expectExit(c.submit(c.emptyDraft()), [0, 3], 'preview');
    probeIds = c.playerProbes(pv).map((p) => p.id);
    c.rollPending(pv, next);
    expectExit(c.seal(next), [0], 'seal');
    assert.equal(c.state().phase, 'resolving');
    assert.equal(c.storedDraft()?.sealed, true);
  });

  it('orders submitted during resolving are rejected and the sealed draft stays', () => {
    const s = c.state();
    const draftBefore = c.raw(`drafts/${s.campaign.player}.json`);
    const stateBefore = c.raw('state.json');
    const order = { id: 'o1', type: 'research.direct', params: { tags: ['weg'], note: 'nach dem Siegel' } };
    const res = c.submit({ ...c.emptyDraft(s, [order]) });
    assert.notEqual(res.code, 0, 'a draft in phase resolving is not accepted');
    assert.ok(codesOf(res).includes('phase'), `expected issue phase, got ${codesOf(res).join(', ')}`);
    assert.equal(c.raw(`drafts/${s.campaign.player}.json`), draftBefore, 'the sealed draft is unchanged');
    assert.equal(c.raw('state.json'), stateBefore);
  });

  it('a roll during resolving is rejected', () => {
    const s = c.state();
    const draftBefore = c.raw(`drafts/${s.campaign.player}.json`);
    const id = probeIds[0] ?? `T${s.turn}:${s.campaign.player}:o1`;
    const res = c.roll(id, 5);
    assert.notEqual(res.code, 0, 'roll in phase resolving is not accepted');
    assert.equal(c.raw(`drafts/${s.campaign.player}.json`), draftBefore);
  });

  it('seal and open are refused in phase resolving', () => {
    const before = c.raw('state.json');
    expectExit(c.run('seal'), [4], 'second seal');
    expectExit(c.open(), [4], 'open in resolving');
    assert.equal(c.raw('state.json'), before);
  });

  it('seal is refused in phase agents, a draft for the new turn is accepted', () => {
    expectExit(c.apply(), [0], 'apply');
    const s = c.state();
    assert.equal(s.phase, 'agents');
    const before = c.raw('state.json');
    expectExit(c.run('seal'), [4], 'seal in agents');
    assert.equal(c.raw('state.json'), before);
    const res = c.submit(c.emptyDraft(s));
    assert.ok(!codesOf(res).includes('phase'), `planning ahead in agents is allowed, got ${codesOf(res).join(', ')}`);
  });
});

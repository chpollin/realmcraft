// Group 8, Bestimmung: victory when all milestones are latched, defeat on
// collapse of the player people or on victory of an AI people.
// Spec: Regelkern section 13 (milestones latch, first people with all
// milestones wins in mode wettstreit, collapse rules, player collapse or AI
// victory ends the campaign in defeat), section 14 step 9, engine/schemas
// bestimmung.js (bestimmungState) and campaign.js (status playing | ended).
//
// Assumptions beyond lib/harness.js (A1 to A9):
// B1 Crafted states. The tamper guard anchors the state right after `new`, so
//    a state edited in place is refused. Crafted late-game states therefore
//    enter through the sanctioned loader `new <world> --seed n --as tpl --id
//    cid --from-state <file>` (lib/harness.js createCampaign option `craft`):
//    the harness creates a throwaway base campaign, mutates its real state and
//    loads the result as the campaign under test.
// B2 A milestone is latched by reached: true with reachedAt
//    (engine/schemas/bestimmung.js). Latched milestones stay latched, so a
//    destiny with every milestone latched is fulfilled at the next season end.
// B3 Population core 0 is below any tuning.collapseCore and makes the player
//    people collapse at the next season end.
// B4 The end of a campaign shows as status 'ended', a result { winner, kind }
//    (engine/schemas/campaign.js) and an event-log entry of that season of
//    kind campaign.victory or campaign.defeat (engine/core/bestimmung.js). A
//    victory has kind 'victory' and names its winner, a collapse of the player
//    has kind 'collapse' and no winner. The player's defeat by an AI victory
//    is the end of the campaign with a winner other than the player.
// B5 Every people carries a destiny after `new` (Regelkern section 13, "Jedes
//    Volk hat eine Bestimmung"), the AI peoples included.
// B6 The last test checks the tamper guard itself: a state edited in place
//    after `new` or a round report is refused with `tamper`, which is why B1
//    uses the loader instead of editing state.json.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { T_SHORT, codesOf, createCampaign, destinyOf, dice, removeRoot } from './lib/harness.js';

const roots = [];
after(() => roots.forEach(removeRoot));

function fresh(label, craft) {
  const c = createCampaign({ label, id: `acc-${label}`, craft });
  roots.push(c.root);
  return c;
}

function latchAll(state, peopleId) {
  const d = destinyOf(state.peoples[peopleId]);
  assert.ok(d && Array.isArray(d.milestones) && d.milestones.length >= 3, `${peopleId} has a destiny with three or four milestones (assumption B5)`);
  for (const m of d.milestones) {
    m.reached = true;
    m.reachedAt = state.turn;
  }
}

function outcomeEntries(c, state, turn, kind) {
  return c.allLogEntries(state).filter((e) => (e.turn === turn || e.turn === turn + 1) && e.kind === kind);
}

function assertFinished(c) {
  const before = c.raw('state.json');
  const res = c.run('seal');
  assert.notEqual(res.code, 0, 'an ended campaign accepts no further season');
  assert.ok(codesOf(res).some((code) => code === 'finished' || code === 'phase'), `expected finished, got ${codesOf(res).join(', ')}`);
  assert.equal(c.raw('state.json'), before);
}

describe('bestimmung', { timeout: T_SHORT }, () => {
  it('a fresh campaign is still playing after one season', () => {
    const c = fresh('dest-control');
    const { afterApply } = c.playTurn({ next: dice(80) });
    assert.equal(afterApply.status, 'playing');
  });

  it('all milestones latched gives the player victory at the end of the season', () => {
    let s;
    const c = fresh('dest-win', (state) => {
      latchAll(state, state.campaign.player);
      s = state;
    });
    const { afterApply, turn } = c.playTurn({ next: dice(81) });
    assert.equal(afterApply.status, 'ended', 'the campaign ends with the victory');
    assert.ok(outcomeEntries(c, afterApply, turn, 'campaign.victory').length > 0, 'an event-log entry records the victory');
    assert.equal(afterApply.result.kind, 'victory');
    assert.equal(afterApply.result.winner, s.campaign.player, 'the result names the player people');
    assertFinished(c);
  });

  it('collapse of the player people ends the campaign in defeat', () => {
    let s;
    const c = fresh('dest-collapse', (state) => {
      state.peoples[state.campaign.player].population.core = 0;
      s = state;
    });
    const { afterApply, turn } = c.playTurn({ next: dice(82) });
    assert.equal(afterApply.status, 'ended', 'the campaign ends with the collapse');
    assert.ok(outcomeEntries(c, afterApply, turn, 'campaign.defeat').length > 0, 'an event-log entry records the defeat');
    assert.equal(afterApply.result.kind, 'collapse');
    assert.equal(afterApply.result.winner, null);
    assertFinished(c);
  });

  it('victory of an AI people ends the campaign in defeat for the player', () => {
    let ai;
    const c = fresh('dest-rival', (state) => {
      ai = Object.keys(state.peoples).filter((id) => state.peoples[id].controller === 'ai').sort()[0];
      assert.ok(ai, 'an AI people exists');
      latchAll(state, ai);
    });
    const { afterApply, turn } = c.playTurn({ next: dice(83) });
    assert.equal(afterApply.status, 'ended', 'the campaign ends when an AI people fulfils its destiny');
    assert.equal(afterApply.result?.winner, ai, 'the AI people is the winner, so the player has lost');
    assert.notEqual(afterApply.result.winner, c.player);
    assert.equal(afterApply.result.kind, 'victory');
    assert.ok(outcomeEntries(c, afterApply, turn, 'campaign.victory').some((e) => e.change.after.winner === ai), 'an event-log entry records the victory of the AI people');
    assertFinished(c);
  });

  it('a state written outside the kernel after a round report is refused as tampered', () => {
    const c = fresh('dest-tamper');
    c.playTurn({ next: dice(84) });
    const s = c.state();
    s.peoples[s.campaign.player].resources = Object.fromEntries(Object.keys(s.peoples[s.campaign.player].resources).map((k) => [k, 99]));
    c.writeState(s);
    const res = c.submit(c.emptyDraft(s));
    const seal = c.run('seal');
    assert.ok([res, seal].some((r) => codesOf(r).includes('tamper')), `expected tamper, got ${[...codesOf(res), ...codesOf(seal)].join(', ')}`);
    assert.notEqual(seal.code, 0, 'seal refuses a tampered state');
  });
});

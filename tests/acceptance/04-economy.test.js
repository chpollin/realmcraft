// Group 4, economy invariants over a long run with the fallback policy for
// every AI people and empty player drafts.
// Spec: Regelkern sections 1 (principle 2, integers), 3 (invariants), 8
// (economy order, shortfall, stock caps, gains capped before losses, half the
// excess lost at round end); RealmCraft-Plan test strategy "Langlauf-Invarianten".
//
// Assumptions beyond lib/harness.js (A1 to A9):
// E1 The stock cap of each people is observable in state.derived[people].caps
//    as a map resource -> integer (engine/core/derive.js).
// E2 Cap invariant without knowing the gains: since gains are capped before
//    losses and half of any excess is lost at round end, a stock above its cap
//    after a season must be strictly smaller than at the start of that season.
// E3 A shortfall is recorded explicitly as people.shortfall[res] > 0 together
//    with an event-log entry of that turn whose kind, reason or target names
//    the shortfall (the text "shortfall").
// E4 An empty player draft keeps the labour assignment of the previous round
//    (Regelkern section 8), so the player people can survive; a campaign that
//    ends earlier by collapse is accepted, and the invariants hold until then.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { T_LONG, assertSchema, createCampaign, dice, isObj, removeRoot, schemaErrors, walk } from './lib/harness.js';

const TURNS = 50;

function capsOf(state, people) {
  const caps = state.derived?.[people]?.caps;
  return isObj(caps) ? caps : null;
}

function nonIntegers(state) {
  const bad = [];
  const { derived, ...rest } = state;
  walk(rest, (v, path) => { if (typeof v === 'number' && !Number.isInteger(v)) bad.push(`${path.join('.')}=${v}`); });
  return bad;
}

function mentionsShortfall(entry, people) {
  const text = JSON.stringify([entry.kind, entry.reason, entry.target, entry.change]);
  return /shortfall/i.test(text) && text.includes(people);
}

describe('economy invariants', { timeout: T_LONG }, () => {
  let c;
  after(() => removeRoot(c?.root));

  it(`${TURNS} seasons with fallback AI and empty player drafts keep every invariant`, (t) => {
    c = createCampaign({ label: 'eco', id: 'acc-eco' });
    const next = dice(31);
    const problems = [];
    let capsSeen = false;
    let shortfalls = 0;
    let played = 0;
    let prevRev = -1;

    for (let i = 0; i < TURNS; i++) {
      const { before, afterApply, after: s, turn } = c.playTurn({ next });
      played++;
      const where = `turn ${turn}`;

      for (const [label, st] of [['after apply', afterApply], ['after open', s]]) {
        const errs = schemaErrors('campaign', st);
        if (errs.length) problems.push(`${where} ${label}: schema ${errs.slice(0, 3).join(' | ')}`);
        for (const bad of nonIntegers(st)) problems.push(`${where} ${label}: non-integer ${bad}`);
      }
      assert.equal(afterApply.turn, turn + 1, `${where}: apply advances the turn by one`);
      assert.ok(afterApply.rev > before.rev && afterApply.rev > prevRev, `${where}: rev increases monotonically`);
      prevRev = s.rev;

      const entries = c.allLogEntries(afterApply).filter((e) => e.turn === undefined || e.turn === turn || e.turn === turn + 1);
      for (const [id, p] of Object.entries(afterApply.peoples)) {
        for (const [res, v] of Object.entries(p.resources)) {
          if (!Number.isInteger(v) || v < 0 || v > 999) problems.push(`${where}: ${id}.${res} = ${v} outside 0..999`);
        }
        if (p.population.core < 0) problems.push(`${where}: ${id} population below 0`);
        for (const m of p.council) if (m.loyalty < -5 || m.loyalty > 5) problems.push(`${where}: ${id}.${m.id} loyalty ${m.loyalty}`);
        if (p.standing < 0 || p.standing > 3) problems.push(`${where}: ${id} standing ${p.standing}`);
        for (const u of p.units) if (u.strength < 0 || u.strength > 9) problems.push(`${where}: unit ${u.id} strength ${u.strength}`);

        const caps = capsOf(afterApply, id);
        if (caps) {
          capsSeen = true;
          for (const [res, cap] of Object.entries(caps)) {
            const now = p.resources[res];
            const start = before.peoples[id]?.resources?.[res];
            if (typeof now === 'number' && typeof cap === 'number' && now > cap && !(typeof start === 'number' && now < start)) {
              problems.push(`${where}: ${id}.${res} = ${now} above cap ${cap} without shrinking from ${start}`);
            }
          }
        }

        for (const [res, gap] of Object.entries(p.shortfall ?? {})) {
          if (!Number.isInteger(gap) || gap < 0) problems.push(`${where}: ${id}.shortfall.${res} = ${gap}`);
          if (gap > 0) {
            shortfalls++;
            if (!entries.some((e) => mentionsShortfall(e, id))) problems.push(`${where}: ${id} has shortfall ${res} ${gap} but no event-log entry names it`);
          }
        }
      }
      for (const [k, r] of Object.entries(afterApply.relations)) if (r.value < -3 || r.value > 3) problems.push(`${where}: relation ${k} = ${r.value}`);

      if (s.status === 'ended') {
        t.diagnostic(`campaign ended after turn ${turn}`);
        break;
      }
    }

    t.diagnostic(`played ${played} seasons, ${shortfalls} recorded shortfalls`);
    assertSchema('campaign', c.state(), 'final state.json');
    assert.ok(played === TURNS || c.state().status === 'ended', 'the run reaches 50 seasons unless the campaign ends');
    assert.ok(capsSeen, 'stock caps are not observable in state.derived (assumption E1)');
    assert.deepEqual(problems.slice(0, 40), [], `${problems.length} invariant violations`);
  });
});

// Group 9, event log: every change of the state between two snapshots has an
// entry with source, target and change.
// Spec: Regelkern section 1 (principle 5), section 15 (entry shape, sources
// kernel, agent, player), RealmCraft-Plan K3 acceptance ("jede
// Zustandsänderung hat einen Protokolleintrag"), engine/schemas event.js.
//
// Assumptions beyond lib/harness.js (A1 to A9):
// V1 Bookkeeping fields are not state changes in the sense of the rule and
//    need no entry: rev, turn, phase, rng, derived, chronicle (the log
//    itself), ingested, eventDraws and map.known (fog cache rewritten every
//    season). Everything else, including the practice ledger, statuses,
//    tokens, candidates and status, needs an entry.
// V2 Lists count as one value: a changed list is covered by any entry whose
//    target or change.field points at the list or into it, or, for council,
//    units, settlements and developments, by an entry whose target names an
//    entity of that list (target.kind member, unit, settlement, development).
// V3 Entries of the season resolved by apply sit in log/T<turn>.json or in
//    state.chronicle, entries written by open in either place with the turn
//    of the new season. An entry with change null is a notice and covers
//    nothing.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { T_LONG, assertSchema, covers, createCampaign, dice, leafDiff, removeRoot, sourceOk } from './lib/harness.js';

const TURNS = 6;
const BOOKKEEPING = ['rev', 'turn', 'phase', 'rng', 'derived', 'chronicle', 'ingested', 'eventDraws', 'map.known'];
const isBookkeeping = (p) => BOOKKEEPING.some((b) => p === b || p.startsWith(`${b}.`));

describe('event log', { timeout: T_LONG }, () => {
  let c;
  const seasons = [];
  before(() => {
    c = createCampaign({ label: 'log', id: 'acc-log' });
    c.toPlanning();
    const next = dice(91);
    for (let i = 0; i < TURNS; i++) {
      const r = c.playTurn({ next });
      seasons.push(r);
      if (r.after.status === 'ended') break;
    }
  });
  after(() => removeRoot(c?.root));

  it('every entry carries source, target and change with a known source kind', () => {
    const entries = c.allLogEntries();
    assert.ok(entries.length > 0, 'the campaign has event-log entries');
    const bad = entries.filter((e) => !sourceOk(e.source) || e.target === undefined || e.target === null || !('change' in e));
    assert.deepEqual(bad.slice(0, 10), [], `${bad.length} malformed entries`);
  });

  it('entries in state.chronicle follow the event schema', () => {
    for (const e of c.state().chronicle ?? []) assertSchema('event', e, `chronicle entry ${e.id}`);
  });

  it('every changed field of a resolved season has an entry', () => {
    const missing = [];
    for (const { before, afterApply, turn } of seasons) {
      const entries = c.allLogEntries(afterApply).filter((e) => e.turn === undefined || e.turn === turn || e.turn === turn + 1);
      for (const path of leafDiff(before, afterApply).filter((p) => !isBookkeeping(p))) {
        if (!entries.some((e) => covers(e, path, before, afterApply))) missing.push(`season ${turn}: ${path}`);
      }
    }
    assert.deepEqual(missing.slice(0, 30), [], `${missing.length} changes without an entry`);
  });

  it('every changed field written by open has an entry', () => {
    const missing = [];
    for (const { afterApply, after: opened, turn } of seasons) {
      if (opened.phase !== 'planning') continue;
      const entries = c.allLogEntries(opened).filter((e) => e.turn === undefined || e.turn === turn || e.turn === turn + 1);
      for (const path of leafDiff(afterApply, opened).filter((p) => !isBookkeeping(p))) {
        if (!entries.some((e) => covers(e, path, afterApply, opened))) missing.push(`open after season ${turn}: ${path}`);
      }
    }
    assert.deepEqual(missing.slice(0, 30), [], `${missing.length} changes without an entry`);
  });

  it('a resolved season changes the state at all', () => {
    const changed = seasons.flatMap(({ before, afterApply }) => leafDiff(before, afterApply).filter((p) => !isBookkeeping(p)));
    assert.ok(changed.length > 0, 'seasons without any substantive change would make the coverage test vacuous');
  });
});

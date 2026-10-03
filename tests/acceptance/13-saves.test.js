// Group 13, named saves. Play two seasons, save, play a season, load, and
// check that state, journal, roll ledger and replay are those of the save,
// then play on from the loaded season.
//
// Assumptions beyond lib/harness.js (A1 to A9):
// S1 `save --name <label>` in planning answers { save: manifest } and writes
//    campaigns/<cid>/saves/<slot>/ with manifest.json and a copy of the
//    campaign under campaign/. The manifest carries slot, label, turn, rev
//    and the kernel's state hash.
// S2 `saves` answers { saves: [manifest] }, newest first.
// S3 `load --slot <slot>` in planning restores the copy in place, answers
//    { slot, autosave, turn, rev } and keeps the files it replaced as the
//    save `autosave`. A refused load (wrong phase) exits 4 and changes nothing.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign, dice, expectExit, removeRoot, stateHash, T_LONG } from './lib/harness.js';

describe('save, play on, load', { timeout: T_LONG }, () => {
  let c;
  let next;
  let saved;
  let atSave;
  before(() => {
    c = createCampaign({ label: 'saves', id: 'acc-saves' });
    next = dice(31);
    c.playTurn({ next });
    c.playTurn({ next });
    atSave = { state: c.raw('state.json'), journal: c.raw('log/journal.json'), rolls: c.raw('rolls.json'), library: c.raw('library.json') };
    saved = expectExit(c.run('save', '--name', 'Nach zwei Saisons'), [0], 'save').json.save;
  });
  after(() => removeRoot(c?.root));

  it('S1/S2: the save is listed with the season it holds', () => {
    const state = JSON.parse(atSave.state);
    assert.equal(saved.label, 'Nach zwei Saisons');
    assert.deepEqual([saved.turn, saved.rev, saved.phase], [state.turn, state.rev, 'planning']);
    const list = expectExit(c.run('saves'), [0], 'saves').json.saves;
    assert.deepEqual(list.map((m) => m.slot), [saved.slot]);
    assert.ok(c.has(`saves/${saved.slot}/campaign/state.json`));
  });

  it('S3: a load restores state, journal, ledger and library of the save and replays', () => {
    const played = c.playTurn({ next });
    const replaced = stateHash(played.after);
    assert.ok(played.after.turn > saved.turn);

    const r = expectExit(c.run('load', '--slot', saved.slot), [0], 'load');
    assert.deepEqual([r.json.slot, r.json.turn, r.json.rev], [saved.slot, saved.turn, saved.rev]);
    assert.equal(c.raw('state.json'), atSave.state);
    assert.equal(c.raw('log/journal.json'), atSave.journal);
    assert.equal(c.raw('rolls.json'), atSave.rolls);
    assert.equal(c.raw('library.json'), atSave.library);
    assert.equal(c.view().turn, saved.turn);

    const replay = expectExit(c.run('replay'), [0], 'replay after load');
    assert.deepEqual([replay.json.turn, replay.json.rev, replay.json.hash], [saved.turn, saved.rev, saved.stateHash]);

    const auto = c.run('saves').json.saves.find((m) => m.slot === r.json.autosave);
    assert.ok(auto, 'the replaced files are kept as a save');
    assert.equal(stateHash(c.read(`saves/${auto.slot}/campaign/state.json`)), replaced);
  });

  it('S3: the loaded season plays on, and a load outside planning is refused', () => {
    const played = c.playTurn({ next, stopAt: 'agents' });
    assert.equal(played.before.turn, saved.turn);
    if (played.after.phase === 'agents') {
      const before = c.raw('state.json');
      expectExit(c.run('load', '--slot', saved.slot), [4], 'load in phase agents');
      assert.equal(c.raw('state.json'), before);
      expectExit(c.open(), [0], 'open');
    }
    c.playTurn({ next });
    expectExit(c.run('replay'), [0], 'replay after playing on');
  });
});

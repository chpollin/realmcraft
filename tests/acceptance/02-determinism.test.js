// Group 2, determinism, replay and the stale-revision guard.
// Spec: Regelkern sections 1 (principle 2), 14, 17 (apply --expect-rev, replay);
// kernel draft section 9 test 3; RealmCraft-Plan test strategy "Reproduktion".
//
// Assumptions beyond lib/harness.js (A1 to A9):
// D1 Two campaigns with the same id, world, seed, player drafts and player
//    rolls, run in different temp roots, produce identical state.json and
//    identical round reports. The id is shared because state.json carries it.
// D2 The state hash compared here is our own sha256 over the canonical
//    state without `derived`, not the kernel hash.
// D3 `replay` exits 0 when it reproduces the stored state and leaves
//    state.json untouched.
// D4 apply with a wrong --expect-rev exits 4 and writes nothing, in phase
//    resolving (revision conflict) as well as after the turn already resolved
//    (phase conflict).

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createCampaign, dice, expectExit, listJsonFiles, readJson, removeRoot, stateHash, canonical, T_LONG, SEED } from './lib/harness.js';

const TURNS = 6;

function play(label, seed) {
  const c = createCampaign({ label, id: 'acc-det', seed });
  const next = dice(23);
  const hashes = [stateHash(c.state())];
  for (let i = 0; i < TURNS; i++) {
    const r = c.playTurn({ next });
    hashes.push(stateHash(r.after));
    if (r.after.status === 'ended') break;
  }
  return { c, hashes };
}

function logsOf(c) {
  const files = listJsonFiles(c.path('log')).sort();
  return files.map((f) => [f.slice(c.dir.length).replaceAll('\\', '/'), canonical(readJson(f))]);
}

describe('determinism and replay', { timeout: T_LONG }, () => {
  let a;
  let b;
  before(() => {
    a = play('det-a', SEED);
    b = play('det-b', SEED);
  });
  after(() => {
    removeRoot(a?.c.root);
    removeRoot(b?.c.root);
  });

  it('same seed, drafts and rolls give the same state after every turn', () => {
    assert.equal(a.hashes.length, b.hashes.length);
    a.hashes.forEach((h, i) => assert.equal(h, b.hashes[i], `state differs after turn ${i}`));
  });

  it('same seed, drafts and rolls give identical round reports', () => {
    const la = logsOf(a.c);
    const lb = logsOf(b.c);
    assert.ok(la.length > 0, 'round reports exist under log/');
    assert.deepEqual(la.map(([f]) => f), lb.map(([f]) => f));
    la.forEach(([f, body], i) => assert.equal(body, lb[i][1], `${f} differs`));
  });

  it('a different seed gives a different campaign', () => {
    const other = createCampaign({ label: 'det-c', id: 'acc-det', seed: SEED + 1 });
    try {
      assert.notEqual(stateHash(other.state()), a.hashes[0]);
    } finally {
      removeRoot(other.root);
    }
  });

  it('replay reproduces the stored state and leaves it untouched', () => {
    const before = a.c.raw('state.json');
    expectExit(a.c.run('replay'), [0], 'replay');
    assert.equal(a.c.raw('state.json'), before, 'replay must not rewrite state.json');
  });

  it('replay up to an earlier turn succeeds as well', () => {
    expectExit(a.c.run('replay', '--to', '2'), [0], 'replay --to 2');
  });

  it('apply with a stale --expect-rev is rejected and changes nothing', () => {
    const c = b.c;
    const next = dice(5);
    c.toPlanning();
    const preview = expectExit(c.submit(c.emptyDraft()), [0, 3], 'preview');
    c.rollPending(preview, next);
    expectExit(c.seal(next), [0], 'seal');
    const sealed = c.state();
    assert.equal(sealed.phase, 'resolving');
    const raw = c.raw('state.json');

    expectExit(c.apply(sealed.rev - 1), [4], 'apply with rev - 1');
    assert.equal(c.raw('state.json'), raw, 'a rejected apply must not write state.json');
    expectExit(c.apply(sealed.rev + 1), [4], 'apply with rev + 1');
    assert.equal(c.raw('state.json'), raw);

    expectExit(c.apply(sealed.rev), [0], 'apply with the current rev');
    const done = c.raw('state.json');
    assert.notEqual(done, raw);

    expectExit(c.apply(sealed.rev), [4], 'second apply of the same turn');
    assert.equal(c.raw('state.json'), done, 'applying the same turn twice changes nothing');
    expectExit(c.apply(JSON.parse(done).rev), [4], 'apply in phase agents with the fresh rev');
    assert.equal(c.raw('state.json'), done);
  });
});

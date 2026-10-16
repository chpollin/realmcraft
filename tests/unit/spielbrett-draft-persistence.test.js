import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createDraftPersistence } from '../../spielbrett/js/data/draft-persistence.js';

const stored = () => ({ stored: true, issues: [] });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('a clean loaded draft needs no write before a save, load or navigation', async () => {
  const draft = { turn: 0, orders: [] };
  let writes = 0;
  const persistence = createDraftPersistence({ read: () => draft, write: async () => { writes += 1; return stored(); } });
  assert.equal(persistence.unsaved, false);
  assert.equal((await persistence.flush()).stored, true);
  assert.deepEqual(await persistence.withBarrier(async () => ({ ok: true, slot: 'save-1' })), { ok: true, slot: 'save-1' });
  assert.equal(writes, 0);
  assert.equal(persistence.unsaved, false);
});

test('the ordinary debounce persists the latest local edit once', async () => {
  let draft = { assign: { research: 0 } };
  const calls = [];
  const persistence = createDraftPersistence({ read: () => draft, delay: 1, write: async (sent) => { calls.push(sent); return stored(); } });
  draft = { assign: { research: 1 } };
  persistence.schedule();
  draft = { assign: { research: 2 } };
  persistence.schedule();
  await wait(15);
  assert.deepEqual(calls, [draft]);
  assert.equal(persistence.unsaved, false);
});

test('flushing cancels the debounce and serializes newer edits behind an in-flight write', async () => {
  let draft = { assign: { research: 0 } };
  const calls = [];
  const results = [];
  const pending = [];
  let writing = 0;
  const persistence = createDraftPersistence({
    read: () => draft,
    delay: 60_000,
    write: async (sent) => {
      assert.equal(writing, 0, 'only one request may write the campaign draft');
      writing += 1;
      calls.push(sent);
      const job = deferred();
      pending.push(job);
      const result = await job.promise;
      writing -= 1;
      return result;
    },
    onResult: (sent, result) => results.push([sent, result.stored]),
  });
  draft = { assign: { research: 1 } };
  persistence.schedule();
  const first = persistence.flush();
  assert.equal(persistence.unsaved, true);
  assert.equal(calls.length, 1);
  const previous = draft;
  draft = { assign: { research: 2 } };
  persistence.schedule();
  const second = persistence.flush();
  assert.equal(first, second);
  assert.equal(calls.length, 1);
  pending[0].resolve(stored());
  await wait(0);
  assert.deepEqual(calls, [previous, draft]);
  pending[1].resolve(stored());
  assert.equal((await first).stored, true);
  assert.deepEqual(results, [[previous, true], [draft, true]]);
  assert.equal(persistence.unsaved, false);
});

test('a refused flush retains the local draft, prevents the operation and can be retried', async () => {
  let draft = { orders: [] };
  let attempts = 0;
  let operations = 0;
  const refusal = { stored: false, issues: [{ code: 'server', severity: 'error', path: '', message: 'connection failed' }] };
  const persistence = createDraftPersistence({
    read: () => draft,
    write: async () => ++attempts === 1 ? refusal : stored(),
  });
  draft = { orders: [{ id: 'o1', type: 'explore', params: { tile: '0,0' } }] };
  const local = draft;
  assert.deepEqual(await persistence.withBarrier(async () => { operations += 1; return { ok: true }; }), { ok: false, issues: refusal.issues });
  assert.equal(operations, 0);
  assert.equal(draft, local);
  assert.equal(persistence.unsaved, true);
  assert.equal(persistence.locked, false);
  assert.equal((await persistence.flush()).stored, true);
  assert.equal(persistence.unsaved, false);
  assert.equal(attempts, 2);
});

test('a thrown write becomes a retryable refusal and does not run a snapshot operation', async () => {
  let draft = { orders: [] };
  let fail = true;
  const persistence = createDraftPersistence({
    read: () => draft,
    write: async () => { if (fail) throw new Error('offline'); return stored(); },
  });
  draft = { orders: [{ id: 'o1' }] };
  const result = await persistence.withBarrier(() => assert.fail('operation must wait for a stored draft'));
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].message, 'offline');
  assert.equal(persistence.unsaved, true);
  fail = false;
  assert.equal((await persistence.flush()).stored, true);
  assert.equal(persistence.unsaved, false);
});

test('a successful restore drains writes and keeps all old-page writes blocked until reload', async () => {
  let draft = { assign: { research: 0 } };
  let disk = draft;
  const calls = [];
  const initial = deferred();
  const persistence = createDraftPersistence({
    read: () => draft,
    delay: 1,
    write: async (sent) => {
      calls.push(sent);
      await initial.promise;
      disk = sent;
      return stored();
    },
  });
  draft = { assign: { research: 1 } };
  persistence.schedule();
  const flushing = persistence.flush();
  const snapshot = { assign: { research: 2 } };
  let restored = false;
  const loading = persistence.withBarrier(async () => {
    assert.equal(disk, draft);
    disk = snapshot;
    restored = true;
    return { ok: true, slot: 'save-1' };
  }, { keepLocked: true });
  assert.equal(persistence.locked, true);
  assert.equal(restored, false);
  persistence.schedule();
  assert.equal((await persistence.flush()).stored, false);
  const concurrent = await persistence.withBarrier(() => assert.fail('a second load must not run'));
  assert.equal(concurrent.issues[0].code, 'cli.locked');
  initial.resolve();
  await flushing;
  assert.equal((await loading).ok, true);
  assert.equal(persistence.locked, true);
  assert.equal(persistence.unsaved, false);
  persistence.schedule();
  await wait(15);
  assert.equal(calls.length, 1);
  assert.equal(disk, snapshot, 'no stale draft may overwrite the restored snapshot');
});

test('a refused snapshot operation releases the barrier for further edits', async () => {
  let draft = { orders: [] };
  let writes = 0;
  const persistence = createDraftPersistence({ read: () => draft, write: async () => { writes += 1; return stored(); } });
  assert.deepEqual(await persistence.withBarrier(async () => ({ ok: false, issues: [] }), { keepLocked: true }), { ok: false, issues: [] });
  assert.equal(persistence.locked, false);
  draft = { orders: [{ id: 'o1' }] };
  assert.equal((await persistence.flush()).stored, true);
  assert.equal(writes, 1);
});

test('a canonical new-turn draft remains clean when an older write is refused', async () => {
  let draft = { turn: 0, orders: [] };
  const pending = deferred();
  let writes = 0;
  const persistence = createDraftPersistence({ read: () => draft, write: async () => { writes += 1; return pending.promise; } });
  draft = { turn: 0, orders: [{ id: 'o1' }] };
  const flushing = persistence.flush();
  draft = { turn: 1, orders: [] };
  persistence.markClean();
  pending.resolve({ stored: false, issues: [{ code: 'phase', severity: 'error', path: '', message: 'old turn' }] });
  assert.equal((await flushing).stored, true);
  assert.equal(persistence.unsaved, false);
  assert.equal(writes, 1);
});

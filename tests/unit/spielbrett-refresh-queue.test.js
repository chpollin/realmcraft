import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createRefreshQueue } from '../../spielbrett/js/data/refresh-queue.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function until(predicate) {
  for (let i = 0; i < 100 && !predicate(); i += 1) await wait(5);
  assert.ok(predicate(), 'refresh reached the expected state');
}

test('bursts coalesce and a notification during a read schedules one serial follow-up', async () => {
  const hold = deferred();
  let calls = 0, active = 0, maximum = 0;
  const queue = createRefreshQueue({ delay: 1, refresh: async () => {
    calls += 1; active += 1; maximum = Math.max(maximum, active);
    if (calls === 1) await hold.promise;
    active -= 1;
  } });
  try {
    queue.request('view'); queue.request('view');
    await until(() => calls === 1);
    queue.request('view'); queue.request('view');
    await wait(10);
    assert.equal(calls, 1);
    hold.resolve();
    await until(() => calls === 2 && active === 0);
    assert.equal(maximum, 1);
  } finally { queue.stop(); hold.resolve(); }
});

test('a failed read retries without another invalidation and does not lose other work', async () => {
  const calls = [];
  let first = true;
  const queue = createRefreshQueue({ delay: 1, retryDelay: 1, refresh: async key => {
    calls.push(key);
    if (key === 'view' && first) { first = false; throw new Error('transient'); }
  } });
  try {
    queue.request('view', 'status');
    await until(() => calls.length === 3);
    assert.deepEqual(calls, ['view', 'status', 'view']);
  } finally { queue.stop(); }
});

test('pausing invalidates a pending response and resumes with fresh work', async () => {
  const hold = deferred();
  const published = [];
  let calls = 0;
  const queue = createRefreshQueue({ delay: 1, refresh: async (key, current) => {
    const call = ++calls;
    if (call === 1) await hold.promise;
    if (current()) published.push(call);
  } });
  try {
    queue.request('view');
    await until(() => calls === 1);
    queue.pause(); hold.resolve();
    await wait(10);
    assert.deepEqual(published, []);
    queue.resume();
    await until(() => published.length === 1);
    assert.deepEqual(published, [2]);
  } finally { queue.stop(); hold.resolve(); }
});

test('stopping suppresses late publication and removes pending retries', async () => {
  const hold = deferred();
  let started = false, published = false, calls = 0;
  const queue = createRefreshQueue({ delay: 1, refresh: async (key, current) => {
    calls += 1; started = true; await hold.promise;
    if (current()) published = true;
  } });
  queue.request('view');
  await until(() => started);
  queue.request('status'); queue.stop(); hold.resolve(); queue.resume(); queue.request('view');
  await wait(15);
  assert.equal(published, false);
  assert.equal(calls, 1);
});

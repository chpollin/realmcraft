// Unit-Tests fuer js/state.js — In-Memory-Stand mit Pub/Sub.
// Vertrag: setState/getState/subscribe; subscribe gibt eine unsubscribe-Funktion zurueck.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { setState, getState, subscribe } from '../../js/state.js';

test('setState dann getState liefert exakt den gesetzten Stand', () => {
  const data = { volk: { name: 'Die Karren' }, berater: [] };
  setState(data);
  assert.equal(getState(), data);
});

test('subscribe: Callback wird bei setState mit dem neuen State gerufen', () => {
  let received = null;
  let calls = 0;
  const unsubscribe = subscribe((s) => {
    received = s;
    calls += 1;
  });

  const next = { volk: { name: 'Test' } };
  setState(next);

  assert.equal(calls, 1);
  assert.equal(received, next);

  unsubscribe();
});

test('subscribe: mehrere Abonnenten werden alle benachrichtigt', () => {
  const seen = [];
  const off1 = subscribe((s) => seen.push(['a', s]));
  const off2 = subscribe((s) => seen.push(['b', s]));

  const next = { marke: 1 };
  setState(next);

  assert.equal(seen.length, 2);
  assert.deepEqual(
    seen.map((e) => e[0]).sort(),
    ['a', 'b'],
  );
  for (const [, s] of seen) assert.equal(s, next);

  off1();
  off2();
});

test('unsubscribe stoppt weitere Benachrichtigungen', () => {
  let calls = 0;
  const unsubscribe = subscribe(() => {
    calls += 1;
  });

  setState({ x: 1 });
  assert.equal(calls, 1);

  unsubscribe();
  setState({ x: 2 });
  assert.equal(calls, 1, 'nach unsubscribe darf der Callback nicht mehr feuern');
});

test('unsubscribe eines Abonnenten laesst andere unberuehrt', () => {
  let aCalls = 0;
  let bCalls = 0;
  const offA = subscribe(() => {
    aCalls += 1;
  });
  const offB = subscribe(() => {
    bCalls += 1;
  });

  setState({ s: 1 });
  assert.equal(aCalls, 1);
  assert.equal(bCalls, 1);

  offA();
  setState({ s: 2 });
  assert.equal(aCalls, 1, 'A wurde abgemeldet');
  assert.equal(bCalls, 2, 'B laeuft weiter');

  offB();
});

test('subscribe gibt eine Funktion zurueck', () => {
  const off = subscribe(() => {});
  assert.equal(typeof off, 'function');
  off();
});

test('doppeltes unsubscribe wirft nicht und bleibt folgenlos', () => {
  let calls = 0;
  const off = subscribe(() => {
    calls += 1;
  });
  off();
  assert.doesNotThrow(() => off());
  setState({ y: 1 });
  assert.equal(calls, 0);
});

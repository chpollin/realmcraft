// tests/unit/store.test.js — lokaler Verlauf ueber eine In-Memory-localStorage.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

// Vor dem Import von store.js: globalThis.localStorage bereitstellen.
globalThis.localStorage = memStorage();
const store = await import('../../js/store.js');

beforeEach(() => {
  globalThis.localStorage = memStorage();
});

test('leerer Verlauf: loadLast null, list leer', () => {
  assert.equal(store.loadLast(), null);
  assert.deepEqual(store.list(), []);
});

test('saveSnapshot legt ab, loadLast gibt den letzten zurueck', () => {
  store.saveSnapshot({ meta: { kapitel: 3, zeit: { jahr: 14 } } });
  store.saveSnapshot({ meta: { kapitel: 4, zeit: { jahr: 19 } } });
  assert.equal(store.loadLast().meta.kapitel, 4);
  assert.equal(store.list().length, 2);
});

test('identischer Stand wird nicht doppelt abgelegt', () => {
  const s = { meta: { kapitel: 4 } };
  store.saveSnapshot(s);
  store.saveSnapshot({ ...s });
  assert.equal(store.list().length, 1);
});

test('getAt liefert den Stand an Position', () => {
  store.saveSnapshot({ meta: { kapitel: 3 } });
  store.saveSnapshot({ meta: { kapitel: 4 } });
  assert.equal(store.getAt(0).meta.kapitel, 3);
  assert.equal(store.getAt(1).meta.kapitel, 4);
});

test('list traegt Kapitel und Zeit', () => {
  store.saveSnapshot({ meta: { spielname: 'Die Karren', kapitel: 4, zeit: { jahreszeit: 'Fruehling', jahr: 19 } } });
  const [it] = store.list();
  assert.equal(it.kapitel, 4);
  assert.equal(it.jahr, 19);
  assert.equal(it.spielname, 'Die Karren');
});

test('clear leert den Verlauf', () => {
  store.saveSnapshot({ meta: { kapitel: 4 } });
  store.clear();
  assert.equal(store.loadLast(), null);
});

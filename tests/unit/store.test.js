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

test('lastForParty gibt den letzten Stand DERSELBEN Partie zurueck', () => {
  store.saveSnapshot({ meta: { spielname: 'Die Karren', kapitel: 4 } });
  store.saveSnapshot({ meta: { spielname: 'Die Gestrandeten', kapitel: 1 } });
  store.saveSnapshot({ meta: { spielname: 'Die Gestrandeten', kapitel: 1, zeit: { jahreszeit: 'Herbst' } } });
  assert.equal(store.lastForParty('Die Karren').meta.kapitel, 4);
  assert.equal(store.lastForParty('Die Gestrandeten').meta.zeit.jahreszeit, 'Herbst');
  assert.equal(store.lastForParty('Unbekannt'), null);
});

test('Partiewechsel erzeugt immer einen neuen Eintrag (kein partie-uebergreifendes Dedup)', () => {
  store.saveSnapshot({ meta: { spielname: 'A', kapitel: 1 } });
  store.saveSnapshot({ meta: { spielname: 'B', kapitel: 1 } });
  store.saveSnapshot({ meta: { spielname: 'A', kapitel: 1 } });
  assert.equal(store.list().length, 3);
});

test('gleiche Partie, identischer Stand: kein Doppeleintrag', () => {
  store.saveSnapshot({ meta: { spielname: 'A', kapitel: 1 } });
  store.saveSnapshot({ meta: { spielname: 'A', kapitel: 1 } });
  assert.equal(store.list().length, 1);
});

test('gameKey: Spielname vor Volksname, sonst null', () => {
  assert.equal(store.gameKey({ meta: { spielname: 'Die Karren' } }), 'Die Karren');
  assert.equal(store.gameKey({ volk: { name: 'die Gestrandeten' } }), 'die Gestrandeten');
  assert.equal(store.gameKey({}), null);
});

test('clear leert den Verlauf', () => {
  store.saveSnapshot({ meta: { kapitel: 4 } });
  store.clear();
  assert.equal(store.loadLast(), null);
});

test('Verlauf wird auf MAX=50 Eintraege getrimmt (aelteste fallen weg)', () => {
  for (let i = 1; i <= 55; i++) store.saveSnapshot({ meta: { kapitel: i } });
  const items = store.list();
  assert.equal(items.length, 50);
  // Behalten werden die letzten 50: Kapitel 6..55.
  assert.equal(items[0].kapitel, 6);
  assert.equal(items[49].kapitel, 55);
});

test('all() gibt alle Staende in chronologischer Reihenfolge', () => {
  store.saveSnapshot({ meta: { kapitel: 3 } });
  store.saveSnapshot({ meta: { kapitel: 4 } });
  const arr = store.all();
  assert.equal(arr.length, 2);
  assert.equal(arr[0].meta.kapitel, 3);
  assert.equal(arr[1].meta.kapitel, 4);
});

test('getAt ausserhalb des Bereichs liefert null', () => {
  store.saveSnapshot({ meta: { kapitel: 4 } });
  assert.equal(store.getAt(-1), null);
  assert.equal(store.getAt(999), null);
});

test('identischer Stand mit umgestellten Schluesseln zaehlt nicht als neu', () => {
  store.saveSnapshot({ meta: { kapitel: 4 }, grundgroessen: { nahrung: 8, wissen: 16 } });
  // Gleicher Inhalt, andere Schluesselreihenfolge: kein neuer Verlaufseintrag.
  store.saveSnapshot({ grundgroessen: { wissen: 16, nahrung: 8 }, meta: { kapitel: 4 } });
  assert.equal(store.list().length, 1);
});

// localStorage mit hartem Kontingent: setItem wirft wie im Browser
// QuotaExceededError, sobald alle Schluessel und Werte zusammen limit Zeichen
// ueberschreiten. Der alte Wert bleibt dann unveraendert.
function quotaStorage(limit) {
  const m = new Map();
  const size = () => [...m].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const s = String(v);
      const next = size() - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + s.length;
      if (next > limit) {
        const err = new Error('quota');
        err.name = 'QuotaExceededError';
        throw err;
      }
      m.set(k, s);
    },
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

test('volles Kontingent: aelteste Eintraege fallen weg, der neue Stand wird abgelegt', () => {
  globalThis.localStorage = quotaStorage(3000);
  const pad = 'x'.repeat(500);
  for (let i = 1; i <= 10; i++) {
    const idx = store.saveSnapshot({ meta: { kapitel: i }, notiz: pad });
    assert.ok(idx >= 0, `Kapitel ${i} abgelegt`);
  }
  const items = store.list();
  assert.ok(items.length > 1 && items.length < 10);
  assert.equal(store.loadLast().meta.kapitel, 10);
  // Die behaltenen Eintraege sind die juengsten, lueckenlos.
  assert.deepEqual(items.map((it) => it.kapitel), items.map((_, i) => 11 - items.length + i));
});

test('passt nicht einmal der neue Stand allein: -1, bisheriger Verlauf bleibt', () => {
  globalThis.localStorage = quotaStorage(1000);
  assert.equal(store.saveSnapshot({ meta: { kapitel: 1 } }), 0);
  assert.equal(store.saveSnapshot({ meta: { kapitel: 2 }, notiz: 'x'.repeat(2000) }), -1);
  assert.equal(store.loadLast().meta.kapitel, 1);
});

test('anderer Speicherfehler (gesperrt): -1 statt stiller Erfolgsmeldung', () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {
      const err = new Error('denied');
      err.name = 'SecurityError';
      throw err;
    },
    removeItem: () => {},
  };
  assert.equal(store.saveSnapshot({ meta: { kapitel: 1 } }), -1);
});

test('eingebettete Bild-dataUrls landen nicht im Verlauf, Referenzfoto bleibt', () => {
  const big = 'data:image/png;base64,' + 'A'.repeat(1000);
  const state = {
    meta: { spielname: 'P', kapitel: 1 },
    karte: { prompt: 'k', dataUrl: big },
    berater: [{ id: 'b', portrait: { dataUrl: big, prompt: 'p' }, referenz: { dataUrl: 'data:image/jpeg;base64,REF' } }],
    bildChronik: { b: { aktiv: 'k1', versionen: [{ key: 'k1', label: 'Stand', dataUrl: big }] } },
  };
  store.saveSnapshot(state);
  const raw = globalThis.localStorage.getItem('rc.history');
  assert.ok(!raw.includes('AAAA'));
  const back = store.loadLast();
  assert.equal(back.karte.dataUrl, undefined);
  assert.equal(back.karte.prompt, 'k');
  assert.deepEqual(back.berater[0].portrait, { prompt: 'p' });
  assert.equal(back.berater[0].referenz.dataUrl, 'data:image/jpeg;base64,REF');
  assert.deepEqual(back.bildChronik.b.versionen[0], { key: 'k1', label: 'Stand' });
  // Der uebergebene Stand selbst bleibt unangetastet (die App rendert ihn weiter).
  assert.equal(state.karte.dataUrl, big);
  assert.equal(state.berater[0].portrait.dataUrl, big);
});

test('gleicher Stand mit und ohne Bilder zaehlt nicht als neu', () => {
  store.saveSnapshot({ meta: { kapitel: 1 }, karte: { prompt: 'k', dataUrl: 'data:image/png;base64,AA' } });
  store.saveSnapshot({ meta: { kapitel: 1 }, karte: { prompt: 'k' } });
  assert.equal(store.list().length, 1);
});

test('Altbestand mit Bildern wird beim naechsten Schreiben bereinigt', () => {
  globalThis.localStorage.setItem(
    'rc.history',
    JSON.stringify([{ savedAt: 1, spielname: 'P', state: { meta: { spielname: 'P' }, karte: { dataUrl: 'data:image/png;base64,ALT' } } }]),
  );
  store.saveSnapshot({ meta: { spielname: 'P', kapitel: 2 } });
  assert.ok(!globalThis.localStorage.getItem('rc.history').includes('ALT'));
  assert.equal(store.list().length, 2);
});

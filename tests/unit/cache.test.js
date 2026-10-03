// Unit-Tests fuer js/images/cache.js. makeKey wird rein geprueft. In Node gibt
// es kein IndexedDB, cacheGet/cachePut laufen hier also allein ueber den
// localStorage-Spiegel; der IndexedDB-Pfad liegt in den E2E-Tests.
// Vertrag: makeKey(parts) -> stabiler, deterministischer Hash-String.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeKey, cacheGet, cachePut } from '../../js/images/cache.js';

test('makeKey: gleiche Teile ergeben denselben Key (deterministisch)', () => {
  const parts = ['borka', 'erscheinung', 'visualStyle', 'gemini-3.1-flash-image'];
  const a = makeKey(parts);
  const b = makeKey(['borka', 'erscheinung', 'visualStyle', 'gemini-3.1-flash-image']);
  assert.equal(a, b);
});

test('makeKey: liefert einen nicht-leeren String', () => {
  const key = makeKey(['map', 'prompt', 'mapStyle', 'gemini-3-pro-image']);
  assert.equal(typeof key, 'string');
  assert.ok(key.length > 0);
});

test('makeKey: andere Teile ergeben einen anderen Key', () => {
  const base = makeKey(['borka', 'erscheinung', 'style', 'model']);
  const other = makeKey(['idr', 'erscheinung', 'style', 'model']);
  assert.notEqual(base, other);
});

test('makeKey: Reihenfolge der Teile ist signifikant', () => {
  const ab = makeKey(['a', 'b']);
  const ba = makeKey(['b', 'a']);
  assert.notEqual(ab, ba);
});

test('makeKey: Verschiebung von Inhalt ueber die Grenze aendert den Key', () => {
  // Naiver Join ohne Trenner wuerde ['ab','c'] und ['a','bc'] kollidieren lassen.
  const k1 = makeKey(['ab', 'c']);
  const k2 = makeKey(['a', 'bc']);
  assert.notEqual(k1, k2);
});

test('makeKey: realistische Portrait- und Karten-Keys unterscheiden sich', () => {
  const portrait = makeKey([
    'borka',
    'Verwittertes Gesicht',
    'visualStyle',
    'gemini-3.1-flash-image',
  ]);
  const map = makeKey([
    'map',
    'Saubere moderne Landkarte',
    'mapStyle',
    'gemini-3-pro-image',
  ]);
  assert.notEqual(portrait, map);
});

test('makeKey: Hash bleibt bitgleich (sonst verwaisen alle gecachten Bilder)', () => {
  assert.equal(makeKey(['map', 'prompt', 'style', 'model']), 'a47518f0');
  assert.equal(makeKey([]), '811c9dc5');
  assert.equal(makeKey('x'), makeKey(['x']));
});

function memStorage() {
  const m = new Map();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

const small = (n) => `data:image/png;base64,${String(n).padStart(8, '0')}`;

test('Spiegel: Altbestand ohne Index wird beim ersten Zugriff entfernt, Fremdschluessel bleiben', async () => {
  const ls = memStorage();
  globalThis.localStorage = ls;
  ls.setItem('realmcraft.img.deadbeef', 'data:image/png;base64,' + 'A'.repeat(500_000));
  ls.setItem('rc.history', '[]');
  assert.equal(await cacheGet('deadbeef'), null);
  assert.deepEqual(ls.keys(), ['rc.history']);
});

test('Spiegel: kleine Bilder ueberstehen fehlendes IndexedDB', async () => {
  globalThis.localStorage = memStorage();
  await cachePut('k1', small(1));
  assert.equal(await cacheGet('k1'), small(1));
});

test('Spiegel: grosse Bilder werden nicht nach localStorage gespiegelt', async () => {
  const ls = memStorage();
  globalThis.localStorage = ls;
  await cachePut('k1', small(1));
  await cachePut('k1', 'data:image/png;base64,' + 'B'.repeat(200_000));
  // Der alte kleine Spiegel desselben Schluessels waere veraltet: weg damit.
  assert.equal(await cacheGet('k1'), null);
  assert.ok(ls.keys().every((k) => ls.getItem(k).length < 1000));
});

test('Spiegel: begrenzte Zahl, die aeltesten fallen zuerst', async () => {
  const ls = memStorage();
  globalThis.localStorage = ls;
  for (let i = 0; i < 20; i++) await cachePut(`k${i}`, small(i));
  assert.equal(await cacheGet('k0'), null);
  assert.equal(await cacheGet('k19'), small(19));
  const mirrored = ls.keys().filter((k) => k.startsWith('realmcraft.img.') && k !== 'realmcraft.img.index');
  assert.ok(mirrored.length > 0 && mirrored.length < 20);
});

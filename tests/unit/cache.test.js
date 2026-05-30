// Unit-Tests fuer js/images/cache.js — nur makeKey wird hier rein geprueft.
// cacheGet/cachePut nutzen IndexedDB und werden NICHT in Node getestet
// (kein IndexedDB in der Node-Laufzeit); deren Abdeckung liegt in den E2E-Tests.
// Vertrag: makeKey(parts) -> stabiler, deterministischer Hash-String.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { makeKey } from '../../js/images/cache.js';

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

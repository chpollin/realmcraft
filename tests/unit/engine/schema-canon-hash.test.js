// Canonical JSON and the 64-bit hash every idempotency check and probe
// fingerprint relies on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canon, canonEqual } from '../../../engine/core/canon.js';
import { hash64, hashValue } from '../../../engine/core/hash.js';

test('canon sorts keys at every depth and keeps array order', () => {
  assert.equal(canon({ b: 1, a: { d: [3, 1], c: null } }), '{"a":{"c":null,"d":[3,1]},"b":1}');
  assert.equal(canon([{ y: 1, x: 2 }]), '[{"x":2,"y":1}]');
  assert.equal(canon('ä"'), JSON.stringify('ä"'));
});

test('canon drops undefined properties like JSON and folds -0 into 0', () => {
  assert.equal(canon({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(canon(-0), '0');
});

test('canon rejects values JSON would silently coerce', () => {
  assert.throws(() => canon(NaN), /non-finite/);
  assert.throws(() => canon({ a: Infinity }), /non-finite/);
  assert.throws(() => canon([undefined]), /undefined/);
  assert.throws(() => canon(new Date(0)), /non-plain/);
  assert.throws(() => canon(() => 1), /unsupported/);
  assert.throws(() => canon(1n), /unsupported/);
});

test('canonEqual ignores key order only', () => {
  assert.equal(canonEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  assert.equal(canonEqual([1, 2], [2, 1]), false);
});

test('hash64 is 16 hex digits and stable across runs', () => {
  // A change here breaks every stored proposal hash and roll fingerprint.
  assert.match(hash64('realmcraft'), /^[0-9a-f]{16}$/);
  assert.equal(hash64('realmcraft'), REFERENCE.realmcraft);
  assert.equal(hash64(''), REFERENCE.empty);
  assert.equal(hash64('Überdauern'), REFERENCE.umlaut);
});

test('hashValue: key order does not change the hash, array order does', () => {
  assert.equal(hashValue({ a: 1, b: [1, 2] }), hashValue({ b: [1, 2], a: 1 }));
  assert.notEqual(hashValue({ a: [1, 2] }), hashValue({ a: [2, 1] }));
});

test('hash64 separates near-identical inputs in both lanes', () => {
  const a = hash64('T6:schar:o2');
  const b = hash64('T6:schar:o3');
  assert.notEqual(a.slice(0, 8), b.slice(0, 8));
  assert.notEqual(a.slice(8), b.slice(8));
  assert.notEqual(hash64('ab'), hash64('ba'));
});

test('hash64 accepts only strings', () => {
  assert.throws(() => hash64({}), /expects a string/);
});

// Pinned outputs of the current implementation (regression guard, not an
// external reference). Lane A is checked against published FNV-1a vectors below.
const REFERENCE = {
  realmcraft: '187c1fb27c9d7df3',
  empty: 'ab3e7c0b2c773e2c',
  umlaut: '3e29b30ca292af67',
};

// Independent Murmur3 finaliser, so the lane-A check does not reuse hash.js code.
function fmix(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0).toString(16).padStart(8, '0');
}

test('lane A is standard FNV-1a 32 (published vectors) before finalisation', () => {
  // FNV-1a 32: "" -> 811c9dc5, "a" -> e40c292c, "foobar" -> bf9cf968; the lane then mixes in the byte length.
  assert.equal(hash64('').slice(0, 8), fmix(0x811c9dc5 ^ 0));
  assert.equal(hash64('a').slice(0, 8), fmix(0xe40c292c ^ 1));
  assert.equal(hash64('foobar').slice(0, 8), fmix(0xbf9cf968 ^ 6));
});

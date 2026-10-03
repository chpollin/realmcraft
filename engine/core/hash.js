// Synchronous 64-bit hash as 16 hex digits, built from two independent 32-bit
// FNV-1a lanes over the UTF-8 bytes. Web Crypto would be stronger but is
// asynchronous, and preview, ingest and fingerprints must stay synchronous and
// identical in Node and browser. The hash detects duplicates and stale rolls;
// it is not a defence against a deliberate collision.

import { canon } from './canon.js';

const PRIME = 0x01000193;
// Lane A uses the standard FNV-1a offset basis, lane B the low word of the
// 64-bit FNV offset basis, so the lanes start apart.
const OFFSET_A = 0x811c9dc5;
const OFFSET_B = 0x84222325;

const encoder = new TextEncoder();

// Murmur3 finaliser: plain FNV leaves the high bits weakly mixed for short
// inputs, which would make the hex prefix of similar strings look alike.
function fmix(h) {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function hash64(text) {
  if (typeof text !== 'string') throw new TypeError('hash64: expects a string, use hashValue for data');
  const bytes = encoder.encode(text);
  let a = OFFSET_A;
  let b = OFFSET_B;
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes[i], PRIME);
    // Lane B also folds in the position, so a transposition that cancels in one
    // lane does not cancel in both.
    b = Math.imul(b ^ bytes[i] ^ (i & 0xff), PRIME);
  }
  a = fmix(a ^ bytes.length);
  b = fmix(b ^ bytes.length);
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** Hash of a JSON value in canonical form (key order does not matter). */
export function hashValue(value) {
  return hash64(canon(value));
}

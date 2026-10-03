// Unit tests for js/format.js, the DOM-free formatting helpers shared by the
// render modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { roman, initials, signed, signedZeroPlus } from '../../js/format.js';

test('roman: 1 to 10 as Roman numerals, otherwise the number as string', () => {
  assert.equal(roman(1), 'I');
  assert.equal(roman(4), 'IV');
  assert.equal(roman(10), 'X');
  assert.equal(roman(11), '11');
  assert.equal(roman(0), '0');
  assert.equal(roman(undefined), 'undefined');
});

test('initials: first letter upper case, leading "Die " dropped, "?" for nothing', () => {
  assert.equal(initials('Die Karren'), 'K');
  assert.equal(initials('idr'), 'I');
  assert.equal(initials(''), '?');
  assert.equal(initials(null), '?');
});

test('signed: plus only for positive numbers', () => {
  assert.equal(signed(3), '+3');
  assert.equal(signed(0), '0');
  assert.equal(signed(-2), '-2');
});

test('signedZeroPlus: plus for zero as well', () => {
  assert.equal(signedZeroPlus(0), '+0');
  assert.equal(signedZeroPlus(1), '+1');
  assert.equal(signedZeroPlus(-1), '-1');
});

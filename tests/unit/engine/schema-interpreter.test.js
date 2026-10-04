// The subset interpreter in engine/content/schema.js, keyword by keyword, plus
// the issue constructor it reports through.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, check, assertSubset } from '../../../engine/content/schema.js';
import { issue, CODES, hasErrors } from '../../../engine/core/issues.js';

const codes = (schema, value) => validate(schema, value).map((i) => `${i.code} ${i.path}`);

test('type distinguishes integer, number, null, array and object', () => {
  assert.deepEqual(codes({ type: 'integer' }, 3), []);
  assert.deepEqual(codes({ type: 'integer' }, 3.5), ['schema.type ']);
  assert.deepEqual(codes({ type: 'number' }, 3), []);
  assert.deepEqual(codes({ type: 'object' }, []), ['schema.type ']);
  assert.deepEqual(codes({ type: 'object' }, null), ['schema.type ']);
  assert.deepEqual(codes({ type: 'array' }, {}), ['schema.type ']);
  assert.deepEqual(codes({ type: 'null' }, null), []);
  assert.deepEqual(codes({ type: 'boolean' }, 0), ['schema.type ']);
});

test('enum and const compare structurally, independent of key order', () => {
  assert.deepEqual(codes({ const: { a: 1, b: [2] } }, { b: [2], a: 1 }), []);
  assert.deepEqual(codes({ const: 1 }, '1'), ['schema.const ']);
  assert.deepEqual(codes({ enum: ['a', 'b'] }, 'c'), ['schema.enum ']);
  assert.deepEqual(codes({ enum: [{ x: 1 }] }, { x: 1 }), []);
});

test('required, closed objects and maps with constrained keys', () => {
  const s = { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'integer' } } };
  assert.deepEqual(codes(s, {}), ['schema.required /a']);
  assert.deepEqual(codes(s, { a: 1, b: 2 }), ['schema.additional /b']);
  const m = { type: 'object', propertyNames: { type: 'string', pattern: '^[a-z]+$' }, additionalProperties: { type: 'integer', minimum: 0 } };
  assert.deepEqual(codes(m, { ok: 1 }), []);
  assert.deepEqual(codes(m, { Bad: 1 }), ['schema.property_name /Bad']);
  assert.deepEqual(codes(m, { ok: -1 }), ['schema.minimum /ok']);
});

test('paths are JSON Pointers with escaping', () => {
  const s = { type: 'object', additionalProperties: { type: 'integer' } };
  assert.deepEqual(codes(s, { 'a/b': 'x', 'c~d': 'y' }), ['schema.type /a~1b', 'schema.type /c~0d']);
});

test('array length and item validation', () => {
  const s = { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string' } };
  assert.deepEqual(codes(s, []), ['schema.min_items ']);
  assert.deepEqual(codes(s, ['a', 'b', 'c']), ['schema.max_items ']);
  assert.deepEqual(codes(s, ['a', 1]), ['schema.type /1']);
});

test('numeric bounds are inclusive', () => {
  const s = { type: 'integer', minimum: -2, maximum: 2 };
  assert.deepEqual(codes(s, -2), []);
  assert.deepEqual(codes(s, 2), []);
  assert.deepEqual(codes(s, 3), ['schema.maximum ']);
  assert.deepEqual(codes(s, -3), ['schema.minimum ']);
});

test('string length counts code points and patterns use unicode mode', () => {
  assert.deepEqual(codes({ type: 'string', maxLength: 1 }, '\u{1F600}'), []);
  assert.deepEqual(codes({ type: 'string', minLength: 2 }, 'ä'), ['schema.min_length ']);
  assert.deepEqual(codes({ type: 'string', pattern: '^-?[0-9]+,-?[0-9]+$' }, '-3,12'), []);
  assert.deepEqual(codes({ type: 'string', pattern: '^[a-z]+$' }, 'Ab'), ['schema.pattern ']);
});

test('$ref resolves against root $defs and nests', () => {
  const s = { $defs: { n: { type: 'integer' }, pair: { type: 'array', items: { $ref: '#/$defs/n' } } }, $ref: '#/$defs/pair' };
  assert.deepEqual(codes(s, [1, 2]), []);
  assert.deepEqual(codes(s, [1, 'x']), ['schema.type /1']);
  assert.throws(() => validate({ $ref: '#/$defs/missing' }, 1), /unresolvable/);
});

test('oneOf requires exactly one passing branch', () => {
  const s = { oneOf: [{ type: 'integer' }, { type: 'number', minimum: 10 }] };
  assert.equal(check(s, 3).ok, true);
  // 12 is an integer and a number >= 10: two branches pass.
  assert.deepEqual(codes(s, 12), ['schema.one_of ']);
  assert.deepEqual(codes(s, 'x'), ['schema.one_of ']);
});

test('oneOf reports the branch selected by a const discriminator', () => {
  const op = (name, extra) => ({ type: 'object', additionalProperties: false, required: ['op', ...Object.keys(extra)], properties: { op: { const: name }, ...extra } });
  const s = { oneOf: [op('a', { n: { type: 'integer', maximum: 2 } }), op('b', { t: { type: 'string' } })] };
  assert.deepEqual(codes(s, { op: 'a', n: 3 }), ['schema.maximum /n']);
  assert.deepEqual(codes(s, { op: 'c' }), ['schema.discriminator /op']);
  assert.deepEqual(codes(s, { n: 1 }), ['schema.required /op']);
});

test('oneOf reports the only branch whose type fits, as for nullable values', () => {
  const s = { oneOf: [{ type: 'null' }, { type: 'integer', minimum: 1 }] };
  assert.deepEqual(codes(s, null), []);
  assert.deepEqual(codes(s, 0), ['schema.minimum ']);
});

test('oneOf reports the only object branch whose required keys are present', () => {
  const closed = (props) => ({ type: 'object', additionalProperties: false, required: Object.keys(props), properties: props });
  const s = { oneOf: [closed({ season: { type: 'string' } }), closed({ res: { type: 'string' }, value: { type: 'integer' } })] };
  assert.deepEqual(codes(s, { res: 'nahrung', value: 'x' }), ['schema.type /value']);
});

test('all issues are collected, not only the first', () => {
  const s = { type: 'object', additionalProperties: false, required: ['a', 'b'], properties: { a: { type: 'string' }, b: { type: 'string' } } };
  assert.equal(validate(s, { c: 1 }).length, 3);
});

test('assertSubset rejects keywords outside the subset and dangling refs', () => {
  assert.throws(() => assertSubset({ type: 'object', patternProperties: {} }), /patternProperties/);
  assert.throws(() => assertSubset({ allOf: [] }), /allOf/);
  assert.throws(() => assertSubset({ type: ['string', 'null'] }), /one type name/);
  assert.throws(() => assertSubset({ $ref: '#/$defs/x' }), /unresolvable/);
  assert.throws(() => assertSubset({ type: 'object', required: ['a'], properties: {} }), /required "a"/);
  assert.doesNotThrow(() => assertSubset({ $id: 'x', type: 'object', additionalProperties: { type: 'integer' } }));
});


test('issue() fills severity from the code table and rejects typos', () => {
  assert.deepEqual(issue('softcap', '/probes/0', 'capped'), { code: 'softcap', severity: 'warning', path: '/probes/0', message: 'capped' });
  assert.deepEqual(issue('cost', '', 'x', { refs: ['o1'] }).refs, ['o1']);
  assert.equal('refs' in issue('cost', '', 'x'), false);
  assert.throws(() => issue('coast', '', 'x'), /unknown code/);
  assert.equal(issue('handel.no_route', '', 'x', { severity: 'error' }).severity, 'error');
  assert.throws(() => issue('handel.no_route', '', 'x'), /needs a severity/);
  assert.equal(hasErrors([issue('softcap', '', 'x')]), false);
  for (const sev of Object.values(CODES)) assert.ok(sev === 'error' || sev === 'warning');
});

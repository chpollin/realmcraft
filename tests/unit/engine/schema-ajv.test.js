// The subset interpreter must judge like ajv (strict mode, JSON Schema 2020-12)
// on the whole fixture corpus. Besides the fixtures themselves, every fixture
// is mutated node by node (delete, retype, push out of range) so the
// comparison covers far more invalid shapes than hand-written fixtures could.
// ajv stays a dev dependency used only here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { validate, assertSubset } from '../../../engine/content/schema.js';

const DIR = fileURLToPath(new URL('../../fixtures/engine/', import.meta.url));
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')).fixtures;
const ajv = new Ajv2020({ strict: true, allErrors: true });
const compiled = Object.fromEntries(Object.entries(SCHEMAS).map(([n, s]) => [n, ajv.compile(s)]));

test('every schema stays inside the subset and compiles in ajv strict mode', () => {
  for (const [name, schema] of Object.entries(SCHEMAS)) {
    assert.doesNotThrow(() => assertSubset(schema), name);
    assert.equal(typeof compiled[name], 'function', name);
  }
});

const REPLACEMENTS = [null, 'x', '', 1.5, -1000000, 1000000, 0, true, [], {}];

// Deterministic variants: one change per variant at every node of the tree.
function* mutations(root) {
  const clone = () => structuredClone(root);
  const at = (obj, path) => path.reduce((o, k) => o[k], obj);
  function* walk(node, path) {
    if (path.length) {
      for (const r of REPLACEMENTS) {
        const c = clone();
        at(c, path.slice(0, -1))[path.at(-1)] = structuredClone(r);
        yield c;
      }
      if (typeof node === 'string') {
        const c = clone();
        at(c, path.slice(0, -1))[path.at(-1)] = `${node}#`;
        yield c;
      }
      const parent = at(root, path.slice(0, -1));
      if (!Array.isArray(parent)) {
        const c = clone();
        delete at(c, path.slice(0, -1))[path.at(-1)];
        yield c;
      }
    }
    if (Array.isArray(node)) {
      if (node.length) {
        const c = clone();
        at(c, path).push(structuredClone(node[0]));
        yield c;
      }
      for (let i = 0; i < node.length; i++) yield* walk(node[i], [...path, i]);
    } else if (node && typeof node === 'object') {
      const c = clone();
      at(c, path).zz = 1;
      yield c;
      for (const k of Object.keys(node)) yield* walk(node[k], [...path, k]);
    }
  }
  yield* walk(root, []);
}

for (const entry of manifest) {
  test(`interpreter agrees with ajv on ${entry.file} and its mutations`, () => {
    const data = JSON.parse(readFileSync(join(DIR, entry.file), 'utf8'));
    const schema = SCHEMAS[entry.schema];
    const judge = (v) => [validate(schema, v).length === 0, compiled[entry.schema](v)];
    const [mine, theirs] = judge(data);
    assert.equal(mine, theirs, 'fixture itself');
    assert.equal(mine, entry.valid, 'fixture verdict');
    if (entry.mutate === false) return;
    let count = 0;
    let rejected = 0;
    for (const variant of mutations(data)) {
      const [a, b] = judge(variant);
      if (a !== b) assert.fail(`disagreement (interpreter ${a}, ajv ${b}) on ${JSON.stringify(variant).slice(0, 400)}`);
      count++;
      if (!a) rejected++;
    }
    // Both verdicts must occur, or the comparison would prove nothing about one side.
    assert.ok(count > 20 && rejected > 0, `${count} variants, ${rejected} rejected`);
    if (entry.valid) assert.ok(rejected < count, `${count} variants, all rejected`);
  });
}

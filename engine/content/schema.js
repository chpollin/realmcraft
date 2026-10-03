// Interpreter for the JSON Schema subset the engine schemas use, so browser and
// Node validate without a dependency. Supported keywords:
//   type (one name), enum, const, required, properties, additionalProperties
//   (boolean or schema), propertyNames, items (one schema), minItems, maxItems,
//   minimum, maximum, minLength, maxLength, pattern, oneOf, $ref to "#/$defs/<name>",
//   plus the annotations $id, $defs, $comment, title, description.
// additionalProperties as schema and propertyNames go beyond the kernel
// draft's list because maps keyed by people id, tile key or resource key
// cannot be validated otherwise; both behave in ajv exactly as here.
//
// Data problems become issues; schema problems (unknown keyword, dangling
// $ref) throw, because they are programming errors in engine/schemas.

import { issue, pointer } from '../core/issues.js';
import { canonEqual } from '../core/canon.js';

const KEYWORDS = new Set([
  'type', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'propertyNames',
  'items', 'minItems', 'maxItems', 'minimum', 'maximum', 'minLength', 'maxLength', 'pattern',
  'oneOf', '$ref', '$defs', '$id', '$comment', 'title', 'description',
]);
const TYPES = new Set(['object', 'array', 'string', 'integer', 'number', 'boolean', 'null']);

const patternCache = new Map();
function regex(p) {
  let re = patternCache.get(p);
  // The u flag matches ajv's default (unicodeRegExp), so both agree on patterns.
  if (!re) patternCache.set(p, (re = new RegExp(p, 'u')));
  return re;
}

function jsonType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(type, v) {
  const t = jsonType(v);
  return t === type || (type === 'number' && t === 'integer');
}

function resolve(ref, root) {
  const m = /^#\/\$defs\/([^/]+)$/.exec(ref);
  if (!m || !root.$defs || !Object.hasOwn(root.$defs, m[1])) throw new Error(`schema: unresolvable $ref "${ref}"`);
  return root.$defs[m[1]];
}

function deref(schema, root) {
  let s = schema;
  for (let guard = 0; s && s.$ref; guard++) {
    if (guard > 32) throw new Error('schema: $ref chain too long');
    s = resolve(s.$ref, root);
  }
  return s;
}

// Code points, not UTF-16 units, as ajv counts string length.
function length(s) {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

function show(v) {
  const s = JSON.stringify(v);
  return s && s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

function walk(schema, v, path, root, out) {
  if (schema.$ref) {
    walk(resolve(schema.$ref, root), v, path, root, out);
    // A $ref sibling keyword would be legal in 2020-12 but the engine never
    // needs it; rejecting it in assertSubset keeps both interpreters aligned.
    return;
  }
  if (Object.hasOwn(schema, 'const') && !canonEqual(schema.const, v)) {
    out.push(issue('schema.const', path, `must be ${show(schema.const)}`));
  }
  if (schema.enum && !schema.enum.some((e) => canonEqual(e, v))) {
    out.push(issue('schema.enum', path, `must be one of ${schema.enum.map(show).join(', ')}`));
  }
  if (schema.type && !typeMatches(schema.type, v)) {
    out.push(issue('schema.type', path, `must be ${schema.type}, got ${jsonType(v)}`));
    return;
  }
  if (schema.oneOf) oneOf(schema.oneOf, v, path, root, out);

  const t = jsonType(v);
  if (t === 'object') object(schema, v, path, root, out);
  else if (t === 'array') array(schema, v, path, root, out);
  else if (t === 'string') string(schema, v, path, out);
  else if (t === 'integer' || t === 'number') number(schema, v, path, out);
}

function object(schema, v, path, root, out) {
  for (const k of schema.required ?? []) {
    if (!Object.hasOwn(v, k)) out.push(issue('schema.required', pointer(path, k), `required property "${k}" is missing`));
  }
  const props = schema.properties ?? {};
  const extra = schema.additionalProperties;
  for (const k of Object.keys(v)) {
    const p = pointer(path, k);
    if (schema.propertyNames) {
      const sub = [];
      walk(schema.propertyNames, k, p, root, sub);
      if (sub.length) out.push(issue('schema.property_name', p, `property name "${k}" is invalid: ${sub[0].message}`));
    }
    if (Object.hasOwn(props, k)) walk(props[k], v[k], p, root, out);
    else if (extra === false) out.push(issue('schema.additional', p, `property "${k}" is not allowed`));
    else if (extra && typeof extra === 'object') walk(extra, v[k], p, root, out);
  }
}

function array(schema, v, path, root, out) {
  if (schema.minItems !== undefined && v.length < schema.minItems) {
    out.push(issue('schema.min_items', path, `must have at least ${schema.minItems} items, has ${v.length}`));
  }
  if (schema.maxItems !== undefined && v.length > schema.maxItems) {
    out.push(issue('schema.max_items', path, `must have at most ${schema.maxItems} items, has ${v.length}`));
  }
  if (schema.items) v.forEach((x, i) => walk(schema.items, x, pointer(path, i), root, out));
}

function string(schema, v, path, out) {
  const n = schema.minLength !== undefined || schema.maxLength !== undefined ? length(v) : 0;
  if (schema.minLength !== undefined && n < schema.minLength) {
    out.push(issue('schema.min_length', path, `must be at least ${schema.minLength} characters`));
  }
  if (schema.maxLength !== undefined && n > schema.maxLength) {
    out.push(issue('schema.max_length', path, `must be at most ${schema.maxLength} characters`));
  }
  if (schema.pattern !== undefined && !regex(schema.pattern).test(v)) {
    out.push(issue('schema.pattern', path, `${show(v)} does not match ${schema.pattern}`));
  }
}

function number(schema, v, path, out) {
  if (schema.minimum !== undefined && v < schema.minimum) out.push(issue('schema.minimum', path, `must be >= ${schema.minimum}, got ${v}`));
  if (schema.maximum !== undefined && v > schema.maximum) out.push(issue('schema.maximum', path, `must be <= ${schema.maximum}, got ${v}`));
}

function oneOf(branches, v, path, root, out) {
  const resolved = branches.map((b) => deref(b, root));
  const idx = indices(resolved.length);
  const disc = discriminatorOf(branches, resolved);
  const isObject = jsonType(v) === 'object';

  // A branch whose discriminator const differs from the value fails on that
  // const alone, so skipping it changes no verdict and saves walking every
  // primitive schema for every effect.
  if (disc && isObject) {
    if (!Object.hasOwn(v, disc)) {
      out.push(issue('schema.required', pointer(path, disc), `required property "${disc}" is missing`));
      return;
    }
    const hit = idx.filter((i) => canonEqual(resolved[i].properties[disc].const, v[disc]));
    if (hit.length === 0) {
      const allowed = resolved.map((s) => s.properties[disc].const).join(', ');
      out.push(issue('schema.discriminator', pointer(path, disc), `${disc} ${show(v[disc])} is not allowed here (allowed: ${allowed})`));
      return;
    }
    if (hit.length === 1) {
      walk(branches[hit[0]], v, path, root, out);
      return;
    }
  }

  const results = branches.map((b) => {
    const sub = [];
    walk(b, v, path, root, sub);
    return sub;
  });
  const passed = results.filter((r) => r.length === 0).length;
  if (passed === 1) return;
  if (passed > 1) {
    out.push(issue('schema.one_of', path, `matches ${passed} alternatives, expected exactly one`));
    return;
  }
  // The verdict follows JSON Schema exactly (one branch must pass). The issues
  // reported come from the branch the value most plausibly meant, because
  // "matches none of 30 alternatives" tells an agent nothing.
  let cand = idx.filter((i) => !resolved[i].type || typeMatches(resolved[i].type, v));
  if (cand.length > 1 && isObject) {
    const keyed = cand.filter((i) => (resolved[i].required ?? []).length > 0 && resolved[i].required.every((k) => Object.hasOwn(v, k)));
    if (keyed.length >= 1) cand = keyed;
  }
  if (cand.length === 1) {
    out.push(...results[cand[0]]);
    return;
  }
  out.push(issue('schema.one_of', path, `matches none of ${branches.length} alternatives`));
}

function indices(n) {
  return Array.from({ length: n }, (_, i) => i);
}

// A required property every branch fixes with a distinct const, such as "op"
// of a primitive or "kind" of an Entwicklung ("format" is shared, so it is no
// discriminator).
const discCache = new WeakMap();
function discriminatorOf(branches, resolved) {
  if (!discCache.has(branches)) discCache.set(branches, discriminator(resolved));
  return discCache.get(branches);
}

function discriminator(branches) {
  const first = branches[0];
  if (!first || !first.properties) return null;
  for (const k of first.required ?? []) {
    const fixed = branches.every((b) => b && b.properties && b.properties[k] && Object.hasOwn(b.properties[k], 'const') && (b.required ?? []).includes(k));
    if (!fixed) continue;
    const values = new Set(branches.map((b) => JSON.stringify(b.properties[k].const)));
    if (values.size === branches.length) return k;
  }
  return null;
}

/** All issues of `value` against `schema` (a root schema, $refs resolve against it). */
export function validate(schema, value) {
  const out = [];
  walk(schema, value, '', schema, out);
  return out;
}

export function check(schema, value) {
  const issues = validate(schema, value);
  return { ok: issues.length === 0, issues };
}

/**
 * Throws if a schema uses anything outside the subset, so the subset stays
 * the contract and ajv agreement stays meaningful. Returns the schema.
 */
export function assertSubset(schema) {
  const visit = (s, at) => {
    if (typeof s === 'boolean') throw new Error(`schema subset: boolean schema at ${at}`);
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error(`schema subset: not a schema at ${at}`);
    for (const k of Object.keys(s)) if (!KEYWORDS.has(k)) throw new Error(`schema subset: keyword "${k}" at ${at}`);
    if (s.$ref) {
      if (Object.keys(s).length !== 1) throw new Error(`schema subset: $ref with siblings at ${at}`);
      resolve(s.$ref, schema);
      return;
    }
    if (s.type !== undefined && !TYPES.has(s.type)) throw new Error(`schema subset: type must be one type name at ${at}`);
    if (s.required && s.properties) {
      for (const r of s.required) if (!Object.hasOwn(s.properties, r)) throw new Error(`schema subset: required "${r}" not in properties at ${at}`);
    }
    for (const [k, sub] of Object.entries(s.properties ?? {})) visit(sub, `${at}/properties/${k}`);
    if (s.additionalProperties !== undefined && typeof s.additionalProperties !== 'boolean') visit(s.additionalProperties, `${at}/additionalProperties`);
    if (s.propertyNames) visit(s.propertyNames, `${at}/propertyNames`);
    if (s.items) visit(s.items, `${at}/items`);
    (s.oneOf ?? []).forEach((b, i) => visit(b, `${at}/oneOf/${i}`));
    for (const [k, sub] of Object.entries(s.$defs ?? {})) {
      if (at !== '#') throw new Error(`schema subset: $defs only at the root, found at ${at}`);
      visit(sub, `#/$defs/${k}`);
    }
  };
  visit(schema, '#');
  return schema;
}

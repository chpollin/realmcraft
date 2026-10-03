// Canonical JSON: object keys sorted by UTF-16 code unit order, no whitespace,
// array order kept. Hashes of state, proposals and probe fingerprints are taken
// over this form, so two structurally equal values always hash alike no matter
// how their keys were inserted.
//
// Values JSON cannot represent faithfully throw instead of degrading the way
// JSON.stringify does (NaN to null, functions dropped), because a silent
// coercion would let two different values share one hash.

export function canon(value) {
  return write(value, '');
}

function write(v, path) {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'string':
      return JSON.stringify(v);
    case 'boolean':
      return v ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(v)) throw new TypeError(`canon: non-finite number at ${path || '/'}`);
      // -0 and 0 must not differ in canonical form.
      return JSON.stringify(v === 0 ? 0 : v);
    case 'object':
      if (Array.isArray(v)) {
        return `[${v.map((x, i) => {
          if (x === undefined) throw new TypeError(`canon: undefined array item at ${path}/${i}`);
          return write(x, `${path}/${i}`);
        }).join(',')}]`;
      }
      if (Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
        throw new TypeError(`canon: non-plain object at ${path || '/'}`);
      }
      return `{${Object.keys(v)
        .filter((k) => v[k] !== undefined)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${write(v[k], `${path}/${k}`)}`)
        .join(',')}}`;
    default:
      throw new TypeError(`canon: unsupported ${typeof v} at ${path || '/'}`);
  }
}

/** Deep equality under canonical form, as JSON Schema const and enum require. */
export function canonEqual(a, b) {
  return canon(a) === canon(b);
}

// Names every plain object inherits. The id patterns admit "constructor", and
// as a people, meter, resource or order id it would read the inherited member
// instead of an own value, so the kernel refuses such ids at its inputs.
export const RESERVED_KEYS = Object.freeze(new Set([...Object.getOwnPropertyNames(Object.prototype), 'prototype']));

/** JSON paths of object keys or string values that equal a reserved name, at most `max`. */
export function reservedKeyPaths(value, max = 8) {
  const out = [];
  const walk = (v, path) => {
    if (out.length >= max) return;
    if (typeof v === 'string') {
      if (RESERVED_KEYS.has(v)) out.push(path || '/');
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}/${i}`));
    } else if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        if (RESERVED_KEYS.has(k)) out.push(`${path}/${k}`);
        else walk(v[k], `${path}/${k}`);
      }
    }
  };
  walk(value, '');
  return out;
}

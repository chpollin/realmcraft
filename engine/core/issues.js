// Issue codes shared by kernel, content validator and schema interpreter. An
// issue is plain data, { code, severity, path, message, params?, refs? }, so it
// can sit in previews, round reports and rejected proposals without conversion.
//
// Modules add their own codes with their module id as prefix
// ("handel.no_route"); those carry an explicit severity because they cannot be
// listed here without the kernel knowing every module.
//
// `message` is English for logs and agents. The board builds its text from
// `code` and `params` alone (plan-m1, machine-readable issues): params carry
// every value the message interpolates, and a generic code (target, cost,
// format, phase, ...) names the concrete refusal in params.reason, a kebab-case
// key the board looks up as issue.<code>.<reason> before issue.<code>. A bag of
// resources travels as a string array of "res:n" entries, because params stay flat.

export const SEVERITIES = Object.freeze(['error', 'warning']);

export const CODES = Object.freeze({
  // turn pipeline (kernel draft section 3)
  finished: 'error',
  phase: 'error',
  stale: 'error',
  format: 'error',
  unknown_order: 'error',
  locked_order: 'error',
  slots: 'error',
  cost: 'error',
  target: 'error',
  duplicate: 'error',
  council_rejected: 'error',
  roll_missing: 'error',
  roll_stale: 'error',
  view_stale: 'error',
  free_slots: 'warning',
  shortfall: 'warning',
  softcap: 'warning',
  upkeep_risk: 'warning',
  labour: 'error',
  restricted: 'error',
  tamper: 'error',
  idle_labour: 'warning',

  // content validator (kernel draft section 5)
  unknown_primitive: 'error',
  misplaced_effect: 'error',
  dangling_ref: 'error',
  cycle: 'error',
  unknown_resource: 'error',
  unknown_tag: 'error',
  duplicate_name: 'error',
  tier_gap: 'error',
  budget_effect: 'error',
  budget_net: 'error',
  budget_price: 'error',
  missing_upkeep: 'error',
  stack_cap: 'error',
  ungrounded: 'error',
  limit: 'error',
  missing_label: 'error',
  pfad_tier: 'error',
  pfad_closed: 'error',

  // proposal ingest (kernel draft section 7)
  conflict: 'error',
  narrative_values: 'error',

  // schema interpreter, one code per keyword so tests can pin the exact failure
  'schema.type': 'error',
  'schema.enum': 'error',
  'schema.const': 'error',
  'schema.required': 'error',
  'schema.additional': 'error',
  'schema.property_name': 'error',
  'schema.min_items': 'error',
  'schema.max_items': 'error',
  'schema.minimum': 'error',
  'schema.maximum': 'error',
  'schema.min_length': 'error',
  'schema.max_length': 'error',
  'schema.pattern': 'error',
  'schema.one_of': 'error',
  'schema.discriminator': 'error',
});

const MODULE_CODE = /^[a-z][a-z0-9]*\.[a-z][a-z0-9_]*$/;
const REASON = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

// Params often echo draft or proposal input, which is untrusted: a value that
// is not flat is carried as its JSON text instead of failing the check that
// reports it, and an absent value is left out.
function paramValue(v) {
  if (typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return v;
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return [...v];
  return String(JSON.stringify(v) ?? v).slice(0, 200);
}

/** Encodes a resource bag { res: n } as the flat param ["res:n", ...], sorted by resource. */
export const bagParam = (bag) => Object.keys(bag ?? {}).sort().map((res) => `${res}:${bag[res]}`);

/**
 * Builds an issue. Throws on an unknown unprefixed code, because a typo in a
 * code would otherwise silently escape every test that filters by code, and
 * on a malformed reason, which always comes from kernel code and would leave
 * the board without a label key.
 */
export function issue(code, path, message, { severity, refs, params } = {}) {
  const known = Object.hasOwn(CODES, code) ? CODES[code] : null;
  if (!known && !MODULE_CODE.test(code)) throw new Error(`issue: unknown code "${code}"`);
  const sev = severity ?? known;
  if (!SEVERITIES.includes(sev)) throw new Error(`issue: code "${code}" needs a severity`);
  const out = { code, severity: sev, path: String(path ?? ''), message: String(message) };
  const flat = Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, paramValue(v)]);
  if (flat.length) {
    if (params.reason !== undefined && (typeof params.reason !== 'string' || !REASON.test(params.reason))) {
      throw new Error(`issue: reason "${params.reason}" of "${code}" is not a kebab-case key`);
    }
    out.params = Object.fromEntries(flat);
  }
  if (refs && refs.length) out.refs = [...refs];
  return out;
}

export function hasErrors(issues) {
  return issues.some((i) => i.severity === 'error');
}

/** JSON Pointer segment escaping (RFC 6901), shared by every producer of paths. */
export function pointer(base, segment) {
  return `${base}/${String(segment).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

// Issue codes shared by kernel, content validator and schema interpreter. An
// issue is plain data, { code, severity, path, message, refs? }, so it can sit
// in previews, round reports and rejected proposals without conversion.
//
// Modules add their own codes with their module id as prefix
// ("handel.no_route"); those carry an explicit severity because they cannot be
// listed here without the kernel knowing every module.

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

/**
 * Builds an issue. Throws on an unknown unprefixed code, because a typo in a
 * code would otherwise silently escape every test that filters by code.
 */
export function issue(code, path, message, { severity, refs } = {}) {
  const known = Object.hasOwn(CODES, code) ? CODES[code] : null;
  if (!known && !MODULE_CODE.test(code)) throw new Error(`issue: unknown code "${code}"`);
  const sev = severity ?? known;
  if (!SEVERITIES.includes(sev)) throw new Error(`issue: code "${code}" needs a severity`);
  const out = { code, severity: sev, path: String(path ?? ''), message: String(message) };
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

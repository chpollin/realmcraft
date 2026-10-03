// Helpers of the module tests (lebensweise, handel, magie): states over the K1
// test package, hooks and single orders driven through a mutation context, full
// seasons through seal and apply, and a log-coverage check.

import { readFileSync } from 'node:fs';
import { testEnv, CONTENT } from './pack.js';
import { makeEnv } from '../../../../engine/core/env.js';
import { createCampaign, open, seal, apply, emptyDraft } from '../../../../engine/core/turn.js';
import { createContext } from '../../../../engine/core/log.js';
import { checkDraft, orderContext } from '../../../../engine/core/orders.js';
import { MODULES, activeModules } from '../../../../engine/modules/index.js';
import { SUCCESS } from '../../../../engine/core/probes.js';
import { relKey } from '../../../../engine/core/state.js';

export const PLAYER = 'hochweide';
export const PARTNER = 'esk';
export const RIVAL = 'glutreiter';

export const startState = (env = testEnv(), seed = 7) => open(createCampaign(env, { id: 'm-1', seed }).state, env).state;

const readJson = (p) => JSON.parse(readFileSync(new URL(`../../../../welten/hochland/${p}`, import.meta.url), 'utf8'));
export const LABELS = readJson('labels.json').labels;
export const hochlandEnv = () => makeEnv({
  welt: readJson('welt.json'),
  regeln: readJson('regeln.json'),
  content: { entwicklungen: readJson('content/entwicklungen.json'), ereignisse: readJson('content/ereignisse.json'), bestimmungen: readJson('content/bestimmungen.json') },
});

/** Copy of the state with changes applied by `edit(copy)`. */
export function edited(state, edit) {
  const copy = structuredClone(state);
  edit(copy);
  return copy;
}

/** The people knows a development from the start; an institution is also instituted. */
export function learn(state, pid, ref, { instituted = false } = {}) {
  return edited(state, (s) => {
    const dev = s.peoples[pid].developments;
    dev.known.push({ ref, since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null });
    if (instituted) dev.instituted.push(ref);
  });
}

export const forget = (state, pid, ref) => edited(state, (s) => {
  const dev = s.peoples[pid].developments;
  dev.known = dev.known.filter((k) => k.ref !== ref);
  dev.instituted = dev.instituted.filter((r) => r !== ref);
});

export const withResources = (state, pid, res) => edited(state, (s) => Object.assign(s.peoples[pid].resources, res));
export const atTurn = (state, turn) => edited(state, (s) => { s.turn = turn; });
export const withRelation = (state, a, b, patch) => edited(state, (s) => {
  const k = relKey(a, b);
  s.relations[k] = { ...s.relations[k], ...patch };
});

/** A mutation context at the state's turn, in the step the module hooks run in. */
export function contextOf(state, env = testEnv()) {
  const tc = createContext(state, env);
  tc.step = 'modules';
  return tc;
}

/** Runs one hook of every active module of the people, in registry order, as turn.js does. */
export function runHook(tc, hook, pid) {
  for (const am of activeModules(tc.s0, tc.env, pid)) am.module.hooks?.[hook]?.(tc, pid, { id: am.id, bind: am.bind });
}

export function runGlobal(tc) {
  for (const m of MODULES) m.hooks?.global?.(tc);
}

/**
 * Runs one order through check, plan and resolve against a mutation context
 * with a made-up outcome of `band`. Costs are not paid here (the kernel does
 * that in turn.js); they are returned in plan.costs.
 */
export function resolveOrder(state, env, pid, def, params, band = 'success', { id = 'o1', tc = contextOf(state, env) } = {}) {
  const ox = { ...orderContext(state, env, pid), path: '/orders/0' };
  const order = { id, type: 'test', params };
  const errors = def.check(ox, order);
  if (errors.length) return { tc, ox, order, errors, plan: null };
  const plan = def.plan(ox, order);
  const out = plan.probe ? { band, margin: 0, success: SUCCESS.has(band), natural: null, probe: null } : null;
  def.resolve(tc, ox, order, plan, out);
  return { tc, ox, order, errors, plan };
}

export function checkOrders(state, env, pid, orders, extra = {}) {
  const draft = { ...emptyDraft(state, pid), orders, ...extra };
  return checkDraft(state, env, draft, { as: pid, mode: 'preview' });
}

/** A draft whose player probes (orders and the world event) all roll `roll`, or roll[orderId]. */
export function rolledDraft(state, env, pid, orders, { roll = 5, extra = {} } = {}) {
  const draft = { ...emptyDraft(state, pid), orders, ...extra, rolls: {} };
  const chk = checkDraft(state, env, draft, { as: pid, mode: 'preview' });
  for (const p of chk.probes) {
    if (p.roller !== 'player') continue;
    const value = typeof roll === 'object' ? roll[p.order ?? 'event'] ?? 5 : roll;
    draft.rolls[p.id] = { value, fingerprint: p.fingerprint };
  }
  return draft;
}

/** One season: seal and apply with the given drafts, then open the next planning phase. */
export function season(state, env, drafts) {
  const s = seal(state, env, drafts);
  if (!s.ok) throw new Error(`seal failed: ${JSON.stringify(s.issues.slice(0, 3))}`);
  const a = apply(s.state, env, s.drafts);
  if (!a.ok) throw new Error(`apply failed: ${JSON.stringify(a.issues.slice(0, 3))}`);
  return { applied: a.state, state: open(a.state, env).state, report: a.report, events: a.events };
}

const leaves = (v, path, out) => {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of Object.keys(v)) leaves(v[k], path ? `${path}.${k}` : k, out);
    if (Object.keys(v).length === 0) out.set(path, '{}');
  } else out.set(path, JSON.stringify(v));
  return out;
};

/** Dotted paths of a people that differ between two states. */
export function changedPaths(before, after, pid) {
  const a = leaves(before.peoples[pid], '', new Map());
  const b = leaves(after.peoples[pid], '', new Map());
  return [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort();
}

/** Every changed path of a people in tc.state is covered by a log entry about it. */
export function uncoveredPaths(tc, pid) {
  const entries = tc.log.filter((e) => (e.target.kind === 'people' && e.target.id === pid) || e.target.kind === 'member' || e.target.kind === 'unit');
  return changedPaths(tc.s0, tc.state, pid).filter((path) => !entries.some((e) => {
    if (e.target.kind === 'member') return path.startsWith('council');
    if (e.target.kind === 'unit') return path.startsWith('units');
    const f = e.change?.field;
    return f && (path === f || path.startsWith(`${f}.`) || f.startsWith(`${path}.`));
  }));
}

// A discipline with one application per target kind and distinguishable
// outcomes per band, for the magie tests. "material" moves by band so a test
// can tell which outcome list ran.
const BAND_MATERIAL = { crit_success: 5, success: 3, narrow: 2, failure: 1, setback: -1, crit_fail: -2 };
const outcomes = (extra = {}) => Object.fromEntries(Object.entries(BAND_MATERIAL).map(([band, amount]) => [band, [{ op: 'resource.delta', res: 'material', amount }, ...(extra[band] ?? [])]]));
const application = (id, slot, targetKind, extra = {}) => ({
  id, name: `Anwendung ${id}`, slot, target: 5, cost: { rauchkraut: 1 }, tags: ['magie', 'geist'], targetKind, outcomes: outcomes(extra),
});

export const BAND_AMOUNT = BAND_MATERIAL;
export const TEST_DISZIPLIN = {
  format: 'realmcraft-entwicklung', version: 1, rev: 1, appearance: '', id: 'zirkelkunst', kind: 'disziplin', tier: 1,
  name: 'Zirkelkunst', summary: 'Eine Disziplin für die Tests.', tags: ['magie', 'geist'], cost: { research: 4, resources: {} },
  prerequisites: { all: [], any: [], if: null }, effects: [], price: [], onAcquire: [], replaces: [],
  origin: { source: 'world', practiceTags: ['magie'], token: null, request: null, proposal: null },
  spec: {
    source: 'rauchkraut',
    applications: [
      application('sicht', 'minor', 'tile', { success: [{ op: 'reveal', scope: 'tiles', at: '$target', radius: 1 }] }),
      application('weihe', 'main', 'region', { success: [{ op: 'region.control', region: '$target', people: '$self' }] }),
      application('gruss', 'minor', 'people', { success: [{ op: 'relation.delta', people: '$target', amount: 1 }] }),
      application('rufen', 'minor', 'member', { success: [{ op: 'loyalty.bind', target: '$member', value: 0 }] }),
      application('bann', 'minor', 'unit', { success: [{ op: 'unit.delta', unit: '$target', strength: -1 }] }),
      application('stille', 'minor', 'none'),
    ],
  },
};

export const magieEnv = () => testEnv({ content: { ...CONTENT, entwicklungen: [...CONTENT.entwicklungen, TEST_DISZIPLIN] } });

// Magie: disciplines and their applications. Active for a people that knows an
// active development of kind disziplin (a module.activate effect may bind the
// source role too). The order discipline.use runs one application of a
// discipline: its cost is paid from the opening stock, its probe is built from
// the application, its outcomes per band are one-off primitives.
//
// Slice people.modules.magie = { withdrawal, uses }
//   withdrawal  { res: 0..3 } rises when a dependency on the source resource goes
//               unpaid and costs that much on every application of that source
//   uses        { applicationId: count }

import { issue } from '../core/issues.js';
import { applyOnceList } from '../core/effects.js';
import { fireHook, setPeople } from '../core/log.js';
import { activeDevelopments } from '../core/state.js';
import { knownRegions, regionAt } from '../core/map.js';
import { regionInfo } from '../world/index.js';

const MAX_WITHDRAWAL = 3;
const isTile = (v) => typeof v === 'string' && /^(0|-?[1-9][0-9]*),(0|-?[1-9][0-9]*)$/.test(v);
const isRegion = (v) => typeof v === 'string' && /^(0|-?[1-9][0-9]*):(0|-?[1-9][0-9]*):(0|[1-9][0-9]*)$/.test(v);
const sliceOf = (people) => people.modules?.magie ?? { withdrawal: {}, uses: {} };
const targetIssue = (ox, reason, msg, params = {}) => [issue('target', `${ox.path}/params`, msg, { params: { reason, ...params } })];

const disciplines = (state, env, pid) => activeDevelopments(state, env, pid).filter((d) => d.ent.kind === 'disziplin');

function applicationOf(ox, params) {
  const d = disciplines(ox.state, ox.env, ox.pid).find((x) => x.ref === params?.development);
  const app = d?.ent.spec.applications.find((a) => a.id === params?.application);
  return app ? { ref: d.ref, ent: d.ent, app } : null;
}

/** Resolved target of an application: { value } or { problem, reason, params? }. Reads the opening state. */
function resolveTarget(ox, kind, raw) {
  const { state, pid, world } = ox;
  const known = state.map.known[pid] ?? {};
  switch (kind) {
    case 'none':
      return { value: {} };
    case 'tile':
      if (!isTile(raw) || !Object.hasOwn(known, raw)) return { problem: 'target must be a tile the people knows', reason: 'unknown-tile' };
      return { value: { tile: raw, region: regionAt(world, raw) } };
    case 'region':
      if (isTile(raw) && Object.hasOwn(known, raw)) return { value: { region: regionAt(world, raw) } };
      if (isRegion(raw) && regionInfo(world, raw) && knownRegions(state, world, pid).includes(raw)) return { value: { region: raw } };
      return { problem: 'target must be a region id or a tile of a region the people knows', reason: 'unknown-region' };
    case 'people':
      if (typeof raw !== 'string' || raw === pid || !state.peoples[raw]) return { problem: 'target must be another people', reason: 'not-other-people' };
      return { value: { people: raw } };
    case 'member':
      if (!ox.people.council.some((m) => m.id === raw)) return { problem: 'target must be a member of the own council', reason: 'not-own-member' };
      return { value: { member: raw } };
    case 'unit': {
      const [owner, id] = typeof raw === 'string' && raw.includes(':') ? raw.split(':') : [pid, raw];
      const unit = state.peoples[owner]?.units.find((u) => u.id === id);
      if (!unit) return { problem: 'target must be a unit, written <people>:<unit> for a foreign one', reason: 'not-unit' };
      if (owner !== pid && known[unit.tile] !== 'visible') return { problem: 'the unit must stand on a tile the people sees', reason: 'unit-not-visible' };
      return { value: { unit: { people: owner, id }, tile: unit.tile, people: owner } };
    }
    default:
      return { problem: `unknown target kind ${kind}`, reason: 'unknown-target-kind', params: { kind } };
  }
}

const ORDERS = {
  'discipline.use': {
    slot: (ox, o) => applicationOf(ox, o.params)?.app.slot ?? 'minor',
    tags: (ox, o) => applicationOf(ox, o.params)?.app.tags ?? [],
    available: (ox) => disciplines(ox.state, ox.env, ox.pid).length > 0,
    check(ox, o) {
      const found = applicationOf(ox, o.params);
      if (!found) return targetIssue(ox, 'not-application', 'development must be a known, active disziplin and application one of its applications');
      const t = resolveTarget(ox, found.app.targetKind, o.params.target);
      return t.problem ? targetIssue(ox, t.reason, t.problem, t.params) : [];
    },
    plan(ox, o) {
      const { ent, app } = applicationOf(ox, o.params);
      const level = sliceOf(ox.people).withdrawal[ent.spec.source] ?? 0;
      const extraMods = level > 0 ? [{ source: 'withdrawal', label: 'withdrawal', value: -level, dev: false }] : [];
      return { costs: { ...app.cost }, probe: { kind: 'discipline.use', target: app.target, tags: app.tags, extraMods } };
    },
    resolve(tc, ox, o, plan, out) {
      const { ref, app } = applicationOf(ox, o.params);
      const target = resolveTarget(ox, app.targetKind, o.params.target).value ?? {};
      applyOnceList(tc, ox.pid, app.outcomes[out.band], { reason: `${app.name}: ${out.band}`, target, refs: [ref] });
      // Meters rise on the application ("use:fernblick"); the kernel itself only fires use:<order type>.
      fireHook(tc, ox.pid, `use:${app.id}`, app.tags);
      const uses = sliceOf(tc.state.peoples[ox.pid]).uses[app.id] ?? 0;
      setPeople(tc, ox.pid, `modules.magie.uses.${app.id}`, uses + 1, `${app.name} used`, { kind: 'magie.use' });
    },
  },
};

// An unpaid dependency raises the withdrawal of its resource; a full year in
// which a raised level saw no unpaid season lowers it again.
function upkeep(tc, pid) {
  const unpaid = tc.scratch.dependencyUnpaid?.[pid] ?? {};
  const level = (res) => sliceOf(tc.state.peoples[pid]).withdrawal[res] ?? 0;
  for (const res of Object.keys(unpaid).sort()) {
    if (!unpaid[res]) continue;
    const next = Math.min(MAX_WITHDRAWAL, level(res) + 1);
    setPeople(tc, pid, `modules.magie.withdrawal.${res}`, next, `the dependency on ${res} went unpaid`, { kind: 'magie.withdrawal' });
  }
  if (!tc.cal.yearEnd) return;
  for (const res of Object.keys(sliceOf(tc.state.peoples[pid]).withdrawal).sort()) {
    if (level(res) > 0 && !unpaid[res]) setPeople(tc, pid, `modules.magie.withdrawal.${res}`, level(res) - 1, `the dependency on ${res} was paid the whole year`, { kind: 'magie.withdrawal' });
  }
}

export default {
  id: 'magie',
  version: 1,
  always: false,
  resourceRoles: [{ role: 'source', defaultId: null }],
  tags: { magie: 2 },
  // Real worlds activate the module by the first disziplin itself, without a module.activate effect.
  autoActive: (state, env, pid) => disciplines(state, env, pid).length > 0,
  initPeople: () => ({ withdrawal: {}, uses: {} }),
  orders: ORDERS,
  hooks: {
    upkeep,
    derive(state, env, pid) {
      const people = state.peoples[pid];
      const slice = sliceOf(people);
      const list = disciplines(state, env, pid);
      return {
        disciplines: list.map((d) => ({
          ref: d.ref,
          name: d.ent.name,
          source: d.ent.spec.source,
          applications: d.ent.spec.applications.map((a) => ({ id: a.id, name: a.name, slot: a.slot, cost: { ...a.cost }, uses: slice.uses[a.id] ?? 0 })),
        })),
        sources: Object.fromEntries([...new Set(list.map((d) => d.ent.spec.source))].sort().map((res) => [res, people.resources[res] ?? 0])),
        withdrawal: { ...slice.withdrawal },
      };
    },
  },
  views: [{ id: 'magie', labelKey: 'view.magie', icon: 'flame', order: 50, scope: 'people', sections: ['disciplines', 'sources', 'withdrawal'] }],
  labelKeys: ['view.magie', 'module.magie', 'modulerole.source'],
  agentHints: { primitives: ['dependency', 'meter', 'resource.flow', 'research.mod'], tags: ['magie'] },
};

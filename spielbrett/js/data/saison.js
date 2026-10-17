import { currentResearch } from './pfade.js';

/** Player-only logged deltas; an absent or stale report is unknown, never a zero result. */
export function seasonSummary({ view, env, draft, pv, report }) {
  const previous = report?.turn === view.turn - 1 && report.people === view.people;
  const changes = {};
  if (previous) for (const event of report.events ?? []) {
    const { target, change } = event;
    if (target?.kind !== 'people' || target.id !== view.people || !change?.field?.startsWith('resources.')
        || !Number.isInteger(change.delta)) continue;
    const key = change.field.slice('resources.'.length);
    changes[key] = (changes[key] ?? 0) + change.delta;
  }
  return {
    resources: env.resourceIds.map((key) => ({ key, stock: view.peoples[view.people].resources[key] ?? 0,
      reserved: pv?.costs?.[key] ?? 0, net: pv?.forecast ? pv.forecast.net?.[key] ?? 0 : null })),
    research: currentResearch({ view, env, draft, pv }),
    previous: previous ? { turn: report.turn, changes } : null,
  };
}

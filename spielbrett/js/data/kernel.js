// The rules kernel as the browser uses it: the environment built from the
// pinned world package plus the campaign content the server releases for the
// player's view, and the kernel functions the board calls on the projection.
// Relative imports keep the module loadable in Node for the unit tests; in the
// browser they resolve to /engine/... on the dev server.

import { makeEnv } from '../../../engine/core/env.js';
import { preview, emptyDraft } from '../../../engine/core/turn.js';
import { bandOf, resolveProbe, calculation, chance, eventBand } from '../../../engine/core/probes.js';
import { tune } from '../../../engine/core/rules.js';
import { viewsFor, loyaltyBand } from '../../../engine/core/views.js';
import { mapLayers } from '../../../engine/core/derive.js';
import { researchCost } from '../../../engine/core/research.js';
import { calendarOf } from '../../../engine/core/calendar.js';
import { SUCCESS_BANDS, BANDS } from '../../../engine/schemas/common.js';
import { registry } from '../../../engine/core/orders.js';
import { pathsView, pathsOf, pfadOf, pointsOf } from '../../../engine/core/pfade.js';
import { ofOp, standingOf } from '../../../engine/core/effects.js';

/** True for order types the kernel allows once per season (research.assign, research.direct). */
export const isUnique = (type) => registry()[type]?.def?.unique === true;

export { tune, preview, emptyDraft, eventBand, bandOf, resolveProbe, calculation, chance, viewsFor, loyaltyBand, mapLayers, researchCost, calendarOf, SUCCESS_BANDS, BANDS, pathsView, pathsOf, pfadOf };

/**
 * Research points the people's project `ref` gathers next season, by the rule
 * of resolveResearch: base, the clans the draft assigns to research, the Wissen
 * burned from stock and the standing research.mod effects whose tags meet the
 * project. `assigned` is the labour of the draft (preview.assign).
 */
export function seasonPoints(view, env, pid, assigned, ref = null) {
  const people = view.peoples[pid];
  const p = pointsOf(env, { ...people, population: { ...people.population, assigned: assigned ?? people.population.assigned } });
  const tags = ref ? env.entwicklung(ref)?.tags ?? [] : [];
  const mods = ref
    ? ofOp(standingOf(view, env, pid), 'research.mod').filter((s) => s.effect.tags.some((g) => tags.includes(g))).reduce((n, s) => n + s.effect.amount, 0)
    : 0;
  return { ...p, mods, total: Math.max(0, p.total + mods) };
}

export const PACK_FILES = ['welt', 'regeln', 'labels'];
export const CONTENT_FILES = ['entwicklungen', 'ereignisse', 'bestimmungen'];

/**
 * env for one campaign. pack = { welt, regeln, labels, entwicklungen,
 * ereignisse, bestimmungen }; items = campaign content released for the view
 * (agent-made Entwicklungen, cards, destinies), resolved by "id@rev".
 */
export function buildEnv(pack, items = []) {
  const byRef = new Map(items.map((d) => [`${d.id}@${d.rev}`, d]));
  return makeEnv({
    welt: pack.welt,
    regeln: pack.regeln,
    labels: pack.labels,
    content: { entwicklungen: pack.entwicklungen, ereignisse: pack.ereignisse, bestimmungen: pack.bestimmungen },
    resolve: (ref) => byRef.get(ref) ?? null,
  });
}

/** Preview of a draft on the player's projection (Spieldesign D15). */
export function previewDraft(view, env, draft) {
  return preview(view, env, draft, { as: view.people });
}

/** World-event bands of the package: raw d10 ranges per band 1..5. */
export const eventBands = (env) => tune(env, 'eventBands');

/** True when the browser's package is the one the campaign was created with. */
export function sameWorld(view, env) {
  return view.campaign?.world?.hash === env.hash;
}

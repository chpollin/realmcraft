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

/** True for order types the kernel allows once per season (research.assign, research.direct). */
export const isUnique = (type) => registry()[type]?.def?.unique === true;

export { tune, preview, emptyDraft, eventBand, bandOf, resolveProbe, calculation, chance, viewsFor, loyaltyBand, mapLayers, researchCost, calendarOf, SUCCESS_BANDS, BANDS };

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

// Shared set-up for the projection, view and fallback tests: a campaign over
// the test pack that is advanced by whole seasons with an empty player draft.

import { readFileSync } from 'node:fs';
import { testEnv } from './pack.js';
import { makeEnv } from '../../../../engine/core/env.js';
import { apply, createCampaign, emptyDraft, open, preview } from '../../../../engine/core/turn.js';

export const PLAYER = 'hochweide';

export function hochlandEnv() {
  const j = (p) => JSON.parse(readFileSync(new URL(`../../../../welten/hochland/${p}`, import.meta.url), 'utf8'));
  return makeEnv({
    welt: j('welt.json'),
    regeln: j('regeln.json'),
    content: { entwicklungen: j('content/entwicklungen.json'), ereignisse: j('content/ereignisse.json'), bestimmungen: j('content/bestimmungen.json') },
  });
}

export function planning(seed = 7, env = testEnv()) {
  const created = createCampaign(env, { id: 'test-1', seed });
  const opened = open(created.state, env);
  if (!opened.ok) throw new Error(`open failed: ${JSON.stringify(opened.issues)}`);
  return { env, state: opened.state };
}

/** Adds the player's event roll (kernel previews name the probes and fingerprints) to a draft. */
export function withRolls(state, env, draft, value = 5) {
  const probes = preview(state, env, draft, { as: draft.people }).probes.filter((p) => p.roller === 'player');
  return { ...draft, rolls: Object.fromEntries(probes.map((p) => [p.id, { value, fingerprint: p.fingerprint }])) };
}

/** One season: apply the player's draft (AI peoples fall back to the policy), then open. */
export function nextSeason(state, env, draft = emptyDraft(state, state.campaign.player)) {
  const res = apply(state, env, { [state.campaign.player]: withRolls(state, env, draft) });
  if (!res.ok) throw new Error(`apply failed: ${JSON.stringify(res.issues)}`);
  const opened = open(res.state, env);
  if (!opened.ok) throw new Error(`open failed: ${JSON.stringify(opened.issues)}`);
  return opened.state;
}

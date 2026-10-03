// Kernel and validator defects the fuzz sweeps found, each reduced to its
// smallest reproduction and marked todo: the lanes that own engine/ fix them,
// then the todo mark and the matching knownFinding filter in
// fuzz-content.test.js or fuzz-kernel.test.js go.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apply, createCampaign, emptyDraft, open, preview } from '../../../engine/core/turn.js';
import { validateCampaign, validateProposal } from '../../../engine/content/validate.js';
import { hochland } from '../../fixtures/engine/k1/harness.js';

const { env } = hochland();

describe('fuzz findings', () => {
  it('validateProposal rejects a null item instead of throwing', { todo: 'kernel lanes: validateProposal reads item.type of a null item (engine/content/validate.js)' }, () => {
    const proposal = {
      format: 'realmcraft-proposal', version: 1, proposalId: 'research.fuzz.T0', agent: 'research', campaign: 'fuzz', turn: 0, basedOnRev: 1, people: 'bergnomaden',
      items: [null],
    };
    let res;
    assert.doesNotThrow(() => { res = validateProposal(proposal, {}); });
    assert.equal(res.ok, false);
    assert.equal(res.items[0].verdict, 'rejected');
  });

  it('a famine leaves no more clans assigned than the people has', { todo: 'kernel lanes: population.assigned is not trimmed when the economy step lowers population.core' }, () => {
    const state = structuredClone(open(createCampaign(env, { id: 'fuzz', seed: 7 }).state, env).state);
    const pid = state.campaign.player;
    const p = state.peoples[pid];
    p.resources.nahrung = 0;
    p.resources.herden = 0;
    const draft = { ...emptyDraft(state, pid), assign: { research: p.population.core } };
    const probes = preview(state, env, draft, { as: pid }).probes.filter((x) => x.roller === 'player');
    draft.rolls = Object.fromEntries(probes.map((x) => [x.id, { value: 5, fingerprint: x.fingerprint }]));
    const res = apply(state, env, { [pid]: draft });
    assert.ok(res.ok);
    assert.ok(res.state.peoples[pid].population.core < p.population.core, 'the famine takes a clan');
    assert.deepEqual(validateCampaign(res.state).issues, []);
  });
});

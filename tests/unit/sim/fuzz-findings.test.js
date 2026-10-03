// Kernel and validator defects the fuzz sweeps found, each reduced to its
// smallest reproduction and kept as a regression test after the fix.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apply, createCampaign, emptyDraft, open, preview } from '../../../engine/core/turn.js';
import { validateCampaign, validateProposal } from '../../../engine/content/validate.js';
import { ingestProposal } from '../../../engine/harness/ingest.js';
import { addPeople, createContext } from '../../../engine/core/log.js';
import { hochland } from '../../fixtures/engine/k1/harness.js';

const { env, library, holder } = hochland();

const sum = (m) => Object.values(m ?? {}).reduce((a, b) => a + b, 0);

function planning(seed = 7) {
  return structuredClone(open(createCampaign(env, { id: 'fuzz', seed }).state, env).state);
}

function withRolls(state, draft, value = 5) {
  const probes = preview(state, env, draft, { as: draft.people }).probes.filter((x) => x.roller === 'player');
  return { ...draft, rolls: Object.fromEntries(probes.map((x) => [x.id, { value, fingerprint: x.fingerprint }])) };
}

const proposalWith = (items, state = null) => ({
  format: 'realmcraft-proposal', version: 1, proposalId: 'research.fuzz.T0', agent: 'research', campaign: 'fuzz', turn: 0, basedOnRev: state?.rev ?? 1, people: 'bergnomaden', items,
});

describe('fuzz findings', () => {
  it('validateProposal rejects a null item instead of throwing', () => {
    let res;
    assert.doesNotThrow(() => { res = validateProposal(proposalWith([null]), {}); });
    assert.equal(res.ok, false);
    assert.equal(res.items[0].verdict, 'rejected');
    assert.ok(res.items[0].issues.length > 0);
  });

  it('ingest rejects non-object items in every phase instead of throwing', () => {
    const created = createCampaign(env, { id: 'fuzz', seed: 7 }).state;
    for (const state of [created, open(created, env).state]) {
      for (const items of [[null], [null, null], ['x'], [[]], [5]]) {
        let res;
        assert.doesNotThrow(() => { res = ingestProposal(state, env, { ...proposalWith(items, state), campaign: 'fuzz' }, { library, holder }); }, `${state.phase} ${JSON.stringify(items)}`);
        assert.equal(res.ok, false);
        assert.equal(res.verdict, 'rejected');
        assert.ok(res.items.every((i) => i.verdict === 'rejected'));
      }
    }
  });

  it('a famine leaves no more clans assigned than the people has', () => {
    const state = planning();
    const pid = state.campaign.player;
    const p = state.peoples[pid];
    p.resources.nahrung = 0;
    p.resources.herden = 0;
    const draft = withRolls(state, { ...emptyDraft(state, pid), assign: { research: p.population.core } });
    const res = apply(state, env, { [pid]: draft });
    assert.ok(res.ok);
    const after = res.state.peoples[pid].population;
    assert.ok(after.core < p.population.core, 'the famine takes a clan');
    assert.ok(sum(after.assigned) <= after.core);
    assert.deepEqual(validateCampaign(res.state).issues, []);
    // The next season plans on the trimmed labour without a labour error.
    const next = open(res.state, env).state;
    assert.ok(!preview(next, env, emptyDraft(next, pid), { as: pid }).issues.some((i) => i.code === 'labour'));
  });

  it('a loss of clans trims activities first and food last', () => {
    const state = planning();
    const pid = state.campaign.player;
    state.peoples[pid].population.core = 5;
    state.peoples[pid].population.assigned = { nahrung: 2, material: 1, hueten: 1, research: 1 };
    const tc = createContext(state, env);
    addPeople(tc, pid, 'population.core', -3, 'test loss', { min: 0, max: 99 });
    assert.deepEqual(tc.state.peoples[pid].population.assigned, { nahrung: 2 });
    addPeople(tc, pid, 'population.core', -1, 'test loss', { min: 0, max: 99 });
    assert.deepEqual(tc.state.peoples[pid].population.assigned, { nahrung: 1 });
    assert.ok(tc.log.some((e) => e.kind === 'population.assign'), 'the trim is logged');
  });

  it('a state saved with more clans assigned than it has is trimmed at the next transition', () => {
    const state = structuredClone(createCampaign(env, { id: 'fuzz', seed: 7 }).state);
    const pid = state.campaign.player;
    const p = state.peoples[pid];
    p.population.assigned = { nahrung: p.population.core + 2 };
    assert.ok(validateCampaign(state).issues.some((i) => i.code === 'labour'));
    const res = open(state, env);
    assert.ok(res.ok);
    assert.deepEqual(res.state.peoples[pid].population.assigned, { nahrung: p.population.core });
    assert.ok(!validateCampaign(res.state).issues.some((i) => i.code === 'labour'));
  });
});

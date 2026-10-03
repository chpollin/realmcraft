// Property-based fuzzing of the turn pipeline: random drafts against
// campaigns at several seasons, checked for no crash, determinism, integer
// stocks, untouched inputs and fog safety of every projection. Fixed seed
// (FUZZ_SEED), case count scaled by FUZZ_RUNS; a failure message names the
// case to reproduce.

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { apply, createCampaign, open, preview, stateHash } from '../../../engine/core/turn.js';
import { checkDraft } from '../../../engine/core/orders.js';
import { projectFor } from '../../../engine/core/project.js';
import { fallbackDraft } from '../../../engine/ai/fallback.js';
import { validateCampaign } from '../../../engine/content/validate.js';
import { kern, peopleIds } from '../../../engine/core/state.js';
import { rand, randomDraft, runs, SEED } from './lib/gen.js';
import { hochland } from '../../fixtures/engine/k1/harness.js';

const { env } = hochland();
const at = (label, i, extra = '') => `${label} case ${i} (FUZZ_SEED=${SEED})${extra}`;

function withRolls(state, draft, die) {
  const probes = preview(state, env, draft, { as: draft.people }).probes.filter((p) => p.roller === 'player');
  return { ...draft, rolls: Object.fromEntries(probes.map((p) => [p.id, { value: die(), fingerprint: p.fingerprint }])) };
}

/** A campaign in planning after `seasons` seasons of fallback play for every people. */
function campaignAt(seed, seasons) {
  const r = rand('campaign', seed);
  const die = () => r.int(1, 10);
  let state = open(createCampaign(env, { id: 'fuzz', seed }).state, env).state;
  for (let i = 0; i < seasons && state.status !== 'ended'; i++) {
    const pid = state.campaign.player;
    const res = apply(state, env, { [pid]: withRolls(state, fallbackDraft(state, env, pid), die) });
    if (!res.ok) throw new Error(`setup apply failed: ${JSON.stringify(res.issues.slice(0, 3))}`);
    state = res.state.status === 'ended' ? res.state : open(res.state, env).state;
  }
  return state;
}

// Everything a projection for `pid` must not carry about the other peoples.
function fogLeaks(state, view, pid) {
  const out = [];
  const known = state.map.known[pid] ?? {};
  for (const [id, p] of Object.entries(view.peoples)) {
    if (id === pid) continue;
    for (const k of ['developments', 'meters', 'bestimmung', 'council', 'shortfall', 'population', 'practice', 'tokens', 'statuses', 'modules']) {
      if (k in p) out.push(`peoples.${id}.${k}`);
    }
    const revealed = (kern(state.peoples[pid]).revealed?.[id] ?? -1) >= state.turn;
    if ('resources' in p && !revealed) out.push(`peoples.${id}.resources without reveal`);
    for (const u of p.units) if (known[u.tile] !== 'visible') out.push(`unit ${u.id} on ${u.tile} not visible`);
  }
  for (const s of view.map.settlements) if (s.people !== pid && known[s.tile] !== 'visible') out.push(`settlement ${s.id} not visible`);
  if (Object.keys(view.map.known).some((k) => k !== pid)) out.push('map.known of another people');
  if (Object.keys(view.eventDraws).some((k) => k !== pid)) out.push('eventDraws of another people');
  if (Object.keys(view.derived).some((k) => k !== pid)) out.push('derived of another people');
  for (const e of view.chronicle) if (!(e.visibleTo.includes(pid) || e.visibleTo.includes('all'))) out.push(`chronicle entry ${e.kind}`);
  if ('rng' in view || 'eventPool' in view || 'ingested' in view) out.push('kernel internals');
  return out;
}

// The same state with every hidden fact of the other peoples changed: what
// `pid` may not see must not change what it is shown or what its fallback
// policy decides.
function perturbHidden(state, pid) {
  const s = structuredClone(state);
  s.rng = { ...s.rng, s: [1, 2, 3, 4] };
  for (const [id, p] of Object.entries(s.peoples)) {
    if (id === pid) continue;
    const revealed = (kern(s.peoples[pid]).revealed?.[id] ?? -1) >= s.turn;
    if (!revealed) for (const res of Object.keys(p.resources)) p.resources[res] += 3;
    p.shortfall = { nahrung: 2 };
    p.developments.research = [{ ref: 'bannfeuer@1', progress: 5 }];
    p.developments.candidates = [];
    p.council = p.council.map((m) => ({ ...m, loyalty: -m.loyalty }));
    p.practice = { ledger: [{ turn: s.turn, tags: { dunkel: 3 } }] };
    p.meters = Object.fromEntries(Object.keys(p.meters).map((k) => [k, 0]));
    if (p.bestimmung) p.bestimmung.milestones = p.bestimmung.milestones.map((m) => ({ ...m, progress: m.progress + 1 }));
  }
  return s;
}

const STATES = [];
// Campaign seeds follow FUZZ_SEED, so a long sweep over many seeds meets many
// maps and starts; the long sweep also plays deeper into a campaign.
const CAMPAIGN_SEEDS = /^\d+$/.test(SEED) ? [2 * Number(SEED) - 1, 2 * Number(SEED)] : [1, 2];
const SEASONS = runs(1) > 1 ? [0, 3, 8, 20] : [0, 3, 8];

/** Random drafts for some AI peoples beside the player's; the kernel substitutes the fallback for a broken one. */
function aiDrafts(r, state) {
  const out = {};
  for (const pid of peopleIds(state)) {
    if (pid !== state.campaign.player && r.chance(0.5)) out[pid] = randomDraft(r, state, env, pid);
  }
  return out;
}

// What every state after apply must keep: a valid campaign, integer and
// non-negative stocks and clans, and a next season that opens.
function checkNext(next, label) {
  assert.deepEqual(validateCampaign(next).issues.filter((x) => x.severity === 'error'), [], label);
  for (const [id, p] of Object.entries(next.peoples)) {
    for (const [res, n] of Object.entries(p.resources)) assert.ok(Number.isInteger(n) && n >= 0, `${label}: ${id}.${res} = ${n}`);
    assert.ok(Number.isInteger(p.population.core) && p.population.core >= 0, `${label}: ${id} core ${p.population.core}`);
  }
  if (next.status === 'ended') return next;
  const opened = open(next, env);
  assert.ok(opened.ok, `${label} cannot open the next season`);
  return opened.state;
}

describe('fuzz: turn pipeline', () => {
  before(() => {
    for (const seed of CAMPAIGN_SEEDS) for (const seasons of SEASONS) STATES.push({ label: `seed ${seed} after ${seasons} seasons`, state: campaignAt(seed, seasons) });
  });

  it('previews random drafts on the state and on the projection without a crash, the same each time', () => {
    const r = rand('preview');
    for (let i = 0; i < runs(60); i++) {
      const { label, state } = r.pick(STATES);
      const pid = r.pick(peopleIds(state));
      const draft = randomDraft(r, state, env, pid);
      const before = stateHash(state);
      const view = projectFor(state, env, pid);
      for (const [where, doc] of [['state', state], ['projection', view]]) {
        let a;
        try {
          a = preview(doc, env, draft, { as: pid });
          checkDraft(doc, env, draft, { as: pid, mode: 'apply' });
        } catch (err) {
          assert.fail(`${at('preview', i, ` ${label} on the ${where}`)} throws ${err.stack}\ndraft ${JSON.stringify(draft)}`);
        }
        assert.equal(JSON.stringify(a), JSON.stringify(preview(doc, env, structuredClone(draft), { as: pid })), at('preview', i, ` ${where}`));
      }
      assert.equal(stateHash(state), before, at('preview', i, ' mutated its input'));
    }
  });

  it('applies random drafts without a crash and leaves a valid, integer, deterministic state', () => {
    const r = rand('apply');
    let applied = 0;
    for (let i = 0; i < runs(30); i++) {
      const { label, state } = r.pick(STATES);
      if (state.status === 'ended') continue;
      const pid = state.campaign.player;
      const drafts = { ...(r.chance(0.4) ? aiDrafts(r, state) : {}), [pid]: withRolls(state, randomDraft(r, state, env, pid), () => r.int(1, 10)) };
      const before = stateHash(state);
      let res;
      try {
        res = apply(state, env, drafts);
      } catch (err) {
        assert.fail(`${at('apply', i, ` ${label}`)} throws ${err.stack}\ndrafts ${JSON.stringify(drafts)}`);
      }
      assert.equal(stateHash(state), before, at('apply', i, ' mutated its input'));
      if (!res.ok) {
        assert.ok(res.issues.length > 0 && res.issues.every((x) => typeof x.code === 'string'), at('apply', i, ' rejects without issues'));
        continue;
      }
      applied++;
      checkNext(res.state, `${at('apply', i, ` ${label}`)}\ndrafts ${JSON.stringify(drafts)}`);
      assert.equal(stateHash(apply(state, env, structuredClone(drafts)).state), stateHash(res.state), at('apply', i, ' is not deterministic'));
    }
    assert.ok(applied > 0, 'no random draft was applied');
  });

  it('plays random seasons in a row and keeps every state valid, deterministic and fogged', () => {
    const r = rand('seasons');
    for (let i = 0; i < runs(2); i++) {
      const seed = r.pick(CAMPAIGN_SEEDS);
      let state = r.pick(STATES.filter((s) => s.label.startsWith(`seed ${seed} `))).state;
      for (let season = 0; season < 10 && state.status !== 'ended'; season++) {
        const label = at('seasons', i, ` seed ${seed} turn ${state.turn}`);
        const pid = state.campaign.player;
        const own = r.chance(0.5) ? fallbackDraft(state, env, pid) : randomDraft(r, state, env, pid);
        let drafts = { ...aiDrafts(r, state), [pid]: withRolls(state, own, () => r.int(1, 10)) };
        let res;
        try {
          res = apply(state, env, drafts);
          if (!res.ok) {
            // A rejected random draft: the season goes on with the fallback.
            drafts = { ...drafts, [pid]: withRolls(state, fallbackDraft(state, env, pid), () => r.int(1, 10)) };
            res = apply(state, env, drafts);
          }
        } catch (err) {
          assert.fail(`${label} throws ${err.stack}\ndrafts ${JSON.stringify(drafts)}`);
        }
        assert.ok(res.ok, `${label} rejects even the fallback: ${JSON.stringify(res.issues.slice(0, 3))}`);
        assert.equal(stateHash(apply(state, env, structuredClone(drafts)).state), stateHash(res.state), `${label} is not deterministic`);
        for (const p of peopleIds(res.state)) assert.deepEqual(fogLeaks(res.state, projectFor(res.state, env, p), p), [], `${label} as ${p}`);
        state = checkNext(res.state, label);
      }
    }
  });

  it('shows no people what the fog hides, before and after random seasons', () => {
    const r = rand('fog');
    for (let i = 0; i < runs(20); i++) {
      const { label, state: s0 } = r.pick(STATES);
      let state = s0;
      if (state.status !== 'ended' && r.chance(0.5)) {
        const pid = state.campaign.player;
        const res = apply(state, env, { [pid]: withRolls(state, randomDraft(r, state, env, pid), () => r.int(1, 10)) });
        if (res.ok) state = res.state;
      }
      for (const pid of peopleIds(state)) {
        const view = projectFor(state, env, pid);
        assert.deepEqual(fogLeaks(state, view, pid), [], at('fog', i, ` ${label} as ${pid}`));
      }
    }
  });

  it('keeps projections and fallback decisions blind to hidden facts of other peoples', () => {
    const r = rand('blind');
    for (let i = 0; i < runs(20); i++) {
      const { label, state } = r.pick(STATES);
      const pid = r.pick(peopleIds(state));
      const other = perturbHidden(state, pid);
      assert.equal(JSON.stringify(projectFor(other, env, pid)), JSON.stringify(projectFor(state, env, pid)), at('blind', i, ` ${label} projection of ${pid}`));
      if (state.phase === 'planning' && state.status !== 'ended') {
        assert.deepEqual(fallbackDraft(other, env, pid), fallbackDraft(state, env, pid), at('blind', i, ` ${label} fallback of ${pid}`));
      }
    }
  });
});

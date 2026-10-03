// Property-based fuzzing of the power budget and the content validator over
// random effect lists and mutated world content. Fixed seed (FUZZ_SEED), case
// count scaled by FUZZ_RUNS; a failure message names the case to reproduce.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TIERS } from '../../../engine/schemas/effects.js';
import { primitiveWeight, scoreEntwicklung } from '../../../engine/content/budget.js';
import { validateBestimmung, validateEntwicklung, validateEreignis, validateProposal, withCatalogue } from '../../../engine/content/validate.js';
import { AMOUNT, mutate, oncePrimitive, rand, runs, SEED, standingPrimitive, vocabularyOf } from './lib/gen.js';
import { hochland } from '../../fixtures/engine/k1/harness.js';

const { env, library } = hochland();
const vocab = vocabularyOf(env);
const ctx = withCatalogue({ regeln: env.regeln, welt: env.welt, library });
const ents = env.content.entwicklungen;
const at = (label, i) => `${label} case ${i} (FUZZ_SEED=${SEED})`;
const randomPrimitive = (r) => (r.chance(0.5) ? standingPrimitive(r, vocab) : oncePrimitive(r, vocab));

// The direction a weight takes when the amount grows: a dependency and more
// unit upkeep are burdens, every other amount is a benefit.
const falling = (p) => p.op === 'dependency' || (p.op === 'unit.mod' && p.stat === 'upkeep');

function sameResult(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function wellFormedIssues(issues, label) {
  assert.ok(Array.isArray(issues), label);
  for (const i of issues) {
    assert.equal(typeof i.code, 'string', `${label}: issue code`);
    assert.equal(typeof i.path, 'string', `${label}: issue path`);
  }
}

function budgetFits(ent, budget, label) {
  const row = TIERS.find((t) => t.tier === Math.max(1, ent.tier)) ?? TIERS[TIERS.length - 1];
  assert.ok(budget.effect <= row.effectMax, `${label}: effect ${budget.effect} > ${row.effectMax}`);
  assert.ok(budget.net >= row.netMin && budget.net <= row.netMax, `${label}: net ${budget.net}`);
  assert.ok(budget.price <= row.priceMax, `${label}: price ${budget.price}`);
  assert.equal(ent.cost.research, budget.net * (ent.tier + 1), `${label}: research cost`);
  for (const p of ent.effects) assert.ok(primitiveWeight(p, ctx) >= 0, `${label}: negative effect ${p.op}`);
  for (const p of ent.price) assert.ok(primitiveWeight(p, ctx) <= 0, `${label}: positive price ${p.op}`);
}

describe('fuzz: power weights', () => {
  it('weigh every random primitive with an integer, the same each time', () => {
    const r = rand('weights');
    for (let i = 0; i < runs(300); i++) {
      const p = randomPrimitive(r);
      const w = primitiveWeight(p, ctx);
      assert.ok(Number.isInteger(w), `${at('weight', i)}: ${JSON.stringify(p)} -> ${w}`);
      assert.equal(primitiveWeight(structuredClone(p), ctx), w, at('weight', i));
    }
  });

  it('are monotone in the amount of every primitive that carries one', () => {
    const r = rand('monotone');
    let swept = 0;
    for (let i = 0; i < runs(400); i++) {
      const p = randomPrimitive(r);
      const range = AMOUNT[p.op];
      if (!range) continue;
      swept++;
      let prev = null;
      for (let a = range[0]; a <= range[1]; a++) {
        const w = primitiveWeight({ ...p, amount: a }, ctx);
        if (prev !== null) {
          const ok = falling(p) ? w <= prev : w >= prev;
          assert.ok(ok, `${at('monotone', i)}: ${p.op} amount ${a - 1} -> ${a} weighs ${prev} -> ${w} (${JSON.stringify(p)})`);
        }
        prev = w;
      }
    }
    assert.ok(swept > 0);
  });

  it('let a longer status weigh more when it helps and less when it harms', () => {
    const r = rand('status');
    for (let i = 0; i < runs(200); i++) {
      const effects = [standingPrimitive(r, vocab, 1, true)];
      const full = primitiveWeight({ op: 'status.add', id: 's', effects, duration: null, endsOn: null }, ctx);
      let prev = null;
      for (let d = 1; d <= 8; d++) {
        const w = primitiveWeight({ op: 'status.add', id: 's', effects, duration: d, endsOn: null }, ctx);
        if (prev !== null) assert.ok(full >= 0 ? w >= prev : w <= prev, `${at('status', i)}: duration ${d} weighs ${w} after ${prev} (${JSON.stringify(effects)})`);
        prev = w;
      }
    }
  });

  it('add up: one more effect raises E by its weight, one more price lowers P by its weight', () => {
    const r = rand('additive');
    for (let i = 0; i < runs(200); i++) {
      const ent = structuredClone(r.pick(ents));
      const p = standingPrimitive(r, vocab);
      const w = primitiveWeight(p, ctx);
      const before = scoreEntwicklung(ent, ctx);
      const slot = w >= 0 ? 'effects' : 'price';
      const after = scoreEntwicklung({ ...ent, [slot]: [...ent[slot], p] }, ctx);
      assert.equal(after.effect + after.price, before.effect + before.price + w, `${at('additive', i)}: ${ent.id} + ${JSON.stringify(p)}`);
      if (slot === 'effects') assert.equal(after.effect, before.effect + w, at('additive', i));
      else assert.equal(after.price, before.price + w, at('additive', i));
      assert.equal(after.research, after.net * (ent.tier + 1), at('additive', i));
    }
  });
});

describe('fuzz: content validator', () => {
  it('never throws on mutated Entwicklungen, answers the same twice and passes only what fits the budget', () => {
    const r = rand('entwicklung');
    for (let i = 0; i < runs(250); i++) {
      const ent = mutate(r, r.pick(ents));
      let a;
      try {
        a = validateEntwicklung(ent, ctx);
      } catch (err) {
        assert.fail(`${at('entwicklung', i)} throws ${err.stack}\ninput ${JSON.stringify(ent)}`);
      }
      wellFormedIssues(a.issues, at('entwicklung', i));
      assert.ok(sameResult(a, validateEntwicklung(structuredClone(ent), ctx)), at('entwicklung', i));
      if (a.ok) budgetFits(ent, a.budget, at('entwicklung', i));
    }
  });

  it('never throws on Entwicklungen with random effect lists and passes only what fits the budget', (t) => {
    const r = rand('effectlists');
    let passed = 0;
    // Half the cases draw effects and prices on the side their weight
    // belongs to and carry the research cost the budget demands, so that
    // a share passes and the agreement with the budget is exercised.
    const signed = (sign) => {
      for (let k = 0; k < 20; k++) {
        const p = standingPrimitive(r, vocab);
        if (Math.sign(primitiveWeight(p, ctx)) === sign) return p;
      }
      return standingPrimitive(r, vocab);
    };
    for (let i = 0; i < runs(250); i++) {
      const careful = r.chance(0.5);
      const ent = { ...structuredClone(r.pick(ents.filter((e) => e.tier >= 1 && e.kind === 'technik'))), id: `fuzz-${i}`, name: `Fuzz ${i}` };
      ent.effects = Array.from({ length: careful ? r.int(1, 2) : r.int(0, 3) }, () => (careful ? signed(1) : standingPrimitive(r, vocab)));
      ent.price = Array.from({ length: careful ? r.int(0, 1) : r.int(0, 2) }, () => (careful ? signed(-1) : standingPrimitive(r, vocab)));
      ent.onAcquire = r.chance(0.3) ? [oncePrimitive(r, vocab)] : [];
      if (careful) ent.cost = { ...ent.cost, research: Math.max(1, scoreEntwicklung(ent, ctx).net * (ent.tier + 1)) };
      const a = validateEntwicklung(ent, ctx);
      wellFormedIssues(a.issues, at('effectlists', i));
      if (a.ok) {
        passed++;
        budgetFits(ent, a.budget, at('effectlists', i));
      }
    }
    t.diagnostic(`${passed} random Entwicklungen passed the validator`);
  });

  it('never throws on mutated event cards and Bestimmungen', () => {
    const r = rand('cards');
    for (let i = 0; i < runs(150); i++) {
      const ev = mutate(r, r.pick(env.content.ereignisse));
      const b = mutate(r, r.pick(env.content.bestimmungen));
      for (const [label, fn, x] of [['ereignis', validateEreignis, ev], ['bestimmung', validateBestimmung, b]]) {
        let res;
        try {
          res = fn(x, ctx);
        } catch (err) {
          assert.fail(`${at(label, i)} throws ${err.stack}\ninput ${JSON.stringify(x)}`);
        }
        wellFormedIssues(res.issues, at(label, i));
        assert.ok(sameResult(res, fn(structuredClone(x), ctx)), at(label, i));
      }
    }
  });

  it('never throws on mutated proposals and answers the same twice', () => {
    const r = rand('proposals');
    const base = {
      format: 'realmcraft-proposal', version: 1, proposalId: 'research.fuzz.T0', agent: 'research', campaign: 'fuzz', turn: 0, basedOnRev: 1, people: 'bergnomaden',
      items: [{ type: 'entwicklung', data: { ...structuredClone(ents.find((e) => e.id === 'saumpfad')), id: 'fuzzpfad', origin: { source: 'agent', practiceTags: ['weg'], token: null, request: null, proposal: 'research.fuzz.T0' } } }],
    };
    for (let i = 0; i < runs(200); i++) {
      const p = mutate(r, base);
      let res;
      try {
        res = validateProposal(p, ctx);
      } catch (err) {
        assert.fail(`${at('proposal', i)} throws ${err.stack}\ninput ${JSON.stringify(p)}`);
      }
      wellFormedIssues(res.issues, at('proposal', i));
      assert.ok(sameResult(res, validateProposal(structuredClone(p), ctx)), at('proposal', i));
    }
  });
});

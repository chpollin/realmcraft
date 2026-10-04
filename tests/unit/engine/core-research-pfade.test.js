// Research on paths (engine/core/research.js with regeln.pfade): the pool
// offers only on open paths within the path tier, research.direct names a
// path, the research step latches opened paths and records the default for a
// people from before paths, points accumulate across seasons until the
// achievement completes and the path tier rises.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../../../engine/core/rules.js';
import * as research from '../../../engine/core/research.js';
import { orderContext } from '../../../engine/core/orders.js';
import { pathTier, pathsView, pointsOf } from '../../../engine/core/pfade.js';
import { validate } from '../../../engine/content/schema.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { assertCovered, dev, envWith, fresh, knownEntry, context, logKinds } from '../../fixtures/engine/k1/research.js';

const H = 'hochweide';

// Paths over the test vocabulary; magie opens with two points of magic practice.
const PFADE = {
  paths: [
    { id: 'herde', tags: ['herde', 'weide', 'zug', 'winter'], opens: null },
    { id: 'wege', tags: ['wege', 'weg', 'erkundung'], opens: null },
    { id: 'handel', tags: ['handel', 'salz', 'markt'], opens: null },
    { id: 'krieg', tags: ['krieg', 'reiter', 'fuss', 'verteidigung', 'bau'], opens: null },
    { id: 'magie', tags: ['magie', 'geist', 'fernschau'], opens: { practice: ['magie', 'geist'], min: 2 } },
  ],
  unlock: [0, 2, 2],
  fallback: 'herde',
};

function pathEnv(opts = {}, pfade = PFADE) {
  const env = envWith(opts);
  // envWith builds a frozen env over a cloned regeln, so the block is set on that clone.
  env.regeln.pfade = structuredClone(pfade);
  return env;
}

const offer = (state, env, pid) => {
  const tc = context(state, env, 'open');
  research.offerPool(tc, pid);
  return tc;
};
const refs = (tc, pid) => tc.state.peoples[pid].developments.candidates.map((c) => c.ref);
const WIDE = { limits: { aboveTier: 3, candidatesPerTurn: 6, openCandidates: 12 } };

test('the pool skips achievements on a closed path and offers them once the path opens', () => {
  const env = pathEnv(WIDE);
  const s = fresh(env);
  assert.equal(refs(offer(s, env, H), H).includes('ahnensprache@1'), false);
  s.peoples[H].pfade = { opened: { magie: 0 } };
  assert.equal(refs(offer(s, env, H), H).includes('ahnensprache@1'), true);
});

// Esk at turn 8 with four clans and three tier-1 achievements: the kernel's open tier is 2.
function richEsk(env, extra = []) {
  const s = fresh(env);
  s.turn = 8;
  s.peoples.esk.population.core = 4;
  s.peoples.esk.developments.known.push(...['filzjurten', 'hirtenhunde', 'saumpfade', ...extra].map((id) => knownEntry(`${id}@1`)));
  s.peoples.esk.practice.ledger = [{ turn: 0, tags: { handel: 5, markt: 3, ordnung: 2 } }];
  return s;
}

test('the pool keeps a higher tier closed until the path tier reaches it', () => {
  const env = pathEnv({ ...WIDE, developments: [dev({ id: 'tauschplatz', name: 'Tauschplatz', tags: ['handel', 'markt'] })] });
  const one = richEsk(env, ['salzpfad']);
  assert.equal(research.openTier(one, env, 'esk'), 2);
  assert.equal(pathTier(env, one.peoples.esk, 'handel'), 1);
  assert.equal(refs(offer(one, env, 'esk'), 'esk').includes('marktrecht@1'), false);
  const two = richEsk(env, ['salzpfad', 'tauschplatz']);
  assert.equal(pathTier(env, two.peoples.esk, 'handel'), 2);
  assert.equal(refs(offer(two, env, 'esk'), 'esk').includes('marktrecht@1'), true);
});

test('candidates and research listed before the gate stay listed and assignable', () => {
  const env = pathEnv();
  const s = fresh(env);
  s.peoples[H].developments.candidates = [{ ref: 'ahnensprache@1', offeredAt: 0, expiresAt: 4, origin: 'pool' }];
  const tc = offer(s, env, H);
  assert.ok(refs(tc, H).includes('ahnensprache@1'));
  const ox = { ...orderContext(s, env, H), path: '/orders/0' };
  assert.deepEqual(research.ORDERS['research.assign'].check(ox, { id: 'o1', type: 'research.assign', params: { development: 'ahnensprache@1' } }), []);
});

test('research.direct on a path alone files the first three vocabulary tags of the path', () => {
  const env = pathEnv();
  const s = fresh(env);
  s.turn = 2;
  const def = research.ORDERS['research.direct'];
  const ox = { ...orderContext(s, env, H), path: '/orders/0' };
  const order = (params) => ({ id: 'o1', type: 'research.direct', params });
  assert.deepEqual(def.check(ox, order({ pfad: 'krieg' })), []);
  assert.deepEqual(def.check(ox, order({ pfad: 'krieg', tags: ['reiter'], note: 'Schnelle Pferde.' })), []);
  assert.deepEqual(def.tags(ox, order({ pfad: 'krieg' })), ['krieg', 'reiter', 'fuss']);
  assert.deepEqual(def.tags(ox, order({ pfad: 'krieg', tags: ['reiter'] })), ['reiter']);
  const tc = context(s, env, 'orders');
  def.resolve(tc, ox, order({ pfad: 'krieg' }));
  assert.deepEqual(tc.state.peoples[H].developments.requests.at(-1), { turn: 2, tags: ['krieg', 'reiter', 'fuss'], note: '', pfad: 'krieg' });
  def.resolve(tc, ox, order({ tags: ['handel'] }));
  assert.deepEqual(tc.state.peoples[H].developments.requests.at(-1), { turn: 2, tags: ['handel'], note: '' });
  assertCovered(tc, H);
  assert.deepEqual(validate(SCHEMAS.campaign, (({ derived, ...r }) => r)(tc.state)).filter((i) => i.path.includes('requests')), []);
});

test('research.direct refuses a closed or unknown path and a request without direction', () => {
  const env = pathEnv();
  const s = fresh(env);
  const def = research.ORDERS['research.direct'];
  const ox = { ...orderContext(s, env, H), path: '/orders/0' };
  const order = (params) => ({ id: 'o1', type: 'research.direct', params });
  for (const bad of [{ pfad: 'magie' }, { pfad: 'gibtsnicht' }, { pfad: 7 }, {}, { note: 'nur Notiz' }, { pfad: 'krieg', tags: [] }]) {
    const issues = def.check(ox, order(bad));
    assert.equal(issues.length, 1, JSON.stringify(bad));
    assert.equal(issues[0].code, 'target');
  }
  s.peoples[H].pfade = { opened: { magie: 0 } };
  assert.deepEqual(def.check({ ...orderContext(s, env, H), path: '/orders/0' }, order({ pfad: 'magie' })), []);
  // A world without paths knows no pfad.
  const plain = envWith();
  const p = fresh(plain);
  assert.equal(def.check({ ...orderContext(p, plain, H), path: '/orders/0' }, order({ pfad: 'krieg' }))[0].code, 'target');
});

test('refusals of the research orders carry a reason key and their values', () => {
  const env = pathEnv();
  const s = fresh(env);
  const ox = { ...orderContext(s, env, H), path: '/orders/0' };
  const direct = (params) => research.ORDERS['research.direct'].check(ox, { id: 'o1', type: 'research.direct', params })[0].params;
  assert.deepEqual(direct({ pfad: 'magie' }), { reason: 'pfad-closed', pfad: 'magie' });
  assert.deepEqual(direct({ pfad: 'gibtsnicht' }), { reason: 'unknown-pfad', pfad: 'gibtsnicht' });
  assert.deepEqual(direct({ tags: ['gibtsnicht'] }), { reason: 'unknown-tag', tag: 'gibtsnicht' });
  assert.deepEqual(direct({ tags: [] }), { reason: 'tag-count' });
  assert.deepEqual(direct({ tags: ['bau', 'bau'] }), { reason: 'tag-duplicate' });
  assert.deepEqual(direct({ tags: ['bau'], note: 'x'.repeat(201) }), { reason: 'note-length' });
  const assign = research.ORDERS['research.assign'].check(ox, { id: 'o1', type: 'research.assign', params: { development: 'filzjurten@1' } })[0];
  assert.deepEqual(assign.params, { reason: 'not-candidate', development: 'filzjurten@1' });
});

// --- research step ------------------------------------------------------------------------------

const withProject = (state, ref, progress = 0) => {
  state.peoples[H].developments.research = [{ ref, progress }];
  state.peoples[H].population.assigned = { nahrung: 3 };
  state.peoples[H].resources.wissen = 0;
  return state;
};

test('the research step latches a path whose practice condition holds, visible to the people', () => {
  const env = pathEnv();
  const s = fresh(env);
  s.turn = 3;
  s.peoples[H].practice.ledger = [{ turn: 1, tags: { geist: 1 } }, { turn: 2, tags: { magie: 1, zug: 2 } }];
  s.peoples.esk.practice.ledger = [{ turn: 2, tags: { magie: 1 } }];
  const tc = context(s, env);
  research.resolveResearch(tc);
  assert.deepEqual(tc.state.peoples[H].pfade, { opened: { magie: 3 } });
  assert.deepEqual(tc.state.peoples.esk.pfade, { opened: {} });
  const e = tc.log.find((x) => x.kind === 'pfad.opened');
  assert.deepEqual([e.target, e.change.field, e.change.after, e.visibleTo], [{ kind: 'people', id: H }, 'pfade.opened.magie', 3, [H]]);
  assertCovered(tc, H);

  // The next season keeps the first turn and writes nothing.
  const next = structuredClone(tc.state);
  next.turn = 4;
  const tc2 = context(next, env);
  research.resolveResearch(tc2);
  assert.deepEqual(tc2.state.peoples[H].pfade, { opened: { magie: 3 } });
  assert.deepEqual(tc2.log, []);
});

test('an achievement completed on a closed path opens it in the same season', () => {
  const env = pathEnv();
  const s = withProject(fresh(env), 'ahnensprache@1', 4);
  s.peoples[H].developments.candidates = [{ ref: 'ahnensprache@1', offeredAt: 0, expiresAt: 4, origin: 'agent' }];
  const tc = context(s, env);
  research.resolveResearch(tc);
  assert.ok(tc.state.peoples[H].developments.known.some((k) => k.ref === 'ahnensprache@1'));
  assert.deepEqual(tc.state.peoples[H].pfade.opened, { magie: 0 });
  assert.deepEqual(logKinds(tc).slice(-1), ['pfad.opened']);
});

test('a people from before paths gets its path record from the first research step, as a hidden entry', () => {
  const env = pathEnv();
  const s = fresh(env);
  for (const p of Object.values(s.peoples)) delete p.pfade;
  const tc = context(s, env);
  research.resolveResearch(tc);
  for (const pid of Object.keys(s.peoples)) assert.deepEqual(tc.state.peoples[pid].pfade, { opened: {} }, pid);
  const entries = tc.log.filter((e) => e.kind === 'research.pfade');
  assert.equal(entries.length, Object.keys(s.peoples).length);
  for (const e of entries) {
    assert.deepEqual([e.change.field, e.change.before, e.change.after, e.visibleTo], ['pfade', null, { opened: {} }, []]);
  }
  assertCovered(tc, H);
});

test('a world without paths writes no path record', () => {
  const env = envWith();
  const s = fresh(env);
  for (const p of Object.values(s.peoples)) delete p.pfade;
  const tc = context(s, env);
  research.resolveResearch(tc);
  assert.deepEqual(tc.log, []);
  assert.equal(tc.state.peoples[H].pfade, undefined);
});

test('points accumulate across seasons until the cost is reached, then the path tier rises', () => {
  const env = pathEnv({ developments: [dev({ id: 'weidewechsel', name: 'Weidewechsel', tags: ['weide', 'zug'], cost: { research: 9, resources: {} } })] });
  let s = withProject(fresh(env), 'filzjurten@1');
  s.peoples[H].developments.research.push({ ref: 'weidewechsel@1', progress: 0 });
  s.peoples[H].developments.known.push(knownEntry('hirtenhunde@1'));
  assert.equal(pathTier(env, s.peoples[H], 'herde'), 1);

  // filzjurten first, then weidewechsel; no knowledge and no labour, so each season brings the base rate.
  s.peoples[H].developments.research.shift();
  const cost = research.researchCost(s, env, H, 'weidewechsel@1');
  assert.ok(cost > RULES.researchBase, 'the project needs more than one season');
  const progress = [];
  for (let turn = 0; turn < 10 && !s.peoples[H].developments.known.some((k) => k.ref === 'weidewechsel@1'); turn++) {
    s = structuredClone(s);
    s.turn = turn;
    s.peoples[H].resources.wissen = 0;
    assert.equal(pointsOf(env, s.peoples[H]).total, RULES.researchBase);
    const tc = context(s, env);
    research.resolveResearch(tc);
    s = tc.state;
    progress.push(s.peoples[H].developments.research[0]?.progress ?? cost);
  }
  assert.equal(progress.length, Math.ceil(cost / RULES.researchBase));
  assert.deepEqual(progress, progress.map((_, i) => Math.min(cost, (i + 1) * RULES.researchBase)));
  // hirtenhunde and weidewechsel are two tier-1 achievements on herde: tier 2 opens on the path.
  assert.equal(pathTier(env, s.peoples[H], 'herde'), 2);
  const row = pathsView(s, env, H).paths.find((p) => p.id === 'herde');
  assert.ok(row.known.includes('weidewechsel@1'));
  assert.equal(row.tier, 2);
});

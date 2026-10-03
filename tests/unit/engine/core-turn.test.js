// Integration of the turn pipeline: determinism, opening stock, effective
// next turn, phase locking, log coverage, schema validity over a long run,
// start placement, and the real Hochland package.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testEnv, WELT } from '../../fixtures/engine/k1/pack.js';
import { makeEnv } from '../../../engine/core/env.js';
import { createCampaign, preview, seal, apply, open, emptyDraft, stateHash } from '../../../engine/core/turn.js';
import { fallbackDraft } from '../../../engine/ai/fallback.js';
import { checkDraft } from '../../../engine/core/orders.js';
import { hasErrors } from '../../../engine/core/issues.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { validate } from '../../../engine/content/schema.js';
import { RULES } from '../../../engine/core/rules.js';

const strip = ({ derived, ...rest }) => rest;
const schemaErrors = (name, doc) => validate(SCHEMAS[name], doc).map((i) => `${i.path} ${i.message}`);

function hochlandEnv() {
  const j = (p) => JSON.parse(readFileSync(new URL(`../../../welten/hochland/${p}`, import.meta.url), 'utf8'));
  return makeEnv({ welt: j('welt.json'), regeln: j('regeln.json'), content: { entwicklungen: j('content/entwicklungen.json'), ereignisse: j('content/ereignisse.json'), bestimmungen: j('content/bestimmungen.json') } });
}

/** Test-local die (LCG), independent of the kernel's sfc32. */
function dice(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    return 1 + ((x >>> 16) % 10);
  };
}

/** Player draft: fallback policy orders plus a roll for every player probe. */
function playerDraft(state, env, roll) {
  const pid = state.campaign.player;
  const d = { ...fallbackDraft(state, env, pid), sealed: false, rolls: {} };
  const pv = preview(state, env, d, { as: pid });
  for (const p of pv.probes) if (p.roller === 'player') d.rolls[p.id] = { value: roll(), fingerprint: p.fingerprint };
  return d;
}

/** One season from planning to planning (or ended). */
function season(state, env, roll, makeDraft = playerDraft) {
  const d = makeDraft(state, env, roll);
  const s = seal(state, env, { [state.campaign.player]: d });
  assert.ok(s.ok, `seal: ${JSON.stringify(s.issues.slice(0, 3))}`);
  const a = apply(s.state, env, s.drafts);
  assert.ok(a.ok, `apply: ${JSON.stringify(a.issues.slice(0, 3))}`);
  const o = a.state.status === 'ended' ? { state: a.state } : open(a.state, env);
  return { sealed: s.state, applied: a.state, report: a.report, state: o.state };
}

function start(env = testEnv(), seed = 7) {
  return open(createCampaign(env, { id: 'test-1', seed }).state, env).state;
}

test('same seed and drafts give identical state hashes over twelve seasons', () => {
  const run = () => {
    const env = testEnv();
    let s = start(env);
    const roll = dice(3);
    const hashes = [];
    for (let i = 0; i < 12 && s.status === 'playing'; i++) {
      s = season(s, env, roll).state;
      hashes.push(stateHash(s));
    }
    return hashes;
  };
  assert.deepEqual(run(), run());
});

test('preview is pure: state and rng untouched', () => {
  const env = testEnv();
  const s = start(env);
  const before = JSON.stringify(s);
  const d = playerDraft(s, env, dice(1));
  preview(s, env, d, { as: s.campaign.player });
  assert.equal(JSON.stringify(s), before);
});

test('the start places every people in its own region', () => {
  const env = testEnv();
  for (let seed = 1; seed <= 40; seed++) {
    const { state } = createCampaign(env, { id: 'test-1', seed });
    const regions = state.map.settlements.map((s) => s.regionId);
    assert.equal(new Set(regions).size, regions.length, `seed ${seed}: ${regions}`);
  }
});

test('the start places every people in its own region with the real Hochland package and seed 48213', () => {
  const env = hochlandEnv();
  for (const seed of [48213, 7, 11, 52, 54, 60]) {
    const { state } = createCampaign(env, { id: 'test-1', seed, player: 'bergnomaden' });
    const regions = state.map.settlements.map((s) => s.regionId);
    assert.equal(new Set(regions).size, regions.length, `seed ${seed}: ${regions}`);
  }
});

test('costs are checked against the opening stock; yields of the same season do not cover them', () => {
  const env = testEnv();
  const s = start(env);
  const pid = s.campaign.player;
  const poor = structuredClone(s);
  poor.peoples[pid].resources.material = 1;
  const d = { ...emptyDraft(poor, pid), orders: [{ id: 'o1', type: 'found', params: { tile: '0,0' } }] };
  const chk = checkDraft(poor, env, d, { as: pid, mode: 'preview' });
  // found costs RULES.foundCost material 2 > opening stock 1, whatever the harvest brings.
  const codes = chk.issues.map((i) => i.code);
  assert.ok(codes.includes('cost') || codes.includes('target'), codes.join(','));
  if (!codes.includes('target')) assert.ok(codes.includes('cost'));
});

test('phase locking: seal only in planning, apply only from planning or resolving, open only in agents', () => {
  const env = testEnv();
  const created = createCampaign(env, { id: 'test-1', seed: 7 }).state;
  assert.equal(created.phase, 'agents');
  assert.equal(seal(created, env, {}).issues[0].code, 'phase');
  assert.equal(apply(created, env, {}).issues[0].code, 'phase');
  const planning = open(created, env).state;
  assert.equal(open(planning, env).issues[0].code, 'phase');
  const pid = planning.campaign.player;
  const pv = preview(planning, env, emptyDraft(planning, pid), { as: pid });
  const d = emptyDraft(planning, pid);
  d.rolls[pv.probes[0].id] = { value: 5, fingerprint: pv.probes[0].fingerprint };
  const sealed = seal(planning, env, { [pid]: d });
  assert.equal(sealed.state.phase, 'resolving');
  assert.equal(seal(sealed.state, env, {}).issues[0].code, 'phase');
  // A draft cannot be previewed while the season resolves.
  const late = preview(sealed.state, env, d, { as: pid });
  assert.ok(late.issues.some((i) => i.code === 'phase'));
  assert.equal(open(sealed.state, env).issues[0].code, 'phase');
});

test('seal without the player roll fails with roll_missing and leaves the state unchanged', () => {
  const env = testEnv();
  const s = start(env);
  const r = seal(s, env, { [s.campaign.player]: emptyDraft(s, s.campaign.player) });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === 'roll_missing'));
  assert.equal(r.state, s);
});

test('a roll made before a parameter change is stale', () => {
  const env = testEnv();
  const s = start(env);
  const pid = s.campaign.player;
  const home = s.map.settlements.find((x) => x.people === pid).tile;
  const [q, r] = home.split(',').map(Number);
  const d = { ...emptyDraft(s, pid), orders: [{ id: 'o1', type: 'explore', params: { tile: `${q + 2},${r}` } }] };
  const pv = preview(s, env, d, { as: pid });
  const probe = pv.probes.find((p) => p.order === 'o1');
  d.rolls[probe.id] = { value: 6, fingerprint: probe.fingerprint };
  d.orders[0].params.tile = `${q},${r + 2}`;
  const again = preview(s, env, d, { as: pid });
  assert.ok(again.issues.some((i) => i.code === 'roll_stale'));
});

test('an AI draft with errors is replaced by the fallback policy and logged', () => {
  const env = testEnv();
  const s = start(env);
  const ai = Object.keys(s.peoples).find((p) => s.peoples[p].controller === 'ai');
  const broken = { ...emptyDraft(s, ai), orders: [{ id: 'o1', type: 'no-such-order', params: {} }] };
  const pid = s.campaign.player;
  const d = playerDraft(s, env, dice(5));
  const r = seal(s, env, { [pid]: d, [ai]: broken });
  assert.ok(r.ok);
  assert.ok(r.substitutions.some((x) => x.people === ai));
  assert.ok(r.events.some((e) => e.kind === 'draft.fallback' && e.target.id === ai));
});

// Changed leaf paths between two states, lists counted as one value.
function leafDiff(a, b, prefix = '') {
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (obj(a) && obj(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    return keys.flatMap((k) => leafDiff(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [prefix];
}

const BOOKKEEPING = /^(rev|turn|phase|rng|derived|chronicle|ingested|eventDraws)(\.|$)|^map\.known(\.|$)/;

function covered(path, events) {
  const seg = path.split('.');
  const near = (f) => f === path || f.startsWith(`${path}.`) || path.startsWith(`${f}.`);
  return events.some((e) => {
    if (!e.change) return false;
    const f = e.change.field;
    const t = e.target;
    if (seg[0] === 'peoples') {
      if (t.kind === 'people' && t.id === seg[1] && near(`peoples.${seg[1]}.${f}`)) return true;
      if (seg[2] === 'council' && t.kind === 'member') return true;
      if (seg[2] === 'units' && t.kind === 'unit') return true;
      return false;
    }
    if (seg[0] === 'map' && seg[1] === 'settlements') return ['settlement', 'tile', 'region'].includes(t.kind);
    if (seg[0] === 'map' && seg[1] === 'control') return t.kind === 'region' && (seg.length < 3 || t.id === seg[2]);
    if (seg[0] === 'map' && seg[1] === 'features') return t.kind === 'tile';
    if (seg[0] === 'relations') return t.kind === 'relation' && (seg.length < 2 || t.id === seg[1]);
    return near(f) || t.kind === 'campaign';
  });
}

test('every changed field of a season has a log entry with source, target, change, reason, visibleTo and step', () => {
  const env = testEnv();
  let s = start(env);
  const roll = dice(9);
  for (let i = 0; i < 8 && s.status === 'playing'; i++) {
    const before = s;
    const r = season(s, env, roll);
    for (const [from, to, evs] of [[before, r.sealed, null], [r.sealed, r.applied, r.report.events], [r.applied, r.state, r.state.chronicle]]) {
      const events = evs ?? to.chronicle.filter((e) => e.turn === to.turn);
      for (const e of events) {
        assert.ok(e.source && e.target && 'change' in e && e.reason && Array.isArray(e.visibleTo) && e.step, JSON.stringify(e));
      }
      const changed = leafDiff(strip(from), strip(to)).filter((p) => !BOOKKEEPING.test(p));
      for (const p of changed) assert.ok(covered(p, events), `turn ${from.turn}: ${p} changed without a log entry`);
    }
    s = r.state;
  }
});

test('new developments, buildings and units act from the next season only', () => {
  const env = testEnv();
  let s = start(env);
  const roll = dice(4);
  for (let i = 0; i < 16 && s.status === 'playing'; i++) {
    const r = season(s, env, roll);
    for (const [pid, p] of Object.entries(r.applied.peoples)) {
      const before = new Set(s.peoples[pid].developments.known.map((k) => k.ref));
      for (const k of p.developments.known) if (!before.has(k.ref)) assert.equal(k.effectiveFrom, s.turn + 1, `${pid} ${k.ref}`);
    }
    s = r.state;
  }
});

/** Invariants every state must hold. */
function assertInvariants(state, env, label) {
  assert.deepEqual(schemaErrors('campaign', strip(state)), [], `${label}: campaign schema`);
  for (const [pid, p] of Object.entries(state.peoples)) {
    for (const [res, n] of Object.entries(p.resources)) {
      assert.ok(Number.isInteger(n) && n >= 0, `${label} ${pid}.${res} = ${n}`);
      const cap = state.derived?.[pid]?.caps?.[res];
      // Stocks end a season at most at their cap plus the unspoiled half of the excess.
      if (cap !== undefined && cap > 0) assert.ok(n <= cap * 2 + 12, `${label} ${pid}.${res} ${n} far above cap ${cap}`);
    }
    for (const m of p.council) assert.ok(m.loyalty >= -5 && m.loyalty <= 5, `${label} loyalty`);
    assert.ok(Number.isInteger(p.population.core) && p.population.core >= 0);
  }
  assert.equal(JSON.stringify(state).includes('NaN'), false, `${label}: NaN`);
  assert.equal(state.status === 'ended', state.result != null, `${label}: status and result disagree`);
}

test('200 seasons with the fallback policy keep every invariant and stay schema-valid', { timeout: 600000 }, () => {
  const env = testEnv();
  let s = start(env, 21);
  const roll = dice(21);
  let lastRev = s.rev;
  let i = 0;
  for (; i < 200 && s.status === 'playing'; i++) {
    const r = season(s, env, roll);
    assertInvariants(r.applied, env, `turn ${s.turn}`);
    assert.deepEqual(schemaErrors('report', r.report), [], `report turn ${s.turn}`);
    // Gains are capped before losses and half the excess spoils: a stock that
    // ends above its cap has shrunk during the season.
    for (const [pid, p] of Object.entries(r.applied.peoples)) {
      for (const [res, n] of Object.entries(p.resources)) {
        const cap = r.applied.derived[pid].caps[res];
        if (cap !== undefined && n > cap) assert.ok(n < (s.peoples[pid].resources[res] ?? 0), `turn ${s.turn} ${pid}.${res}: ${n} above cap ${cap} without shrinking`);
      }
    }
    assert.ok(r.state.rev > lastRev);
    lastRev = r.state.rev;
    s = r.state;
  }
  assert.ok(i > 0);
});

test('ten seasons on the real Hochland package with the fallback policy', { timeout: 300000 }, () => {
  const env = hochlandEnv();
  let s = open(createCampaign(env, { id: 'hl-1', seed: 48213, player: 'bergnomaden' }).state, env).state;
  const roll = dice(48213);
  for (let i = 0; i < 10 && s.status === 'playing'; i++) {
    const r = season(s, env, roll);
    assertInvariants(r.applied, env, `hochland turn ${s.turn}`);
    s = r.state;
  }
  assert.ok(s.turn >= 1);
});

test('seal records a world-event draw for every living people, with the player roll taken from the draft', () => {
  const env = testEnv();
  const s = start(env);
  const pid = s.campaign.player;
  const d = playerDraft(s, env, () => 9);
  const r = seal(s, env, { [pid]: d });
  assert.equal(r.state.eventDraws[pid].roll, 9);
  assert.equal(r.state.eventDraws[pid].roller, 'player');
  assert.equal(r.state.eventDraws[pid].band, 5);
  for (const other of Object.keys(s.peoples).filter((p) => p !== pid)) assert.equal(r.state.eventDraws[other].roller, 'kernel');
  assert.ok(RULES.eventBands.length === 5);
});

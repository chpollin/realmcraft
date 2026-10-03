// Kernel data the board reads (plan-m1, lane K2): machine-readable issues,
// council, trade, rival destinies and the outcome in derived, the preview of
// decisions and of a destiny adoption, campaign settings and their migration.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { testEnv } from '../../fixtures/engine/k1/pack.js';
import { PLAYER, planning, withRolls } from '../../fixtures/engine/k1/views.js';
import { apply, createCampaign, emptyDraft, migrate, open, orderTile, preview } from '../../../engine/core/turn.js';
import { bagParam, issue } from '../../../engine/core/issues.js';
import { catalogueFor, checkDraft, leadMods } from '../../../engine/core/orders.js';
import { computeDerived } from '../../../engine/core/derive.js';
import { projectFor } from '../../../engine/core/project.js';
import { createContext } from '../../../engine/core/log.js';
import { homeSettlement, relKey, settingsOf } from '../../../engine/core/state.js';
import { validate } from '../../../engine/content/schema.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { key, parseKey } from '../../../engine/world/index.js';

const GENERIC = new Set(['target', 'cost', 'format', 'duplicate', 'phase', 'stale', 'slots', 'restricted', 'locked_order', 'limit']);
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const draftOf = (state, orders, extra = {}) => ({ ...emptyDraft(state, PLAYER), orders, ...extra });
const known = (ref) => ({ ref, since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null });
const meet = (state, a, b, patch = {}) => { state.relations[relKey(a, b)] = { ...state.relations[relKey(a, b)], contact: true, ...patch }; };

describe('issue params', () => {
  it('keeps flat params, drops absent values and carries untrusted objects as text', () => {
    const i = issue('target', '/x', 'msg', { params: { reason: 'not-tile', tile: { q: 1 }, n: 3, ok: true, list: ['a'], gone: undefined, none: null } });
    assert.deepEqual(i.params, { reason: 'not-tile', tile: '{"q":1}', n: 3, ok: true, list: ['a'] });
    assert.equal(Object.hasOwn(issue('target', '', 'm', { params: { gone: undefined } }), 'params'), false);
  });

  it('refuses a reason that is not a kebab-case key', () => {
    assert.throws(() => issue('target', '', 'm', { params: { reason: 'Not Kebab' } }), /kebab-case/);
    assert.throws(() => issue('target', '', 'm', { params: { reason: 'snake_case' } }), /kebab-case/);
  });

  it('encodes a resource bag as sorted res:n entries', () => {
    assert.deepEqual(bagParam({ salz: 2, nahrung: 1 }), ['nahrung:1', 'salz:2']);
  });

  it('gives every refusal of a draft check its params, with a reason for generic codes', () => {
    const { env, state } = planning();
    const home = homeSettlement(state, PLAYER).tile;
    const far = key(parseKey(home).q + 30, parseKey(home).r);
    const draft = draftOf(state, [
      { id: 'o1', type: 'found', params: { tile: 'nowhere' } },
      { id: 'o2', type: 'explore', params: { tile: far } },
      { id: 'o3', type: 'nonsense', params: {} },
      { id: 'o3', type: 'institute', params: { development: 'filzjurten@1' } },
      { id: 'o4', type: 'road', params: { tile: home } },
      { id: 'o5', type: 'explore', params: { tile: home } },
    ], { assign: { nahrung: 9 }, choices: { 'c-none': 'xx' }, lead: { o5: 'niemand' }, venture: { o2: true } });
    const chk = checkDraft(projectFor(state, env, PLAYER), env, draft, { as: PLAYER, mode: 'preview' });
    assert.ok(chk.issues.length >= 8);
    for (const i of chk.issues) {
      if (GENERIC.has(i.code)) assert.match(i.params?.reason ?? '', KEBAB, `${i.code} ${i.message}`);
      if (/\d/.test(i.message.replace(/\/orders\/\d+/g, ''))) assert.ok(i.params, `${i.code} interpolates a value: ${i.message}`);
    }
    const by = (reason) => chk.issues.find((i) => i.params?.reason === reason);
    assert.deepEqual(by('not-tile').params, { reason: 'not-tile', tile: 'nowhere' });
    assert.deepEqual(by('out-of-range').params, { reason: 'out-of-range', tile: far, range: 4 });
    assert.equal(chk.issues.find((i) => i.code === 'unknown_order').params.type, 'nonsense');
    assert.equal(by('order-id').params.order, 'o3');
    assert.equal(by('not-institution').params.development, 'filzjurten@1');
    assert.deepEqual(by('no-decision').params, { reason: 'no-decision', decision: 'c-none' });
    assert.deepEqual(by('lead-not-member').params, { reason: 'lead-not-member', member: 'niemand', order: 'o5' });
    assert.deepEqual(by('venture-not-main').params, { reason: 'venture-not-main', order: 'o2' });
    assert.deepEqual(by('not-unlocked').params, { reason: 'not-unlocked', type: 'road' });
    assert.deepEqual(chk.issues.find((i) => i.code === 'labour').params, { assigned: 9, core: 3 });
  });

  it('names the reason of a locked catalogue row as the draft check would', () => {
    const { env, state } = planning();
    const rows = catalogueFor(state, env, PLAYER);
    for (const r of rows) {
      if (r.available) assert.equal(r.code, null);
      else {
        assert.ok(['locked_order', 'restricted'].includes(r.code), r.type);
        assert.match(r.params.reason, KEBAB);
        assert.equal(r.params.type, r.type);
      }
    }
    assert.equal(rows.find((r) => r.type === 'trade.offer').params.reason, 'module-inactive');
  });

  it('prices a cost overrun and an unused slot with their numbers', () => {
    const { env, state } = planning();
    const draft = draftOf(state, [{ id: 'o1', type: 'found', params: { tile: homeSettlement(state, PLAYER).tile } }]);
    const s = structuredClone(state);
    s.peoples[PLAYER].resources.material = 0;
    const chk = checkDraft(s, env, draft, { as: PLAYER, mode: 'preview' });
    const free = chk.issues.find((i) => i.code === 'free_slots');
    assert.deepEqual(free.params, { slot: 'minor', free: 2 });
  });
});

describe('creation options and settings', () => {
  const env = testEnv();

  it('writes the settings and places only the named rivals', () => {
    const { state } = createCampaign(env, { id: 'opt-1', seed: 7, rivals: ['esk'], difficulty: 'hard', language: 'en' });
    assert.deepEqual(Object.keys(state.peoples).sort(), ['esk', 'hochweide']);
    assert.deepEqual(state.settings, { difficulty: 'hard', language: 'en' });
    assert.deepEqual(validate(SCHEMAS.campaign, state), []);
  });

  it('scales the start stock of the AI peoples by difficulty, never the player', () => {
    const at = (difficulty) => createCampaign(env, { id: 'opt-2', seed: 7, difficulty }).state;
    const [easy, normal, hard] = ['easy', 'normal', 'hard'].map(at);
    assert.deepEqual(normal.peoples.esk.resources, env.regeln.peopleTemplates.find((t) => t.id === 'esk').resources);
    assert.equal(hard.peoples.esk.resources.nahrung, Math.round(8 * 1.25));
    assert.equal(easy.peoples.esk.resources.nahrung, Math.round(8 * 0.75));
    assert.deepEqual(hard.peoples[PLAYER].resources, normal.peoples[PLAYER].resources);
  });

  it('refuses unknown templates, the player as rival, an unknown difficulty and a bad language', () => {
    assert.throws(() => createCampaign(env, { id: 'x', seed: 1, rivals: ['niemand'] }), /no people template niemand/);
    assert.throws(() => createCampaign(env, { id: 'x', seed: 1, rivals: [PLAYER] }), /player's people/);
    assert.throws(() => createCampaign(env, { id: 'x', seed: 1, difficulty: 'brutal' }), /difficulty/);
    assert.throws(() => createCampaign(env, { id: 'x', seed: 1, language: 'deutsch' }), /two-letter/);
  });

  it('reads the defaults for a state without settings', () => {
    assert.deepEqual(settingsOf({}), { difficulty: 'normal', language: 'de' });
  });
});

describe('migration of a campaign written before M1', () => {
  it('writes settings and member locations with log entries at the next transition, and stays valid', () => {
    const env = testEnv();
    const created = createCampaign(env, { id: 'old-1', seed: 7 }).state;
    const old = structuredClone(created);
    delete old.settings;
    for (const p of Object.values(old.peoples)) for (const m of p.council) delete m.at;
    assert.deepEqual(validate(SCHEMAS.campaign, old), [], 'the pre-M1 shape stays valid');
    const opened = open(old, env);
    assert.ok(opened.ok);
    assert.deepEqual(opened.state.settings, { difficulty: 'normal', language: 'de' });
    for (const p of Object.values(opened.state.peoples)) for (const m of p.council) assert.equal(m.at, null);
    assert.ok(opened.events.some((e) => e.kind === 'campaign.settings'));
    assert.ok(opened.events.some((e) => e.kind === 'member.at'));
    assert.deepEqual(validate(SCHEMAS.campaign, opened.state), []);
    // A migrated state needs nothing further.
    const tc = createContext(opened.state, env);
    migrate(tc);
    assert.equal(tc.log.length, 0);
  });
});

describe('council in derived', () => {
  it('places a member at the tile of the order he led, until planning opens again', () => {
    const { env, state } = planning();
    const home = homeSettlement(state, PLAYER);
    const tile = key(parseKey(home.tile).q + 1, parseKey(home.tile).r);
    const draft = withRolls(state, env, draftOf(state, [{ id: 'o1', type: 'explore', params: { tile } }], { lead: { o1: 'torhild' } }));
    const res = apply(state, env, { [PLAYER]: draft });
    assert.ok(res.ok, JSON.stringify(res.issues));
    assert.equal(res.state.peoples[PLAYER].council.find((m) => m.id === 'torhild').at, tile);
    const row = res.state.derived[PLAYER].council.find((c) => c.id === 'torhild');
    assert.deepEqual(row.location, { tile, settlement: null });
    const ulrun = res.state.derived[PLAYER].council.find((c) => c.id === 'ulrun');
    assert.deepEqual(ulrun.location, { tile: home.tile, settlement: home.id });
    const opened = open(res.state, env);
    assert.equal(opened.state.peoples[PLAYER].council.find((m) => m.id === 'torhild').at, null);
    assert.equal(opened.state.derived[PLAYER].council.find((c) => c.id === 'torhild').location.tile, home.tile);
  });

  it('gives the lead modifier a probe would take and the goal tags', () => {
    const { state } = planning();
    const people = state.peoples[PLAYER];
    for (const row of state.derived[PLAYER].council) {
      const m = people.council.find((x) => x.id === row.id);
      assert.equal(row.strengths.lead, leadMods(people, m.id).reduce((n, x) => n + x.value, 0));
      assert.deepEqual(row.strengths.favor, m.goal.favor);
      assert.deepEqual(row.strengths.oppose, m.goal.oppose);
    }
    assert.equal(state.derived[PLAYER].council.find((c) => c.id === 'ulrun').strengths.lead, -1);
  });

  it('reads the target tile from the params the orders use', () => {
    const { env, state } = planning();
    const world = env.world(state.map.seed);
    const home = homeSettlement(state, PLAYER);
    assert.equal(orderTile(state, world, PLAYER, { params: { tile: '1,2' } }), '1,2');
    assert.equal(orderTile(state, world, PLAYER, { params: { settlement: home.id } }), home.tile);
    assert.equal(orderTile(state, world, PLAYER, { params: { mode: 'listen' } }), null);
  });
});

describe('trade in derived', () => {
  const withTrade = () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    for (const pid of [PLAYER, 'esk']) s.peoples[pid].developments.known.push(known('salzpfad@1'));
    meet(s, PLAYER, 'esk');
    meet(s, PLAYER, 'glutreiter');
    s.derived = computeDerived(s, env);
    return { env, state: s };
  };

  it('lists one row per contact with a reason the order check would give', () => {
    const { env, state } = withTrade();
    const t = state.derived[PLAYER].trade;
    assert.deepEqual(t.routes.map((r) => r.partner), ['esk', 'glutreiter']);
    assert.equal(t.routes.find((r) => r.partner === 'glutreiter').reason, 'handel.not_trading');
    assert.ok(t.orders.includes('trade.offer'));
    const esk = t.routes.find((r) => r.partner === 'esk');
    assert.equal(esk.reachable, esk.reason === null);
    assert.ok(esk.reason === null || esk.reason === 'handel.no_route');
    // The order check on the projection agrees with the row.
    const offer = { id: 'o1', type: 'trade.offer', params: { partner: 'esk', give: { nahrung: 1 }, get: { salz: 1 }, seasons: 2 } };
    const chk = checkDraft(projectFor(state, env, PLAYER), env, draftOf(state, [offer]), { as: PLAYER, mode: 'preview' });
    const route = chk.issues.find((i) => i.code.startsWith('handel.'));
    assert.equal(route?.code ?? null, esk.reason);
  });

  it('marks a partner at war', () => {
    const { env, state } = withTrade();
    meet(state, PLAYER, 'esk', { atWar: true });
    const t = computeDerived(state, env)[PLAYER].trade;
    assert.deepEqual(t.routes.find((r) => r.partner === 'esk'), { partner: 'esk', length: null, roads: 0, reachable: false, reason: 'handel.at_war' });
  });

  it('has no rows without contact', () => {
    const { state } = planning();
    assert.deepEqual(state.derived[PLAYER].trade.routes, []);
  });
});

describe('rival destinies in derived', () => {
  it('reveals a destiny with contact and a reached milestone, or under a reveal of scope people', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    const rows = () => computeDerived(s, env).esk.rivals;
    assert.deepEqual(rows().find((r) => r.people === PLAYER), { people: PLAYER, destiny: null });
    meet(s, 'esk', PLAYER);
    assert.equal(rows().find((r) => r.people === PLAYER).destiny, null, 'contact alone reveals nothing');
    s.peoples[PLAYER].bestimmung.milestones[0].reached = true;
    const d = rows().find((r) => r.people === PLAYER).destiny;
    assert.equal(d.ref, 'ueberdauern@1');
    assert.equal(d.name, 'Überdauern in den Kämmen');
    assert.deepEqual(d.milestones.map((m) => [m.id, m.reached]), [['weiden', true], ['winter', false], ['pfade', false]]);
    meet(s, 'esk', PLAYER, { contact: false });
    assert.equal(rows().find((r) => r.people === PLAYER).destiny, null);
    s.peoples.esk.modules.kern.revealed = { [PLAYER]: s.turn };
    assert.equal(rows().find((r) => r.people === PLAYER).destiny.ref, 'ueberdauern@1');
  });
});

describe('outcome in derived', () => {
  it('is null while playing and summarises the campaign once it ended', () => {
    const { env, state } = planning();
    assert.equal(state.derived[PLAYER].outcome, null);
    const s = structuredClone(state);
    s.status = 'ended';
    s.result = { winner: PLAYER, kind: 'victory', turn: 5, reason: 'fulfilled' };
    const d = computeDerived(s, env);
    const o = d[PLAYER].outcome;
    assert.deepEqual({ kind: o.kind, winner: o.winner, won: o.won, turn: o.turn }, { kind: 'victory', winner: PLAYER, won: true, turn: 5 });
    assert.equal(o.summary.turns, 6);
    assert.equal(o.summary.year, 2);
    assert.equal(o.summary.population, s.peoples[PLAYER].population.core);
    assert.equal(o.summary.settlements, 1);
    assert.deepEqual(o.summary.destiny, { ref: 'ueberdauern@1', name: 'Überdauern in den Kämmen', reached: 0, of: 3 });
    assert.ok(o.summary.highlights.length <= 8);
    assert.equal(d.esk.outcome.won, false);
    assert.equal(d.esk.outcome.summary.destiny, null);
  });

  it('takes highlights only from entries the people may see', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    s.status = 'ended';
    s.result = { winner: null, kind: 'collapse', turn: 0, reason: 'gone' };
    const entry = (id, kind, visibleTo, change = null) => ({ id, turn: 0, source: 'kernel', kind, target: { kind: 'people', id: 'x' }, change, reason: 'r', refs: [], visibleTo, step: 'research' });
    s.chronicle = [
      entry('T0-e90', 'research.completed', [PLAYER]),
      entry('T0-e91', 'research.completed', ['esk']),
      entry('T0-e92', 'map.control', [PLAYER, 'esk'], { field: 'control', before: PLAYER, after: 'esk' }),
      entry('T0-e93', 'people.collapsed', ['all']),
    ];
    assert.deepEqual(computeDerived(s, env)[PLAYER].outcome.summary.highlights, ['T0-e90', 'T0-e93']);
  });
});

describe('preview of decisions and of a destiny adoption', () => {
  it('shows the delta of a chosen option and folds its resources into the forecast', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    s.pendingChoices = [{ id: 'c-1-hochweide', people: PLAYER, event: 'fremder-hirte@1', offeredAt: 0, deadline: 2, options: ['aufnehmen', 'abweisen'] }];
    const base = preview(s, env, draftOf(s, []), { as: PLAYER });
    const pv = preview(s, env, draftOf(s, [], { choices: { 'c-1-hochweide': 'aufnehmen' } }), { as: PLAYER });
    assert.deepEqual(pv.choices, [{ id: 'c-1-hochweide', option: 'aufnehmen', delta: { resources: { herden: 1, nahrung: -1 } } }]);
    assert.deepEqual(base.choices, []);
    assert.deepEqual(s.peoples[PLAYER].resources, state.peoples[PLAYER].resources, 'the preview writes nothing');
    const p = projectFor(s, env, PLAYER);
    assert.deepEqual(preview(p, env, draftOf(s, [], { choices: { 'c-1-hochweide': 'aufnehmen' } }), { as: PLAYER }).choices, pv.choices, 'same on the projection');
    assert.equal(pv.forecast.net.herden ?? 0, (base.forecast.net.herden ?? 0) + 1);
    assert.equal(pv.forecast.net.nahrung ?? 0, (base.forecast.net.nahrung ?? 0) - 1);
  });

  it('ignores an answer that names no open decision', () => {
    const { env, state } = planning();
    assert.deepEqual(preview(state, env, draftOf(state, [], { choices: { 'c-x': 'aufnehmen' } }), { as: PLAYER }).choices, []);
  });

  it('shows the destiny, its milestones and the cost of an adoption on the order row', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    s.peoples[PLAYER].bestimmung = null;
    s.peoples[PLAYER].standing = 2;
    const draft = draftOf(s, [{ id: 'o1', type: 'destiny.adopt', params: { bestimmung: 'ueberdauern@1' } }], { mandate: { o1: 'decree' } });
    const row = preview(projectFor(s, env, PLAYER), env, draft, { as: PLAYER }).orders.find((o) => o.id === 'o1');
    assert.equal(row.ok, true);
    assert.equal(row.destiny.ref, 'ueberdauern@1');
    assert.equal(row.destiny.name, 'Überdauern in den Kämmen');
    assert.deepEqual(row.destiny.milestones.map((m) => m.id), ['weiden', 'winter', 'pfade']);
    assert.deepEqual(row.destiny.delta, { standing: -1 });
  });
});

// tests/unit/spielbrett-adapter.test.js — browser data layer of the game board
// (spielbrett/js/data) in Node. Expected values come from the fixtures, the
// Hochland world package or kernel functions called here, never from literals
// typed after the fact.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildEnv, previewDraft, bandOf, calendarOf, loyaltyBand, mapLayers, researchCost, sameWorld, emptyDraft } from '../../spielbrett/js/data/kernel.js';
import { makeLabels, bandKey } from '../../spielbrett/js/data/labels.js';
import { adaptView, destiny, issueKey, orderRows, previewDeltas, rivals } from '../../spielbrett/js/data/adapter.js';
import { draftFor, nextOrderId, openRolls, withAssign, withOrder, withoutOrder, withRoll, withMandate } from '../../spielbrett/js/data/draft.js';
import { candidates, optionsFor } from '../../spielbrett/js/data/options.js';
import { originOf, pickCampaign } from '../../spielbrett/js/data/game.js';
import { regionOf } from '../../engine/world/index.js';
import { evalPredicate } from '../../engine/core/bestimmung.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const json = (p) => JSON.parse(readFileSync(root(p), 'utf8'));

const pack = {
  welt: json('welten/hochland/welt.json'),
  regeln: json('welten/hochland/regeln.json'),
  labels: json('welten/hochland/labels.json'),
  entwicklungen: json('welten/hochland/content/entwicklungen.json'),
  ereignisse: json('welten/hochland/content/ereignisse.json'),
  bestimmungen: json('welten/hochland/content/bestimmungen.json'),
};
const env = buildEnv(pack, []);
const t = makeLabels(pack.labels);
const tile = (k) => { const [q, r] = k.split(',').map(Number); return { q, r }; };

// Hochland, turn 0, player bergnomaden, written by the kernel CLI (build.mjs).
const view = json('tests/fixtures/spielbrett/view-hochland-t0.json');
const pid = view.people;
const own = view.peoples[pid];
const world = env.world(view.map.seed);
const draft0 = draftFor(view, null);
const pv0 = previewDraft(view, env, draft0);
const camp = view.map.settlements.find((s) => s.people === pid);
const EXPLORE = { type: 'explore', params: { tile: camp.tile } };

describe('adaptView on the Hochland turn-0 view', () => {
  const model = adaptView({ view, env, t, world, preview: pv0, chronik: [] });

  test('fixture is the current package and the planning phase', () => {
    assert.equal(sameWorld(view, env), true);
    assert.equal(view.phase, 'planning');
    assert.equal(model.phase, 'planung');
    assert.equal(model.kernPhase, view.phase);
  });

  test('zeit and naechsteZeit come from the calendar and season labels', () => {
    const now = calendarOf(env.regeln, view.turn);
    const next = calendarOf(env.regeln, view.turn + 1);
    assert.deepEqual(model.zeit, { saison: t(`season.${now.season}`), jahr: now.year });
    assert.deepEqual(model.naechsteZeit, { saison: t(`season.${next.season}`), jahr: next.year });
    assert.equal(model.winter, now.winter);
  });

  test('ressourcen lists the first three package resources, volk, then the approval meter', () => {
    const base = env.regeln.resources.slice(0, 3).map((r) => r.id);
    const meter = Object.keys(own.meters)[0];
    assert.deepEqual(model.ressourcen.map((r) => r.key), [...base, 'volk', meter]);
    base.forEach((id, i) => {
      assert.equal(model.ressourcen[i].name, t(`resource.${id}`));
      assert.equal(model.ressourcen[i].wert, own.resources[id]);
      assert.equal(model.ressourcen[i].netto, pv0.forecast.net[id] ?? 0);
      assert.equal(model.ressourcen[i].cap, pv0.forecast.caps[id]);
    });
    const volk = model.ressourcen[3];
    assert.equal(volk.name, t('population.core'));
    assert.equal(volk.wert, own.population.core);
    assert.equal(volk.cap, pv0.forecast.popCap);
    const approval = model.ressourcen[4];
    assert.equal(approval.name, t(`meter.${meter}`));
    assert.equal(approval.wert, own.meters[meter]);
  });

  test('special goods are the remaining package resources that are held, flowing or module-bound', () => {
    const rest = env.regeln.resources.slice(3).map((r) => r.id);
    const shown = model.module.map((r) => r.key);
    for (const id of shown) assert.ok(rest.includes(id), id);
    for (const id of rest) {
      const live = (own.resources[id] ?? 0) > 0 || (pv0.forecast.net[id] ?? 0) !== 0;
      if (live) assert.ok(shown.includes(id), `${id} should be listed`);
    }
  });

  test('home is the settlement tile of the player', () => {
    assert.deepEqual(model.home, { id: camp.id, ...tile(camp.tile), kind: camp.kind });
    assert.deepEqual(model.start, tile(camp.tile));
  });

  test('the camp is a unit of art lager and volk spieler, not a place', () => {
    assert.equal(camp.kind, 'lager');
    const u = model.units.find((x) => x.id === camp.id);
    assert.ok(u);
    assert.equal(u.art, 'lager');
    assert.equal(u.volk, 'spieler');
    assert.deepEqual({ q: u.q, r: u.r }, tile(camp.tile));
    assert.equal(model.places.some((x) => x.id === camp.id), false);
  });

  test('rat has one row per council member with role and loyalty labels', () => {
    assert.equal(model.rat.length, own.council.length);
    own.council.forEach((m, i) => {
      const row = model.rat[i];
      assert.equal(row.id, m.id);
      assert.equal(row.rolle, t(`role.${m.role}`));
      assert.equal(row.band, t(`loyalty.${loyaltyBand(m.loyalty)}`));
      assert.equal(row.loyalitaet, m.loyalty);
      assert.equal(row.ziel, m.goal.text);
    });
  });

  test('bestimmung carries the package destiny name and milestone texts', () => {
    const def = env.content.bestimmungen.find((d) => `${d.id}@${d.rev}` === own.bestimmung.ref);
    assert.ok(def);
    assert.equal(model.bestimmung.ref, own.bestimmung.ref);
    assert.equal(model.bestimmung.name, def.name);
    assert.deepEqual(model.bestimmung.meilensteine.map((m) => m.text), def.milestones.map((m) => m.text));
    assert.deepEqual(model.bestimmung.meilensteine.map((m) => m.id), own.bestimmung.milestones.map((m) => m.id));
    // The adopted destiny is not offered as an alternative.
    assert.equal(model.bestimmung.wechsel.some((w) => w.ref === own.bestimmung.ref), false);
    assert.equal(model.bestimmung.wechsel.length, env.content.bestimmungen.length - 1);
  });

  test('vorschlaege are the candidates with the kernel research cost', () => {
    const v = model.entwicklungen.vorschlaege;
    assert.deepEqual(v.map((x) => x.ref), own.developments.candidates.map((c) => c.ref));
    assert.ok(v.length > 0);
    for (const x of v) assert.equal(x.dauer, researchCost(view, env, pid, x.ref));
  });

  test('owners covers known tiles only and maps to spieler or a rival id', () => {
    const rivalIds = Object.keys(view.peoples).filter((id) => id !== pid);
    const known = view.map.known[pid];
    const control = mapLayers(view, env, pid).control;
    assert.ok(model.owners.size > 0);
    for (const [k, owner] of model.owners) {
      assert.ok(Object.hasOwn(known, k), `${k} is not known`);
      assert.ok(owner === 'spieler' || rivalIds.includes(owner), owner);
    }
    for (const k of Object.keys(known)) {
      const { q, r } = tile(k);
      const c = control[regionOf(world, q, r)];
      assert.equal(model.owners.get(k), c ? (c === pid ? 'spieler' : c) : undefined, k);
    }
  });

  test('meldungen contains the new-candidates message naming the offered developments', () => {
    const m = model.meldungen.find((x) => x.id === 'kandidaten');
    assert.ok(m);
    assert.equal(m.dialog, 'entwicklungen');
    const fresh = own.developments.candidates.filter((c) => c.offeredAt === view.turn);
    assert.equal(m.text, fresh.map((c) => env.entwicklung(c.ref).name).join(', '));
  });

  test('rivals are listed without a known position before contact', () => {
    assert.deepEqual(model.rivalen.map((r) => r.id).sort(), Object.keys(view.peoples).filter((id) => id !== pid).sort());
    for (const r of model.rivalen) assert.equal(r.lager, null);
  });
});

describe('previewDeltas', () => {
  test('identical previews give no change', () => {
    assert.deepEqual(previewDeltas(view, pv0, pv0), {});
    assert.deepEqual(previewDeltas(view, pv0, previewDraft(view, env, draft0)), {});
  });

  test('a changed assign differs by stock minus costs plus forecast net, per store', () => {
    const from = Object.keys(own.population.assigned)[0];
    const to = env.regeln.resources[2].id;
    assert.notEqual(from, to);
    const moved = { ...own.population.assigned, [from]: own.population.assigned[from] - 1, [to]: (own.population.assigned[to] ?? 0) + 1 };
    const next = previewDraft(view, env, withAssign(draft0, moved));
    assert.deepEqual(next.issues.filter((i) => i.severity === 'error'), []);

    const end = (pv, id) => own.resources[id] - (pv.costs[id] ?? 0) + (pv.forecast.net[id] ?? 0);
    const expected = {};
    for (const id of Object.keys(own.resources)) {
      const d = end(next, id) - end(pv0, id);
      if (d) expected[id] = d;
    }
    const growth = next.forecast.growth.clans - pv0.forecast.growth.clans;
    if (growth) expected.volk = growth;

    assert.ok(Object.keys(expected).length > 0, 'the changed assign must move at least one store');
    assert.deepEqual(previewDeltas(view, pv0, next), expected);
  });
});

describe('orderRows', () => {
  const withExplore = withOrder(draft0, EXPLORE);
  const pvExplore = previewDraft(view, env, withExplore);
  const probe = pvExplore.probes.find((p) => p.order === 'o1');

  test('the explore order has a probe the player has to roll', () => {
    assert.ok(probe);
    assert.equal(probe.roller, 'player');
    assert.ok(probe.target != null);
  });

  test('a probe without roll is offen and has no wurf', () => {
    const [row] = orderRows(view, env, t, withExplore, pvExplore, world);
    assert.equal(row.id, 'o1');
    assert.equal(row.type, 'explore');
    assert.equal(row.titel, t('order.explore'));
    assert.equal(row.probe, probe.id);
    assert.equal(row.offen, true);
    assert.equal(row.wurf, null);
  });

  test('a roll with the probe fingerprint is graded by bandOf and not stale', () => {
    for (let value = 1; value <= 10; value++) {
      const d = withRoll(withExplore, probe.id, value, probe.fingerprint);
      const pv = previewDraft(view, env, d);
      assert.equal(pv.issues.some((i) => i.code === 'roll_stale'), false);
      const [row] = orderRows(view, env, t, d, pv, world);
      const band = bandOf(value, probe.modTotal, probe.target);
      assert.equal(row.offen, false);
      assert.equal(row.wurf.band, band);
      assert.equal(row.wurf.wert, value);
      assert.equal(row.wurf.stale, false);
      assert.equal(row.issues.some((i) => i.code === 'roll_stale'), false);
      assert.ok(row.wurf.kurz.includes(t(bandKey(band))));
    }
  });

  test('a roll with another fingerprint is stale and carries a roll_stale issue', () => {
    const wrong = '0000000000000000';
    assert.notEqual(probe.fingerprint, wrong);
    const d = withRoll(withExplore, probe.id, 7, wrong);
    const pv = previewDraft(view, env, d);
    const [row] = orderRows(view, env, t, d, pv, world);
    assert.equal(row.wurf.stale, true);
    const issue = row.issues.find((i) => i.code === 'roll_stale');
    assert.ok(issue);
    assert.equal(issue.path, `/rolls/${probe.id}`);
    assert.ok(issue.text.length > 0);
  });

  test('the explore row names the camp as its target and uses the kernel slot', () => {
    const [row] = orderRows(view, env, t, withExplore, pvExplore, world);
    assert.equal(row.ziel, camp.name);
    assert.equal(row.art, { main: 'haupt', minor: 'neben', free: 'frei' }[pvExplore.orders[0].slot]);
  });
});

describe('optionsFor on the camp tile', () => {
  const target = { q: tile(camp.tile).q, r: tile(camp.tile).r };
  const ctx = { view, env, t, draft: draft0, base: pv0, world };
  const options = optionsFor(ctx, target);
  const byType = (type) => options.find((o) => o.type === type);

  test('explore is offered with the probe of the kernel preview', () => {
    const o = byType('explore');
    assert.ok(o);
    const pv = previewDraft(view, env, withOrder(draft0, EXPLORE));
    const kp = pv.probes.find((p) => p.order === 'o1');
    assert.equal(o.probe.ziel, kp.target);
    assert.equal(o.probe.chance, kp.chance);
    assert.equal(o.probe.fingerprint, kp.fingerprint);
    assert.equal(o.grund, null);
  });

  test('found carries the German label of the kernel refusal as grund, never the English message', () => {
    const o = byType('found');
    assert.ok(o);
    const pv = previewDraft(view, env, withOrder(draft0, { type: 'found', params: { tile: camp.tile } }));
    const refusal = pv.issues.find((i) => i.severity === 'error' && i.path.startsWith('/orders/0'));
    assert.ok(refusal, 'the kernel refuses founding next to the camp');
    // The reason key of the kernel picks the precise label, issue.<code>.<params.reason>.
    assert.ok(refusal.params?.reason, 'the kernel names the reason');
    assert.equal(o.grund, t(`${issueKey(refusal.code)}.${refusal.params.reason}`));
    assert.ok(!o.grund.includes(refusal.message), o.grund);
  });

  test('types the catalogue marks unavailable never appear', () => {
    const available = new Set(pv0.catalogue.filter((c) => c.available).map((c) => c.type));
    const unavailable = pv0.catalogue.filter((c) => !c.available).map((c) => c.type);
    const proposed = candidates(view, env, target).map((c) => c.type);
    assert.ok(proposed.some((type) => !available.has(type)), 'candidates must include a type the catalogue refuses');
    for (const o of options) assert.ok(available.has(o.type), o.type);
    for (const type of unavailable) assert.equal(options.some((o) => o.type === type), false, type);
  });

  test('preview.deltas equals previewDeltas between the base and the option preview', () => {
    assert.ok(options.length > 0);
    for (const o of options) assert.deepEqual(o.preview.deltas, previewDeltas(view, pv0, o.pv), o.type);
  });
});

describe('draft helpers', () => {
  const order = (id, type = 'explore', params = { tile: camp.tile }) => ({ id, type, params });

  test('nextOrderId takes the first unused o<n>', () => {
    assert.equal(nextOrderId({ orders: [] }), 'o1');
    assert.equal(nextOrderId({ orders: [order('o1'), order('o2')] }), 'o3');
    assert.equal(nextOrderId({ orders: [order('o1'), order('o3')] }), 'o2');
    assert.equal(nextOrderId({ orders: [order('o2')] }), 'o1');
  });

  test('withoutOrder moves the roll to withdrawn and drops venture, lead and mandate', () => {
    let d = withOrder(draft0, EXPLORE, { venture: true, lead: own.council[0].id });
    d = withMandate(d, 'o1', true);
    d = withRoll(d, 'p1', 4, 'aaaaaaaaaaaaaaaa');
    assert.deepEqual(d.venture, { o1: true });
    assert.equal(d.mandate.o1, 'decree');

    const next = withoutOrder(d, 'o1', 'p1');
    assert.deepEqual(next.orders, []);
    assert.equal(Object.hasOwn(next.venture, 'o1'), false);
    assert.equal(Object.hasOwn(next.lead, 'o1'), false);
    assert.equal(Object.hasOwn(next.mandate, 'o1'), false);
    assert.deepEqual(next.rolls, {});
    assert.deepEqual(next.withdrawn, [{ probe: 'p1', value: 4, fingerprint: 'aaaaaaaaaaaaaaaa' }]);
    // The input draft stays untouched.
    assert.equal(d.orders.length, 1);
    assert.ok(d.rolls.p1);
  });

  test('withoutOrder also removes a machtprobe that overrides the order, others stay', () => {
    let d = withOrder(draft0, EXPLORE);
    d = withOrder(d, { type: 'machtprobe', params: { order: 'o1' } });
    d = withOrder(d, { type: 'explore', params: { tile: camp.tile } });
    assert.deepEqual(d.orders.map((o) => o.id), ['o1', 'o2', 'o3']);
    const next = withoutOrder(d, 'o1');
    assert.deepEqual(next.orders.map((o) => o.id), ['o3']);
    assert.deepEqual(next.withdrawn, []);
  });

  test('withRoll keeps a replaced roll with another fingerprint in withdrawn, the same fingerprint not', () => {
    const first = withRoll(draft0, 'p1', 3, 'aaaaaaaaaaaaaaaa');
    assert.deepEqual(first.withdrawn, []);
    const same = withRoll(first, 'p1', 9, 'aaaaaaaaaaaaaaaa');
    assert.deepEqual(same.rolls.p1, { value: 9, fingerprint: 'aaaaaaaaaaaaaaaa' });
    assert.deepEqual(same.withdrawn, []);
    const changed = withRoll(first, 'p1', 9, 'bbbbbbbbbbbbbbbb');
    assert.deepEqual(changed.rolls.p1, { value: 9, fingerprint: 'bbbbbbbbbbbbbbbb' });
    assert.deepEqual(changed.withdrawn, [{ probe: 'p1', value: 3, fingerprint: 'aaaaaaaaaaaaaaaa' }]);
  });

  test('withRoll keeps at most sixteen withdrawn rolls, newest last', () => {
    let d = withRoll(draft0, 'p1', 1, '0000000000000000');
    for (let n = 1; n <= 20; n++) d = withRoll(d, 'p1', 1, n.toString(16).padStart(16, '0'));
    assert.equal(d.withdrawn.length, 16);
    assert.equal(d.withdrawn.at(-1).fingerprint, (19).toString(16).padStart(16, '0'));
  });

  test('draftFor discards a draft of another turn or people and keeps one of the same turn', () => {
    const stored = withOrder(draft0, EXPLORE);
    stored.sealed = true;
    const kept = draftFor(view, stored);
    assert.deepEqual(kept.orders, stored.orders);
    assert.equal(kept.sealed, false);

    const otherTurn = { ...stored, turn: view.turn + 1 };
    assert.deepEqual(draftFor(view, otherTurn), emptyDraft(view, pid));
    const otherPeople = { ...stored, people: 'talbund' };
    assert.deepEqual(draftFor(view, otherPeople), emptyDraft(view, pid));
    assert.deepEqual(draftFor(view, null), emptyDraft(view, pid));
  });

  test('openRolls lists probes without roll and stale ones, not valid ones', () => {
    const d1 = withOrder(draft0, EXPLORE);
    const pv1 = previewDraft(view, env, d1);
    const probe = pv1.probes.find((p) => p.order === 'o1');
    const ids = (d, pv) => openRolls(d, pv).map((p) => p.id);
    assert.ok(ids(d1, pv1).includes(probe.id));

    const fresh = withRoll(d1, probe.id, 6, probe.fingerprint);
    assert.equal(ids(fresh, previewDraft(view, env, fresh)).includes(probe.id), false);

    const stale = withRoll(d1, probe.id, 6, '0000000000000000');
    assert.ok(ids(stale, previewDraft(view, env, stale)).includes(probe.id));
  });
});

describe('Talbund mid-game fixture on a package with another hash', () => {
  const tv = json('tests/fixtures/engine/view-talbund.json');
  const tp = tv.peoples[tv.people];
  const tworld = env.world(tv.map.seed);
  const tpv = previewDraft(tv, env, draftFor(tv, null));
  const model = adaptView({ view: tv, env, t, world: tworld, preview: tpv, chronik: [] });

  test('the package hash differs on purpose', () => {
    assert.notEqual(tv.campaign.world.hash, env.hash);
    assert.equal(sameWorld(tv, env), false);
  });

  test('the dorf is a place of art siedlung and volk spieler', () => {
    const s = tv.map.settlements.find((x) => x.people === tv.people);
    assert.equal(s.kind, 'dorf');
    const p = model.places.find((x) => x.id === s.id);
    assert.ok(p);
    assert.equal(p.art, 'siedlung');
    assert.equal(p.volk, 'spieler');
    assert.deepEqual({ q: p.q, r: p.r }, tile(s.tile));
    assert.equal(p.beschreibung, [t(`settlement.${s.kind}`), ...s.buildings.map((b) => env.entwicklung(b.ref).name)].join(', '));
    assert.equal(model.units.some((u) => u.id === s.id), false);
  });

  test('the own unit appears in units', () => {
    assert.ok(tp.units.length > 0);
    for (const u of tp.units) {
      const row = model.units.find((x) => x.id === u.id);
      assert.ok(row, u.id);
      assert.equal(row.volk, 'spieler');
      assert.equal(row.name, env.entwicklung(u.type).name);
      assert.equal(row.staerke, u.strength);
      assert.deepEqual({ q: row.q, r: row.r }, tile(u.tile));
    }
  });

  test('the pending choice yields a message for the council dialog', () => {
    assert.ok(tv.pendingChoices.length > 0);
    for (const c of tv.pendingChoices) {
      const m = model.meldungen.find((x) => x.id === `entscheidung-${c.id}`);
      assert.ok(m, c.id);
      assert.equal(m.dialog, 'rat');
      assert.equal(m.titel, env.ereignis(c.event).name);
    }
  });

  test('practice nodes are the summed ledger tags, heaviest first', () => {
    const sum = new Map();
    for (const row of tp.practice.ledger) for (const [tag, n] of Object.entries(row.tags)) sum.set(tag, (sum.get(tag) ?? 0) + n);
    const praxis = model.entwicklungen.praxis;
    assert.deepEqual(new Set(praxis.map((p) => p.id)), new Set([...sum.keys()].map((g) => `praxis:${g}`)));
    for (const p of praxis) {
      const tag = p.id.slice('praxis:'.length);
      assert.equal(p.gewicht, sum.get(tag));
      assert.equal(p.name, t(`tag.${tag}`, tag));
    }
    const weights = praxis.map((p) => p.gewicht);
    assert.deepEqual(weights, [...weights].sort((a, b) => b - a));
  });

  test('the research node shows the progress of the fixture and the kernel cost', () => {
    assert.ok(tp.developments.research.length > 0);
    tp.developments.research.forEach((r, i) => {
      const node = model.entwicklungen.forschung[i];
      assert.equal(node.ref, r.ref);
      assert.equal(node.fortschritt, r.progress);
      assert.equal(node.dauer, researchCost(tv, env, tv.people, r.ref));
    });
  });

  test('known developments mirror the view with state and institution flag', () => {
    const bekannt = model.entwicklungen.bekannt;
    assert.deepEqual(bekannt.map((b) => b.ref), tp.developments.known.map((k) => k.ref));
    for (const b of bekannt) assert.equal(b.eingesetzt, tp.developments.instituted.includes(b.ref));
  });
});

describe('game.js helpers', () => {
  const index = json('tests/fixtures/engine/campaigns-index.json');
  const rows = [
    { id: 'a-old', world: 'hochland', player: 'x', turn: 3, status: 'playing', updatedAt: '2026-09-01T10:00:00Z' },
    { id: 'b-new', world: 'hochland', player: 'x', turn: 4, status: 'playing', updatedAt: '2026-10-01T10:00:00Z' },
    { id: 'c-ended', world: 'hochland', player: 'x', turn: 31, status: 'ended', updatedAt: '2026-10-02T10:00:00Z' },
  ];

  test('pickCampaign prefers the requested campaign, even an ended one', () => {
    assert.equal(pickCampaign({ campaigns: rows }, 'a-old').id, 'a-old');
    assert.equal(pickCampaign({ campaigns: rows }, 'c-ended').id, 'c-ended');
    assert.equal(pickCampaign({ campaigns: rows }, 'missing'), null);
  });

  test('pickCampaign takes the most recently updated playing campaign otherwise', () => {
    assert.equal(pickCampaign({ campaigns: rows }).id, 'b-new');
    assert.equal(pickCampaign({ campaigns: [...rows].reverse() }).id, 'b-new');
  });

  test('pickCampaign falls back to the newest of all when none is playing, and to null without rows', () => {
    const ended = rows.map((r) => ({ ...r, status: 'ended' }));
    assert.equal(pickCampaign({ campaigns: ended }).id, 'c-ended');
    assert.equal(pickCampaign({ campaigns: [] }), null);
    assert.equal(pickCampaign(null), null);
  });

  test('pickCampaign on the shipped index fixture picks the playing campaign', () => {
    const playing = index.campaigns.filter((c) => c.status === 'playing');
    assert.equal(pickCampaign(index).id, playing[0].id);
  });

  test('originOf maps agents and sources to the board origin tokens', () => {
    const expected = {
      kernel: 'kern',
      'agent:world': 'welt',
      rival: 'rivalen',
      'agent:research': 'forschung',
      council: 'rat',
      chronicler: 'chronist',
      'judge-balance': 'kern',
    };
    for (const [from, to] of Object.entries(expected)) assert.equal(originOf(from), to, from);
    assert.equal(originOf('agent:judge-coherence'), 'kern');
    assert.equal(originOf('agent:rival'), 'rivalen');
    assert.equal(originOf(undefined), 'kern');
  });
});

describe('destinies and rivals on the projection', () => {
  const midgame = json('tests/fixtures/engine/view-talbund.json');

  test('a rival destiny stays an unknown marker while the view reveals none', () => {
    for (const v of [view, midgame]) {
      for (const r of rivals(v, env)) assert.deepEqual(r.bestimmung, { name: null, bekannt: false, meilensteine: [] }, r.id);
    }
  });

  test('a revealed rival destiny shows its name and only the milestones the view lists', () => {
    const rivalId = Object.keys(view.peoples).find((id) => id !== pid);
    const def = env.content.bestimmungen.find((d) => d.id === 'hegemonie');
    const shown = structuredClone(view);
    shown.peoples[rivalId].bestimmung = { ref: `${def.id}@${def.rev}`, milestones: [{ id: def.milestones[0].id, reached: true }] };
    const row = rivals(shown, env).find((r) => r.id === rivalId).bestimmung;
    assert.equal(row.name, def.name);
    assert.equal(row.bekannt, true);
    assert.equal(row.meilensteine.length, def.milestones.length);
    assert.equal(row.meilensteine[0].text, def.milestones[0].text);
    assert.equal(row.meilensteine[0].erreicht, true);
    for (const m of row.meilensteine.slice(1)) assert.deepEqual(m, { text: null, erreicht: null });
  });

  test('the destinies on offer never include the own one or one a rival is known to hold', () => {
    const rivalId = Object.keys(view.peoples).find((id) => id !== pid);
    const held = env.content.bestimmungen.find((d) => `${d.id}@${d.rev}` !== own.bestimmung.ref);
    const heldRef = `${held.id}@${held.rev}`;
    const shown = structuredClone(view);
    shown.peoples[rivalId].bestimmung = { ref: heldRef, milestones: [] };
    const offered = destiny(shown, env).wechsel.map((w) => w.ref);
    assert.equal(offered.includes(heldRef), false);
    assert.equal(offered.includes(own.bestimmung.ref), false);
    assert.equal(offered.length, env.content.bestimmungen.length - 2);
  });

  test('milestone progress agrees with the kernel verdict of every counted predicate', () => {
    for (const v of [view, midgame]) {
      const me = v.peoples[v.people];
      const def = env.bestimmung(me.bestimmung.ref);
      const rows = destiny(v, env).meilensteine;
      assert.equal(rows.length, me.bestimmung.milestones.length);
      rows.forEach((row, i) => {
        const state = me.bestimmung.milestones[i];
        const md = def.milestones.find((x) => x.id === state.id);
        assert.equal(row.erreicht, state.reached);
        if (!row.fortschritt) return;
        if (md.predicate.pred === 'holds') {
          assert.equal(row.fortschritt.ziel, md.predicate.seasons);
          assert.equal(row.fortschritt.wert, state.reached ? md.predicate.seasons : state.progress);
        } else if (!state.reached) {
          const cx = { state: v, env, pid: v.people, world: env.world(v.map.seed) };
          assert.equal(row.fortschritt.wert >= row.fortschritt.ziel, evalPredicate(md.predicate, cx), md.id);
        }
      });
    }
  });

  test('every milestone and every offered destiny carries a symbol name', () => {
    const d = destiny(midgame, env);
    for (const m of d.meilensteine) assert.equal(typeof m.icon, 'string');
    for (const w of d.wechsel) for (const m of w.meilensteine) assert.equal(typeof m.icon, 'string');
  });
});

// Builds the mid-game state fixtures from a real kernel run on the Hochland
// package (seed 7, player talbund), so map, regions, settlements and
// chronicle are consistent with the generated world. The kernel run supplies
// the structure; the mid-game content (Handel, unit, destiny progress,
// pending choice, draws) is set on top of it, because the economy of lane K1
// does not yet move values on its own.
//
//   node tests/fixtures/engine/build-state-fixtures.mjs
//
// Writes campaign-midgame.json, campaign-near-victory.json,
// campaign-near-collapse.json, draft-midgame.json, view-talbund.json and
// report-T0011.json next to this file. Rerun only deliberately: a changed
// kernel or world package changes the output, and the acceptance lane reads
// these files through `new --from-state`.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeEnv } from '../../../engine/core/env.js';
import * as T from '../../../engine/core/turn.js';
import { regionOf, spiral, neighbors, key, tileAt } from '../../../engine/world/index.js';

const OUT = fileURLToPath(new URL('./', import.meta.url));
const W = fileURLToPath(new URL('../../../welten/hochland/', import.meta.url));
const json = (f) => JSON.parse(readFileSync(W + f, 'utf8'));
const write = (name, data) => writeFileSync(OUT + name, `${JSON.stringify(data, null, 2)}\n`);
const clone = (x) => structuredClone(x);

// Seed 7: with 48213 the kernel puts two start settlements into one region
// (reported to lane K1), which would break the control invariant here.
const SEED = 7;
const PLAYER = 'talbund';
const env = makeEnv({
  welt: json('welt.json'),
  regeln: json('regeln.json'),
  content: { entwicklungen: json('content/entwicklungen.json'), ereignisse: json('content/ereignisse.json'), bestimmungen: json('content/bestimmungen.json') },
});
const world = env.world(SEED);

// Twelve resolved turns with the player's rolls entered like the UI would.
let { state } = T.createCampaign(env, { id: 'hochland-mitte', seed: SEED, player: PLAYER });
const ROLLS = [6, 3, 8, 5, 7, 2, 9, 4, 6, 5, 7, 3];
let last = null;
for (let i = 0; i < 12; i++) {
  ({ state } = T.open(state, env));
  const draft = { format: 'realmcraft-draft', version: 1, people: PLAYER, turn: state.turn, baseRev: state.rev, orders: [], mandate: {}, rolls: {}, withdrawn: [], sealed: false };
  for (const p of T.preview(state, env, draft, { as: PLAYER }).probes) {
    if (p.roller === 'player') draft.rolls[p.id] = { value: ROLLS[i], fingerprint: p.fingerprint };
  }
  ({ state } = T.seal(state, env));
  const r = T.apply(state, env, { [PLAYER]: { ...draft, sealed: true } });
  if (!r.ok) throw new Error(`turn ${state.turn}: ${JSON.stringify(r.issues)}`);
  last = { revBefore: state.rev, revAfter: r.state.rev, report: r.report, events: r.events };
  state = r.state;
}
({ state } = T.open(state, env));
if (state.turn !== 12 || state.phase !== 'planning') throw new Error(`unexpected kernel state T${state.turn} ${state.phase}`);

const tal = state.peoples.talbund;
const home = state.map.settlements.find((s) => s.people === PLAYER);
const [hq, hr] = home.tile.split(',').map(Number);

// Five controlled regions around the home settlement (milestone "land").
// The nearest regions in spiral order; each gets one seen tile, so no region
// is controlled without being known.
const regions = [home.regionId];
for (const t of spiral({ q: hq, r: hr }, 24)) {
  if (regions.length === 5) break;
  const id = regionOf(world, t.q, t.r);
  if (regions.includes(id) || state.map.control[id] !== undefined) continue;
  regions.push(id);
  const k = key(t.q, t.r);
  state.map.known.talbund[k] = state.map.known.talbund[k] ?? 'seen';
}
if (regions.length < 5) throw new Error('fewer than five free regions near the home settlement');
for (const id of regions) state.map.control[id] = PLAYER;
const unitTile = neighbors(hq, hr).map((n) => key(n.q, n.r)).find((k) => tileAt(world, ...k.split(',').map(Number)).terrain !== 'wasser') ?? home.tile;
state.map.known.talbund[unitTile] = 'visible';

const dev = (ref, since) => ({ ref, since, effectiveFrom: since + 1, state: 'active', suspendedSince: null });
tal.population = { core: 5, growth: 2, assigned: { nahrung: 2, material: 1, salz: 1, research: 1 } };
tal.resources = { nahrung: 7, material: 5, wissen: 2, herden: 2, erz: 1, salz: 6 };
tal.standing = 1;
tal.developments.known.push(dev('speertraeger@1', 3), dev('markt-am-pass@1', 7), dev('bergschuetzen@1', 9));
tal.developments.research = [{ ref: 'geleitrecht@1', progress: 3 }];
tal.developments.candidates = [{ ref: 'strassenbau@1', offeredAt: 11, expiresAt: 15, origin: 'pool' }];
tal.developments.requests = [{ turn: 10, tags: ['handel', 'salz'], note: 'Wege für den Salzhandel über die Pässe' }];
home.buildings.push({ ref: 'markt-am-pass@1', since: 8, state: 'active' });
tal.units = [{ id: 'u-talbund-1', type: 'speertraeger@1', strength: 2, tile: unitTile, state: 'ready', since: 6 }];
tal.practice.ledger = [
  { turn: 9, tags: { handel: 2, salz: 1 } },
  { turn: 10, tags: { handel: 3, befohlen: 2 } },
  { turn: 11, tags: { handel: 2, weg: 1 } },
];
tal.tokens = [{ id: 'tok-t10-1', kind: 'impulse', tags: ['handel'], turn: 10, source: 'T10:talbund:o2' }];
tal.meters = { zustimmung: 1 };
tal.bestimmung = {
  ref: 'hegemonie@1',
  adoptedAt: 4,
  milestones: [
    { id: 'heer', reached: true, reachedAt: 9, progress: 0 },
    { id: 'land', reached: true, reachedAt: 11, progress: 0 },
    { id: 'joch', reached: false, reachedAt: null, progress: 0 },
  ],
  history: [{ ref: 'salzstrasse@1', adoptedAt: 0, endedAt: 4, outcome: 'switched' }],
};
tal.modules.handel = { partners: ['bergnomaden'] };
state.modules.handel = { offers: [], contracts: [], prices: { salz: 3, nahrung: 1, material: 2 } };
for (const p of Object.values(state.peoples)) p.meters.zustimmung ??= 0;

state.relations['bergnomaden|talbund'] = { value: 1, atWar: false, since: 7, contact: true };
state.relations['schaedelklan|talbund'] = { value: -1, atWar: false, since: 10, contact: true };
state.relations['bergnomaden|schaedelklan'] = { ...state.relations['bergnomaden|schaedelklan'], contact: false };

state.eventDraws = {
  bergnomaden: { turn: 11, roll: 7, band: 4, roller: 'kernel', card: 'wanderhaendler@1' },
  schaedelklan: { turn: 11, roll: 2, band: 1, roller: 'kernel', card: null },
  talbund: { turn: 11, roll: 8, band: 4, roller: 'player', card: 'gesandtschaft@1' },
};
state.pendingChoices = [{ id: 'wahl-t11-1', people: PLAYER, event: 'gesandtschaft@1', offeredAt: 11, deadline: 12, options: ['annehmen', 'hinhalten'] }];
state.result = null;

// Visibility as the kernel will write it: "p:<id>" refs name the peoples an
// entry concerns; campaign-wide notices go to everyone.
const STEP = { 'probe.resolved': 'orders', 'map.vision': 'finalize', 'campaign.phase': 'phase' };
const visibility = (e) => {
  const ps = e.refs.filter((r) => r.startsWith('p:')).map((r) => r.slice(2));
  return ps.length ? ps : e.target.kind === 'campaign' ? ['all'] : [];
};
const chronicle = state.chronicle.map((e) => ({ ...e, visibleTo: visibility(e), ...(STEP[e.kind] ? { step: STEP[e.kind] } : {}) }));
const extra = [
  { id: 'T11-e90', turn: 11, source: 'kernel', kind: 'event.choice', target: { kind: 'people', id: PLAYER }, change: { field: 'pendingChoices', before: null, after: 'wahl-t11-1' }, reason: 'Gesandtschaft aus dem Talgrund wartet auf Antwort', refs: ['gesandtschaft@1'], visibleTo: [PLAYER], step: 'events' },
  { id: 'T11-e91', turn: 11, source: 'kernel', kind: 'bestimmung.milestone', target: { kind: 'people', id: PLAYER }, change: { field: 'bestimmung.milestones.land.reached', before: false, after: true }, reason: 'Fünf Regionen unter eigener Kontrolle', refs: ['hegemonie@1'], visibleTo: [PLAYER], step: 'bestimmung' },
];
state.chronicle = [...chronicle, ...extra];
state.derived = {
  talbund: { caps: { nahrung: 12, material: 10, wissen: 6, herden: 12, erz: 6, salz: 10 } },
  bergnomaden: { caps: { nahrung: 12, material: 10, wissen: 6, herden: 12, erz: 6, salz: 10 } },
  schaedelklan: { caps: { nahrung: 12, material: 10, wissen: 6, herden: 12, erz: 6, salz: 10 } },
};
state.campaign.id = 'hochland-mitte';
const midgame = state;
write('campaign-midgame.json', midgame);

// Near victory: the third milestone (subjugate the Schaedelklan) falls with
// one won attack. The clan is down to one weak settlement, at war with the
// player, whose unit stands next to it.
const nv = clone(midgame);
nv.campaign.id = 'hochland-sieg';
nv.turn = 14;
nv.rev += 6;
nv.pendingChoices = [];
nv.eventDraws = {};
const skl = nv.peoples.schaedelklan;
const target = nv.map.settlements.find((s) => s.people === 'schaedelklan');
const [sq, sr] = target.tile.split(',').map(Number);
const attackFrom = neighbors(sq, sr).map((n) => key(n.q, n.r)).find((k) => tileAt(world, ...k.split(',').map(Number)).terrain !== 'wasser');
skl.population = { core: 1, growth: 0 };
skl.units = [];
nv.peoples.talbund.units = [{ id: 'u-talbund-1', type: 'bergschuetzen@1', strength: 4, tile: attackFrom, state: 'ready', since: 13 }];
for (const t of [attackFrom, target.tile]) nv.map.known.talbund[t] = 'visible';
nv.relations['schaedelklan|talbund'] = { value: -3, atWar: true, since: 12, contact: true };
nv.chronicle = nv.chronicle.filter((e) => e.turn >= 10);
write('campaign-near-victory.json', nv);

// Near collapse: the player people is down to one clan with an empty food
// store and a running shortfall; the next famine takes the last clan.
const nc = clone(midgame);
nc.campaign.id = 'hochland-untergang';
nc.turn = 13;
nc.rev += 3;
nc.pendingChoices = [];
const ntal = nc.peoples.talbund;
ntal.population = { core: 1, growth: 0, assigned: { nahrung: 1 } };
ntal.resources = { ...ntal.resources, nahrung: 0, salz: 1 };
ntal.shortfall = { nahrung: 3 };
ntal.meters = { zustimmung: -4 };
ntal.units = [];
ntal.bestimmung.milestones[1] = { id: 'land', reached: true, reachedAt: 11, progress: 0 };
nc.relations['schaedelklan|talbund'] = { value: -3, atWar: true, since: 12, contact: true };
const raider = neighbors(hq, hr).map((n) => key(n.q, n.r)).find((k) => k !== unitTile && tileAt(world, ...k.split(',').map(Number)).terrain !== 'wasser');
nc.peoples.schaedelklan.units = [{ id: 'u-schaedelklan-1', type: 'speertraeger@1', strength: 3, tile: raider, state: 'ready', since: 12 }];
nc.map.known.talbund[raider] = 'visible';
nc.chronicle = [...nc.chronicle.filter((e) => e.turn >= 10), {
  id: 'T12-e40', turn: 12, source: 'kernel', kind: 'shortfall', target: { kind: 'people', id: PLAYER },
  change: { field: 'shortfall.nahrung', before: 0, after: 3 }, reason: 'Drei Nahrung fehlen, eine Sippe geht verloren', refs: [], visibleTo: [PLAYER], step: 'economy',
}];
write('campaign-near-collapse.json', nc);

// The player's draft for turn 12 using every optional map.
const draft = {
  format: 'realmcraft-draft',
  version: 1,
  people: PLAYER,
  turn: 12,
  baseRev: midgame.rev,
  orders: [
    { id: 'o1', type: 'explore', params: { unit: 'u-talbund-1', tile: key(hq + 3, hr - 1) } },
    { id: 'o2', type: 'trade.offer', params: { partner: 'bergnomaden', give: { salz: 2 }, get: { herden: 2 }, seasons: 2 } },
  ],
  assign: { nahrung: 2, material: 1, salz: 1, research: 1 },
  choices: { 'wahl-t11-1': 'annehmen' },
  venture: { o1: true },
  lead: { o1: 'ortwin' },
  mandate: {},
  rolls: {
    'T12:talbund:o1': { value: 7, fingerprint: 'c0de4a1b2c3d4e5f' },
    'T12:talbund:event': { value: 4, fingerprint: 'e1f09a8b7c6d5e4f' },
  },
  withdrawn: [],
  sealed: false,
};
// Fingerprints come from the kernel's preview of this draft on the mid-game
// state; a probe the preview does not produce keeps no roll.
const probes = new Map(T.preview(midgame, env, draft, { as: PLAYER }).probes.map((p) => [p.id, p.fingerprint]));
for (const id of Object.keys(draft.rolls)) {
  if (probes.has(id)) draft.rolls[id].fingerprint = probes.get(id);
  else delete draft.rolls[id];
}
write('draft-midgame.json', draft);

// Projection for the player, by the filter rules of the view schema.
const own = (pid) => (s) => s.people === pid;
const visibleTiles = new Set(Object.entries(midgame.map.known.talbund).filter(([, v]) => v === 'visible').map(([k]) => k));
const knownTiles = new Set(Object.keys(midgame.map.known.talbund));
const knownRegions = new Set([...knownTiles].map((k) => regionOf(world, ...k.split(',').map(Number))));
const foreign = (p) => ({
  id: p.id, name: p.name, controller: p.controller, identity: p.identity, lebensweise: p.lebensweise, standing: p.standing,
  units: p.units.filter((u) => visibleTiles.has(u.tile)),
});
const view = {
  format: 'realmcraft-view',
  version: 1,
  people: PLAYER,
  campaign: midgame.campaign,
  rev: midgame.rev,
  turn: midgame.turn,
  phase: midgame.phase,
  status: midgame.status,
  result: null,
  map: {
    seed: midgame.map.seed,
    packId: midgame.map.packId,
    control: Object.fromEntries(Object.entries(midgame.map.control).filter(([r]) => knownRegions.has(r))),
    settlements: midgame.map.settlements.filter((s) => own(PLAYER)(s) || visibleTiles.has(s.tile)),
    known: { talbund: midgame.map.known.talbund },
    features: Object.fromEntries(Object.entries(midgame.map.features).filter(([t]) => knownTiles.has(t))),
  },
  peoples: Object.fromEntries(Object.entries(midgame.peoples).map(([id, p]) => [id, id === PLAYER ? p : foreign(p)])),
  relations: Object.fromEntries(Object.entries(midgame.relations).filter(([k]) => k.split('|').includes(PLAYER))),
  modules: midgame.modules,
  eventDraws: { talbund: midgame.eventDraws.talbund },
  pendingChoices: midgame.pendingChoices.filter(own(PLAYER)),
  chronicle: midgame.chronicle.filter((e) => e.visibleTo.includes('all') || e.visibleTo.includes(PLAYER)),
  derived: { talbund: midgame.derived.talbund },
};
write('view-talbund.json', view);

// Round report of turn 11 as the kernel produced it in the run above: its
// revisions and state hashes, its report parts as sections, its events with
// the visibility added. It belongs to the kernel run, not to the patched state.
const { turn: _turn, hashBefore, hashAfter, year, season, winter, ...parts } = last.report;
write('report-T0011.json', {
  format: 'realmcraft-report',
  version: 1,
  campaign: midgame.campaign.id,
  turn: 11,
  revBefore: last.revBefore,
  revAfter: last.revAfter,
  hashBefore,
  hashAfter,
  sections: { calendar: { year, season, winter }, ...parts },
  events: last.events.map((e) => ({ ...e, visibleTo: visibility(e), ...(STEP[e.kind] ? { step: STEP[e.kind] } : {}) })),
});
console.log('wrote state fixtures for', PLAYER, 'regions', regions.join(' '), 'unit', unitTile);

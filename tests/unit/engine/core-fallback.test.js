import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS, distance, key, parseKey, spiral } from '../../../engine/world/index.js';
import { regionAt, tileOf } from '../../../engine/core/map.js';
import { fallbackDraft } from '../../../engine/ai/fallback.js';
import { RULES } from '../../../engine/core/rules.js';
import { assertDraft, checkDraft } from '../../../engine/core/orders.js';
import { emptyDraft, seal } from '../../../engine/core/turn.js';
import { PLAYER, hochlandEnv, nextSeason, planning, withRolls } from '../../fixtures/engine/k1/views.js';

const AI = ['esk', 'glutreiter'];

const errorsOf = (state, env, draft, pid) => checkDraft(state, env, draft, { as: pid, mode: 'apply' }).issues.filter((i) => i.severity === 'error');

describe('fallbackDraft', () => {
  it('is a sealed, well-formed draft for the open turn', () => {
    const { env, state } = planning();
    for (const pid of AI) {
      const d = fallbackDraft(state, env, pid);
      assert.deepEqual(assertDraft(d), [], pid);
      assert.equal(d.sealed, true);
      assert.equal(d.people, pid);
      assert.equal(d.turn, state.turn);
      assert.equal(d.baseRev, state.rev);
      assert.deepEqual([d.mandate, d.rolls, d.withdrawn], [{}, {}, []]);
    }
  });

  it('is deterministic and leaves the state untouched', () => {
    const { env, state } = planning();
    const before = JSON.stringify(state);
    for (const pid of AI) assert.deepEqual(fallbackDraft(state, env, pid), fallbackDraft(structuredClone(state), env, pid));
    assert.equal(JSON.stringify(state), before);
  });

  it('puts every clan to work and keeps at least one on food', () => {
    let { env, state } = planning();
    for (let i = 0; i < 6; i++) {
      for (const pid of AI) {
        const d = fallbackDraft(state, env, pid);
        const sum = Object.values(d.assign).reduce((a, b) => a + b, 0);
        assert.equal(sum, state.peoples[pid].population.core, `${pid} turn ${state.turn}`);
        assert.ok(d.assign.nahrung >= 1, `${pid} keeps food safe`);
      }
      state = nextSeason(state, env);
    }
  });

  it('assigns research to the candidate its profile weighs most when nothing is in research', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    const dev = s.peoples.esk.developments;
    dev.research = [];
    dev.candidates = [
      { ref: 'ahnensprache@1', offeredAt: 0, expiresAt: 4, origin: 'pool' },
      { ref: 'salzpfad@1', offeredAt: 0, expiresAt: 4, origin: 'pool' },
      { ref: 'speerwall@1', offeredAt: 0, expiresAt: 4, origin: 'pool' },
    ];
    const researchOrder = (st, pid) => fallbackDraft(st, env, pid).orders.find((o) => o.type === 'research.assign');
    // The handel profile weighs handel 3, so the salt road beats magic and spears.
    assert.equal(researchOrder(s, 'esk').params.development, 'salzpfad@1');
    dev.research = [{ ref: 'ahnensprache@1', progress: 1 }];
    assert.equal(researchOrder(s, 'esk'), undefined, 'a running research is not redirected');
  });

  it('treats a missing profile as all weights zero beside the nature of the people, ties in offer order', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    s.peoples.esk.agentProfile = 'unknown-profile';
    s.peoples.esk.developments.research = [];
    s.peoples.esk.developments.candidates = [
      { ref: 'salzpfad@1', offeredAt: 0, expiresAt: 4, origin: 'pool' },
      { ref: 'ahnensprache@1', offeredAt: 0, expiresAt: 4, origin: 'pool' },
    ];
    const pick = (st) => fallbackDraft(st, env, 'esk').orders.find((o) => o.type === 'research.assign')?.params.development;
    assert.equal(pick(s), 'salzpfad@1', 'equal weight, the first offer wins');
    assert.deepEqual(errorsOf(s, env, fallbackDraft(s, env, 'esk'), 'esk'), []);
    // The nature of the people leans: an Ausrichtung on a tag of the second offer puts it first.
    s.peoples.esk.identity.ausrichtung = 'geist';
    assert.equal(pick(s), 'ahnensprache@1');
  });

  it('declines a candidate whose tags the people rejects, even without another', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    s.peoples.esk.developments.research = [];
    // The handel profile of esk and its weakness krieg weigh the spear wall below zero.
    s.peoples.esk.developments.candidates = [{ ref: 'speerwall@1', offeredAt: 0, expiresAt: 4, origin: 'pool' }];
    assert.equal(fallbackDraft(s, env, 'esk').orders.some((o) => o.type === 'research.assign'), false);
  });

  it('explores unknown ground, three away from home with the direction following turn mod 6', () => {
    let { env, state } = planning();
    const home = parseKey(state.map.settlements.find((x) => x.people === 'esk').tile);
    const tiles = [];
    for (let i = 0; i < 3; i++) {
      const ex = fallbackDraft(state, env, 'esk').orders.find((o) => o.type === 'explore');
      assert.ok(ex, `turn ${state.turn}`);
      assert.equal(Object.hasOwn(state.map.known.esk, ex.params.tile), false, 'the target is unknown');
      assert.equal(distance(home, parseKey(ex.params.tile)), 3);
      const d = DIRECTIONS[state.turn % 6];
      if (i === 0) assert.equal(ex.params.tile, key(home.q + 3 * d.q, home.r + 3 * d.r), 'turn 0 takes direction 0');
      tiles.push(ex.params.tile);
      state = nextSeason(state, env);
    }
    assert.equal(new Set(tiles).size, 3, 'the direction changes with the turn');
  });

  it('explores nothing once everything within range is known', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    const home = parseKey(s.map.settlements.find((x) => x.people === 'esk').tile);
    for (const h of spiral(home, 5)) s.map.known.esk[key(h.q, h.r)] = 'seen';
    assert.equal(fallbackDraft(s, env, 'esk').orders.some((o) => o.type === 'explore'), false);
  });

  it('decides from the projection: foreign data it cannot see changes nothing', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    s.peoples[PLAYER].resources.nahrung = 0;
    s.peoples[PLAYER].developments.research = [];
    s.peoples[PLAYER].developments.candidates = [];
    s.peoples[PLAYER].units = [];
    s.peoples[PLAYER].council[0].loyalty = -5;
    s.peoples[PLAYER].population.core = 9;
    for (const pid of AI) assert.deepEqual(fallbackDraft(s, env, pid), fallbackDraft(state, env, pid), pid);
  });

  const unitAt = (id, tile) => ({ id, type: 'reiterschar@1', strength: 2, tile, state: 'ready', since: 0 });
  // Adjacent hostile units: glutreiter stands at home, a hochweide unit one tile away.
  const standoff = (state) => {
    const s = structuredClone(state);
    const home = s.map.settlements.find((x) => x.people === 'glutreiter').tile;
    const [q, r] = home.split(',').map(Number);
    s.peoples.glutreiter.units = [unitAt('u-1', home)];
    s.peoples.hochweide.units = [unitAt('u-9', `${q + 1},${r}`)];
    s.relations['glutreiter|hochweide'].value = -2;
    return { s, enemy: `${q + 1},${r}` };
  };

  it('attacks a visible adjacent unit when the profile values war and the relation is -1 or worse', () => {
    const { env, state } = planning();
    const { s, enemy } = standoff(state);
    const attack = fallbackDraft(s, env, 'glutreiter').orders.find((o) => o.type === 'attack');
    assert.deepEqual(attack?.params, { units: ['u-1'], tile: enemy });
    assert.deepEqual(errorsOf(s, env, fallbackDraft(s, env, 'glutreiter'), 'glutreiter'), []);
  });

  it('does not attack without a war profile, a relation of -1 or worse, or an adjacent unit', () => {
    const { env, state } = planning();
    const { s } = standoff(state);
    const attacks = (st) => fallbackDraft(st, env, 'glutreiter').orders.some((o) => o.type === 'attack');
    const peaceful = structuredClone(s);
    peaceful.relations['glutreiter|hochweide'].value = 0;
    assert.equal(attacks(peaceful), false, 'relation 0');
    const trader = structuredClone(s);
    trader.peoples.glutreiter.agentProfile = 'handel';
    assert.equal(attacks(trader), false, 'profile without war weight');
    const far = structuredClone(s);
    far.peoples.hochweide.units[0].tile = '40,40';
    assert.equal(attacks(far), false, 'no unit in sight');
  });

  // Known divergence: the projection hides whether a partner trades (see report).
  it('offers a trade to a partner in contact when handel is active and weighed', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    for (const pid of ['esk', 'glutreiter']) s.peoples[pid].developments.known.push({ ref: 'salzpfad@1', since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null });
    for (const k of Object.keys(s.relations)) s.relations[k].contact = true;
    s.peoples.esk.resources.salz = 4;
    const offer = fallbackDraft(s, env, 'esk').orders.find((o) => o.type === 'trade.offer');
    assert.ok(offer);
    assert.deepEqual(errorsOf(s, env, fallbackDraft(s, env, 'esk'), 'esk'), []);
  });

  it('recruits in peace only for a profile that weighs war and only above the winter reserve', () => {
    const { env, state } = planning();
    const recruits = (st, pid) => fallbackDraft(st, env, pid).orders.some((o) => o.type === 'recruit');
    const fed = structuredClone(state);
    fed.peoples.glutreiter.resources.nahrung = 12;
    assert.equal(recruits(fed, 'glutreiter'), true);
    assert.equal(recruits(state, 'glutreiter'), false, 'five food is less than a winter of three clans after the recruit');
    const s = structuredClone(fed);
    s.peoples.glutreiter.agentProfile = 'handel';
    assert.equal(recruits(s, 'glutreiter'), false);
  });

  it('recruits under threat whatever the profile, and moves defences to the front of the build list', () => {
    const { env, state } = planning();
    const { s } = standoff(state);
    s.peoples.glutreiter.agentProfile = 'handel';
    const d = fallbackDraft(s, env, 'glutreiter');
    assert.ok(d.orders.some((o) => o.type === 'recruit'), 'a hostile unit next to home');
    assert.deepEqual(errorsOf(s, env, d, 'glutreiter'), []);
  });

  // Free ground within founding reach of a people's settlements, computed
  // here from the rules: buildable, in a region without settlement and
  // without a foreign owner.
  const freeWithin = (s, env, pid, range) => {
    const world = env.world(s.map.seed);
    const homes = s.map.settlements.filter((x) => x.people === pid).map((x) => parseKey(x.tile));
    const settled = new Set(s.map.settlements.map((x) => x.regionId));
    return Object.keys(s.map.known[pid]).filter((k) => {
      const d = Math.min(...homes.map((h) => distance(h, parseKey(k))));
      const region = regionAt(world, k);
      return d >= 1 && d <= range && env.terrain(tileOf(world, k).terrain)?.buildable && !settled.has(region)
        && (!s.map.control[region] || s.map.control[region] === pid);
    });
  };
  const knowAround = (s, pid, radius) => {
    const home = parseKey(s.map.settlements.find((x) => x.people === pid).tile);
    for (const h of spiral(home, radius)) s.map.known[pid][key(h.q, h.r)] ??= 'seen';
  };

  it('founds a settlement on free ground within reach once it can spare clans', () => {
    const { env, state } = planning();
    const s = structuredClone(state);
    knowAround(s, 'glutreiter', 6);
    const free = freeWithin(s, env, 'glutreiter', 3);
    assert.ok(free.length > 0, 'the fixture has free ground near glutreiter');
    s.peoples.glutreiter.resources.nahrung = 12;
    s.peoples.glutreiter.resources.material = 6;
    const founds = (st) => fallbackDraft(st, env, 'glutreiter').orders.find((o) => o.type === 'found');
    s.peoples.glutreiter.population.core = 3;
    assert.equal(founds(s), undefined, 'three clans are too few to send one away');
    s.peoples.glutreiter.population.core = 5;
    const f = founds(s);
    assert.ok(f && free.includes(f.params.tile), JSON.stringify(f));
    assert.deepEqual(errorsOf(s, env, fallbackDraft(s, env, 'glutreiter'), 'glutreiter'), []);
  });

  it('moves a camp on into free ground when nothing lies within founding reach', () => {
    const { env, state } = planning(1);
    const s = structuredClone(state);
    knowAround(s, PLAYER, 7);
    // Settle every region within reach so that only ground further out stays free.
    const world = env.world(s.map.seed);
    const near = freeWithin(s, env, PLAYER, 3);
    for (const region of new Set(near.map((k) => regionAt(world, k)))) s.map.control[region] = 'esk';
    assert.deepEqual(freeWithin(s, env, PLAYER, 3), []);
    const further = freeWithin(s, env, PLAYER, RULES.migrateRange);
    assert.ok(further.length > 0, 'the fixture has free ground within a migration');
    s.peoples[PLAYER].population.core = 5;
    s.peoples[PLAYER].resources.nahrung = 12;
    const m = fallbackDraft(s, env, PLAYER).orders.find((o) => o.type === 'migrate');
    assert.ok(m && further.includes(m.params.tile), JSON.stringify(m));
  });

  it('migrates a camp that stands off pasture to the nearest pasture tile, and leaves a camp on pasture', () => {
    const { env, state } = planning();
    const world = env.world(state.map.seed);
    const pasture = new Set(env.entwicklung('wanderhirten@1').spec.herdRules.pastureTerrains);
    const migrates = (st) => fallbackDraft(st, env, PLAYER).orders.find((o) => o.type === 'migrate');
    assert.equal(migrates(state), undefined, 'the camp stands on pasture');
    const s = structuredClone(state);
    const camp = s.map.settlements.find((x) => x.people === PLAYER);
    const from = parseKey(camp.tile);
    const off = Object.keys(s.map.known[PLAYER]).sort()
      .find((k) => !pasture.has(tileOf(world, k).terrain) && env.terrain(tileOf(world, k).terrain)?.buildable && distance(from, parseKey(k)) <= 2);
    camp.tile = off;
    camp.regionId = regionAt(world, off);
    const m = migrates(s);
    assert.ok(m, 'a migration is ordered');
    assert.ok(pasture.has(tileOf(world, m.params.tile).terrain));
    const draft = fallbackDraft(s, env, PLAYER);
    // The player's own rolls are missing by design; every other issue must be absent.
    assert.deepEqual(errorsOf(s, env, draft, PLAYER).filter((i) => i.code !== 'roll_missing'), []);
  });
});

describe('fallbackDraft over a campaign', () => {
  for (const seed of [7, 21]) {
    it(`is valid on the full state for every AI people across 20 seasons (seed ${seed})`, () => {
      let { env, state } = planning(seed);
      for (let i = 0; i < 20; i++) {
        for (const pid of AI) {
          const d = fallbackDraft(state, env, pid);
          assert.deepEqual(errorsOf(state, env, d, pid), [], `${pid} turn ${state.turn}`);
        }
        assert.equal(state.status, 'playing', `campaign ended at turn ${state.turn}`);
        state = nextSeason(state, env);
      }
    });
  }

  it('is valid on the full state for every AI people on the real Hochland package', () => {
    const env = hochlandEnv();
    let { state } = planning(48213, env);
    for (let i = 0; i < 12; i++) {
      for (const pid of Object.keys(state.peoples).filter((id) => id !== state.campaign.player)) {
        const d = fallbackDraft(state, env, pid);
        assert.deepEqual(errorsOf(state, env, d, pid), [], `${pid} turn ${state.turn}`);
      }
      state = nextSeason(state, env);
    }
  });

  it('is what seal substitutes for a missing AI draft', () => {
    const { env, state } = planning();
    const res = seal(state, env, { [PLAYER]: withRolls(state, env, emptyDraft(state, PLAYER)) });
    assert.equal(res.ok, true, JSON.stringify(res.issues));
    assert.deepEqual(res.substitutions.map((x) => x.people).sort(), AI);
    for (const pid of AI) assert.deepEqual(res.drafts[pid], fallbackDraft(state, env, pid));
  });
});

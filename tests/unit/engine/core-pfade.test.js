// Paths model (engine/core/pfade.js) on the real Hochland package: mapping of
// every Entwicklung to a path, path tiers from the unlock row, the Magie
// latch, the derived path view on the full state and on the projection, and
// the schemas of the new fields.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeEnv } from '../../../engine/core/env.js';
import { createCampaign, open } from '../../../engine/core/turn.js';
import { projectFor } from '../../../engine/core/project.js';
import { RULES, tune } from '../../../engine/core/rules.js';
import { directTags, isOpen, latch, pathOfTags, pathTier, pathsOf, pathsView, pfadOf, pfadeOf, pointsOf } from '../../../engine/core/pfade.js';
import { validate } from '../../../engine/content/schema.js';
import { buildTasks } from '../../../engine/harness/tasks.js';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { testEnv } from '../../fixtures/engine/k1/pack.js';

const W = (f) => JSON.parse(readFileSync(new URL(`../../../welten/hochland/${f}`, import.meta.url), 'utf8'));
const REGELN = W('regeln.json');
const ITEMS = W('content/entwicklungen.json').items;
const hochland = (regeln = REGELN) => makeEnv({
  welt: W('welt.json'),
  regeln: structuredClone(regeln),
  content: { entwicklungen: ITEMS, ereignisse: W('content/ereignisse.json'), bestimmungen: W('content/bestimmungen.json') },
});
const env = hochland();
const IDS = REGELN.pfade.paths.map((p) => p.id);
const byId = (id) => ITEMS.find((e) => e.id === id);
const known = (...ids) => ids.map((id) => ({ ref: `${id}@1`, since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null }));
const peopleWith = (ids, extra = {}) => ({ developments: { known: known(...ids), research: [], candidates: [] }, practice: { ledger: [] }, ...extra });
const withoutDerived = (s) => { const { derived, ...rest } = s; return rest; };

test('Hochland ships six paths in wheel order, Magie behind a practice condition', () => {
  assert.deepEqual(IDS, ['nahrung', 'gemeinschaft', 'militaer', 'werk', 'erkenntnis', 'magie']);
  assert.deepEqual(pathsOf(env).filter((p) => p.opens).map((p) => p.id), ['magie']);
  assert.equal(REGELN.pfade.unlock[0], 0);
  assert.ok(IDS.includes(REGELN.pfade.fallback));
});

test('every Entwicklung of the package lies on exactly one of the six paths', () => {
  for (const e of ITEMS) assert.ok(IDS.includes(pfadOf(env, e)), e.id);
  // The tags of these items meet one path more often than any other.
  assert.equal(pfadOf(env, byId('nomadisch')), 'nahrung');
  assert.equal(pfadOf(env, byId('sippenrat')), 'gemeinschaft');
  assert.equal(pfadOf(env, byId('speertraeger')), 'militaer');
  assert.equal(pfadOf(env, byId('markt-am-pass')), 'werk');
  assert.equal(pfadOf(env, byId('rauchschau')), 'magie');
  assert.equal(pfadOf(env, byId('schwarzer-zirkel')), 'magie');
});

test('the tag mapping breaks ties by path order and falls back for tags no path holds', () => {
  // weg (werk) against erkundung (erkenntnis): one each, werk comes first.
  assert.equal(pathOfTags(env, ['weg', 'erkundung']), 'werk');
  assert.equal(pathOfTags(env, ['erkundung', 'weg']), 'werk');
  assert.equal(pathOfTags(env, ['bestimmung', 'wandel', 'weg']), 'erkenntnis');
  assert.equal(pathOfTags(env, ['gibtsnicht']), REGELN.pfade.fallback);
  assert.equal(pathOfTags(env, []), REGELN.pfade.fallback);
});

test('an explicit pfad wins over the tags, an unknown one is ignored, no block means no path', () => {
  const e = byId('speertraeger');
  assert.equal(pfadOf(env, { ...e, pfad: 'erkenntnis' }), 'erkenntnis');
  assert.equal(pfadOf(env, { ...e, pfad: 'gibtsnicht' }), 'militaer');
  assert.equal(pfadOf(env, null), null);
  const { pfade, ...bare } = REGELN;
  const plain = hochland(bare);
  assert.equal(pfadOf(plain, e), null);
  assert.equal(pathOfTags(plain, ['krieg']), null);
  assert.deepEqual(pathsOf(plain), []);
  assert.equal(pathTier(plain, peopleWith([]), 'militaer'), 0);
});

test('a research request on a path alone takes its first three vocabulary tags', () => {
  const militaer = REGELN.pfade.paths.find((p) => p.id === 'militaer');
  assert.deepEqual(directTags(env, 'militaer'), militaer.tags.filter((t) => Object.hasOwn(REGELN.vocabulary, t)).slice(0, 3));
  assert.deepEqual(directTags(env, 'gibtsnicht'), []);
});

test('the path tier rises with completed achievements of the tier below, per unlock', () => {
  // unlock [0, 2, 2, ...]: tier 1 is open, tier 2 needs two achievements of tier 1 or higher on the path.
  assert.deepEqual(REGELN.pfade.unlock.slice(0, 3), [0, 2, 2]);
  assert.equal(pathTier(env, peopleWith([]), 'werk'), 1);
  assert.equal(pathTier(env, peopleWith(['saumpfad']), 'werk'), 1);
  // saumpfad (tier 1) and markt-am-pass (tier 2) both count towards tier 2.
  assert.equal(pathTier(env, peopleWith(['saumpfad', 'markt-am-pass']), 'werk'), 2);
  // Tier 3 needs two of tier 2 or higher, capped by the world's maxTier.
  assert.equal(pathTier(env, peopleWith(['saumpfad', 'markt-am-pass', 'strassenbau']), 'werk'), Math.min(3, REGELN.tuning.maxTier));
  const capped = hochland({ ...REGELN, tuning: { ...REGELN.tuning, maxTier: 2 } });
  assert.equal(pathTier(capped, peopleWith(['saumpfad', 'markt-am-pass', 'strassenbau']), 'werk'), 2);
  // Tier 0 achievements open nothing above tier 1.
  assert.equal(pathTier(env, peopleWith(['nomadisch']), 'nahrung'), 1);
  // A suspended achievement does not count.
  const p = peopleWith(['saumpfad', 'markt-am-pass']);
  p.developments.known[1].state = 'suspended';
  assert.equal(pathTier(env, p, 'werk'), 1);
});

test('Magie opens through practice or a known achievement, other paths are open from the start', () => {
  const quiet = peopleWith(['nomadisch']);
  for (const id of IDS.filter((x) => x !== 'magie')) assert.equal(isOpen(env, quiet, id), true, id);
  assert.equal(isOpen(env, quiet, 'magie'), false);
  assert.equal(isOpen(env, quiet, 'gibtsnicht'), false);
  assert.equal(isOpen(env, peopleWith(['rauchschau']), 'magie'), true);
  assert.equal(isOpen(env, { ...quiet, pfade: { opened: { magie: 3 } } }, 'magie'), true);
});

test('the latch opens Magie once the ledger touches magic and never closes again', () => {
  const quiet = peopleWith(['nomadisch']);
  assert.deepEqual(latch(env, quiet, 4), { opened: {} });
  const practised = { ...quiet, practice: { ledger: [{ turn: 2, tags: { zug: 3 } }, { turn: 3, tags: { schau: 1 } }] } };
  const after = latch(env, practised, 4);
  assert.deepEqual(after, { opened: { magie: 4 } });
  // Later seasons keep the first turn, even when the ledger forgot the practice.
  assert.deepEqual(latch(env, { ...quiet, pfade: after }, 9), { opened: { magie: 4 } });
  assert.deepEqual(latch(env, peopleWith(['blutritus']), 6), { opened: { magie: 6 } });
  assert.deepEqual(pfadeOf({}), { opened: {} });
});

test('a practice condition with a higher minimum needs the whole sum over its tags', () => {
  const regeln = structuredClone(REGELN);
  regeln.pfade.paths.find((p) => p.id === 'magie').opens.min = 3;
  const strict = hochland(regeln);
  const people = (ledger) => ({ ...peopleWith([]), practice: { ledger } });
  assert.deepEqual(latch(strict, people([{ turn: 1, tags: { schau: 1, feuer: 1 } }]), 2).opened, {});
  assert.deepEqual(latch(strict, people([{ turn: 1, tags: { schau: 1 } }, { turn: 2, tags: { opfer: 2 } }]), 3).opened, { magie: 3 });
});

test('research points are base, labour and burned knowledge', () => {
  const people = { population: { assigned: { research: 2 } }, resources: { [RULES.knowledge]: 1 } };
  assert.deepEqual(pointsOf(env, people), { base: RULES.researchBase, labour: 2 * RULES.researchPerClan, knowledge: 1, total: RULES.researchBase + 2 * RULES.researchPerClan + 1 });
  const rich = { population: { assigned: {} }, resources: { [RULES.knowledge]: 99 } };
  assert.equal(pointsOf(env, rich).knowledge, tune(env, 'knowledgeSpend'));
});

function opened() {
  const { state } = createCampaign(env, { id: 'pfade-1', seed: 7 });
  return open(state, env).state;
}

test('derived[pid].pfade is the path view, written on every kernel write', () => {
  const s = opened();
  for (const pid of Object.keys(s.peoples)) {
    assert.deepEqual(s.peoples[pid].pfade, { opened: {} });
    assert.deepEqual(s.derived[pid].pfade, pathsView(s, env, pid));
  }
  const pid = s.campaign.player;
  const view = s.derived[pid].pfade;
  assert.deepEqual(view.paths.map((p) => p.id), IDS);
  assert.deepEqual(Object.keys(view.points), ['base', 'labour', 'knowledge', 'total']);
  for (const p of view.paths) {
    assert.deepEqual(Object.keys(p), ['id', 'open', 'openedAt', 'tier', 'cap', 'done', 'next', 'known', 'research', 'candidates']);
    assert.ok(p.cap <= p.tier);
    if (p.next) assert.equal(p.next.tier, p.tier + 1);
  }
  assert.equal(view.paths.find((p) => p.id === 'magie').open, false);
});

test('every known, researched and offered ref sits on exactly one path of the view', () => {
  const s = opened();
  for (const pid of Object.keys(s.peoples)) {
    const d = s.peoples[pid].developments;
    const view = pathsView(s, env, pid);
    for (const [list, key] of [[d.known, 'known'], [d.research, 'research'], [d.candidates, 'candidates']]) {
      const placed = view.paths.flatMap((p) => p[key]);
      assert.deepEqual(placed.slice().sort(), list.map((x) => x.ref).sort(), `${pid} ${key}`);
    }
    assert.equal(view.paths.reduce((n, p) => n + p.done, 0), d.known.filter((k) => k.state === 'active').length);
  }
});

test('next names the remaining achievements towards the next path tier', () => {
  const s = opened();
  const pid = s.campaign.player;
  const view = pathsView(s, env, pid);
  for (const p of view.paths) {
    const onPath = s.peoples[pid].developments.known.map((k) => env.entwicklung(k.ref)).filter((e) => pfadOf(env, e) === p.id);
    const atTier = onPath.filter((e) => e.tier >= p.tier).length;
    assert.deepEqual(p.next, { tier: p.tier + 1, needed: REGELN.pfade.unlock[p.tier] - atTier }, p.id);
  }
});

test('the projection carries the own path view only, and the view rebuilds it from the projection', () => {
  const s = opened();
  const pid = s.campaign.player;
  const p = projectFor(s, env, pid);
  assert.deepEqual(Object.keys(p.derived), [pid]);
  assert.deepEqual(p.derived[pid].pfade, s.derived[pid].pfade);
  assert.deepEqual(pathsView(p, env, pid), s.derived[pid].pfade);
  for (const other of Object.keys(p.peoples).filter((x) => x !== pid)) assert.equal(p.peoples[other].pfade, undefined);
});

test('the research task carries the path view and the path of every request', () => {
  const s = opened();
  const pid = s.campaign.player;
  s.peoples[pid].developments.requests = [{ turn: 0, tags: ['erkundung', 'weg'], note: '' }, { turn: 0, tags: ['krieg'], note: '', pfad: 'erkenntnis' }];
  const task = buildTasks(s, env, { phase: 'agents' }).find((t) => t.task.agent === 'research' && t.task.people === pid).task;
  assert.deepEqual(task.context.pfade, pathsView(projectFor(s, env, pid), env, pid));
  assert.deepEqual(task.context.requests.map((r) => r.pfad), [pathOfTags(env, ['erkundung', 'weg']), 'erkenntnis']);
  assert.deepEqual(validate(SCHEMAS.task, task), []);
});

test('a world without paths derives an empty path list beside the research points', () => {
  const plain = testEnv();
  const { state } = createCampaign(plain, { id: 'plain-1', seed: 7 });
  const pid = state.campaign.player;
  assert.deepEqual(state.derived[pid].pfade.paths, []);
  assert.deepEqual(state.derived[pid].pfade.points, pointsOf(plain, state.peoples[pid]));
});

test('schemas: the new fields are optional and validate where present', () => {
  const s = withoutDerived(opened());
  assert.deepEqual(validate(SCHEMAS.campaign, s), []);
  const old = structuredClone(s);
  for (const p of Object.values(old.peoples)) delete p.pfade;
  assert.deepEqual(validate(SCHEMAS.campaign, old), []);
  const pid = s.campaign.player;
  s.peoples[pid].pfade = { opened: { magie: 4 } };
  s.peoples[pid].developments.requests = [{ turn: 0, tags: ['krieg'], note: '', pfad: 'militaer' }];
  assert.deepEqual(validate(SCHEMAS.campaign, s), []);
  s.peoples[pid].pfade = { opened: { Magie: 4 } };
  assert.ok(validate(SCHEMAS.campaign, s).length > 0);

  assert.deepEqual(validate(SCHEMAS.regeln, REGELN), []);
  const { pfade, ...bare } = REGELN;
  assert.deepEqual(validate(SCHEMAS.regeln, bare), []);
  const ent = { ...byId('speertraeger'), pfad: 'militaer' };
  assert.deepEqual(validate(SCHEMAS.entwicklung, ent), []);
  assert.ok(validate(SCHEMAS.entwicklung, { ...ent, pfad: 'Militär' }).length > 0);
});

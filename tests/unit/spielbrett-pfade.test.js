// The paths wheel as data (spielbrett/js/data/pfade.js): paths and
// achievements from the kernel's path view, the research points of the season
// by the rule of resolveResearch, the project that takes them, and the labels
// of every refusal reason the kernel names in params.reason.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildEnv, previewDraft, pathsView, researchCost, seasonPoints, tune } from '../../spielbrett/js/data/kernel.js';
import { makeLabels } from '../../spielbrett/js/data/labels.js';
import { draftFor, withOrder, withAssign } from '../../spielbrett/js/data/draft.js';
import { currentResearch, demoWheel, wheelOf } from '../../spielbrett/js/data/pfade.js';
import { RULES } from '../../engine/core/rules.js';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const json = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));
const pack = {
  welt: json('welten/hochland/welt.json'),
  regeln: json('welten/hochland/regeln.json'),
  labels: json('welten/hochland/labels.json'),
  entwicklungen: json('welten/hochland/content/entwicklungen.json'),
  ereignisse: json('welten/hochland/content/ereignisse.json'),
  bestimmungen: json('welten/hochland/content/bestimmungen.json'),
};
const env = buildEnv(pack, []);
const t = makeLabels([pack.labels, json('welten/hochland/labels.en.json')], 'en');
const view = json('tests/fixtures/spielbrett/view-hochland-t0.json');
const pid = view.people;
const dev = view.peoples[pid].developments;
const draft0 = draftFor(view, null);
const ctx = (draft) => ({ view, env, t, draft, pv: previewDraft(view, env, draft) });

describe('wheel model', () => {
  const w = wheelOf(ctx(draft0));
  const kernel = pathsView(view, env, pid);

  test('one path per path of the world, in regeln order, with the kernel tier, cap and opening', () => {
    assert.deepEqual(w.paths.map((p) => p.id), pack.regeln.pfade.paths.map((p) => p.id));
    for (const p of w.paths) {
      const k = kernel.paths.find((x) => x.id === p.id);
      assert.equal(p.open, k.open, p.id);
      assert.equal(p.tier, k.tier, p.id);
      assert.equal(p.cap, k.cap, p.id);
      assert.deepEqual(p.next, k.next, p.id);
    }
  });

  test('every known achievement and candidate sits once on the path the kernel gives it', () => {
    const placed = w.paths.flatMap((p) => p.nodes.map((n) => `${p.id}:${n.ref}:${n.state}`)).sort();
    const expected = kernel.paths.flatMap((p) => [...p.known.map((r) => `${p.id}:${r}:known`), ...p.candidates.map((r) => `${p.id}:${r}:candidate`)]).sort();
    assert.deepEqual(placed, expected);
  });

  test('a closed path names the practice that opens it', () => {
    const magie = w.paths.find((p) => p.id === 'magie');
    assert.equal(magie.open, false);
    assert.deepEqual(magie.opens.tags, pack.regeln.pfade.paths.find((p) => p.id === 'magie').opens.practice);
    assert.equal(magie.opens.have, 0);
  });

  test('a view without the derived path view gives the same wheel', () => {
    const { pfade: _gone, ...rest } = view.derived[pid];
    const bare = { ...view, derived: { ...view.derived, [pid]: rest } };
    const w2 = wheelOf({ ...ctx(draft0), view: bare });
    assert.deepEqual(w2.paths.map((p) => [p.id, p.tier, p.nodes.length]), w.paths.map((p) => [p.id, p.tier, p.nodes.length]));
  });

  test('candidate costs are the kernel research cost', () => {
    for (const n of w.paths.flatMap((p) => p.nodes).filter((x) => x.state === 'candidate')) {
      assert.equal(n.cost, researchCost(view, env, pid, n.ref), n.ref);
    }
  });

  test('the prototype fixtures fill the six Hochland paths without a kernel', () => {
    const model = { entwicklungen: { bekannt: [{ id: 'a', name: 'A', art: 'einheit' }], forschung: [{ id: 'b', name: 'B', art: 'magie', fortschritt: 1, dauer: 3 }], vorschlaege: [] } };
    const d = demoWheel(model, t);
    assert.equal(d.paths.length, 6);
    assert.equal(d.nodeOf('a').pfad, 'militaer');
    assert.equal(d.nodeOf('b').state, 'research');
  });
});

describe('research points and the project of the season', () => {
  test('points follow the rule of resolveResearch: base, labour, burned Wissen', () => {
    const p = seasonPoints(view, env, pid, null, null);
    const wissen = view.peoples[pid].resources[RULES.knowledge] ?? 0;
    assert.equal(p.base, RULES.researchBase);
    assert.equal(p.labour, (view.peoples[pid].population.assigned.research ?? 0) * RULES.researchPerClan);
    assert.equal(p.knowledge, Math.min(wissen, tune(env, 'knowledgeSpend')));
    assert.equal(p.total, p.base + p.labour + p.knowledge + p.mods);
  });

  test('clans the draft assigns to research raise the points of the season', () => {
    const assigned = view.peoples[pid].population.assigned;
    const [from] = Object.keys(assigned).filter((k) => assigned[k] > 0);
    const draft = withAssign(draft0, { ...assigned, [from]: assigned[from] - 1, research: (assigned.research ?? 0) + 1 });
    const before = currentResearch(ctx(draft0)).points.total;
    assert.equal(currentResearch(ctx(draft)).points.total, before + RULES.researchPerClan);
  });

  test('without research and without a choice no project takes the points', () => {
    assert.equal(dev.research.length, 0);
    assert.equal(currentResearch(ctx(draft0)).ref, null);
  });

  test('a candidate chosen in the draft takes the season, and its gain is capped by its cost', () => {
    const ref = dev.candidates[0].ref;
    const draft = withOrder(draft0, { type: 'research.assign', params: { development: ref } });
    const now = currentResearch(ctx(draft));
    assert.equal(now.ref, ref);
    assert.equal(now.progress, 0);
    assert.equal(now.gain, Math.min(now.cost, now.points.total));
    const w = wheelOf(ctx(draft));
    const n = w.nodeOf(ref);
    assert.ok(n.current && n.chosen);
    assert.equal(n.gain, now.gain);
    assert.equal(n.completes, now.gain >= now.cost);
  });

  test('a candidate already in research appears once, as research with its progress', () => {
    const ref = dev.candidates[0].ref;
    const researching = structuredClone(view);
    researching.peoples[pid].developments.research = [{ ref, progress: 3 }];
    delete researching.derived[pid].pfade;
    const w = wheelOf({ ...ctx(draft0), view: researching });
    const nodes = w.paths.flatMap((p) => p.nodes).filter((n) => n.ref === ref);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].state, 'research');
    assert.equal(nodes[0].progress, 3);
    assert.ok(nodes[0].current, 'the first project in research takes the season without a choice');
  });
});

// Every reason the kernel's order checks name in params.reason has a board label
// issue.<code>.<reason> in both languages. The scan reads the reason literals of
// the order and module sources; the list below names literals that are no issue
// reasons (council vote reasons, struck probe modifiers, log reasons).
describe('refusal reason labels', () => {
  const NOT_ISSUE_REASONS = new Set(['favours', 'opposes', 'loyal', 'discontent', 'single', 'developments', 'total', 'target', 'duplicate', 'origin', 'no-destiny-state', 'offered-already', 'offers-full']);
  const LITERAL = /reason: '([a-z][a-z0-9]*(?:-[a-z0-9]+)*)'/g;
  const HELPER = /\b(?:target|fail|bad|blocked|machtError|targetIssue)\((?:ox|spec)?,?\s?'([a-z][a-z0-9]*(?:-[a-z0-9]+)*)'/g;
  const BAG = /\['(bag-[a-z-]+)',/g;
  const files = [
    ...['orders.js', 'research.js', 'bestimmung.js', 'council.js', 'military.js', 'economy.js'].map((f) => join(REPO, 'engine/core', f)),
    ...readdirSync(join(REPO, 'engine/modules')).filter((f) => f.endsWith('.js')).map((f) => join(REPO, 'engine/modules', f)),
  ];
  const reasons = new Set();
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const re of [LITERAL, HELPER, BAG]) for (const m of src.matchAll(re)) if (!NOT_ISSUE_REASONS.has(m[1])) reasons.add(m[1]);
  }
  const board = { en: json('spielbrett/labels/en.json').labels, de: json('spielbrett/labels/de.json').labels };

  test('the scan finds the reasons of research, paths and destinies', () => {
    for (const r of ['not-candidate', 'pfad-closed', 'practice-touches-destiny', 'out-of-range', 'bag-empty']) assert.ok(reasons.has(r), r);
  });

  for (const lang of ['en', 'de']) {
    test(`every kernel refusal reason has an issue label in ${lang}`, () => {
      const keys = Object.keys(board[lang]);
      const missing = [...reasons].filter((r) => !keys.some((k) => k.startsWith('issue.') && k.endsWith(`.${r}`)));
      assert.deepEqual(missing, []);
    });
  }
});

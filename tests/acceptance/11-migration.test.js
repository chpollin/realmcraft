// Group 11, migration: a campaign from before the paths model keeps loading.
// It is created and played under the world package without the pfade block
// and in the state shape without people.pfade, then the package with paths
// replaces it, `repin` re-pins the campaign, a full season runs and `status`
// answers. Known achievements, research and candidates survive and every one
// of them sits on exactly one path.
// Spec: knowledge/plan-m1.md (kernel contracts, "Migration").
//
// Assumptions beyond lib/harness.js (A1 to A9):
// M1 The package hash covers welt.json, regeln.json and the content files, so
//    regeln.json without its pfade block and content without pfad fields is
//    the package from before M1.
// M2 Before `repin`, a transition on the changed package is refused with
//    cli.world_drift; `repin` answers { changed: true, from, to }.
// M3 A candidate offered before the path gate existed stays listed and can be
//    assigned to research, even on a path that is still closed.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, T_LONG, WORLD, assertSchema, codesOf, createCampaign, dice, expectExit, makeRoot, readJson, removeRoot } from './lib/harness.js';

const REGELN = readJson(join(REPO, 'welten', WORLD, 'regeln.json'));
const CONTENT = readJson(join(REPO, 'welten', WORLD, 'content', 'entwicklungen.json')).items;
const costOf = (ref) => CONTENT.find((e) => `${e.id}@${e.rev}` === ref)?.cost.research ?? 0;
const refsOf = (list) => list.map((x) => x.ref);

describe('migration of a campaign from before paths', { timeout: T_LONG }, () => {
  let root;
  let c;
  let pid;
  let old;
  const next = dice(1111);
  before(() => {
    root = makeRoot('migr');
    const file = join(root, 'welten', WORLD, 'regeln.json');
    const regeln = JSON.parse(readFileSync(file, 'utf8'));
    delete regeln.pfade;
    writeFileSync(file, JSON.stringify(regeln, null, 2));
    // Achievements from before M1 named no path either.
    const contentFile = join(root, 'welten', WORLD, 'content', 'entwicklungen.json');
    const content = JSON.parse(readFileSync(contentFile, 'utf8'));
    for (const e of content.items) delete e.pfad;
    writeFileSync(contentFile, JSON.stringify(content, null, 2));
    c = createCampaign({
      root,
      id: 'acc-migr',
      craft: (s) => {
        for (const p of Object.values(s.peoples)) {
          delete p.pfade;
          for (const r of p.developments.requests) delete r.pfad;
        }
      },
    });
    pid = c.player;
    // One season under the old package: a project and a research request.
    c.toPlanning();
    const s = c.state();
    // The costliest candidate, so the project is still running when the package changes.
    const costly = s.peoples[pid].developments.candidates.map((x) => x.ref).sort((a, b) => costOf(b) - costOf(a) || (a < b ? -1 : 1))[0];
    c.playTurn({ next, makeDraft: (st) => c.emptyDraft(st, [
      { id: 'o1', type: 'research.assign', params: { development: costly } },
      { id: 'o2', type: 'research.direct', params: { tags: [Object.keys(REGELN.vocabulary).sort()[0]] } },
    ]) });
    old = c.state();
  });
  after(() => removeRoot(root));

  it('the campaign has the shape from before paths', () => {
    for (const p of Object.values(old.peoples)) assert.equal(p.pfade, undefined, p.id);
    assert.ok(old.peoples[pid].developments.known.length > 0);
    assert.ok(old.peoples[pid].developments.candidates.length > 0);
    assert.ok(old.peoples[pid].developments.requests.length > 0);
    assert.ok(old.peoples[pid].developments.research.length > 0, 'a project runs across the migration');
  });

  it('the package with paths is refused until repin, then re-pinned', () => {
    cpSync(join(REPO, 'welten', WORLD), join(root, 'welten', WORLD), { recursive: true });
    const refused = c.run('seal');
    assert.notEqual(refused.code, 0);
    assert.ok(codesOf(refused).includes('cli.world_drift'), codesOf(refused).join(', '));
    const res = expectExit(c.run('repin'), [0], 'repin');
    assert.equal(res.json.changed, true);
    assert.notEqual(res.json.from, res.json.to);
  });

  it('a full season runs on the migrated campaign and status answers', () => {
    const turn = c.playTurn({ next });
    assert.equal(turn.before.turn + 1, c.state().turn);
    expectExit(c.run('status'), [0], 'status');
    assertSchema('campaign', c.state(), 'state.json after the migrated season');
  });

  it('known achievements, research and candidates survive the migration', () => {
    const before = old.peoples[pid].developments;
    const now = c.state().peoples[pid].developments;
    const known = refsOf(now.known);
    for (const ref of refsOf(before.known)) assert.ok(known.includes(ref), `${ref} stays known`);
    for (const ref of refsOf(before.research)) assert.ok(refsOf(now.research).includes(ref) || known.includes(ref), `${ref} stays in research or completed`);
    const resolved = old.turn;
    for (const cand of before.candidates) {
      if (cand.expiresAt <= resolved + 1) continue;
      assert.ok(refsOf(now.candidates).includes(cand.ref) || refsOf(now.research).includes(cand.ref) || known.includes(cand.ref), `${cand.ref} stays a candidate`);
    }
    assert.deepEqual(now.requests.slice(0, before.requests.length), before.requests);
  });

  it('every listed ref sits on exactly one path and every living people carries its path record', () => {
    const s = c.state();
    for (const [id, p] of Object.entries(s.peoples)) {
      if (p.population.core > 0) assert.deepEqual(Object.keys(p.pfade ?? {}), ['opened'], `${id} carries pfade`);
    }
    const view = c.view().derived[pid].pfade;
    const d = s.peoples[pid].developments;
    for (const key of ['known', 'research', 'candidates']) {
      assert.deepEqual(view.paths.flatMap((p) => p[key]).sort(), refsOf(d[key]).sort(), key);
    }
  });

  it('a candidate from before the gate stays assignable and the journal replays', () => {
    c.toPlanning();
    const s = c.state();
    const view = c.view().derived[pid].pfade;
    const closed = view.paths.filter((p) => !p.open).flatMap((p) => p.candidates);
    const cand = closed[0] ?? refsOf(s.peoples[pid].developments.candidates)[0];
    if (cand) {
      const pv = c.submit(c.emptyDraft(s, [{ id: 'o1', type: 'research.assign', params: { development: cand } }]));
      expectExit(pv, [0, 3], `research.assign of ${cand}`);
      assert.ok(!codesOf(pv).includes('target'), codesOf(pv).join(', '));
    }
    expectExit(c.run('replay'), [0], 'replay');
  });
});

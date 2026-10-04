// Group 10, paths: research is organised in the paths of the world package.
// The projection carries the path view, a research request names an open
// path, research points accumulate over seasons until an achievement
// completes, and the completed achievement appears on its path.
// Spec: knowledge/plan-m1.md (owner decision M1-1, kernel contracts "Paths in
// the world package" to "Derived path view").
//
// Assumptions beyond lib/harness.js (A1 to A9):
// P1 The player's projection (view/<people>.json) carries derived.<people>.pfade
//    with `points` { base, labour, knowledge, total } and `paths` in the order
//    of regeln.json pfade.paths, each row with id, open, tier, cap, done, next,
//    known, research and candidates.
// P2 research.direct with { pfad } alone files a request with the path and the
//    first three tags of the path that are in the vocabulary. A closed path is
//    refused at preview with exit 2 and an issue `target`.
// P3 Research progress is people.developments.research[].progress in
//    state.json; a completed achievement moves to developments.known.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { REPO, T_LONG, WORLD, codesOf, createCampaign, dice, expectExit, readJson, removeRoot } from './lib/harness.js';

const REGELN = readJson(join(REPO, 'welten', WORLD, 'regeln.json'));
const PATHS = REGELN.pfade?.paths ?? [];
const CONTENT = readJson(join(REPO, 'welten', WORLD, 'content', 'entwicklungen.json')).items;
const costOf = (ref) => CONTENT.find((e) => `${e.id}@${e.rev}` === ref)?.cost.research ?? 0;

describe('paths', { timeout: T_LONG }, () => {
  let c;
  let pid;
  const next = dice(1010);
  const pathsOfView = () => c.view().derived[pid].pfade;
  const row = (id) => pathsOfView().paths.find((p) => p.id === id);
  before(() => {
    c = createCampaign({ label: 'pfade', id: 'acc-pfade' });
    c.toPlanning();
    pid = c.player;
  });
  after(() => removeRoot(c?.root));

  it('the projection shows every path of the package in order with tier, gate and research points', () => {
    const view = pathsOfView();
    assert.deepEqual(view.paths.map((p) => p.id), PATHS.map((p) => p.id));
    for (const p of view.paths) {
      const def = PATHS.find((d) => d.id === p.id);
      assert.equal(p.open, def.opens === null, `${p.id} opens ${def.opens ? 'through practice' : 'from the start'}`);
      assert.ok(p.tier >= 1 && p.cap >= 1 && p.cap <= p.tier, p.id);
    }
    const pts = view.points;
    assert.equal(pts.total, pts.base + pts.labour + pts.knowledge);
    const own = c.state().peoples[pid].developments;
    assert.deepEqual(view.paths.flatMap((p) => p.candidates).sort(), own.candidates.map((x) => x.ref).sort());
    assert.deepEqual(view.paths.flatMap((p) => p.known).sort(), own.known.map((x) => x.ref).sort());
    assert.deepEqual(view.paths.filter((p) => !p.open).flatMap((p) => p.candidates), [], 'nothing is offered on a closed path');
  });

  it('a request on a closed path is refused, a request on an open path is filed with its tags', () => {
    const closed = PATHS.find((p) => p.opens);
    const open = PATHS.find((p) => !p.opens);
    const s = c.state();
    const refused = c.submit(c.emptyDraft(s, [{ id: 'o1', type: 'research.direct', params: { pfad: closed.id } }]));
    expectExit(refused, [2], 'research.direct on a closed path');
    assert.ok(codesOf(refused).includes('target'), codesOf(refused).join(', '));
    c.playTurn({ next, makeDraft: (st) => c.emptyDraft(st, [{ id: 'o1', type: 'research.direct', params: { pfad: open.id } }]) });
    const request = c.state().peoples[pid].developments.requests.at(-1);
    assert.deepEqual(request, { turn: s.turn, tags: open.tags.filter((t) => Object.hasOwn(REGELN.vocabulary, t)).slice(0, 3), note: '', pfad: open.id });
  });

  it('research points accumulate over the seasons until the achievement completes on its path', () => {
    // The costliest candidate on offer, so the project spans more than one season.
    const offered = pathsOfView().paths.flatMap((p) => p.candidates.map((ref) => ({ ref, path: p.id })));
    assert.ok(offered.length > 0, 'the pool offers at least one candidate');
    const pick = offered.sort((a, b) => costOf(b.ref) - costOf(a.ref) || (a.ref < b.ref ? -1 : 1))[0];
    const doneBefore = row(pick.path).done;
    const progress = [];
    let first = true;
    for (let i = 0; i < 12; i++) {
      const known = () => c.state().peoples[pid].developments.known.some((k) => k.ref === pick.ref);
      if (known()) break;
      const order = first ? [{ id: 'o1', type: 'research.assign', params: { development: pick.ref } }] : [];
      first = false;
      const turn = c.playTurn({ next, makeDraft: (st) => c.emptyDraft(st, order) });
      assert.notEqual(turn.after.status, 'ended', 'the campaign ended before the research completed');
      const p = c.state().peoples[pid].developments.research.find((r) => r.ref === pick.ref);
      progress.push(p ? p.progress : 'done');
    }
    assert.equal(progress.at(-1), 'done', `research of ${pick.ref} did not complete: ${progress.join(', ')}`);
    const steps = progress.slice(0, -1);
    assert.ok(steps.length >= 1 && steps[0] > 0, `${pick.ref} gathered points over more than one season: ${progress.join(', ')}`);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i] >= steps[i - 1], `progress never falls: ${steps.join(', ')}`);
    const after = row(pick.path);
    assert.ok(after.known.includes(pick.ref), `${pick.ref} appears on path ${pick.path}`);
    assert.equal(after.done, doneBefore + 1);
    assert.ok(!pathsOfView().paths.some((p) => p.research.includes(pick.ref) || p.candidates.includes(pick.ref)));
  });

  it('the state keeps the path record of every living people and the journal replays', () => {
    const s = c.state();
    for (const [id, p] of Object.entries(s.peoples)) {
      if (p.population.core > 0) assert.ok(p.pfade && typeof p.pfade.opened === 'object', `${id} carries pfade`);
    }
    expectExit(c.run('replay'), [0], 'replay');
  });
});

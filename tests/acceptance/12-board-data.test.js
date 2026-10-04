// Group 12, the data the board reads from the kernel (plan-m1):
// creation options of `new`, machine-readable issues in every CLI answer, the
// council, trade, rival and outcome blocks of the projection, and judges'
// findings in status.json.
//
// Assumptions beyond lib/harness.js (A1 to A9):
// M1 `new` takes --rivals a,b, --difficulty easy|normal|hard and --lang xx.
//    A bad option is exit 2 with an issue whose params.reason names it, and no
//    campaign folder is written. The campaign keeps state.settings.
// M2 Every issue of a CLI answer with a generic code (target, cost, format,
//    duplicate, phase, stale, slots, restricted, locked_order, limit) carries
//    params.reason, a kebab-case key.
// M3 view/<people>.json carries derived[people].council, .trade, .rivals and
//    .outcome in the shape of plan-m1 (View additions for the board).
// M4 An accepted finding of a judge whose cited entries the player sees is
//    listed under its step in status.json with id, judge, severity, text and
//    refs; a finding citing an entry hidden from the player is not.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  PLAYER_TEMPLATE, SEED, T_SHORT, WORLD, assertSchema, createCampaign, expectExit, makeRoot, readJson, removeRoot, runCli,
} from './lib/harness.js';

const GENERIC = new Set(['target', 'cost', 'format', 'duplicate', 'phase', 'stale', 'slots', 'restricted', 'locked_order', 'limit']);
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function assertReasons(res) {
  for (const i of res.issues) {
    if (GENERIC.has(i.code)) assert.match(i.params?.reason ?? '', KEBAB, `${i.code} without reason: ${i.message}`);
  }
}

describe('creation options of new', { timeout: T_SHORT }, () => {
  let root;
  before(() => { root = makeRoot('opts'); });
  after(() => removeRoot(root));

  it('creates a campaign with the named rivals, difficulty and narrative language', () => {
    const res = expectExit(runCli(root, ['new', WORLD, '--seed', String(SEED), '--as', PLAYER_TEMPLATE, '--id', 'acc-opts',
      '--rivals', 'talbund', '--difficulty', 'hard', '--lang', 'en']), [0], 'new with options');
    assert.deepEqual(res.json.settings, { difficulty: 'hard', language: 'en' });
    assert.deepEqual(res.json.rivals, ['talbund']);
    const state = readJson(join(root, 'campaigns', 'acc-opts', 'state.json'));
    assert.deepEqual(Object.keys(state.peoples).sort(), [PLAYER_TEMPLATE, 'talbund'].sort());
    assert.deepEqual(state.settings, { difficulty: 'hard', language: 'en' });
    assertSchema('campaign', state);
    const view = readJson(join(root, 'campaigns', 'acc-opts', 'view', `${PLAYER_TEMPLATE}.json`));
    assert.deepEqual(view.settings, state.settings);
  });

  for (const [flagName, value, reason] of [['--difficulty', 'brutal', 'difficulty'], ['--lang', 'deutsch', 'language'], ['--rivals', 'niemand', 'unknown-template'], ['--rivals', PLAYER_TEMPLATE, 'rival-is-player']]) {
    it(`refuses ${flagName} ${value} with reason ${reason} and writes nothing`, () => {
      const id = `acc-bad-${reason}`;
      const res = expectExit(runCli(root, ['new', WORLD, '--seed', String(SEED), '--as', PLAYER_TEMPLATE, '--id', id, flagName, value]), [2], 'bad option');
      assert.ok(res.issues.some((i) => i.params?.reason === reason), JSON.stringify(res.issues));
      assertReasons(res);
      assert.equal(existsSync(join(root, 'campaigns', id)), false);
    });
  }
});

describe('a campaign written before M1', { timeout: T_SHORT }, () => {
  let c;
  before(() => {
    c = createCampaign({
      label: 'pre-m1',
      id: 'acc-pre-m1',
      craft: (state) => {
        delete state.settings;
        for (const p of Object.values(state.peoples)) for (const m of p.council) delete m.at;
      },
    });
  });
  after(() => removeRoot(c?.root));

  it('loads, plays a season, takes the defaults and replays', () => {
    const before = c.state();
    assert.equal(before.settings, undefined);
    assertSchema('campaign', before);
    const next = (() => { let n = 0; return () => (n++ % 9) + 1; })();
    const { after: state } = c.playTurn({ next });
    assert.deepEqual(state.settings, { difficulty: 'normal', language: 'de' });
    for (const p of Object.values(state.peoples)) for (const m of p.council) assert.equal(m.at, null);
    assertSchema('campaign', state);
    expectExit(c.run('status'), [0], 'status');
    expectExit(c.run('replay'), [0], 'replay');
  });
});

describe('board data in the projection and the CLI', { timeout: T_SHORT }, () => {
  let c;
  before(() => { c = createCampaign({ label: 'board', id: 'acc-board' }); });
  after(() => removeRoot(c?.root));

  it('answers a refused draft with params on every issue', () => {
    c.toPlanning();
    const draft = c.emptyDraft(c.state(), [
      { id: 'o1', type: 'found', params: { tile: 'nowhere' } },
      { id: 'o2', type: 'nonsense', params: {} },
    ]);
    const res = expectExit(c.submit({ ...draft, assign: { nahrung: 99 } }), [2], 'refused draft');
    assertReasons(res);
    const notTile = res.issues.find((i) => i.params?.reason === 'not-tile');
    assert.deepEqual(notTile.params, { reason: 'not-tile', tile: 'nowhere' });
    assert.ok(res.issues.some((i) => i.code === 'unknown_order' && i.params.type === 'nonsense'));
    assert.ok(res.issues.some((i) => i.code === 'labour' && i.params.assigned === 99));
  });

  it('carries council, trade, rivals and outcome in the view', () => {
    const player = c.player;
    const view = c.read(`view/${player}.json`);
    assertSchema('view', view);
    const d = view.derived[player];
    const council = view.peoples[player].council;
    assert.deepEqual(d.council.map((m) => m.id), council.map((m) => m.id));
    for (const row of d.council) {
      assert.match(row.location.tile, /^-?\d+,-?\d+$/);
      assert.equal(typeof row.strengths.lead, 'number');
      assert.ok(Array.isArray(row.strengths.favor) && Array.isArray(row.strengths.oppose));
    }
    assert.ok(Array.isArray(d.trade.routes) && Array.isArray(d.trade.orders));
    for (const r of d.trade.routes) assert.ok(r.reason === null || /^handel\./.test(r.reason));
    const others = Object.keys(view.peoples).filter((p) => p !== player).sort();
    assert.deepEqual(d.rivals.map((r) => r.people).sort(), others);
    // At the start no people has met another, so no destiny is revealed.
    for (const r of d.rivals) assert.equal(r.destiny, null);
    assert.equal(d.outcome, null);
  });

  it('lists a judge finding the player may see in status.json, and not one citing a hidden entry', () => {
    const state = c.state();
    if (state.phase !== 'agents') {
      const turn = c.playTurn({ next: (() => { let n = 0; return () => (n++ % 9) + 1; })(), stopAt: 'agents' });
      assert.equal(turn.after.phase, 'agents');
    }
    const s = c.state();
    const player = s.campaign.player;
    const seen = s.chronicle.find((e) => e.visibleTo.includes(player) || e.visibleTo.includes('all'));
    const hidden = s.chronicle.find((e) => e.visibleTo.length > 0 && !e.visibleTo.includes(player) && !e.visibleTo.includes('all'));
    assert.ok(seen && hidden, 'the chronicle holds an entry the player sees and one he does not');
    const task = expectExit(c.run('tasks', '--agent', 'judge-coherence'), [0], 'judge task').json.tasks[0];
    const finding = (id, ref, severity) => ({ type: 'finding', id, severity, for: [], refs: [ref.id], text: `Befund ${id}.` });
    c.writeProposal({
      format: 'realmcraft-proposal', version: 1, proposalId: task.respondAs.proposalId, agent: 'judge-coherence',
      campaign: task.campaign, turn: task.turn, basedOnRev: task.rev, people: null,
      items: [finding('f-offen', seen, 'severe'), finding('f-verdeckt', hidden, 'warn')],
    });
    expectExit(c.run('ingest'), [0], 'ingest of the judge proposal');
    const status = c.read('status.json');
    assertSchema('status', status);
    const findings = status.steps.flatMap((st) => st.findings ?? []);
    assert.deepEqual(findings, [{ id: 'f-offen', judge: 'judge-coherence', severity: 'severe', text: 'Befund f-offen.', refs: [seen.id] }]);
  });
});

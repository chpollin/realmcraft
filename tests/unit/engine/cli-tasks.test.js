import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMAS } from '../../../engine/schemas/index.js';
import { validate } from '../../../engine/content/schema.js';
import { validateTask } from '../../../engine/content/validate.js';
import { open } from '../../../engine/core/turn.js';
import { buildJudgeTask, buildTasks } from '../../../engine/harness/tasks.js';
import { freshCampaign, hochland } from '../../fixtures/engine/k1/harness.js';

const { env, library } = hochland();
const state = freshCampaign(env);
const ids = Object.keys(state.peoples);
const player = state.campaign.player;
const ai = ids.filter((id) => id !== player);

describe('buildTasks', () => {
  const tasks = buildTasks(state, env, { library });

  it('writes schema-valid tasks for the current turn and revision', () => {
    for (const { task } of tasks) {
      assert.deepEqual(validate(SCHEMAS.task, task), [], task.respondAs.proposalId);
      assert.equal(validateTask(task).ok, true);
      assert.equal(task.turn, state.turn);
      assert.equal(task.rev, state.rev);
      assert.equal(task.campaign, state.campaign.id);
    }
  });

  it('gives one research task per people, a rival per AI people, a council to the player and one chronicler', () => {
    const key = (t) => `${t.task.agent}|${t.task.people ?? '*'}`;
    assert.deepEqual(tasks.map(key).sort(), [
      ...ids.map((id) => `research|${id}`),
      ...ai.map((id) => `rival|${id}`),
      `council|${player}`,
      'chronicler|*',
    ].sort());
  });

  it('names the proposal id and the paths by agent, people and turn', () => {
    const t = tasks.find((x) => x.task.agent === 'research' && x.task.people === player);
    assert.equal(t.path, `agents/tasks/T0000/research-${player}.json`);
    assert.equal(t.task.respondAs.proposalId, `research.${player}.T0`);
    assert.equal(t.task.respondAs.path, `agents/proposals/research.${player}.T0.json`);
    const c = tasks.find((x) => x.task.agent === 'chronicler').task;
    assert.equal(c.respondAs.proposalId, 'chronicler.T0');
    assert.equal(c.people, null);
  });

  it('keeps foreign stocks out of every people-bound context', () => {
    for (const { task } of tasks.filter((t) => t.task.people)) {
      const text = JSON.stringify(task);
      for (const other of ids.filter((id) => id !== task.people)) {
        const res = state.peoples[other].resources;
        if (JSON.stringify(res) !== JSON.stringify(state.peoples[task.people].resources)) assert.ok(!text.includes(JSON.stringify(res)), `${task.respondAs.proposalId} leaks the stock of ${other}`);
      }
      assert.ok(task.read.every((p) => !p.startsWith('state.json') && !p.startsWith('log/')), 'a people reads its projection, never the full state');
    }
  });

  it('limits research by the tuning and the open tier', () => {
    const t = tasks.find((x) => x.task.agent === 'research' && x.task.people === player).task;
    const lim = env.regeln.tuning.limits;
    assert.equal(t.limits.candidates, lim.candidatesPerTurn);
    assert.equal(t.limits.aboveTier, lim.aboveTier);
    assert.deepEqual(t.limits.items, ['entwicklung', 'bestimmung']);
    assert.ok(t.limits.budget.length >= 1 && t.limits.budget.length <= env.regeln.tuning.maxTier);
    assert.ok(t.limits.tags.includes('weg'));
    assert.equal(t.context.openTier, 1);
  });

  it('gives the rival its profile and catalogue and the council its seats', () => {
    const r = tasks.find((x) => x.task.agent === 'rival').task;
    assert.ok(r.context.profile.stance);
    assert.ok(Array.isArray(r.context.catalogue));
    const c = tasks.find((x) => x.task.agent === 'council').task;
    assert.equal(c.context.council.length, state.peoples[player].council.length);
    assert.deepEqual(c.limits.items, ['person', 'goal', 'voice']);
  });

  it('builds the world task in phase resolving and nothing for an ended campaign', () => {
    const w = buildTasks({ ...state, phase: 'resolving', eventDraws: { [player]: { turn: 0, roll: 4, band: 2, roller: 'player', card: null } } }, env, { library });
    assert.deepEqual(w.map((t) => t.task.agent), ['world']);
    assert.deepEqual(validate(SCHEMAS.task, w[0].task), []);
    assert.equal(w[0].task.context.eventDraws[player].band, 2);
    assert.equal(w[0].task.respondAs.proposalId, 'world.T0');
    assert.deepEqual(buildTasks({ ...state, status: 'ended' }, env, { library }), []);
  });

  it('keeps the tasks of an opened campaign the same set', () => {
    const planning = open(state, env).state;
    assert.equal(buildTasks(planning, env, { library }).length, tasks.length);
  });
});

describe('buildJudgeTask', () => {
  it('builds a valid task for each judge with the full-state reads', () => {
    for (const judge of ['judge-coherence', 'judge-balance', 'judge-narrative']) {
      const { path, task } = buildJudgeTask(state, env, judge);
      assert.deepEqual(validate(SCHEMAS.task, task), [], judge);
      assert.equal(task.people, null);
      assert.equal(path, `agents/tasks/T0000/${judge}-all.json`);
      assert.equal(task.respondAs.proposalId, `${judge}.T0`);
      assert.ok(task.read.includes('state.json'));
    }
    assert.deepEqual(buildJudgeTask(state, env, 'judge-narrative').task.limits.items, ['finding', 'correction', 'memory']);
    assert.throws(() => buildJudgeTask(state, env, 'research'));
  });
});

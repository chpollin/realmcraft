import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creationDraft, compileRealm } from '../../engine/creation/realm.js';
import { makeEnv } from '../../engine/core/env.js';
import { createCampaign } from '../../engine/core/turn.js';
import { buildTasks, buildJudgeTask } from '../../engine/harness/tasks.js';
import { validateWorldPackage } from '../../engine/content/validate.js';
import { validate } from '../../engine/content/schema.js';
import { SCHEMAS } from '../../engine/schemas/index.js';

const files = { welt: 'welt.json', regeln: 'regeln.json', labels: 'labels.json', labelsEn: 'labels.en.json', style: 'style.json', entwicklungen: 'content/entwicklungen.json', ereignisse: 'content/ereignisse.json', bestimmungen: 'content/bestimmungen.json' };
const base = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, JSON.parse(readFileSync(new URL('../../welten/hochland/' + file, import.meta.url), 'utf8'))]));
const draft = creationDraft({ world: 'A world with recording instruments.\nNo unlimited powers.', people: 'The community keeps a private tradition.', language: 'en', seed: 7 });
draft.neighbour.description = 'An independently governed neighbouring community.';
const pack = compileRealm(draft, base);
const env = makeEnv({ welt: pack.welt, regeln: pack.regeln, labels: pack.labels, content: pack });
const state = createCampaign(env, { id: 'context-test', seed: draft.seed, player: 'community' }).state;

test('authored fiction reaches every narrative task with its actual people scope', () => {
  const tasks = [...buildTasks(state, env), ...buildTasks(state, env, { phase: 'resolving' }), buildJudgeTask(state, env, 'judge-balance'), buildJudgeTask(state, env, 'judge-coherence'), buildJudgeTask(state, env, 'judge-narrative')];
  for (const { task } of tasks) {
    assert.deepEqual(validate(SCHEMAS.task, task), [], task.agent);
    assert.deepEqual(task.context.realm.world, draft.world && { name: draft.world.name, description: draft.world.description });
    assert.equal(task.context.realm.source, 'player-authored-fiction');
    const own = (task.people ?? state.campaign.player) === 'community';
    assert.deepEqual(task.context.realm.community, own ? { name: draft.people.name, description: draft.people.description } : draft.neighbour);
    if (!task.people) assert.deepEqual(task.context.realm.communities.neighbours, draft.neighbour);
    else assert.equal(task.context.realm.communities, undefined);
    if (!own) assert.ok(!JSON.stringify(task.context.realm).includes(draft.people.description), 'rival scope excludes the player community description');
    assert.equal(task.context.realm.seed, undefined);
  }
});

test('optional authored metadata is validated while existing packages keep their contract', () => {
  assert.deepEqual(validateWorldPackage(base).filter((i) => i.severity === 'error'), []);
  assert.deepEqual(validateWorldPackage(pack).filter((i) => i.severity === 'error'), []);
  const broken = structuredClone(pack);
  broken.welt.creation.world.description = 42;
  assert.ok(validateWorldPackage(broken).some((i) => i.severity === 'error' && i.path === '/welt/creation/world/description'));
  const originalEnv = makeEnv({ welt: base.welt, regeln: base.regeln, labels: base.labels, content: base });
  const original = createCampaign(originalEnv, { id: 'original', seed: 7 }).state;
  for (const { task } of buildTasks(original, originalEnv)) assert.equal(task.context.realm, undefined);
});

test('alternate template players keep package identities in authored agent context', () => {
  const alternate = createCampaign(env, { id: 'alternate', seed: 7, player: 'neighbours' }).state;
  for (const { task } of buildTasks(alternate, env)) {
    const expected = (task.people ?? alternate.campaign.player) === 'neighbours' ? draft.neighbour : { name: draft.people.name, description: draft.people.description };
    assert.deepEqual(task.context.realm.community, expected, task.agent + ':' + task.people);
  }
});

// tests/unit/spielbrett-weltgeschehen.test.js — shaping of status.json steps for
// the Weltgeschehen panel (spielbrett/js/data/game.js). Inputs are the engine
// fixtures and the Hochland labels, expected values are derived from them.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { makeLabels } from '../../spielbrett/js/data/labels.js';
import { agentEventIndex, durationSeconds, formatDuration, shapeSteps } from '../../spielbrett/js/data/game.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const json = (p) => JSON.parse(readFileSync(root(p), 'utf8'));

const t = makeLabels(json('welten/hochland/labels.json'));
const status = json('tests/fixtures/engine/status.json');
const judge = json('tests/fixtures/engine/proposal-judge-coherence.json');

// The ingest names a finding by its text cut to 80 characters (engine/harness/ingest.js).
const findingStep = {
  id: 'judge-coherence-all', agent: 'judge-coherence', state: 'done',
  startedAt: '2026-10-03T14:10:00Z', endedAt: '2026-10-03T14:10:31Z', summary: '',
  proposals: judge.items.filter((i) => i.type === 'finding').map((i) => ({
    proposalId: judge.proposalId, kind: 'finding', title: i.text.slice(0, 80), verdict: 'accepted', budget: null, reason: null,
  })),
};
const findingEvents = judge.items.filter((i) => i.type === 'finding').map((i, n) => ({
  id: `T12-e${n}`, turn: 12, source: `agent:${judge.agent}`, kind: 'ingest.finding',
  target: { kind: 'campaign', id: judge.campaign }, change: null, reason: `${i.severity}: ${i.text}`, refs: [i.id, ...i.refs],
}));

describe('durations', () => {
  test('whole seconds between the step timestamps, null when one is missing', () => {
    const research = status.steps.find((s) => s.agent === 'research');
    const sec = (Date.parse(research.endedAt) - Date.parse(research.startedAt)) / 1000;
    assert.equal(durationSeconds(research.startedAt, research.endedAt), sec);
    assert.equal(durationSeconds(research.startedAt, null), null);
    assert.equal(durationSeconds(research.endedAt, research.startedAt), null);
  });

  test('formats seconds and minutes', () => {
    assert.equal(formatDuration(45), '45 s');
    assert.equal(formatDuration(88), '1 min 28 s');
    assert.equal(formatDuration(120), '2 min');
    assert.equal(formatDuration(null), '');
  });
});

describe('shapeSteps', () => {
  const rows = shapeSteps([...status.steps, findingStep], { t, peopleName: (id) => ({ hochweide: 'Hochweide-Sippen' }[id] ?? null) });
  const byAgent = (a) => rows.find((r) => r.agent === a);

  test('states map to the board labels and done steps carry their duration', () => {
    assert.equal(byAgent('world').status, 'fertig');
    assert.equal(byAgent('world').dauer, 70);
    assert.equal(byAgent('rival').status, 'arbeitet');
    assert.equal(byAgent('rival').dauer, null);
    assert.equal(byAgent('chronicler').status, 'wartet');
    assert.equal(byAgent('chronicler').dauer, null);
  });

  test('accepted and rejected are counted per agent', () => {
    assert.equal(byAgent('research').angenommen, 1);
    assert.equal(byAgent('research').abgelehnt, 0);
    const rejected = shapeSteps([{ ...status.steps[1], proposals: [{ ...status.steps[1].proposals[0], verdict: 'rejected', reason: 'keine Grundlage' }] }], { t })[0];
    assert.equal(rejected.abgelehnt, 1);
    assert.equal(rejected.results[0].cls, 'abgelehnt');
    assert.equal(rejected.results[0].grund, 'keine Grundlage');
  });

  test('a rival shows no proposals and no summary, whatever the status holds', () => {
    const [rival] = shapeSteps([{
      id: 'rival-esk', agent: 'rival', state: 'done', startedAt: null, endedAt: null, summary: 'Der Klan sammelt Schädel am Pass.',
      proposals: [{ proposalId: 'rival.esk.T0', kind: 'stance', title: 'Rüstet gegen den Spieler', verdict: 'accepted', budget: null, reason: null }],
    }], { t });
    assert.deepEqual(rival.results, []);
    assert.equal(rival.taetigkeit, '');
    assert.equal(rival.role, 'rival');
  });

  test('judges come last, with their own role', () => {
    assert.equal(rows.at(-1).agent, 'judge-coherence');
    assert.equal(rows.at(-1).role, 'judge');
    assert.deepEqual(rows.slice(0, -1).map((r) => r.role), ['agent', 'agent', 'rival', 'agent']);
  });

  test('the people of a step join the name, a judge never gets one', () => {
    assert.match(byAgent('research').name, /, Hochweide-Sippen$/);
    assert.equal(byAgent('judge-coherence').name, t('agent.judge-coherence', 'judge-coherence'));
  });
});

describe('event index and findings', () => {
  test('severity of a finding is taken from the logged finding, matched by its text', () => {
    const { findings } = agentEventIndex(findingEvents, () => null);
    const [row] = shapeSteps([findingStep], { t, findings });
    const wanted = judge.items.filter((i) => i.type === 'finding');
    assert.deepEqual(row.results.map((r) => r.severity), wanted.map((i) => i.severity));
    assert.ok(row.results.some((r) => r.severity === 'severe' && r.icon === 'warnung'));
  });

  test('without a logged finding the severity stays empty', () => {
    const [row] = shapeSteps([findingStep], { t });
    assert.ok(row.results.every((r) => r.severity === null && r.severityText === null));
  });

  test('a position is attached through the proposal id in refs of agent entries only', () => {
    const world = status.steps.find((s) => s.agent === 'world');
    const proposalId = world.proposals[0].proposalId;
    const events = [
      { id: 'T0-e1', source: 'kernel', kind: 'x.y', target: { kind: 'tile', id: '1,1' }, change: { field: 'f', delta: 1 }, refs: [proposalId] },
      { id: 'T0-e2', source: 'agent:world', kind: 'ingest.feature', target: { kind: 'tile', id: '3,4' }, change: { field: 'f', before: null, after: 1 }, refs: [proposalId] },
    ];
    const index = agentEventIndex(events, (e) => { const [q, r] = e.target.id.split(',').map(Number); return { q, r }; });
    assert.deepEqual(index.positions.get(proposalId), { q: 3, r: 4 });
    const [row] = shapeSteps([world], { t, positions: index.positions });
    assert.deepEqual(row.results[0].pos, { q: 3, r: 4 });
  });
});

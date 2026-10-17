import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonSummary } from '../../spielbrett/js/data/saison.js';
import { freshState, draftOf, PLAYER } from '../fixtures/engine/k1/foundation.js';
import { preview } from '../../engine/core/turn.js';

test('season summary separates reservations from economics and only sums own previous-turn logs', () => {
  const { state, env } = freshState();
  const view = { ...state, people: PLAYER, turn: 2 };
  const draft = draftOf(view);
  const pv = { ...preview(view, env, draft), costs: { material: 2 }, forecast: { net: { nahrung: -1 } } };
  const event = (id, field, delta) => ({ target: { kind: 'people', id }, change: { field, delta } });
  const report = { turn: 1, people: PLAYER, events: [event(PLAYER, 'resources.nahrung', 3),
    event(PLAYER, 'resources.nahrung', -2), event('esk', 'resources.nahrung', 40), event(PLAYER, 'population.core', 1)] };
  const data = seasonSummary({ view, env, draft, pv, report });
  assert.deepEqual(data.previous.changes, { nahrung: 1 });
  assert.equal(data.resources.find((r) => r.key === 'material').reserved, 2);
  assert.equal(data.resources.find((r) => r.key === 'material').net, 0);
  assert.equal(data.resources.find((r) => r.key === 'nahrung').net, -1);
  assert.equal(seasonSummary({ view, env, draft, pv: null, report }).resources[0].net, null);
  assert.equal(seasonSummary({ view, env, draft, pv, report: { ...report, turn: 0 } }).previous, null);
  assert.equal(seasonSummary({ view, env, draft, pv, report: null }).previous, null);
});

// What the task builder hands the agents beyond the kernel's own fields:
// path context, path targets for rivals, the resolved events and canonical
// names for prose, and the notes the CLI reads from earlier proposals
// (judges' findings by role, a rival's own stances).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMAS } from '../../engine/schemas/index.js';
import { validate } from '../../engine/content/schema.js';
import { buildTasks } from '../../engine/harness/tasks.js';
import { freshCampaign, hochland } from '../fixtures/engine/k1/harness.js';

const { env, library } = hochland();
const state = freshCampaign(env);
const player = state.campaign.player;
const ai = Object.keys(state.peoples).filter((id) => state.peoples[id].controller === 'ai');
const finding = (id, severity, roles) => ({ id, judge: 'judge-balance', turn: 0, severity, for: roles, text: `Befund ${id}` });
const notes = {
  findings: [finding('leicht', 'info', ['research', 'chronicler']), finding('mittel', 'warn', ['rival']), finding('schwer', 'severe', ['research', 'rival'])],
  stances: { [ai[0]]: [1, 2, 3, 4].map((turn) => ({ turn, text: `Haltung ${turn}` })) },
};
const tasks = buildTasks(state, env, { library, notes }).map((t) => t.task);
const of = (agent, people = null) => tasks.find((t) => t.agent === agent && t.people === people);

describe('harness tasks', () => {
  it('stay schema-valid with the added context', () => {
    for (const t of tasks) assert.deepEqual(validate(SCHEMAS.task, t), [], t.respondAs.proposalId);
  });

  it('route findings to the roles they name and keep severe ones for the player', () => {
    assert.deepEqual(of('research', player).context.findings.map((f) => f.id), ['leicht']);
    assert.deepEqual(of('chronicler').context.findings.map((f) => f.id), ['leicht']);
    assert.deepEqual(of('rival', ai[0]).context.findings.map((f) => f.id), ['mittel']);
    assert.deepEqual(of('council', player).context.findings, []);
    assert.deepEqual(buildTasks(state, env, { library }).map((t) => t.task).find((t) => t.agent === 'research').context.findings, [], 'no notes, no findings');
  });

  it('give a rival its own latest stances, oldest first, and no other people\'s', () => {
    assert.deepEqual(of('rival', ai[0]).context.stances.map((s) => s.turn), [2, 3, 4]);
    assert.deepEqual(of('rival', ai[1]).context.stances, []);
  });

  it('offer research.direct on the open paths and the path view to rivals', () => {
    const rival = of('rival', ai[0]);
    const direct = rival.context.orders.find((o) => o.type === 'research.direct');
    const open = rival.context.pfade.paths.filter((p) => p.open).map((p) => p.id);
    assert.deepEqual(direct.targets.map((p) => p.pfad), open.slice(0, direct.targets.length));
    assert.ok(!direct.targets.some((p) => p.pfad === 'magie'), 'magic stays closed without practice');
    assert.deepEqual(direct.example, { id: 'o1', type: 'research.direct', params: direct.targets[0] });
  });

  it('ground the chronicler in resolved events and canonical names of what the player sees', () => {
    const chron = of('chronicler');
    const seen = new Set(state.chronicle.filter((e) => e.visibleTo.includes(player) || e.visibleTo.includes('all')).map((e) => e.id));
    assert.ok(chron.context.resolved.length > 0);
    for (const e of chron.context.resolved) {
      assert.ok(seen.has(e.id), `${e.id} is visible to the player`);
      assert.ok(!['campaign.phase', 'campaign.turn'].includes(e.kind), 'bookkeeping is left out');
    }
    const names = chron.context.names;
    assert.equal(names.peoples[player], state.peoples[player].name);
    for (const m of state.peoples[player].council) assert.equal(names.council[m.id], m.name);
    for (const k of state.peoples[player].developments.known) assert.equal(names.developments[k.ref], env.entwicklung(k.ref).name);
    assert.deepEqual(names.paths, env.regeln.pfade.paths.map((p) => p.id));
    assert.equal(of('council', player).context.names.council[state.peoples[player].council[0].id], state.peoples[player].council[0].name);
  });

  it('name the narrative language in every task that asks for player-facing text', () => {
    for (const t of tasks) assert.equal(t.context.language, 'de', t.respondAs.proposalId);
  });
});

// The examples in .claude/agents are what the turn workers and judges copy,
// so each ```json block must be a proposal the current kernel accepts: the
// proposal schema, the item table of its agent, and the full validator
// against a fresh Hochland campaign with the agent's own task (the envelope
// fields are taken from that task, the items stay as written). The commands
// are checked for the model and the guard against automatic invocation.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMAS } from '../../engine/schemas/index.js';
import { ITEMS_BY_AGENT } from '../../engine/schemas/proposal.js';
import { validate } from '../../engine/content/schema.js';
import { validateProposal } from '../../engine/content/validate.js';
import { buildJudgeTask, buildTasks } from '../../engine/harness/tasks.js';
import { REPO, freshCampaign, hochland, withPractice } from '../fixtures/engine/k1/harness.js';

const AGENTS_DIR = join(REPO, '.claude', 'agents');
const COMMANDS_DIR = join(REPO, '.claude', 'commands');
const { env, library } = hochland();
const base = freshCampaign(env);

const files = readdirSync(AGENTS_DIR).filter((f) => /^rc-.*\.md$/.test(f)).sort();
const examples = (file) => [...readFileSync(join(AGENTS_DIR, file), 'utf8').matchAll(/```json\r?\n([\s\S]*?)```/g)].map((m) => m[1]);

/** The task the agent would answer in the fresh campaign, and the state to judge it on. */
function setting(doc) {
  if (doc.agent.startsWith('judge-')) return { state: base, task: buildJudgeTask(base, env, doc.agent).task };
  // A worker's people may differ from the fresh campaign's roles, so the
  // rival takes an AI people and the others the people the example names.
  const phase = doc.agent === 'world' ? 'resolving' : 'agents';
  const ai = Object.keys(base.peoples).filter((id) => base.peoples[id].controller === 'ai');
  const people = doc.agent === 'rival' ? (ai.includes(doc.people) ? doc.people : ai[0]) : doc.people;
  // Grounding needs practice in the tags the example names as its origin.
  const practiced = (doc.items ?? []).flatMap((i) => i.data?.origin?.practiceTags ?? []);
  const state = practiced.length ? withPractice(base, people, Object.fromEntries(practiced.map((t) => [t, 2]))) : base;
  const task = buildTasks(state, env, { library, phase }).map((t) => t.task).find((t) => t.agent === doc.agent && t.people === people);
  return { state, task };
}

describe('agent examples', () => {
  it('every turn worker and judge has a definition with at least one example', () => {
    assert.deepEqual(files.map((f) => f.slice(3, -3)).sort(), Object.keys(ITEMS_BY_AGENT).filter((a) => a !== 'image').sort());
    for (const f of files) assert.ok(examples(f).length >= 1, `${f} has no json example`);
  });

  for (const f of files) {
    const agent = f.slice(3, -3);
    it(`${f}: every example is a valid ${agent} proposal`, () => {
      for (const [n, text] of examples(f).entries()) {
        const where = `${f} example ${n}`;
        let doc;
        assert.doesNotThrow(() => { doc = JSON.parse(text); }, where);
        assert.deepEqual(validate(SCHEMAS.proposal, doc), [], `${where} fails the proposal schema`);
        assert.equal(doc.agent, agent, where);
        for (const item of doc.items) assert.ok(ITEMS_BY_AGENT[agent].includes(item.type), `${where}: ${agent} may not send ${item.type}`);
        for (const item of doc.items.filter((i) => i.type === 'entwicklung')) {
          assert.ok(env.regeln.pfade.paths.some((p) => p.id === item.data.pfad), `${where}: an achievement names its path`);
        }

        const { state, task } = setting(doc);
        assert.ok(task, `${where}: the fresh campaign gives ${agent} a task`);
        const proposal = { ...doc, campaign: task.campaign, turn: task.turn, basedOnRev: task.rev, people: task.people, proposalId: task.respondAs.proposalId };
        const v = validateProposal(proposal, { state, task, regeln: env.regeln, welt: env.welt, library });
        const errors = [...v.issues, ...v.items.flatMap((i) => i.issues)].filter((i) => i.severity !== 'warning');
        assert.deepEqual(errors.map((i) => `${i.code} ${i.path} ${i.message}`), [], where);
      }
    });
  }
});

describe('turn commands', () => {
  const frontmatter = (file) => {
    const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(COMMANDS_DIR, file), 'utf8'))[1];
    return Object.fromEntries(block.split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  };

  it('/zug and /partie run on Opus and never start on their own', () => {
    for (const file of ['zug.md', 'partie.md']) {
      const fm = frontmatter(file);
      assert.equal(fm.model, 'opus', file);
      assert.equal(fm['disable-model-invocation'], 'true', file);
    }
  });

  it('the game master neither rolls for the player nor recommends', () => {
    for (const file of ['zug.md', 'partie.md']) {
      const text = readFileSync(join(COMMANDS_DIR, file), 'utf8');
      assert.match(text, /würfelst nie für den Spieler/, file);
      assert.match(text, /empfiehlst ihm keine Aktion|Keine Empfehlung/, file);
    }
  });
});

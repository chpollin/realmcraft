// Harness group, a turn end to end: what /zug does, with scripted proposals
// in place of the language-model agents. The campaign runs phase B of turn 0,
// the judges, the planning of turn 0 with a research request on a path,
// phase A and phase B of turn 1, where the research agent answers the
// request with an achievement on that path, and the seasons until the player's
// research completes it. Every proposal passes the proposal-check hook as an
// agent's write would, ingest files it, open releases the planning and
// status-note sync brings status.json in line. tools/harness/acceptance.mjs
// then measures the verdicts.
// Spec: .claude/commands/zug.md, knowledge/agents-harness.md, knowledge/plan-m1.md
// (kernel contracts "Research orders" and "Derived path view").
//
// Assumptions beyond lib/harness.js (A1 to A9):
// H1 Tasks carry context.pfade (research, rival), context.orders with
//    research.direct targets naming paths (rival), context.resolved and
//    context.names (chronicler), context.stances (rival) and context.findings
//    for the roles a judge's finding names.
// H2 The helpers take --root and --campaign: tools/harness/status-note.mjs,
//    tools/harness/acceptance.mjs, and the hooks read REALMCRAFT_ROOT.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { REPO, T_LONG, createCampaign, dice, expectExit, removeRoot } from './lib/harness.js';

const PATH = 'nahrung';

function tool(root, script, args) {
  const r = spawnSync(process.execPath, [join(REPO, 'tools', 'harness', script), ...args, '--root', root], { cwd: root, encoding: 'utf8', timeout: 120_000 });
  assert.equal(r.status, 0, `${script} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout);
}

function hook(root, name, payload) {
  return spawnSync(process.execPath, [join(REPO, 'tools', 'hooks', `${name}.mjs`)], {
    input: JSON.stringify({ session_id: 'acc', cwd: root, ...payload }),
    encoding: 'utf8',
    env: { ...process.env, REALMCRAFT_ROOT: root, CLAUDE_PROJECT_DIR: root },
    timeout: 60_000,
  });
}

const proposalFor = (task, items) => ({
  format: 'realmcraft-proposal', version: 1, proposalId: task.respondAs.proposalId, agent: task.agent,
  campaign: task.campaign, turn: task.turn, basedOnRev: task.rev, people: task.people, items,
});

describe('harness, a turn through the CLI with scripted agents', { timeout: T_LONG }, () => {
  let c;
  const next = dice(4242);
  const tasksOf = () => expectExit(c.run('tasks'), [0], 'tasks').json.tasks;
  const task = (list, agent, people = null) => list.find((t) => t.agent === agent && t.people === people);
  const seen = (pid) => c.view(pid).chronicle.map((e) => e.id);

  /** Writes the proposal as the agent would and runs the pre-check hook on it. */
  function deliver(t, items) {
    const file = c.writeProposal(proposalFor(t, items));
    const r = hook(c.root, 'proposal-check', { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: file }, tool_response: {}, agent_type: `rc-${t.agent}` });
    assert.equal(r.status, 0, `${t.respondAs.proposalId} fails the pre-check\n${r.stderr}`);
    return file;
  }

  function stance(t, text) {
    const refs = seen(t.people).slice(-1);
    assert.equal(refs.length, 1, `${t.people} saw an event to cite`);
    const draft = {
      format: 'realmcraft-draft', version: 1, people: t.people, turn: t.context.draftTurn, baseRev: t.rev,
      orders: [t.context.orders.find((o) => o.type === 'research.direct').example],
      mandate: {}, rolls: {}, withdrawn: [], sealed: false,
    };
    deliver(t, [{ type: 'orders', data: draft }, { type: 'stance', refs, text }]);
  }

  function phaseB({ research = null } = {}) {
    const list = tasksOf();
    tool(c.root, 'status-note.mjs', ['plan', '--campaign', c.id]);
    const player = c.player;
    for (const t of list.filter((x) => x.agent === 'rival')) stance(t, `Das Volk ${t.people} hält an seinem Weg fest.`);
    const council = task(list, 'council', player);
    deliver(council, [{ type: 'voice', member: council.context.council[0].id, refs: seen(player).slice(-1), text: 'Wir halten die Herden zusammen.' }]);
    const chron = task(list, 'chronicler');
    assert.ok(chron.context.resolved.length, 'the season resolved events for the player');
    deliver(chron, [{ type: 'narrative', refs: chron.context.resolved.slice(-2).map((e) => e.id), text: 'Die Sippen zählen, was die Saison brachte.' }]);
    if (research) deliver(task(list, 'research', player), research(task(list, 'research', player)));
    const ingest = expectExit(c.run('ingest'), [0], 'ingest of phase B');
    expectExit(c.open(), [0], 'open');
    const status = tool(c.root, 'status-note.mjs', ['sync', '--campaign', c.id]);
    return { list, ingest: ingest.json.proposals, status };
  }

  let first;
  let second;
  let ref;

  before(() => {
    c = createCampaign({ label: 'harness', id: 'acc-harness' });
  });
  after(() => removeRoot(c?.root));

  it('phase B of turn 0 ingests every delivered proposal and status follows to planning', () => {
    assert.equal(c.state().phase, 'agents');
    first = phaseB();
    assert.deepEqual(first.ingest.map((p) => p.verdict), first.ingest.map(() => 'accepted'), JSON.stringify(first.ingest, null, 1));
    assert.equal(c.state().phase, 'planning');
    assert.equal(first.status.phase, 'planning');
    const steps = Object.fromEntries(first.status.steps.map((s) => [s.id, s.state]));
    assert.equal(steps['chronicler-all'], 'done');
    assert.equal(steps[`council-${c.player}`], 'done');
    for (const t of first.list.filter((x) => x.agent === 'research')) assert.equal(steps[`research-${t.people}`], 'failed', 'no proposal, no research');
  });

  it('the tasks carry paths, path targets for rivals, the resolved events and the canonical names', () => {
    const research = task(first.list, 'research', c.player);
    assert.ok(research.context.pfade.paths.some((p) => p.id === PATH && p.open), 'the research task shows the open paths');
    assert.equal(research.context.language, 'de');
    const rival = first.list.find((t) => t.agent === 'rival');
    const direct = rival.context.orders.find((o) => o.type === 'research.direct');
    assert.ok(direct.params.pfad, 'research.direct names its pfad parameter');
    assert.ok(direct.targets.length && direct.targets.every((p) => typeof p.pfad === 'string'), 'targets name open paths');
    assert.ok(Array.isArray(rival.context.pfade.paths));
    const chron = task(first.list, 'chronicler');
    assert.ok(chron.context.resolved.every((e) => e.id && e.kind), 'resolved entries carry id and kind');
    assert.equal(chron.context.names.peoples[c.player], c.state().peoples[c.player].name);
    assert.equal(expectExit(c.run('status'), [0], 'status').json.settings.language, 'de');
  });

  it('a judge finding is ingested with its severity and reaches the roles it names', () => {
    const judge = expectExit(c.run('tasks', '--agent', 'judge-balance'), [0], 'judge task').json.tasks[0];
    deliver(judge, [{ type: 'finding', id: 'probe-befund', severity: 'warn', for: ['rival', 'chronicler'], refs: seen(c.player).slice(-1), text: 'Die Forschung bleibt auf einem Pfad stehen.' }]);
    expectExit(c.run('ingest'), [0], 'ingest of the judge');
    const step = c.read('status.json').steps.find((s) => s.id === 'judge-balance-all');
    assert.deepEqual(step.findings.map((f) => [f.id, f.severity]), [['probe-befund', 'warn']]);
  });

  it('the planning of turn 0 directs research to a path, and the request carries it', () => {
    const turn = c.playTurn({ next, stopAt: 'agents', makeDraft: (s) => c.emptyDraft(s, [{ id: 'o1', type: 'research.direct', params: { pfad: PATH } }]) });
    assert.equal(turn.after.phase, 'agents');
    const request = c.state().peoples[c.player].developments.requests.at(-1);
    assert.equal(request.pfad, PATH);
  });

  it('phase B of turn 1 answers the request with an achievement on that path, and rivals continue their stance', () => {
    second = phaseB({
      research: (t) => {
        const request = t.context.requests.at(-1);
        assert.equal(request.pfad, PATH);
        const cap = t.context.pfade.paths.find((p) => p.id === PATH).cap;
        assert.ok(cap >= 1);
        return [{
          type: 'entwicklung',
          data: {
            format: 'realmcraft-entwicklung', version: 1, id: 'kammweiden-wechsel', rev: 1, kind: 'technik', tier: 1, pfad: PATH,
            name: 'Kammweidenwechsel', summary: 'Die Hirten treiben die Herden im Wechsel über die hohen Kämme.', appearance: 'Eine Herde zieht über einen Grat',
            tags: request.tags.slice(0, 3), prerequisites: { all: [], any: [], if: null }, cost: { research: 2, resources: {} },
            effects: [{ op: 'probe.mod', tags: [request.tags[0]], amount: 1 }], price: [], onAcquire: [], replaces: [], spec: null,
            origin: { source: 'agent', practiceTags: [], token: null, request: request.turn, proposal: t.respondAs.proposalId },
          },
        }];
      },
    });
    const research = second.ingest.find((p) => p.proposalId.startsWith(`research.${c.player}.`));
    assert.equal(research.verdict, 'accepted', JSON.stringify(research));
    ref = 'kammweiden-wechsel@1';
    const row = c.view().derived[c.player].pfade.paths.find((p) => p.id === PATH);
    assert.ok(row.candidates.includes(ref), 'the achievement waits on its path');
    const rival = second.list.find((t) => t.agent === 'rival');
    assert.deepEqual(rival.context.stances.map((s) => s.turn), [0], 'the rival sees its stance of turn 0');
    assert.ok(rival.context.findings.some((f) => f.id === 'probe-befund'), 'the judge finding reached the rival');
    assert.ok(task(second.list, 'chronicler').context.findings.some((f) => f.id === 'probe-befund'));
    assert.ok(!task(second.list, 'council', c.player).context.findings.length, 'the council was not named');
  });

  it('the player researches the achievement, the points accumulate and it completes on its path', () => {
    let first = true;
    for (let i = 0; i < 6 && !c.state().peoples[c.player].developments.known.some((k) => k.ref === ref); i++) {
      const orders = first ? [{ id: 'o1', type: 'research.assign', params: { development: ref } }] : [];
      first = false;
      const t = c.playTurn({ next, makeDraft: (s) => c.emptyDraft(s, orders) });
      assert.notEqual(t.after.status, 'ended');
    }
    const row = c.view().derived[c.player].pfade.paths.find((p) => p.id === PATH);
    assert.ok(row.known.includes(ref), `${ref} completed on ${PATH}`);
  });

  it('the acceptance tool measures the verdicts per agent', () => {
    const report = tool(c.root, 'acceptance.mjs', ['--campaign', c.id]);
    assert.equal(report.campaign, c.id);
    assert.deepEqual(report.agents.research.byType.entwicklung, { sent: 1, accepted: 1, rate: 1 });
    assert.equal(report.agents.chronicler.items.rate, 1);
    assert.equal(report.agents['judge-balance'].items.accepted, 1);
    assert.ok(report.agents.rival.proposals >= 2);
    assert.equal(report.items.sent, Object.values(report.agents).reduce((n, a) => n + a.items.sent, 0));
    const only = tool(c.root, 'acceptance.mjs', ['--campaign', c.id, '--agent', 'research', '--from', '1', '--to', '1']);
    assert.deepEqual(Object.keys(only.agents), ['research']);
    assert.deepEqual(only.turns, { from: 1, to: 1 });
  });
});

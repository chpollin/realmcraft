// Hooks of the game harness (tools/hooks/), fed hook JSON on stdin as Claude
// Code does. The campaign is the mid-game fixture in a temp root, so the
// repository's own campaigns/ stays untouched.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATTERNS } from '../../engine/schemas/index.js';
import { PROPOSAL_ID_RE, campaignPath, normPath } from '../../tools/harness/lib.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = (name) => join(REPO, 'tools', 'hooks', `${name}.mjs`);
const CID = 'hochland-mitte';
const TURN = 12;

let root;
let dir;

function run(hook, input, env = {}) {
  const r = spawnSync(process.execPath, [HOOK(hook)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, REALMCRAFT_ROOT: root, CLAUDE_PROJECT_DIR: root, ...env },
    timeout: 30_000,
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const write = (file_path, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path, content: '{}' }, cwd: root, ...extra });
const shell = (command, tool_name = 'Bash') => ({ hook_event_name: 'PreToolUse', tool_name, tool_input: { command }, cwd: root });
const denied = (r) => r.code === 0 && JSON.parse(r.stdout).hookSpecificOutput.permissionDecision === 'deny';
const silent = (r) => r.code === 0 && r.stdout === '' && r.stderr === '';

const task = (agent, people = null) => {
  const proposalId = people ? `${agent}.${people}.T${TURN}` : `${agent}.T${TURN}`;
  return {
    format: 'realmcraft-task',
    version: 1,
    campaign: CID,
    turn: TURN,
    rev: 37,
    agent,
    people,
    respondAs: { proposalId, path: `agents/proposals/${proposalId}.json` },
    read: ['state.json'],
    context: {},
    limits: { items: { chronicler: ['narrative'], world: ['event', 'feature'] }[agent] ?? ['orders', 'stance'], candidates: 0, aboveTier: 0, openPool: 0, moduleActivations: 0, allowedPrimitives: [], tags: [], budget: [] },
  };
};

const narrative = (extra = {}) => ({
  format: 'realmcraft-proposal',
  version: 1,
  proposalId: `chronicler.T${TURN}`,
  agent: 'chronicler',
  campaign: CID,
  turn: TURN,
  basedOnRev: 37,
  people: null,
  items: [{ type: 'narrative', refs: ['T11-e91'], text: 'Der Talbund zählt die Vorräte, während der Schnee den Pass schließt.', ...extra }],
});

function putProposal(p, name = p.proposalId) {
  const file = join(dir, 'agents', 'proposals', `${name}.json`);
  writeFileSync(file, typeof p === 'string' ? p : JSON.stringify(p, null, 2));
  return file;
}

const post = (file_path, extra = {}) => ({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path, content: '' }, tool_response: {}, cwd: root, ...extra });
const status = () => JSON.parse(readFileSync(join(dir, 'status.json'), 'utf8'));

before(() => {
  root = mkdtempSync(join(tmpdir(), 'rc-harness-hooks-'));
  dir = join(root, 'campaigns', CID);
  cpSync(join(REPO, 'welten', 'hochland'), join(root, 'welten', 'hochland'), { recursive: true });
  for (const sub of ['agents/proposals', `agents/tasks/T00${TURN}`, 'log']) mkdirSync(join(dir, sub), { recursive: true });
  cpSync(join(REPO, 'tests', 'fixtures', 'engine', 'campaign-midgame.json'), join(dir, 'state.json'));
  writeFileSync(join(dir, `agents/tasks/T00${TURN}/chronicler-all.json`), JSON.stringify(task('chronicler')));
  writeFileSync(join(dir, `agents/tasks/T00${TURN}/rival-bergnomaden.json`), JSON.stringify(task('rival', 'bergnomaden')));
  writeFileSync(join(dir, `agents/tasks/T00${TURN}/world-all.json`), JSON.stringify(task('world')));
});
after(() => rmSync(root, { recursive: true, force: true }));

describe('harness lib', () => {
  it('proposal id pattern equals the schema pattern', () => {
    assert.equal(PROPOSAL_ID_RE.source, PATTERNS.proposal.replace(/\\\\/g, '\\'));
  });

  it('normalises Windows, Git Bash and relative paths onto one campaign location', () => {
    const forms = [`${root}\\campaigns\\${CID}\\state.json`, `${normPath(root)}/campaigns/${CID}/state.json`, `campaigns/${CID}/state.json`];
    if (process.platform === 'win32') forms.push(normPath(root).replace(/^([A-Z]):/, (_, d) => `/${d.toLowerCase()}`) + `/campaigns/${CID}/state.json`);
    for (const f of forms) {
      const loc = campaignPath(f, root);
      assert.equal(loc?.cid, CID, f);
      assert.equal(loc.rel, 'state.json', f);
    }
    assert.equal(campaignPath(`${root}/examples/campaigns/${CID}/state.json`), null, 'examples/campaigns is developer territory');
    assert.equal(campaignPath(`${root}/campaigns/index.json`).rel, 'index.json');
  });
});

describe('guard-state', () => {
  it('stays silent for unrelated events', () => {
    assert.ok(silent(run('guard-state', write(join(REPO, 'js', 'app.js')))));
    assert.ok(silent(run('guard-state', { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: join(dir, 'state.json') }, cwd: root })));
    assert.ok(silent(run('guard-state', shell('git status'))));
    assert.ok(silent(run('guard-state', '')));
    assert.ok(silent(run('guard-state', 'not json')));
    assert.ok(silent(run('guard-state', write(join(root, 'examples', 'campaigns', CID, 'state.json')))));
  });

  it('denies writes to kernel files of a campaign', () => {
    for (const rel of ['state.json', 'library.json', 'log/T0011.json', 'status.json', 'run.json', 'drafts/talbund.json']) {
      assert.ok(denied(run('guard-state', write(join(dir, rel)))), rel);
    }
    assert.ok(denied(run('guard-state', write(join(root, 'campaigns', 'index.json')))));
    assert.ok(denied(run('guard-state', { ...write(join(dir, 'state.json')), tool_name: 'Edit' })));
  });

  it('denies Windows backslash and Git Bash spellings of the same path', () => {
    assert.ok(denied(run('guard-state', write(`${root}\\campaigns\\${CID}\\state.json`))));
    assert.ok(denied(run('guard-state', write(`${root}\\campaigns\\${CID}\\log\\T0011.json`))));
    if (process.platform === 'win32') {
      const bash = normPath(root).replace(/^([A-Z]):/, (_, d) => `/${d.toLowerCase()}`);
      assert.ok(denied(run('guard-state', write(`${bash}/campaigns/${CID}/library.json`))));
    }
  });

  it('allows a proposal file and binds it to the writing role', () => {
    const file = join(dir, 'agents', 'proposals', `rival.bergnomaden.T${TURN}.json`);
    assert.ok(silent(run('guard-state', write(file))));
    assert.ok(silent(run('guard-state', write(file, { agent_type: 'rc-rival', agent_id: 'a1' }))));
    assert.ok(denied(run('guard-state', write(file, { agent_type: 'rc-research', agent_id: 'a2' }))));
    assert.ok(denied(run('guard-state', write(join(REPO, 'js', 'app.js'), { agent_type: 'rc-chronicler', agent_id: 'a3' }))), 'a game agent writes nothing outside its proposal');
    assert.ok(silent(run('guard-state', write(join(REPO, 'js', 'app.js'), { agent_type: 'Explore', agent_id: 'a4' }))), 'other subagents are not affected');
  });

  it('denies shell commands that write under campaigns/ unless they call the kernel', () => {
    const deniedCmds = [
      `echo {} > campaigns/${CID}/state.json`,
      `rm -rf campaigns/${CID}`,
      `cp x.json campaigns/${CID}/library.json`,
      `node engine/cli.mjs status --json > campaigns/${CID}/state.json`,
      `cat a | tee campaigns/${CID}/log/T0001.json`,
      `node -e "require('fs').writeFileSync('campaigns/${CID}/state.json','{}')"`,
    ];
    for (const c of deniedCmds) assert.ok(denied(run('guard-state', shell(c))), c);
    assert.ok(denied(run('guard-state', shell(`Set-Content -Path campaigns\\${CID}\\state.json -Value '{}'`, 'PowerShell'))));
    const allowed = [
      `node engine/cli.mjs ingest --campaign ${CID} --json`,
      `node "${REPO}/engine/cli.mjs" apply --expect-rev 37 --campaign ${CID} --json`,
      `node tools/harness/run-marker.mjs start --campaign ${CID}`,
      `cat campaigns/${CID}/state.json`,
      `grep -r "move" campaigns/${CID}/narrative`,
      'ls campaigns',
    ];
    for (const c of allowed) assert.ok(silent(run('guard-state', shell(c))), c);
  });
});

describe('proposal-check', () => {
  it('stays silent for files outside agents/proposals', () => {
    assert.ok(silent(run('proposal-check', post(join(REPO, 'js', 'app.js')))));
    assert.ok(silent(run('proposal-check', post(join(dir, 'narrative', 'x.json')))));
    assert.ok(!existsSync(join(dir, 'status.json')));
  });

  it('accepts a valid proposal and records its items as pending', () => {
    const file = putProposal(narrative());
    const r = run('proposal-check', post(file, { agent_type: 'rc-chronicler', agent_id: 'c1' }));
    assert.equal(r.code, 0, r.stderr);
    const step = status().steps.find((s) => s.id === 'chronicler-all');
    assert.ok(step, 'status step chronicler exists');
    assert.deepEqual(step.proposals.map((p) => [p.proposalId, p.kind, p.verdict]), [[`chronicler.T${TURN}`, 'narrative', 'pending']]);
  });

  it('accepts the same proposal under a backslash path', () => {
    const file = putProposal(narrative());
    const r = run('proposal-check', post(file.replace(/\//g, '\\')));
    assert.equal(r.code, 0, r.stderr);
  });

  it('rejects a value field in a text item with exit 2 and a reason', () => {
    const file = putProposal(narrative({ amount: 3 }));
    const r = run('proposal-check', post(file));
    assert.equal(r.code, 2);
    assert.match(r.stderr, /narrative_values/);
    assert.match(r.stderr, /chronicler\.T12/);
  });

  it('rejects a file that is not JSON', () => {
    const r = run('proposal-check', post(putProposal('{ "format": ', `chronicler.T${TURN}`)));
    assert.equal(r.code, 2);
    assert.match(r.stderr, /not valid JSON/);
  });

  it('rejects a proposal without a task', () => {
    const p = { ...narrative(), proposalId: `chronicler.T${TURN + 5}`, turn: TURN + 5 };
    const r = run('proposal-check', post(putProposal(p)));
    assert.equal(r.code, 2);
    assert.match(r.stderr, /no task/);
  });

  it('checks event cards against the world package vocabulary', () => {
    const cards = JSON.parse(readFileSync(join(REPO, 'welten', 'hochland', 'content', 'ereignisse.json'), 'utf8'));
    const card = { ...(cards.items ?? cards).find((c) => c.id === 'fruehfrost'), id: 'harness-frost' };
    const world = (data) => ({ format: 'realmcraft-proposal', version: 1, proposalId: `world.T${TURN}`, agent: 'world', campaign: CID, turn: TURN, basedOnRev: 37, people: null, items: [{ type: 'event', data }] });
    let r = run('proposal-check', post(putProposal(world(card))));
    assert.equal(r.code, 0, r.stderr);
    const bad = { ...card, effects: [{ op: 'resource.delta', res: 'goldstaub', amount: -2 }, ...card.effects.slice(1)] };
    r = run('proposal-check', post(putProposal(world(bad))));
    assert.equal(r.code, 2);
    assert.match(r.stderr, /unknown_resource/);
  });

  it('rejects a stale envelope', () => {
    const r = run('proposal-check', post(putProposal({ ...narrative(), campaign: 'andere-kampagne' })));
    assert.equal(r.code, 2);
    assert.match(r.stderr, /stale/);
  });
});

describe('subagent-status', () => {
  before(() => {
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ format: 'realmcraft-run', version: 1, campaign: CID, turn: TURN, active: true, startedAt: new Date().toISOString(), endedAt: null, agents: {} }));
    rmSync(join(dir, 'agents', 'proposals', `chronicler.T${TURN}.json`), { force: true });
  });

  it('ignores subagents that are not RealmCraft roles', () => {
    const before = existsSync(join(dir, 'status.json')) ? readFileSync(join(dir, 'status.json'), 'utf8') : null;
    assert.ok(silent(run('subagent-status', { hook_event_name: 'SubagentStart', agent_type: 'Explore', agent_id: 'x1', cwd: root })));
    const now = existsSync(join(dir, 'status.json')) ? readFileSync(join(dir, 'status.json'), 'utf8') : null;
    assert.equal(now, before);
  });

  it('marks the named step running on start and done when the proposal exists', () => {
    let r = run('subagent-status', { hook_event_name: 'SubagentStart', agent_type: 'rc-rival', agent_id: 'r1', task_description: `rc-rival rival.bergnomaden.T${TURN}`, cwd: root });
    assert.ok(silent(r), r.stderr);
    assert.equal(status().steps.find((s) => s.id === 'rival-bergnomaden').state, 'running');
    assert.equal(JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')).agents.r1, 'rival-bergnomaden');

    writeFileSync(join(dir, 'agents', 'proposals', `rival.bergnomaden.T${TURN}.json`), '{}');
    r = run('subagent-status', { hook_event_name: 'SubagentStop', agent_type: 'rc-rival', agent_id: 'r1', last_assistant_message: 'fertig', stop_hook_active: false, cwd: root });
    assert.ok(silent(r), r.stderr);
    const step = status().steps.find((s) => s.id === 'rival-bergnomaden');
    assert.equal(step.state, 'done');
    assert.ok(step.endedAt);
  });

  it('marks a step failed when the agent stops without a proposal', () => {
    run('subagent-status', { hook_event_name: 'SubagentStart', agent_type: 'rc-chronicler', agent_id: 'c2', cwd: root });
    const r = run('subagent-status', { hook_event_name: 'SubagentStop', agent_type: 'rc-chronicler', agent_id: 'c2', last_assistant_message: '', cwd: root });
    assert.ok(silent(r), r.stderr);
    const step = status().steps.find((s) => s.id === 'chronicler-all');
    assert.equal(step.state, 'failed');
    assert.equal(step.summary, 'kein Vorschlag geschrieben');
  });
});

describe('subagent definitions', () => {
  const MODELS = {
    'rc-world': 'sonnet', 'rc-research': 'sonnet', 'rc-council': 'sonnet', 'rc-rival': 'sonnet', 'rc-chronicler': 'sonnet',
    'rc-judge-coherence': 'opus', 'rc-judge-balance': 'opus', 'rc-judge-narrative': 'opus',
  };
  const frontmatter = (name) => {
    const text = readFileSync(join(REPO, '.claude', 'agents', `${name}.md`), 'utf8');
    const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)[1];
    return Object.fromEntries(block.split(/\r?\n/).map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  };

  it('one file per role with the D14 model, an isolating description and no delegation tool', () => {
    for (const [name, model] of Object.entries(MODELS)) {
      const fm = frontmatter(name);
      assert.equal(fm.name, name);
      assert.equal(fm.model, model, name);
      assert.match(fm.description, /^"RealmCraft-Spielzug: .*\/zug.*"$/, name);
      const tools = fm.tools.split(',').map((t) => t.trim());
      assert.ok(tools.includes('Write') && tools.includes('Read'), name);
      assert.ok(!tools.includes('Agent') && !tools.includes('Edit'), name);
    }
  });
});

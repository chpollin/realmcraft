// Hooks of the game harness (tools/hooks/), fed hook JSON on stdin as Claude
// Code does. The campaign is the mid-game fixture in a temp root, so the
// repository's own campaigns/ stays untouched.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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

const task = (agent, people = null, read = ['state.json']) => {
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
    read,
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
  const views = (pid) => [`view/${pid}.json`, `view/${pid}/events/T00${TURN - 1}.json`, 'library.json'];
  writeFileSync(join(dir, `agents/tasks/T00${TURN}/rival-bergnomaden.json`), JSON.stringify(task('rival', 'bergnomaden', views('bergnomaden'))));
  writeFileSync(join(dir, `agents/tasks/T00${TURN}/rival-talbund.json`), JSON.stringify(task('rival', 'talbund', views('talbund'))));
  writeFileSync(join(dir, `agents/tasks/T00${TURN}/judge-balance-all.json`), JSON.stringify(task('judge-balance', null, ['state.json', `log/T00${TURN - 1}.json`, 'library.json'])));
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

// A subagent's launch record as Claude Code keeps it next to the session
// transcript (tools/harness/lib.mjs subagentLaunch).
function launchRecord(agentId, agentType, prompt, description = `${agentType} launch`) {
  const session = join(root, 'transcripts', 'session-1');
  mkdirSync(join(session, 'subagents'), { recursive: true });
  writeFileSync(join(session, 'subagents', `agent-${agentId}.meta.json`), JSON.stringify({ agentType, description }));
  writeFileSync(join(session, 'subagents', `agent-${agentId}.jsonl`), `${JSON.stringify({ type: 'user', agentId, message: { role: 'user', content: prompt } })}\n`);
  return { agent_id: agentId, transcript_path: `${session}.jsonl` };
}
const zugPrompt = (stepId) => `Kampagnenordner: ${dir}. Auftrag: ${dir}/agents/tasks/T00${TURN}/${stepId}.json. Schreibe deinen Vorschlag nach ${dir}/agents/proposals/<id>.json.`;

// Windows short (8.3) name of an existing path, or null where the volume keeps none.
function shortPath(p) {
  if (process.platform !== 'win32') return null;
  const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `"for %I in ("${p}") do @echo %~sI"`], { encoding: 'utf8', windowsVerbatimArguments: true });
  const s = r.stdout.trim();
  return s && s.toLowerCase() !== p.toLowerCase() && s.includes('~') ? s : null;
}

describe('guard-state against the review cases', () => {
  let rival;
  let rivalOther;
  before(() => {
    rival = launchRecord('rv1', 'rc-rival', zugPrompt('rival-bergnomaden'), `rc-rival rival.bergnomaden.T${TURN}`);
    rivalOther = launchRecord('rv2', 'rc-rival', zugPrompt('rival-talbund'), `rc-rival rival.talbund.T${TURN}`);
  });
  const C = () => join(root, 'campaigns');
  const own = () => join(dir, 'agents', 'proposals', `rival.bergnomaden.T${TURN}.json`);
  const sh = (command, tool = 'Bash', extra = {}) => ({ ...shell(command, tool), ...extra });

  it('denies main-session writes under every spelling of a campaign path', () => {
    const forms = [
      join(dir, 'state.json'),
      join(C(), CID.toUpperCase(), 'state.json'),
      `${C()}/${CID}./state.json`,
      `${C()}/${CID} /state.json`,
      `${root}/js/../campaigns/${CID}/state.json`,
      `campaigns/${CID}/log/journal.json`,
      `${dir}/agents/proposals/../../drafts/bergnomaden.json`,
      `${C()}/index.json`,
    ];
    if (process.platform === 'win32') {
      const win = join(dir, 'state.json').replace(/\//g, '\\');
      forms.push(`\\\\?\\${win}`, `\\\\localhost\\${win[0]}$${win.slice(2)}`, `\\\\127.0.0.1\\${win[0]}$${win.slice(2)}`);
    }
    for (const f of forms) assert.ok(denied(run('guard-state', write(f))), f);
  });

  it('resolves 8.3 short names before matching (Windows volumes that keep them)', (t) => {
    const short = shortPath(join(dir, 'state.json'));
    if (!short) return t.skip('no 8.3 names on this volume');
    assert.ok(denied(run('guard-state', write(short))), short);
  });

  it('holds a bound rival to the proposal of its own people', () => {
    assert.ok(silent(run('guard-state', write(own(), { ...rival, agent_type: 'rc-rival' }))), 'own proposal');
    assert.ok(silent(run('guard-state', write(own(), rival))), 'own proposal, agent_type taken from the launch record');
    assert.ok(silent(run('guard-state', { ...write(own(), rival), tool_name: 'Edit', tool_input: { file_path: own(), old_string: 'a', new_string: 'b' } })));
    const other = join(dir, 'agents', 'proposals', `rival.talbund.T${TURN}.json`);
    assert.ok(denied(run('guard-state', write(other, { ...rival, agent_type: 'rc-rival' }))), 'H8: the proposal of another people');
    assert.ok(silent(run('guard-state', write(other, { ...rivalOther, agent_type: 'rc-rival' }))), 'that people\'s own rival');
  });

  it('denies a rival every other target', () => {
    const rc = { ...rival, agent_type: 'rc-rival' };
    const targets = [
      join(dir, 'agents', 'proposals', `world.T${TURN}.json`),
      join(C(), 'zz-other', 'agents', 'proposals', `rival.x.T${TURN}.json`),
      join(tmpdir(), 'campaigns', 'aa', 'agents', 'proposals', `rival.T${TURN}.json`),
      join(root, 'engine', 'cli.mjs'),
      join(root, 'tools', 'hooks', 'guard-state.mjs'),
      join(root, '.claude', 'settings.json'),
      join(dir, 'state.json'),
    ];
    for (const f of targets) assert.ok(denied(run('guard-state', write(f, rc))), f);
    assert.ok(denied(run('guard-state', write(join(root, 'engine', 'cli.mjs'), { agent_type: 'myplugin:rc-rival', agent_id: 'p1' }))), 'plugin prefix');
    assert.ok(denied(run('guard-state', { hook_event_name: 'PreToolUse', tool_name: 'NotebookEdit', tool_input: { notebook_path: join(root, 'x.ipynb') }, cwd: root, ...rc })));
    assert.ok(denied(run('guard-state', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { path: join(dir, 'state.json') }, cwd: root, ...rc })));
    assert.ok(denied(run('guard-state', { hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: root, ...rc })), 'no tool_input');
  });

  it('without a launch record, a rival writes only proposals some task of its role names', () => {
    const rc = { agent_type: 'rc-rival', agent_id: 'u1' };
    assert.ok(silent(run('guard-state', write(own(), rc))));
    assert.ok(denied(run('guard-state', write(join(dir, 'agents', 'proposals', `rival.nobody.T${TURN}.json`), rc))));
    assert.ok(denied(run('guard-state', write(join(dir, 'agents', 'proposals', `rival.bergnomaden.T${TURN + 1}.json`), rc))));
  });

  it('recognises a RealmCraft agent without agent_type from its launch record or the run marker, else fails open', () => {
    const engine = join(root, 'engine', 'cli.mjs');
    assert.ok(silent(run('guard-state', write(engine, { agent_id: 'unknown' }))), 'documented fail-open');
    assert.ok(denied(run('guard-state', write(engine, rival))), 'launch record names rc-rival');
    const runPath = join(dir, 'run.json');
    const had = existsSync(runPath) ? readFileSync(runPath, 'utf8') : null;
    writeFileSync(runPath, JSON.stringify({ format: 'realmcraft-run', version: 1, campaign: CID, turn: TURN, active: true, agents: { m1: 'judge-balance-all' }, bound: {} }));
    try {
      assert.ok(denied(run('guard-state', write(engine, { agent_id: 'm1' }))), 'run marker names judge-balance');
    } finally {
      if (had === null) rmSync(runPath, { force: true });
      else writeFileSync(runPath, had);
    }
    assert.ok(silent(run('guard-state', write(engine, launchRecord('ex1', 'Explore', 'search')))), 'other subagent types keep their rights');
  });

  it('denies every shell call of a RealmCraft agent', () => {
    const rc = { ...rival, agent_type: 'rc-rival' };
    for (const c of [
      `node engine/cli.mjs roll p1 1 --campaign ${CID}`,
      `node engine/cli.mjs ingest campaigns/${CID}/state.json --campaign ${CID}`,
      `node engine/cli.mjs preview --draft x.json --campaign ${CID}`,
      "echo 'process.exit(0)' > tools/hooks/guard-state.mjs",
      'ls',
    ]) assert.ok(denied(run('guard-state', sh(c, 'Bash', rc))), c);
    assert.ok(denied(run('guard-state', sh('Get-ChildItem', 'PowerShell', rc))));
  });

  it('denies main-session shell writes the old segment filter let through', () => {
    const p = `campaigns/${CID}/state.json`;
    const bash = [
      `cp x.json ${p}`,
      `cd campaigns && echo {} > ${CID}/state.json`,
      `p=${p}; echo {} > "$p"`,
      `echo $(cp x.json ${p})`,
      `echo a & cp x.json ${p}`,
      `node -e "require('fs').writeFileSync(['campaigns','${CID}','state.json'].join('/'),'{}')"`,
      `node --eval="require('fs').writeFileSync('${p}','{}')//engine/cli.mjs"`,
      `curl -s -o ${p} http://x`,
      `tar -xf a.tar -C campaigns/${CID}`,
      `bash -c "cp x.json ${p}"`,
      `git checkout -- campaigns/${CID}`,
    ];
    for (const c of bash) assert.ok(denied(run('guard-state', sh(c))), c);
    const ps = [
      `$p='campaigns\\${CID}\\state.json'; Set-Content $p '{}'`,
      `[IO.File]::WriteAllText('campaigns\\${CID}\\state.json','{}')`,
      `Set-Content campaigns\\${CID}\\state.json '{}'`,
      `robocopy x campaigns\\${CID} state.json`,
      'powershell -NoProfile -enc ZQBjAGgAbwAgAGgAaQA=',
    ];
    for (const c of ps) assert.ok(denied(run('guard-state', sh(c, 'PowerShell'))), c);
  });

  it('keeps the main session\'s kernel calls and reads allowed', () => {
    for (const c of [
      `node engine/cli.mjs ingest ${dir}/agents/proposals/rival.bergnomaden.T${TURN}.json --campaign ${CID} --json`,
      `node engine/cli.mjs status --campaign ${CID} --json 2>&1 | head -5`,
      `cat campaigns/${CID}/state.json > ${join(tmpdir(), 'copy.json')}`,
      `ls campaigns/${CID}/agents/proposals`,
      'powershell -ExecutionPolicy Bypass -File x.ps1',
      `cp examples/campaigns/${CID}/state.json examples/campaigns/${CID}/b.json`,
    ]) assert.ok(silent(run('guard-state', sh(c))), c);
  });

  it('acts only inside the project root', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'rc-elsewhere-'));
    try {
      assert.ok(silent(run('guard-state', write(join(elsewhere, 'campaigns', CID, 'state.json')))));
    } finally {
      rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('stays silent for malformed input and main-session reads', () => {
    assert.ok(silent(run('guard-state', '{"tool_name":"Write", oops')));
    assert.ok(silent(run('guard-state', '')));
    assert.ok(silent(run('guard-state', { hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: join(dir, 'state.json') }, cwd: root })));
  });
});

describe('guard-state read isolation of RealmCraft agents', () => {
  const read = (file_path, who) => ({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path }, cwd: root, ...who });
  const glob = (path, pattern, who) => ({ hook_event_name: 'PreToolUse', tool_name: 'Glob', tool_input: { path, pattern }, cwd: root, ...who });
  const grep = (path, who) => ({ hook_event_name: 'PreToolUse', tool_name: 'Grep', tool_input: { path, pattern: 'x' }, cwd: root, ...who });
  let rival;
  let judge;
  before(() => {
    rival = { ...launchRecord('rr1', 'rc-rival', zugPrompt('rival-bergnomaden')), agent_type: 'rc-rival' };
    judge = { ...launchRecord('jb1', 'rc-judge-balance', zugPrompt('judge-balance-all')), agent_type: 'rc-judge-balance' };
  });

  it('a rival reads its task, its view, the library, welten/ and engine/schemas/', () => {
    for (const f of [
      join(dir, 'agents', 'tasks', `T00${TURN}`, 'rival-bergnomaden.json'),
      join(dir, 'view', 'bergnomaden.json'),
      join(dir, 'view', 'bergnomaden', 'events', `T00${TURN - 1}.json`),
      join(dir, 'library.json'),
      join(dir, 'agents', 'proposals', `rival.bergnomaden.T${TURN}.json`),
      join(root, 'welten', 'hochland', 'welt.json'),
      join(root, 'engine', 'schemas', 'draft.js'),
    ]) assert.ok(silent(run('guard-state', read(f, rival))), f);
  });

  it('a rival does not read the full state, drafts, the journal, other views or other tasks', () => {
    for (const f of [
      join(dir, 'state.json'),
      join(dir, 'drafts', 'talbund.json'),
      join(dir, 'log', 'journal.json'),
      join(dir, 'log', `T00${TURN - 1}.json`),
      join(dir, 'view', 'talbund.json'),
      join(dir, 'view', 'TALBUND.json'),
      join(dir, 'agents', 'tasks', `T00${TURN}`, 'rival-talbund.json'),
      join(root, 'engine', 'cli.mjs'),
      join(REPO, 'welten', 'hochland', 'welt.json'),
    ]) assert.ok(denied(run('guard-state', read(f, rival))), f);
    assert.ok(denied(run('guard-state', glob(root, `campaigns/${CID}/**/*.json`, rival))));
    assert.ok(denied(run('guard-state', glob(join(root, 'welten'), '../campaigns/**', rival))));
  });

  it('a judge reads its task files and its folders, but not the journal or drafts', () => {
    for (const f of [join(dir, 'state.json'), join(dir, 'log', 'T0005.json'), join(dir, 'view', 'talbund.json'), join(dir, 'agents', 'verdicts', 'x.json')]) {
      assert.ok(silent(run('guard-state', read(f, judge))), f);
    }
    for (const f of [join(dir, 'log', 'journal.json'), join(dir, 'drafts', 'talbund.json'), join(dir, 'narrative', 'chronik', 'T0011.md')]) {
      assert.ok(denied(run('guard-state', read(f, judge))), f);
    }
    assert.ok(silent(run('guard-state', glob(join(dir, 'log'), '*.json', judge))));
    assert.ok(silent(run('guard-state', grep(join(root, 'welten', 'hochland'), judge))));
    assert.ok(denied(run('guard-state', grep(join(dir, 'narrative'), judge))));
    assert.ok(denied(run('guard-state', { ...glob(undefined, '**/state.json', judge), tool_input: { pattern: '**/state.json' } })), 'no path searches the whole root');
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
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /passed the pre-check/);
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
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /item 0 event: effect -?\d+, price -?\d+, net -?\d+, band \d+/, 'budget per item replaces the shell call to validate');
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
    // Phase B agents run while the kernel is in phase agents.
    setPhase('agents');
  });
  const setPhase = (phase) => {
    const s = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
    writeFileSync(join(dir, 'state.json'), JSON.stringify({ ...s, phase }));
  };
  const stepOf = (id) => status().steps.find((s) => s.id === id);
  const proposalFile = (pid) => join(dir, 'agents', 'proposals', `${pid}.json`);

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

  it('a proposal written after a failed stop turns the step done', () => {
    const r = run('proposal-check', post(putProposal(narrative()), { agent_type: 'rc-chronicler', agent_id: 'c2' }));
    assert.equal(r.code, 0, r.stderr);
    assert.equal(stepOf('chronicler-all').state, 'done');
  });

  it('parallel starts without a task description take distinct tasks, a launch record binds exactly', async () => {
    rmSync(proposalFile(`rival.talbund.T${TURN}`), { force: true });
    rmSync(proposalFile(`rival.bergnomaden.T${TURN}`), { force: true });
    const hookAsync = (payload) => new Promise((done) => {
      const p = spawn(process.execPath, [HOOK('subagent-status')], { env: { ...process.env, REALMCRAFT_ROOT: root, CLAUDE_PROJECT_DIR: root } });
      p.stdout.resume();
      p.stderr.resume();
      p.on('exit', done);
      p.stdin.end(JSON.stringify(payload));
    });
    writeFileSync(join(dir, 'run.json'), JSON.stringify({ format: 'realmcraft-run', version: 1, campaign: CID, turn: TURN, active: true, startedAt: new Date().toISOString(), endedAt: null, agents: {}, bound: {} }));
    await Promise.all(['p1', 'p2'].map((agent_id) => hookAsync({ hook_event_name: 'SubagentStart', agent_type: 'rc-rival', agent_id, cwd: root })));
    let marker = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
    assert.deepEqual(Object.values(marker.agents).sort(), ['rival-bergnomaden', 'rival-talbund']);
    assert.deepEqual(marker.bound, {}, 'a guess binds nothing');

    const launched = launchRecord('p3', 'rc-rival', zugPrompt('rival-talbund'), `rc-rival rival.talbund.T${TURN}`);
    run('subagent-status', { hook_event_name: 'SubagentStart', agent_type: 'rc-rival', cwd: root, ...launched });
    marker = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
    assert.equal(marker.bound.p3, `rival.talbund.T${TURN}`);
    assert.equal(marker.agents.p3, 'rival-talbund');
  });

  it('a guessed stop without a proposal leaves the step; after open the reconcile fails it', () => {
    // p1 holds a guessed step; its stop names nothing.
    run('subagent-status', { hook_event_name: 'SubagentStop', agent_type: 'rc-rival', agent_id: 'p1', last_assistant_message: '', cwd: root });
    const guessed = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8')).agents.p1;
    assert.equal(stepOf(guessed).state, 'running');
    setPhase('planning');
    try {
      const r = spawnSync(process.execPath, [join(REPO, 'tools', 'harness', 'status-note.mjs'), 'sync', '--campaign', CID, '--root', root], { encoding: 'utf8', env: { ...process.env, REALMCRAFT_ROOT: root } });
      assert.equal(r.status, 0, r.stderr);
      assert.equal(status().phase, 'planning');
      assert.equal(stepOf(guessed).state, 'failed');
      assert.equal(stepOf('chronicler-all').state, 'done', 'a delivered proposal stays done');
    } finally {
      setPhase('agents');
    }
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
      assert.ok(!tools.includes('Bash') && !tools.includes('PowerShell'), `${name} has no shell (K1)`);
    }
  });
});

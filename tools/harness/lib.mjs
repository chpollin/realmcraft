// Shared helpers of the game harness: the hooks under tools/hooks/ and the
// small commands /zug calls. Node only. Everything the hooks need on the hot
// path (stdin, path matching) avoids engine imports, so an unrelated tool call
// costs one node start and a regex; engine modules load lazily where needed.
//
// Campaign layout and file ownership: knowledge/agents-harness.md, engine/harness/io.js.

import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync } from 'node:fs';
import { dirname, basename, posix, resolve } from 'node:path';

// Subagent file names (.claude/agents/rc-<id>.md) map one to one onto the
// agent ids of engine/schemas/common.js AGENTS.
export const ROLE_AGENTS = Object.freeze({
  'rc-world': 'world',
  'rc-research': 'research',
  'rc-council': 'council',
  'rc-rival': 'rival',
  'rc-chronicler': 'chronicler',
  'rc-judge-coherence': 'judge-coherence',
  'rc-judge-balance': 'judge-balance',
  'rc-judge-narrative': 'judge-narrative',
});

/** Agent id of a subagent type, or null for every non-RealmCraft subagent. A plugin namespace prefix ("x:rc-world") is ignored. */
export function agentOfType(type) {
  if (typeof type !== 'string') return null;
  const bare = type.includes(':') ? type.slice(type.lastIndexOf(':') + 1) : type;
  return ROLE_AGENTS[bare] ?? null;
}

/** Subagent type of the hook input; field names differ between hook events and versions. */
export const subagentTypeOf = (input) => input?.agent_type ?? input?.subagent_type ?? input?.agent_name ?? null;

const AGENT_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const LAUNCH_HEAD_BYTES = 256 * 1024;

/**
 * Launch record of the subagent that made a tool call, as Claude Code keeps it
 * next to the session transcript: <session>/subagents/agent-<agent_id>.meta.json
 * (agentType, description) and the first line of agent-<agent_id>.jsonl (the
 * launch prompt). Subagents of the harness cannot write there, so the record
 * is trustworthy where the hook input lacks agent_type. The layout is not a
 * documented interface; null whenever it is not found, and callers fall back.
 */
export function subagentLaunch(input) {
  const id = input?.agent_id;
  const tp = input?.transcript_path;
  if (typeof id !== 'string' || !AGENT_ID_RE.test(id) || typeof tp !== 'string' || !tp.endsWith('.jsonl')) return null;
  const t = tp.replace(/\\/g, '/');
  // transcript_path names the session transcript; tolerate the subagent's own.
  const dir = /\/subagents$/.test(dirname(t)) && basename(t).startsWith('agent-') ? dirname(t) : `${t.slice(0, -'.jsonl'.length)}/subagents`;
  const base = `${dir}/agent-${id}`;
  const meta = readJsonFile(`${base}.meta.json`, null);
  let prompt = null;
  try {
    const fd = openSync(`${base}.jsonl`, 'r');
    try {
      const buf = Buffer.alloc(LAUNCH_HEAD_BYTES);
      const n = readSync(fd, buf, 0, buf.length, 0);
      const first = buf.subarray(0, n).toString('utf8').split('\n')[0];
      const content = JSON.parse(first)?.message?.content;
      prompt = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c) => c?.text ?? '').join('\n') : null;
    } finally {
      closeSync(fd);
    }
  } catch {
    // no transcript, or a first line longer than the head: no prompt
  }
  if (!meta && prompt === null) return null;
  return { agentType: typeof meta?.agentType === 'string' ? meta.agentType : null, description: typeof meta?.description === 'string' ? meta.description : null, prompt };
}

/** Agent id ("judge-balance") of a status step id ("judge-balance-all", "rival-talbund"), or null. */
export function agentOfStepId(stepId) {
  const s = String(stepId ?? '');
  const ids = Object.values(ROLE_AGENTS).filter((a) => s === a || s.startsWith(`${a}-`));
  return ids.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Whole stdin as parsed JSON, null when empty or unparseable. Hooks treat null as "not ours". */
export async function readHookInput(stream = process.stdin) {
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Forward-slash absolute form of a tool path. Accepts Windows paths
 * (C:\x, C:/x), Git Bash paths (/c/x) and paths relative to the hook's cwd.
 */
export function normPath(p, cwd = process.cwd()) {
  let s = String(p).replace(/\\/g, '/');
  const bash = /^\/([a-zA-Z])(\/|$)/.exec(s);
  if (bash && process.platform === 'win32') s = `${bash[1]}:${s.slice(2)}`;
  if (!/^([a-zA-Z]:)?\//.test(s)) s = resolve(cwd, s).replace(/\\/g, '/');
  s = posix.normalize(s);
  return /^[a-z]:\//.test(s) ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Windows and macOS file systems ignore case, so path comparisons there fold it. */
export const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';
export const foldCase = (s) => (CASE_INSENSITIVE ? s.toLowerCase() : s);

/**
 * The path the file system will actually open, for the write and read guard.
 * Beyond normPath it strips the Win32 device prefixes (\\?\, \\.\), maps an
 * admin share of this machine (\\localhost\C$\x) onto its drive, drops the
 * trailing dots and spaces Win32 removes from every name, and resolves the
 * longest existing prefix with realpath, which expands 8.3 short names
 * (CAMPAI~1), the true case of each name, junctions and symlinks.
 */
export function canonPath(p, cwd = process.cwd()) {
  let s = String(p).replace(/\\/g, '/');
  if (process.platform === 'win32') {
    s = s.replace(/^\/\/[?.]\/UNC\//i, '//').replace(/^\/\/[?.]\/(?=[a-zA-Z]:)/, '');
    s = s.replace(/^\/\/(?:localhost|127\.0\.0\.1|\[?::1\]?)\/([a-zA-Z])\$(?=\/|$)/i, '$1:');
  }
  s = normPath(s, cwd);
  if (process.platform === 'win32') s = s.split('/').map((seg, i) => (i === 0 || seg === '' ? seg : seg.replace(/[. ]+$/, '') || seg)).join('/');
  const parts = s.split('/');
  for (let i = parts.length; i > 0; i--) {
    const head = parts.slice(0, i).join('/') || '/';
    let real;
    try {
      real = realpathSync.native(head);
    } catch {
      continue;
    }
    real = real.replace(/\\/g, '/').replace(/^\/\/\?\//, '');
    if (/^[a-z]:/.test(real)) real = real[0].toUpperCase() + real.slice(1);
    const rest = parts.slice(i);
    return rest.length ? `${real.replace(/\/$/, '')}/${rest.join('/')}` : real;
  }
  return s;
}

/** Path of `p` relative to `root` ("" for root itself), or null outside it. Both must be canonical. */
export function relInside(p, root) {
  const a = foldCase(p);
  const r = foldCase(root).replace(/\/$/, '');
  if (a === r) return '';
  return a.startsWith(`${r}/`) ? p.slice(r.length + 1) : null;
}

// "<root>/campaigns/<cid>/<rel>". examples/campaigns/ holds committed test
// campaigns that developer sessions edit by hand, so it is not game territory.
const CAMPAIGN_RE = /^(.*?)\/campaigns\/([^/]+)(?:\/(.*))?$/i;
export const CID_RE = /^[a-z][a-z0-9-]{1,40}$/;

/**
 * Location of a path inside a live campaign folder, or null. The campaign
 * list campaigns/index.json comes back with cid null and rel "index.json".
 */
export function campaignPath(filePath, cwd) {
  if (typeof filePath !== 'string' || !filePath) return null;
  const p = normPath(filePath, cwd);
  const m = CAMPAIGN_RE.exec(p);
  if (!m || /\/examples$/i.test(m[1])) return null;
  const root = m[1];
  if (m[3] === undefined) {
    if (m[2] === 'index.json') return { root, cid: null, rel: 'index.json', dir: `${root}/campaigns` };
    if (!CID_RE.test(m[2])) return null;
    return { root, cid: m[2], rel: '', dir: `${root}/campaigns/${m[2]}` };
  }
  if (!CID_RE.test(m[2])) return null;
  return { root, cid: m[2], rel: m[3], dir: `${root}/campaigns/${m[2]}` };
}

// engine/schemas/common.js PATTERNS.proposal, repeated here so the hot path
// needs no engine import; tests/unit/harness-hooks.test.js checks they agree.
export const PROPOSAL_ID_RE = /^[a-z][a-z0-9-]{1,24}(\.[a-z][a-z0-9-]{1,40})?\.T(0|[1-9][0-9]*)$/;

/** proposalId of a campaign-relative path agents/proposals/<proposalId>.json, else null. */
export function proposalIdOfRel(rel) {
  const m = /^agents\/proposals\/([^/]+)\.json$/.exec(rel ?? '');
  return m && PROPOSAL_ID_RE.test(m[1]) ? m[1] : null;
}

/** Agent id named by a proposal id ("judge-balance.T6" -> judge-balance). */
export const agentOfProposalId = (pid) => String(pid).split('.')[0];

/** Status step id of a task or proposal, as the CLI's ingest records it: "<agent>-<people>" or "<agent>-all". */
export const stepIdOf = ({ agent, people }) => `${agent}-${people ?? 'all'}`;

/** "T0006", as engine/harness/io.js turnStem. */
export const turnStem = (turn) => `T${String(turn).padStart(4, '0')}`;

export function readJsonFile(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

/** Every task document under agents/tasks/ (all turns), unreadable files skipped. */
export function listTasks(dir) {
  const base = `${dir}/agents/tasks`;
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.json')) {
        const t = readJsonFile(p, null);
        if (t?.format === 'realmcraft-task') out.push({ ...t, file: p });
      }
    }
  };
  walk(base);
  return out;
}

/** The task whose respondAs names this proposal id, newest turn first. */
export function findTask(dir, proposalId) {
  return listTasks(dir).filter((t) => t.respondAs?.proposalId === proposalId).sort((a, b) => b.turn - a.turn)[0] ?? null;
}

/** Folder names of live campaigns under <root>/campaigns. */
export function campaignIds(root) {
  try {
    return readdirSync(`${root}/campaigns`, { withFileTypes: true }).filter((e) => e.isDirectory() && CID_RE.test(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
}

/** Proposal id named in a launch text for this agent ("rc-rival rival.talbund.T6"), or null. */
export function proposalIdIn(text, agent) {
  const esc = agent.replace(/[-.]/g, '\\$&');
  const m = String(text ?? '').match(new RegExp(`(?<![a-z0-9.-])${esc}(?:\\.[a-z][a-z0-9-]{1,40})?\\.T(?:0|[1-9][0-9]*)(?![a-z0-9-])`));
  return m ? m[0] : null;
}

const TASK_REF_RE = /agents[\\/]tasks[\\/](T\d{4,})[\\/]([a-z][a-z0-9-]*)\.json/g;
const CAMPAIGN_REF_RE = /(?<!examples[\\/])campaigns[\\/]([a-z][a-z0-9-]{1,40})(?=[\\/])/g;

/**
 * The one task a running RealmCraft subagent works on, as { cid, dir, task,
 * via }, or null when it cannot be told apart from its siblings of the same
 * role. Sources in order of trust: the task path in the launch prompt, the
 * proposal id in the launch description (both written by Claude Code, see
 * subagentLaunch), and the exact binding SubagentStart recorded in run.json.
 */
export function boundTask(input, root, agent, launch = subagentLaunch(input)) {
  const cids = campaignIds(root);
  const promptCids = launch?.prompt ? [...new Set([...launch.prompt.matchAll(CAMPAIGN_REF_RE)].map((m) => m[1]))].filter((c) => cids.includes(c)) : [];
  const scope = promptCids.length ? promptCids : cids;
  const pick = (found, via) => (found.length === 1 ? { ...found[0], via } : null);

  if (launch?.prompt) {
    const refs = [...new Set([...launch.prompt.matchAll(TASK_REF_RE)].map((m) => `${m[1]}/${m[2]}`))];
    if (refs.length === 1) {
      const found = scope
        .map((cid) => ({ cid, dir: `${root}/campaigns/${cid}`, task: readJsonFile(`${root}/campaigns/${cid}/agents/tasks/${refs[0]}.json`, null) }))
        .filter((f) => f.task?.format === 'realmcraft-task' && f.task.agent === agent);
      const hit = pick(found, 'prompt');
      if (hit) return hit;
    }
  }
  const pid = proposalIdIn(launch?.description, agent);
  if (pid) {
    const found = scope.map((cid) => ({ cid, dir: `${root}/campaigns/${cid}`, task: findTask(`${root}/campaigns/${cid}`, pid) })).filter((f) => f.task?.agent === agent);
    const hit = pick(found, 'description');
    if (hit) return hit;
  }
  if (typeof input?.agent_id === 'string') {
    const found = [];
    for (const cid of cids) {
      const bound = readJsonFile(`${root}/campaigns/${cid}/run.json`, null)?.bound?.[input.agent_id];
      if (typeof bound !== 'string') continue;
      const task = findTask(`${root}/campaigns/${cid}`, bound);
      if (task?.agent === agent) found.push({ cid, dir: `${root}/campaigns/${cid}`, task });
    }
    const hit = pick(found, 'run');
    if (hit) return hit;
  }
  return null;
}

/** Step id ("rival-talbund") that SubagentStart recorded for an agent id in any run marker, or null. */
export function recordedStep(root, agentId) {
  if (typeof agentId !== 'string') return null;
  for (const cid of campaignIds(root)) {
    const step = readJsonFile(`${root}/campaigns/${cid}/run.json`, null)?.agents?.[agentId];
    if (typeof step === 'string') return step;
  }
  return null;
}

/**
 * RealmCraft agent id of the subagent behind a tool call, or null for the
 * main session and for other subagents. agent_type decides when present;
 * without it the launch record and then the run marker are asked. When none
 * of them knows the agent id, the call keeps main-session rights: that is
 * the documented fail-open of knowledge/agents-harness.md.
 */
export function roleOf(input, root, launch) {
  const type = subagentTypeOf(input);
  if (type) return agentOfType(type);
  if (typeof input?.agent_id !== 'string') return null;
  const l = launch === undefined ? subagentLaunch(input) : launch;
  if (l?.agentType) return agentOfType(l.agentType);
  return agentOfStepId(recordedStep(root, input.agent_id));
}

/** Where a proposal file is after ingest moved it, or null while none was written. */
export function proposalLocation(dir, proposalId) {
  for (const sub of ['proposals', 'ingested', 'rejected']) {
    if (existsSync(`${dir}/agents/${sub}/${proposalId}.json`)) return sub;
  }
  return null;
}

/**
 * Title of a proposal item in status.json. Mirrors titleOf in
 * engine/harness/ingest.js, so ingest's verdict replaces the pending entry
 * the proposal check wrote (status.js keys entries by id, kind and title).
 */
export function itemTitle(item) {
  const it = item?.type === 'correction' ? item.item : item;
  const t = it?.data?.name ?? it?.goal?.text ?? it?.text ?? it?.type ?? item?.type;
  return String(t).slice(0, 80) || String(item?.type ?? 'item');
}

/** Repository or campaign root: REALMCRAFT_ROOT, then CLAUDE_PROJECT_DIR, then cwd. */
export function rootDir(input) {
  return normPath(process.env.REALMCRAFT_ROOT || process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd());
}

/**
 * The campaign a /zug run works on. A run marker campaigns/<cid>/run.json
 * with active true wins (newest startedAt); otherwise the most recently
 * updated playing campaign of campaigns/index.json. null when neither exists.
 */
export function activeCampaign(root) {
  const base = `${root}/campaigns`;
  let names = [];
  try {
    names = readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory() && CID_RE.test(e.name)).map((e) => e.name);
  } catch {
    return null;
  }
  const runs = names
    .map((cid) => ({ cid, run: readJsonFile(`${base}/${cid}/run.json`, null) }))
    .filter((r) => r.run?.active === true)
    .sort((a, b) => String(b.run.startedAt).localeCompare(String(a.run.startedAt)));
  if (runs.length) return { cid: runs[0].cid, dir: `${base}/${runs[0].cid}`, run: runs[0].run, via: 'run' };
  const index = readJsonFile(`${base}/index.json`, null);
  const playing = (index?.campaigns ?? [])
    .filter((c) => c.status === 'playing' && names.includes(c.id))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (playing.length) return { cid: playing[0].id, dir: `${base}/${playing[0].id}`, run: null, via: 'index' };
  // A single campaign folder without index.json still counts (fresh `new`).
  const withState = names.filter((cid) => existsSync(`${base}/${cid}/state.json`));
  if (withState.length === 1) return { cid: withState[0], dir: `${base}/${withState[0]}`, run: null, via: 'folder' };
  return null;
}

/** mtime in ms or 0, for picking the newest file without parsing it. */
export function mtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

/** Parses "--key value" and "--flag" options after positional arguments. */
export function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v !== undefined && !v.startsWith('--')) {
        opt[k] = v;
        i++;
      } else opt[k] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

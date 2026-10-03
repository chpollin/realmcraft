// Shared helpers of the game harness: the hooks under tools/hooks/ and the
// small commands /zug calls. Node only. Everything the hooks need on the hot
// path (stdin, path matching) avoids engine imports, so an unrelated tool call
// costs one node start and a regex; engine modules load lazily where needed.
//
// Campaign layout and file ownership: docs/Agentenvertrag.md, engine/harness/io.js.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { posix, resolve } from 'node:path';

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

// "<root>/campaigns/<cid>/<rel>". examples/campaigns/ holds committed test
// campaigns that developer sessions edit by hand, so it is not game territory.
const CAMPAIGN_RE = /^(.*?)\/campaigns\/([^/]+)(?:\/(.*))?$/i;
const CID_RE = /^[a-z][a-z0-9-]{1,40}$/;

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

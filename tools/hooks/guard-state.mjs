// PreToolUse guard of the game harness (knowledge/agents-harness.md
// section Hooks). Only the kernel writes a campaign folder; agents write
// exactly their proposal file agents/proposals/<proposalId>.json.
//
// The guard acts only inside the project root (REALMCRAFT_ROOT, else
// CLAUDE_PROJECT_DIR, else cwd), on the live campaigns under <root>/campaigns.
//
// RealmCraft subagents (rc-*):
//   Write, Edit, MultiEdit, NotebookEdit: only the proposal file of their own
//     task; every other target is denied, the repository's code and hooks too.
//   Bash, PowerShell: always denied. A shell reaches the kernel CLI and can
//     write anywhere, and no command filter closes that.
//   Read, Glob, Grep: only their task, the files the task lists under read,
//     their own proposal, role-specific folders of the judges, welten/ and
//     engine/schemas/. Other peoples' views, drafts, the journal and the full
//     state (unless the task lists it) stay closed.
// Main session and other subagents:
//   file tools: deny any target under <root>/campaigns/ except a proposal file.
//   Bash, PowerShell: deny commands that would write under campaigns/. This is
//     a heuristic over the command text; the reliable guard is the kernel's
//     tamper check on state.json against the journal hash.
//
// Every other event exits 0 without output.

import { statSync } from 'node:fs';
import { posix } from 'node:path';
import {
  CID_RE,
  PROPOSAL_ID_RE,
  agentOfProposalId,
  boundTask,
  canonPath,
  foldCase,
  listTasks,
  readHookInput,
  relInside,
  roleOf,
  rootDir,
  stepIdOf,
  subagentLaunch,
  turnStem,
} from '../harness/lib.mjs';

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const READ_TOOLS = new Set(['Read', 'Glob', 'Grep']);

function deny(reason) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
  })}\n`);
  process.exit(0);
}

/** "campaigns/<cid>/<rest>" of a canonical path inside root, as { cid, rest }, or null. */
function campaignRel(p, root) {
  const rel = relInside(p, root);
  if (rel === null) return null;
  const parts = rel.split('/');
  if (foldCase(parts[0]) !== 'campaigns') return null;
  return { cid: parts[1] ?? '', rest: parts.slice(2).join('/') };
}

const proposalOf = (loc) => {
  const m = loc && CID_RE.test(loc.cid) ? /^agents\/proposals\/([^/]+)\.json$/.exec(loc.rest) : null;
  return m && PROPOSAL_ID_RE.test(m[1]) ? m[1] : null;
};

// --- RealmCraft subagents ---------------------------------------------------

function checkAgentFile(input, root, role, launch) {
  const ti = input.tool_input ?? {};
  const target = ti.file_path ?? ti.notebook_path ?? ti.path;
  if (typeof target !== 'string' || !target) deny(`RealmCraft agent ${role} may only write its proposal file; this call names no target.`);
  const loc = campaignRel(canonPath(target, input.cwd), root);
  const pid = proposalOf(loc);
  if (!pid) deny(`RealmCraft agent ${role} may only write its proposal file agents/proposals/<proposalId>.json named in its task, not ${target}.`);
  if (agentOfProposalId(pid) !== role) deny(`RealmCraft agent ${role} may not write proposal ${pid}; its proposal id starts with "${role}."`);
  const bound = boundTask(input, root, role, launch);
  if (bound) {
    if (bound.cid !== loc.cid || bound.task.respondAs?.proposalId !== pid) {
      deny(`RealmCraft agent ${role} works on ${bound.task.respondAs?.proposalId} in campaign ${bound.cid}; it may not write ${pid} in ${loc.cid}.`);
    }
    return;
  }
  // Without a launch record the agent cannot be told apart from siblings of
  // its role; it may still only write a proposal some task of its role names.
  const named = listTasks(`${root}/campaigns/${loc.cid}`).some((t) => t.agent === role && t.respondAs?.proposalId === pid);
  if (!named) deny(`No task of campaign ${loc.cid} names proposal ${pid} for ${role}; write exactly respondAs.path of your task.`);
}

// Folders a judge may read beyond its task, as its prompt in .claude/agents/ states.
const JUDGE_DIRS = {
  'judge-balance': ['log', 'view', 'agents/verdicts'],
  'judge-coherence': ['narrative', 'log', 'agents/ingested'],
  'judge-narrative': ['narrative/chronik', 'log', 'view'],
};
// Raw kernel files no agent reads directly, whatever a task lists.
const CLOSED = /^(?:log\/journal\.json|drafts(?:\/|$)|run\.json$|\.[^/]*\.lock$)/;
const OPEN_TREES = ['welten', 'engine/schemas'];

const under = (rel, dir) => foldCase(rel) === foldCase(dir) || foldCase(rel).startsWith(`${foldCase(dir)}/`);

/** Tasks whose read rights apply: the bound one, else every task of the role in the newest turn it has one. */
function readableTasks(input, root, role, launch, cid) {
  const bound = boundTask(input, root, role, launch);
  if (bound) return bound.cid === cid ? [bound.task] : [];
  const own = listTasks(`${root}/campaigns/${cid}`).filter((t) => t.agent === role);
  const newest = Math.max(-1, ...own.map((t) => t.turn));
  return own.filter((t) => t.turn === newest);
}

function readAllowed(input, root, role, launch, rel, isDir) {
  if (OPEN_TREES.some((d) => under(rel, d))) return true;
  const parts = rel.split('/');
  if (foldCase(parts[0]) !== 'campaigns' || !CID_RE.test(parts[1] ?? '')) return false;
  const cid = parts[1];
  const inner = parts.slice(2).join('/');
  if (!inner || CLOSED.test(foldCase(inner))) return false;
  const tasks = readableTasks(input, root, role, launch, cid);
  if (!tasks.length) return false;
  const dirs = JUDGE_DIRS[role] ?? [];
  if (dirs.some((d) => under(inner, d))) return true;
  if (isDir) return false;
  const files = tasks.flatMap((t) => [`agents/tasks/${turnStem(t.turn)}/${stepIdOf(t)}.json`, t.respondAs?.path, ...(t.read ?? [])]).filter((f) => typeof f === 'string');
  return files.some((f) => foldCase(posix.normalize(f.replace(/\\/g, '/'))) === foldCase(inner));
}

const isDirectory = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

function checkAgentRead(input, root, role, launch) {
  const ti = input.tool_input ?? {};
  const search = input.tool_name !== 'Read';
  const target = input.tool_name === 'Read' ? ti.file_path : (ti.path || input.cwd || root);
  if (typeof target !== 'string' || !target) deny(`RealmCraft agent ${role}: this read names no file.`);
  for (const pat of [ti.pattern, ti.glob]) {
    if (!search || typeof pat !== 'string') continue;
    if (input.tool_name === 'Grep' && pat === ti.pattern) continue;
    if (/(^|[\\/])\.\.([\\/]|$)/.test(pat) || /^([a-zA-Z]:)?[\\/]/.test(pat) || pat.startsWith('~')) {
      deny(`RealmCraft agent ${role}: search patterns stay inside the searched folder (${pat}).`);
    }
  }
  const p = canonPath(target, input.cwd);
  const rel = relInside(p, root);
  const isDir = search && isDirectory(p);
  if (rel !== null && readAllowed(input, root, role, launch, rel, isDir)) return;
  deny(`RealmCraft agent ${role} reads only its task, the files under read in it, its own proposal${JUDGE_DIRS[role] ? `, ${JUDGE_DIRS[role].join('/, ')}/ of the campaign` : ''}, welten/ and engine/schemas/, not ${target}.`);
}

// --- main session and other subagents ---------------------------------------

function checkFile(input, root) {
  const ti = input.tool_input ?? {};
  const target = ti.file_path ?? ti.notebook_path ?? ti.path;
  if (typeof target !== 'string' || !target) return;
  const p = canonPath(target, input.cwd);
  const loc = campaignRel(p, root);
  if (!loc) {
    // A UNC path to another name of this machine cannot be resolved here.
    if (/^[\\/]{2}[^\\/?.]/.test(target) && /[\\/]campaigns[\\/]/i.test(target)) deny(`Network paths into a campaigns/ folder are not allowed (${target}); write through the kernel.`);
    return;
  }
  if (!proposalOf(loc)) {
    deny(`campaigns/${loc.cid}${loc.rest ? `/${loc.rest}` : ''} belongs to the RealmCraft kernel. Agents write only agents/proposals/<proposalId>.json; everything else changes through node engine/cli.mjs.`);
  }
}

// Writing commands at command position, so a search for the word "move"
// stays allowed: POSIX tools, PowerShell cmdlets and aliases, cmd builtins,
// copy, sync, download and archive tools, git commands that rewrite files.
const WRITE_CMD = [
  /^(?:sudo\s+|xargs\s+(?:-\S+\s+)*|command\s+|exec\s+|env\s+(?:\S+=\S*\s+)*)?(?:rm|rmdir|mv|cp|tee|touch|truncate|dd|install|ln|chmod|chown|unlink|shred|mkfifo|patch|rsync|scp|xcopy|robocopy|mklink|set-content|add-content|out-file|copy-item|move-item|remove-item|new-item|rename-item|clear-content|set-item|expand-archive|compress-archive|start-bitstransfer|export-[a-z]+|sc|ac|ni|cpi|mi|ri|rni|del|erase|copy|move|ren|rename|md|mkdir|rd)(?:\.exe)?(?:\s|$)/i,
  /^sed\s(?:.*\s)?-[a-z]*i/i,
  /^perl\s+-\S*i/i,
  /^(?:curl)(?:\.exe)?\s(?:.*\s)?(?:-[a-z]*[oO]\b|--output|--remote-name)/i,
  /^(?:wget|aria2c)(?:\.exe)?\s/i,
  /^(?:invoke-webrequest|iwr|invoke-restmethod|irm)\s(?:.*\s)?-outfile\b/i,
  /^(?:tar|bsdtar)(?:\.exe)?\s(?:.*\s)?(?:-[a-z]*x|--extract|x[a-z]*f?\s)/i,
  /^(?:unzip|7z|7za|unrar|gunzip|bunzip2|xz\s+-d)(?:\.exe)?\s/i,
  /^git\s(?:.*\s)?(?:checkout|restore|reset|clean|stash|apply|am|mv|rm|switch|merge|pull|rebase|cherry-pick|revert|worktree)\b/i,
];
// File functions of Node, Python, .NET and Windows APIs, and find -delete,
// anywhere in a command that mentions campaigns.
const WRITE_FN = /\b(?:writeFileSync|appendFileSync|renameSync|unlinkSync|rmSync|rmdirSync|copyFileSync|cpSync|symlinkSync|linkSync|truncateSync|writeFile|appendFile|rename|unlink|rmdir|copyFile|createWriteStream|write_text|write_bytes|os\.remove|os\.rename|os\.replace|shutil\.\w+|WriteAll\w+|AppendAll\w+|StreamWriter|FileStream|(?:IO\.)?(?:File|Directory)\]::(?:Write|Append|Copy|Move|Delete|Create|Replace|Open)\w*)|\.(?:Delete|MoveTo|CopyTo)\s*\(|open\s*\([^)]*,\s*['"][wax+]|\s-delete\b|-exec\s+rm\b|-outfile\b/i;
// Shells and evaluators whose payload the guard cannot read.
const OPAQUE = /(?:^|[\s;&|(])(?:(?:bash|sh|zsh|dash|pwsh|powershell|cmd)(?:\.exe)?\s+(?:-\S+\s+)*(?:-c|-command|\/c|\/k)\b|invoke-expression\b|iex\b|eval\s)/i;
// powershell -e / -enc / -EncodedCommand <base64>: PowerShell accepts every
// prefix of -EncodedCommand, while -ex is -ExecutionPolicy.
const ENCODED = /(?:pwsh|powershell)(?:\.exe)?\b[^|;&\n]*\s-(?:e|ec|en|enc\w*)\s/i;
// A plain kernel or helper call: node with the script as first argument, no
// option before it (so no -e, --eval, -p, --require, --import).
const KERNEL_CALL = /^(?:[A-Z_][A-Z0-9_]*=\S*\s+)*node(?:\.exe)?\s+(?:"[^"]*?(?:engine[\\/]cli|tools[\\/]harness[\\/][a-z-]+)\.mjs"|'[^']*?(?:engine[\\/]cli|tools[\\/]harness[\\/][a-z-]+)\.mjs'|[^\s"'-]\S*?(?:engine[\\/]cli|tools[\\/]harness[\\/][a-z-]+)\.mjs)(?:\s|$)/i;
const CD = /(?:^|[\s;&|(])(?:cd|pushd|chdir|set-location|sl|push-location)(?:\s+-\S+)*\s+["']?[^\s;&|"']*campaigns/i;
const NULL_SINK = /^(?:\/dev\/null|nul|\$null)$/i;
const VARIABLE = /[$%`]|^\(/;

function checkShell(input) {
  const raw = String(input.tool_input?.command ?? '');
  // examples/campaigns/ is developer territory, as in the file check.
  const live = raw.replace(/examples[\\/]+campaigns\b/gi, 'examples/_');
  if (ENCODED.test(live)) deny('Encoded PowerShell commands are not allowed in this repository; the guard cannot see what they write.');
  if (!/campaigns/i.test(live)) return;
  const say = (what) => deny(`${what} The command touches campaigns/, which only the RealmCraft kernel writes. Use node engine/cli.mjs or tools/harness/*.mjs; agents write their proposal with the Write tool.`);
  if (OPAQUE.test(live)) say('Nested shells and evaluators are not allowed together with campaigns/.');
  if (WRITE_FN.test(live)) say('This command calls a file-writing function.');
  const tainted = CD.test(live);
  // fd duplications (2>&1, >&2) are no file targets; &>file is >file.
  const flat = live.replace(/\d*>&\d*-?/g, ' ').replace(/&>/g, '>');
  for (const part of flat.split(/&&|\|\||[;&|\r\n()`{}]|\$\(/)) {
    const seg = part.trim();
    if (!seg) continue;
    for (const m of seg.matchAll(/>{1,2}\|?\s*("[^"]*"|'[^']*'|[^\s;&|<>]+)/g)) {
      const t = m[1].replace(/^["']|["']$/g, '');
      if (NULL_SINK.test(t)) continue;
      if (/campaigns/i.test(t) || VARIABLE.test(t) || (tainted && !/^([a-zA-Z]:)?[\\/]/.test(t))) say(`Redirecting output to ${m[1]} is not allowed.`);
    }
    if (KERNEL_CALL.test(seg)) continue;
    if (WRITE_CMD.some((re) => re.test(seg)) && (/campaigns/i.test(seg) || tainted || VARIABLE.test(seg.replace(/^\S+/, '')))) say('This command writes, moves or deletes files.');
  }
}

// --- dispatch ---------------------------------------------------------------

const input = await readHookInput();
const tool = input?.tool_name;
if (input && (FILE_TOOLS.has(tool) || SHELL_TOOLS.has(tool) || READ_TOOLS.has(tool))) {
  const root = canonPath(rootDir(input));
  // The launch record is read once and only for subagent calls.
  const launch = typeof input.agent_id === 'string' ? subagentLaunch(input) : null;
  const role = roleOf(input, root, launch);
  if (role) {
    if (SHELL_TOOLS.has(tool)) deny(`RealmCraft agent ${role} has no shell. Write your proposal with the Write tool; the proposal check validates it on every write and reports the budget per item.`);
    if (FILE_TOOLS.has(tool)) checkAgentFile(input, root, role, launch);
    else checkAgentRead(input, root, role, launch);
  } else if (FILE_TOOLS.has(tool)) checkFile(input, root);
  else if (SHELL_TOOLS.has(tool)) checkShell(input);
}
process.exit(0);

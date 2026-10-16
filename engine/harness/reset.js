// Destructive offline maintenance. Stop the server and all harness writers
// before invoking this operation; these locks do not coordinate a live reset.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { issue } from '../core/issues.js';
import { LockError, withLock, writeJsonAtomic } from './io.js';

const CID = /^[a-z][a-z0-9-]{1,40}$/;
const DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const METADATA = new Set(['index.json', 'active.json']);
const BASE_LOCK = /^\.(?:index|active)\.lock(?:\.break)?$/;
const LOCK_OPTIONS = { timeoutMs: 0, staleMs: Infinity };

export class ResetError extends Error {
  constructor(code, reason, message, data = {}) {
    super(message);
    this.exit = code;
    this.issues = [issue(reason === 'run-active' ? 'cli.turn_running' : code === 4 ? 'cli.locked' : code === 1 ? 'cli.error' : 'format', '/reset', message, { severity: 'error', params: { reason } })];
    this.data = data;
  }
}

const refuse = (reason, message) => { throw new ResetError(2, reason, message); };
const inside = (parent, target) => {
  const path = relative(parent, target);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep));
};

function checkedPath(parent, path) {
  if (!inside(parent, resolve(path))) refuse('unsafe-path', 'Reset target escapes the campaign root');
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !inside(parent, realpathSync(path))) refuse('unsafe-path', 'Reset refuses symbolic links and junctions');
  if (!stat.isDirectory() && !stat.isFile()) refuse('unsafe-path', 'Reset refuses non-file campaign entries');
  return stat;
}

/** Reject links in existing ancestors, and Win32 spellings that alias a path. */
function checkedRoot(value) {
  const root = resolve(value);
  const anchor = parse(root).root;
  if (root === anchor) refuse('unsafe-root', 'Reset requires a project root below the filesystem root');
  let current = anchor;
  for (const part of relative(anchor, root).split(sep)) {
    if (/[. ]$/.test(part) || DEVICE.test(part)) refuse('unsafe-root', 'Reset refuses aliased root paths');
    current = join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink() || !stat.isDirectory()) refuse('unsafe-root', 'Reset root must contain only real directories');
  }
  return root;
}

function checkedTree(root, dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (/[. ]$/.test(entry.name) || DEVICE.test(entry.name)) refuse('unsafe-path', 'Reset refuses aliased campaign entries');
    const path = join(dir, entry.name);
    if (checkedPath(root, path).isDirectory()) checkedTree(root, path);
  }
}

function inactiveRun(dir) {
  const path = join(dir, 'run.json');
  if (!existsSync(path)) return;
  let run;
  try { run = JSON.parse(readFileSync(path, 'utf8')); } catch { refuse('unreadable-run', 'Reset refuses an unreadable run marker'); }
  if (!run || typeof run !== 'object' || Array.isArray(run) || typeof run.active !== 'boolean') refuse('unreadable-run', 'Reset requires a readable active flag in every run marker');
  if (run.active) throw new ResetError(4, 'run-active', 'Reset waits until every harness run has ended');
}

/** Only a complete maintenance marker can authorize a layout already removed. */
function pendingReset(root, base) {
  const path = join(base, 'index.json');
  if (!lstatSync(path, { throwIfNoEntry: false })) return new Set();
  if (!checkedPath(root, path).isFile()) return new Set();
  let index;
  try { index = JSON.parse(readFileSync(path, 'utf8')); } catch { return new Set(); }
  if (!index || typeof index !== 'object' || Array.isArray(index)
    || Object.keys(index).some((key) => !['format', 'version', 'campaigns', 'generation', 'resetPending'].includes(key))
    || index.format !== 'realmcraft-campaigns' || index.version !== 1
    || !Array.isArray(index.campaigns) || index.campaigns.length
    || typeof index.generation !== 'string' || !/^[0-9a-f]{32}$/.test(index.generation)
    || !Array.isArray(index.resetPending) || index.resetPending.some((id) => typeof id !== 'string' || !CID.test(id))
    || new Set(index.resetPending).size !== index.resetPending.length) return new Set();
  return new Set(index.resetPending);
}

function preflight(root, base) {
  if (!checkedPath(root, base).isDirectory()) refuse('unsafe-path', 'Campaign storage must be a real directory');
  const pending = pendingReset(root, base);
  const ids = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const path = join(base, entry.name);
    const stat = checkedPath(root, path);
    if (stat.isFile() && (METADATA.has(entry.name) || BASE_LOCK.test(entry.name))) continue;
    if (!stat.isDirectory() || !CID.test(entry.name)) refuse('unknown-entry', 'Reset refuses an unknown entry in campaign storage: ' + entry.name);
    checkedTree(root, path);
    if (!pending.has(entry.name) && ![join(path, 'state.json'), join(path, 'world.lock.json')].some((file) => existsSync(file) && lstatSync(file).isFile())) refuse('unknown-entry', 'Reset refuses a directory without a campaign layout: ' + entry.name);
    inactiveRun(path);
    ids.push(entry.name);
  }
  return ids.sort();
}

function takeLocks(locks, work, at = 0) {
  if (at === locks.length) return work();
  const [dir, name] = locks[at];
  return withLock(dir, name, () => takeLocks(locks, work, at + 1), LOCK_OPTIONS);
}

/** Resets runtime campaigns only. Packages, authoring receipts and owner files stay. */
export function resetCampaigns(value) {
  const root = checkedRoot(value);
  mkdirSync(root, { recursive: true });
  const base = join(root, 'campaigns');
  if (!lstatSync(base, { throwIfNoEntry: false })) mkdirSync(base);
  const ids = preflight(root, base);
  const locks = [[base, 'index'], [base, 'active'], ...ids.flatMap((id) => ['run', 'campaign', 'state', 'status'].map((name) => [join(base, id), name]))];
  try {
    return takeLocks(locks, () => {
      if (JSON.stringify(preflight(root, base)) !== JSON.stringify(ids)) refuse('campaigns-changed', 'Campaign storage changed during reset preflight');
      const generation = randomBytes(16).toString('hex');
      const deleted = [];
      let published = false;
      try {
        // Publish invalidation before deletion: stale Realm starts must not
        // recreate a partly removed campaign if filesystem maintenance fails.
        const emptyIndex = { format: 'realmcraft-campaigns', version: 1, campaigns: [], generation };
        writeJsonAtomic(join(base, 'index.json'), { ...emptyIndex, resetPending: ids });
        published = true;
        if (existsSync(join(base, 'active.json'))) unlinkSync(join(base, 'active.json'));
        for (const id of ids) {
          const target = join(base, id);
          if (!checkedPath(root, target).isDirectory()) refuse('unsafe-path', 'Reset target is no longer a campaign directory');
          checkedTree(root, target);
          rmSync(target, { recursive: true, force: false, maxRetries: 5 });
          deleted.push(id);
        }
        writeJsonAtomic(join(base, 'index.json'), emptyIndex);
        return { deleted, generation };
      } catch (error) {
        if (error instanceof ResetError && !published) throw error;
        throw new ResetError(1, 'reset-incomplete', 'Reset did not complete: ' + error.message, { deleted, remaining: ids.filter((id) => existsSync(join(base, id))), ...(published ? { generation } : {}) });
      }
    });
  } catch (error) {
    if (error instanceof LockError) throw new ResetError(4, 'lock-held', 'Reset waits until all campaign and metadata locks are free');
    throw error;
  }
}

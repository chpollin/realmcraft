// File IO of a campaign folder (Node only). Every write goes to a temporary
// file in the same directory and is renamed over the target, so a crash
// mid-write leaves the previous file intact; writers of the same file
// serialise through an exclusive lock file. The API is synchronous because
// CLI, server endpoints and hooks each do one short read-modify-write.
//
// Layout of campaigns/<cid>/ (kernel draft section 7; the agents/ prefix of
// tasks and proposals is fixed by respondAs.path in engine/schemas/task.js):
//   state.json  world.lock.json  library.json  status.json
//   drafts/<peopleId>.json  view/<peopleId>.json  log/T0006.json
//   agents/tasks/T0006/  agents/proposals/<proposalId>.json  agents/verdicts/
//   narrative/chronik/T0006.md  narrative/images/

import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { SCHEMAS } from '../schemas/index.js';
import { validate } from '../content/schema.js';
import { issue } from '../core/issues.js';
import { createLibrary } from '../content/library.js';

export const LAYOUT = Object.freeze({
  state: 'state.json',
  worldLock: 'world.lock.json',
  library: 'library.json',
  status: 'status.json',
  drafts: 'drafts',
  view: 'view',
  log: 'log',
  tasks: 'agents/tasks',
  proposals: 'agents/proposals',
  verdicts: 'agents/verdicts',
  chronik: 'narrative/chronik',
  images: 'narrative/images',
});

const DIRS = ['drafts', 'view', 'log', 'tasks', 'proposals', 'verdicts', 'chronik', 'images'];

export const campaignDir = (root, cid) => join(root, 'campaigns', cid);

/** "T0006": file stem of per-turn files (log, chronik, task folders). */
export const turnStem = (turn) => `T${String(turn).padStart(4, '0')}`;

/** Creates every folder of the layout; existing folders are kept. */
export function ensureLayout(dir) {
  for (const k of DIRS) mkdirSync(join(dir, LAYOUT[k]), { recursive: true });
  return dir;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Parsed JSON of a file. A missing file returns `fallback` when one is given
 * and throws otherwise; a file above `maxBytes` or with invalid JSON throws
 * with the path in the message.
 */
export function readJson(path, { fallback, maxBytes = Infinity } = {}) {
  let text;
  try {
    if (maxBytes !== Infinity && statSync(path).size > maxBytes) throw new Error(`readJson: ${path} exceeds ${maxBytes} bytes`);
    text = readFileSync(path, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw err.code === 'ENOENT' ? new Error(`readJson: ${path} not found`, { cause: err }) : err;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`readJson: ${path} is not valid JSON: ${err.message}`, { cause: err });
  }
}

// On Windows a rename onto a file another process holds open (the dev
// server's watcher reading it) fails briefly with EPERM, EBUSY or EACCES.
const RENAME_RETRY = new Set(['EPERM', 'EBUSY', 'EACCES']);

function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (err) {
      if (!RENAME_RETRY.has(err.code) || attempt >= 20) throw err;
      sleep(10 + attempt * 10);
    }
  }
}

/**
 * Writes JSON through a temporary file in the target directory, fsync and
 * rename. `onBeforeRename(tmpPath)` is a test seam to simulate a crash
 * between write and rename.
 */
export function writeJsonAtomic(path, value, { onBeforeRename } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  const fd = openSync(tmp, 'wx');
  try {
    writeSync(fd, text);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    if (onBeforeRename) onBeforeRename(tmp);
    renameWithRetry(tmp, path);
  } catch (err) {
    // A real crash leaves the temp file behind; readers ignore *.tmp. A
    // caught failure cleans up after itself.
    try {
      unlinkSync(tmp);
    } catch {
      // already gone
    }
    throw err;
  }
}

export class LockError extends Error {
  constructor(message) {
    super(message);
    this.code = 'ELOCKED';
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

// A lock is linked into place with its record already written, so an empty
// or unparseable lock comes only from a foreign writer or an older kernel
// that created and filled it in two steps. One that stays so longer than this
// would otherwise block every writer forever.
const UNREADABLE_LOCK_STALE_MS = 2000;
const LINK_UNSUPPORTED = new Set(['ENOTSUP', 'ENOSYS', 'EXDEV']);

/**
 * Creates `path` holding `text` only if it does not exist yet, in one step:
 * the record goes to a temporary file that is hard-linked onto the name. A
 * waiter therefore never sees a lock whose record is still being written,
 * which under load it could take for an abandoned one and break.
 */
function createExclusive(path, text) {
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, text, { flag: 'wx' });
  try {
    linkSync(tmp, path);
    return true;
  } catch (err) {
    if (err.code === 'EEXIST' || err.code === 'EPERM') return false;
    if (!LINK_UNSUPPORTED.has(err.code)) throw err;
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // already gone
    }
  }
  // A file system without hard links: exclusive create, then write.
  let fd;
  try {
    fd = openSync(path, 'wx');
  } catch (err) {
    if (err.code === 'EEXIST' || err.code === 'EPERM') return false;
    throw err;
  }
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
  return true;
}

const lockRecord = (token) => JSON.stringify({ pid: process.pid, at: Date.now(), token });

/**
 * Removes the file at `path` if it still holds `text`. staleRecord checks the
 * holder before this second read, so a record of a dead holder that is still
 * there cannot be released any more: only another breaker could remove it,
 * and breakers take turns under the guard of breakStale.
 */
function removeIfSame(path, text) {
  try {
    if (readFileSync(path, 'utf8') === text) unlinkSync(path);
  } catch {
    // released meanwhile
  }
}

/**
 * Breaks the lock at `path` if it is stale. A waiter may judge a lock by a
 * record its holder released right after the read (and, its work done,
 * exited), so the judgment is repeated under a guard file that lets one
 * breaker act at a time, and only the judged record is removed. A guard is
 * held for a moment only; one left by a crashed breaker goes by the same rule.
 * An old lock of a live holder (staleMs) can still be released between the
 * second read and the removal, which costs the next holder its lock; the
 * atomic rename of every write still keeps each file whole.
 */
function breakStale(path, staleMs) {
  const guard = `${path}.break`;
  if (!createExclusive(guard, lockRecord(randomBytes(8).toString('hex')))) {
    const left = staleRecord(guard, staleMs);
    if (left !== null) removeIfSame(guard, left);
    return;
  }
  try {
    const text = staleRecord(path, staleMs);
    if (text !== null) removeIfSame(path, text);
  } finally {
    try {
      unlinkSync(guard);
    } catch {
      // already gone
    }
  }
}

/** The record of the lock at `path` when it counts as abandoned, else null. */
function staleRecord(path, staleMs) {
  let text;
  let age;
  try {
    text = readFileSync(path, 'utf8');
    age = Date.now() - statSync(path).mtimeMs;
  } catch {
    // Just released (ENOENT): not stale, the next open attempt takes it.
    return null;
  }
  let info;
  try {
    info = JSON.parse(text);
  } catch {
    info = null;
  }
  if (!info || typeof info !== 'object') return age > Math.min(UNREADABLE_LOCK_STALE_MS, staleMs) ? text : null;
  const stale = !Number.isInteger(info.pid) || !pidAlive(info.pid) || !Number.isFinite(info.at) || Date.now() - info.at > staleMs;
  return stale ? text : null;
}

/**
 * Runs fn while holding <dir>/.<name>.lock. Waits with jittered retries up to
 * timeoutMs, then throws LockError. A lock whose owner process is gone or
 * which is older than staleMs counts as abandoned by a crash and is broken
 * (breakStale). The atomic rename of every write keeps each file whole even
 * in the one-rename window removeIfSame leaves.
 */
export function withLock(dir, name, fn, { timeoutMs = 5000, staleMs = 30000, retryMs = 15 } = {}) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `.${name}.lock`);
  const token = randomBytes(8).toString('hex');
  const start = Date.now();
  while (!createExclusive(path, lockRecord(token))) {
    if (staleRecord(path, staleMs) !== null) {
      breakStale(path, staleMs);
      if (createExclusive(path, lockRecord(token))) break;
    }
    if (Date.now() - start > timeoutMs) throw new LockError(`lock ${path} held longer than ${timeoutMs} ms`);
    sleep(retryMs + Math.floor(Math.random() * retryMs));
  }
  try {
    return fn();
  } finally {
    try {
      const info = JSON.parse(readFileSync(path, 'utf8'));
      if (info.token === token) unlinkSync(path);
    } catch {
      // lock already removed
    }
  }
}

function readJsonDir(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
  const out = {};
  for (const f of names.filter((n) => n.endsWith('.json')).sort()) out[f.slice(0, -5)] = readJson(join(dir, f));
  return out;
}

/**
 * Loads a campaign folder: state (required), library (empty when absent),
 * world lock (null when absent), drafts keyed by people id and round reports
 * keyed by turn stem ("T0006").
 */
export function readCampaign(dir) {
  return {
    state: readJson(join(dir, LAYOUT.state)),
    library: readJson(join(dir, LAYOUT.library), { fallback: createLibrary() }),
    worldLock: readJson(join(dir, LAYOUT.worldLock), { fallback: null }),
    drafts: readJsonDir(join(dir, LAYOUT.drafts)),
    log: readJsonDir(join(dir, LAYOUT.log)),
  };
}

/**
 * Writes state.json under the state lock. With expectRev the stored state
 * must be at that revision and the new one at expectRev + 1, otherwise
 * nothing is written and the result carries a stale issue. The state is
 * checked against the campaign schema first unless validate is false.
 * Returns { ok, rev, issues }.
 */
export function writeState(dir, state, { expectRev, validate: check = true, onBeforeRename, lock } = {}) {
  if (check) {
    const issues = validate(SCHEMAS.campaign, state);
    if (issues.length) return { ok: false, rev: null, issues };
  }
  const path = join(dir, LAYOUT.state);
  return withLock(dir, 'state', () => {
    if (expectRev !== undefined) {
      const cur = readJson(path, { fallback: null });
      const at = cur ? cur.rev : null;
      // A missing state has no revision to report as a param.
      const moved = { reason: 'rev-moved', expected: expectRev, ...(at === null ? {} : { rev: at }) };
      if (at !== expectRev) return { ok: false, rev: at, issues: [issue('stale', '/rev', `state is at revision ${at}, expected ${expectRev}`, { params: moved })] };
      if (state.rev !== expectRev + 1) return { ok: false, rev: at, issues: [issue('stale', '/rev', `new state must carry revision ${expectRev + 1}, has ${state.rev}`, { params: { reason: 'rev-not-next', rev: state.rev, expected: expectRev + 1 } })] };
    }
    writeJsonAtomic(path, state, { onBeforeRename });
    return { ok: true, rev: state.rev, issues: [] };
  }, lock);
}

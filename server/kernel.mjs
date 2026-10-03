// Calls of engine/cli.mjs, the only writer of campaign state.
import { execFile } from 'node:child_process';
import { CAMPAIGN_ROOT, ROOT } from './config.mjs';

// CLI calls of one campaign run strictly one after another; the CLI locks too,
// but a queue keeps a preview from interleaving with a seal in the response order.
const queues = new Map();

/** Runs `node engine/cli.mjs ...args` queued under `key` and resolves to { err, stdout }. */
export function runCli(key, args) {
  const run = () => new Promise((done) => {
    execFile(process.execPath, ['engine/cli.mjs', ...args], {
      cwd: ROOT,
      env: { ...process.env, REALMCRAFT_ROOT: CAMPAIGN_ROOT },
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    }, (err, stdout) => done({ err, stdout }));
  });
  const next = (queues.get(key) ?? Promise.resolve()).then(run);
  queues.set(key, next);
  return next;
}

/** Parsed CLI JSON, or null when the CLI produced none (spawn error, crash). */
export function parseCli({ err, stdout }) {
  try {
    const out = JSON.parse(stdout);
    if (out && typeof out === 'object') return { ...out, exit: out.exit ?? (err ? err.code : 0) };
  } catch {
    // fall through
  }
  return null;
}

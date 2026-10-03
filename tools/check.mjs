// Static check without a build step: syntax of every tracked JS module.
//   node tools/check.mjs
import { execFile, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Tracked files that still exist: a file deleted in the working tree but not
// yet committed stays in the index and must not count as a failure.
function tracked(...patterns) {
  return execFileSync('git', ['ls-files', '-z', '--', ...patterns], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((f) => f && existsSync(join(ROOT, f)));
}

async function checkSyntax() {
  const run = promisify(execFile);
  // Saved workflows are script bodies for the Claude Code workflow runner
  // (top-level await and return), not Node modules.
  const files = tracked('*.js', '*.mjs', ':!.claude/workflows/**');
  const results = await Promise.all(
    files.map((f) =>
      run(process.execPath, ['--check', f], { cwd: ROOT }).then(
        () => true,
        (err) => {
          console.error(`syntax  ${f}\n${String(err.stderr).trim()}`);
          return false;
        },
      ),
    ),
  );
  const failed = results.filter((ok) => !ok).length;
  console.log(`syntax: ${files.length - failed}/${files.length} ok`);
  return failed === 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = (await checkSyntax()) ? 0 : 1;
}

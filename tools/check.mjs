// Static check without a build step: syntax of every tracked JS module and
// schema conformance of every tracked savegame under examples/.
//   node tools/check.mjs              -> full check
//   node tools/check.mjs <file.json>  -> validate only that savegame (skipped if absent)
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import Ajv from 'ajv';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Tracked files that still exist: a file deleted in the working tree but not
// yet committed stays in the index and must not count as a failure.
function tracked(...patterns) {
  return execFileSync('git', ['ls-files', '-z', '--', ...patterns], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((f) => f && existsSync(join(ROOT, f)));
}

// Tracked savegames under examples/ (recursive). Manifests and other JSON
// without `meta` are not savegames. Only tracked files, so a result never
// depends on the game-master's uncommitted backups.
export function trackedSavegames() {
  return tracked('examples/*.json')
    .filter((f) => basename(f) !== 'manifest.json')
    .map((file) => ({ file, data: JSON.parse(readFileSync(join(ROOT, file), 'utf8')) }))
    .filter(({ data }) => data && typeof data === 'object' && 'meta' in data);
}

// strict: true makes schema constructs AJV would otherwise only warn about fail here.
export function compileSchema() {
  const schema = JSON.parse(readFileSync(join(ROOT, 'schema', 'savegame.schema.json'), 'utf8'));
  return new Ajv({ allErrors: true, strict: true }).compile(schema);
}

function report(validate, file, data) {
  if (validate(data)) return true;
  console.error(`schema  ${file}`);
  for (const e of validate.errors.slice(0, 5)) console.error(`  ${e.instancePath || '/'} ${e.message}`);
  if (validate.errors.length > 5) console.error(`  ... ${validate.errors.length - 5} more`);
  return false;
}

async function checkSyntax() {
  const run = promisify(execFile);
  const files = tracked('*.js', '*.mjs');
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

function checkSavegames(validate) {
  const games = trackedSavegames();
  const failed = games.filter(({ file, data }) => !report(validate, file, data)).length;
  console.log(`schema: ${games.length - failed}/${games.length} savegames ok`);
  return failed === 0;
}

function checkOne(validate, file) {
  if (!existsSync(file)) {
    console.log(`schema: ${file} not present, skipped`);
    return true;
  }
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`json    ${file}: ${err.message}`);
    return false;
  }
  const ok = report(validate, file, data);
  if (ok) console.log(`schema: ${file} ok`);
  return ok;
}

async function main() {
  let validate;
  try {
    validate = compileSchema();
  } catch (err) {
    console.error(`schema does not compile: ${err.message}`);
    return false;
  }
  const target = process.argv[2];
  if (target) return checkOne(validate, target);
  const syntaxOk = await checkSyntax();
  return checkSavegames(validate) && syntaxOk;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = (await main()) ? 0 : 1;
}

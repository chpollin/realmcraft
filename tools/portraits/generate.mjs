// tools/portraits/generate.mjs — generates the council portraits the board
// shows (spielbrett/js/ui/portrait.js) through the Gemini image API.
//
// Usage:  node tools/portraits/generate.mjs <view.json> [--only <id,id>] [--force] [--dry-run]
//   <view.json>  a people's view as the kernel writes it (campaigns/<cid>/view/<people>.json)
//   --only       restrict to these person ids
//   --force      regenerate persons the manifest already lists
//   --dry-run    print the prompts, no key needed, nothing written
// Key: GEMINI_API_KEY from the environment or from .env in the repository root.
//
// Prompts come from the world package (welten/<world>/style.json and the role
// labels), so every portrait of a world shares one look. Images land as WebP in
// spielbrett/assets/portraits/ and are listed by person id in manifest.json.

import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateImage } from './gemini.js';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MODEL = 'gemini-3.1-flash-image';
const OUT_DIR = path.join(REPO, 'spielbrett', 'assets', 'portraits');
// The board shows portraits at most a few dozen pixels wide, so a small WebP
// keeps the committed assets light.
const SIZE = 320;

// The environment variable GEMINI_API_KEY, else the same line in .env at the
// repository root. The key is only read, never logged or written.
export async function readApiKey(root = REPO) {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  let raw;
  try {
    raw = await readFile(path.join(root, '.env'), 'utf8');
  } catch {
    return '';
  }
  for (const line of raw.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const m = /^\s*GEMINI_API_KEY\s*=\s*(.*?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

// Every council member of every people in the view that carries an
// appearance. Ids are checked because they become file names.
export function persons(view) {
  const out = [];
  for (const p of Object.values(view?.peoples ?? {})) {
    for (const m of p?.council ?? []) {
      if (typeof m?.id !== 'string' || !/^[a-z][a-z0-9-]{0,40}$/.test(m.id)) continue;
      if (!m.name || !m.appearance) continue;
      out.push({ id: m.id, name: m.name, role: m.role ?? '', appearance: m.appearance });
    }
  }
  return out;
}

// Medium first and negatives last, because image models weight the start of
// a prompt most.
export function portraitPrompt(person, style, labels = {}) {
  const role = labels[`role.${person.role}`] ?? person.role;
  return [
    style?.image?.base,
    style?.imageTypes?.portrait?.prompt,
    [person.name, role].filter(Boolean).join(', '),
    person.appearance,
    style?.image?.negative,
  ]
    .map((s) => (s ?? '').trim().replace(/\.$/, ''))
    .filter(Boolean)
    .join('. ');
}

// Entries for other ids are kept, an entry for the same id is replaced.
export function mergeManifest(list, entry) {
  return [...(Array.isArray(list) ? list : []).filter((e) => e?.id !== entry.id), entry]
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    throw new Error(`${path.relative(REPO, file)}: ${err.message}`);
  }
}

// Write next to the target and rename, so an interrupted run never leaves a
// truncated manifest the board would fail to parse.
async function writeAtomic(file, data) {
  const tmp = `${file}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

function parseArgs(argv) {
  const a = { only: null, force: false, dry: false, view: null };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--only') a.only = new Set((argv[++i] ?? '').split(',').filter(Boolean));
    else if (t === '--force') a.force = true;
    else if (t === '--dry-run') a.dry = true;
    else if (!a.view) a.view = t;
    else throw new Error(`unknown argument "${t}"`);
  }
  if (!a.view) throw new Error('usage: node tools/portraits/generate.mjs <view.json> [--only <id,id>] [--force] [--dry-run]');
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const view = await readJson(path.resolve(args.view));
  const world = view?.campaign?.world?.id;
  if (typeof world !== 'string' || !/^[a-z][a-z0-9-]*$/.test(world)) throw new Error('view carries no world id (campaign.world.id)');
  const style = await readJson(path.join(REPO, 'welten', world, 'style.json'));
  const labels = (await readJson(path.join(REPO, 'welten', world, 'labels.json'), {})).labels ?? {};
  const manifestFile = path.join(OUT_DIR, 'manifest.json');
  let manifest = await readJson(manifestFile, []);
  const listed = new Set((Array.isArray(manifest) ? manifest : []).map((e) => e?.id));

  const jobs = persons(view).filter((p) => (!args.only || args.only.has(p.id)) && (args.force || !listed.has(p.id)));
  if (!jobs.length) {
    console.log('no portraits to generate');
    return true;
  }
  const aspect = style?.imageTypes?.portrait?.aspect;
  if (args.dry) {
    for (const p of jobs) console.log(`${p.id} [${aspect ?? '-'}]\n  ${portraitPrompt(p, style, labels)}`);
    return true;
  }

  const apiKey = await readApiKey();
  if (!apiKey) {
    console.error('no GEMINI_API_KEY (environment or .env), nothing generated');
    return false;
  }
  // Loaded only here, so the pure helpers above stay usable without the native module.
  const { default: sharp } = await import('sharp');
  let failed = 0;
  for (const p of jobs) {
    process.stdout.write(`${p.id} ... `);
    try {
      const { data } = await generateImage({ apiKey, model: MODEL, prompt: portraitPrompt(p, style, labels), aspectRatio: aspect });
      const raw = Buffer.from(data, 'base64');
      const file = `${p.id}.webp`;
      await writeAtomic(path.join(OUT_DIR, file), await sharp(raw).resize({ width: SIZE, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer());
      manifest = mergeManifest(manifest, { id: p.id, file });
      await writeAtomic(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
      console.log('ok');
    } catch (err) {
      failed++;
      console.log(`failed: ${err.message}`);
    }
  }
  return failed === 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((ok) => { process.exitCode = ok ? 0 : 1; }, (err) => { console.error(err.message); process.exitCode = 1; });
}

// World packages resolve from REALMCRAFT_ROOT first, then the repository.
import { readdir, realpath, stat } from 'node:fs/promises';
import { join, relative, isAbsolute, sep } from 'node:path';
import { CAMPAIGN_ROOT, ID_RE, ROOT } from './config.mjs';
import { notFound, readJson, sendFile, sendJson } from './http.mjs';

export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY = 'normal';
export const SEED_MAX = 0xffffffff;
const LANG_RE = /^[a-z]{2}$/;
const LABEL_FILE_RE = /^labels\.([a-z]{2})\.json$/;
const PACKAGE_FILE_RE = /^(?:welt|regeln|style|labels(?:\.[a-z]{2})?)\.json$|^content\/(?:entwicklungen|ereignisse|bestimmungen)\.json$/;
const bases = () => [...new Set([join(CAMPAIGN_ROOT, 'welten'), join(ROOT, 'welten')])];
const inside = (parent, child) => {
  const path = relative(parent, child);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep));
};

/** The same first existing package the CLI resolves, with escaped links refused. */
export async function worldDirectory(worldId) {
  if (typeof worldId !== 'string' || !ID_RE.test(worldId)) return null;
  for (const base of bases()) {
    const dir = join(base, worldId);
    if (!(await stat(join(dir, 'welt.json')).catch(() => null))?.isFile()) continue;
    const [baseReal, dirReal] = await Promise.all([realpath(base).catch(() => null), realpath(dir).catch(() => null)]);
    if (!baseReal || !dirReal || !inside(baseReal, dirReal)) return null;
    return dirReal;
  }
  return null;
}

/** Only public package JSON, including files in authored packages outside ROOT. */
export async function worldFile(worldId, file) {
  if (!PACKAGE_FILE_RE.test(file)) return null;
  const dir = await worldDirectory(worldId);
  if (!dir) return null;
  const target = await realpath(join(dir, file)).catch(() => null);
  if (!target || !inside(dir, target) || !(await stat(target).catch(() => null))?.isFile()) return null;
  return target;
}

async function readWorld(worldId) {
  const files = await Promise.all(['welt.json', 'regeln.json', 'labels.json'].map((file) => worldFile(worldId, file)));
  if (files.some((file) => !file)) return null;
  const [welt, regeln, labels] = await Promise.all(files.map(readJson));
  if (!welt || welt.id !== worldId || !Array.isArray(regeln?.peopleTemplates)) return null;
  const templates = regeln.peopleTemplates
    .filter((template) => typeof template?.id === 'string' && ID_RE.test(template.id))
    .map((template) => ({ id: template.id, name: typeof template.name === 'string' ? template.name : template.id }));
  if (templates.length < 2) return null;
  const names = await readdir(await worldDirectory(worldId)).catch(() => []);
  const own = LANG_RE.test(labels?.locale ?? '') ? [labels.locale] : [];
  const more = names.map((file) => LABEL_FILE_RE.exec(file)?.[1]).filter(Boolean).sort();
  return {
    id: welt.id,
    name: typeof welt.name === 'string' ? welt.name : welt.id,
    version: welt.version ?? null,
    templates,
    languages: [...new Set([...own, ...more])],
    difficulties: DIFFICULTIES,
    defaultDifficulty: DEFAULT_DIFFICULTY,
    seed: { min: 0, max: SEED_MAX },
  };
}

export async function findWorld(worldId) {
  if (typeof worldId !== 'string' || !ID_RE.test(worldId)) return null;
  return readWorld(worldId);
}

/** Every readable package, with the campaign root taking precedence. */
export async function listWorlds() {
  const ids = new Set();
  for (const base of bases()) {
    for (const entry of await readdir(base, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory() && ID_RE.test(entry.name)) ids.add(entry.name);
    }
  }
  const worlds = (await Promise.all([...ids].map(findWorld))).filter(Boolean);
  return worlds.sort((a, b) => a.id.localeCompare(b.id));
}

export async function worldRules(worldId) {
  const file = await worldFile(worldId, 'regeln.json');
  return file ? readJson(file) : null;
}

export async function handleWorlds(_req, res) {
  sendJson(res, 200, await listWorlds());
}

export async function handleWorldFile(req, res, [worldId, file]) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(res);
  const target = await worldFile(worldId, file);
  return target ? sendFile(res, target) : notFound(res);
}

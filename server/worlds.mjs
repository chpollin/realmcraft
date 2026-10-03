// World packages a new game can start from. Resolution follows engine/cli.mjs
// worldDirFor: <REALMCRAFT_ROOT>/welten first, then the repository's welten/.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CAMPAIGN_ROOT, ID_RE, ROOT } from './config.mjs';
import { readJson, sendJson } from './http.mjs';

export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY = 'normal';
// Seeds are unsigned 32-bit integers, the range createCampaign keeps as is.
export const SEED_MAX = 0xffffffff;
const LANG_RE = /^[a-z]{2}$/;
const LABEL_FILE_RE = /^labels\.([a-z]{2})\.json$/;

const bases = () => [...new Set([join(CAMPAIGN_ROOT, 'welten'), join(ROOT, 'welten')])];

/**
 * The package summary a new game needs, or null when the folder is no
 * readable package. `languages` are the narrative languages the package has
 * labels for: the locale of labels.json first, then every labels.<lang>.json.
 */
async function readWorld(dir) {
  const welt = await readJson(join(dir, 'welt.json'));
  const regeln = await readJson(join(dir, 'regeln.json'));
  const labels = await readJson(join(dir, 'labels.json'));
  if (!welt || !ID_RE.test(String(welt.id)) || !Array.isArray(regeln?.peopleTemplates)) return null;
  const templates = regeln.peopleTemplates
    .filter((t) => typeof t?.id === 'string' && ID_RE.test(t.id))
    .map((t) => ({ id: t.id, name: typeof t.name === 'string' ? t.name : t.id }));
  if (templates.length < 2) return null;
  const files = await readdir(dir).catch(() => []);
  const own = LANG_RE.test(labels?.locale ?? '') ? [labels.locale] : [];
  const more = files.map((f) => LABEL_FILE_RE.exec(f)?.[1]).filter(Boolean).sort();
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

/** The package of `worldId` as readWorld describes it, or null. */
export async function findWorld(worldId) {
  if (typeof worldId !== 'string' || !ID_RE.test(worldId)) return null;
  for (const base of bases()) {
    const world = await readWorld(join(base, worldId));
    if (world && world.id === worldId) return world;
  }
  return null;
}

/** Every readable package, the campaign root's first when both define an id. */
export async function listWorlds() {
  const out = new Map();
  for (const base of bases()) {
    const names = await readdir(base, { withFileTypes: true }).catch(() => []);
    for (const e of names) {
      if (!e.isDirectory() || !ID_RE.test(e.name) || out.has(e.name)) continue;
      const world = await readWorld(join(base, e.name));
      // The CLI resolves a package by its folder name, so the id must agree.
      if (world && world.id === e.name) out.set(e.name, world);
    }
  }
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
}

/** The regeln.json of a world, for the calendar of the campaign list. */
export async function worldRules(worldId) {
  if (typeof worldId !== 'string' || !ID_RE.test(worldId)) return null;
  for (const base of bases()) {
    const regeln = await readJson(join(base, worldId, 'regeln.json'));
    if (regeln) return regeln;
  }
  return null;
}

/** GET /api/worlds */
export async function handleWorlds(_req, res) {
  sendJson(res, 200, await listWorlds());
}

// js/images/versions.js — client-side version lists of continued images
// ("Bild fortschreiben"). They live in localStorage, not in the savegame, which
// belongs to the game master. Lists are kept per party, otherwise one party
// would show the continued images of another under the same identity
// ("berater:<id>"); the party is passed explicitly so a call that outlives a
// party switch still writes to the party it started in.
import { partieTag } from './prompts.js';

const VER_NS = 'rc.imgver'; // identity -> [{ key, label, savedAt }]
const AKT_NS = 'rc.imgakt'; // identity -> active cache key

function nsKey(base, partie) {
  return partie ? `${base}.${partieTag(partie)}` : base;
}

function readJson(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota: versions are optional */ }
}

// One-time migration of the lists from before the per-party namespaces to the
// first party loaded, so images generated back then are not orphaned.
export function migrateLegacy(partie) {
  if (!partie) return;
  for (const base of [VER_NS, AKT_NS]) {
    try {
      const scoped = nsKey(base, partie);
      if (localStorage.getItem(scoped) == null) {
        const legacy = localStorage.getItem(base);
        if (legacy != null) {
          localStorage.setItem(scoped, legacy);
          localStorage.removeItem(base);
        }
      }
    } catch { /* localStorage optional */ }
  }
}

export function versionsAll(partie) {
  return readJson(nsKey(VER_NS, partie));
}

export function verList(partie, identity) {
  const list = versionsAll(partie)[identity];
  return Array.isArray(list) ? list : [];
}

export function verPush(partie, identity, entry) {
  const all = versionsAll(partie);
  const list = Array.isArray(all[identity]) ? all[identity] : [];
  list.push(entry);
  all[identity] = list;
  writeJson(nsKey(VER_NS, partie), all);
}

export function aktGet(partie, identity) {
  return readJson(nsKey(AKT_NS, partie))[identity] || null;
}

export function aktSet(partie, identity, key) {
  const all = readJson(nsKey(AKT_NS, partie));
  if (key) all[identity] = key; else delete all[identity];
  writeJson(nsKey(AKT_NS, partie), all);
}

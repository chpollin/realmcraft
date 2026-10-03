// The read-only environment every kernel function receives: the pinned world
// package (welt.json, regeln.json, content) and a content resolver. The kernel
// never imports engine/content/library.js; the harness passes a resolver built
// on it, so the core stays loadable in the browser without the library.
//
// env = makeEnv({ welt, regeln, content?, resolve?, labels?, hash? })
//   content: { entwicklungen, ereignisse, bestimmungen } as item arrays or as
//            the package files ({ items: [...] }).
//   resolve: optional (ref) -> object | null for agent content in the
//            campaign library; package content is found without it.

import { createWorld } from '../world/index.js';
import { hashValue } from './hash.js';

const items = (x) => (Array.isArray(x) ? x : Array.isArray(x?.items) ? x.items : []);
const refOf = (o) => `${o.id}@${o.rev}`;

export function makeEnv({ welt, regeln, content = {}, resolve = null, labels = null, hash = null }) {
  if (!welt || !welt.generation) throw new TypeError('makeEnv: welt.json is required');
  if (!regeln || !regeln.calendar) throw new TypeError('makeEnv: regeln.json is required');
  const pkg = {
    entwicklungen: items(content.entwicklungen),
    ereignisse: items(content.ereignisse),
    bestimmungen: items(content.bestimmungen),
  };
  const index = {
    entwicklung: new Map(pkg.entwicklungen.map((e) => [refOf(e), e])),
    ereignis: new Map(pkg.ereignisse.map((e) => [refOf(e), e])),
    bestimmung: new Map(pkg.bestimmungen.map((e) => [refOf(e), e])),
  };
  const shape = {
    entwicklung: (o) => o && o.format === 'realmcraft-entwicklung',
    ereignis: (o) => o && Number.isInteger(o.band) && !o.format,
    bestimmung: (o) => o && Array.isArray(o.milestones),
  };
  const lookup = (kind) => (ref) => {
    if (typeof ref !== 'string') return null;
    const own = index[kind].get(ref);
    if (own) return own;
    const found = resolve ? resolve(ref) : null;
    return shape[kind](found) ? found : null;
  };
  const worlds = new Map();
  return Object.freeze({
    welt,
    regeln,
    labels,
    content: pkg,
    // Hash of the pinned package; campaign.world.hash. The harness may pass the
    // hash of the files on disk instead.
    hash: hash ?? hashValue({ welt, regeln, content: pkg }),
    entwicklung: lookup('entwicklung'),
    ereignis: lookup('ereignis'),
    bestimmung: lookup('bestimmung'),
    resourceIds: Object.freeze(regeln.resources.map((r) => r.id)),
    resource: (id) => regeln.resources.find((r) => r.id === id) ?? null,
    stats: Object.freeze(regeln.stats.map((s) => ({ ...s }))),
    vocabulary: regeln.vocabulary ?? {},
    terrain: (id) => welt.terrains.find((t) => t.id === id) ?? null,
    /** The generated world for a campaign seed, created once per env and seed. */
    world(seed) {
      const k = `${typeof seed}:${seed}`;
      let w = worlds.get(k);
      if (!w) worlds.set(k, (w = createWorld({ seed, pack: welt })));
      return w;
    },
  });
}

export { refOf };

/** "salzpfad@1" -> "salzpfad". */
export function idOfRef(ref) {
  const at = String(ref).indexOf('@');
  return at < 0 ? String(ref) : String(ref).slice(0, at);
}

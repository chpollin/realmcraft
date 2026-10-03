// Compiles a parsed world pack (welten/<id>/welt.json) into lookup structures
// once per pack object, and keeps per-seed caches beside it. The caches hold
// only values derived purely from (seed, pack), so they never influence results.

const compiled = new WeakMap();

// Classification bounds may name a generation parameter ("seaLevel") instead of
// a number, so thresholds live in one place in the pack.
function resolveBound(gen, v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const n = gen[v];
  if (typeof n !== 'number') throw new Error(`world pack: unknown generation parameter "${v}"`);
  return n;
}

function resolveRange(gen, range) {
  if (!range) return null;
  return [resolveBound(gen, range[0]), resolveBound(gen, range[1])];
}

export function compilePack(pack) {
  let c = compiled.get(pack);
  if (c) return c;
  if (!pack || !pack.generation || !Array.isArray(pack.terrains)) {
    throw new Error('world pack: generation and terrains are required');
  }
  const gen = pack.generation;
  const terrains = new Map(pack.terrains.map((t) => [t.id, t]));
  const rules = gen.classification.map((rule) => {
    if (!terrains.has(rule.terrain)) throw new Error(`world pack: rule names unknown terrain "${rule.terrain}"`);
    return {
      terrain: rule.terrain,
      elevation: resolveRange(gen, rule.elevation),
      moisture: resolveRange(gen, rule.moisture),
      temperature: resolveRange(gen, rule.temperature),
    };
  });
  const passableCosts = pack.terrains.map((t) => t.moveCost).filter((m) => typeof m === 'number' && m > 0);
  const rivers = gen.rivers ?? null;
  c = {
    pack,
    gen,
    terrains,
    terrainOrder: pack.terrains.map((t) => t.id),
    rules,
    resources: pack.resources ?? [],
    rivers: rivers && {
      ...rivers,
      minElevation: resolveBound(gen, rivers.minElevation),
      maxElevation: resolveBound(gen, rivers.maxElevation),
    },
    minMoveCost: passableCosts.length ? Math.min(...passableCosts) : 1,
    seeds: new Map(),
  };
  compiled.set(pack, c);
  return c;
}

export function terrainDef(pack, id) {
  return compilePack(pack).terrains.get(id);
}

/** Move cost of a terrain id; Infinity when impassable or unknown. */
export function moveCost(pack, id) {
  const t = compilePack(pack).terrains.get(id);
  return t && typeof t.moveCost === 'number' ? t.moveCost : Infinity;
}

/** Per-seed cache bucket; `make` builds it on first use. */
export function seedCache(pack, seed, make) {
  const c = compilePack(pack);
  const k = `${typeof seed}:${seed}`;
  let entry = c.seeds.get(k);
  if (!entry) {
    entry = make(c);
    c.seeds.set(k, entry);
  }
  return entry;
}

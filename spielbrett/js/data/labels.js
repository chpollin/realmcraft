// Label lookup over the world's labels.json. Every name the world provides
// (resources, orders, roles, bands, seasons, views) comes from here; the
// fallback only covers keys a world package does not carry.

/** @returns {(key: string, fallback?: string) => string} */
export function makeLabels(labelsJson) {
  const table = labelsJson?.labels ?? {};
  const t = (key, fallback) => (Object.hasOwn(table, key) ? table[key] : fallback ?? key);
  t.has = (key) => Object.hasOwn(table, key);
  return t;
}

/** Label key of a probe band; label keys allow no underscore. */
export const bandKey = (band) => `band.${String(band).replaceAll('_', '-')}`;

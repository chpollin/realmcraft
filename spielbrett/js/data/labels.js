// Label lookup of the board (plan M1, board contracts). A key is looked up in
// the board's labels of the chosen language, then in the world's labels of
// that language, then in English (board, then world), then in the world's
// base labels (labels.json in the package's own locale, German for Hochland),
// and an unknown key shows the caller's fallback or the key itself. World
// packages carry labels.json and optional labels.<lang>.json files.

import de from '../../labels/de.json' with { type: 'json' };
import en from '../../labels/en.json' with { type: 'json' };

export const UI_LABELS = { de: de.labels, en: en.labels };
export const LANGUAGES = ['en', 'de'];
export const DEFAULT_LANGUAGE = 'en';

/** Fills "{name}" placeholders; an unknown placeholder stays visible. */
export const fill = (text, params) => (params ? String(text).replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m)) : text);

/**
 * @param {object|object[]} worldFiles label documents of the world, the base
 *   labels.json first; a file without locale counts as German.
 * @param {string} [lang] defaults to the locale of the base file
 * @returns {((key: string, fallback?: string) => string) & { has, fmt, plural, lang }}
 */
export function makeLabels(worldFiles = [], lang) {
  const files = (Array.isArray(worldFiles) ? worldFiles : [worldFiles]).filter(Boolean);
  const localeOf = (f) => f.locale ?? 'de';
  const chosen = lang ?? (files[0] ? localeOf(files[0]) : DEFAULT_LANGUAGE);
  const world = (l) => files.find((f) => localeOf(f) === l)?.labels ?? {};
  const tables = [UI_LABELS[chosen] ?? {}, world(chosen), UI_LABELS.en, world('en'), files[0]?.labels ?? {}];
  const t = (key, fallback) => {
    for (const table of tables) if (Object.hasOwn(table, key)) return table[key];
    return fallback ?? key;
  };
  t.has = (key) => tables.some((table) => Object.hasOwn(table, key));
  t.fmt = (key, params, fallback) => fill(t(key, fallback), params);
  /** "<key>.one" for one, "<key>.other" otherwise, with {n} filled. */
  t.plural = (key, n, params) => fill(t(`${key}.${n === 1 ? 'one' : 'other'}`), { n, ...params });
  t.lang = chosen;
  return t;
}

/** Label key of a probe band; label keys allow no underscore. */
export const bandKey = (band) => `band.${String(band).replaceAll('_', '-')}`;

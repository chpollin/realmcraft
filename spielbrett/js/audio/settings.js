// Audio settings of one viewer. They live in localStorage because they are a
// per-viewer convenience: a private window or blocked storage falls back to
// the defaults and the board keeps working. The key is separate from the
// UI settings of the i18n layer so neither writer overwrites the other.

export const AUDIO_STORE = 'realmcraft.audio';

/** Channel buses below master. */
export const CHANNELS = Object.freeze(['ambience', 'ui', 'stingers']);

/**
 * @typedef {object} AudioSettings
 * @property {number} master    0..1, scales every channel
 * @property {number} ambience  0..1, drone, wind and bells of the world
 * @property {number} ui        0..1, hover, click, confirm, refusal, warning, dice
 * @property {number} stingers  0..1, probe bands, event card, turn, end of game
 * @property {boolean} muted
 * @property {boolean|null} reduced  true or false overrides the viewer's
 *   prefers-reduced-motion, null follows it
 */

/** @type {Readonly<AudioSettings>} */
export const DEFAULT_SETTINGS = Object.freeze({ master: 0.8, ambience: 0.5, ui: 0.6, stingers: 0.8, muted: false, reduced: null });

// Reduced intensity keeps every cue audible but quieter, the ambience more so.
export const REDUCED_GAIN = Object.freeze({ ambience: 0.5, ui: 0.7, stingers: 0.7 });

const unit = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);

/**
 * Settings from untrusted input (storage, a settings form): unknown keys are
 * dropped, volumes clamped to 0..1, anything malformed falls back to the default.
 * @param {unknown} raw
 * @returns {AudioSettings}
 */
export function normalizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_SETTINGS;
  const out = { master: unit(r.master, d.master) };
  for (const c of CHANNELS) out[c] = unit(r[c], d[c]);
  out.muted = typeof r.muted === 'boolean' ? r.muted : d.muted;
  out.reduced = typeof r.reduced === 'boolean' ? r.reduced : null;
  return out;
}

/**
 * @param {Storage|null|undefined} storage
 * @returns {AudioSettings}
 */
export function loadSettings(storage) {
  try {
    const text = storage?.getItem(AUDIO_STORE);
    return normalizeSettings(text ? JSON.parse(text) : null);
  } catch {
    return normalizeSettings(null);
  }
}

/**
 * @param {AudioSettings} settings
 * @param {Storage|null|undefined} storage
 * @returns {boolean} false when the storage refused the write
 */
export function saveSettings(settings, storage) {
  try {
    if (!storage) return false;
    storage.setItem(AUDIO_STORE, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Target gains of the master bus and the channel buses.
 * @param {AudioSettings} settings
 * @param {boolean} reduced
 * @returns {{ master: number, ambience: number, ui: number, stingers: number }}
 */
export function gainsOf(settings, reduced) {
  const s = normalizeSettings(settings);
  const out = { master: s.muted ? 0 : s.master };
  for (const c of CHANNELS) out[c] = s[c] * (reduced ? REDUCED_GAIN[c] : 1);
  return out;
}

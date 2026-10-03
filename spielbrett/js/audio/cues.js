// What the board sounds like, as data: the cue of a click, a probe band, a
// game update or a world, and the tones every cue is made of. Nothing here
// touches an AudioContext, so the mapping runs under node:test.

/** Every cue the board plays, with the channel it runs on. */
export const CUE_CHANNEL = Object.freeze({
  hover: 'ui',
  click: 'ui',
  confirm: 'ui',
  refuse: 'ui',
  warning: 'ui',
  dice: 'ui',
  'dice-land': 'ui',
  'band-crit-fail': 'stingers',
  'band-fail': 'stingers',
  'band-narrow': 'stingers',
  'band-success': 'stingers',
  'band-crit-success': 'stingers',
  event: 'stingers',
  'turn-start': 'stingers',
  'turn-end': 'stingers',
  victory: 'stingers',
  defeat: 'stingers',
});

export const CUES = Object.freeze(Object.keys(CUE_CHANNEL));

/** Scale ids of a mood, as semitone steps from the root. */
export const SCALES = Object.freeze({
  'minor-pentatonic': [0, 3, 5, 7, 10],
  'major-pentatonic': [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
});

/**
 * Mood of the ambience. root: drone pitch as a MIDI note 24..60. scale: id of
 * SCALES for the bells. wind, bells: density 0..3.
 * @typedef {{ root: number, scale: string, wind: number, bells: number }} Mood
 */

/** Mood of a world without an entry in MOODS. */
export const DEFAULT_MOOD = Object.freeze({ root: 45, scale: 'minor-pentatonic', wind: 1, bells: 1 });

// Mood per world package id. The hochland of welten/hochland/style.json is a
// barren high range of slate and lichen with herds on the high pastures: a low
// dorian drone, strong wind, rare herd bells. Kept here until the world style
// schema carries an audio block of its own.
export const MOODS = Object.freeze({
  hochland: Object.freeze({ root: 38, scale: 'dorian', wind: 2, bells: 1 }),
});

export const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

const level = (v, fallback) => (Number.isInteger(v) && v >= 0 && v <= 3 ? v : fallback);

/**
 * A mood checked field by field; a missing or bad value falls back to the
 * default, so a mood from a file never breaks the ambience.
 * @param {unknown} raw
 * @returns {Mood}
 */
export function moodOf(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_MOOD;
  return {
    root: Number.isInteger(a.root) && a.root >= 24 && a.root <= 60 ? a.root : d.root,
    scale: Object.hasOwn(SCALES, a.scale) ? a.scale : d.scale,
    wind: level(a.wind, d.wind),
    bells: level(a.bells, d.bells),
  };
}

/**
 * Mood of a world: an explicit mood (a style's audio block) over the table entry.
 * @param {string|null|undefined} styleId  world package id
 * @param {unknown} [override]
 * @returns {Mood}
 */
export function moodFor(styleId, override) {
  if (override) return moodOf(override);
  return moodOf(typeof styleId === 'string' && Object.hasOwn(MOODS, styleId) ? MOODS[styleId] : null);
}

/** Bell pitches of a mood in Hz, two octaves of its scale above the drone. */
export function bellNotes(mood) {
  const steps = SCALES[mood.scale] ?? SCALES[DEFAULT_MOOD.scale];
  return [0, 12].flatMap((oct) => steps.map((s) => hz(mood.root + 24 + oct + s)));
}

// Probe bands of the kernel (engine/schemas/common.js BANDS) and world-event
// bands 1..5, calamity to blessing, on the five outcome cues.
const PROBE_BAND_CUE = Object.freeze({
  crit_fail: 'band-crit-fail', setback: 'band-fail', failure: 'band-fail',
  narrow: 'band-narrow', success: 'band-success', crit_success: 'band-crit-success',
});
const EVENT_BAND_CUE = Object.freeze(['band-crit-fail', 'band-fail', 'band-narrow', 'band-success', 'band-crit-success']);

/**
 * @param {string|number} band  probe band id or event band 1..5 (also as the
 *   string a data-band attribute carries)
 * @returns {string|null}
 */
export function bandCue(band) {
  if (typeof band === 'string' && Object.hasOwn(PROBE_BAND_CUE, band)) return PROBE_BAND_CUE[band];
  const n = Number(band);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? EVENT_BAND_CUE[n - 1] : null;
}

/**
 * Cue of the end of a campaign from the player's view, null while it runs.
 * @param {{ status?: string, result?: { kind: string, winner: string|null } | null }} view
 * @param {string} pid
 */
export function endCue(view, pid) {
  if (view?.status !== 'ended' || !view.result) return null;
  return view.result.kind === 'victory' && view.result.winner === pid ? 'victory' : 'defeat';
}

/**
 * Cue of a game.onUpdate notification: the sealed turn ends, a new season starts.
 * @param {string} kind
 * @param {any} detail
 * @returns {string|null}
 */
export function updateCue(kind, detail) {
  if (kind === 'sealed') return 'turn-end';
  if (kind === 'view' && detail?.after?.turn > detail?.before?.turn) return 'turn-start';
  return null;
}

const ROLES = new Set(['button', 'radio', 'tab', 'option', 'menuitem', 'menuitemradio', 'checkbox', 'switch', 'link']);
const TAGS = new Set(['BUTTON', 'A', 'LABEL', 'INPUT', 'SELECT', 'SUMMARY']);

function interactive(n) {
  return TAGS.has(n.tagName) || ROLES.has(n.getAttribute?.('role')) || n.id === 'karte';
}

/** The nearest interactive element at or above a pointer target, null outside controls. */
export function controlOf(target) {
  for (let n = target; n && n.tagName; n = n.parentElement) if (interactive(n)) return n;
  return null;
}

const refused = (n) => n.getAttribute?.('aria-disabled') === 'true' || n.classList?.contains('is-gesperrt');

/**
 * Cue of a click. Refusal wins over everything (aria-disabled controls stay
 * clickable so they can explain themselves), then the dice button, the
 * primary actions and finally any control or the map.
 * @param {Element|null} target
 * @returns {string|null}
 */
export function clickCue(target) {
  const c = controlOf(target);
  if (!c) return null;
  for (let n = target; n && n !== c.parentElement; n = n.parentElement) if (refused(n)) return 'refuse';
  if (c.hasAttribute?.('data-wuerfeln')) return 'dice';
  if (c.classList?.contains('btn-primary') || c.id === 'zug-beenden') return 'confirm';
  return 'click';
}

/** Cue of a newly opened dialog, by id. */
export function openedCue(dialog) {
  return dialog?.id === 'dlg-ereignis' ? 'event' : null;
}

/**
 * @typedef {object} Tone
 * @property {number} at      start in seconds after the cue
 * @property {number} dur     length in seconds including the release
 * @property {number} hz      pitch, or the band centre of noise
 * @property {number} [to]    pitch at the end (glide)
 * @property {'sine'|'triangle'|'square'|'sawtooth'|'noise'} wave
 * @property {number} gain    peak 0..1 before the channel bus
 * @property {number} [attack]
 * @property {number} [cutoff] lowpass frequency, none when absent
 * @property {boolean} [flourish] dropped under reduced intensity
 */

// Dice clicks follow the face changes of the probe dialog's roll animation
// (a new face every 40 ms + elapsed/9 until 820 ms). The landing is its own
// cue, played when the verdict appears, so it matches the screen with and
// without the animation.
function diceRattle() {
  const out = [];
  let i = 0;
  for (let t = 0; t < 0.82; t += 0.04 + t / 9, i++) {
    out.push({ at: t, dur: 0.03, hz: 2200 + (i % 3) * 600, wave: 'noise', gain: 0.22, flourish: i > 0 });
  }
  return out;
}

const seq = (notes, step, dur, wave, gain, extra = {}) =>
  notes.map((m, i) => ({ at: i * step, dur, hz: hz(m), wave, gain, ...extra }));

const bell = (at, midi, dur, gain, flourish = false) => [
  { at, dur, hz: hz(midi), wave: 'sine', gain, flourish },
  { at, dur: dur * 0.6, hz: hz(midi) * 2.76, wave: 'sine', gain: gain * 0.35, flourish: true },
  { at, dur: dur * 0.35, hz: hz(midi) * 5.4, wave: 'sine', gain: gain * 0.15, flourish: true },
];

/** @type {Readonly<Record<string, Tone[]>>} */
const RECIPES = Object.freeze({
  hover: [{ at: 0, dur: 0.04, hz: 1760, wave: 'sine', gain: 0.05 }],
  click: [{ at: 0, dur: 0.08, hz: 660, to: 700, wave: 'triangle', gain: 0.18 }],
  confirm: seq([72, 79], 0.07, 0.16, 'triangle', 0.22),
  refuse: seq([63, 58], 0.08, 0.14, 'square', 0.1, { cutoff: 900 }),
  warning: seq([69, 69], 0.14, 0.1, 'square', 0.1, { cutoff: 1400 }),
  dice: diceRattle(),
  'dice-land': [
    { at: 0, dur: 0.14, hz: 150, to: 90, wave: 'triangle', gain: 0.35 },
    { at: 0, dur: 0.05, hz: 1800, wave: 'noise', gain: 0.2 },
  ],
  'band-crit-fail': [
    { at: 0.05, dur: 0.9, hz: hz(45), to: hz(33), wave: 'sawtooth', gain: 0.22, cutoff: 600 },
    { at: 0.05, dur: 0.7, hz: 180, wave: 'noise', gain: 0.18, flourish: true },
  ],
  'band-fail': seq([64, 60], 0.12, 0.28, 'triangle', 0.22).map((t) => ({ ...t, at: t.at + 0.05 })),
  'band-narrow': seq([67, 69], 0.1, 0.24, 'triangle', 0.2).map((t) => ({ ...t, at: t.at + 0.05 })),
  'band-success': seq([72, 76, 79], 0.09, 0.3, 'triangle', 0.22).map((t) => ({ ...t, at: t.at + 0.05 })),
  'band-crit-success': [...seq([72, 76, 79, 84], 0.08, 0.4, 'triangle', 0.22), ...bell(0.32, 96, 1.2, 0.12, true)]
    .map((t) => ({ ...t, at: t.at + 0.05 })),
  event: [...bell(0, 43, 2.2, 0.32), { at: 0, dur: 1.4, hz: hz(31), wave: 'sine', gain: 0.18, attack: 0.05, flourish: true }],
  'turn-start': [
    { at: 0, dur: 0.9, hz: hz(55), wave: 'triangle', gain: 0.2, attack: 0.08, cutoff: 1200 },
    { at: 0.25, dur: 1.1, hz: hz(62), wave: 'triangle', gain: 0.2, attack: 0.08, cutoff: 1200 },
    { at: 0.25, dur: 1.1, hz: hz(43), wave: 'sine', gain: 0.12, attack: 0.1, flourish: true },
  ],
  'turn-end': [
    { at: 0, dur: 0.7, hz: hz(62), wave: 'triangle', gain: 0.18, attack: 0.05, cutoff: 1200 },
    { at: 0.2, dur: 0.9, hz: hz(55), wave: 'triangle', gain: 0.18, attack: 0.05, cutoff: 1200 },
  ],
  victory: [
    ...seq([67, 72, 76], 0.16, 0.4, 'triangle', 0.22, { cutoff: 2400 }),
    ...[79, 76, 72, 60].map((m) => ({ at: 0.5, dur: 1.8, hz: hz(m), wave: 'triangle', gain: 0.14, attack: 0.04, cutoff: 2400 })),
    ...bell(0.5, 91, 1.6, 0.1, true),
  ],
  defeat: [
    ...seq([64, 62, 60, 55], 0.32, 0.6, 'triangle', 0.2, { cutoff: 1200 }),
    { at: 0, dur: 2.4, hz: hz(36), wave: 'sawtooth', gain: 0.12, attack: 0.3, cutoff: 300, flourish: true },
  ],
});

// Longest tail of any tone under reduced intensity.
const REDUCED_DUR = 0.8;

/**
 * Tones of a cue. Reduced intensity drops the flourishes and caps every tail.
 * @param {string} cue
 * @param {boolean} [reduced]
 * @returns {Tone[]}
 */
export function recipe(cue, reduced = false) {
  const tones = Object.hasOwn(RECIPES, cue) ? RECIPES[cue] : [];
  if (!reduced) return tones.map((t) => ({ ...t }));
  return tones.filter((t) => !t.flourish).map((t) => ({ ...t, dur: Math.min(t.dur, REDUCED_DUR) }));
}

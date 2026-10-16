// Sound of the Spielbrett, synthesized with Web Audio, no audio files. The
// AudioContext starts on the first user gesture (autoplay policy); before that
// every call is a silent no-op, so callers never check.
//
// Buses: ui and stingers, both into master.
//
// Usage:
//   const audio = installAudio({ game });  // once, from main.js
//   audio.play('confirm');
//   audio.setVolume('ui', 0.4);            // persisted per viewer
//   getAudio()?.settings                    // from a settings dialog

import { CHANNELS, DEFAULT_SETTINGS, gainsOf, loadSettings, normalizeSettings, saveSettings } from './settings.js';
import { CUES, CUE_CHANNEL, bandCue, clickCue, endCue, openedCue, recipe, updateCue } from './cues.js';

export { CUES, CHANNELS, DEFAULT_SETTINGS };

const RAMP = 0.05;
const VERDICT = '.pe-urteil[data-band]';

function storageOrNull() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * @typedef {object} BoardAudio
 * @property {() => boolean} resume  creates or resumes the AudioContext; call
 *   it from a user gesture. false where Web Audio is missing.
 * @property {(cue: string) => boolean} play  one cue of CUES on its channel;
 *   false when silent (no context yet, muted, unknown cue)
 * @property {(channel: 'master'|'ui'|'stingers', value: number) => void} setVolume
 * @property {(muted: boolean) => void} setMuted
 * @property {(reduced: boolean|null) => void} setReducedMotion  overrides the
 *   viewer's prefers-reduced-motion, null follows it again
 * @property {() => boolean} reduced  true while intensity is reduced
 * @property {import('./settings.js').AudioSettings} settings  a copy
 * @property {(patch: object) => import('./settings.js').AudioSettings} set
 *   merges, validates, persists and applies a settings change
 * @property {(root?: Document) => () => void} bind  first-gesture start, click
 *   feedback, dice landing, probe bands and event cards; returns unbind
 * @property {(game: any) => () => void} attach  turn, victory and defeat cues
 *   from game.onUpdate; returns detach
 */

/**
 * @param {{ storage?: Storage|null, media?: (q: string) => { matches: boolean } }} [opts]
 * @returns {BoardAudio}
 */
export function createAudio({ storage = storageOrNull(), media = globalThis.matchMedia?.bind(globalThis) } = {}) {
  let settings = loadSettings(storage);
  let ctx = null;
  let bus = null;
  let noise = null;

  const systemReduced = () => {
    try {
      return Boolean(media?.('(prefers-reduced-motion: reduce)').matches);
    } catch {
      return false;
    }
  };
  const reduced = () => settings.reduced ?? systemReduced();
  const running = () => ctx && ctx.state === 'running';

  function applyGains() {
    if (!ctx) return;
    const g = gainsOf(settings, reduced());
    const now = ctx.currentTime;
    for (const k of ['master', ...CHANNELS]) bus[k].gain.setTargetAtTime(g[k], now, RAMP);
  }

  function noiseBuffer() {
    if (noise) return noise;
    const len = ctx.sampleRate * 2;
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  }

  /** One tone of a recipe on a bus, with its own attack and exponential release. */
  function tone(t, out, t0) {
    const start = t0 + t.at;
    const end = start + t.dur;
    const env = ctx.createGain();
    const attack = Math.min(t.attack ?? 0.005, t.dur / 2);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(t.gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    let src;
    let head = env;
    if (t.wave === 'noise') {
      src = ctx.createBufferSource();
      src.buffer = noiseBuffer();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = t.hz;
      bp.Q.value = 1.2;
      bp.connect(env);
      head = bp;
    } else {
      src = ctx.createOscillator();
      src.type = t.wave;
      src.frequency.setValueAtTime(t.hz, start);
      if (t.to) src.frequency.exponentialRampToValueAtTime(t.to, end);
    }
    if (t.cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = t.cutoff;
      lp.connect(head);
      head = lp;
    }
    src.connect(head);
    env.connect(out);
    src.start(start);
    src.stop(end + 0.02);
  }

  function play(cue) {
    if (!running() || settings.muted || !CUES.includes(cue)) return false;
    const t0 = ctx.currentTime + 0.01;
    for (const t of recipe(cue, reduced())) tone(t, bus[CUE_CHANNEL[cue]], t0);
    return true;
  }

  function resume() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch {
      return false;
    }
    const gain = (to) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(to);
      return g;
    };
    const master = gain(ctx.destination);
    bus = { master };
    for (const c of CHANNELS) bus[c] = gain(master);
    applyGains();
    return true;
  }

  function set(patch) {
    settings = normalizeSettings({ ...settings, ...(patch && typeof patch === 'object' ? patch : {}) });
    saveSettings(settings, storage);
    applyGains();
    return { ...settings };
  }

  function bind(root = globalThis.document) {
    if (!root?.addEventListener) return () => {};
    const off = [];
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      off.push(() => target.removeEventListener(type, fn, opts));
    };

    const gesture = () => resume();
    on(root, 'pointerdown', gesture, { capture: true });
    on(root, 'keydown', gesture, { capture: true });

    on(root, 'click', (e) => {
      resume();
      const cue = clickCue(e.target);
      if (cue) play(cue);
    }, { capture: true });

    // Probe verdicts and event cards come from UI modules this one does not
    // own, so they are heard from the DOM: a verdict is .pe-urteil with
    // data-band, the event card is the dialog #dlg-ereignis.
    const Observer = globalThis.MutationObserver;
    if (Observer) {
      const seen = new WeakSet();
      const obs = new Observer((records) => {
        for (const r of records) {
          if (r.type === 'attributes') {
            if (r.target.open) {
              const cue = openedCue(r.target);
              if (cue) play(cue);
            }
            continue;
          }
          for (const node of r.addedNodes) {
            if (node.nodeType !== 1) continue;
            const verdict = node.matches(VERDICT) ? node : node.querySelector(VERDICT);
            if (!verdict || seen.has(verdict)) continue;
            seen.add(verdict);
            play('dice-land');
            const cue = bandCue(verdict.dataset.band);
            if (cue) play(cue);
          }
        }
      });
      obs.observe(root.body ?? root, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
      off.push(() => obs.disconnect());
    }

    // Hidden tabs suspend cue playback.
    on(root, 'visibilitychange', () => {
      if (!ctx) return;
      if (root.hidden) ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
    });

    if (media) {
      try {
        const mq = media('(prefers-reduced-motion: reduce)');
        const change = applyGains;
        mq.addEventListener?.('change', change);
        off.push(() => mq.removeEventListener?.('change', change));
      } catch { /* no media queries, no live switch */ }
    }
    return () => { for (const fn of off.splice(0)) fn(); };
  }

  function attach(game) {
    if (!game?.onUpdate) return () => {};
    let ended = endCue(game.view, game.pid) !== null;
    return game.onUpdate((kind, detail) => {
      if (kind === 'view') {
        const end = endCue(game.view, game.pid);
        if (end && !ended) {
          ended = true;
          play(end);
          return;
        }
      }
      const cue = updateCue(kind, detail);
      if (cue) play(cue);
    });
  }

  return {
    resume,
    play,
    setVolume: (channel, value) => { if (channel === 'master' || CHANNELS.includes(channel)) set({ [channel]: value }); },
    setMuted: (muted) => { set({ muted: Boolean(muted) }); },
    setReducedMotion: (value) => { set({ reduced: typeof value === 'boolean' ? value : null }); },
    reduced,
    get settings() { return { ...settings }; },
    set,
    bind,
    attach,
  };
}

let current = null;

/**
 * Creates the board's audio once, binds it to the document and, with a game,
 * to the campaign. Later calls return the same instance and attach the game.
 * @param {{ game?: any, root?: Document }} [opts]
 * @returns {BoardAudio}
 */
export function installAudio({ game = null, root = globalThis.document } = {}) {
  if (!current) {
    current = createAudio();
    current.bind(root);
  }
  if (game) current.attach(game);
  return current;
}

/** The instance installAudio created, null before. */
export const getAudio = () => current;

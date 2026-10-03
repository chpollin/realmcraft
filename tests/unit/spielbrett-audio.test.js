// The parts of the board's audio that run without an AudioContext: viewer
// settings with their storage fallbacks, and the mapping of clicks, probe
// bands, game updates and worlds to cues, channels, moods and tones.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { AUDIO_STORE, CHANNELS, DEFAULT_SETTINGS, REDUCED_GAIN, gainsOf, loadSettings, normalizeSettings, saveSettings } from '../../spielbrett/js/audio/settings.js';
import {
  CUES, CUE_CHANNEL, DEFAULT_MOOD, MOODS, SCALES, bandCue, bellNotes, clickCue, controlOf, endCue, moodFor, moodOf, openedCue, recipe, updateCue,
} from '../../spielbrett/js/audio/cues.js';
import { BANDS } from '../../engine/schemas/common.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (Object.hasOwn(data, k) ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };

describe('settings', () => {
  test('normalize clamps volumes and drops unknown or malformed fields', () => {
    assert.deepEqual(normalizeSettings(null), { ...DEFAULT_SETTINGS });
    assert.deepEqual(normalizeSettings({ master: 2, ambience: -1, ui: 'laut', stingers: Number.NaN, muted: 'ja', reduced: 1, extra: true }),
      { master: 1, ambience: 0, ui: DEFAULT_SETTINGS.ui, stingers: DEFAULT_SETTINGS.stingers, muted: false, reduced: null });
    assert.deepEqual(normalizeSettings({ master: 0.3, muted: true, reduced: false }),
      { ...DEFAULT_SETTINGS, master: 0.3, muted: true, reduced: false });
  });

  test('settings survive a round trip through storage', () => {
    const s = memoryStorage();
    const mine = { master: 0.4, ambience: 0, ui: 1, stingers: 0.25, muted: true, reduced: true };
    assert.equal(saveSettings(mine, s), true);
    assert.deepEqual(loadSettings(s), mine);
  });

  test('blocked, missing or corrupt storage falls back to the defaults', () => {
    assert.deepEqual(loadSettings(throwing), { ...DEFAULT_SETTINGS });
    assert.deepEqual(loadSettings(null), { ...DEFAULT_SETTINGS });
    assert.deepEqual(loadSettings(memoryStorage({ [AUDIO_STORE]: '{kaputt' })), { ...DEFAULT_SETTINGS });
    assert.deepEqual(loadSettings(memoryStorage({ [AUDIO_STORE]: '"text"' })), { ...DEFAULT_SETTINGS });
    assert.equal(saveSettings(DEFAULT_SETTINGS, throwing), false);
    assert.equal(saveSettings(DEFAULT_SETTINGS, null), false);
  });

  test('mute silences the master bus, reduced intensity lowers every channel', () => {
    const s = { ...DEFAULT_SETTINGS, master: 0.5, ambience: 1, ui: 1, stingers: 1 };
    assert.deepEqual(gainsOf(s, false), { master: 0.5, ambience: 1, ui: 1, stingers: 1 });
    assert.equal(gainsOf({ ...s, muted: true }, false).master, 0);
    assert.deepEqual(gainsOf(s, true), { master: 0.5, ...REDUCED_GAIN });
    for (const c of CHANNELS) assert.ok(REDUCED_GAIN[c] < 1, c);
  });
});

// Minimal stand-in for a DOM element: what controlOf and clickCue read.
function node(tagName, { id = '', cls = [], attrs = {}, parent = null } = {}) {
  return {
    tagName, id, parentElement: parent,
    classList: { contains: (c) => cls.includes(c) },
    getAttribute: (k) => (Object.hasOwn(attrs, k) ? attrs[k] : null),
    hasAttribute: (k) => Object.hasOwn(attrs, k),
  };
}

describe('click cues', () => {
  const body = node('BODY');

  test('the dice button rolls, primary actions and Zug beenden confirm', () => {
    const roll = node('BUTTON', { cls: ['btn', 'btn-primary'], attrs: { 'data-wuerfeln': '' }, parent: body });
    assert.equal(clickCue(node('SVG', { parent: roll })), 'dice');
    assert.equal(clickCue(node('BUTTON', { cls: ['btn', 'btn-primary'], parent: body })), 'confirm');
    assert.equal(clickCue(node('BUTTON', { id: 'zug-beenden', parent: body })), 'confirm');
  });

  test('a refused control refuses, even when it is the primary action', () => {
    assert.equal(clickCue(node('BUTTON', { cls: ['btn-primary'], attrs: { 'aria-disabled': 'true' }, parent: body })), 'refuse');
    assert.equal(clickCue(node('BUTTON', { id: 'zug-beenden', attrs: { 'aria-disabled': 'true' }, parent: body })), 'refuse');
    const label = node('LABEL', { cls: ['probe-option', 'is-gesperrt'], parent: body });
    assert.equal(clickCue(node('SPAN', { parent: label })), 'refuse');
    assert.equal(clickCue(node('BUTTON', { attrs: { 'aria-disabled': 'false' }, parent: body })), 'click');
  });

  test('other controls and the map click, plain content stays silent', () => {
    assert.equal(clickCue(node('BUTTON', { cls: ['kurz'], parent: body })), 'click');
    assert.equal(clickCue(node('DIV', { attrs: { role: 'radio' }, parent: body })), 'click');
    assert.equal(clickCue(node('CANVAS', { id: 'karte', parent: body })), 'click');
    assert.equal(clickCue(node('P', { parent: body })), null);
    assert.equal(clickCue(null), null);
    assert.equal(controlOf(node('P', { parent: body })), null);
  });

  test('only the event card dialog has an opening stinger', () => {
    assert.equal(openedCue({ id: 'dlg-ereignis' }), 'event');
    assert.equal(openedCue({ id: 'dlg-probe' }), null);
  });
});

describe('game cues', () => {
  test('every probe band and every event band has an outcome cue', () => {
    for (const b of BANDS) assert.ok(CUES.includes(bandCue(b)), b);
    assert.equal(bandCue('crit_fail'), 'band-crit-fail');
    assert.equal(bandCue('crit_success'), 'band-crit-success');
    assert.deepEqual([1, 2, 3, 4, 5].map(bandCue), ['band-crit-fail', 'band-fail', 'band-narrow', 'band-success', 'band-crit-success']);
    assert.equal(bandCue('4'), 'band-success');
    for (const bad of [0, 6, 'unbekannt', null, undefined, '__proto__']) assert.equal(bandCue(bad), null, String(bad));
  });

  test('sealing ends the turn, a new season starts one, other updates are silent', () => {
    assert.equal(updateCue('sealed', { ok: true }), 'turn-end');
    assert.equal(updateCue('view', { before: { turn: 3 }, after: { turn: 4 } }), 'turn-start');
    assert.equal(updateCue('view', { before: { turn: 4 }, after: { turn: 4 } }), null);
    assert.equal(updateCue('status', {}), null);
    assert.equal(updateCue('view', undefined), null);
  });

  test('the end of a campaign is victory only for the winning player', () => {
    const ended = (result) => ({ status: 'ended', result });
    assert.equal(endCue(ended({ kind: 'victory', winner: 'talbund' }), 'talbund'), 'victory');
    assert.equal(endCue(ended({ kind: 'victory', winner: 'schaedelklan' }), 'talbund'), 'defeat');
    assert.equal(endCue(ended({ kind: 'collapse', winner: null }), 'talbund'), 'defeat');
    assert.equal(endCue({ status: 'playing', result: null }, 'talbund'), null);
    assert.equal(endCue(null, 'talbund'), null);
  });
});

describe('tones', () => {
  test('every cue runs on a channel and has tones in range, reduced never longer', () => {
    const end = (tones) => Math.max(...tones.map((t) => t.at + t.dur));
    for (const cue of CUES) {
      assert.ok(CHANNELS.includes(CUE_CHANNEL[cue]), cue);
      const full = recipe(cue);
      const low = recipe(cue, true);
      assert.ok(full.length > 0 && low.length > 0, cue);
      for (const t of [...full, ...low]) {
        assert.ok(t.at >= 0 && t.dur > 0 && t.hz > 0 && t.gain > 0 && t.gain <= 1, `${cue} ${JSON.stringify(t)}`);
        assert.ok(['sine', 'triangle', 'square', 'sawtooth', 'noise'].includes(t.wave), cue);
        if (t.to !== undefined) assert.ok(t.to > 0, cue);
      }
      assert.ok(low.length <= full.length, cue);
      assert.ok(end(low) <= end(full) + 1e-9, cue);
      assert.ok(low.every((t) => t.dur <= 0.8), cue);
    }
    assert.deepEqual(recipe('unbekannt'), []);
  });

  test('the dice rattle follows the roll animation, reduced keeps one click', () => {
    const rattle = recipe('dice');
    assert.ok(rattle.length > 5 && rattle.every((t) => t.wave === 'noise' && t.at < 0.82));
    assert.equal(recipe('dice', true).length, 1);
  });

  test('recipe hands out copies', () => {
    recipe('confirm')[0].gain = 99;
    assert.notEqual(recipe('confirm')[0].gain, 99);
  });
});

describe('world mood', () => {
  test('every mood in the table names an existing world package and is valid as it stands', () => {
    for (const [id, mood] of Object.entries(MOODS)) {
      assert.ok(existsSync(fileURLToPath(new URL(`../../welten/${id}/style.json`, import.meta.url))), id);
      assert.deepEqual(moodOf(mood), mood, id);
    }
    assert.deepEqual(moodFor('hochland'), MOODS.hochland);
  });

  test('an unknown world gets the default mood, an override wins, bad fields fall back one by one', () => {
    assert.deepEqual(moodFor('anderswo'), { ...DEFAULT_MOOD });
    assert.deepEqual(moodFor('constructor'), { ...DEFAULT_MOOD });
    assert.deepEqual(moodFor(null), { ...DEFAULT_MOOD });
    assert.deepEqual(moodFor('hochland', { root: 50, scale: 'lydian', wind: 0, bells: 3 }), { root: 50, scale: 'lydian', wind: 0, bells: 3 });
    assert.deepEqual(moodOf({ root: 99, scale: 'toString', wind: 3, bells: 1.5 }),
      { root: DEFAULT_MOOD.root, scale: DEFAULT_MOOD.scale, wind: 3, bells: DEFAULT_MOOD.bells });
  });

  test('bells span two octaves of the scale above the drone', () => {
    const notes = bellNotes(MOODS.hochland);
    assert.equal(notes.length, SCALES.dorian.length * 2);
    assert.ok(notes.every((f, i) => i === 0 || f > notes[i - 1]));
  });
});

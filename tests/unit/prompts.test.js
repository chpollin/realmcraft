// Unit tests for the parts of js/images/prompts.js that are UI text or
// selection logic rather than key material (keys are pinned in keys.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bildVersLabel, kontextHauch, aktiverKarteStand, siedlungenAus } from '../../js/images/prompts.js';

test('bildVersLabel: version number and season, separated by a comma', () => {
  assert.equal(bildVersLabel({ meta: { zeit: { jahreszeit: 'Herbst', jahr: 2 } } }, 3), 'Stand 3, Herbst 2');
  assert.equal(bildVersLabel({ meta: {} }, 1), 'Stand 1');
});

test('kontextHauch: season mood, year and chapter, empty without time', () => {
  assert.equal(
    kontextHauch({ meta: { zeit: { jahreszeit: 'Winter', jahr: 4 }, kapitel: 3 } }),
    'Zeitpunkt der Szene: Winter, karge und harte Zeit, Jahr 4, Kapitel III',
  );
  assert.equal(kontextHauch({ meta: {} }), '');
});

test('aktiverKarteStand: picked stand, else aktuellerStand, else the newest', () => {
  const state = { karte: { aktuellerStand: 'b', chronik: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } };
  assert.equal(aktiverKarteStand(state, 'a').id, 'a');
  assert.equal(aktiverKarteStand(state, null).id, 'b');
  assert.equal(aktiverKarteStand({ karte: { chronik: state.karte.chronik } }, 'x').id, 'c');
  assert.equal(aktiverKarteStand({ karte: {} }, null), null);
});

test('siedlungenAus: the list wins; the legacy object is returned itself', () => {
  const alt = { name: 'Alt' };
  assert.deepEqual(siedlungenAus({ lebenswelt: { siedlungen: [{ name: 'Neu' }] }, siedlung: alt }), [{ name: 'Neu' }]);
  assert.equal(siedlungenAus({ siedlung: alt })[0], alt);
  assert.deepEqual(siedlungenAus({}), []);
});

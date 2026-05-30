// Unit-Tests fuer das JSON-Schema schema/savegame.schema.json.
// Validiert die kanonische Fixture (gueltig) und mehrere kaputte Klone (ungueltig)
// mit Ajv. Dieser Test prueft das Schema selbst, nicht den Parser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const schema = JSON.parse(
  readFileSync(join(repoRoot, 'schema', 'savegame.schema.json'), 'utf8'),
);
const validJson = readFileSync(
  join(repoRoot, 'examples', 'die-karren-kapitel-3.json'),
  'utf8',
);
const validData = JSON.parse(validJson);

function makeValidator() {
  const ajv = new Ajv({ allErrors: true });
  return ajv.compile(schema);
}

// Liefert immer eine frische, gueltige Kopie der Fixture.
function clone() {
  return JSON.parse(validJson);
}

test('Schema kompiliert und akzeptiert die kanonische Fixture', () => {
  const validate = makeValidator();
  const ok = validate(validData);
  assert.equal(ok, true, JSON.stringify(validate.errors));
});

test('kaputter Klon: loyalitaet 7 ueberschreitet maximum 5', () => {
  const validate = makeValidator();
  const data = clone();
  data.berater[0].loyalitaet = 7;
  assert.equal(validate(data), false);
});

test('kaputter Klon: loyalitaet -9 unterschreitet minimum -5', () => {
  const validate = makeValidator();
  const data = clone();
  data.berater[0].loyalitaet = -9;
  assert.equal(validate(data), false);
});

test('kaputter Klon: fehlendes required-Feld grundgroessen', () => {
  const validate = makeValidator();
  const data = clone();
  delete data.grundgroessen;
  assert.equal(validate(data), false);
});

test('kaputter Klon: jahreszeit "Juli" nicht im enum', () => {
  const validate = makeValidator();
  const data = clone();
  data.meta.zeit.jahreszeit = 'Juli';
  assert.equal(validate(data), false);
});

test('kaputter Klon: weltereignis ausserhalb des enum', () => {
  const validate = makeValidator();
  const data = clone();
  data.meta.weltereignis = 'vielleicht';
  assert.equal(validate(data), false);
});

test('kaputter Klon: schemaVersion als String statt integer', () => {
  const validate = makeValidator();
  const data = clone();
  data.schemaVersion = '1';
  assert.equal(validate(data), false);
});

test('kaputter Klon: kapitel als Float statt integer', () => {
  const validate = makeValidator();
  const data = clone();
  data.meta.kapitel = 3.5;
  assert.equal(validate(data), false);
});

test('kaputter Klon: grundgroessen.nahrung als String', () => {
  const validate = makeValidator();
  const data = clone();
  data.grundgroessen.nahrung = 'acht';
  assert.equal(validate(data), false);
});

test('kaputter Klon: berater ist kein Array', () => {
  const validate = makeValidator();
  const data = clone();
  data.berater = { id: 'x', name: 'X', loyalitaet: 0 };
  assert.equal(validate(data), false);
});

test('kaputter Klon: berater-Eintrag ohne required name', () => {
  const validate = makeValidator();
  const data = clone();
  delete data.berater[0].name;
  assert.equal(validate(data), false);
});

test('kaputter Klon: ungueltiges id-Pattern (Grossbuchstaben/Leerzeichen)', () => {
  const validate = makeValidator();
  const data = clone();
  data.berater[0].id = 'Hat Leerzeichen';
  assert.equal(validate(data), false);
});

test('kaputter Klon: fehlendes maechte', () => {
  const validate = makeValidator();
  const data = clone();
  delete data.maechte;
  assert.equal(validate(data), false);
});

test('kaputter Klon: leeres Objekt erfuellt keine required-Felder', () => {
  const validate = makeValidator();
  assert.equal(validate({}), false);
});

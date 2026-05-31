// Unit-Tests fuer das JSON-Schema schema/savegame.schema.json.
// Validiert die kanonische Fixture (gueltig) und mehrere kaputte Klone (ungueltig)
// mit Ajv. Dieser Test prueft das Schema selbst, nicht den Parser.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

// Jeder committete Beispielstand muss schema-konform bleiben, nicht nur Kapitel 3.
// So sind auch die neueren Felder (runde, trends, setzungen, lebensstand) in
// kapitel-4 und die-ordnenden-kapitel-1 abgedeckt.
const exampleDir = join(repoRoot, 'examples');
for (const file of readdirSync(exampleDir).filter((f) => f.endsWith('.json'))) {
  test(`Beispielstand ${file} ist schema-konform`, () => {
    const validate = makeValidator();
    const data = JSON.parse(readFileSync(join(exampleDir, file), 'utf8'));
    assert.equal(validate(data), true, JSON.stringify(validate.errors));
  });
}

// Der live geschriebene Stand (gitignoriert) wird mitgeprueft, falls vorhanden —
// CLAUDE.md verlangt Schema-Konformitaet fuer den Terminal-Stand. Ohne laufende
// Partie ist nichts zu pruefen, daher sauberes Ueberspringen.
test('savegame.json (falls vorhanden) ist schema-konform', () => {
  const p = join(repoRoot, 'savegame.json');
  if (!existsSync(p)) return;
  const validate = makeValidator();
  const data = JSON.parse(readFileSync(p, 'utf8'));
  assert.equal(validate(data), true, JSON.stringify(validate.errors));
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

// Lebenswelt ist optional und bricht einen bestehenden Stand nicht; ein
// vollständiger Lebenswelt-Block (Bevölkerung + Siedlungen) muss schema-konform
// sein. Lebenswelt ist der Oberbegriff: die Bevölkerung und mehrere Siedlungen.
test('Lebenswelt fehlt: Klon bleibt gueltig', () => {
  const validate = makeValidator();
  const data = clone();
  delete data.lebenswelt;
  assert.equal(validate(data), true, JSON.stringify(validate.errors));
});

test('Lebenswelt mit Bevoelkerung und mehreren Siedlungen ist gueltig', () => {
  const validate = makeValidator();
  const data = clone();
  data.lebenswelt = {
    leben: {
      stimmung: 'angespannt, aber entschlossen',
      nahrung: 'Fisch und Strandgut',
      trinken: 'Quellwasser aus den Klippen',
      glaube: 'die Meeresgeister besänftigen',
      alltag: 'Bergung und Wiederaufbau',
      braeuche: ['Totenwache am Strand'],
    },
    siedlungen: [
      {
        name: 'Strandlager',
        hauptstadt: true,
        typ: 'Hauptstadt',
        lage: 'an einer windigen Bucht',
        beschreibung: 'Hütten aus Treibholz.',
        bauten: ['Notunterkünfte', 'Feuerstelle'],
        eigenschaften: [{ key: 'Schutz', value: -1 }],
        bild: { cacheKey: 's1' },
      },
      { name: 'Klippenposten', typ: 'Außenposten' },
    ],
  };
  assert.equal(validate(data), true, JSON.stringify(validate.errors));
});

test('kaputter Klon: lebenswelt.siedlungen-Eintrag ohne required name', () => {
  const validate = makeValidator();
  const data = clone();
  data.lebenswelt = { siedlungen: [{ typ: 'Außenposten' }] };
  assert.equal(validate(data), false);
});

// Karten-Chronik ist optional und abwärtskompatibel: fehlt sie, bleibt der
// Stand gültig; ein vollständiger Chronik-Eintrag (mit basiertAuf-Verkettung)
// muss schema-konform sein, ein Eintrag ohne id ungültig.
test('Karten-Chronik mit aktuellerStand und verketteten Staenden ist gueltig', () => {
  const validate = makeValidator();
  const data = clone();
  data.karte = data.karte || {};
  data.karte.aktuellerStand = 'fruehling-j2';
  data.karte.chronik = [
    { id: 'gruendung-j1', zeit: 'Fruehling Jahr 1', anlass: 'Landung', basiertAuf: null, prompt: 'Ur-Karte', bildCacheKey: '' },
    { id: 'fruehling-j2', zeit: 'Fruehling Jahr 2', anlass: 'Sturm droht', basiertAuf: 'gruendung-j1', prompt: 'Entwickle weiter' },
  ];
  assert.equal(validate(data), true, JSON.stringify(validate.errors));
});

test('kaputter Klon: karte.chronik-Eintrag ohne required id', () => {
  const validate = makeValidator();
  const data = clone();
  data.karte = data.karte || {};
  data.karte.chronik = [{ zeit: 'Fruehling Jahr 1', prompt: 'x' }];
  assert.equal(validate(data), false);
});

// Unit-Tests fuer js/parse.js — geschrieben VOR der Implementierung (rot ist gewollt).
// Vertrag: docs/Frontend-Contract.md, Abschnitt "js/parse.js".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  extractJsonBlock,
  parseSavegame,
  validateSavegame,
} from '../../js/parse.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const mdText = readFileSync(
  join(repoRoot, 'examples', 'die-karren-kapitel-3.md'),
  'utf8',
);
const jsonText = readFileSync(
  join(repoRoot, 'examples', 'die-karren-kapitel-3.json'),
  'utf8',
);
const fixtureData = JSON.parse(jsonText);

// Hilfsfunktion: tiefe Kopie der gueltigen Fixture, danach gezielt kaputtmachen.
function cloneFixture() {
  return JSON.parse(jsonText);
}

test('extractJsonBlock: zieht den ersten ```json-Codeblock aus Hybrid-Markdown', () => {
  const block = extractJsonBlock(mdText);
  assert.equal(typeof block, 'string');
  // Der extrahierte Block muss fuer sich genommen gueltiges JSON sein …
  const parsed = JSON.parse(block);
  // … und inhaltlich dem reinen JSON-Stand entsprechen.
  assert.deepEqual(parsed, fixtureData);
});

test('extractJsonBlock: nimmt nur den ersten Block bei mehreren', () => {
  const text =
    'Vorlauf\n\n```json\n{ "a": 1 }\n```\n\nText\n\n```json\n{ "b": 2 }\n```\n';
  const block = extractJsonBlock(text);
  assert.deepEqual(JSON.parse(block), { a: 1 });
});

test('extractJsonBlock: gibt null zurueck, wenn kein ```json-Block existiert', () => {
  assert.equal(extractJsonBlock('Nur Prosa, kein Codeblock.'), null);
  // Ein generischer Codeblock ohne json-Sprachkennung zaehlt nicht.
  assert.equal(extractJsonBlock('```\n{ "a": 1 }\n```'), null);
});

test('parseSavegame: Hybrid-Markdown und reines JSON liefern tief gleiches data', () => {
  const fromMd = parseSavegame(mdText);
  const fromJson = parseSavegame(jsonText);

  assert.equal(fromMd.ok, true, fromMd.error);
  assert.equal(fromJson.ok, true, fromJson.error);

  // Kernforderung der Aufgabe: deepStrictEqual ueber beide Pfade.
  assert.deepStrictEqual(fromMd.data, fromJson.data);
  // Und beide entsprechen der kanonischen Fixture.
  assert.deepStrictEqual(fromJson.data, fixtureData);
});

test('parseSavegame: reines JSON wird akzeptiert', () => {
  const res = parseSavegame(jsonText);
  assert.equal(res.ok, true);
  assert.equal(res.data.volk.name, 'Die Karren');
});

test('parseSavegame: Muell liefert ok:false mit lesbarer error', () => {
  const res = parseSavegame('das ist weder JSON noch ein json-Block {{{');
  assert.equal(res.ok, false);
  assert.equal(typeof res.error, 'string');
  assert.ok(res.error.length > 0, 'error sollte eine lesbare Meldung tragen');
  assert.equal(res.data, undefined);
});

test('parseSavegame: syntaktisch kaputter ```json-Block liefert ok:false', () => {
  const res = parseSavegame('```json\n{ "a": 1, }\n```');
  assert.equal(res.ok, false);
  assert.equal(typeof res.error, 'string');
});

test('parseSavegame: strukturell ungueltiger Stand liefert ok:false mit error', () => {
  const broken = cloneFixture();
  broken.berater[0].loyalitaet = 7; // ausserhalb -5..5
  const res = parseSavegame(JSON.stringify(broken));
  assert.equal(res.ok, false);
  assert.equal(typeof res.error, 'string');
});

test('validateSavegame: gueltige Fixture ist valid:true ohne Fehler', () => {
  const res = validateSavegame(fixtureData);
  assert.equal(res.valid, true);
  assert.ok(Array.isArray(res.errors));
  assert.equal(res.errors.length, 0);
});

test('validateSavegame: loyalitaet 7 (ausserhalb -5..5) ist valid:false', () => {
  const broken = cloneFixture();
  broken.berater[0].loyalitaet = 7;
  const res = validateSavegame(broken);
  assert.equal(res.valid, false);
  assert.ok(res.errors.length > 0);
});

test('validateSavegame: fehlendes grundgroessen ist valid:false', () => {
  const broken = cloneFixture();
  delete broken.grundgroessen;
  const res = validateSavegame(broken);
  assert.equal(res.valid, false);
  assert.ok(res.errors.length > 0);
});

test('validateSavegame: jahreszeit "Juli" (nicht im Enum) ist valid:false', () => {
  const broken = cloneFixture();
  broken.meta.zeit.jahreszeit = 'Juli';
  const res = validateSavegame(broken);
  assert.equal(res.valid, false);
  assert.ok(res.errors.length > 0);
});

test('validateSavegame: berater muss ein Array sein', () => {
  const broken = cloneFixture();
  broken.berater = 'kein Array';
  const res = validateSavegame(broken);
  assert.equal(res.valid, false);
});

test('validateSavegame: maechte muss ein Array sein', () => {
  const broken = cloneFixture();
  delete broken.maechte;
  const res = validateSavegame(broken);
  assert.equal(res.valid, false);
});

test('validateSavegame: grundgroessen-Werte muessen Zahlen sein', () => {
  const broken = cloneFixture();
  broken.grundgroessen.nahrung = '8';
  const res = validateSavegame(broken);
  assert.equal(res.valid, false);
});

test('validateSavegame: lagewerte-Werte muessen Zahlen sein', () => {
  const broken = cloneFixture();
  broken.lagewerte.verteidigung = null;
  const res = validateSavegame(broken);
  assert.equal(res.valid, false);
});

test('validateSavegame: schemaVersion muss eine Zahl sein', () => {
  const broken = cloneFixture();
  broken.schemaVersion = 'eins';
  const res = validateSavegame(broken);
  assert.equal(res.valid, false);
});

test('validateSavegame: berater-Eintrag ohne id/name/loyalitaet ist valid:false', () => {
  const broken = cloneFixture();
  broken.berater.push({ rolle: 'Niemand' });
  const res = validateSavegame(broken);
  assert.equal(res.valid, false);
});

test('validateSavegame: nicht-Objekt (null) ist valid:false', () => {
  const res = validateSavegame(null);
  assert.equal(res.valid, false);
  assert.ok(res.errors.length > 0);
});

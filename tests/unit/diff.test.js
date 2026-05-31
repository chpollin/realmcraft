// tests/unit/diff.test.js — Delta zwischen zwei Staenden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffStates } from '../../js/diff.js';

test('ohne Vorgaenger gibt es kein Delta', () => {
  const r = diffStates(null, { meta: { kapitel: 4 } });
  assert.equal(r.isFirst, true);
  assert.equal(r.hasChanges, false);
  assert.deepEqual(r.eintraege, []);
});

test('Kapitelwechsel wird erkannt', () => {
  const r = diffStates({ meta: { kapitel: 3 } }, { meta: { kapitel: 4 } });
  assert.equal(r.hasChanges, true);
  const e = r.eintraege.find((x) => x.art === 'kapitel');
  assert.ok(e);
  assert.equal(e.from, 3);
  assert.equal(e.to, 4);
  assert.equal(e.richtung, 'up');
});

test('Grundgroessen-Delta inkl. Objektfeld bevoelkerung', () => {
  const prev = { grundgroessen: { nahrung: 8, wissen: 16, bevoelkerung: { zahl: 400 } } };
  const next = { grundgroessen: { nahrung: 6, wissen: 18, bevoelkerung: { zahl: 450 } } };
  const r = diffStates(prev, next);
  const nahrung = r.eintraege.find((x) => x.key === 'nahrung');
  const wissen = r.eintraege.find((x) => x.key === 'wissen');
  const bev = r.eintraege.find((x) => x.key === 'bevoelkerung');
  assert.equal(nahrung.delta, -2);
  assert.equal(nahrung.richtung, 'down');
  assert.equal(wissen.delta, 2);
  assert.equal(bev.from, 400);
  assert.equal(bev.to, 450);
});

test('Loyalitaet, neuer und abgegangener Berater', () => {
  const prev = { berater: [{ id: 'borka', name: 'Borka', loyalitaet: 5 }, { id: 'idr', name: 'Idr', loyalitaet: 5 }] };
  const next = { berater: [{ id: 'borka', name: 'Borka', loyalitaet: 3 }, { id: 'tova', name: 'Tova', loyalitaet: 4 }] };
  const r = diffStates(prev, next);
  assert.ok(r.eintraege.find((x) => x.art === 'loyalitaet' && x.delta === -2));
  assert.ok(r.eintraege.find((x) => x.art === 'berater-neu' && x.label.includes('Tova')));
  assert.ok(r.eintraege.find((x) => x.art === 'berater-weg' && x.label.includes('Idr')));
});

test('neue Setzung und neuer Ort', () => {
  const prev = { setzungen: [{ titel: 'Lebensstand' }], karte: { orte: [{ id: 'a', name: 'A' }] } };
  const next = { setzungen: [{ titel: 'Lebensstand' }, { titel: 'Nachfolge' }], karte: { orte: [{ id: 'a', name: 'A' }, { id: 'b', name: 'Suedviertel' }] } };
  const r = diffStates(prev, next);
  assert.ok(r.eintraege.find((x) => x.art === 'setzung-neu' && x.label.includes('Nachfolge')));
  assert.ok(r.eintraege.find((x) => x.art === 'ort-neu' && x.label.includes('Suedviertel')));
});

test('identische Staende ergeben kein Delta', () => {
  const s = { meta: { kapitel: 4 }, grundgroessen: { nahrung: 8 } };
  const r = diffStates({ ...s }, { ...s });
  assert.equal(r.hasChanges, false);
  assert.equal(r.eintraege.length, 0);
});

test('Lagewert-Delta wird erkannt', () => {
  const prev = { lagewerte: { verteidigung: 2, mobilitaet: 0, wohlstand: 1 } };
  const next = { lagewerte: { verteidigung: 4, mobilitaet: 0, wohlstand: 1 } };
  const e = diffStates(prev, next).eintraege.find((x) => x.art === 'lagewert' && x.key === 'verteidigung');
  assert.ok(e);
  assert.equal(e.delta, 2);
  assert.equal(e.richtung, 'up');
});

test('Ansehen-Stufenwechsel wird erkannt', () => {
  const prev = { status: { ansehen: { stufe: 1 } } };
  const next = { status: { ansehen: { stufe: 2 } } };
  const e = diffStates(prev, next).eintraege.find((x) => x.art === 'ansehen');
  assert.ok(e);
  assert.equal(e.from, 1);
  assert.equal(e.to, 2);
  assert.equal(e.richtung, 'up');
});

test('weggefallener Ort wird erkannt', () => {
  const prev = { karte: { orte: [{ id: 'a', name: 'Altdorf' }, { id: 'b', name: 'Brunnen' }] } };
  const next = { karte: { orte: [{ id: 'a', name: 'Altdorf' }] } };
  const e = diffStates(prev, next).eintraege.find((x) => x.art === 'ort-weg');
  assert.ok(e);
  assert.ok(e.label.includes('Brunnen'));
  assert.equal(e.richtung, 'down');
});

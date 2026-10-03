// Data side of the game shell: the new game request, the rules reference
// built from regeln.json and the kernel, the end screen from the outcome in
// the view, and the motion choice.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validSeed, newGameBody, defaultForm } from '../../spielbrett/js/ui/start.js';
import { rulesData } from '../../spielbrett/js/ui/regeln.js';
import { outcomeOf, endData } from '../../spielbrett/js/ui/ende.js';
import { motionAttr } from '../../spielbrett/js/ui/einstellungen.js';
import { registry } from '../../engine/core/orders.js';

const regeln = JSON.parse(readFileSync(new URL('../../welten/hochland/regeln.json', import.meta.url), 'utf8'));
const world = {
  id: 'hochland',
  templates: regeln.peopleTemplates.map((x) => ({ id: x.id, name: x.name })),
  languages: ['de', 'en'],
  difficulties: ['easy', 'normal', 'hard'],
  defaultDifficulty: 'normal',
};

describe('new game request', () => {
  test('a seed is an unsigned 32-bit integer written in digits', () => {
    for (const s of ['0', '7', ' 42 ', '4294967295']) assert.equal(validSeed(s), true, s);
    for (const s of ['', '-1', '4294967296', '1e3', 'seven', '3.5', '12345678901']) assert.equal(validSeed(s), false, s);
  });

  test('the body names the chosen people, its rivals in template order and the settings', () => {
    const body = newGameBody({ seed: '7', people: 'talbund', rivals: ['schaedelklan', 'bergnomaden', 'talbund'], difficulty: 'hard', language: 'en' }, world);
    assert.deepEqual(body, { world: 'hochland', seed: 7, people: 'talbund', rivals: ['bergnomaden', 'schaedelklan'], difficulty: 'hard', language: 'en' });
  });

  test('a form without rival, with a bad seed or an unknown people is not sent', () => {
    const base = { seed: '7', people: 'talbund', rivals: ['bergnomaden'], difficulty: 'normal', language: 'de' };
    assert.ok(newGameBody(base, world));
    assert.equal(newGameBody({ ...base, rivals: ['talbund'] }, world), null);
    assert.equal(newGameBody({ ...base, seed: '-3' }, world), null);
    assert.equal(newGameBody({ ...base, people: 'nordvolk' }, world), null);
    assert.equal(newGameBody(base, null), null);
  });

  test('unknown difficulty and language fall back to normal and the package locale', () => {
    const body = newGameBody({ seed: '1', people: 'bergnomaden', rivals: ['talbund'], difficulty: 'brutal', language: 'fr' }, world);
    assert.equal(body.difficulty, 'normal');
    assert.equal(body.language, 'de');
  });

  test('defaults pick the first template, every other one as rival and the UI language when the world narrates in it', () => {
    const f = defaultForm(world, 'en', 99);
    assert.deepEqual(f, { seed: '99', people: 'bergnomaden', rivals: ['schaedelklan', 'talbund'], difficulty: 'normal', language: 'en' });
    assert.equal(defaultForm({ ...world, languages: ['de'] }, 'en', 1).language, 'de');
  });
});

describe('rules reference', () => {
  const data = rulesData(regeln);

  test('seasons and slot capacity come from the world rules', () => {
    assert.deepEqual(data.seasons.map((s) => s.id), regeln.calendar.seasons.map((s) => s.id));
    assert.deepEqual(data.seasons.filter((s) => s.winter).map((s) => s.id), ['winter']);
    assert.deepEqual(data.capacity, regeln.tuning.slots);
  });

  test('every registered order sits in exactly one slot group', () => {
    const listed = Object.values(data.slots).flat().map((o) => o.type).sort();
    assert.deepEqual(listed, Object.keys(registry()).sort());
    assert.ok(data.slots.main.some((o) => o.type === 'build'));
    assert.ok(data.slots.free.some((o) => o.type === 'research.assign'));
  });

  test('probe bands follow the kernel band rule', () => {
    const at = (m) => data.margins.find((x) => x.margin === m).band;
    assert.equal(at(0), 'narrow');
    assert.equal(at(1), 'success');
    assert.equal(at(4), 'crit_success');
    assert.equal(at(-1), 'failure');
    assert.equal(at(-4), 'setback');
    assert.deepEqual(data.naturals, [{ roll: 1, band: 'crit_fail' }, { roll: 10, band: 'crit_success' }]);
    assert.deepEqual(data.events.map((e) => e.band), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  test('paths and their tier thresholds come from the pfade block', () => {
    assert.deepEqual(data.pfade.paths.map((p) => p.id), regeln.pfade.paths.map((p) => p.id));
    assert.deepEqual(data.pfade.paths.filter((p) => p.opens).map((p) => p.id), ['magie']);
    assert.deepEqual(data.pfade.unlock.map((u) => u.tier), Array.from({ length: regeln.tuning.maxTier }, (_, i) => i + 1));
    assert.equal(rulesData({ ...regeln, pfade: undefined }).pfade, null);
  });
});

describe('end screen', () => {
  const names = {
    people: (id) => ({ p: 'Graue Kämme', r: 'Talbund' })[id] ?? id,
    development: (ref) => `dev ${ref}`,
    region: (id) => `region ${id}`,
    time: (turn) => `turn ${turn}`,
  };
  const outcome = (o) => ({
    kind: 'victory', winner: 'p', won: true, turn: 3, reason: 'x',
    summary: {
      turns: 4, worldYear: 1, year: 1, population: 5, regions: 2, settlements: 1,
      achievements: { nahrung: 2, magie: 0 },
      destiny: { ref: 'd@1', name: 'Überdauern', reached: 4, of: 4 },
      highlights: ['e2', 'gone', 'e1'],
    },
    ...o,
  });
  const view = (o, extra = {}) => ({
    status: 'ended', people: 'p', turn: 3, result: o ? { kind: o.kind, winner: o.winner, turn: 3, reason: 'x' } : null,
    derived: { p: { outcome: o } },
    chronicle: [
      { id: 'e1', turn: 1, kind: 'research.completed', target: { kind: 'people', id: 'p' }, refs: ['herde@1'] },
      { id: 'e2', turn: 2, kind: 'map.control', target: { kind: 'region', id: 'r7' }, refs: [] },
    ],
    ...extra,
  });

  test('a running campaign has no outcome', () => {
    assert.equal(outcomeOf({ status: 'playing', people: 'p' }), null);
    assert.equal(endData({ status: 'playing', people: 'p' }, names), null);
  });

  test('victory shows the destiny, the summary and the highlights in the order the kernel gave', () => {
    const d = endData(view(outcome()), names);
    assert.equal(d.variant, 'victory');
    assert.match(d.sub, /Überdauern/);
    assert.equal(d.time, 'turn 3');
    assert.deepEqual(d.stats.map((s) => s.id), ['turns', 'population', 'regions', 'settlements', 'destiny']);
    assert.equal(d.stats.find((s) => s.id === 'destiny').value, '4/4');
    assert.deepEqual(d.paths.map((p) => [p.id, p.value]), [['nahrung', 2], ['magie', 0]]);
    assert.deepEqual(d.highlights.map((h) => h.id), ['e2', 'e1']);
    assert.match(d.highlights[0].text, /region r7/);
    assert.match(d.highlights[1].text, /dev herde@1/);
  });

  test('a rival victory and a collapse are defeats naming who won or fell', () => {
    const rival = endData(view(outcome({ winner: 'r', won: false })), names);
    assert.equal(rival.variant, 'rival');
    assert.match(rival.sub, /Talbund/);
    const fall = endData(view(outcome({ kind: 'collapse', winner: null, won: false })), names);
    assert.equal(fall.variant, 'collapse');
    assert.match(fall.sub, /Graue Kämme/);
  });

  test('a campaign that ended before the derived outcome keeps its verdict from the result', () => {
    const d = endData(view(null, { derived: {}, result: { kind: 'victory', winner: 'p', turn: 2, reason: 'x' } }), names);
    assert.equal(d.variant, 'victory');
    assert.deepEqual(d.stats, []);
    assert.deepEqual(d.highlights, []);
  });
});

test('the motion choice maps to the html attribute, null follows the system', () => {
  assert.equal(motionAttr(true), 'reduced');
  assert.equal(motionAttr(false), 'full');
  assert.equal(motionAttr(null), null);
});

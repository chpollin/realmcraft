import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarOf, seasonsPerYear, yearOf } from '../../../engine/core/calendar.js';
import { REGELN } from '../../fixtures/engine/k1/pack.js';

const four = (startSeason, startYear = 1) => ({
  calendar: { ...REGELN.calendar, startSeason, startYear },
});

test('seasons run through the calendar and wrap into the next year', () => {
  const ids = [0, 1, 2, 3, 4, 5, 8].map((t) => calendarOf(REGELN, t).season);
  assert.deepEqual(ids, ['fruehling', 'sommer', 'herbst', 'winter', 'fruehling', 'sommer', 'fruehling']);
});

test('start season spring: turn 0 is the first day of year 1', () => {
  assert.deepEqual(calendarOf(REGELN, 0), {
    turn: 0, year: 1, worldYear: 0, seasonIndex: 0, season: 'fruehling', winter: false, yearEnd: false,
  });
});

test('winter and yearEnd coincide on the last season of the calendar year', () => {
  const c = calendarOf(REGELN, 3);
  assert.equal(c.season, 'winter');
  assert.equal(c.winter, true);
  assert.equal(c.yearEnd, true);
  assert.equal(c.year, 1);
  for (const t of [0, 1, 2, 4, 5, 6]) {
    const x = calendarOf(REGELN, t);
    assert.equal(x.winter, false, `turn ${t}`);
    assert.equal(x.yearEnd, false, `turn ${t}`);
  }
});

test('year and worldYear step up together when the start is the first season', () => {
  for (const [turn, year, worldYear] of [[3, 1, 0], [4, 2, 1], [7, 2, 1], [8, 3, 2], [40, 11, 10]]) {
    const c = calendarOf(REGELN, turn);
    assert.equal(c.year, year, `year of turn ${turn}`);
    assert.equal(c.worldYear, worldYear, `worldYear of turn ${turn}`);
  }
});

test('start season autumn: the calendar year rolls over after winter, worldYear counts whole years since the start', () => {
  const r = four('herbst', 100);
  const rows = [0, 1, 2, 3, 4, 5, 6].map((t) => calendarOf(r, t));
  assert.deepEqual(rows.map((c) => c.season), ['herbst', 'winter', 'fruehling', 'sommer', 'herbst', 'winter', 'fruehling']);
  assert.deepEqual(rows.map((c) => c.year), [100, 100, 101, 101, 101, 101, 102]);
  assert.deepEqual(rows.map((c) => c.worldYear), [0, 0, 0, 0, 1, 1, 1]);
  assert.deepEqual(rows.map((c) => c.winter), [false, true, false, false, false, true, false]);
  assert.deepEqual(rows.map((c) => c.yearEnd), [false, true, false, false, false, true, false]);
  assert.deepEqual(rows.map((c) => c.seasonIndex), [2, 3, 0, 1, 2, 3, 0]);
});

test('start season winter: turn 0 already is a year end', () => {
  const c = calendarOf(four('winter', 5), 0);
  assert.equal(c.season, 'winter');
  assert.equal(c.winter, true);
  assert.equal(c.yearEnd, true);
  assert.equal(c.year, 5);
  assert.equal(calendarOf(four('winter', 5), 1).year, 6);
});

test('start season summer: yearEnd falls two turns in', () => {
  const r = four('sommer');
  assert.deepEqual([0, 1, 2, 3].map((t) => calendarOf(r, t).yearEnd), [false, false, true, false]);
  assert.equal(calendarOf(r, 2).season, 'winter');
});

test('an unknown start season falls back to the first season', () => {
  assert.equal(calendarOf(four('mittsommer'), 0).season, 'fruehling');
});

test('calendars with another season count: two seasons, only the second is winter', () => {
  const r = { calendar: { seasons: [{ id: 'a' }, { id: 'b', winter: true }], startYear: 10, startSeason: 'a' } };
  assert.equal(seasonsPerYear(r), 2);
  assert.deepEqual([0, 1, 2, 3].map((t) => calendarOf(r, t).season), ['a', 'b', 'a', 'b']);
  assert.deepEqual([0, 1, 2, 3].map((t) => calendarOf(r, t).winter), [false, true, false, true]);
  assert.deepEqual([0, 1, 2, 3].map((t) => calendarOf(r, t).year), [10, 10, 11, 11]);
  assert.deepEqual([0, 1, 2, 3].map((t) => calendarOf(r, t).worldYear), [0, 0, 1, 1]);
});

test('seasonsPerYear and yearOf', () => {
  assert.equal(seasonsPerYear(REGELN), 4);
  assert.equal(yearOf(REGELN, 0), 1);
  assert.equal(yearOf(REGELN, 4), 2);
  assert.equal(yearOf(four('herbst', 50), 2), 51);
});

test('results are integers', () => {
  for (let t = 0; t < 30; t++) {
    const c = calendarOf(four('herbst', 7), t);
    for (const k of ['turn', 'year', 'worldYear', 'seasonIndex']) assert.ok(Number.isInteger(c[k]), `${k} at ${t}`);
  }
});

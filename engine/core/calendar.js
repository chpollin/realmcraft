// Turn to calendar position. One turn is one season; the world's calendar in
// regeln.json names the seasons, marks winters and fixes the starting point.

export function calendarOf(regeln, turn) {
  const cal = regeln.calendar;
  const n = cal.seasons.length;
  const start = Math.max(0, cal.seasons.findIndex((s) => s.id === cal.startSeason));
  const abs = start + turn;
  const season = cal.seasons[abs % n];
  return {
    turn,
    year: cal.startYear + Math.floor(abs / n),
    // Whole years since the campaign began, the "world age" of the tier gates.
    worldYear: Math.floor(turn / n),
    seasonIndex: abs % n,
    season: season.id,
    winter: season.winter === true,
    // True on the last season of a calendar year (yearly limits reset after it).
    yearEnd: abs % n === n - 1,
  };
}

/** Turns per calendar year. */
export function seasonsPerYear(regeln) {
  return regeln.calendar.seasons.length;
}

/** Calendar year of a turn, for once-per-year limits. */
export function yearOf(regeln, turn) {
  return calendarOf(regeln, turn).year;
}

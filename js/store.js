// js/store.js — lokaler Verlauf der Speicherstaende ueber localStorage.
// Vertrag: docs/Frontend-Contract.md, Abschnitt js/store.js.
// Traegt Auto-Restore (letzter Stand) und Kapitel-Historie (mehrere Staende).
// Greift auf globalThis.localStorage zur Laufzeit zu; ohne Storage ist alles ein No-op.

const KEY = 'rc.history';
const MAX = 50;

function ls() {
  try {
    return typeof globalThis !== 'undefined' && globalThis.localStorage ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function readAll() {
  const s = ls();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(arr) {
  const s = ls();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(arr.slice(-MAX)));
  } catch {
    // Speicher voll oder gesperrt: still ignorieren, die App laeuft auch ohne Verlauf.
  }
}

/**
 * Legt den Stand als neuen Verlaufseintrag ab. Ist er mit dem letzten Eintrag
 * identisch (z.B. erneutes Laden derselben Datei), wird kein Duplikat erzeugt.
 * @returns {number} Index des aktuellen (ggf. bestehenden) Eintrags.
 */
export function saveSnapshot(state) {
  if (!state) return -1;
  const arr = readAll();
  const last = arr[arr.length - 1];
  if (last && JSON.stringify(last.state) === JSON.stringify(state)) {
    return arr.length - 1;
  }
  arr.push({ savedAt: Date.now(), state });
  const trimmed = arr.slice(-MAX);
  writeAll(trimmed);
  return trimmed.length - 1;
}

/** @returns {object|null} der zuletzt abgelegte Stand. */
export function loadLast() {
  const arr = readAll();
  return arr.length ? arr[arr.length - 1].state : null;
}

/** @returns {Array} kompakte Verlaufsliste fuer die Auswahl. */
export function list() {
  return readAll().map((e, i) => {
    const m = e.state?.meta || {};
    return {
      index: i,
      spielname: m.spielname || e.state?.volk?.name || 'Stand',
      kapitel: m.kapitel ?? null,
      jahreszeit: m.zeit?.jahreszeit || '',
      jahr: m.zeit?.jahr ?? null,
      savedAt: e.savedAt,
    };
  });
}

/** @returns {object|null} der Stand an Position index. */
export function getAt(index) {
  const arr = readAll();
  return arr[index] ? arr[index].state : null;
}

/** Loescht den gesamten Verlauf. */
export function clear() {
  const s = ls();
  if (!s) return;
  try {
    s.removeItem(KEY);
  } catch {
    // ignorieren
  }
}

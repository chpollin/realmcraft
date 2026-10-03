// js/store.js — lokaler Verlauf der Speicherstaende ueber localStorage.
// Vertrag: docs/Frontend-Contract.md, Abschnitt js/store.js.
// Traegt Auto-Restore (letzter Stand) und Kapitel-Historie (mehrere Staende).
// Greift auf globalThis.localStorage zur Laufzeit zu; ohne Storage ist alles ein No-op.

const KEY = 'rc.history';
const MAX = 50;

// Identitaet einer Partie: der Spielname (Fallback Volksname). Zwei Staende
// gehoeren zur selben Partie, wenn ihr Schluessel uebereinstimmt. Nur innerhalb
// einer Partie ist ein Delta sinnvoll, und nur eine Partie wird in der
// Kapitel-Historie nebeneinandergestellt.
export function gameKey(state) {
  return state?.meta?.spielname || state?.volk?.name || null;
}

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

function isQuotaError(err) {
  return !!err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22);
}

// Schreibt den Verlauf; ist das Kontingent erschoepft, fallen die aeltesten
// Eintraege weg, bis der Rest passt. Ein still gescheiterter Schreibversuch
// liess den Verlauf frueher einfrieren, und loadLast stellte dann einen
// veralteten Stand wieder her.
// @returns {Array|null} der tatsaechlich abgelegte Verlauf, null bei Fehlschlag.
function writeAll(arr) {
  let rest = arr.slice(-MAX);
  const s = ls();
  if (!s) return rest;
  while (rest.length) {
    try {
      s.setItem(KEY, JSON.stringify(rest));
      return rest;
    } catch (err) {
      if (!isQuotaError(err)) return null;
      rest = rest.slice(1);
    }
  }
  return null;
}

// Bilder liegen im Bild-Cache (IndexedDB), nicht im Verlauf: ein Export-Bundle
// mit eingebetteten dataUrls ist zig MB gross und sprengte das
// localStorage-Kontingent. Ausgenommen ist referenz.dataUrl, das Referenzfoto
// eines Beraters: es ist Eingabe, nicht Ergebnis, steckt im Portrait-Cache-
// Schluessel und liegt in keinem Cache.
function stripImages(value, parentKey) {
  if (Array.isArray(value)) return value.map((v) => stripImages(v, parentKey));
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'dataUrl' && parentKey !== 'referenz') continue;
    out[k] = stripImages(v, k);
  }
  return out;
}

// Stabile Serialisierung nur fuer den Duplikat-Vergleich: Objekt-Schluessel werden
// rekursiv sortiert, die Array-Reihenfolge bleibt erhalten (sie ist
// bedeutungstragend). So zaehlt ein inhaltlich gleicher Stand mit nur
// umgestellten Schluesseln nicht faelschlich als neuer Verlaufseintrag.
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Legt den Stand ohne eingebettete Bilder als neuen Verlaufseintrag ab. Ist er
 * mit dem letzten Eintrag identisch (z.B. erneutes Laden derselben Datei), wird
 * kein Duplikat erzeugt. Reicht der Speicher nicht, fallen aelteste Eintraege weg.
 * @returns {number} Index des aktuellen (ggf. bestehenden) Eintrags; -1, wenn
 *   kein Stand uebergeben wurde oder er nicht abgelegt werden konnte.
 */
export function saveSnapshot(state) {
  if (!state) return -1;
  const snapshot = stripImages(state);
  // Aeltere Eintraege koennen noch Bilder tragen; beim Neuschreiben mit entfernen.
  const arr = readAll().map((e) => ({ ...e, state: stripImages(e.state) }));
  const last = arr[arr.length - 1];
  // Duplikat-Schutz gegen den unmittelbar letzten Eintrag (erneutes Laden
  // derselben Datei). Ein Partiewechsel hat immer einen anderen State und legt
  // damit von selbst einen neuen Eintrag an. Der spielname wird mitgefuehrt,
  // damit lastForParty und die Historie-Auswahl nach Partie filtern koennen.
  if (last && stableStringify(last.state) === stableStringify(snapshot)) {
    return arr.length - 1;
  }
  arr.push({ savedAt: Date.now(), spielname: gameKey(state), state: snapshot });
  const written = writeAll(arr);
  return written ? written.length - 1 : -1;
}

/**
 * @param {string|null} name Partie-Schluessel (siehe gameKey).
 * @returns {object|null} der zuletzt abgelegte Stand DERSELBEN Partie, oder null.
 *   Basis fuer das Delta-Banner: nur gegen denselben Spielnamen vergleichen,
 *   nie quer ueber Partien (sonst eine sinnlose Vermischung).
 */
export function lastForParty(name) {
  const arr = readAll();
  for (let i = arr.length - 1; i >= 0; i--) {
    const k = arr[i].spielname ?? gameKey(arr[i].state);
    if ((k || null) === (name || null)) return arr[i].state;
  }
  return null;
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

/**
 * Alle gespeicherten Staende in chronologischer Reihenfolge (aeltester zuerst).
 * Fuer die Chronik: jeder gespeicherte Stand ist ein vergangener Zug.
 * @returns {object[]}
 */
export function all() {
  return readAll().map((e) => e.state);
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

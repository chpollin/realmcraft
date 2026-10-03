// js/images/cache.js — Bild-Cache: deterministischer Schluessel plus IndexedDB.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "js/images/cache.js".
// makeKey ist rein und deterministisch. cacheGet/cachePut oeffnen IndexedDB
// LAZY innerhalb der Funktionen; es gibt KEIN Top-Level-open, damit der Import
// in Node (ohne IndexedDB) nicht bricht.

const DB_NAME = 'realmcraft';
const STORE_NAME = 'images';
const DB_VERSION = 1;

// Stabiler, deterministischer Hash (FNV-1a, 32 bit) als Hex-String.
// Die Teile werden laengengepraefigt verbunden, damit Verschiebungen ueber die
// Grenze (z. B. ['ab','c'] vs ['a','bc']) nicht kollidieren.
export function makeKey(parts) {
  const list = Array.isArray(parts) ? parts : [parts];
  const joined = list
    .map((p) => {
      const s = String(p);
      return s.length + ':' + s;
    })
    .join('|');

  // FNV-1a 32-bit.
  let hash = 0x811c9dc5;
  for (let i = 0; i < joined.length; i++) {
    hash ^= joined.charCodeAt(i);
    // hash *= 16777619, in 32-bit-Arithmetik.
    hash = Math.imul(hash, 0x01000193);
  }
  // In vorzeichenlose 32-bit-Zahl und feste 8-stellige Hex-Darstellung.
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// Oeffnet die IndexedDB-Datenbank LAZY und legt den Store an.
function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB nicht verfuegbar.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// localStorage dient als durabler Spiegel: er ueberlebt eine reine
// IndexedDB-Loeschung (wie im Reload-E2E). IndexedDB bleibt der primaere,
// kapazitaere Speicher. Der Spiegel teilt sich das Kontingent mit dem Verlauf
// (rc.history, js/store.js); generierte Bilder sind MB-gross und zehrten es
// frueher auf, worauf der Verlauf still nicht mehr wuchs. Darum spiegelt er nur
// kleine Bilder und nur wenige, die aeltesten fallen zuerst. Eintraege, die der
// Index nicht fuehrt (auch Altbestand aus der Zeit ohne Begrenzung), werden
// entfernt.
const LS_PREFIX = 'realmcraft.img.';
const LS_INDEX = LS_PREFIX + 'index';
const MIRROR_MAX_CHARS = 64 * 1024;
const MIRROR_MAX_ENTRIES = 8;
let mirrorPruned = false;

function lsGet(key) {
  try {
    const v = localStorage.getItem(LS_PREFIX + key);
    return v == null ? null : v;
  } catch {
    return null;
  }
}

function lsOrder() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_INDEX) || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

// Entfernt jeden Spiegel-Eintrag ausser denen in keep. Erst sammeln, dann
// loeschen: die Reihenfolge von localStorage.key(i) ist nach removeItem nicht
// garantiert.
function pruneMirror(keep) {
  const keepSet = new Set(keep.map((k) => LS_PREFIX + k));
  const drop = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(LS_PREFIX) && k !== LS_INDEX && !keepSet.has(k)) drop.push(k);
  }
  for (const k of drop) localStorage.removeItem(k);
  mirrorPruned = true;
}

function lsPruneOnce() {
  if (mirrorPruned) return;
  try {
    pruneMirror(lsOrder());
  } catch {
    /* localStorage gesperrt: Spiegel ist optional. */
  }
}

function lsPut(key, dataUrl) {
  try {
    const order = lsOrder().filter((k) => k !== key);
    if (String(dataUrl).length <= MIRROR_MAX_CHARS) order.push(key);
    const keep = order.slice(-MIRROR_MAX_ENTRIES);
    pruneMirror(keep);
    localStorage.setItem(LS_INDEX, JSON.stringify(keep));
    if (keep.includes(key)) localStorage.setItem(LS_PREFIX + key, dataUrl);
  } catch {
    /* Quota o. Ae.: localStorage-Spiegel ist optional. */
  }
}

// Liest eine dataUrl aus dem Cache; null, wenn nicht vorhanden.
// Zuerst IndexedDB, dann der localStorage-Spiegel.
export async function cacheGet(key) {
  lsPruneOnce();
  try {
    const db = await openDb();
    try {
      const value = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result === undefined ? null : request.result);
        request.onerror = () => reject(request.error);
      });
      if (value != null) return value;
    } finally {
      db.close();
    }
  } catch {
    /* IndexedDB nicht verfuegbar/geloescht -> Spiegel versuchen. */
  }
  return lsGet(key);
}

// Schreibt eine dataUrl unter dem Schluessel in IndexedDB und den Spiegel.
export async function cachePut(key, dataUrl) {
  lsPut(key, dataUrl);
  try {
    const db = await openDb();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(dataUrl, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    /* IndexedDB optional: kleine Bilder traegt der localStorage-Spiegel. */
  }
}

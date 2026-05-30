// In-Memory-Stand mit einfachem Pub/Sub.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "js/state.js".

let current = null;
const listeners = new Set();

/** Setzt den Stand und benachrichtigt alle Abonnenten. */
export function setState(data) {
  current = data;
  // Kopie iterieren, damit ein Ab-/Anmelden während der Benachrichtigung sicher ist.
  for (const fn of [...listeners]) {
    fn(current);
  }
}

/** @returns {object|null} der aktuelle Stand. */
export function getState() {
  return current;
}

/**
 * Abonniert Änderungen. Der Callback wird bei jedem setState mit dem neuen
 * Stand gerufen (nicht sofort beim Abonnieren).
 * @returns {() => void} meldet das Abo wieder ab.
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// js/format.js — reine, DOM-freie Formatierungs- und Text-Helfer.
// Sammelt Helfer, die zuvor in mehreren Modulen Wort für Wort dupliziert waren
// (initials, roman, Vorzeichen-Formatierung). Kein Vertrags-Export: ui.js bleibt
// die feste Vertragsoberfläche (el, gauge, loyaltyMeter, statCard, modal, toast);
// dieses Modul ist ein internes, gemeinsam genutztes Hilfsmodul ohne DOM-Bezug.

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** Römische Ziffer für 1..10, sonst die Zahl als String. */
export function roman(n) {
  return ROMAN[n] || String(n);
}

/**
 * Initiale eines Namens: erstes Zeichen, Großbuchstabe, ohne führendes „Die “.
 * (Identisch in advisors.js und actors.js verwendet.)
 */
export function initials(n) {
  return (n || '?').replace(/^Die\s+/, '').trim().slice(0, 1).toUpperCase();
}

/**
 * Vorzeichen-Formatierung: positive Zahlen mit führendem „+“, 0 und negative
 * unverändert ("0", "-2", "+3"). Maßstab der Lagewerte/Loyalität/Deltas.
 */
export function signed(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

/**
 * Wie signed, aber 0 erhält ebenfalls ein „+“ ("+0"). Für den Aktions-Modifikator,
 * wo eine ausdrückliche Null als „+0“ neben „+1/-1“ in einer Reihe steht.
 */
export function signedZeroPlus(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Erster Satz eines Textes als knappe Lage-Zeile. Schneidet am ersten Satzende
 * (. ! ?) ab; fehlt eines, der ganze getrimmte Text. Über `max` Zeichen wird
 * hart mit Auslassungszeichen gekappt. Hält die Chronik knapp, statt einen
 * kumulativen Statusabsatz pro Zug zu wiederholen.
 */
export function firstSentence(text, max = 180) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  let s = m ? m[0] : t;
  if (s.length > max) s = `${s.slice(0, max - 1).trimEnd()}…`;
  return s;
}

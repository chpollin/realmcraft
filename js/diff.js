// js/diff.js — Delta zwischen zwei Speicherstaenden, rein und ohne Seiteneffekt.
// Vertrag: docs/Frontend-Contract.md, Abschnitt js/diff.js.
// Liefert eine Liste lesbarer Aenderungseintraege fuer das Delta-Banner.

const LABELS = {
  nahrung: 'Nahrung',
  material: 'Material',
  wissen: 'Wissen',
  bevoelkerung: 'Bevölkerung',
  verteidigung: 'Verteidigung',
  mobilitaet: 'Mobilität',
  wohlstand: 'Wohlstand',
};

// Zahl aus einem Feld ziehen, das eine Zahl oder ein { zahl, label }-Objekt sein kann.
function num(v) {
  if (v && typeof v === 'object') return typeof v.zahl === 'number' ? v.zahl : null;
  return typeof v === 'number' ? v : null;
}

function numEntry(art, prevObj, nextObj, key) {
  const a = num(prevObj?.[key]);
  const b = num(nextObj?.[key]);
  if (a == null || b == null || a === b) return null;
  return { art, key, label: LABELS[key] || key, from: a, to: b, delta: b - a, richtung: b > a ? 'up' : 'down' };
}

/**
 * Vergleicht zwei Speicherstaende.
 * @returns {{ hasChanges: boolean, isFirst: boolean, eintraege: Array }}
 *   isFirst ist true, wenn es keinen Vorgaenger gibt (kein Delta moeglich).
 */
export function diffStates(prev, next) {
  if (!next || !prev) return { hasChanges: false, isFirst: true, eintraege: [] };

  // Verschiedene Partien nicht vergleichen: ein Wechsel von "Die Karren" zu
  // "Die Gestrandeten" ergaebe ein sinnloses Banner (alle Berater getauscht,
  // alle Orte entfallen, jede Setzung "neu"). Nur wenn BEIDE Staende einen
  // Spielnamen tragen und der sich unterscheidet, gilt es als Erstladung der
  // neuen Partie (kein Delta). Fehlt ein Name (aeltere Staende, Tests), faellt
  // es auf den normalen Feldvergleich zurueck.
  const ga = next.meta?.spielname || next.volk?.name;
  const gb = prev.meta?.spielname || prev.volk?.name;
  if (ga && gb && ga !== gb) {
    return { hasChanges: false, isFirst: true, differentGame: true, eintraege: [] };
  }

  const eintraege = [];

  // Kapitel
  const kp = prev.meta?.kapitel;
  const kn = next.meta?.kapitel;
  if (kp != null && kn != null && kp !== kn) {
    eintraege.push({ art: 'kapitel', label: 'Kapitel', from: kp, to: kn, delta: kn - kp, richtung: kn > kp ? 'up' : 'down' });
  }

  // Grundgroessen
  for (const key of ['nahrung', 'material', 'wissen', 'bevoelkerung']) {
    const e = numEntry('grundgroesse', prev.grundgroessen, next.grundgroessen, key);
    if (e) eintraege.push(e);
  }

  // Lagewerte
  for (const key of ['verteidigung', 'mobilitaet', 'wohlstand']) {
    const e = numEntry('lagewert', prev.lagewerte, next.lagewerte, key);
    if (e) eintraege.push(e);
  }

  // Ansehen (Stufe)
  const ap = prev.status?.ansehen?.stufe;
  const an = next.status?.ansehen?.stufe;
  if (typeof ap === 'number' && typeof an === 'number' && ap !== an) {
    eintraege.push({ art: 'ansehen', label: 'Ansehen', from: ap, to: an, delta: an - ap, richtung: an > ap ? 'up' : 'down' });
  }

  // Berater: Loyalitaet, neu, weg
  const pB = new Map((prev.berater || []).map((b) => [b.id, b]));
  const nB = new Map((next.berater || []).map((b) => [b.id, b]));
  for (const [id, b] of nB) {
    if (!pB.has(id)) {
      eintraege.push({ art: 'berater-neu', label: `Neuer Berater: ${b.name}`, richtung: 'up' });
    } else {
      const a = pB.get(id).loyalitaet;
      const c = b.loyalitaet;
      if (typeof a === 'number' && typeof c === 'number' && a !== c) {
        eintraege.push({ art: 'loyalitaet', label: `Loyalität ${b.name}`, from: a, to: c, delta: c - a, richtung: c > a ? 'up' : 'down' });
      }
    }
  }
  for (const [id, b] of pB) {
    if (!nB.has(id)) eintraege.push({ art: 'berater-weg', label: `Berater abgegangen: ${b.name}`, richtung: 'down' });
  }

  // Orte: neu, weg
  const pO = new Map((prev.karte?.orte || []).map((o) => [o.id, o]));
  const nO = new Map((next.karte?.orte || []).map((o) => [o.id, o]));
  for (const [id, o] of nO) if (!pO.has(id)) eintraege.push({ art: 'ort-neu', label: `Neuer Ort: ${o.name}`, richtung: 'up' });
  for (const [id, o] of pO) if (!nO.has(id)) eintraege.push({ art: 'ort-weg', label: `Ort entfallen: ${o.name}`, richtung: 'down' });

  // Setzungen: neu (nach Titel)
  const pS = new Set((prev.setzungen || []).map((s) => s.titel));
  for (const s of next.setzungen || []) {
    if (!pS.has(s.titel)) eintraege.push({ art: 'setzung-neu', label: `Neue Setzung: ${s.titel}`, richtung: 'up' });
  }

  // Mächte: neu, weg, Beziehungswechsel. Eine gespaltene Macht (neue id auf,
  // alte ab) oder ein Beziehungsruck (z. B. -1 -> -2) blieb bisher unsichtbar.
  const pMa = new Map((prev.maechte || []).map((m) => [m.id, m]));
  const nMa = new Map((next.maechte || []).map((m) => [m.id, m]));
  for (const [id, m] of nMa) {
    if (!pMa.has(id)) {
      eintraege.push({ art: 'macht-neu', label: `Neue Macht: ${m.name}`, richtung: 'up' });
    } else {
      const a = pMa.get(id).beziehung?.wert;
      const c = m.beziehung?.wert;
      if (typeof a === 'number' && typeof c === 'number' && a !== c) {
        eintraege.push({ art: 'beziehung', label: `Beziehung ${m.name}`, from: a, to: c, delta: c - a, richtung: c > a ? 'up' : 'down' });
      }
    }
  }
  for (const [id, m] of pMa) {
    if (!nMa.has(id)) eintraege.push({ art: 'macht-weg', label: `Macht entfallen: ${m.name}`, richtung: 'down' });
  }

  // Wehr: Gesamtstärke (neu oder verändert).
  const pAr = num(prev.armee?.gesamt);
  const cAr = num(next.armee?.gesamt);
  if (pAr != null && cAr != null && pAr !== cAr) {
    eintraege.push({ art: 'armee-stat', label: 'Wehr (Gesamt)', from: pAr, to: cAr, delta: cAr - pAr, richtung: cAr > pAr ? 'up' : 'down' });
  } else if (pAr == null && cAr != null) {
    eintraege.push({ art: 'armee-neu', label: 'Streitmacht aufgestellt', richtung: 'up' });
  }

  // Trends: ein Richtungswechsel je Grundgröße (steigend/fallend/gleichbleibend).
  const pTr = prev.trends || {};
  const nTr = next.trends || {};
  for (const key of Object.keys(nTr)) {
    const a = pTr[key]?.richtung;
    const c = nTr[key]?.richtung;
    if (a && c && a !== c) {
      eintraege.push({ art: 'trend', label: `Trend ${LABELS[key] || key}: ${a} → ${c}`, richtung: c === 'steigend' ? 'up' : c === 'fallend' ? 'down' : 'flat' });
    }
  }

  return { hasChanges: eintraege.length > 0, isFirst: false, eintraege };
}

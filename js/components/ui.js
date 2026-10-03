// js/components/ui.js
// DOM-Helfer und kleine UI-Bausteine für das RealmCraft-Dashboard.
// Verbindlicher Vertrag: docs/Frontend-Contract.md, Abschnitt "js/components/ui.js".
//
// Exporte (exakt nach Vertrag):
//   el(tag, attrs, children)      -> HTMLElement   Hyperscript-Helfer
//   gauge(value, min, max)        -> HTMLElement   Balken mit Nullpunkt (Lagewerte, -2..+3)
//   loyaltyMeter(value)           -> HTMLElement   Schiene -5..+5, Farbverlauf rot->messing->grün
//   toast(message, { error })     -> void          Fehler bleiben bis zum Schließen stehen
//   bildLeiste(typ, id, handlers) -> HTMLElement   Knopf "Bild fortschreiben" und Versionswahl
//
// Diese Bausteine erzeugen nur DOM mit Klassennamen. Das Aussehen liefert
// css/style.css, dessen :root die einzige Token-Quelle ist. Darum injiziert
// dieses Modul keine Styles und liest keine Token-Variablen.

/**
 * Kleiner Hyperscript-Helfer.
 *
 * @param {string} tag - Tagname, z. B. 'div', 'button'.
 * @param {object} [attrs] - Attribute. Sonderfälle:
 *   class | className : string | string[]  -> CSS-Klassen
 *   text             : string              -> textContent
 *   html             : string              -> innerHTML
 *   dataset          : { key: value }      -> data-* (camelCase erlaubt)
 *   on               : { event: fn }       -> addEventListener je Eintrag
 *   onClick / on...  : function            -> addEventListener (Bequemlichkeit)
 *   hidden           : boolean             -> node.hidden
 *   <boolean true>   : beliebig            -> gesetztes Attribut ohne Wert
 *   <sonst>          : string              -> setAttribute (aria-*, role, src, ...)
 *   null/undefined-Werte werden übersprungen.
 * @param {Array|Node|string} [children] - Kind oder Liste von Kindern.
 *   null, undefined und false werden ausgelassen; verschachtelte Arrays
 *   werden rekursiv eingefügt.
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null) continue;

    if (k === 'class' || k === 'className') {
      node.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    } else if (k === 'text') {
      node.textContent = v;
    } else if (k === 'html') {
      node.innerHTML = v;
    } else if (k === 'dataset') {
      for (const [dk, dv] of Object.entries(v)) {
        if (dv != null) node.dataset[dk] = dv;
      }
    } else if (k === 'on' && v && typeof v === 'object') {
      for (const [ev, fn] of Object.entries(v)) {
        if (typeof fn === 'function') node.addEventListener(ev, fn);
      }
    } else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'hidden') {
      if (v) node.hidden = true;
    } else if (typeof v === 'boolean') {
      if (v) node.setAttribute(k, '');
    } else {
      node.setAttribute(k, v);
    }
  }

  appendChildren(node, children);
  return node;
}

// Fügt Kinder rekursiv ein. Strings werden zu Textknoten, null/undefined/false
// ausgelassen, Arrays abgeflacht.
function appendChildren(node, children) {
  if (children == null || children === false) return;
  if (Array.isArray(children)) {
    for (const c of children) appendChildren(node, c);
    return;
  }
  node.append(children instanceof Node ? children : document.createTextNode(String(children)));
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// ---------------------------------------------------------------------------
// gauge(value, min, max)
// ---------------------------------------------------------------------------
// Horizontaler Balken mit Nullpunkt für Lagewerte. Standardskala -2..+3
// (Frontend-Contract: "Balken mit Nullpunkt für Lagewerte (Skala -2..+3)").
// Der Nullpunkt sitzt bei (0-min)/(max-min). Positive Werte füllen von dort
// nach rechts (Klasse fill.pos), negative nach links (fill.neg). Die Anker
// (left/right) und Farben kommen aus css/style.css; hier wird nur die Breite
// und der Startpunkt als Inline-Style gesetzt (dynamischer Wert).
//
// Struktur (entspricht .scale aus war-table.html):
//   <div class="scale" role="meter" ...>
//     <span class="mid"></span>           Nullpunkt-Markierung
//     <span class="fill pos|neg"></span>  gefüllter Anteil
//   </div>
export function gauge(value, min = -2, max = 3, { label, valueText } = {}) {
  const span = (max - min) || 1;
  const v = clamp(value, min, max);

  // Nullpunkt in Prozent der Gesamtbreite (z. B. -2..+3 -> 40 %).
  const zeroPct = clamp(((0 - min) / span) * 100, 0, 100);
  const neg = v < 0;

  // Breite des gefüllten Anteils, gemessen vom Nullpunkt aus.
  const widthPct = neg
    ? (Math.abs(v) / Math.abs(min || 1)) * zeroPct
    : (v / (max || 1)) * (100 - zeroPct);

  const fill = el('span', { class: `fill ${neg ? 'neg' : 'pos'}` });
  // Mindestbreite, damit ein Wert != 0 sichtbar bleibt; bei 0 keine Füllung.
  fill.style.width = `${Math.max(widthPct, v === 0 ? 0 : 1.5)}%`;
  // Startpunkt: positiver Balken beginnt am Nullpunkt nach rechts,
  // negativer endet am Nullpunkt (von links anwachsend).
  if (neg) {
    fill.style.right = `${100 - zeroPct}%`;
    fill.style.left = 'auto';
  } else {
    fill.style.left = `${zeroPct}%`;
    fill.style.right = 'auto';
  }

  const mid = el('span', { class: 'mid' });
  mid.style.left = `${zeroPct}%`;

  return el('div', {
    class: 'scale',
    role: 'meter',
    'aria-valuenow': String(v),
    'aria-valuemin': String(min),
    'aria-valuemax': String(max),
    // Optionaler zugänglicher Name und Vorlese-Text (z. B. "+3"), damit das
    // Vorzeichen einer reinen Zahl für Screenreader nicht verlorengeht.
    'aria-label': label || null,
    'aria-valuetext': valueText || null,
  }, [mid, fill]);
}

// ---------------------------------------------------------------------------
// loyaltyMeter(value)
// ---------------------------------------------------------------------------
// Schiene von -5 (am Bruch) bis +5 (ergeben) mit gleitender Marke. Der
// Farbverlauf rot -> messing -> grün liegt als Hintergrund der Schiene in
// css/style.css (.loy-track). Hier wird nur die Position der Marke gesetzt.
//
// Struktur (entspricht .loy-track aus war-table.html):
//   <div class="loy-track" role="meter" ...>
//     <span class="marker" style="left: NN%"></span>
//   </div>
export function loyaltyMeter(value, { label, valueText } = {}) {
  const MIN = -5, MAX = 5;
  const v = clamp(value, MIN, MAX);
  const pct = ((v - MIN) / (MAX - MIN)) * 100;

  const marker = el('span', { class: 'marker' });
  marker.style.left = `${clamp(pct, 0, 100)}%`;

  return el('div', {
    class: 'loy-track',
    role: 'meter',
    'aria-valuenow': String(v),
    'aria-valuemin': String(MIN),
    'aria-valuemax': String(MAX),
    // Optionaler Name (z. B. "Loyalität von Borka") und Vorlese-Text mit dem
    // Wortzustand ("+2 · treu"), den eine reine Zahl nicht trägt.
    'aria-label': label || null,
    'aria-valuetext': valueText || null,
  }, [marker]);
}

// ---------------------------------------------------------------------------
// toast(message, { error })
// ---------------------------------------------------------------------------
// Nicht-blockierende Meldung am unteren Rand, data-testid="toast" je Meldung
// gemäß Frontend-Contract. Jede Meldung ist ihre eigene Live-Region (Fehler
// role=alert, sonst role=status); der Host trägt bewusst keine, sonst
// verschachteln sich Live-Regionen und Ansagen doppeln. Jede Meldung hat einen
// per Tastatur erreichbaren Schließen-Knopf. Fehler bleiben stehen, bis sie
// geschlossen werden (WCAG 2.2.1); Hinweise verschwinden nach kurzer Zeit.
// Lange Meldungen gelten auch ohne { error } als Fehler, weil die Aufrufer in
// app.js API-Fehlertexte bisher ohne Flag durchreichen.
const TOAST_CLOSE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

export function toast(message, { error = false } = {}) {
  let host = document.querySelector('[data-testid="toast-host"]');
  if (!host) {
    host = el('div', { class: 'toast-host', dataset: { testid: 'toast-host' } });
    document.body.append(host);
  }

  const text = message == null ? '' : String(message);
  const bleibt = error || text.length > 120;
  const t = el('div', {
    class: `toast${bleibt ? ' error' : ''}`,
    dataset: { testid: 'toast' },
    role: bleibt ? 'alert' : 'status',
  }, [
    el('p', { class: 'toast-text', text }),
    el('button', {
      class: 'toast-close',
      type: 'button',
      'aria-label': 'Meldung schließen',
      html: TOAST_CLOSE_ICON,
      onClick: () => t.remove(),
    }),
  ]);
  host.append(t);

  if (!bleibt) setTimeout(() => t.remove(), 5000);
}

// ---------------------------------------------------------------------------
// bildLeiste(typ, id, handlers)
// ---------------------------------------------------------------------------
// Steuerleiste unter einem erzeugbaren Bild: ein Knopf "Bild fortschreiben"
// (leitet aus dem bisherigen Bild + dem aktuellen Stand der Partie ein neues
// ab) und, sobald fortgeschriebene Staende vorliegen, ein <select> zum
// Umschalten durch die Versionen. Daten und Verhalten liefert app.js ueber die
// handlers: bildVersionen/aktiveBildVersion bzw. onBildFortschreiben/
// onWaehleBildVersion. data-testid: bild-fortschreiben, bild-versionen.
// Vertrag: docs/Frontend-Contract.md.
export function bildLeiste(typ, id, handlers = {}) {
  const idStr = id == null ? '' : String(id);
  const versionen = handlers.bildVersionen?.(typ, id) || [];
  const aktiv = handlers.aktiveBildVersion?.(typ, id) || '__basis';

  const kinder = [
    el('button', {
      class: 'btn btn-ghost gen-fortschreiben',
      type: 'button',
      'data-testid': 'bild-fortschreiben',
      dataset: { typ, id: idStr },
      title: 'Aus dem bisherigen Bild und dem aktuellen Stand der Partie ein neues ableiten',
      text: 'Bild fortschreiben',
      onClick: () => handlers.onBildFortschreiben?.(typ, id),
    }),
  ];

  if (versionen.length) {
    kinder.push(el('select', {
      class: 'bild-versionen',
      'data-testid': 'bild-versionen',
      dataset: { typ, id: idStr },
      'aria-label': 'Bild-Stand wählen',
      onChange: (e) => handlers.onWaehleBildVersion?.(typ, id, e.target.value),
    }, [
      el('option', { value: '__basis', selected: aktiv === '__basis' }, ['Ursprung']),
      ...versionen.map((v) => el('option', { value: v.key, selected: v.key === aktiv }, [v.label])),
    ]));
  }

  return el('div', { class: 'bild-leiste', dataset: { typ, id: idStr } }, kinder);
}

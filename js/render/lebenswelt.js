// Sicht "Lebenswelt": die Lebenswelt des Volkes als Oberbegriff — wie die
// Bevölkerung lebt (über alle Siedlungen) und die einzelnen Siedlungen samt
// Hauptstadt. Wächst mit: spätere Siedlungen erscheinen als weitere Karten.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Lebenswelt (data-view=lebenswelt)".
import { el } from '../components/ui.js';
import { signed } from '../format.js';

// Siedlungen aus dem Stand lesen: bevorzugt die neue Liste lebenswelt.siedlungen,
// fällt aber auf das ältere Einzelobjekt state.siedlung zurück, damit ein noch
// nicht migrierter Stand trotzdem etwas zeigt. Hauptstadt wird nach vorne sortiert.
function siedlungenAus(state) {
  const lw = state.lebenswelt || {};
  let list = Array.isArray(lw.siedlungen) ? lw.siedlungen.slice() : [];
  if (!list.length && state.siedlung && state.siedlung.name) {
    list = [{ ...state.siedlung, hauptstadt: true }];
  }
  return list.sort((a, b) => (b.hauptstadt ? 1 : 0) - (a.hauptstadt ? 1 : 0));
}

export function renderLebenswelt(root, state, handlers = {}) {
  root.replaceChildren();
  if (!state) return;

  const lw = state.lebenswelt || {};
  const leben = lw.leben || {};
  const siedlungen = siedlungenAus(state);
  const besitz = state.besitz || [];

  // Bevölkerungszahl aus den Grundgrößen spiegeln, statt sie doppelt zu führen.
  const gg = state.grundgroessen || {};
  const bevObj = gg.bevoelkerung && typeof gg.bevoelkerung === 'object' ? gg.bevoelkerung : null;
  const bevZahl = bevObj ? bevObj.zahl : (typeof gg.bevoelkerung === 'number' ? gg.bevoelkerung : null);
  const bevLabel = bevObj ? (bevObj.label || '') : '';

  const hatLeben = leben.stimmung || leben.nahrung || leben.trinken || leben.glaube
    || leben.alltag || (leben.braeuche || []).length || bevZahl != null || bevLabel;

  if (!hatLeben && !siedlungen.length && !besitz.length) {
    root.append(el('section', { class: 'panel pad', 'data-testid': 'lebenswelt-leer' }, [
      el('div', { class: 'block-head' }, [el('h3', { text: 'Lebenswelt' })]),
      el('p', {
        class: 'section-sub',
        text: 'Noch nichts erfasst. Sobald der Spielleiter das Volk und seine Siedlungen festhält, erscheint hier das Bild der Lebenswelt.',
      }),
    ]));
    return;
  }

  // --- Die Bevölkerung (über alle Siedlungen) ---
  if (hatLeben) {
    const zeile = (label, wert) => wert
      ? el('div', { class: 'leben-zeile' }, [
        el('span', { class: 'leben-lbl', text: label }),
        el('span', { class: 'leben-wert', text: wert }),
      ])
      : null;

    const braeuche = (leben.braeuche || []).map((b) => el('span', { class: 'brauch', text: b }));
    const bevWert = bevZahl != null
      ? `${bevZahl}${bevLabel ? ` — ${bevLabel}` : ''}`
      : (bevLabel || '');

    root.append(el('section', { class: 'panel pad', 'data-testid': 'lw-bevoelkerung' }, [
      el('div', { class: 'block-head' }, [
        el('h3', { text: 'Die Bevölkerung' }),
        el('span', { class: 'eyebrow', text: 'wie das Volk lebt' }),
      ]),
      el('div', { class: 'leben-grid' }, [
        zeile('Bevölkerung', bevWert),
        zeile('Stimmung', leben.stimmung),
        zeile('Nahrung', leben.nahrung),
        zeile('Trinken', leben.trinken),
        zeile('Glaube', leben.glaube),
        zeile('Alltag', leben.alltag),
      ]),
      braeuche.length ? el('div', { class: 'brauch-row' }, [
        el('span', { class: 'leben-lbl', text: 'Bräuche' }),
        el('div', { class: 'brauch-chips' }, braeuche),
      ]) : null,
    ]));
  }

  // --- Die Siedlungen (Hauptstadt zuerst) ---
  if (siedlungen.length) {
    root.append(el('section', { class: 'panel pad mt', 'data-testid': 'lw-siedlungen' }, [
      el('div', { class: 'block-head' }, [
        el('h3', { text: siedlungen.length > 1 ? 'Die Siedlungen' : 'Die Siedlung' }),
        el('span', { class: 'eyebrow', text: `${siedlungen.length} ${siedlungen.length === 1 ? 'Ort' : 'Orte'}` }),
      ]),
      el('div', { class: 'siedlung-grid' }, siedlungen.map((s) => siedlungCard(s, handlers, { bevZahl, verteidigung: state.lagewerte?.verteidigung }))),
    ]));
  }

  // --- Besitz: was das Volk hat (Boote, Werkzeug, Saatgut, Waffen …) ---
  if (besitz.length) {
    root.append(el('section', { class: 'panel pad mt', 'data-testid': 'lw-besitz' }, [
      el('div', { class: 'block-head' }, [
        el('h3', { text: 'Besitz' }),
        el('span', { class: 'eyebrow', text: 'was das Volk hat' }),
      ]),
      el('ul', { class: 'besitz-list', 'data-testid': 'besitz-liste' },
        besitz.map((b) => el('li', { class: 'besitz-item', 'data-testid': 'besitz' }, [
          el('span', { class: 'marker' }),
          el('span', { text: b }),
        ]))),
    ]));
  }
}

// Eine Siedlung als Karte: Bild (erzeugbar), Name + Hauptstadt-Marke, Lage,
// Beschreibung, Stimmung, Versorgung und die Bauten als Liste. live (optional):
// Einwohner und Verteidigung aus den Grundgrößen/Lagewerten — nur an der
// Hauptstadt gezeigt, damit sie nicht doppelt gepflegt, aber sichtbar sind.
function siedlungCard(s, handlers, live = {}) {
  const eig = (s.eigenschaften || []).map((k) =>
    el('span', { class: 'ort-eig' }, [
      document.createTextNode(`${k.key} `),
      el('b', { text: signed(k.value) }),
    ]));
  const bauten = (s.bauten || []).map((b) => el('li', { class: 'bau', text: b }));
  const id = s.id || s.name || '';
  const zeigeLive = s.hauptstadt && (live.bevZahl != null || typeof live.verteidigung === 'number');

  return el('article', { class: 'siedlung', 'data-testid': 'siedlung', dataset: { id } }, [
    el('div', { class: 'siedlung-bild-frame' }, [
      el('img', { 'data-testid': 'siedlung-bild', alt: `Bild von ${s.name || 'der Siedlung'}` }),
    ]),
    el('div', { class: 'siedlung-head' }, [
      el('h4', { class: 'siedlung-name', 'data-testid': 'siedlung-name', text: s.name || 'Siedlung' }),
      s.hauptstadt ? el('span', { class: 'siedlung-haupt', text: 'Hauptstadt' }) : null,
      s.typ && !s.hauptstadt ? el('span', { class: 'eyebrow', text: s.typ }) : null,
    ]),
    s.lage ? el('div', { class: 'siedlung-lage', text: s.lage }) : null,
    zeigeLive ? el('div', { class: 'siedlung-live', 'data-testid': 'siedlung-live' }, [
      live.bevZahl != null ? el('span', { class: 'siedlung-kennzahl', 'data-testid': 'siedlung-einwohner' }, [
        el('span', { class: 'leben-lbl', text: 'Einwohner' }), el('b', { text: String(live.bevZahl) }),
      ]) : null,
      typeof live.verteidigung === 'number' ? el('span', { class: 'siedlung-kennzahl', 'data-testid': 'siedlung-verteidigung' }, [
        el('span', { class: 'leben-lbl', text: 'Verteidigung' }), el('b', { text: signed(live.verteidigung) }),
      ]) : null,
    ]) : null,
    s.beschreibung ? el('p', { class: 'ort-erscheinung', text: s.beschreibung }) : null,
    s.stimmung ? el('div', { class: 'siedlung-zeile' }, [
      el('span', { class: 'leben-lbl', text: 'Stimmung' }), el('span', { class: 'leben-wert', text: s.stimmung }),
    ]) : null,
    s.versorgung ? el('div', { class: 'siedlung-zeile' }, [
      el('span', { class: 'leben-lbl', text: 'Versorgung' }), el('span', { class: 'leben-wert', text: s.versorgung }),
    ]) : null,
    bauten.length ? el('div', { class: 'siedlung-bauten' }, [
      el('span', { class: 'leben-lbl', text: 'Bauten' }),
      el('ul', { class: 'bau-list' }, bauten),
    ]) : null,
    eig.length ? el('div', { class: 'ort-eig-row' }, eig) : null,
    el('button', {
      class: 'btn gen-siedlung',
      'data-testid': 'generate-siedlung',
      type: 'button',
      text: 'Bild erzeugen',
      onClick: () => handlers.onGenerateSiedlung?.(id),
    }),
  ]);
}

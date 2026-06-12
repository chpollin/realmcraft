// Sicht "Curriculum": Modulfortschritt, Themenblöcke, stehende Kompetenzen, offene Lücken.
// (Datenstruktur weiterhin state.armee, nur didaktisch umbeschriftet.)
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Armee (data-view=armee)".
import { el, bildLeiste } from '../components/ui.js';
import { signed } from '../format.js';

export function renderArmee(root, state, handlers = {}) {
  root.replaceChildren();
  if (!state) return;
  const a = state.armee || { verbaende: [] };
  const beraterById = Object.fromEntries((state.berater || []).map((b) => [b.id, b]));

  // Kopf: Gesamtstärke + Moral + Heerschau-Bild
  root.append(el('section', { class: 'panel pad', 'data-testid': 'armee-kopf' }, [
    el('div', { class: 'block-head' }, [
      el('h3', { text: 'Modulfortschritt' }),
      el('span', { class: 'eyebrow', 'data-testid': 'armee-gesamt', text: `Fortschritt ${a.gesamt ?? 0}` }),
    ]),
    a.moral ? el('div', { class: 'armee-moral', text: a.moral }) : null,
    el('div', { class: 'armee-bild-frame' }, [
      el('img', { 'data-testid': 'armee-bild', alt: 'Tafelbild des Modulfortschritts' }),
    ]),
    el('button', {
      class: 'btn gen-armee-bild',
      'data-testid': 'generate-armee-bild',
      type: 'button',
      text: 'Tafelbild erzeugen',
      onClick: () => handlers.onGenerateArmeeBild?.(),
    }),
    bildLeiste('armee', null, handlers),
  ]));

  // Verbände
  const list = (a.verbaende || []).map((v) => el('article', {
    class: 'verband', 'data-testid': 'verband', dataset: { id: v.id || '' },
  }, [
    el('div', { class: 'verband-portrait' }, [
      el('img', { 'data-testid': 'verband-avatar', alt: `Avatar von ${v.name || 'Verband'}` }),
    ]),
    el('div', { class: 'verband-top' }, [
      el('span', { class: 'verband-name', 'data-testid': 'verband-name', text: v.name || '' }),
      v.typ ? el('span', { class: 'verband-typ', text: v.typ }) : null,
      el('span', { class: 'verband-staerke', 'data-testid': 'verband-staerke', text: `${v.staerke ?? 0}` }),
    ]),
    v.fuehrungId && beraterById[v.fuehrungId]
      ? el('div', { class: 'verband-fuehrung', text: `Zuständig: ${beraterById[v.fuehrungId].name}` }) : null,
    v.verfassung ? el('div', { class: 'verband-verfassung', text: v.verfassung }) : null,
    v.ausruestung ? el('div', { class: 'verband-ausruestung', text: v.ausruestung }) : null,
    v.hinweis ? el('div', { class: 'verband-hinweis', text: v.hinweis }) : null,
    el('button', {
      class: 'btn gen-verband',
      'data-testid': 'generate-verband',
      type: 'button',
      text: 'Avatar erzeugen',
      onClick: () => handlers.onGenerateVerband?.(v.id),
    }),
    bildLeiste('verband', v.id, handlers),
  ]));
  root.append(el('section', { class: 'panel pad mt armee-verbaende', 'data-testid': 'armee-verbaende' }, [
    el('div', { class: 'block-head' }, [el('h3', { text: 'Themenblöcke' })]),
    el('div', { class: 'verband-grid' }, list),
  ]));

  // Stehende Modifikatoren (kennwert)
  if ((a.stehendeModifikatoren || []).length) {
    root.append(el('section', { class: 'panel pad mt' }, [
      el('div', { class: 'block-head' }, [el('h3', { text: 'Stehende Kompetenzen' })]),
      el('div', { class: 'armee-mod-row' }, a.stehendeModifikatoren.map((k) =>
        el('span', { class: 'armee-mod' }, [
          document.createTextNode(`${k.key} `),
          el('b', { text: signed(k.value) }),
        ]))),
    ]));
  }

  // Verluste-Logbuch
  if ((a.verluste || []).length) {
    root.append(el('section', { class: 'panel pad mt', 'data-testid': 'armee-verluste' }, [
      el('div', { class: 'block-head' }, [el('h3', { text: 'Offene Lücken' })]),
      ...a.verluste.map((x) =>
        el('div', { class: 'armee-verlust' }, [
          el('span', { class: 'armee-verlust-zeit', text: x.zeit || '' }),
          document.createTextNode(`  ${x.zahl ?? 0} `),
          el('span', { class: 'armee-verlust-anlass', text: x.anlass ? `(${x.anlass})` : '' }),
        ])),
    ]));
  }
}

// Sicht "Welt": Mächte (Diplomatie) und tragende Gruppen mit Sprechern.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Welt (data-view=welt)".
import { el, bildLeiste } from '../components/ui.js';
import { initials, signed } from '../format.js';

function relMeta(beziehung = {}) {
  const w = beziehung.wert;
  if (w == null) return { cls: 'unknown', pips: 0 };
  return { cls: w >= 2 ? 'warm' : 'cool', pips: Math.max(0, Math.min(5, w + 2)) };
}

export function renderWelt(root, state, handlers = {}) {
  root.replaceChildren();
  if (!state) return;

  // Sprecher einer Gruppe kann ein Berater oder eine sonstige Person sein
  // (z. B. eine Verwalterin der nächsten Generation, die nicht im Rat sitzt).
  const sprecherById = (id) =>
    (state.berater || []).find((b) => b.id === id) ||
    (state.personen || []).find((p) => p.id === id);

  // --- Mächte ---
  const powerGrid = el('div', { class: 'power-grid grid-auto' },
    (state.maechte || []).map((m) => {
      const r = relMeta(m.beziehung);
      const pips = el('span', { class: 'pips' },
        Array.from({ length: 5 }, (_, i) => el('i', { class: i < r.pips ? 'on' : '' })),
      );
      const relLabel = m.beziehung?.label || '';
      // Profil: Stärken (+) und Schwächen (−) einer Macht. Der negative Wert ist
      // die ausnutzbare Schwäche; sie trägt neben dem Minus die Klasse
      // .schwaeche (roter Rahmen). Reihenfolge wie im Stand (bewusst
      // Stärke→Schwäche). Mächte ohne profil: kein Block.
      const profil = (m.profil || []).length
        ? el('div', { class: 'profil', 'data-testid': 'power-profil' },
            m.profil.map((k) => {
              const dir = k.value > 0 ? 'up' : k.value < 0 ? 'down' : 'flat';
              const schwaeche = k.value < 0;
              return el('span', {
                class: `profil-mod ${dir}${schwaeche ? ' schwaeche' : ''}`,
                'data-testid': 'profil-mod',
                title: schwaeche ? `Schwäche: ${k.key}` : k.key,
              }, [
                el('span', { class: 'profil-key', text: k.key }),
                el('span', { class: 'profil-val', text: signed(k.value) }),
              ]);
            }))
        : null;
      return el('article', { class: 'power', 'data-testid': 'power-card', dataset: { id: m.id } }, [
        el('div', { class: 'power-portrait' }, [
          el('img', { 'data-testid': 'power-bild', alt: `Bild von ${m.name}` }),
        ]),
        el('div', { class: 'ph' }, [
          el('div', {}, [
            el('h3', { class: 'pname', 'data-testid': 'power-name', text: m.name }),
            m.typ ? el('div', { class: 'ptype', text: m.typ }) : null,
          ]),
        ]),
        m.erscheinung ? el('div', { class: 'pdesc', text: m.erscheinung }) : null,
        profil,
        el('span', { class: `rel ${r.cls}`, 'data-testid': 'power-relation' }, [
          m.beziehung?.wert != null ? pips : null,
          el('span', { text: relLabel }),
        ]),
        el('div', { class: 'stance', 'data-testid': 'power-stance' }, [
          el('span', { text: m.haltung || '' }),
        ]),
        el('button', {
          class: 'btn gen-macht',
          'data-testid': 'generate-macht',
          type: 'button',
          text: 'Bild erzeugen',
          onClick: () => handlers.onGenerateMacht?.(m.id),
        }),
        bildLeiste('macht', m.id, handlers),
      ]);
    }),
  );

  const power = el('section', { class: 'mt' }, [
    el('h2', { class: 'section-title', text: 'Mächte des Kontinents' }),
    el('p', { class: 'profil-legende', 'data-testid': 'power-profil-legende', text: 'Profil: Stärken (+) und Schwächen (−), Maßstab −2 bis +3' }),
    powerGrid,
  ]);

  // --- Gruppen ---
  const groupGrid = el('div', { class: 'group-grid grid-auto' },
    (state.gruppen || []).map((gr) => {
      const sp = sprecherById(gr.sprecherId);
      return el('div', { class: 'group', 'data-testid': 'group-row', dataset: { id: gr.id } }, [
        el('div', { class: 'gp' }, [
          el('span', { class: 'gp-ini', text: initials(gr.name) }),
          el('img', { class: 'gp-img', 'data-testid': 'gruppe-bild', alt: `Bild von ${gr.name}` }),
        ]),
        el('div', { class: 'gmeta' }, [
          el('h3', { class: 'gn', text: gr.name }),
          gr.kompetenz ? el('div', { class: 'gk', text: gr.kompetenz }) : null,
          el('div', { class: 'gsp' }, [
            document.createTextNode('Sprecher: '),
            el('b', { text: sp ? sp.name : gr.sprecherId || '–' }),
          ]),
        ]),
        el('button', {
          class: 'btn gen-gruppe',
          'data-testid': 'generate-gruppe',
          type: 'button',
          text: 'Bild',
          onClick: () => handlers.onGenerateGruppe?.(gr.id),
        }),
        bildLeiste('gruppe', gr.id, handlers),
      ]);
    }),
  );

  const groups = el('section', { class: 'panel pad mt' }, [
    el('div', { class: 'block-head' }, [el('h2', { text: 'Tragende Gruppen' })]),
    groupGrid,
  ]);

  // --- Ansehen & Beziehungen: erzählender Lagesatz aus state.beziehungenAnsehen.text.
  // Optional; nur gerendert, wenn Text vorhanden (Frontend-Contract: beziehungen-ansehen).
  const ansehen = state.beziehungenAnsehen?.text
    ? el('section', { class: 'panel pad' }, [
        el('h2', { class: 'section-title', text: 'Wie das Reich gesehen wird' }),
        el('p', { class: 'beziehungen-text', 'data-testid': 'beziehungen-ansehen', text: state.beziehungenAnsehen.text }),
      ])
    : null;

  root.append(...[ansehen, power, groups].filter(Boolean));
}

// Sicht "Berater": Karten mit Name, Rolle, Ziel, Loyalität und Portrait.
// Vertrag: docs/Frontend-Contract.md, Abschnitt "Berater (data-view=berater)".
import { el, loyaltyMeter, bildLeiste } from '../components/ui.js';
import { initials, signed } from '../format.js';

const LEBENSSTAND = { ruestig: 'Rüstig', lebensabend: 'Lebensabend', hinfaellig: 'Hinfällig' };

function loyMeta(v) {
  if (v >= 4) return { state: 'ergeben', cls: 'pos' };
  if (v >= 1) return { state: 'treu', cls: 'pos' };
  if (v === 0) return { state: 'schwankend', cls: 'mid' };
  if (v >= -3) return { state: 'verstimmt', cls: 'warn' };
  return { state: 'am Bruch', cls: 'neg' };
}

export function renderBerater(root, state, handlers = {}) {
  root.replaceChildren();
  if (!state) return;

  const grid = el('div', { class: 'advisor-grid', 'data-testid': 'advisor-list' },
    (state.berater || []).map((b) => {
      const lm = loyMeta(b.loyalitaet);

      const portrait = el('div', { class: 'portrait' }, [
        el('span', { class: 'ring' }),
        el('span', { class: 'ini', text: initials(b.name) }),
        el('img', { 'data-testid': 'advisor-portrait', alt: `Portrait von ${b.name}` }),
      ]);

      const genBtn = el('button', {
        class: 'btn gen-portrait',
        'data-testid': 'generate-portrait',
        type: 'button',
        text: 'Portrait erzeugen',
        onClick: () => handlers.onGeneratePortrait?.(b.id),
      });

      return el('article', { class: 'advisor', 'data-testid': 'advisor-card', dataset: { id: b.id } }, [
        el('div', { class: 'head' }, [
          portrait,
          el('div', { class: 'who' }, [
            el('div', { class: 'nm', 'data-testid': 'advisor-name', text: b.name }),
            el('div', { class: 'role', 'data-testid': 'advisor-role', text: b.rolle || '' }),
            b.lebensstand && LEBENSSTAND[b.lebensstand]
              ? el('span', {
                  class: `advisor-lebensstand ls-${b.lebensstand}`,
                  'data-testid': 'advisor-lebensstand',
                  text: LEBENSSTAND[b.lebensstand],
                })
              : null,
          ]),
        ]),
        b.ziel ? el('div', { class: 'goal', 'data-testid': 'advisor-goal' }, [el('span', { text: b.ziel })]) : el('div', { 'data-testid': 'advisor-goal', hidden: true }),
        b.generation ? el('div', { class: 'gen', text: b.generation }) : null,
        el('div', { class: 'loy' }, [
          el('div', { class: 'lhead' }, [
            el('span', { class: 'ltitle', text: 'Loyalität' }),
            el('span', {
              class: `lstate ${lm.cls}`,
              'data-testid': 'advisor-loyalty',
              text: `${signed(b.loyalitaet)} · ${lm.state}`,
            }),
          ]),
          loyaltyMeter(b.loyalitaet, { label: `Loyalität von ${b.name}`, valueText: `${signed(b.loyalitaet)} · ${lm.state}` }),
          el('div', { class: 'loy-ticks' }, [
            el('span', { text: '-5' }), el('span', { text: '0' }), el('span', { text: '+5' }),
          ]),
        ]),
        genBtn,
        bildLeiste('berater', b.id, handlers),
      ]);
    }),
  );

  root.append(grid);
}

// Council overlay: the open question, a vote meter by member, and one card per
// adviser with portrait, role symbol, vote hand and loyalty. Quote and goal sit
// in the two-stage tooltip of the card. Hovering or focusing a decision shows
// the loyalty shift on every card and the cost in the top bar before it is made.

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { dialogHead, loyaltyMeter } from './dialoge.js';
import { portrait } from './portrait.js';
import { withTip } from './tip.js';

const WAHL = {
  ja: { icon: 'dafuer', text: 'dafür' },
  nein: { icon: 'dagegen', text: 'dagegen' },
  enthaltung: { icon: 'enthaltung_hand', text: 'Enthaltung' },
};
const ROLLE_ICON = { ulrun: 'herde', torhild: 'magie', garmund: 'bewegung', brandur: 'technik' };
const ORDER = { ja: 0, enthaltung: 1, nein: 2 };

const delta = (name, d) => (d ? el('span', { class: `delta d-${name} ${d > 0 ? 'up' : 'down'}`, 'aria-hidden': 'true', text: signed(d) }) : null);

function folgenChips(folgen) {
  return el('ul', { class: 'folgen-chips plain' }, ...folgen.map((f) => el('li', {},
    withTip(el('span', { class: 'folge-chip', tabindex: '0', 'aria-label': f.text }, icon(f.icon, { size: 15 }), f.wert), [el('span', { text: f.text })], null, { up: true }))));
}

export function renderRat(dlg, api) {
  const { model } = api;
  const F = model.ratsfrage;
  const done = model.ratBeschluss;
  const stimmen = [...F.stimmen].sort((a, b) => ORDER[a.wahl] - ORDER[b.wahl]);

  const decide = (kind) => {
    model.ratBeschluss = kind;
    for (const s of F.stimmen) {
      const a = model.rat.find((x) => x.id === s.id);
      const d = kind === 'annahme' ? s.loyalitaetBeiAnnahme : s.loyalitaetBeiVeto;
      a.loyalitaet = Math.max(-5, Math.min(5, a.loyalitaet + d));
    }
    if (kind === 'veto') {
      for (const k of F.vetoKosten) {
        const r = model.ressourcen.find((x) => x.key === k.key);
        if (r) r.wert += k.menge;
      }
    }
    api.setPreview(null);
    api.refreshResources({ bump: kind === 'veto' ? F.vetoKosten.map((k) => k.key) : [] });
    model.meldungen = model.meldungen.filter((m) => m.id !== 'meldung_rat');
    api.refreshMessages();
    api.announce(kind === 'annahme' ? 'Beschluss angenommen' : 'Veto eingelegt');
    renderRat(dlg, api);
    dlg.querySelector('.rat-ergebnis')?.focus();
  };

  const vorschau = (kind) => {
    dlg.dataset.preview = kind;
    const deltas = {};
    if (kind === 'veto') for (const k of F.vetoKosten) deltas[k.key] = k.menge;
    api.setPreview({ deltas, tiles: [] });
  };
  const ende = () => {
    delete dlg.dataset.preview;
    api.setPreview(null);
  };

  const decisionButton = (kind, label, cls, folgen, kosten) => el('div', { class: 'entscheid' },
    el('button', {
      class: `btn ${cls}`,
      type: 'button',
      onclick: () => decide(kind),
      onpointerenter: () => vorschau(kind),
      onpointerleave: ende,
      onfocus: () => vorschau(kind),
      onblur: ende,
    }, icon(kind === 'annahme' ? 'dafuer' : 'dagegen', { size: 18 }), label,
    kosten ? el('span', { class: 'costs' }, ...kosten.map((k) => el('span', { class: 'cost', 'aria-label': `${signed(k.menge)} ${api.resourceName(k.key)}` }, icon(k.key, { size: 15 }), signed(k.menge)))) : null),
    folgenChips(folgen));

  delete dlg.dataset.preview;
  dlg.replaceChildren(
    dialogHead(dlg, 'Rat', 'rat'),
    el('div', { class: 'overlay-body rat-body' },
      el('section', { class: 'ratsfrage', 'aria-labelledby': 'rf-titel' },
        el('h3', { class: 'world', id: 'rf-titel', text: F.titel }),
        el('p', { class: 'rf-worum', text: F.worum })),
      el('div', { class: 'stimmbalken', role: 'img', 'aria-label': stimmen.map((s) => `${model.rat.find((x) => x.id === s.id).name} ${WAHL[s.wahl].text}`).join(', ') },
        ...stimmen.map((s) => el('span', { class: `stimme ${s.wahl}` }, icon(WAHL[s.wahl].icon, { size: 16 })))),
      el('ul', { class: 'berater plain' }, ...F.stimmen.map((s) => {
        const a = model.rat.find((x) => x.id === s.id);
        const w = WAHL[s.wahl];
        const card = el('button', { class: `berater-karte wahl-${s.wahl}`, type: 'button', 'aria-label': `${a.name}, ${a.rolle}, ${w.text}, Loyalität ${signed(a.loyalitaet)}` },
          portrait(a.id, a.name, { size: 76 }),
          el('span', { class: 'bk-wahl', 'aria-hidden': 'true' }, icon(w.icon, { size: 22 })),
          el('span', { class: 'rb-name world', text: a.name.split(' ')[0] }),
          el('span', { class: 'rb-rolle' }, icon(ROLLE_ICON[a.id] ?? 'volk', { size: 14 }), a.rolle),
          el('span', { class: 'b-loyal' },
            loyaltyMeter(a.loyalitaet, { previews: { annahme: s.loyalitaetBeiAnnahme, veto: s.loyalitaetBeiVeto }, label: `Loyalität von ${a.name}` }),
            el('span', { class: 'num', text: signed(a.loyalitaet) }),
            delta('annahme', s.loyalitaetBeiAnnahme),
            delta('veto', s.loyalitaetBeiVeto)));
        return el('li', {}, withTip(card,
          [el('span', { class: 'tip-zitat world', text: `„${s.zitat}“` })],
          [
            el('span', { class: 'tip-zeile' }, el('span', { text: 'Ziel' }), el('span', { text: a.ziel })),
            el('span', { class: 'tip-zeile' }, el('span', { text: 'Bei Annahme' }), el('span', { class: s.loyalitaetBeiAnnahme >= 0 ? 'up' : 'down', text: signed(s.loyalitaetBeiAnnahme) })),
            el('span', { class: 'tip-zeile' }, el('span', { text: 'Bei Veto' }), el('span', { class: s.loyalitaetBeiVeto >= 0 ? 'up' : 'down', text: signed(s.loyalitaetBeiVeto) })),
          ]));
      })),
      done
        ? el('p', { class: 'rat-ergebnis world', tabindex: '-1' }, icon(done === 'annahme' ? 'dafuer' : 'dagegen', { size: 22 }), done === 'annahme' ? 'Beschlossen' : 'Veto eingelegt')
        : el('div', { class: 'entscheidungen' },
          decisionButton('annahme', 'Beschluss annehmen', 'btn-primary', F.folgenAnnahme),
          decisionButton('veto', 'Veto einlegen', '', F.folgenVeto, F.vetoKosten))),
  );
}

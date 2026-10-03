// Council overlay: the open question, a vote meter by member, and one card per
// adviser with portrait, role symbol, vote hand and loyalty. Quote and goal sit
// in the two-stage tooltip of the card. Hovering or focusing a decision shows
// the loyalty shift on every card and the cost in the top bar before it is made.
// In a real campaign the questions are the council votes of the draft's orders
// (with decree and Machtprobe) and the open event decisions, both from the
// kernel preview; talks are kernel orders of their own.

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { dialogHead, loyaltyMeter } from './dialoge.js';
import { portrait } from './portrait.js';
import { withTip } from './tip.js';
import { t } from '../i18n/index.js';

const WAHL_ICON = { ja: 'dafuer', nein: 'dagegen', enthaltung: 'enthaltung_hand' };
const wahl = (w) => ({ icon: WAHL_ICON[w], text: t(`board.vote.${w}`) });
const ROLLE_ICON = { ulrun: 'herde', torhild: 'magie', garmund: 'bewegung', brandur: 'technik' };
const ORDER = { ja: 0, enthaltung: 1, nein: 2 };

const delta = (name, d) => (d ? el('span', { class: `delta d-${name} ${d > 0 ? 'up' : 'down'}`, 'aria-hidden': 'true', text: signed(d) }) : null);

function folgenChips(folgen) {
  return el('ul', { class: 'folgen-chips plain' }, ...folgen.map((f) => el('li', {},
    withTip(el('span', { class: 'folge-chip', tabindex: '0', 'aria-label': f.text }, icon(f.icon, { size: 15 }), f.wert), [el('span', { text: f.text })], null, { up: true }))));
}

export function renderRat(dlg, api) {
  if (api.model.real) return renderRatReal(dlg, api);
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
    api.announce(t(kind === 'annahme' ? 'board.council.accepted' : 'board.council.vetoed'));
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
    dialogHead(dlg, t('view.rat'), 'rat'),
    el('div', { class: 'overlay-body rat-body' },
      el('section', { class: 'ratsfrage', 'aria-labelledby': 'rf-titel' },
        el('h3', { class: 'world', id: 'rf-titel', text: F.titel }),
        el('p', { class: 'rf-worum', text: F.worum })),
      el('div', { class: 'stimmbalken', role: 'img', 'aria-label': stimmen.map((s) => `${model.rat.find((x) => x.id === s.id).name} ${wahl(s.wahl).text}`).join(', ') },
        ...stimmen.map((s) => el('span', { class: `stimme ${s.wahl}` }, icon(wahl(s.wahl).icon, { size: 16 })))),
      el('ul', { class: 'berater plain' }, ...F.stimmen.map((s) => {
        const a = model.rat.find((x) => x.id === s.id);
        const w = wahl(s.wahl);
        const card = el('button', { class: `berater-karte wahl-${s.wahl}`, type: 'button', 'aria-label': `${a.name}, ${a.rolle}, ${w.text}, ${t('ui.loyalitaet')} ${signed(a.loyalitaet)}` },
          portrait(a.id, a.name, { size: 76 }),
          el('span', { class: 'bk-wahl', 'aria-hidden': 'true' }, icon(w.icon, { size: 22 })),
          el('span', { class: 'rb-name world', text: a.name.split(' ')[0] }),
          el('span', { class: 'rb-rolle' }, icon(ROLLE_ICON[a.id] ?? 'volk', { size: 14 }), a.rolle),
          el('span', { class: 'b-loyal' },
            loyaltyMeter(a.loyalitaet, { previews: { annahme: s.loyalitaetBeiAnnahme, veto: s.loyalitaetBeiVeto }, label: t.fmt('board.council.loyalty-of', { name: a.name }) }),
            el('span', { class: 'num', text: signed(a.loyalitaet) }),
            delta('annahme', s.loyalitaetBeiAnnahme),
            delta('veto', s.loyalitaetBeiVeto)));
        return el('li', {}, withTip(card,
          [el('span', { class: 'tip-zitat world', text: `„${s.zitat}“` })],
          [
            el('span', { class: 'tip-zeile' }, el('span', { text: t('ui.ziel') }), el('span', { text: a.ziel })),
            el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.if-accepted') }), el('span', { class: s.loyalitaetBeiAnnahme >= 0 ? 'up' : 'down', text: signed(s.loyalitaetBeiAnnahme) })),
            el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.if-veto') }), el('span', { class: s.loyalitaetBeiVeto >= 0 ? 'up' : 'down', text: signed(s.loyalitaetBeiVeto) })),
          ]));
      })),
      done
        ? el('p', { class: 'rat-ergebnis world', tabindex: '-1' }, icon(done === 'annahme' ? 'dafuer' : 'dagegen', { size: 22 }), t(done === 'annahme' ? 'board.council.decided' : 'board.council.vetoed'))
        : el('div', { class: 'entscheidungen' },
          decisionButton('annahme', t('board.council.accept'), 'btn-primary', F.folgenAnnahme),
          decisionButton('veto', t('board.council.veto'), '', F.folgenVeto, F.vetoKosten))),
  );
}

// --- real campaign ---------------------------------------------------------------

// The kernel's vote reasons are English phrases; spaces become dashes in the label key.
const reason = (grund) => t(`board.vote-reason.${String(grund).replaceAll(' ', '-')}`, grund);
const TALK = ['listen', 'ask', 'honor'];

/** Button for a kernel option: disabled with the kernel's reason, previews its store changes on hover. */
function optionButton(api, opt, label, { cls = '', onAdd } = {}) {
  const disabled = Boolean(opt.grund) || opt.queued || api.model.phase === 'A';
  const btn = el('button', {
    class: `btn ${cls}`,
    type: 'button',
    'aria-disabled': disabled ? 'true' : 'false',
    'data-order': opt.type,
    onclick: () => {
      if (disabled) return;
      if (onAdd) onAdd();
      else api.addCandidate(opt);
    },
    onpointerenter: () => { if (!disabled) api.setPreview(opt.preview); },
    onpointerleave: () => api.setPreview(null),
    onfocus: () => { if (!disabled) api.setPreview(opt.preview); },
    onblur: () => api.setPreview(null),
  }, opt.queued ? icon('ja', { size: 16 }) : null, label);
  return opt.grund ? withTip(btn, [el('span', { text: opt.grund })], null, { up: true }) : btn;
}

function voteQuestion(api, q) {
  const { game } = api;
  const stimmen = [...q.stimmen].sort((a, b) => ORDER[a.wahl] - ORDER[b.wahl]);
  const decree = () => game.setMandate(q.orderId, !q.decree);
  const override = game.previewOption({ type: 'machtprobe', params: { aim: 'override', order: q.orderId } });
  return el('section', { class: 'ratsfrage', 'aria-labelledby': `rf-${q.orderId}`, 'data-frage': q.orderId },
    el('h3', { class: 'world', id: `rf-${q.orderId}`, text: q.titel }),
    el('p', { class: 'rf-worum', text: `${q.regel}: ${t(`board.council.${q.passed ? 'passed' : q.decree ? 'by-decree' : q.override ? 'on-machtprobe' : 'refused'}`)}` }),
    el('div', { class: 'stimmbalken', role: 'img', 'aria-label': stimmen.map((s) => `${s.name} ${wahl(s.wahl).text}`).join(', ') },
      ...stimmen.map((s) => withTip(el('span', { class: `stimme ${s.wahl}`, tabindex: '0', 'aria-label': `${s.name} ${wahl(s.wahl).text}` }, icon(wahl(s.wahl).icon, { size: 16 })),
        [el('strong', { text: s.name })], [el('span', { text: reason(s.grund) })], { up: true }))),
    q.passed ? null : el('div', { class: 'entscheidungen' },
      el('div', { class: 'entscheid' },
        el('button', { class: `btn ${q.decree ? 'btn-primary' : ''}`, type: 'button', 'aria-pressed': String(q.decree), 'data-erlass': q.orderId, disabled: api.model.phase === 'A', onclick: decree },
          icon('dafuer', { size: 18 }), t('mandate.decree'))),
      el('div', { class: 'entscheid' }, optionButton(api, override, t('aim.override')))));
}

function choiceQuestion(api, q) {
  const { game } = api;
  return el('section', { class: 'ratsfrage', 'aria-labelledby': `rf-${q.choiceId}`, 'data-wahl': q.choiceId },
    el('h3', { class: 'world', id: `rf-${q.choiceId}`, text: q.titel }),
    q.worum ? el('p', { class: 'rf-worum', text: q.worum }) : null,
    el('div', { class: 'entscheidungen' }, ...q.optionen.map((o) => el('div', { class: 'entscheid' },
      el('button', {
        class: `btn ${q.gewaehlt === o.id ? 'btn-primary' : ''}`,
        type: 'button',
        'aria-pressed': String(q.gewaehlt === o.id),
        disabled: api.model.phase === 'A',
        onclick: () => game.setChoice(q.choiceId, q.gewaehlt === o.id ? null : o.id),
      }, icon(q.gewaehlt === o.id ? 'ja' : 'pfeil', { size: 18 }), o.text),
      o.folgen.length ? folgenChips(o.folgen.map((f) => ({ icon: f.icon, wert: f.wert, text: f.text }))) : null))));
}

function renderRatReal(dlg, api) {
  const { model, game } = api;
  const questions = model.ratsfragen ?? [];
  const members = model.rat;
  const card = (a) => {
    const talks = TALK.map((mode) => game.previewOption({ type: 'talk', params: { mode, member: a.id } }));
    return el('li', { 'data-berater': a.id },
      withTip(el('button', { class: 'berater-karte', type: 'button', 'aria-label': `${a.name}, ${a.rolle}, ${a.band}, ${t('ui.loyalitaet')} ${signed(a.loyalitaet)}` },
        portrait(a.id, a.name, { size: 76 }),
        el('span', { class: 'rb-name world', text: a.name.split(' ')[0] }),
        el('span', { class: 'rb-rolle' }, icon(ROLLE_ICON[a.id] ?? 'volk', { size: 14 }), a.rolle),
        el('span', { class: 'b-loyal' },
          loyaltyMeter(a.loyalitaet, { label: t.fmt('board.council.loyalty-of', { name: a.name }) }),
          el('span', { class: 'num', text: signed(a.loyalitaet) }))),
      [el('span', { class: 'tip-zitat world', text: a.ziel })],
      [
        el('span', { class: 'tip-zeile' }, el('span', { text: t('ui.loyalitaet') }), el('span', { text: a.band })),
        el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.life-stage') }), el('span', { text: a.lebensstand })),
        el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.favours') }), el('span', { text: a.favor.map((g) => t(`tag.${g}`, g)).join(', ') })),
        el('span', { class: 'tip-zeile' }, el('span', { text: t('board.council.opposes') }), el('span', { text: a.oppose.map((g) => t(`tag.${g}`, g)).join(', ') })),
      ]),
      el('div', { class: 'berater-gespraech' }, ...talks.filter((o) => !o.grund || o.params.mode !== 'honor').map((o) => optionButton(api, o, t(`talk.${o.params.mode}`, o.params.mode), { cls: 'btn-quiet' }))));
  };
  delete dlg.dataset.preview;
  dlg.replaceChildren(
    dialogHead(dlg, t('view.rat'), 'rat'),
    el('div', { class: 'overlay-body rat-body' },
      ...questions.map((q) => (q.kind === 'vote' ? voteQuestion(api, q) : choiceQuestion(api, q))),
      questions.length ? null : el('p', { class: 'rf-worum', text: t('board.council.no-question') }),
      el('ul', { class: 'berater plain' }, ...members.map(card))),
  );
}

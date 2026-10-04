// Council overlay: the open questions, a vote meter by member, and one card per
// adviser with portrait, role symbol and loyalty. Goal and leanings sit in the
// two-stage tooltip of the card. The questions are the council votes of the
// draft's orders (with decree and Machtprobe) and the open event decisions,
// both from the kernel preview; talks are kernel orders of their own.

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { dialogHead, loyaltyMeter } from './dialoge.js';
import { portrait } from './portrait.js';
import { withTip } from './tip.js';
import { t } from '../i18n/index.js';
import { ROLE_ICON } from './ratsleiste.js';

const WAHL_ICON = { ja: 'dafuer', nein: 'dagegen', enthaltung: 'enthaltung_hand' };
const wahl = (w) => ({ icon: WAHL_ICON[w], text: t(`board.vote.${w}`) });
const ORDER = { ja: 0, enthaltung: 1, nein: 2 };

function folgenChips(folgen) {
  return el('ul', { class: 'folgen-chips plain' }, ...folgen.map((f) => el('li', {},
    withTip(el('span', { class: 'folge-chip', tabindex: '0', 'aria-label': f.text }, icon(f.icon, { size: 15 }), f.wert), [el('span', { text: f.text })], null, { up: true }))));
}

// The kernel's vote reasons (engine/core/council.js voteOf) are fixed codes, one an
// English phrase; each maps to its label and the text itself never reaches the player.
const VOTE_REASON = { favours: 'favours', opposes: 'opposes', loyal: 'loyal', discontent: 'discontent', 'loyalty at breaking point': 'loyalty-at-breaking-point' };
const reason = (grund) => (VOTE_REASON[grund] ? t(`board.vote-reason.${VOTE_REASON[grund]}`) : '');
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

export function renderRat(dlg, api) {
  const { model, game } = api;
  const questions = model.ratsfragen ?? [];
  const members = model.rat;
  const roleOf = (id) => game.view.peoples[game.pid].council.find((m) => m.id === id)?.role;
  const card = (a) => {
    const talks = TALK.map((mode) => game.previewOption({ type: 'talk', params: { mode, member: a.id } }));
    return el('li', { 'data-berater': a.id },
      withTip(el('button', { class: 'berater-karte', type: 'button', 'aria-label': `${a.name}, ${a.rolle}, ${a.band}, ${t('ui.loyalitaet')} ${signed(a.loyalitaet)}` },
        portrait(a.id, a.name, { size: 76 }),
        el('span', { class: 'rb-name world', text: a.name.split(' ')[0] }),
        el('span', { class: 'rb-rolle' }, icon(ROLE_ICON[roleOf(a.id)] ?? 'volk', { size: 14 }), a.rolle),
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
  dlg.replaceChildren(
    dialogHead(dlg, t('view.rat'), 'rat'),
    el('div', { class: 'overlay-body rat-body' },
      ...questions.map((q) => (q.kind === 'vote' ? voteQuestion(api, q) : choiceQuestion(api, q))),
      questions.length ? null : el('p', { class: 'rf-worum', text: t('board.council.no-question') }),
      el('ul', { class: 'berater plain' }, ...members.map(card))),
  );
}

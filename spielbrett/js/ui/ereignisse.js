// Event cards after the turn change: every world event, closed decision and
// notice that touches the player's people appears as a centred card, one after
// another, until the player has read it ("Weiter"). Open decisions are answered
// on the card, and fitting orders can be put into the draft from it. All
// consequences shown before a decision come from the kernel preview (D15); the
// card only adds the effects the library card itself declares.
// Acknowledged cards are remembered per campaign and turn in localStorage, a
// convenience that the board does without when storage is unavailable.

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { server, turnStem } from '../data/server.js';
import { ackKey, buildCards, choiceDeltaChips, pickReactions, slotIcon, unacknowledged } from '../data/ereignisse.js';
import { dialogHead } from './dialoge.js';
import { withTip } from './tip.js';
import { getAudio } from '../audio/index.js';
import { t } from '../i18n/index.js';

// Seal of a card by its kind: an open decision, a decision the kernel closed, a notice or a world event.
const KIND_ICON = { entscheidung: 'angebot', entschieden: 'ja', notiz: 'chronist', ereignis: 'welt' };

const RETRY_MS = 700;
const memory = new Map();

function readAcked(key) {
  const acked = new Set(memory.get(key) ?? []);
  try {
    for (const id of JSON.parse(localStorage.getItem(key) ?? '[]')) acked.add(id);
  } catch { /* private window or blocked storage: the in-memory set still covers this session */ }
  return acked;
}

function writeAcked(key, acked) {
  memory.set(key, [...acked]);
  try {
    localStorage.setItem(key, JSON.stringify([...acked]));
  } catch { /* see readAcked */ }
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/** Chips of consequences; the label sits in the tooltip, the value stays on the chip. */
function chipList(chips) {
  return el('ul', { class: 'folgen-chips plain' }, ...chips.map((c) => el('li', {},
    withTip(el('span', { class: 'folge-chip', tabindex: '0', 'aria-label': `${c.text} ${c.wert}`.trim() }, icon(c.icon, { size: 15 }), c.wert), [el('span', { text: c.text })], null, { up: true }))));
}

/**
 * Wires the event queue to a real campaign. Returns { reopen } or null in the
 * prototype (?demo), which has no kernel events.
 */
export function initEreignisse(api) {
  const { game } = api;
  const dlg = document.getElementById('dlg-ereignis');
  if (!game || !dlg) return null;

  let queue = [];
  let index = 0;
  let deferred = false;
  let resumeAfterProbe = false;
  let run = 0;
  const offered = new Set();

  const otherOpen = () => [...document.querySelectorAll('dialog[open]')].some((d) => d !== dlg);
  const turnKey = () => ackKey(game.cid, game.view.turn);

  function acknowledge(card) {
    const key = turnKey();
    const acked = readAcked(key);
    acked.add(card.id);
    writeAcked(key, acked);
  }

  // --- collecting ---------------------------------------------------------------

  async function fetchEvents(turn) {
    if (turn < 1) return null;
    try {
      return await server.events(game.cid, game.pid, turnStem(turn - 1));
    } catch {
      return null;
    }
  }

  /** The season's log from the player's event file, completed by the round report once it has arrived. */
  async function collect(retry) {
    const { view } = game;
    let events = await fetchEvents(view.turn);
    // The view's file watcher can fire a moment before the event file is complete.
    if (!events && retry && view.turn > 0) {
      await delay(RETRY_MS);
      events = await fetchEvents(view.turn);
    }
    const report = game.report?.turn === view.turn - 1 ? game.report.events ?? [] : [];
    return buildCards({ view: game.view, env: game.env, t, events: [...(events ?? []), ...report], draft: game.draft });
  }

  async function sync({ retry = false } = {}) {
    const mine = ++run;
    const cards = await collect(retry);
    if (mine !== run) return;
    const fresh = unacknowledged(cards, readAcked(turnKey()), offered);
    if (!fresh.length) return;
    for (const c of fresh) offered.add(c.id);
    if (dlg.open) {
      queue.push(...fresh);
      return;
    }
    queue = fresh;
    index = 0;
    // A probe or council dialog the player is working in is not interrupted.
    if (otherOpen()) deferred = true;
    else openQueue();
  }

  // --- the card -------------------------------------------------------------------

  function openQueue() {
    deferred = false;
    render();
    if (!dlg.open) dlg.showModal();
    dlg.querySelector('h2')?.focus();
  }

  function next() {
    const card = queue[index];
    if (card) acknowledge(card);
    if (index + 1 < queue.length) {
      index += 1;
      render();
      dlg.querySelector('h2')?.focus();
      // The first card sounds when the dialog opens; each further one gets its own stinger.
      getAudio()?.play('event');
    } else {
      dlg.close();
    }
  }

  const withAnswer = (choiceId, optionId) => (d) => ({ ...d, choices: { ...(d.choices ?? {}), [choiceId]: optionId } });
  /** The kernel's preview of one answer: its once effects and the change of the stores at season end. */
  function answerPreview(choiceId, optionId) {
    const pv = game.previewWith(withAnswer(choiceId, optionId));
    return {
      delta: pv.choices?.find((c) => c.id === choiceId && c.option === optionId)?.delta ?? null,
      deltas: game.deltasWith(withAnswer(choiceId, optionId)),
    };
  }

  function imageSlot(card) {
    const slot = el('figure', { class: `ereignis-bild${card.image ? '' : ' ohne-bild'}` }, icon(card.icon, { size: card.image ? 64 : 40 }));
    if (card.image) {
      const img = el('img', { src: card.image, alt: '', loading: 'lazy' });
      // A broken URL leaves the framed placeholder in place.
      img.addEventListener('error', () => img.remove());
      slot.prepend(img);
    }
    return slot;
  }

  /** Options of an open decision; consequences from the kernel preview, completed by what the card declares. */
  function choiceBlock(card) {
    const { choice } = card;
    const locked = api.model.phase === 'A';
    return el('section', { class: 'ereignis-wahl', 'aria-label': t('ereignis.entscheidung') },
      el('p', { class: 'ereignis-frist' }, icon('dauer', { size: 16 }), `${t('ereignis.frist')} ${choice.frist.saison}`),
      el('div', { class: 'ereignis-optionen', role: 'group', 'aria-label': t('ereignis.entscheidung') }, ...choice.optionen.map((o, i) => {
        // The answer lives in the draft; the card was built before the player chose.
        const chosen = game.draft.choices?.[choice.choiceId] === o.id;
        const { delta, deltas } = answerPreview(choice.choiceId, o.id);
        // The kernel's own preview of the answer comes first; declared effects it cannot carry (relations, reveals) complete it.
        const kernel = choiceDeltaChips(delta, { view: game.view, t });
        const folgen = delta ? [...kernel, ...o.folgen.filter((f) => !f.kernel)] : o.folgen;
        const hasPreview = Object.keys(deltas).length > 0;
        const show = () => { if (hasPreview && !locked) api.setPreview({ deltas, tiles: [] }); };
        return el('button', {
          class: `ereignis-option${chosen ? ' is-gewaehlt' : ''}`,
          type: 'button',
          'aria-pressed': String(chosen),
          'aria-disabled': locked ? 'true' : 'false',
          'aria-label': [o.text, ...folgen.map((f) => `${f.text} ${f.wert}`.trim())].join(', '),
          'data-option': o.id,
          'data-fokus': `wahl-${i}`,
          onclick: () => { if (!locked) game.setChoice(choice.choiceId, chosen ? null : o.id); },
          onpointerenter: show,
          onpointerleave: () => api.setPreview(null),
          onfocus: show,
          onblur: () => api.setPreview(null),
        },
        el('span', { class: 'option-marke', 'aria-hidden': 'true' }, icon(chosen ? 'ja' : 'pfeil', { size: 18 })),
        el('span', { class: 'option-text', text: o.text }),
        folgen.length ? el('span', { class: 'option-folgen', 'aria-hidden': 'true' }, ...folgen.map((f) => el('span', { class: 'folge-chip', title: f.text }, icon(f.icon, { size: 14 }), f.wert))) : null);
      })));
  }


  /** Orders the kernel offers at the camp that fit the event, as buttons that put them into the draft. */
  function reactionBlock(card) {
    const home = api.model.home;
    if (!home) return null;
    const options = game.optionsFor({ kind: 'unit', id: home.id, q: home.q, r: home.r });
    const devTagsOf = (o) => game.env.entwicklung(o.params?.development ?? o.params?.type)?.tags ?? [];
    const picked = pickReactions(card, options, devTagsOf);
    if (!picked.length) return null;
    const locked = api.model.phase === 'A';
    return el('div', { class: 'ereignis-reaktionen', role: 'group', 'aria-label': t('ereignis.reaktion') },
      withTip(el('span', { class: 'reaktion-marke', tabindex: '0', 'aria-label': t('ereignis.reaktion') }, icon('praxis', { size: 16 })), [el('span', { text: t('ereignis.reaktion') })], null, { up: true }),
      ...picked.map((o, i) => {
        const taken = Boolean(o.queued);
        const btn = el('button', {
          class: 'btn btn-quiet ereignis-reaktion',
          type: 'button',
          'aria-disabled': taken || locked ? 'true' : 'false',
          'data-order': o.type,
          'data-fokus': `react-${i}`,
          onclick: () => {
            if (taken || locked) return;
            // A probe opens its own dialog, which replaces this one: the card counts as read and the queue resumes afterwards.
            if (o.probe) {
              acknowledge(card);
              resumeAfterProbe = true;
            }
            api.addCandidate(o);
          },
          onpointerenter: () => { if (!taken && !locked) api.setPreview(o.preview); },
          onpointerleave: () => api.setPreview(null),
          onfocus: () => { if (!taken && !locked) api.setPreview(o.preview); },
          onblur: () => api.setPreview(null),
        },
        icon(taken ? 'ja' : slotIcon(o.art), { size: 18 }),
        el('span', { class: 'er-titel' }, o.titel, o.ziel ? el('span', { class: 'er-ziel', text: o.ziel }) : null),
        o.probe ? icon('wuerfel', { size: 16 }) : null,
        o.kosten.length ? el('span', { class: 'costs' }, ...o.kosten.map((k) => el('span', { class: 'cost', 'aria-label': `${signed(-k.menge)} ${api.resourceName(k.key)}` }, icon(k.key, { size: 15 }), signed(-k.menge)))) : null);
        return btn;
      }));
  }

  function render() {
    const card = queue[index];
    if (!card) return;
    const focused = document.activeElement?.dataset?.fokus;
    dlg.setAttribute('aria-describedby', 'dlg-ereignis-text');
    dlg.dataset.art = card.kind;
    dlg.replaceChildren(
      dialogHead(dlg, card.title, KIND_ICON[card.kind] ?? 'welt'),
      el('div', { class: 'overlay-body ereignis-body' },
        imageSlot(card),
        card.status ? el('p', { class: 'ereignis-status' }, icon(card.status.icon, { size: 16 }), card.status.text) : null,
        card.text ? el('p', { class: 'ereignis-text world', id: 'dlg-ereignis-text', text: card.text }) : null,
        card.chips.length ? chipList(card.chips) : null,
        card.choice ? choiceBlock(card) : null,
        reactionBlock(card)),
      el('footer', { class: 'ereignis-fuss' },
        pager(),
        el('button', { class: 'btn btn-primary btn-gross', type: 'button', 'data-fokus': 'weiter', onclick: next }, t('ereignis.weiter'), icon('pfeil', { size: 18 }))));
    if (focused) dlg.querySelector(`[data-fokus="${focused}"]`)?.focus();
  }

  /** Where the card stands in the queue of the season, as marks; only a queue of more than one card has one. */
  function pager() {
    if (queue.length < 2) return el('span', { class: 'ereignis-seiten' });
    return el('span', { class: 'ereignis-seiten', role: 'img', 'aria-label': t.fmt('board.event.position', { n: index + 1, total: queue.length }) },
      ...queue.map((c, i) => el('span', { class: `seite${i === index ? ' is-aktiv' : i < index ? ' is-gelesen' : ''}` })));
  }

  // Enter reads on from anywhere on the card except where it activates a control of its own.
  dlg.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.target instanceof HTMLElement && e.target.closest('button, a, input, select, textarea')) return;
    e.preventDefault();
    next();
  });

  // Dialogs close without bubbling, so the capture phase sees them all.
  document.addEventListener('close', (e) => {
    if (e.target === dlg) return;
    if (resumeAfterProbe && e.target.id === 'dlg-probe') {
      resumeAfterProbe = false;
      queue = queue.filter((c, i) => i >= index && !readAcked(turnKey()).has(c.id));
      index = 0;
      if (queue.length) {
        if (otherOpen()) deferred = true;
        else openQueue();
      }
      return;
    }
    if (deferred && !otherOpen()) openQueue();
  }, true);

  game.onUpdate((kind, detail) => {
    if (kind === 'view' && detail.before.turn !== detail.after.turn) {
      offered.clear();
      sync({ retry: true });
    } else if (kind === 'report') {
      sync();
    } else if (kind === 'draft' && dlg.open) {
      render();
    }
  });

  // A reload after the turn change must show what has not been read yet.
  sync({ retry: true });

  return { reopen() { offered.clear(); return sync(); } };
}

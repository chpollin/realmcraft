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
import { ackKey, buildCards, deltaChips, pickReactions, slotIcon, unacknowledged } from '../data/ereignisse.js';
import { dialogHead } from './dialoge.js';
import { withTip } from './tip.js';

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

  const t = (key, fallback) => game.t(key, fallback);
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
    return buildCards({ view: game.view, env: game.env, t: game.t, events: [...(events ?? []), ...report], draft: game.draft });
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
    } else {
      dlg.close();
    }
  }

  const kernelDeltas = (choiceId, optionId) => game.deltasWith((d) => ({ ...d, choices: { ...(d.choices ?? {}), [choiceId]: optionId } }));

  function imageSlot(card) {
    const slot = el('figure', { class: 'ereignis-bild' }, icon(card.icon, { size: 64 }));
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
    return el('section', { class: 'ereignis-wahl', 'aria-label': t('ereignis.entscheidung', 'Entscheidung') },
      el('p', { class: 'ereignis-frist' }, icon('dauer', { size: 16 }), `${t('ereignis.frist', 'Entscheidung bis')} ${choice.frist.saison}`),
      el('div', { class: 'ereignis-optionen' }, ...choice.optionen.map((o, i) => {
        const chosen = choice.gewaehlt === o.id;
        const deltas = kernelDeltas(choice.choiceId, o.id);
        const kernel = deltaChips(deltas, game.t);
        const folgen = [...kernel, ...o.folgen.filter((f) => !(f.store && kernel.length))];
        const hasPreview = Object.keys(deltas).length > 0;
        const show = () => { if (hasPreview && !locked) api.setPreview({ deltas, tiles: [] }); };
        return el('div', { class: 'entscheid' },
          el('button', {
            class: `btn ereignis-option ${chosen ? 'btn-primary' : ''}`,
            type: 'button',
            'aria-pressed': String(chosen),
            disabled: locked,
            'data-fokus': `wahl-${i}`,
            onclick: () => game.setChoice(choice.choiceId, chosen ? null : o.id),
            onpointerenter: show,
            onpointerleave: () => api.setPreview(null),
            onfocus: show,
            onblur: () => api.setPreview(null),
          }, icon(chosen ? 'ja' : 'pfeil', { size: 18 }), el('span', { text: o.text })),
          folgen.length ? chipList(folgen) : null);
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
    return el('div', { class: 'ereignis-reaktionen', role: 'group', 'aria-label': t('ereignis.reaktion', 'In die Befehle aufnehmen') },
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
      dialogHead(dlg, card.title, 'welt'),
      el('div', { class: 'overlay-body ereignis-body' },
        imageSlot(card),
        card.status ? el('p', { class: 'ereignis-status' }, icon(card.status.icon, { size: 16 }), card.status.text) : null,
        card.text ? el('p', { class: 'ereignis-text world', id: 'dlg-ereignis-text', text: card.text }) : null,
        card.chips.length ? chipList(card.chips) : null,
        card.choice ? choiceBlock(card) : null,
        reactionBlock(card)),
      el('footer', { class: 'ereignis-fuss' },
        el('button', { class: 'btn btn-primary btn-gross', type: 'button', 'data-fokus': 'weiter', onclick: next }, t('ereignis.weiter', 'Weiter'), icon('pfeil', { size: 18 }))));
    if (focused) dlg.querySelector(`[data-fokus="${focused}"]`)?.focus();
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

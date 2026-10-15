// Top bar (people, season, stores, destiny, overlay shortcuts) and turn bar
// (orders of this turn, messages, end turn).

import { el, signed } from '../dom.js';
import { icon, orderIcon } from '../icons.js';
import { withTip } from './tip.js';
import { t } from '../i18n/index.js';
import { currentResearch } from '../data/pfade.js';

const TREND = { 1: ['trendAuf', 'up', 'rising'], 0: ['trendGleich', '', 'steady'], [-1]: ['trendAb', 'down', 'falling'] };
const BUDGET = { haupt: 1, neben: 2 };
const blockerStates = new WeakMap();

export function renderTopbar(api) {
  const { model } = api;
  document.getElementById('volk-name').textContent = model.volk.name;
  document.getElementById('zeit').textContent = t.fmt('board.time', { season: model.zeit.saison, year: model.zeit.jahr });
  renderResources(api);
  renderDestinyChip(api);
  // Views are named from the world's labels (view.<id>); the paths are a board concept and named by the board.
  const labels = { entwicklungen: [t('board.paths.title'), 'E'], rat: [t('view.rat'), 'R'], chronik: [t('view.chronik'), 'C'] };
  for (const b of document.querySelectorAll('.kurz')) {
    const [label, key] = labels[b.dataset.dialog];
    b.classList.add('has-tip');
    b.replaceChildren(icon(b.dataset.dialog), el('span', { class: 'kurz-label', text: label }), el('kbd', { text: key, 'aria-hidden': 'true' }),
      el('span', { class: 'tip tip-kurz tip-rechts', 'aria-hidden': 'true' }, `${label} `, el('kbd', { text: key })));
    b.setAttribute('aria-label', label);
    b.onclick = () => api.openDialog(b.dataset.dialog);
  }
}

export function reservedFor(model, key) {
  return model.orders.flatMap((o) => (o.kosten ?? []).filter((k) => k.key === key).map((k) => ({ menge: k.menge, titel: o.titel })));
}

export function renderResources(api, { bump = [] } = {}) {
  const { model } = api;
  const ul = document.getElementById('ressourcen');
  const preview = model.preview?.deltas ?? {};
  const all = [...model.ressourcen, ...model.module];
  ul.replaceChildren(
    ...all.map((r, i) => {
      const [tIcon, tCls, trend] = TREND[r.trend] ?? TREND[0];
      const tWord = t(`board.trend.${trend}`);
      const res = reservedFor(model, r.key);
      const reserved = res.reduce((a, x) => a + x.menge, 0);
      const free = r.wert - reserved;
      const d = preview[r.key];
      const btn = el('button', {
        class: `res${model.module.includes(r) ? ' res-sonder' : ''}`,
        type: 'button',
        'aria-label': [`${r.name} ${free}`, reserved ? t.fmt('board.res.reserved', { n: reserved }) : null, tWord].filter(Boolean).join(', '),
      },
      icon(r.key, { size: 18 }),
      el('span', { class: 'res-name', text: r.name }),
      el('span', { class: `res-wert${bump.includes(r.key) ? ' bump' : ''}`, text: String(free) }),
      icon(tIcon, { size: 14, cls: `trend ${tCls}` }),
      d ? el('span', { class: `delta ${d > 0 ? 'up' : 'down'}`, 'aria-label': t.fmt('board.res.preview', { delta: signed(d) }), text: signed(d) }) : null);
      const detail = [
        el('span', { class: 'tip-zeile' }, el('span', { text: t('board.res.stock') }), el('span', { text: String(r.wert) })),
        ...res.map((x) => el('span', { class: 'tip-zeile' }, el('span', { text: x.titel }), el('span', { class: 'down', text: signed(-x.menge) }))),
        ...(r.verlauf ?? []).map((v) => el('span', { class: 'tip-zeile' }, el('span', { text: v.grund }), el('span', { class: v.delta > 0 ? 'up' : 'down', text: signed(v.delta) }))),
        ...(r.prognose ?? []).map((v) => el('span', { class: 'tip-zeile' }, el('span', { text: v.grund }), el('span', { class: v.delta > 0 ? 'up' : 'down', text: signed(v.delta) }))),
        el('span', { text: [t(`board.trend.${trend}.cap`), r.grund].filter(Boolean).join(', ') }),
      ];
      const firstSpecial = model.module.length && r === model.module[0];
      return el('li', { class: firstSpecial ? 'res-trenner' : '' }, withTip(btn, [el('strong', { text: r.name }), ` ${free}`], detail, { right: i > all.length - 3 }));
    }),
  );
}

export function renderDestinyChip(api) {
  const b = api.model.bestimmung;
  const btn = document.getElementById('bestimmung-kurz');
  const done = b.meilensteine.filter((m) => m.erreicht).length;
  btn.replaceChildren(
    icon('bestimmung', { size: 18 }),
    el('span', { class: 'world', text: b.name }),
    el('span', { class: 'pips', 'aria-hidden': 'true' },
      ...b.meilensteine.map((m) => el('span', { class: `pip${m.erreicht ? ' on' : ''}` }))),
    el('span', { class: 'tip tip-rechts', role: 'tooltip', id: 'tip-bestimmung' },
      el('strong', { text: b.name }),
      ...b.meilensteine.map((m) => el('span', { style: { display: 'block' }, text: `${m.erreicht ? t('board.destiny.reached') : m.stand}, ${m.text}` })),
    ),
  );
  btn.setAttribute('aria-label', t.fmt('board.destiny.chip', { name: b.name, done, total: b.meilensteine.length }));
  btn.setAttribute('aria-describedby', 'tip-bestimmung');
  btn.onclick = () => api.openDialog('bestimmung');
}

export function budgetState(model) {
  // Used and available slots come from the kernel preview; a draft the preview
  // stops early on (an ended campaign, a phase without planning) has none, so
  // the orders are counted against the default budget.
  if (model.slots) return { used: { haupt: model.slots.main.used, neben: model.slots.minor.used }, max: { haupt: model.slots.main.max, neben: model.slots.minor.max } };
  const used = { haupt: 0, neben: 0 };
  for (const o of model.orders) if (o.art in used) used[o.art]++;
  return { used, max: BUDGET };
}

export const SLOT_ICON = { haupt: 'haupt', neben: 'neben', frei: 'enthaltung', forschung: 'wissen' };
/** Name of a slot kind (haupt, neben, frei, forschung). */
export const slotName = (art) => t(`board.slot.${art}`);

/** Slot an option takes on the board: research orders draw on the research budget, not on an action slot. */
export const slotOf = (opt) => (String(opt.type ?? '').startsWith('research.') ? 'forschung' : opt.art);

/**
 * Marks the slot an order would take while it is hovered or focused:
 * { art, ersetzt } or null. A full slot shows as such, with the order the
 * option would replace marked.
 */
export function hintSlot(api, hint) {
  const same = JSON.stringify(hint) === JSON.stringify(api.model.slotHint ?? null);
  if (same) return;
  api.model.slotHint = hint;
  renderBudget(api);
}

function focusOrder(orderId) {
  document.querySelector(`#befehle [data-order-id="${orderId}"] button, #befehle [data-order-id="${orderId}"] [tabindex]`)?.focus();
}

/** One slot box per available action of a kind; filled boxes name their order. */
function slotGroup(api, art, used, max) {
  const { model } = api;
  const hint = model.slotHint;
  const orders = model.orders.filter((o) => o.art === art);
  const n = Math.max(used, max);
  const target = hint?.art === art && !hint.ersetzt && used < max ? used : -1;
  const locked = model.phase === 'A' || api.game.view.status === 'ended';
  const boxes = Array.from({ length: n }, (_, i) => {
    const o = orders[i];
    const cls = ['slot', art, i < used ? 'on' : 'is-empty', i >= max ? 'over' : '', i === target ? 'is-ziel' : '', hint?.art === art && used >= max ? 'is-voll' : '', o && hint?.ersetzt === o.id ? 'is-ersetzt' : ''].filter(Boolean).join(' ');
    const label = o ? t.fmt('board.plan.inspect', { title: [o.titel, o.ziel].filter(Boolean).join(', ') })
      : t.fmt(`board.plan.${art}.slot`, { n: i + 1 });
    const btn = el('button', {
      class: cls, type: 'button', 'data-slot-key': `${art}:${i}`, 'data-slot-index': i,
      'data-plan-slot': o ? null : art, 'data-order-focus': o?.id,
      'aria-label': label, 'aria-haspopup': o ? null : 'dialog', 'aria-controls': o ? 'befehle' : 'dlg-planen',
      disabled: !o && (locked || i < used),
      onclick: () => {
        if (o) return focusOrder(o.id);
        const dlg = document.getElementById('dlg-planen');
        dlg.dataset.returnSlot = `${art}:${i}`;
        api.openDialog('planen', { art });
      },
    }, icon(o ? orderIcon(o.type) : 'plus', { size: 24 }),
    o ? el('span', { class: 'slot-check', 'aria-hidden': 'true' }, icon('ja', { size: 10 })) : null);
    return withTip(btn, [el('strong', { text: label })], null, { up: true });
  });
  return el('div', { class: `slot-gruppe${used > max ? ' is-ueber' : ''}`, role: 'group', 'aria-label': t.fmt(`board.slots.${art}.group`, { used, max }), 'data-slots': art },
    el('span', { class: 'slot-name', 'aria-hidden': 'true' }, icon(SLOT_ICON[art], { size: 12 }), t(`board.slots.${art}.short`)),
    el('span', { class: 'slot-boxen' }, ...boxes));
}
function researchBudget(api) {
  const { game, model } = api;
  const now = currentResearch({ view: game.view, env: game.env, draft: game.draft, pv: game.base });
  const name = now.ref ? game.env.entwicklung(now.ref)?.name ?? now.ref : t('board.research.open');
  const hint = model.slotHint?.art === 'forschung';
  const pts = now.points;
  const progress = now.ref ? t.fmt('board.paths.progress', { done: now.progress, total: now.cost }) : null;
  const bar = now.ref ? el('span', { class: 'fb-balken', 'aria-hidden': 'true' },
    el('span', { class: 'fb-stand', style: { inlineSize: `${(100 * now.progress) / now.cost}%` } }),
    now.gain ? el('span', { class: 'fb-zuwachs', style: { inlineSize: `${(100 * now.gain) / now.cost}%` } }) : null) : null;
  const label = [t.fmt(now.chosen ? 'board.research.label-chosen' : 'board.research.label', { name }), t.fmt('board.paths.points', { n: pts.total }), progress].filter(Boolean).join(', ');
  return withTip(el('button', {
    class: `forschung-budget${now.chosen ? ' on' : ''}${hint ? ' is-ziel' : ''}`,
    type: 'button',
    'data-forschung': '',
    'aria-label': label,
    onclick: () => api.openDialog('entwicklungen'),
  }, icon('wissen', { size: 20 }), el('span', { class: 'fb-punkte num', text: signed(pts.total) }),
  el('span', { class: 'fb-projekt' }, el('span', { class: 'fb-name', text: name }), bar)),
  [el('strong', { text: t('board.slot.forschung') }), ` ${name}`],
  [
    progress ? el('span', { class: 'tip-zeile' }, el('span', { text: t('board.paths.cost') }), el('span', { text: progress })) : null,
    el('span', { class: 'tip-zeile' }, el('span', { text: t('board.paths.points.total') }), el('span', { class: 'up', text: signed(pts.total) })),
    el('span', { text: t(now.chosen ? 'board.research.tip-chosen' : 'board.research.tip') }),
  ].filter(Boolean), { up: true });
}

export function renderBudget(api) {
  const { used, max } = budgetState(api.model);
  const budget = document.getElementById('budget');
  const focused = budget.contains(document.activeElement) ? document.activeElement.dataset.slotKey : null;
  budget.replaceChildren(
    slotGroup(api, 'haupt', used.haupt, max.haupt),
    slotGroup(api, 'neben', used.neben, max.neben),
    researchBudget(api),
  );
  if (focused) budget.querySelector(`[data-slot-key="${focused}"]`)?.focus({ preventScroll: true });
}

/** The world event of the season as a step of its own in the turn bar, rolled like any probe. */
function eventChip(api) {
  const { game } = api;
  const p = game.base.probes.find((x) => x.target == null && x.roller === 'player');
  if (!p) return null;
  const roll = game.draft.rolls?.[p.id];
  const face = roll ? game.faces(p)[roll.value - 1] : null;
  const locked = api.model.phase === 'A';
  return el('li', { class: `befehl ereignis-schritt${roll ? '' : ' is-offen'}`, 'data-order-id': 'event' },
    icon('welt', { size: 16 }),
    el('span', { class: 'befehl-titel', text: t('ui.weltereignis') }),
    roll
      ? withTip(el('span', { class: 'befehl-wurf', tabindex: '0', 'aria-label': t.fmt('board.event.rolled', { value: roll.value, band: face.label }) }, icon('wuerfel', { size: 14 }), String(roll.value)), [el('span', { text: face.label })], null, { up: true })
      : locked ? null : el('button', { class: 'btn btn-klein', type: 'button', 'data-ereignis-wurf': '', onclick: () => api.openDialog('probe', { probeId: p.id }) }, icon('wuerfel', { size: 16 }), t('ui.wuerfeln')));
}

export function renderOrders(api, { freshId } = {}) {
  const { model } = api;
  renderBudget(api);
  const ol = document.getElementById('befehle');
  const active = document.activeElement;
  const focusedOrder = ol.contains(active) ? active.closest('[data-order-id]') : null;
  const focusId = focusedOrder?.dataset.orderId;
  const focusLabel = active?.getAttribute('aria-label');
  const focusIndex = focusedOrder ? [...ol.children].indexOf(focusedOrder) : -1;
  const restoreFocus = () => {
    if (!focusedOrder) return;
    const row = [...ol.children].find((x) => x.dataset.orderId === focusId) ?? ol.children[Math.min(focusIndex, ol.children.length - 1)];
    const controls = [...(row?.querySelectorAll('button, [tabindex]') ?? [])];
    (controls.find((x) => x.getAttribute('aria-label') === focusLabel) ?? controls[0] ?? document.getElementById('zug-beenden')).focus();
  };
  const event = eventChip(api);
  if (!model.orders.length) {
    const canPlan = model.surface !== 'gemeinschaft' && model.phase !== 'A' && model.home && api.game.view.status !== 'ended';
    const empty = canPlan
      ? el('li', { class: 'befehle-einstieg', 'data-order-id': 'plan' },
        el('button', { class: 'befehl-planen', type: 'button', 'data-plan-home': '', 'aria-label': t('board.orders.plan'), onclick: () => api.openHome() },
          icon('lager', { size: 18 }), t('board.orders.plan')))
      : el('li', { class: 'befehle-leer', text: t(model.phase === 'A' ? 'board.orders.running' : 'board.orders.none') });
    ol.replaceChildren(...[empty, event].filter(Boolean));
    restoreFocus();
    return;
  }
  const locked = model.phase === 'A';
  ol.replaceChildren(
    ...(event ? [event] : []),
    ...model.orders.map((o) => el('li', { class: `befehl${o.id === freshId ? ' is-new' : ''}${o.issues?.length ? ' is-problem' : ''}`, 'data-order-id': o.id },
      icon(SLOT_ICON[slotOf(o)] ?? 'enthaltung', { size: 16, cls: `befehl-art ${o.art}`, label: slotName(slotOf(o)) }),
      el('span', { class: 'befehl-text' },
        el('span', { class: 'befehl-titel', text: o.titel }), ' ',
        el('span', { class: 'befehl-ziel', text: o.ziel })),
      o.wurf ? withTip(el('span', { class: `befehl-wurf ${o.wurf.stale ? 'veraltet' : o.wurf.gut ? 'gut' : 'schlecht'}`, tabindex: '0', 'aria-label': o.wurf.kurz }, icon('wuerfel', { size: 14 }), icon(o.wurf.stale ? 'warnung' : o.wurf.gut ? 'ja' : 'nein', { size: 14 })), [el('span', { text: o.wurf.kurz })], null, { up: true }) : null,
      o.offen && !locked ? el('button', { class: 'befehl-wurf offen', type: 'button', 'aria-label': t.fmt('board.orders.roll', { title: o.titel }), onclick: () => api.rollOrder(o.id) }, icon('wuerfel', { size: 14 })) : null,
      o.wurf?.stale && !locked ? el('button', { class: 'befehl-wurf offen', type: 'button', 'aria-label': t.fmt('board.orders.reroll', { title: o.titel }), onclick: () => api.rollOrder(o.id) }, icon('wuerfel', { size: 14 })) : null,
      // Issue texts are labels from the issue code; the kernel's English message is for logs only.
      o.issues?.length ? withTip(el('span', { class: 'befehl-problem', tabindex: '0', 'data-issue': o.issues[0].code, 'aria-label': [...new Set(o.issues.map((i) => i.text))].join(', ') }, icon('warnung', { size: 14 })), [el('span', { text: [...new Set(o.issues.map((i) => i.text))].join(', ') })], null, { up: true }) : null,
      o.kosten?.length ? el('span', { class: 'costs' }, ...o.kosten.map((k) => el('span', { class: 'cost', 'aria-label': `${k.menge} ${k.key}` }, icon(k.key, { size: 14 }), String(k.menge)))) : null,
      locked ? null : el('button', { class: 'icon-btn', type: 'button', 'aria-label': t.fmt('board.orders.withdraw', { title: o.titel }), onclick: () => api.removeOrder(o.id) }, icon('schliessen', { size: 16 })),
    )),
  );
  restoreFocus();
}

export function renderMessages(api, { freshId } = {}) {
  const { model } = api;
  const ul = document.getElementById('meldungen');
  const ICON = { warnung: 'warnung', angebot: 'angebot', meilenstein: 'meilenstein', welt: 'welt' };
  ul.replaceChildren(
    ...model.meldungen.map((m) => {
      const tipId = `tip-${m.id}`;
      return el('li', {},
        el('button', {
          class: `meldung has-tip ${m.art}${m.id === freshId ? ' is-new' : ''}`,
          type: 'button',
          'aria-describedby': tipId,
          onclick: () => api.meldungAktion(m),
        },
        icon(ICON[m.art] ?? 'warnung', { size: 18, label: t(`board.message.${ICON[m.art] ?? 'warnung'}`) }),
        el('span', { class: 'meldung-titel', text: m.titel }),
        el('span', { class: 'tip tip-up', role: 'tooltip', id: tipId }, el('strong', { text: m.titel }), m.text)));
    }),
  );
}

export function renderEndTurn(api) {
  const { model } = api;
  const b = document.getElementById('zug-beenden');
  const busy = model.phase === 'A';
  const next = model.naechsteZeit;
  // The agents' round keeps planning open but the turn closed until the kernel opens it.
  const waiting = !busy && model.kernPhase === 'agents';
  const blockers = !busy && !waiting ? api.game.blockers() : { probleme: [], wuerfe: [] };
  const problems = blockers.probleme.length;
  const rolls = blockers.wuerfe.length;
  const pending = [problems ? t.plural('board.problems', problems) : null, rolls ? t.plural('board.rolls-open', rolls) : null].filter(Boolean).join(', ');
  const nextTime = t.fmt('board.time', { season: next.saison, year: next.jahr });
  const title = t(busy ? 'board.endturn.busy' : waiting ? 'board.endturn.waiting' : 'ui.zug-beenden');
  const sub = busy ? t('board.endturn.locked') : waiting ? t('board.endturn.after-agents') : pending || nextTime;
  b.replaceChildren(
    el('span', { class: 'zb-titel', text: title }),
    el('span', { class: 'zb-sub', text: sub }),
    icon(busy || waiting ? 'kern' : problems ? 'warnung' : rolls ? 'wuerfel' : 'pfeil', { size: 22 }),
  );
  b.classList.toggle('has-problems', problems > 0);
  b.classList.toggle('has-rolls', rolls > 0);
  b.setAttribute('aria-disabled', busy || waiting ? 'true' : 'false');
  b.setAttribute('aria-label', busy ? t('board.endturn.busy-label') : waiting ? t('board.endturn.waiting-label') : t.fmt(pending ? 'board.endturn.rolls-label' : 'board.endturn.label', { rolls: pending, next: nextTime }));
  document.getElementById('zugleiste').classList.toggle('is-locked', busy);
  renderBlocker(api);
}

/**
 * What keeps the turn from ending, beside "Zug beenden": "2 Probleme" opens
 * the list of problems, each with the way to it or the fix in place;
 * "2 Würfe offen" rolls the owed probes one by one.
 */
export function renderBlocker(api, { open } = {}) {
  const box = document.getElementById('blocker');
  const { game, model } = api;
  let state = blockerStates.get(box);
  if (!state) {
    state = { returnTo: '#zug-beenden' };
    blockerStates.set(box, state);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]') || !box.querySelector('.blocker-liste:not([hidden])')) return;
      e.preventDefault();
      e.stopPropagation();
      closeBlocker(api, true);
    }, true);
    document.addEventListener('pointerdown', (e) => {
      if (!box.contains(e.target) && e.target.closest('#zug-beenden') == null && box.querySelector('.blocker-liste:not([hidden])')) closeBlocker(api);
    });
  }
  const active = document.activeElement;
  const focusedItem = box.contains(active) ? active.closest('.blocker-eintrag') : null;
  const focusIndex = focusedItem ? [...box.querySelectorAll('.blocker-eintrag')].indexOf(focusedItem) : -1;
  const actionIndex = focusedItem ? [...focusedItem.querySelectorAll('button')].indexOf(active) : -1;
  const toggleFocus = box.contains(active) ? active.dataset.blocker : null;
  const closeFocus = box.contains(active) && active.hasAttribute('data-blocker-close');
  const wasOpen = Boolean(box.querySelector('.blocker-liste:not([hidden])'));
  const isOpen = open ?? wasOpen;
  if (isOpen && !wasOpen) state.returnTo = active === document.getElementById('zug-beenden') ? '#zug-beenden' : '#blocker [data-blocker="probleme"]';
  const { probleme, wuerfe } = model.phase === 'A' || model.kernPhase === 'agents' ? { probleme: [], wuerfe: [] } : game.blockers();
  if (!probleme.length && !wuerfe.length) {
    const hadFocus = box.contains(active);
    box.replaceChildren();
    if (hadFocus) document.getElementById('zug-beenden').focus();
    return;
  }
  const list = el('ul', { class: 'blocker-liste plain', id: 'blocker-liste', role: 'list', hidden: !isOpen },
    el('li', { class: 'blocker-kopf', role: 'presentation' },
      el('button', { class: 'btn btn-klein', type: 'button', 'data-blocker-close': '', onclick: () => closeBlocker(api, true) }, icon('schliessen', { size: 16 }), t('board.close'))),
    ...[...probleme, ...wuerfe].map((b) => blockerItem(api, b)));
  const toggle = probleme.length ? el('button', {
    class: 'blocker-knopf problem', type: 'button', 'aria-expanded': String(isOpen), 'aria-controls': 'blocker-liste', 'data-blocker': 'probleme',
    onclick: () => {
      renderBlocker(api, { open: list.hidden });
      document.querySelector('#blocker [data-blocker="probleme"]')?.focus();
    },
  }, icon('warnung', { size: 16 }), t.plural('board.problems', probleme.length)) : null;
  const rolls = wuerfe.length ? el('button', {
    class: 'blocker-knopf wurf', type: 'button', 'data-blocker': 'wuerfe',
    onclick: () => api.rollOwed(),
  }, icon('wuerfel', { size: 16 }), t.plural('board.rolls-open', wuerfe.length)) : null;
  box.replaceChildren(el('div', { class: 'blocker-knoepfe' }, toggle ?? '', rolls ?? ''), list);
  if (focusedItem && isOpen) {
    const items = [...box.querySelectorAll('.blocker-eintrag')];
    const row = items.find((x) => x.dataset.blockerId === focusedItem.dataset.blockerId) ?? items[Math.min(focusIndex, items.length - 1)];
    const controls = [...(row?.querySelectorAll('button') ?? [])];
    (controls[Math.min(actionIndex, controls.length - 1)] ?? box.querySelector('[data-blocker="probleme"], [data-blocker="wuerfe"]') ?? document.getElementById('zug-beenden')).focus();
  } else if (toggleFocus) {
    (box.querySelector('[data-blocker="' + toggleFocus + '"]') ?? box.querySelector('[data-blocker]') ?? document.getElementById('zug-beenden')).focus();
  } else if (closeFocus && isOpen) box.querySelector('[data-blocker-close]').focus();
}

function closeBlocker(api, restoreFocus = false) {
  const box = document.getElementById('blocker');
  const returnTo = blockerStates.get(box)?.returnTo ?? '#zug-beenden';
  renderBlocker(api, { open: false });
  if (restoreFocus) (document.querySelector(returnTo) ?? document.getElementById('zug-beenden')).focus();
}

function blockerItem(api, b) {
  const { game } = api;
  const actions = [];
  const btn = (label, iconName, onclick, data) => el('button', { class: 'btn btn-klein', type: 'button', onclick, ...(data ? { [`data-${data}`]: '' } : {}) }, icon(iconName, { size: 15 }), label);
  if (b.kind === 'befehl') {
    if (b.tile) actions.push(btn(t('board.blocker.show'), 'ziel', () => { closeBlocker(api); api.jumpToTile(b.tile); }));
    actions.push(btn(t('board.blocker.withdraw'), 'schliessen', () => api.removeOrder(b.orderId), 'zuruecknehmen'));
  } else if (b.kind === 'slots') {
    actions.push(btn(t('board.blocker.show'), 'ziel', () => { closeBlocker(api); const o = api.model.orders.find((x) => x.art === b.slot); if (o) focusOrder(o.id); }));
  } else if (b.kind === 'arbeit') {
    actions.push(btn(t('board.blocker.show'), 'ziel', () => { closeBlocker(api); api.meldungAktion({ id: 'arbeit' }); document.getElementById('kontext-titel')?.focus(); }));
  } else if (b.kind === 'wurf-verwaist') {
    actions.push(btn(t('board.blocker.discard'), 'schliessen', () => game.dropRoll(b.probeId), 'verwerfen'));
  } else if (b.kind === 'wurf') {
    actions.push(btn(t(b.veraltet ? 'board.blocker.reroll' : 'ui.wuerfeln'), 'wuerfel', () => api.openDialog('probe', { probeId: b.probeId }), 'wuerfeln'));
  }
  const orphan = b.kind === 'wurf-verwaist';
  const roll = orphan ? game.draft.rolls?.[b.probeId] : null;
  const title = orphan ? t('issue.roll-orphan') : b.titel;
  const target = orphan ? roll ? `${t('board.probe.roll')} ${roll.value}` : '' : b.ziel;
  const why = orphan ? '' : b.kind === 'wurf' ? t(b.veraltet ? 'issue.roll-stale' : 'issue.roll-missing') : b.texte.join(', ');
  return el('li', { class: `blocker-eintrag be-${b.kind}`, 'data-blocker-id': b.id },
    el('span', { class: 'be-titel' }, el('strong', { text: title }), target ? ` ${target}` : ''),
    why ? el('span', { class: 'be-grund', text: why }) : null,
    el('span', { class: 'be-aktionen' }, ...actions));
}

// Top bar (people, season, stores, destiny, overlay shortcuts) and turn bar
// (orders of this turn, messages, end turn).

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { withTip } from './tip.js';

const TREND = { 1: ['trendAuf', 'up', 'steigend'], 0: ['trendGleich', '', 'gleichbleibend'], [-1]: ['trendAb', 'down', 'fallend'] };
const BUDGET = { haupt: 1, neben: 2 };

export function renderTopbar(api) {
  const { model } = api;
  document.getElementById('volk-name').textContent = model.volk.name;
  document.getElementById('zeit').textContent = `${model.zeit.saison}, Jahr ${model.zeit.jahr}`;
  renderResources(api);
  renderDestinyChip(api);
  // A real campaign names its views from the world's labels (view.<id>).
  const name = (id, fallback) => api.game?.t(`view.${id}`, fallback) ?? fallback;
  const labels = { entwicklungen: [name('entwicklungen', 'Entwicklungen'), 'E'], rat: [name('rat', 'Rat'), 'R'], chronik: [name('chronik', 'Chronik'), 'C'] };
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

export function renderResources(api, { bump = [], fresh = [] } = {}) {
  const { model } = api;
  const ul = document.getElementById('ressourcen');
  const preview = model.preview?.deltas ?? {};
  const all = [...model.ressourcen, ...model.module];
  ul.replaceChildren(
    ...all.map((r, i) => {
      const [tIcon, tCls, tWord] = TREND[r.trend] ?? TREND[0];
      const res = reservedFor(model, r.key);
      const reserved = res.reduce((a, x) => a + x.menge, 0);
      const free = r.wert - reserved;
      const d = preview[r.key];
      const btn = el('button', {
        class: `res${fresh.includes(r.key) ? ' is-new' : ''}${model.module.includes(r) ? ' res-sonder' : ''}`,
        type: 'button',
        'aria-label': `${r.name} ${free}${reserved ? `, ${reserved} verplant` : ''}, ${tWord}`,
      },
      icon(r.key, { size: 18 }),
      el('span', { class: `res-wert${bump.includes(r.key) ? ' bump' : ''}`, text: String(free) }),
      icon(tIcon, { size: 14, cls: `trend ${tCls}` }),
      d ? el('span', { class: `delta ${d > 0 ? 'up' : 'down'}`, 'aria-label': `Vorschau ${signed(d)}`, text: signed(d) }) : null);
      const detail = [
        el('span', { class: 'tip-zeile' }, el('span', { text: 'Vorrat' }), el('span', { text: String(r.wert) })),
        ...res.map((x) => el('span', { class: 'tip-zeile' }, el('span', { text: x.titel }), el('span', { class: 'down', text: signed(-x.menge) }))),
        ...(r.verlauf ?? []).map((v) => el('span', { class: 'tip-zeile' }, el('span', { text: v.grund }), el('span', { class: v.delta > 0 ? 'up' : 'down', text: signed(v.delta) }))),
        ...(r.prognose ?? []).map((v) => el('span', { class: 'tip-zeile' }, el('span', { text: v.grund }), el('span', { class: v.delta > 0 ? 'up' : 'down', text: signed(v.delta) }))),
        el('span', { text: `${tWord[0].toUpperCase()}${tWord.slice(1)}, ${r.grund}` }),
      ];
      const firstSpecial = model.module.length && r === model.module[0];
      return el('li', { class: firstSpecial ? 'res-trenner' : '' }, withTip(btn, [el('strong', { text: r.name }), ` ${free}`], detail, { right: i > all.length - 3 }));
    }),
  );
}

export function renderDestinyChip(api, { freshIndex = -1 } = {}) {
  const b = api.model.bestimmung;
  const btn = document.getElementById('bestimmung-kurz');
  const done = b.meilensteine.filter((m) => m.erreicht).length;
  btn.replaceChildren(
    icon('bestimmung', { size: 18 }),
    el('span', { class: 'world', text: b.name }),
    el('span', { class: 'pips', 'aria-hidden': 'true' },
      ...b.meilensteine.map((m, i) => el('span', { class: `pip${m.erreicht ? ' on' : ''}${i === freshIndex ? ' fresh' : ''}` }))),
    el('span', { class: 'tip tip-rechts', role: 'tooltip', id: 'tip-bestimmung' },
      el('strong', { text: b.name }),
      ...b.meilensteine.map((m) => el('span', { style: { display: 'block' }, text: `${m.erreicht ? 'Erreicht' : m.stand}, ${m.text}` })),
    ),
  );
  btn.setAttribute('aria-label', `Bestimmung ${b.name}, ${done} von ${b.meilensteine.length} Meilensteinen erreicht`);
  btn.setAttribute('aria-describedby', 'tip-bestimmung');
  btn.onclick = () => api.openDialog('bestimmung');
}

export function budgetState(model) {
  // A real campaign takes used and available slots from the kernel preview.
  if (model.slots) return { used: { haupt: model.slots.main.used, neben: model.slots.minor.used }, max: { haupt: model.slots.main.max, neben: model.slots.minor.max } };
  const used = { haupt: 0, neben: 0 };
  for (const o of model.orders) if (o.art in used) used[o.art]++;
  return { used, max: BUDGET };
}

export const SLOT_ICON = { haupt: 'haupt', neben: 'neben', frei: 'enthaltung', forschung: 'wissen' };
export const SLOT_NAME = { haupt: 'Hauptaktion', neben: 'Nebenaktion', frei: 'Freie Handlung', forschung: 'Forschung' };
const GROUP_NAME = { haupt: ['Haupt', 'Hauptaktionen'], neben: ['Neben', 'Nebenaktionen'] };

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
  const boxes = Array.from({ length: n }, (_, i) => {
    const o = orders[i];
    const cls = ['slot', art, i < used ? 'on' : '', i >= max ? 'over' : '', i === target ? 'is-ziel' : '',
      hint?.art === art && used >= max ? 'is-voll' : '', o && hint?.ersetzt === o.id ? 'is-ersetzt' : ''].filter(Boolean).join(' ');
    if (!o) return el('span', { class: cls, 'aria-hidden': 'true' }, icon(SLOT_ICON[art], { size: 20 }));
    return withTip(el('button', { class: cls, type: 'button', 'aria-label': `${o.titel} ${o.ziel ?? ''}`.trim(), onclick: () => focusOrder(o.id) }, icon(SLOT_ICON[art], { size: 20 })),
      [el('strong', { text: o.titel }), o.ziel ? ` ${o.ziel}` : ''], null, { up: true });
  });
  const [short, long] = GROUP_NAME[art];
  return el('div', { class: `slot-gruppe${used > max ? ' is-ueber' : ''}`, role: 'group', 'aria-label': `${long} ${used} von ${max} vergeben`, 'data-slots': art },
    el('span', { class: 'slot-name', 'aria-hidden': 'true', text: short }),
    el('span', { class: 'slot-boxen' }, ...boxes));
}

/** Research of the season: its own budget beside the action slots, never one of them. */
function researchBudget(api) {
  const { game, model } = api;
  if (!game) return null;
  const chosen = game.draft.orders.find((o) => o.type === 'research.assign');
  const running = game.view.peoples[game.pid].developments.research[0];
  const ref = chosen?.params.development ?? running?.ref ?? null;
  const name = ref ? game.env.entwicklung(ref)?.name ?? ref : 'offen';
  const hint = model.slotHint?.art === 'forschung';
  return withTip(el('button', {
    class: `forschung-budget${chosen ? ' on' : ''}${hint ? ' is-ziel' : ''}`,
    type: 'button',
    'data-forschung': '',
    'aria-label': `Forschung ${name}${chosen ? ', diese Saison gewählt' : ''}`,
    onclick: () => api.openDialog('entwicklungen'),
  }, icon('wissen', { size: 20 }), el('span', { class: 'fb-name', text: name })),
  [el('strong', { text: 'Forschung' }), ` ${name}`], [el('span', { text: chosen ? 'Diese Saison gewählt, eine Wahl je Saison' : 'Eine Wahl je Saison, ohne Aktion' })], { up: true });
}

export function renderBudget(api) {
  const { used, max } = budgetState(api.model);
  document.getElementById('budget').replaceChildren(
    slotGroup(api, 'haupt', used.haupt, max.haupt),
    slotGroup(api, 'neben', used.neben, max.neben),
    researchBudget(api) ?? '',
  );
}

/** The world event of the season as a step of its own in the turn bar, rolled like any probe. */
function eventChip(api) {
  const { game } = api;
  const p = game?.base?.probes?.find((x) => x.target == null && x.roller === 'player');
  if (!p) return null;
  const roll = game.draft.rolls?.[p.id];
  const face = roll ? game.faces(p)[roll.value - 1] : null;
  const locked = api.model.phase === 'A';
  return el('li', { class: `befehl ereignis-schritt${roll ? '' : ' is-offen'}`, 'data-order-id': 'event' },
    icon('welt', { size: 16 }),
    el('span', { class: 'befehl-titel', text: game.t('ui.weltereignis', 'Weltereignis') }),
    roll
      ? withTip(el('span', { class: 'befehl-wurf', tabindex: '0', 'aria-label': `Weltereignis ${roll.value}, ${face.label}` }, icon('wuerfel', { size: 14 }), String(roll.value)), [el('span', { text: face.label })], null, { up: true })
      : locked ? null : el('button', { class: 'btn btn-klein', type: 'button', 'data-ereignis-wurf': '', onclick: () => api.openDialog('probe', { real: true, probeId: p.id }) }, icon('wuerfel', { size: 16 }), 'Würfeln'));
}

export function renderOrders(api, { freshId } = {}) {
  const { model } = api;
  renderBudget(api);
  const ol = document.getElementById('befehle');
  const event = eventChip(api);
  if (!model.orders.length) {
    ol.replaceChildren(...[event, el('li', { class: 'befehle-leer', text: model.phase === 'A' ? 'Befehle werden ausgeführt' : 'Keine Befehle' })].filter(Boolean));
    return;
  }
  const locked = model.phase === 'A';
  ol.replaceChildren(
    ...(event ? [event] : []),
    ...model.orders.map((o) => el('li', { class: `befehl${o.id === freshId ? ' is-new' : ''}${o.issues?.length ? ' is-problem' : ''}`, 'data-order-id': o.id },
      icon(SLOT_ICON[slotOf(o)] ?? 'enthaltung', { size: 16, cls: `befehl-art ${o.art}`, label: SLOT_NAME[slotOf(o)] }),
      el('span', {},
        el('span', { class: 'befehl-titel', text: o.titel }), ' ',
        el('span', { class: 'befehl-ziel', text: o.ziel })),
      o.wurf ? withTip(el('span', { class: `befehl-wurf ${o.wurf.stale ? 'veraltet' : o.wurf.gut ? 'gut' : 'schlecht'}`, tabindex: '0', 'aria-label': o.wurf.kurz }, icon('wuerfel', { size: 14 }), icon(o.wurf.stale ? 'warnung' : o.wurf.gut ? 'ja' : 'nein', { size: 14 })), [el('span', { text: o.wurf.kurz })], null, { up: true }) : null,
      o.offen && !locked ? el('button', { class: 'befehl-wurf offen', type: 'button', 'aria-label': `${o.titel} würfeln`, onclick: () => api.rollOrder?.(o.id) }, icon('wuerfel', { size: 14 })) : null,
      o.wurf?.stale && !locked ? el('button', { class: 'befehl-wurf offen', type: 'button', 'aria-label': `${o.titel} neu würfeln`, onclick: () => api.rollOrder?.(o.id) }, icon('wuerfel', { size: 14 })) : null,
      o.issues?.length ? withTip(el('span', { class: 'befehl-problem', tabindex: '0', 'data-issue': o.issues[0].code, 'aria-label': o.issues.map((i) => i.text ?? i.message).join(', ') }, icon('warnung', { size: 14 })), [el('span', { text: o.issues.map((i) => i.text ?? i.message).join(', ') })], o.issues.map((i) => el('span', { text: i.message })), { up: true }) : null,
      o.kosten?.length ? el('span', { class: 'costs' }, ...o.kosten.map((k) => el('span', { class: 'cost', 'aria-label': `${k.menge} ${k.key}` }, icon(k.key, { size: 14 }), String(k.menge)))) : null,
      locked ? null : el('button', { class: 'icon-btn', type: 'button', 'aria-label': `${o.titel} zurücknehmen`, onclick: () => api.removeOrder(o.id) }, icon('schliessen', { size: 16 })),
    )),
  );
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
        icon(ICON[m.art] ?? 'warnung', { size: 18, label: { warnung: 'Warnung', angebot: 'Angebot', meilenstein: 'Meilenstein', welt: 'Zwischenzug' }[m.art] }),
        el('span', { class: 'meldung-titel', text: m.titel }),
        el('span', { class: 'tip tip-up', role: 'tooltip', id: tipId }, el('strong', { text: m.titel }), m.text)));
    }),
  );
}

export function renderEndTurn(api) {
  const { model } = api;
  const b = document.getElementById('zug-beenden');
  const busy = model.phase === 'A';
  const next = model.real ? model.naechsteZeit : model.zugGelaufen ? nextSeason(model.zeit) : model.S.naechsteZeit;
  // In a real campaign the agents' round keeps planning open but the turn closed until the kernel opens it.
  const waiting = model.real && !busy && model.kernPhase === 'agents';
  const rolls = model.real && !busy && !waiting ? model.offeneWuerfe?.length ?? 0 : 0;
  const title = busy ? 'Regelkern rechnet' : waiting ? 'Agenten arbeiten' : 'Zug beenden';
  const sub = busy ? 'Befehle gesperrt' : waiting ? 'Zug öffnet nach der Agentenrunde' : rolls ? `${rolls} ${rolls === 1 ? 'Wurf' : 'Würfe'} offen` : `${next.saison}, Jahr ${next.jahr}`;
  b.replaceChildren(
    el('span', { class: 'zb-titel', text: title }),
    el('span', { class: 'zb-sub', text: sub }),
    icon(busy || waiting ? 'kern' : rolls ? 'wuerfel' : 'pfeil', { size: 22 }),
  );
  b.setAttribute('aria-disabled', busy || waiting ? 'true' : 'false');
  b.setAttribute('aria-label', busy ? 'Zug läuft, Befehle gesperrt' : waiting ? 'Agentenrunde läuft, der Zug öffnet danach' : rolls ? `Zug beenden, zuerst ${sub}` : `Zug beenden, weiter zu ${next.saison}, Jahr ${next.jahr}`);
  document.getElementById('zugleiste').classList.toggle('is-locked', busy);
  renderBlocker(api);
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * What keeps the turn from ending, beside "Zug beenden": "2 Probleme" opens
 * the list of problems, each with the way to it or the fix in place;
 * "2 Würfe offen" rolls the owed probes one by one.
 */
export function renderBlocker(api, { open } = {}) {
  const box = document.getElementById('blocker');
  const { game, model } = api;
  if (!game || model.phase === 'A' || model.kernPhase === 'agents') {
    box.replaceChildren();
    return;
  }
  const { probleme, wuerfe } = game.blockers();
  const wasOpen = box.querySelector('.blocker-liste') && !box.querySelector('.blocker-liste').hidden;
  const isOpen = open ?? wasOpen;
  if (!probleme.length && !wuerfe.length) {
    box.replaceChildren();
    return;
  }
  const list = el('ul', { class: 'blocker-liste plain', id: 'blocker-liste', hidden: !isOpen }, ...[...probleme, ...wuerfe].map((b) => blockerItem(api, b)));
  const toggle = probleme.length ? el('button', {
    class: 'blocker-knopf problem', type: 'button', 'aria-expanded': String(isOpen), 'aria-controls': 'blocker-liste', 'data-blocker': 'probleme',
    onclick: () => renderBlocker(api, { open: list.hidden }),
  }, icon('warnung', { size: 16 }), plural(probleme.length, 'Problem', 'Probleme')) : null;
  const rolls = wuerfe.length ? el('button', {
    class: 'blocker-knopf wurf', type: 'button', 'data-blocker': 'wuerfe',
    onclick: () => api.rollOwed(),
  }, icon('wuerfel', { size: 16 }), `${plural(wuerfe.length, 'Wurf', 'Würfe')} offen`) : null;
  box.replaceChildren(el('div', { class: 'blocker-knoepfe' }, toggle ?? '', rolls ?? ''), list);
}

function blockerItem(api, b) {
  const { game } = api;
  const actions = [];
  const btn = (label, iconName, onclick, data) => el('button', { class: 'btn btn-klein', type: 'button', onclick, ...(data ? { [`data-${data}`]: '' } : {}) }, icon(iconName, { size: 15 }), label);
  if (b.kind === 'befehl') {
    if (b.tile) actions.push(btn('Zeigen', 'ziel', () => api.jumpToTile(b.tile)));
    actions.push(btn('Zurücknehmen', 'schliessen', () => api.removeOrder(b.orderId), 'zuruecknehmen'));
  } else if (b.kind === 'slots') {
    actions.push(btn('Zeigen', 'ziel', () => { const o = api.model.orders.find((x) => x.art === b.slot); if (o) focusOrder(o.id); }));
  } else if (b.kind === 'arbeit') {
    actions.push(btn('Zeigen', 'ziel', () => api.meldungAktion({ id: 'arbeit' })));
  } else if (b.kind === 'wurf-verwaist') {
    actions.push(btn('Verwerfen', 'schliessen', () => game.dropRoll(b.probeId), 'verwerfen'));
  } else if (b.kind === 'wurf') {
    actions.push(btn(b.veraltet ? 'Neu würfeln' : 'Würfeln', 'wuerfel', () => api.openDialog('probe', { real: true, probeId: b.probeId }), 'wuerfeln'));
  }
  const why = b.kind === 'wurf' ? (b.veraltet ? game.t('issue.roll-stale', 'Wurf veraltet') : game.t('issue.roll-missing', 'Wurf fehlt')) : b.texte.join(', ');
  return el('li', { class: `blocker-eintrag be-${b.kind}`, 'data-blocker-id': b.id },
    el('span', { class: 'be-titel' }, el('strong', { text: b.titel }), b.ziel ? ` ${b.ziel}` : ''),
    why ? el('span', { class: 'be-grund', text: why }) : null,
    el('span', { class: 'be-aktionen' }, ...actions));
}

const SEASONS = ['Frühling', 'Sommer', 'Herbst', 'Winter'];
export function nextSeason(z) {
  const i = SEASONS.indexOf(z.saison);
  return i === 3 ? { saison: SEASONS[0], jahr: z.jahr + 1 } : { saison: SEASONS[i + 1], jahr: z.jahr };
}

export { signed };

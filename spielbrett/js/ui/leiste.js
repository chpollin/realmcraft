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
  const labels = { entwicklungen: ['Entwicklungen', 'E'], rat: ['Rat', 'R'], chronik: ['Chronik', 'C'] };
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
  const used = { haupt: 0, neben: 0 };
  for (const o of model.orders) if (o.art in used) used[o.art]++;
  return { used, max: BUDGET };
}

function budgetPips(used, max) {
  const n = Math.max(used, max);
  return el('span', { class: 'pips', 'aria-hidden': 'true' },
    ...Array.from({ length: n }, (_, i) => el('span', { class: `pip${i < used ? ' on' : ''}${i >= max ? ' over' : ''}` })));
}

export function renderOrders(api, { freshId } = {}) {
  const { model } = api;
  const { used, max } = budgetState(model);
  document.getElementById('budget').replaceChildren(
    el('span', { 'aria-label': `Hauptaktionen ${used.haupt} von ${max.haupt}` }, 'Haupt', budgetPips(used.haupt, max.haupt)),
    el('span', { 'aria-label': `Nebenaktionen ${used.neben} von ${max.neben}` }, 'Neben', budgetPips(used.neben, max.neben)),
  );
  const ol = document.getElementById('befehle');
  if (!model.orders.length) {
    ol.replaceChildren(el('li', { class: 'befehle-leer', text: model.phase === 'A' ? 'Befehle werden ausgeführt' : 'Keine Befehle' }));
    return;
  }
  const locked = model.phase === 'A';
  ol.replaceChildren(
    ...model.orders.map((o) => el('li', { class: `befehl${o.id === freshId ? ' is-new' : ''}` },
      el('span', { class: `befehl-art ${o.art}`, title: o.art === 'haupt' ? 'Hauptaktion' : o.art === 'neben' ? 'Nebenaktion' : 'frei' }),
      el('span', {},
        el('span', { class: 'befehl-titel', text: o.titel }), ' ',
        el('span', { class: 'befehl-ziel', text: o.ziel })),
      o.wurf ? withTip(el('span', { class: `befehl-wurf ${o.wurf.gut ? 'gut' : 'schlecht'}`, tabindex: '0', 'aria-label': o.wurf.kurz }, icon('wuerfel', { size: 14 }), icon(o.wurf.gut ? 'ja' : 'nein', { size: 14 })), [el('span', { text: o.wurf.kurz })], null, { up: true }) : null,
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
  const next = model.zugGelaufen ? nextSeason(model.zeit) : model.S.naechsteZeit;
  b.replaceChildren(
    el('span', { class: 'zb-titel', text: busy ? 'Regelkern rechnet' : 'Zug beenden' }),
    el('span', { class: 'zb-sub', text: busy ? 'Befehle gesperrt' : `${next.saison}, Jahr ${next.jahr}` }),
    icon(busy ? 'kern' : 'pfeil', { size: 22 }),
  );
  b.setAttribute('aria-disabled', busy ? 'true' : 'false');
  b.setAttribute('aria-label', busy ? 'Zug läuft, Befehle gesperrt' : `Zug beenden, weiter zu ${next.saison}, Jahr ${next.jahr}`);
  document.getElementById('zugleiste').classList.toggle('is-locked', busy);
}

const SEASONS = ['Frühling', 'Sommer', 'Herbst', 'Winter'];
export function nextSeason(z) {
  const i = SEASONS.indexOf(z.saison);
  return i === 3 ? { saison: SEASONS[0], jahr: z.jahr + 1 } : { saison: SEASONS[i + 1], jahr: z.jahr };
}

export { signed };

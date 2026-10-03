// Trade on the board: the route to a partner as the kernel's trade view gives
// it, an offer put together from resources and seasons and previewed by the
// kernel before it enters the draft, open offers to accept, running contracts
// to cancel, and the market. The module view lists every partner.

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { withTip } from './tip.js';
import { issueText } from '../data/adapter.js';
import { marketQuote, moduleData } from '../data/options.js';
import { seasonOf } from '../data/adapter.js';
import { t } from '../i18n/index.js';
import { header, fact, facts, section, orderOptions, optionRow, renderKontext } from './kontext.js';

const AMOUNT_MAX = 12;
const SEASONS_MAX = 8;
// Offer drafts per partner, so a re-render of the panel keeps what the player set.
const drafts = new Map();
let market = null;

const routeOf = (game, partner) => game.view.derived?.[game.pid]?.trade?.routes?.find((r) => r.partner === partner) ?? null;
const tradeOrders = (game) => new Set(game.view.derived?.[game.pid]?.trade?.orders ?? []);
const resName = (api, k) => api.resourceName(k);

/** Route facts: length and roads of a reachable route, the kernel's reason for a closed one. */
function routeFacts(api, row) {
  if (!row) return null;
  if (!row.reachable) {
    const why = issueText({ code: row.reason, params: { partner: row.partner } }, t);
    return facts(fact('nein', why, t('board.trade.route'), null, { cls: 'is-gefahr' }));
  }
  return facts(
    fact('handel', t.plural('board.trade.steps', row.length), t('board.trade.route'), [el('span', { text: t('board.trade.route-tip') })]),
    row.roads ? fact('pfeil', String(row.roads), t('board.trade.roads'), [el('span', { text: t('board.trade.roads-tip') })]) : null,
  );
}

/** A number stepper with its own label; the value lives in `state[field]`. */
function stepper(id, label, value, min, max, onchange) {
  const set = (n) => onchange(Math.min(max, Math.max(min, n)));
  return el('div', { class: 'stepper', role: 'group', 'aria-label': label },
    el('button', { class: 'icon-btn', type: 'button', 'data-fk': `${id}-minus`, 'aria-label': t.fmt('board.trade.less', { name: label }), 'aria-disabled': value <= min ? 'true' : 'false', onclick: () => { if (value > min) set(value - 1); } }, icon('minus', { size: 15 })),
    el('output', { class: 'num', id, 'aria-live': 'polite', text: String(value) }),
    el('button', { class: 'icon-btn', type: 'button', 'data-fk': `${id}-plus`, 'aria-label': t.fmt('board.trade.more', { name: label }), 'aria-disabled': value >= max ? 'true' : 'false', onclick: () => { if (value < max) set(value + 1); } }, icon('plus', { size: 15 })));
}

function resSelect(api, id, label, value, keys, onchange) {
  const sel = el('select', { class: 'res-wahl', id, 'aria-label': label, onchange: (e) => onchange(e.target.value) },
    ...keys.map((k) => el('option', { value: k, selected: k === value, text: resName(api, k) })));
  return el('span', { class: 'res-feld' }, icon(value, { size: 17 }), sel);
}

// Which line of the offer this is, as a symbol; the words sit in the tooltip and for screen readers.
function sideMark(iconName, label) {
  return withTip(el('span', { class: 'angebot-seite', tabindex: '0', 'aria-label': label }, icon(iconName, { size: 17 })), [el('span', { text: label })], null, { up: true });
}

/** One side of the offer: what goes, how much, every season of the contract. */
function bagRow(api, partner, side, d, keys, rerender) {
  const label = t(side === 'give' ? 'board.trade.give' : 'board.trade.get');
  return el('div', { class: `angebot-zeile ${side}`, 'data-seite': side },
    sideMark(side === 'give' ? 'trendAb' : 'trendAuf', label),
    resSelect(api, `tr-${partner}-${side}-res`, t.fmt('board.trade.resource', { side: label }), d[side].res, keys, (v) => { d[side].res = v; rerender(); }),
    stepper(`tr-${partner}-${side}-n`, t.fmt('board.trade.amount', { side: label }), d[side].n, 1, AMOUNT_MAX, (n) => { d[side].n = n; rerender(); }));
}

function offerDraft(api, partner) {
  const { game } = api;
  if (drafts.has(partner)) return drafts.get(partner);
  const res = game.env.regeln.resources.map((r) => r.id);
  const stock = game.view.peoples[game.pid].resources;
  const currency = moduleBinding(game);
  const give = stock[currency] > 0 ? currency : res.find((k) => stock[k] > 0) ?? res[0];
  const get = res.find((k) => k !== give) ?? res[0];
  const d = { give: { res: give, n: 1 }, get: { res: get, n: 1 }, seasons: 2 };
  drafts.set(partner, d);
  return d;
}

// The trade currency the module binds (salz in Hochland), or null.
function moduleBinding(game) {
  return game.env.regeln.moduleBindings?.handel?.currency ?? 'salz';
}

/** The trade block of a foreign people's panel. */
export function tradeSection(api, partner) {
  const { game } = api;
  if (!game) return null;
  const row = routeOf(game, partner);
  const orders = tradeOrders(game);
  const handel = moduleData(game.view, game.env).handel ?? null;
  if (!row && !handel) return null;
  const body = [routeFacts(api, row)];
  if (orders.has('trade.offer') && row?.reachable) body.push(offerForm(api, partner));
  const offers = (handel?.offers ?? []).filter((o) => o.from === partner && o.to === game.pid);
  if (offers.length && orders.has('trade.accept')) body.push(acceptList(api, offers));
  const contracts = (handel?.contracts ?? []).filter((c) => c.a === partner || c.b === partner);
  if (contracts.length) body.push(contractList(api, contracts));
  return section(`handel-${partner}-h`, 'handel', t('view.handel'), ...body);
}

function offerForm(api, partner) {
  const { game } = api;
  const d = offerDraft(api, partner);
  const rerender = () => renderKontext(api);
  const all = game.env.regeln.resources.map((r) => r.id);
  const held = all.filter((k) => (game.view.peoples[game.pid].resources[k] ?? 0) > 0);
  const params = { partner, give: { [d.give.res]: d.give.n }, get: { [d.get.res]: d.get.n }, seasons: d.seasons };
  const opt = game.previewOption({ type: 'trade.offer', params });
  const per = t('board.trade.per-season');
  opt.extraRows = [
    chip(d.give.res, signed(-d.give.n), `${resName(api, d.give.res)}, ${per}`),
    chip(d.get.res, signed(d.get.n), `${resName(api, d.get.res)}, ${per}`),
    chip('dauer', String(d.seasons), t('board.trade.seasons')),
  ];
  return el('div', { class: 'angebot', 'data-angebot': partner },
    bagRow(api, partner, 'give', d, held.length ? held : all, rerender),
    bagRow(api, partner, 'get', d, all.filter((k) => k !== d.give.res), rerender),
    el('div', { class: 'angebot-zeile' },
      sideMark('dauer', t('board.trade.seasons')),
      stepper(`tr-${partner}-seasons`, t('board.trade.seasons'), d.seasons, 1, SEASONS_MAX, (n) => { d.seasons = n; rerender(); })),
    orderOptions(api, null, { kind: 'people', id: partner }, { given: [optionRow(opt)], titel: t('board.trade.offer'), hid: `angebot-${partner}-h` }));
}

function chip(iconName, wert, text) {
  return withTip(el('span', { class: 'folge-chip', tabindex: '0', 'aria-label': `${text} ${wert}` }, icon(iconName, { size: 14 }), wert), [el('span', { text })], null, { up: true });
}

const bagChips = (api, bag, sign) => Object.entries(bag).map(([k, n]) => chip(k, signed(sign * n), resName(api, k)));

function acceptList(api, offers) {
  const { game } = api;
  const rows = offers.map((o) => {
    const opt = game.previewOption({ type: 'trade.accept', params: { offer: o.id } });
    opt.extraRows = [...bagChips(api, o.give, 1), ...bagChips(api, o.get, -1), chip('dauer', String(o.seasons), t('board.trade.seasons'))];
    return optionRow(opt);
  });
  return orderOptions(api, null, { kind: 'people', id: offers[0].from }, { given: rows, titel: t('board.trade.offers-in'), hid: `offen-${offers[0].from}-h` });
}

function contractList(api, contracts) {
  const { game } = api;
  const pid = game.pid;
  const rows = contracts.map((c) => {
    const gives = c.a === pid ? c.aGives : c.bGives;
    const gets = c.a === pid ? c.bGives : c.aGives;
    const opt = game.previewOption({ type: 'trade.cancel', params: { contract: c.id } });
    const until = seasonOf(game.env, t, c.until);
    opt.extraRows = [...bagChips(api, gives, -1), ...bagChips(api, gets, 1), chip('dauer', `${until.saison} ${until.jahr}`, t('board.trade.until'))];
    return optionRow(opt);
  });
  return orderOptions(api, null, { kind: 'people', id: contracts[0].a === pid ? contracts[0].b : contracts[0].a }, { given: rows, titel: t('board.trade.contracts'), hid: `vertrag-${contracts[0].id}-h` });
}

/** Market: price per resource and one buy or sell order, quoted by the order's own kernel plan. */
function marketBlock(api, handel) {
  const { game } = api;
  if (!(game.base.catalogue ?? []).some((c) => c.type === 'trade.market' && c.available)) return null;
  const currency = moduleBinding(game);
  const keys = game.env.regeln.resources.map((r) => r.id).filter((k) => k !== currency);
  market ??= { mode: 'buy', res: keys[0], amount: 1 };
  const rerender = () => renderKontext(api);
  const params = { mode: market.mode, res: market.res, amount: market.amount };
  const quote = marketQuote(game.view, game.env, params);
  const opt = game.previewOption({ type: 'trade.market', params });
  if (quote) opt.extraRows = [chip(quote.gain.res, signed(quote.gain.amount), resName(api, quote.gain.res)), chip('preis', String(quote.price), t('board.trade.price'))];
  const modeBtn = (mode) => el('button', { class: 'ebene', type: 'button', role: 'radio', 'data-fk': `markt-${mode}`, 'aria-checked': String(market.mode === mode), onclick: () => { market.mode = mode; rerender(); } },
    icon(mode === 'buy' ? 'trendAuf' : 'trendAb', { size: 15 }), t(`board.trade.${mode}`));
  return section('markt-h', 'preis', t('board.trade.market'),
    facts(...Object.entries(handel?.prices ?? {}).map(([k, p]) => fact(k, String(p), t.fmt('board.trade.price-of', { res: resName(api, k) }), null))),
    el('div', { class: 'angebot' },
      el('div', { class: 'markt-modus', role: 'radiogroup', 'aria-label': t('board.trade.market') }, modeBtn('buy'), modeBtn('sell')),
      el('div', { class: 'angebot-zeile' },
        resSelect(api, 'markt-res', t('board.trade.market-res'), market.res, keys, (v) => { market.res = v; rerender(); }),
        stepper('markt-n', t('board.trade.market-amount'), market.amount, 1, AMOUNT_MAX, (n) => { market.amount = n; rerender(); })),
      orderOptions(api, null, { kind: 'modul', id: 'handel' }, { given: [optionRow(opt)], titel: t('order.trade.market', 'trade.market'), hid: 'markt-order-h' })));
}

export function renderHandel(api, close) {
  const { model, game } = api;
  const handel = moduleData(game.view, game.env).handel ?? { offers: [], contracts: [], prices: {} };
  const kopf = header(t('view.handel'), model.volk.name, icon('handel', { size: 22 }), 'spieler', close);
  const routes = game.view.derived?.[game.pid]?.trade?.routes ?? [];
  const body = [];
  body.push(section('partner-h', 'rivalen', t('board.trade.partners'),
    routes.length ? el('ul', { class: 'liste-objekte plain' }, ...routes.map((r) => {
      const name = game.view.peoples[r.partner]?.name ?? r.partner;
      return el('li', {}, el('button', {
        class: 'objekt-btn', type: 'button', 'data-partner': r.partner,
        'aria-label': [name, r.reachable ? t.plural('board.trade.steps', r.length) : issueText({ code: r.reason, params: { partner: r.partner } }, t)].join(', '),
        onclick: () => api.select({ kind: 'people', id: r.partner }),
      }, icon(r.reachable ? 'handel' : 'nein', { size: 18 }), name,
      el('span', { class: 'meta', text: r.reachable ? t.plural('board.trade.steps', r.length) : issueText({ code: r.reason, params: { partner: r.partner } }, t) })));
    })) : el('p', { class: 'leer-zeile' }, icon('rivalen', { size: 16 }), t('board.trade.no-partner'))));
  const pending = handel.offers.filter((o) => o.from === game.pid);
  if (pending.length) {
    body.push(section('eigene-h', 'angebot', t('board.trade.offers-out'),
      el('ul', { class: 'liste-objekte plain' }, ...pending.map((o) => el('li', { class: 'angebot-eintrag' },
        icon('angebot', { size: 16 }), el('span', { text: game.view.peoples[o.to]?.name ?? o.to }),
        el('span', { class: 'meta' }, ...bagChips(api, o.give, -1), ...bagChips(api, o.get, 1)))))));
  }
  if (handel.contracts.length) body.push(contractList(api, handel.contracts));
  body.push(marketBlock(api, handel));
  return { kopf, body };
}

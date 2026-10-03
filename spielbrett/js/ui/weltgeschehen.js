// Zwischenzug: plays the scripted agent timeline after "Zug beenden" and shows
// it in the Weltgeschehen panel, on the map (highlights by origin) and in the
// chronicle band. Prototype: the fixture timeline stands in for the real
// background agents; the kernel will push the same event shapes.

import { el, signed, prefersReducedMotion } from '../dom.js';
import { icon } from '../icons.js';
import { ZWISCHENZUG } from '../mock/zwischenzug.js';
import { absPos, tileAt, reveal, key, spiral } from '../model.js';
import { fade } from '/engine/world/index.js';
import { closeButton } from './kontext.js';
import { withTip } from './tip.js';
import { nextSeason } from './leiste.js';
import { formatDuration } from '../data/game.js';
import { t } from '../i18n/index.js';

const STATE_CLASS = { fertig: 'done', arbeitet: 'working', gescheitert: 'failed' };

export function renderWeltgeschehen(api) {
  const { model } = api;
  const panel = document.getElementById('weltgeschehen');
  if (model.panel !== 'welt' || !model.zz) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  document.getElementById('brett').classList.add('has-panel');
  const zz = model.zz;
  const phaseA = zz.phase === 'A';
  // Agent events re-render the whole panel, so scroll position and keyboard focus are carried over.
  const scroll = panel.querySelector('.panel-body')?.scrollTop ?? 0;
  const focusKey = panel.contains(document.activeElement) ? document.activeElement.dataset.fk : null;
  const rows = agentRows(zz);
  const kern = rows.find((a) => a.role === 'kernel');
  const others = rows.filter((a) => a !== kern);
  panel.replaceChildren(
    el('div', { class: 'panel-kopf' },
      el('div', { class: 'panel-siegel' }, icon('welt', { size: 22 })),
      el('h2', { id: 'wg-titel', text: t('view.weltgeschehen') }),
      el('p', { class: 'unter', text: t.fmt('board.world.span', { from: `${zz.von.saison} ${zz.von.jahr}`, to: `${zz.nach.saison} ${zz.nach.jahr}` }) }),
      closeButton(() => api.setPanel(null), t('board.world.close'))),
    el('p', { class: `phase ${phaseA ? 'a' : 'b'}`, role: 'status' },
      icon(phaseA ? 'schloss' : 'ja', { size: 16 }), zz.phaseTitel),
    pipeline(rows),
    el('div', { class: 'panel-body' },
      kern ? kernGroup(api, zz, kern) : null,
      others.length ? el('section', { 'aria-labelledby': 'wg-agenten' },
        el('h3', { id: 'wg-agenten', text: t('board.world.agents') }),
        el('ol', { class: 'agenten plain' }, ...others.map((a) => agentItem(api, a)))) : null));
  const body = panel.querySelector('.panel-body');
  body.scrollTop = scroll;
  if (focusKey) body.parentElement.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
}

/**
 * The turn at a glance: one seal per step in the order the turn runs them,
 * kernel first and judges last, each showing waiting, running, done or failed.
 * A seal jumps to its row below.
 */
function pipeline(rows) {
  if (rows.length < 2) return null;
  return el('ol', { class: 'wg-ablauf plain', 'aria-label': t('board.world.pipeline') }, ...rows.map((a) => {
    const key = a.step ?? a.id;
    const state = STATE_CLASS[a.status] ?? 'waiting';
    return el('li', { class: `ablauf-schritt is-${state} is-${a.role}`, style: { '--origin': `var(--origin-${a.origin ?? a.id})` } },
      withTip(el('button', {
        class: 'ablauf-siegel',
        type: 'button',
        'data-fk': `ablauf:${key}`,
        'aria-label': `${a.role === 'kernel' ? t('board.world.kernel-results') : a.name}, ${t(`board.agent.${a.status}`, a.status)}`,
        onclick: () => {
          const row = document.querySelector(`#weltgeschehen [data-agent="${CSS.escape(key)}"]`);
          row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          (row?.querySelector('summary, button') ?? row)?.focus({ preventScroll: true });
        },
      }, icon(a.role === 'judge' ? 'schild' : a.id, { size: 16 }),
      a.status === 'fertig' || a.status === 'gescheitert' ? el('span', { class: 'ablauf-mark', 'aria-hidden': 'true' }, icon(a.status === 'fertig' ? 'ja' : 'nein', { size: 10 })) : null),
      [el('strong', { text: a.role === 'kernel' ? t('board.world.kernel-results') : a.name }), ` ${t(`board.agent.${a.status}`, a.status)}`], null, { up: false }));
  }));
}

/**
 * Findings a judge recorded under its step in status.json (id, judge,
 * severity, text, refs), shaped as result rows. They replace the finding rows
 * the board otherwise rebuilds from the event log.
 */
function findingRows(api, a) {
  const step = (api.game?.status?.steps ?? []).find((x) => x.id === a.step);
  const list = step?.findings ?? [];
  return list.map((f) => ({
    cls: 'info',
    icon: f.severity === 'info' ? 'ja' : 'warnung',
    titel: f.text,
    proposalId: f.id,
    severity: f.severity,
    severityText: t(`severity.${f.severity}`, f.severity),
    info: null,
  }));
}

/** Agent rows: a real campaign brings them from status.json and the round report, the prototype from its timeline. */
function agentRows(zz) {
  if (zz.agenten) return zz.agenten;
  const roleOf = (id) => ({ kern: 'kernel', rivalen: 'rival', richter: 'judge' }[id] ?? 'agent');
  const rows = ZWISCHENZUG.agenten.map((a) => ({ ...a, ...zz.agents[a.id], role: roleOf(a.id) }));
  return [...rows.filter((r) => r.role !== 'judge'), ...rows.filter((r) => r.role === 'judge')];
}

const countOf = (a, cls) => a[cls === 'angenommen' ? 'angenommen' : 'abgelehnt'] ?? a.results.filter((r) => r.cls === cls).length;

function counters(a) {
  const ok = countOf(a, 'angenommen');
  const no = countOf(a, 'abgelehnt');
  if (!ok && !no) return null;
  return el('span', { class: 'zaehler' },
    ok ? el('span', { class: 'z-ok', 'aria-label': t.fmt('board.world.accepted-n', { n: ok }) }, icon('ja', { size: 14 }), String(ok)) : null,
    no ? el('span', { class: 'z-nein', 'aria-label': t.fmt('board.world.rejected-n', { n: no }) }, icon('nein', { size: 14 }), String(no)) : null);
}

/** State as a label: waiting is grey text, running pulses on the seal, done carries the duration, failed names the retry. */
function statusMark(a) {
  if (a.status === 'wartet') return el('span', { class: 'agent-status wartet', text: t('board.agent.wartet') });
  if (a.status === 'arbeitet') return el('span', { class: 'agent-status laeuft', text: t('board.agent.arbeitet') });
  if (a.status === 'fertig') {
    const dauer = formatDuration(a.dauer);
    return el('span', { class: 'agent-status fertig', 'aria-label': [t('board.agent.fertig'), dauer].filter(Boolean).join(', ') }, icon('ja', { size: 16 }), dauer ? el('span', { class: 'dauer', text: dauer }) : null);
  }
  return el('span', { class: 'agent-status gescheitert' }, icon('nein', { size: 16 }), t('board.agent.gescheitert'));
}

const sigil = (a) => el('span', { class: 'agent-siegel' }, icon(a.role === 'judge' ? 'schild' : a.id, { size: 18 }));

/** Kernel results in a native disclosure; the open state survives the panel's re-rendering. */
function kernGroup(api, zz, a) {
  const details = el('details', {
    class: `agent wg-kern is-${STATE_CLASS[a.status] ?? 'waiting'}`,
    open: zz.kernOffen !== false,
    style: { '--origin': 'var(--origin-kern)' },
    'data-agent': a.step ?? a.id,
  },
  el('summary', { 'data-fk': 'kern' },
    sigil(a),
    el('span', { class: 'agent-name', text: t('board.world.kernel-results') }),
    counters(a),
    statusMark(a),
    icon('trendAb', { size: 16, cls: 'wg-chevron' })),
  a.status === 'arbeitet' || a.status === 'gescheitert' ? el('span', { class: 'agent-taetigkeit', text: a.taetigkeit }) : null,
  a.status === 'gescheitert' ? retryHint() : null,
  a.results.length ? el('ul', { class: 'ergebnisse plain' }, ...a.results.map((r) => resultRow(api, r, a))) : null);
  details.addEventListener('toggle', () => { zz.kernOffen = details.open; });
  return details;
}

// The turn command is the one the game master runs again after a failed step.
const retryHint = () => el('span', { class: 'agent-hinweis' }, icon('pfeil', { size: 14 }), t('board.world.retry'));

function agentItem(api, a) {
  const failed = a.status === 'gescheitert';
  const recorded = a.role === 'judge' ? findingRows(api, a) : [];
  // Severe findings first, so the reader meets what most needs attention.
  const order = { severe: 0, warn: 1, info: 2 };
  const results = recorded.length
    ? [...a.results.filter((r) => r.kind !== 'finding'), ...recorded.sort((x, y) => (order[x.severity] ?? 3) - (order[y.severity] ?? 3))]
    : a.results;
  return el('li', {
    class: `agent is-${STATE_CLASS[a.status] ?? 'waiting'} is-${a.role}`,
    style: { '--origin': `var(--origin-${a.origin ?? a.id})` },
    'data-agent': a.step ?? a.id,
  },
  sigil(a),
  el('span', { class: 'agent-kopf' }, el('span', { class: 'agent-name', text: a.name }), a.role === 'agent' ? counters(a) : null, statusMark(a)),
  // A rival's content stays hidden (fog of war), only that it acts is shown.
  a.role === 'rival' && (a.status === 'arbeitet' || a.status === 'fertig') ? el('span', { class: 'agent-plant', text: t('board.world.plans') }) : null,
  a.role !== 'rival' && (a.status === 'arbeitet' || failed) && a.taetigkeit ? el('span', { class: 'agent-taetigkeit', text: a.taetigkeit }) : null,
  failed ? retryHint() : null,
  a.role !== 'rival' && results.length ? el('ul', { class: 'ergebnisse plain' }, ...results.map((r) => resultRow(api, r, a))) : null);
}

/** One result: icon, title and a compact badge; a rejection's reason stays visible, a place on the map is one click away. */
function resultRow(api, r, a) {
  const severity = r.severity ? ` sev-${r.severity}` : '';
  const badge = r.delta !== undefined
    ? el('span', { class: `delta ${r.delta > 0 ? 'up' : 'down'}`, text: signed(r.delta) })
    : r.severityText ? el('span', { class: 'erg-schwere', text: r.severityText })
      : r.budget ? el('span', { class: 'erg-budget', 'aria-label': t.fmt('board.world.budget', { budget: r.budget }), text: r.budget.replace(' von ', '/') }) : null;
  const btn = el('button', {
    class: `ergebnis ${r.cls}${severity}`,
    type: 'button',
    'data-fk': `${a.step ?? a.id}:${r.proposalId ?? ''}:${r.titel}`,
    'aria-label': [
      `${r.titel}${r.delta !== undefined ? ` ${signed(r.delta)}` : ''}`,
      r.severityText,
      r.cls === 'abgelehnt' || r.cls === 'angenommen' ? t(`board.world.${r.cls}`) : null,
      r.pos ? t('board.world.show-on-map') : null,
    ].filter(Boolean).join(', '),
    onclick: () => {
      if (!r.pos) return;
      const sel = r.selKind ? { kind: r.selKind, id: r.selId, q: r.pos.q, r: r.pos.r } : { kind: 'tile', q: r.pos.q, r: r.pos.r };
      api.select(sel, { fly: true, keepPanel: true });
    },
  },
  icon(r.icon, { size: 16 }),
  el('span', { class: 'erg-titel', text: r.titel }),
  el('span', { class: 'erg-marken' }, badge, r.pos ? icon('ort', { size: 14, cls: 'erg-ort' }) : null),
  r.cls === 'abgelehnt' ? el('span', { class: 'erg-grund', text: r.grund }) : null);
  return el('li', {}, r.info ? withTip(btn, [el('span', { text: r.info })], null, { left: true }) : btn);
}

/** Runs the timeline. Resolves when every agent has finished. */
export function runZwischenzug(api) {
  const { model } = api;
  const reduced = prefersReducedMotion();
  model.zz = {
    phase: 'A',
    phaseTitel: '',
    von: { ...model.zeit },
    nach: nextSeason(model.zeit),
    agents: Object.fromEntries(ZWISCHENZUG.agenten.map((a) => [a.id, { status: 'wartet', taetigkeit: '', results: [] }])),
  };
  model.highlights = [];
  model.moves = [];
  model.preview = null;
  for (const r of [...model.ressourcen, ...model.module]) r.verlauf = [];
  // Seen tiles stay known but lose live sight until own units look again.
  model.known = fade(model.known);
  for (const u of model.units.filter((x) => x.volk === 'spieler')) model.known = reveal(model.known, u, u.art === 'lager' ? 4 : u.art === 'spaeher' ? 3 : 2, model.world);
  api.setPanel('welt');
  if (!model.meldungen.some((m) => m.id === 'weltgeschehen')) {
    model.meldungen.unshift({ id: 'weltgeschehen', art: 'welt', titel: t('view.weltgeschehen'), text: t('board.world.demo-message') });
    api.refreshMessages({ freshId: 'weltgeschehen' });
  }

  const push = (agent, row) => {
    model.zz.agents[agent].results.push(row);
    renderWeltgeschehen(api);
  };
  const highlight = (pos, origin) => model.highlights.push({ q: pos.q, r: pos.r, origin, t0: performance.now() });

  const handlers = {
    phase(e) {
      model.zz.phase = e.phase;
      model.zz.phaseTitel = e.titel;
      if (e.phase === 'A') {
        api.setPhase('A');
      } else {
        executeOrders(api);
        model.zeit = { ...model.zz.nach };
        model.zugGelaufen = true;
        model.winter = model.zeit.saison === 'Winter';
        api.seasonCard(model.zeit);
        api.setPhase('planung');
        api.view.invalidateColours();
      }
      api.announce(e.titel);
    },
    start(e) {
      Object.assign(model.zz.agents[e.agent], { status: 'arbeitet', taetigkeit: e.taetigkeit, t0: performance.now() });
    },
    ende(e) {
      const a = model.zz.agents[e.agent];
      a.status = 'fertig';
      if (a.t0 !== undefined) a.dauer = Math.max(1, Math.round((performance.now() - a.t0) / 1000));
    },
    ressource(e) {
      const r = model.ressourcen.find((x) => x.key === e.key) ?? model.module.find((x) => x.key === e.key);
      if (!r) return;
      r.wert += e.delta;
      r.trend = Math.sign(e.delta);
      r.grund = e.grund;
      r.verlauf = [...(r.verlauf ?? []), { delta: e.delta, grund: e.grund }];
      api.refreshResources({ bump: [e.key] });
      push(e.agent, { cls: 'info', icon: e.key, titel: r.name, delta: e.delta, info: e.grund });
    },
    modul(e) {
      const m = model.S.modulRessourcen.find((x) => x.key === e.key);
      if (m && !model.module.some((x) => x.key === e.key)) model.module.push({ ...m, wert: 1, neu: true });
      api.refreshResources({ fresh: [e.key] });
      push(e.agent, { cls: 'info', icon: e.key, titel: t.fmt('board.world.discovered', { name: m?.name ?? e.key }), info: m?.grund });
      api.announce(t.fmt('board.world.new-resource', { name: m?.name ?? e.key }));
    },
    meilenstein(e) {
      const ms = model.bestimmung.meilensteine;
      const i = ms.findIndex((m) => m.text === e.text);
      if (i >= 0) {
        ms[i].erreicht = true;
        const total = ms[i].stand.split(' von ')[1];
        if (total) ms[i].stand = `${total} von ${total}`;
      }
      api.refreshDestiny(i);
      const id = `meilenstein-${i}`;
      model.meldungen.unshift({ id, art: 'meilenstein', titel: t('board.world.milestone'), text: e.text, aktion: t('ereignis.ansehen'), dialog: 'bestimmung' });
      api.refreshMessages({ freshId: id });
      push(e.agent, { cls: 'angenommen', icon: 'meilenstein', titel: e.text, info: t.fmt('board.world.milestone-of', { name: model.bestimmung.name }) });
      api.announce(t.fmt('board.world.milestone-reached', { text: e.text }));
    },
    chronik(e) {
      api.streamChronicle(e);
    },
    ergebnis(e) {
      const ok = e.urteil.status === 'angenommen';
      const row = {
        cls: e.urteil.status,
        icon: ok ? 'ja' : 'nein',
        titel: e.titel,
        budget: ok ? e.urteil.budget : null,
        grund: ok ? null : e.urteil.grund,
        info: `${e.text}${ok && e.urteil.budget ? ` ${t.fmt('board.world.budget', { budget: e.urteil.budget })}.` : ''}`,
      };
      if (e.befund) Object.assign(row, { severity: e.befund, severityText: t(`severity.${e.befund}`), icon: e.befund === 'info' ? 'ja' : 'warnung', budget: null });
      const k = e.karte;
      if (k) {
        if (k.art === 'ort-neu') {
          const pos = snapFree(model, absPos(model, k.ort.pos));
          model.places.push({ ...k.ort, q: pos.q, r: pos.r, neu: true });
          model.known = reveal(model.known, pos, 1, model.world);
          highlight(pos, e.agent);
          Object.assign(row, { pos, selKind: 'place', selId: k.ort.id });
        } else if (k.art === 'frost') {
          const pos = absPos(model, k.pos);
          model.frostRegions.add(tileAt(model.world, pos.q, pos.r).regionId);
          highlight(pos, e.agent);
          row.pos = pos;
        } else if (k.art === 'bewegung') {
          const u = model.units.find((x) => x.id === k.einheit);
          const to = snapFree(model, absPos(model, k.nach), u);
          model.moves.push({ from: { q: u.q, r: u.r }, to });
          Object.assign(u, to);
          model.known[key(to.q, to.r)] = 'visible';
          highlight(to, e.agent);
          Object.assign(row, { pos: to, selKind: 'unit', selId: u.id });
        } else if (k.art === 'aufgedeckt') {
          const pos = snapFree(model, absPos(model, k.pos));
          const scout = model.units.find((x) => x.art === 'spaeher' && x.volk === 'spieler');
          if (scout) Object.assign(scout, pos);
          model.known = reveal(model.known, pos, k.radius + 1, model.world);
          highlight(pos, e.agent);
          Object.assign(row, { pos, selKind: scout ? 'unit' : 'tile', selId: scout?.id });
        }
        model.ownerVersion = (model.ownerVersion ?? 0) + 1;
        api.view.changed();
        api.refreshList();
      }
      if (e.loyalitaet) {
        for (const l of e.loyalitaet) {
          const a = model.rat.find((x) => x.id === l.id);
          if (a) a.loyalitaet = Math.max(-5, Math.min(5, a.loyalitaet + l.delta));
        }
        row.info = e.loyalitaet.map((l) => `${model.rat.find((x) => x.id === l.id)?.name.split(' ')[0]} ${signed(l.delta)}, ${l.grund}`).join(' ');
      }
      if (e.vorschlag) {
        model.entwicklungen.vorschlaege.push({ ...e.vorschlag, neu: true });
      }
      push(e.agent, row);
    },
  };

  return new Promise((resolve) => {
    const t0 = performance.now();
    for (const ev of ZWISCHENZUG.ereignisse) {
      setTimeout(() => {
        handlers[ev.typ]?.(ev);
        renderWeltgeschehen(api);
      }, ev.t);
    }
    setTimeout(() => {
      model.zz.done = true;
      renderWeltgeschehen(api);
      resolve(performance.now() - t0);
    }, ZWISCHENZUG.dauer + (reduced ? 0 : 200));
  });
}

/** The kernel would refuse an occupied or impassable target; the prototype nudges instead. */
function snapFree(model, target, self) {
  for (const h of spiral(target, 3)) {
    const tile = tileAt(model.world, h.q, h.r);
    const def = model.terrains.get(tile.terrain);
    if (!def || def.water || typeof def.moveCost !== 'number') continue;
    const busy = model.units.some((u) => u !== self && u.q === h.q && u.r === h.r) || model.places.some((p) => p.q === h.q && p.r === h.r);
    if (!busy) return h;
  }
  return target;
}

function executeOrders(api) {
  const { model } = api;
  const fresh = [];
  for (const o of model.orders) {
    for (const k of o.kosten ?? []) {
      const r = model.ressourcen.find((x) => x.key === k.key) ?? model.module.find((x) => x.key === k.key);
      if (r) r.wert -= k.menge;
    }
    // A good the people did not hold before enters the top bar now.
    if (o.gibt) {
      let r = model.module.find((x) => x.key === o.gibt.key);
      if (!r) {
        const def = model.S.modulRessourcen.find((x) => x.key === o.gibt.key);
        r = { ...def, wert: 0 };
        model.module.push(r);
        fresh.push(r.key);
      }
      r.wert += o.gibt.menge;
    }
  }
  model.orders = [];
  api.refreshOrders();
  api.refreshResources({ fresh });
}

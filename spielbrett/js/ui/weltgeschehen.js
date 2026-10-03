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

const STATUS = { wartet: 'wartet', arbeitet: 'arbeitet', fertig: 'fertig', gescheitert: 'gescheitert' };
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
  panel.replaceChildren(
    el('div', { class: 'panel-kopf' },
      el('div', { class: 'panel-siegel' }, icon('welt', { size: 22 })),
      el('h2', { id: 'wg-titel', text: api.game?.t('view.weltgeschehen', 'Weltgeschehen') ?? 'Weltgeschehen' }),
      el('p', { class: 'unter', text: `${zz.von.saison} ${zz.von.jahr} nach ${zz.nach.saison} ${zz.nach.jahr}` }),
      closeButton(() => api.setPanel(null), 'Weltgeschehen schließen')),
    el('p', { class: `phase ${phaseA ? 'a' : 'b'}`, role: 'status' },
      icon(phaseA ? 'schloss' : 'ja', { size: 16 }), zz.phaseTitel),
    el('div', { class: 'panel-body' },
      el('ol', { class: 'agenten plain' }, ...agentRows(zz).map((a) => el('li', {
        class: `agent is-${STATE_CLASS[a.status] ?? 'waiting'}`,
        style: { '--origin': `var(--origin-${a.id})` },
        'data-agent': a.step ?? a.id,
      },
      el('span', { class: 'agent-siegel' }, icon(a.id, { size: 18 })),
      el('span', { class: 'agent-name' }, a.name,
        el('span', { class: 'agent-status', 'aria-label': STATUS[a.status] ?? a.status }, a.status === 'fertig' ? icon('ja', { size: 16 }) : a.status === 'gescheitert' ? icon('nein', { size: 16 }) : null)),
      a.status === 'arbeitet' || a.status === 'gescheitert' ? el('span', { class: 'agent-taetigkeit', text: a.taetigkeit }) : null,
      a.results.length ? el('ul', { class: 'ergebnisse plain' }, ...a.results.map((r) => resultRow(api, r))) : null)))));
}

/** Agent rows: a real campaign brings them from status.json and the round report, the prototype from its timeline. */
function agentRows(zz) {
  if (zz.agenten) return zz.agenten;
  return ZWISCHENZUG.agenten.map((a) => ({ ...a, ...zz.agents[a.id] }));
}

/** One result: icon, title and a compact badge; the reasoning sits in the tooltip, a rejection's reason stays visible. */
function resultRow(api, r) {
  const badge = r.delta !== undefined
    ? el('span', { class: `delta ${r.delta > 0 ? 'up' : 'down'}`, text: signed(r.delta) })
    : r.budget ? el('span', { class: 'erg-budget', 'aria-label': `Budget ${r.budget}`, text: r.budget.replace(' von ', '/') }) : null;
  const btn = el('button', {
    class: `ergebnis ${r.cls}`,
    type: 'button',
    'aria-label': `${r.titel}${r.delta !== undefined ? ` ${signed(r.delta)}` : ''}${r.cls === 'abgelehnt' ? ', abgelehnt' : r.cls === 'angenommen' ? ', angenommen' : ''}`,
    onclick: () => { if (r.pos) api.select({ kind: r.selKind ?? 'tile', id: r.selId, q: r.pos.q, r: r.pos.r }, { fly: true, keepPanel: true }); },
  },
  icon(r.icon, { size: 16 }),
  el('span', { class: 'erg-titel', text: r.titel }),
  badge,
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
    model.meldungen.unshift({ id: 'weltgeschehen', art: 'welt', titel: 'Weltgeschehen', text: 'Was die Agenten in diesem Zwischenzug taten und was der Prüfer zuließ.' });
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
      Object.assign(model.zz.agents[e.agent], { status: 'arbeitet', taetigkeit: e.taetigkeit });
    },
    ende(e) {
      model.zz.agents[e.agent].status = 'fertig';
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
      push(e.agent, { cls: 'info', icon: e.key, titel: `${m?.name ?? e.key} entdeckt`, info: m?.grund });
      api.announce(`Neue Ressource ${m?.name ?? e.key}`);
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
      model.meldungen.unshift({ id, art: 'meilenstein', titel: 'Meilenstein erreicht', text: e.text, aktion: 'Ansehen', dialog: 'bestimmung' });
      api.refreshMessages({ freshId: id });
      push(e.agent, { cls: 'angenommen', icon: 'meilenstein', titel: e.text, info: `Meilenstein von ${model.bestimmung.name}` });
      api.announce(`Meilenstein erreicht, ${e.text}`);
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
        info: `${e.text}${ok && e.urteil.budget ? ` Budget ${e.urteil.budget}.` : ''}`,
      };
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
    const t = tileAt(model.world, h.q, h.r);
    const def = model.terrains.get(t.terrain);
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

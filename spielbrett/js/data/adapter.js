// Maps the player's projection (campaigns/<cid>/view/<people>.json) and the
// kernel preview of the current draft to the board model the views draw.
// Pure and DOM-free, so the unit tests run it in Node. Every number shown
// comes from the view or from a kernel function; the adapter only arranges.
//
// Conventions of the board model kept from the prototype: the player's people
// appears as volk "spieler" on map objects, a camp (settlement kind lager) is
// a unit of art "lager", other settlements are places of art "siedlung".

import { key, parseKey, neighbors, regionOf, regionInfo } from '../../../engine/world/index.js';
import { bandOf, calendarOf, loyaltyBand, mapLayers, researchCost, SUCCESS_BANDS } from './kernel.js';
import { bandKey, fill, makeLabels } from './labels.js';

export const OWN = 'spieler';
const ROAD_KIND = 'weg';
const SLOT_ART = { main: 'haupt', minor: 'neben', free: 'frei' };
// Board icons for Entwicklung kinds without a glyph of their own.
export const KIND_ICON = { technik: 'technik', disziplin: 'magie', einheit: 'einheit', bauwerk: 'bauwerk', institution: 'institution', lebensweise: 'lager', doktrin: 'praxis' };
// Base stores shown first in the top bar: the first three resources of the
// world package (food, material, knowledge in Hochland); the others follow as
// special goods once held, flowing or bound to an active module.
const BASE_RESOURCES = 3;

export const slotArt = (slot) => SLOT_ART[slot] ?? 'frei';
export const volkOf = (view, pid) => (pid === view.people ? OWN : pid);
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

export function seasonOf(env, t, turn) {
  const cal = calendarOf(env.regeln, turn);
  return { saison: t(`season.${cal.season}`, cal.season), jahr: cal.year, winter: cal.winter };
}

/** Phase of the board: orders are locked only while the kernel resolves (or the campaign ended). */
export function boardPhase(view) {
  return view.phase === 'resolving' || view.status === 'ended' ? 'A' : 'planung';
}

// --- resources ---------------------------------------------------------------

function forecastLines(t, fc, id) {
  if (!fc) return [];
  const out = [];
  const add = (label, n, sign) => { if (n) out.push({ grund: label, delta: sign * n }); };
  add(t('ui.ertrag'), fc.income?.[id] ?? 0, 1);
  add(t('ui.verbrauch'), fc.consumption?.[id] ?? 0, -1);
  add(t('ui.unterhalt'), fc.upkeep?.[id] ?? 0, -1);
  return out;
}

export function resourceRows(view, env, t, pv) {
  const p = view.peoples[view.people];
  const fc = pv?.forecast ?? null;
  const caps = fc?.caps ?? view.derived?.[view.people]?.caps ?? {};
  const active = new Set(view.derived?.[view.people]?.modules ?? []);
  const row = (id) => {
    const net = fc?.net?.[id] ?? 0;
    const short = fc?.shortfall?.[id] ?? 0;
    return {
      key: id,
      name: t(`resource.${id}`, id),
      wert: p.resources[id] ?? 0,
      cap: caps[id] ?? null,
      trend: Math.sign(net),
      netto: net,
      mangel: short,
      prognose: forecastLines(t, fc, id),
      grund: short ? t.fmt('board.res.short', { n: short }) : t.fmt('board.res.net', { delta: signed(net) }),
    };
  };
  const defs = env.regeln.resources;
  const base = defs.slice(0, BASE_RESOURCES).map((r) => row(r.id));
  const growth = fc?.growth?.clans ?? 0;
  base.push({
    key: 'volk', name: t('population.core'), wert: p.population.core, cap: fc?.popCap ?? null,
    trend: Math.sign(growth), netto: growth, mangel: 0, prognose: [], grund: `${t('population.growth')} ${p.population.growth}`,
  });
  const approvalKey = Object.keys(p.meters ?? {}).find((k) => k === 'zustimmung') ?? Object.keys(p.meters ?? {})[0];
  if (approvalKey) {
    base.push({ key: approvalKey, name: t(`meter.${approvalKey}`, approvalKey), wert: p.meters[approvalKey], cap: null, trend: 0, netto: 0, mangel: 0, prognose: [], grund: t('board.res.meter-no-preview') });
  }
  const special = defs.slice(BASE_RESOURCES)
    .filter((r) => (p.resources[r.id] ?? 0) > 0 || (fc?.net?.[r.id] ?? 0) !== 0 || (r.module && active.has(r.module)))
    .map((r) => row(r.id));
  return { ressourcen: base, module: special };
}

/**
 * Change of each store at season end between two kernel previews (the draft
 * with and without a candidate decision): stock minus order costs plus the
 * forecast net, compared. Arithmetic on kernel output, no estimate.
 */
export function previewDeltas(view, base, next) {
  const p = view.peoples[view.people];
  const end = (pv, id) => (p.resources[id] ?? 0) - (pv?.costs?.[id] ?? 0) + (pv?.forecast?.net?.[id] ?? 0);
  const out = {};
  for (const id of Object.keys(p.resources)) {
    const d = end(next, id) - end(base, id);
    if (d) out[id] = d;
  }
  const growth = (pv) => pv?.forecast?.growth?.clans ?? 0;
  if (growth(next) !== growth(base)) out.volk = growth(next) - growth(base);
  return out;
}

// --- map ---------------------------------------------------------------------

function devName(env, ref) {
  return env.entwicklung(ref)?.name ?? ref;
}

export function mapObjects(view, env, t) {
  const pid = view.people;
  const own = view.peoples[pid];
  const units = [];
  const places = [];
  for (const s of view.map.settlements) {
    const pos = parseKey(s.tile);
    const volk = volkOf(view, s.people);
    const kindName = t(`settlement.${s.kind}`, s.kind);
    const buildings = s.buildings.map((b) => devName(env, b.ref));
    if (s.kind === 'lager') {
      units.push({
        id: s.id, name: s.name, art: 'lager', volk, q: pos.q, r: pos.r, objekt: 'settlement',
        staerke: s.people === pid ? Math.min(5, own.population.core) : 0,
        zustand: [kindName, ...buildings].join(', '),
      });
    } else {
      places.push({ id: s.id, name: s.name, art: 'siedlung', volk, q: pos.q, r: pos.r, objekt: 'settlement', beschreibung: [kindName, ...buildings].join(', ') });
    }
  }
  for (const [ppid, p] of Object.entries(view.peoples)) {
    const rel = ppid === pid ? null : relationOf(view, pid, ppid);
    for (const u of p.units ?? []) {
      const pos = parseKey(u.tile);
      units.push({
        id: u.id, name: devName(env, u.type), art: rel?.atWar ? 'raeuber' : 'krieger', volk: volkOf(view, ppid), q: pos.q, r: pos.r,
        objekt: 'unit', staerke: u.strength ?? 0, zustand: u.state ?? '',
      });
    }
  }
  for (const [tile, f] of Object.entries(view.map.features ?? {})) {
    if (f.kind === ROAD_KIND) continue;
    const pos = parseKey(tile);
    places.push({
      id: f.id, name: f.name, art: f.kind, volk: null, q: pos.q, r: pos.r, objekt: 'feature',
      beschreibung: (f.tags ?? []).map((g) => t(`tag.${g}`, g)).join(', '),
    });
  }
  return { units, places };
}

export function homeOf(view) {
  const s = view.map.settlements.find((x) => x.people === view.people);
  if (!s) return null;
  const { q, r } = parseKey(s.tile);
  return { id: s.id, q, r, kind: s.kind };
}

/** Map layers from the kernel (mapLayers on the projection): ownership by region control, threat, roads. */
export function layers(view, env, world) {
  const L = mapLayers(view, env, view.people);
  const known = view.map.known[view.people] ?? {};
  const owners = new Map();
  for (const k of Object.keys(known)) {
    const { q, r } = parseKey(k);
    const owner = L.control[regionOf(world, q, r)];
    if (owner) owners.set(k, volkOf(view, owner));
  }
  const threat = new Map(Object.entries(L.threat?.tiles ?? {}));
  // Roads are tiles; the renderer draws polylines, so every pair of
  // neighbouring road or settlement tiles becomes one segment.
  const level = new Map(L.roads.map((x) => [x.tile, x.level]));
  const anchors = new Set(view.map.settlements.map((s) => s.tile));
  const roads = [];
  for (const [k, lv] of level) {
    const a = parseKey(k);
    for (const n of neighbors(a.q, a.r)) {
      const nk = key(n.q, n.r);
      if (!(level.has(nk) && nk > k) && !anchors.has(nk)) continue;
      roads.push({ art: Math.max(lv, level.get(nk) ?? 1) >= 2 ? 'strasse' : 'pfad', path: [a, n] });
    }
  }
  return { owners, threat, roads, roadTiles: new Set(level.keys()), threatSources: L.threat?.sources ?? [] };
}

// --- peoples, council, destiny -------------------------------------------------

export function relationOf(view, a, b) {
  return view.relations[[a, b].sort().join('|')] ?? null;
}

function stance(rel) {
  if (!rel?.contact) return 'unbekannt';
  if (rel.atWar) return 'feindlich';
  if (rel.value > 0) return 'freundlich';
  if (rel.value < 0) return 'wachsam';
  return 'neutral';
}

// What the view reveals of a rival's destiny. The fog projection of a foreign
// people carries none today, so the result is an unknown marker until the
// projection reveals { ref, milestones: [{ id, reached }] }; a milestone the
// view does not list stays unknown, and nothing is filled in by guesswork.
function rivalDestiny(p, env) {
  const def = p.bestimmung?.ref ? env.bestimmung(p.bestimmung.ref) : null;
  if (!def) return { name: null, bekannt: false, meilensteine: [] };
  return {
    name: def.name,
    bekannt: true,
    meilensteine: def.milestones.map((md) => {
      const seen = p.bestimmung.milestones?.find((x) => x.id === md.id);
      return seen ? { text: md.text, erreicht: Boolean(seen.reached), icon: predicateIcon(md.predicate) } : { text: null, erreicht: null };
    }),
  };
}

const PREDICATE_ICON = { controls: 'besitz', 'stat.atLeast': 'schild', 'population.atLeast': 'volk', relation: 'zustimmung', 'development.known': 'entwicklungen', subjugated: 'krieger', settlement: 'siedlung' };
// A holds milestone shows the symbol of the predicate it watches.
export function predicateIcon(pred) {
  const inner = pred.pred === 'holds' ? pred.predicate : pred;
  return inner.pred === 'resource.atLeast' ? inner.key : PREDICATE_ICON[inner.pred] ?? 'meilenstein';
}

export function rivals(view, env) {
  return Object.values(view.peoples).filter((p) => p.id !== view.people).map((p) => {
    const rel = relationOf(view, view.people, p.id);
    const s = view.map.settlements.find((x) => x.people === p.id);
    return {
      id: p.id,
      name: p.name,
      beschreibung: p.identity?.appearance ?? '',
      haltung: stance(rel),
      beziehung: rel?.value ?? 0,
      lebensweise: devName(env, p.lebensweise),
      anfuehrer: null,
      lager: s ? parseKey(s.tile) : null,
      bestimmung: rivalDestiny(p, env),
    };
  });
}

export function council(view, t) {
  return view.peoples[view.people].council.map((m) => {
    const band = loyaltyBand(m.loyalty);
    return {
      id: m.id,
      name: m.name,
      rolle: t(`role.${m.role}`, m.role),
      ziel: m.goal.text,
      favor: m.goal.favor,
      oppose: m.goal.oppose,
      loyalitaet: m.loyalty,
      band: t(`loyalty.${band}`, band),
      lebensstand: t(`lifestage.${m.lifeStage}`, m.lifeStage),
      leader: m.leader === true,
      hollow: m.hollow === true,
    };
  });
}

function milestoneRows(def, state, view, env, t) {
  const pid = view.people;
  const own = view.peoples[pid];
  // Counts mirror the kernel predicates (engine/core/bestimmung.js evalPredicate)
  // so the bar can show the distance; whether a milestone is reached stays the
  // kernel's verdict (m.reached). Predicates without a count have no bar value.
  const measure = (pred) => {
    switch (pred.pred) {
      case 'population.atLeast': return { wert: own.population.core, ziel: pred.value };
      case 'resource.atLeast': return { wert: own.resources[pred.key] ?? 0, ziel: pred.value };
      case 'settlement': return { wert: view.map.settlements.filter((s) => s.people === pid && s.kind === pred.kind).length, ziel: pred.count };
      case 'controls': {
        const world = pred.terrain ? env.world(view.map.seed) : null;
        const regions = Object.keys(view.map.control).filter((r) => view.map.control[r] === pid && (!world || regionInfo(world, r)?.dominantTerrain === pred.terrain));
        return { wert: regions.length, ziel: pred.count };
      }
      case 'development.known': {
        const n = own.developments.known.filter((k) => {
          const ent = k.state === 'active' ? env.entwicklung(k.ref) : null;
          return ent && (!pred.kind || ent.kind === pred.kind) && (pred.tier === undefined || ent.tier >= pred.tier) && (!pred.tags || pred.tags.some((g) => ent.tags.includes(g)));
        }).length;
        return { wert: n, ziel: pred.count };
      }
      default: return null;
    }
  };
  return state.milestones.map((m) => {
    const d = def?.milestones.find((x) => x.id === m.id);
    const holds = d?.predicate?.pred === 'holds' ? d.predicate : null;
    const raw = holds ? { wert: m.progress, ziel: holds.seasons, einheit: t('board.measure.seasons') } : d ? measure(d.predicate) : null;
    const fortschritt = m.reached && raw ? { ...raw, wert: raw.ziel } : raw;
    return {
      id: m.id,
      text: d?.text ?? m.id,
      erreicht: m.reached,
      icon: d ? predicateIcon(d.predicate) : 'meilenstein',
      fortschritt,
      stand: m.reached ? t('board.destiny.state.erreicht') : fortschritt ? t.fmt('board.of', { done: fortschritt.wert, total: fortschritt.ziel }) : '',
    };
  });
}

export function destiny(view, env, t = makeLabels()) {
  const b = view.peoples[view.people].bestimmung;
  const def = b ? env.bestimmung(b.ref) : null;
  // A destiny a rival is known to hold is that people's own and is not offered.
  const rivalRefs = new Set(Object.values(view.peoples).filter((p) => p.id !== view.people).map((p) => p.bestimmung?.ref).filter(Boolean));
  const wechsel = env.content.bestimmungen
    .map((x) => ({ ref: `${x.id}@${x.rev}`, def: x }))
    .filter((x) => x.ref !== b?.ref && !rivalRefs.has(x.ref))
    .map(({ ref, def: d }) => ({ ref, name: d.name, weil: d.summary, preis: null, meilensteine: d.milestones.map((m) => ({ text: m.text, icon: predicateIcon(m.predicate) })) }));
  return {
    ref: b?.ref ?? null,
    name: def?.name ?? b?.ref ?? '',
    summary: def?.summary ?? '',
    art: 'start',
    meilensteine: b ? milestoneRows(def, b, view, env, t) : [],
    wechsel,
  };
}

// --- developments ------------------------------------------------------------

export function kurzOf(ent) {
  const e = (ent?.effects ?? []).find((x) => Number.isInteger(x.amount));
  if (!e) return null;
  const iconName = e.res ?? (e.op === 'probe.mod' ? 'wuerfel' : e.op === 'stat.mod' ? 'schild' : 'pfeil');
  return { icon: iconName, wert: signed(e.amount) };
}

export function developments(view, env, t) {
  const pid = view.people;
  const d = view.peoples[pid].developments;
  const practice = new Map();
  for (const row of view.peoples[pid].practice?.ledger ?? []) {
    for (const [tag, n] of Object.entries(row.tags ?? {})) practice.set(tag, (practice.get(tag) ?? 0) + n);
  }
  const node = (ref, extra = {}) => {
    const ent = env.entwicklung(ref);
    const tags = ent?.origin?.practiceTags ?? [];
    const roots = tags.filter((g) => practice.has(g));
    return {
      id: ref,
      ref,
      name: ent?.name ?? ref,
      art: ent?.kind ?? 'technik',
      artName: t(`kind.${ent?.kind}`, ent?.kind ?? ''),
      icon: KIND_ICON[ent?.kind] ?? 'technik',
      tier: ent?.tier ?? null,
      wirkung: ent?.summary ?? '',
      kurz: kurzOf(ent),
      kosten: Object.entries(ent?.cost?.resources ?? {}).map(([k, n]) => ({ key: k, menge: n })),
      tags: ent?.tags ?? [],
      von: roots[0] ? `praxis:${roots[0]}` : 'volk',
      weilVon: roots[1] ? `praxis:${roots[1]}` : null,
      weil: tags.length ? tags.map((g) => t(`tag.${g}`, g)).join(', ') : null,
      herkunft: ent?.origin?.source === 'agent' ? t('agent.research') : null,
      ...extra,
    };
  };
  const instituted = new Set(d.instituted);
  return {
    praxis: [...practice.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([tag, n]) => ({ id: `praxis:${tag}`, name: t(`tag.${tag}`, tag), gewicht: n, von: 'volk' })),
    bekannt: d.known.map((k) => ({ ...node(k.ref), von: 'volk', weilVon: null, aktiv: k.state === 'active', ab: k.effectiveFrom, eingesetzt: instituted.has(k.ref) })),
    forschung: d.research.map((r) => node(r.ref, { fortschritt: r.progress, dauer: researchCost(view, env, pid, r.ref), einheit: t('board.measure.points') })),
    vorschlaege: d.candidates.map((c) => node(c.ref, { dauer: researchCost(view, env, pid, c.ref), einheit: t('board.measure.points'), ablauf: c.expiresAt, quelle: c.origin })),
  };
}

// --- chronicle and messages --------------------------------------------------------

/** narrative/chronik/T<turn>.md entries: an optional "# title" first line, then prose. */
export function chronicle(env, t, entries) {
  return (entries ?? []).map((e) => {
    const lines = String(e.text ?? '').trim().split(/\r?\n/);
    const head = /^#+\s*(.+)$/.exec(lines[0] ?? '');
    const z = seasonOf(env, t, e.turn);
    return { turn: e.turn, saison: z.saison, jahr: z.jahr, titel: head ? head[1].trim() : t.fmt('board.time', { season: z.saison, year: z.jahr }), text: (head ? lines.slice(1) : lines).join('\n').trim() };
  });
}

/** Label key of an issue code; label keys allow no underscore. */
export const issueKey = (code) => `issue.${String(code).replace(/^kern\./, '').replaceAll('_', '-')}`;

/**
 * Text of a kernel issue in the board language (plan M1, machine-readable
 * issues): issue.<code>.<params.reason> when the kernel names a reason, else
 * issue.<code>, else the generic sentence; params fill the placeholders. The
 * kernel's own message is English prose for logs and never reaches the player.
 */
export function issueText(issue, t) {
  const base = issueKey(issue.code);
  const reason = issue.params?.reason;
  const key = reason && t.has?.(`${base}.${reason}`) ? `${base}.${reason}` : base;
  const text = t(key, t('issue.generic'));
  return issue.params ? fill(text, issue.params) : text;
}

export function messages(view, env, t, pv) {
  const pid = view.people;
  const out = [];
  if (view.status === 'ended') {
    const r = view.result;
    out.push({ id: 'ergebnis', art: r?.winner === pid ? 'meilenstein' : 'warnung', titel: t(r?.winner === pid ? 'board.end.won' : 'board.end.over'), text: r?.reason ?? '' });
  }
  for (const [res, n] of Object.entries(pv?.forecast?.shortfall ?? {})) {
    if (n > 0) out.push({ id: `mangel-${res}`, art: 'warnung', titel: t.fmt('board.msg.scarce', { res: t(`resource.${res}`, res) }), text: t.fmt('board.msg.shortfall', { n, res: t(`resource.${res}`, res) }) });
  }
  const core = view.peoples[pid].population.core;
  const assigned = Object.values(pv?.assign ?? {}).reduce((a, n) => a + n, 0);
  for (const i of pv?.issues ?? []) {
    if (i.code === 'upkeep_risk') out.push({ id: `unterhalt-${out.length}`, art: 'warnung', titel: issueText(i, t), text: issueText(i, t) });
    if (i.code === 'labour' || i.code === 'idle_labour') out.push({ id: `arbeit-${i.code}`, art: 'warnung', titel: issueText(i, t), text: t.fmt('board.msg.assigned', { done: assigned, total: core, clans: t('population.core') }), dialog: null, home: true });
    // Errors no order row carries (a malformed roll, a stale draft, a phase) would otherwise go unseen.
    else if (i.severity === 'error' && !i.path.startsWith('/orders/') && !i.path.startsWith('/rolls/T')) out.push({ id: `entwurf-${out.length}`, art: 'warnung', titel: issueText(i, t), text: issueText(i, t) });
    else if (i.severity === 'error' && i.path.startsWith('/rolls/') && (i.code !== 'roll_stale' || !(pv.probes ?? []).some((p) => i.path === `/rolls/${p.id}`))) out.push({ id: `wurf-${out.length}`, art: 'warnung', titel: issueText(i, t), text: issueText(i, t) });
  }
  for (const c of view.pendingChoices ?? []) {
    const card = env.ereignis(c.event);
    out.push({ id: `entscheidung-${c.id}`, art: 'angebot', titel: card?.name ?? card?.title ?? c.event, text: `${t('ereignis.frist')} ${seasonOf(env, t, c.deadline).saison}`, dialog: 'rat' });
  }
  const fresh = view.peoples[pid].developments.candidates.filter((c) => c.offeredAt === view.turn);
  if (fresh.length) out.push({ id: 'kandidaten', art: 'angebot', titel: t('ui.kandidaten'), text: fresh.map((c) => devName(env, c.ref)).join(', '), dialog: 'entwicklungen' });
  const b = view.peoples[pid].bestimmung;
  const def = b ? env.bestimmung(b.ref) : null;
  for (const m of b?.milestones ?? []) {
    if (m.reached && m.reachedAt === view.turn - 1) out.push({ id: `meilenstein-${m.id}`, art: 'meilenstein', titel: t('board.world.milestone'), text: def?.milestones.find((x) => x.id === m.id)?.text ?? m.id, dialog: 'bestimmung' });
  }
  return out;
}

// --- orders of the draft ---------------------------------------------------------

/** Readable target of an order from its params, using names the view and env know. */
export function describeParams(view, env, t, order, world) {
  const p = order.params ?? {};
  const own = view.peoples[view.people];
  const member = (id) => own.council.find((m) => m.id === id)?.name ?? id;
  if (p.tile) {
    const s = view.map.settlements.find((x) => x.tile === p.tile);
    if (s) return s.name;
    const f = view.map.features?.[p.tile];
    if (f && f.kind !== ROAD_KIND) return f.name;
    if (world) {
      const { q, r } = parseKey(p.tile);
      const tile = world.tiles?.[p.tile];
      const terr = env.terrain(tile?.terrain)?.name;
      const region = regionOf(world, q, r);
      const rn = world.regions?.[region]?.name;
      return terr && rn ? t.fmt('board.tile.near', { tile: terr, region: rn }) : terr ?? rn ?? p.tile;
    }
    return p.tile;
  }
  if (p.development) return devName(env, p.development);
  if (p.bestimmung) return env.bestimmung(p.bestimmung)?.name ?? p.bestimmung;
  if (p.lebensweise) return devName(env, p.lebensweise);
  if (p.member) return `${member(p.member)}${p.mode ? `, ${t(`talk.${p.mode}`, p.mode)}` : ''}`;
  if (p.aim) return t(`aim.${p.aim}`, p.aim);
  if (p.tags) return p.tags.map((g) => t(`tag.${g}`, g)).join(', ');
  if (p.unit) return p.unit;
  if (p.partner) return view.peoples[p.partner]?.name ?? p.partner;
  return '';
}

/** Errors of the preview that belong to order i (path /orders/i...) or to its roll. */
export function issuesOfOrder(pv, index, probeId) {
  return (pv?.issues ?? []).filter((i) => i.severity === 'error' && (i.path === `/orders/${index}` || i.path.startsWith(`/orders/${index}/`) || (probeId && i.path === `/rolls/${probeId}`)));
}

/** Rows of the turn bar: one per draft order, costs and slot from the preview. */
export function orderRows(view, env, t, draft, pv, world) {
  return draft.orders.map((o, i) => {
    const po = pv?.orders?.find((x) => x.id === o.id);
    const probe = pv?.probes?.find((x) => x.order === o.id) ?? null;
    const roll = probe ? draft.rolls[probe.id] : null;
    const issues = issuesOfOrder(pv, i, probe?.id);
    let wurf = null;
    if (roll && probe) {
      const band = probe.target == null ? null : bandOf(roll.value, probe.modTotal, probe.target);
      const stale = issues.some((x) => x.code === 'roll_stale');
      wurf = { gut: band ? SUCCESS_BANDS.includes(band) : true, wert: roll.value, band, stale, kurz: [t.fmt('board.probe.short', { roll: `${roll.value}${probe.modTotal ? signed(probe.modTotal) : ''}`, target: probe.target, verdict: band ? t(bandKey(band), band) : '' }), stale ? t('board.orders.stale') : null].filter(Boolean).join(', ') };
    }
    return {
      id: o.id,
      type: o.type,
      titel: t(`order.${o.type}`, o.type),
      ziel: describeParams(view, env, t, o, world),
      kosten: Object.entries(po?.costs ?? {}).filter(([, n]) => n > 0).map(([k, n]) => ({ key: k, menge: n })),
      art: slotArt(po?.slot),
      probe: probe?.id ?? null,
      offen: Boolean(probe && !roll),
      wurf,
      issues: issues.map((i) => ({ ...i, text: issueText(i, t) })),
      venture: draft.venture?.[o.id] === true,
    };
  });
}

/**
 * What keeps the turn from ending, from the kernel preview of the draft:
 * problems (errors of orders and of the draft as a whole, rolls whose probe is
 * gone) and owed rolls (probes without a roll or with a stale one, the world
 * event included). Each item carries what the board needs to jump to it or to
 * fix it in place.
 */
export function blockersOf(view, env, t, draft, pv, world) {
  const probes = pv?.probes ?? [];
  const errors = (pv?.issues ?? []).filter((i) => i.severity === 'error' && i.code !== 'roll_missing');
  const stale = new Set(errors.filter((i) => i.code === 'roll_stale').map((i) => i.path.replace('/rolls/', '')));
  const probleme = [];
  const byOrder = new Map();
  for (const i of errors) {
    const m = /^\/orders\/(\d+)(\/|$)/.exec(i.path);
    if (m) {
      const o = draft.orders[Number(m[1])];
      if (!o) continue;
      const item = byOrder.get(o.id) ?? { kind: 'befehl', id: `befehl-${o.id}`, orderId: o.id, titel: t(`order.${o.type}`, o.type), ziel: describeParams(view, env, t, o, world), texte: [], tile: o.params?.tile ?? null };
      const text = issueText(i, t);
      if (!item.texte.includes(text)) item.texte.push(text);
      if (!byOrder.has(o.id)) { byOrder.set(o.id, item); probleme.push(item); }
      continue;
    }
    if (i.code === 'roll_stale') {
      const id = i.path.replace('/rolls/', '');
      if (!probes.some((p) => p.id === id)) probleme.push({ kind: 'wurf-verwaist', id: `verwaist-${id}`, probeId: id, titel: issueText(i, t), ziel: '', texte: [t('issue.roll-orphan')] });
      continue;
    }
    if (i.code === 'slots' && i.path === '/orders') continue;
    if (i.code === 'labour') {
      probleme.push({ kind: 'arbeit', id: 'arbeit', titel: issueText(i, t), ziel: '', texte: [] });
      continue;
    }
    probleme.push({ kind: 'entwurf', id: `entwurf-${probleme.length}`, titel: issueText(i, t), ziel: '', texte: [] });
  }
  for (const sl of ['main', 'minor']) {
    const s = pv?.slots?.[sl];
    if (s && s.used > s.max) probleme.unshift({ kind: 'slots', id: `slots-${sl}`, slot: slotArt(sl), titel: t('issue.slots'), ziel: `${t(`slot.${sl}`, sl)} ${t.fmt('board.of', { done: s.used, total: s.max })}`, texte: [] });
  }
  const wuerfe = probes.filter((p) => p.roller === 'player' && (!draft.rolls?.[p.id] || stale.has(p.id))).map((p) => {
    const o = p.order ? draft.orders.find((x) => x.id === p.order) : null;
    return {
      kind: 'wurf', id: `wurf-${p.id}`, probeId: p.id, orderId: o?.id ?? null, event: p.target == null,
      titel: o ? t(`order.${o.type}`, o.type) : t('ui.weltereignis'),
      ziel: o ? describeParams(view, env, t, o, world) : '',
      veraltet: stale.has(p.id),
    };
  });
  return { probleme, wuerfe };
}

// --- whole model ---------------------------------------------------------------------

/**
 * Board model of a real campaign. ctx = { view, env, t, world, preview,
 * chronik }. The fields match the prototype model so the views stay shared.
 */
export function adaptView({ view, env, t, world, preview: pv, chronik }) {
  const pid = view.people;
  const own = view.peoples[pid];
  const zeit = seasonOf(env, t, view.turn);
  const next = seasonOf(env, t, view.turn + 1);
  const home = homeOf(view);
  const { units, places } = mapObjects(view, env, t);
  const L = layers(view, env, world);
  const { ressourcen, module } = resourceRows(view, env, t, pv);
  return {
    real: true,
    campaign: view.campaign.id,
    turn: view.turn,
    rev: view.rev,
    kernPhase: view.phase,
    phase: boardPhase(view),
    volk: { id: pid, name: own.name, kurz: own.name },
    zeit: { saison: zeit.saison, jahr: zeit.jahr },
    naechsteZeit: { saison: next.saison, jahr: next.jahr },
    winter: zeit.winter,
    ressourcen,
    module,
    units,
    places,
    known: { ...(view.map.known[pid] ?? {}) },
    home,
    start: home ? { q: home.q, r: home.r } : { q: 0, r: 0 },
    owners: L.owners,
    threat: L.threat,
    roads: L.roads,
    roadTiles: L.roadTiles,
    tradeRoutes: [],
    rat: council(view, t),
    rivalen: rivals(view, env),
    bestimmung: destiny(view, env, t),
    entwicklungen: developments(view, env, t),
    chronik: chronicle(env, t, chronik),
    meldungen: messages(view, env, t, pv),
  };
}

// Event cards for the player after a turn change. Pure and DOM-free, so the
// unit tests run it in Node. Input is what the kernel already published to
// the player: the turn's event log (view/<people>/events/T<turn>.json, or the
// player-filtered report), the projection with its open decisions, and the
// world package's cards. The module only arranges; every number on a card is
// a logged change or a declared effect of the library card, never an estimate.

import { seasonOf } from './adapter.js';

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const seqOf = (id) => Number(/-e(\d+)$/.exec(String(id))?.[1] ?? 0);
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');

// Icon of the image slot per event tag, first match wins. Icons all exist in icons.js.
const TAG_ICON = [
  ['winter', 'frost'], ['wetter', 'frost'], ['herde', 'herde'], ['weide', 'herde'], ['angriff', 'raeuber'], ['beute', 'raeuber'],
  ['krieg', 'krieger'], ['handel', 'handel'], ['weg', 'handel'], ['verhandlung', 'handel'], ['salz', 'salz'], ['erz', 'erzader'],
  ['magie', 'magie'], ['schau', 'magie'], ['dunkel', 'magie'], ['rat', 'rat'], ['siedlung', 'siedlung'], ['kontakt', 'rivalen'],
];
export const iconForTags = (tags = []) => TAG_ICON.find(([tag]) => tags.includes(tag))?.[1] ?? 'chronist';

const SLOT_ICON = { haupt: 'haupt', neben: 'neben', frei: 'enthaltung' };
/** Icon of an order's slot: main, minor, or none. */
export const slotIcon = (art) => SLOT_ICON[art] ?? 'enthaltung';

// --- consequences as chips -----------------------------------------------------------

const memberName = (view, id) => view.peoples[view.people].council.find((m) => m.id === id)?.name ?? id;
const peopleName = (view, id) => view.peoples[id]?.name ?? id;

function targetText(view, t, target) {
  if (target === 'all') return t('ereignis.alle');
  const [kind, tag] = String(target).split(':');
  if (tag) return `${t(kind === 'favor' ? 'ereignis.dafuer' : 'ereignis.dagegen')} ${t(`tag.${tag}`, tag)}`;
  return memberName(view, target);
}

/**
 * Chip of one declared effect of a library card; null for effects with nothing
 * to show (flags, hidden numbers). `store` marks the changes the kernel preview
 * also computes (stores and population), so the preview can take their place.
 */
export function effectChip(e, { view, t }) {
  switch (e.op) {
    case 'resource.delta': return { icon: e.res, wert: signed(e.amount), text: t(`resource.${e.res}`, e.res), store: true, kernel: true };
    case 'population.delta': return { icon: 'volk', wert: signed(e.amount), text: t('population.core'), store: true, kernel: true };
    case 'loyalty.delta': return { icon: 'rat', wert: signed(e.amount), text: `${t('ui.loyalitaet')}, ${targetText(view, t, e.target)}`, kernel: true };
    case 'relation.delta': return { icon: 'rivalen', wert: signed(e.amount), text: `${t('ui.beziehung')}, ${peopleName(view, e.people)}` };
    case 'standing.delta': return { icon: 'schild', wert: signed(e.amount), text: t('ereignis.ansehen'), kernel: true };
    case 'meter.delta': return { icon: 'zustimmung', wert: signed(e.amount), text: t(`meter.${e.meter}`, e.meter), kernel: true };
    case 'reveal': return { icon: 'sicht', wert: '', text: t('ereignis.aufgedeckt') };
    default: return null;
  }
}

/**
 * Chips of the kernel's preview of one answer (preview().choices[].delta, the
 * option's once effects run on a copy of the state): stores, clans, loyalty
 * per member, meters, standing, and the tokens and statuses it adds. The
 * declared effects the delta cannot carry (relations, reveals) stay with the
 * card; effectChip marks the others as `kernel`.
 */
export function choiceDeltaChips(delta, { view, t }) {
  if (!delta) return [];
  const out = [];
  for (const [k, n] of Object.entries(delta.resources ?? {})) out.push({ icon: k, wert: signed(n), text: t(`resource.${k}`, k) });
  if (delta.population) out.push({ icon: 'volk', wert: signed(delta.population), text: t('population.core') });
  for (const [id, n] of Object.entries(delta.loyalty ?? {})) out.push({ icon: 'rat', wert: signed(n), text: `${t('ui.loyalitaet')}, ${memberName(view, id)}` });
  for (const [m, n] of Object.entries(delta.meters ?? {})) out.push({ icon: m === 'zustimmung' ? 'zustimmung' : 'praxis', wert: signed(n), text: t(`meter.${m}`, m) });
  if (delta.standing) out.push({ icon: 'schild', wert: signed(delta.standing), text: t('ereignis.ansehen') });
  for (const k of delta.tokens ?? []) out.push({ icon: k === 'crisis' ? 'warnung' : 'meilenstein', wert: '', text: t(`token.${k}`, k) });
  for (const s of delta.statuses ?? []) out.push({ icon: 'dauer', wert: '', text: t(`status.${s}`, s) });
  return out;
}

/** Chip of a logged change (resource, population, loyalty, relation, standing, unit strength); null for log noise. */
function logChip(e, { view, t }) {
  const ch = e.change;
  // A relation is logged as before/after, the shift is their difference.
  if (e.kind === 'relation.change' && ch?.before && ch.after) {
    const other = String(e.target.id).split('|').find((p) => p !== view.people);
    return { key: `relation.${e.target.id}`, icon: 'rivalen', delta: ch.after.value - ch.before.value, text: `${t('ui.beziehung')}, ${peopleName(view, other)}` };
  }
  if (!ch || !Number.isInteger(ch.delta)) return null;
  if (ch.field.startsWith('resources.')) {
    const k = ch.field.slice('resources.'.length);
    return { key: ch.field, icon: k, delta: ch.delta, text: t(`resource.${k}`, k) };
  }
  if (ch.field === 'population.core') return { key: ch.field, icon: 'volk', delta: ch.delta, text: t('population.core') };
  if (ch.field === 'standing') return { key: ch.field, icon: 'schild', delta: ch.delta, text: t('ereignis.ansehen') };
  if (e.kind === 'member.loyalty') return { key: `loyalty.${e.target.id}`, icon: 'rat', delta: ch.delta, text: `${t('ui.loyalitaet')}, ${memberName(view, e.target.id)}` };
  if (e.kind === 'unit.strength') return { key: `unit.${e.target.id}`, icon: 'krieger', delta: ch.delta, text: t('ereignis.staerke') };
  return null;
}

/** Logged changes summed per field, as chips. */
export function logChips(entries, ctx) {
  const sum = new Map();
  for (const e of entries) {
    const c = logChip(e, ctx);
    if (!c) continue;
    const prev = sum.get(c.key);
    sum.set(c.key, prev ? { ...prev, delta: prev.delta + c.delta } : c);
  }
  return [...sum.values()].filter((c) => c.delta).map((c) => ({ icon: c.icon, wert: signed(c.delta), text: c.text }));
}

// --- cards -------------------------------------------------------------------------------

/** Option rows of an open decision, with the declared effects of each option as chips. */
function choiceOf(pc, card, ctx, draft) {
  const { env, t, view } = ctx;
  return {
    choiceId: pc.id,
    frist: seasonOf(env, t, pc.deadline),
    gewaehlt: draft?.choices?.[pc.id] ?? null,
    optionen: pc.options.map((id) => {
      const o = card?.options?.find((x) => x.id === id);
      return { id, text: o?.label ?? id, folgen: (o?.effects ?? []).map((e) => effectChip(e, { view, t })).filter(Boolean) };
    }),
  };
}

const sameCard = (x, ref) => x.refs?.includes(ref);
// Effects of a library card are logged with the card's name as reason, an option's effects as "name: label".
const effectsOf = (entries, ref, name, optional) => entries.filter((x) => sameCard(x, ref) && !x.kind.startsWith('event.')
  && (x.reason === name || (optional && x.reason.startsWith(`${name}: `))));

/**
 * Cards in chronological order: every world event the player drew, decisions
 * the kernel closed, deaths in the council, first contacts and wars, then the
 * decisions still open from earlier seasons. ctx = { view, env, t, events,
 * draft? }, events = log entries of the season that just resolved.
 */
export function buildCards({ view, env, t, events = [], draft = null }) {
  const pid = view.people;
  const ctx = { view, env, t };
  const log = [...new Map(events.map((e) => [e.id, e])).values()].sort((a, b) => a.turn - b.turn || seqOf(a.id) - seqOf(b.id));
  const cards = [];
  const matched = new Set();

  for (const e of log) {
    if (e.kind === 'event.drawn' && e.target.id === pid) {
      const ref = e.refs[0];
      const lib = env.ereignis(ref);
      const name = lib?.name ?? e.reason.replace(/ \(roll .*$/, '');
      const pc = (view.pendingChoices ?? []).find((c) => c.event === ref && c.offeredAt === e.turn);
      if (pc) matched.add(pc.id);
      cards.push({
        id: `e:${e.id}`, kind: pc ? 'entscheidung' : 'ereignis', turn: e.turn, title: name, text: lib?.text ?? '', tags: lib?.tags ?? [],
        image: lib?.image ?? null, icon: iconForTags(lib?.tags),
        chips: logChips(effectsOf(log, ref, name, false), ctx),
        choice: pc ? choiceOf(pc, lib, ctx, draft) : null,
        order: seqOf(e.id),
      });
    } else if (e.kind === 'event.choice' && e.change?.before && e.change.after === null && e.change.before.people === pid && !/lapses/.test(e.reason)) {
      const ref = e.change.before.event;
      const lib = env.ereignis(ref);
      const name = lib?.name ?? ref;
      const id = /closed with ([a-z0-9-]+)/.exec(e.reason)?.[1] ?? null;
      const unanswered = /\(no answer/.test(e.reason);
      const label = lib?.options?.find((o) => o.id === id)?.label ?? id ?? '';
      cards.push({
        id: `e:${e.id}`, kind: 'entschieden', turn: e.turn, title: name, text: label, tags: lib?.tags ?? [],
        image: lib?.image ?? null, icon: iconForTags(lib?.tags),
        status: { icon: unanswered ? 'dauer' : 'ja', text: unanswered ? t('ereignis.ohne-antwort') : t('ereignis.gewaehlt') },
        chips: logChips(effectsOf(log, ref, name, true), ctx),
        choice: null,
        order: seqOf(e.id),
      });
    } else if (e.kind === 'council.death' && e.change?.field === 'council') {
      const who = /^(.+) dies$/.exec(e.reason)?.[1] ?? '';
      const heir = log.find((x) => x.kind === 'council.succession' && /succeeds the leader$/.test(x.reason) && x.turn === e.turn);
      const heirName = heir ? /^(.+) succeeds the leader$/.exec(heir.reason)?.[1] : null;
      cards.push({
        id: `e:${e.id}`, kind: 'notiz', turn: e.turn, title: t('ereignis.tod'),
        text: [fill(t('ereignis.tod.text'), { name: who }), heirName ? fill(t('ereignis.nachfolge'), { name: heirName }) : ''].filter(Boolean).join(' '),
        tags: ['rat'], image: null, icon: 'rat', chips: [], choice: null, order: seqOf(e.id),
      });
    } else if (e.kind === 'relation.contact' || e.kind === 'relation.war') {
      const other = String(e.target.id).split('|').find((p) => p !== pid);
      if (!other || !String(e.target.id).split('|').includes(pid)) continue;
      const war = e.kind === 'relation.war';
      cards.push({
        id: `e:${e.id}`, kind: 'notiz', turn: e.turn, title: war ? t('ereignis.krieg') : t('ereignis.kontakt'),
        text: fill(war ? t('ereignis.krieg.text') : t('ereignis.kontakt.text'), { name: peopleName(view, other) }),
        tags: war ? ['krieg', 'angriff'] : ['kontakt', 'erkundung'], image: null, icon: war ? 'krieger' : 'rivalen', chips: [], choice: null, order: seqOf(e.id),
      });
    }
  }

  // A decision that stays open past its season comes back each turn until it is answered.
  const open = (view.pendingChoices ?? []).filter((c) => !matched.has(c.id));
  for (const pc of open) {
    const lib = env.ereignis(pc.event);
    cards.push({
      id: `c:${pc.id}`, kind: 'entscheidung', turn: pc.offeredAt, title: lib?.name ?? pc.event, text: lib?.text ?? '', tags: lib?.tags ?? [],
      image: lib?.image ?? null, icon: iconForTags(lib?.tags), chips: [], choice: choiceOf(pc, lib, ctx, draft), order: Infinity,
    });
  }
  return cards.sort((a, b) => a.order - b.order);
}

// --- quick reactions ---------------------------------------------------------------------

// Which kernel options fit an event, by the event's tags. An entry names the order
// type and, for build, the tags the development must carry. The first entry whose
// tags overlap the event comes first; options the kernel refuses are never offered.
const REACTIONS = [
  { tags: ['winter', 'wetter', 'herde', 'weide', 'salz', 'nahrung'], picks: [{ type: 'build', devTags: ['nahrung', 'weide', 'herde', 'winter'] }] },
  { tags: ['angriff', 'beute', 'krieg', 'befestigung'], picks: [{ type: 'recruit' }, { type: 'build', devTags: ['befestigung', 'krieg'] }] },
  { tags: ['handel', 'weg', 'verhandlung', 'markt'], picks: [{ type: 'road' }, { type: 'road.pave' }, { type: 'build', devTags: ['handel', 'markt'] }] },
  { tags: ['siedlung'], picks: [{ type: 'build', devTags: ['siedlung', 'nahrung'] }] },
  { tags: ['erz', 'magie', 'schau', 'dunkel', 'erkundung', 'kontakt'], picks: [{ type: 'explore' }] },
];

/**
 * Options to offer under a card. `options` are previewed kernel options
 * (api.game.optionsFor); `devTagsOf(opt)` gives the tags of the development an
 * option builds or recruits. Only options without a refusal reason qualify; one
 * already in the draft stays in the list (flagged queued) so the card can show
 * that the reaction is taken, since the kernel refuses a duplicate with a reason.
 */
export function pickReactions(card, options, devTagsOf = () => [], max = 3) {
  const usable = options.filter((o) => !o.grund || o.queued);
  const out = [];
  for (const rule of REACTIONS.filter((r) => r.tags.some((g) => card.tags?.includes(g)))) {
    for (const pick of rule.picks) {
      for (const o of usable) {
        if (o.type !== pick.type || out.includes(o)) continue;
        if (pick.devTags && !devTagsOf(o).some((g) => pick.devTags.includes(g))) continue;
        out.push(o);
      }
    }
  }
  return out.slice(0, max);
}

// --- acknowledgement ---------------------------------------------------------------------

/** localStorage key of the cards acknowledged in one turn of one campaign. */
export const ackKey = (cid, turn) => `realmcraft.ereignisse.${cid}.T${turn}`;

/** Cards the player has not acknowledged yet, and none the session already offered. */
export const unacknowledged = (cards, acked, offered = new Set()) => cards.filter((c) => !acked.has(c.id) && !offered.has(c.id));

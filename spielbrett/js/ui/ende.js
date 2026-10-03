// End of a campaign: the victory or defeat screen from the kernel's outcome in
// the player's view (derived[pid].outcome), with the campaign summary and its
// highlights from the chronicle the view carries. A campaign that ended before
// the kernel derived an outcome still gets its verdict from view.result.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n/index.js';
import { seasonOf } from '../data/adapter.js';
import { regionInfo } from '../../../engine/world/index.js';
import { getAudio } from '../audio/index.js';
import { dialogHead } from './dialoge.js';
import { pfadIcon } from './regeln.js';

const HIGHLIGHT_ICON = {
  'research.completed': 'entwicklungen',
  'bestimmung.reached': 'meilenstein',
  'bestimmung.fulfilled': 'bestimmung',
  'map.control': 'besitz',
  'people.collapsed': 'nein',
};
const VARIANT_ICON = { victory: 'bestimmung', collapse: 'warnung', rival: 'rivalen' };

/** The outcome of an ended campaign for the player, null while it runs. */
export function outcomeOf(view) {
  if (view?.status !== 'ended') return null;
  const derived = view.derived?.[view.people]?.outcome;
  if (derived) return derived;
  const r = view.result;
  return r ? { kind: r.kind ?? null, winner: r.winner ?? null, won: r.winner === view.people, turn: r.turn ?? view.turn, reason: r.reason ?? null, summary: null } : null;
}

/**
 * Everything the end screen shows, as data. `names` resolves what the view
 * only references: people(id), development(ref), region(id), time(turn).
 */
export function endData(view, names) {
  const o = outcomeOf(view);
  if (!o) return null;
  const variant = o.won ? 'victory' : o.kind === 'victory' ? 'rival' : 'collapse';
  const s = o.summary;
  const own = names.people(view.people);
  const sub = variant === 'victory'
    ? t.fmt('shell.end.victory.sub', { destiny: s?.destiny?.name ?? t('view.bestimmung') })
    : variant === 'rival'
      ? t.fmt('shell.end.rival.sub', { people: names.people(o.winner) })
      : t.fmt('shell.end.collapse.sub', { people: own });
  const byId = new Map((view.chronicle ?? []).map((e) => [e.id, e]));
  const highlight = (e) => {
    const people = names.people(e.target?.id);
    const text = {
      'research.completed': () => t.fmt('shell.end.hl.research', { name: names.development(e.refs?.[0]) }),
      'bestimmung.reached': () => t.fmt('shell.end.hl.milestone', { people }),
      'bestimmung.fulfilled': () => t.fmt('shell.end.hl.fulfilled', { people }),
      'map.control': () => t.fmt('shell.end.hl.region', { region: names.region(e.target?.id) }),
      'people.collapsed': () => t.fmt('shell.end.hl.collapsed', { people }),
    }[e.kind];
    return text ? { id: e.id, icon: HIGHLIGHT_ICON[e.kind], time: names.time(e.turn), text: text() } : null;
  };
  return {
    variant,
    title: t(`shell.end.${variant}`),
    sub,
    time: names.time(o.turn),
    people: own,
    stats: s ? [
      { id: 'turns', icon: 'dauer', value: String(s.turns), label: t('shell.end.turns') },
      { id: 'population', icon: 'volk', value: String(s.population), label: t('population.core') },
      { id: 'regions', icon: 'besitz', value: String(s.regions), label: t('shell.end.regions') },
      { id: 'settlements', icon: 'siedlung', value: String(s.settlements), label: t('shell.end.settlements') },
      s.destiny ? { id: 'destiny', icon: 'meilenstein', value: `${s.destiny.reached}/${s.destiny.of}`, label: s.destiny.name } : null,
    ].filter(Boolean) : [],
    paths: s ? Object.entries(s.achievements ?? {}).map(([id, n]) => ({ id, icon: pfadIcon(id), value: n, label: t(`pfad.${id}`, id) })) : [],
    highlights: s ? (s.highlights ?? []).map((id) => byId.get(id)).filter(Boolean).map(highlight).filter(Boolean) : [],
  };
}

/** Name lookups of a running game for endData. */
export function gameNames(game) {
  return {
    people: (id) => game.view.peoples?.[id]?.name ?? t(`people.${id}`, id ?? ''),
    development: (ref) => game.env.entwicklung(ref)?.name ?? String(ref ?? ''),
    region: (id) => (game.world ? regionInfo(game.world, id)?.name : null) || String(id ?? ''),
    time: (turn) => {
      const s = seasonOf(game.env, t, turn);
      return t.fmt('board.time', { season: s.saison, year: s.jahr });
    },
  };
}

function render(dlg, d, { onMenu, onChronicle }) {
  dlg.dataset.variant = d.variant;
  const close = () => dlg.close();
  dlg.replaceChildren(
    dialogHead(dlg, d.title, VARIANT_ICON[d.variant], d.sub),
    el('div', { class: 'overlay-body ende' },
      el('p', { class: 'ende-zeit' }, el('span', { class: 'world', text: d.people }), el('span', { text: d.time })),
      d.stats.length ? el('ul', { class: 'ende-werte plain' }, ...d.stats.map((s) => el('li', { 'data-wert': s.id },
        icon(s.icon, { size: 22 }), el('span', { class: 'ende-zahl num', text: s.value }), el('span', { class: 'ende-label', text: s.label })))) : null,
      d.paths.length ? el('section', { 'aria-labelledby': 'ende-pfade' },
        el('h3', { id: 'ende-pfade', class: 'abschnitt', text: t('shell.end.paths') }),
        el('ul', { class: 'ende-pfade plain' }, ...d.paths.map((p) => el('li', { 'data-pfad': p.id, class: p.value ? '' : 'is-leer' },
          icon(p.icon, { size: 20 }), el('span', { class: 'ende-zahl num', text: String(p.value) }), el('span', { class: 'ende-label', text: p.label }))))) : null,
      d.highlights.length ? el('section', { 'aria-labelledby': 'ende-hl' },
        el('h3', { id: 'ende-hl', class: 'abschnitt', text: t('shell.end.highlights') }),
        el('ol', { class: 'ende-hl plain' }, ...d.highlights.map((h) => el('li', {},
          icon(h.icon, { size: 18 }), el('span', { class: 'ende-hl-zeit', text: h.time }), el('span', { text: h.text }))))) : null,
      el('div', { class: 'ende-aktionen' },
        el('button', { class: 'btn btn-primary', type: 'button', 'data-ende': 'menu', onclick: onMenu }, icon('verlassen', { size: 18 }), t('shell.menu.to-start')),
        el('button', { class: 'btn', type: 'button', 'data-ende': 'chronik', onclick: onChronicle }, icon('chronik', { size: 18 }), t('view.chronik')),
        el('button', { class: 'btn btn-quiet', type: 'button', 'data-ende': 'brett', onclick: close }, icon('gelaende', { size: 18 }), t('shell.end.board')))));
}

/**
 * Opens the end screen of an ended campaign. `live` marks the moment the
 * campaign ends on the board, where the audio layer already plays the cue.
 */
export function openEnde(game, { live = false, onMenu, onChronicle } = {}) {
  const d = endData(game.view, gameNames(game));
  if (!d) return null;
  const dlg = document.getElementById('dlg-ende');
  render(dlg, d, { onMenu, onChronicle });
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('h2')?.focus();
  if (!live) getAudio()?.play(d.variant === 'victory' ? 'victory' : 'defeat');
  return dlg;
}

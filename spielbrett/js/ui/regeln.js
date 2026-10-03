// Rules reference in the game, built from the kernel and the rules of the
// world package, so it never drifts from what the kernel enforces: calendar
// and phases, action slots and the order catalogue, probe and event bands,
// stores, paths with their tiers, and how a campaign ends.

import { el } from '../dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n/index.js';
import { bandOf, eventBand, tune, BANDS } from '../data/kernel.js';
import { bandKey } from '../data/labels.js';
import { registry } from '../../../engine/core/orders.js';
import { dialogHead } from './dialoge.js';

const SLOTS = ['main', 'minor', 'free', 'varies'];
const SLOT_ICON = { main: 'haupt', minor: 'neben', free: 'plus', varies: 'pfeil' };
const MARGINS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const PHASES = ['planning', 'resolving', 'agents'];
// Colour classes of the probe dialog's chance strip, per probe band and per event band 1..5.
const BAND_CLASS = { crit_fail: 'krit-tief', setback: 'krit-tief', failure: 'fehlschlag', narrow: 'neutral', success: 'erfolg', crit_success: 'krit-hoch' };
const EVENT_CLASS = ['krit-tief', 'fehlschlag', 'neutral', 'erfolg', 'krit-hoch'];

/** Symbol of a path; paths without an own glyph borrow the nearest one. */
export const PFAD_ICON = { nahrung: 'nahrung', gemeinschaft: 'rat', militaer: 'krieger', werk: 'bauwerk', erkenntnis: 'wissen', magie: 'magie' };
export const pfadIcon = (id) => PFAD_ICON[id] ?? 'entwicklungen';

/**
 * Everything the reference shows, from regeln.json and the kernel's order
 * registry. Pure, so it runs under node:test.
 */
export function rulesData(regeln, orders = registry()) {
  const env = { regeln };
  const slots = Object.fromEntries(SLOTS.map((s) => [s, []]));
  for (const type of Object.keys(orders).sort()) {
    const { def, origin } = orders[type];
    const slot = typeof def.slot === 'string' && slots[def.slot] ? def.slot : 'varies';
    slots[slot].push({ type, module: origin === 'core' ? null : origin, locked: def.locked === true, unique: def.unique === true });
  }
  const bands = tune(env, 'eventBands');
  const tuning = regeln.tuning ?? {};
  return {
    seasons: regeln.calendar.seasons.map((s) => ({ id: s.id, winter: s.winter === true })),
    phases: PHASES,
    capacity: { main: tuning.slots?.main ?? 0, minor: tuning.slots?.minor ?? 0 },
    slots,
    // A roll of 5 against a target of 5 leaves the margin to the modifier, never a natural 1 or 10.
    margins: MARGINS.map((m) => ({ margin: m, band: bandOf(5, m, 5) })),
    naturals: [{ roll: 1, band: bandOf(1, 0, 5) }, { roll: 10, band: bandOf(10, 0, 5) }],
    events: Array.from({ length: 10 }, (_, i) => ({ roll: i + 1, band: eventBand(i + 1, bands) })),
    resources: regeln.resources.map((r) => ({ id: r.id, cap: r.cap ?? null, module: r.module ?? null })),
    maxTier: tuning.maxTier ?? null,
    pfade: regeln.pfade ? {
      paths: regeln.pfade.paths.map((p) => ({ id: p.id, opens: p.opens ? { practice: [...p.opens.practice], min: p.opens.min } : null })),
      unlock: regeln.pfade.unlock.slice(1, (tuning.maxTier ?? regeln.pfade.unlock.length - 1) + 1).map((n, i) => ({ tier: i + 1, needed: n })),
    } : null,
  };
}

const sign = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

function section(id, iconName, title, ...body) {
  return el('section', { class: 'regel', 'aria-labelledby': id },
    el('h3', { id }, icon(iconName, { size: 18 }), title), ...body);
}

const chip = (text, ...extra) => el('li', { class: 'regel-chip' }, ...extra, el('span', { text }));

function strip(cells, legend) {
  return el('div', { class: 'regel-band' },
    el('ol', { class: 'chance-leiste plain' }, ...cells),
    el('ul', { class: 'regel-legende plain' }, ...legend));
}

function legendOf(entries) {
  return entries.map(([cls, text]) => el('li', {}, el('span', { class: `chance-feld ${cls}`, 'aria-hidden': 'true' }), text));
}

function render(dlg, data) {
  const seasons = section('regel-zeit', 'dauer', t('shell.rules.seasons'),
    el('ol', { class: 'regel-chips plain' }, ...data.seasons.map((s) => chip(t(`season.${s.id}`, s.id), s.winter ? icon('frost', { size: 16, label: t('shell.rules.winter') }) : null))),
    el('ol', { class: 'regel-chips regel-folge plain', 'aria-label': t('shell.rules.phases') }, ...data.phases.map((p) => chip(t(`phase.${p}`, p), icon('pfeil', { size: 14 })))));

  const slotGroups = SLOTS.filter((s) => data.slots[s].length).map((s) => {
    const n = data.capacity[s];
    return el('div', { class: 'regel-slot' },
      el('h4', {}, icon(SLOT_ICON[s], { size: 16 }), t(`shell.rules.slot.${s}`), Number.isInteger(n) ? el('span', { class: 'regel-zahl num', text: t.fmt('shell.rules.per-season', { n }) }) : null),
      el('ul', { class: 'regel-chips plain' }, ...data.slots[s].map((o) => chip(t(`order.${o.type}`, o.type),
        o.locked ? icon('schloss', { size: 14, label: t('shell.rules.locked') }) : null,
        o.module ? el('span', { class: 'regel-modul', text: t(`module.${o.module}`, o.module) }) : null))));
  });
  const actions = section('regel-befehle', 'haupt', t('shell.rules.actions'), ...slotGroups);

  const bandName = (b) => t(bandKey(b), b);
  const usedBands = BANDS.filter((b) => data.margins.some((m) => m.band === b) || data.naturals.some((n) => n.band === b));
  const probes = section('regel-probe', 'wuerfel', t('shell.rules.probes'),
    el('p', { class: 'regel-formel', text: t('shell.rules.probe.formula') }),
    strip(data.margins.map((m) => el('li', { class: `chance-feld ${BAND_CLASS[m.band]}`, title: bandName(m.band) }, el('span', { class: 'num', text: sign(m.margin) }), el('span', { class: 'sr-only', text: bandName(m.band) }))),
      legendOf(usedBands.map((b) => [BAND_CLASS[b], bandName(b)]))),
    el('ul', { class: 'regel-chips plain' }, ...data.naturals.map((n) => chip(t.fmt('shell.rules.natural', { roll: n.roll, band: bandName(n.band) }), icon('wuerfel', { size: 14 })))));

  const events = section('regel-ereignis', 'welt', t('shell.rules.events'),
    el('p', { class: 'regel-formel', text: t('shell.rules.event.formula') }),
    strip(data.events.map((e) => el('li', { class: `chance-feld ${EVENT_CLASS[e.band - 1]}`, title: t(`eventband.${e.band}`) }, el('span', { class: 'num', text: String(e.roll) }), el('span', { class: 'sr-only', text: t(`eventband.${e.band}`) }))),
      legendOf([1, 2, 3, 4, 5].map((b) => [EVENT_CLASS[b - 1], t(`eventband.${b}`, String(b))]))));

  const stores = section('regel-vorrat', 'material', t('shell.rules.stores'),
    el('ul', { class: 'regel-vorraete plain' }, ...data.resources.map((r) => el('li', {},
      icon(r.id, { size: 18 }),
      el('span', { text: t(`resource.${r.id}`, r.id) }),
      r.cap != null ? el('span', { class: 'regel-zahl num', text: t.fmt('shell.rules.cap', { n: r.cap }) }) : null,
      r.module ? el('span', { class: 'regel-modul', text: t(`module.${r.module}`, r.module) }) : null))));

  const paths = data.pfade ? section('regel-pfade', 'entwicklungen', t('shell.rules.paths'),
    el('ul', { class: 'regel-pfade plain' }, ...data.pfade.paths.map((p) => el('li', {},
      icon(pfadIcon(p.id), { size: 18 }),
      el('span', { class: 'regel-pfad-name', text: t(`pfad.${p.id}`, p.id) }),
      p.opens ? el('span', { class: 'regel-oeffnet' }, icon('schloss', { size: 14, label: t('shell.rules.path.closed') }),
        el('span', { text: t.fmt('shell.rules.path.opens', { tags: p.opens.practice.map((x) => t(`tag.${x}`, x)).join(', '), n: p.opens.min }) })) : null))),
    el('ol', { class: 'regel-stufen plain', 'aria-label': t('shell.rules.path.tiers') }, ...data.pfade.unlock.map((u) => el('li', {},
      el('span', { class: 'regel-stufe', text: t(`tier.${u.tier}`, String(u.tier)) }),
      el('span', { class: 'regel-zahl num', text: u.needed ? t.fmt('shell.rules.path.unlock', { n: u.needed, tier: u.tier - 1 }) : t('shell.rules.path.free') }))))) : null;

  const end = section('regel-ende', 'bestimmung', t('shell.rules.end'),
    el('ul', { class: 'regel-enden plain' },
      el('li', { class: 'sieg' }, icon('bestimmung', { size: 18 }), el('span', { text: t('shell.rules.end.victory') })),
      el('li', { class: 'niederlage' }, icon('nein', { size: 18 }), el('span', { text: t('shell.rules.end.collapse') })),
      el('li', { class: 'niederlage' }, icon('rivalen', { size: 18 }), el('span', { text: t('shell.rules.end.rival') }))));

  dlg.replaceChildren(
    dialogHead(dlg, t('shell.rules.title'), 'buch'),
    el('div', { class: 'overlay-body regeln' }, seasons, actions, probes, events, stores, paths, end));
}

/** Opens the rules reference for a world package's regeln.json. */
export function openRegeln(regeln) {
  const dlg = document.getElementById('dlg-regeln');
  render(dlg, rulesData(regeln));
  if (!dlg.open) dlg.showModal();
  dlg.querySelector('h2')?.focus();
  return dlg;
}

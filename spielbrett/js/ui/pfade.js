// Paths wheel: one spoke per research path of the world, a ring per tier, the
// achievements of each path on the ring of their tier, and the research points
// of the season in the hub. A spoke is lit up to the highest tier the people
// can research on it; a closed path stays dark with a lock until the practice
// of the people opens it. Selecting a path or an achievement opens its panel
// with the research orders, each previewed by the kernel before it is added.

import { el, signed } from '../dom.js';
import { icon, ICONS } from '../icons.js';
import { costChips } from './kontext.js';
import { hintSlot } from './leiste.js';
import { t, locale } from '../i18n/index.js';
import { wheelOf, demoWheel } from '../data/pfade.js';

const SVG = 'http://www.w3.org/2000/svg';
const HUB = 74;
const OUTER = 430;
const LABEL_R = 486;
const NODE_R = 25;
// Nodes keep this much arc between their centres; names show only where the ring leaves room for them.
const MIN_GAP = 64;
const NAME_GAP = 132;
const NAME_CHARS = 13;

// Selection and focus survive a re-render after a draft change.
const ui = { path: null, ref: null };

function s(tag, attrs = {}, ...children) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) n.setAttribute(k, String(v));
  for (const c of children) if (c) n.append(c);
  return n;
}

function glyph(name, size, cls) {
  return s('g', { class: `pf-glyph ${cls ?? ''}`, transform: `translate(${-size / 2} ${-size / 2}) scale(${size / 24})` }, s('path', { d: ICONS[name] ?? ICONS.ort }));
}

const rad = (deg) => (deg * Math.PI) / 180;
const polar = (r, deg) => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))];
const fmt = (n) => n.toFixed(1);

/** Annular wedge between radii r0 and r1 and angles a0 to a1 (degrees). */
function wedge(r0, r1, a0, a1) {
  const [x0, y0] = polar(r1, a0);
  const [x1, y1] = polar(r1, a1);
  const [x2, y2] = polar(r0, a1);
  const [x3, y3] = polar(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${fmt(x0)} ${fmt(y0)} A${r1} ${r1} 0 ${large} 1 ${fmt(x1)} ${fmt(y1)} L${fmt(x2)} ${fmt(y2)} A${r0} ${r0} 0 ${large} 0 ${fmt(x3)} ${fmt(y3)}Z`;
}

/** Arc of a circle with radius r from the top, `frac` of the way round. */
function arc(r, frac) {
  const f = Math.max(0, Math.min(0.9999, frac));
  const [x, y] = polar(r, -90 + 360 * f);
  return `M0 ${-r} A${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${fmt(x)} ${fmt(y)}`;
}

const short = (name) => (name.length > NAME_CHARS ? `${name.slice(0, NAME_CHARS - 1)}…` : name);
const pathStyle = (id) => `--pf: var(--pfad-${id}, var(--origin-forschung))`;
const progressText = (n) => t.fmt('board.paths.progress', { done: n.progress, total: n.cost });

function nodeLabel(n) {
  if (n.state === 'known') return t.fmt('board.paths.node.known', { name: n.name, tier: n.tier });
  if (n.state === 'research') return t.fmt('board.paths.node.research', { name: n.name, tier: n.tier, progress: progressText(n) });
  return t.fmt('board.paths.node.candidate', { name: n.name, tier: n.tier, cost: n.cost ?? '?' });
}

function pathLabel(p, tiers) {
  return t.fmt('board.paths.path-label', { name: p.name, tier: p.tier, tiers, state: t(p.open ? 'board.paths.state.open' : 'board.paths.state.closed'), n: p.nodes.length });
}

// --- the wheel -----------------------------------------------------------------------

function ringRadius(k, tiers) {
  const first = HUB + 56;
  return tiers ? first + (k * (OUTER - 30 - first)) / tiers : first;
}

/** name: 'oben' or 'unten' places the name above or below the node, null leaves it to the tooltip. */
function drawNode(n, at, r, selected, name) {
  const g = s('g', {
    class: `pf-knoten s-${n.state}${n.active === false ? ' is-ruhend' : ''}${n.current ? ' is-jetzt' : ''}${n.chosen ? ' is-gewaehlt' : ''}${selected ? ' is-sel' : ''}`,
    transform: `translate(${fmt(at[0])} ${fmt(at[1])})`,
    tabindex: '0',
    role: 'button',
    'aria-label': nodeLabel(n),
    'aria-pressed': selected ? 'true' : 'false',
    'data-ref': n.ref,
    'data-pfad': n.pfad,
  });
  g.append(s('circle', { r: r + 8, class: 'pf-fokus' }), s('circle', { r, class: 'pf-scheibe' }));
  if (n.state === 'research' && n.cost) {
    g.append(s('circle', { r: r + 4, class: 'pf-spur' }));
    if (n.progress) g.append(s('path', { d: arc(r + 4, n.progress / n.cost), class: 'pf-fortschritt' }));
    if (n.gain) g.append(s('path', { d: arc(r + 4, (n.progress + n.gain) / n.cost), class: 'pf-zuwachs' }));
  } else if (n.state === 'candidate' && n.gain) {
    g.append(s('path', { d: arc(r + 4, n.gain / n.cost), class: 'pf-zuwachs' }));
  }
  g.append(glyph(n.icon, 24));
  if (n.current || n.chosen) g.append(s('g', { transform: `translate(${r * 0.72} ${-r * 0.72})`, class: 'pf-marke' }, s('circle', { r: 9 }), glyph(n.chosen ? 'ja' : 'wissen', 12)));
  if (name) g.append(s('text', { y: name === 'oben' ? -(r + 12) : r + 24, class: 'pf-name' }, document.createTextNode(short(n.name))));
  return g;
}

function drawWheel(w, people) {
  const N = Math.max(1, w.paths.length);
  const step = 360 / N;
  const sectors = s('g', { class: 'pf-sektoren' });
  const rings = s('g', { class: 'pf-ringe', 'aria-hidden': 'true' });
  const labels = s('g', { class: 'pf-pfade' });
  const knots = s('g', { class: 'pf-knoten-ebene' });

  for (let k = 0; k <= w.tiers; k++) rings.append(s('circle', { r: fmt(ringRadius(k, w.tiers)), class: 'pf-ring' }));

  w.paths.forEach((p, i) => {
    const mid = -90 + i * step;
    const a0 = mid - step / 2 + 1.2;
    const a1 = mid + step / 2 - 1.2;
    const sel = ui.path === p.id && !ui.ref;
    const reach = p.open ? ringRadius(p.cap, w.tiers) + 34 : HUB + 8;
    const sector = s('g', { class: `pf-sektor${p.open ? '' : ' is-zu'}${sel ? ' is-sel' : ''}${p.directed ? ' is-gelenkt' : ''}`, style: pathStyle(p.id), 'data-sektor': p.id },
      s('path', { d: wedge(HUB + 8, OUTER, a0, a1), class: 'pf-feld' }),
      p.open ? s('path', { d: wedge(HUB + 8, Math.min(reach, OUTER), a0, a1), class: 'pf-reich' }) : null,
      // Between cap and path tier the people gate holds the tiers back.
      p.open && p.tier > p.cap ? s('path', { d: wedge(Math.min(reach, OUTER), Math.min(ringRadius(p.tier, w.tiers) + 34, OUTER), a0, a1), class: 'pf-gehalten' }) : null,
      s('line', { x1: fmt(polar(HUB + 8, mid)[0]), y1: fmt(polar(HUB + 8, mid)[1]), x2: fmt(polar(OUTER, mid)[0]), y2: fmt(polar(OUTER, mid)[1]), class: 'pf-speiche' }));
    if (!p.open) {
      const [lx, ly] = polar((HUB + OUTER) / 2, mid);
      sector.append(s('g', { transform: `translate(${fmt(lx)} ${fmt(ly)})`, class: 'pf-schloss' }, glyph('schloss', 34)));
    }
    sectors.append(sector);

    // Label of the path at the rim: icon, name and one pip per tier.
    const [x, y] = polar(LABEL_R, mid);
    const pips = s('g', { class: 'pf-pips', transform: 'translate(0 30)' });
    for (let k = 1; k <= w.tiers; k++) {
      const px = (k - (w.tiers + 1) / 2) * 15;
      pips.append(s('circle', { cx: px, cy: 0, r: 5.5, class: !p.open ? '' : k <= p.cap ? 'on' : k <= p.tier ? 'gehalten' : '' }));
    }
    const label = s('g', {
      class: `pf-pfad${sel ? ' is-sel' : ''}${p.open ? '' : ' is-zu'}`, style: pathStyle(p.id), transform: `translate(${fmt(x)} ${fmt(y)})`,
      tabindex: '0', role: 'button', 'aria-label': pathLabel(p, w.tiers), 'aria-pressed': sel ? 'true' : 'false', 'data-pfad': p.id, 'data-pfad-knopf': '',
    },
    s('rect', { x: -86, y: -44, width: 172, height: 88, rx: 14, class: 'pf-pfad-feld' }),
    s('g', { transform: 'translate(0 -20)' }, glyph(p.open ? p.icon : 'schloss', 26)),
    s('text', { y: 14, class: 'pf-pfad-name' }, document.createTextNode(p.name)),
    pips);
    labels.append(label);

    // Achievements on the ring of their tier, spread across the spoke's sector.
    const byTier = new Map();
    for (const n of p.nodes) (byTier.get(n.tier) ?? byTier.set(n.tier, []).get(n.tier)).push(n);
    for (const [tier, list] of byTier) {
      const r = ringRadius(Math.min(tier, w.tiers), w.tiers);
      const span = Math.max(0, step - 10);
      const gapDeg = Math.min(list.length > 1 ? span / (list.length - 1) : span, (Math.max(MIN_GAP, Math.min(NAME_GAP, (rad(span) * r) / list.length)) / r) * (180 / Math.PI));
      // Neighbours put their names on opposite sides of the ring, which halves the room a name needs.
      const showName = list.length === 1 || rad(gapDeg) * r >= NAME_GAP / 2;
      list.forEach((n, j) => {
        const a = mid + (j - (list.length - 1) / 2) * gapDeg;
        const sel2 = ui.ref === n.ref;
        const g = drawNode(n, polar(r, a), NODE_R, sel2, showName || sel2 ? (j % 2 ? 'oben' : 'unten') : null);
        g.setAttribute('style', pathStyle(p.id));
        knots.append(g);
      });
    }
  });

  const pts = w.points;
  const hub = s('g', {
    class: `pf-nabe${ui.path === null && ui.ref === null ? ' is-sel' : ''}`, tabindex: '0', role: 'button', 'data-nabe': '',
    'aria-label': pts ? t.fmt('board.paths.points', { n: pts.total }) : t('board.paths.title'),
    'aria-pressed': ui.path === null && ui.ref === null ? 'true' : 'false',
  },
  s('circle', { r: HUB + 8, class: 'pf-fokus' }),
  s('circle', { r: HUB, class: 'pf-nabe-scheibe' }),
  s('g', { transform: 'translate(0 -22)' }, glyph('wissen', 28)),
  s('text', { y: 26, class: 'pf-punkte' }, document.createTextNode(pts ? signed(pts.total) : people)));

  return s('svg', { class: 'pf-rad', viewBox: '-600 -560 1200 1120', role: 'group', 'aria-label': t.fmt('board.paths.wheel', { name: people }) },
    sectors, rings, labels, knots, hub);
}

// --- panel ---------------------------------------------------------------------------

function row(iconName, label, ...content) {
  return el('div', { class: 'pf-zeile' },
    el('span', { class: 'pf-zeile-icon', role: 'img', 'aria-label': label }, icon(iconName, { size: 18 })),
    el('div', { class: 'pf-zeile-inhalt' }, ...content));
}

function progressBar(n) {
  const total = n.cost || 1;
  return el('div', { class: 'pf-balken', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(n.progress), 'aria-label': progressText(n) },
    el('span', { class: 'pf-balken-stand', style: { inlineSize: `${(100 * n.progress) / total}%` } }),
    n.gain ? el('span', { class: 'pf-balken-zuwachs', style: { inlineSize: `${(100 * n.gain) / total}%` } }) : null);
}

/** A kernel order as a button: refused with the label of the kernel's issue, previewed on hover and focus. */
function orderButton(api, cand, label, { primary = true, data } = {}) {
  const opt = api.game.previewOption(cand);
  const locked = api.model.phase === 'A';
  const disabled = Boolean(opt.grund) || opt.queued || locked;
  const show = () => { if (!disabled) { api.setPreview(opt.preview); hintSlot(api, { art: 'forschung', ersetzt: opt.ersetzt?.id ?? null }); } };
  const hide = () => { api.setPreview(null); hintSlot(api, null); };
  // The text stays the same when the order is queued, so focus keeps its place across the re-render.
  const btn = el('button', {
    class: `btn ${primary && !opt.queued ? 'btn-primary' : 'btn-quiet'}`,
    type: 'button',
    'aria-disabled': disabled ? 'true' : 'false',
    'aria-pressed': opt.queued ? 'true' : 'false',
    'data-order': cand.type,
    ...(data ? { [`data-${data}`]: '' } : {}),
    onclick: () => { if (!disabled) api.addCandidate(opt); },
    onpointerenter: show, onpointerleave: hide, onfocus: show, onblur: hide,
  }, icon(opt.queued ? 'ja' : 'wissen', { size: 18 }), label);
  return el('div', { class: 'pf-aktion' },
    btn,
    opt.ersetzt && !opt.queued ? el('p', { class: 'pf-ersetzt' }, icon('praxis', { size: 14 }), t.fmt('board.option.instead', { title: opt.ersetzt.ziel || opt.ersetzt.titel })) : null,
    // A queued order previews as its own duplicate, so its refusal says nothing about it.
    opt.grund && !opt.queued ? el('p', { class: 'pf-grund', 'data-grund': '', text: opt.grund }) : locked ? el('p', { class: 'pf-grund', text: t('phase.resolving') }) : null);
}

function nodeButton(n) {
  return el('button', { class: `pf-eintrag s-${n.state}${n.current ? ' is-jetzt' : ''}`, type: 'button', 'data-waehle': n.ref, 'aria-label': nodeLabel(n) },
    icon(n.icon, { size: 18 }),
    el('span', { class: 'pf-eintrag-name', text: n.name }),
    el('span', { class: 'pf-stufe-chip', 'aria-hidden': 'true', text: t.fmt('board.paths.tier', { tier: n.tier }) }),
    n.state === 'research' ? el('span', { class: 'pf-mini num', 'aria-hidden': 'true', text: t.fmt('board.of', { done: n.progress, total: n.cost }) }) : null,
    n.state === 'known' ? icon(n.active === false ? 'warnung' : 'ja', { size: 15, cls: 'pf-zustand' }) : null);
}

function pathPanel(api, w, p) {
  const groups = [['known', 'board.paths.known'], ['research', 'board.paths.research'], ['candidate', 'board.paths.candidates']]
    .map(([state, key]) => [key, p.nodes.filter((n) => n.state === state)]).filter(([, list]) => list.length);
  return el('div', { class: 'pf-seite', style: { '--pf': `var(--pfad-${p.id}, var(--origin-forschung))` } },
    el('h3', { class: 'world pf-titel' }, icon(p.open ? p.icon : 'schloss', { size: 22 }), p.name),
    p.open ? el('p', { class: 'pf-stufen', role: 'img', 'aria-label': t.fmt('board.paths.tier-of', { tier: p.cap, tiers: w.tiers }) },
      ...Array.from({ length: w.tiers }, (_, i) => el('span', { class: `pf-pip${i < p.cap ? ' on' : i < p.tier ? ' gehalten' : ''}` })),
      el('span', { class: 'pf-stufe-text', 'aria-hidden': 'true', text: t.fmt('board.paths.tier', { tier: p.cap }) })) : null,
    p.tier > p.cap ? row('volk', t('board.paths.held-label'), el('span', { class: 'pf-text', text: t.fmt('board.paths.held', { tier: p.cap + 1 }) })) : null,
    p.next && p.open ? row('meilenstein', t('board.paths.next-label'), el('span', { class: 'pf-text', text: t.plural('board.paths.next', p.next.needed, { tier: p.next.tier }) })) : null,
    p.opens ? row('schloss', t('board.paths.opens'),
      el('span', { class: 'pf-tags' }, ...p.opens.tags.map((g) => el('span', { class: 'pf-tag', text: t(`tag.${g}`, g) }))),
      el('span', { class: 'pf-text num', text: t.fmt('board.of', { done: p.opens.have, total: p.opens.min }) })) : null,
    ...groups.map(([key, list]) => el('section', { class: 'pf-gruppe' },
      el('h4', { text: t(key) }),
      el('ul', { class: 'plain' }, ...list.map((n) => el('li', {}, nodeButton(n)))))),
    w.real && p.open ? directForm(api, w, p) : null);
}

/** research.direct on this path: the request the research agent reads between turns, with up to three of the path's tags. */
function directForm(api, w, p) {
  const chosen = new Set(w.direct?.pfad === p.id ? w.direct.tags ?? [] : []);
  const note = el('textarea', { class: 'pf-notiz', rows: '2', maxlength: '200', 'aria-label': t('board.tree.note') });
  if (w.direct?.pfad === p.id && w.direct.note) note.value = w.direct.note;
  const cand = () => ({ type: 'research.direct', params: { pfad: p.id, ...(chosen.size ? { tags: [...chosen] } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}) } });
  const slot = el('div', {});
  const refresh = () => slot.replaceChildren(orderButton(api, cand(), t('board.paths.direct'), { primary: false, data: 'lenken' }));
  note.addEventListener('change', refresh);
  const tags = [...p.tags].sort((a, b) => t(`tag.${a}`, a).localeCompare(t(`tag.${b}`, b), locale()));
  refresh();
  return el('section', { class: 'pf-gruppe pf-lenken' },
    el('h4', { text: t('board.paths.direct-heading') }),
    el('ul', { class: 'pf-tagwahl plain', 'aria-label': t('board.paths.direct-tags') }, ...tags.map((g) => el('li', {},
      el('label', { class: 'pf-tagknopf' },
        el('input', {
          type: 'checkbox', 'data-tag': g, checked: chosen.has(g),
          onchange: (e) => {
            if (e.target.checked && chosen.size >= 3) e.target.checked = false;
            else if (e.target.checked) chosen.add(g);
            else chosen.delete(g);
            refresh();
          },
        }),
        el('span', { text: t(`tag.${g}`, g) }))))),
    note,
    slot);
}

function nodePanel(api, w, n) {
  const p = w.paths.find((x) => x.id === n.pfad);
  const real = w.real;
  let action = null;
  if (real && n.state !== 'known') action = orderButton(api, { type: 'research.assign', params: { development: n.ref } }, t(n.state === 'research' ? 'board.tree.prioritise' : 'board.tree.research'), { data: 'forschen' });
  else if (real && n.kind === 'institution' && n.state === 'known') {
    const instituted = api.game.view.peoples[api.game.pid].developments.instituted.includes(n.ref);
    if (!instituted) action = orderButton(api, { type: 'institute', params: { development: n.ref } }, t('order.institute'), { primary: false });
  } else if (!real && n.state === 'candidate') {
    const queued = api.model.orders.some((o) => o.quelle === `forschung-${n.ref}`);
    action = el('button', {
      class: queued ? 'btn btn-quiet' : 'btn btn-primary', type: 'button', disabled: queued || api.model.phase === 'A',
      onclick: () => api.addOrder({ id: `f-${n.ref}`, quelle: `forschung-${n.ref}`, titel: t.fmt('board.tree.research-title', { name: n.name }), ziel: t('ui.forschung'), kosten: n.resources, art: 'haupt' }),
    }, icon(queued ? 'ja' : 'wissen', { size: 18 }), t('board.tree.research'));
  }
  return el('div', { class: 'pf-seite', style: { '--pf': `var(--pfad-${n.pfad}, var(--origin-forschung))` } },
    p ? el('button', { class: 'btn btn-klein btn-quiet pf-zurueck', type: 'button', 'data-zurueck': p.id, 'aria-label': t.fmt('board.paths.back', { name: p.name }) }, icon(p.icon, { size: 16 }), p.name) : null,
    el('h3', { class: 'world pf-titel' }, icon(n.icon, { size: 22 }), n.name),
    el('p', { class: 'pf-meta' },
      el('span', { class: 'pf-stufe-chip', text: t.fmt('board.paths.tier', { tier: n.tier }) }),
      n.kindName ? el('span', { text: n.kindName }) : null,
      el('span', { class: `pf-status s-${n.state}`, text: t(`board.paths.status.${n.state}`) })),
    n.state === 'known' && n.active === false ? row('warnung', t('board.paths.inactive'), el('span', { class: 'pf-text', text: t('board.paths.inactive') })) : null,
    n.kurz || n.summary ? row('pfeil', t('ui.wirkung'),
      n.kurz ? el('span', { class: 'pf-wirkung' }, icon(n.kurz.icon, { size: 16 }), n.kurz.wert) : null,
      n.summary ? el('span', { class: 'pf-text world', text: n.summary }) : null) : null,
    n.state !== 'known' && n.cost ? row('wissen', t('board.paths.cost'),
      n.state === 'research' || n.gain ? progressBar(n) : null,
      el('span', { class: 'pf-wert num', text: n.state === 'research' ? progressText(n) : t.fmt('board.paths.cost-points', { n: n.cost }) }),
      n.gain ? el('span', { class: 'pf-wert num up', 'data-zuwachs': '', text: t.fmt('board.paths.gain', { n: n.gain }) })
        : n.points ? el('span', { class: 'pf-wert num', text: t.fmt('board.paths.per-season', { n: n.points }) }) : null,
      n.completes ? el('span', { class: 'pf-wert up' }, icon('ja', { size: 14 }), t('board.paths.completes')) : null,
      !n.completes && n.seasons ? el('span', { class: 'pf-wert' }, icon('dauer', { size: 14 }), t.plural('board.seasons', n.seasons)) : null) : null,
    n.resources.length && n.state !== 'known' ? row('kosten', t('board.paths.paid'), costChips(api, n.resources, { size: 16 }),
      n.waits ? el('span', { class: 'pf-wert down' }, icon('warnung', { size: 14 }), t('board.paths.waits')) : null) : null,
    n.expires ? row('dauer', t('board.paths.expires'), el('span', { class: 'pf-text', text: t.fmt('board.time', { season: n.expires.saison, year: n.expires.jahr }) })) : null,
    action);
}

function hubPanel(api, w, people) {
  const pts = w.points;
  const current = w.current ? w.nodeOf(w.current) : null;
  return el('div', { class: 'pf-seite' },
    el('h3', { class: 'world pf-titel' }, icon('wissen', { size: 22 }), people),
    pts ? el('dl', { class: 'pf-punkte-liste' },
      el('dt', { text: t('board.paths.points.base') }), el('dd', { class: 'num', text: signed(pts.base) }),
      el('dt', { text: t('board.paths.points.labour') }), el('dd', { class: 'num', text: signed(pts.labour) }),
      el('dt', { text: t('board.paths.points.knowledge') }), el('dd', { class: 'num', text: signed(pts.knowledge) }),
      pts.mods ? el('dt', { text: t('board.paths.points.mods') }) : null, pts.mods ? el('dd', { class: 'num', text: signed(pts.mods) }) : null,
      el('dt', { class: 'pf-summe', text: t('board.paths.points.total') }), el('dd', { class: 'num pf-summe', text: signed(pts.total) })) : null,
    current ? el('section', { class: 'pf-gruppe' }, el('h4', { text: t('board.paths.current') }), el('ul', { class: 'plain' }, el('li', {}, nodeButton(current)))) : null,
    el('section', { class: 'pf-gruppe' },
      el('h4', { text: t('board.paths.title') }),
      el('ul', { class: 'plain' }, ...w.paths.map((p) => el('li', {},
        el('button', { class: `pf-eintrag${p.open ? '' : ' is-zu'}`, type: 'button', 'data-pfad-wahl': p.id, style: { '--pf': `var(--pfad-${p.id}, var(--origin-forschung))` }, 'aria-label': pathLabel(p, w.tiers) },
          icon(p.open ? p.icon : 'schloss', { size: 18, cls: 'pf-pfad-icon' }),
          el('span', { class: 'pf-eintrag-name', text: p.name }),
          el('span', { class: 'pf-stufe-chip', 'aria-hidden': 'true', text: t.fmt('board.paths.tier', { tier: p.cap }) })))))));
}

// --- tooltip over the wheel ------------------------------------------------------------

function tipFor(w, target) {
  const ref = target.dataset.ref;
  if (ref) {
    const n = w.nodeOf(ref);
    if (!n) return null;
    return [el('strong', { text: n.name }), el('span', { text: [t.fmt('board.paths.tier', { tier: n.tier }), t(`board.paths.status.${n.state}`), n.state === 'research' ? progressText(n) : n.cost ? t.fmt('board.paths.cost-points', { n: n.cost }) : null, n.gain ? t.fmt('board.paths.gain', { n: n.gain }) : null].filter(Boolean).join(', ') })];
  }
  const pid = target.dataset.pfad;
  if (pid) {
    const p = w.paths.find((x) => x.id === pid);
    return p ? [el('strong', { text: p.name }), el('span', { text: [t.fmt('board.paths.tier-of', { tier: p.cap, tiers: w.tiers }), p.next && p.open ? t.plural('board.paths.next', p.next.needed, { tier: p.next.tier }) : null, p.open ? null : t('board.paths.state.closed')].filter(Boolean).join(', ') })] : null;
  }
  if (target.dataset.nabe !== undefined && w.points) {
    const pts = w.points;
    return [el('strong', { text: t.fmt('board.paths.points', { n: pts.total }) }), el('span', { text: [`${t('board.paths.points.base')} ${signed(pts.base)}`, `${t('board.paths.points.labour')} ${signed(pts.labour)}`, `${t('board.paths.points.knowledge')} ${signed(pts.knowledge)}`, pts.mods ? `${t('board.paths.points.mods')} ${signed(pts.mods)}` : null].filter(Boolean).join(', ') })];
  }
  return null;
}

// --- dialog ------------------------------------------------------------------------------

export function renderPfade(dlg, api) {
  const { game, model } = api;
  const w = game ? wheelOf({ view: game.view, env: game.env, t, draft: game.draft, pv: game.base }) : demoWheel(model, t);
  if (ui.ref && !w.nodeOf(ui.ref)) ui.ref = null;
  if (ui.path && !w.paths.some((p) => p.id === ui.path)) ui.path = null;
  const people = model.volk.name;
  const focused = document.activeElement && dlg.contains(document.activeElement) ? document.activeElement : null;
  const refocus = focused?.dataset?.ref ? `.pf-knoten[data-ref="${focused.dataset.ref}"]`
    : focused?.dataset?.pfadKnopf !== undefined && focused?.dataset?.pfad ? `.pf-pfad[data-pfad="${focused.dataset.pfad}"]`
      : focused?.dataset?.nabe !== undefined ? '.pf-nabe' : null;

  const rerender = (sel) => {
    renderPfade(dlg, api);
    if (sel) dlg.querySelector(sel)?.focus({ preventScroll: true });
  };
  const choose = (path, ref, focusSel) => {
    ui.path = path;
    ui.ref = ref;
    rerender(focusSel);
    api.announce(ref ? w.nodeOf(ref)?.name ?? '' : path ? w.paths.find((p) => p.id === path)?.name ?? '' : t('board.paths.title'));
  };

  const svg = drawWheel(w, people);
  const field = el('div', { class: 'pf-rad-feld' }, svg);
  const tip = el('div', { class: 'pf-tip', role: 'tooltip', id: 'pf-tip', hidden: true });
  field.append(tip);
  const showTip = (target) => {
    const content = tipFor(w, target);
    if (!content) { tip.hidden = true; return; }
    tip.replaceChildren(...content);
    tip.hidden = false;
    const fr = field.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const x = tr.left + tr.width / 2 - fr.left;
    const below = tr.top - fr.top < 90;
    tip.style.left = `${Math.max(8, Math.min(fr.width - 8, x))}px`;
    tip.style.top = `${below ? tr.bottom - fr.top + 8 : tr.top - fr.top - 8}px`;
    tip.classList.toggle('is-unten', below);
  };
  const targetOf = (e) => e.target.closest?.('[data-ref], [data-pfad-knopf], [data-nabe]');
  svg.addEventListener('pointerover', (e) => { const n = targetOf(e); if (n) showTip(n); });
  svg.addEventListener('pointerleave', () => { tip.hidden = true; });
  svg.addEventListener('focusin', (e) => { const n = targetOf(e); if (n) { n.setAttribute('aria-describedby', 'pf-tip'); showTip(n); } });
  svg.addEventListener('focusout', () => { tip.hidden = true; });

  const pick = (n) => {
    if (n.dataset.ref) choose(n.dataset.pfad, n.dataset.ref, `.pf-knoten[data-ref="${n.dataset.ref}"]`);
    else if (n.dataset.nabe !== undefined) choose(null, null, '.pf-nabe');
    else choose(n.dataset.pfad, null, `.pf-pfad[data-pfad="${n.dataset.pfad}"]`);
  };
  svg.addEventListener('click', (e) => {
    const n = targetOf(e);
    if (n) return pick(n);
    const sector = e.target.closest?.('[data-sektor]');
    if (sector) choose(sector.dataset.sektor, null, `.pf-pfad[data-pfad="${sector.dataset.sektor}"]`);
    return undefined;
  });
  // Keyboard: Enter or Space selects; left and right walk the paths, up and down a path's achievements.
  svg.addEventListener('keydown', (e) => {
    const n = targetOf(e);
    if (!n) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(n);
      return;
    }
    const ids = w.paths.map((p) => p.id);
    const here = n.dataset.pfad ?? ui.path ?? ids[0];
    const i = Math.max(0, ids.indexOf(here));
    let go = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next = ids[(i + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
      go = `.pf-pfad[data-pfad="${next}"]`;
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const list = [`.pf-pfad[data-pfad="${here}"]`, ...(w.paths[i]?.nodes ?? []).map((x) => `.pf-knoten[data-ref="${x.ref}"]`)];
      const cur = n.dataset.ref ? list.indexOf(`.pf-knoten[data-ref="${n.dataset.ref}"]`) : 0;
      go = list[(cur + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length];
    }
    if (go) {
      e.preventDefault();
      e.stopPropagation();
      dlg.querySelector(go)?.focus();
    }
  });

  const selNode = ui.ref ? w.nodeOf(ui.ref) : null;
  const selPath = !selNode && ui.path ? w.paths.find((p) => p.id === ui.path) : null;
  const panel = selNode ? nodePanel(api, w, selNode) : selPath ? pathPanel(api, w, selPath) : hubPanel(api, w, people);
  const aside = el('aside', { class: 'pf-panel', 'aria-label': t('board.paths.selection') }, panel);
  aside.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-waehle], [data-pfad-wahl], [data-zurueck]');
    if (!b) return;
    if (b.dataset.waehle) {
      const n = w.nodeOf(b.dataset.waehle);
      choose(n?.pfad ?? null, b.dataset.waehle, `.pf-knoten[data-ref="${b.dataset.waehle}"]`);
    } else {
      const id = b.dataset.pfadWahl ?? b.dataset.zurueck;
      choose(id, null, `.pf-pfad[data-pfad="${id}"]`);
    }
  });

  const head = el('header', { class: 'overlay-kopf pf-kopf' },
    el('span', { class: 'overlay-siegel' }, icon('entwicklungen', { size: 22 })),
    el('h2', { class: 'world', id: `${dlg.id}-titel`, tabindex: '-1', text: t('board.paths.title') }),
    el('button', { class: 'icon-btn', type: 'button', 'aria-label': t.fmt('board.close.esc', { label: t('board.close') }), onclick: () => dlg.close() }, icon('schliessen')));

  dlg.replaceChildren(el('div', { class: 'pfade' }, head, el('div', { class: 'pf-buehne' }, field, aside)));
  if (refocus) dlg.querySelector(refocus)?.focus({ preventScroll: true });
}

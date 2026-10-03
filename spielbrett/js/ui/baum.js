// Developments as a growing tree around the people's emblem. Known
// developments form the trunk, practices (what the people does) branch from
// them, research glows with a progress ring, and proposals sprout from the
// practice that caused them, so the "weil" is a visible edge. Details, costs
// and the research order open in a side panel on selection.

import { el } from '../dom.js';
import { icon, ICONS } from '../icons.js';
import { portrait } from './portrait.js';
import { costChips } from './kontext.js';
import { hintSlot, slotOf, SLOT_ICON } from './leiste.js';

const SVG = 'http://www.w3.org/2000/svg';
const ART = { technik: 'Technik', magie: 'Magie', einheit: 'Einheit', bauwerk: 'Bauwerk', institution: 'Institution' };
// Ring radius per depth: the trunk sits close to the emblem, sprouts further out.
const RINGS = [0, 150, 268, 372, 460];
// Root order places the forge beside the pass guard and the fire songs beside
// it on the other side, so both "weil" edges of the fork stay short.
const ROOT_ORDER = ['herdenrecht', 'filzjurten', 'pfadzeichen', 'p_schmiede', 'bergbogen', 'feuerlieder', 'eigen'];
// Within a branch, the practice with a "weil" edge sits on the side of its target.
const CHILD_ORDER = { p_schmiede: ['schmelzofen', 'p_schwefel'], p_wache: ['pulverwall', 'bannfeuer'] };

const view = { x: 0, y: 0, k: 1, sel: 'volk', fitted: false };

function s(tag, attrs = {}, ...children) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) n.setAttribute(k, String(v));
  for (const c of children) if (c) n.append(c);
  return n;
}

function svgIcon(name, size, cls) {
  const g = s('g', { class: `b-icon ${cls ?? ''}`, transform: `translate(${-size / 2} ${-size / 2}) scale(${size / 24})` });
  const p = s('path', { d: ICONS[name] ?? ICONS.ort });
  if (name === 'dagegen') p.setAttribute('transform', 'rotate(180 12 12)');
  g.append(p);
  return g;
}

/** Builds the node graph from the model: id -> node with type, parent and children. */
function buildGraph(model) {
  const E = model.entwicklungen;
  const nodes = new Map();
  const add = (n) => nodes.set(n.id, { ...n, kinder: [] });
  add({ id: 'volk', typ: 'emblem', name: model.volk.kurz });
  for (const b of E.bekannt) add({ ...b, typ: 'bekannt', von: b.von ?? 'volk' });
  for (const p of E.praxis) add({ ...p, typ: 'praxis' });
  for (const f of E.forschung) add({ ...f, typ: 'forschung' });
  for (const v of E.vorschlaege) add({ ...v, typ: v.eigen ? 'eigen-vorschlag' : 'vorschlag', von: v.von ?? 'volk' });
  add({ id: 'eigen', typ: 'eigen', name: 'Eigene Richtung', von: 'volk' });
  for (const n of nodes.values()) if (n.von && nodes.has(n.von)) nodes.get(n.von).kinder.push(n.id);
  const root = nodes.get('volk');
  const rank = (id) => (ROOT_ORDER.includes(id) ? ROOT_ORDER.indexOf(id) : ROOT_ORDER.length);
  root.kinder.sort((a, b) => rank(a) - rank(b));
  for (const [id, order] of Object.entries(CHILD_ORDER)) {
    const n = nodes.get(id);
    if (n) n.kinder.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  }
  return nodes;
}

/** Radial tree: angular share by leaf count, one ring per depth. */
function layout(nodes) {
  const leaves = (id) => {
    const n = nodes.get(id);
    n.blaetter = n.kinder.length ? n.kinder.reduce((a, c) => a + leaves(c), 0) : 1;
    return n.blaetter;
  };
  leaves('volk');
  const place = (id, a0, a1, depth) => {
    const n = nodes.get(id);
    const a = (a0 + a1) / 2;
    n.depth = depth;
    n.angle = a;
    const R = RINGS[Math.min(depth, RINGS.length - 1)];
    n.x = Math.cos(a) * R;
    n.y = Math.sin(a) * R * 0.8;
    let cur = a0;
    for (const c of n.kinder) {
      const share = ((a1 - a0) * nodes.get(c).blaetter) / n.blaetter;
      place(c, cur, cur + share, depth + 1);
      cur += share;
    }
  };
  place('volk', -Math.PI / 2 - Math.PI, Math.PI / 2, 0);
}

function branch(a, b, cls, width) {
  // Branches leave the parent outward and bend into the child, like growth.
  const ax = a.x + Math.cos(a.angle ?? 0) * (a.depth ? 26 : 46);
  const ay = a.y + Math.sin(a.angle ?? 0) * (a.depth ? 22 : 40);
  const mx = (ax + b.x) / 2;
  const my = (ay + b.y) / 2;
  const cx = a.depth ? mx + Math.cos(a.angle) * 30 : mx;
  const cy = a.depth ? my + Math.sin(a.angle) * 30 : my;
  return s('path', { d: `M${ax.toFixed(1)} ${ay.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`, class: `b-ast ${cls}`, 'stroke-width': width });
}

function nodeLabel(n) {
  switch (n.typ) {
    case 'emblem': return `${n.name}, Ursprung`;
    case 'bekannt': return `${n.name}, bekannt, ${n.artName ?? ART[n.art] ?? ''}`;
    case 'forschung': return `${n.name}, in Forschung, ${n.fortschritt} von ${n.dauer} ${n.einheit ?? 'Saisons'}`;
    case 'vorschlag': return `${n.name}, Vorschlag, ${n.artName ?? ART[n.art] ?? ''}`;
    case 'eigen-vorschlag': return `${n.name}, eigene Richtung, wird geprüft`;
    case 'praxis': return `${n.name}, Praxis des Volkes`;
    default: return 'Eigene Richtung vorschlagen';
  }
}

function drawNode(n, selected, model) {
  const g = s('g', {
    class: `b-knoten t-${n.typ}${selected ? ' is-sel' : ''}${n.neu ? ' is-neu' : ''}`,
    transform: `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`,
    tabindex: '0',
    role: 'button',
    'aria-label': nodeLabel(n),
    'aria-pressed': selected ? 'true' : 'false',
    'data-id': n.id,
  });
  if (n.typ === 'emblem') {
    g.append(s('circle', { r: 50, class: 'b-emblem-glow' }), s('circle', { r: 40, class: 'b-scheibe' }), svgIcon('bestimmung', 34));
    g.append(s('text', { y: 64, class: 'b-name' }, document.createTextNode(n.name)));
    return g;
  }
  if (n.typ === 'praxis') {
    g.append(s('circle', { r: 11, class: 'b-scheibe' }), svgIcon('praxis', 13));
    const t = s('text', { y: 26, class: 'b-praxis' });
    t.textContent = n.name;
    g.append(t);
    return g;
  }
  if (n.typ === 'eigen') {
    g.append(s('circle', { r: 16, class: 'b-scheibe' }), svgIcon('plus', 16));
    return g;
  }
  const r = 27;
  g.append(s('circle', { r: r + 9, class: 'b-hof' }), s('circle', { r, class: 'b-scheibe' }));
  if (n.typ === 'forschung') {
    const frac = n.fortschritt / n.dauer;
    const c = 2 * Math.PI * (r + 4);
    g.append(s('circle', { r: r + 4, class: 'b-ring-spur' }));
    g.append(s('circle', { r: r + 4, class: 'b-ring', 'stroke-dasharray': `${(c * frac).toFixed(1)} ${c.toFixed(1)}`, transform: 'rotate(-90)' }));
  }
  g.append(svgIcon(n.icon ?? n.art ?? 'technik', 24));
  const name = s('text', { y: r + 22, class: 'b-name' });
  name.textContent = n.name;
  g.append(name);
  if (n.kurz) {
    const chip = s('g', { class: 'b-wirkung', transform: `translate(0 ${r + 38})` });
    const w = 24 + n.kurz.wert.length * 8;
    chip.append(s('rect', { x: -w / 2, y: -10, width: w, height: 20, rx: 10 }), s('g', { transform: `translate(${-w / 2 + 12} 0)` }, svgIcon(n.kurz.icon, 13)));
    const t = s('text', { x: -w / 2 + 22, y: 4.5 });
    t.textContent = n.kurz.wert;
    chip.append(t);
    g.append(chip);
  }
  return g;
}

function sidePanel(api, n, nodes, rerender) {
  const { model } = api;
  const parent = n.von ? nodes.get(n.von) : null;
  const weil = n.weilVon ? nodes.get(n.weilVon) : null;
  const queued = model.orders.some((o) => o.quelle === `forschung-${n.id}`);
  const row = (iconName, label, ...content) => el('div', { class: 'bs-zeile' }, el('span', { class: 'bs-icon', 'aria-label': label, role: 'img' }, icon(iconName, { size: 18 })), el('div', {}, ...content));
  const council = n.stimmung ? el('ul', { class: 'bs-rat plain', 'aria-label': 'Haltung im Rat' }, ...[...n.stimmung.pro.map((id) => [id, true]), ...n.stimmung.contra.map((id) => [id, false])].map(([id, pro]) => {
    const a = model.rat.find((x) => x.id === id);
    return a ? el('li', { class: pro ? 'pro' : 'contra', 'aria-label': `${a.name} ${pro ? 'dafür' : 'dagegen'}` }, portrait(a.id, a.name, { size: 40 }), el('span', { class: 'bs-hand', 'aria-hidden': 'true' }, icon(pro ? 'dafuer' : 'dagegen', { size: 14 }))) : null;
  })) : null;

  if (n.typ === 'eigen' && model.real) return directionPanel(api);
  if (n.typ === 'eigen') {
    const ta = el('textarea', { id: 'eigen-text', rows: '3', maxlength: '200', 'aria-label': 'Eigene Richtung' });
    return el('form', {
      class: 'baum-seite',
      onsubmit: (ev) => {
        ev.preventDefault();
        const text = ta.value.trim();
        if (!text) return;
        const id = `eigen-${Date.now()}`;
        model.entwicklungen.vorschlaege.push({ id, name: text.length > 28 ? `${text.slice(0, 26)}…` : text, langtext: text, art: 'technik', von: 'volk', eigen: true });
        view.sel = id;
        api.announce('Eigene Richtung vorgemerkt, der Forschungsagent prüft sie im Zwischenzug');
        rerender();
      },
    },
    el('h3', { class: 'world' }, icon('plus', { size: 20 }), 'Eigene Richtung'),
    ta,
    el('button', { class: 'btn btn-primary', type: 'submit' }, icon('entwicklungen', { size: 18 }), 'Vorschlagen'));
  }

  if (n.typ === 'emblem') return emblemPanel(api, nodes, model);

  return el('div', { class: 'baum-seite' },
    el('h3', { class: 'world' }, n.typ === 'emblem' ? icon('bestimmung', { size: 22 }) : n.typ === 'praxis' ? icon('praxis', { size: 20 }) : icon(n.icon ?? n.art ?? 'technik', { size: 22 }), n.typ === 'emblem' ? model.volk.name : n.name),
    n.art ? el('p', { class: 'bs-art', text: `${n.artName ?? ART[n.art]}${n.typ === 'forschung' ? ', in Forschung' : n.typ === 'vorschlag' ? ', Vorschlag' : n.typ === 'bekannt' ? ', bekannt' : ''}` }) : null,
    n.kurz ? row('pfeil', 'Wirkung', el('span', { class: 'bs-wirkung' }, icon(n.kurz.icon, { size: 16 }), n.kurz.wert), el('span', { class: 'bs-text', text: n.wirkung })) : n.wirkung ? row('pfeil', 'Wirkung', el('span', { class: 'bs-text', text: n.wirkung })) : null,
    n.typ === 'forschung' ? row('dauer', 'Fortschritt', el('span', { class: 'bs-wert', text: `${n.fortschritt} von ${n.dauer} ${n.einheit ?? 'Saisons'}` })) : null,
    n.kosten?.length ? row('kosten', 'Kosten', costChips(api, n.kosten, { size: 16 })) : null,
    n.dauer && n.typ !== 'forschung' ? row('dauer', 'Dauer', el('span', { class: 'bs-wert', text: n.einheit ? `${n.dauer} ${n.einheit}` : `${n.dauer} ${n.dauer === 1 ? 'Saison' : 'Saisons'}` })) : null,
    n.preis ? row('preis', 'Preis', el('span', { class: 'bs-text', text: n.preis })) : null,
    n.weil ? row('praxis', 'Weil', el('span', { class: 'bs-weil world' }, el('span', { class: 'v-weil-wort', text: 'weil ' }), n.weil),
      el('span', { class: 'bs-text' }, [parent, weil].filter((x) => x && x.typ === 'praxis').map((x) => x.name).join(', '))) : null,
    n.eigen ? row('dauer', 'Status', el('span', { class: 'bs-text', text: 'Wird im Zwischenzug vom Forschungsagenten geprüft' })) : null,
    council,
    model.real ? kernelAction(api, n) : null,
    !model.real && n.typ === 'vorschlag' ? el('button', {
      class: queued ? 'btn btn-quiet' : 'btn btn-primary',
      type: 'button',
      disabled: queued || model.phase === 'A',
      onclick: () => {
        api.addOrder({ id: `f-${n.id}`, quelle: `forschung-${n.id}`, titel: `${n.name} erforschen`, ziel: 'Forschung', kosten: n.kosten ?? [], art: 'haupt' });
        rerender();
      },
    }, icon(queued ? 'ja' : 'entwicklungen', { size: 18 }), queued ? 'In den Befehlen' : 'Erforschen') : null,
  );
}

/**
 * Kernel order of a node in a real campaign: research a candidate or give a
 * running research priority (research.assign), put a known institution in
 * force (institute). Disabled with the kernel's reason; hover previews it.
 */
function kernelAction(api, n) {
  const { game } = api;
  let cand = null;
  let label = '';
  if (n.typ === 'vorschlag') [cand, label] = [{ type: 'research.assign', params: { development: n.ref } }, 'Erforschen'];
  else if (n.typ === 'forschung') [cand, label] = [{ type: 'research.assign', params: { development: n.ref } }, 'Vorrang geben'];
  else if (n.typ === 'bekannt' && n.art === 'institution' && !n.eingesetzt) [cand, label] = [{ type: 'institute', params: { development: n.ref } }, game.t('order.institute', 'Einsetzen')];
  if (!cand) return null;
  const opt = game.previewOption(cand);
  const disabled = Boolean(opt.grund) || opt.queued || api.model.phase === 'A';
  return el('div', { class: 'bs-aktion' },
    el('button', {
      class: opt.queued ? 'btn btn-quiet' : 'btn btn-primary',
      type: 'button',
      'aria-disabled': disabled ? 'true' : 'false',
      'data-order': cand.type,
      onclick: () => { if (!disabled) api.addCandidate(opt); },
      onpointerenter: () => { if (!disabled) { api.setPreview(opt.preview); hintSlot(api, { art: slotOf(opt), ersetzt: opt.ersetzt?.id ?? null }); } },
      onpointerleave: () => { api.setPreview(null); hintSlot(api, null); },
    }, icon(opt.queued ? 'ja' : SLOT_ICON[slotOf(opt)] ?? 'entwicklungen', { size: 18 }), opt.queued ? 'In den Befehlen' : label),
    opt.ersetzt && !opt.queued ? el('p', { class: 'bo-ersetzt' }, icon('praxis', { size: 14 }), `statt ${opt.ersetzt.ziel || opt.ersetzt.titel}`) : null,
    opt.grund ? el('p', { class: 'bo-grund', text: opt.grund }) : null);
}

/** Research direction of a real campaign: one to three tags of the world's vocabulary and a note (research.direct). */
function directionPanel(api) {
  const { game } = api;
  const chosen = new Set();
  const tags = Object.keys(game.env.vocabulary).sort((a, b) => game.t(`tag.${a}`, a).localeCompare(game.t(`tag.${b}`, b), 'de'));
  const ta = el('textarea', { id: 'eigen-text', rows: '3', maxlength: '200', 'aria-label': 'Notiz an die Forschung' });
  const submit = el('button', { class: 'btn btn-primary', type: 'submit', disabled: true }, icon('entwicklungen', { size: 18 }), 'Vorschlagen');
  const grund = el('p', { class: 'bo-grund' });
  const cand = () => ({ type: 'research.direct', params: { tags: [...chosen], ...(ta.value.trim() ? { note: ta.value.trim() } : {}) } });
  const check = () => {
    const opt = chosen.size ? game.previewOption(cand()) : null;
    submit.disabled = !opt || Boolean(opt.grund) || opt.queued || api.model.phase === 'A';
    grund.textContent = opt?.grund ?? '';
  };
  return el('form', {
    class: 'baum-seite',
    onsubmit: (ev) => {
      ev.preventDefault();
      if (!submit.disabled) api.addCandidate(cand());
    },
  },
  el('h3', { class: 'world' }, icon('plus', { size: 20 }), 'Eigene Richtung'),
  el('ul', { class: 'richtung-tags plain', 'aria-label': 'Schlagworte, bis zu drei' }, ...tags.map((g) => el('li', {},
    el('label', { class: 'probe-option' },
      el('input', {
        type: 'checkbox',
        'data-tag': g,
        onchange: (e) => {
          if (e.target.checked && chosen.size >= 3) e.target.checked = false;
          else if (e.target.checked) chosen.add(g);
          else chosen.delete(g);
          check();
        },
      }),
      el('span', { text: game.t(`tag.${g}`, g) }))))),
  ta,
  grund,
  submit);
}

/** The emblem lists every development as buttons: an overview and a keyboard path into the tree. */
function emblemPanel(api, nodes, model) {
  const group = (title, typ) => {
    const list = [...nodes.values()].filter((n) => n.typ === typ);
    if (!list.length) return null;
    return el('section', { class: 'bs-gruppe' },
      el('h4', { text: title }),
      el('ul', { class: 'plain' }, ...list.map((n) => el('li', {},
        el('button', { class: 'bs-knopf', type: 'button', 'data-waehle': n.id },
          icon(n.icon ?? n.art ?? 'technik', { size: 18 }),
          el('span', { text: n.name }),
          n.kurz ? el('span', { class: 'bs-kurz' }, icon(n.kurz.icon, { size: 13 }), n.kurz.wert) : null)))));
  };
  return el('div', { class: 'baum-seite' },
    el('h3', { class: 'world' }, icon('bestimmung', { size: 22 }), model.volk.name),
    group('Vorschläge', 'vorschlag'),
    group('In Forschung', 'forschung'),
    group('Bekannt', 'bekannt'));
}

export function renderBaum(dlg, api) {
  const { model } = api;
  const nodes = buildGraph(model);
  layout(nodes);
  if (!nodes.has(view.sel)) view.sel = 'volk';
  const sel = nodes.get(view.sel);

  const rerender = () => {
    const had = dlg.querySelector('.b-knoten:focus')?.dataset.id;
    renderBaum(dlg, api);
    if (had) dlg.querySelector(`.b-knoten[data-id="${had}"]`)?.focus({ preventScroll: true });
  };
  const select = (id) => {
    view.sel = id;
    const n = nodes.get(id);
    const deltas = {};
    for (const k of n.kosten ?? []) deltas[k.key] = (deltas[k.key] ?? 0) - k.menge;
    api.setPreview(Object.keys(deltas).length && n.typ === 'vorschlag' ? { deltas, tiles: [] } : null);
    rerender();
  };

  // Edges: trunk thick near the emblem, thinner outward.
  const edges = s('g', { class: 'b-aeste' });
  const related = new Set([sel.id, sel.von, sel.weilVon].filter(Boolean));
  for (const n of nodes.values()) {
    if (!n.von || !nodes.has(n.von)) continue;
    const p = nodes.get(n.von);
    const cls = n.typ === 'vorschlag' || n.typ === 'eigen-vorschlag' ? 'sprosse' : n.typ === 'forschung' ? 'forschung' : n.typ === 'eigen' ? 'eigen' : 'stamm';
    const hot = related.has(n.id) && related.has(p.id);
    edges.append(branch(p, n, `${cls}${hot ? ' is-heiss' : ''}`, Math.max(1.5, 7 - n.depth * 1.6)));
  }
  for (const n of nodes.values()) {
    if (!n.weilVon || !nodes.has(n.weilVon)) continue;
    const w = nodes.get(n.weilVon);
    const hot = related.has(n.id);
    // The secondary "weil" edge arcs outward, around the branches in between.
    edges.append(s('path', { d: `M${w.x} ${w.y} Q${((w.x + n.x) / 2) * 1.25} ${((w.y + n.y) / 2) * 1.25} ${n.x} ${n.y}`, class: `b-ast weil${hot ? ' is-heiss' : ''}`, 'stroke-width': 1.8 }));
  }

  const order = [];
  const dfs = (id) => { order.push(id); for (const c of nodes.get(id).kinder) dfs(c); };
  dfs('volk');
  const knots = s('g', { class: 'b-knoten-ebene' }, ...order.map((id) => drawNode(nodes.get(id), id === view.sel, model)));

  const world = s('g', { class: 'b-welt' }, edges, knots);
  const svg = s('svg', { class: 'baum', role: 'group', 'aria-label': 'Entwicklungsbaum' },
    s('defs', {}, s('filter', { id: 'b-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, s('feGaussianBlur', { stdDeviation: 4 }))),
    world);

  const apply = () => world.setAttribute('transform', `translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`);

  // Keyboard: arrows walk the tree, Enter or Space selects.
  knots.addEventListener('keydown', (e) => {
    const id = e.target.closest?.('.b-knoten')?.dataset.id;
    if (!id) return;
    const n = nodes.get(id);
    const sibs = n.von ? nodes.get(n.von).kinder : [id];
    const i = sibs.indexOf(id);
    const go = { ArrowLeft: n.von, ArrowRight: n.kinder[0], ArrowUp: sibs[(i + sibs.length - 1) % sibs.length], ArrowDown: sibs[(i + 1) % sibs.length] }[e.key];
    if (go) {
      e.preventDefault();
      e.stopPropagation();
      dlg.querySelector(`.b-knoten[data-id="${go}"]`)?.focus();
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(id);
    }
  });
  knots.addEventListener('click', (e) => {
    const id = e.target.closest?.('.b-knoten')?.dataset.id;
    if (id) select(id);
  });

  // Pan by dragging the background, zoom with the wheel.
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.b-knoten')) return;
    drag = { x: e.clientX, y: e.clientY };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('is-panning');
  });
  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.x += e.clientX - drag.x;
    view.y += e.clientY - drag.y;
    drag = { x: e.clientX, y: e.clientY };
    apply();
  });
  svg.addEventListener('pointerup', () => { drag = null; svg.classList.remove('is-panning'); });
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = svg.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    const k = Math.min(2.2, Math.max(0.4, view.k * f));
    view.x = mx - ((mx - view.x) * k) / view.k;
    view.y = my - ((my - view.y) * k) / view.k;
    view.k = k;
    apply();
  }, { passive: false });

  const head = el('header', { class: 'baum-kopf' },
    el('h2', { class: 'world', id: `${dlg.id}-titel`, tabindex: '-1' }, icon('entwicklungen', { size: 24 }), 'Entwicklungen'),
    el('div', { class: 'baum-werkzeug' },
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ansicht einpassen', onclick: () => { view.fitted = false; fit(); } }, icon('ziel', { size: 18 })),
      el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Schließen (Esc)', onclick: () => dlg.close() }, icon('schliessen'))));

  const aside = el('aside', { class: 'baum-panel', 'aria-label': 'Auswahl im Baum' }, sidePanel(api, sel, nodes, rerender));
  aside.addEventListener('click', (e) => {
    const id = e.target.closest?.('[data-waehle]')?.dataset.waehle;
    if (!id) return;
    select(id);
    dlg.querySelector(`.b-knoten[data-id="${id}"]`)?.focus({ preventScroll: true });
  });
  dlg.replaceChildren(el('div', { class: 'baum-buehne' }, head, svg, aside));

  function fit() {
    const r = svg.getBoundingClientRect();
    if (!r.width) return;
    const xs = [...nodes.values()].map((n) => n.x);
    const ys = [...nodes.values()].map((n) => n.y);
    // The side panel covers the right edge on wide screens and the lower part on narrow ones.
    const wide = r.width > 900;
    const availW = wide ? r.width - 380 : r.width;
    const availH = wide ? r.height - 60 : r.height * 0.55 - 50;
    const top = wide ? 40 : 50;
    const w = Math.max(...xs) - Math.min(...xs) + 260;
    const h = Math.max(...ys) - Math.min(...ys) + 200;
    view.k = Math.min(1.25, Math.max(0.3, Math.min(availW / w, availH / h)));
    view.x = availW / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * view.k;
    view.y = top + availH / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * view.k;
    view.fitted = true;
    apply();
  }
  if (view.fitted) apply();
  else requestAnimationFrame(fit);
}

export function resetBaumView() {
  view.fitted = false;
}

// Unified Vertical Information Visualization (Weltenstrom):
// Merges sky/calendar, community diorama + Isotype clan labour, alluvial resource flows,
// 5-pass topographic hex map, council balance & destiny constellation, root-to-crown
// knowledge graph, and multi-turn stratigraphy into one continuous top-to-bottom visual scroll.

import { createGame } from './data/game.js';
import { server, turnStem } from './data/server.js';
import { calendarOf, SUCCESS_BANDS } from './data/kernel.js';
import { objectsAt } from './data/adapter.js';
import { RULES } from '../../engine/core/rules.js';
import { drawCommunity, COMMUNITY_SIZE } from './community/scene.js';
import { MapView } from './map/renderer.js';
import { el, svg as svgEl, signed } from './dom.js';
import { icon } from './icons.js';
import { t, applyStatic, onLanguage } from './i18n/index.js';
import { renderAstrolabium, renderNaturgemaelde, renderWebstuhl } from './prototypen.js';

const FONT_WORLD = 'var(--font-world)';
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const SEASON_ORDER = ['fruehling', 'sommer', 'herbst', 'winter'];
const SEASON_SCENE = { fruehling: 'spring', sommer: 'summer', herbst: 'autumn', winter: 'winter' };
const LAYERS = ['gelaende', 'besitz', 'bedrohung', 'handel'];

function svgTwoLineText(x, y, textStr, maxLine = 16, attrs = {}) {
  const raw = String(textStr ?? '').trim();
  const words = raw.split(/\s+/);
  let line1 = '';
  let line2 = '';
  for (const w of words) {
    if (!line1 || (line1.length + 1 + w.length <= maxLine && !line2)) {
      line1 = line1 ? `${line1} ${w}` : w;
    } else {
      line2 = line2 ? `${line2} ${w}` : w;
    }
  }
  const tNode = svgEl('text', { x, y, 'text-anchor': 'middle', ...attrs });
  if (!line2) {
    tNode.textContent = line1;
  } else {
    tNode.append(
      svgEl('tspan', { x, dy: '0', text: line1 }),
      svgEl('tspan', { x, dy: '1.18em', text: line2 }),
    );
  }
  return tNode;
}

function sippeFigureSvg(color = '#ebe4d4', idle = false) {
  return svgEl('svg', {
    viewBox: '0 0 18 30',
    class: `sippe-figur${idle ? ' is-idle' : ''}`,
    'aria-hidden': 'true',
  },
  svgEl('circle', { cx: 9, cy: 6, r: 4, fill: color }),
  svgEl('path', {
    d: 'M4 13 C4 10.8, 14 10.8, 14 13 L15 22 L12 22 L11.5 29 L6.5 29 L6 22 L3 22 Z',
    fill: color,
  }));
}

// Draws a 2d6 die face glyph at (cx, cy) for a roll total (2..12)
function dieGlyph(cx, cy, rollTotal, color) {
  const val = Math.max(1, Math.min(6, Math.round((rollTotal || 7) / 2)));
  const pips = {
    1: [[0, 0]],
    2: [[-4, -4], [4, 4]],
    3: [[-4, -4], [0, 0], [4, 4]],
    4: [[-4, -4], [4, -4], [-4, 4], [4, 4]],
    5: [[-4, -4], [4, -4], [0, 0], [-4, 4], [4, 4]],
    6: [[-4, -4], [4, -4], [-4, 0], [4, 0], [-4, 4], [4, 4]],
  }[val] || [[0, 0]];
  return svgEl('g', { transform: `translate(${cx},${cy})` },
    svgEl('rect', {
      x: -10, y: -10, width: 20, height: 20, rx: 4,
      fill: '#141b1a', stroke: color, 'stroke-width': 1.4,
    }),
    ...pips.map(([px, py]) => svgEl('circle', { cx: px, cy: py, r: 1.6, fill: color })));
}

// Segmented circular arc ring (no percentages, shows exact discrete segments done/total)
function segmentedRing(cx, cy, r, done, total, activeColor = '#d79a49', baseColor = 'rgba(235,228,212,0.16)', strokeWidth = 5) {
  const n = Math.max(1, Math.min(16, total || 1));
  const filled = Math.max(0, Math.min(n, done || 0));
  const g = svgEl('g', {});
  if (n === 1) {
    g.append(svgEl('circle', {
      cx, cy, r,
      fill: 'none',
      stroke: filled >= 1 ? activeColor : baseColor,
      'stroke-width': strokeWidth,
    }));
    return g;
  }
  const gapDeg = n <= 4 ? 10 : 6;
  const stepDeg = 360 / n;
  const arcDeg = Math.max(6, stepDeg - gapDeg);
  for (let i = 0; i < n; i++) {
    const startAngle = (-90 + i * stepDeg + gapDeg / 2) * (Math.PI / 180);
    const endAngle = (-90 + i * stepDeg + gapDeg / 2 + arcDeg) * (Math.PI / 180);
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = arcDeg > 180 ? 1 : 0;
    g.append(svgEl('path', {
      d: `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
      fill: 'none',
      stroke: i < filled ? activeColor : baseColor,
      'stroke-width': strokeWidth,
      'stroke-linecap': 'round',
    }));
  }
  return g;
}

// --- I. HIMMEL & JAHRESKREIS ---------------------------------------------------
function renderHimmel(game, model) {
  const host = document.getElementById('viz-himmel');
  const cal = calendarOf(game.env.regeln, game.view.turn);
  const seasonIdx = Math.max(0, SEASON_ORDER.indexOf(cal.season));
  const turnNum = game.view.turn + 1;
  const romanTurn = ROMAN[game.view.turn] ?? String(turnNum);
  const worldName = game.env.welt?.name ?? '';
  const peopleName = model.volk?.name ?? '';

  const svg = svgEl('svg', { viewBox: '0 0 1200 220', class: 'strom-svg', role: 'img', 'aria-label': `${peopleName} · ${romanTurn}` });

  // Subtle celestial meridian and horizon arc
  const defs = svgEl('defs', {},
    svgEl('radialGradient', { id: 'sunGlow', cx: '50%', cy: '50%', r: '50%' },
      svgEl('stop', { offset: '0%', 'stop-color': '#e7b96b', 'stop-opacity': '0.45' }),
      svgEl('stop', { offset: '100%', 'stop-color': '#e7b96b', 'stop-opacity': '0' })),
    svgEl('linearGradient', { id: 'arcGrad', x1: '0%', y1: '0%', x2: '100%', y2: '0%' },
      svgEl('stop', { offset: '0%', 'stop-color': 'rgba(235,228,212,0.05)' }),
      svgEl('stop', { offset: '25%', 'stop-color': 'rgba(215,154,73,0.42)' }),
      svgEl('stop', { offset: '75%', 'stop-color': 'rgba(122,166,172,0.42)' }),
      svgEl('stop', { offset: '100%', 'stop-color': 'rgba(235,228,212,0.05)' })));
  svg.append(defs);

  // Outer celestial arc
  svg.append(svgEl('path', {
    d: 'M 140 168 Q 600 8 1060 168',
    fill: 'none',
    stroke: 'url(#arcGrad)',
    'stroke-width': 1.5,
  }));
  svg.append(svgEl('path', {
    d: 'M 210 178 Q 600 38 990 178',
    fill: 'none',
    stroke: 'rgba(235,228,212,0.1)',
    'stroke-width': 1,
    'stroke-dasharray': '3 6',
  }));

  // 4 Seasonal Stations along the quadratic bezier curve
  const seasonPoints = [
    { t: 0.14, key: 'fruehling', sym: '⚘', color: '#7cb586' },
    { t: 0.37, key: 'sommer', sym: '☀', color: '#e2b25e' },
    { t: 0.63, key: 'herbst', sym: '❧', color: '#d0824a' },
    { t: 0.86, key: 'winter', sym: '❄', color: '#86b4c4' },
  ];

  for (let i = 0; i < seasonPoints.length; i++) {
    const sp = seasonPoints[i];
    const u = sp.t;
    const x = (1 - u) * (1 - u) * 140 + 2 * (1 - u) * u * 600 + u * u * 1060;
    const y = (1 - u) * (1 - u) * 168 + 2 * (1 - u) * u * 8 + u * u * 168;
    const isCurrent = i === seasonIdx;
    const isPast = i < seasonIdx;

    if (isCurrent) {
      svg.append(svgEl('circle', { cx: x, cy: y, r: 42, fill: 'url(#sunGlow)' }));
      svg.append(svgEl('circle', {
        cx: x, cy: y, r: 21,
        fill: '#161e1d',
        stroke: sp.color,
        'stroke-width': 2.2,
      }));
      svg.append(svgEl('circle', {
        cx: x, cy: y, r: 27,
        fill: 'none',
        stroke: sp.color,
        'stroke-width': 1,
        'stroke-dasharray': '2 4',
      }));
    } else {
      svg.append(svgEl('circle', {
        cx: x, cy: y, r: isPast ? 12 : 9,
        fill: isPast ? '#1b2422' : '#121817',
        stroke: isPast ? 'rgba(215,154,73,0.55)' : 'rgba(235,228,212,0.22)',
        'stroke-width': 1.4,
      }));
    }

    svg.append(svgEl('text', {
      x, y: y + (isCurrent ? 6 : 4),
      'text-anchor': 'middle',
      fill: isCurrent ? sp.color : isPast ? '#d79a49' : 'rgba(235,228,212,0.35)',
      'font-size': isCurrent ? '17' : '11',
      text: sp.sym,
    }));

    svg.append(svgEl('text', {
      x, y: y + (isCurrent ? 42 : 25),
      'text-anchor': 'middle',
      fill: isCurrent ? '#ebe4d4' : 'rgba(235,228,212,0.48)',
      'font-family': FONT_WORLD,
      'font-size': isCurrent ? '13' : '11',
      'font-weight': isCurrent ? '600' : '400',
      'letter-spacing': '0.06em',
      text: `${ROMAN[i]} · ${t(`season.${sp.key}`, sp.key)}`,
    }));
  }

  // Central Meridian Crest: People Name, World Name & Raw Year/Turn Numeral
  svg.append(svgEl('text', {
    x: 600, y: 168,
    'text-anchor': 'middle',
    fill: '#ebe4d4',
    'font-family': FONT_WORLD,
    'font-size': '26',
    'font-weight': '600',
    'letter-spacing': '0.04em',
    text: peopleName,
  }));

  svg.append(svgEl('text', {
    x: 600, y: 194,
    'text-anchor': 'middle',
    fill: 'rgba(235,228,212,0.58)',
    'font-family': FONT_WORLD,
    'font-style': 'italic',
    'font-size': '14',
    'letter-spacing': '0.08em',
    text: `${worldName}  ·  ${romanTurn} / ${cal.year}`,
  }));

  host.replaceChildren(svg);
}

// --- II. SIEDLUNGS-DIORAMA & ISOTYPE-SIPPEN ------------------------------------
function renderDiorama(game, model) {
  const canvas = document.getElementById('strom-gemeinschaft');
  const ctx = canvas.getContext('2d');
  const people = game.view.peoples[game.pid];
  const assign = game.draft.assign ?? people.population.assigned ?? {};
  const cal = calendarOf(game.env.regeln, game.view.turn);
  const season = SEASON_SCENE[cal.season] ?? (cal.winter ? 'winter' : 'spring');
  const landscape = game.pack?.welt?.creation?.world?.landscape || 'highlands';

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = 1200 * dpr;
  const h = 640 * dpr;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  ctx.setTransform(dpr, 0, 0, dpr * (640 / COMMUNITY_SIZE.height), 0, 0);
  drawCommunity(ctx, {
    season,
    settled: model.home?.kind !== 'lager',
    clans: people.population.core,
    labour: {
      food: assign[RULES.food] ?? 0,
      material: assign[RULES.material] ?? 0,
      research: assign.research ?? 0,
    },
    seed: String(game.view.map.seed),
    reducedMotion: true,
    herds: people.resources.herden ?? 2,
    landscape,
  }, 1.4);

  // Isotype Clan Strip along the bottom of the diorama
  const sippenHost = document.getElementById('viz-sippen');
  const totalClans = people.population.core;
  const currentAssign = {
    [RULES.food]: assign[RULES.food] ?? 0,
    [RULES.material]: assign[RULES.material] ?? 0,
    research: assign.research ?? 0,
  };
  const assignedSum = currentAssign[RULES.food] + currentAssign[RULES.material] + currentAssign.research;
  const freeClans = Math.max(0, totalClans - assignedSum);

  const stations = [
    { key: RULES.food, iconName: 'nahrung', color: '#82b889', label: t(`resource.${RULES.food}`, 'Nahrung') },
    { key: 'research', iconName: 'wissen', color: '#78b0c4', label: t('ui.forschung', 'Wissen') },
    { key: RULES.material, iconName: 'material', color: '#d79a49', label: t(`resource.${RULES.material}`, 'Material') },
  ];

  const adjustLabour = (targetKey, delta) => {
    const next = { ...currentAssign };
    if (delta > 0) {
      if (freeClans > 0) {
        next[targetKey] = (next[targetKey] ?? 0) + 1;
      } else {
        // Pull 1 clan from another station with the highest count
        const donor = stations
          .map((s) => s.key)
          .filter((k) => k !== targetKey && (next[k] ?? 0) > 0)
          .sort((a, b) => (next[b] ?? 0) - (next[a] ?? 0))[0];
        if (!donor) return;
        next[donor] -= 1;
        next[targetKey] = (next[targetKey] ?? 0) + 1;
      }
    } else if (delta < 0 && (next[targetKey] ?? 0) > 0) {
      next[targetKey] -= 1;
    } else {
      return;
    }
    game.setAssign(next);
  };

  sippenHost.replaceChildren(...stations.map((st) => {
    const count = currentAssign[st.key] ?? 0;
    const figs = [];
    for (let i = 0; i < count; i++) figs.push(sippeFigureSvg(st.color, false));
    if (st.key === 'research' && freeClans > 0) {
      for (let i = 0; i < freeClans; i++) figs.push(sippeFigureSvg('#ebe4d4', true));
    }
    return el('div', { class: 'sippen-anker', 'data-strom-arbeit': st.key },
      el('div', { class: 'sippen-figuren' }, ...figs),
      el('div', { class: 'sippen-steuer' },
        el('button', {
          type: 'button',
          class: 'sippen-knopf',
          disabled: count <= 0,
          'aria-label': `${st.label} −`,
          onclick: () => adjustLabour(st.key, -1),
          text: '−',
        }),
        el('span', { class: 'sippen-wert' },
          icon(st.iconName, { size: 16 }),
          el('span', { text: String(count) })),
        el('button', {
          type: 'button',
          class: 'sippen-knopf',
          disabled: count >= totalClans,
          'aria-label': `${st.label} +`,
          onclick: () => adjustLabour(st.key, 1),
          text: '+',
        })));
  }));
}

// --- III. ALLUVIALE RESSOURCEN-STRÖME & PEGEL-BLÖCKE --------------------------
function renderFluesse(game, model) {
  const host = document.getElementById('viz-fluesse');
  const fc = game.base?.forecast ?? {};
  const rawList = model.ressourcen ?? [];
  const byKey = new Map(rawList.map((r) => [r.key, r]));

  // Order left-to-right to match the 3 labour stations above (Left: Nahrung, Center: Wissen, Right: Material)
  // so alluvial ribbons flow downward without crossing each other
  const orderedKeys = ['nahrung', 'volk', 'wissen', 'zustimmung', 'material'];
  const resList = orderedKeys.map((k) => byKey.get(k)).filter(Boolean);

  const svg = svgEl('svg', { viewBox: '0 0 1200 350', class: 'strom-svg', role: 'img', 'aria-label': t('board.topbar.stores') });

  const sourceX = {
    nahrung: 220,
    volk: 220,
    wissen: 600,
    zustimmung: 600,
    material: 980,
  };
  const destX = [150, 375, 600, 825, 1050];
  const palette = {
    nahrung: '#7cb586',
    material: '#d79a49',
    wissen: '#78b0c4',
    volk: '#d9ceb8',
    zustimmung: '#c9a55c',
  };

  resList.forEach((r, idx) => {
    const sx = sourceX[r.key] ?? destX[idx];
    const dx = destX[idx];
    const col = palette[r.key] ?? '#d79a49';
    const inc = fc.income?.[r.key] ?? (r.netto > 0 ? r.netto : 0);
    const out = (fc.consumption?.[r.key] ?? 0) + (fc.upkeep?.[r.key] ?? 0);
    const inWidth = Math.max(2.5, Math.min(26, 3 + inc * 3.5));
    const outWidth = out > 0 ? Math.max(2, Math.min(20, 2 + out * 3)) : 0;

    // Main alluvial inflow ribbon from labour horizon (y=0) to vessel peg (y=182)
    svg.append(svgEl('path', {
      d: `M ${sx} 4 C ${sx} 88, ${dx} 92, ${dx} 182`,
      fill: 'none',
      stroke: col,
      'stroke-width': inWidth,
      'stroke-opacity': '0.42',
      'stroke-linecap': 'round',
    }));
    svg.append(svgEl('path', {
      d: `M ${sx} 4 C ${sx} 88, ${dx} 92, ${dx} 182`,
      fill: 'none',
      stroke: col,
      'stroke-width': 1.6,
      'stroke-opacity': '0.88',
    }));

    // Consumption/upkeep outflow branch
    if (outWidth > 0) {
      const branchX = dx + 56;
      svg.append(svgEl('path', {
        d: `M ${(sx + dx) / 2} 92 C ${dx + 14} 118, ${branchX - 8} 136, ${branchX} 158`,
        fill: 'none',
        stroke: '#c96b53',
        'stroke-width': outWidth,
        'stroke-opacity': '0.46',
        'stroke-linecap': 'round',
      }));
      svg.append(svgEl('text', {
        x: branchX + 6, y: 162,
        fill: '#d8826c',
        'font-size': '12',
        'font-weight': '600',
        text: `−${out}`,
      }));
    }

    if (inc > 0) {
      svg.append(svgEl('text', {
        x: (sx + dx) / 2 - 12, y: 82,
        'text-anchor': 'end',
        fill: col,
        'font-size': '12',
        'font-weight': '600',
        text: `+${inc}`,
      }));
    }

    const pegY = 205;
    svg.append(svgEl('line', {
      x1: dx - 54, y1: pegY, x2: dx + 54, y2: pegY,
      stroke: col, 'stroke-width': 2, 'stroke-opacity': '0.65',
    }));

    const netStr = r.netto !== 0 ? signed(r.netto) : '±0';
    const netCol = r.mangel > 0 || r.netto < 0 ? '#d8826c' : r.netto > 0 ? '#82b889' : 'rgba(235,228,212,0.5)';

    svg.append(svgEl('text', {
      x: dx - 6, y: pegY + 34,
      'text-anchor': 'end',
      fill: '#ebe4d4',
      'font-size': '28',
      'font-weight': '700',
      text: r.key === 'zustimmung' && r.wert > 0 ? `+${r.wert}` : String(r.wert),
    }));
    svg.append(svgEl('text', {
      x: dx + 4, y: pegY + 31,
      'text-anchor': 'start',
      fill: netCol,
      'font-size': '14',
      'font-weight': '600',
      text: netStr,
    }));

    if (r.key === 'zustimmung') {
      // Discrete -5 .. +5 balance scale (0 is dead center)
      const w = 96;
      const x0 = dx - w / 2;
      const clamped = Math.max(-5, Math.min(5, r.wert));
      const pos = x0 + ((clamped + 5) / 10) * w;
      svg.append(svgEl('line', {
        x1: x0, y1: pegY + 56, x2: x0 + w, y2: pegY + 56,
        stroke: 'rgba(235,228,212,0.22)', 'stroke-width': 3, 'stroke-linecap': 'round',
      }));
      svg.append(svgEl('line', {
        x1: dx, y1: pegY + 48, x2: dx, y2: pegY + 64,
        stroke: 'rgba(235,228,212,0.45)', 'stroke-width': 1.2,
      }));
      svg.append(svgEl('circle', {
        cx: pos, cy: pegY + 56, r: 6,
        fill: col, stroke: '#111615', 'stroke-width': 1.5,
      }));
    } else if (r.key === 'volk') {
      const cap = Math.max(r.wert, r.cap ?? 6, 6);
      const startX = dx - ((cap - 1) * 14) / 2;
      for (let i = 0; i < cap; i++) {
        const active = i < r.wert;
        svg.append(svgEl('circle', {
          cx: startX + i * 14, cy: pegY + 56, r: 4.8,
          fill: active ? col : 'none',
          stroke: active ? col : 'rgba(235,228,212,0.25)',
          'stroke-width': 1.4,
        }));
      }
    } else {
      const cap = Math.min(20, Math.max(r.wert, r.cap ?? 12, 10));
      const cols = 10;
      const bw = 7;
      const bh = 9;
      const gap = 3;
      const rowW = cols * (bw + gap) - gap;
      const x0 = dx - rowW / 2;
      for (let i = 0; i < cap; i++) {
        const c = i % cols;
        const row = Math.floor(i / cols);
        const filled = i < r.wert;
        svg.append(svgEl('rect', {
          x: x0 + c * (bw + gap),
          y: pegY + 48 + row * (bh + gap),
          width: bw,
          height: bh,
          rx: 1.5,
          fill: filled ? col : 'rgba(235,228,212,0.06)',
          stroke: filled ? 'none' : 'rgba(235,228,212,0.18)',
          'stroke-width': 0.8,
        }));
      }
    }

    svg.append(svgEl('text', {
      x: dx, y: pegY + 88,
      'text-anchor': 'middle',
      fill: 'rgba(235,228,212,0.64)',
      'font-size': '12',
      'letter-spacing': '0.06em',
      text: r.name,
    }));
  });

  for (const dx of destX) {
    svg.append(svgEl('path', {
      d: `M ${dx} 305 C ${dx} 328, 600 328, 600 348`,
      fill: 'none',
      stroke: 'rgba(235,228,212,0.12)',
      'stroke-width': 1,
    }));
  }

  host.replaceChildren(svg);
}

// --- IV. TOPOGRAPHISCHE 5-PASS-WELTKARTE ---------------------------------------
function renderHexActions(game, model) {
  const bar = document.getElementById('strom-ort-aktionen');
  const sel = model.selection;
  if (!sel || !Number.isInteger(sel.q) || !Number.isInteger(sel.r)) {
    bar.replaceChildren();
    return;
  }
  const opts = game.optionsFor(sel) ?? [];
  const pills = opts.slice(0, 5).map((opt) => {
    const costStr = (opt.kosten ?? []).map((c) => `${c.menge}`).join('·');
    return el('button', {
      type: 'button',
      class: 'ort-aktion-sigil',
      disabled: Boolean(opt.grund),
      title: opt.grund || opt.titel,
      onclick: () => {
        if (opt.grund) return;
        game.addOption(opt);
      },
    },
    icon(opt.icon || 'pfeil', { size: 15 }),
    el('span', { text: opt.titel }),
    costStr ? el('strong', { text: `−${costStr}` }) : null);
  });
  bar.replaceChildren(...pills);
}

function initMapStratum(game, model) {
  const canvas = document.getElementById('karte');
  const selectHex = (h) => {
    if (!h) {
      model.selection = null;
      return;
    }
    const { units, places } = objectsAt(model, h.q, h.r);
    const unit = units.find((u) => u.volk === 'spieler') ?? units[0];
    if (unit) model.selection = { kind: 'unit', id: unit.id, q: h.q, r: h.r };
    else if (places[0]) model.selection = { kind: 'place', id: places[0].id, q: h.q, r: h.r };
    else model.selection = { kind: 'tile', q: h.q, r: h.r };
  };
  const mapView = new MapView(canvas, model, {
    onSelect: (h) => {
      selectHex(h);
      mapView.markSelected();
      renderHexActions(game, model);
    },
    onHover: (h) => {
      model.hover = h;
    },
  });

  const layerHost = document.getElementById('strom-ebenen');
  const layerIcons = { gelaende: 'gelaende', besitz: 'besitz', bedrohung: 'bedrohung', handel: 'handel' };
  const updateLayers = () => {
    for (const btn of layerHost.querySelectorAll('button')) {
      btn.setAttribute('aria-checked', String(btn.dataset.layer === model.layer));
    }
  };
  layerHost.replaceChildren(...LAYERS.map((l) => el('button', {
    type: 'button',
    role: 'radio',
    class: 'strom-sigil-btn',
    'data-layer': l,
    'aria-checked': String(model.layer === l),
    'aria-label': t(`board.layer.${l}`, l),
    title: t(`board.layer.${l}`, l),
    onclick: () => {
      model.layer = l;
      updateLayers();
      mapView.changed();
    },
  }, icon(layerIcons[l], { size: 17 }))));

  const zoomHost = document.getElementById('strom-zoom');
  zoomHost.replaceChildren(
    el('button', {
      type: 'button', class: 'strom-sigil-btn', 'aria-label': t('board.zoom.in'), title: t('board.zoom.in'),
      onclick: () => mapView.zoomAt(1.25),
    }, icon('plus', { size: 16 })),
    el('button', {
      type: 'button', class: 'strom-sigil-btn', 'aria-label': t('board.zoom.out'), title: t('board.zoom.out'),
      onclick: () => mapView.zoomAt(0.8),
    }, icon('minus', { size: 16 })),
    el('button', {
      type: 'button', class: 'strom-sigil-btn', 'aria-label': t('board.zoom.home'), title: t('board.zoom.home'),
      onclick: () => {
        if (model.home) mapView.flyTo(model.home.q, model.home.r);
        else mapView.fitKnown();
      },
    }, icon('lager', { size: 16 })),
  );

  requestAnimationFrame(() => {
    mapView.fitKnown();
    if (model.home) mapView.flyTo(model.home.q, model.home.r);
  });

  return mapView;
}

// --- V. RATS-WAAGE & BESTIMMUNGS-KONSTELLATION ---------------------------------
function renderRatUndBestimmung(game, model) {
  const host = document.getElementById('viz-rat');
  const rat = model.rat ?? [];
  const ms = model.bestimmung?.meilensteine ?? [];

  const svg = svgEl('svg', { viewBox: '0 0 1200 320', class: 'strom-svg', role: 'img', 'aria-label': t('board.council.bar') });

  // Left half (x = 70..540): Council Loyalty Balance Scales (-5 ─── 0 ─── +5)
  const roleColors = ['#d79a49', '#7cb586', '#78b0c4'];
  rat.forEach((m, i) => {
    const y = 78 + i * 82;
    const x0 = 135;
    const x1 = 515;
    const w = x1 - x0;
    const val = Math.max(-5, Math.min(5, m.loyalitaet ?? 0));
    const px = x0 + ((val + 5) / 10) * w;
    const midX = x0 + 0.5 * w;
    const col = roleColors[i % roleColors.length];

    // Axis line and discrete integer ticks from -5 to +5
    svg.append(svgEl('line', {
      x1: x0, y1: y, x2: x1, y2: y,
      stroke: 'rgba(235,228,212,0.18)', 'stroke-width': 2,
    }));
    for (let step = -5; step <= 5; step++) {
      const tx = x0 + ((step + 5) / 10) * w;
      const isZero = step === 0;
      svg.append(svgEl('line', {
        x1: tx, y1: y - (isZero ? 8 : 4), x2: tx, y2: y + (isZero ? 8 : 4),
        stroke: isZero ? 'rgba(235,228,212,0.48)' : 'rgba(235,228,212,0.18)',
        'stroke-width': isZero ? 1.5 : 1,
      }));
    }

    // Active bar from 0 (neutral midpoint) to current loyalty
    svg.append(svgEl('line', {
      x1: Math.min(midX, px), y1: y, x2: Math.max(midX, px), y2: y,
      stroke: col, 'stroke-width': 5, 'stroke-linecap': 'round',
    }));

    // Left medallion (x = 82)
    svg.append(svgEl('circle', {
      cx: 82, cy: y, r: 22,
      fill: '#161f1e', stroke: col, 'stroke-width': m.leader ? 2.4 : 1.5,
    }));
    svg.append(svgEl('text', {
      x: 82, y: y + 5,
      'text-anchor': 'middle',
      fill: col,
      'font-family': FONT_WORLD,
      'font-size': '15',
      'font-weight': '700',
      text: m.leader ? '♛' : i === 1 ? '⚘' : '🧭',
    }));

    // Member name & band label
    svg.append(svgEl('text', {
      x: x0, y: y - 14,
      fill: '#ebe4d4',
      'font-size': '13',
      'font-weight': '600',
      text: m.name,
    }));
    svg.append(svgEl('text', {
      x: x1, y: y - 14,
      'text-anchor': 'end',
      fill: 'rgba(235,228,212,0.48)',
      'font-size': '11',
      text: m.band,
    }));

    // Position node on the loyalty scale + signed raw value (+4, +1, +2)
    svg.append(svgEl('circle', {
      cx: px, cy: y, r: 13,
      fill: '#141c1b', stroke: col, 'stroke-width': 2.2,
    }));
    svg.append(svgEl('text', {
      x: px, y: y + 4,
      'text-anchor': 'middle',
      fill: '#ebe4d4',
      'font-size': '11.5',
      'font-weight': '700',
      text: val > 0 ? `+${val}` : String(val),
    }));
  });

  // Right half (x = 660..1130): Destiny Constellation (3 Milestone Rings, no percentages)
  const nodes = [
    { x: 740, y: 185 },
    { x: 900, y: 95 },
    { x: 1060, y: 185 },
  ];

  svg.append(svgEl('path', {
    d: `M ${nodes[0].x} ${nodes[0].y} L ${nodes[1].x} ${nodes[1].y} L ${nodes[2].x} ${nodes[2].y} Z`,
    fill: 'rgba(215,154,73,0.03)',
    stroke: 'rgba(215,154,73,0.24)',
    'stroke-width': 1.2,
    'stroke-dasharray': '4 5',
  }));

  ms.slice(0, 3).forEach((m, i) => {
    const pt = nodes[i] ?? { x: 740 + i * 150, y: 150 };
    const done = m.erreicht ? (m.fortschritt?.ziel ?? 1) : (m.fortschritt?.wert ?? 0);
    const total = m.fortschritt?.ziel ?? 1;
    const color = m.erreicht ? '#82b889' : '#d79a49';

    svg.append(svgEl('circle', {
      cx: pt.x, cy: pt.y, r: 34,
      fill: '#131a19',
      stroke: 'rgba(235,228,212,0.08)',
      'stroke-width': 1,
    }));

    svg.append(segmentedRing(pt.x, pt.y, 38, done, total, color, 'rgba(235,228,212,0.14)', 5));

    svg.append(svgEl('text', {
      x: pt.x, y: pt.y + 6,
      'text-anchor': 'middle',
      fill: m.erreicht ? '#82b889' : '#ebe4d4',
      'font-size': '18',
      'font-weight': '700',
      text: `${done}/${total}`,
    }));

    svg.append(svgEl('text', {
      x: pt.x, y: pt.y + 62,
      'text-anchor': 'middle',
      fill: 'rgba(235,228,212,0.68)',
      'font-size': '12',
      text: m.einheit ?? m.id,
    }));
  });

  if (model.bestimmung?.name) {
    svg.append(svgEl('text', {
      x: 900, y: 278,
      'text-anchor': 'middle',
      fill: 'rgba(215,154,73,0.85)',
      'font-family': FONT_WORLD,
      'font-style': 'italic',
      'font-size': '15',
      'letter-spacing': '0.05em',
      text: model.bestimmung.name,
    }));
  }

  host.replaceChildren(svg);
}

// --- VI. PRAXIS-WURZELN & WISSENS-BAUM -----------------------------------------
function renderWissen(game, model) {
  const host = document.getElementById('viz-wissen');
  const ent = model.entwicklungen ?? { praxis: [], bekannt: [], forschung: [], vorschlaege: [] };

  const svg = svgEl('svg', { viewBox: '0 0 1200 460', class: 'strom-svg', role: 'img', 'aria-label': t('board.paths.title') });

  const praxis = ent.praxis.slice(0, 6);
  const bekannt = ent.bekannt.slice(0, 6);
  const byRef = new Map();
  for (const r of ent.forschung) byRef.set(r.ref, r);
  for (const c of ent.vorschlaege) {
    if (!byRef.has(c.ref)) byRef.set(c.ref, { ...c, fortschritt: 0 });
  }
  const krone = [...byRef.values()].slice(0, 5);

  const activeResearchOrder = (game.draft.orders ?? []).find((o) => o.type === 'research.assign');
  const activeResearchRef = activeResearchOrder?.params?.development ?? ent.forschung[0]?.ref ?? null;

  const posX = (count, idx, pad = 135) => {
    if (count <= 1) return 600;
    const span = 1200 - pad * 2;
    return pad + (idx / (count - 1)) * span;
  };

  const rootPos = new Map();
  const rootArr = [];
  praxis.forEach((p, i) => {
    const entry = { x: posX(praxis.length, i, 145), y: 382, p };
    rootPos.set(p.id, entry);
    rootArr.push(entry);
  });

  const trunkPos = bekannt.map((b, i) => ({ x: posX(bekannt.length, i, 125), y: 230, b }));
  const crownPos = krone.map((k, i) => ({ x: posX(krone.length, i, 185), y: 86, k }));

  // 1. Draw root-to-trunk filaments matching development tags to practice roots
  trunkPos.forEach((tp, idx) => {
    const matchingRoots = (tp.b.tags ?? []).map((tag) => rootPos.get(`praxis:${tag}`)).filter(Boolean);
    const chosenRoots = matchingRoots.length
      ? matchingRoots.slice(0, 2)
      : rootArr.length ? [rootArr[idx % rootArr.length]] : [];
    for (const rNode of chosenRoots) {
      svg.append(svgEl('path', {
        d: `M ${rNode.x} ${rNode.y - 20} C ${rNode.x} 308, ${tp.x} 304, ${tp.x} ${tp.y + 24}`,
        fill: 'none',
        stroke: 'rgba(124, 181, 134, 0.3)',
        'stroke-width': 1.8,
      }));
    }
  });

  // 2. Draw trunk-to-crown branches
  crownPos.forEach((cp, idx) => {
    const tNode = trunkPos.length ? trunkPos[idx % trunkPos.length] : { x: 600, y: 230 };
    const isTarget = cp.k.ref === activeResearchRef;
    svg.append(svgEl('path', {
      d: `M ${tNode.x} ${tNode.y - 22} C ${tNode.x} 158, ${cp.x} 155, ${cp.x} ${cp.y + 32}`,
      fill: 'none',
      stroke: isTarget ? 'rgba(120, 176, 196, 0.7)' : 'rgba(120, 176, 196, 0.24)',
      'stroke-width': isTarget ? 2.4 : 1.3,
      'stroke-dasharray': isTarget ? 'none' : '4 5',
    }));
  });

  // 3. Render Root Nodes (Praxis Tags + Weight)
  for (const { x, y, p } of rootArr) {
    const r = Math.max(15, Math.min(26, 12 + p.gewicht * 1.4));
    svg.append(svgEl('circle', {
      cx: x, cy: y, r,
      fill: '#15201c',
      stroke: '#7cb586',
      'stroke-width': 1.8,
    }));
    svg.append(svgEl('text', {
      x, y: y + 5,
      'text-anchor': 'middle',
      fill: '#ebe4d4',
      'font-size': '14',
      'font-weight': '700',
      text: String(p.gewicht),
    }));
    svg.append(svgEl('text', {
      x, y: y + r + 18,
      'text-anchor': 'middle',
      fill: 'rgba(235,228,212,0.62)',
      'font-size': '11.5',
      text: p.name,
    }));
  }

  // 4. Render Trunk Nodes (Known Developments — two-line labels, no ellipsis truncation)
  for (const { x, y, b } of trunkPos) {
    const col = b.eingesetzt ? '#e2b25e' : '#82b889';
    svg.append(svgEl('circle', {
      cx: x, cy: y, r: 22,
      fill: '#161e1d',
      stroke: col,
      'stroke-width': b.eingesetzt ? 2.5 : 1.6,
    }));
    svg.append(svgEl('text', {
      x, y: y + 5,
      'text-anchor': 'middle',
      fill: col,
      'font-size': '13',
      'font-weight': '700',
      text: b.kurz?.wert ?? '✓',
    }));
    svg.append(svgTwoLineText(x, y + 36, b.name, 16, {
      fill: '#ebe4d4',
      'font-size': '11',
      'font-weight': '500',
    }));
  }

  // 5. Render Crown Nodes (Research & Candidates — clickable to assign research)
  for (const { x, y, k } of crownPos) {
    const done = k.fortschritt ?? 0;
    const total = k.dauer ?? 6;
    const isTarget = k.ref === activeResearchRef;
    const col = isTarget ? '#78b0c4' : '#d79a49';

    const g = svgEl('g', {
      class: 'svg-klickbar',
      role: 'button',
      tabindex: '0',
      'aria-label': `${k.name} (${done}/${total})`,
      onclick: () => {
        const opt = game.previewOption({ type: 'research.assign', params: { development: k.ref } });
        if (!opt.grund) game.addOption(opt);
      },
    });

    g.append(svgEl('circle', {
      cx: x, cy: y, r: 25,
      fill: isTarget ? '#17262c' : '#141b1a',
      stroke: isTarget ? col : 'rgba(235,228,212,0.16)',
      'stroke-width': isTarget ? 2 : 1,
    }));
    g.append(segmentedRing(x, y, 29, done, total, col, 'rgba(235,228,212,0.14)', 4));
    g.append(svgEl('text', {
      x, y: y + 5,
      'text-anchor': 'middle',
      fill: '#ebe4d4',
      'font-size': '13',
      'font-weight': '700',
      text: `${done}/${total}`,
    }));
    g.append(svgTwoLineText(x, y - 46, k.name, 18, {
      fill: isTarget ? '#9ad0e4' : 'rgba(235,228,212,0.75)',
      'font-size': '11.5',
      'font-weight': isTarget ? '600' : '400',
    }));

    svg.append(g);
  }

  host.replaceChildren(svg);
}

// --- VII. STRATIGRAPHISCHE ZEITSPUR & ZUG-SIEGEL -------------------------------
function randomDieRoll() {
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0] >= 4294967290);
  return (buf[0] % 10) + 1;
}

function syncStromRolls(game, model) {
  const probes = game.base?.probes ?? [];
  const rolls = game.draft?.rolls ?? {};
  const stale = new Set(
    (game.base?.issues ?? [])
      .filter((i) => i.code === 'roll_stale')
      .map((i) => i.path.replace('/rolls/', '')),
  );

  for (const o of model.orders ?? []) {
    const p = probes.find((x) => x.order === o.id) ?? (typeof o.probe === 'string' ? probes.find((x) => x.id === o.probe) : null);
    if (p) {
      const r = rolls[p.id];
      const hasValidRoll = Boolean(r && !stale.has(p.id));
      o.probe = {
        id: p.id,
        ziel: p.target,
        mod: p.modTotal ?? 0,
        wurf: hasValidRoll ? r.value : null,
      };
    } else if (o.probe && typeof o.probe === 'object') {
      // keep existing object if already enriched
    } else {
      o.probe = null;
    }
  }

  const worldProbe = probes.find((x) => x.target == null && x.roller === 'player');
  if (worldProbe) {
    const wr = rolls[worldProbe.id];
    const hasValidWorldRoll = Boolean(wr && !stale.has(worldProbe.id));
    model.weltwurf = {
      id: worldProbe.id,
      offen: !hasValidWorldRoll,
      wurf: hasValidWorldRoll ? wr.value : null,
    };
  } else {
    model.weltwurf = null;
  }

  const blockers = game.blockers ? game.blockers() : { probleme: [] };
  model.probleme = blockers.probleme ?? [];
}

function renderZeitspur(game, model, historyReports) {
  syncStromRolls(game, model);
  const host = document.getElementById('viz-zeit');
  const currentTurn = game.view.turn;
  const rowsCount = currentTurn + 1;
  const rowH = 92;
  const svgH = 80 + rowsCount * rowH + 90;

  const svg = svgEl('svg', { viewBox: `0 0 1200 ${svgH}`, class: 'strom-svg', role: 'img', 'aria-label': t('season.title') });

  const currentRes = game.view.peoples[game.pid].resources ?? {};
  const seriesKeys = [
    { key: RULES.food, color: '#7cb586', xBase: 210 },
    { key: RULES.material, color: '#d79a49', xBase: 310 },
    { key: 'wissen', color: '#78b0c4', xBase: 410 },
  ];

  const stocksByTurn = Array.from({ length: rowsCount }, () => ({}));
  stocksByTurn[currentTurn] = { ...currentRes };
  for (let tIdx = currentTurn - 1; tIdx >= 0; tIdx--) {
    const nextStocks = { ...stocksByTurn[tIdx + 1] };
    const rep = historyReports[tIdx];
    for (const ev of rep?.events ?? []) {
      if (ev.target?.kind === 'people' && ev.target?.id === game.pid && ev.change?.field?.startsWith('resources.') && Number.isInteger(ev.change.delta)) {
        const k = ev.change.field.slice('resources.'.length);
        nextStocks[k] = (nextStocks[k] ?? 0) - ev.change.delta;
      }
    }
    stocksByTurn[tIdx] = nextStocks;
  }

  for (const s of seriesKeys) {
    const pts = [];
    for (let tIdx = 0; tIdx < rowsCount; tIdx++) {
      const val = Math.max(0, stocksByTurn[tIdx][s.key] ?? 0);
      const x = s.xBase + Math.min(45, val * 3.2);
      const y = 65 + tIdx * rowH;
      pts.push([x, y, val]);
    }
    if (pts.length > 1) {
      const d = pts.map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`)).join(' ');
      svg.append(svgEl('path', {
        d, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-opacity': '0.75',
      }));
    }
    for (const [x, y, val] of pts) {
      svg.append(svgEl('circle', { cx: x, cy: y, r: 4.5, fill: s.color }));
      svg.append(svgEl('text', {
        x: x - 9, y: y + 4,
        'text-anchor': 'end',
        fill: s.color,
        'font-size': '11',
        'font-weight': '700',
        text: String(val),
      }));
    }
  }

  for (let tIdx = 0; tIdx < rowsCount; tIdx++) {
    const y = 65 + tIdx * rowH;
    const cal = calendarOf(game.env.regeln, tIdx);
    const isNow = tIdx === currentTurn;
    const rep = historyReports[tIdx];

    svg.append(svgEl('line', {
      x1: 80, y1: y, x2: 1120, y2: y,
      stroke: isNow ? 'rgba(215,154,73,0.4)' : 'rgba(235,228,212,0.09)',
      'stroke-width': isNow ? 1.5 : 1,
    }));

    svg.append(svgEl('circle', {
      cx: 600, cy: y, r: isNow ? 22 : 16,
      fill: isNow ? '#1d2724' : '#131a19',
      stroke: isNow ? '#d79a49' : 'rgba(235,228,212,0.32)',
      'stroke-width': isNow ? 2.4 : 1.4,
    }));
    svg.append(svgEl('text', {
      x: 600, y: y + 5,
      'text-anchor': 'middle',
      fill: isNow ? '#e7b96b' : '#ebe4d4',
      'font-family': FONT_WORLD,
      'font-size': isNow ? '14' : '12',
      'font-weight': '700',
      text: ROMAN[tIdx] ?? String(tIdx + 1),
    }));

    svg.append(svgEl('text', {
      x: 95, y: y + 4,
      fill: isNow ? '#ebe4d4' : 'rgba(235,228,212,0.58)',
      'font-family': FONT_WORLD,
      'font-size': isNow ? '14' : '12',
      'font-weight': isNow ? '600' : '400',
      text: `${t(`season.${cal.season}`, cal.season)} ${cal.year}`,
    }));

    if (!isNow && rep?.sections) {
      const probes = rep.sections.probes ?? [];
      const draw = rep.sections.draws?.[game.pid];
      probes.forEach((pr, pIdx) => {
        const px = 685 + pIdx * 135;
        const ok = pr.band && SUCCESS_BANDS.includes(pr.band);
        const crit = pr.band === 'crit_success';
        const col = crit ? '#e2b25e' : ok ? '#7cb586' : '#c96b53';
        svg.append(dieGlyph(px, y, pr.roll, col));
        const modStr = pr.modTotal ? signed(pr.modTotal) : '';
        svg.append(svgEl('text', {
          x: px + 16, y: y - 2,
          fill: '#ebe4d4',
          'font-size': '12',
          'font-weight': '700',
          text: `${pr.roll}${modStr} ▸ ${pr.target}`,
        }));
        svg.append(svgEl('text', {
          x: px + 16, y: y + 12,
          fill: col,
          'font-size': '10.5',
          text: t(`order.${pr.kind}`, pr.kind),
        }));
      });
      if (draw?.roll) {
        const dx = 1085;
        svg.append(dieGlyph(dx, y, draw.roll, '#78b0c4'));
        svg.append(svgEl('text', {
          x: dx, y: y + 22,
          'text-anchor': 'middle',
          fill: 'rgba(120,176,196,0.85)',
          'font-size': '10',
          text: `${draw.roll}`,
        }));
      }
    } else if (isNow) {
      const orders = model.orders ?? [];
      orders.forEach((o, oIdx) => {
        const ox = 668 + oIdx * 140;
        const col = o.art === 'haupt' ? '#d79a49' : '#78b0c4';
        const g = svgEl('g', {
          class: 'svg-klickbar',
          role: 'button',
          tabindex: '0',
          'data-strom-remove-order': o.id,
          'aria-label': t.fmt('board.orders.withdraw', { title: o.titel }),
          title: `${o.titel} · ${o.ziel} ×`,
          onclick: () => game.removeOrder(o.id),
        });
        g.append(svgEl('circle', {
          cx: ox, cy: y - 10, r: 13,
          fill: '#182220', stroke: col, 'stroke-width': 2,
        }));
        g.append(svgEl('text', {
          x: ox, y: y - 6,
          'text-anchor': 'middle',
          fill: col,
          'font-size': '11',
          'font-weight': '700',
          text: o.art === 'haupt' ? 'H' : 'N',
        }));
        g.append(svgTwoLineText(ox, y + 16, o.titel, 14, {
          fill: '#ebe4d4',
          'font-size': '10.5',
        }));
        svg.append(g);

        if (o.probe) {
          const dx = ox + 36;
          const dy = y - 10;
          if (!Number.isInteger(o.probe.wurf)) {
            const rollNode = svgEl('g', {
              class: 'svg-klickbar strom-wuerfel-offen',
              role: 'button',
              tabindex: '0',
              'data-strom-roll-order': o.id,
              'aria-label': t.fmt('board.orders.roll', { title: o.titel }),
              onclick: () => game.rollOrder(o.id),
            });
            rollNode.append(svgEl('rect', {
              x: dx - 14, y: dy - 14, width: 64, height: 28, rx: 6,
              fill: 'rgba(20, 27, 26, 0.01)',
            }));
            rollNode.append(dieGlyph(dx, dy, 10, '#e7b96b'));
            rollNode.append(svgEl('text', {
              x: dx + 15, y: dy + 4,
              fill: '#e7b96b',
              'font-size': '11',
              'font-weight': '700',
              text: `▸ ${o.probe.ziel}`,
            }));
            svg.append(rollNode);
          } else {
            const rolledCol = o.wurf?.gut === false ? '#c96b53' : '#7cb586';
            const rolledNode = svgEl('g', {
              class: 'svg-klickbar',
              role: 'button',
              tabindex: '0',
              'data-strom-roll-order': o.id,
              'aria-label': t.fmt('board.orders.reroll', { title: o.titel }),
              onclick: () => game.rollOrder(o.id),
            });
            rolledNode.append(svgEl('rect', {
              x: dx - 14, y: dy - 14, width: 84, height: 28, rx: 6,
              fill: 'rgba(20, 27, 26, 0.01)',
            }));
            rolledNode.append(dieGlyph(dx, dy, o.probe.wurf, rolledCol));
            const modVal = o.probe.mod ?? 0;
            const modText = modVal ? signed(modVal) : '';
            rolledNode.append(svgEl('text', {
              x: dx + 15, y: dy + 4,
              fill: '#ebe4d4',
              'font-size': '11',
              'font-weight': '700',
              text: `${o.probe.wurf}${modText} ▸ ${o.probe.ziel}`,
            }));
            svg.append(rolledNode);
          }
        }
      });
    }
  }

  const sealY = svgH - 44;
  const mainUsed = model.slots?.main?.used ?? 0;
  const mainMax = model.slots?.main?.max ?? 1;
  const minorUsed = model.slots?.minor?.used ?? 0;
  const minorMax = model.slots?.minor?.max ?? 2;

  // World Event Roll sigil near the bottom seal (x = 430, y = sealY)
  if (model.weltwurf?.offen) {
    const ww = svgEl('g', {
      id: 'strom-weltwurf',
      class: 'svg-klickbar strom-wuerfel-offen',
      role: 'button',
      tabindex: '0',
      'aria-label': t('season.world-roll'),
      onclick: () => game.rollWorld(),
    });
    ww.append(svgEl('rect', {
      x: 260, y: sealY - 16, width: 186, height: 32, rx: 6,
      fill: 'rgba(20, 27, 26, 0.01)',
    }));
    ww.append(dieGlyph(430, sealY, 10, '#e7b96b'));
    ww.append(svgEl('text', {
      x: 414, y: sealY + 4,
      'text-anchor': 'end',
      fill: '#e7b96b',
      'font-size': '12',
      'font-weight': '600',
      text: `${t('ui.weltereignis')} · ${t('ui.wuerfeln')}`,
    }));
    svg.append(ww);
  } else if (Number.isInteger(model.weltwurf?.wurf)) {
    const ww = svgEl('g', {
      id: 'strom-weltwurf',
      class: 'svg-klickbar',
      role: 'button',
      tabindex: '0',
      'aria-label': t('season.world-roll'),
      onclick: () => game.rollWorld(),
    });
    ww.append(svgEl('rect', {
      x: 260, y: sealY - 16, width: 186, height: 32, rx: 6,
      fill: 'rgba(20, 27, 26, 0.01)',
    }));
    ww.append(dieGlyph(430, sealY, model.weltwurf.wurf, '#78b0c4'));
    ww.append(svgEl('text', {
      x: 414, y: sealY + 4,
      'text-anchor': 'end',
      fill: '#ebe4d4',
      'font-size': '12',
      'font-weight': '600',
      text: `${t('ui.weltereignis')} · ${model.weltwurf.wurf}`,
    }));
    svg.append(ww);
  }

  svg.append(svgEl('text', {
    x: 545, y: sealY + 5,
    'text-anchor': 'end',
    fill: 'rgba(235,228,212,0.68)',
    'font-size': '13',
    'font-weight': '600',
    text: `H ${mainUsed}/${mainMax}  ·  N ${minorUsed}/${minorMax}`,
  }));

  const readyToSeal = !model.weltwurf?.offen
    && !(model.orders ?? []).some((o) => o.probe && !Number.isInteger(o.probe.wurf))
    && (model.probleme ?? []).length === 0;
  const sealStroke = readyToSeal ? '#82b889' : '#d79a49';
  const sealFill = readyToSeal ? '#15251d' : '#231c12';

  const sealGroup = svgEl('g', {
    id: 'strom-zug-siegel',
    class: `svg-klickbar ${readyToSeal ? 'is-ready' : 'is-pending'}`,
    'data-ready-seal': String(readyToSeal),
    role: 'button',
    tabindex: '0',
    'aria-label': t('season.end'),
    onclick: async () => {
      if (model.weltwurf?.offen) {
        game.rollWorld();
        return;
      }
      const unrolled = (model.orders ?? []).find((o) => o.probe && !Number.isInteger(o.probe.wurf));
      if (unrolled) {
        game.rollOrder(unrolled.id);
        return;
      }
      if (game.view.phase === 'planning') {
        await game.endTurn();
        if (game.app?.demo && game.view.phase !== 'planning') {
          await game.withDraftBarrier(async () => {
            const cont = await server.continueDemo(game.cid, { expectTurn: game.view.turn, expectRev: game.view.rev });
            if (cont?.ok) {
              const freshView = await server.view(game.cid, game.pid).catch(() => null);
              if (freshView) {
                game.view = freshView;
                game.relabel();
              }
            }
          });
        }
      }
    },
  });
  sealGroup.append(svgEl('circle', {
    cx: 600, cy: sealY, r: 28,
    fill: sealFill,
    stroke: sealStroke,
    'stroke-width': 2.4,
  }));
  sealGroup.append(svgEl('circle', {
    cx: 600, cy: sealY, r: 22,
    fill: 'none',
    stroke: readyToSeal ? 'rgba(130,184,137,0.55)' : 'rgba(215,154,73,0.45)',
    'stroke-width': 1,
    'stroke-dasharray': readyToSeal ? 'none' : '3 3',
  }));
  sealGroup.append(svgEl('text', {
    x: 600, y: sealY + 6,
    'text-anchor': 'middle',
    fill: readyToSeal ? '#82b889' : '#e7b96b',
    'font-size': '18',
    text: readyToSeal ? '✦' : '🎲',
  }));
  svg.append(sealGroup);

  const sealStatusText = model.weltwurf?.offen || (model.orders ?? []).some((o) => o.probe && !Number.isInteger(o.probe.wurf))
    ? `${t('ui.wuerfeln')} · ${t('season.end')}`
    : t('season.end');

  svg.append(svgEl('text', {
    x: 650, y: sealY + 5,
    'text-anchor': 'start',
    fill: sealStroke,
    'font-family': FONT_WORLD,
    'font-size': '14',
    'letter-spacing': '0.05em',
    text: sealStatusText,
  }));

  host.replaceChildren(svg);
}

// --- BOOTSTRAP & LIVE UPDATES --------------------------------------------------
function installScrollSpy() {
  const links = [...document.querySelectorAll('.strom-anker .strom-punkt[href^="#"]')];
  const sections = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const obs = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        const id = `#${e.target.id}`;
        for (const a of links) a.classList.toggle('is-active', a.getAttribute('href') === id);
      }
    }
  }, { rootMargin: '-35% 0px -45% 0px' });
  for (const s of sections) obs.observe(s);
}

async function loadTurnHistory(cid, currentTurn) {
  const reports = [];
  for (let i = 0; i < currentTurn; i++) {
    try {
      const rep = await server.report(cid, turnStem(i));
      reports.push(rep);
    } catch {
      reports.push(null);
    }
  }
  return reports;
}

if (!server.appInfo) server.appInfo = () => server.app();
if (!server.continueDemo) {
  server.continueDemo = (cid, { expectTurn, expectRev } = {}) => server.demoTurn(cid, expectTurn, expectRev);
}

applyStatic();
const params = new URLSearchParams(location.search);
const model = {
  selection: null, hover: null, layer: 'gelaende', preview: null, panel: null,
  highlights: [], orders: [], meldungen: [], chronik: [], zz: null,
};

let game;
try {
  game = await createGame(model, { cid: params.get('campaign') });
} catch (err) {
  console.error(err);
}

if (game) {
  const appInfo = game.app ?? (await server.appInfo().catch(() => null));
  game.app = appInfo;

  game.rollOrder = (orderId) => {
    const p = (game.base?.probes ?? []).find((x) => x.order === orderId);
    if (!p) return false;
    return game.roll(p.id, randomDieRoll(), p.fingerprint);
  };

  game.rollWorld = () => {
    const p = (game.base?.probes ?? []).find((x) => x.target == null && x.roller === 'player');
    if (!p) return false;
    return game.roll(p.id, randomDieRoll(), p.fingerprint);
  };

  game.endTurn = async () => {
    for (const c of game.view.pendingChoices ?? []) {
      if (!game.draft.choices?.[c.id] && c.options?.length) {
        game.setChoice(c.id, c.options[0]);
      }
    }
    const res = await game.seal();
    if (res?.ok) {
      game.view = {
        ...game.view,
        phase: res.phase ?? 'resolving',
        ...(Number.isInteger(res.rev) ? { rev: res.rev } : {}),
      };
    }
    return res;
  };

  document.getElementById('strom-zurueck').href = `/spielbrett/?campaign=${encodeURIComponent(game.cid)}`;
  let historyReports = await loadTurnHistory(game.cid, game.view.turn);
  const mapView = initMapStratum(game, model);

  let activeProto = ['strom', 'astrolabium', 'naturgemaelde', 'webstuhl'].includes(params.get('proto'))
    ? params.get('proto')
    : 'strom';

  const weltenstromEl = document.getElementById('weltenstrom');
  const protoStageEl = document.getElementById('proto-stage');
  const stromAnkerEl = document.getElementById('strom-anker');
  const protoTabs = [...document.querySelectorAll('#proto-dock .proto-tab[data-proto]')];

  const syncProtoVisibility = () => {
    for (const tab of protoTabs) {
      tab.classList.toggle('is-active', tab.dataset.proto === activeProto);
    }
    const isStrom = activeProto === 'strom';
    if (weltenstromEl) weltenstromEl.hidden = !isStrom;
    if (protoStageEl) protoStageEl.hidden = isStrom;
    for (const a of stromAnkerEl?.querySelectorAll('.strom-punkt[href^="#"]') ?? []) {
      a.hidden = !isStrom;
    }
  };

  const renderAll = () => {
    syncProtoVisibility();
    if (activeProto === 'astrolabium' && protoStageEl) {
      renderAstrolabium(protoStageEl, game, model, historyReports);
      return;
    }
    if (activeProto === 'naturgemaelde' && protoStageEl) {
      renderNaturgemaelde(protoStageEl, game, model, historyReports);
      return;
    }
    if (activeProto === 'webstuhl' && protoStageEl) {
      renderWebstuhl(protoStageEl, game, model);
      return;
    }
    renderHimmel(game, model);
    renderDiorama(game, model);
    renderFluesse(game, model);
    renderHexActions(game, model);
    mapView.changed();
    renderRatUndBestimmung(game, model);
    renderWissen(game, model);
    renderZeitspur(game, model, historyReports);
  };

  for (const tab of protoTabs) {
    tab.addEventListener('click', () => {
      activeProto = tab.dataset.proto || 'strom';
      const nextUrl = new URL(location.href);
      if (activeProto === 'strom') nextUrl.searchParams.delete('proto');
      else nextUrl.searchParams.set('proto', activeProto);
      history.replaceState(null, '', nextUrl);
      renderAll();
    });
  }

  renderAll();
  installScrollSpy();
  onLanguage(() => {
    game.relabel();
    renderAll();
  });
  window.addEventListener('resize', () => {
    if (activeProto === 'strom') renderDiorama(game, model);
  });
  game.onUpdate(async (kind) => {
    if (kind === 'view') {
      historyReports = await loadTurnHistory(game.cid, game.view.turn);
    }
    renderAll();
  });
  window.weltenstrom = {
    game,
    model,
    mapView,
    setProto: (p) => {
      activeProto = p;
      renderAll();
    },
    continueDemo: async (expectTurn, expectRev) => {
      await server.continueDemo(game.cid, { expectTurn, expectRev });
      await game.reload?.();
    },
  };
  document.documentElement.dataset.ready = 'true';
}

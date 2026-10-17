// Interactive Visualization Prototypes for RealmCraft (strom.html):
//   1. 'strom'          — I · Weltenstrom (Vertical 7-Stratum Alluvial Scroll)
//   2. 'astrolabium'    — II · Runden-Uhrwerk / Astrolabium (Generalized 4-Phase Clockwise Turn Interface)
//   3. 'naturgemaelde'  — III · Humboldt-Naturgemälde (Topographic Elevation Cross-Section & Core Sample)
//   4. 'webstuhl'       — IV · Kräfte-Webstuhl (Cybernetic Warp-and-Weft Causal Matrix)

import { calendarOf } from './data/kernel.js';
import { objectsAt, regionName } from './data/adapter.js';
import { tileAt } from '/engine/world/index.js';
import { RULES } from '../../engine/core/rules.js';
import { drawCommunity, COMMUNITY_SIZE } from './community/scene.js';
import { el, svg as svgEl, signed } from './dom.js';
import { t } from './i18n/index.js';

const FONT_WORLD = 'var(--font-world)';
const SEASON_ORDER = ['fruehling', 'sommer', 'herbst', 'winter'];
const SEASON_SCENE = { fruehling: 'spring', sommer: 'summer', herbst: 'autumn', winter: 'winter' };

const RES_PALETTE = {
  nahrung:    { color: '#82b889', glyph: '🌾' },
  material:   { color: '#d79a49', glyph: '⚒' },
  wissen:     { color: '#78b0c4', glyph: '✦' },
  volk:       { color: '#d9ceb8', glyph: '⛺' },
  zustimmung: { color: '#c9a55c', glyph: '⚖' },
};

const TERRAIN_ELEV = {
  hochgebirge: { elev: 0.92, col: '#7d7770', band: 'V' },
  gebirge:     { elev: 0.82, col: '#8c7a66', band: 'IV' },
  berg:        { elev: 0.78, col: '#8c7a66', band: 'IV' },
  geroell:     { elev: 0.68, col: '#8b7b62', band: 'IV' },
  hochland:    { elev: 0.62, col: '#8d8258', band: 'III' },
  huegel:      { elev: 0.56, col: '#828756', band: 'III' },
  wald:        { elev: 0.46, col: '#4e7352', band: 'II' },
  steppe:      { elev: 0.38, col: '#a68c56', band: 'II' },
  ebene:       { elev: 0.34, col: '#798c58', band: 'II' },
  weide:       { elev: 0.36, col: '#7e945a', band: 'II' },
  acker:       { elev: 0.30, col: '#b59752', band: 'II' },
  wueste:      { elev: 0.28, col: '#c4985a', band: 'II' },
  oase:        { elev: 0.24, col: '#4e8f7d', band: 'I' },
  moor:        { elev: 0.20, col: '#546b5e', band: 'I' },
  sumpf:       { elev: 0.18, col: '#4c695e', band: 'I' },
  auen:        { elev: 0.22, col: '#5c876c', band: 'I' },
  fluss:       { elev: 0.15, col: '#48798f', band: 'I' },
  see:         { elev: 0.12, col: '#3e6e85', band: 'I' },
  kueste:      { elev: 0.10, col: '#3a667c', band: 'I' },
  meer:        { elev: 0.05, col: '#2b4d63', band: '0' },
};

function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad), rad };
}

function arcPath(cx, cy, r, startDeg, endDeg) {
  const span = Math.max(0.5, Math.min(359.5, endDeg - startDeg));
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, startDeg + span);
  const large = span > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

function sectorPath(cx, cy, rInner, rOuter, startDeg, endDeg) {
  const sOut = polar(cx, cy, rOuter, startDeg);
  const eOut = polar(cx, cy, rOuter, endDeg);
  const eIn = polar(cx, cy, rInner, endDeg);
  const sIn = polar(cx, cy, rInner, startDeg);
  const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  return [
    `M ${sOut.x.toFixed(2)} ${sOut.y.toFixed(2)}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${eOut.x.toFixed(2)} ${eOut.y.toFixed(2)}`,
    `L ${eIn.x.toFixed(2)} ${eIn.y.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${sIn.x.toFixed(2)} ${sIn.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

function miniSippeSvg(x, y, color = '#ebe4d4', scale = 0.72, opacity = 1) {
  return svgEl('g', {
    transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${scale}) translate(-9,-15)`,
    opacity: String(opacity),
  },
  svgEl('circle', { cx: 9, cy: 6, r: 4, fill: color }),
  svgEl('path', {
    d: 'M4 13 C4 10.8, 14 10.8, 14 13 L15 22 L12 22 L11.5 29 L6.5 29 L6 22 L3 22 Z',
    fill: color,
  }));
}

function svgTwoLineText(x, y, textStr, attrs = {}) {
  const { maxChars = 15, ...restAttrs } = typeof attrs === 'number' ? { maxChars: attrs } : attrs;
  const raw = String(textStr ?? '').trim();
  const words = raw.split(/\s+/);
  let line1 = '';
  let line2 = '';
  for (const w of words) {
    if (!line1 || (line1.length + 1 + w.length <= maxChars && !line2)) {
      line1 = line1 ? `${line1} ${w}` : w;
    } else {
      line2 = line2 ? `${line2} ${w}` : w;
    }
  }
  const tNode = svgEl('text', {
    x, y,
    'text-anchor': 'middle',
    fill: '#ebe4d4',
    style: 'paint-order: stroke; stroke: #0c1211; stroke-width: 3.5px; stroke-linejoin: round;',
    ...restAttrs,
  });
  if (!line2) {
    tNode.textContent = line1;
  } else {
    tNode.append(
      svgEl('tspan', { x, dy: '-0.35em', text: line1 }),
      svgEl('tspan', { x, dy: '1.15em', text: line2 }),
    );
  }
  return tNode;
}

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
  return svgEl('g', { transform: `translate(${cx.toFixed(1)},${cy.toFixed(1)})` },
    svgEl('rect', {
      x: -11, y: -11, width: 22, height: 22, rx: 4,
      fill: '#141b1a', stroke: color, 'stroke-width': 1.5,
    }),
    ...pips.map(([px, py]) => svgEl('circle', { cx: px, cy: py, r: 1.7, fill: color })));
}

function hexDistance(q1, r1, q2, r2) {
  const dq = (q1 ?? 0) - (q2 ?? 0);
  const dr = (r1 ?? 0) - (r2 ?? 0);
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

function getLabourState(game) {
  const people = game.view.peoples[game.pid];
  const assign = game.draft.assign ?? people.population.assigned ?? {};
  const totalClans = people.population.core ?? 4;
  const currentAssign = {
    [RULES.food]: assign[RULES.food] ?? 0,
    research: assign.research ?? 0,
    [RULES.material]: assign[RULES.material] ?? 0,
  };
  const assignedSum = currentAssign[RULES.food] + currentAssign.research + currentAssign[RULES.material];
  const freeClans = Math.max(0, totalClans - assignedSum);

  const stations = [
    { key: RULES.food, resKey: 'nahrung', glyph: '🌾', color: '#82b889', label: t(`resource.${RULES.food}`, 'Nahrung'), count: currentAssign[RULES.food] },
    { key: 'research', resKey: 'wissen', glyph: '✦', color: '#78b0c4', label: t('ui.forschung', 'Wissen'), count: currentAssign.research },
    { key: RULES.material, resKey: 'material', glyph: '⚒', color: '#d79a49', label: t(`resource.${RULES.material}`, 'Material'), count: currentAssign[RULES.material] },
  ];

  const adjust = (targetKey, delta) => {
    const next = { ...currentAssign };
    if (delta > 0) {
      if (freeClans > 0) {
        next[targetKey] = (next[targetKey] ?? 0) + 1;
      } else {
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

  return { stations, totalClans, assignedSum, freeClans, adjust };
}

function collectCandidateHexes(game, model) {
  const knownKeys = Object.keys(model.known ?? {});
  const orders = model.orders ?? [];
  const homeQ = model.home?.q ?? model.start?.q ?? 0;
  const homeR = model.home?.r ?? model.start?.r ?? 0;
  const result = [];

  for (const key of knownKeys) {
    const [qStr, rStr] = key.split(',');
    const q = Number(qStr);
    const r = Number(rStr);
    if (!Number.isInteger(q) || !Number.isInteger(r)) continue;

    const tile = tileAt(model.world, q, r);
    if (!tile) continue;

    const { units, places } = objectsAt(model, q, r);
    const ownUnit = units.find((u) => u.volk === 'spieler') ?? units[0];
    const place = places[0];
    const selTarget = ownUnit
      ? { kind: 'unit', id: ownUnit.id, q, r }
      : place
        ? { kind: 'place', id: place.id, q, r }
        : { kind: 'tile', q, r };

    const opts = (game.optionsFor(selTarget) ?? []).filter((o) => !o.grund);
    const tileOpts = selTarget.kind !== 'tile'
      ? (game.optionsFor({ kind: 'tile', q, r }) ?? []).filter((o) => !o.grund)
      : [];
    const allOpts = [...opts, ...tileOpts];

    const mainAct = allOpts.find((o) => o.slot === 'haupt') ?? allOpts[0] ?? null;
    const minorAct = allOpts.find((o) => o.slot === 'neben') ?? allOpts[1] ?? null;
    const queuedHere = orders.filter((o) => o.ort && o.ort.q === q && o.ort.r === r);
    const isHome = q === homeQ && r === homeR;
    const dist = hexDistance(q, r, homeQ, homeR);

    const regName = tile.region ? regionName(model, tile.region) : '';
    const def = model.terrains?.get(tile.terrain);
    const label = place?.name || regName || def?.name || tile.terrain;

    result.push({
      tile: { ...tile, q, r },
      coord: `${q},${r}`,
      dist,
      label,
      place,
      ownUnit,
      queuedHere,
      mainAct,
      minorAct,
      isHome,
      actionCount: allOpts.length,
    });
  }

  result.sort((a, b) => {
    if (a.isHome !== b.isHome) return a.isHome ? -1 : 1;
    if ((b.queuedHere.length > 0) !== (a.queuedHere.length > 0)) return b.queuedHere.length - a.queuedHere.length;
    if ((b.actionCount > 0) !== (a.actionCount > 0)) return b.actionCount - a.actionCount;
    return a.dist - b.dist;
  });
  return result.slice(0, 12);
}

function getKnowledgeData(game, model) {
  const ent = model.entwicklungen ?? { praxis: [], bekannt: [], forschung: [], vorschlaege: [] };
  const praxis = ent.praxis.slice(0, 6);
  const bekannt = ent.bekannt.slice(0, 6);
  const byRef = new Map();
  for (const r of ent.forschung) byRef.set(r.ref, r);
  for (const c of ent.vorschlaege) {
    if (!byRef.has(c.ref)) byRef.set(c.ref, { ...c, fortschritt: 0 });
  }
  const krone = [...byRef.values()].slice(0, 6);
  const activeResearchOrder = (game.draft.orders ?? []).find((o) => o.type === 'research.assign');
  const activeResearchRef = activeResearchOrder?.params?.development ?? ent.forschung[0]?.ref ?? null;

  const selectResearch = (ref) => {
    const opt = game.previewOption({ type: 'research.assign', params: { development: ref } });
    if (!opt.grund) game.addOption(opt);
  };

  return { praxis, bekannt, krone, activeResearchRef, selectResearch };
}

function syncRollsAndSeal(game, model) {
  const probes = game.base?.probes ?? [];
  const rolls = game.draft?.rolls ?? {};
  for (const o of model.orders ?? []) {
    const p = probes.find((x) => x.order === o.id);
    if (p) {
      const val = rolls[p.id]?.value;
      o.probe = {
        ...(o.probe ?? {}),
        id: p.id,
        ziel: p.threshold ?? o.probe?.ziel ?? 5,
        mod: p.mod ?? o.probe?.mod ?? 0,
        wurf: Number.isInteger(val) ? val : null,
      };
    }
  }
  const wp = probes.find((x) => x.target == null && x.roller === 'player');
  if (wp) {
    const val = rolls[wp.id]?.value;
    model.weltwurf = {
      id: wp.id,
      offen: !Number.isInteger(val),
      wurf: Number.isInteger(val) ? val : null,
    };
  }
}

async function triggerTurnSealOrRoll(game, model) {
  syncRollsAndSeal(game, model);
  if (model.weltwurf?.offen) {
    game.rollWorld?.();
    return;
  }
  const unrolled = (model.orders ?? []).find((o) => o.probe && !Number.isInteger(o.probe.wurf));
  if (unrolled) {
    game.rollOrder?.(unrolled.id);
    return;
  }
  if (game.view?.phase === 'planning') {
    const turnBefore = game.view.turn;
    const res = await game.endTurn?.();
    const revAfter = Number.isInteger(res?.rev) ? res.rev : game.view.rev;
    if (game.app?.demo && game.view.phase !== 'planning') {
      try {
        await window.weltenstrom?.continueDemo?.(turnBefore, revAfter);
      } catch (err) {
        console.warn(err);
      }
    }
  }
}

function renderTurnSealBar(svg, cx, cy, game, model) {
  syncRollsAndSeal(game, model);
  const g = svgEl('g', {});
  const orders = model.orders ?? [];

  orders.forEach((o, idx) => {
    const ox = cx - 280 + idx * 125;
    const oy = cy;
    const isMain = o.slot === 'haupt';
    const col = isMain ? '#e2a84b' : '#7ec4ba';

    const rmGroup = svgEl('g', {
      class: 'svg-klickbar',
      role: 'button',
      tabindex: '0',
      'aria-label': `${o.titel ?? o.id} (${t('board.blocker.withdraw')})`,
    });
    rmGroup.append(
      svgEl('circle', { cx: ox - 24, cy: oy, r: 13, fill: '#17201f', stroke: col, 'stroke-width': 1.8 }),
      svgEl('text', {
        x: ox - 24, y: oy + 4, 'text-anchor': 'middle',
        fill: col, 'font-size': '11', 'font-weight': '700',
        text: isMain ? 'H' : 'N',
      }),
    );
    rmGroup.addEventListener('click', () => game.removeOrder(o.id));
    g.append(rmGroup);

    if (o.probe) {
      const rolled = Number.isInteger(o.probe.wurf);
      const dieG = svgEl('g', {
        class: rolled ? '' : 'svg-klickbar strom-wuerfel-offen',
        ...(rolled ? {} : {
          'data-strom-roll-order': o.id,
          role: 'button',
          tabindex: '0',
          'aria-label': `${t('ui.wuerfeln')}: ${o.titel ?? o.id}`,
        }),
      });
      dieG.append(dieGlyph(ox + 6, oy, rolled ? o.probe.wurf : 7, rolled ? '#82b889' : '#e2a84b'));
      dieG.append(svgEl('text', {
        x: ox + 22, y: oy + 4,
        fill: rolled ? '#82b889' : '#e2a84b',
        'font-size': '11.5', 'font-weight': '700',
        text: rolled ? `${o.probe.wurf}${signed(o.probe.mod ?? 0)}▸${o.probe.ziel}` : `🎲▸${o.probe.ziel}`,
      }));
      if (!rolled) {
        dieG.addEventListener('click', () => game.rollOrder?.(o.id));
      }
      g.append(dieG);
    }
  });

  if (model.weltwurf) {
    const wx = cx + 170;
    const wy = cy;
    const isOpen = Boolean(model.weltwurf.offen);
    const wG = svgEl('g', {
      id: 'strom-weltwurf',
      class: isOpen ? 'svg-klickbar strom-wuerfel-offen' : '',
      ...(isOpen ? {
        role: 'button',
        tabindex: '0',
        'aria-label': t('season.world-roll'),
      } : {}),
    });
    wG.append(dieGlyph(wx, wy, isOpen ? 7 : (model.weltwurf.wurf ?? 7), isOpen ? '#e2a84b' : '#82b889'));
    wG.append(svgEl('text', {
      x: wx + 18, y: wy + 4,
      fill: isOpen ? '#e2a84b' : '#82b889',
      'font-size': '12', 'font-weight': '700',
      text: isOpen ? `🎲 ${t('season.world-roll')}` : `${model.weltwurf.wurf}`,
    }));
    if (isOpen) {
      wG.addEventListener('click', () => game.rollWorld?.());
    }
    g.append(wG);
  }

  const hasOpenRoll = Boolean(model.weltwurf?.offen)
    || orders.some((o) => o.probe && !Number.isInteger(o.probe.wurf));
  const ready = !hasOpenRoll && (model.probleme ?? []).length === 0 && game.view?.phase === 'planning';

  const sealG = svgEl('g', {
    id: 'strom-zug-siegel',
    class: `svg-klickbar${ready ? ' is-ready' : ''}`,
    role: 'button',
    tabindex: '0',
    'aria-label': t('season.end'),
  });
  sealG.append(
    svgEl('circle', {
      cx, cy, r: 30,
      fill: ready ? 'rgba(130,184,137,0.18)' : 'rgba(184,74,62,0.22)',
      stroke: ready ? '#82b889' : '#d79a49',
      'stroke-width': 2.5,
    }),
    svgEl('circle', {
      cx, cy, r: 23,
      fill: 'none',
      stroke: ready ? 'rgba(130,184,137,0.55)' : 'rgba(215,154,73,0.45)',
      'stroke-width': 1.1,
      'stroke-dasharray': ready ? 'none' : '3 3',
    }),
    svgEl('text', {
      x: cx, y: cy + 6,
      'text-anchor': 'middle',
      fill: ready ? '#82b889' : '#e7b96b',
      'font-size': '18',
      text: ready ? '✦' : '🎲',
    }),
    svgEl('text', {
      x: cx, y: cy + 46,
      'text-anchor': 'middle',
      fill: ready ? '#82b889' : '#e7b96b',
      'font-family': FONT_WORLD,
      'font-size': '12.5',
      'letter-spacing': '0.06em',
      text: hasOpenRoll ? `${t('ui.wuerfeln')} · ${t('season.end')}` : t('season.end'),
    }),
  );
  sealG.addEventListener('click', () => triggerTurnSealOrRoll(game, model));
  g.append(sealG);
  svg.append(g);
}

// ============================================================================
// PROTOTYPE II: DAS RUNDEN-UHRWERK / ASTROLABIUM DER 4 PHASEN
// ============================================================================
// Generalizes the entire game state onto a 4-Quadrant Clockwise Round Dial:
//   - Quadrant I   (  0°.. 90°, 12–3 Uhr): Phase I   · Arbeit & Ernte (Sippen -> Ressourcen)
//   - Quadrant II  ( 90°..180°,  3–6 Uhr): Phase II  · Raum & Befehle (Distanz-Radar d=0,1,2+ mit H/N)
//   - Quadrant III (180°..270°,  6–9 Uhr): Phase III · Rat, Bestimmung & Wissenspfade
//   - Quadrant IV  (270°..360°, 9–12 Uhr): Phase IV  · Schicksalswürfe, Zeitringe (T1..Tn) & Siegel
export function renderAstrolabium(host, game, model, historyReports = []) {
  syncRollsAndSeal(game, model);
  const W = 1280;
  const H = 1280;
  const CX = 640;
  const CY = 640;

  const stage = el('div', { class: 'proto-buehne proto-astrolabium-buehne' });
  const canvasWrap = el('div', { class: 'astro-okular' });
  const canvas = el('canvas', {
    id: 'astro-diorama',
    width: '300',
    height: '300',
    'aria-label': t('board.map.role'),
  });
  canvasWrap.append(canvas);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'proto-svg astro-svg',
    role: 'img',
    'aria-label': 'Astrolabium der Gezeiten',
  });

  const defs = svgEl('defs', {},
    svgEl('radialGradient', { id: 'astroBg', cx: '50%', cy: '50%', r: '50%' },
      svgEl('stop', { offset: '0%', 'stop-color': '#1d2b28', 'stop-opacity': '0.96' }),
      svgEl('stop', { offset: '62%', 'stop-color': '#111918', 'stop-opacity': '0.98' }),
      svgEl('stop', { offset: '100%', 'stop-color': '#090e0d', 'stop-opacity': '1' }),
    ),
  );
  svg.append(defs);

  // Outer Planisphere Disc
  svg.append(svgEl('circle', {
    cx: CX, cy: CY, r: 596,
    fill: 'url(#astroBg)',
    stroke: 'rgba(215,154,73,0.42)',
    'stroke-width': 2.2,
  }));

  // Compute how far the current Round Clock has filled (0° -> 90° -> 180° -> 270° -> 360°)
  const { stations, totalClans, assignedSum, adjust } = getLabourState(game);
  const hexItems = collectCandidateHexes(game, model);
  const { praxis, bekannt, krone, activeResearchRef, selectResearch } = getKnowledgeData(game, model);
  const orders = model.orders ?? [];
  const hasMainOrder = orders.some((o) => o.slot === 'haupt');
  const minorOrderCount = orders.filter((o) => o.slot === 'neben').length;
  const hasOpenOrderRoll = orders.some((o) => o.probe && !Number.isInteger(o.probe.wurf));
  const hasOpenWorldRoll = Boolean(model.weltwurf?.offen);

  // Phase completion ratios (0..1 per quadrant)
  const p1Ratio = Math.min(1, assignedSum / Math.max(1, totalClans));
  const p2Ratio = Math.min(1, (hasMainOrder ? 0.65 : 0.15) + Math.min(2, minorOrderCount) * 0.175);
  const p3Ratio = activeResearchRef ? 1.0 : 0.55;
  const p4Ratio = (!hasOpenOrderRoll && !hasOpenWorldRoll) ? 1.0 : (!hasOpenWorldRoll ? 0.6 : 0.25);

  const phaseArcs = [
    { idx: 0, start: 4,   end: 86,  ratio: p1Ratio, color: '#82b889', title: 'I · ARBEIT & ERNTE' },
    { idx: 1, start: 94,  end: 176, ratio: p2Ratio, color: '#e2a84b', title: 'II · RAUM & BEFEHLE' },
    { idx: 2, start: 184, end: 266, ratio: p3Ratio, color: '#78b0c4', title: 'III · RAT & WISSEN' },
    { idx: 3, start: 274, end: 356, ratio: p4Ratio, color: '#d79a49', title: 'IV · PROBEN & CHRONIK' },
  ];

  // Calculate cumulative Clock Hand Angle (advances clockwise as the round fills up!)
  let clockAngle = 86 * p1Ratio;
  if (p1Ratio >= 0.99) clockAngle = 90 + 90 * p2Ratio;
  if (p1Ratio >= 0.99 && p2Ratio >= 0.6) clockAngle = 180 + 90 * p3Ratio;
  if (p1Ratio >= 0.99 && p2Ratio >= 0.6 && p3Ratio >= 0.9) clockAngle = 270 + 88 * p4Ratio;

  // Draw the 4 Phase Quadrant Background Sectors & Outer Progress Rim (r = 558..576)
  phaseArcs.forEach((ph) => {
    // Subtle quadrant sector tint showing how "full" this phase is
    svg.append(svgEl('path', {
      d: sectorPath(CX, CY, 206, 548, ph.start, ph.end),
      fill: ph.color,
      'fill-opacity': (0.015 + ph.ratio * 0.032).toFixed(3),
      stroke: 'rgba(215,154,73,0.14)',
      'stroke-width': 1,
    }));

    // Outer track base (r = 564)
    svg.append(svgEl('path', {
      d: arcPath(CX, CY, 564, ph.start, ph.end),
      fill: 'none',
      stroke: 'rgba(235,228,212,0.12)',
      'stroke-width': 8,
      'stroke-linecap': 'round',
    }));

    // Filled Phase Progress Bar along the outer rim
    const fillDeg = ph.start + (ph.end - ph.start) * Math.max(0.06, ph.ratio);
    svg.append(svgEl('path', {
      d: arcPath(CX, CY, 564, ph.start, fillDeg),
      fill: 'none',
      stroke: ph.color,
      'stroke-width': 8,
      'stroke-linecap': 'round',
    }));

    // Phase Title along outer rim
    const midDeg = (ph.start + ph.end) / 2;
    const lblPt = polar(CX, CY, 584, midDeg);
    svg.append(svgEl('text', {
      x: lblPt.x, y: lblPt.y + 4,
      'text-anchor': 'middle',
      fill: ph.color,
      'font-family': FONT_WORLD,
      'font-size': '11',
      'font-weight': '700',
      'letter-spacing': '0.08em',
      text: ph.title,
    }));
  });

  // Sweeping Clockwise Round-Progress Arc & Clock Hand from 12 o'clock (0°) to `clockAngle`
  svg.append(svgEl('path', {
    d: arcPath(CX, CY, 206, 0, Math.max(4, clockAngle)),
    fill: 'none',
    stroke: '#e7b96b',
    'stroke-width': 3.5,
    'stroke-linecap': 'round',
  }));
  const handTip = polar(CX, CY, 554, clockAngle);
  const handBase = polar(CX, CY, 138, clockAngle);
  svg.append(svgEl('line', {
    x1: handBase.x, y1: handBase.y, x2: handTip.x, y2: handTip.y,
    stroke: 'rgba(231,185,107,0.55)',
    'stroke-width': 2,
    'stroke-dasharray': '6 4',
  }));
  svg.append(svgEl('circle', {
    cx: handTip.x, cy: handTip.y, r: 6,
    fill: '#e7b96b', stroke: '#141b1a', 'stroke-width': 1.5,
  }));

  // Concentric Reference Orbits (Distance / Hierarchy tracks)
  for (const r of [136, 204, 290, 380, 468, 548]) {
    svg.append(svgEl('circle', {
      cx: CX, cy: CY, r,
      fill: 'none',
      stroke: 'rgba(215,154,73,0.18)',
      'stroke-width': r === 136 || r === 204 || r === 548 ? 1.6 : 1,
      'stroke-dasharray': r === 290 || r === 380 ? '3 5' : 'none',
    }));
  }

  // 4 Quadrant Divider Axes (0°, 90°, 180°, 270°)
  for (const deg of [0, 90, 180, 270]) {
    const pIn = polar(CX, CY, 136, deg);
    const pOut = polar(CX, CY, 556, deg);
    svg.append(svgEl('line', {
      x1: pIn.x, y1: pIn.y, x2: pOut.x, y2: pOut.y,
      stroke: 'rgba(215,154,73,0.34)',
      'stroke-width': 1.6,
    }));
  }

  // --------------------------------------------------------------------------
  // INNER HUB RING (r = 140..202): The 5 Core Stores (Vorrats-Nabe)
  // --------------------------------------------------------------------------
  const resList = model.ressourcen ?? [];
  const resAngles = {};
  resList.forEach((res, idx) => {
    const step = 360 / Math.max(1, resList.length);
    const a0 = idx * step + 3;
    const a1 = (idx + 1) * step - 3;
    const aMid = (a0 + a1) / 2;
    resAngles[res.key] = aMid;
    const pal = RES_PALETTE[res.key] ?? { color: '#d79a49', glyph: '●' };

    svg.append(svgEl('path', {
      d: sectorPath(CX, CY, 140, 202, a0, a1),
      fill: 'rgba(18,26,25,0.92)',
      stroke: 'rgba(235,228,212,0.16)',
      'stroke-width': 1,
    }));

    const ratio = Math.max(0.1, Math.min(1, Math.abs(res.wert ?? 0) / 12));
    const fillEnd = a0 + (a1 - a0) * ratio;
    svg.append(svgEl('path', {
      d: arcPath(CX, CY, 150, a0 + 2, fillEnd),
      fill: 'none',
      stroke: pal.color,
      'stroke-width': 5.5,
      'stroke-linecap': 'round',
    }));

    const pt = polar(CX, CY, 174, aMid);
    const delta = res.netto ?? 0;
    svg.append(svgEl('text', {
      x: pt.x, y: pt.y - 2,
      'text-anchor': 'middle',
      fill: '#ebe4d4',
      'font-size': '13',
      'font-weight': '700',
      text: `${pal.glyph} ${res.wert}`,
    }));
    svg.append(svgEl('text', {
      x: pt.x, y: pt.y + 12,
      'text-anchor': 'middle',
      fill: delta > 0 ? '#82b889' : delta < 0 ? '#d46a6a' : 'rgba(235,228,212,0.45)',
      'font-size': '10.5',
      'font-weight': '700',
      text: delta !== 0 ? signed(delta) : '±0',
    }));
  });

  // --------------------------------------------------------------------------
  // QUADRANT I (0°..90°, 12–3 Uhr): PHASE I · ARBEIT, SIPPEN & ERNTESTRÖME
  // --------------------------------------------------------------------------
  const fc = game.base?.forecast ?? {};
  stations.forEach((st, idx) => {
    const rIn = 220 + idx * 96;
    const rOut = rIn + 78;
    const rMid = (rIn + rOut) / 2;
    const a0 = 10;
    const a1 = 80;
    const aMid = 45;

    svg.append(svgEl('path', {
      d: sectorPath(CX, CY, rIn, rOut, a0, a1),
      fill: 'rgba(22,32,30,0.86)',
      stroke: st.color,
      'stroke-width': st.count > 0 ? 1.8 : 1,
    }));

    // Alluvial Chord from Quadrant I Track into the corresponding Inner Hub Store
    const targetDeg = resAngles[st.resKey] ?? 35;
    const pFrom = polar(CX, CY, rIn, 32 + idx * 12);
    const pTo = polar(CX, CY, 202, targetDeg);
    const inc = fc.income?.[st.resKey] ?? st.count;
    svg.append(svgEl('path', {
      d: `M ${pFrom.x.toFixed(1)} ${pFrom.y.toFixed(1)} Q ${CX + 90} ${CY - 90} ${pTo.x.toFixed(1)} ${pTo.y.toFixed(1)}`,
      fill: 'none',
      stroke: st.color,
      'stroke-opacity': st.count > 0 ? '0.48' : '0.12',
      'stroke-width': Math.max(2, st.count * 4.5),
    }));

    // Isotype Clan Figures along the arc
    for (let s = 0; s < totalClans; s++) {
      const sDeg = a0 + 16 + s * ((a1 - a0 - 32) / Math.max(1, totalClans - 1));
      const sp = polar(CX, CY, rMid - 4, sDeg);
      const activeFig = s < st.count;
      svg.append(miniSippeSvg(sp.x, sp.y, activeFig ? st.color : '#ebe4d4', 0.72, activeFig ? 1 : 0.18));
    }

    // Track Label & Yield Badge
    const lp = polar(CX, CY, rOut - 13, aMid);
    svg.append(svgEl('text', {
      x: lp.x, y: lp.y + 4,
      'text-anchor': 'middle',
      fill: st.color,
      'font-size': '11.5',
      'font-weight': '700',
      text: `${st.glyph} ${st.label}: ${st.count}/${totalClans} (+${inc})`,
    }));

    // '-' and '+' Brass Gear Buttons at the ends of the track
    const minusPt = polar(CX, CY, rMid, a0 + 6);
    const plusPt = polar(CX, CY, rMid, a1 - 6);

    const canDec = st.count > 0 && game.view?.phase === 'planning';
    const minusG = svgEl('g', {
      class: canDec ? 'svg-klickbar' : '',
      role: 'button',
      tabindex: '0',
      'aria-label': `${st.label} −`,
    });
    minusG.append(
      svgEl('circle', { cx: minusPt.x, cy: minusPt.y, r: 12, fill: '#121a19', stroke: st.color, 'stroke-width': 1.6 }),
      svgEl('text', { x: minusPt.x, y: minusPt.y + 4, 'text-anchor': 'middle', fill: '#ebe4d4', 'font-size': '14', 'font-weight': '700', text: '−' }),
    );
    if (canDec) minusG.addEventListener('click', () => adjust(st.key, -1));
    svg.append(minusG);

    const canInc = st.count < totalClans && game.view?.phase === 'planning';
    const plusG = svgEl('g', {
      class: canInc ? 'svg-klickbar' : '',
      role: 'button',
      tabindex: '0',
      'aria-label': `${st.label} +`,
    });
    plusG.append(
      svgEl('circle', { cx: plusPt.x, cy: plusPt.y, r: 12, fill: '#121a19', stroke: st.color, 'stroke-width': 1.6 }),
      svgEl('text', { x: plusPt.x, y: plusPt.y + 4, 'text-anchor': 'middle', fill: '#ebe4d4', 'font-size': '14', 'font-weight': '700', text: '+' }),
    );
    if (canInc) plusG.addEventListener('click', () => adjust(st.key, 1));
    svg.append(plusG);
  });

  // --------------------------------------------------------------------------
  // QUADRANT II (90°..180°, 3–6 Uhr): PHASE II · RAUM-RADAR & AKTIONS-BEFEHLE
  // --------------------------------------------------------------------------
  // Generalized Distance Rings: d=0 (r=248), d=1 (r=355), d>=2 (r=468)
  const ringBuckets = { 0: [], 1: [], 2: [] };
  for (const item of hexItems) {
    const b = item.dist <= 0 ? 0 : item.dist === 1 ? 1 : 2;
    ringBuckets[b].push(item);
  }
  const bucketRadii = { 0: 252, 1: 365, 2: 478 };

  for (const [bKey, bucket] of Object.entries(ringBuckets)) {
    const rOrbit = bucketRadii[bKey];
    bucket.forEach((item, idx) => {
      const count = bucket.length;
      const deg = count === 1 ? 135 : 102 + (idx / (count - 1)) * 66;
      const pt = polar(CX, CY, rOrbit, deg);
      const tInfo = TERRAIN_ELEV[item.tile.terrain] ?? { col: '#5a6e5c', band: 'II' };
      const isQueued = item.queuedHere.length > 0;

      // If an order is queued here, draw a glowing vector beam from the hub to this hex!
      if (isQueued) {
        const pHub = polar(CX, CY, 204, deg);
        svg.append(svgEl('line', {
          x1: pHub.x, y1: pHub.y, x2: pt.x, y2: pt.y,
          stroke: '#e2a84b', 'stroke-width': 2.8, 'stroke-dasharray': '5 3',
        }));
      }

      svg.append(svgEl('circle', {
        cx: pt.x, cy: pt.y, r: item.isHome ? 31 : 26,
        fill: '#141e1d',
        stroke: isQueued ? '#e2a84b' : tInfo.col,
        'stroke-width': item.isHome || isQueued ? 2.6 : 1.6,
      }));
      svg.append(svgEl('circle', {
        cx: pt.x, cy: pt.y, r: item.isHome ? 23 : 19,
        fill: tInfo.col,
        'fill-opacity': '0.34',
      }));

      svg.append(svgTwoLineText(pt.x, pt.y - 31, item.label, {
        fill: '#ebe4d4',
        'font-size': '10',
        'font-weight': '700',
        maxChars: 16,
      }));
      svg.append(svgEl('text', {
        x: pt.x, y: pt.y + 5,
        'text-anchor': 'middle',
        fill: 'rgba(235,228,212,0.85)',
        'font-size': '9.5',
        'font-weight': '600',
        text: `d=${item.dist} · ${item.coord}`,
      }));

      if (isQueued) {
        const q = item.queuedHere[0];
        const qG = svgEl('g', {
          class: 'svg-klickbar',
          role: 'button',
          tabindex: '0',
          'aria-label': `${q.titel ?? q.id} (${t('board.blocker.withdraw')})`,
        });
        qG.append(
          svgEl('circle', { cx: pt.x + 20, cy: pt.y - 18, r: 11, fill: '#e2a84b', stroke: '#141b1a', 'stroke-width': 1.5 }),
          svgEl('text', { x: pt.x + 20, y: pt.y - 14, 'text-anchor': 'middle', fill: '#141b1a', 'font-size': '10', 'font-weight': '700', text: q.slot === 'haupt' ? 'H✓' : 'N✓' }),
        );
        qG.addEventListener('click', () => game.removeOrder(q.id));
        svg.append(qG);
      } else {
        if (item.mainAct) {
          const hG = svgEl('g', {
            class: 'svg-klickbar',
            role: 'button',
            tabindex: '0',
            'aria-label': `${item.mainAct.titel}: ${item.label}`,
          });
          hG.append(
            svgEl('circle', { cx: pt.x - 19, cy: pt.y - 19, r: 10, fill: '#182220', stroke: '#e2a84b', 'stroke-width': 1.6 }),
            svgEl('text', { x: pt.x - 19, y: pt.y - 15.5, 'text-anchor': 'middle', fill: '#e2a84b', 'font-size': '9.5', 'font-weight': '700', text: 'H' }),
          );
          hG.addEventListener('click', () => game.addOption(item.mainAct));
          svg.append(hG);
        }
        if (item.minorAct && item.minorAct !== item.mainAct) {
          const nG = svgEl('g', {
            class: 'svg-klickbar',
            role: 'button',
            tabindex: '0',
            'aria-label': `${item.minorAct.titel}: ${item.label}`,
          });
          nG.append(
            svgEl('circle', { cx: pt.x + 19, cy: pt.y - 19, r: 10, fill: '#182220', stroke: '#7ec4ba', 'stroke-width': 1.6 }),
            svgEl('text', { x: pt.x + 19, y: pt.y - 15.5, 'text-anchor': 'middle', fill: '#7ec4ba', 'font-size': '9.5', 'font-weight': '700', text: 'N' }),
          );
          nG.addEventListener('click', () => game.addOption(item.minorAct));
          svg.append(nG);
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // QUADRANT III (180°..270°, 6–9 Uhr): PHASE III · RAT, BESTIMMUNG & WISSEN
  // --------------------------------------------------------------------------
  // Inner Track (r = 258): Council Loyalty Pendulums + Destiny Milestones
  const council = model.rat ?? [];
  council.forEach((m, idx) => {
    const baseDeg = 194 + idx * 21;
    const loy = Math.max(-5, Math.min(5, m.loyalitaet ?? 0));
    const swingDeg = baseDeg + loy * 1.8;
    const pInner = polar(CX, CY, 212, baseDeg);
    const pBob = polar(CX, CY, 265, swingDeg);
    const col = loy >= 1 ? '#82b889' : loy <= -1 ? '#d46a6a' : '#d79a49';

    svg.append(svgEl('path', {
      d: arcPath(CX, CY, 265, baseDeg - 8, baseDeg + 8),
      fill: 'none', stroke: 'rgba(235,228,212,0.22)', 'stroke-width': 2,
    }));
    svg.append(svgEl('line', {
      x1: pInner.x, y1: pInner.y, x2: pBob.x, y2: pBob.y,
      stroke: col, 'stroke-width': m.leader ? 2.6 : 1.7,
    }));
    svg.append(svgEl('circle', {
      cx: pBob.x, cy: pBob.y, r: 14,
      fill: '#141d1c', stroke: col, 'stroke-width': m.leader ? 2.5 : 1.6,
    }));
    svg.append(svgEl('text', {
      x: pBob.x, y: pBob.y + 4,
      'text-anchor': 'middle', fill: '#ebe4d4', 'font-size': '10.5', 'font-weight': '700',
      text: signed(loy),
    }));
    const pLbl = polar(CX, CY, 290, swingDeg);
    svg.append(svgTwoLineText(pLbl.x, pLbl.y, m.name.split(' ')[0], {
      fill: 'rgba(235,228,212,0.88)', 'font-size': '10',
    }));
  });

  // Destiny Milestones along the upper-left inner arc (248°..266°)
  const milestones = model.bestimmung?.meilensteine ?? [];
  milestones.forEach((ms, idx) => {
    const deg = 248 + idx * 9;
    const pt = polar(CX, CY, 265, deg);
    svg.append(svgEl('polygon', {
      points: `${pt.x},${pt.y - 9} ${pt.x + 9},${pt.y} ${pt.x},${pt.y + 9} ${pt.x - 9},${pt.y}`,
      fill: ms.erfuellt ? '#e2a84b' : '#15201f',
      stroke: '#e2a84b',
      'stroke-width': 1.6,
    }));
  });

  // Mid Track (r = 358): Practice Roots
  praxis.slice(0, 5).forEach((p, idx) => {
    const deg = 192 + idx * 16.5;
    const pt = polar(CX, CY, 358, deg);
    svg.append(svgEl('circle', {
      cx: pt.x, cy: pt.y, r: 14,
      fill: '#15201c', stroke: '#82b889', 'stroke-width': 1.8,
    }));
    svg.append(svgEl('text', {
      x: pt.x, y: pt.y + 4, 'text-anchor': 'middle',
      fill: '#ebe4d4', 'font-size': '11', 'font-weight': '700',
      text: String(p.gewicht),
    }));
    svg.append(svgTwoLineText(pt.x, pt.y + 23, p.name, {
      fill: 'rgba(235,228,212,0.82)', 'font-size': '9.5', maxChars: 13,
    }));
  });

  // Outer Track (r = 476): Clickable Research Crown & Known Developments
  krone.slice(0, 5).forEach((k, idx) => {
    const deg = 192 + idx * 16.5;
    const pt = polar(CX, CY, 476, deg);
    const rp = polar(CX, CY, 372, deg);
    const isTarget = k.ref === activeResearchRef;
    const done = k.fortschritt ?? 0;
    const total = k.dauer ?? 6;
    const col = isTarget ? '#78b0c4' : '#d79a49';

    svg.append(svgEl('line', {
      x1: rp.x, y1: rp.y, x2: pt.x, y2: pt.y,
      stroke: col, 'stroke-width': isTarget ? 2.4 : 1.2,
      'stroke-dasharray': isTarget ? 'none' : '3 4',
    }));

    const starG = svgEl('g', {
      class: 'svg-klickbar',
      role: 'button',
      tabindex: '0',
      'aria-label': `${k.name} (${done}/${total})`,
    });
    starG.append(
      svgEl('circle', {
        cx: pt.x, cy: pt.y, r: isTarget ? 19 : 15,
        fill: isTarget ? '#182a30' : '#141c1b',
        stroke: col, 'stroke-width': isTarget ? 2.6 : 1.6,
      }),
      svgEl('text', {
        x: pt.x, y: pt.y + 4, 'text-anchor': 'middle',
        fill: '#ebe4d4', 'font-size': '10.5', 'font-weight': '700',
        text: `${done}/${total}`,
      }),
      svgTwoLineText(pt.x, pt.y - 25, k.name, {
        fill: isTarget ? '#9ad0e4' : '#ebe4d4', 'font-size': '10', 'font-weight': '600', maxChars: 15,
      }),
    );
    starG.addEventListener('click', () => selectResearch(k.ref));
    svg.append(starG);
  });

  // --------------------------------------------------------------------------
  // QUADRANT IV (270°..360°, 9–12 Uhr): PHASE IV · WÜRFE, ZEITRINGE (T1..Tn) & SIEGEL
  // --------------------------------------------------------------------------
  // Historical Turn Spokes (278°..330°): Each played turn adds a radial memory spoke!
  const totalTurns = Math.max(1, (game.view?.turn ?? 0) + 1);
  for (let tIdx = 0; tIdx < totalTurns; tIdx++) {
    const deg = 280 + (tIdx / Math.max(1, totalTurns)) * 46;
    const pIn = polar(CX, CY, 220, deg);
    const pOut = polar(CX, CY, 440, deg);
    const isNow = tIdx === game.view.turn;

    svg.append(svgEl('line', {
      x1: pIn.x, y1: pIn.y, x2: pOut.x, y2: pOut.y,
      stroke: isNow ? '#e2a84b' : 'rgba(215,154,73,0.32)',
      'stroke-width': isNow ? 2.6 : 1.4,
    }));

    const lblPt = polar(CX, CY, 232, deg);
    svg.append(svgEl('circle', {
      cx: lblPt.x, cy: lblPt.y, r: 12,
      fill: isNow ? '#e2a84b' : '#16201f',
      stroke: '#e2a84b', 'stroke-width': 1.4,
    }));
    svg.append(svgEl('text', {
      x: lblPt.x, y: lblPt.y + 4, 'text-anchor': 'middle',
      fill: isNow ? '#141b1a' : '#ebe4d4', 'font-size': '9.5', 'font-weight': '700',
      text: `T${tIdx + 1}`,
    }));

    const rep = historyReports[tIdx];
    const probes = rep?.sections?.probes ?? [];
    probes.slice(0, 3).forEach((pr, pIdx) => {
      const dp = polar(CX, CY, 285 + pIdx * 55, deg);
      svg.append(dieGlyph(dp.x, dp.y, pr.roll ?? 7, '#82b889'));
    });
  }

  // Active Turn Probes & World Roll along the final approach to 12 o'clock (332°..354°)
  orders.forEach((o, idx) => {
    const deg = 330 + idx * 10;
    const pt = polar(CX, CY, 345 + idx * 52, deg);
    if (o.probe) {
      const rolled = Number.isInteger(o.probe.wurf);
      const dieG = svgEl('g', {
        class: rolled ? '' : 'svg-klickbar strom-wuerfel-offen',
        ...(rolled ? {} : {
          'data-strom-roll-order': o.id,
          role: 'button',
          tabindex: '0',
          'aria-label': `${t('ui.wuerfeln')}: ${o.titel ?? o.id}`,
        }),
      });
      dieG.append(dieGlyph(pt.x, pt.y, rolled ? o.probe.wurf : 7, rolled ? '#82b889' : '#e2a84b'));
      dieG.append(svgEl('text', {
        x: pt.x, y: pt.y + 22, 'text-anchor': 'middle',
        fill: rolled ? '#82b889' : '#e2a84b',
        'font-size': '10.5', 'font-weight': '700',
        text: rolled ? `${o.probe.wurf}${signed(o.probe.mod ?? 0)}▸${o.probe.ziel}` : `🎲▸${o.probe.ziel}`,
      }));
      if (!rolled) dieG.addEventListener('click', () => game.rollOrder?.(o.id));
      svg.append(dieG);
    }
  });

  if (model.weltwurf) {
    const wPt = polar(CX, CY, 488, 344);
    const isOpen = Boolean(model.weltwurf.offen);
    const wG = svgEl('g', {
      id: 'strom-weltwurf',
      class: isOpen ? 'svg-klickbar strom-wuerfel-offen' : '',
      ...(isOpen ? { role: 'button', tabindex: '0', 'aria-label': t('season.world-roll') } : {}),
    });
    wG.append(dieGlyph(wPt.x, wPt.y, isOpen ? 7 : (model.weltwurf.wurf ?? 7), isOpen ? '#e2a84b' : '#82b889'));
    wG.append(svgEl('text', {
      x: wPt.x, y: wPt.y + 22, 'text-anchor': 'middle',
      fill: isOpen ? '#e2a84b' : '#82b889', 'font-size': '11', 'font-weight': '700',
      text: isOpen ? `🎲 ${t('season.world-roll')}` : `Welt: ${model.weltwurf.wurf}`,
    }));
    if (isOpen) wG.addEventListener('click', () => game.rollWorld?.());
    svg.append(wG);
  }

  // --------------------------------------------------------------------------
  // 12 O'CLOCK ZENITH (0° / 360°): THE CIRCLE CLOSES — TURN SEAL & SEASON SUN
  // --------------------------------------------------------------------------
  const cal = calendarOf(game.env.regeln, game.view.turn);
  const ready = !hasOpenOrderRoll && !hasOpenWorldRoll && (model.probleme ?? []).length === 0 && game.view?.phase === 'planning';
  const sealPt = polar(CX, CY, 515, 0);

  const sealG = svgEl('g', {
    id: 'strom-zug-siegel',
    class: `svg-klickbar${ready ? ' is-ready' : ''}`,
    role: 'button',
    tabindex: '0',
    'aria-label': t('season.end'),
  });
  sealG.append(
    svgEl('circle', {
      cx: sealPt.x, cy: sealPt.y, r: 34,
      fill: ready ? 'rgba(130,184,137,0.22)' : 'rgba(184,74,62,0.25)',
      stroke: ready ? '#82b889' : '#e2a84b',
      'stroke-width': 2.8,
    }),
    svgEl('circle', {
      cx: sealPt.x, cy: sealPt.y, r: 26,
      fill: 'none',
      stroke: ready ? 'rgba(130,184,137,0.65)' : 'rgba(215,154,73,0.5)',
      'stroke-width': 1.2,
      'stroke-dasharray': ready ? 'none' : '3 3',
    }),
    svgEl('text', {
      x: sealPt.x, y: sealPt.y + 6,
      'text-anchor': 'middle',
      fill: ready ? '#82b889' : '#e7b96b',
      'font-size': '20',
      text: ready ? '✦' : '🎲',
    }),
    svgEl('text', {
      x: sealPt.x, y: sealPt.y - 44,
      'text-anchor': 'middle',
      fill: '#ebe4d4',
      'font-family': FONT_WORLD,
      'font-size': '13.5',
      'font-weight': '700',
      'letter-spacing': '0.06em',
      text: `${t('season.' + cal.season).toUpperCase()} · J.${cal.year} · T${game.view.turn + 1}`,
    }),
    svgEl('text', {
      x: sealPt.x, y: sealPt.y + 50,
      'text-anchor': 'middle',
      fill: ready ? '#82b889' : '#e7b96b',
      'font-family': FONT_WORLD,
      'font-size': '11.5',
      'font-weight': '700',
      text: (hasOpenOrderRoll || hasOpenWorldRoll) ? `${t('ui.wuerfeln')} · ${t('season.end')}` : t('season.end'),
    }),
  );
  sealG.addEventListener('click', () => triggerTurnSealOrRoll(game, model));
  svg.append(sealG);

  stage.append(canvasWrap, svg);
  host.replaceChildren(stage);

  // Paint the circular settlement ocular canvas
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const people = game.view.peoples[game.pid];
    const assign = game.draft.assign ?? people.population.assigned ?? {};
    const season = SEASON_SCENE[cal.season] ?? (cal.winter ? 'winter' : 'spring');
    const landscape = game.pack?.welt?.creation?.world?.landscape || 'riverlands';
    ctx.setTransform(300 / COMMUNITY_SIZE.width, 0, 0, 300 / COMMUNITY_SIZE.height, 0, 0);
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
    }, 1.0);
  }
}

// ============================================================================
// PROTOTYPE III: HUMBOLDT-NATURGEMÄLDE (Topographic Cross-Section & Core Sample)
// ============================================================================
export function renderNaturgemaelde(host, game, model, historyReports = []) {
  const W = 1280;
  const H = 1360;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'proto-svg naturgemaelde-svg',
    role: 'img',
    'aria-label': 'Humboldt-Naturgemälde',
  });

  const cal = calendarOf(game.env.regeln, game.view.turn);
  const people = game.view.peoples[game.pid];

  const defs = svgEl('defs', {},
    svgEl('linearGradient', { id: 'humboldtSky', x1: '0', y1: '0', x2: '0', y2: '1' },
      svgEl('stop', { offset: '0%', 'stop-color': '#131f24' }),
      svgEl('stop', { offset: '62%', 'stop-color': '#1e2f2b' }),
      svgEl('stop', { offset: '100%', 'stop-color': '#2c382b' }),
    ),
    svgEl('linearGradient', { id: 'humboldtEarth', x1: '0', y1: '0', x2: '0', y2: '1' },
      svgEl('stop', { offset: '0%', 'stop-color': '#32291f' }),
      svgEl('stop', { offset: '55%', 'stop-color': '#1d1a17' }),
      svgEl('stop', { offset: '100%', 'stop-color': '#101312' }),
    ),
  );
  svg.append(defs);

  svg.append(svgEl('rect', {
    x: 40, y: 20, width: W - 80, height: 470, rx: 8,
    fill: 'url(#humboldtSky)', stroke: 'rgba(215,154,73,0.34)', 'stroke-width': 1.6,
  }));

  const altLabels = ['V · Hochkamm', 'IV · Bergstufe', 'III · Hügelland', 'II · Flussterrasse', 'I · Auenbecken', '0 · Mündung'];
  altLabels.forEach((lbl, idx) => {
    const y = 82 + idx * 68;
    svg.append(svgEl('line', {
      x1: 55, y1: y, x2: W - 55, y2: y,
      stroke: 'rgba(235,228,212,0.1)', 'stroke-dasharray': '3 6',
    }));
    svg.append(svgEl('text', {
      x: 64, y: y - 5,
      fill: 'rgba(215,154,73,0.75)', 'font-size': '10.5', 'font-family': FONT_WORLD,
      text: lbl,
    }));
  });

  const hexItems = collectCandidateHexes(game, model).sort((a, b) => {
    const ea = TERRAIN_ELEV[a.tile.terrain]?.elev ?? 0.4;
    const eb = TERRAIN_ELEV[b.tile.terrain]?.elev ?? 0.4;
    return eb - ea;
  });

  const ridgePts = [[40, 490], [40, 145]];
  const hexCoordsOnProfile = [];
  hexItems.forEach((item, idx) => {
    const tInfo = TERRAIN_ELEV[item.tile.terrain] ?? { elev: 0.4, col: '#6b7a58', band: 'II' };
    const x = 180 + (idx / Math.max(1, hexItems.length - 1)) * 940;
    const y = 440 - tInfo.elev * 300;
    ridgePts.push([x, y]);
    hexCoordsOnProfile.push({ item, x, y, tInfo });
  });
  ridgePts.push([W - 40, 435], [W - 40, 490]);

  svg.append(svgEl('path', {
    d: `M ${ridgePts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`,
    fill: 'url(#humboldtEarth)',
    stroke: '#d79a49',
    'stroke-width': 2.4,
  }));

  svg.append(svgEl('text', {
    x: W / 2, y: 54,
    'text-anchor': 'middle',
    fill: '#ebe4d4',
    'font-family': FONT_WORLD,
    'font-size': '17',
    'letter-spacing': '0.08em',
    text: `${people?.name ?? 'Volk'}  ·  ${t('season.' + cal.season).toUpperCase()} J.${cal.year} (T${game.view.turn + 1})`,
  }));

  hexCoordsOnProfile.forEach(({ item, x, y, tInfo }) => {
    svg.append(svgEl('line', {
      x1: x, y1: y, x2: x, y2: 490,
      stroke: tInfo.col, 'stroke-opacity': '0.55', 'stroke-width': item.isHome ? 3.2 : 1.5,
      'stroke-dasharray': item.isHome ? 'none' : '4 4',
    }));

    svg.append(svgEl('circle', {
      cx: x, cy: y, r: item.isHome ? 17 : 12,
      fill: tInfo.col,
      stroke: item.queuedHere.length ? '#e2a84b' : '#ebe4d4',
      'stroke-width': item.isHome ? 2.6 : 1.5,
    }));

    if (item.isHome) {
      svg.append(svgEl('path', {
        d: `M ${x - 14} ${y - 17} L ${x} ${y - 36} L ${x + 14} ${y - 17} Z`,
        fill: '#e2a84b',
      }));
    }

    svg.append(svgTwoLineText(x, y + 27, item.label, {
      fill: '#ebe4d4',
      'font-size': '10.5',
      'font-weight': item.isHome ? '700' : '600',
      maxChars: 15,
    }));
    svg.append(svgEl('text', {
      x: x, y: y + 48,
      'text-anchor': 'middle',
      fill: 'rgba(235,228,212,0.58)',
      'font-size': '9.5',
      text: item.coord,
    }));

    const flagY = y - (item.isHome ? 50 : 34);
    if (item.queuedHere.length > 0) {
      const q = item.queuedHere[0];
      const fG = svgEl('g', {
        class: 'svg-klickbar',
        role: 'button',
        tabindex: '0',
        'aria-label': `${q.titel ?? q.id} (${t('board.blocker.withdraw')})`,
      });
      fG.append(
        svgEl('line', { x1: x, y1: y - 12, x2: x, y2: flagY, stroke: '#e2a84b', 'stroke-width': 2 }),
        svgEl('rect', { x: x - 15, y: flagY - 12, width: 30, height: 19, rx: 4, fill: '#e2a84b' }),
        svgEl('text', { x, y: flagY + 1, 'text-anchor': 'middle', fill: '#141b1a', 'font-size': '11', 'font-weight': '700', text: q.slot === 'haupt' ? 'H✓' : 'N✓' }),
      );
      fG.addEventListener('click', () => game.removeOrder(q.id));
      svg.append(fG);
    } else {
      if (item.mainAct) {
        const hG = svgEl('g', {
          class: 'svg-klickbar',
          role: 'button',
          tabindex: '0',
          'aria-label': `${item.mainAct.titel}: ${item.label}`,
        });
        hG.append(
          svgEl('circle', { cx: x - 11, cy: flagY, r: 10, fill: '#16201f', stroke: '#e2a84b', 'stroke-width': 1.6 }),
          svgEl('text', { x: x - 11, y: flagY + 3.5, 'text-anchor': 'middle', fill: '#e2a84b', 'font-size': '10', 'font-weight': '700', text: 'H' }),
        );
        hG.addEventListener('click', () => game.addOption(item.mainAct));
        svg.append(hG);
      }
      if (item.minorAct && item.minorAct !== item.mainAct) {
        const nG = svgEl('g', {
          class: 'svg-klickbar',
          role: 'button',
          tabindex: '0',
          'aria-label': `${item.minorAct.titel}: ${item.label}`,
        });
        nG.append(
          svgEl('circle', { cx: x + 11, cy: flagY, r: 10, fill: '#16201f', stroke: '#7ec4ba', 'stroke-width': 1.6 }),
          svgEl('text', { x: x + 11, y: flagY + 3.5, 'text-anchor': 'middle', fill: '#7ec4ba', 'font-size': '10', 'font-weight': '700', text: 'N' }),
        );
        nG.addEventListener('click', () => game.addOption(item.minorAct));
        svg.append(nG);
      }
    }
  });

  // MIDDLE SECTION (y = 505..930): Subterranean Hydraulic Sluices & Root-Vein Knowledge
  svg.append(svgEl('rect', {
    x: 40, y: 505, width: W - 80, height: 420, rx: 8,
    fill: '#111817', stroke: 'rgba(215,154,73,0.26)', 'stroke-width': 1.3,
  }));

  const { stations, totalClans, adjust } = getLabourState(game);
  const resMap = Object.fromEntries((model.ressourcen ?? []).map((r) => [r.key, r]));

  stations.forEach((st, idx) => {
    const y = 585 + idx * 112;
    const res = resMap[st.resKey] ?? { wert: 0, netto: 0 };

    svg.append(svgEl('rect', {
      x: 75, y: y - 28, width: 230, height: 56, rx: 8,
      fill: '#172220', stroke: st.color, 'stroke-width': 1.6,
    }));
    svg.append(svgEl('text', {
      x: 190, y: y - 34, 'text-anchor': 'middle',
      fill: st.color, 'font-size': '11.5', 'font-weight': '700',
      text: `${st.glyph} ${st.label}`,
    }));

    for (let s = 0; s < totalClans; s++) {
      const activeFig = s < st.count;
      svg.append(miniSippeSvg(124 + s * 22, y + 2, activeFig ? st.color : '#ebe4d4', 0.72, activeFig ? 1 : 0.18));
    }

    const canDec = st.count > 0 && game.view?.phase === 'planning';
    const decG = svgEl('g', { class: canDec ? 'svg-klickbar' : '', role: 'button', tabindex: '0', 'aria-label': `${st.label} −` });
    decG.append(
      svgEl('circle', { cx: 95, cy: y, r: 11, fill: '#121918', stroke: st.color, 'stroke-width': 1.4 }),
      svgEl('text', { x: 95, y: y + 4, 'text-anchor': 'middle', fill: '#ebe4d4', 'font-size': '14', 'font-weight': '700', text: '−' }),
    );
    if (canDec) decG.addEventListener('click', () => adjust(st.key, -1));
    svg.append(decG);

    const canInc = st.count < totalClans && game.view?.phase === 'planning';
    const incG = svgEl('g', { class: canInc ? 'svg-klickbar' : '', role: 'button', tabindex: '0', 'aria-label': `${st.label} +` });
    incG.append(
      svgEl('circle', { cx: 284, cy: y, r: 11, fill: '#121918', stroke: st.color, 'stroke-width': 1.4 }),
      svgEl('text', { x: 284, y: y + 4, 'text-anchor': 'middle', fill: '#ebe4d4', 'font-size': '14', 'font-weight': '700', text: '+' }),
    );
    if (canInc) incG.addEventListener('click', () => adjust(st.key, 1));
    svg.append(incG);

    const pipeW = Math.max(3, st.count * 5);
    svg.append(svgEl('path', {
      d: `M 305 ${y} C 365 ${y}, 405 ${y}, 460 ${y}`,
      fill: 'none', stroke: st.color, 'stroke-width': pipeW, 'stroke-opacity': '0.68',
    }));

    svg.append(svgEl('circle', {
      cx: 495, cy: y, r: 30,
      fill: '#151e1d', stroke: st.color, 'stroke-width': 2.2,
    }));
    svg.append(svgEl('text', {
      x: 495, y: y + 5,
      'text-anchor': 'middle', fill: '#ebe4d4', 'font-size': '16', 'font-weight': '700',
      text: `${st.glyph} ${res.wert ?? 0}`,
    }));
    svg.append(svgEl('text', {
      x: 540, y: y + 5,
      fill: (res.netto ?? 0) > 0 ? '#82b889' : (res.netto ?? 0) < 0 ? '#d46a6a' : 'rgba(235,228,212,0.5)',
      'font-size': '13', 'font-weight': '700',
      text: (res.netto ?? 0) !== 0 ? signed(res.netto) : '±0',
    }));
  });

  const { praxis, bekannt, krone, activeResearchRef, selectResearch } = getKnowledgeData(game, model);
  praxis.forEach((p, idx) => {
    const y = 555 + idx * 60;
    svg.append(svgEl('circle', {
      cx: 660, cy: y, r: 16,
      fill: '#15201c', stroke: '#82b889', 'stroke-width': 1.8,
    }));
    svg.append(svgEl('text', {
      x: 660, y: y + 4, 'text-anchor': 'middle', fill: '#ebe4d4', 'font-size': '12', 'font-weight': '700',
      text: String(p.gewicht),
    }));
    svg.append(svgEl('text', {
      x: 686, y: y + 4, fill: 'rgba(235,228,212,0.88)', 'font-size': '11.5', 'font-weight': '600',
      text: p.name,
    }));
  });

  bekannt.slice(0, 5).forEach((b, idx) => {
    const y = 565 + idx * 66;
    svg.append(svgEl('line', {
      x1: 790, y1: y, x2: 880, y2: y,
      stroke: 'rgba(226,168,75,0.45)', 'stroke-width': 1.6,
    }));
    svg.append(svgEl('circle', {
      cx: 900, cy: y, r: 16,
      fill: '#172120', stroke: '#e2a84b', 'stroke-width': 2,
    }));
    svg.append(svgEl('text', {
      x: 900, y: y + 4, 'text-anchor': 'middle', fill: '#e2a84b', 'font-size': '11.5', 'font-weight': '700',
      text: '✓',
    }));
    svg.append(svgTwoLineText(900, y + 28, b.name, {
      fill: '#ebe4d4', 'font-size': '10', maxChars: 17,
    }));
  });

  krone.slice(0, 5).forEach((k, idx) => {
    const y = 565 + idx * 66;
    const isTarget = k.ref === activeResearchRef;
    const done = k.fortschritt ?? 0;
    const total = k.dauer ?? 6;
    const col = isTarget ? '#78b0c4' : '#d79a49';

    svg.append(svgEl('line', {
      x1: 920, y1: y, x2: 1075, y2: y,
      stroke: col, 'stroke-width': isTarget ? 2.4 : 1.4, 'stroke-dasharray': isTarget ? 'none' : '4 4',
    }));

    const nodeG = svgEl('g', {
      class: 'svg-klickbar',
      role: 'button',
      tabindex: '0',
      'aria-label': `${k.name} (${done}/${total})`,
    });
    nodeG.append(
      svgEl('polygon', {
        points: `1100,${y - 16} 1118,${y} 1100,${y + 16} 1082,${y}`,
        fill: isTarget ? '#182a30' : '#141d1c',
        stroke: col, 'stroke-width': isTarget ? 2.5 : 1.6,
      }),
      svgEl('text', {
        x: 1100, y: y + 4, 'text-anchor': 'middle', fill: '#ebe4d4', 'font-size': '10.5', 'font-weight': '700',
        text: `${done}/${total}`,
      }),
      svgTwoLineText(1100, y + 28, k.name, {
        fill: isTarget ? '#9ad0e4' : 'rgba(235,228,212,0.88)',
        'font-size': '10', 'font-weight': isTarget ? '700' : '500', maxChars: 18,
      }),
    );
    nodeG.addEventListener('click', () => selectResearch(k.ref));
    svg.append(nodeG);
  });

  // LOWER SECTION (y = 945..1340): Geological Borehole & Sediment Strata T1..Tn
  const totalTurns = Math.max(1, (game.view?.turn ?? 0) + 1);
  for (let tIdx = 0; tIdx < totalTurns; tIdx++) {
    const sy = 955 + tIdx * 52;
    const isNow = tIdx === game.view.turn;
    svg.append(svgEl('rect', {
      x: 60, y: sy, width: W - 120, height: 44, rx: 6,
      fill: isNow ? 'rgba(215,154,73,0.14)' : 'rgba(22,30,29,0.82)',
      stroke: isNow ? '#e2a84b' : 'rgba(235,228,212,0.16)',
      'stroke-width': isNow ? 1.8 : 1,
    }));
    svg.append(svgEl('text', {
      x: 92, y: sy + 27,
      fill: isNow ? '#e2a84b' : 'rgba(235,228,212,0.68)',
      'font-family': FONT_WORLD, 'font-size': '13', 'font-weight': '700',
      text: `T${tIdx + 1}`,
    }));

    const rep = historyReports[tIdx];
    const probes = rep?.sections?.probes ?? [];
    probes.slice(0, 5).forEach((pr, pIdx) => {
      svg.append(dieGlyph(210 + pIdx * 120, sy + 22, pr.roll ?? 7, '#82b889'));
      svg.append(svgEl('text', {
        x: 230 + pIdx * 120, y: sy + 26,
        fill: '#ebe4d4', 'font-size': '11.5',
        text: `${pr.roll ?? '?'}▸${pr.target ?? '?'}`,
      }));
    });
  }

  renderTurnSealBar(svg, W / 2, 1285, game, model);
  host.replaceChildren(svg);
}

// ============================================================================
// PROTOTYPE IV: KRÄFTE-WEBSTUHL (Cybernetic Warp & Weft Causal Matrix)
// ============================================================================
export function renderWebstuhl(host, game, model) {
  const W = 1280;
  const H = 1320;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    class: 'proto-svg webstuhl-svg',
    role: 'img',
    'aria-label': 'Kräfte-Webstuhl',
  });

  svg.append(svgEl('rect', {
    x: 36, y: 24, width: W - 72, height: H - 48, rx: 10,
    fill: '#0e1413', stroke: 'rgba(215,154,73,0.36)', 'stroke-width': 1.8,
  }));

  // 1. VERTICAL WARP THREADS (Die 5 Ressourcen-Kettfäden, x = 380..1060)
  const orderedKeys = ['nahrung', 'volk', 'wissen', 'zustimmung', 'material'];
  const byKey = new Map((model.ressourcen ?? []).map((r) => [r.key, r]));
  const resList = orderedKeys.map((k) => byKey.get(k)).filter(Boolean);
  const warpX = {};

  resList.forEach((res, idx) => {
    const x = 410 + idx * 165;
    warpX[res.key] = x;
    const pal = RES_PALETTE[res.key] ?? { color: '#d79a49', glyph: '●' };
    const strokeW = Math.max(2.5, Math.min(12, Math.abs(res.wert ?? 1) * 1.1));

    svg.append(svgEl('circle', {
      cx: x, cy: 88, r: 30,
      fill: '#16201f', stroke: pal.color, 'stroke-width': 2.4,
    }));
    svg.append(svgEl('text', {
      x, y: 94, 'text-anchor': 'middle',
      fill: '#ebe4d4', 'font-size': '15.5', 'font-weight': '700',
      text: `${pal.glyph} ${res.wert ?? 0}`,
    }));
    svg.append(svgEl('text', {
      x, y: 46, 'text-anchor': 'middle',
      fill: pal.color, 'font-family': FONT_WORLD, 'font-size': '12', 'font-weight': '600',
      text: res.name,
    }));

    svg.append(svgEl('line', {
      x1: x, y1: 118, x2: x, y2: 1100,
      stroke: pal.color, 'stroke-width': strokeW, 'stroke-opacity': '0.45',
    }));

    const delta = res.netto ?? 0;
    const nextVal = (res.wert ?? 0) + delta;
    svg.append(svgEl('circle', {
      cx: x, cy: 1132, r: 28,
      fill: '#16201f', stroke: pal.color, 'stroke-width': 2.2,
    }));
    svg.append(svgEl('text', {
      x, y: 1137, 'text-anchor': 'middle',
      fill: delta < 0 ? '#d46a6a' : delta > 0 ? '#82b889' : '#ebe4d4',
      'font-size': '14', 'font-weight': '700',
      text: `${nextVal} (${delta !== 0 ? signed(delta) : '±0'})`,
    }));
  });

  // 2. HORIZONTAL WEFT THREADS — Group A: 3 Sippen Labour Shuttles (y = 190..350)
  const { stations, totalClans, adjust } = getLabourState(game);
  const fc = game.base?.forecast ?? {};

  stations.forEach((st, idx) => {
    const y = 195 + idx * 78;
    const inc = fc.income?.[st.resKey] ?? st.count;

    svg.append(svgEl('line', {
      x1: 280, y1: y, x2: 1140, y2: y,
      stroke: st.color,
      'stroke-width': Math.max(1.8, st.count * 2.8),
      'stroke-opacity': st.count > 0 ? '0.72' : '0.22',
    }));

    svg.append(svgEl('rect', {
      x: 64, y: y - 24, width: 216, height: 48, rx: 24,
      fill: '#16201f', stroke: st.color, 'stroke-width': 1.8,
    }));

    const canDec = st.count > 0 && game.view?.phase === 'planning';
    const decG = svgEl('g', { class: canDec ? 'svg-klickbar' : '', role: 'button', tabindex: '0', 'aria-label': `${st.label} −` });
    decG.append(
      svgEl('circle', { cx: 90, cy: y, r: 12, fill: '#111817', stroke: st.color }),
      svgEl('text', { x: 90, y: y + 4, 'text-anchor': 'middle', fill: '#ebe4d4', 'font-size': '14', 'font-weight': '700', text: '−' }),
    );
    if (canDec) decG.addEventListener('click', () => adjust(st.key, -1));
    svg.append(decG);

    for (let s = 0; s < totalClans; s++) {
      const activeFig = s < st.count;
      svg.append(miniSippeSvg(124 + s * 22, y + 2, activeFig ? st.color : '#ebe4d4', 0.68, activeFig ? 1 : 0.18));
    }

    const canInc = st.count < totalClans && game.view?.phase === 'planning';
    const incG = svgEl('g', { class: canInc ? 'svg-klickbar' : '', role: 'button', tabindex: '0', 'aria-label': `${st.label} +` });
    incG.append(
      svgEl('circle', { cx: 254, cy: y, r: 12, fill: '#111817', stroke: st.color }),
      svgEl('text', { x: 254, y: y + 4, 'text-anchor': 'middle', fill: '#ebe4d4', 'font-size': '14', 'font-weight': '700', text: '+' }),
    );
    if (canInc) incG.addEventListener('click', () => adjust(st.key, 1));
    svg.append(incG);

    const ix = warpX[st.resKey] ?? 410;
    const rBead = 12 + st.count * 3.2;
    svg.append(svgEl('circle', {
      cx: ix, cy: y, r: rBead,
      fill: st.color, stroke: '#141b1a', 'stroke-width': 2.2,
    }));
    svg.append(svgEl('text', {
      x: ix, y: y + 4, 'text-anchor': 'middle',
      fill: '#141b1a', 'font-size': '12', 'font-weight': '700',
      text: `+${inc}`,
    }));
  });

  // 3. HORIZONTAL WEFT THREADS — Group B: Hex Action Shuttles (y = 445..765)
  const hexItems = collectCandidateHexes(game, model).slice(0, 5);
  hexItems.forEach((item, idx) => {
    const y = 455 + idx * 66;
    const active = item.queuedHere.length > 0;
    const tInfo = TERRAIN_ELEV[item.tile.terrain] ?? { col: '#6c7d5c' };

    svg.append(svgEl('line', {
      x1: 280, y1: y, x2: 1140, y2: y,
      stroke: active ? '#e2a84b' : 'rgba(235,228,212,0.22)',
      'stroke-width': active ? 3.2 : 1.3,
      'stroke-dasharray': active ? 'none' : '5 5',
    }));

    svg.append(svgEl('rect', {
      x: 56, y: y - 22, width: 226, height: 44, rx: 8,
      fill: '#16201f', stroke: active ? '#e2a84b' : tInfo.col, 'stroke-width': 1.6,
    }));
    svg.append(svgEl('text', {
      x: 70, y: y - 2,
      fill: '#ebe4d4', 'font-size': '10.5', 'font-weight': '600',
      text: String(item.label),
    }));
    svg.append(svgEl('text', {
      x: 70, y: y + 12,
      fill: 'rgba(235,228,212,0.62)', 'font-size': '9.5',
      text: `${item.coord} · d=${item.dist}`,
    }));

    if (active) {
      const q = item.queuedHere[0];
      const qG = svgEl('g', { class: 'svg-klickbar', role: 'button', tabindex: '0', 'aria-label': `${q.titel ?? q.id} (${t('board.blocker.withdraw')})` });
      qG.append(
        svgEl('circle', { cx: 254, cy: y, r: 12, fill: '#e2a84b' }),
        svgEl('text', { x: 254, y: y + 4, 'text-anchor': 'middle', fill: '#141b1a', 'font-size': '11', 'font-weight': '700', text: q.slot === 'haupt' ? 'H✓' : 'N✓' }),
      );
      qG.addEventListener('click', () => game.removeOrder(q.id));
      svg.append(qG);
    } else {
      if (item.mainAct) {
        const hG = svgEl('g', { class: 'svg-klickbar', role: 'button', tabindex: '0', 'aria-label': item.mainAct.titel });
        hG.append(
          svgEl('circle', { cx: 224, cy: y, r: 11, fill: '#121918', stroke: '#e2a84b', 'stroke-width': 1.6 }),
          svgEl('text', { x: 224, y: y + 4, 'text-anchor': 'middle', fill: '#e2a84b', 'font-size': '10.5', 'font-weight': '700', text: 'H' }),
        );
        hG.addEventListener('click', () => game.addOption(item.mainAct));
        svg.append(hG);
      }
      if (item.minorAct && item.minorAct !== item.mainAct) {
        const nG = svgEl('g', { class: 'svg-klickbar', role: 'button', tabindex: '0', 'aria-label': item.minorAct.titel });
        nG.append(
          svgEl('circle', { cx: 254, cy: y, r: 11, fill: '#121918', stroke: '#7ec4ba', 'stroke-width': 1.6 }),
          svgEl('text', { x: 254, y: y + 4, 'text-anchor': 'middle', fill: '#7ec4ba', 'font-size': '10.5', 'font-weight': '700', text: 'N' }),
        );
        nG.addEventListener('click', () => game.addOption(item.minorAct));
        svg.append(nG);
      }
    }

    const targetRes = idx % 3 === 0 ? 'nahrung' : idx % 3 === 1 ? 'material' : 'zustimmung';
    const ix = warpX[targetRes] ?? 410;
    svg.append(svgEl('circle', {
      cx: ix, cy: y, r: active ? 15 : 8.5,
      fill: active ? '#e2a84b' : '#182220',
      stroke: active ? '#ebe4d4' : tInfo.col,
      'stroke-width': 1.8,
    }));
    if (active) {
      svg.append(svgEl('text', {
        x: ix, y: y + 4, 'text-anchor': 'middle',
        fill: '#141b1a', 'font-size': '10.5', 'font-weight': '700',
        text: '✦',
      }));
    }
  });

  // 4. HORIZONTAL WEFT THREADS — Group C: Practice & Research Shuttles (y = 815..1055)
  const { praxis, krone, activeResearchRef, selectResearch } = getKnowledgeData(game, model);
  praxis.slice(0, 4).forEach((p, idx) => {
    const y = 825 + idx * 64;
    svg.append(svgEl('line', {
      x1: 280, y1: y, x2: 1140, y2: y,
      stroke: '#78b0c4', 'stroke-width': 1.8, 'stroke-opacity': '0.48',
    }));
    svg.append(svgEl('rect', {
      x: 64, y: y - 19, width: 216, height: 38, rx: 6,
      fill: '#16201f', stroke: '#82b889', 'stroke-width': 1.5,
    }));
    svg.append(svgEl('text', {
      x: 80, y: y + 4, fill: '#ebe4d4', 'font-size': '11.5', 'font-weight': '600',
      text: `${p.name} · Rang ${p.gewicht}`,
    }));

    const k = krone[idx];
    if (k) {
      const ix = warpX.wissen ?? 740;
      const isTarget = k.ref === activeResearchRef;
      const done = k.fortschritt ?? 0;
      const total = k.dauer ?? 6;
      const col = isTarget ? '#78b0c4' : '#d79a49';

      const bG = svgEl('g', {
        class: 'svg-klickbar',
        role: 'button',
        tabindex: '0',
        'aria-label': `${k.name} (${done}/${total})`,
      });
      bG.append(
        svgEl('circle', {
          cx: ix + (idx % 2 === 0 ? -70 : 70), cy: y, r: isTarget ? 18 : 15,
          fill: isTarget ? '#182a30' : '#141d1c',
          stroke: col, 'stroke-width': isTarget ? 2.6 : 1.7,
        }),
        svgEl('text', {
          x: ix + (idx % 2 === 0 ? -70 : 70), y: y + 4, 'text-anchor': 'middle',
          fill: '#ebe4d4', 'font-size': '10.5', 'font-weight': '700',
          text: `${done}/${total}`,
        }),
        svgTwoLineText(ix + (idx % 2 === 0 ? -70 : 70), y + 29, k.name, {
          fill: isTarget ? '#9ad0e4' : '#ebe4d4', 'font-size': '10', 'font-weight': '600', maxChars: 18,
        }),
      );
      bG.addEventListener('click', () => selectResearch(k.ref));
      svg.append(bG);
    }
  });

  // 5. BOTTOM SELVEDGE (y = 1235): Turn Seal & 2d6 Loom Dice
  renderTurnSealBar(svg, W / 2, 1235, game, model);
  host.replaceChildren(svg);
}

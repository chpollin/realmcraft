// Zwischenzug: the Weltgeschehen panel between two seasons, with the kernel's
// results from the round report and the agent steps of status.json.

import { el, signed } from '../dom.js';
import { icon } from '../icons.js';
import { closeButton } from './kontext.js';
import { withTip } from './tip.js';
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
  const rows = zz.agenten;
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
 * severity, text, refs), shaped as result rows. They replace the step's
 * finding proposals, which carry no severity.
 */
function findingRows(api, a) {
  const step = (api.game.status?.steps ?? []).find((x) => x.id === a.step);
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

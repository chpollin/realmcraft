// Read side of the campaign bridge. The campaign folder is written only by
// engine/cli.mjs. The server exposes the player's fog-filtered projections
// read-only; everything else in a campaign (state, library, world lock,
// drafts of other peoples, agent tasks, journal, raw reports) stays
// unreachable.
import { readFile, readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { CAMPAIGNS_DIR, ID_RE } from './config.mjs';
import { notFound, readJson, sendFile, sendJson } from './http.mjs';
import { worldRules } from './worlds.mjs';

const REF_RE = /^[a-z][a-z0-9-]{1,40}@[1-9][0-9]*$/;
const TURN_FILE_RE = /^T\d{4}\.json$/;
const NARRATIVE_DIR_RE = /^[A-Za-z0-9_-]+$/;
const NARRATIVE_FILE_RE = /^[A-Za-z0-9_-]+\.(?:md|png|jpg|jpeg|webp|json)$/;

/** The player people of a campaign, or null for an unknown or invalid campaign. */
export async function playerOf(cid) {
  if (typeof cid !== 'string' || !ID_RE.test(cid)) return null;
  const index = await readJson(join(CAMPAIGNS_DIR, 'index.json'));
  const row = Array.isArray(index?.campaigns) ? index.campaigns.find((c) => c?.id === cid) : null;
  const player = row?.player ?? (await readJson(join(CAMPAIGNS_DIR, cid, 'world.lock.json')))?.player;
  return typeof player === 'string' && ID_RE.test(player) ? player : null;
}

/**
 * True for every spelling of a path into /campaigns. The gate looks at the
 * normalised path (dot segments, backslashes, trailing dots and spaces that
 * Windows ignores, case) so no spelling reaches the static handler; the file
 * handler then matches the raw segments strictly. The raw form counts too, so
 * /campaigns/x/../../package.json is refused instead of collapsing into an
 * ordinary static file.
 */
export function isCampaignPath(pathname) {
  const slashed = pathname.replace(/\\/g, '/');
  const clean = (p) => p.split('/').map((s) => s.replace(/[. ]+$/, '')).join('/').toLowerCase();
  const isCampaigns = (g) => g === '/campaigns' || g.startsWith('/campaigns/');
  return isCampaigns(clean(slashed)) || isCampaigns(clean(posix.normalize(slashed)));
}

// The raw report holds every people's orders, probes and draws, which would break
// fog of war, so only a summary reduced to the player is served.
async function sendReportSummary(res, cid, player, file) {
  const report = await readJson(join(CAMPAIGNS_DIR, cid, 'log', file));
  if (!report || report.format !== 'realmcraft-report') return notFound(res);
  // Lazy: a half-edited engine must not stop the dev server from starting.
  const { projectEvents } = await import('../engine/core/project.js');
  const s = report.sections ?? {};
  const mine = (list) => (Array.isArray(list) ? list.filter((x) => x?.people === player) : []);
  sendJson(res, 200, {
    format: 'realmcraft-report-summary',
    version: 1,
    campaign: report.campaign,
    turn: report.turn,
    people: player,
    revBefore: report.revBefore,
    revAfter: report.revAfter,
    sections: {
      calendar: s.calendar,
      orders: mine(s.orders),
      probes: mine(s.probes),
      ...(s.draws?.[player] !== undefined ? { draws: { [player]: s.draws[player] } } : {}),
      substitutions: [],
    },
    events: projectEvents(Array.isArray(report.events) ? report.events : [], player),
  });
}

/**
 * GET of a campaign file. Strict whitelist on the decoded segments: anything
 * not matched is a 404, so dot segments, backslashes and foreign peoples'
 * views never resolve to a file.
 */
export async function handleCampaignFile(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return notFound(res);
  const parts = pathname.split('/');
  if (parts[1] !== 'campaigns') return notFound(res);
  const [cid, ...t] = parts.slice(2);
  if (cid === 'index.json' && t.length === 0) return sendFile(res, join(CAMPAIGNS_DIR, 'index.json'));
  const player = await playerOf(cid);
  if (!player) return notFound(res);
  const dir = join(CAMPAIGNS_DIR, cid);
  if (t[0] === 'view') {
    if (t.length === 2 && t[1] === `${player}.json`) return sendFile(res, join(dir, 'view', t[1]));
    if (t.length === 4 && t[1] === player && t[2] === 'events' && TURN_FILE_RE.test(t[3])) {
      return sendFile(res, join(dir, 'view', player, 'events', t[3]));
    }
  } else if (t.length === 1 && t[0] === 'status.json') {
    return sendFile(res, join(dir, 'status.json'));
  } else if (t[0] === 'narrative' && t.length >= 2) {
    const last = t.at(-1);
    if (t.slice(1, -1).every((s) => NARRATIVE_DIR_RE.test(s)) && NARRATIVE_FILE_RE.test(last)) {
      return sendFile(res, join(dir, ...t));
    }
  } else if (t[0] === 'log' && t.length === 2 && TURN_FILE_RE.test(t[1])) {
    return sendReportSummary(res, cid, player, t[1]);
  }
  return notFound(res);
}

// The settings default of the kernel (plan M1) for campaigns written before them.
const SETTINGS_DEFAULT = { difficulty: 'normal', language: 'de' };

/** Outcome for the player: the kernel's derived outcome, else one built from state.result. */
function outcomeOf(view, player) {
  if (view?.status !== 'ended') return null;
  const derived = view.derived?.[player]?.outcome;
  if (derived) return derived;
  const r = view.result;
  return r ? { kind: r.kind ?? null, winner: r.winner ?? null, won: r.winner === player, turn: r.turn ?? null, reason: r.reason ?? null, summary: null } : null;
}

/**
 * One row of the campaign list from the index row and the player's view,
 * so nothing beyond the player's projection is read out.
 */
async function campaignRow(row, calendarOf) {
  const player = row.player;
  const view = await readJson(join(CAMPAIGNS_DIR, row.id, 'view', `${player}.json`));
  const turn = Number.isInteger(view?.turn) ? view.turn : row.turn ?? null;
  const regeln = await worldRules(row.world);
  let cal = null;
  try {
    cal = regeln && Number.isInteger(turn) ? calendarOf(regeln, turn) : null;
  } catch {
    // a package without a calendar: the row goes out without season
  }
  const settings = { ...SETTINGS_DEFAULT, ...(view?.settings ?? {}) };
  const status = view?.status ?? row.status ?? null;
  return {
    id: row.id,
    world: row.world ?? null,
    people: { id: player, name: view?.peoples?.[player]?.name ?? player },
    turn,
    season: cal?.season ?? null,
    year: cal?.year ?? null,
    phase: view?.phase ?? null,
    status,
    outcome: outcomeOf(view, player),
    language: settings.language,
    difficulty: settings.difficulty,
    updatedAt: row.updatedAt ?? null,
  };
}

/** GET /api/campaigns: the campaigns of index.json, newest first. */
export async function handleCampaignList(_req, res) {
  const index = await readJson(join(CAMPAIGNS_DIR, 'index.json'));
  const rows = (Array.isArray(index?.campaigns) ? index.campaigns : [])
    .filter((r) => typeof r?.id === 'string' && ID_RE.test(r.id) && typeof r.player === 'string' && ID_RE.test(r.player));
  // Lazy: a half-edited engine must not stop the dev server from starting.
  const { calendarOf } = await import('../engine/core/calendar.js');
  const list = await Promise.all(rows.map((r) => campaignRow(r, calendarOf)));
  list.sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  sendJson(res, 200, list);
}

// Refs ('id@rev') occurring anywhere in the player's view, so the browser can
// resolve agent-made content without receiving the rest of the library.
function collectRefs(node, out) {
  if (typeof node === 'string') {
    if (REF_RE.test(node)) out.add(node);
  } else if (Array.isArray(node)) {
    for (const x of node) collectRefs(x, out);
  } else if (node && typeof node === 'object') {
    for (const x of Object.values(node)) collectRefs(x, out);
  }
  return out;
}

/** GET /api/campaigns/<cid>/content|draft|chronik, the player's share of library, draft and chronicle. */
export async function handleCampaignApi(req, res, [cid, what]) {
  if (!ID_RE.test(cid)) return notFound(res);
  const player = await playerOf(cid);
  if (!player) return notFound(res);
  const dir = join(CAMPAIGNS_DIR, cid);
  if (what === 'content') {
    const view = await readJson(join(dir, 'view', `${player}.json`));
    const library = await readJson(join(dir, 'library.json'));
    if (!view || !Array.isArray(library?.entries)) return notFound(res);
    const refs = collectRefs(view, new Set());
    const items = library.entries.filter((e) => refs.has(e?.ref)).map((e) => e.data);
    return sendJson(res, 200, { format: 'realmcraft-content', version: 1, items });
  }
  if (what === 'draft') {
    return sendJson(res, 200, { draft: await readJson(join(dir, 'drafts', `${player}.json`)) });
  }
  const names = await readdir(join(dir, 'narrative', 'chronik')).catch(() => []);
  const entries = [];
  for (const file of names.filter((n) => /^T\d{4}\.md$/.test(n)).sort()) {
    const text = await readFile(join(dir, 'narrative', 'chronik', file), 'utf8').catch(() => null);
    if (text !== null) entries.push({ turn: Number(file.slice(1, 5)), file, text });
  }
  return sendJson(res, 200, { entries });
}

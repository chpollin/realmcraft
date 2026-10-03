// Zero-dependency static file server for RealmCraft.
// Used for local development and as Playwright's webServer.
//   node serve.mjs            -> http://localhost:4173
//   PORT=8080 node serve.mjs  -> http://localhost:8080
//
// Campaign bridge for the browser game board (spielbrett/). Root from
// REALMCRAFT_ROOT (default: this folder), campaigns below <root>/campaigns:
//   GET  /campaigns/...           fog-safe campaign files only (index, the
//                                 player's view and events, status, narrative,
//                                 log reports as a player-filtered summary)
//   GET  /api/campaigns/<cid>/content|draft|chronik
//   POST /api/draft, /api/seal    run engine/cli.mjs preview / seal
//   SSE  /events                  adds 'view', 'status', 'chronik', 'report'
//                                 with JSON data { campaign, file }
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { realpathSync, watch } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 4173;
// Standardmaessig nur an Loopback binden: der Dev-Server reicht den lokalen
// Gemini-Key ueber /env.js durch und soll nicht im LAN erreichbar sein. Ueber
// HOST=0.0.0.0 bewusst aufmachbar. http://localhost bleibt erreichbar.
const HOST = process.env.HOST || '127.0.0.1';

// Live-Reload: the file the terminal game-master (Claude Code) writes. Changes
// are pushed to open dashboards via Server-Sent-Events on /events.
const LIVE_FILE = 'savegame.json';
const sseClients = new Set();

// event: 'savegame' -> Dashboard spiegelt nur den Spielstand neu.
// event: 'reload'   -> Dashboard lädt die ganze Seite neu (Code hat sich geändert).
// event: 'view' | 'status' | 'chronik' | 'report' -> a campaign file changed,
//   data is JSON { campaign, file } (see watchCampaigns).
function broadcast(event, data = 'changed') {
  for (const res of sseClients) {
    try {
      res.write(`event: ${event}\ndata: ${data}\n\n`);
    } catch {
      sseClients.delete(res);
    }
  }
}

// Watch the directory, not the file directly: atomic rename-writes would kill a
// file watch. Debounce multiple events per write.
//
// Eine rekursive Beobachtung der ROOT meldet sowohl Spielstand- als auch
// Code-Änderungen: ist die geänderte Datei der Spielstand, spiegelt der Browser
// den Stand; ist es Code (js/css/html), lädt er komplett neu. Ohne diesen
// Code-Reload bliebe ein offener Tab nach Code-Änderungen auf altem JS hängen
// (z. B. ein neuer Reiter erscheint erst nach manuellem Refresh).
const CODE_RE = /\.(?:js|mjs|css|html)$/i;
// Playwright writes its reports (HTML plus JS) into the repo; without this
// exclusion every test run would reload open dashboards.
const IGNORED_DIRS = new Set(['node_modules', 'playwright-report', 'test-results', 'blob-report']);
let liveDebounce = null;
let reloadDebounce = null;
try {
  watch(ROOT, { recursive: true }, (_event, filename) => {
    if (!filename) return;
    const name = String(filename).replace(/\\/g, '/');
    if (name === LIVE_FILE) {
      if (liveDebounce) clearTimeout(liveDebounce);
      liveDebounce = setTimeout(() => broadcast('savegame'), 120);
      return;
    }
    // Code-Dateien, aber nicht versteckte Ordner (.git) oder IGNORED_DIRS.
    if (CODE_RE.test(name) && !name.split('/').some((s) => s.startsWith('.') || IGNORED_DIRS.has(s))) {
      if (reloadDebounce) clearTimeout(reloadDebounce);
      reloadDebounce = setTimeout(() => broadcast('reload'), 150);
    }
  });
} catch {
  // Without watch the server still runs, just without live reload.
}

// Reads .env (if present) and returns it as a plain object. Used to hand the
// Gemini key to the browser via /env.js without ever writing it to a tracked
// file. .env is gitignored; /env.js is generated in memory.
async function readEnvFile() {
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8');
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !line.trimStart().startsWith('#')) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// DNS rebinding: a foreign site whose name resolves to 127.0.0.1 is same-origin
// with itself and could read /env.js and savegame.json. Only loopback Host
// headers are accepted while bound to loopback; HOST=0.0.0.0 is a deliberate
// LAN opt-in, where the Host is the unknown LAN address.
const LOOPBACK_BIND = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'].map((h) => `${h}:${PORT}`));

function forbidden(res) {
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('403 Forbidden');
}

// --- Campaign bridge ---------------------------------------------------------
// The campaign folder is written only by engine/cli.mjs. This server exposes the
// player's fog-filtered projections read-only and forwards two commands to the
// CLI. Everything else in a campaign (state, library, world lock, drafts of
// other peoples, agent tasks, journal, raw reports) stays unreachable.
const CAMPAIGN_ROOT = resolve(process.env.REALMCRAFT_ROOT ?? ROOT);
const CAMPAIGNS_DIR = join(CAMPAIGN_ROOT, 'campaigns');
// PATTERNS.id of engine/schemas/common.js, duplicated so the dev server starts
// even while the engine is being edited.
const ID_RE = /^[a-z][a-z0-9-]{1,40}$/;
const REF_RE = /^[a-z][a-z0-9-]{1,40}@[1-9][0-9]*$/;
const TURN_FILE_RE = /^T\d{4}\.json$/;
const NARRATIVE_DIR_RE = /^[A-Za-z0-9_-]+$/;
const NARRATIVE_FILE_RE = /^[A-Za-z0-9_-]+\.(?:md|png|jpg|jpeg|webp|json)$/;
const MAX_BODY = 64 * 1024;
const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const ALLOWED_ORIGINS = new Set(['localhost', '127.0.0.1', '[::1]'].map((h) => `http://${h}:${PORT}`));

const realReal = (p) => {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
};

function sendJson(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', ...extra });
  res.end(JSON.stringify(body));
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

// The player people of a campaign, or null for an unknown or invalid campaign.
async function playerOf(cid) {
  if (typeof cid !== 'string' || !ID_RE.test(cid)) return null;
  const index = await readJson(join(CAMPAIGNS_DIR, 'index.json'));
  const row = Array.isArray(index?.campaigns) ? index.campaigns.find((c) => c?.id === cid) : null;
  const player = row?.player ?? (await readJson(join(CAMPAIGNS_DIR, cid, 'world.lock.json')))?.player;
  return typeof player === 'string' && ID_RE.test(player) ? player : null;
}

async function sendFile(res, path) {
  try {
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': MIME[extname(path).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    notFound(res);
  }
}

// The raw report holds every people's orders, probes and draws, which would break
// fog of war, so only a summary reduced to the player is served.
async function sendReportSummary(res, cid, player, file) {
  const report = await readJson(join(CAMPAIGNS_DIR, cid, 'log', file));
  if (!report || report.format !== 'realmcraft-report') return notFound(res);
  // Lazy: a half-edited engine must not stop the dev server from starting.
  const { projectEvents } = await import('./engine/core/project.js');
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

// Strict whitelist on the decoded segments: anything not matched is a 404, so
// dot segments, backslashes and foreign peoples' views never resolve to a file.
async function handleCampaignFile(req, res, pathname) {
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

async function handleApiGet(res, cid, what) {
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

// CLI calls of one campaign run strictly one after another; the CLI locks too,
// but a queue keeps a preview from interleaving with a seal in the response order.
const cliQueues = new Map();
function runCli(cid, args) {
  const run = () => new Promise((done) => {
    execFile(process.execPath, ['engine/cli.mjs', ...args], {
      cwd: ROOT,
      env: { ...process.env, REALMCRAFT_ROOT: CAMPAIGN_ROOT },
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    }, (err, stdout) => done({ err, stdout }));
  });
  const next = (cliQueues.get(cid) ?? Promise.resolve()).then(run);
  cliQueues.set(cid, next);
  return next;
}

// Parsed CLI JSON, or null when the CLI produced none (spawn error, crash).
function parseCli({ err, stdout }) {
  try {
    const out = JSON.parse(stdout);
    if (out && typeof out === 'object') return { ...out, exit: out.exit ?? (err ? err.code : 0) };
  } catch {
    // fall through
  }
  return null;
}

function readBody(req, res) {
  return new Promise((done) => {
    const declared = Number(req.headers['content-length']);
    const tooLarge = () => {
      sendJson(res, 413, { error: 'body too large' }, { Connection: 'close' });
      req.resume();
      done(null);
    };
    if (declared > MAX_BODY) return tooLarge();
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      if (res.writableEnded) return;
      size += c.length;
      if (size > MAX_BODY) return tooLarge();
      chunks.push(c);
    });
    req.on('end', () => {
      if (!res.writableEnded) done(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', () => done(null));
  });
}

async function handleApiPost(req, res, route) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' }, { Allow: 'POST' });
  if (!LOOPBACK_ADDRS.has(req.socket.remoteAddress)) return sendJson(res, 403, { error: 'loopback only' });
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin') return sendJson(res, 403, { error: 'cross-site request' });
  const origin = req.headers.origin;
  if (origin !== undefined && !ALLOWED_ORIGINS.has(String(origin).toLowerCase())) return sendJson(res, 403, { error: 'foreign origin' });
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    return sendJson(res, 415, { error: 'application/json required' });
  }
  const raw = await readBody(req, res);
  if (raw === null) return;
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return sendJson(res, 400, { error: 'invalid JSON' });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res, 400, { error: 'body must be an object' });
  const player = await playerOf(body.campaign);
  if (!player) return sendJson(res, 400, { error: 'unknown campaign' });
  const cid = body.campaign;

  if (route === 'seal') {
    const out = parseCli(await runCli(cid, ['seal', '--campaign', cid, '--json']));
    return out ? sendJson(res, 200, out) : sendJson(res, 500, { error: 'seal produced no result' });
  }

  if (body.people !== player) return sendJson(res, 400, { error: 'people must be the player of the campaign' });
  if (!body.draft || typeof body.draft !== 'object' || Array.isArray(body.draft)) return sendJson(res, 400, { error: 'draft must be an object' });
  const tmp = await mkdtemp(join(tmpdir(), 'rc-draft-'));
  try {
    const file = join(tmp, 'draft.json');
    await writeFile(file, JSON.stringify(body.draft));
    const out = parseCli(await runCli(cid, ['preview', '--as', player, '--draft', file, '--campaign', cid, '--json']));
    if (!out) return sendJson(res, 500, { error: 'preview produced no result' });
    const { ok, exit, stored, issues, ...preview } = out;
    return sendJson(res, 200, { ok, exit, stored: Boolean(stored), issues, preview });
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// Returns true when the request belonged to the campaign bridge. The gate looks
// at the normalised path (dot segments, backslashes, trailing dots and spaces
// that Windows ignores, case) so no spelling of /campaigns reaches the static
// handler; the handlers themselves then match the raw segments strictly.
async function handleCampaignBridge(req, res, pathname) {
  const slashed = pathname.replace(/\\/g, '/');
  const clean = (p) => p.split('/').map((s) => s.replace(/[. ]+$/, '')).join('/').toLowerCase();
  const isCampaigns = (g) => g === '/campaigns' || g.startsWith('/campaigns/');
  // Raw form too, so /campaigns/x/../../package.json is refused instead of
  // collapsing into an ordinary static file.
  if (isCampaigns(clean(slashed)) || isCampaigns(clean(posix.normalize(slashed)))) {
    await handleCampaignFile(req, res, pathname);
    return true;
  }
  const api = pathname.match(/^\/api\/campaigns\/([^/]+)\/(content|draft|chronik)$/);
  if (api) {
    if (req.method !== 'GET' && req.method !== 'HEAD') sendJson(res, 405, { error: 'GET only' }, { Allow: 'GET, HEAD' });
    else if (!ID_RE.test(api[1])) notFound(res);
    else await handleApiGet(res, api[1], api[2]);
    return true;
  }
  if (pathname === '/api/draft' || pathname === '/api/seal') {
    await handleApiPost(req, res, pathname.slice(5));
    return true;
  }
  return false;
}

// Change notifications for the board. Debounced per event, campaign and file
// group; only files of the player's projection and the public narrative count,
// so temp files of atomic renames and foreign views never trigger anything.
const campaignTimers = new Map();
function notifyCampaign(event, cid, file, key = '') {
  const id = `${event}:${cid}:${key}`;
  clearTimeout(campaignTimers.get(id));
  campaignTimers.set(id, setTimeout(async () => {
    campaignTimers.delete(id);
    if (event === 'view' && (await playerOf(cid)) !== key) return;
    broadcast(event, JSON.stringify({ campaign: cid, file }));
  }, 120));
}

function onCampaignChange(_event, filename) {
  if (!filename) return;
  const [cid, ...rest] = String(filename).replace(/\\/g, '/').split('/');
  if (!ID_RE.test(cid ?? '') || rest.length === 0) return;
  const file = rest.join('/');
  let m;
  if ((m = file.match(/^view\/([a-z][a-z0-9-]*)\.json$/))) notifyCampaign('view', cid, file, m[1]);
  else if ((m = file.match(/^view\/([a-z][a-z0-9-]*)\/events\/[^/]+\.json$/))) notifyCampaign('view', cid, file, m[1]);
  else if (file === 'status.json') notifyCampaign('status', cid, file);
  else if (/^narrative\/chronik\/[^/]+\.md$/.test(file)) notifyCampaign('chronik', cid, file);
  else if (/^log\/T\d{4}\.json$/.test(file)) notifyCampaign('report', cid, file);
}

// The folder may not exist before the first campaign is created, so retry.
function watchCampaigns() {
  try {
    const watcher = watch(CAMPAIGNS_DIR, { recursive: true }, onCampaignChange);
    watcher.on('error', () => {
      watcher.close();
      setTimeout(watchCampaigns, 2000);
    });
  } catch {
    setTimeout(watchCampaigns, 2000);
  }
}
watchCampaigns();

const server = createServer(async (req, res) => {
  try {
    if (LOOPBACK_BIND && !ALLOWED_HOSTS.has(String(req.headers.host || '').toLowerCase())) {
      forbidden(res);
      return;
    }

    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);

    // Before the static handler, also when the campaign root is the repo root.
    if (await handleCampaignBridge(req, res, pathname)) return;

    // Runtime config: expose the local Gemini key (from .env) to the browser.
    // Absent .env -> empty object, app falls back to the settings dialog.
    // A classic script is includable cross-site (XSSI), so any page the operator
    // visits could read the global. Browsers mark such loads with Sec-Fetch-Site;
    // only same-origin and direct navigation (none) pass, an absent header (old
    // browser, curl) still relies on the Host check. Deliberate shortcut: the
    // real fix is a server-side /api/image proxy so the key never reaches the
    // browser at all.
    if (pathname === '/env.js') {
      const site = req.headers['sec-fetch-site'];
      if (site && site !== 'same-origin' && site !== 'none') {
        forbidden(res);
        return;
      }
      const env = await readEnvFile();
      const js = `window.__RC_ENV__ = ${JSON.stringify({ GEMINI_API_KEY: env.GEMINI_API_KEY || '' })};`;
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(js);
      return;
    }

    // Server-Sent-Events: notify the dashboard when savegame.json changes.
    if (pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('event: hello\ndata: connected\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    // Never serve dotfiles or dot-directories (.env, .git, …). Split on the
    // backslash too: /%5C.env decodes to /\.env, which path.join on Windows turns
    // back into ROOT\.env. The Gemini key in .env leaves only via /env.js above.
    if (pathname.split(/[\\/]/).some((seg) => seg.startsWith('.'))) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';

    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
      forbidden(res);
      return;
    }

    // Backstop for the bridge gate: whatever spelling resolves into the campaign
    // folder (8.3 names, alternate streams), the static handler never serves it.
    const campaignsReal = realReal(CAMPAIGNS_DIR);
    const fileReal = campaignsReal && realReal(filePath);
    if (fileReal && (fileReal === campaignsReal || fileReal.startsWith(campaignsReal + sep))) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    let target = filePath;
    const info = await stat(target).catch(() => null);
    if (info && info.isDirectory()) target = join(target, 'index.html');

    const data = await readFile(target);
    const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`RealmCraft dev server: http://localhost:${PORT} (gebunden an ${HOST})`);
});

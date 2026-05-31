// Zero-dependency static file server for RealmCraft.
// Used for local development and as Playwright's webServer.
//   node serve.mjs            -> http://localhost:4173
//   PORT=8080 node serve.mjs  -> http://localhost:8080
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
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
function broadcast(event) {
  for (const res of sseClients) {
    try {
      res.write(`event: ${event}\ndata: changed\n\n`);
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
    // Code-Dateien, aber nicht versteckte Ordner (.git) oder node_modules.
    if (CODE_RE.test(name) && !name.split('/').some((s) => s.startsWith('.') || s === 'node_modules')) {
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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let pathname = decodeURIComponent(url.pathname);

    // Runtime config: expose the local Gemini key (from .env) to the browser.
    // Absent .env -> empty object, app falls back to the settings dialog.
    if (pathname === '/env.js') {
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

    // Punktdateien/-ordner (.env, .git, …) nie ausliefern. Auf der URL-Pfad-Ebene
    // geprüft (immer Vorwärts-Slashes), unabhängig vom OS-Pfadtrenner. Der
    // Gemini-Key in .env wird ausschliesslich kontrolliert über /env.js (oben)
    // durchgereicht — /env.js erreicht diesen Block ohnehin nicht.
    if (pathname.split('/').some((seg) => seg.startsWith('.'))) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';

    const filePath = normalize(join(ROOT, pathname));
    if (!filePath.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('403 Forbidden');
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

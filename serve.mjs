// Zero-dependency static file server for RealmCraft.
// Used for local development and as Playwright's webServer.
//   node serve.mjs            -> http://localhost:4173
//   PORT=8080 node serve.mjs  -> http://localhost:8080
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT) || 4173;

// Reads .env (if present) and returns it as a plain object. Used to hand the
// Gemini key to the browser via /env.js without ever writing it to a tracked
// file. .env is gitignored; /env.js is generated in memory.
async function readEnvFile() {
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8');
    const out = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !line.trimStart().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
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

server.listen(PORT, () => {
  console.log(`RealmCraft dev server: http://localhost:${PORT}`);
});

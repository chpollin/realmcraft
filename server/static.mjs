// Static files of the repository and the generated /env.js.
import { readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { CAMPAIGNS_DIR, MIME, ROOT } from './config.mjs';
import { forbidden, notFound } from './http.mjs';

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

/**
 * Runtime config: exposes the local Gemini key (from .env) to the browser.
 * Absent .env -> empty object, the app falls back to its settings dialog.
 * A classic script is includable cross-site (XSSI), so any page the operator
 * visits could read the global. Browsers mark such loads with Sec-Fetch-Site;
 * only same-origin and direct navigation (none) pass, an absent header (old
 * browser, curl) still relies on the Host check. Deliberate shortcut: the
 * real fix is a server-side /api/image proxy so the key never reaches the
 * browser at all.
 */
export async function handleEnvJs(req, res) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return forbidden(res);
  const env = await readEnvFile();
  const js = `window.__RC_ENV__ = ${JSON.stringify({ GEMINI_API_KEY: env.GEMINI_API_KEY || '' })};`;
  res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(js);
}

const realOrNull = (p) => {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
};

/** A file below ROOT; directories answer with their index.html. */
export async function handleStatic(req, res, pathname) {
  // Never serve dotfiles or dot-directories (.env, .git, ...). Split on the
  // backslash too: /%5C.env decodes to /\.env, which path.join on Windows turns
  // back into ROOT\.env. The Gemini key in .env leaves only via /env.js.
  if (pathname.split(/[\\/]/).some((seg) => seg.startsWith('.'))) return notFound(res);
  if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';

  const filePath = normalize(join(ROOT, pathname));
  if (!filePath.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) return forbidden(res);

  // Backstop for the bridge gate: whatever spelling resolves into the campaign
  // folder (8.3 names, alternate streams), the static handler never serves it.
  const campaignsReal = realOrNull(CAMPAIGNS_DIR);
  const fileReal = campaignsReal && realOrNull(filePath);
  if (fileReal && (fileReal === campaignsReal || fileReal.startsWith(campaignsReal + sep))) return notFound(res);

  let target = filePath;
  const info = await stat(target).catch(() => null);
  if (info && info.isDirectory()) target = join(target, 'index.html');
  let data;
  try {
    data = await readFile(target);
  } catch {
    return notFound(res);
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(data);
}

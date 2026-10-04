// Static files of the board: the root index.html and the folders it loads from.
import { readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { extname, join, normalize, relative, sep } from 'node:path';
import { CAMPAIGNS_DIR, MIME, ROOT } from './config.mjs';
import { forbidden, notFound } from './http.mjs';

const realOrNull = (p) => {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
};

// An allowlist rather than a denylist, so a new file at the repository root
// (package.json, tools/, the owner's untracked saves) is never served by
// default. That matters most under the HOST=0.0.0.0 opt-in, where the Host
// check is off. The board loads only from these folders and the root
// index.html, which redirects to spielbrett/.
const SERVED_DIRS = new Set(['spielbrett', 'engine', 'welten', 'fonts']);
const ROOT_REAL = realOrNull(ROOT);

// Decided on the real path, so junctions, symlinks and 8.3 names count by
// where they lead; Windows paths compare case-insensitively.
function servable(real) {
  const segs = relative(ROOT_REAL, real).split(sep);
  const top = segs[0].toLowerCase();
  return segs.length === 1 ? top === 'index.html' : SERVED_DIRS.has(top);
}

/** A file of the board below ROOT; directories answer with their index.html. */
export async function handleStatic(req, res, pathname) {
  // Never serve dotfiles or dot-directories (.env, .git, ...). Split on the
  // backslash too: /%5C.env decodes to /\.env, which path.join on Windows turns
  // back into ROOT\.env.
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
  const targetReal = realOrNull(target);
  if (!ROOT_REAL || !targetReal || !servable(targetReal)) return notFound(res);
  let data;
  try {
    data = await readFile(target);
  } catch {
    return notFound(res);
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(data);
}

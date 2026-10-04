// Static files of the repository.
import { readFile, stat } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import { CAMPAIGNS_DIR, MIME, ROOT } from './config.mjs';
import { forbidden, notFound } from './http.mjs';

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
  let data;
  try {
    data = await readFile(target);
  } catch {
    return notFound(res);
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(data);
}

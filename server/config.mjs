// Settings of the dev server, read once from the environment at start.
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { CID_RE } from '../tools/harness/lib.mjs';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PORT = Number(process.env.PORT) || 4173;
// Loopback only by default: the dev server hands the local Gemini key to the
// browser through /env.js and must not be reachable from the LAN. HOST=0.0.0.0
// opens it deliberately. http://localhost stays reachable.
export const HOST = process.env.HOST || '127.0.0.1';

// DNS rebinding: a foreign site whose name resolves to 127.0.0.1 is same-origin
// with itself and could read /env.js and the campaign files. Only loopback Host
// headers are accepted while bound to loopback; HOST=0.0.0.0 is a deliberate
// LAN opt-in, where the Host is the unknown LAN address.
export const LOOPBACK_BIND = ['127.0.0.1', 'localhost', '::1'].includes(HOST);
const LOOPBACK_NAMES = ['localhost', '127.0.0.1', '[::1]'];
export const ALLOWED_HOSTS = new Set(LOOPBACK_NAMES.map((h) => `${h}:${PORT}`));
export const ALLOWED_ORIGINS = new Set(LOOPBACK_NAMES.map((h) => `http://${h}:${PORT}`));
export const LOOPBACK_ADDRS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// Campaigns below <REALMCRAFT_ROOT>/campaigns, so tests run on a temporary root
// and never see the operator's live campaigns.
export const CAMPAIGN_ROOT = resolve(process.env.REALMCRAFT_ROOT ?? ROOT);
export const CAMPAIGNS_DIR = join(CAMPAIGN_ROOT, 'campaigns');

// The campaign id pattern of the kernel CLI; the harness keeps the copy that
// needs no engine import, so the server starts while the engine is edited.
export const ID_RE = CID_RE;

export const MAX_BODY = 64 * 1024;

export const MIME = {
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

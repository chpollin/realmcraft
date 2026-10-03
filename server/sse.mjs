// Server-Sent-Events on /events. After 'hello' the board receives 'view',
// 'status', 'chronik' and 'report', each with JSON data { campaign, file },
// whenever the kernel rewrites one of those files.
import { watch } from 'node:fs';
import { CAMPAIGNS_DIR, ID_RE } from './config.mjs';
import { playerOf } from './campaigns.mjs';

const clients = new Set();

function broadcast(event, data) {
  for (const res of clients) {
    try {
      res.write(`event: ${event}\ndata: ${data}\n\n`);
    } catch {
      clients.delete(res);
    }
  }
}

export function handleEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('event: hello\ndata: connected\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
}

// Debounced per event, campaign and file group; only files of the player's
// projection and the public narrative count, so temp files of atomic renames
// and foreign views never trigger anything.
const timers = new Map();
function notify(event, cid, file, key = '') {
  const id = `${event}:${cid}:${key}`;
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(async () => {
    timers.delete(id);
    if (event === 'view' && (await playerOf(cid)) !== key) return;
    broadcast(event, JSON.stringify({ campaign: cid, file }));
  }, 120));
}

/**
 * Pushes 'view' and 'status' of a campaign without waiting for the watcher.
 * A load swaps whole folders, and a renamed folder is no file event the
 * watcher matches. Debounced together with the watcher's own events.
 */
export async function pushCampaign(cid) {
  const player = await playerOf(cid);
  if (player) notify('view', cid, `view/${player}.json`, player);
  notify('status', cid, 'status.json');
}

function onChange(_event, filename) {
  if (!filename) return;
  const [cid, ...rest] = String(filename).replace(/\\/g, '/').split('/');
  if (!ID_RE.test(cid ?? '') || rest.length === 0) return;
  const file = rest.join('/');
  let m;
  if ((m = file.match(/^view\/([a-z][a-z0-9-]*)\.json$/))) notify('view', cid, file, m[1]);
  else if ((m = file.match(/^view\/([a-z][a-z0-9-]*)\/events\/[^/]+\.json$/))) notify('view', cid, file, m[1]);
  else if (file === 'status.json') notify('status', cid, file);
  else if (/^narrative\/chronik\/[^/]+\.md$/.test(file)) notify('chronik', cid, file);
  else if (/^log\/T\d{4}\.json$/.test(file)) notify('report', cid, file);
}

/** Watches the campaigns folder; it may not exist before the first campaign is created, so this retries. */
export function watchCampaigns() {
  try {
    const watcher = watch(CAMPAIGNS_DIR, { recursive: true }, onChange);
    watcher.on('error', () => {
      watcher.close();
      setTimeout(watchCampaigns, 2000);
    });
  } catch {
    setTimeout(watchCampaigns, 2000);
  }
}

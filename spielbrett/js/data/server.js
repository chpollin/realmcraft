// Client of the dev server for a real campaign. Reads go to the campaign
// files the server releases (index, the player's view, status, chronicle,
// report summaries); writes go through POST /api/draft and /api/seal, where
// the server runs the kernel CLI, the only writer of campaign state.

const json = async (url, { optional = false } = {}) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (optional && res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
};

const post = async (url, body) => {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, exit: -1, issues: [{ code: 'server', severity: 'error', path: '', message: data.error ?? `HTTP ${res.status}` }] };
  return data;
};

const c = (cid) => `/campaigns/${encodeURIComponent(cid)}`;
const a = (cid) => `/api/campaigns/${encodeURIComponent(cid)}`;

export const server = {
  index: () => json('/campaigns/index.json', { optional: true }),
  view: (cid, pid) => json(`${c(cid)}/view/${encodeURIComponent(pid)}.json`),
  status: (cid) => json(`${c(cid)}/status.json`, { optional: true }),
  report: (cid, stem) => json(`${c(cid)}/log/${stem}.json`, { optional: true }),
  events: (cid, pid, stem) => json(`${c(cid)}/view/${encodeURIComponent(pid)}/events/${stem}.json`, { optional: true }),
  content: (cid) => json(`${a(cid)}/content`, { optional: true }),
  draft: (cid) => json(`${a(cid)}/draft`, { optional: true }),
  chronik: (cid) => json(`${a(cid)}/chronik`, { optional: true }),
  pack: (worldId, file) => json(`/welten/${encodeURIComponent(worldId)}/${file}`),
  saveDraft: (cid, people, draft) => post('/api/draft', { campaign: cid, people, draft }),
  seal: (cid) => post('/api/seal', { campaign: cid }),

  /**
   * Server-Sent-Events of one campaign: view, status, chronik, report. The
   * handler receives (event, data); events of other campaigns are dropped.
   */
  subscribe(cid, handler) {
    if (typeof EventSource === 'undefined') return () => {};
    const es = new EventSource('/events');
    for (const ev of ['view', 'status', 'chronik', 'report']) {
      es.addEventListener(ev, (e) => {
        let data = null;
        try { data = JSON.parse(e.data); } catch { return; }
        if (data?.campaign === cid) handler(ev, data);
      });
    }
    return () => es.close();
  },
};

/** "T0006" for turn 6, the stem of per-turn files. */
export const turnStem = (turn) => `T${String(turn).padStart(4, '0')}`;

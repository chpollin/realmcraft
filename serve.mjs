// Zero-dependency dev server of RealmCraft: static files, the campaign bridge
// of the browser board (spielbrett/) and Playwright's webServer.
//   node serve.mjs            -> http://localhost:4173
//   PORT=8080 node serve.mjs  -> http://localhost:8080
// Campaigns are read from <REALMCRAFT_ROOT>/campaigns (default: this folder).
// The modules live under server/.
import { createServer } from 'node:http';
import { ALLOWED_HOSTS, HOST, LOOPBACK_BIND, PORT } from './server/config.mjs';
import { forbidden, notFound, sendIssues, serverIssue } from './server/http.mjs';
import { handleCampaignApi, handleCampaignFile, handleCampaignList, isCampaignPath } from './server/campaigns.mjs';
import { handleActivate, handleCreate } from './server/newgame.mjs';
import { handleDraft, handleSeal } from './server/turn.mjs';
import { handleEvents, watchCampaigns } from './server/sse.mjs';
import { handleEnvJs, handleStatic } from './server/static.mjs';
import { handleWorlds } from './server/worlds.mjs';

/**
 * Route table, matched in order on the decoded path after the Host check.
 * `on` maps methods to handlers (GET also answers HEAD), `any` takes every
 * method. Another method answers 405 with an Allow header. A handler gets
 * (req, res, captures). Error answers of the API are { error, issues } with
 * issues in the kernel's shape { code, severity, path, message, params? }.
 *
 *   GET  /campaigns/...                     fog-safe campaign files: index.json,
 *                                           view/<player>.json, view/<player>/events/T<n>.json,
 *                                           status.json, narrative/..., log/T<n>.json as a
 *                                           player summary. Every other spelling of
 *                                           /campaigns is a 404 (isCampaignPath).
 *   GET  /api/campaigns                     campaign list, newest first: [{ id, world, player,
 *                                           people: { id, name }, turn, season, year, phase,
 *                                           status, outcome, language, difficulty, updatedAt }],
 *                                           outcome null while playing (server/campaigns.mjs)
 *   POST /api/campaigns { world, seed, people, rivals?, difficulty?, language?, id? }
 *                                           new game through `cli new`: 201 { id }, 400 with
 *                                           issues for a field the package does not offer,
 *                                           409 when the id exists, never overwrites
 *                                           (server/newgame.mjs)
 *   POST /api/campaigns/<cid>/activate {}   records the player's choice for /zug through
 *                                           tools/harness/active-campaign.mjs --set:
 *                                           { id, active, via, current? }
 *   GET  /api/campaigns/<cid>/content       library items referenced by the player's view
 *   GET  /api/campaigns/<cid>/draft         { draft } the player's stored draft or null
 *   GET  /api/campaigns/<cid>/chronik       { entries: [{ turn, file, text }] }
 *   GET  /api/worlds                        world packages: [{ id, name, version,
 *                                           templates: [{ id, name }], languages,
 *                                           difficulties, defaultDifficulty, seed: { min, max } }]
 *   POST /api/draft   { campaign, people, draft }
 *                                           kernel preview, stores the draft:
 *                                           { ok, exit, stored, issues, preview }
 *   POST /api/seal    { campaign }          kernel seal, the CLI JSON as is
 *   GET  /events                            SSE: hello, then view | status | chronik |
 *                                           report with data { campaign, file }
 *   GET  /env.js                            window.__RC_ENV__ with the local Gemini key
 *   *    everything else                    static file below the repository root
 *
 * POST bodies pass server/http.mjs readPostJson: loopback peer, same-origin
 * fetch metadata and Origin, application/json, at most 64 KiB, a JSON object.
 */
const ROUTES = [
  { path: /^\/api\/campaigns$/, on: { GET: handleCampaignList, POST: handleCreate } },
  { path: /^\/api\/campaigns\/([^/]+)\/(content|draft|chronik)$/, on: { GET: handleCampaignApi } },
  { path: /^\/api\/campaigns\/([^/]+)\/activate$/, on: { POST: handleActivate } },
  { path: /^\/api\/worlds$/, on: { GET: handleWorlds } },
  { path: /^\/api\/draft$/, on: { POST: handleDraft } },
  { path: /^\/api\/seal$/, on: { POST: handleSeal } },
  { path: /^\/events$/, any: handleEvents },
  { path: /^\/env\.js$/, any: handleEnvJs },
];

async function route(req, res, pathname) {
  // Before every other route, also when the campaign root is the repo root.
  if (isCampaignPath(pathname)) return handleCampaignFile(req, res, pathname);
  for (const r of ROUTES) {
    const m = r.path.exec(pathname);
    if (!m) continue;
    const method = req.method === 'HEAD' ? 'GET' : req.method;
    const handle = r.any ?? (Object.hasOwn(r.on, method) ? r.on[method] : null);
    if (handle) return handle(req, res, m.slice(1));
    const methods = Object.keys(r.on);
    const allow = methods.flatMap((x) => (x === 'GET' ? ['GET', 'HEAD'] : [x])).join(', ');
    return sendIssues(res, 405, [serverIssue('server.method', `${methods.join(' or ')} only`)], { Allow: allow });
  }
  return handleStatic(req, res, pathname);
}

const server = createServer(async (req, res) => {
  try {
    if (LOOPBACK_BIND && !ALLOWED_HOSTS.has(String(req.headers.host || '').toLowerCase())) return forbidden(res);
    const url = new URL(req.url, `http://localhost:${PORT}`);
    await route(req, res, decodeURIComponent(url.pathname));
  } catch {
    if (!res.headersSent) notFound(res);
    else res.end();
  }
});

watchCampaigns();
server.listen(PORT, HOST, () => {
  console.log(`RealmCraft dev server: http://localhost:${PORT} (bound to ${HOST})`);
});

// Prints the campaign a /zug or /partie run works on, as one JSON object:
// { campaign, dir, via, run, world, player, turn, phase, rev, status }.
// via is "run" (active run marker), "selected" (chosen in the browser),
// "index" (newest playing campaign), "folder" (the only campaign folder) or
// "flag" (--campaign). Exit 3 when there is none.
//
//   node tools/harness/active-campaign.mjs [--campaign <cid>] [--root <dir>]
//   node tools/harness/active-campaign.mjs --set <cid> [--root <dir>]
//
// --set records <cid> in campaigns/active.json as the player's choice (the
// server's POST /api/campaigns/<cid>/activate) and then prints as without it,
// so the answer says which campaign /zug will take; an active run marker
// still wins over the choice.

import { existsSync } from 'node:fs';
import { ACTIVE_FILE, CID_RE, activeCampaign, normPath, parseArgs, readJsonFile, rootDir } from './lib.mjs';

const { opt } = parseArgs(process.argv.slice(2));
const root = opt.root ? normPath(opt.root) : rootDir();
const none = (reason) => {
  process.stdout.write(`${JSON.stringify({ campaign: null, reason })}\n`);
  process.exit(3);
};

if (opt.set !== undefined) {
  const cid = opt.set;
  if (typeof cid !== 'string' || !CID_RE.test(cid) || !existsSync(`${root}/campaigns/${cid}/state.json`)) none(`no campaign ${cid} under ${root}/campaigns`);
  const { withLock, writeJsonAtomic } = await import('../../engine/harness/io.js');
  const base = `${root}/campaigns`;
  withLock(base, 'active', () => writeJsonAtomic(`${base}/${ACTIVE_FILE}`, { format: 'realmcraft-active', version: 1, campaign: cid, at: new Date().toISOString() }));
}

const found = typeof opt.campaign === 'string'
  ? { cid: opt.campaign, dir: `${root}/campaigns/${opt.campaign}`, run: readJsonFile(`${root}/campaigns/${opt.campaign}/run.json`, null), via: 'flag' }
  : activeCampaign(root);
const state = found ? readJsonFile(`${found.dir}/state.json`, null) : null;
if (!found || !state) none(found ? `no state.json in ${found.dir}` : `no campaign under ${root}/campaigns`);
process.stdout.write(`${JSON.stringify({
  campaign: found.cid,
  dir: found.dir,
  via: found.via,
  run: found.run?.active ? found.run : null,
  world: state.campaign?.world?.id ?? null,
  player: state.campaign?.player ?? null,
  turn: state.turn,
  phase: state.phase,
  rev: state.rev,
  status: state.status,
}, null, 2)}\n`);

// Prints the campaign a /zug or /partie run works on, as one JSON object:
// { campaign, dir, via, run, world, player, turn, phase, rev, status }.
// via is "run" (active run marker), "index" (newest playing campaign) or
// "folder" (the only campaign folder). Exit 3 when there is none.
//
//   node tools/harness/active-campaign.mjs [--campaign <cid>] [--root <dir>]

import { activeCampaign, normPath, parseArgs, readJsonFile, rootDir } from './lib.mjs';

const { opt } = parseArgs(process.argv.slice(2));
const root = opt.root ? normPath(opt.root) : rootDir();
const found = typeof opt.campaign === 'string'
  ? { cid: opt.campaign, dir: `${root}/campaigns/${opt.campaign}`, run: readJsonFile(`${root}/campaigns/${opt.campaign}/run.json`, null), via: 'flag' }
  : activeCampaign(root);
const state = found ? readJsonFile(`${found.dir}/state.json`, null) : null;
if (!found || !state) {
  process.stdout.write(`${JSON.stringify({ campaign: null, reason: found ? `no state.json in ${found.dir}` : `no campaign under ${root}/campaigns` })}\n`);
  process.exit(3);
}
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

// A Hochland campaign with every module of the board in play, written through
// the kernel CLI: the state of a fresh campaign (seed 7) is extended and handed
// to `new --from-state`, the only way a prepared state enters a campaign. The
// player knows the market (trade with the Talbund), the spear carriers (one
// unit beside the camp, a Schaedelklan war band in sight and at war), the smoke
// sight (magic) and the settled way of life (a change of way of life to offer).
// The first season is played with the world-event roll `eventRoll` (4 draws
// the raid on the herds, an open decision), so the board opens on its card.
//   node tests/fixtures/spielbrett/build-module.mjs --keep

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEnv } from '../../../spielbrett/js/data/kernel.js';
import { distance, parseKey, tileAt } from '../../../engine/world/index.js';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PID = 'bergnomaden';
const json = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));

function hochlandEnv() {
  const pack = {
    welt: json('welten/hochland/welt.json'),
    regeln: json('welten/hochland/regeln.json'),
    labels: json('welten/hochland/labels.json'),
    entwicklungen: json('welten/hochland/content/entwicklungen.json'),
    ereignisse: json('welten/hochland/content/ereignisse.json'),
    bestimmungen: json('welten/hochland/content/bestimmungen.json'),
  };
  return buildEnv(pack, []);
}

const known = (ref, turn = 0) => ({ ref, since: turn, effectiveFrom: turn, state: 'active', suspendedSince: null });

/** Passable, buildable-or-not tiles the player sees at `d` steps from the camp, nearest the camp's row first. */
function tilesAt(state, env, world, from, d) {
  const taken = new Set(state.map.settlements.map((s) => s.tile));
  return Object.keys(state.map.known[PID]).filter((k) => {
    if (taken.has(k) || distance(parseKey(k), parseKey(from)) !== d) return false;
    const { q, r } = parseKey(k);
    const def = env.terrain(tileAt(world, q, r).terrain);
    return def && !def.water && typeof def.moveCost === 'number';
  }).sort();
}

/**
 * Creates campaign `cid` under `root` with the modules in play and opens it
 * for planning. Returns { dir, unit, enemy } with the tiles of the own unit and
 * of the war band.
 */
export function createModuleCampaign(root, cid = 'module', { eventRoll = 4 } = {}) {
  const run = (...args) => execFileSync(process.execPath, ['engine/cli.mjs', ...args, '--json'], { cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8' });
  run('new', 'hochland', '--seed', '7', '--id', `${cid}-base`);
  const state = JSON.parse(readFileSync(join(root, 'campaigns', `${cid}-base`, 'state.json'), 'utf8'));
  const env = hochlandEnv();
  const world = env.world(state.map.seed);
  const me = state.peoples[PID];
  const camp = state.map.settlements.find((s) => s.people === PID);
  const dorf = state.map.settlements.find((s) => s.people === 'talbund');

  for (const ref of ['markt-am-pass@1', 'speertraeger@1', 'rauchschau@1', 'sesshaft@1']) me.developments.known.push(known(ref));
  camp.buildings.push({ ref: 'markt-am-pass@1', since: 0, state: 'active' });
  Object.assign(me.resources, { salz: 4, psil: 2, material: 5 });
  me.population.core = 4;
  me.population.assigned = { nahrung: 2, material: 2 };

  const talbund = state.peoples.talbund;
  talbund.developments.known.push(known('markt-am-pass@1'));
  dorf.buildings.push({ ref: 'markt-am-pass@1', since: 0, state: 'active' });
  Object.assign(talbund.resources, { salz: 6 });
  // A milestone reached while the peoples have contact reveals the Talbund's destiny.
  Object.assign(talbund.bestimmung.milestones[0], { reached: true, reachedAt: 0, progress: 1 });

  const unit = tilesAt(state, env, world, camp.tile, 1)[0];
  const enemy = tilesAt(state, env, world, unit, 1).find((k) => distance(parseKey(k), parseKey(camp.tile)) === 2);
  me.units.push({ id: 'u-speer-1', type: 'speertraeger@1', strength: 2, tile: unit, state: 'ready', since: 0 });
  state.peoples.schaedelklan.units.push({ id: 'u-klan-1', type: 'speertraeger@1', strength: 1, tile: enemy, state: 'ready', since: 0 });

  state.relations[`${PID}|talbund`] = { value: 1, atWar: false, since: 0, contact: true };
  state.relations[`${PID}|schaedelklan`] = { value: -3, atWar: true, since: 0, contact: true };

  const file = join(root, `${cid}-state.json`);
  writeFileSync(file, JSON.stringify(state));
  run('new', 'hochland', '--from-state', file, '--id', cid);
  run('open', '--campaign', cid);
  // Buildings act from the season after they stand, so one season runs before the board opens.
  const turn = (...args) => run(...args, '--campaign', cid);
  turn('roll', `T0:${PID}:event`, String(eventRoll));
  turn('seal');
  turn('apply');
  turn('open');
  return { dir: join(root, 'campaigns', cid), unit, enemy, camp: camp.tile };
}

/**
 * The module campaign one season further, stopped in phase B (agents) with the
 * steps of status.json the harness would write: a world agent done, research
 * running, the council waiting, a rival done and a judge with recorded
 * findings of every severity.
 */
export async function createAgentsCampaign(root, cid = 'agenten') {
  const out = createModuleCampaign(root, cid);
  const run = (...args) => execFileSync(process.execPath, ['engine/cli.mjs', ...args, '--campaign', cid, '--json'], { cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8' });
  run('roll', `T1:${PID}:event`, '6');
  run('seal');
  run('apply');
  const { updateStep, recordVerdict, recordFinding } = await import('../../../engine/harness/status.js');
  const dir = out.dir;
  updateStep(dir, { id: 'world', agent: 'world', state: 'running' });
  recordVerdict(dir, 'world', { proposalId: 'world.T1', kind: 'feature', title: 'Erzader am Kamm', verdict: 'accepted' });
  updateStep(dir, { id: 'world', state: 'done', summary: '' });
  updateStep(dir, { id: `research-${PID}`, agent: 'research', state: 'running', summary: 'Pfade der Weide' });
  updateStep(dir, { id: `council-${PID}`, agent: 'council', state: 'waiting' });
  updateStep(dir, { id: 'rival-talbund', agent: 'rival', state: 'running' });
  updateStep(dir, { id: 'rival-talbund', state: 'done' });
  updateStep(dir, { id: 'judge-balance-all', agent: 'judge-balance', state: 'running' });
  recordFinding(dir, 'judge-balance-all', { id: 'f1', judge: 'judge-balance', severity: 'info', text: 'Die Herden wachsen im Hochland langsam.', refs: [] });
  recordFinding(dir, 'judge-balance-all', { id: 'f2', judge: 'judge-balance', severity: 'severe', text: 'Der dunkle Pfad ist zu billig.', refs: [] });
  recordFinding(dir, 'judge-balance-all', { id: 'f3', judge: 'judge-balance', severity: 'warn', text: 'Vorschläge neigen zur Erkundung.', refs: [] });
  updateStep(dir, { id: 'judge-balance-all', state: 'done' });
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = mkdtempSync(join(tmpdir(), 'rc-module-'));
  const keep = process.argv.includes('--keep');
  try {
    const out = createModuleCampaign(root, 'module');
    const agents = await createAgentsCampaign(root, 'agenten');
    console.log(JSON.stringify({ root, module: out, agents: agents.dir }));
  } finally {
    if (!keep) rmSync(root, { recursive: true, force: true });
  }
}

// Explicit offline playtest capability, confined to a dedicated temporary root.
import { execFile } from 'node:child_process';
import { readFile, realpath, mkdtemp, rm } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { CAMPAIGN_ROOT, CAMPAIGNS_DIR, ROOT, LOOPBACK_BIND } from './config.mjs';
import { readPostJson, sendIssues, sendJson, serverIssue, notFound } from './http.mjs';
import { playerOf } from './campaigns.mjs';
import { queueCampaign } from './kernel.mjs';
import { pushCampaign } from './sse.mjs';

const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
async function demoEnabled() {
  if (process.env.REALMCRAFT_DEMO !== '1' || !LOOPBACK_BIND) return false;
  try {
    const root = await realpath(CAMPAIGN_ROOT);
    const temp = await realpath(tmpdir());
    const rel = relative(temp, root);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && root !== await realpath(ROOT);
  } catch { return false; }
}
export const DEMO = await demoEnabled();
export const handleApp = (_req, res) => sendJson(res, 200, { version, demo: DEMO });

export async function handleDemo(req, res, [cid]) {
  if (!DEMO) return notFound(res);
  const body = await readPostJson(req, res, { maxBody: 1024 });
  if (!body) return;
  if (!await playerOf(cid)) return notFound(res);
  if (Object.keys(body).some((key) => !['turn', 'rev'].includes(key))
      || !Number.isSafeInteger(body.turn) || !Number.isSafeInteger(body.rev) || body.turn < 0 || body.rev < 0) {
    return sendIssues(res, 400, [serverIssue('format', 'turn and rev must be non-negative integers')]);
  }
  const result = await queueCampaign(cid, async () => {
    const dir = join(CAMPAIGNS_DIR, cid);
    const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
    let marker;
    try { marker = JSON.parse(await readFile(join(dir, 'run.json'), 'utf8')); }
    catch (err) { if (err.code !== 'ENOENT') return { status: 409 }; }
    if (marker && marker.active !== false) return { status: 409 };
    if (state.turn !== body.turn || state.rev !== body.rev || !['resolving', 'agents'].includes(state.phase)
        || state.status === 'ended') return { status: 409 };
    // A freshly created empty fixture directory guarantees kernel fallbacks, never recorded proposals.
    const fixtures = await mkdtemp(join(tmpdir(), 'rc-offline-'));
    try {
      const ok = await new Promise((done) => execFile(process.execPath,
        ['tools/harness/dryrun.mjs', '--campaign', cid, '--root', CAMPAIGN_ROOT, '--fixtures', fixtures, '--sealed-only', '--expect-turn', String(body.turn), '--expect-rev', String(body.rev)],
        { cwd: ROOT, env: { ...process.env, REALMCRAFT_ROOT: CAMPAIGN_ROOT }, windowsHide: true,
          timeout: 120000, maxBuffer: 16 * 1024 * 1024 }, (err) => done(!err)));
      if (!ok) return { status: 500 };
      const after = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
      return { status: 200, body: { ok: true, turn: after.turn, phase: after.phase, mode: 'kernel-fallback' } };
    } finally { await rm(fixtures, { recursive: true, force: true }); }
  });
  if (result.status !== 200) return sendIssues(res, result.status, [serverIssue('server',
    result.status === 409 ? 'Offline continuation refused. Reload and check phase or active harness.' : 'Offline continuation failed. Reload before retrying.')]);
  await pushCampaign(cid);
  return sendJson(res, 200, result.body);
}

// Write side of the campaign bridge: the player's draft goes through the
// kernel's preview, the end of planning through its seal.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { playerOf } from './campaigns.mjs';
import { readPostJson, sendIssues, sendJson, serverIssue } from './http.mjs';
import { parseCli, runCli } from './kernel.mjs';

/** Guarded body plus the campaign's player, or null once an error response went out. */
async function campaignPost(req, res) {
  const body = await readPostJson(req, res);
  if (!body) return null;
  const player = await playerOf(body.campaign);
  if (!player) {
    sendIssues(res, 400, [serverIssue('server.unknown_campaign', 'unknown campaign', { path: '/campaign' })]);
    return null;
  }
  return { body, cid: body.campaign, player };
}

/** POST /api/seal { campaign }: `cli seal`, its JSON as the answer. */
export async function handleSeal(req, res) {
  const ctx = await campaignPost(req, res);
  if (!ctx) return;
  const out = parseCli(await runCli(ctx.cid, ['seal', '--campaign', ctx.cid, '--json']));
  return out ? sendJson(res, 200, out) : sendIssues(res, 500, [serverIssue('server.cli', 'seal produced no result')]);
}

/** POST /api/draft { campaign, people, draft }: `cli preview`, which stores the draft. */
export async function handleDraft(req, res) {
  const ctx = await campaignPost(req, res);
  if (!ctx) return;
  const { body, cid, player } = ctx;
  if (body.people !== player) return sendIssues(res, 400, [serverIssue('server.not_player', 'people must be the player of the campaign', { path: '/people' })]);
  if (!body.draft || typeof body.draft !== 'object' || Array.isArray(body.draft)) {
    return sendIssues(res, 400, [serverIssue('format', 'draft must be an object', { path: '/draft', params: { reason: 'not-object' } })]);
  }
  const tmp = await mkdtemp(join(tmpdir(), 'rc-draft-'));
  try {
    const file = join(tmp, 'draft.json');
    await writeFile(file, JSON.stringify(body.draft));
    const out = parseCli(await runCli(cid, ['preview', '--as', player, '--draft', file, '--campaign', cid, '--json']));
    if (!out) return sendIssues(res, 500, [serverIssue('server.cli', 'preview produced no result')]);
    const { ok, exit, stored, issues, ...preview } = out;
    return sendJson(res, 200, { ok, exit, stored: Boolean(stored), issues, preview });
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

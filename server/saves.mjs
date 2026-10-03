// Saves of a campaign. engine/cli.mjs writes, lists and restores them; the
// server checks campaign id, slot id, label and body first, so the CLI only
// sees values it can trust. Refusals of the CLI (a running turn, the wrong
// phase, a held lock) come back as issues with the matching HTTP status.
import { ID_RE } from './config.mjs';
import { playerOf } from './campaigns.mjs';
import { readPostJson, sendIssues, sendJson, serverIssue } from './http.mjs';
import { parseCli, runCli } from './kernel.mjs';
import { pushCampaign } from './sse.mjs';

// A label or a slot id fits in far less; the limit keeps junk bodies out early.
const MAX_SAVE_BODY = 1024;
// The same limits as engine/cli.mjs, repeated so the server starts while the engine is edited.
const LABEL_MAX = 80;
const LABEL_BAD = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
// CLI exit codes: 2 refused or invalid, 3 missing (save, campaign), 4 phase, lock or running turn.
const HTTP_OF_EXIT = { 2: 400, 3: 404, 4: 409 };

const bad = (path, message, params) => serverIssue('format', message, { path, params });

async function knownCampaign(res, cid) {
  if (ID_RE.test(cid) && (await playerOf(cid))) return true;
  sendIssues(res, 404, [serverIssue('server.unknown_campaign', 'unknown campaign', { path: '/campaign', params: { campaign: cid } })]);
  return false;
}

function onlyFields(body, allowed) {
  return Object.keys(body).filter((k) => !allowed.includes(k)).map((k) => bad(`/${k}`, `unknown field "${k}"`, { reason: 'unknown-field', field: k }));
}

/** Answers the CLI JSON as it is with `okStatus`, or its issues with the status of its exit code. */
function answer(res, out, okStatus, what) {
  if (!out) return sendIssues(res, 500, [serverIssue('server.cli', `${what} produced no result`)]);
  if (out.exit === 0) return sendJson(res, okStatus, out);
  const issues = Array.isArray(out.issues) && out.issues.length ? out.issues : [serverIssue('server.cli', `${what} failed with exit ${out.exit}`)];
  return sendIssues(res, HTTP_OF_EXIT[out.exit] ?? 500, issues);
}

/** GET /api/campaigns/<cid>/saves -> { ok, exit, saves, issues }, newest first. */
export async function handleSaveList(_req, res, [cid]) {
  if (!(await knownCampaign(res, cid))) return;
  return answer(res, parseCli(await runCli(cid, ['saves', '--campaign', cid, '--json'])), 200, 'saves');
}

/** POST /api/campaigns/<cid>/saves { label } -> 201 { ok, exit, save, issues }. */
export async function handleSaveCreate(req, res, [cid]) {
  const body = await readPostJson(req, res, { maxBody: MAX_SAVE_BODY });
  if (!body) return;
  if (!(await knownCampaign(res, cid))) return;
  const issues = onlyFields(body, ['label']);
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label || [...label].length > LABEL_MAX || LABEL_BAD.test(label)) {
    issues.push(bad('/label', `label must be text of 1 to ${LABEL_MAX} characters without control characters`, { reason: 'label', max: LABEL_MAX }));
  }
  if (issues.length) return sendIssues(res, 400, issues);
  return answer(res, parseCli(await runCli(cid, ['save', '--campaign', cid, '--name', label, '--json'])), 201, 'save');
}

/** POST /api/campaigns/<cid>/load { slot } -> { ok, exit, slot, autosave, turn, phase, status, rev, stateHash, drift, issues }. */
export async function handleLoad(req, res, [cid]) {
  const body = await readPostJson(req, res, { maxBody: MAX_SAVE_BODY });
  if (!body) return;
  if (!(await knownCampaign(res, cid))) return;
  const issues = onlyFields(body, ['slot']);
  if (typeof body.slot !== 'string' || !ID_RE.test(body.slot)) issues.push(bad('/slot', `slot must match ${ID_RE.source}`, { reason: 'slot-id' }));
  if (issues.length) return sendIssues(res, 400, issues);
  const out = parseCli(await runCli(cid, ['load', '--campaign', cid, '--slot', body.slot, '--json']));
  if (out?.exit === 0) await pushCampaign(cid);
  return answer(res, out, 200, 'load');
}

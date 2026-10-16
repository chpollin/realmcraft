// The existing harness writes the private workshop through its Node helper.
// The browser creates a session and reads it; no provider or chat service runs.
import { createWorkshop, readWorkshop, workshopPrompt } from '../engine/harness/workshop.js';
import { CAMPAIGN_ROOT } from './config.mjs';
import { readPostJson, sendIssues, sendJson, serverIssue } from './http.mjs';

function failed(res, error) {
  return sendIssues(res, error.status ?? 500, error.issues ?? [serverIssue('server.cli', 'Workshop could not be read or prepared')]);
}
export async function handleWorkshopCreate(req, res) {
  const body = await readPostJson(req, res, { maxBody: 1024 });
  if (!body) return;
  try {
    const workshop = createWorkshop(CAMPAIGN_ROOT, body);
    return sendJson(res, 200, { ok: true, workshop, prompt: workshopPrompt(CAMPAIGN_ROOT, workshop) });
  } catch (error) { return failed(res, error); }
}
export function handleWorkshopGet(req, res, [id]) {
  try {
    const workshop = readWorkshop(CAMPAIGN_ROOT, id);
    return sendJson(res, 200, { ok: true, workshop, prompt: workshopPrompt(CAMPAIGN_ROOT, workshop) });
  } catch (error) { return failed(res, error); }
}

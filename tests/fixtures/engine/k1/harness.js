// Shared setup of the harness tests (tasks, ingest, CLI): the real Hochland
// package as kernel env, proposal builders and a CLI runner over a temp root.
// The k1 test pack cannot serve here because the CLI validates the world
// package against the power budget, which only the real pack passes.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeEnv } from '../../../../engine/core/env.js';
import { createCampaign } from '../../../../engine/core/turn.js';
import { libraryFrom, resolveRef } from '../../../../engine/content/library.js';
import { scoreEntwicklungStandalone } from '../../../../engine/content/budget.js';

export const REPO = fileURLToPath(new URL('../../../../', import.meta.url));
export const CLI = join(REPO, 'engine', 'cli.mjs');
export const CAMPAIGN = 'test-1';

const readJson = (rel) => JSON.parse(readFileSync(join(REPO, rel), 'utf8'));

export function hochland() {
  const content = Object.fromEntries(['entwicklungen', 'ereignisse', 'bestimmungen'].map((k) => [k, readJson(`welten/hochland/content/${k}.json`)]));
  const library = libraryFrom([...content.entwicklungen.items, ...content.ereignisse.items, ...content.bestimmungen.items]);
  const holder = { library };
  const env = makeEnv({
    welt: readJson('welten/hochland/welt.json'),
    regeln: readJson('welten/hochland/regeln.json'),
    labels: readJson('welten/hochland/labels.json'),
    content,
    resolve: (ref) => resolveRef(holder.library, ref),
  });
  return { env, library, holder };
}

export function freshCampaign(env, seed = 7) {
  return createCampaign(env, { id: CAMPAIGN, seed }).state;
}

export const taskOf = (tasks, agent, people = null) => tasks.find((t) => t.task.agent === agent && t.task.people === people).task;

export function proposalFor(task, items, over = {}) {
  return {
    format: 'realmcraft-proposal',
    version: 1,
    proposalId: task.respondAs.proposalId,
    agent: task.agent,
    campaign: task.campaign,
    turn: task.turn,
    basedOnRev: task.rev,
    people: task.people,
    items,
    ...over,
  };
}

/**
 * A new tier 1 technique cloned from a world development, so it passes the
 * budget (research cost recomputed) and the drift check; the people needs a
 * practice row for the tags to be grounded (see withPractice).
 */
export function agentEntwicklung(env, proposalId, id = 'karawanenpfad') {
  const base = structuredClone(env.content.entwicklungen.find((e) => e.id === 'saumpfad'));
  const ent = {
    ...base,
    id,
    name: 'Karawanenpfad',
    tags: ['weg', 'zug'],
    effects: [{ op: 'probe.mod', tags: ['weg'], amount: 1 }, { op: 'probe.mod', tags: ['zug'], amount: 1 }],
    origin: { source: 'agent', practiceTags: ['weg'], token: null, request: null, proposal: proposalId },
  };
  ent.cost = { research: scoreEntwicklungStandalone(ent, env.regeln).net * (ent.tier + 1), resources: {} };
  return ent;
}

export function withPractice(state, pid, tags = { weg: 3, zug: 2 }) {
  const next = structuredClone(state);
  next.peoples[pid].practice.ledger = [{ turn: state.turn, tags }];
  return next;
}

// --- CLI -----------------------------------------------------------------------

export function makeRoot() {
  return mkdtempSync(join(tmpdir(), 'rc-cli-test-'));
}

export const removeRoot = (root) => rmSync(root, { recursive: true, force: true });

/** Runs `node engine/cli.mjs <args> --json` in a root; the repository's welten/ serves as world source. */
export function cli(root, args) {
  const r = spawnSync(process.execPath, [CLI, ...args, '--json'], { cwd: root, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8', timeout: 120000 });
  if (r.error) throw r.error;
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // leave null, the test prints stdout and stderr
  }
  return { code: r.status, json, stdout: r.stdout, stderr: r.stderr, codes: (json?.issues ?? []).map((i) => i.code) };
}

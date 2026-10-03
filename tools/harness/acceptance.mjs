// How often the live agents' proposals pass the kernel, read from the
// verdicts ingest filed under campaigns/<cid>/agents/verdicts/. Read-only:
// it opens no lock and writes nothing, so it may run beside a game.
//
//   node tools/harness/acceptance.mjs [--campaign <cid>] [--root <dir>] [--from <turn>] [--to <turn>] [--agent <id>]
//
// Prints one JSON object. Per agent: proposals by verdict, items accepted of
// items sent (an envelope refusal counts its proposal, not its items), the
// rate of accepted items, the counts per item type and the most frequent
// refusal reasons as code plus params.reason. Duplicates repeat a verdict
// already filed and are counted apart. Exit 3 without a campaign.

import { readdirSync } from 'node:fs';
import { campaignFromArgs, parseArgs, readJsonFile } from './lib.mjs';

const TOP_REFUSALS = 8;
const { opt } = parseArgs(process.argv.slice(2));
const { cid, dir } = campaignFromArgs(opt, 'acceptance');
const bound = (v) => (v === undefined || v === true ? null : Number(v));
const from = bound(opt.from);
const to = bound(opt.to);
if ([from, to].some((v) => v !== null && !Number.isInteger(v))) {
  process.stderr.write('usage: acceptance.mjs [--campaign <cid>] [--from <turn>] [--to <turn>] [--agent <id>]\n');
  process.exit(2);
}

let names = [];
try {
  names = readdirSync(`${dir}/agents/verdicts`).filter((n) => n.endsWith('.json')).sort();
} catch {
  // no verdicts yet: an empty report
}

const rate = (accepted, total) => (total ? Math.round((accepted / total) * 100) / 100 : null);
const agents = {};
const turns = [];
for (const n of names) {
  const v = readJsonFile(`${dir}/agents/verdicts/${n}`, null);
  const turn = Number(/\.T(\d+)$/.exec(String(v?.proposalId ?? n.slice(0, -5)))?.[1]);
  const agent = typeof v?.agent === 'string' ? v.agent : String(v?.proposalId ?? n).split('.')[0];
  if (!v || !Number.isInteger(turn) || (from !== null && turn < from) || (to !== null && turn > to)) continue;
  if (typeof opt.agent === 'string' && agent !== opt.agent) continue;
  turns.push(turn);
  const a = (agents[agent] ??= { proposals: 0, verdicts: {}, items: { sent: 0, accepted: 0 }, byType: {}, refusals: new Map() });
  a.proposals += 1;
  a.verdicts[v.verdict] = (a.verdicts[v.verdict] ?? 0) + 1;
  if (v.verdict === 'duplicate') continue;
  const refuse = (i) => {
    const key = JSON.stringify([i.code, i.params?.reason ?? null]);
    a.refusals.set(key, (a.refusals.get(key) ?? 0) + 1);
  };
  const items = Array.isArray(v.items) ? v.items : [];
  // An envelope refusal (campaign, turn, task) rejects every item without
  // an issue of its own; its issues count once, for the proposal.
  let envelope = !items.length;
  for (const it of items) {
    const t = (a.byType[it.type] ??= { sent: 0, accepted: 0 });
    t.sent += 1;
    a.items.sent += 1;
    if (it.verdict === 'accepted') {
      t.accepted += 1;
      a.items.accepted += 1;
    } else {
      const errors = (it.issues ?? []).filter((i) => i.severity !== 'warning');
      if (errors.length) errors.forEach(refuse);
      else envelope = true;
    }
  }
  if (envelope) (v.issues ?? []).filter((i) => i.severity !== 'warning' && !String(i.path ?? '').startsWith('/items/')).forEach(refuse);
}

let sent = 0;
let accepted = 0;
const out = {};
for (const [id, a] of Object.entries(agents).sort(([x], [y]) => (x < y ? -1 : 1))) {
  sent += a.items.sent;
  accepted += a.items.accepted;
  out[id] = {
    proposals: a.proposals,
    verdicts: a.verdicts,
    items: { ...a.items, rate: rate(a.items.accepted, a.items.sent) },
    byType: Object.fromEntries(Object.entries(a.byType).map(([t, c]) => [t, { ...c, rate: rate(c.accepted, c.sent) }])),
    refusals: [...a.refusals].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, TOP_REFUSALS).map(([key, count]) => {
      const [code, reason] = JSON.parse(key);
      return { code, reason, count };
    }),
  };
}

process.stdout.write(`${JSON.stringify({
  campaign: cid,
  turns: turns.length ? { from: Math.min(...turns), to: Math.max(...turns) } : null,
  items: { sent, accepted, rate: rate(accepted, sent) },
  agents: out,
}, null, 2)}\n`);

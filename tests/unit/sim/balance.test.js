import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadWorld, runSimulation, simulateCampaign } from '../../../tools/sim/simulate.js';

const env = loadWorld(fileURLToPath(new URL('../../../welten/hochland/', import.meta.url)));
const templates = env.regeln.peopleTemplates;

describe('balance simulation', () => {
  it('gives the same report for the same seeds, byte for byte', () => {
    const a = runSimulation(env, { seeds: [1, 2], seasons: 3 });
    const b = runSimulation(env, { seeds: [1, 2], seasons: 3 });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it('starts every curve at the template stock and rotates the player seat', () => {
    const r = runSimulation(env, { seeds: [1, 2, 3], seasons: 2 });
    assert.deepEqual(r.runs.map((x) => x.as), templates.map((t) => t.id));
    for (const t of templates) {
      const p = r.peoples[t.id];
      assert.equal(p.runs, 3);
      for (const [res, v] of Object.entries(t.resources)) assert.equal(p.curves[0].resources[res].mean, v, `${t.id}.${res}`);
      assert.equal(p.curves[0].population.min, t.population.core);
    }
    assert.deepEqual(r.failures, []);
  });

  it('plays every season it is asked for with integer stocks and no kernel failure', () => {
    const run = simulateCampaign(env, { seed: 5, seasons: 6, as: templates[1].id });
    assert.deepEqual(run.failures, []);
    assert.equal(run.played, 6);
    for (const [pid, series] of Object.entries(run.series)) {
      assert.equal(series.length, 7, pid);
      for (const s of series) for (const [res, v] of Object.entries(s.resources)) assert.ok(Number.isInteger(v) && v >= 0, `${pid}.${res} = ${v}`);
    }
  });

  it('flags a campaign that never ends within the simulated seasons', () => {
    const r = runSimulation(env, { seeds: [1], seasons: 1 });
    assert.ok(r.findings.some((f) => f.kind === 'campaign_never_ends'));
  });
});

// Balance of the Hochland package under the fallback policy (lane C, M1). A
// short run on a few seeds; the full figures come from npm run sim:balance.
describe('hochland balance under the fallback policy', () => {
  const report = runSimulation(env, { seeds: [1, 2, 3], seasons: 24 });
  const last = (pid) => {
    const p = report.peoples[pid];
    return p.curves[Math.max(...Object.keys(p.curves).map(Number))];
  };

  it('keeps every people alive and every state the kernel writes valid', () => {
    assert.deepEqual(report.failures, []);
    for (const [pid, p] of Object.entries(report.peoples)) assert.equal(p.collapse.runs, 0, pid);
    assert.deepEqual(report.findings.filter((f) => f.kind === 'state_invalid'), []);
  });

  it('researches across the paths instead of stalling on the first tier', () => {
    for (const pid of Object.keys(report.peoples)) {
      assert.ok(last(pid).known.min >= 8, `${pid} knows ${last(pid).known.min} at least`);
      assert.ok(last(pid).maxTier.max >= 2, `${pid} reaches tier 2`);
    }
  });

  it('expands beyond the start region', () => {
    assert.ok(Object.keys(report.peoples).some((pid) => last(pid).regions.max >= 2));
  });

  it('keeps herds in every start terrain, mountains included', () => {
    for (const [pid, p] of Object.entries(report.peoples)) {
      for (const [terrain, row] of Object.entries(p.startTerrain)) assert.ok(row.resources.herden > 0, `${pid} starting in ${terrain}`);
    }
  });

  it('leaves the dark path to peoples whose leanings do not reject it', () => {
    const dark = new Set(['blutritus@1', 'schuldknechtschaft@1', 'schwarzer-zirkel@1']);
    assert.deepEqual(report.peoples.talbund.developments.filter((d) => dark.has(d.ref)), [], 'the trade league weighs opfer and dunkel below zero');
  });
});

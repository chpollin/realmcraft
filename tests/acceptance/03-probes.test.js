// Group 3, probes: what the player sees before the roll, stale rolls, and
// natural 1 and 10.
// Spec: Regelkern section 6 (target, modifiers, P = clamp((11 - target + mod)
// / 10, 0.1, 0.9), stacking, bands, fingerprint), section 5 (explore: minor,
// target 5, tags erkundung), section 7 (machtprobe: free, target 5, Wesensart
// +-2 through `approach`), section 17 (roll).
//
// Assumptions beyond lib/harness.js (A1 to A9):
// P1 explore takes params { settlement, tile } (Regelkern section 5 names
//    `unit` or `settlement` plus `tile`). The test searches tiles at distance
//    2 and 3 around the player's settlement and uses the first one the preview
//    accepts without error issues, so terrain does not have to be known.
// P2 machtprobe takes params { aim, approach } with aim 'rally', or, if the
//    preview rejects that, { aim, approach, against: null, cause: null }.
// P3 A struck modifier stays in the list, marked struck: true. The total
//    equals the sum of the counted modifiers clamped to -4..4.
// P4 The probe band is reported by `roll` (Regelkern: roll "shows the
//    calculation") or, failing that, in the round report after apply.
// P5 The orders of the second draft in the roll_stale test keep the rolls the
//    stored draft holds, as a dashboard resubmitting the draft would.

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORTUNE, SETBACK, T_SHORT, bandIn, codesOf, createCampaign, dice, errorIssues, expectExit, expectedP, isStruck,
  modTotalOf, probabilityOf, removeRoot, settlementsOf, tilesAround, wesensart,
} from './lib/harness.js';

const roots = [];
after(() => roots.forEach(removeRoot));

function fresh(label) {
  const c = createCampaign({ label, id: `acc-${label}` });
  roots.push(c.root);
  c.toPlanning();
  return c;
}

const probeFor = (c, res, orderId) => c.probes(res).find((p) => p.order === orderId || String(p.id).endsWith(`:${orderId}`));

/** First explore order around the player's settlement that previews without error issues (P1). */
function findExplore(c, skipTiles = []) {
  const s = c.state();
  const home = settlementsOf(s).find((x) => x.people === s.campaign.player);
  assert.ok(home, 'the player owns a settlement or camp after new');
  const tried = [];
  for (const tile of tilesAround(home.tile)) {
    if (skipTiles.includes(tile)) continue;
    const order = { id: 'o1', type: 'explore', params: { settlement: home.id, tile } };
    const res = c.submit(c.emptyDraft(s, [order]));
    const probe = probeFor(c, res, 'o1');
    if (res.code !== 2 && !errorIssues(res).length && probe) return { order, res, probe, tile };
    tried.push(`${tile}: exit ${res.code} ${codesOf(res).join(',')}`);
  }
  assert.fail(`no explore order around ${home.tile} previews cleanly (assumption P1):\n${tried.slice(0, 8).join('\n')}`);
}

/** machtprobe with approach on the plus or minus tag of the player's Wesensart (P2). */
function findMachtprobe(c, side) {
  const s = c.state();
  const tag = wesensart(s.peoples[s.campaign.player])[side];
  assert.ok(tag, `the player's Wesensart has a ${side} tag`);
  const variants = [{ aim: 'rally', approach: tag }, { aim: 'rally', approach: tag, against: null, cause: null }];
  const tried = [];
  for (const params of variants) {
    const order = { id: 'm1', type: 'machtprobe', params };
    const res = c.submit(c.emptyDraft(s, [order]));
    const probe = probeFor(c, res, 'm1');
    if (!errorIssues(res).length && probe) return { order, res, probe };
    tried.push(`${JSON.stringify(params)}: exit ${res.code} ${codesOf(res).join(',')}`);
  }
  assert.fail(`no machtprobe previews cleanly (assumption P2):\n${tried.join('\n')}`);
}

/** Band of a rolled probe: from the roll answer, otherwise from the round report (P4). */
function bandAfterRoll(c, probe, rollRes, previewRes, next) {
  const direct = bandIn(rollRes.json, probe.id);
  if (direct) return direct;
  const turn = c.state().turn;
  c.rollPending(previewRes, next, [probe.id]);
  expectExit(c.seal(next), [0], 'seal');
  if (c.state().phase === 'resolving') expectExit(c.apply(), [0], 'apply');
  const band = bandIn(c.roundLog(turn), probe.id);
  assert.ok(band, `neither roll nor log/T${turn}.json report a band for ${probe.id}`);
  return band;
}

describe('probes', { timeout: T_SHORT }, () => {
  it('a probe shows target, every modifier with its source, the total and P as specified', () => {
    const c = fresh('probe-show');
    const { probe } = findExplore(c);
    assert.equal(probe.roller, 'player', 'the player rolls his own explore probe');
    assert.equal(probe.target, 5, 'explore has target 5 (Regelkern section 6)');
    assert.ok(Array.isArray(probe.modifiers), 'modifiers is a list');
    for (const m of probe.modifiers) {
      assert.equal(typeof m.source, 'string', `modifier without source: ${JSON.stringify(m)}`);
      assert.ok(m.source.length > 0);
      assert.ok(Number.isInteger(m.value) && m.value >= -2 && m.value <= 2, `modifier value out of -2..2: ${JSON.stringify(m)}`);
    }
    const total = modTotalOf(probe);
    assert.ok(Number.isInteger(total), `probe total missing or not an integer: ${JSON.stringify(probe)}`);
    const counted = probe.modifiers.filter((m) => !isStruck(m)).reduce((a, m) => a + m.value, 0);
    assert.equal(total, Math.max(-4, Math.min(4, counted)), 'total is the clamped sum of counted modifiers');
    const p = probabilityOf(probe);
    assert.ok(p !== undefined, `probe carries no probability: ${JSON.stringify(probe)}`);
    assert.ok(Math.abs(p - expectedP(probe.target, total)) < 1e-9, `P ${p} != clamp((11 - ${probe.target} + ${total}) / 10, 0.1, 0.9)`);
    assert.equal(typeof probe.fingerprint, 'string', 'probe carries a fingerprint');
  });

  it('roll binds the value to the probe and a changed order makes the roll stale', () => {
    const c = fresh('probe-stale');
    const first = findExplore(c);
    const rolled = expectExit(c.roll(first.probe.id, 6), [0], 'roll');
    const stored = c.storedDraft();
    assert.equal(stored?.rolls?.[first.probe.id]?.value, 6, 'roll writes the value into the player draft');
    assert.equal(stored.rolls[first.probe.id].fingerprint, first.probe.fingerprint, 'roll stores the current fingerprint');
    assert.ok(rolled.json, 'roll answers with JSON');

    const second = findExplore(c, [first.tile]);
    const changed = { ...c.emptyDraft(c.state(), [second.order]), rolls: stored.rolls };
    const res = c.submit(changed);
    assert.ok(codesOf(res).includes('roll_stale'), `changed order params must make the roll stale, got ${codesOf(res).join(', ')}`);
    const issue = res.issues.find((i) => i.code === 'roll_stale');
    assert.equal(issue.severity, 'error');
    const sealRes = c.run('seal');
    assert.notEqual(sealRes.code, 0, 'seal refuses a draft with a stale roll');
    assert.equal(c.state().phase, 'planning');
  });

  // The margin band of a low total is 'setback', never 'crit_fail', so the band always tells the natural-1 rule apart.
  it('a natural 1 is a setback even when the modifiers would carry the probe', () => {
    const c = fresh('probe-one');
    const next = dice(3);
    const { probe, res } = findMachtprobe(c, 'plus');
    const rollRes = expectExit(c.roll(probe.id, 1), [0], 'roll 1');
    const band = bandAfterRoll(c, probe, rollRes, res, next);
    assert.ok(SETBACK.includes(band), `natural 1 gave ${band}, expected ${SETBACK.join(' or ')}`);
  });

  it('a natural 10 is a fortune even when the modifiers would sink the probe', (t) => {
    const c = fresh('probe-ten');
    const next = dice(4);
    const { probe, res } = findMachtprobe(c, 'minus');
    const total = modTotalOf(probe);
    if (10 + total - probe.target >= 4) t.diagnostic(`total ${total} does not separate the natural-10 rule from the margin`);
    const rollRes = expectExit(c.roll(probe.id, 10), [0], 'roll 10');
    const band = bandAfterRoll(c, probe, rollRes, res, next);
    assert.ok(FORTUNE.includes(band), `natural 10 gave ${band}, expected ${FORTUNE.join(' or ')}`);
  });

  it('the Wesensart moves the machtprobe total by the plus tag against the minus tag', () => {
    const c = fresh('probe-wesen');
    const plus = findMachtprobe(c, 'plus').probe;
    const minus = findMachtprobe(c, 'minus').probe;
    const raw = (p) => p.modifiers.filter((m) => !isStruck(m)).reduce((a, m) => a + m.value, 0);
    // A tag can also match a further modifier (a probe.mod of a development), so the expected gap comes from the projection.
    const wesen = (p) => p.modifiers.filter((m) => !isStruck(m) && /wesensart/i.test(m.source)).reduce((a, m) => a + m.value, 0);
    assert.equal(wesen(plus), 2, 'the plus tag contributes +2 as Wesensart modifier');
    assert.equal(wesen(minus), -2, 'the minus tag contributes -2 as Wesensart modifier');
    const others = (p) => raw(p) - wesen(p);
    assert.equal(raw(plus) - raw(minus), 4 + others(plus) - others(minus), 'gap is the Wesensart swing of 4 plus the difference of the other modifiers');
    assert.equal(plus.target, 5);
    assert.equal(minus.target, 5);
  });
});

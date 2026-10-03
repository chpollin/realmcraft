import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS, SUCCESS, probeId, chance, bandOf, bandLabelKey, gatherModifiers, buildProbe, resolveProbe,
  softcapIssues, eventBand, calculation, fingerprint,
} from '../../../engine/core/probes.js';
import { RULES } from '../../../engine/core/rules.js';
import { freshState, cxOf, clone, PLAYER } from '../../fixtures/engine/k1/foundation.js';

const mod = (source, value, dev = false) => ({ source, label: source, value, dev });
const spec = (over = {}) => ({
  id: 'T0:hochweide:o1', people: PLAYER, order: 'o1', kind: 'build', tags: ['bau'], roller: 'player', target: 5, modifiers: [], params: {}, ...over,
});

test('probeId names turn, people and suffix', () => {
  assert.equal(probeId(6, 'schar', 'o2'), 'T6:schar:o2');
});

test('bands are the six canonical ones; narrow, success and crit_success succeed', () => {
  assert.deepEqual([...BANDS], ['crit_fail', 'setback', 'failure', 'narrow', 'success', 'crit_success']);
  assert.deepEqual([...SUCCESS].sort(), ['crit_success', 'narrow', 'success']);
  assert.equal(bandLabelKey('crit_success'), 'band.crit-success');
  assert.equal(bandLabelKey('failure'), 'band.failure');
});

test('chance is clamp((11 - target + mod) x 10, 10, 90) at every target and modifier', () => {
  for (let target = 3; target <= 8; target++) {
    for (let m = -4; m <= 4; m++) {
      const expected = Math.min(90, Math.max(10, (11 - target + m) * 10));
      assert.equal(chance(target, m), expected, `target ${target} mod ${m}`);
    }
  }
  assert.equal(chance(5, 0), 60);
  assert.equal(chance(6, 0), 50);
  assert.equal(chance(8, -4), 10);
  assert.equal(chance(3, 4), 90);
});

test('chance clamp boundaries: 90 is reached at 9, 10 at 2, and both hold beyond', () => {
  assert.equal(chance(3, 0), 80);
  assert.equal(chance(3, 1), 90);
  assert.equal(chance(3, 2), 90);
  assert.equal(chance(9, 0), 20);
  assert.equal(chance(10, 0), 10);
  assert.equal(chance(11, 0), 10);
  assert.equal(chance(12, 0), 10);
});

test('band at every margin boundary with target 5 and no modifier', () => {
  const t = 5;
  assert.equal(bandOf(9, 0, t), 'crit_success'); // m = 4
  assert.equal(bandOf(8, 0, t), 'success'); // m = 3
  assert.equal(bandOf(7, 0, t), 'success'); // m = 2
  assert.equal(bandOf(6, 0, t), 'success'); // m = 1
  assert.equal(bandOf(5, 0, t), 'narrow'); // m = 0
  assert.equal(bandOf(4, 0, t), 'failure'); // m = -1
  assert.equal(bandOf(3, 0, t), 'failure'); // m = -2
  assert.equal(bandOf(2, 0, t), 'failure'); // m = -3
});

test('band setback from margin -4 down, and the modifier counts in the margin', () => {
  assert.equal(bandOf(4, 0, 8), 'setback'); // m = -4
  assert.equal(bandOf(2, 0, 8), 'setback'); // m = -6
  assert.equal(bandOf(5, 0, 8), 'failure'); // m = -3
  assert.equal(bandOf(4, 1, 8), 'failure'); // m = -3
  assert.equal(bandOf(7, 2, 5), 'crit_success'); // m = 4 from the modifier, natural 7
  assert.equal(bandOf(5, -1, 5), 'failure'); // m = -1
});

test('natural 10 is crit_success and natural 1 is crit_fail whatever the margin', () => {
  assert.equal(bandOf(10, -4, 8), 'crit_success'); // m = -2
  assert.equal(bandOf(10, -4, 14), 'crit_success'); // m = -8
  assert.equal(bandOf(1, 4, 3), 'crit_fail'); // m = 2
  assert.equal(bandOf(1, 4, 1), 'crit_fail'); // m = 4
});

test('resolveProbe records roll, margin, band and the natural only for 1 and 10', () => {
  const p = buildProbe(spec());
  const r = resolveProbe(p, 8);
  assert.equal(r.roll, 8);
  assert.equal(r.margin, 3);
  assert.equal(r.band, 'success');
  assert.equal(r.natural, null);
  assert.equal(resolveProbe(p, 10).natural, 10);
  assert.equal(resolveProbe(p, 1).natural, 1);
  assert.equal(resolveProbe(p, 1).band, 'crit_fail');
  assert.equal(resolveProbe(p, 9).natural, null);
  assert.equal(p.roll, null, 'the probe passed in stays unrolled');
});

test('resolveProbe margin includes the modifier total', () => {
  const p = buildProbe(spec({ modifiers: [mod('a', 2)] }));
  const r = resolveProbe(p, 3);
  assert.equal(p.modTotal, 2);
  assert.equal(r.margin, 0);
  assert.equal(r.band, 'narrow');
});

test('resolveProbe rejects rolls outside 1..10 or non-integers', () => {
  const p = buildProbe(spec());
  for (const r of [0, 11, 1.5, NaN, '5', null]) assert.throws(() => resolveProbe(p, r), RangeError, String(r));
});

test('a raw event probe has no target, no chance and no band', () => {
  const p = buildProbe(spec({ kind: 'event', target: null, modifiers: [mod('a', 2)] }));
  assert.equal(p.target, null);
  assert.equal(p.chance, null);
  assert.deepEqual(p.modifiers, []);
  assert.equal(p.modTotal, 0);
  const r = resolveProbe(p, 7);
  assert.equal(r.roll, 7);
  assert.equal(r.band, null);
  assert.equal(r.margin, null);
});

test('target is clamped to 3..8 for order probes', () => {
  assert.equal(buildProbe(spec({ target: 1 })).target, 3);
  assert.equal(buildProbe(spec({ target: 3 })).target, 3);
  assert.equal(buildProbe(spec({ target: 8 })).target, 8);
  assert.equal(buildProbe(spec({ target: 12 })).target, 8);
});

test('probe chance in the record follows target and total', () => {
  const p = buildProbe(spec({ target: 6, modifiers: [mod('a', 1)] }));
  assert.equal(p.chance, chance(6, 1));
  assert.equal(p.chance, 60);
});

test('stacking: one modifier above +-2 is cut to +-2 and the cut is listed as struck', () => {
  const p = buildProbe(spec({ modifiers: [mod('hero', 3)] }));
  assert.equal(p.modTotal, 2);
  assert.deepEqual(p.struck, [{ source: 'hero', label: 'hero', value: 1, reason: 'single' }]);
  assert.deepEqual(p.modifiers.filter((m) => !m.struck), [{ source: 'hero', label: 'hero', value: 2 }]);
  assert.deepEqual(p.modifiers.filter((m) => m.struck), [{ source: 'hero', label: 'hero', value: 1, struck: true, reason: 'single' }]);
  const neg = buildProbe(spec({ modifiers: [mod('curse', -5)] }));
  assert.equal(neg.modTotal, -2);
  assert.deepEqual(neg.struck, [{ source: 'curse', label: 'curse', value: -3, reason: 'single' }]);
});

test('stacking: exactly +-2 is not cut and leaves no struck entry', () => {
  const p = buildProbe(spec({ modifiers: [mod('a', 2), mod('b', -2)] }));
  assert.deepEqual(p.struck, []);
  assert.equal(p.modTotal, 0);
  assert.equal(p.modifiers.length, 2);
});

test('stacking: modifiers from developments add up to +3 at most, the surplus is struck with reason developments', () => {
  const p = buildProbe(spec({ modifiers: [mod('dev-a', 2, true), mod('dev-b', 2, true), mod('dev-c', 1, true)] }));
  assert.equal(p.modTotal, 3);
  const counted = p.modifiers.filter((m) => !m.struck);
  assert.deepEqual(counted.map((m) => [m.source, m.value]), [['dev-a', 2], ['dev-b', 1]]);
  assert.deepEqual(p.struck, [
    { source: 'dev-b', label: 'dev-b', value: 1, reason: 'developments' },
    { source: 'dev-c', label: 'dev-c', value: 1, reason: 'developments' },
  ]);
  const listed = p.modifiers.filter((m) => m.struck);
  assert.deepEqual(listed.map((m) => [m.source, m.value, m.reason]), [['dev-b', 1, 'developments'], ['dev-c', 1, 'developments']]);
});

test('stacking: the development cap does not apply to non-development sources or to negatives', () => {
  const p = buildProbe(spec({ modifiers: [mod('w1', 2), mod('w2', 1), mod('dev-a', -2, true), mod('dev-b', -2, true)] }));
  assert.equal(p.struck.filter((s) => s.reason === 'developments').length, 0);
  assert.equal(p.modTotal, -1);
  const q = buildProbe(spec({ modifiers: [mod('s1', 2), mod('s2', 2)] }));
  assert.equal(q.modTotal, 4);
  assert.deepEqual(q.struck, []);
});

test('stacking: the total is capped at +-4 and the cut is listed in struck with reason total', () => {
  const up = buildProbe(spec({ modifiers: [mod('a', 2), mod('b', 2), mod('c', 2)] }));
  assert.equal(up.modTotal, 4);
  assert.deepEqual(up.struck, [{ source: 'total', label: 'cap', value: 2, reason: 'total' }]);
  const down = buildProbe(spec({ modifiers: [mod('a', -2), mod('b', -2), mod('c', -2), mod('d', -1)] }));
  assert.equal(down.modTotal, -4);
  assert.deepEqual(down.struck, [{ source: 'total', label: 'cap', value: -3, reason: 'total' }]);
  assert.equal(up.chance, chance(5, 4));
});

test('stacking: struck entries never count towards modTotal', () => {
  const p = buildProbe(spec({ modifiers: [mod('dev-a', 3, true), mod('dev-b', 2, true), mod('dev-c', 2, true)] }));
  const counted = p.modifiers.filter((m) => !m.struck).reduce((n, m) => n + m.value, 0);
  assert.equal(p.modTotal, Math.max(-4, Math.min(4, counted)));
  assert.equal(p.modTotal, 3);
  assert.ok(p.modifiers.some((m) => m.struck === true));
});

test('stacking: zero modifiers are dropped, order of input does not matter', () => {
  const list = [mod('a', 2, true), mod('b', 1, true), mod('c', 2, true), mod('z', 0)];
  const p1 = buildProbe(spec({ modifiers: list }));
  const p2 = buildProbe(spec({ modifiers: [...list].reverse() }));
  assert.equal(p1.modifiers.some((m) => m.source === 'z'), false);
  assert.deepEqual(p1.modifiers, p2.modifiers);
  assert.equal(p1.fingerprint, p2.fingerprint);
});

test('softcapIssues warn exactly when something was cut', () => {
  assert.deepEqual(softcapIssues(buildProbe(spec({ modifiers: [mod('a', 1)] }))), []);
  const w = softcapIssues(buildProbe(spec({ modifiers: [mod('a', 3)] })));
  assert.equal(w.length, 1);
  assert.equal(w[0].code, 'softcap');
  assert.equal(w[0].severity, 'warning');
  assert.equal(w[0].path, '/probes/T0:hochweide:o1');
});

test('fingerprint is stable for equal input and independent of key order in params', () => {
  const a = buildProbe(spec({ params: { x: 1, y: [1, 2] } }));
  const b = buildProbe(spec({ params: { y: [1, 2], x: 1 } }));
  assert.equal(a.fingerprint, b.fingerprint);
  assert.match(a.fingerprint, /^[0-9a-f]{16}$/);
});

test('fingerprint changes with target, modifier source or value, params, id and kind', () => {
  const base = buildProbe(spec({ modifiers: [mod('a', 1)], params: { x: 1 } })).fingerprint;
  const changed = [
    spec({ target: 6, modifiers: [mod('a', 1)], params: { x: 1 } }),
    spec({ modifiers: [mod('a', 2)], params: { x: 1 } }),
    spec({ modifiers: [mod('b', 1)], params: { x: 1 } }),
    spec({ modifiers: [mod('a', 1), mod('c', 1)], params: { x: 1 } }),
    spec({ modifiers: [], params: { x: 1 } }),
    spec({ modifiers: [mod('a', 1)], params: { x: 2 } }),
    spec({ modifiers: [mod('a', 1)], params: {} }),
    spec({ id: 'T0:hochweide:o2', modifiers: [mod('a', 1)], params: { x: 1 } }),
    spec({ kind: 'explore', modifiers: [mod('a', 1)], params: { x: 1 } }),
  ];
  for (const s of changed) assert.notEqual(buildProbe(s).fingerprint, base, JSON.stringify(s));
});

test('fingerprint ignores the roll and struck entries', () => {
  const p = buildProbe(spec({ modifiers: [mod('a', 1)] }));
  assert.equal(resolveProbe(p, 7).fingerprint, p.fingerprint);
  assert.equal(fingerprint(p, {}), p.fingerprint);
});

test('eventBand maps a raw d10 to bands 1..5 by default and by custom table', () => {
  const expected = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => eventBand(i + 1)), expected);
  assert.deepEqual(RULES.eventBands.length, 5);
  assert.equal(eventBand(5, [[1, 4], [5, 10]]), 2);
  assert.equal(eventBand(4, [[1, 4], [5, 10]]), 1);
});

test('calculation prints roll, counted modifiers, margin and band', () => {
  const p = buildProbe(spec({ modifiers: [mod('a', 2), mod('b', 3)] }));
  assert.equal(calculation(p), 'T0:hochweide:o1: not rolled');
  const text = calculation(resolveProbe(p, 6));
  assert.match(text, /roll 6 /);
  assert.match(text, /= 10 vs 5, margin 5, crit_success$/);
  assert.equal(calculation(resolveProbe(buildProbe(spec({ target: null, kind: 'event' })), 4)), 'T0:hochweide:o1: roll 4');
});

// gatherModifiers

const peopleWith = (wesensart) => ({ identity: { wesensart } });
const WES = { plus: { tag: 'wege', text: '' }, minus: { tag: 'mauern', text: '' } };
const probeMod = (tags, amount, kind = 'development', extra = {}) => ({
  effect: { op: 'probe.mod', tags, amount, ...extra },
  source: { kind, key: `${kind}:x`, label: 'Quelle' },
});

test('gatherModifiers: Wesensart gives +2 on the plus tag and -2 on the minus tag', () => {
  const p = peopleWith(WES);
  assert.deepEqual(gatherModifiers(p, ['wege'], [], {}), [{ source: 'wesensart:plus', label: 'wege', value: 2, dev: false }]);
  assert.deepEqual(gatherModifiers(p, ['mauern'], [], {}), [{ source: 'wesensart:minus', label: 'mauern', value: -2, dev: false }]);
  assert.equal(gatherModifiers(p, ['wege', 'mauern'], [], {}).length, 2);
  assert.deepEqual(gatherModifiers(p, ['bau'], [], {}), []);
  assert.deepEqual(gatherModifiers(peopleWith(null), ['wege'], [], {}), []);
  assert.deepEqual(gatherModifiers({ identity: {} }, ['wege'], [], {}), []);
});

test('gatherModifiers: probe.mod counts when its tags intersect, and flags development sources', () => {
  const p = peopleWith(null);
  const standing = [
    probeMod(['zug', 'weide'], 1, 'development', { label: 'Filz' }),
    probeMod(['herde'], 2, 'building'),
    probeMod(['zug'], -1, 'status'),
    probeMod(['krieg'], 2),
    { effect: { op: 'resource.flow', res: 'nahrung', amount: 1 }, source: { kind: 'development', key: 'd', label: 'D' } },
  ];
  const out = gatherModifiers(p, ['zug'], standing, {});
  assert.deepEqual(out, [
    { source: 'development:x', label: 'Filz', value: 1, dev: true },
    { source: 'status:x', label: 'Quelle', value: -1, dev: false },
  ]);
  assert.deepEqual(gatherModifiers(p, ['herde'], standing, {}), [{ source: 'building:x', label: 'Quelle', value: 2, dev: true }]);
});

test('gatherModifiers: the condition of a probe.mod must hold against the state', () => {
  const { env, state } = freshState();
  const cx = cxOf(state, env);
  const p = state.peoples[PLAYER];
  const open = probeMod(['bau'], 1, 'development', { if: { res: 'nahrung', cmp: 'gte', value: 6 } });
  const shut = probeMod(['bau'], 1, 'development', { if: { res: 'nahrung', cmp: 'gte', value: 7 } });
  assert.equal(gatherModifiers(p, ['bau'], [open], cx).length, 1);
  assert.equal(gatherModifiers(p, ['bau'], [shut], cx).length, 0);
  assert.equal(gatherModifiers(p, ['bau'], [probeMod(['bau'], 1, 'development', { if: null })], cx).length, 1);
});

test('the real gathered list feeds buildProbe: Wesensart plus a development give 3 and the order is deterministic', () => {
  const { env, state } = freshState();
  const p = clone(state.peoples[PLAYER]);
  const mods = gatherModifiers(p, ['wege', 'zug'], [probeMod(['zug'], 1, 'development', { label: 'Filz' })], cxOf(state, env));
  const probe = buildProbe(spec({ tags: ['wege', 'zug'], modifiers: mods }));
  assert.equal(probe.modTotal, 3);
});

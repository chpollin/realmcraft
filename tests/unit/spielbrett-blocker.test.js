// What keeps a turn from ending and how the board keeps impossible orders out
// of the draft: German issue labels, replacement of once-per-season orders,
// the swap offered for a full slot, and the blocker list of a broken draft
// (the draft the owner could not seal in the playtest of 3 October 2026).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildEnv, previewDraft, isUnique } from '../../spielbrett/js/data/kernel.js';
import { makeLabels } from '../../spielbrett/js/data/labels.js';
import { blockersOf, issueKey, issueText } from '../../spielbrett/js/data/adapter.js';
import { draftFor, withOrder, withReplacedOrder, withoutRoll } from '../../spielbrett/js/data/draft.js';
import { previewOption } from '../../spielbrett/js/data/options.js';
import { CODES } from '../../engine/core/issues.js';
import { parseKey, regionOf } from '../../engine/world/index.js';

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));
const json = (p) => JSON.parse(readFileSync(root(p), 'utf8'));
const pack = {
  welt: json('welten/hochland/welt.json'),
  regeln: json('welten/hochland/regeln.json'),
  labels: json('welten/hochland/labels.json'),
  entwicklungen: json('welten/hochland/content/entwicklungen.json'),
  ereignisse: json('welten/hochland/content/ereignisse.json'),
  bestimmungen: json('welten/hochland/content/bestimmungen.json'),
};
const env = buildEnv(pack, []);
const t = makeLabels(pack.labels);
const view = json('tests/fixtures/spielbrett/view-hochland-t0.json');
const pid = view.people;
const world = env.world(view.map.seed);
const camp = view.map.settlements.find((s) => s.people === pid);
const draft0 = draftFor(view, null);
const ctxOf = (draft) => ({ view, env, t, draft, base: previewDraft(view, env, draft), world });

describe('issue texts', () => {
  test('every kernel issue code and the module codes have a German label', () => {
    const missing = [...Object.keys(CODES), 'handel.no_route'].filter((c) => !t.has(issueKey(c)));
    assert.deepEqual(missing, []);
  });

  test('an unknown code falls back to a generic German sentence, never the code or an English message', () => {
    const text = issueText({ code: 'frobnicate.unknown', message: 'something broke' }, t);
    assert.equal(text, t('issue.generic'));
  });
});

describe('research replaces its namesake', () => {
  const cands = view.peoples[pid].developments.candidates.map((c) => c.ref);
  const assign = (ref) => ({ type: 'research.assign', params: { development: ref } });

  test('research.assign is a once-per-season order of the kernel', () => {
    assert.equal(isUnique('research.assign'), true);
    assert.equal(isUnique('explore'), false);
  });

  test('choosing another research previews the replacement, not a duplicate', () => {
    assert.ok(cands.length >= 2);
    const draft = withOrder(draft0, assign(cands[0]));
    const opt = previewOption(ctxOf(draft), assign(cands[1]));
    assert.equal(opt.grund, null);
    assert.equal(opt.ersetzt?.id, draft.orders[0].id);
    assert.equal(opt.pv.orders.filter((o) => o.type === 'research.assign').length, 1);
    assert.ok(!opt.pv.issues.some((i) => i.code === 'duplicate'));
  });

  test('withReplacedOrder keeps the replaced id and leaves one order', () => {
    const draft = withOrder(draft0, assign(cands[0]));
    const next = withReplacedOrder(draft, draft.orders[0].id, assign(cands[1]));
    assert.deepEqual(next.orders, [{ id: draft.orders[0].id, ...assign(cands[1]) }]);
  });
});

describe('a full slot offers the swap', () => {
  test('a second main order is refused for the slot and carries an ersatz replacing the first', () => {
    const ctx0 = ctxOf(draft0);
    // Two main orders, each accepted on its own. At turn 0 the fixture offers no found, institute or destiny.adopt
    // (no free region in range, the only institution already in force, the practice still touches the destiny), so the
    // pair is two migrations to different tiles; migrate is not once-per-season, so the second overflows the slot.
    const ok = (c) => { const o = previewOption(ctx0, c); return !o.grund && o.art === 'haupt'; };
    const migrations = Object.keys(view.map.known[pid]).map((tile) => ({ type: 'migrate', params: { tile } })).filter(ok);
    assert.ok(migrations.length >= 2, 'two main orders the kernel accepts on their own');
    assert.equal(isUnique('migrate'), false);
    const mains = migrations.slice(0, 2);
    const draft = withOrder(draft0, mains[0]);
    const opt = previewOption(ctxOf(draft), mains[1]);
    assert.equal(opt.grund, t('issue.slots'));
    assert.ok(opt.ersatz, 'swap offered');
    assert.equal(opt.ersatz.grund, null);
    assert.equal(opt.ersatz.ersetzt.id, draft.orders[0].id);
    assert.equal(opt.ersatz.pv.slots.main.used, 1);
  });
});

describe('blockers of the playtest draft', () => {
  const foreignTile = Object.keys(view.map.known[pid]).find((k) => {
    const { q, r } = parseKey(k);
    const region = regionOf(world, q, r);
    return view.map.control[region] && view.map.control[region] !== pid;
  });
  const broken = {
    ...draft0,
    orders: [
      { id: 'o1', type: 'found', params: { tile: camp.tile } },
      { id: 'o2', type: 'migrate', params: { tile: foreignTile } },
      { id: 'o3', type: 'explore', params: { tile: camp.tile } },
    ],
    rolls: { [`T${view.turn}:${pid}:o9`]: { value: 4, fingerprint: '0123456789abcdef' } },
  };
  const pv = previewDraft(view, env, broken);
  const b = blockersOf(view, env, t, broken, pv, world);

  test('the fixture has a region a rival controls', () => assert.ok(foreignTile));

  test('slot overflow, both refused orders and the orphaned roll are problems, in German', () => {
    const kinds = b.probleme.map((p) => p.kind);
    assert.ok(kinds.includes('slots'), JSON.stringify(kinds));
    assert.deepEqual(b.probleme.filter((p) => p.kind === 'befehl').map((p) => p.orderId).sort(), ['o1', 'o2']);
    assert.ok(kinds.includes('wurf-verwaist'));
    for (const p of b.probleme) for (const text of [p.titel, ...p.texte]) assert.ok(!/[a-z]+ (is|has|must|already)\b/.test(text), text);
  });

  test('the missing explore roll and the world event are owed rolls', () => {
    assert.equal(b.wuerfe.length, 2);
    assert.ok(b.wuerfe.some((w) => w.event));
    assert.ok(b.wuerfe.some((w) => w.orderId === 'o3'));
  });

  test('fixing the draft leaves only the rolls', () => {
    const fixed = withoutRoll({ ...broken, orders: broken.orders.filter((o) => o.id === 'o3') }, `T${view.turn}:${pid}:o9`);
    const after = blockersOf(view, env, t, fixed, previewDraft(view, env, fixed), world);
    assert.deepEqual(after.probleme, []);
    assert.equal(after.wuerfe.length, 2);
  });
});

// tests/unit/spielbrett-ereignisse.test.js — event cards of the Spielbrett
// (spielbrett/js/data/ereignisse.js) in Node. The logs and views are written by
// the kernel CLI (tests/fixtures/spielbrett/build-events.mjs); expected values
// come from the Hochland library cards and kernel functions, not from literals.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildEnv, previewDraft } from '../../spielbrett/js/data/kernel.js';
import { makeLabels } from '../../spielbrett/js/data/labels.js';
import { draftFor } from '../../spielbrett/js/data/draft.js';
import { optionsFor } from '../../spielbrett/js/data/options.js';
import { parseKey } from '../../engine/world/index.js';
import { ackKey, buildCards, deltaChips, effectChip, iconForTags, pickReactions, slotIcon, unacknowledged } from '../../spielbrett/js/data/ereignisse.js';

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
const fx = (name) => json(`tests/fixtures/spielbrett/${name}.json`);
const signed = (n) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

// Spring, turn 1: the opening season drew Ueberfall (roll 4), a decision still open.
const viewUeberfall = fx('view-hochland-ueberfall-t1');
const logUeberfall = fx('events-hochland-ueberfall-t0');
// Same campaign start with roll 10, which draws Salzfund.
const viewSalz = fx('view-hochland-salzfund-t1');
const logSalz = fx('events-hochland-salzfund-t0');
// Two seasons: Ueberfall went unanswered and the kernel closed it with the first option, Streit im Rat is open.
const viewRat = fx('view-hochland-ratsstreit-t2');
const logRat = fx('events-hochland-ratsstreit-t1');

describe('cards of a drawn event with a decision', () => {
  const cards = buildCards({ view: viewUeberfall, env, t, events: logUeberfall });
  const lib = env.ereignis('ueberfall@1');

  test('one decision card carries the library text and the open options', () => {
    assert.equal(cards.length, 1);
    const [c] = cards;
    assert.equal(c.kind, 'entscheidung');
    assert.equal(c.title, lib.name);
    assert.equal(c.text, lib.text);
    assert.deepEqual(c.choice.optionen.map((o) => o.id), viewUeberfall.pendingChoices[0].options);
    assert.equal(c.choice.choiceId, viewUeberfall.pendingChoices[0].id);
  });

  test('option consequences are the declared effects of the library card', () => {
    const [c] = cards;
    for (const o of lib.options) {
      const row = c.choice.optionen.find((x) => x.id === o.id);
      const res = o.effects.filter((e) => e.op === 'resource.delta');
      for (const e of res) assert.ok(row.folgen.some((f) => f.icon === e.res && f.wert === signed(e.amount) && f.text === t(`resource.${e.res}`)), `${o.id} ${e.res}`);
    }
  });

  test('the deadline is the season of the decision, from the calendar labels', () => {
    const f = cards[0].choice.frist;
    assert.equal(typeof f.saison, 'string');
    assert.equal(Number.isInteger(f.jahr), true);
  });

  test('the draft answer shows as the chosen option', () => {
    const [c] = buildCards({ view: viewUeberfall, env, t, events: logUeberfall, draft: { choices: { [viewUeberfall.pendingChoices[0].id]: 'hinnehmen' } } });
    assert.equal(c.choice.gewaehlt, 'hinnehmen');
  });
});

describe('cards of a drawn event with effects', () => {
  const [c] = buildCards({ view: viewSalz, env, t, events: logSalz });
  const lib = env.ereignis('salzfund@1');

  test('a plain event has no choice and shows its logged store changes', () => {
    assert.equal(c.kind, 'ereignis');
    assert.equal(c.choice, null);
    const e = lib.effects.find((x) => x.op === 'resource.delta');
    assert.deepEqual(c.chips, [{ icon: e.res, wert: signed(e.amount), text: t(`resource.${e.res}`) }]);
  });

  test('the image slot has no URL unless the card carries one, and an icon from its tags', () => {
    assert.equal(c.image, null);
    assert.equal(c.icon, iconForTags(lib.tags));
  });
});

describe('a decision the kernel closed, and the next draw', () => {
  const cards = buildCards({ view: viewRat, env, t, events: logRat });

  test('closing comes first and says the first option applied without an answer', () => {
    assert.deepEqual(cards.map((c) => c.kind), ['entschieden', 'entscheidung']);
    const [closed] = cards;
    const ueberfall = env.ereignis('ueberfall@1');
    assert.equal(closed.title, ueberfall.name);
    assert.equal(closed.text, ueberfall.options[0].label);
    assert.equal(closed.status.icon, 'dauer');
  });

  test('the closing card shows the logged consequences of the chosen option', () => {
    const [closed] = cards;
    const opt = env.ereignis('ueberfall@1').options[0];
    const standing = opt.effects.find((e) => e.op === 'standing.delta');
    assert.ok(closed.chips.some((c) => c.icon === 'schild' && c.wert === signed(standing.amount)));
    const rel = opt.effects.find((e) => e.op === 'relation.delta');
    assert.ok(closed.chips.some((c) => c.icon === 'rivalen' && c.wert === signed(rel.amount)));
  });

  test('the drawn event is a decision card with the pending choice of the view', () => {
    const open = cards[1];
    assert.equal(open.title, env.ereignis('ratsstreit@1').name);
    assert.equal(open.choice.choiceId, viewRat.pendingChoices[0].id);
  });
});

describe('older open decisions return as reminders', () => {
  test('a pending decision without a draw in the log gets its own card after the new ones', () => {
    const cards = buildCards({ view: viewRat, env, t, events: [] });
    assert.equal(cards.length, 1);
    assert.equal(cards[0].id, `c:${viewRat.pendingChoices[0].id}`);
    assert.equal(cards[0].choice.optionen.length, viewRat.pendingChoices[0].options.length);
  });
});

describe('notices from the council and the relations', () => {
  // Shapes as the kernel logs them (events.js die(), turn.js contact, military.js declareWar).
  const entry = (n, kind, target, change, reason) => ({ id: `T4-e${n}`, turn: 4, source: 'kernel', kind, target, change, reason, refs: [], visibleTo: [viewRat.people], step: 'events' });
  const pid = viewRat.people;
  const log = [
    entry(3, 'council.death', { kind: 'people', id: pid }, { field: 'council', before: [], after: [] }, 'Ulrun vom Weidenhang dies'),
    entry(4, 'council.death', { kind: 'people', id: pid }, { field: 'modules.kern.deaths', before: [], after: [] }, 'Ulrun vom Weidenhang dies'),
    entry(5, 'council.succession', { kind: 'member', id: 'asgra' }, { field: 'leader', before: false, after: true }, 'Asgra Kammwächterin succeeds the leader'),
    entry(6, 'relation.contact', { kind: 'relation', id: [pid, 'talbund'].sort().join('|') }, { field: 'relation', before: null, after: {} }, 'first contact'),
  ];
  const cards = buildCards({ view: viewRat, env, t, events: log });

  test('a death is one card with the successor, however often the kernel logged it', () => {
    const deaths = cards.filter((c) => c.title === t('ereignis.tod', 'Tod im Rat'));
    assert.equal(deaths.length, 1);
    assert.match(deaths[0].text, /Ulrun vom Weidenhang/);
    assert.match(deaths[0].text, /Asgra Kammwächterin/);
  });

  test('first contact names the other people', () => {
    const c = cards.find((x) => x.tags.includes('kontakt'));
    assert.match(c.text, new RegExp(viewRat.peoples.talbund.name));
    assert.deepEqual(pickReactions(c, [{ type: 'explore', params: {}, grund: null }]).map((o) => o.type), ['explore']);
  });
});

describe('quick reactions from kernel options', () => {
  const pid = viewSalz.people;
  const camp = viewSalz.map.settlements.find((s) => s.people === pid);
  const world = env.world(viewSalz.map.seed);
  const draft = draftFor(viewSalz, null);
  const base = previewDraft(viewSalz, env, draft);
  const options = optionsFor({ view: viewSalz, env, t, draft, base, world }, { kind: 'unit', id: camp.id, ...parseKey(camp.tile) });
  const devTagsOf = (o) => env.entwicklung(o.params?.development ?? o.params?.type)?.tags ?? [];
  const [salz] = buildCards({ view: viewSalz, env, t, events: logSalz });

  test('only options the kernel accepts are picked, in the types the tags map to', () => {
    const picked = pickReactions(salz, options, devTagsOf);
    assert.ok(picked.length > 0);
    for (const o of picked) {
      assert.ok(options.includes(o));
      assert.equal(o.grund, null);
    }
    assert.ok(picked.some((o) => o.type === 'explore'));
  });

  test('a refused option is never offered, one already queued stays so the card can show it taken', () => {
    const explore = options.find((o) => o.type === 'explore');
    assert.deepEqual(pickReactions(salz, [{ ...explore, grund: 'Gesperrt' }], devTagsOf), []);
    assert.deepEqual(pickReactions(salz, [{ ...explore, grund: 'Nur einmal möglich', queued: true }], devTagsOf).map((o) => o.queued), [true]);
  });

  test('a build option fits only when its development carries a tag the event calls for', () => {
    const frost = { tags: ['winter', 'wetter'] };
    const food = { type: 'build', params: { development: 'hochweide-terrassen@1' }, grund: null };
    const wall = { type: 'build', params: { development: 'steinmauer@1' }, grund: null };
    assert.deepEqual(pickReactions(frost, [wall, food], devTagsOf), [food]);
  });

  test('at most three buttons', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ type: 'explore', params: { tile: `${i}` }, grund: null }));
    assert.equal(pickReactions(salz, many, devTagsOf).length, 3);
  });

  test('the slot icon follows the kernel slot of the order', () => {
    assert.equal(slotIcon('haupt'), 'haupt');
    assert.equal(slotIcon('neben'), 'neben');
    assert.equal(slotIcon('frei'), 'enthaltung');
  });
});

describe('chips and acknowledgement', () => {
  test('kernel store deltas become icon chips with the label of the world', () => {
    assert.deepEqual(deltaChips({ nahrung: -2, volk: 1, salz: 0 }, t), [
      { icon: 'nahrung', wert: '−2', text: t('resource.nahrung') },
      { icon: 'volk', wert: '+1', text: t('population.core', 'Sippen') },
    ]);
  });

  test('effects without a number to show give no chip', () => {
    const ctx = { view: viewRat, t };
    assert.equal(effectChip({ op: 'flag.set', flag: 'x', value: true }, ctx), null);
    assert.equal(effectChip({ op: 'loyalty.delta', target: 'all', amount: -1 }, ctx).wert, '−1');
  });

  test('acknowledged and already offered cards drop out of the queue', () => {
    const cards = buildCards({ view: viewRat, env, t, events: logRat });
    assert.equal(unacknowledged(cards, new Set()).length, cards.length);
    assert.equal(unacknowledged(cards, new Set([cards[0].id])).length, cards.length - 1);
    assert.equal(unacknowledged(cards, new Set(), new Set(cards.map((c) => c.id))).length, 0);
  });

  test('the storage key is per campaign and turn', () => {
    assert.notEqual(ackKey('a', 2), ackKey('a', 3));
    assert.notEqual(ackKey('a', 2), ackKey('b', 2));
  });
});

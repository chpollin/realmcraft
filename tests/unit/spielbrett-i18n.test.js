// Label layer of the Spielbrett (plan M1, board contracts): lookup order
// (board labels in the chosen language, world labels in that language,
// English board and world labels, the world's base labels.json, key),
// placeholders, plurals and issue texts, and completeness: every key the
// board code names resolves in English and in German without falling back,
// and the label files carry the same keys and placeholders in both languages.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeLabels, UI_LABELS, LANGUAGES, DEFAULT_LANGUAGE, fill } from '../../spielbrett/js/data/labels.js';
import { CODES } from '../../engine/core/issues.js';
import { validateWorldPackage } from '../../engine/content/validate.js';
import { issueText } from '../../spielbrett/js/data/adapter.js';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const json = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));
const hochland = { de: json('welten/hochland/labels.json'), en: json('welten/hochland/labels.en.json') };
const board = { de: json('spielbrett/labels/de.json'), en: json('spielbrett/labels/en.json') };

const world = (labels, locale) => ({ format: 'realmcraft-labels', version: 1, world: 'test', locale, labels });

/** Runs fn with extra board labels, removed afterwards. */
function withBoardLabels(extra, fn) {
  for (const [lang, labels] of Object.entries(extra)) Object.assign(UI_LABELS[lang], labels);
  try {
    fn();
  } finally {
    for (const [lang, labels] of Object.entries(extra)) for (const k of Object.keys(labels)) delete UI_LABELS[lang][k];
  }
}

describe('lookup and fallback', () => {
  const files = [
    world({ 'x.both': 'Welt DE', 'x.de-only': 'Nur Welt DE', 'board.close': 'Welt schließt' }, 'de'),
    world({ 'x.both': 'World EN', 'x.en-only': 'Only world EN' }, 'en'),
  ];

  test('the board label of the chosen language comes first, also over a world label of the same key', () => {
    assert.equal(makeLabels(files, 'de')('board.close'), UI_LABELS.de['board.close']);
    assert.equal(makeLabels(files, 'en')('board.close'), UI_LABELS.en['board.close']);
  });

  test('then the world label of the chosen language', () => {
    assert.equal(makeLabels(files, 'en')('x.both'), 'World EN');
    assert.equal(makeLabels(files, 'de')('x.both'), 'Welt DE');
  });

  test('then English, board before world', () => {
    withBoardLabels({ en: { 'x.board-en': 'Board EN' } }, () => {
      assert.equal(makeLabels(files, 'de')('x.board-en'), 'Board EN');
    });
    assert.equal(makeLabels(files, 'de')('x.en-only'), 'Only world EN');
  });

  test('then the base labels.json of the world, then the caller fallback, then the key', () => {
    assert.equal(makeLabels(files, 'en')('x.de-only'), 'Nur Welt DE');
    assert.equal(makeLabels(files, 'en')('x.unknown', 'fallback'), 'fallback');
    assert.equal(makeLabels(files, 'en')('x.unknown'), 'x.unknown');
  });

  test('a labels file without locale counts as German, and without a language the base file sets it', () => {
    const t = makeLabels({ labels: { 'x.a': 'A' } });
    assert.equal(t.lang, 'de');
    assert.equal(t('x.a'), 'A');
    assert.equal(makeLabels([], undefined).lang, DEFAULT_LANGUAGE);
  });

  test('has() sees every table', () => {
    const t = makeLabels(files, 'en');
    assert.ok(t.has('x.de-only'));
    assert.ok(t.has('board.close'));
    assert.ok(!t.has('x.unknown'));
  });

  test('fmt fills placeholders and leaves unknown ones visible', () => {
    const t = makeLabels([], 'en');
    assert.equal(t.fmt('board.year', { year: 3 }), 'Year 3');
    assert.equal(fill('{a} {b}', { a: 1 }), '1 {b}');
  });

  test('plural picks .one or .other and fills {n}', () => {
    const t = makeLabels([], 'en');
    assert.equal(t.plural('board.rolls-open', 1), '1 roll open');
    assert.equal(t.plural('board.rolls-open', 3), '3 rolls open');
    assert.equal(makeLabels([], 'de').plural('board.rolls-open', 2), '2 Würfe offen');
  });

  test('English is the default board language and both languages are offered', () => {
    assert.equal(DEFAULT_LANGUAGE, 'en');
    assert.deepEqual([...LANGUAGES].sort(), ['de', 'en']);
  });

  test('issue texts come from issue.<code> labels in the chosen language', () => {
    const en = makeLabels([hochland.de, hochland.en], 'en');
    const de = makeLabels([hochland.de, hochland.en], 'de');
    assert.equal(issueText({ code: 'roll_missing' }, en), board.en.labels['issue.roll-missing']);
    assert.equal(issueText({ code: 'roll_missing' }, de), board.de.labels['issue.roll-missing']);
    assert.equal(issueText({ code: 'handel.no_route' }, en), board.en.labels['issue.handel.no-route']);
    assert.equal(issueText({ code: 'no_such_code' }, en), en('issue.generic'));
  });

  test('params.reason picks issue.<code>.<reason> when labelled, and params fill placeholders', () => {
    withBoardLabels({ en: { 'issue.target.too-far': 'Too far, {distance} tiles', 'issue.test-param': 'Needs {n} more' } }, () => {
      const t = makeLabels([], 'en');
      assert.equal(issueText({ code: 'target', params: { reason: 'too-far', distance: 4 } }, t), 'Too far, 4 tiles');
      assert.equal(issueText({ code: 'target', params: { reason: 'unlabelled' } }, t), board.en.labels['issue.target']);
      assert.equal(issueText({ code: 'test_param', params: { n: 2 } }, t), 'Needs 2 more');
    });
  });
});

// --- completeness -------------------------------------------------------------------

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// Keys named literally: t('key'), t.fmt('key', ...), t.plural('key', n) and data-t* attributes.
const CALL = /\bt(\.fmt|\.plural)?\(\s*'([a-z][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*)'/g;
const TERNARY = /\bt(?:\.fmt|\.plural)?\(\s*[^'`()]+\?\s*'([a-z][a-z0-9.-]*)'\s*:\s*'([a-z][a-z0-9.-]*)'/g;
const ATTR = /data-t(?:-[a-z-]+)?=["']([a-z][a-z0-9.-]*)["']|'data-t-[a-z-]+':\s*'([a-z][a-z0-9.-]*)'/g;

function usedKeys() {
  const keys = new Map();
  const add = (key, file) => keys.set(key, keys.get(key) ?? relative(REPO, file));
  const files = [...walk(join(REPO, 'spielbrett/js')).filter((f) => f.endsWith('.js')), join(REPO, 'spielbrett/index.html')];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(CALL)) {
      if (m[1] === '.plural') { add(`${m[2]}.one`, file); add(`${m[2]}.other`, file); } else add(m[2], file);
    }
    for (const m of src.matchAll(TERNARY)) { add(m[1], file); add(m[2], file); }
    for (const m of src.matchAll(ATTR)) add(m[1] ?? m[2], file);
  }
  return keys;
}

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('label completeness', () => {
  const used = usedKeys();

  test('the scan finds the board keys', () => {
    assert.ok(used.has('board.page.title'), 'index.html data-t');
    assert.ok(used.has('board.rolls-open.other'), 'plural');
    assert.ok(used.has('ui.zug-beenden'), 'world key');
  });

  for (const lang of ['en', 'de']) {
    test(`every key used in code exists in ${lang}, in the board labels or the Hochland labels`, () => {
      const missing = [...used].filter(([k]) => !Object.hasOwn(board[lang].labels, k) && !Object.hasOwn(hochland[lang].labels, k));
      assert.deepEqual(missing.map(([k, f]) => `${k} (${f})`), []);
    });
  }

  // Keys the code builds from an id; the ids are the values the code passes.
  const FAMILIES = {
    'board.layer': ['gelaende', 'besitz', 'bedrohung', 'handel'],
    'board.trend': ['rising', 'steady', 'falling', 'rising.cap', 'steady.cap', 'falling.cap'],
    'board.slot': ['haupt', 'neben', 'frei', 'forschung'],
    'board.slots': ['haupt.group', 'neben.group', 'haupt.short', 'neben.short'],
    'board.message': ['warnung', 'angebot', 'meilenstein', 'welt'],
    'board.agent': ['wartet', 'arbeitet', 'fertig', 'gescheitert'],
    'board.vote': ['ja', 'nein', 'enthaltung'],
    'board.vote-reason': ['favours', 'opposes', 'loyal', 'discontent', 'loyalty-at-breaking-point'],
    'board.stance': ['unbekannt', 'feindlich', 'freundlich', 'wachsam', 'neutral'],
    'board.probe.verdict': ['krit-tief', 'krit-hoch', 'erfolg', 'fehlschlag'],
    'board.tree.state': ['forschung', 'vorschlag', 'bekannt'],
    'board.council': ['passed', 'by-decree', 'on-machtprobe', 'refused'],
    'board.world': ['angenommen', 'abgelehnt'],
    'board.order-status': ['executed', 'rejected', 'unpaid'],
    'board.unit': ['lager', 'spaeher', 'herde', 'krieger', 'haendler', 'raeuber'],
    'board.place': ['ruine', 'schrein', 'pass', 'erzader', 'quelle', 'siedlung', 'turm', 'hoehle'],
    'board.lang': LANGUAGES,
  };

  test('keys built from ids exist for every id in both languages', () => {
    const missing = Object.entries(FAMILIES).flatMap(([prefix, ids]) => ids.map((id) => `${prefix}.${id}`))
      .filter((k) => !(Object.hasOwn(board.en.labels, k) && Object.hasOwn(board.de.labels, k)));
    assert.deepEqual(missing, []);
  });

  test('board keys live in the board labels, independent of a world', () => {
    const missing = [...used.keys()].filter((k) => k.startsWith('board.') && !(Object.hasOwn(board.en.labels, k) && Object.hasOwn(board.de.labels, k)));
    assert.deepEqual(missing, []);
  });

  test('every kernel issue code has a board label in both languages', () => {
    for (const code of [...Object.keys(CODES), 'generic', 'server', 'handel.no_route']) {
      const key = `issue.${code.replaceAll('_', '-')}`;
      assert.ok(Object.hasOwn(board.en.labels, key) && Object.hasOwn(board.de.labels, key), key);
    }
  });

  // Issue labels belong to the board (plan M1); the German world file still carries older ones.
  const withoutIssues = (labels) => Object.fromEntries(Object.entries(labels).filter(([k]) => !k.startsWith('issue.')));
  for (const [name, files, only] of [['board', board, (l) => l], ['Hochland', hochland, withoutIssues]]) {
    test(`${name} label files carry the same keys and placeholders in German and English`, () => {
      const de = only(files.de.labels);
      const en = only(files.en.labels);
      assert.deepEqual(Object.keys(en).filter((k) => !Object.hasOwn(de, k)), [], 'only in English');
      assert.deepEqual(Object.keys(de).filter((k) => !Object.hasOwn(en, k)), [], 'only in German');
      const differ = Object.keys(de).filter((k) => placeholders(de[k]).join() !== placeholders(en[k]).join());
      assert.deepEqual(differ, [], 'placeholders differ');
      assert.ok(Object.values(en).every((v) => typeof v === 'string' && v.length > 0));
    });
  }

  test('board label files name their language', () => {
    assert.equal(board.de.locale, 'de');
    assert.equal(board.en.locale, 'en');
  });
});

describe('Hochland English labels in the world package', () => {
  test('labels.en.json has the labels format, the world id and the locale en, and no issue labels', () => {
    assert.equal(hochland.en.format, 'realmcraft-labels');
    assert.equal(hochland.en.world, 'hochland');
    assert.equal(hochland.en.locale, 'en');
    assert.deepEqual(Object.keys(hochland.en.labels).filter((k) => k.startsWith('issue.')), []);
  });

  test('the world package validator accepts labels.en.json in place of labels.json', () => {
    const pack = {
      welt: json('welten/hochland/welt.json'),
      regeln: json('welten/hochland/regeln.json'),
      labels: hochland.en,
      style: json('welten/hochland/style.json'),
      entwicklungen: json('welten/hochland/content/entwicklungen.json'),
      ereignisse: json('welten/hochland/content/ereignisse.json'),
      bestimmungen: json('welten/hochland/content/bestimmungen.json'),
    };
    const labelIssues = validateWorldPackage(pack).filter((i) => i.path.startsWith('/labels'));
    assert.deepEqual(labelIssues, []);
  });
});

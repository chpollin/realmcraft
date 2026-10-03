// Content library: append-only, revision-pinned, immutable values.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { appendToLibrary, createLibrary, latestRev, libraryFrom, listByKind, resolveRef } from '../../../engine/content/library.js';

const corpus = JSON.parse(readFileSync(fileURLToPath(new URL('../../fixtures/engine/corpus/manifest.json', import.meta.url)), 'utf8')).context;
const filz = corpus.library[0];

test('append returns a new library and leaves the old one untouched', () => {
  const empty = createLibrary();
  const { library, ref, added } = appendToLibrary(empty, filz, { turn: 0, source: 'world' });
  assert.equal(ref, 'filzjurten@1');
  assert.equal(added, true);
  assert.equal(empty.entries.length, 0);
  assert.equal(library.entries.length, 1);
  assert.deepEqual(resolveRef(library, 'filzjurten@1'), filz);
  assert.notEqual(resolveRef(library, 'filzjurten@1'), filz, 'stored as a copy');
});

test('appending identical content again is a no-op, other content under the same ref throws', () => {
  const lib = libraryFrom([filz]);
  const again = appendToLibrary(lib, structuredClone(filz));
  assert.equal(again.added, false);
  assert.equal(again.library, lib);
  assert.throws(() => appendToLibrary(lib, { ...filz, name: 'Walkzelte' }), /already exists/);
});

test('revisions are sequential and a bare id resolves to the latest', () => {
  const lib = libraryFrom([filz]);
  assert.throws(() => appendToLibrary(lib, { ...filz, rev: 3 }), /must be revision 2/);
  assert.throws(() => appendToLibrary(createLibrary(), { ...filz, rev: 2 }), /must be revision 1/);
  const two = appendToLibrary(lib, { ...filz, rev: 2, summary: 'Zweite Fassung.' }).library;
  assert.equal(latestRev(two, 'filzjurten'), 2);
  assert.equal(resolveRef(two, 'filzjurten').rev, 2);
  assert.equal(resolveRef(two, 'filzjurten@1').rev, 1);
  assert.equal(resolveRef(two, 'fehlt'), null);
  assert.equal(resolveRef(two, 'filzjurten@9'), null);
});

test('listByKind filters by Entwicklung kind or content type', () => {
  const card = { id: 'duerre', rev: 1, name: 'Dürre', text: 'Kein Regen.', band: 2, tags: ['winter'], if: null, effects: [], options: null };
  const lib = appendToLibrary(libraryFrom(corpus.library), card).library;
  assert.deepEqual(listByKind(lib, 'einheit').map((e) => e.id), ['reiterschar']);
  assert.deepEqual(listByKind(lib, 'technik').map((e) => e.id), ['filzjurten', 'salzpfad', 'erzschmelze']);
  assert.equal(listByKind(lib, 'entwicklung').length, 5);
  assert.deepEqual(listByKind(lib, 'ereignis').map((e) => e.id), ['duerre']);
  const two = appendToLibrary(lib, { ...filz, rev: 2, summary: 'Zweite Fassung.' }).library;
  assert.deepEqual(listByKind(two, 'technik', { latest: true }).map((e) => `${e.id}@${e.rev}`), ['salzpfad@1', 'erzschmelze@1', 'filzjurten@2']);
  assert.throws(() => listByKind(lib, 'zauber'), /unknown kind/);
});

test('an id names one content type only', () => {
  const card = { id: 'filzjurten', rev: 2, name: 'Filz', text: 'x', band: 3, tags: ['winter'], if: null, effects: [], options: null };
  assert.throws(() => appendToLibrary(libraryFrom([filz]), card), /already names a entwicklung/);
});

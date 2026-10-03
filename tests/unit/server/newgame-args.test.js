// The CLI arguments the server builds for a new game (engine/cli.mjs new,
// flags --rivals, --difficulty and --lang of plan M1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGameArgs } from '../../../server/newgame.mjs';

test('defaults: all rivals without the flag, difficulty normal, the package locale', async () => {
  const r = await newGameArgs({ world: 'hochland', seed: 7, people: 'talbund' });
  assert.deepEqual(r.args, ['new', 'hochland', '--seed', '7', '--as', 'talbund', '--difficulty', 'normal', '--lang', 'de']);
  assert.equal(r.id, null);
});

test('a narrower rival choice goes along in package order', async () => {
  const r = await newGameArgs({ world: 'hochland', seed: 0, people: 'bergnomaden', rivals: ['talbund'], difficulty: 'easy', id: 'probe-1' });
  assert.deepEqual(r.args.slice(-2), ['--rivals', 'talbund']);
  assert.ok(r.args.includes('easy'));
  assert.equal(r.id, 'probe-1');
});

test('several faults come back together', async () => {
  const r = await newGameArgs({ world: 'hochland', seed: -3, people: 'x', difficulty: 'y', language: 'zz' });
  assert.deepEqual(r.issues.map((i) => i.path), ['/seed', '/people', '/difficulty', '/language']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, createDraft, preview, resolveTurn, council } from '../../spiel/engine.js';
import { encodeSession, decodeSession, newSession, persist, restore, STORAGE_KEY } from '../../spiel/storage.js';

function order(game, allocation, project = null, policy = null) {
  return { turn: game.turn, allocation: { food: 0, wood: 0, mine: 0, ...allocation }, project, policy };
}
function execute(game, allocation, project, policy) {
  return resolveTurn(game, order(game, allocation, project, policy));
}

test('strategy: pact route survives four seasons with both buildings and permanent law', () => {
  let game = createGame();
  game = execute(game, { food: 4 }, 'mine', 'pact');
  assert.equal(game.food, 18);
  assert.equal(game.material, 6);
  assert.equal(game.pact, true);
  game = execute(game, { food: 4, mine: 2 });
  assert.equal(game.material, 16);
  game = execute(game, { food: 4 }, 'granary', 'majority');
  assert.equal(game.food, 22);
  game = execute(game, { food: 4, mine: 2 });
  assert.equal(game.status, 'won');
  assert.equal(game.food, 14);
  assert.equal(game.material, 18);
  assert.equal(game.history[3].consumption, 16);
  assert.equal(game.shortfall, 0);
});

test('strategy: veto route remains viable and only dissenting advisors lose loyalty', () => {
  let game = execute(createGame(), { food: 2, wood: 2 }, 'mine', 'veto');
  assert.deepEqual(game.loyalty, { borin: 2, grask: 2, mara: 0, yssa: 0, alde: 0 });
  assert.equal(game.food, 10);
  game = execute(game, { food: 5, mine: 1 });
  game = execute(game, { food: 4 }, 'granary', 'majority');
  game = execute(game, { food: 5, mine: 1 });
  assert.equal(game.status, 'won');
  assert.equal(game.food, 13);
  assert.equal(game.pact, false);
});

test('strategy: a reserve-first route succeeds without buildings', () => {
  let game = createGame();
  for (const [food, wood] of [[4, 2], [5, 1], [5, 1], [6, 0]]) game = execute(game, { food, wood });
  assert.equal(game.status, 'won');
  assert.equal(game.food, 22);
  assert.deepEqual(game.buildings, { mine: false, granary: false });
});

test('strategy: previews never mutate state or consume resources', () => {
  const game = createGame();
  const draft = order(game, { food: 4 }, 'mine', 'pact');
  const before = JSON.stringify({ game, draft });
  const result = preview(game, draft);
  assert.deepEqual(result.errors, []);
  assert.equal(result.endFood, 18);
  assert.equal(JSON.stringify({ game, draft }), before);
  assert.deepEqual(resolveTurn(game, draft), resolveTurn(game, draft));
  assert.equal(JSON.stringify({ game, draft }), before);
});

test('strategy: old commands cannot be applied to the next season', () => {
  const game = createGame();
  const draft = createDraft(game);
  const next = resolveTurn(game, draft);
  assert.throws(() => resolveTurn(next, draft), /anderen Saison/);
});

test('strategy: majority, labor and initial stock are enforced before execution', () => {
  const game = createGame();
  assert.throws(() => execute(game, { food: 4 }, 'mine', 'majority'), /keine Mehrheit/);
  assert.throws(() => execute(game, { food: 5 }, 'mine', 'veto'), /7 Gruppen/);
  const poor = { ...game, material: 0 };
  assert.throws(() => execute(poor, { wood: 4 }, 'mine', 'veto'), /bestehenden Vorrat/);
  assert.throws(() => execute(game, { food: 4 }, 'mine'), /politische Entscheidung/);
});

test('strategy: unfinished mines never produce and repeated construction is rejected', () => {
  const game = createGame();
  assert.throws(() => execute(game, { food: 2, mine: 2 }, 'mine', 'veto'), /bereits fertiggestellten/);
  const next = execute(game, { food: 4 }, 'mine', 'pact');
  assert.equal(next.material, 6);
  assert.throws(() => execute(next, { food: 4 }, 'mine', 'majority'), /bereits fertiggestellt/);
});

test('strategy: an existing pact constrains later construction, including a veto', () => {
  let game = execute(createGame(), { food: 4 }, 'mine', 'pact');
  game = execute(game, { food: 4, mine: 2 });
  const invalid = order(game, { food: 1, mine: 3 }, 'granary', 'veto');
  assert.throws(() => resolveTurn(game, invalid), /Versorgungspakt/);
  const valid = order(game, { food: 4 }, 'granary', 'majority');
  assert.deepEqual(preview(game, valid).errors, []);
});

test('strategy: a winter-completed granary does not lower that winters consumption', () => {
  let game = createGame();
  game = execute(game, { food: 4, wood: 2 });
  game = execute(game, { food: 5, wood: 1 });
  game = execute(game, { food: 5, wood: 1 });
  const p = preview(game, order(game, { food: 4 }, 'granary', 'majority'));
  assert.equal(p.consumption, 22);
  assert.match(p.warnings.join(' '), /Winterende/);
});

test('strategy: deficits are explicit, reduce capacity and end a collapsed campaign', () => {
  let game = execute(createGame(), { food: 2, wood: 4 });
  game = execute(game, { wood: 6 });
  assert.equal(game.food, 0);
  assert.equal(game.shortfall, 8);
  assert.equal(game.workers, 5);
  assert.equal(game.status, 'playing');
  assert.equal(game.loyalty.borin, 1);
  const draft = createDraft(game, game.history.at(-1).command);
  assert.equal(draft.allocation.wood, 5);
  game = execute(game, { wood: 5 });
  assert.equal(game.status, 'lost');
  assert.throws(() => execute(game, { food: 4 }), /abgeschlossen/);
});

test('strategy: damaged loyalty changes votes rather than just the display', () => {
  const game = createGame();
  game.loyalty.mara = -3;
  const votes = council(game, order(game, { food: 4 }, 'mine', 'pact'));
  assert.equal(votes.find(v => v.id === 'mara').yes, false);
  assert.match(votes.find(v => v.id === 'mara').reason, /Vertrauen/);
});

test('strategy: a pending draft survives export and reconstruction exactly', () => {
  const game = execute(createGame(), { food: 4 }, 'mine', 'pact');
  const session = { game, draft: order(game, { food: 3, mine: 1 }, 'granary', 'majority') };
  const imported = decodeSession(encodeSession(session));
  assert.deepEqual(imported, session);
  assert.deepEqual(preview(imported.game, imported.draft), preview(session.game, session.draft));
});

test('strategy: concluded campaigns load with the same result', () => {
  let game = createGame();
  for (let turn = 0; turn < 4; turn++) game = execute(game, { food: 6 });
  const session = { game, draft: createDraft(game) };
  assert.deepEqual(decodeSession(encodeSession(session)), session);
});

test('strategy: corrupted, incompatible and impossible saves are rejected', () => {
  assert.throws(() => decodeSession('{'), /JSON/);
  assert.throws(() => decodeSession('{"schemaVersion":1}'), /Spielleiterpartien/);
  for (const modify of [
    save => { save.version = 9; },
    save => { save.draft.turn = 2; },
    save => { save.draft.allocation.food = -1; },
    save => { save.draft.allocation.food = 1.5; },
    save => { save.draft.project = '<script>'; },
    save => { save.commands = [order(createGame(), { mine: 6 })]; },
    save => { save.commands = Array(5).fill(createDraft(createGame())); },
  ]) {
    const save = JSON.parse(encodeSession(newSession()));
    modify(save);
    assert.throws(() => decodeSession(JSON.stringify(save)));
  }
});

test('strategy: local storage is isolated and failures are observable', () => {
  const values = new Map([['rc.history', 'legacy-state']]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(restore(storage), null);
  persist(newSession(), storage);
  assert.equal(values.get('rc.history'), 'legacy-state');
  assert.equal(values.has(STORAGE_KEY), true);
  assert.deepEqual(restore(storage), newSession());
  assert.throws(() => persist(newSession(), { setItem() { throw new Error('quota'); } }), /quota/);
});

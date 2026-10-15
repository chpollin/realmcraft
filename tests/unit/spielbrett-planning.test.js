import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildEnv, previewDraft } from '../../spielbrett/js/data/kernel.js';
import { makeLabels } from '../../spielbrett/js/data/labels.js';
import { draftFor, withOrder } from '../../spielbrett/js/data/draft.js';
import { previewOption } from '../../spielbrett/js/data/options.js';
import { collectPlanningOptions } from '../../spielbrett/js/data/planning.js';

const json = (path) => JSON.parse(readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf8'));
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
const world = env.world(view.map.seed);
const known = view.map.known[view.people];
const camp = view.map.settlements.find((settlement) => settlement.people === view.people);

function gameFor(draft = draftFor(view, null)) {
  const base = previewDraft(view, env, draft);
  const ctx = { view, env, t, draft, base, world };
  return { ...ctx, previewOption: (candidate) => previewOption(ctx, candidate) };
}

const model = { known };

describe('planning choices from the player projection', () => {
  test('main actions include usable destinations beyond home and preserve kernel refusals', () => {
    const game = gameFor();
    const before = JSON.stringify(game.draft);
    const options = collectPlanningOptions(game, model, 'haupt');
    assert.ok(options.length);
    assert.ok(options.every((option) => option.art === 'haupt'));
    assert.ok(options.some((option) => option.type === 'migrate' && option.params.tile !== camp.tile && !option.grund));
    assert.ok(options.some((option) => option.type === 'found' && option.grund));
    for (const option of options) {
      const expected = game.previewOption({ type: option.type, params: option.params });
      assert.deepEqual(option, expected);
      assert.ok(game.base.catalogue.some((entry) => entry.type === option.type && entry.available));
      if (option.params.tile) assert.ok(Object.hasOwn(known, option.params.tile));
    }
    assert.equal(JSON.stringify(game.draft), before);
  });

  test('minor choices reach known fields and duplicate selections are previewed only once', () => {
    const game = gameFor();
    const seen = [];
    const preview = game.previewOption;
    game.previewOption = (candidate) => {
      seen.push(JSON.stringify([candidate.type, candidate.params]));
      return preview(candidate);
    };
    const options = collectPlanningOptions(game, model, 'neben');
    assert.ok(options.length);
    assert.ok(options.every((option) => option.art === 'neben'));
    assert.deepEqual(new Set(options.filter((option) => option.type === 'explore').map((option) => option.params.tile)), new Set(Object.keys(known)));
    assert.equal(new Set(seen).size, seen.length);
  });

  test('queued choices remain identifiable and a full budget retains the kernel replacement', () => {
    const first = Object.keys(known)[0];
    const second = Object.keys(known)[1];
    let draft = withOrder(draftFor(view, null), { type: 'explore', params: { tile: first } });
    draft = withOrder(draft, { type: 'explore', params: { tile: second } });
    const game = gameFor(draft);
    assert.equal(game.base.slots.minor.used, game.base.slots.minor.max);
    const options = collectPlanningOptions(game, model, 'neben');
    assert.ok(options.find((option) => option.type === 'explore' && option.params.tile === first)?.queued);
    const alternative = options.find((option) => option.type === 'explore' && option.params.tile !== first && option.params.tile !== second);
    assert.ok(alternative.grund);
    assert.equal(alternative.ersatz?.grund, null);
    assert.ok(draft.orders.some((order) => order.id === alternative.ersatz.ersetzt.id));
  });

  test('foreign unit targets require current sight and variable slots use the concrete preview', () => {
    const fogView = structuredClone(view);
    const foreign = Object.keys(fogView.peoples).find((id) => id !== fogView.people);
    const tiles = Object.keys(known);
    const unseen = Object.keys(world.tiles).find((tile) => !Object.hasOwn(known, tile));
    assert.ok(unseen);
    const discipline = pack.entwicklungen.items.find((item) => item.kind === 'disziplin' && item.spec.applications.some((application) => application.targetKind === 'unit'));
    fogView.peoples[fogView.people].developments.known.push({ ref: `${discipline.id}@${discipline.rev}`, since: 0, effectiveFrom: 0, state: 'active', suspendedSince: null });
    fogView.map.known[fogView.people][tiles[1]] = 'seen';
    fogView.peoples[foreign].units = [
      { id: 'visible-unit', tile: tiles[0] },
      { id: 'remembered-unit', tile: tiles[1] },
      { id: 'unknown-unit', tile: unseen },
    ];
    const targets = [];
    const game = {
      view: fogView, env, world,
      base: { catalogue: [{ type: 'discipline.use', available: true, slot: 'varies' }] },
      previewOption(candidate) {
        targets.push(candidate.params.target);
        return { ...candidate, art: candidate.params.target === `${foreign}:visible-unit` ? 'haupt' : 'frei' };
      },
    };
    const options = collectPlanningOptions(game, { known: fogView.map.known[fogView.people] }, 'haupt');
    assert.deepEqual(options.map((option) => option.params.target), [`${foreign}:visible-unit`]);
    assert.ok(!targets.includes(`${foreign}:remembered-unit`));
    assert.ok(!targets.includes(`${foreign}:unknown-unit`));
    assert.deepEqual(collectPlanningOptions(game, model, 'forschung'), []);
  });
});

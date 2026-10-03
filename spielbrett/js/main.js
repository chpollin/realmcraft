// Entry of the Spielbrett. Without parameters the board opens the most recent
// real campaign served from campaigns/ (or ?campaign=<cid>) and plays it
// against the rules kernel; ?demo keeps the prototype on its fixtures.

import { createModel } from './model.js';
import { createGame } from './data/game.js';
import { startBoard } from './board.js';
import { el } from './dom.js';

const params = new URLSearchParams(location.search);

/** UI state every board model carries besides the game data. */
function boardState() {
  return {
    selection: null, hover: null, layer: 'gelaende', preview: null, panel: null, ownerVersion: 0,
    highlights: [], moves: [], frostRegions: new Set(), orders: [], meldungen: [], chronik: [],
    zz: null, zugGelaufen: false, ratBeschluss: null,
  };
}

function noCampaign(error) {
  document.documentElement.dataset.ready = 'true';
  document.getElementById('brett').replaceChildren(el('section', { class: 'leer', 'aria-labelledby': 'leer-titel' },
    el('h2', { id: 'leer-titel', class: 'world', text: error ? 'Kampagne nicht lesbar' : 'Keine Kampagne' }),
    error ? el('p', { text: error.message }) : null,
    el('pre', {}, el('code', { text: 'node engine/cli.mjs new hochland --seed 7 --id hochland-1\nnode engine/cli.mjs open --campaign hochland-1' })),
    el('a', { class: 'btn', href: '?demo' }, 'Prototyp ansehen')));
}

if (params.has('demo')) {
  const model = await createModel();
  model.panel = null;
  model.ownerVersion = 0;
  startBoard(model, null);
} else {
  const model = boardState();
  let game = null;
  let error = null;
  try {
    game = await createGame(model, { cid: params.get('campaign') });
  } catch (err) {
    error = err;
    console.error(err);
  }
  if (game) startBoard(model, game);
  else noCampaign(error);
}

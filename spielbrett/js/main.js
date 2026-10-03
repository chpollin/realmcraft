// Entry of the Spielbrett. Without parameters the page is the start screen
// (new game, continue, settings, rules); ?campaign=<cid> opens that campaign
// and plays it against the rules kernel; ?demo keeps the prototype on its
// fixtures.

import { createModel } from './model.js';
import { createGame, worldLabelFiles } from './data/game.js';
import { server } from './data/server.js';
import { startBoard } from './board.js';
import { el } from './dom.js';
import { icon } from './icons.js';
import { t, applyStatic, setWorldLabels } from './i18n/index.js';
import { installAudio } from './audio/index.js';
import { applyMotion } from './ui/einstellungen.js';
import { installMenu, toStart } from './ui/menu.js';
import { openEnde, outcomeOf } from './ui/ende.js';
import { startScreen } from './ui/start.js';

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
  document.documentElement.dataset.shell = 'leer';
  document.documentElement.dataset.ready = 'true';
  document.getElementById('brett').replaceChildren(el('section', { class: 'leer', 'aria-labelledby': 'leer-titel' },
    el('h2', { id: 'leer-titel', class: 'world', text: t(error ? 'board.empty.unreadable' : 'board.empty.none') }),
    error ? el('p', { text: error.message }) : null,
    el('button', { class: 'btn btn-primary', type: 'button', onclick: toStart }, icon('verlassen', { size: 18 }), t('shell.menu.to-start'))));
}

/** Menu and end screen of the board; the end screen opens when the campaign has ended or ends. */
function installShell(api, game, demoRegeln = null) {
  const showEnd = (live) => openEnde(game, {
    live,
    onMenu: toStart,
    onChronicle: () => api.openDialog('chronik'),
  });
  installMenu({
    api,
    regeln: () => (game ? game.pack.regeln : demoRegeln),
    ended: () => Boolean(game && outcomeOf(game.view)),
    onResult: () => showEnd(false),
  });
  if (!game) return;
  let shown = Boolean(outcomeOf(game.view));
  if (shown) showEnd(false);
  game.onUpdate((kind) => {
    if (kind !== 'view' || shown || !outcomeOf(game.view)) return;
    shown = true;
    showEnd(true);
  });
}

applyStatic();
const audio = installAudio();
applyMotion(audio.settings.reduced);

if (params.has('demo')) {
  // The prototype plays the Hochland fixtures, so it names things with the Hochland labels.
  let regeln = null;
  try {
    setWorldLabels(await worldLabelFiles('hochland'));
    regeln = await server.pack('hochland', 'regeln.json');
  } catch (err) {
    console.error(err);
  }
  const model = await createModel();
  model.panel = null;
  model.ownerVersion = 0;
  installShell(startBoard(model, null), null, regeln);
} else if (params.has('campaign')) {
  const model = boardState();
  let game = null;
  let error = null;
  try {
    game = await createGame(model, { cid: params.get('campaign') });
  } catch (err) {
    error = err;
    console.error(err);
  }
  installAudio({ game });
  if (game) installShell(startBoard(model, game), game);
  else noCampaign(error);
} else {
  await startScreen();
}

import { createGame, resolveTurn, result } from '../spiel/nachtmeer/engine.js';
import { federation, admiralty } from '../tests/fixtures/nachtmeer-strategies.js';

for (const [name,strategy] of Object.entries({Inselbund:federation,Admiralität:admiralty})) {
  let game=createGame();
  for (const command of strategy) game=resolveTurn(game,{turn:game.turn,...command});
  console.log(JSON.stringify({strategie:name,status:game.status,abschluss:result(game).title,feuer:game.lit.length,vorrat:game.resources,ordnung:game.flags}));
  if (game.status!=='won') process.exitCode=1;
}

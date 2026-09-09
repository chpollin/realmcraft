import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, createDraft, preview, resolveTurn, canAdd, availableActions, result } from '../../spiel/nachtmeer/engine.js';
import { newSession, encodeSession, decodeSession, persist, restore, STORAGE_KEY } from '../../spiel/nachtmeer/storage.js';
import { federation, admiralty } from '../fixtures/nachtmeer-strategies.js';

function play(strategy,limit=strategy.length) {
  let game=createGame();
  for(const command of strategy.slice(0,limit)) game=resolveTurn(game,{turn:game.turn,...command});
  return game;
}
test('nachtmeer: federation survives all six tides with persistent institutions',()=>{
  const game=play(federation);
  assert.equal(game.status,'won'); assert.equal(game.turn,6); assert.equal(game.lit.length,3);
  assert.deepEqual(game.resources,{food:21,material:14,aether:1,hope:100});
  assert.ok(game.flags.refugees&&game.flags.charter&&game.flags.commons&&game.flags.archive&&game.flags.federation);
  assert.ok(result(game).checks.every(c=>c.met));
  assert.throws(()=>resolveTurn(game,{turn:6,...federation[0]}),/abgeschlossen/);
});
test('nachtmeer: another political and economic route leads to the admiralty ending',()=>{
  const game=play(admiralty);
  assert.equal(game.status,'won'); assert.equal(game.flags.federation,false);
  assert.equal(game.flags.charter,false); assert.equal(game.flags.commons,false);
  assert.equal(game.flags.breakwater,true); assert.equal(game.flags.seized,true);
  assert.deepEqual(game.resources,{food:15,material:10,aether:1,hope:64});
  assert.match(result(game).text,/Admiralität/);
});
test('nachtmeer: previews and resolution are reproducible and do not mutate inputs',()=>{
  const game=createGame(); const draft={turn:0,...federation[0]}; const before=JSON.stringify({game,draft});
  assert.deepEqual(preview(game,draft),preview(game,draft));
  assert.deepEqual(resolveTurn(game,draft),resolveTurn(game,draft));
  assert.equal(JSON.stringify({game,draft}),before);
  assert.equal(game.open.length,2);
});
test('nachtmeer: a route and its lighthouse cannot be completed in the same tide',()=>{
  const game=createGame();
  const draft={turn:0,choice:'open',mandate:'council',orders:[{action:'explore',place:'aster'},{action:'beacon',place:'aster'}]};
  assert.throws(()=>resolveTurn(game,draft),/derzeit nicht möglich/);
  const next=play(federation,1);
  assert.ok(availableActions(next,'aster').includes('beacon'));
  assert.equal(next.lit.length,1);
});
test('nachtmeer: construction costs cannot be paid with income from the same tide',()=>{
  const game=play(admiralty,2); game.resources.material=4;
  const draft={turn:2,choice:'seize',mandate:'council',orders:[{action:'salvage',place:'werft'},{action:'beacon',place:'gaerten'}]};
  assert.ok(preview(game,draft).issues.some(i=>i.code==='cost'));
  assert.throws(()=>resolveTurn(game,draft),/zu Beginn/);
});
test('nachtmeer: the guild reserve binds even a decree and cannot use charter income',()=>{
  const game=play(federation,1); game.resources.material=8;
  const draft={turn:1,...federation[1],mandate:'decree'};
  assert.ok(preview(game,draft).issues.some(i=>i.code==='charter'));
  assert.throws(()=>resolveTurn(game,draft),/Gildenvertrag/);
});
test('nachtmeer: commons limit extraction immediately and discount future construction',()=>{
  const game=play(federation,2);
  const draft={turn:2,choice:'commons',mandate:'council',orders:[{action:'study',place:'aster'},{action:'aether',place:'gaerten'}]};
  assert.ok(preview(game,draft).issues.some(i=>i.code==='commons'));
  const after=play(federation,3);
  assert.equal(preview(after,{turn:3,...federation[3]}).costs.aether,2);
});
test('nachtmeer: new lights contribute food and storm protection from the following tide',()=>{
  const game=play(federation,1); const p=preview(game,{turn:1,...federation[1]});
  assert.equal(p.networkFood,0);
  const after=play(federation,2);
  assert.equal(preview(after,{turn:2,...federation[2]}).networkFood,1);
});
test('nachtmeer: a rejected lighthouse can be decreed with a real political cost',()=>{
  const game=play(federation,1); game.loyalty.jorek=-3; game.loyalty.ilyra=-3;
  const draft={turn:1,choice:'public',mandate:'council',orders:[{action:'beacon',place:'aster'},{action:'provisions',place:'lys'}]};
  assert.ok(preview(game,draft).issues.some(i=>i.code==='council'));
  const byDecree={...draft,mandate:'decree'};
  const next=resolveTurn(game,byDecree);
  assert.ok(next.lit.includes('aster')); assert.equal(next.history.at(-1).decreeLoss,4);
  assert.equal(next.loyalty.ilyra,-3);
});
test('nachtmeer: malformed, stale, duplicate and excessive commands cannot execute',()=>{
  const game=createGame();
  assert.throws(()=>resolveTurn(game,{...createDraft(game),turn:1}),/anderen Gezeit/);
  assert.throws(()=>resolveTurn(game,{...createDraft(game),orders:[{action:'invent',place:'lys'}]}),/ungültig/);
  const o={action:'explore',place:'aster'};
  assert.throws(()=>resolveTurn(game,{...createDraft(game),choice:'open',orders:[o,o]}),/doppelt/);
  assert.throws(()=>resolveTurn(game,{...createDraft(game),choice:'open',orders:[o,o,o]}),/ungültig/);
  const draft={...createDraft(game),choice:'open',orders:[{action:'provisions',place:'lys'},{action:'salvage',place:'werft'}]};
  assert.equal(canAdd(game,draft,'explore','aster'),false);
});
test('nachtmeer: decisions are required and planning them cannot award resources',()=>{
  const game=createGame(); const draft=createDraft(game);
  assert.throws(()=>resolveTurn(game,draft),/Entscheidung/);
  draft.choice='open'; preview(game,draft); preview(game,draft);
  assert.deepEqual(game.resources,{food:18,material:12,aether:4,hope:64});
  assert.equal(game.flags.refugees,false);
});
test('nachtmeer: accumulated starvation can end the campaign before the sixth tide',()=>{
  let game=createGame();
  for(const choice of ['open','public','seize','cache','shelter']) game=resolveTurn(game,{...createDraft(game),choice});
  assert.equal(game.status,'lost'); assert.equal(game.turn,5);
  assert.ok(game.shortfall>=12); assert.equal(game.resources.food,0);
  assert.equal(result(game).collapsed,true);
});
test('nachtmeer: unfinished and finished sessions survive replay-based saves',()=>{
  const game=play(federation,2); const session={game,draft:{turn:2,...federation[2]}};
  assert.deepEqual(decodeSession(encodeSession(session)),session);
  const done=play(admiralty); const complete={game:done,draft:createDraft(done)};
  assert.deepEqual(decodeSession(encodeSession(complete)),complete);
  const altered=JSON.parse(encodeSession(session)); altered.resources={food:9999};
  assert.deepEqual(decodeSession(JSON.stringify(altered)).game.resources,game.resources);
});
test('nachtmeer: corrupt saves, impossible committed moves and trailing commands are rejected',()=>{
  assert.throws(()=>decodeSession('corrupt'),/JSON/);
  assert.throws(()=>decodeSession('x'.repeat(65537)),/64 KB/);
  const save=JSON.parse(encodeSession(newSession())); save.version=99;
  assert.throws(()=>decodeSession(JSON.stringify(save)),/Version/);
  save.version=1; save.commands=[{turn:0,choice:'open',mandate:'council',orders:[{action:'beacon',place:'aster'}]}];
  assert.throws(()=>decodeSession(JSON.stringify(save)),/derzeit/);
  const game=play(federation); const done=JSON.parse(encodeSession({game,draft:createDraft(game)}));
  done.draft.choice='federation';
  assert.throws(()=>decodeSession(JSON.stringify(done)),/aktuellen Gezeit|offene Aufträge/);
});
test('nachtmeer: local storage is isolated and failures are surfaced',()=>{
  const data=new Map([['realmcraft.strategy.first-winter.v1','legacy'],['rc.history','legacy-history']]);
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
  assert.equal(restore(storage),null); const session=newSession(); persist(session,storage);
  assert.deepEqual(restore(storage),session); assert.ok(data.has(STORAGE_KEY));
  assert.equal(data.get('realmcraft.strategy.first-winter.v1'),'legacy');
  assert.equal(data.get('rc.history'),'legacy-history');
  assert.throws(()=>persist(session,{setItem:()=>{throw new Error('full');}}),/full/);
});

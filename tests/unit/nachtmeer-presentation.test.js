import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleSession } from '../../spiel/nachtmeer/samples.js';
import { siteState, chartMarkup, localRules } from '../../spiel/nachtmeer/chart.js';
import { records, siteHistory } from '../../spiel/nachtmeer/records.js';
import { createDraft, resolveTurn } from '../../spiel/nachtmeer/engine.js';
import { encodeSession, decodeSession } from '../../spiel/nachtmeer/storage.js';

test('chart: a survey draft cannot claim an open route or an active light',()=>{
  const session=sampleSession('unknown');
  session.draft.orders.push({action:'explore',place:'aster'});
  assert.deepEqual(siteState(session.game,session.draft,'aster'),{id:'aster',open:false,lit:false,planned:'explore',label:'Erkundung vorgemerkt'});
  assert.match(chartMarkup(session.game,session.draft,'aster'),/data-route="aster" class="sea-route unknown  planned"/);
  assert.deepEqual(siteHistory(session.game,'aster'),[]);
  session.draft.orders=[];
  assert.equal(siteState(session.game,session.draft,'aster').label,'Seeweg unbekannt');
});

test('chart: a planned lighthouse has no supply route or enacted charter',()=>{
  const {game,draft}=sampleSession('draft');
  assert.equal(siteState(game,draft,'aster').label,'Feuerbau vorgemerkt');
  assert.equal(siteState(game,draft,'aster').lit,false);
  assert.equal(records(game).some(r=>r.id==='charter'),false);
  assert.deepEqual(localRules(game,'aster'),[]);
  assert.match(chartMarkup(game,draft,'aster'),/data-route="aster" class="sea-route open  planned"/);
});

test('chart: enacted construction connects the light to its historical decision',()=>{
  const {game,draft}=sampleSession('lit');
  assert.equal(siteState(game,draft,'aster').label,'Feuer in Betrieb');
  assert.match(chartMarkup(game,draft,'aster'),/data-route="aster" class="sea-route open supplied /);
  assert.equal(records(game).find(r=>r.id==='charter').turn,2);
  assert.deepEqual(siteHistory(game,'aster').map(e=>[e.turn,e.action,e.procedure]),[[1,'explore','Auftrag'],[2,'beacon','Ratsbeschluss']]);
  assert.match(localRules(game,'gaerten').join(' '),/Reserve/);
  assert.equal(localRules(game,'aster').some(r=>r.includes('Reserve')),false);
});

test('chart: common knowledge appears only after resolution and includes the shared limit',()=>{
  const {game,draft}=sampleSession('lit');
  draft.choice='commons';
  assert.equal(localRules(game,'aster').some(r=>r.includes('Gemeingut')),false);
  const next=resolveTurn(game,draft);
  for(const id of ['aster','gaerten','riff']) assert.match(localRules(next,id).join(' '),/reichsweit 1 Ätherauftrag/);
  assert.equal(localRules(next,'lys').some(r=>r.includes('Äther')),false);
});

test('chart: saved sessions preserve the visual state and record provenance',()=>{
  const session=sampleSession('lit');
  const before=encodeSession(session);
  for(const mode of ['routes','institutions']) chartMarkup(session.game,session.draft,'aster',mode);
  assert.equal(encodeSession(session),before);
  const restored=decodeSession(before);
  assert.deepEqual(records(restored.game),records(session.game));
  assert.deepEqual(siteState(restored.game,restored.draft,'aster'),siteState(session.game,session.draft,'aster'));
  assert.deepEqual(createDraft(restored.game),restored.draft);
});

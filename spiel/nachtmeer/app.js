import { PLACES, RULES, TIDES } from './scenario.js';
import { createDraft, canAdd, resolveTurn, preview } from './engine.js';
import { newSession, persist, restore, encodeSession, decodeSession, MAX_SAVE_BYTES } from './storage.js';
import { $, storyMarkup, councilMarkup, reviewMarkup, reportMarkup, endingMarkup, chronicleMarkup, registerMarkup } from './view.js';
import { render } from './chamber-view.js';
import { sampleSession } from './samples.js';

let session=newSession();
let selected='aster';
let savingPaused=false;
let revision=0;
let noticeTimeout;
let startupError='';
let mapMode='routes';
const isPreview=document.body.dataset.preview==='true';
if (isPreview) {
  session=sampleSession('unknown');
  $('#preview-bar').hidden=false;
  $('.file-tools').hidden=true;
} else {
  try { session=restore(localStorage) ?? session; } catch(error) { savingPaused=true; startupError=error.message; }
}

function notify(text) {
  $('#notice').textContent=text;
  clearTimeout(noticeTimeout);
  noticeTimeout=setTimeout(()=>{$('#notice').textContent='';},6500);
}
function save() {
  if (isPreview) { $('#save-status').textContent='Gestaltungsprobe · Die gespeicherte Partie bleibt erhalten'; return; }
  if (savingPaused) { $('#save-status').textContent='Automatisches Sichern pausiert'; return; }
  try { persist(session,localStorage); $('#save-status').textContent='Partie im Browser gesichert'; }
  catch { $('#save-status').textContent='Sicherung fehlgeschlagen · Datei speichern'; notify('Die Browser-Sicherung ist nicht verfügbar. Sichere deine Partie über Speichern als Datei.'); }
}
function update() {
  revision++; render(session,selected,mapMode); save();
  if (isPreview) for (const button of document.querySelectorAll('[data-sample]')) button.setAttribute('aria-pressed','false');
}
function dialog(content) {
  $('#dialog-content').innerHTML=content;
  if (!$('#dialog').open) $('#dialog').showModal();
  $('.dialog-close').focus();
}
function close() {
  $('#dialog').close();
  if (document.activeElement===document.body) $('.advance').focus({preventScroll:true});
}
function showStory() { if(session.game.status==='playing') dialog(storyMarkup(session.game,session.draft)); else dialog(endingMarkup(session.game)); }
function download() {
  const url=URL.createObjectURL(new Blob([encodeSession(session)],{type:'application/json'}));
  const link=document.createElement('a'); link.href=url; link.download=`nachtmeer-gezeit-${Math.min(6,session.game.turn+1)}.json`; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  notify('Die Partie wurde als Datei zum Speichern bereitgestellt.');
}

document.addEventListener('click',event=>{
  const button=event.target.closest('button');
  if(!button||button.disabled) return;
  if(button.dataset.sample && isPreview) {
    session=sampleSession(button.dataset.sample); selected='aster'; close(); update(); $('#inspector').scrollTop=0;
    button.setAttribute('aria-pressed','true');
    return;
  }
  if(button.dataset.mapMode) {
    mapMode=button.dataset.mapMode; render(session,selected,mapMode); return;
  }
  if(button.dataset.record) { dialog(registerMarkup(session.game,button.dataset.record)); return; }
  if(button.dataset.place) {
    selected=button.dataset.place; render(session,selected,mapMode); $('#inspector').scrollTop=0;
    $(`[data-place="${selected}"]`).focus({preventScroll:true});
    if(matchMedia('(max-width:680px)').matches) $('#inspector').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
    return;
  }
  if(button.dataset.order) {
    if(!canAdd(session.game,session.draft,button.dataset.order,selected)) return;
    session.draft.orders.push({action:button.dataset.order,place:selected}); update();
    $('.advance').focus({preventScroll:true}); notify('Auftrag vorgemerkt. Die Gezeitenprüfung zeigt seine Folgen.'); return;
  }
  if(button.dataset.remove!==undefined) {
    session.draft.orders.splice(Number(button.dataset.remove),1);
    if(!session.draft.orders.some(o=>o.action==='beacon')) session.draft.mandate='council';
    update(); $('.advance').focus({preventScroll:true}); return;
  }
  if(button.dataset.choice) {
    session.draft.choice=button.dataset.choice; update(); close();
    const p=preview(session.game,session.draft);
    notify(p.errors.length?'Entscheidung vorgemerkt. Prüfe die bestehenden Aufträge auf ihre neuen Bedingungen.':'Ratsentscheidung vorgemerkt. Du kannst jetzt deine Befehle ausführen oder weiter ändern.'); return;
  }
  if(button.dataset.mandate) { session.draft.mandate=button.dataset.mandate; update(); dialog(reviewMarkup(session.game,session.draft)); return; }
  switch(button.dataset.action) {
    case 'close': close(); break;
    case 'map': close(); $('#world').focus({preventScroll:true}); $('#world').scrollIntoView({block:'start'}); break;
    case 'story': showStory(); break;
    case 'council': dialog(councilMarkup(session.game,session.draft)); break;
    case 'chronicle': dialog(chronicleMarkup(session.game)); break;
    case 'register': dialog(registerMarkup(session.game)); break;
    case 'review': dialog(reviewMarkup(session.game,session.draft)); break;
    case 'next': close(); $('#current-event').focus({preventScroll:true}); break;
    case 'ending': if(session.game.status!=='playing') dialog(endingMarkup(session.game)); break;
    case 'execute': {
      try {
        const game=resolveTurn(session.game,session.draft);
        session={game,draft:createDraft(game)}; update();
        dialog(reportMarkup(game.history.at(-1),game.status!=='playing'));
      } catch(error) { notify(error.message); }
      break;
    }
    case 'export': download(); break;
    case 'import': $('#save-file').click(); break;
    case 'reset': dialog('<span class="eyebrow">Nachtmeer</span><h2 id="dialog-title">Eine neue Küste führen?</h2><p>Eine neue Partie beginnt in der ersten Gezeit. Sichere die aktuelle Partie als Datei, wenn du sie später fortsetzen möchtest.</p><button class="primary" data-action="confirm-reset">Neue Partie beginnen</button><button class="secondary" data-action="export">Aktuelle Partie sichern</button>'); break;
    case 'confirm-reset': session=newSession(); selected='aster'; savingPaused=false; close(); update(); showStory(); break;
    case 'tides':
    case 'help': dialog(`<span class="eyebrow">So führst du Lys</span><h2 id="dialog-title">Sechs Gezeiten bis zum Morgen</h2><p>Vor jeder Gezeit entscheidet der Hafenrat über einen Konflikt. Danach kannst du bis zu zwei Befehle vergeben. Wähle einen Ort auf der Karte, um seinen Seeweg zu erschließen, Ressourcen zu gewinnen oder ein Feuer zu entzünden.</p><p>Prüfe den Entwurf, bevor du die Gezeit ausführst. Bis dahin kannst du Befehle und Ratsentscheidung ändern. Speichern erhält auch den offenen Entwurf.</p><p><strong>Dein Ziel nach Gezeit sechs</strong><br>Drei Feuer, mindestens ${RULES.finalFood} Vorräte und ${RULES.finalHope} Zuversicht. Zwölf kumulierte fehlende Vorräte oder null Zuversicht beenden die Partie früher.</p><h3>Die Flut steigt</h3><ol class="tide-list">${TIDES.map((t,i)=>`<li><strong>${t.name}</strong><span>Grundverbrauch ${t.consumption} · Sturmdruck ${t.storm}</span></li>`).join('')}</ol><p>Jedes bereits aktive Feuer mindert den Sturmdruck um zwei. Jedes zusätzliche Feuer bringt einen Vorrat je Gezeit. Neue Anlagen und Ertragsboni wirken ab der nächsten Gezeit. Eine fertige Kaimauer mindert den Sturmdruck zusätzlich um drei und senkt ab Gezeit fünf den Verbrauch um zwei.</p><p>Fehlt Nahrung, sinkt die Zuversicht um drei je fehlendem Vorrat. Der offene Hafen erhöht den Verbrauch um eins. Die konkrete Bilanz steht vor jeder Ausführung in der Gezeitenprüfung.</p>`); break;
  }
});

$('#save-file').addEventListener('change',async event=>{
  const file=event.target.files[0]; if(!file) return;
  const before=revision;
  try {
    if(file.size>MAX_SAVE_BYTES) throw new Error('Die Datei ist größer als 64 KB.');
    const restored=decodeSession(await file.text());
    if(before!==revision) throw new Error('Die Partie wurde während des Ladens geändert. Bitte die Datei erneut auswählen.');
    session=restored; selected='aster'; savingPaused=false; close(); update();
    notify('Partie und offener Entwurf sind wiederhergestellt.');
  } catch(error) { notify(`Laden fehlgeschlagen. ${error.message}`); }
  event.target.value='';
});

render(session,selected,mapMode); save();
if(startupError) notify(`Gespeicherte Partie nicht geladen. ${startupError} Die Sicherung bleibt erhalten; Laden oder eine neue Partie beginnen.`);

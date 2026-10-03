import { ACTIONS, ADVISORS, EVENTS, PLACES, RESOURCES, RULES, TIDES } from './scenario.js';
import { preview, result } from './engine.js';
import { records } from './records.js';

export const $ = selector => document.querySelector(selector);
export const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const effectText = (cost={},gain={}) => [...Object.entries(cost).filter(([,n])=>n).map(([k,n])=>`−${n} ${RESOURCES[k].name}`),...Object.entries(gain).filter(([,n])=>n).map(([k,n])=>`${n>0?'+':''}${n} ${RESOURCES[k].name}`)].join(' · ');

export function laws(game) {
  return [
    game.flags.refugees && 'Offener Hafen · +1 Verbrauch, +2 Vorräte je Versorgungsauftrag',
    game.flags.charter && 'Gildenvertrag · +2 Baustoffe je Bergung, drei alte Baustoffe Reserve beim Leuchtfeuerbau',
    game.flags.commons && 'Gemeingutordnung · Leuchtfeuer ein Äther günstiger, höchstens ein Ätherauftrag je Gezeit',
    game.flags.breakwater && 'Kaimauer · Schutz vor Sturm, ab Gezeit fünf zwei Vorräte weniger Verbrauch',
  ].filter(Boolean);
}

export function storyMarkup(game,draft) {
  const event=EVENTS[game.turn];
  return `<span class="eyebrow">Gezeit ${game.turn+1} · Der Hafenrat</span><h2 id="dialog-title">${event.title}</h2><p>${event.text}</p>${event.options.map(o=>`<button class="choice" data-choice="${o.id}" aria-pressed="${draft.choice===o.id}"><strong>${draft.choice===o.id?'✓ ':''}${o.title}</strong><span>${o.text}</span><small>${effectText(o.cost,o.gain)}${o.loyalty?' · Vertrauen '+Object.entries(o.loyalty).map(([id,n])=>`${ADVISORS.find(a=>a.id===id).name.split(' ')[0]} ${n>0?'+':''}${n}`).join(', '):''}</small></button>`).join('')}<p class="fine-print">Deine Entscheidung wird gemeinsam mit den Befehlen ausgeführt. Du kannst sie bis dahin ändern.</p>`;
}

export function councilMarkup(game,draft) {
  const p=preview(game,draft);
  const hasBeacon=draft.orders.some(o=>o.action==='beacon');
  return `<span class="eyebrow">Die Regierung von Lys</span><h2 id="dialog-title">Der Hafenrat</h2><p>Leuchtfeuer benötigen zwei Stimmen. Ein Erlass kostet vier Zuversicht und beschädigt das Vertrauen der widersprechenden Ratsmitglieder. Geltende Verträge bleiben bindend.</p>${p.votes.map(a=>`<article class="council-person"><div class="person-seal">${a.seal}</div><div><h3>${a.name}</h3><small>${a.role} · Vertrauen ${game.loyalty[a.id]}${a.loyalty!==game.loyalty[a.id]?` → ${a.loyalty}`:''}</small><p>${hasBeacon?`${a.yes?'Zustimmung':'Ablehnung'}. ${a.reason}`:a.interest}</p></div></article>`).join('')}<h3>Geltende Ordnung</h3>${laws(game).length?`<ul class="law-list">${laws(game).map(l=>`<li>${l}</li>`).join('')}</ul>`:'<p>Der Hafenrat regiert durch Mehrheitsbeschluss. Weitere Verpflichtungen können durch deine Entscheidungen entstehen.</p>'}${game.status==='playing'?'<button class="primary" data-action="story">Aktuelle Anhörung öffnen</button>':''}`;
}

export function reviewMarkup(game,draft) {
  const p=preview(game,draft);
  const hasBeacon=draft.orders.some(o=>o.action==='beacon');
  return `<span class="eyebrow">Gezeit ${game.turn+1} · ${TIDES[game.turn].name}</span><h2 id="dialog-title">Die Befehle an die Küste</h2><p>${p.choice?`Ratsentscheidung: ${p.choice.title}.`:'Der Hafenrat wartet noch auf deine Entscheidung.'}</p>${!p.choice?'<button class="primary" data-action="story">Anhörung öffnen</button>':''}<ul class="order-review">${draft.orders.map(o=>`<li>${ACTIONS[o.action].name} · ${PLACES[o.place].name}</li>`).join('')}</ul>${hasBeacon?`<div class="mandate" role="group" aria-label="Verfahren für den Bauauftrag"><button data-mandate="council" aria-pressed="${draft.mandate==='council'}">Ratsbeschluss · ${p.votes.filter(v=>v.yes).length} / 3 Stimmen</button><button data-mandate="decree" aria-pressed="${draft.mandate==='decree'}">Erlass · −4 Zuversicht</button></div>`:''}<div class="review-lines">${Object.entries(RESOURCES).map(([key,m])=>`<div><span>${m.name}<small>${p.costs[key]?`Kosten −${p.costs[key]} · `:''}Erträge ${p.gains[key]>=0?'+':''}${p.gains[key]}${key==='food'?` · Verbrauch −${p.consumption}`:key==='hope'?` · Sturm −${p.stormLoss} · Erlass −${p.decreeLoss} · Hunger −${p.gap*RULES.hungerHope}`:''}</small></span><span>${game.resources[key]} → <strong>${p.resources[key]}</strong></span></div>`).join('')}</div>${p.errors.length?`<div class="issues" role="alert">${p.errors.map(e=>`<p>${escape(e)}</p>`).join('')}</div>`:''}${p.warnings.length?`<ul class="warnings">${p.warnings.map(w=>`<li>${w}</li>`).join('')}</ul>`:''}<p class="fine-print">Kosten stammen aus dem bisherigen Vorrat. Neue Gebäude, Seewege und Ertragsboni wirken ab der nächsten Gezeit. Neu beschlossene Verpflichtungen gelten sofort.</p><button class="primary" data-action="execute" ${p.errors.length?'disabled':''}>Gezeit ${game.turn+1} ausführen</button>`;
}

export function reportMarkup(entry,finished) {
  return `<span class="eyebrow">Gezeit ${entry.turn+1} abgeschlossen</span><h2 id="dialog-title">${entry.title}</h2><ul class="report-events">${entry.events.map(t=>`<li>${escape(t)}</li>`).join('')}</ul><div class="review-lines">${Object.entries(RESOURCES).map(([key,m])=>`<div><span>${m.name}</span><span>${entry.before[key]} → <strong>${entry.after[key]}</strong></span></div>`).join('')}</div><button class="primary" data-action="${finished?'ending':'next'}">${finished?'Abschluss ansehen':'Nächste Gezeit'}</button>`;
}

export function endingMarkup(game) {
  const r=result(game);
  return `<span class="eyebrow">${game.status==='won'?'Die Küste hat die Flut überstanden':'Die Partie ist beendet'}</span><h2 id="dialog-title" data-testid="campaign-result">${r.title}</h2><p>${r.text}</p><div class="review-lines">${r.checks.map(c=>`<div><span>${c.met?'✓':'○'} ${c.label}</span><strong>${c.value}</strong></div>`).join('')}</div><p>${game.flags.refugees?'Lys nahm alle Schutzsuchenden auf.':'Lys begrenzte die Aufnahme der Schutzsuchenden.'} ${game.flags.archive?'Die Namen der versunkenen Siedlungen sind im Archiv bewahrt.':game.history.some(e=>e.command.choice==='cache')?'Die Werkzeuge der alten Küste dienen dem Wiederaufbau.':''}</p>${laws(game).length?`<ul class="law-list">${laws(game).map(l=>`<li>${l}</li>`).join('')}</ul>`:''}<p>Versorgungslücken insgesamt: ${game.shortfall}. Abgeschlossene Gezeiten: ${game.turn}.</p><button class="primary" data-action="reset">Eine neue Küste führen</button><button class="secondary" data-action="export">Partie als Datei sichern</button>`;
}

export function chronicleMarkup(game) {
  return `<span class="eyebrow">Das Gedächtnis deines Reichs</span><h2 id="dialog-title">Chronik von Lys</h2><article class="chronicle-entry"><small>VOR DER ERSTEN FLUT</small><p>Das alte Leuchtfeuernetz erlischt. Rhea bringt das Hafenfeuer von Lys zum Brennen. Die Inseln verlieren den Kontakt zueinander.</p></article>${game.history.map(e=>`<article class="chronicle-entry"><small>GEZEIT ${e.turn+1} · ${e.title}</small>${e.events.map(t=>`<p>${escape(t)}</p>`).join('')}<p class="fine-print">Verbrauch ${e.consumption} · Versorgungslücke ${e.gap}</p></article>`).join('')}`;
}

export function registerMarkup(game,id) {
  const entries=records(game).filter(record=>!id || record.id===id);
  return `<div class="document-heading"><span>Kartenkammer von Lys</span><span>Ausgeführte Beschlüsse</span></div><span class="eyebrow">Das Recht der Küste</span><h2 id="dialog-title">${id && entries.length ? entries[0].title : 'Beschlussregister'}</h2>${entries.length ? entries.map(record=>`<article class="chronicle-entry"><small>GEZEIT ${record.turn} · HAFENRAT</small>${id ? '' : `<h3>${record.title}</h3>`}<p>${record.text}</p><p class="fine-print">Bei Beschluss ${effectText(record.cost,record.gain)}. Die Chronik hält den gesamten Verlauf fest.</p></article>`).join('') : '<p>Der Hafenrat hat noch keinen neuen Beschluss ausgeführt. Vorgemerkte Entscheidungen werden erst mit ihrer Gezeit eingetragen.</p>'}<button class="secondary" data-action="chronicle">Chronik öffnen</button>`;
}

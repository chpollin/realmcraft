import { PLACES, RESOURCES, RULES, ACTIONS, EVENTS, TIDES } from './scenario.js';
import { preview, result, availableActions, actionTerms, canAdd } from './engine.js';
import { chartMarkup, siteState, localRules } from './chart.js';
import { records, siteHistory } from './records.js';
import { $, icon, effectText } from './view.js';

function descriptionFor(game, id) {
  if (id === 'lys' && game.turn > 0) return game.flags.refugees
    ? 'Die Schutzsuchenden leben nun in Lys. Sie helfen beim Einholen der Vorräte. Der Hafen muss dauerhaft mehr Menschen versorgen.'
    : 'Lys hat einen Teil der Schutzsuchenden aufgenommen. Die übrigen Schiffe mussten weiterfahren. Die Hafenmeisterei organisiert die Versorgung.';
  if (id === 'aster' && game.lit.includes(id)) return 'Die alte Linse brennt wieder. Schiffe können der Nordpassage folgen. Aster liefert einen Vorrat je Gezeit und sein Feuer mindert den Sturmdruck um zwei.';
  if (id === 'gaerten' && game.lit.includes(id)) return 'Zwischen den überwucherten Spiegeln brennt ein Feuer. Die Glasgärten liefern einen Vorrat je Gezeit und schützen die Küste vor dem Sturm.';
  if (id === 'aster') return game.open.includes(id)
    ? 'Der Seeweg ist verzeichnet. An der Sternwarte fehlt noch das Feuer. Für den Bau braucht es Material, Äther und eine Mehrheit im Hafenrat.'
    : 'Aster ist von Lys aus zu sehen. Seit das Feuer erloschen ist, kennt niemand einen sicheren Seeweg. Eine Erkundungsfahrt kann den Zugang wiederherstellen.';
  return PLACES[id].description;
}

function inspectorMarkup(game, draft, selected) {
  const place = PLACES[selected];
  const state = siteState(game,draft,selected);
  const history = siteHistory(game,selected);
  const p = preview(game,draft);
  const hasFire = ['aster','gaerten'].includes(selected);
  const actions = availableActions(game,selected).map(id => {
    const terms = actionTerms(game,id,selected);
    const enabled = canAdd(game,draft,id,selected);
    const reason = enabled ? '' : draft.orders.length >= RULES.orders ? 'Beide Befehle sind vergeben. Entferne einen Auftrag, um neu zu planen.' : preview(game,{...draft,orders:[...draft.orders,{action:id,place:selected}]}).issues.find(issue => !['decision','council'].includes(issue.code))?.message ?? '';
    return `<button class="action-card ${['explore','beacon'].includes(id) ? 'featured' : ''}" data-order="${id}" ${enabled ? '' : 'disabled'}>${icon(terms.icon)}<span><strong>${terms.name}</strong><small>${effectText(terms.cost,terms.gain) || 'Ohne Materialkosten'} · 1 Befehl</small></span></button><p class="action-explanation">${reason || terms.description}</p>`;
  }).join('');
  const steps = hasFire ? `<ol class="site-steps" aria-label="Weg zum aktiven Leuchtfeuer"><li class="${state.open ? 'done' : state.planned === 'explore' ? 'pending' : ''}">${state.open ? '✓' : '1'} Seeweg</li><li class="${state.lit ? 'done' : state.planned === 'beacon' ? 'pending' : ''}">${state.lit ? '✓' : '2'} Baubeschluss</li><li class="${state.lit ? 'done' : ''}">${state.lit ? '✓' : '3'} Feuer</li></ol>` : '';
  const pending = state.planned === 'beacon' ? `<p class="action-explanation">Bauentwurf mit ${p.votes.filter(v=>v.yes).length} von 3 Ratsstimmen. ${draft.mandate === 'decree' ? 'Ein Erlass ist vorgesehen.' : 'Zwei Stimmen sind erforderlich.'} <button class="record-link" data-action="review">Entwurf prüfen</button></p>` : '';
  return `<div class="place-art" style="background-position:${place.art}"><span>${selected === 'aster' ? 'Aster · Nördliche Passage' : place.subtitle}</span></div><div class="place-body"><span class="eyebrow">Ortsbericht ${place.code} · ${place.allegiance}</span><h2>${place.name}</h2><div class="site-state ${state.lit ? 'lit' : ''} ${state.planned ? 'planned' : ''}" data-testid="site-state">${icon(state.lit ? 'beacon' : 'map')}${state.label}</div>${steps}<p class="place-description">${descriptionFor(game,selected)}</p>${pending}<h3 class="action-title">${game.status === 'playing' ? 'Aufträge an diesen Ort' : 'Partie abgeschlossen'}</h3>${actions || '<button class="action-card featured" data-action="ending">Abschluss ansehen</button>'}${localRules(game,selected).length ? `<div class="place-rules"><span class="eyebrow">Geltende Verpflichtungen</span>${localRules(game,selected).map(rule=>`<p>${rule}</p>`).join('')}</div>` : ''}<div class="place-history"><span class="eyebrow">Einträge zu diesem Ort</span>${history.length ? history.slice(-3).map(entry=>`<p>${entry.title}<br><small>Gezeit ${entry.turn} · ${entry.procedure}</small></p>`).join('') : '<p>Noch kein ausgeführter Auftrag.</p>'}</div></div>`;
}

export function render(session, selected, mode = 'routes') {
  const { game, draft } = session;
  const p = preview(game,draft);
  const running = game.status === 'playing';
  $('#resources').innerHTML = Object.entries(RESOURCES).map(([key,m]) => `<div class="resource">${icon(m.icon)}<span>${m.name}</span><strong data-testid="${key}-stock">${game.resources[key]}${key === 'hope' ? '<small>%</small>' : ''}</strong><span class="projection">${running ? p.errors.length ? 'Bestand' : `→ ${p.resources[key]} nach Gezeit` : 'Endbestand'}</span></div>`).join('');
  $('#turn').textContent = Math.min(game.turn+1,RULES.turns);
  $('#mission-title').textContent = running ? 'Gewässer um Lys' : result(game).title;
  $('#mission-summary').textContent = running ? `Ziel nach Gezeit ${RULES.turns} · ${RULES.finalFires} Feuer, ${RULES.finalFood} Vorräte, ${RULES.finalHope} Zuversicht` : `${game.lit.length} Feuer · ${game.resources.food} Vorräte · ${game.resources.hope} Zuversicht`;
  $('#chart-status').textContent = running ? TIDES[game.turn].name : 'Partie abgeschlossen';
  $('#chart').innerHTML = chartMarkup(game,draft,selected,mode);
  for (const button of document.querySelectorAll('[data-map-mode]')) button.setAttribute('aria-pressed',String(button.dataset.mapMode === mode));
  $('#chart-note').textContent = `${game.open.length} erreichbare Orte`;
  $('#inspector').innerHTML = inspectorMarkup(game,draft,selected);
  const active = records(game).filter(record => ['open','charter','commons'].includes(record.id));
  $('#records').innerHTML = active.length ? active.map(record=>`<button class="record-link" data-record="${record.id}"><strong>${record.title}</strong><small>Beschlossen in Gezeit ${record.turn} ↗</small></button>`).join('') : '<button class="record-link" data-action="council"><strong>Rat von Lys</strong><small>Feuerbau mit zwei von drei Stimmen ↗</small></button>';
  $('#order-count').textContent = draft.orders.length;
  $('#orders').innerHTML = [0,1].map(i => {
    const order = draft.orders[i];
    return order ? `<div class="order-slot filled"><span>0${i+1}</span><p>${ACTIONS[order.action].name}<small>${PLACES[order.place].name}</small></p><button class="remove" data-remove="${i}" aria-label="Befehl ${i+1} entfernen">${icon('close')}</button></div>` : `<div class="order-slot"><span>0${i+1}</span><p>${running ? 'Noch kein Auftrag' : 'Partie beendet'}<small>${running ? 'Ort auf der Karte wählen' : ''}</small></p></div>`;
  }).join('');
  const event = EVENTS[game.turn];
  $('#current-event').innerHTML = `<span><small>${running ? draft.choice ? 'Anhörung · Entscheidung vorgemerkt' : 'Anhörung · Entscheidung offen' : 'Abschluss der Partie'}</small><strong>${running ? event.title : result(game).title}</strong><em>${running ? event.question : 'Die Geschichte dieser Küste lesen'}</em></span>${icon('arrow')}`;
  $('.advance').innerHTML = `<span><small>${running ? `Gezeit ${game.turn+1} von ${RULES.turns}` : 'Nachtmeer'}</small>${running ? 'Gezeit prüfen' : 'Abschluss ansehen'}</span>${icon('arrow')}`;
  $('.advance').dataset.action = running ? 'review' : 'ending';
  return p;
}

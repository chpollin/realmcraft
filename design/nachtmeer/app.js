const $ = selector => document.querySelector(selector);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const directions = {
  admiralitaet: { name: '01 Admiralität', title: 'Am Kartentisch der Admiralität', text: 'Die Weltkarte nimmt den größten Teil des Bildschirms ein. Messingfarbene Markierungen verbinden Orte, Kapitelziel und Befehle. Eine feste Seitenleiste erklärt den ausgewählten Ort; die untere Leiste hält zwei Aufträge bereit.', question: 'Entsteht das Gefühl, eine bewohnte Welt zu regieren? Lassen sich die schwebenden Informationen lesen, ohne wichtige Orte zu verdecken?' },
  atlas: { name: '02 Atlas', title: 'Ein Atlas für dein Reich', text: 'Helles Papier, kartografische Zeichen und Serifenschrift geben dem Entwurf den Charakter einer Kartenkammer. Navigation, Karte und Ortsdossier bilden getrennte Arbeitsbereiche. Die Befehlsleiste funktioniert wie ein offenes Auftragsbuch.', question: 'Hilft die klare Gliederung beim Vergleichen und Planen? Behält die Welt trotz der Verwaltungsansicht ihre Atmosphäre?' },
  signal: { name: '03 Signal', title: 'Die nächste Entscheidung im Fokus', text: 'Eine große Bildfläche und eine reduzierte Entscheidungskonsole bestimmen den Aufbau. Die Schrift ist sachlich und deutlich größer. Ein heller Akzent markiert ausführbare Handlungen. Das Kapitelziel sitzt am unteren Rand der Karte.', question: 'Ist die nächste Handlung sofort erkennbar? Trägt die reduzierte Oberfläche genug Welt und Geschichte für RealmCraft?' },
};

const places = {
  lys: { name: 'Lys', subtitle: 'Hauptstadt · 2.840 Bewohner', label: 'Dein Bündnis', code: '01', x: 48, y: 43, art: '49% 33%', icon: 'beacon', type: 'Die Hafenstadt', description: 'Seit drei Nächten brennt das Feuer von Lys allein. An den Kais warten Menschen aus den versunkenen Niederungen auf deine Entscheidung.', terrain: 'Geschützter Hafen', allegiance: 'Dein Bündnis', state: 'Leuchtfeuer aktiv', quote: 'Solange Lys leuchtet, finden die Schiffe einen Weg.', speaker: 'Rhea Voss · Hafenmeisterin', actions: ['provisions', 'repair'] },
  werft: { name: 'Salzwerft', subtitle: 'Gildenhafen · 640 Bewohner', label: 'Dein Bündnis', code: '02', x: 22.5, y: 54, art: '9% 58%', icon: 'ship', type: 'Die freien Werften', description: 'Zwischen alten Kränen liegen die letzten seetüchtigen Schiffe. Die Gilden liefern Baumaterial, solange der Hafen unter ihrem Schutz bleibt.', terrain: 'Werften & Docks', allegiance: 'Gildenvertrag', state: 'Produktion verfügbar', quote: 'Ein Schiff kann man ersetzen. Eine erfahrene Mannschaft kaum.', speaker: 'Jorek Senn · Sprecher der Gilden', actions: ['salvage', 'provisions'] },
  gaerten: { name: 'Glasgärten', subtitle: 'Klosterinsel · 310 Bewohner', label: 'Freie Insel', code: '03', x: 40, y: 68, art: '35% 100%', icon: 'beacon', type: 'Die überwucherten Ruinen', description: 'Unter den Wurzeln liegen die Spiegel einer älteren Küste. Ihr Feuer könnte den südlichen Seeweg öffnen. Das Kloster verlangt freien Zugang zu den Gärten.', terrain: 'Ruinen & Terrassen', allegiance: 'Freies Kloster', state: 'Leuchtfeuer erloschen', quote: 'Das Licht gehörte der Küste, lange bevor es Könige gab.', speaker: 'Ilyra Sen · Hüterin der Spiegel', actions: ['beacon', 'aether'] },
  aster: { name: 'Sternwarte', subtitle: 'Insel Aster · 180 Bewohner', label: 'Freie Insel', code: '04', x: 79, y: 27, art: '91% 8%', icon: 'beacon', type: 'Das nördliche Leuchtfeuer', description: 'Hoch über der Brandung wartet die alte Linse auf neues Feuer. Ihr Licht würde die nördliche Passage sichern und Aster wieder mit Lys verbinden.', terrain: 'Felsinsel & Observatorium', allegiance: 'Bund der Seherinnen', state: 'Leuchtfeuer erloschen', quote: 'Die See steigt schneller, als unsere Karten es vorhersagen.', speaker: 'Ilyra Sen · Hüterin der Spiegel', actions: ['beacon', 'study'] },
  riff: { name: 'Schwarzes Riff', subtitle: 'Verlassene Insel', label: 'Unbewohnt', code: '05', x: 81, y: 68, art: '100% 76%', icon: 'aether', type: 'Das zerbrochene Heiligtum', description: 'Ein schwaches Glimmen steigt aus den Spalten des Riffs. Eine Bergungsmannschaft könnte dort Äther finden, den die alten Linsen benötigen.', terrain: 'Vulkanisches Gestein', allegiance: 'Ohne Herrschaft', state: 'Bergung möglich', quote: 'Wir wissen, was dort leuchtet. Noch wissen wir nicht, warum.', speaker: 'Ilyra Sen · Hüterin der Spiegel', actions: ['aether', 'salvage'] },
};
const actions = {
  beacon: { name: 'Leuchtfeuer entzünden', icon: 'beacon', detail: '5 Baustoffe · 3 Äther · 1 Befehl', cost: { material: 5, aether: 3 }, gain: { hope: 8 } },
  provisions: { name: 'Vorräte einholen', icon: 'food', detail: '+7 Vorräte · 1 Befehl', gain: { food: 7 } },
  salvage: { name: 'Baustoffe bergen', icon: 'material', detail: '+5 Baustoffe · 1 Befehl', gain: { material: 5 } },
  aether: { name: 'Äther bergen', icon: 'aether', detail: '+3 Äther · 1 Befehl', gain: { aether: 3 } },
  study: { name: 'Die Linse untersuchen', icon: 'book', detail: '+2 Äther · 1 Befehl', gain: { aether: 2 } },
  repair: { name: 'Die Kaimauer sichern', icon: 'material', detail: '3 Baustoffe · +6 Zuversicht', cost: { material: 3 }, gain: { hope: 6 } },
};
const resourceMeta = { food: { name: 'Vorräte', icon: 'food', trend: '−4' }, material: { name: 'Baustoffe', icon: 'material', trend: '+5' }, aether: { name: 'Äther', icon: 'aether', trend: '+2' }, hope: { name: 'Zuversicht', icon: 'hope', trend: 'stabil' } };
const initial = { turn: 3, resources: { food: 28, material: 16, aether: 8, hope: 72 }, lit: ['lys'], selected: 'aster', orders: [], choice: null, history: [] };
let state = structuredClone(initial);
let noticeTimeout;
let variant = new URL(location.href).searchParams.get('variant');
if (!Object.hasOwn(directions, variant)) variant = 'admiralitaet';

function notify(message) {
  $('#notice').textContent = message;
  clearTimeout(noticeTimeout);
  noticeTimeout = setTimeout(() => { $('#notice').textContent = ''; }, 4500);
}

function setVariant(next) {
  if (!Object.hasOwn(directions, next)) return;
  variant = next;
  document.documentElement.dataset.variant = next;
  for (const button of document.querySelectorAll('button[data-variant]')) button.setAttribute('aria-pressed', String(button.dataset.variant === next));
  $('#direction-name').textContent = directions[next].name;
  document.title = `Nachtmeer · ${directions[next].name} · RealmCraft`;
  const url = new URL(location.href);
  url.searchParams.set('variant', next);
  history.replaceState(null, '', url);
}

function canQueue(action, place) {
  if (state.orders.length >= 2 || state.turn > 6) return false;
  if (action === 'beacon' && (state.lit.includes(place) || state.orders.some(o => o.action === action && o.place === place))) return false;
  const reserved = {};
  for (const order of state.orders) for (const [key, value] of Object.entries(actions[order.action].cost ?? {})) reserved[key] = (reserved[key] ?? 0) + value;
  return Object.entries(actions[action].cost ?? {}).every(([key, value]) => state.resources[key] - (reserved[key] ?? 0) >= value);
}

function forecast() {
  const resources = { ...state.resources };
  for (const order of state.orders) {
    const action = actions[order.action];
    for (const [key, value] of Object.entries(action.cost ?? {})) resources[key] -= value;
    for (const [key, value] of Object.entries(action.gain ?? {})) resources[key] += value;
  }
  resources.food = Math.max(0, resources.food - 4);
  resources.hope = Math.min(100, resources.hope);
  return resources;
}

function render() {
  $('#resources').innerHTML = Object.entries(resourceMeta).map(([key, meta]) => `<div class="resource">${icon(meta.icon)}<span>${meta.name}</span><strong>${state.resources[key]}${key === 'hope' ? '<small>%</small>' : ''}</strong></div>`).join('');
  $('#turn').textContent = String(Math.min(6,state.turn)).padStart(2,'0');
  $('#next-turn').textContent = String(Math.min(6,state.turn)).padStart(2,'0');
  $('#beacon-count').textContent = state.lit.length;
  $('#beacon-dots').innerHTML = [0,1,2].map(i => `<i class="${i < state.lit.length ? 'lit' : ''}"></i>`).join('');
  $('#locations').innerHTML = Object.entries(places).map(([id,p]) => `<button class="location ${state.lit.includes(id) ? 'lit' : ''}" style="left:${p.x}%;top:${p.y}%" data-place="${id}" aria-pressed="${id === state.selected}" aria-label="${p.name} auswählen"><span class="pin">${icon(p.icon)}</span><span class="location-label">${p.name}<small>${state.lit.includes(id) ? 'Feuer entzündet' : p.label}</small></span></button>`).join('');
  const p = places[state.selected];
  $('#inspector').innerHTML = `<div class="place-art" style="background-position:${p.art}"><span class="region-code">INSEL ${p.code} / 05</span></div><div class="place-body"><div class="place-heading"><span class="eyebrow">${p.type}</span>${icon(p.icon)}</div><h2>${p.name}</h2><div class="place-subtitle">${p.subtitle}</div><p class="place-description">${p.description}</p><dl class="place-facts"><dt>Landschaft</dt><dd>${p.terrain}</dd><dt>Zugehörigkeit</dt><dd>${p.allegiance}</dd><dt>Status</dt><dd class="good">${state.lit.includes(state.selected) ? 'Leuchtfeuer aktiv' : p.state}</dd></dl><h3 class="action-title">Was ist dein Auftrag?</h3>${p.actions.map((id,i) => `<button class="action-card ${i === 0 ? 'featured' : ''}" data-order="${id}" ${canQueue(id,state.selected) ? '' : 'disabled'}>${icon(actions[id].icon)}<span><strong>${id === 'beacon' && state.lit.includes(state.selected) ? 'Leuchtfeuer entzündet' : actions[id].name}</strong><small>${actions[id].detail}</small></span></button>`).join('')}<blockquote class="place-quote">„${p.quote}“<cite>${p.speaker}</cite></blockquote></div>`;
  $('#order-count').textContent = state.orders.length;
  $('#orders').innerHTML = [0,1].map(i => {
    const order = state.orders[i];
    return order ? `<div class="order-slot filled"><span>0${i+1}</span><p>${actions[order.action].name}<small>${places[order.place].name}</small></p><button class="remove" data-remove="${i}" aria-label="Befehl ${i+1} entfernen">${icon('close')}</button></div>` : `<div class="order-slot"><span>+</span><p>Freier Befehl<small>Wähle einen Ort auf der Karte</small></p></div>`;
  }).join('');
  $('.advance').disabled = state.turn > 6;
}

function showDialog(content) {
  $('#dialog-content').innerHTML = content;
  if (!$('#dialog').open) $('#dialog').showModal();
  $('.dialog-close').focus();
}

function showStory() {
  showDialog(`<div class="dialog-art"></div><span class="eyebrow">Eine Anhörung im Hafenrat</span><h2 id="dialog-title">Die Schiffe ohne Flagge</h2><p>Zwölf Schiffe liegen vor Lys. Ihre Heimat ist überflutet. Die Gilden wollen nur ausgebildete Handwerker einlassen; Hafenmeisterin Rhea verlangt Schutz für alle Menschen an Bord.</p><p>Die Neuankömmlinge brauchen Vorräte. Zugleich würden ihre Kenntnisse beim Wiederaufbau helfen.</p>${state.choice ? `<div class="review-lines">Deine Entscheidung in dieser Vorschau<br><strong>${state.choice === 'open' ? 'Der Hafen steht allen offen.' : 'Die Aufnahme erfolgt in Etappen.'}</strong></div><p>Die Werte sind für die Designstudie festgelegt. Eine vollständige Ereignissimulation ist hier nicht angebunden.</p>` : `<button class="choice" data-choice="open"><strong>Den Hafen für alle öffnen</strong><small>−6 Vorräte · +10 Zuversicht · +2 Baustoffe</small></button><button class="choice" data-choice="staged"><strong>Zuerst die Schutzräume vorbereiten</strong><small>−2 Vorräte · −4 Zuversicht · +4 Baustoffe</small></button><p>Diese Auswahl verändert ausschließlich den Beispielzustand der UI-Studie.</p>`}`);
}

function showCouncil() {
  const people = [
    ['RV','Rhea Voss','HAFENMEISTERIN','Fordert Schutz für die Menschen auf den Flüchtlingsschiffen. Ein offener Hafen stärkt ihre Unterstützung.'],
    ['JS','Jorek Senn','SPRECHER DER GILDEN','Will zuerst Werften und Schutzräume sichern. Für Baumaterial erwartet er Mitsprache.'],
    ['IS','Ilyra Sen','HÜTERIN DER SPIEGEL','Drängt auf das Feuer von Aster. Jede weitere dunkle Gezeit gefährdet die nördliche Passage.'],
  ];
  showDialog(`<span class="eyebrow">Die Regierung von Lys</span><h2 id="dialog-title">Der Hafenrat</h2><p>Drei Stimmen beurteilen deine Entscheidungen aus unterschiedlichen Interessen.</p>${people.map(([seal,name,role,text]) => `<article class="council-person"><div class="person-seal">${seal}</div><div><h3>${name}</h3><small>${role}</small><p>${text}</p></div></article>`).join('')}<button class="primary" data-action="story">Die Schiffe ohne Flagge anhören</button>`);
}

function showChronicle() {
  const entries = [{ turn: 1, text: 'Die Feuer an der Küste erlöschen. Lys öffnet seine alten Vorratskammern.' },{ turn: 2, text: 'Rhea bringt das Hafenfeuer zum Brennen. Aus dem Norden treffen die ersten Flüchtlingsschiffe ein.' },...state.history];
  showDialog(`<span class="eyebrow">Das Gedächtnis deines Reichs</span><h2 id="dialog-title">Chronik von Lys</h2>${entries.map(e => `<article class="chronicle-entry"><small>GEZEIT ${String(e.turn).padStart(2,'0')}</small><p>${escape(e.text)}</p></article>`).join('')}<p>Die ersten beiden Einträge gehören zur Ausgangslage. Weitere Einträge entstehen durch deine Befehle in dieser Vorschau.</p>`);
}

function showReview() {
  const next = forecast();
  showDialog(`<span class="eyebrow">Vorschau · Gezeit ${String(state.turn).padStart(2,'0')}</span><h2 id="dialog-title">Deine Befehle an die Küste</h2><p>${state.orders.length ? state.orders.map(o => `${actions[o.action].name} in ${places[o.place].name}`).join('. ') + '.' : 'Du hast noch keinen Auftrag vorgemerkt.'} Der Hafen verbraucht vier Vorräte.</p><div class="review-lines">${Object.entries(resourceMeta).map(([key,meta]) => `<div><span>${meta.name}</span><span>${state.resources[key]} &nbsp; → &nbsp; <strong>${next[key]}</strong></span></div>`).join('')}</div><p>Du kannst die Beispielrunde ausführen und Veränderungen auf der Karte ansehen. Die Werte dienen der Bedienungsprüfung; es gibt hier keine vollständige Kampagne oder Speicherung.</p><button class="primary" data-action="execute">Beispielrunde ansehen</button>`);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.dataset.variant) { setVariant(button.dataset.variant); return; }
  if (button.dataset.place) {
    const place = button.dataset.place;
    state.selected = place;
    render();
    $(`[data-place="${place}"]`).focus({ preventScroll: true });
    if (matchMedia('(max-width: 680px)').matches) $('#inspector').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    return;
  }
  if (button.dataset.order) {
    const action = button.dataset.order;
    if (!canQueue(action,state.selected)) return;
    state.orders.push({ action, place: state.selected });
    render();
    notify(`${actions[action].name} vorgemerkt. ${2-state.orders.length === 1 ? 'Ein Befehl frei.' : 'Alle Befehle vergeben.'}`);
    const focus = $(`[data-order="${action}"]:not(:disabled)`) ?? $('.advance');
    focus.focus({ preventScroll: true });
    return;
  }
  if (button.dataset.remove !== undefined) {
    state.orders.splice(Number(button.dataset.remove),1);
    render();
    $('.advance').focus({ preventScroll: true });
    notify('Befehl entfernt.');
    return;
  }
  if (button.dataset.choice && !state.choice) {
    state.choice = button.dataset.choice;
    const open = state.choice === 'open';
    state.resources.food = Math.max(0,state.resources.food - (open ? 6 : 2));
    state.resources.hope = Math.min(100,state.resources.hope + (open ? 10 : -4));
    state.resources.material += open ? 2 : 4;
    state.history.push({ turn: state.turn, text: open ? 'Lys öffnet seinen Hafen für alle Menschen auf den Schiffen.' : 'Die Gilden bereiten Schutzräume vor. Die ersten Menschen gehen an Land.' });
    $('#dialog').close(); render(); notify('Deine Entscheidung ist im Beispielzustand sichtbar.'); return;
  }
  switch (button.dataset.action) {
    case 'map': $('#dialog').close(); $('#world').focus({ preventScroll: true }); $('#world').scrollIntoView({ block: 'start' }); break;
    case 'close': $('#dialog').close(); break;
    case 'story': showStory(); break;
    case 'council': showCouncil(); break;
    case 'chronicle': showChronicle(); break;
    case 'review': showReview(); break;
    case 'tides': showDialog('<span class="eyebrow">Sechs steigende Gezeiten</span><h2 id="dialog-title">Die Küste verliert Land</h2><p>Die neue Geschichte beginnt nach dem Erlöschen des Leuchtfeuernetzes. Bis zur sechsten Flut sollen drei Feuer die Inseln wieder verbinden. Schutzsuchende und Gilden beanspruchen dieselben Vorräte, die für den Wiederaufbau benötigt werden.</p><p>Diese Designstudie zeigt Gezeit drei als gemeinsamen Ausgangspunkt aller Varianten. Die Welt und ihre Ereignisse sind ein Vorschlag für eine neue Kampagne.</p>'); break;
    case 'design': { const d = directions[variant]; showDialog(`<span class="eyebrow">${d.name} · Gestaltungsabsicht</span><h2 id="dialog-title">${d.title}</h2><p>${d.text}</p><p>${d.question}</p><p>Vergleichsaufgabe für jeden Entwurf<br>Wähle die Sternwarte, merke ihr Leuchtfeuer vor und prüfe die Folgen. Öffne danach den Hafenrat.</p><p>Umgesetzte Interaktionen sind Ortsauswahl, Aufträge, Folgenvorschau, Beispielrunde, Ratsansicht und ein Ereignis. Die Gestaltung ist noch nicht vom Nutzer abgenommen.</p>`); break; }
    case 'reset': showDialog('<span class="eyebrow">UI-Studie</span><h2 id="dialog-title">Vorschau zurücksetzen?</h2><p>Die Aufträge und Entscheidungen dieser Designvorschau werden auf die gemeinsame Ausgangslage zurückgesetzt. Deine RealmCraft-Partien verwenden eigene Speicherstände.</p><button class="primary" data-action="confirm-reset">Beispielzustand zurücksetzen</button>'); break;
    case 'confirm-reset': state = structuredClone(initial); $('#dialog').close(); render(); notify('Die gemeinsame Ausgangslage ist wiederhergestellt.'); break;
    case 'execute': {
      if (state.turn > 6) return;
      state.resources = forecast();
      for (const o of state.orders) if (o.action === 'beacon') state.lit.push(o.place);
      state.history.push({ turn: state.turn, text: state.orders.length ? state.orders.map(o => `${actions[o.action].name} in ${places[o.place].name}`).join('. ') + '.' : 'Der Hafen erhält keine neuen Aufträge und verbraucht vier Vorräte.' });
      state.turn += 1; state.orders = [];
      $('#dialog').close(); render();
      notify(state.turn > 6 ? 'Ende der Beispielsequenz. Lade die Seite neu, um die Entwürfe erneut zu vergleichen.' : 'Beispielrunde ausgeführt. Karte, Vorräte und Chronik sind aktualisiert.');
      break;
    }
  }
});

setVariant(variant);
render();

import { assigned, createDraft, resolveTurn } from './engine.js';
import { PROJECTS, JOBS, SEASONS } from './scenario.js';
import { newSession, restore, persist, encodeSession, decodeSession } from './storage.js';
import { renderOverview, renderMap, renderCouncil, renderReview, renderChronicle, renderTurnBar } from './view.js';

let session = newSession();
let view = 'lage';
let place = 'erz';
let storage;
let autosave = true;
const notice = document.getElementById('notice');
const saveStatus = document.getElementById('save-status');
const main = document.getElementById('main');

function notify(message, error = false) {
  notice.textContent = message;
  notice.hidden = !message;
  notice.classList.toggle('error', error);
}

try {
  storage = window.localStorage;
  session = restore(storage) ?? session;
  if (session.game.status !== 'playing') view = 'chronik';
} catch (error) {
  autosave = false;
  notify(`Der lokale Spielstand konnte nicht geladen werden. ${error.message} Die vorhandenen Daten bleiben erhalten. Bitte eine Datei laden oder bewusst eine neue Partie beginnen.`, true);
  saveStatus.textContent = 'Automatisches Sichern pausiert';
}

function save() {
  if (!autosave) return;
  try {
    if (!storage) storage = window.localStorage;
    persist(session, storage);
    saveStatus.textContent = 'Im Browser gesichert';
  } catch {
    saveStatus.textContent = 'Dateisicherung empfohlen';
    notify('Der Browser kann diesen Stand nicht dauerhaft sichern. „Speichern“ lädt eine Sicherungsdatei herunter.', true);
  }
}

function render() {
  const { game, draft } = session;
  document.getElementById('overview').innerHTML = renderOverview(game);
  for (const nav of document.querySelectorAll('[data-view]')) {
    if (nav.dataset.view === view) nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
  }
  main.innerHTML = view === 'rat' ? renderCouncil(game, draft)
    : view === 'review' ? renderReview(game, draft)
      : view === 'chronik' ? renderChronicle(game) : renderMap(game, draft, place);
  document.getElementById('turn-bar').innerHTML = renderTurnBar(game, draft, view);
}

function navigate(next) {
  view = next;
  render();
  main.focus({ preventScroll: true });
}

function mutate(action, data) {
  const { game } = session;
  if (game.status !== 'playing') return;
  const draft = structuredClone(session.draft);
  if (action === 'plus' || action === 'minus') {
    const job = data.job;
    if (!Object.hasOwn(JOBS, job)) return;
    if (action === 'plus') {
      if (assigned(draft) >= game.workers || (job === 'mine' && !game.buildings.mine)) return;
      draft.allocation[job]++;
    } else if (draft.allocation[job] > 0) draft.allocation[job]--;
    else return;
  } else if (action === 'project') {
    const project = PROJECTS[data.project];
    if (!project || game.buildings[data.project] || game.material < project.cost) return;
    const available = game.workers - assigned(draft) + (draft.project ? PROJECTS[draft.project].workers : 0);
    if (available < project.workers) return;
    draft.project = data.project;
    draft.policy = null;
    notify(`${project.name} vorgemerkt. Zwei freie Arbeitsgruppen sind für den Bau reserviert. Die Ratsentscheidung steht noch aus.`);
  } else if (action === 'cancel-project') {
    draft.project = null;
    draft.policy = null;
    notify('Bauauftrag und zugehörige Ratsentscheidung entfernt. Die Baugruppen sind wieder frei.');
  } else if (action === 'policy') {
    if (!draft.project || !['majority', 'pact', 'veto'].includes(data.policy) || (data.policy === 'pact' && game.pact)) return;
    draft.policy = data.policy;
    notify('Politische Entscheidung vorgemerkt. Sie wird erst mit der Saison verbindlich.');
  }
  session = { game, draft };
  save();
  render();
}

function exportSave() {
  const blob = new Blob([encodeSession(session)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `realmcraft-erster-winter-zug-${session.game.turn}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.hasAttribute('data-close')) { button.closest('dialog')?.close(); return; }
  if (button.dataset.view) { navigate(button.dataset.view); return; }
  const { action } = button.dataset;
  if (['lage', 'rat', 'chronik', 'review'].includes(action)) { navigate(action); return; }
  if (action === 'place') {
    if (!['erz', 'weg', 'grau'].includes(button.dataset.place)) return;
    place = button.dataset.place;
    render();
    main.querySelector(`[data-place="${place}"]`)?.focus({ preventScroll: true });
  } else if (['plus', 'minus', 'project', 'cancel-project', 'policy'].includes(action)) {
    mutate(action, button.dataset);
    const selector = `[data-action="${action}"]${button.dataset.job ? `[data-job="${button.dataset.job}"]` : ''}${button.dataset.policy ? `[data-policy="${button.dataset.policy}"]` : ''}`;
    const replacement = main.querySelector(selector);
    if (replacement && !replacement.disabled) replacement.focus({ preventScroll: true });
    else if (button.dataset.job) main.querySelector(`[data-job="${button.dataset.job}"]:not(:disabled)`)?.focus({ preventScroll: true });
    else main.focus({ preventScroll: true });
  } else if (action === 'execute') {
    if (session.game.status !== 'playing' || view !== 'review') return;
    try {
      const game = resolveTurn(session.game, session.draft);
      session = { game, draft: createDraft(game, session.draft) };
      notify(game.status === 'playing' ? `Die Saison ist ausgeführt. ${SEASONS[game.turn].name} beginnt. Die bisherigen Arbeitszuweisungen wurden übernommen; Baugruppen sind wieder frei.` : 'Das Szenario ist abgeschlossen. Der Jahresbericht steht in der Chronik.');
      save();
      navigate('chronik');
    } catch (error) { notify(error.message, true); }
  } else if (action === 'export') exportSave();
  else if (action === 'import') document.getElementById('save-file').click();
  else if (action === 'help') document.getElementById('help-dialog').showModal();
  else if (action === 'new') document.getElementById('new-dialog').showModal();
  else if (action === 'confirm-new') {
    document.getElementById('new-dialog').close();
    session = newSession(); autosave = true; place = 'erz';
    notify('Eine neue Gemeinschaft beginnt im Frühling.');
    save(); navigate('lage');
  }
});

let loadRequest = 0;
document.getElementById('save-file').addEventListener('change', async event => {
  const request = ++loadRequest;
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 64 * 1024) throw new Error('Die Datei überschreitet die erlaubte Größe von 64 KB.');
    const imported = decodeSession(await file.text());
    if (request !== loadRequest) return;
    session = imported; autosave = true; place = 'erz';
    notify('Speicherstand geprüft und geladen. Auch der offene Befehlsentwurf wurde wiederhergestellt.');
    save(); navigate(imported.game.status === 'playing' ? 'lage' : 'chronik');
  } catch (error) { notify(`Laden fehlgeschlagen. ${error.message} Die aktuelle Partie bleibt erhalten.`, true); }
});

render();

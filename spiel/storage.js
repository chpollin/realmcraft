import { createGame, createDraft, assertDraft, resolveTurn } from './engine.js';
import { SAVE_VERSION, SCENARIO_ID, SEASONS } from './scenario.js';

export const STORAGE_KEY = 'realmcraft.strategy.first-winter.v1';
const MAX_SAVE_BYTES = 64 * 1024;

export function newSession() {
  const game = createGame();
  return { game, draft: createDraft(game) };
}

// Saves retain commands so loading revalidates every committed transition.
export function encodeSession(session) {
  return JSON.stringify({
    format: 'realmcraft-strategy', version: SAVE_VERSION, scenario: SCENARIO_ID,
    commands: session.game.history.map(entry => entry.command), draft: session.draft,
  }, null, 2);
}

export function decodeSession(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_SAVE_BYTES) throw new Error('Der Speicherstand ist zu groß oder unlesbar.');
  let save;
  try { save = JSON.parse(raw); } catch { throw new Error('Die Datei enthält keinen lesbaren JSON-Spielstand.'); }
  if (!save || save.format !== 'realmcraft-strategy') throw new Error('Bitte einen Speicherstand des Strategiespiels laden. Spielleiterpartien gehören ins bisherige Dashboard.');
  if (save.version !== SAVE_VERSION || save.scenario !== SCENARIO_ID) throw new Error('Die Version oder das Szenario dieses Speicherstands wird nicht unterstützt.');
  if (!Array.isArray(save.commands) || save.commands.length > SEASONS.length) throw new Error('Der Speicherstand enthält eine ungültige Zugfolge.');
  let game = createGame();
  for (const command of save.commands) game = resolveTurn(game, command);
  assertDraft(save.draft);
  if (save.draft.turn !== game.turn) throw new Error('Der offene Entwurf passt nicht zum letzten ausgeführten Zug.');
  if (game.status !== 'playing' && (save.draft.project || save.draft.policy)) throw new Error('Ein abgeschlossener Spielstand darf keinen offenen Bauantrag enthalten.');
  return { game, draft: structuredClone(save.draft) };
}

export function persist(session, storage) {
  storage.setItem(STORAGE_KEY, encodeSession(session));
}

export function restore(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? null : decodeSession(raw);
}

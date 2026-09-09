import { createGame, createDraft, assertDraft, resolveTurn } from './engine.js';
import { SCENARIO, VERSION, RULES, EVENTS } from './scenario.js';

export const STORAGE_KEY = 'realmcraft.nachtmeer.v1';
export const MAX_SAVE_BYTES = 65536;
export function newSession() { const game = createGame(); return { game, draft: createDraft(game) }; }
export function encodeSession(session) {
  return JSON.stringify({ format: 'realmcraft-nachtmeer', version: VERSION, scenario: SCENARIO, commands: session.game.history.map(e=>e.command), draft: session.draft },null,2);
}
export function decodeSession(raw) {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > MAX_SAVE_BYTES) throw new Error('Der Spielstand ist unlesbar oder größer als 64 KB.');
  let save;
  try { save = JSON.parse(raw); } catch { throw new Error('Die Datei enthält keinen lesbaren JSON-Spielstand.'); }
  if (!save || save.format !== 'realmcraft-nachtmeer' || save.version !== VERSION || save.scenario !== SCENARIO) throw new Error('Dieser Spielstand gehört zu einer anderen Partie oder einer nicht unterstützten Version.');
  if (!Array.isArray(save.commands) || save.commands.length > RULES.turns) throw new Error('Der Spielstand enthält eine ungültige Zugfolge.');
  let game = createGame();
  for (const command of save.commands) game = resolveTurn(game,command);
  assertDraft(save.draft);
  if (save.draft.turn !== game.turn) throw new Error('Der offene Entwurf gehört zu einer anderen Gezeit.');
  if (save.draft.choice && !EVENTS[game.turn]?.options.some(o=>o.id===save.draft.choice)) throw new Error('Die Ratsentscheidung passt nicht zur aktuellen Gezeit.');
  if (game.status !== 'playing' && (save.draft.orders.length || save.draft.choice || save.draft.mandate !== 'council')) throw new Error('Die abgeschlossene Partie enthält noch offene Aufträge.');
  return { game, draft: structuredClone(save.draft) };
}
export const persist = (session,storage) => storage.setItem(STORAGE_KEY,encodeSession(session));
export function restore(storage) { const raw = storage.getItem(STORAGE_KEY); return raw === null ? null : decodeSession(raw); }

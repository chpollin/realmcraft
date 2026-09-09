import { createDraft, resolveTurn } from './engine.js';
import { newSession } from './storage.js';

/** Fixed, legally resolved states for the isolated design comparison. */
export function sampleSession(id) {
  let session = newSession();
  if (id === 'unknown') return session;
  session.game = resolveTurn(session.game, { turn: 0, choice: 'open', mandate: 'council', orders: [{ action: 'explore', place: 'aster' }, { action: 'explore', place: 'gaerten' }] });
  session.draft = { turn: 1, choice: 'charter', mandate: 'council', orders: [{ action: 'beacon', place: 'aster' }, { action: 'provisions', place: 'lys' }] };
  if (id === 'draft') return session;
  if (id !== 'lit') throw new Error('Unbekannte Gestaltungsprobe.');
  const game = resolveTurn(session.game, session.draft);
  return { game, draft: createDraft(game) };
}

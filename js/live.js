// js/live.js — terminal mode: mirror the savegame.json the game master writes
// and follow changes over server-sent events (serve.mjs). Without the file
// (404), without http (file://) or without server support a no-op, so chat
// mode and the published page stay untouched.
import { toast } from './components/ui.js';

// apply(text) loads a savegame text; ohneLive() runs when no live file exists,
// e.g. on GitHub Pages.
export async function wireLive({ apply, ohneLive }) {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return;

  const loadLive = async () => {
    try {
      // Timeout, so a stalled response cannot silently hang the mirror.
      const res = await fetch('savegame.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!res.ok) return false;
      apply(await res.text());
      return true;
    } catch {
      return false;
    }
  };

  if (!(await loadLive())) {
    await ohneLive();
    return;
  }

  toast('Live-Modus: savegame.json wird gespiegelt.');

  // EventSource reconnects transient drops itself; only a finally closed
  // connection (server restart) is rebuilt, with a short backoff.
  const connect = () => {
    let es;
    try {
      es = new EventSource('events');
    } catch {
      return; // no EventSource: the one load suffices
    }
    es.addEventListener('savegame', () => loadLive());
    // Code change on the dev server: reload the page so an open tab does not
    // keep running stale JS, HTML or CSS (serve.mjs, reload event).
    es.addEventListener('reload', () => location.reload());
    es.addEventListener('error', () => {
      if (es.readyState === EventSource.CLOSED) {
        es.close();
        setTimeout(connect, 2000);
      }
    });
  };
  connect();
}

// Coalesces remote invalidations and serializes their reads. Pausing invalidates
// in-flight publication while preserving work for a later canonical refresh.
export function createRefreshQueue({ refresh, delay = 80, retryDelay = 1000 }) {
  const pending = new Set();
  let timer = null;
  let running = false;
  let paused = false;
  let stopped = false;
  let generation = 0;

  const clear = () => { clearTimeout(timer); timer = null; };
  function schedule(ms) {
    if (!stopped && !paused && !running && timer === null && pending.size) timer = setTimeout(drain, ms);
  }
  async function drain() {
    timer = null;
    if (stopped || paused || running) return;
    running = true;
    const before = generation;
    const current = () => !stopped && !paused && generation === before;
    const batch = [...pending];
    pending.clear();
    let failed = false;
    try {
      for (const key of batch) {
        if (!current()) { if (!stopped) pending.add(key); continue; }
        try {
          await refresh(key, current);
          if (!current() && !stopped) pending.add(key);
        } catch {
          if (!stopped) pending.add(key);
          failed = true;
        }
      }
    } finally {
      running = false;
      schedule(failed ? retryDelay : delay);
    }
  }

  return {
    request(...keys) {
      if (stopped) return;
      for (const key of keys) pending.add(key);
      schedule(delay);
    },
    pause() { paused = true; generation += 1; clear(); },
    resume() { if (!stopped) { paused = false; schedule(0); } },
    stop() { stopped = true; generation += 1; clear(); pending.clear(); },
  };
}

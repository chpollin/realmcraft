// Serializes draft writes before a snapshot or navigation can replace the page.
export function createDraftPersistence({ read, write, onResult = () => {}, delay = 250 }) {
  let saved = read();
  let generation = 0;
  let timer = null;
  let flushing = null;
  let locked = false;

  const busy = () => ({
    stored: false,
    issues: [{ code: 'cli.locked', severity: 'error', path: '', message: 'a draft operation is in progress' }],
  });
  const clear = () => { clearTimeout(timer); timer = null; };

  async function drain() {
    clear();
    let result = { stored: true, issues: [] };
    while (read() !== saved) {
      const draft = read();
      const before = generation;
      try {
        result = await write(draft);
      } catch (err) {
        result = { stored: false, issues: [{ code: 'server', severity: 'error', path: '', message: String(err?.message ?? err) }] };
      }
      clear();
      // A canonical new turn supersedes the result of an older request.
      if (generation !== before) { result = { stored: true, issues: [] }; continue; }
      if (result.stored) saved = draft;
      onResult(draft, result);
      if (!result.stored) return result;
    }
    return result;
  }

  function flush() {
    clear();
    if (!flushing) flushing = drain().finally(() => { flushing = null; });
    return flushing;
  }

  return {
    get locked() { return locked; },
    get unsaved() { return read() !== saved || Boolean(flushing); },
    markClean() { generation += 1; saved = read(); clear(); },
    schedule() {
      clear();
      if (!locked) timer = setTimeout(() => { flush(); }, delay);
    },
    flush() { return locked ? Promise.resolve(busy()) : flush(); },
    async withBarrier(operation, { keepLocked = false } = {}) {
      if (locked) return { ok: false, issues: busy().issues };
      locked = true;
      let keep = false;
      try {
        const stored = await flush();
        if (!stored.stored) return { ok: false, issues: stored.issues };
        const result = await operation();
        keep = keepLocked && result?.ok === true;
        return result;
      } finally {
        clear();
        locked = keep;
      }
    },
  };
}

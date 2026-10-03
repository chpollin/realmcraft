// js/demo.js — demo picker: demo states listed in examples/demo/manifest.json,
// switchable in the dashboard, locally and on the published page. Demo states
// reference their images as files (paths instead of data URLs); <img src>
// takes both.
import { el } from './components/ui.js';
import { roman } from './format.js';

const DEMO_MANIFEST = 'examples/demo/manifest.json';
const PICK_OWN = '__own__';

// deps: select and loadInput elements; apply(text, opts) loads a savegame
// text; hasState() tells whether a state is loaded; beforeSwitch() runs before
// a demo replaces the current state.
export function demoPicker({ select, loadInput, apply, hasState, beforeSwitch }) {
  let manifest = null;
  let slug = null;

  async function ladeManifest() {
    if (manifest) return manifest;
    try {
      const res = await fetch(DEMO_MANIFEST, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !Array.isArray(data.staende) || !data.staende.length) return null;
      manifest = data;
      return manifest;
    } catch {
      return null;
    }
  }

  // nurWennLeer: the default sample must not overwrite a state the user loaded
  // while the demo was still being fetched, so the check runs after the await.
  async function ladeStand(eintrag, { nurWennLeer = false } = {}) {
    if (!eintrag?.pfad) return false;
    try {
      const res = await fetch(eintrag.pfad, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!res.ok) return false;
      const text = await res.text();
      if (nurWennLeer && hasState()) return false;
      beforeSwitch();
      apply(text, { demo: true });
      return true;
    } catch {
      return false;
    }
  }

  // One select for switching demos and for loading an own file. The loaded
  // demo slug is mirrored so the own-file option never stays selected.
  async function wire() {
    if (!select) return;
    const m = await ladeManifest();
    if (!m) { select.hidden = true; return; }

    select.replaceChildren(
      ...m.staende.map((e) => {
        const teile = [e.titel || e.slug];
        if (e.kapitel != null) teile.push(`Kapitel ${roman(e.kapitel)}`);
        const saison = `${e.jahreszeit || ''} ${e.jahr ?? ''}`.trim();
        if (saison) teile.push(saison);
        return el('option', { value: e.slug }, [teile.join(', ')]);
      }),
      el('option', { value: PICK_OWN }, ['Eigenen Speicherstand laden …']),
    );
    select.hidden = false;
    if (slug) select.value = slug;

    select.addEventListener('change', () => {
      if (select.value === PICK_OWN) {
        select.value = slug || m.staende[0]?.slug || '';
        loadInput?.click();
        return;
      }
      const eintrag = m.staende.find((e) => e.slug === select.value);
      if (eintrag) { slug = select.value; ladeStand(eintrag); }
    });
  }

  // Default sample for the published page: the demo marked default in the
  // manifest (else the first), without a manifest the older single sample.
  // Network errors leave the empty state. Every await is followed by a state
  // check, because the user may load a file or pick a demo meanwhile.
  async function loadDefault() {
    const m = await ladeManifest();
    if (hasState()) return;
    if (m) {
      const eintrag = m.staende.find((e) => e.slug === m.default) || m.staende[0];
      if (await ladeStand(eintrag, { nurWennLeer: true })) {
        slug = eintrag.slug;
        if (select) select.value = eintrag.slug;
        return;
      }
      if (hasState()) return;
    }
    try {
      const res = await fetch('examples/die-gestrandeten.json', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const text = await res.text();
      if (!hasState()) apply(text);
    } catch {
      // without a sample the empty state with its load prompt stays
    }
  }

  return { wire, loadDefault };
}

// js/export.js — export bundle: the loaded state with every image this browser
// holds embedded, so the file shows the same images on a foreign browser
// (GitHub Pages) without an API call.
import { el } from './components/ui.js';
import { cacheGet } from './images/cache.js';
import { BILDTYPEN } from './images/registry.js';
import { identityOf } from './images/prompts.js';
import { versionsAll, aktGet } from './images/versions.js';

// modelFor(role) resolves the configured model, which is part of every key.
export async function buildExportBundle(state, { partie, modelFor }) {
  const bundle = JSON.parse(JSON.stringify(state));

  // Keys first, embedding second: the embedded fields are no prompt input, but
  // computing all keys on the untouched clone keeps that independent of order.
  const jobs = [];
  for (const [typ, def] of Object.entries(BILDTYPEN)) {
    for (const e of def.list(bundle)) jobs.push({ typ, def, e, key: def.key(e, bundle, modelFor(def.role)) });
  }
  for (const { typ, def, e, key } of jobs) {
    let url = await cacheGet(key);
    // The chosen version is the entity's primary image, so a Pages visitor
    // sees the current choice even before bildChronik is restored.
    const aktiv = def.versioned ? aktGet(partie, identityOf(typ, def.id(e))) : null;
    const aktivUrl = aktiv ? await cacheGet(aktiv) : null;
    if (aktivUrl) url = aktivUrl;
    if (url) def.setEmbedded(e, url);
  }

  // The full version chronicle per identity, frontend-owned field bildChronik
  // (the schema allows additional root fields).
  const bildChronik = {};
  for (const [identity, liste] of Object.entries(versionsAll(partie))) {
    if (!Array.isArray(liste) || !liste.length) continue;
    const versionen = [];
    for (const v of liste) {
      const dataUrl = await cacheGet(v.key);
      versionen.push({ key: v.key, label: v.label, savedAt: v.savedAt, ...(dataUrl ? { dataUrl } : {}) });
    }
    bildChronik[identity] = { aktiv: aktGet(partie, identity) || null, versionen };
  }
  if (Object.keys(bildChronik).length) bundle.bildChronik = bildChronik;
  return bundle;
}

export function downloadBundle(bundle) {
  const name = (bundle.meta?.spielname || 'stand').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `realmcraft-${name || 'stand'}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

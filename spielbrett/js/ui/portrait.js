// Portrait slot by stable person id. Shows initials at once and swaps in the
// image once the manifest lists one, so missing portraits never leave a hole.

import { el } from '../dom.js';

const MANIFEST_URL = new URL('../../assets/portraits/manifest.json', import.meta.url);
let manifest = null;

const loading = fetch(MANIFEST_URL)
  .then((r) => (r.ok ? r.json() : []))
  .then((data) => {
    const list = Array.isArray(data) ? data : data.portraits ?? [];
    manifest = new Map(list.filter((p) => p?.id && p?.file).map((p) => [p.id, new URL(p.file, MANIFEST_URL).href]));
    return manifest;
  })
  .catch(() => {
    manifest = new Map();
    return manifest;
  });

function initials(name) {
  return name.split(' ').filter((p) => /^\p{Lu}/u.test(p)).map((p) => p[0]).slice(0, 2).join('');
}

/**
 * @param {string|undefined} id stable person id (torhild, garmund, ulrun, brandur, skarn, veleda)
 * @param {string} name
 * @param {{size?: number, cls?: string}} [opts]
 */
export function portrait(id, name, { size = 56, cls = '' } = {}) {
  const slot = el('span', { class: `portraet ${cls}`, style: { '--p-size': `${size}px` }, 'aria-hidden': 'true' },
    el('span', { class: 'portraet-initialen', text: initials(name) }));
  const apply = (m) => {
    const src = id && m.get(id);
    if (!src) return;
    const img = el('img', { src, alt: '', width: String(size), height: String(size), decoding: 'async' });
    img.addEventListener('load', () => slot.classList.add('hat-bild'));
    slot.append(img);
  };
  if (manifest) apply(manifest);
  else loading.then(apply);
  return slot;
}

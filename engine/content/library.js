// Content library of a campaign (library.json): every Entwicklung, event card
// and Bestimmung the campaign has seen, append-only and pinned by revision
// ("salzpfad@1"). Content is immutable once stored; a revision is a new entry
// id@rev+1. Libraries are treated as immutable values: appendToLibrary returns
// a new library, so a preview can never alter the stored one.

import { KINDS } from '../schemas/common.js';
import { canonEqual } from '../core/canon.js';

export const LIBRARY_FORMAT = 'realmcraft-library';
export const CONTENT_TYPES = Object.freeze(['entwicklung', 'ereignis', 'bestimmung']);

export function createLibrary() {
  return { format: LIBRARY_FORMAT, version: 1, entries: [] };
}

/** Content type of a stored object: Entwicklungen carry their format, cards a band, destinies milestones. */
export function contentType(data) {
  if (data && data.format === 'realmcraft-entwicklung') return 'entwicklung';
  if (data && Array.isArray(data.milestones)) return 'bestimmung';
  if (data && Number.isInteger(data.band)) return 'ereignis';
  return null;
}

export const refOf = (data) => `${data.id}@${data.rev}`;

// Lookup tables per entries array. appendToLibrary always builds a new array,
// so a cached index never goes stale.
const indexCache = new WeakMap();
function index(library) {
  const entries = library?.entries ?? [];
  let idx = indexCache.get(entries);
  if (!idx) {
    idx = { byRef: new Map(), latest: new Map() };
    for (const e of entries) {
      idx.byRef.set(e.ref, e);
      const cur = idx.latest.get(e.data.id);
      if (!cur || cur.data.rev < e.data.rev) idx.latest.set(e.data.id, e);
    }
    indexCache.set(entries, idx);
  }
  return idx;
}

/**
 * Appends one content object. Returns { library, ref, added }: added is false
 * when exactly this id@rev with identical content is already stored (ingest
 * is idempotent). Throws when id@rev exists with other content or when the
 * revision does not follow the latest one, because both mean the validator
 * was skipped.
 */
export function appendToLibrary(library, data, { turn = null, source = null } = {}) {
  const type = contentType(data);
  if (!type) throw new Error('library: object is neither an Entwicklung, an event card nor a Bestimmung');
  const ref = refOf(data);
  const idx = index(library);
  const existing = idx.byRef.get(ref);
  if (existing) {
    if (existing.type === type && canonEqual(existing.data, data)) return { library, ref, added: false };
    throw new Error(`library: ${ref} already exists with other content`);
  }
  const latest = idx.latest.get(data.id);
  if (latest && latest.type !== type) throw new Error(`library: id ${data.id} already names a ${latest.type}`);
  const expectedRev = latest ? latest.data.rev + 1 : 1;
  if (data.rev !== expectedRev) throw new Error(`library: ${ref} must be revision ${expectedRev}`);
  const entry = { ref, type, data: structuredClone(data), turn, source };
  return { library: { ...library, entries: [...library.entries, entry] }, ref, added: true };
}

/**
 * The stored object for "id@rev", or the latest revision for a bare id
 * (prerequisites name ids without revision). null when absent.
 */
export function resolveRef(library, ref) {
  const idx = index(library);
  const s = String(ref);
  const e = s.includes('@') ? idx.byRef.get(s) : idx.latest.get(s);
  return e ? e.data : null;
}

/** Latest revision number of an id, 0 when the id is new. */
export function latestRev(library, id) {
  return index(library).latest.get(id)?.data.rev ?? 0;
}

/**
 * Stored objects of one kind in append order: an Entwicklung kind ("einheit"),
 * a content type ("entwicklung", "ereignis", "bestimmung"). With
 * { latest: true } only the newest revision of each id.
 */
export function listByKind(library, kind, { latest = false } = {}) {
  const isKind = KINDS.includes(kind);
  if (!isKind && !CONTENT_TYPES.includes(kind)) throw new Error(`library: unknown kind "${kind}"`);
  const idx = index(library);
  return (library?.entries ?? [])
    .filter((e) => (isKind ? e.type === 'entwicklung' && e.data.kind === kind : e.type === kind))
    .filter((e) => !latest || idx.latest.get(e.data.id) === e)
    .map((e) => e.data);
}

/** Builds a library from plain content lists, in order (world seed content). */
export function libraryFrom(items, opts) {
  let lib = createLibrary();
  for (const data of items) lib = appendToLibrary(lib, data, opts).library;
  return lib;
}

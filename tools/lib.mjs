// tools/lib.mjs — shared by the image generator tools: the API key and the
// reference images of a job.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toRefImage } from '../js/images/gemini.js';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The environment variable GEMINI_API_KEY, else the same line in .env at the
// repository root. The key is only read, never logged or written. serve.mjs
// keeps its own parser, because it injects the whole .env into the page.
export async function readApiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  let raw;
  try {
    raw = await readFile(path.join(REPO, '.env'), 'utf8');
  } catch {
    return '';
  }
  for (const line of raw.split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue;
    const m = /^\s*GEMINI_API_KEY\s*=\s*(.*?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

// The advisor's reference photo, which the portrait prompt refers to. A data
// URL is decoded directly; a path (slim demo state) is read from the
// repository, because fetch in Node has no page origin to resolve it against.
export async function referenzBilder(typ, entity) {
  const url = typ === 'berater' ? entity.referenz?.dataUrl : null;
  if (!url) return [];
  if (url.startsWith('data:')) return [await toRefImage(url)].filter(Boolean);
  const buf = await readFile(path.join(REPO, url));
  return [{ data: buf.toString('base64'), mimeType: MIME[path.extname(url).toLowerCase()] || 'image/png' }];
}

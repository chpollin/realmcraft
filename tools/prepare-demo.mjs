// tools/prepare-demo.mjs
// =============================================================================
// Wandelt einen Export-Speicherstand (mit eingebetteten Base64-Bildern) in einen
// schlanken Demo-Stand für GitHub Pages: Bilder werden als echte Dateien
// ausgelagert, die data:-URIs im JSON durch root-relative Pfade ersetzt, und ein
// Manifest gepflegt, das der Demo-Picker im Dashboard liest.
//
// Warum das geht ohne Loader-Änderung: das Frontend setzt überall
// `img.src = <…>.dataUrl`. Ein <img src> akzeptiert einen Pfad genauso wie eine
// data:-URI. Wir ersetzen also nur die langen data:-Strings durch kurze Pfade;
// hydrateImages, restoreBildChronik und die Bild-Chronik laufen unverändert.
//
// WebP: ist `sharp` installiert (npm i -D sharp), werden Bilder auf max. 1024 px
// herunterskaliert und als WebP gespeichert (deutlich kleiner). Fehlt sharp,
// werden die Originalbytes 1:1 ausgelagert (Format aus dem MIME-Typ).
//
// Aufruf:
//   node tools/prepare-demo.mjs <input.json> <slug> ["Titel"]
// Beispiel:
//   node tools/prepare-demo.mjs ~/Downloads/realmcraft-die-gestrandeten.json die-gestrandeten "Die Gestrandeten"
// =============================================================================

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEMO_DIR = path.join(REPO_ROOT, 'examples', 'demo');

// sharp optional laden — fehlt es, fallen wir auf Rohbytes zurück.
let sharp = null;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  sharp = null;
}

const MAX_PX = 1024;     // Längere Kante beim Downscale (nur mit sharp)
const WEBP_QUALITY = 72; // WebP-Qualität (nur mit sharp)

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function parseDataUrl(s) {
  // data:[<mime>][;base64],<daten>
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(s);
  if (!m) return null;
  const mime = (m[1] || 'application/octet-stream').toLowerCase();
  const isB64 = !!m[2];
  const data = m[3];
  const buf = isB64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data), 'utf8');
  return { mime, buf };
}

// Wandelt einen Bild-Buffer um (WebP+Downscale via sharp) oder gibt ihn roh
// zurück. Liefert { buf, ext }.
async function transformImage(buf, mime) {
  if (sharp && mime.startsWith('image/')) {
    try {
      const out = await sharp(buf)
        .rotate() // EXIF-Orientierung anwenden
        .resize({ width: MAX_PX, height: MAX_PX, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();
      return { buf: out, ext: 'webp' };
    } catch {
      // Fällt unten auf Rohbytes zurück.
    }
  }
  return { buf, ext: EXT_BY_MIME[mime] || 'bin' };
}

async function main() {
  const [inputArg, slugArg, titelArg] = process.argv.slice(2);
  if (!inputArg || !slugArg) {
    console.error('Aufruf: node tools/prepare-demo.mjs <input.json> <slug> ["Titel"]');
    process.exit(2);
  }
  const slug = slugArg.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  const inputPath = path.resolve(inputArg.replace(/^~(?=$|[/\\])/, process.env.HOME || process.env.USERPROFILE || '~'));

  const raw = await readFile(inputPath, 'utf8');
  const state = JSON.parse(raw);

  const slugDir = path.join(DEMO_DIR, slug);
  const bilderDir = path.join(slugDir, 'bilder');
  // Bilder-Ordner frisch aufsetzen, damit alte Reste nicht liegen bleiben.
  if (existsSync(bilderDir)) await rm(bilderDir, { recursive: true, force: true });
  await mkdir(bilderDir, { recursive: true });

  // Inhalts-Dedup: gleiche Bildbytes nur einmal schreiben (das gewählte Bild
  // steckt am Entity UND in der bildChronik — sonst doppelt).
  const byContent = new Map(); // sha1(rohbytes) -> rel. Pfad
  let written = 0, bytesOut = 0, reused = 0, dataUrls = 0;

  async function handleDataUrl(s) {
    dataUrls++;
    const parsed = parseDataUrl(s);
    if (!parsed) return s;
    const srcHash = createHash('sha1').update(parsed.buf).digest('hex').slice(0, 16);
    if (byContent.has(srcHash)) {
      reused++;
      return byContent.get(srcHash);
    }
    const { buf, ext } = await transformImage(parsed.buf, parsed.mime);
    const fileName = `${srcHash}.${ext}`;
    await writeFile(path.join(bilderDir, fileName), buf);
    written++; bytesOut += buf.length;
    // Root-relativer Pfad: das Dashboard wird auf Repo-Root ausgeliefert.
    const rel = `examples/demo/${slug}/bilder/${fileName}`;
    byContent.set(srcHash, rel);
    return rel;
  }

  // JSON rekursiv durchlaufen und data:-URIs (egal in welchem Feld) ersetzen.
  async function walk(node) {
    if (typeof node === 'string') {
      return node.startsWith('data:') ? await handleDataUrl(node) : node;
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) node[i] = await walk(node[i]);
      return node;
    }
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) node[k] = await walk(node[k]);
      return node;
    }
    return node;
  }

  await walk(state);

  await mkdir(slugDir, { recursive: true });
  const statePath = path.join(slugDir, 'state.json');
  const stateJson = JSON.stringify(state, null, 2);
  await writeFile(statePath, stateJson, 'utf8');

  // Manifest pflegen (anlegen oder Eintrag aktualisieren).
  const manifestPath = path.join(DEMO_DIR, 'manifest.json');
  let manifest = { default: null, staende: [] };
  if (existsSync(manifestPath)) {
    try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { /* neu schreiben */ }
  }
  if (!Array.isArray(manifest.staende)) manifest.staende = [];

  const titel = titelArg
    || state?.meta?.spielname
    || state?.volk?.name
    || slug;
  const eintrag = {
    slug,
    titel,
    pfad: `examples/demo/${slug}/state.json`,
    bilder: written,
    kapitel: state?.meta?.kapitel ?? null,
    jahreszeit: state?.meta?.zeit?.jahreszeit ?? null,
    jahr: state?.meta?.zeit?.jahr ?? null,
  };
  const idx = manifest.staende.findIndex((e) => e.slug === slug);
  if (idx >= 0) manifest.staende[idx] = eintrag;
  else manifest.staende.push(eintrag);
  if (!manifest.default) manifest.default = slug;

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  const mb = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';
  console.log(`Demo-Stand "${titel}" (${slug}) erstellt.`);
  console.log(`  sharp/WebP:        ${sharp ? 'ja (max ' + MAX_PX + 'px, q' + WEBP_QUALITY + ')' : 'NEIN — Rohbytes ausgelagert'}`);
  console.log(`  data:-URIs gesehen: ${dataUrls}`);
  console.log(`  Bilddateien:        ${written} geschrieben, ${reused} dedupliziert`);
  console.log(`  Bilder gesamt:      ${mb(bytesOut)}`);
  console.log(`  state.json:         ${mb(Buffer.byteLength(stateJson))}`);
  console.log(`  -> ${path.relative(REPO_ROOT, statePath)}`);
  console.log(`  -> ${path.relative(REPO_ROOT, manifestPath)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

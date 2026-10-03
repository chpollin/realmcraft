// tools/generate-demo-images.mjs
// =============================================================================
// Erzeugt serverseitig alle Bilder eines Demo-Standes über die Gemini-Bild-API
// (Prompts, Seitenverhältnisse und Zielfelder aus js/images/registry.js),
// skaliert sie auf WebP (max 1024px, q72) und verdrahtet die Dateipfade in
// examples/demo/<slug>/state.json. Aktualisiert die Bilderzahl im Manifest.
//
// Der API-Key kommt aus .env (GEMINI_API_KEY) — er wird nur gelesen, NIE geloggt
// oder committet. Die erzeugten .webp-Dateien werden committet, der Key nicht.
//
// Aufruf:  node tools/generate-demo-images.mjs <slug>
// Beispiel: node tools/generate-demo-images.mjs die-karren
// =============================================================================

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { MODELS, generateImage } from '../js/images/gemini.js';
import { BILDTYPEN } from '../js/images/registry.js';
import { REPO, readApiKey, referenzBilder } from './lib.mjs';

const MAX_PX = 1024, WEBP_Q = 72;

let sharp = null;
try { ({ default: sharp } = await import('sharp')); } catch { sharp = null; }

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

async function genWithRetry({ apiKey, model, prompt, aspectRatio, refImages, label }) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { dataUrl } = await generateImage({ apiKey, model, prompt, aspectRatio, refImages });
      return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    } catch (e) {
      const last = attempt === 3;
      console.log(`    Versuch ${attempt} fehlgeschlagen (${label}): ${e.message}`);
      if (last) throw e;
      // gemini.js reports HTTP 429 as a quota message; give the rate limit time.
      sleep(/Kontingent/.test(e.message) ? 20000 : 4000);
    }
  }
}

async function toWebp(buf) {
  if (!sharp) return { buf, ext: 'jpg' };
  const out = await sharp(buf).rotate()
    .resize({ width: MAX_PX, height: MAX_PX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_Q }).toBuffer();
  return { buf: out, ext: 'webp' };
}

async function main() {
  const slug = (process.argv[2] || '').trim();
  if (!slug) { console.error('Aufruf: node tools/generate-demo-images.mjs <slug>'); process.exit(2); }
  const apiKey = await readApiKey();
  if (!apiKey) { console.error('Kein GEMINI_API_KEY in .env gefunden.'); process.exit(2); }
  console.log('API-Key geladen:', apiKey ? `ja (…${apiKey.slice(-4)})` : 'nein');
  console.log('sharp/WebP:', sharp ? 'ja' : 'NEIN (Rohbytes)');

  const slugDir = path.join(REPO, 'examples', 'demo', slug);
  const bilderDir = path.join(slugDir, 'bilder');
  const statePath = path.join(slugDir, 'state.json');
  if (!existsSync(statePath)) { console.error('state.json fehlt:', statePath); process.exit(2); }
  await mkdir(bilderDir, { recursive: true });
  const state = JSON.parse(await readFile(statePath, 'utf8'));

  // Work list from the registry the dashboard uses, so demo images match a
  // click in the UI. done holds the already embedded path, if any.
  const jobs = [];
  for (const typ of ['berater', 'macht', 'gruppe']) {
    const def = BILDTYPEN[typ];
    for (const e of def.list(state)) {
      const done = def.embedded(e, state);
      jobs.push({ label: `${typ}:${e.name}`, typ, e, model: MODELS[def.role], prompt: def.prompt(e, state), ar: def.aspect,
        done: typeof done === 'string' ? done : null,
        set: (p) => def.setEmbedded(e, p) });
    }
  }
  if (state.karte && (state.karte.prompt || '').trim()) {
    jobs.push({ label: 'karte', typ: 'karte', e: state.karte, model: MODELS.map, prompt: state.karte.prompt.trim(), ar: '16:9',
      done: typeof state.karte.dataUrl === 'string' ? state.karte.dataUrl : null,
      set: (p) => { state.karte.dataUrl = p; } });
  }

  // Bereits vorhandene Bilder überspringen (idempotenter Nachlauf nach Fehlern):
  // ein Job gilt als erledigt, wenn sein Ziel-Feld schon einen lokalen Pfad auf
  // eine existierende Datei trägt. process.argv[3] === '--force' erzwingt neu.
  const force = process.argv[3] === '--force';

  console.log(`Zu erzeugen: ${jobs.length} Bilder für "${slug}"${force ? ' (--force)' : ''}\n`);
  let ok = 0, fail = 0, skip = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    if (!force && j.done) {
      const existing = path.join(REPO, j.done);
      if (typeof j.done === 'string' && j.done.startsWith('examples/demo/') && existsSync(existing)) {
        skip++;
        console.log(`[${i + 1}/${jobs.length}] ${j.label} … übersprungen (vorhanden)`);
        continue;
      }
    }
    process.stdout.write(`[${i + 1}/${jobs.length}] ${j.label} … `);
    try {
      const raw = await genWithRetry({ apiKey, model: j.model, prompt: j.prompt, aspectRatio: j.ar, refImages: await referenzBilder(j.typ, j.e), label: j.label });
      const { buf, ext } = await toWebp(raw);
      const hash = createHash('sha1').update(buf).digest('hex').slice(0, 16);
      const file = `${hash}.${ext}`;
      await writeFile(path.join(bilderDir, file), buf);
      const rel = `examples/demo/${slug}/bilder/${file}`;
      j.set(rel);
      ok++;
      console.log(`ok (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      fail++;
      console.log(`FEHLER: ${e.message}`);
    }
    sleep(1500); // sanfter Abstand gegen Rate-Limits
  }

  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');

  // Manifest-Bilderzahl aktualisieren.
  const manPath = path.join(REPO, 'examples', 'demo', 'manifest.json');
  try {
    const man = JSON.parse(await readFile(manPath, 'utf8'));
    const cnt = (await readdir(bilderDir)).filter((f) => /\.(webp|jpg|png)$/i.test(f)).length;
    const e = (man.staende || []).find((x) => x.slug === slug);
    if (e) { e.bilder = cnt; await writeFile(manPath, JSON.stringify(man, null, 2), 'utf8'); }
  } catch { /* Manifest optional */ }

  console.log(`\nFertig: ${ok} ok, ${skip} übersprungen, ${fail} fehlgeschlagen. state.json aktualisiert.`);
  if (fail) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });

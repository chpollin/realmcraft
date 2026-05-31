// tools/generate-demo-images.mjs
// =============================================================================
// Erzeugt serverseitig alle Bilder eines Demo-Standes über die Gemini-Bild-API
// (gleiche Prompts/Modelle wie das Dashboard), skaliert sie auf WebP (max 1024px,
// q72) und verdrahtet die Dateipfade in examples/demo/<slug>/state.json. Aktualisiert
// die Bilderzahl im Manifest.
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
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'gemini-3.1-flash-image';
const MAX_PX = 1024, WEBP_Q = 72;

let sharp = null;
try { ({ default: sharp } = await import('sharp')); } catch { sharp = null; }

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

async function readEnvKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const envPath = path.join(REPO, '.env');
  if (!existsSync(envPath)) return '';
  const raw = await readFile(envPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = /^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/.exec(line);
    if (m) return m[1].replace(/^["']|["']$/g, '').trim();
  }
  return '';
}

// --- Prompt-Bau, portiert aus js/app.js (muss inhaltlich übereinstimmen) ---
const NEG_PORTRAIT = 'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen';
const NEG_SZENE = 'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen';
const join = (arr) => arr.map((s) => (s || '').trim()).filter(Boolean).join('. ');
const region = (s) => (s.volk?.region?.name || s.volk?.name || '').trim();
const visualStyle = (s) => (s.meta?.visualStyle || '').trim();
const armeeStyle = (s) => (s.meta?.armeeStyle || s.meta?.visualStyle || '').trim();

function buildPortraitPrompt(b, s) {
  return join([
    visualStyle(s),
    'Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie',
    [b.name, b.rolle].filter(Boolean).join(', '),
    (b.erscheinung || '').trim(),
    region(s) ? `aus ${region(s)}` : '',
    NEG_PORTRAIT,
  ]);
}
function buildMachtPrompt(m, s) {
  return join([
    armeeStyle(s),
    'ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing',
    [m.name, m.typ].filter(Boolean).join(', '),
    (m.erscheinung || '').trim(),
    m.haltung ? `Haltung: ${m.haltung}` : '',
    NEG_SZENE,
  ]);
}
function buildGruppePrompt(gr, s) {
  const sp = (s.berater || []).find((b) => b.id === gr.sprecherId)
    || (s.personen || []).find((p) => p.id === gr.sprecherId);
  return join([
    armeeStyle(s),
    'eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum',
    gr.name || '',
    gr.kompetenz ? `Wirken: ${gr.kompetenz}` : '',
    sp ? `Sprecher: ${sp.name}` : '',
    region(s) ? `aus ${region(s)}` : '',
    NEG_PORTRAIT,
  ]);
}

// --- Gemini-Call, portiert aus js/images/gemini.js ---
async function generateImage(apiKey, prompt, aspectRatio) {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}) },
  };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* ignore */ }
    const err = new Error(`HTTP ${res.status}. ${detail}`.trim());
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const part = parts.find((p) => p.inlineData || p.inline_data);
  const inline = part?.inlineData || part?.inline_data;
  if (!inline?.data) throw new Error('Keine Bilddaten in der Antwort.');
  return Buffer.from(inline.data, 'base64');
}

async function genWithRetry(apiKey, prompt, aspectRatio, label) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await generateImage(apiKey, prompt, aspectRatio);
    } catch (e) {
      const last = attempt === 3;
      console.log(`    Versuch ${attempt} fehlgeschlagen (${label}): ${e.message}`);
      if (last) throw e;
      sleep(e.status === 429 ? 20000 : 4000);
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
  const apiKey = await readEnvKey();
  if (!apiKey) { console.error('Kein GEMINI_API_KEY in .env gefunden.'); process.exit(2); }
  console.log('API-Key geladen:', apiKey ? `ja (…${apiKey.slice(-4)})` : 'nein');
  console.log('sharp/WebP:', sharp ? 'ja' : 'NEIN (Rohbytes)');

  const slugDir = path.join(REPO, 'examples', 'demo', slug);
  const bilderDir = path.join(slugDir, 'bilder');
  const statePath = path.join(slugDir, 'state.json');
  if (!existsSync(statePath)) { console.error('state.json fehlt:', statePath); process.exit(2); }
  await mkdir(bilderDir, { recursive: true });
  const state = JSON.parse(await readFile(statePath, 'utf8'));

  // Arbeitsliste: { label, prompt, aspectRatio, set(pathRel) }
  const jobs = [];
  for (const b of state.berater || []) {
    jobs.push({ label: `berater:${b.name}`, prompt: buildPortraitPrompt(b, state), ar: '4:3',
      done: typeof b.portrait?.dataUrl === 'string' ? b.portrait.dataUrl : null,
      set: (p) => { b.portrait = { ...(b.portrait || {}), dataUrl: p }; } });
  }
  for (const m of state.maechte || []) {
    jobs.push({ label: `macht:${m.name}`, prompt: buildMachtPrompt(m, state), ar: '4:3',
      done: typeof m.bild?.dataUrl === 'string' ? m.bild.dataUrl : null,
      set: (p) => { m.bild = { ...(m.bild || {}), dataUrl: p }; } });
  }
  for (const gr of state.gruppen || []) {
    jobs.push({ label: `gruppe:${gr.name}`, prompt: buildGruppePrompt(gr, state), ar: '4:3',
      done: typeof gr.bild?.dataUrl === 'string' ? gr.bild.dataUrl : null,
      set: (p) => { gr.bild = { ...(gr.bild || {}), dataUrl: p }; } });
  }
  if (state.karte && (state.karte.prompt || '').trim()) {
    jobs.push({ label: 'karte', prompt: state.karte.prompt.trim(), ar: '16:9',
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
      const raw = await genWithRetry(apiKey, j.prompt, j.ar, j.label);
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

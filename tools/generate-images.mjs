// tools/generate-images.mjs — erzeugt alle Bilder eines Speicherstands über die
// Gemini-API und bettet sie als base64 (data:-URL) in die Felder ein, die das
// Dashboard beim Laden liest (hydrateImages). So bekommt der veröffentlichte
// Beispielstand seine Bilder, ohne dass ein Besucher einen eigenen Key braucht.
//
// Aufruf:  node tools/generate-images.mjs [eingabe.json] [ausgabe.json]
// Default: savegame.json -> examples/die-gestrandeten.json
// Key:     GEMINI_API_KEY aus der Umgebung oder aus .env im Repo-Root.
//
// Die Prompt-Bauer sind bewusste Kopien aus js/app.js, damit die erzeugten
// Bilder denen entsprechen, die ein Klick im UI erzeugen würde. Ändert sich dort
// ein Prompt, hier nachziehen.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = 'gemini-3.1-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const INPUT = process.argv[2] || join(ROOT, 'savegame.json');
const OUTPUT = process.argv[3] || join(ROOT, 'examples', 'die-gestrandeten.json');

const NEG = 'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen';
const NEG_FIG = 'kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen';

const join2 = (arr) => arr.map((s) => (s || '').trim()).filter(Boolean).join('. ');
const region = (st) => (st.volk?.region?.name || st.volk?.name || '').trim();
const armeeStyle = (st) => (st.meta?.armeeStyle || st.meta?.visualStyle || '').trim();

function buildPortraitPrompt(b, st) {
  return join2([
    (st.meta?.visualStyle || '').trim(),
    'Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie',
    join2([[b.name, b.rolle].filter(Boolean).join(', '), (b.erscheinung || '').trim()]),
    region(st) ? `aus ${region(st)}` : '',
    NEG_FIG,
  ]);
}
function buildHeerschauPrompt(st) {
  const a = st.armee || {};
  const truppen = (a.verbaende || [])
    .map((v) => [v.name, v.typ].filter(Boolean).join(' ('))
    .map((s) => (s.includes('(') ? `${s})` : s)).join(', ');
  return join2([
    armeeStyle(st),
    'weite Heerschau, eine aufgestellte Streitmacht in der Landschaft, mehrere Gruppen, dokumentarische Totale, kein einzelner Held',
    truppen ? `die Verbaende: ${truppen}` : '',
    a.moral ? `Stimmung: ${a.moral}` : '',
    (st.volk?.erscheinung || '').trim(),
    region(st) ? `aus ${region(st)}` : '',
    NEG,
  ]);
}
function buildVerbandPrompt(v, st) {
  const beraterById = Object.fromEntries((st.berater || []).map((b) => [b.id, b]));
  const fuehrer = v.fuehrungId && beraterById[v.fuehrungId] ? beraterById[v.fuehrungId].name : '';
  return join2([
    armeeStyle(st),
    'eine kleine Gruppe Krieger desselben Verbandes, Dreiviertelansicht, dokumentarisch, leicht aus der Mitte, schlichter Hintergrund, natuerliche Asymmetrie',
    [v.name, v.typ].filter(Boolean).join(', '),
    v.ausruestung ? `Ausruestung: ${v.ausruestung}` : '',
    v.verfassung ? `Verfassung: ${v.verfassung}` : '',
    fuehrer ? `gefuehrt von ${fuehrer}` : '',
    region(st) ? `aus ${region(st)}` : '',
    NEG_FIG,
  ]);
}
function buildMachtPrompt(m, st) {
  return join2([
    armeeStyle(st),
    'ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing',
    [m.name, m.typ].filter(Boolean).join(', '),
    (m.erscheinung || '').trim(),
    m.haltung ? `Haltung: ${m.haltung}` : '',
    NEG,
  ]);
}
function buildGruppePrompt(gr, st) {
  const sp = (st.berater || []).find((b) => b.id === gr.sprecherId)
    || (st.personen || []).find((p) => p.id === gr.sprecherId);
  return join2([
    armeeStyle(st),
    'eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum',
    gr.name || '',
    gr.kompetenz ? `Wirken: ${gr.kompetenz}` : '',
    sp ? `Sprecher: ${sp.name}` : '',
    region(st) ? `aus ${region(st)}` : '',
    NEG_FIG,
  ]);
}
function buildSiedlungPrompt(s, st) {
  if (s.prompt && s.prompt.trim()) return s.prompt.trim();
  return join2([
    armeeStyle(st),
    'ein weiter Blick auf die Siedlung eines Volkes, dokumentarische Totale, Behausungen und Menschen im Alltag, kein einzelner Held, kein heroisches Posing',
    [s.name, s.typ].filter(Boolean).join(', '),
    (s.beschreibung || s.lage || '').trim(),
    region(st) ? `aus ${region(st)}` : '',
    NEG,
  ]);
}

async function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  try {
    const raw = await readFile(join(ROOT, '.env'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*GEMINI_API_KEY\s*=\s*(.*)\s*$/);
      if (m && !line.trimStart().startsWith('#')) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* keine .env */ }
  return '';
}

async function generate(apiKey, prompt, aspectRatio) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}) },
  });
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const json = await res.json();
  const inline = (json?.candidates?.[0]?.content?.parts ?? []).find((p) => p && p.inlineData)?.inlineData;
  if (!inline?.data) throw new Error('Antwort ohne Bild (kein inlineData).');
  return `data:${inline.mimeType || 'image/png'};base64,${inline.data}`;
}

async function main() {
  const apiKey = await loadKey();
  if (!apiKey) {
    console.error('Kein GEMINI_API_KEY (Umgebung oder .env). Abbruch.');
    process.exit(1);
  }
  const st = JSON.parse(await readFile(INPUT, 'utf8'));

  // Arbeitsliste: jeder Eintrag erzeugt ein Bild und legt es an seiner Stelle ab.
  const jobs = [];
  for (const b of st.berater || []) {
    jobs.push({ label: `Berater: ${b.name}`, ratio: '4:3', prompt: buildPortraitPrompt(b, st),
      put: (url) => { b.portrait = { ...(b.portrait || {}), dataUrl: url }; } });
  }
  if (st.karte?.prompt) {
    jobs.push({ label: 'Karte', ratio: '16:9', prompt: st.karte.prompt,
      put: (url) => { st.karte.dataUrl = url; } });
  }
  if (st.armee) {
    jobs.push({ label: 'Heerschau', ratio: '16:9', prompt: buildHeerschauPrompt(st),
      put: (url) => { st.armee.bild = { ...(st.armee.bild || {}), dataUrl: url }; } });
    for (const v of st.armee.verbaende || []) {
      jobs.push({ label: `Verband: ${v.name}`, ratio: '4:3', prompt: buildVerbandPrompt(v, st),
        put: (url) => { v.avatar = { ...(v.avatar || {}), dataUrl: url }; } });
    }
  }
  for (const m of st.maechte || []) {
    jobs.push({ label: `Macht: ${m.name}`, ratio: '4:3', prompt: buildMachtPrompt(m, st),
      put: (url) => { m.bild = { ...(m.bild || {}), dataUrl: url }; } });
  }
  for (const gr of st.gruppen || []) {
    jobs.push({ label: `Gruppe: ${gr.name}`, ratio: '4:3', prompt: buildGruppePrompt(gr, st),
      put: (url) => { gr.bild = { ...(gr.bild || {}), dataUrl: url }; } });
  }
  for (const s of st.lebenswelt?.siedlungen || []) {
    jobs.push({ label: `Siedlung: ${s.name}`, ratio: '16:9', prompt: buildSiedlungPrompt(s, st),
      put: (url) => { s.bild = { ...(s.bild || {}), dataUrl: url }; } });
  }

  console.log(`${jobs.length} Bilder zu erzeugen (Modell ${MODEL}).`);
  let ok = 0, fail = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    process.stdout.write(`[${i + 1}/${jobs.length}] ${j.label} … `);
    try {
      const url = await generate(apiKey, j.prompt, j.ratio);
      j.put(url);
      ok++;
      console.log('ok');
    } catch (e) {
      fail++;
      console.log(`FEHLER: ${e.message}`);
    }
  }

  await writeFile(OUTPUT, JSON.stringify(st, null, 2) + '\n');
  const mb = (Buffer.byteLength(JSON.stringify(st)) / 1024 / 1024).toFixed(2);
  console.log(`\nFertig: ${ok} erzeugt, ${fail} fehlgeschlagen. Geschrieben nach ${OUTPUT} (${mb} MB).`);
}

main().catch((e) => { console.error(e); process.exit(1); });

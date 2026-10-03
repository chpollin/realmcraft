// tools/generate-images.mjs — generates every image of a savegame through the
// Gemini API and embeds it as base64 (data URL) in the fields the dashboard
// reads when loading. That way the published sample carries its images and a
// visitor needs no own key.
//
// Usage:   node tools/generate-images.mjs [input.json] [output.json]
// Default: savegame.json -> examples/die-gestrandeten.json
// Key:     GEMINI_API_KEY from the environment or from .env in the repo root.
//
// Prompts, aspect ratios and target fields come from js/images/registry.js,
// the same table the dashboard uses, so a tool run matches a click in the UI.

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MODELS, generateImage } from '../js/images/gemini.js';
import { BILDTYPEN } from '../js/images/registry.js';
import { REPO, readApiKey, referenzBilder } from './lib.mjs';

const INPUT = process.argv[2] || join(REPO, 'savegame.json');
const OUTPUT = process.argv[3] || join(REPO, 'examples', 'die-gestrandeten.json');

async function main() {
  const apiKey = await readApiKey();
  if (!apiKey) {
    console.error('Kein GEMINI_API_KEY (Umgebung oder .env). Abbruch.');
    process.exit(1);
  }
  const st = JSON.parse(await readFile(INPUT, 'utf8'));

  // Work list: each job generates one image and stores it in place.
  const jobs = [];
  const add = (typ, label) => {
    const def = BILDTYPEN[typ];
    for (const e of def.list(st)) {
      jobs.push({ label: label(e), typ, e, model: MODELS[def.role], ratio: def.aspect, prompt: def.prompt(e, st),
        put: (url) => def.setEmbedded(e, url) });
    }
  };
  add('berater', (b) => `Berater: ${b.name}`);
  // The map from karte.prompt, also when a map chronicle exists: the
  // dashboard shows karte.dataUrl as the image of aktuellerStand.
  if (st.karte?.prompt) {
    jobs.push({ label: 'Karte', typ: 'karte', e: st.karte, model: MODELS.map, ratio: '16:9', prompt: st.karte.prompt,
      put: (url) => { st.karte.dataUrl = url; } });
  }
  add('armee', () => 'Heerschau');
  add('verband', (v) => `Verband: ${v.name}`);
  add('macht', (m) => `Macht: ${m.name}`);
  add('gruppe', (g) => `Gruppe: ${g.name}`);
  add('siedlung', (s) => `Siedlung: ${s.name}`);

  console.log(`${jobs.length} Bilder zu erzeugen.`);
  let ok = 0, fail = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    process.stdout.write(`[${i + 1}/${jobs.length}] ${j.label} … `);
    try {
      const refImages = await referenzBilder(j.typ, j.e);
      const { dataUrl } = await generateImage({ apiKey, model: j.model, prompt: j.prompt, aspectRatio: j.ratio, refImages });
      j.put(dataUrl);
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

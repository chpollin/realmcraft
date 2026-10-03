// E2E: image flow per type through the image registry, version export and the
// map chronicle round trip. The Gemini API is always mocked via page.route.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  test, expect, isolate, REPO_ROOT, FIXTURE_JSON, FIXTURE_CH4_JSON, MOCK_PIXEL,
  loadFile, loadContent, waitForLoaded, setApiKey,
} from './_helpers.js';

// The demo state carries every image type. Embedded images and the version
// chronicle are stripped so each type starts without an image; the settlement
// gets a quote in its name (its id) to exercise selector escaping.
async function demoOhneBilder() {
  const raw = await readFile(path.join(REPO_ROOT, 'examples', 'demo', 'die-gestrandeten', 'state.json'), 'utf8');
  const state = JSON.parse(raw, (k, v) => (k === 'dataUrl' || k === 'bildChronik' ? undefined : v));
  state.lebenswelt.siedlungen[0].name = 'Grau"landung';
  delete state.lebenswelt.siedlungen[0].id;
  return state;
}

// Mock that records request bodies and answers each call with its own image,
// so tests can tell the base image from a continued version.
async function mockApi(page, { delayMs = 0 } = {}) {
  const api = { count: 0, bodies: [] };
  await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
    api.count += 1;
    api.bodies.push(JSON.parse(route.request().postData() || '{}'));
    const data = api.count === 1 ? MOCK_PIXEL : Buffer.from(`bild-${api.count}`).toString('base64');
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data } }] } }] }),
    });
  });
  return api;
}

async function exportBundle(page) {
  const download = page.waitForEvent('download');
  await page.getByTestId('export-btn').click();
  return JSON.parse(await readFile(await (await download).path(), 'utf8'));
}

// A second browser context: empty cache and storage, isolated like the fixture page.
async function frischeSeite(browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await isolate(page);
  return { context, page };
}

const tab = (page, name) => page.locator(`[data-tab="${name}"]`).click();
const DATA_URL = /^data:image\/png;base64,/;

const SCHRITTE = [
  { tab: 'berater', scope: 'advisor-card', btn: 'generate-portrait', img: 'advisor-portrait' },
  { tab: 'armee', btn: 'generate-armee-bild', img: 'armee-bild' },
  { tab: 'armee', scope: 'verband', btn: 'generate-verband', img: 'verband-avatar' },
  { tab: 'welt', scope: 'power-card', btn: 'generate-macht', img: 'power-bild' },
  { tab: 'welt', scope: 'group-row', btn: 'generate-gruppe', img: 'gruppe-bild' },
  { tab: 'lebenswelt', scope: 'siedlung', btn: 'generate-siedlung', img: 'siedlung-bild' },
  { tab: 'karte', btn: 'generate-map', img: 'map-image' },
  { tab: 'historie', btn: 'generate-ereignisbild', img: 'ereignis-bild' },
];
const bereich = (page, s) => (s.scope ? page.getByTestId(s.scope).first() : page);

test('every image type generates once and reloads from the cache without a request', async ({ page }) => {
  await page.goto('/');
  await loadContent(page, { name: 'demo.json', mimeType: 'application/json', content: JSON.stringify(await demoOhneBilder()) });
  await waitForLoaded(page);
  const api = await mockApi(page);
  await setApiKey(page);

  for (const s of SCHRITTE) {
    await tab(page, s.tab);
    await bereich(page, s).getByTestId(s.btn).first().click();
    await expect(bereich(page, s).getByTestId(s.img).first(), s.img).toHaveAttribute('src', /^data:/);
  }
  expect(api.count).toBe(SCHRITTE.length);

  await page.reload();
  await waitForLoaded(page);
  for (const s of SCHRITTE) {
    await tab(page, s.tab);
    await expect(bereich(page, s).getByTestId(s.img).first(), s.img).toHaveAttribute('src', /^data:/);
  }
  expect(api.count).toBe(SCHRITTE.length);
});

test('a double click on generate pays once and marks the button busy', async ({ page }) => {
  await page.goto('/');
  await loadFile(page, FIXTURE_CH4_JSON);
  await waitForLoaded(page);
  const api = await mockApi(page, { delayMs: 800 });
  await setApiKey(page);

  await tab(page, 'berater');
  const card = page.getByTestId('advisor-card').first();
  const btn = card.getByTestId('generate-portrait');
  await btn.dblclick();
  await expect(btn).toHaveAttribute('aria-busy', 'true');
  await btn.click();
  await expect(card.getByTestId('advisor-portrait')).toHaveAttribute('src', DATA_URL);
  await expect(btn).not.toHaveAttribute('aria-busy', 'true');
  expect(api.count).toBe(1);
});

test('Bild fortschreiben keeps the delta banner and exports the version chronicle', async ({ page, browser }) => {
  await page.goto('/');
  await loadFile(page, FIXTURE_JSON);
  await loadFile(page, FIXTURE_CH4_JSON);
  await waitForLoaded(page);
  await expect(page.getByTestId('delta-banner')).toHaveCount(1);
  const api = await mockApi(page);
  await setApiKey(page);

  await tab(page, 'berater');
  const card = page.getByTestId('advisor-card').first();
  const id = await card.getAttribute('data-id');
  await card.getByTestId('generate-portrait').click();
  await expect(card.getByTestId('advisor-portrait')).toHaveAttribute('src', DATA_URL);
  await card.getByTestId('bild-fortschreiben').click();
  await expect(page.getByTestId('advisor-card').first().getByTestId('bild-versionen')).toBeVisible();
  expect(api.count).toBe(2);
  // The shown image travels as reference with its real type.
  expect(api.bodies[1].contents[0].parts[1].inlineData).toEqual({ mimeType: 'image/png', data: MOCK_PIXEL });
  await expect(page.getByTestId('delta-banner')).toHaveCount(1);

  const bundle = await exportBundle(page);
  const chronik = bundle.bildChronik?.[`berater:${id}`];
  expect(chronik?.versionen).toHaveLength(1);
  expect(chronik.aktiv).toBe(chronik.versionen[0].key);
  expect(chronik.versionen[0].dataUrl).toBe(`data:image/png;base64,${Buffer.from('bild-2').toString('base64')}`);
  expect(bundle.berater.find((b) => b.id === id).portrait.dataUrl).toBe(chronik.versionen[0].dataUrl);

  const { context, page: fremd } = await frischeSeite(browser);
  const apiFremd = await mockApi(fremd);
  await fremd.goto('/');
  await loadContent(fremd, { name: 'bundle.json', mimeType: 'application/json', content: JSON.stringify(bundle) });
  await waitForLoaded(fremd);
  await tab(fremd, 'berater');
  const fremdCard = fremd.locator(`[data-testid="advisor-card"][data-id="${id}"]`);
  await expect(fremdCard.getByTestId('advisor-portrait')).toHaveAttribute('src', chronik.versionen[0].dataUrl);
  await expect(fremdCard.getByTestId('bild-versionen')).toBeVisible();
  expect(apiFremd.count).toBe(0);
  await context.close();
});

test('map chronicle stands are exported per stand and shown again on import', async ({ page, browser }) => {
  await page.goto('/');
  await loadContent(page, { name: 'demo.json', mimeType: 'application/json', content: JSON.stringify(await demoOhneBilder()) });
  await waitForLoaded(page);
  const api = await mockApi(page);
  await setApiKey(page);

  await tab(page, 'karte');
  const map = page.getByTestId('map-image');
  await page.getByTestId('karte-stand').first().click();
  await page.getByTestId('generate-map').click();
  await expect(map).toHaveAttribute('src', DATA_URL);
  const erstes = await map.getAttribute('src');

  // The second stand builds on the first: its image goes along as reference.
  // The picked stand is now karte-stand-aktiv, so first() is the second stand.
  await page.getByTestId('karte-stand').first().click();
  await page.getByTestId('generate-map').click();
  await expect(map).toHaveAttribute('src', `data:image/png;base64,${Buffer.from('bild-2').toString('base64')}`);
  expect(api.count).toBe(2);
  expect(api.bodies[1].contents[0].parts[1].inlineData).toEqual({ mimeType: 'image/png', data: MOCK_PIXEL });

  const bundle = await exportBundle(page);
  const [s1, s2, s3] = bundle.karte.chronik;
  expect(s1.dataUrl).toBe(erstes);
  expect(s2.dataUrl).toMatch(/^data:image\/png;base64,/);
  expect(s3.dataUrl).toBeUndefined();

  const { context, page: fremd } = await frischeSeite(browser);
  const apiFremd = await mockApi(fremd);
  await fremd.goto('/');
  await loadContent(fremd, { name: 'bundle.json', mimeType: 'application/json', content: JSON.stringify(bundle) });
  await waitForLoaded(fremd);
  await tab(fremd, 'karte');
  await fremd.getByTestId('karte-stand').first().click();
  await expect(fremd.getByTestId('map-image')).toHaveAttribute('src', erstes);
  expect(apiFremd.count).toBe(0);
  await context.close();
});

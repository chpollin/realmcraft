// Language of the Spielbrett: English by default, German through the switch in
// the top bar, applied in place without a reload, remembered per viewer and
// still working when the browser refuses storage.
//
// The campaign lives in a temporary REALMCRAFT_ROOT served by an own serve.mjs,
// as in spielbrett-real.spec.js.
// Run: PLAYWRIGHT_CHANNEL=chrome PORT=4421 SPEC_PORT=4424 npx playwright test --project=e2e tests/e2e/spielbrett-sprache.spec.js

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHochland } from '../fixtures/spielbrett/build.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const CID = 'e2e-sprache';
const FORBIDDEN_PORTS = [4173, 4185, 4186, 4187, 4190];

const json = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));
const de = { ...json('welten/hochland/labels.json').labels, ...json('spielbrett/labels/de.json').labels };
const en = { ...json('welten/hochland/labels.en.json').labels, ...json('spielbrett/labels/en.json').labels };
const regeln = json('welten/hochland/regeln.json');
const season = regeln.calendar.startSeason;
const year = regeln.calendar.startYear;

let root;
let server;
let BASE;

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  // SPEC_PORT pins the port when a run is limited to assigned ports.
  let port = Number(process.env.SPEC_PORT) || await freePort();
  while (FORBIDDEN_PORTS.includes(port)) port = await freePort();
  BASE = `http://localhost:${port}`;
  root = mkdtempSync(join(tmpdir(), 'rc-spielbrett-sprache-'));
  createHochland(root, CID);
  server = spawn(process.execPath, ['serve.mjs'], {
    cwd: REPO,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', REALMCRAFT_ROOT: root },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    server.once('exit', (code) => reject(new Error(`serve.mjs exited (${code})`)));
    server.stdout.on('data', (d) => { if (String(d).includes('dev server')) resolve(); });
  });
});

test.afterAll(() => {
  server?.kill();
  if (root) rmSync(root, { recursive: true, force: true });
});

async function openBoard(page, query = `campaign=${CID}`) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/spielbrett/?${query}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  return errors;
}

const time = (labels, form) => form.replace('{season}', labels[`season.${season}`]).replace('{year}', String(year));

test('the board opens in English', async ({ page }) => {
  const errors = await openBoard(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#zug-beenden .zb-titel')).toHaveText(en['ui.zug-beenden']);
  await expect(page.locator('#zeit')).toHaveText(time(en, en['board.time']));
  await expect(page.locator('#ebenen [data-ebene="gelaende"] .ebene-label')).toHaveText(en['board.layer.gelaende']);
  await expect(page.locator('#karte')).toHaveAttribute('aria-label', en['board.map.label']);
  await expect(page.locator('#sprache [data-lang="en"]')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('the switch turns the board German in place and the choice survives a reload', async ({ page }) => {
  const errors = await openBoard(page);
  await page.evaluate(() => { window.__sameDocument = true; });
  await page.locator('#sprache [data-lang="de"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('#zug-beenden .zb-titel')).toHaveText(de['ui.zug-beenden']);
  await expect(page.locator('#zeit')).toHaveText(time(de, de['board.time']));
  await expect(page.locator('#ebenen [data-ebene="gelaende"] .ebene-label')).toHaveText(de['board.layer.gelaende']);
  await expect(page.locator('#zoom button').first()).toHaveAttribute('aria-label', de['board.zoom.in']);
  await expect(page.locator('#sprache [data-lang="de"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#sprache [data-lang="de"]')).toBeFocused();
  expect(await page.evaluate(() => window.__sameDocument)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('realmcraft.settings')).language)).toBe('de');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('#zug-beenden .zb-titel')).toHaveText(de['ui.zug-beenden']);
  expect(errors).toEqual([]);
});

test('the language is stored beside the other board settings without replacing them', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('realmcraft.settings')) localStorage.setItem('realmcraft.settings', JSON.stringify({ volume: 0.4 }));
  });
  await openBoard(page);
  await page.locator('#sprache [data-lang="de"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('realmcraft.settings')))).toEqual({ volume: 0.4, language: 'de' });
});

test('arrow keys move between the languages', async ({ page }) => {
  await openBoard(page);
  await page.locator('#sprache [data-lang="en"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#sprache [data-lang="en"]')).toBeFocused();
});

test('a selected panel follows the language', async ({ page }) => {
  await openBoard(page);
  const box = await page.locator('#karte').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#kontext')).toBeVisible();
  await expect(page.locator('#kontext .panel-kopf .icon-btn')).toHaveAttribute('aria-label', `${en['board.close.selection']} (Esc)`);
  await page.locator('#sprache [data-lang="de"]').click();
  await expect(page.locator('#kontext')).toBeVisible();
  await expect(page.locator('#kontext .panel-kopf .icon-btn')).toHaveAttribute('aria-label', `${de['board.close.selection']} (Esc)`);
});

test('without storage the board renders in English and still switches', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  const errors = await openBoard(page);
  await expect(page.locator('#zug-beenden .zb-titel')).toHaveText(en['ui.zug-beenden']);
  await page.locator('#sprache [data-lang="de"]').click();
  await expect(page.locator('#zug-beenden .zb-titel')).toHaveText(de['ui.zug-beenden']);
  expect(errors).toEqual([]);
});

// Seals the fixture's turn, so it runs after every test that needs the planning phase.
test('after sealing, the world events panel keeps the resolution phase in the new language', async ({ page }) => {
  const errors = await openBoard(page);
  await page.locator('#zug-beenden').click();
  await page.locator('#dlg-probe [data-wuerfeln]').click();
  await expect(page.locator('#dlg-probe .pe-urteil')).toBeVisible();
  const seal = page.waitForResponse((r) => r.url().endsWith('/api/seal'));
  await page.locator('#dlg-probe .probe-aktionen button:not([hidden])').click();
  expect((await (await seal).json()).ok).toBe(true);
  const phase = (labels) => labels['board.phase.resolving'].replace('{phase}', labels['phase.resolving']);
  await expect(page.locator('#weltgeschehen .phase')).toHaveText(phase(en));
  await page.locator('#sprache [data-lang="de"]').click();
  await expect(page.locator('#weltgeschehen .phase')).toHaveText(phase(de));
  await expect(page.locator('#weltgeschehen #wg-titel')).toHaveText(de['view.weltgeschehen']);
  await expect(page.locator('#zug-beenden .zb-titel')).toHaveText(de['board.endturn.busy']);
  expect(errors).toEqual([]);
});

test('the prototype speaks the chosen language too', async ({ page }) => {
  const errors = await openBoard(page, 'demo');
  await expect(page.locator('#ebenen [data-ebene="besitz"] .ebene-label')).toHaveText(en['board.layer.besitz']);
  await expect(page.locator('#zug-beenden .zb-titel')).toHaveText(en['ui.zug-beenden']);
  await page.locator('#sprache [data-lang="de"]').click();
  await expect(page.locator('#ebenen [data-ebene="besitz"] .ebene-label')).toHaveText(de['board.layer.besitz']);
  expect(errors).toEqual([]);
});

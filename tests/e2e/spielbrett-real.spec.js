// Spielbrett against a real campaign: the board loads the player's projection
// from the server, offers the kernel's orders, previews with the kernel,
// stores rolls in the draft through POST /api/draft and seals the turn
// through POST /api/seal.
//
// The campaign lives in a temporary REALMCRAFT_ROOT. Playwright's webServer
// (playwright.config.mjs) serves the repository root and cannot take a root
// per spec, so this spec starts its own serve.mjs on a free port with that root.
// Run: PLAYWRIGHT_CHANNEL=chrome PORT=4410 npx playwright test --project=e2e tests/e2e/spielbrett-real.spec.js

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHochland } from '../fixtures/spielbrett/build.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const CID = 'e2e-hochland';
const PID = 'bergnomaden';
const FORBIDDEN_PORTS = [4173, 4185, 4186, 4187, 4190];

const json = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));
const labels = json('welten/hochland/labels.json').labels;
const regeln = json('welten/hochland/regeln.json');

let root;
let server;
let BASE;

// A port the OS hands out is free and never one of the operator's servers.
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
  root = mkdtempSync(join(tmpdir(), 'rc-spielbrett-e2e-'));
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

// The assertions read the German labels; English is the board's default language.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('realmcraft.settings', JSON.stringify({ language: 'de' })); } catch { /* storage blocked */ }
  });
});

test.afterAll(() => {
  server?.kill();
  if (root) rmSync(root, { recursive: true, force: true });
});

const viewFile = () => JSON.parse(readFileSync(join(root, 'campaigns', CID, 'view', `${PID}.json`), 'utf8'));

async function openBoard(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/spielbrett/?campaign=${CID}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-campaign', CID);
  return errors;
}

/** The camp sits under the canvas centre at start: the camera opens on the home settlement. */
async function clickCamp(page) {
  const box = await page.locator('#karte').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#kontext')).toBeVisible();
}

test('map and top bar render from the real projection', async ({ page }) => {
  const errors = await openBoard(page);
  const view = viewFile();
  const people = view.peoples[PID];
  const season = regeln.calendar.startSeason;
  await expect(page.locator('#volk-name')).toHaveText(people.name);
  await expect(page.locator('#zeit')).toHaveText(`${labels[`season.${season}`]}, Jahr ${regeln.calendar.startYear}`);
  const firstRes = regeln.resources[0].id;
  await expect(page.locator('#ressourcen .res').first()).toHaveAttribute('aria-label', new RegExp(`^${labels[`resource.${firstRes}`]} ${people.resources[firstRes]}`));
  const camp = view.map.settlements.find((s) => s.people === PID);
  const units = await page.evaluate(() => window.spielbrett.model.units.map((u) => ({ id: u.id, art: u.art, volk: u.volk, tile: `${u.q},${u.r}` })));
  expect(units).toContainEqual({ id: camp.id, art: 'lager', volk: 'spieler', tile: camp.tile });
  const known = await page.evaluate(() => Object.keys(window.spielbrett.model.known).length);
  expect(known).toBe(Object.keys(view.map.known[PID]).length);
  // The canvas carries drawn terrain, not a blank surface; drawing happens on an animation frame.
  await expect.poll(() => page.locator('#karte').evaluate((c) => {
    const ctx = c.getContext('2d');
    const d = ctx.getImageData(Math.floor(c.width / 2) - 20, Math.floor(c.height / 2) - 20, 40, 40).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
    return lit;
  })).toBeGreaterThan(100);
  await expect(page.locator('#zug-beenden')).toHaveAttribute('aria-disabled', 'false');
  expect(errors).toEqual([]);
});

test('selecting the camp shows the kernel orders with the kernel reason', async ({ page }) => {
  await openBoard(page);
  await clickCamp(page);
  await expect(page.locator('#kontext-titel')).toHaveText(viewFile().map.settlements.find((s) => s.people === PID).name);
  const explore = page.locator('#kontext .befehl-option[data-order="explore"]');
  await expect(explore).toHaveAttribute('aria-disabled', 'false');
  const probe = await page.evaluate(() => {
    const g = window.spielbrett.game;
    const home = window.spielbrett.model.home;
    const opt = g.optionsFor({ kind: 'unit', id: home.id, q: home.q, r: home.r }).find((o) => o.type === 'explore');
    return { target: opt.probe.ziel, chance: opt.probe.chance };
  });
  await expect(explore.locator('.probe-tag')).toHaveAttribute('aria-label', new RegExp(`gegen ${probe.target}.*${probe.chance} Prozent`));
  // Founding on the camp's own region is refused by the kernel and shows its reason.
  const found = page.locator('#kontext .befehl-option[data-order="found"]');
  await expect(found).toHaveAttribute('aria-disabled', 'true');
  await expect(found.locator('.bo-grund')).not.toBeEmpty();
});

test('hovering a decision shows the kernel preview deltas in the top bar', async ({ page }) => {
  await openBoard(page);
  await clickCamp(page);
  const minus = page.locator('#kontext .arbeit-zeile[data-arbeit="material"] .icon-btn').first();
  await minus.hover();
  const expected = await page.evaluate(() => {
    const g = window.spielbrett.game;
    const people = g.view.peoples[g.pid];
    const assign = { ...(g.draft.assign ?? people.population.assigned) };
    assign.material -= 1;
    return g.deltasWith((d) => ({ ...d, assign }));
  });
  expect(Object.keys(expected).length).toBeGreaterThan(0);
  for (const [k, d] of Object.entries(expected)) {
    const sign = d > 0 ? `+${d}` : `−${Math.abs(d)}`;
    await expect(page.locator(`#ressourcen .delta[aria-label="Vorschau ${sign}"]`).first()).toBeVisible();
    expect(await page.evaluate((key) => window.spielbrett.model.preview.deltas[key], k)).toBe(d);
  }
  await page.mouse.move(5, 450);
  await expect(page.locator('#ressourcen .delta')).toHaveCount(0);
});

test('rolling the probe stores the roll with the preview fingerprint in the draft', async ({ page }) => {
  await openBoard(page);
  await clickCamp(page);
  await page.locator('#kontext .befehl-option[data-order="explore"]').click();
  await expect(page.locator('#dlg-probe')).toBeVisible();
  await page.locator('#dlg-probe [data-wuerfeln]').click();
  await expect(page.locator('#dlg-probe .pe-urteil')).toBeVisible();
  await page.locator('#dlg-probe .probe-aktionen button:not([hidden])').click();
  await expect(page.locator('#befehle .befehl:not(.ereignis-schritt)')).toHaveCount(1);
  const probe = await page.evaluate(() => window.spielbrett.game.base.probes.find((p) => p.kind === 'explore'));
  await expect.poll(async () => {
    const res = await page.request.get(`${BASE}/api/campaigns/${CID}/draft`);
    return (await res.json()).draft?.rolls?.[probe.id]?.fingerprint ?? null;
  }).toBe(probe.fingerprint);
  const { draft } = await (await page.request.get(`${BASE}/api/campaigns/${CID}/draft`)).json();
  expect(draft.orders).toEqual([{ id: 'o1', type: 'explore', params: { tile: viewFile().map.settlements.find((s) => s.people === PID).tile } }]);
  expect(draft.rolls[probe.id].value).toBeGreaterThanOrEqual(1);
  expect(draft.rolls[probe.id].value).toBeLessThanOrEqual(10);
});

test('ending the turn rolls the world event, seals through the server and locks the board', async ({ page }) => {
  await openBoard(page);
  await expect(page.locator('#befehle .befehl:not(.ereignis-schritt)')).toHaveCount(1);
  await expect(page.locator('#zug-beenden .zb-sub')).toHaveText('1 Wurf offen');
  await page.locator('#zug-beenden').click();
  await expect(page.locator('#dlg-probe')).toBeVisible();
  await expect(page.locator('#dlg-probe [data-probe]')).toHaveAttribute('data-probe', 'T0:bergnomaden:event');
  await page.locator('#dlg-probe [data-wuerfeln]').click();
  await expect(page.locator('#dlg-probe .pe-urteil')).toBeVisible();
  const seal = page.waitForResponse((r) => r.url().endsWith('/api/seal'));
  await page.locator('#dlg-probe .probe-aktionen button:not([hidden])').click();
  expect((await (await seal).json()).ok).toBe(true);
  await expect(page.locator('#zugleiste')).toHaveClass(/is-locked/);
  await expect(page.locator('#zug-beenden .zb-titel')).toHaveText('Regelkern rechnet');
  await expect(page.locator('#weltgeschehen')).toBeVisible();
  expect(viewFile().phase).toBe('resolving');
  await expect(page.locator('#kontext .bo-gesperrt')).toHaveCount(0);
  await clickCamp(page);
  await expect(page.locator('#kontext .bo-gesperrt')).toBeVisible();
});

test('the prototype stays reachable with ?demo', async ({ page }) => {
  await page.goto(`${BASE}/spielbrett/?demo`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('html')).not.toHaveAttribute('data-campaign', /.+/);
  await expect(page.locator('#befehle .befehl:not(.ereignis-schritt)')).toHaveCount(2);
});

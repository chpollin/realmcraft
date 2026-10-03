// Game shell of the Spielbrett: the start screen creates a game through the
// server and the kernel CLI and opens it, the settings persist per viewer,
// the Escape menu leads to settings, rules and back to the start screen, and
// ended campaigns open in their victory or defeat screen, also when the
// campaign ends while the board is open.
//
// Every campaign lives in a temporary REALMCRAFT_ROOT served by an own
// serve.mjs; ended campaigns are crafted through the acceptance driver, which
// reaches the kernel only through engine/cli.mjs.
// Run: PLAYWRIGHT_CHANNEL=chrome PORT=4451 SPEC_PORT=4452 npx playwright test --project=e2e tests/e2e/spielbrett-shell.spec.js

import { test, expect } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCampaign, destinyOf, dice } from '../acceptance/lib/harness.js';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const FORBIDDEN_PORTS = [4173, 4185, 4186, 4187, 4190];

const json = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));
const de = { ...json('welten/hochland/labels.json').labels, ...json('spielbrett/labels/de.json').labels };
const en = { ...json('welten/hochland/labels.en.json').labels, ...json('spielbrett/labels/en.json').labels };

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

const cli = (...args) => JSON.parse(execFileSync(process.execPath, ['engine/cli.mjs', ...args, '--json'], { cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8' }));
const readCampaign = (cid, file) => JSON.parse(readFileSync(join(root, 'campaigns', cid, file), 'utf8'));

function latchAll(state) {
  for (const m of destinyOf(state.peoples[state.campaign.player]).milestones) {
    m.reached = true;
    m.reachedAt = state.turn;
  }
}
const collapse = (state) => { state.peoples[state.campaign.player].population.core = 0; };

/** An ended campaign, played through one season by the acceptance driver. */
function endedCampaign(id, craft, seed) {
  const c = createCampaign({ root, id, craft });
  c.playTurn({ next: dice(seed) });
  return c;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  let port = Number(process.env.SPEC_PORT) || await freePort();
  while (FORBIDDEN_PORTS.includes(port)) port = await freePort();
  BASE = `http://localhost:${port}`;
  root = mkdtempSync(join(tmpdir(), 'rc-spielbrett-shell-'));
  mkdirSync(join(root, '_input'), { recursive: true });
  // The server watches campaigns/ from its start only when the folder exists; it retries otherwise.
  mkdirSync(join(root, 'campaigns'), { recursive: true });
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

async function open(page, query = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/spielbrett/${query}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  return errors;
}

const kernPhase = (page) => page.evaluate(() => window.spielbrett?.model.kernPhase ?? null);

test('a new game starts from the start screen and reaches its first planning view', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await open(page);
  await expect(page.locator('html')).toHaveAttribute('data-shell', 'start');
  await expect(page.locator('.leiste')).toBeHidden();
  await expect(page.locator('#start h1')).toHaveText('RealmCraft');
  // No campaign yet: the new game pane is open and Continue refuses.
  await expect(page.locator('#start-pane-titel')).toHaveText(en['shell.start.new']);
  await expect(page.locator('#start-continue')).toHaveAttribute('aria-disabled', 'true');

  await page.locator('.start-voelker label[data-wert="talbund"]').click();
  await expect(page.locator('#ng-volk-talbund')).toBeChecked();
  await expect(page.locator('#ng-rivale-bergnomaden')).toBeChecked();
  await page.locator('.start-rivale[data-wert="schaedelklan"]').click();
  await expect(page.locator('#ng-rivale-schaedelklan')).not.toBeChecked();
  // The last rival stays: a campaign needs at least one.
  await page.locator('.start-rivale[data-wert="bergnomaden"]').click();
  await expect(page.locator('#ng-rivale-bergnomaden')).toBeChecked();
  await page.locator('.start-option[data-wert="hard"]').click();

  await page.locator('#ng-seed').fill('seven');
  await expect(page.locator('#ng-seed-fehler')).toBeVisible();
  await expect(page.locator('#ng-start')).toHaveAttribute('aria-disabled', 'true');
  await page.locator('#ng-seed-zufall').click();
  await expect(page.locator('#ng-seed')).toHaveValue(/^\d+$/);
  await page.locator('#ng-seed').fill('7');
  await expect(page.locator('#ng-start')).toHaveAttribute('aria-disabled', 'false');

  const created = page.waitForResponse((r) => r.url().endsWith('/api/campaigns') && r.request().method() === 'POST');
  await page.locator('#ng-start').click();
  const res = await created;
  expect(res.status()).toBe(201);
  const { id } = await res.json();
  await page.waitForURL(`**/spielbrett/?campaign=${id}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-campaign', id);
  await expect(page.locator('.leiste')).toBeVisible();

  const view = readCampaign(id, 'view/talbund.json');
  expect(view.people).toBe('talbund');
  expect(Object.keys(view.peoples).sort()).toEqual(['bergnomaden', 'talbund']);
  expect(view.settings).toEqual({ difficulty: 'hard', language: 'en' });
  expect(view.map.seed).toBeDefined();
  expect(JSON.parse(readFileSync(join(root, 'campaigns', 'active.json'), 'utf8')).campaign).toBe(id);

  // A new campaign waits for its first agents' round; the game master opens planning.
  expect(await kernPhase(page)).toBe('agents');
  cli('open', '--campaign', id);
  await expect.poll(() => kernPhase(page), { timeout: 15_000 }).toBe('planning');
  await expect(page.locator('#zug-beenden')).toBeVisible();
  expect(errors).toEqual([]);
});

test('continue lists the campaigns and opens the chosen one', async ({ page }) => {
  await open(page);
  await expect(page.locator('#start-pane-titel')).toHaveText(en['shell.start.continue']);
  const row = page.locator('.kampagne[data-campaign="hochland-1"]');
  await expect(row.locator('.k-name')).toHaveText(readCampaign('hochland-1', 'view/talbund.json').peoples.talbund.name);
  await row.click();
  await page.waitForURL('**/spielbrett/?campaign=hochland-1');
  await expect(page.locator('html')).toHaveAttribute('data-campaign', 'hochland-1');
});

test('settings change language, sound and motion and survive a reload', async ({ page }) => {
  const errors = await open(page);
  await page.locator('#start-settings').click();
  const dlg = page.locator('#dlg-einstellungen');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('h2')).toBeFocused();

  await dlg.locator('[data-lang="de"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(dlg.locator('h2')).toHaveText(de['shell.settings.title']);
  await expect(page.locator('#start-new span')).toHaveText(de['shell.start.new']);
  await expect(dlg.locator('[data-lang="de"]')).toBeFocused();

  await dlg.locator('[data-volume="ambience"]').fill('20');
  await dlg.locator('#einst-stumm').click();
  await expect(dlg.locator('#einst-stumm')).toHaveAttribute('aria-checked', 'true');
  const motion = dlg.locator('#einst-bewegung');
  const was = await motion.getAttribute('aria-checked');
  await motion.click();
  const reduced = was !== 'true';
  await expect(page.locator('html')).toHaveAttribute('data-motion', reduced ? 'reduced' : 'full');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.locator('html')).toHaveAttribute('data-motion', reduced ? 'reduced' : 'full');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('realmcraft.audio')));
  expect(stored).toMatchObject({ ambience: 0.2, muted: true, reduced });
  await page.locator('#start-settings').click();
  await expect(dlg.locator('[data-volume="ambience"]')).toHaveValue('20');
  await expect(dlg.locator('#einst-stumm')).toHaveAttribute('aria-checked', 'true');
  await expect(dlg.locator('[data-lang="de"]')).toHaveAttribute('aria-checked', 'true');
  expect(errors).toEqual([]);
});

test('Escape opens the game menu, which leads to settings, rules and back to the start screen', async ({ page }) => {
  const errors = await open(page, '?campaign=hochland-1');
  const menu = page.locator('#dlg-menu');

  // A selection closes first, then Escape opens the menu.
  const box = await page.locator('#karte').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#kontext')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#kontext')).toBeHidden();
  await expect(menu).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-menu="resume"]')).toBeFocused();
  await expect(menu.locator('[data-menu="result"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  await page.locator('#menu-knopf').click();
  await expect(menu).toBeVisible();
  await menu.locator('[data-menu="settings"]').click();
  await expect(page.locator('#dlg-einstellungen')).toBeVisible();
  await expect(menu).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-menu="settings"]')).toBeFocused();

  await menu.locator('[data-menu="rules"]').click();
  const rules = page.locator('#dlg-regeln');
  await expect(rules).toBeVisible();
  await expect(rules.locator('#regel-pfade')).toHaveText(en['shell.rules.paths']);
  await expect(rules.locator('.regel-pfade li')).toHaveCount(6);
  await expect(rules.locator('#regel-probe')).toHaveText(en['shell.rules.probes']);
  await expect(rules.locator('.regel-band').first().locator('.chance-leiste .chance-feld')).toHaveCount(11);
  await rules.locator('.overlay-kopf .icon-btn').click();
  await expect(menu).toBeVisible();

  await menu.locator('[data-menu="resume"]').click();
  await expect(menu).toBeHidden();
  await expect(page.locator('#dlg-regeln')).toBeHidden();

  await page.keyboard.press('Escape');
  await menu.locator('[data-menu="to-start"]').click();
  await page.waitForURL((url) => !url.search.includes('campaign'));
  await expect(page.locator('html')).toHaveAttribute('data-shell', 'start');
  expect(errors).toEqual([]);
});

test('an ended campaign opens in its victory or defeat screen with the summary', async ({ page }) => {
  test.setTimeout(90_000);
  endedCampaign('e2e-sieg', latchAll, 81);
  endedCampaign('e2e-ende', collapse, 82);

  let errors = await open(page, '?campaign=e2e-sieg');
  const end = page.locator('#dlg-ende');
  await expect(end).toBeVisible();
  await expect(end).toHaveAttribute('data-variant', 'victory');
  await expect(end.locator('h2')).toHaveText(en['shell.end.victory']);
  await expect(end.locator('h2')).toBeFocused();
  const outcome = readCampaign('e2e-sieg', 'view/bergnomaden.json').derived.bergnomaden.outcome;
  await expect(end.locator('[data-wert="destiny"] .ende-zahl')).toHaveText(`${outcome.summary.destiny.of}/${outcome.summary.destiny.of}`);
  await expect(end.locator('[data-wert="turns"] .ende-zahl')).toHaveText(String(outcome.summary.turns));
  await expect(end.locator('.ende-pfade li')).toHaveCount(Object.keys(outcome.summary.achievements).length);
  await expect(end.locator('.ende-hl li')).toHaveCount(outcome.summary.highlights.length);

  await end.locator('[data-ende="brett"]').click();
  await expect(end).toBeHidden();
  // Event cards of the last season may follow the end screen; they close with Escape.
  for (let i = 0; i < 5 && await page.locator('dialog[open]').count(); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  // The world events panel of the agents' phase is open, so the menu button is the direct way.
  await page.locator('#menu-knopf').click();
  await page.locator('#dlg-menu [data-menu="result"]').click();
  await expect(end).toBeVisible();
  await end.locator('[data-ende="chronik"]').click();
  await expect(page.locator('#dlg-chronik')).toBeVisible();
  await expect(end).toBeHidden();
  expect(errors).toEqual([]);

  errors = await open(page, '?campaign=e2e-ende');
  await expect(end).toHaveAttribute('data-variant', 'collapse');
  await expect(end.locator('h2')).toHaveText(en['shell.end.collapse']);
  const name = readCampaign('e2e-ende', 'view/bergnomaden.json').peoples.bergnomaden.name;
  await expect(end.locator('.overlay-kopf .unter')).toHaveText(en['shell.end.collapse.sub'].replace('{people}', name));
  await end.locator('[data-ende="menu"]').click();
  await page.waitForURL((url) => !url.search.includes('campaign'));
  await expect(page.locator('.kampagne[data-campaign="e2e-sieg"] .k-stand')).toHaveAttribute('data-stand', 'sieg');
  await expect(page.locator('.kampagne[data-campaign="e2e-ende"] .k-stand')).toHaveAttribute('data-stand', 'niederlage');
  expect(errors).toEqual([]);
});

test('the defeat screen opens when the campaign ends while the board is open', async ({ page }) => {
  test.setTimeout(90_000);
  const c = createCampaign({ root, id: 'e2e-live', craft: collapse });
  c.toPlanning();
  const errors = await open(page, '?campaign=e2e-live');
  await expect(page.locator('#dlg-ende')).toBeHidden();
  c.playTurn({ next: dice(83) });
  await expect(page.locator('#dlg-ende')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#dlg-ende')).toHaveAttribute('data-variant', 'collapse');
  expect(errors).toEqual([]);
});

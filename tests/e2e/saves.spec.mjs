import { test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { createCampaign, dice } from '../acceptance/lib/harness.js';
import { REPO, startServer } from '../lib/server.mjs';

const FIRST = { nahrung: 2, research: 1 };
const LATEST = { nahrung: 1, material: 1, research: 1 };
let root, server, base, counter = 0;

function cli(id, ...args) {
  const result = spawnSync(process.execPath, ['engine/cli.mjs', ...args, '--campaign', id, '--json'], {
    cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8',
  });
  const allowed = args[0] === 'preview' ? [0, 3] : [0];
  if (!allowed.includes(result.status)) throw new Error(result.stdout + result.stderr);
  return JSON.parse(result.stdout);
}

function fixture() {
  const id = `saves-${++counter}`;
  createHochland(root, id);
  return id;
}

const snapshotDraft = (id, slot) => JSON.parse(readFileSync(join(root, 'campaigns', id, 'saves', slot, 'campaign', 'drafts', 'bergnomaden.json'), 'utf8'));
const storedDraft = async (page, id) => (await (await page.request.get(`${base}/api/campaigns/${id}/draft`)).json()).draft;
const saveList = async (page, id) => (await (await page.request.get(`${base}/api/campaigns/${id}/saves`)).json()).saves;
const localAssign = (page) => page.evaluate(() => window.spielbrett.game.draft.assign);
const localOrders = (page) => page.evaluate(() => window.spielbrett.game.draft.orders);
async function queueExploration(page, away = false) {
  return page.evaluate((away) => {
    const { game, model } = window.spielbrett;
    for (const order of [...game.draft.orders]) game.removeOrder(order.id);
    const home = `${model.home.q},${model.home.r}`;
    const tiles = away ? Object.keys(model.known).filter((tile) => tile !== home) : [home];
    for (const tile of tiles) {
      const option = game.previewOption({ type: 'explore', params: { tile } });
      if (option.grund) continue;
      const added = game.addOption(option);
      if (added.id) return game.draft.orders;
    }
    throw new Error('the Hochland fixture has no matching exploration target');
  }, away);
}
const setAssign = (page, assign) => page.evaluate((next) => window.spielbrett.game.setAssign(next), assign);
const isWrite = (request, suffix) => request.method() === 'POST' && new URL(request.url()).pathname.endsWith(suffix);

async function open(page, id, language = 'de') {
  await page.addInitScript((language) => localStorage.setItem('realmcraft.settings', JSON.stringify({ language, reduced: true })), language);
  await page.goto(`${base}/spielbrett/?campaign=${id}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

async function menu(page, mode) {
  const dialog = page.locator('#dlg-spielstaende');
  if (await dialog.isVisible()) {
    await dialog.locator('.overlay-kopf .icon-btn').click();
    await expect(page.locator('#dlg-menu')).toBeVisible();
  }
  if (!await page.locator('#dlg-menu').isVisible()) await page.locator('#menu-knopf').click();
  await page.locator(`#dlg-menu [data-menu="${mode}"]`).click();
  await expect(dialog).toBeVisible();
  return dialog;
}

async function save(page, id, label) {
  const dialog = await menu(page, 'save');
  await dialog.locator('#save-label').fill(label);
  const response = page.waitForResponse((r) => isWrite(r.request(), `/api/campaigns/${id}/saves`));
  await dialog.locator('#save-create').click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  const { save: manifest } = await saved.json();
  await expect(dialog.locator(`[data-save-slot="${manifest.slot}"]`)).toBeVisible();
  await expect(dialog.locator('[role="status"]')).not.toBeEmpty();
  return manifest;
}

async function load(page, id, slot) {
  const dialog = await menu(page, 'load');
  await dialog.locator(`[data-load-slot="${slot}"]`).click();
  await expect(dialog.locator('#save-load-confirm')).toBeVisible();
  const response = page.waitForResponse((r) => isWrite(r.request(), `/api/campaigns/${id}/load`));
  const navigation = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() });
  await dialog.locator('#save-load-confirm').click();
  const loaded = await response;
  expect(loaded.status()).toBe(200);
  const result = await loaded.json();
  await navigation;
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  return result;
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-save-menu-'));
  mkdirSync(join(root, '_input'), { recursive: true });
  server = await startServer(root);
  base = `http://127.0.0.1:${server.port}`;
});

test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

test('saving includes the latest draft before its automatic persistence timer runs', async ({ page }) => {
  const id = fixture();
  await open(page, id);
  const dialog = await menu(page, 'save');
  await dialog.locator('#save-label').fill('Vor dem ersten Winter');
  await setAssign(page, FIRST);
  const response = page.waitForResponse((r) => isWrite(r.request(), `/api/campaigns/${id}/saves`));
  await dialog.locator('#save-create').click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  const { save: manifest } = await saved.json();
  expect(snapshotDraft(id, manifest.slot).assign).toEqual(FIRST);
  expect((await storedDraft(page, id)).assign).toEqual(FIRST);
  await expect(dialog.locator(`[data-save-slot="${manifest.slot}"]`)).toContainText('Vor dem ersten Winter');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  expect(await localAssign(page)).toEqual(FIRST);
});

test('saving waits for an in-flight draft and then stores changes made during that request', async ({ page }) => {
  const id = fixture();
  await open(page, id);
  const dialog = await menu(page, 'save');
  await dialog.locator('#save-label').fill('Neueste Planung');
  let release, started;
  const held = new Promise((resolve) => { release = resolve; });
  const seen = new Promise((resolve) => { started = resolve; });
  let first = true, saveRequests = 0;
  const assignments = [];
  page.on('request', (request) => { if (isWrite(request, `/api/campaigns/${id}/saves`)) saveRequests++; });
  await page.route('**/api/draft', async (route) => {
    assignments.push(route.request().postDataJSON().draft.assign);
    if (first) { first = false; started(); await held; }
    await route.continue();
  });
  try {
    await setAssign(page, FIRST);
    await seen;
    await setAssign(page, LATEST);
    const saved = page.waitForResponse((r) => isWrite(r.request(), `/api/campaigns/${id}/saves`));
    await dialog.locator('#save-create').click();
    await expect(dialog.locator('#save-create')).toBeDisabled();
    expect(saveRequests).toBe(0);
    release();
    const response = await saved;
    expect(response.status()).toBe(201);
    const { save: manifest } = await response.json();
    expect(assignments[0]).toEqual(FIRST);
    expect(assignments.at(-1)).toEqual(LATEST);
    expect(snapshotDraft(id, manifest.slot).assign).toEqual(LATEST);
    expect((await storedDraft(page, id)).assign).toEqual(LATEST);
  } finally {
    release();
  }
});

test('loading an earlier same-turn draft survives reload and its autosave restores the displaced plan', async ({ page }) => {
  const id = fixture();
  await open(page, id);
  await setAssign(page, FIRST);
  const earlierOrders = await queueExploration(page);
  const earlier = await save(page, id, 'Erste Planung');
  expect(snapshotDraft(id, earlier.slot).orders).toEqual(earlierOrders);
  await setAssign(page, LATEST);
  const latestOrders = await queueExploration(page, true);
  expect(latestOrders).not.toEqual(earlierOrders);
  const loaded = await load(page, id, earlier.slot);
  expect(await localOrders(page)).toEqual(earlierOrders);
  expect((await storedDraft(page, id)).orders).toEqual(earlierOrders);
  expect(snapshotDraft(id, loaded.autosave).orders).toEqual(latestOrders);
  expect(loaded.turn).toBe(earlier.turn);
  expect(loaded.rev).toBe(earlier.rev);
  expect(await localAssign(page)).toEqual(FIRST);
  expect((await storedDraft(page, id)).assign).toEqual(FIRST);
  expect(snapshotDraft(id, loaded.autosave).assign).toEqual(LATEST);
  // This spans the old automatic-save debounce window after the restore SSE and navigation.
  await page.waitForTimeout(400);
  expect((await storedDraft(page, id)).assign).toEqual(FIRST);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  expect(await localAssign(page)).toEqual(FIRST);
  await load(page, id, loaded.autosave);
  expect(await localOrders(page)).toEqual(latestOrders);
  expect((await storedDraft(page, id)).orders).toEqual(latestOrders);
  expect(await localAssign(page)).toEqual(LATEST);
  expect((await storedDraft(page, id)).assign).toEqual(LATEST);
});

test('cancelling load returns to the list without changing the draft or creating an autosave', async ({ page }) => {
  const id = fixture();
  await open(page, id);
  await setAssign(page, FIRST);
  const earlier = await save(page, id, 'Unverändert');
  const before = await storedDraft(page, id);
  const snapshots = await saveList(page, id);
  let loads = 0;
  page.on('request', (request) => { if (isWrite(request, `/api/campaigns/${id}/load`)) loads++; });
  const dialog = await menu(page, 'load');
  const entry = dialog.locator(`[data-load-slot="${earlier.slot}"]`);
  await entry.click();
  await dialog.locator('#save-load-cancel').click();
  await expect(entry).toBeVisible();
  expect(loads).toBe(0);
  expect(await storedDraft(page, id)).toEqual(before);
  expect(await saveList(page, id)).toEqual(snapshots);
  expect(await localAssign(page)).toEqual(FIRST);
});

for (const mode of ['save', 'load']) {
  test(`a failed draft flush blocks ${mode} and keeps the local planning available`, async ({ page }) => {
    const id = fixture();
    const existing = cli(id, 'save', '--name', 'Gesicherter Anfang').save;
    await open(page, id);
    const before = await storedDraft(page, id);
    const dialog = await menu(page, mode);
    if (mode === 'save') await dialog.locator('#save-label').fill('Nicht verlieren');
    else await dialog.locator(`[data-load-slot="${existing.slot}"]`).click();
    let operations = 0;
    page.on('request', (request) => {
      if (isWrite(request, `/api/campaigns/${id}/saves`) || isWrite(request, `/api/campaigns/${id}/load`)) operations++;
    });
    await page.route('**/api/draft', (route) => route.abort('failed'));
    await setAssign(page, LATEST);
    await dialog.locator(mode === 'save' ? '#save-create' : '#save-load-confirm').click();
    await expect(dialog.locator('[role="alert"]')).toBeVisible();
    await expect(dialog.locator('[role="alert"]')).not.toBeEmpty();
    expect(operations).toBe(0);
    expect(await localAssign(page)).toEqual(LATEST);
    expect(await storedDraft(page, id)).toEqual(before);
    await page.unroute('**/api/draft');
    await dialog.locator('.overlay-kopf .icon-btn').click();
    if (await page.locator('#dlg-menu').isVisible()) await page.locator('#dlg-menu [data-menu="resume"]').click();
    await setAssign(page, FIRST);
    await expect.poll(async () => (await storedDraft(page, id))?.assign).toEqual(FIRST);
  });
}

test('a failed snapshot request keeps its label and draft and can be retried', async ({ page }) => {
  const id = fixture();
  await open(page, id);
  await setAssign(page, LATEST);
  const dialog = await menu(page, 'save');
  await dialog.locator('#save-label').fill('Winter & Frühling <Plan>');
  await page.route(`**/api/campaigns/${id}/saves`, (route) => route.request().method() === 'POST' ? route.abort('failed') : route.continue());
  await dialog.locator('#save-create').click();
  await expect(dialog.locator('[role="alert"]')).toBeVisible();
  await expect(dialog.locator('#save-label')).toHaveValue('Winter & Frühling <Plan>');
  expect(await localAssign(page)).toEqual(LATEST);
  expect(await saveList(page, id)).toEqual([]);
  await page.unroute(`**/api/campaigns/${id}/saves`);
  const response = page.waitForResponse((r) => isWrite(r.request(), `/api/campaigns/${id}/saves`));
  await dialog.locator('#save-create').click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  const { save: manifest } = await saved.json();
  await expect(dialog.locator(`[data-save-slot="${manifest.slot}"]`)).toContainText('Winter & Frühling <Plan>');
  await expect(dialog.locator('plan')).toHaveCount(0);
  expect(snapshotDraft(id, manifest.slot).assign).toEqual(LATEST);
});

for (const [language, width] of [['de', 1440], ['en', 390]]) {
  test(`start-screen saves support ${language} keyboard navigation at ${width}px`, async ({ page }, testInfo) => {
    const id = fixture();
    const existing = cli(id, 'save', '--name', 'Vor dem ersten Winter der Grauen Kämme').save;
    cli(id, 'save', '--name', 'Eine weitere Planung für das Hochland');
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((language) => localStorage.setItem('realmcraft.settings', JSON.stringify({ language, reduced: true })), language);
    await page.goto(`${base}/spielbrett/`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    const trigger = page.locator(`[data-campaign-saves="${id}"]`);
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAccessibleName(/\S/);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('#dlg-spielstaende');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading').first()).toBeFocused();
    await expect(dialog.getByRole('heading').first()).toHaveText(language === 'de' ? 'Spielstände' : 'Saved games');
    await expect(dialog.locator('#save-label')).toHaveCount(0);
    const entry = dialog.locator(`[data-load-slot="${existing.slot}"]`);
    await expect(entry).toBeVisible();
    await entry.focus();
    await page.keyboard.press('Space');
    await expect(dialog.locator('#save-load-confirm')).toBeVisible();
    await dialog.locator('#save-load-cancel').focus();
    await page.keyboard.press('Enter');
    await expect(entry).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: testInfo.outputPath(`saves-${language}-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test('resolving campaigns list snapshots but disable save and load controls', async ({ page }) => {
  const id = fixture();
  const existing = cli(id, 'save', '--name', 'Vor der Auflösung').save;
  for (const probe of cli(id, 'preview').probes.filter((p) => p.roller === 'player')) cli(id, 'roll', probe.id, '6');
  cli(id, 'seal');
  await open(page, id);
  const dialog = await menu(page, 'save');
  await expect(dialog.locator('#save-create')).toBeDisabled();
  await expect(dialog).toContainText(/Planung/i);
  await menu(page, 'load');
  await expect(dialog.locator(`[data-load-slot="${existing.slot}"]`)).toBeDisabled();
  await expect(dialog).toContainText(/Planung/i);
});

test('an active harness run is refused by the server and its reason stays visible', async ({ page }) => {
  const id = fixture();
  const existing = cli(id, 'save', '--name', 'Vor dem Agentenlauf').save;
  const marker = (action) => {
    const result = spawnSync(process.execPath, ['tools/harness/run-marker.mjs', action, '--campaign', id, '--root', root], { cwd: REPO, encoding: 'utf8' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  };
  marker('start');
  try {
    await open(page, id);
    const dialog = await menu(page, 'save');
    await dialog.locator('#save-label').fill('Im Lauf');
    const refused = page.waitForResponse((r) => isWrite(r.request(), `/api/campaigns/${id}/saves`));
    await dialog.locator('#save-create').click();
    expect((await refused).status()).toBe(409);
    await expect(dialog.locator('[role="alert"]')).not.toBeEmpty();
    await menu(page, 'load');
    await dialog.locator(`[data-load-slot="${existing.slot}"]`).click();
    const loadRefused = page.waitForResponse((r) => isWrite(r.request(), `/api/campaigns/${id}/load`));
    await dialog.locator('#save-load-confirm').click();
    expect((await loadRefused).status()).toBe(409);
    await expect(dialog.locator('[role="alert"]')).not.toBeEmpty();
  } finally {
    marker('end');
  }
});


for (const responseMode of ['lost', 'null']) {
  test(`a ${responseMode === 'lost' ? 'lost' : 'malformed null'} load response freezes draft edits until canonical reload reconciles the committed restore`, async ({ page }) => {
    const id = fixture();
    await open(page, id);
    await setAssign(page, FIRST);
    const earlierOrders = await queueExploration(page);
    const earlier = await save(page, id, 'Vor der verlorenen Antwort');
    await setAssign(page, LATEST);
    await queueExploration(page, true);
    const dialog = await menu(page, 'load');
    await dialog.locator(`[data-load-slot="${earlier.slot}"]`).click();
    let committed = false, staleWrites = 0;
    page.on('request', (request) => { if (committed && isWrite(request, '/api/draft')) staleWrites++; });
    await page.route(`**/api/campaigns/${id}/load`, async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committed = true;
      if (responseMode === 'lost') await route.abort('failed');
      else await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });
    await dialog.locator('#save-load-confirm').click();
    await expect(dialog.locator('[role="alert"]')).toBeVisible();
    await expect(dialog.locator('#save-reconcile')).toBeVisible();
    await expect(dialog.locator('.overlay-kopf .icon-btn')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.mouse.click(4, 4);
    await expect(dialog).toBeVisible();
    expect(committed).toBe(true);
    const localBefore = await localAssign(page);
    expect(await page.evaluate((assign) => window.spielbrett.game.setAssign(assign), FIRST)).toBe(false);
    expect(await localAssign(page)).toEqual(localBefore);
    expect((await storedDraft(page, id)).assign).toEqual(FIRST);
    // A rejected edit must not re-arm automatic persistence after an uncertain restore.
    await page.waitForTimeout(400);
    expect(staleWrites).toBe(0);
    const navigation = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() });
    await dialog.locator('#save-reconcile').click();
    await navigation;
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    expect(await localAssign(page)).toEqual(FIRST);
    expect(await localOrders(page)).toEqual(earlierOrders);
    expect((await storedDraft(page, id)).assign).toEqual(FIRST);
    expect((await storedDraft(page, id)).orders).toEqual(earlierOrders);
    expect(staleWrites).toBe(0);
  });
}

for (const failFirst of [false, true]) {
  test(`returning to start flushes queued planning${failFirst ? ' and stays on the board after a failed flush' : ''}`, async ({ page }) => {
    const id = fixture();
    await open(page, id);
    await page.locator('#menu-knopf').click();
    if (failFirst) await page.route('**/api/draft', (route) => route.abort('failed'));
    await setAssign(page, LATEST);
    const orders = await queueExploration(page);
    const leave = page.locator('#dlg-menu [data-menu="to-start"]');
    await leave.click();
    if (failFirst) {
      await expect(page.locator('#dlg-menu [role="alert"]')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`campaign=${id}$`));
      expect(await localAssign(page)).toEqual(LATEST);
      expect(await localOrders(page)).toEqual(orders);
      await page.unroute('**/api/draft');
      await leave.click();
    }
    await page.waitForURL(`${base}/spielbrett/`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    expect((await storedDraft(page, id)).assign).toEqual(LATEST);
    expect((await storedDraft(page, id)).orders).toEqual(orders);
    await page.locator(`[data-campaign="${id}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('data-campaign', id);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    expect(await localAssign(page)).toEqual(LATEST);
    expect(await localOrders(page)).toEqual(orders);
  });
}



test('an ended campaign can load its earlier planning snapshot while creating saves stays disabled', async ({ page }) => {
  const id = `saves-ended-${++counter}`;
  const campaign = createCampaign({ root, id, craft: (state) => { state.peoples[state.campaign.player].population.core = 0; } });
  campaign.toPlanning();
  const earlier = cli(id, 'save', '--name', 'Vor dem Ende').save;
  campaign.playTurn({ next: dice(83) });
  expect(campaign.state().status).toBe('ended');
  await open(page, id);
  const end = page.locator('#dlg-ende');
  await expect(end).toBeVisible();
  await end.locator('[data-ende="brett"]').click();
  // The existing shell queues final event cards after the result screen.
  for (let i = 0; i < 5 && await page.locator('dialog[open]').count(); i++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  const dialog = await menu(page, 'save');
  await expect(dialog.locator('#save-create')).toBeDisabled();
  const restored = await load(page, id, earlier.slot);
  expect(restored.status).toBe('playing');
  expect(restored.phase).toBe('planning');
  await expect(page.locator('#dlg-ende')).toBeHidden();
  expect(await page.evaluate(() => window.spielbrett.game.view.status)).toBe('playing');
  expect(await page.evaluate(() => window.spielbrett.game.view.phase)).toBe('planning');
});

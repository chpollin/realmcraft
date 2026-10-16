import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { REPO, startServer } from '../lib/server.mjs';

const WORLD = 'Im Fluss bleiben messbare Erinnerungsspuren. Die Werkstätten vergleichen sie mit Beobachtungen und veröffentlichen ihre Unsicherheit.';
const PEOPLE = 'Die Pegelhüter unterhalten gemeinsam mobile Messwerkstätten. Niemand besitzt die Erinnerungen anderer; Entscheidungen fallen im Rat.';
let root, server, base;

test.beforeEach(async ({ page }) => {
  root = mkdtempSync(join(tmpdir(), 'rc-workshop-ui-'));
  mkdirSync(join(root, 'campaigns'), { recursive: true });
  server = await startServer(root);
  base = `http://127.0.0.1:${server.port}`;
  page.on('pageerror', (error) => { throw error; });
  await page.addInitScript(() => {
    localStorage.setItem('realmcraft.settings', JSON.stringify({ language: 'de', reduced: true }));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { throw new Error('Clipboard denied for this test'); },
    } });
  });
});
test.afterEach(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

async function enter(page) {
  await page.goto(`${base}/spielbrett/`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.locator('#start-new').click();
  await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'chat');
}
async function session(page) {
  const response = page.waitForResponse((res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/realms/workshops');
  await page.locator('#realm-copy-prompt').click();
  const res = await response;
  expect(res.status()).toBe(200);
  const result = await res.json();
  await expect(page.locator('#realm-prompt-text')).toBeVisible();
  await expect(page.locator('#realm-prompt-text')).toHaveText(result.prompt);
  return result.workshop;
}
async function creation(page) {
  const response = await page.request.post(`${base}/api/realms/draft`, { data: { world: WORLD, people: PEOPLE, language: 'de', seed: 8293 } });
  expect(response.ok()).toBe(true);
  const { draft } = await response.json();
  draft.world.name = 'Die Ströme von Orin';
  draft.world.landscape = 'riverlands';
  draft.people.name = 'Gemeinschaft der Pegelhüter';
  return draft;
}
function publish(workshop, packet) {
  const path = join(root, randomUUID() + '.json');
  writeFileSync(path, JSON.stringify(packet));
  return JSON.parse(execFileSync(process.execPath, ['tools/harness/realm-workshop.mjs', 'publish', '--id', workshop.id, '--root', root, '--file', path,
    '--expect-rev', String(workshop.rev), '--generation', workshop.generation ?? 'legacy'], { cwd: REPO, encoding: 'utf8' })).workshop;
}
async function review(page) {
  const response = page.waitForResponse((res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/realms/preview');
  await page.locator('#realm-workshop-preview').click();
  const res = await response;
  expect(res.status()).toBe(200);
  await expect(page.locator('#realm-map-preview')).toBeVisible();
  return res.json();
}

test('the harness publishes a shared draft, unresolved rules block review and explicit start uses the real preview', async ({ page }) => {
  await enter(page);
  await expect(page.locator('#realm-flow textarea')).toHaveCount(0);
  await expect(page.locator('.realm-studio')).toHaveCount(0);
  await expect(page.locator('.realm-relief')).toHaveCount(0);
  await expect(page.locator('.realm-chat-route')).toBeVisible();
  await expect(page.locator('#realm-chat-notice')).toHaveText('Noch kein gemeinsamer Entwurf.');
  await expect(page.locator('#realm-workshop-preview')).toHaveCount(0);
  let workshop = await session(page);
  await expect(page.locator('.realm-studio')).toHaveCount(0);
  const draft = await creation(page);
  workshop = publish(workshop, { draft: null, questions: ['Welche Gemeinschaft wollen wir spielen?'], ruleIdeas: [] });
  await expect(page.locator('[data-workshop-items="questions"]')).toContainText('Welche Gemeinschaft wollen wir spielen?');
  await expect(page.locator('#realm-shared-draft')).toHaveCount(0);
  await expect(page.locator('.realm-studio')).toHaveCount(0);
  await expect(page.locator('#realm-chat-notice')).toContainText('Kläre offene Fragen');
  await page.reload();
  await expect(page.locator('[data-workshop-items="questions"]')).toContainText('Welche Gemeinschaft wollen wir spielen?');
  await expect(page.locator('.realm-studio')).toHaveCount(0);
  await expect(page.locator('#realm-workshop-preview')).toHaveCount(0);
  workshop = publish(workshop, { draft, questions: ['Wer darf Erinnerungsspuren vergleichen?'], ruleIdeas: ['Erinnerungen als neue handelbare Ressource.'] });
  await expect(page.locator('#realm-shared-draft')).toContainText(draft.world.name);
  await expect(page.locator('.realm-relief')).toBeVisible();
  await expect(page.locator('.realm-chat-route')).toHaveCount(0);
  await expect(page.locator('[data-workshop-items="questions"]')).toContainText('Wer darf Erinnerungsspuren vergleichen?');
  await expect(page.locator('[data-workshop-items="ruleIdeas"]')).toContainText('Erinnerungen als neue handelbare Ressource.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#realm-copy-prompt').click();
  await expect(page.locator('#realm-prompt-text')).toBeFocused();
  const fallback = await page.locator('#realm-prompt-text').boundingBox();
  expect(fallback.y).toBeLessThan(844);
  expect(fallback.y + fallback.height).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#realm-workshop-preview')).toHaveCount(0);
  expect(await (await page.request.get(`${base}/api/campaigns`)).json()).toEqual([]);
  workshop = publish(workshop, { draft, questions: [], ruleIdeas: [] });
  await expect(page.locator('#realm-workshop-preview')).toBeVisible();
  const preview = await review(page);
  expect(preview.draft).toEqual(draft);
  await expect(page.locator('#realm-preview-revision')).toContainText(String(workshop.rev));
  const response = page.waitForResponse((res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/realms/start');
  await page.locator('#realm-start').click();
  const created = await (await response).json();
  expect(created.ok).toBe(true);
  await page.waitForURL(`**/spielbrett/?campaign=${created.id}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const actual = await page.evaluate(() => window.spielbrett.game.pack.welt.creation);
  expect(actual).toEqual(draft);
});

test('shared updates and reload preserve an independent manually edited draft', async ({ page }) => {
  await enter(page);
  let workshop = await session(page);
  const draft = await creation(page);
  workshop = publish(workshop, { draft, questions: [], ruleIdeas: [] });
  await expect(page.locator('#realm-shared-draft')).toContainText(draft.people.name);
  let reads = 0;
  page.on('request', (request) => { if (request.method() === 'GET' && new URL(request.url()).pathname.startsWith('/api/realms/workshops/')) reads++; });
  await page.locator('#realm-open-manual').click();
  const manualReads = reads;
  await page.locator('#realm-world-brief').fill('Eine eigene Welt nur für den unabhängigen Formularentwurf.');
  await page.locator('#realm-people-brief').fill('Eine Gemeinschaft mit einem eigenständigen Arbeitsauftrag.');
  await page.locator('#realm-draft').click();
  await page.locator('#realm-world-name').fill('Mein unabhängiger Entwurf');
  const newer = structuredClone(draft); newer.world.name = 'Der überarbeitete gemeinsame Realm';
  workshop = publish(workshop, { draft: newer, questions: [], ruleIdeas: [] });
  await page.waitForTimeout(1700);
  expect(reads).toBe(manualReads);
  await expect(page.locator('#realm-world-name')).toHaveValue('Mein unabhängiger Entwurf');
  await page.locator('#realm-return-chat').click();
  await expect(page.locator('#realm-shared-draft')).toContainText(newer.world.name);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#realm-shared-draft')).toContainText(newer.world.name);
  await page.locator('#realm-open-manual').click();
  await expect(page.locator('#realm-world-name')).toHaveValue('Mein unabhängiger Entwurf');
});

test('a shared revision arriving during a held preview prevents publication of the stale preview', async ({ page }) => {
  await enter(page);
  let workshop = await session(page);
  const draft = await creation(page);
  workshop = publish(workshop, { draft, questions: [], ruleIdeas: [] });
  await expect(page.locator('#realm-workshop-preview')).toBeVisible();
  let release, captured;
  const pending = new Promise((resolve) => { release = resolve; });
  const received = new Promise((resolve) => { captured = resolve; });
  await page.route('**/api/realms/preview', async (route) => {
    const response = await route.fetch();
    captured(); await pending;
    await route.fulfill({ response });
  });
  await page.locator('#realm-workshop-preview').click();
  await received;
  const newer = structuredClone(draft); newer.world.name = 'Die korrigierte Welt';
  workshop = publish(workshop, { draft: newer, questions: [], ruleIdeas: [] });
  await expect(page.locator('#realm-shared-draft')).toContainText(newer.world.name);
  release();
  await expect(page.locator('#realm-flow')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#realm-map-preview')).toHaveCount(0);
  await expect(page.locator('#realm-start')).toHaveCount(0);
  await page.unroute('**/api/realms/preview');
  const preview = await review(page);
  expect(preview.draft.world.name).toBe(newer.world.name);
});

test('a changed shared draft invalidates a visible preview and requires another review', async ({ page }) => {
  await enter(page);
  let workshop = await session(page);
  const draft = await creation(page);
  workshop = publish(workshop, { draft, questions: [], ruleIdeas: [] });
  await expect(page.locator('#realm-workshop-preview')).toBeVisible();
  await review(page);
  const newer = structuredClone(draft); newer.people.name = 'Die neu benannte Gemeinschaft';
  workshop = publish(workshop, { draft: newer, questions: [], ruleIdeas: [] });
  await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'chat');
  await expect(page.locator('#realm-shared-draft')).toContainText(newer.people.name);
  await expect(page.locator('#realm-start')).toHaveCount(0);
  await review(page);
  await expect(page.locator('#realm-review')).toContainText(newer.people.name);
});

test('a lost start response and reload recover the same workshop receipt without a second campaign', async ({ page }) => {
  await enter(page);
  let workshop = await session(page);
  const draft = await creation(page);
  workshop = publish(workshop, { draft, questions: [], ruleIdeas: [] });
  await expect(page.locator('#realm-workshop-preview')).toBeVisible();
  await review(page);
  let first = null;
  await page.route('**/api/realms/start', async (route) => {
    first = route.request().postDataJSON();
    await route.fetch();
    await route.abort('failed');
  });
  await page.locator('#realm-start').click();
  await expect(page.locator('#realm-error')).toContainText('Start');
  await page.unroute('**/api/realms/start');
  const before = await (await page.request.get(`${base}/api/campaigns`)).json();
  expect(before).toHaveLength(1);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.locator('#start-new').click();
  await expect(page.locator('#realm-workshop-retry')).toBeVisible();
  const response = page.waitForResponse((res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/realms/start');
  await page.locator('#realm-workshop-retry').click();
  const res = await response;
  expect(res.request().postDataJSON().startKey).toBe(first.startKey);
  const result = await res.json();
  expect(result.id).toBe(before[0].id);
  await page.waitForURL(`**/spielbrett/?campaign=${result.id}`);
  expect((await (await page.request.get(`${base}/api/campaigns`)).json()).map((c) => c.id)).toEqual([result.id]);
});

test('an attempt lost before reservation survives reload with the original key', async ({ page }) => {
  await enter(page);
  let workshop = await session(page);
  const draft = await creation(page);
  workshop = publish(workshop, { draft, questions: [], ruleIdeas: [] });
  await expect(page.locator('#realm-workshop-preview')).toBeVisible();
  await review(page);
  let first;
  await page.route('**/api/realms/start', async (route) => {
    first = route.request().postDataJSON();
    await route.abort('failed');
  });
  await page.locator('#realm-start').click();
  await expect(page.locator('#realm-error')).toBeVisible();
  expect(await (await page.request.get(`${base}/api/campaigns`)).json()).toEqual([]);
  await page.unroute('**/api/realms/start');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#realm-workshop-retry')).toBeVisible();
  const response = page.waitForResponse((res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/realms/start');
  await page.locator('#realm-workshop-retry').click();
  const res = await response;
  expect(res.request().postDataJSON().startKey).toBe(first.startKey);
  expect((await res.json()).ok).toBe(true);
});

test('a newer unfrozen revision makes an old held start ineligible and permits review without reload', async ({ page }) => {
  await enter(page);
  let workshop = await session(page);
  const draft = await creation(page);
  workshop = publish(workshop, { draft, questions: [], ruleIdeas: [] });
  await expect(page.locator('#realm-workshop-preview')).toBeVisible();
  await review(page);
  let release, captured;
  const pending = new Promise((resolve) => { release = resolve; });
  const received = new Promise((resolve) => { captured = resolve; });
  await page.route('**/api/realms/start', async (route) => {
    captured(); await pending;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await page.locator('#realm-start').click();
  await received;
  const newer = structuredClone(draft); newer.world.name = 'Der neue bestätigte Entwurf';
  workshop = publish(workshop, { draft: newer, questions: [], ruleIdeas: [] });
  await expect(page.locator('#realm-shared-draft')).toContainText(newer.world.name);
  const refused = page.waitForResponse((res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/realms/start');
  release();
  expect((await refused).status()).toBe(409);
  await expect(page.locator('#realm-workshop-preview')).toBeEnabled();
  await expect(page.locator('#realm-workshop-retry')).toHaveCount(0);
  expect(await (await page.request.get(`${base}/api/campaigns`)).json()).toEqual([]);
  const preview = await review(page);
  expect(preview.draft.world.name).toBe(newer.world.name);
});

test('hidden tabs pause shared reads and cannot publish a pending preview', async ({ page }) => {
  await enter(page);
  let workshop = await session(page);
  const draft = await creation(page);
  workshop = publish(workshop, { draft, questions: [], ruleIdeas: [] });
  await expect(page.locator('#realm-workshop-preview')).toBeVisible();
  let reads = 0, release, captured;
  page.on('request', (request) => { if (request.method() === 'GET' && new URL(request.url()).pathname.startsWith('/api/realms/workshops/')) reads++; });
  const pending = new Promise((resolve) => { release = resolve; });
  const received = new Promise((resolve) => { captured = resolve; });
  await page.route('**/api/realms/preview', async (route) => {
    const response = await route.fetch(); captured(); await pending;
    await route.fulfill({ response });
  });
  await page.locator('#realm-workshop-preview').click();
  await received;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenReads = reads;
  const newer = structuredClone(draft); newer.world.name = 'Der Entwurf nach der Rückkehr';
  workshop = publish(workshop, { draft: newer, questions: [], ruleIdeas: [] });
  release();
  await expect(page.locator('#realm-flow')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#realm-map-preview')).toHaveCount(0);
  await page.waitForTimeout(1700);
  expect(reads).toBe(hiddenReads);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#realm-shared-draft')).toContainText(newer.world.name);
  await page.unroute('**/api/realms/preview');
  const preview = await review(page);
  expect(preview.draft.world.name).toBe(newer.world.name);
});

test('copy succeeds by keyboard on a narrow screen and the selectable fallback never overflows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
    writeText: async (value) => { window.__copiedRealmPrompt = value; },
  } }));
  await enter(page);
  const action = await page.locator('#realm-copy-prompt').boundingBox();
  expect(action.y + action.height).toBeLessThan(844);
  await page.locator('#realm-copy-prompt').focus();
  const response = page.waitForResponse((res) => res.request().method() === 'POST' && new URL(res.url()).pathname === '/api/realms/workshops');
  await page.keyboard.press('Enter');
  const result = await (await response).json();
  await expect(page.locator('#realm-chat-notice')).toHaveText('Kopiert. Jetzt im Chat einfügen.');
  expect(await page.evaluate(() => window.__copiedRealmPrompt)).toBe(result.prompt);
  await expect(page.getByText('Noch kein gemeinsamer Entwurf.', { exact: true })).toHaveCount(0);
  await expect(page.locator('#realm-chat-notice')).toHaveCount(1);
  await expect(page.locator('.realm-studio')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#realm-chat-notice')).toHaveText('Noch kein gemeinsamer Entwurf.');
  await expect(page.locator('.realm-studio')).toHaveCount(0);
  await page.locator('#realm-chat-prompt summary').click();
  await expect(page.locator('#realm-prompt-text')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#realm-copy-prompt')).toBeEnabled();
});

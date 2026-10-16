// Live projection recovery uses real browser modules and an isolated CLI game.
// Synthetic public projections isolate network ordering from kernel turn changes.
import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { startServer } from '../lib/server.mjs';
import { hashValue } from '../../engine/core/hash.js';

let root, server, base, errors;
const copy = (value) => JSON.parse(JSON.stringify(value));
test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-live-updates-'));
  server = await startServer(root);
  base = `http://127.0.0.1:${server.port}`;
});
test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});
test.beforeEach(({ page }) => {
  errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(() => expect(errors).toEqual([]));

async function open(page, id, configure) {
  const dir = createHochland(root, id);
  const canonical = JSON.parse(readFileSync(join(dir, 'view', 'bergnomaden.json'), 'utf8'));
  const content = await (await page.request.get(`${base}/api/campaigns/${id}/content`)).json();
  const state = { current: canonical, viewGets: 0, contentGets: 0, draftPosts: 0, onView: null, onContent: null };
  await page.addInitScript(() => {
    const streams = [];
    window.EventSource = class extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      constructor(url) { super(); this.url = url; this.readyState = 1; streams.push(this); }
      close() { this.readyState = 2; }
    };
    window.__pushSSE = (event, data) => {
      for (const stream of streams) if (stream.readyState === 1) stream.dispatchEvent(new MessageEvent(event, { data: JSON.stringify(data) }));
    };
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/draft') state.draftPosts++;
  });
  await page.route(`**/campaigns/${id}/view/bergnomaden.json`, async (route) => {
    state.viewGets++;
    const snapshot = copy(state.current);
    if (state.onView) await state.onView(route, snapshot);
    else await route.fulfill({ json: snapshot });
  });
  await page.route(`**/api/campaigns/${id}/content`, async (route) => {
    state.contentGets++;
    const snapshot = { ...copy(content), viewHash: hashValue(state.current) };
    if (state.onContent) await state.onContent(route, snapshot);
    else await route.fulfill({ json: snapshot });
  });
  configure?.(state);
  await page.goto(`${base}/spielbrett/?campaign=${id}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#volk-name')).toHaveText(canonical.peoples.bergnomaden.name);
  state.notify = () => page.evaluate((campaign) => window.__pushSSE('view', { campaign }), id);
  state.hello = () => page.evaluate(() => window.__pushSSE('hello', {}));
  state.rename = (name) => {
    state.current = copy(state.current);
    state.current.rev++;
    state.current.peoples.bergnomaden.name = name;
  };
  return state;
}

test('a transient view GET failure retries without another SSE and preserves the same-turn plan', async ({ page }) => {
  const state = await open(page, 'live-retry');
  const planned = await page.evaluate(async () => {
    const game = window.spielbrett.game;
    const assign = { ...(game.draft.assign ?? game.view.peoples[game.pid].population.assigned) };
    assign.nahrung--;
    assign.research = (assign.research ?? 0) + 1;
    game.setAssign(assign);
    const saved = await game.flushDraft();
    if (!saved.stored) throw new Error('fixture plan was not stored');
    return game.draft;
  });
  const posts = state.draftPosts;
  state.rename('Gemeinschaft nach der Unterbrechung');
  let failed = false;
  state.onView = async (route, snapshot) => {
    if (!failed) { failed = true; await route.fulfill({ status: 503, json: { error: 'temporary test outage' } }); }
    else await route.fulfill({ json: snapshot });
  };
  await state.notify();
  await expect(page.locator('#volk-name')).toHaveText('Gemeinschaft nach der Unterbrechung', { timeout: 4500 });
  expect(failed).toBe(true);
  expect(await page.evaluate(() => window.spielbrett.game.draft)).toEqual(planned);
  expect(state.draftPosts).toBe(posts);
});

test('view notifications during a pending refresh queue a canonical reread without overlap or rollback', async ({ page }) => {
  const state = await open(page, 'live-queue');
  const reads = state.viewGets;
  let release, started;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = new Promise((resolve) => { started = resolve; });
  let held = false, active = 0, maxActive = 0;
  const observed = await page.evaluate(() => {
    window.__observedViews = [];
    window.spielbrett.game.onUpdate((kind) => {
      if (kind === 'view') window.__observedViews.push(window.spielbrett.game.view.peoples.bergnomaden.name);
    });
    return window.spielbrett.game.view.peoples.bergnomaden.name;
  });
  state.onView = async (route, snapshot) => {
    active++;
    maxActive = Math.max(maxActive, active);
    try {
      if (!held) { held = true; started(); await gate; }
      await route.fulfill({ json: snapshot });
    } finally { active--; }
  };
  state.rename('Frühere Meldung');
  await state.notify();
  await pending;
  state.rename('Neuester bekannter Stand');
  await state.notify();
  try {
    await page.waitForTimeout(180);
    expect(maxActive).toBe(1);
    expect(state.viewGets - reads).toBe(1);
    await expect(page.locator('#volk-name')).toHaveText(observed);
  } finally { release(); }
  await expect(page.locator('#volk-name')).toHaveText('Neuester bekannter Stand', { timeout: 4500 });
  await page.waitForTimeout(150);
  const updates = await page.evaluate(() => window.__observedViews);
  const latest = updates.indexOf('Neuester bekannter Stand');
  expect(latest).toBeGreaterThanOrEqual(0);
  expect(updates.slice(latest)).not.toContain('Frühere Meldung');
  expect(maxActive).toBe(1);
  expect(state.viewGets - reads).toBeGreaterThanOrEqual(2);
});

test('a missed SSE is reconciled by visible polling and unchanged polls avoid content and draft writes', async ({ page }) => {
  const state = await open(page, 'live-poll');
  await state.hello();
  await expect.poll(() => state.viewGets).toBeGreaterThan(1);
  state.rename('Stand ohne Benachrichtigung');
  await expect(page.locator('#volk-name')).toHaveText('Stand ohne Benachrichtigung', { timeout: 9000 });
  const unchanged = { reads: state.viewGets, content: state.contentGets, posts: state.draftPosts };
  await expect.poll(() => state.viewGets, { timeout: 7000 }).toBeGreaterThan(unchanged.reads);
  await page.waitForTimeout(100);
  expect(state.contentGets).toBe(unchanged.content);
  expect(state.draftPosts).toBe(unchanged.posts);
});

test('content from another view keeps the previous snapshot until a matching pair can be retried', async ({ page }) => {
  const state = await open(page, 'live-pair');
  const original = copy(state.current);
  const oldName = original.peoples.bergnomaden.name;
  state.rename('Zusammenpassender neuer Stand');
  let mismatches = 0, allowMatching = false;
  state.onContent = async (route, snapshot) => {
    if (!allowMatching) { mismatches++; snapshot.viewHash = hashValue(original); }
    await route.fulfill({ json: snapshot });
  };
  await state.notify();
  await expect.poll(() => mismatches).toBeGreaterThan(0);
  await expect(page.locator('#volk-name')).toHaveText(oldName);
  expect(await page.evaluate(() => window.spielbrett.game.view.peoples.bergnomaden.name)).toBe(oldName);
  allowMatching = true;
  await expect(page.locator('#volk-name')).toHaveText('Zusammenpassender neuer Stand', { timeout: 4500 });
  expect(state.contentGets).toBeGreaterThanOrEqual(3);
});

function holdNextView(state) {
  let release, started, finished;
  const ready = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const done = new Promise((resolve) => { finished = resolve; });
  state.onView = async (route, snapshot) => {
    state.onView = null;
    started();
    try { await gate; await route.fulfill({ json: snapshot }); }
    finally { finished(); }
  };
  return { ready, done, release: () => release() };
}

async function visibility(page, hidden) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test('bootstrap retries a mismatched content pair before publishing the initial board', async ({ page }) => {
  let mismatches = 0;
  const state = await open(page, 'live-bootstrap', (state) => {
    state.onContent = async (route, snapshot) => {
      if (mismatches === 0) {
        mismatches++;
        snapshot.viewHash = hashValue({ ...state.current, rev: state.current.rev + 1 });
      }
      await route.fulfill({ json: snapshot });
    };
  });
  expect(mismatches).toBe(1);
  expect(state.viewGets).toBeGreaterThanOrEqual(2);
  expect(state.contentGets).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => window.spielbrett.game.view)).toEqual(state.current);
  expect(state.draftPosts).toBe(0);
});

test('disposing during a view read prevents its publication and stops periodic reads and writes', async ({ page }) => {
  const state = await open(page, 'live-dispose');
  const old = copy(state.current);
  const held = holdNextView(state);
  state.rename('Darf nach dem Schließen nicht erscheinen');
  await state.notify();
  await held.ready;
  try { await page.evaluate(() => window.spielbrett.game.dispose()); }
  finally { held.release(); }
  await held.done;
  await page.waitForTimeout(100);
  const reads = state.viewGets, content = state.contentGets;
  await state.notify();
  await page.evaluate(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); });
  await page.waitForTimeout(5200);
  expect(await page.evaluate(() => window.spielbrett.game.view)).toEqual(old);
  await expect(page.locator('#volk-name')).toHaveText(old.peoples.bergnomaden.name);
  expect(state.viewGets).toBe(reads);
  expect(state.contentGets).toBe(content);
  expect(state.draftPosts).toBe(0);
});

test('hiding during a view read defers publication until a fresh visible pair is read', async ({ page }) => {
  const state = await open(page, 'live-hidden');
  const oldName = state.current.peoples.bergnomaden.name;
  const held = holdNextView(state);
  state.rename('Beim Verbergen bereits unterwegs');
  await state.notify();
  await held.ready;
  try {
    await visibility(page, true);
    state.rename('Frischer Stand nach der Rückkehr');
  } finally { held.release(); }
  await held.done;
  await page.waitForTimeout(150);
  await expect(page.locator('#volk-name')).toHaveText(oldName);
  expect(await page.evaluate(() => window.spielbrett.game.view.peoples.bergnomaden.name)).toBe(oldName);
  const reads = state.viewGets;
  await visibility(page, false);
  await expect(page.locator('#volk-name')).toHaveText('Frischer Stand nach der Rückkehr', { timeout: 4500 });
  expect(state.viewGets).toBeGreaterThan(reads);
  expect(await page.evaluate(() => window.spielbrett.game.view)).toEqual(state.current);
  expect(state.draftPosts).toBe(0);
});

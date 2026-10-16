// Real Web Audio scheduling: cues finish, idle screens stay silent and viewer
// settings survive without reviving the removed background-audio channel.
// Run: PLAYWRIGHT_CHANNEL=chrome npx playwright test --project=e2e tests/e2e/spielbrett-audio.spec.js

import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { startServer } from '../lib/server.mjs';

const CID = 'e2e-audio';
let root, server, BASE;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-spielbrett-audio-'));
  createHochland(root, CID);
  server = await startServer(root, { port: process.env.SPEC_PORT });
  BASE = `http://localhost:${server.port}`;
});
test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

async function instrument(page) {
  await page.addInitScript(() => {
    const probe = { contexts: 0, records: [] };
    window.__audioProbe = probe;
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(...args) {
        super(...args);
        probe.contexts += 1;
        probe.ctx = this;
      }
    };
    for (const name of ['createOscillator', 'createBufferSource']) {
      const factory = BaseAudioContext.prototype[name];
      BaseAudioContext.prototype[name] = function tracked(...args) {
        const made = factory.apply(this, args);
        const record = { kind: name, starts: [], stops: [], loop: false, ended: false };
        probe.records.push(record);
        const start = made.start.bind(made), stop = made.stop.bind(made);
        made.start = (when = 0, ...rest) => {
          record.starts.push(when);
          record.loop = made.loop === true;
          return start(when, ...rest);
        };
        made.stop = (when = 0) => { record.stops.push(when); return stop(when); };
        made.addEventListener('ended', () => { record.ended = true; });
        return made;
      };
    }
  });
}

const sources = (page) => page.evaluate(() => window.__audioProbe.records.filter((record) => record.starts.length).length);
const setAudio = (page, patch) => page.evaluate(async (p) => (await import('/spielbrett/js/audio/index.js')).getAudio().set(p), patch);
async function openBoard(page) {
  await page.goto(`${BASE}/spielbrett/?campaign=${CID}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}
async function settleSources(page) {
  const records = await page.evaluate(() => window.__audioProbe.records);
  expect(records.length).toBeGreaterThan(0);
  for (const record of records) {
    expect(record.starts).toHaveLength(1);
    expect(record.loop).toBe(false);
    expect(record.stops).toHaveLength(1);
    expect(Number.isFinite(record.stops[0])).toBe(true);
    expect(record.stops[0]).toBeGreaterThan(record.starts[0]);
  }
  await expect.poll(() => page.evaluate(() => window.__audioProbe.records.every((record) => record.ended))).toBe(true);
}

// Simulate the native visibility signal while keeping Web Audio itself real.
async function setHidden(page, hidden) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test('the first gesture starts audio and confirm, dice and verdict cues schedule finite sound', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await instrument(page);
  await openBoard(page);
  expect(await page.evaluate(() => window.__audioProbe.contexts)).toBe(0);
  await page.locator('#zug-beenden').click();
  await expect.poll(() => page.evaluate(() => window.__audioProbe.ctx?.state)).toBe('running');
  await expect(page.locator('#dlg-probe')).toBeVisible();
  const afterConfirm = await sources(page);
  expect(afterConfirm).toBeGreaterThan(0);
  await page.locator('#dlg-probe [data-wuerfeln]').click();
  await expect(page.locator('#dlg-probe .pe-urteil')).toBeVisible();
  await expect.poll(() => sources(page)).toBeGreaterThan(afterConfirm + 8);
  await settleSources(page);
  expect(await page.evaluate(() => window.__audioProbe.contexts)).toBe(1);
  expect(errors).toEqual([]);
});

for (const surface of ['start', 'board']) {
  test(`${surface} stays silent after cues settle, including legacy settings, hover, motion and visibility changes`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await instrument(page);
    const retained = { master: 0.6, ui: 0.4, stingers: 0.3, muted: false, reduced: false };
    await page.addInitScript((settings) => localStorage.setItem('realmcraft.audio', JSON.stringify({ ...settings, ambience: 1 })), retained);
    if (surface === 'board') await openBoard(page);
    else {
      await page.goto(`${BASE}/spielbrett/`);
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    }
    expect(await page.evaluate(async () => (await import('/spielbrett/js/audio/index.js')).getAudio().settings)).toEqual(retained);
    expect(await page.evaluate(() => window.__audioProbe.contexts)).toBe(0);
    if (surface === 'start') await page.locator('#start-new').click();
    else await page.locator('#karte').click({ position: { x: 400, y: 200 } });
    await expect.poll(() => page.evaluate(() => window.__audioProbe.ctx?.state)).toBe('running');
    await settleSources(page);
    const settled = await sources(page);

    await setAudio(page, { master: 0.65, ui: 0.3, stingers: 0.2, ambience: 1, muted: true });
    await setAudio(page, { muted: false });
    await page.evaluate(async () => {
      const audio = (await import('/spielbrett/js/audio/index.js')).getAudio();
      audio.setReducedMotion(true);
      audio.setReducedMotion(false);
      audio.setReducedMotion(null);
    });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setHidden(page, true);
    await expect.poll(() => page.evaluate(() => window.__audioProbe.ctx.state)).toBe('suspended');
    await setHidden(page, false);
    await expect.poll(() => page.evaluate(() => window.__audioProbe.ctx.state)).toBe('running');
    const hoverTargets = surface === 'start' ? ['#start-settings', '#start-rules'] : ['#zug-beenden', '#menu-knopf'];
    for (const selector of hoverTargets) await page.locator(selector).hover();
    await page.waitForTimeout(200);
    expect(await sources(page)).toBe(settled);
    expect(await page.evaluate(() => window.__audioProbe.records.every((record) => record.ended && !record.loop))).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('realmcraft.audio')))).toEqual({ master: 0.65, ui: 0.3, stingers: 0.2, muted: false, reduced: null });
    expect(errors).toEqual([]);
  });
}

test('mute is stored per viewer and silences the next visit', async ({ page }) => {
  await instrument(page);
  await openBoard(page);
  await setAudio(page, { muted: true, ui: 0.4 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('realmcraft.audio')))).toMatchObject({ muted: true, ui: 0.4 });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  expect(await page.evaluate(async () => (await import('/spielbrett/js/audio/index.js')).getAudio().settings.muted)).toBe(true);
  await page.locator('#zug-beenden').click();
  await expect(page.locator('#dlg-probe')).toBeVisible();
  await page.locator('#dlg-probe [data-wuerfeln]').click();
  await expect(page.locator('#dlg-probe .pe-urteil')).toBeVisible();
  expect(await page.evaluate(() => window.__audioProbe.contexts)).toBe(1);
  expect(await sources(page)).toBe(0);
});

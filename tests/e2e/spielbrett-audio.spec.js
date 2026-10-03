// The board's synthesized audio in a real browser: no AudioContext before the
// first gesture, sound sources for the confirm, dice and band cues of the
// world-event roll, the ambience in the mood of the campaign world, and a
// persisted mute that silences the next visit. Sources are counted by
// wrapping the context's factory methods, so the test sees what is scheduled
// without listening to it.
// Run: PLAYWRIGHT_CHANNEL=chrome PORT=4426 npx playwright test --project=e2e tests/e2e/spielbrett-audio.spec.js

import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHochland } from '../fixtures/spielbrett/build.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const CID = 'e2e-audio';
// Port assigned to the audio lane, clear of the operator's live servers;
// SPEC_PORT pins another one when a run is limited to assigned ports.
const PORT = Number(process.env.SPEC_PORT) || 4425;
const BASE = `http://localhost:${PORT}`;

let root;
let server;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-spielbrett-audio-'));
  createHochland(root, CID);
  server = spawn(process.execPath, ['serve.mjs'], {
    cwd: REPO,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', REALMCRAFT_ROOT: root },
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

async function instrument(page) {
  await page.addInitScript(() => {
    const probe = { contexts: 0, sources: 0, oscillators: [] };
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
      const orig = BaseAudioContext.prototype[name];
      BaseAudioContext.prototype[name] = function counted(...args) {
        probe.sources += 1;
        const made = orig.apply(this, args);
        if (name === 'createOscillator') probe.oscillators.push(made);
        return made;
      };
    }
  });
}

const sources = (page) => page.evaluate(() => window.__audioProbe.sources);
const setAudio = (page, patch) => page.evaluate(async (p) => (await import('/spielbrett/js/audio/index.js')).getAudio().set(p), patch);

async function openBoard(page) {
  await page.goto(`${BASE}/spielbrett/?campaign=${CID}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

test('the first gesture starts the audio, confirm, dice and the band verdict schedule sound', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await instrument(page);
  await openBoard(page);
  // Without ambience every counted source belongs to a cue.
  await setAudio(page, { ambience: 0 });
  expect(await page.evaluate(() => window.__audioProbe.contexts)).toBe(0);

  await page.locator('#zug-beenden').click();
  await expect.poll(() => page.evaluate(() => window.__audioProbe.ctx?.state)).toBe('running');
  await expect(page.locator('#dlg-probe')).toBeVisible();
  const afterConfirm = await sources(page);
  expect(afterConfirm).toBeGreaterThan(0);

  await page.locator('#dlg-probe [data-wuerfeln]').click();
  await expect(page.locator('#dlg-probe .pe-urteil')).toBeVisible();
  // The rattle alone schedules several clicks, the verdict adds its band cue.
  await expect.poll(() => sources(page)).toBeGreaterThan(afterConfirm + 8);
  expect(await page.evaluate(() => window.__audioProbe.contexts)).toBe(1);
  expect(errors).toEqual([]);
});

test('the ambience starts with the first gesture in the mood of the campaign world', async ({ page }) => {
  await instrument(page);
  await openBoard(page);
  // A map click is one click tone, everything beyond it is ambience.
  await page.locator('#karte').click({ position: { x: 20, y: 20 } });
  await expect.poll(() => sources(page)).toBeGreaterThan(4);
  // The hochland drone sits on D2 (MIDI 38), not on the default root.
  const freqs = await page.evaluate(() => window.__audioProbe.oscillators.map((o) => o.frequency.value));
  expect(freqs.some((f) => Math.abs(f - 73.416) < 0.01)).toBe(true);
});

test('mute is stored per viewer and silences the next visit', async ({ page }) => {
  await instrument(page);
  await openBoard(page);
  await setAudio(page, { muted: true, ambience: 0 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('realmcraft.audio')))).toMatchObject({ muted: true, ambience: 0 });

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

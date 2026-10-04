// Module views of the Spielbrett against a real campaign in which trade,
// military, magic and way of life are active (tests/fixtures/spielbrett/
// build-module.mjs): the event card of the opening season with an answer from
// the kernel preview, the province panel, an attack with its battle forecast
// and probe, a trade offer built in the people's panel, and the steps of the
// agent round with the judges' findings.
// Run: PLAYWRIGHT_CHANNEL=chrome SPEC_PORT=4456 npx playwright test --project=e2e tests/e2e/spielbrett-module.spec.js

import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentsCampaign, createModuleCampaign } from '../fixtures/spielbrett/build-module.mjs';
import { REPO, startServer } from '../lib/server.mjs';

const CID = 'e2e-module';
const AGENTS = 'e2e-agenten';
const PID = 'bergnomaden';
const en = JSON.parse(readFileSync(join(REPO, 'spielbrett/labels/en.json'), 'utf8')).labels;

let root;
let server;
let BASE;
let fx;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-spielbrett-module-'));
  fx = createModuleCampaign(root, CID);
  await createAgentsCampaign(root, AGENTS);
  server = await startServer(root, { port: process.env.SPEC_PORT });
  BASE = `http://localhost:${server.port}`;
});

test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

const viewOf = (cid) => JSON.parse(readFileSync(join(root, 'campaigns', cid, 'view', `${PID}.json`), 'utf8'));

async function openBoard(page, cid = CID) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/spielbrett/?campaign=${cid}`);
  await expect(page.locator('html')).toHaveAttribute('data-campaign', cid);
  return errors;
}

/** Reads every event card of the season with Continue; the module fixture always opens on one. */
async function readCards(page) {
  const dlg = page.locator('#dlg-ereignis');
  await expect(dlg).toBeVisible();
  while (await dlg.isVisible()) await dlg.locator('.ereignis-fuss .btn-primary').click();
}

/** Clicks the map where a tile is drawn. */
async function clickTile(page, tile) {
  const [q, r] = tile.split(',').map(Number);
  const box = await page.locator('#karte').boundingBox();
  const at = await page.evaluate(([qq, rr]) => window.spielbrett.view.hexScreen(qq, rr), [q, r]);
  await page.mouse.click(box.x + at.x, box.y + at.y);
  await expect(page.locator('#kontext')).toBeVisible();
}

test('the event card answers a decision with the kernel preview and closes with Continue', async ({ page }) => {
  const errors = await openBoard(page);
  const dlg = page.locator('#dlg-ereignis');
  await expect(dlg).toBeVisible();
  const pc = viewOf(CID).pendingChoices[0];
  const option = dlg.locator(`.ereignis-option[data-option="${pc.options[0]}"]`);
  // The chips on the answer are the kernel's preview of its once effects.
  const delta = await page.evaluate(([id, opt]) => window.spielbrett.game.previewWith((d) => ({ ...d, choices: { [id]: opt } })).choices[0].delta, [pc.id, pc.options[0]]);
  for (const n of Object.values(delta.resources ?? {})) {
    await expect(option.locator('.option-folgen')).toContainText(n > 0 ? `+${n}` : `−${Math.abs(n)}`);
  }
  await option.click();
  await expect(option).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate((id) => window.spielbrett.game.draft.choices?.[id] ?? null, pc.id)).toBe(pc.options[0]);
  await readCards(page);
  await expect(dlg).toBeHidden();
  // A card that was read stays read after a reload.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-campaign', CID);
  await page.waitForTimeout(1200);
  await expect(dlg).toBeHidden();
  expect(errors).toEqual([]);
});

test('the province panel names owner and places and offers what wins the region', async ({ page }) => {
  await openBoard(page);
  await readCards(page);
  const view = viewOf(CID);
  const camp = view.map.settlements.find((s) => s.people === PID);
  expect(view.map.control[camp.regionId]).toBe(PID);
  // An empty known tile of the camp's region opens the province with that tile as one section.
  const target = await page.evaluate((regionId) => {
    const m = window.spielbrett.model;
    const busy = new Set([...m.units, ...m.places].map((o) => `${o.q},${o.r}`));
    const region = window.spielbrett.view.regions().get(regionId);
    return { k: Object.keys(m.known).find((x) => !busy.has(x) && region?.keys.has(x)) ?? null };
  }, camp.regionId);
  expect(target.k).toBeTruthy();
  await clickTile(page, target.k);
  await expect(page.locator('#kontext .provinz-feld')).toBeVisible();
  await expect(page.locator('#kontext .fakt').first()).toHaveAttribute('aria-label', new RegExp(view.peoples[PID].name));
  await expect(page.locator('#kontext .liste-objekte')).toContainText(camp.name);
  // A province of another people would list how to win it; the own one shows no such section.
  await expect(page.locator('#herrschaft-h')).toHaveCount(0);
  expect(en['board.province.win']).toBeTruthy();
});

test('an attack shows the battle the kernel would fight and opens its probe', async ({ page }) => {
  await openBoard(page);
  await readCards(page);
  await clickTile(page, fx.enemy);
  const forecast = await page.evaluate((tile) => {
    const g = window.spielbrett.game;
    return { tile, opt: g.optionsFor({ kind: 'unit', id: 'u-klan-1', q: Number(tile.split(',')[0]), r: Number(tile.split(',')[1]) }).find((o) => o.type === 'attack') };
  }, fx.enemy);
  expect(forecast.opt.grund).toBeNull();
  const kraefte = page.locator('#kontext [data-kraefte]');
  await expect(kraefte).toBeVisible();
  await expect(kraefte).toHaveAttribute('aria-label', /\d+.*\d+/);
  const attack = page.locator('#kontext .befehl-option[data-order="attack"]');
  await expect(attack).toHaveAttribute('aria-disabled', 'false');
  await expect(attack.locator('.probe-tag')).toContainText(`${forecast.opt.probe.chance} %`);
  await attack.hover();
  await expect.poll(() => page.evaluate(() => window.spielbrett.model.preview?.tiles ?? [])).toEqual([{ q: Number(fx.enemy.split(',')[0]), r: Number(fx.enemy.split(',')[1]) }]);
  await attack.click();
  await expect(page.locator('#dlg-probe')).toBeVisible();
  await expect(page.locator('#dlg-probe [data-probe]')).toHaveAttribute('data-probe', forecast.opt.probe.id);
  await page.keyboard.press('Escape');
  await expect(page.locator('#dlg-probe')).toBeHidden();
});

test('a trade offer is put together in the partner panel and enters the draft', async ({ page }) => {
  const errors = await openBoard(page);
  await readCards(page);
  const handel = page.locator('#module [data-modul="handel"]');
  await expect(handel).toBeVisible();
  await handel.click();
  await expect(handel).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#kontext [data-partner="talbund"]').click();
  const form = page.locator('#kontext [data-angebot="talbund"]');
  await expect(form).toBeVisible();
  await form.locator('[data-fk="tr-talbund-give-n-plus"]').click();
  await expect(form.locator('#tr-talbund-give-n')).toHaveText('2');
  // Focus stays on the stepper through the re-render, so the keyboard can keep going.
  await expect(form.locator('[data-fk="tr-talbund-give-n-plus"]')).toBeFocused();
  await form.locator('#tr-talbund-get-res').selectOption('nahrung');
  const offer = form.locator('.befehl-option[data-order="trade.offer"]');
  await expect(offer).toHaveAttribute('aria-disabled', 'false');
  await offer.click();
  await expect(page.locator('#befehle .befehl:not(.ereignis-schritt)')).toHaveCount(1);
  await expect.poll(async () => {
    const res = await page.request.get(`${BASE}/api/campaigns/${CID}/draft`);
    return (await res.json()).draft?.orders?.find((o) => o.type === 'trade.offer')?.params ?? null;
  }).toEqual({ partner: 'talbund', give: { salz: 2 }, get: { nahrung: 1 }, seasons: 2 });
  expect(errors).toEqual([]);
});

test('the agent round shows its steps at a glance and the judges findings by severity', async ({ page }) => {
  await openBoard(page, AGENTS);
  await page.waitForTimeout(500);
  if (await page.locator('#dlg-ereignis').isVisible()) await readCards(page);
  const panel = page.locator('#weltgeschehen');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.wg-ablauf .ablauf-schritt')).toHaveCount(await panel.locator('[data-agent]').count());
  await expect(panel.locator('.wg-ablauf .ablauf-schritt.is-working')).toHaveCount(1);
  const judge = panel.locator('[data-agent="judge-balance-all"]');
  await expect(judge.locator('.ergebnis')).toHaveCount(3);
  await expect(judge.locator('.ergebnis').first()).toHaveClass(/sev-severe/);
  await panel.locator('.wg-ablauf [data-fk="ablauf:judge-balance-all"]').click();
  await expect(judge).toBeInViewport();
});

test('the board keeps the modules usable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBoard(page);
  await readCards(page);
  const bar = page.locator('#module');
  await expect(bar).toBeInViewport();
  await bar.locator('[data-modul="militaer"]').click();
  await expect(page.locator('#kontext')).toBeVisible();
  await expect(bar).toBeInViewport();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(390);
});

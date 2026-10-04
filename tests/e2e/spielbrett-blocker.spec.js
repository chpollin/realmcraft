// The draft the owner could not seal in the playtest of 3 October 2026: two
// main orders for one main slot, a found in a region that already holds the
// player's settlement, a migrate into a region a rival controls, a roll whose
// probe is gone, a stale roll and the missing world-event roll. The board must
// name every blocker beside "Zug beenden", let each be fixed in place, and
// seal once they are gone.
// Run: PLAYWRIGHT_CHANNEL=chrome npx playwright test --project=e2e tests/e2e/spielbrett-blocker.spec.js

import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { startServer } from '../lib/server.mjs';

const CID = 'e2e-blocker';
const PID = 'bergnomaden';

let root;
let server;
let BASE;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-spielbrett-blocker-'));
  createHochland(root, CID);
  server = await startServer(root, { port: process.env.SPEC_PORT });
  BASE = `http://localhost:${server.port}`;
});

// The assertions read the German labels; English is the board's default language.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('realmcraft.settings', JSON.stringify({ language: 'de' })); } catch { /* storage blocked */ }
  });
});

test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

async function openBoard(page) {
  await page.goto(`${BASE}/spielbrett/?campaign=${CID}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

test('a second main order offers the swap instead of overflowing the slot', async ({ page }) => {
  await openBoard(page);
  // A main order in the draft, then a second tile whose migrate the kernel accepts on its own.
  // At turn 0 migrate is the only main order the fixture admits (found, institute and destiny.adopt are refused).
  const tile = await page.evaluate(() => {
    const g = window.spielbrett.game;
    const known = Object.keys(g.view.map.known[g.pid]);
    const first = known.map((k) => ({ type: 'migrate', params: { tile: k } })).find((c) => !g.previewOption(c).grund);
    // Migrating carries a probe, so the first order enters with a roll instead of opening the probe dialog.
    const opt = g.previewOption(first);
    const p = opt.probe.kernel;
    window.spielbrett.addCandidate(opt, { roll: { probe: p.id, value: 6, fingerprint: p.fingerprint } });
    const { model } = window.spielbrett;
    const empty = (k) => !model.units.some((u) => `${u.q},${u.r}` === k) && !model.places.some((p) => `${p.q},${p.r}` === k);
    return known.find((k) => {
      if (k === first.params.tile) return false;
      const o = g.previewOption({ type: 'migrate', params: { tile: k } });
      return o.ersatz && !o.ersatz.grund && empty(k);
    });
  });
  expect(tile).toBeTruthy();
  await expect(page.locator('#befehle .befehl[data-order-id="o1"]')).toHaveCount(1);
  await page.evaluate((k) => window.spielbrett.jumpToTile(k), tile);
  const migrate = page.locator('#kontext .befehl-option[data-order="migrate"]');
  await expect(migrate).toHaveAttribute('aria-disabled', 'true');
  // The kernel's reason key over-capacity picks the precise label issue.slots.over-capacity.
  await expect(migrate.locator('.bo-grund')).toHaveText('Mehr Befehle als Aktionen (2 für 1)');
  // Hovering the swap marks the order it would replace in the slot indicator.
  const swap = page.locator('#kontext [data-ersetzen="migrate"]');
  await swap.hover();
  await expect(page.locator('#budget .slot.haupt.is-ersetzt')).toHaveCount(1);
  await swap.click();
  // Migrating carries a probe: the swap goes through the probe dialog like any new order.
  await expect(page.locator('#dlg-probe')).toBeVisible();
  await page.locator('#dlg-probe [data-wuerfeln]').click();
  await expect(page.locator('#dlg-probe .pe-urteil')).toBeVisible();
  await page.locator('#dlg-probe .probe-aktionen button:not([hidden])').click();
  await expect.poll(() => page.evaluate(() => window.spielbrett.game.draft.orders.map((o) => o.type))).toEqual(['migrate']);
  await expect(page.locator('#befehle .befehl[data-order-id]:not([data-order-id="event"])')).toHaveCount(1);
  await expect(page.locator('#budget [data-slots="haupt"]')).toHaveAttribute('aria-label', 'Hauptaktionen 1 von 1 vergeben');
});

test('a broken stored draft names its blockers, they are fixed in place and the turn seals', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await openBoard(page);

  // The broken draft, built from the real projection: the rival's region and the probe ids come from the kernel.
  const broken = await page.evaluate(async () => {
    const { regionOf } = await import('/engine/world/index.js');
    const g = window.spielbrett.game;
    const camp = g.view.map.settlements.find((s) => s.people === g.pid).tile;
    const foreign = Object.keys(g.view.map.known[g.pid]).find((k) => {
      const [q, r] = k.split(',').map(Number);
      const owner = g.view.map.control[regionOf(g.world, q, r)];
      return owner && owner !== g.pid;
    });
    const draft = {
      ...g.draft,
      orders: [
        { id: 'o1', type: 'found', params: { tile: camp } },
        { id: 'o2', type: 'migrate', params: { tile: foreign } },
        { id: 'o3', type: 'explore', params: { tile: camp } },
      ],
      rolls: {
        [`T${g.view.turn}:${g.pid}:o9`]: { value: 4, fingerprint: '0123456789abcdef' },
        [`T${g.view.turn}:${g.pid}:o3`]: { value: 6, fingerprint: 'fedcba9876543210' },
      },
    };
    return { draft, foreign };
  });
  expect(broken.foreign, 'the start projection shows a region a rival controls').toBeTruthy();
  const stored = await page.request.post(`${BASE}/api/draft`, { data: { campaign: CID, people: PID, draft: broken.draft } });
  expect((await stored.json()).stored).toBe(true);

  await openBoard(page);
  await expect(page.locator('#befehle .befehl[data-order-id]:not([data-order-id="event"])')).toHaveCount(3);
  const counts = await page.evaluate(() => {
    const b = window.spielbrett.game.blockers();
    return { probleme: b.probleme.map((p) => p.kind), wuerfe: b.wuerfe.length, stale: b.wuerfe.filter((w) => w.veraltet).length };
  });
  expect(counts.probleme).toEqual(expect.arrayContaining(['slots', 'befehl', 'befehl', 'wurf-verwaist']));
  expect(counts.probleme).toHaveLength(4);
  expect(counts.wuerfe).toBe(2);
  expect(counts.stale).toBe(1);

  // Summary beside "Zug beenden", in German.
  await expect(page.locator('#blocker [data-blocker="probleme"]')).toHaveText('4 Probleme');
  await expect(page.locator('#blocker [data-blocker="wuerfe"]')).toHaveText('2 Würfe offen');
  // The world event is a step of its own in the turn bar.
  await expect(page.locator('#befehle [data-order-id="event"] [data-ereignis-wurf]')).toBeVisible();

  // Ending the turn does not seal: it opens the list of problems.
  let sealed = false;
  page.on('request', (r) => { if (r.url().endsWith('/api/seal')) sealed = true; });
  await page.locator('#zug-beenden').click();
  const list = page.locator('#blocker-liste');
  await expect(list).toBeVisible();
  await expect(list.locator('.blocker-eintrag')).toHaveCount(6);
  await expect(list).not.toContainText(/ is | has | must /);
  expect(sealed).toBe(false);

  // Fix in place: withdraw the two refused orders, discard the orphaned roll.
  for (const id of ['befehl-o1', 'befehl-o2']) {
    await list.locator(`[data-blocker-id="${id}"] [data-zuruecknehmen]`).click();
    await expect(list.locator(`[data-blocker-id="${id}"]`)).toHaveCount(0);
  }
  await list.locator('.be-wurf-verwaist [data-verwerfen]').click();
  await expect(page.locator('#blocker [data-blocker="probleme"]')).toHaveCount(0);
  await expect(page.locator('#blocker [data-blocker="wuerfe"]')).toHaveText('2 Würfe offen');

  // The stale roll is explained and rolled again in place.
  await page.locator('#blocker [data-blocker="wuerfe"]').click();
  await expect(page.locator('#dlg-probe')).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.locator('#dlg-probe [data-wuerfeln]').click();
    await expect(page.locator('#dlg-probe .pe-urteil')).toBeVisible();
    await page.locator('#dlg-probe .probe-aktionen button:not([hidden])').click();
  }
  await expect(page.locator('#dlg-probe')).toBeHidden();
  await expect(page.locator('#blocker')).toBeEmpty();
  expect(sealed).toBe(false);

  // Now the turn ends.
  const seal = page.waitForResponse((r) => r.url().endsWith('/api/seal'));
  await page.locator('#zug-beenden').click();
  expect((await (await seal).json()).ok).toBe(true);
  await expect(page.locator('#zugleiste')).toHaveClass(/is-locked/);
  expect(errors).toEqual([]);
});

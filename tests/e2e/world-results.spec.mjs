import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { createAgentsCampaign } from '../fixtures/spielbrett/build-module.mjs';
import { startServer } from '../lib/server.mjs';

let root, server, base;
test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-world-results-'));
  createHochland(root, 'fresh');
  await createAgentsCampaign(root, 'resolved');
  server = await startServer(root);
  base = `http://127.0.0.1:${server.port}`;
});
test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});
async function open(page, cid) {
  await page.addInitScript(() => localStorage.setItem('realmcraft.settings', JSON.stringify({ language: 'de', reduced: true })));
  await page.goto(`${base}/spielbrett/?campaign=${cid}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
}

test('a fresh kernel status has no literal null or empty disclosure', async ({ page }) => {
  await open(page, 'fresh');
  // A status event may arrive before the first round report exists.
  await page.evaluate(async () => {
    const api = window.spielbrett;
    const { t } = await import('/spielbrett/js/i18n/index.js');
    api.model.zz = {
      phase: api.model.phase,
      phaseTitel: t.fmt('board.phase.planning', { phase: t('phase.planning') }),
      von: api.model.zeit,
      nach: api.model.naechsteZeit,
      agenten: [{ id: 'kern', role: 'kernel', name: t('agent.kernel'), status: 'fertig', taetigkeit: '', results: [] }],
    };
    api.setPanel('welt');
  });
  const panel = page.locator('#weltgeschehen');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.wg-kern-empty')).toContainText('Noch keine Zugergebnisse vorhanden.');
  await expect(panel.locator('summary, .wg-chevron, .wg-kern-empty .agent-status.fertig')).toHaveCount(0);
  expect(await panel.evaluate((node) => [...node.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent.trim()).filter(Boolean))).toEqual([]);
});

test('real kernel results expand with pointer and keyboard and retain state on refresh', async ({ page }) => {
  await open(page, 'resolved');
  const cards = page.locator('#dlg-ereignis');
  await expect(cards).toBeVisible();
  if (await cards.isVisible()) {
    while (await cards.isVisible()) await cards.locator('.ereignis-fuss .btn-primary').click();
  }
  await page.evaluate(() => window.spielbrett.setPanel('welt'));
  const panel = page.locator('#weltgeschehen');
  const details = panel.locator('details.wg-kern');
  const summary = details.locator('summary');
  await expect(details).toHaveAttribute('open', '');
  expect(await details.locator('.ergebnis').count()).toBeGreaterThan(0);
  await summary.click();
  await expect(details).not.toHaveAttribute('open');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('.ergebnisse')).toBeVisible();
  await summary.click();
  await expect(details).not.toHaveAttribute('open');
  await expect.poll(() => page.evaluate(() => window.spielbrett.model.zz.kernOffen)).toBe(false);
  await page.evaluate(async () => {
    const { renderWeltgeschehen } = await import('/spielbrett/js/ui/weltgeschehen.js');
    renderWeltgeschehen(window.spielbrett);
  });
  await expect(details).not.toHaveAttribute('open');
  await expect(summary).toBeFocused();
});

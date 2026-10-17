import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startServer } from '../lib/server.mjs';

for (const width of [1440, 390]) test(`season plan, two offline seasons and restore at ${width}px`, async ({ page }, info) => {
  test.setTimeout(90000);
  const root = mkdtempSync(join(tmpdir(), 'rc-season-ui-'));
  const server = await startServer(root, { demo: true });
  const base = `http://127.0.0.1:${server.port}`;
  page.on('pageerror', (err) => { throw err; });
  try {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => localStorage.setItem('realmcraft.settings', JSON.stringify({ language: 'de', reduced: true })));
    const draft = (await (await page.request.post(`${base}/api/realms/draft`, { data: {
      world: 'Erinnerungen bleiben als messbare Spuren im Fluss. Mobile Werkstätten vergleichen Messungen.',
      people: 'Die Pegelhüter entscheiden gemeinsam im Rat über Wissen und Vorräte.', language: 'de', seed: 8293,
    } })).json()).draft;
    draft.world.name = 'Die Ströme von Orin'; draft.world.landscape = 'riverlands';
    draft.people.name = 'Gemeinschaft der Pegelhüter';
    const preview = await (await page.request.post(`${base}/api/realms/preview`, { data: { draft } })).json();
    const created = await (await page.request.post(`${base}/api/realms/start`, { data: {
      draft, fingerprint: preview.fingerprint, startKey: randomUUID(),
    } })).json();
    expect(created.ok).toBe(true);
    const cid = created.id;
    const readDraft = async () => (await (await page.request.get(`${base}/api/campaigns/${cid}/draft`)).json()).draft;
    await page.goto(`${base}/spielbrett/?campaign=${cid}`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await page.locator('[data-dialog="saison"]').click();
    await expect(page.locator('#dlg-saison')).toBeVisible();
    await expect(page.locator('#dlg-saison')).toContainText('Wirtschaft zeigt Ertrag');
    await expect(page.locator('#dlg-saison [data-arbeit="wissen"]')).toHaveCount(0);
    const less = page.locator('#dlg-saison [data-fk="labour:nahrung:-1"]');
    const food = Number(await page.locator('#dlg-saison [data-arbeit="nahrung"] .arbeit-zahl').textContent());
    await less.focus(); await page.keyboard.press('Enter');
    await expect(less).toBeFocused();
    await expect(page.locator('#dlg-saison [data-arbeit="nahrung"] .arbeit-zahl')).toHaveText(String(food - 1));
    await page.locator('#dlg-saison [data-fk="labour:research:1"]').click();
    await expect(page.locator('#dlg-saison [data-arbeit="research"] .arbeit-zahl')).toHaveText('1');
    expect(await page.locator('#dlg-saison').evaluate((d) => d.scrollWidth <= d.clientWidth)).toBe(true);
    await page.locator('#saison-arbeit').scrollIntoViewIfNeeded();
    await page.screenshot({ animations: 'disabled', path: info.outputPath(`season-plan-${width}.png`) });
    await page.locator('#dlg-saison [data-season-slot="neben"]').click();
    await page.locator('#dlg-planen [data-plan-type="explore"]').click();
    await page.locator('#plan-option .befehl-option[data-order="explore"]').click();
    await page.locator('#dlg-probe [data-wuerfeln]').click();
    await page.locator('#dlg-probe').getByRole('button', { name: 'In die Befehle', exact: true }).click();
    await expect.poll(async () => (await readDraft())?.orders?.length ?? 0).toBe(1);
    await page.locator('#menu-knopf').click();
    await page.locator('[data-menu="save"]').click();
    await page.locator('#save-label').fill('Vor dem ersten Aufbruch');
    const saving = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/saves'));
    await page.locator('#save-create').click();
    const { save } = await (await saving).json();
    const planned = await readDraft();
    await page.keyboard.press('Escape');
    await page.locator('[data-menu="resume"]').click();
    for (let turn = 0; turn < 2; turn++) {
      await page.locator('[data-dialog="saison"]').click();
      await page.locator('#dlg-saison').getByRole('button', { name: 'Saison abschließen', exact: true }).click();
      await page.locator('#dlg-probe [data-wuerfeln]').click();
      await expect(page.locator('#dlg-probe .pe-urteil')).toBeVisible();
      await page.locator('#dlg-probe').getByRole('button', { name: 'Zug beenden', exact: true }).click();
      if (await page.locator('#dlg-zug').isVisible()) await page.locator('#dlg-zug .btn-primary').click();
      await expect(page.locator('#weltgeschehen [data-fk="demo-turn"]')).toBeVisible();
      await expect(page.locator('#weltgeschehen')).toContainText('Keine LLM-Agenten');
      const continuation = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() });
      await page.locator('#weltgeschehen [data-fk="demo-turn"]').click();
      await continuation;
      await expect.poll(async () => {
        const rows = await (await page.request.get(`${base}/api/campaigns`)).json();
        return rows.find((r) => r.id === cid).turn;
      }).toBe(turn + 1);
      await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
      await expect.poll(() => page.evaluate(() => window.spielbrett?.game.view.turn)).toBe(turn + 1);
      await expect(page.locator('#dlg-ereignis')).toBeVisible();
      while (await page.locator('#dlg-ereignis').isVisible()) await page.locator('#dlg-ereignis [data-fokus="weiter"]').click();
      await page.locator('[data-dialog="saison"]').click();
      await expect(page.locator('#dlg-saison')).toContainText('Protokollierte Änderungen');
      await page.locator('#dlg-saison .overlay-body').evaluate((body) => { body.scrollTop = body.scrollHeight; });
      await page.screenshot({ animations: 'disabled', path: info.outputPath(`season-result-${width}-${turn}.png`) });
      await page.locator('#dlg-saison').getByRole('button', { name: 'Weiter planen', exact: true }).click();
    }
    await page.route('**/log/T0001.json', (route) => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    if (await page.locator('#dlg-ereignis').isVisible()) await page.keyboard.press('Escape');
    if (await page.locator('#dlg-menu').isVisible()) await page.locator('[data-menu="resume"]').click();
    await page.locator('[data-dialog="saison"]').click();
    await expect(page.locator('#dlg-saison')).toContainText('Noch kein Bericht');
    await page.unroute('**/log/T0001.json');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    if (await page.locator('#dlg-ereignis').isVisible()) await page.keyboard.press('Escape');
    if (!await page.locator('#dlg-menu').isVisible()) await page.locator('#menu-knopf').click();
    await page.locator('[data-menu="load"]').click();
    await page.locator(`[data-load-slot="${save.slot}"]`).click();
    const restoring = page.waitForEvent('framenavigated', { predicate: (frame) => frame === page.mainFrame() });
    await page.locator('#save-load-confirm').click();
    await restoring;
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect.poll(() => page.evaluate(() => window.spielbrett?.game.view.turn)).toBe(0);
    expect(await readDraft()).toEqual(planned);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    expect(await page.evaluate(() => window.spielbrett.game.draft)).toEqual(planned);
    const saves = (await (await page.request.get(`${base}/api/campaigns/${cid}/saves`)).json()).saves;
    expect(saves.some((s) => s.auto?.reason === 'load' && s.turn === 2)).toBe(true);
  } finally { await server.stop(); rmSync(root, { recursive: true, force: true }); }
});

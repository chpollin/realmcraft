// Paths wheel, council strip, probe dialog and destinies against a real
// campaign: research chosen on a path in the wheel gathers its points across a
// season boundary that the kernel CLI resolves, the council strip shows place
// and strengths from the kernel's council view, the probe dialog shows the
// bonus and chance per member, and the destinies show rivals only once the
// view reveals them.
//
// The campaign lives in a temporary REALMCRAFT_ROOT served by its own
// serve.mjs (see spielbrett-real.spec.js).
// Run: PLAYWRIGHT_CHANNEL=chrome SPEC_PORT=4453 npx playwright test --project=e2e tests/e2e/spielbrett-pfade.spec.js

import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { REPO, startServer } from '../lib/server.mjs';

const CID = 'e2e-pfade';
const PID = 'bergnomaden';

const json = (p) => JSON.parse(readFileSync(join(REPO, p), 'utf8'));
const en = json('spielbrett/labels/en.json').labels;
const de = json('spielbrett/labels/de.json').labels;
const fill = (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => (p[k] ?? m));

let root;
let server;
let BASE;

const cli = (...args) => JSON.parse(execFileSync(process.execPath, ['engine/cli.mjs', ...args, '--campaign', CID, '--json'], { cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8' }));
const viewFile = () => JSON.parse(readFileSync(join(root, 'campaigns', CID, 'view', `${PID}.json`), 'utf8'));
const storedDraft = async (page) => (await (await page.request.get(`${BASE}/api/campaigns/${CID}/draft`)).json()).draft;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-pfade-e2e-'));
  createHochland(root, CID);
  server = await startServer(root, { port: process.env.SPEC_PORT });
  BASE = `http://localhost:${server.port}`;
});

test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

async function openBoard(page, { lang = 'en', patchView } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((l) => {
    try { localStorage.setItem('realmcraft.settings', JSON.stringify({ language: l })); } catch { /* storage blocked */ }
  }, lang);
  if (patchView) {
    await page.route(`**/campaigns/${CID}/view/${PID}.json`, async (route) => {
      const res = await route.fetch();
      const view = await res.json();
      patchView(view);
      await route.fulfill({ response: res, json: view });
    });
  }
  await page.goto(`${BASE}/spielbrett/?campaign=${CID}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await dismissEvents(page);
  return errors;
}

/** After the season boundary the new season's event cards open first; Continue walks through them. */
async function dismissEvents(page) {
  const card = page.locator('#dlg-ereignis[open]');
  await page.waitForTimeout(300);
  for (let i = 0; i < 8 && await card.count(); i++) {
    await card.locator('[data-fokus="weiter"]').click();
    await page.waitForTimeout(150);
  }
}

const wheel = (page) => page.locator('#dlg-entwicklungen');

test('the wheel shows one spoke per path with tier, closed paths and the research points', async ({ page }) => {
  const errors = await openBoard(page);
  const view = viewFile();
  const pfade = view.derived[PID].pfade;
  await page.keyboard.press('e');
  await expect(wheel(page)).toBeVisible();
  await expect(wheel(page).locator('h2')).toHaveText(en['board.paths.title']);
  await expect(wheel(page).locator('.pf-pfad')).toHaveCount(pfade.paths.length);
  // Magie opens only through practice; at the start it is closed.
  const magie = pfade.paths.find((p) => p.id === 'magie');
  expect(magie.open).toBe(false);
  await expect(wheel(page).locator('.pf-pfad[data-pfad="magie"]')).toHaveAttribute('aria-label', new RegExp(en['board.paths.state.closed']));
  await expect(wheel(page).locator('.pf-sektor[data-sektor="magie"]')).toHaveClass(/is-zu/);
  // Every known achievement and candidate of the view sits on the wheel.
  const refs = pfade.paths.flatMap((p) => [...p.known, ...p.research, ...p.candidates]);
  for (const ref of refs) await expect(wheel(page).locator(`.pf-knoten[data-ref="${ref}"]`)).toHaveCount(1);
  await expect(wheel(page).locator('.pf-nabe')).toHaveAttribute('aria-label', fill(en['board.paths.points'], { n: pfade.points.total }));
  // A closed path offers no direction; its panel names what opens it.
  await wheel(page).locator('.pf-pfad[data-pfad="magie"]').click();
  await expect(wheel(page).locator('.pf-panel [data-lenken]')).toHaveCount(0);
  await expect(wheel(page).locator(`.pf-panel [aria-label="${en['board.paths.opens']}"]`)).toHaveCount(1);
  // Keyboard: arrows walk the paths and Enter selects.
  await wheel(page).locator('.pf-pfad[data-pfad="nahrung"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(wheel(page).locator('.pf-pfad[data-pfad="gemeinschaft"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(wheel(page).locator('.pf-panel h3')).toHaveText(json('welten/hochland/labels.en.json').labels['pfad.gemeinschaft']);
  expect(errors).toEqual([]);
});

test('the refusal of a closed path comes from the issue label in both languages', async ({ page }) => {
  for (const [lang, labels] of [['en', en], ['de', de]]) {
    await openBoard(page, { lang });
    const grund = await page.evaluate(() => window.spielbrett.game.previewOption({ type: 'research.direct', params: { pfad: 'magie' } }).grund);
    expect(grund).toBe(labels['issue.target.pfad-closed']);
  }
});

test('research chosen on a path replaces the previous choice and is stored in the draft', async ({ page }) => {
  await openBoard(page);
  const cands = viewFile().derived[PID].pfade.paths.flatMap((p) => p.candidates.map((ref) => ({ ref, pfad: p.id })));
  expect(cands.length).toBeGreaterThanOrEqual(2);
  // fluchtburg costs more than one season's points, so the next test can watch it run across the boundary.
  const first = cands.find((c) => c.ref === 'fluchtburg@1') ?? cands[0];
  const second = cands.find((c) => c.ref !== first.ref);
  await page.keyboard.press('e');
  await wheel(page).locator(`.pf-knoten[data-ref="${second.ref}"]`).click();
  await wheel(page).locator('.pf-panel [data-forschen]').click();
  await expect(wheel(page).locator('.pf-panel [data-forschen]')).toHaveAttribute('aria-pressed', 'true');
  // A second choice names the one it replaces before it is made.
  await wheel(page).locator(`.pf-knoten[data-ref="${first.ref}"]`).click();
  const name = await page.evaluate((ref) => window.spielbrett.game.env.entwicklung(ref).name, second.ref);
  await expect(wheel(page).locator('.pf-panel .pf-ersetzt')).toContainText(name);
  await wheel(page).locator('.pf-panel [data-forschen]').click();
  await expect.poll(async () => (await storedDraft(page))?.orders?.filter((o) => o.type === 'research.assign') ?? []).toEqual([{ id: 'o1', type: 'research.assign', params: { development: first.ref } }]);
  // The research budget in the turn bar carries the season's points and the chosen project.
  const now = await page.evaluate(() => {
    const g = window.spielbrett.game;
    return { name: g.env.entwicklung(g.draft.orders.find((o) => o.type === 'research.assign').params.development).name };
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('#budget [data-forschung]')).toContainText(now.name);
  await expect(page.locator('#budget [data-forschung]')).toHaveAttribute('aria-label', new RegExp(fill(en['board.paths.points'], { n: viewFile().derived[PID].pfade.points.total })));
});

test('a direction on a path is one research.direct, a new one replaces it', async ({ page }) => {
  await openBoard(page);
  await page.keyboard.press('e');
  await wheel(page).locator('.pf-pfad[data-pfad="nahrung"]').click();
  await wheel(page).locator('.pf-panel [data-tag]').first().check();
  await wheel(page).locator('.pf-panel [data-lenken]').click();
  await wheel(page).locator('.pf-pfad[data-pfad="werk"]').click();
  await wheel(page).locator('.pf-panel [data-lenken]').click();
  await expect.poll(async () => (await storedDraft(page))?.orders?.filter((o) => o.type === 'research.direct').map((o) => o.params.pfad) ?? []).toEqual(['werk']);
  // Withdrawn again so the season boundary test runs on the research choice alone.
  const id = await page.evaluate(() => window.spielbrett.game.draft.orders.find((o) => o.type === 'research.direct').id);
  await page.keyboard.press('Escape');
  await page.evaluate((oid) => window.spielbrett.removeOrder(oid), id);
  await expect.poll(async () => (await storedDraft(page))?.orders?.some((o) => o.type === 'research.direct')).toBe(false);
});

test('research gathers its points across the season boundary the kernel resolves', async ({ page }) => {
  await openBoard(page);
  const chosen = (await storedDraft(page)).orders.find((o) => o.type === 'research.assign').params.development;
  expect(await page.evaluate(() => window.spielbrett.game.draft.orders.find((o) => o.type === 'research.assign')?.params.development)).toBe(chosen);
  // End the turn: the world event roll is owed, then the draft is sealed.
  await page.locator('#zug-beenden').click();
  await expect(page.locator('#dlg-probe')).toBeVisible();
  await page.locator('#dlg-probe [data-wuerfeln]').click();
  await expect(page.locator('#dlg-probe .pe-urteil')).toBeVisible();
  const seal = page.waitForResponse((r) => r.url().endsWith('/api/seal'));
  await page.locator('#dlg-probe .probe-aktionen button:not([hidden])').click();
  expect((await (await seal).json()).ok).toBe(true);
  // The kernel resolves the season and opens the next one; the board follows by server-sent events.
  cli('apply');
  cli('open');
  const view = viewFile();
  expect(view.turn).toBe(1);
  const research = view.peoples[PID].developments.research.find((r) => r.ref === chosen);
  expect(research.progress).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.spielbrett.game.view.turn), { timeout: 15_000 }).toBe(1);
  await page.keyboard.press('e');
  const node = wheel(page).locator(`.pf-knoten[data-ref="${chosen}"]`);
  await expect(node).toHaveClass(/s-research/);
  await node.click();
  await expect(wheel(page).locator('.pf-panel .pf-balken')).toHaveAttribute('aria-valuenow', String(research.progress));
  // Without a new choice the running project takes the next season's points as well.
  await expect(wheel(page).locator('.pf-panel [data-zuwachs]')).toBeVisible();
});

test('the council strip shows place, task and strengths from the kernel council view', async ({ page }) => {
  const away = {};
  await openBoard(page, {
    patchView: (view) => {
      // One member stands away from home, as after leading an order: the place chip and the way to the map appear.
      const home = view.map.settlements.find((s) => s.people === view.people).tile;
      const tile = Object.keys(view.map.known[view.people]).find((k) => k !== home);
      const c = view.derived[view.people].council[0];
      Object.assign(away, { id: c.id, tile });
      c.location = { tile, settlement: null };
    },
  });
  const derived = viewFile().derived[PID].council;
  const strip = page.locator('#ratsleiste');
  if ((await strip.getAttribute('data-zu')) === 'true') await strip.locator('.rl-schalter').click();
  for (const c of derived) {
    const card = strip.locator(`[data-rat="${c.id}"]`);
    await expect(card).toHaveAttribute('aria-label', new RegExp(`${en['board.council.lead-probe']} ${c.strengths.lead > 0 ? '\\+' : c.strengths.lead < 0 ? '−' : ''}${Math.abs(c.strengths.lead)}`));
    await expect(card.locator('[data-fuehrung]')).toHaveAttribute('data-fuehrung', String(c.strengths.lead));
  }
  const home = viewFile().map.settlements.find((s) => s.people === PID);
  const atHome = derived.find((c) => c.id !== away.id);
  await expect(strip.locator(`[data-rat="${atHome.id}"]`)).toHaveAttribute('aria-label', new RegExp(home.name));
  await expect(strip.locator(`[data-rat="${away.id}"] .rl-chip.ort`)).toHaveAttribute('data-ort', away.tile);
  await expect(strip.locator(`[data-rat="${atHome.id}"] .rl-chip.ort`)).toHaveCount(0);
  await strip.locator(`[data-zeigen="${away.id}"]`).click();
  const sel = await page.evaluate(() => window.spielbrett.model.selection);
  expect(`${sel.q},${sel.r}`).toBe(away.tile);
});

test('the probe dialog shows bonus and chance per council member from the kernel preview', async ({ page }) => {
  await openBoard(page);
  const box = await page.locator('#karte').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('#kontext .befehl-option[data-order="explore"]').click();
  await expect(page.locator('#dlg-probe')).toBeVisible();
  const expected = await page.evaluate(() => {
    const g = window.spielbrett.game;
    const home = window.spielbrett.model.home;
    const opt = g.optionsFor({ kind: 'unit', id: home.id, q: home.q, r: home.r }).find((o) => o.type === 'explore');
    const none = g.previewOption(opt, {});
    return g.view.peoples[g.pid].council.map((m) => {
      const v = g.previewOption(opt, { lead: m.id });
      return { id: m.id, chance: v.probe?.chance ?? null, delta: v.probe ? v.probe.modTotal - none.probe.modTotal : null, grund: v.grund };
    });
  });
  for (const m of expected) {
    const row = page.locator(`#dlg-probe [data-fuehrung="${m.id}"]`).locator('xpath=..');
    if (m.grund) {
      await expect(row.locator('.po-grund')).toHaveText(m.grund);
      continue;
    }
    await expect(row.locator('.po-chance')).toHaveText(`${m.chance} %`);
    await expect(row.locator('.po-wirkung')).toHaveText(m.delta > 0 ? `+${m.delta}` : m.delta < 0 ? `−${Math.abs(m.delta)}` : '0');
  }
  // Choosing a member changes the chance of the whole probe to that member's row.
  const best = expected.filter((m) => !m.grund).sort((a, b) => b.chance - a.chance)[0];
  await page.locator(`#dlg-probe [data-fuehrung="${best.id}"]`).check();
  await expect(page.locator('#dlg-probe .chance-wert strong')).toHaveText(`${best.chance} %`);
});

test('destinies show the own milestones and a rival only once the view reveals it', async ({ page }) => {
  await openBoard(page);
  await page.keyboard.press('b');
  const dlg = page.locator('#dlg-bestimmung');
  await expect(dlg).toBeVisible();
  const own = viewFile().peoples[PID].bestimmung;
  await expect(dlg.locator('.bst-spalte.spieler .meilenstein')).toHaveCount(own.milestones.length);
  expect(viewFile().derived[PID].rivals.every((r) => r.destiny === null)).toBe(true);
  await expect(dlg.locator('[data-rivale]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  const revealed = { name: 'Testbestimmung', milestones: [{ id: 'm1', text: 'Erster Schritt', reached: true }, { id: 'm2', text: 'Zweiter Schritt', reached: false }] };
  const page2 = await page.context().newPage();
  await openBoard(page2, { patchView: (view) => { view.derived[view.people].rivals[0].destiny = { ref: 'x@1', ...revealed }; } });
  await page2.keyboard.press('b');
  const rival = viewFile().derived[PID].rivals[0].people;
  const col = page2.locator(`#dlg-bestimmung [data-rivale="${rival}"]`);
  await expect(col).toHaveCount(1);
  await expect(col.locator('.bst-name')).toHaveText(revealed.name);
  await expect(col.locator('.meilenstein')).toHaveCount(2);
  await expect(col.locator('.meilenstein.erreicht')).toHaveCount(1);
  await expect(page2.locator('#dlg-bestimmung [data-rivale]')).toHaveCount(1);
});

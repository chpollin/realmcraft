// One-off: screenshot the REAL app (served), loading a save, across all views.
//   PORT=<p> node serve.mjs   (must be running)
//   PORT=<p> SAVE=<file> node design/app-screenshot.mjs
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const ROOT = 'C:/Users/Chrisi/Documents/GitHub/chpollin/realmcraft';
const PORT = process.env.PORT || 4173;
const BASE = `http://localhost:${PORT}`;
const OUT = join(ROOT, 'design', 'screenshots');
const save = process.env.SAVE || 'examples/die-karren-kapitel-4.json';
const fixture = join(ROOT, save);
const tag = process.env.TAG || 'ch4';

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }).then((c) => c.newPage());

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForTimeout(700);
await page.setInputFiles('[data-testid="load-input"]', fixture);
await page.waitForTimeout(1100);

for (const v of ['lage', 'berater', 'welt', 'karte', 'historie']) {
  await page.evaluate((view) => { location.hash = '#/' + view; }, v);
  await page.waitForTimeout(650);
  await page.screenshot({ path: join(OUT, `app-${tag}-${v}.png`), fullPage: true });
  console.log('shot app-' + tag + '-' + v + '.png');
}

const realm = await page.locator('[data-testid="realm-name"]').first().textContent().catch(() => '(none)');
const advisors = await page.locator('[data-testid="advisor-card"]').count().catch(() => -1);
const groups = await page.locator('[data-testid="group-row"]').count().catch(() => -1);
const setzungen = await page.locator('[data-testid="setzung"]').count().catch(() => -1);
console.log(`realm=${JSON.stringify(realm)} advisors=${advisors} groups=${groups} setzungen=${setzungen} consoleErrors=${errors.length}`);
if (errors.length) console.log(errors.slice(0, 6).join('\n'));

await browser.close();

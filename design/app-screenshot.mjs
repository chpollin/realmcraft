// One-off: screenshot the REAL app (served), loading the example save, across all views.
//   PORT=4178 node serve.mjs  (must be running)
//   node design/app-screenshot.mjs
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const ROOT = 'C:/Users/Chrisi/Documents/GitHub/chpollin/realmcraft';
const BASE = 'http://localhost:4178';
const OUT = join(ROOT, 'design', 'screenshots');
const fixture = join(ROOT, 'examples', 'die-karren-kapitel-3.json');

const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }).then(c => c.newPage());

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));

await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForTimeout(800);

// Load the savegame via the hidden file input.
await page.setInputFiles('[data-testid="load-input"]', fixture);
await page.waitForTimeout(1200);

const views = ['lage', 'berater', 'welt', 'karte', 'historie'];
for (const v of views) {
  try {
    await page.evaluate(view => { location.hash = '#/' + view; }, v);
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, 'app-' + v + '.png'), fullPage: true });
    console.log('shot app-' + v + '.png');
  } catch (e) {
    console.log('FAILED ' + v + ': ' + String(e.message).split('\n')[0]);
  }
}

// quick assertions to confirm data bound
const realm = await page.locator('[data-testid="realm-name"]').first().textContent().catch(() => '(none)');
const advisorCount = await page.locator('[data-testid="advisor-card"]').count().catch(() => -1);
console.log('realm-name=' + JSON.stringify(realm) + ' advisorCards=' + advisorCount);
console.log('consoleErrors=' + errors.length);
if (errors.length) console.log(errors.slice(0, 8).join('\n'));

await browser.close();

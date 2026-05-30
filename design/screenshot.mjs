// One-off helper: render each design prototype and capture Lage + Berater screenshots.
//   node design/screenshot.mjs
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const ROOT = 'C:/Users/Chrisi/Documents/GitHub/chpollin/realmcraft';
const slugs = ['war-table', 'chronicle', 'codex', 'console'];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

for (const slug of slugs) {
  const page = await ctx.newPage();
  const url = pathToFileURL(join(ROOT, 'design', 'prototypes', slug + '.html')).href;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1500); // let webfonts settle
  await page.screenshot({ path: join(ROOT, 'design', 'screenshots', slug + '-1-lage.png'), fullPage: true });
  try {
    await page.getByText('Berater', { exact: false }).first().click({ timeout: 2500 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(ROOT, 'design', 'screenshots', slug + '-2-berater.png'), fullPage: true });
    console.log(slug + ': ok (lage + berater)');
  } catch (e) {
    console.log(slug + ': lage only — ' + String(e.message).split('\n')[0]);
  }
  await page.close();
}

await browser.close();
console.log('screenshots done');

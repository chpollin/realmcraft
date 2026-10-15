import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { startServer, REPO } from '../lib/server.mjs';
let root, server, base;
test.beforeAll(async () => {
  root=mkdtempSync(join(tmpdir(),'rc-map-usability-'));
  createHochland(root,'map-check');
  server=await startServer(root);
  base='http://localhost:'+server.port;
});
test.afterAll(async () => { await server?.stop(); if(root) rmSync(root,{recursive:true,force:true}); });
async function open(page) {
  await page.addInitScript(() => localStorage.setItem('realmcraft.settings',JSON.stringify({language:'de',reduced:true})));
  await page.goto(base+'/spielbrett/?campaign=map-check');
  await expect(page.locator('html')).toHaveAttribute('data-ready','true');
}
for(const width of [390,1280,2560]) test('known world fits the available map at '+width, async ({page})=>{
  await page.setViewportSize({width,height:900});
  await open(page);
  const positions=()=>page.evaluate(()=>{
    const api=window.spielbrett;
    const rect=document.getElementById('karte').getBoundingClientRect();
    const council=document.getElementById('ratsleiste').getBoundingClientRect();
    const points=Object.keys(api.model.known).map(key=>{
      const [q,r]=key.split(',').map(Number);
      return api.view.hexScreen(q,r);
    });
    return {points,w:rect.width,h:rect.height,left:innerWidth>760?council.right-rect.left:0};
  });
  await expect.poll(async()=>{
    const {points,w,h,left}=await positions();
    return points.every(p=>p.x>left && p.x<w && p.y>0 && p.y<h);
  }).toBe(true);
  const {points,w,h,left}=await positions();
  const spanX=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x));
  const spanY=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));
  expect(Math.max(spanX/(w-left),spanY/h)).toBeGreaterThan(0.5);
  const zoomBefore=await page.evaluate(()=>window.spielbrett.view.cam.z);
  await page.getByRole('button',{name:'Herauszoomen (Minus)',exact:true}).click();
  expect(await page.evaluate(()=>window.spielbrett.view.cam.z)).toBeLessThanOrEqual(zoomBefore);
  const canvas=page.locator('#karte');
  await canvas.focus();
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'Bekannte Welt einpassen',exact:true}).click();
  await expect.poll(async()=>{const {points,w,h,left}=await positions();return points.every(p=>p.x>left&&p.x<w&&p.y>0&&p.y<h);}).toBe(true);
});
test('pointer selection, dragging and keyboard selection remain available',async({page})=>{
  await open(page);
  const canvas=page.locator('#karte');
  const box=await canvas.boundingBox();
  const target=await page.evaluate(()=>{
    const a=window.spielbrett;return a.view.hexScreen(a.model.home.q,a.model.home.r);
  });
  await page.mouse.click(box.x+target.x,box.y+target.y);
  await expect(page.locator('#kontext')).toBeVisible();
  await page.keyboard.press('Escape');
  await canvas.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#kontext')).toBeVisible();
  await page.keyboard.press('Escape');
  const before=await page.evaluate(()=>window.spielbrett.view.cam.x);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+100,box.y+box.height/2+30,{steps:5});
  await page.mouse.up();
  expect(await page.evaluate(()=>window.spielbrett.view.cam.x)).not.toBe(before);
});
test('shortcuts leave an open dialog and focused buttons intact',async({page})=>{
  await open(page);
  await page.locator('[data-dialog="rat"]').click();
  await page.keyboard.press('e');
  await expect(page.locator('#dlg-rat')).toBeVisible();
  await expect(page.locator('#dlg-entwicklungen')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#menu-knopf').focus();
  await page.keyboard.press('e');
  await expect(page.locator('#dlg-entwicklungen')).not.toBeVisible();
  await page.locator('#karte').focus();
  await page.keyboard.press('e');
  await expect(page.locator('#dlg-entwicklungen')).toBeVisible();
});
test('an empty turn requires an explicit review and can be cancelled',async({page})=>{
  await open(page);
  // Record the player's real die value via the CLI to isolate the final-seal review.
  execFileSync(process.execPath,['engine/cli.mjs','roll','T0:bergnomaden:event','6','--campaign','map-check','--json'],{cwd:REPO,env:{...process.env,REALMCRAFT_ROOT:root}});
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready','true');
  await page.locator('#zug-beenden').click();
  await expect(page.locator('#dlg-zug')).toBeVisible();
  await expect(page.locator('#dlg-zug')).toContainText('keine Befehle');
  await page.getByRole('button',{name:'Weiter planen',exact:true}).click();
  await expect(page.locator('#dlg-zug')).not.toBeVisible();
  expect(await page.evaluate(()=>window.spielbrett.model.kernPhase)).toBe('planning');
});

import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHochland } from '../fixtures/spielbrett/build.mjs';
import { REPO, startServer } from '../lib/server.mjs';

const LEGACY = 'realm-existing';
const WORLD_BRIEF = 'Eine Welt aus Flusstälern. Erinnerungen werden mit gemeinsam gewarteten Messinstrumenten verglichen. Keine Vorhersage ersetzt eine Beobachtung.';
const PEOPLE_BRIEF = 'Eine Gemeinschaft wandernder Kartographen, die Erinnerungen nur mit Zustimmung weitergibt und Werkzeuge gemeinsam repariert.';
const EDITED = {
  world: { name: 'Die Ströme von Orin', description: 'Die Flüsse tragen <Zeichen> & niemand besitzt die Erinnerungen anderer.', landscape: 'riverlands' },
  people: { name: 'Gemeinschaft der Pegelhüter', description: 'Die Pegelhüter teilen Messdaten und beraten öffentlich über jede Veränderung.', way: 'settled', strength: 'erkundung', weakness: 'angriff' },
  council: [{ name: 'Die Hüterin', role: 'Messinstrumente und Archive' }],
  neighbour: { name: 'Gemeinde am Westufer', description: 'Sie teilt Pegelwerte und verlangt freien Zugang zum Fluss.' },
  goal: 'accord', difficulty: 'hard', seed: 8293,
};
let root, server, base, legacyBefore, templateWrites = 0, pageErrors = [];

function digestTree(path) {
  const files = {};
  function visit(dir, prefix = '') {
    for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix + item.name;
      const absolute = join(dir, item.name);
      if (item.isDirectory()) visit(absolute, relative + '/');
      else files[relative] = createHash('sha256').update(readFileSync(absolute)).digest('hex');
    }
  }
  visit(path);
  return files;
}

const campaigns = async (page) => (await (await page.request.get(`${base}/api/campaigns`)).json()).map((c) => c.id).sort();
const isPost = (request, endpoint) => request.method() === 'POST' && new URL(request.url()).pathname === `/api/realms/${endpoint}`;

async function enter(page, language = 'de') {
  await page.addInitScript((language) => localStorage.setItem('realmcraft.settings', JSON.stringify({ language, reduced: true })), language);
  await page.goto(`${base}/spielbrett/`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.locator('#start-new').click();
  await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'brief');
  await expect(page.locator('[data-new-mode="realm"]')).toHaveAttribute('aria-pressed', 'true');
}

async function draft(page) {
  await page.locator('#realm-world-brief').fill(WORLD_BRIEF);
  await page.locator('#realm-people-brief').fill(PEOPLE_BRIEF);
  const response = page.waitForResponse((r) => isPost(r.request(), 'draft'));
  await page.locator('#realm-draft').click();
  const result = await response;
  expect(result.status()).toBe(200);
  await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'edit');
  return (await result.json()).draft;
}

async function edit(page) {
  for (const [id, value] of Object.entries({
    'world-name': EDITED.world.name, 'world-description': EDITED.world.description,
    'people-name': EDITED.people.name, 'people-description': EDITED.people.description,
  })) await page.locator(`#realm-${id}`).fill(value);
  for (const [id, value] of Object.entries({ landscape: EDITED.world.landscape, way: EDITED.people.way, strength: EDITED.people.strength, weakness: EDITED.people.weakness, goal: EDITED.goal, difficulty: EDITED.difficulty })) {
    await page.locator(`#realm-${id}`).selectOption(value);
  }
  const details = page.locator('[data-realm-council]');
  if (await details.count() && await details.getAttribute('open') === null) await details.locator('summary').click();
  await page.locator('#realm-seed').fill(String(EDITED.seed));
  await page.locator('#realm-council-0-name').fill(EDITED.council[0].name);
  await page.locator('#realm-council-0-role').fill(EDITED.council[0].role);
  await page.locator('#realm-neighbour-name').fill(EDITED.neighbour.name);
  await page.locator('#realm-neighbour-description').fill(EDITED.neighbour.description);
}

async function preview(page) {
  const response = page.waitForResponse((r) => isPost(r.request(), 'preview'));
  await page.locator('#realm-preview').click();
  const result = await response;
  expect(result.status()).toBe(200);
  await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'preview');
  await expect(page.locator('#realm-map-preview')).toBeVisible();
  await expect(page.locator('#realm-step-title')).toBeInViewport();
  await expect(page.locator('#realm-flow')).not.toContainText('null');
  return result.json();
}

async function start(page) {
  const response = page.waitForResponse((r) => isPost(r.request(), 'start'));
  await page.locator('#realm-start').click();
  const created = await response;
  expect(created.status()).toBe(201);
  const result = await created.json();
  await page.waitForURL(`**/spielbrett/?campaign=${result.id}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  expect(await page.evaluate(() => sessionStorage.getItem('realmcraft.creation.v1'))).toBeNull();
  return result;
}

async function currentRealm(page) {
  return page.evaluate(() => {
    const { game, model } = window.spielbrett;
    const people = game.view.peoples[game.pid];
    return {
      id: game.cid, worldId: game.env.welt.id, worldName: game.env.welt.name,
      creation: game.pack.welt.creation, people, settings: game.view.settings,
      phase: game.view.phase, status: game.view.status, turn: game.view.turn,
      seed: game.view.map.seed, home: model.home,
    };
  });
}

test.beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'rc-realm-start-'));
  mkdirSync(join(root, 'campaigns'), { recursive: true });
  createHochland(root, LEGACY);
  execFileSync(process.execPath, ['engine/cli.mjs', 'save', '--campaign', LEGACY, '--name', 'Bestehende Planung', '--json'], {
    cwd: REPO, env: { ...process.env, REALMCRAFT_ROOT: root }, encoding: 'utf8',
  });
  legacyBefore = digestTree(join(root, 'campaigns', LEGACY));
  server = await startServer(root);
  base = `http://127.0.0.1:${server.port}`;
});

test.beforeEach(async ({ page }) => {
  templateWrites = 0;
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack ?? error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/campaigns') templateWrites++;
  });
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
  expect(templateWrites).toBe(0);
  expect(digestTree(join(root, 'campaigns', LEGACY))).toEqual(legacyBefore);
});

test.afterAll(async () => {
  await server?.stop();
  if (root) rmSync(root, { recursive: true, force: true });
});

test('a reviewed custom realm starts with the edited world, people and supported choices and survives reload', async ({ page }, testInfo) => {
  await enter(page);
  const before = await campaigns(page);
  await expect(page.locator('#realm-steps li')).toHaveCount(3);
  await expect(page.locator('#realm-steps [aria-current="step"]')).toHaveCount(1);
  const generated = await draft(page);
  expect(generated.world.description).toBe(WORLD_BRIEF);
  expect(generated.people.description).toBe(PEOPLE_BRIEF);
  expect(await campaigns(page)).toEqual(before);
  await edit(page);
  const reviewed = await preview(page);
  expect(await campaigns(page)).toEqual(before);
  expect(reviewed.draft.world).toEqual(EDITED.world);
  expect(reviewed.draft.people).toEqual(EDITED.people);
  expect(reviewed.tiles.length).toBeGreaterThan(0);
  await expect(page.locator('#realm-review')).toContainText(EDITED.world.name);
  await expect(page.locator('#realm-review')).toContainText(EDITED.world.description);
  await expect(page.locator('#realm-review')).toContainText(EDITED.people.name);
  await expect(page.locator('#realm-review')).toContainText(EDITED.people.description);
  await expect(page.locator('#realm-review')).toContainText(EDITED.council[0].name);
  await expect(page.locator('#realm-review zeichen')).toHaveCount(0);
  expect(await page.locator('#realm-map-preview').evaluate((node) => node.tagName.toLowerCase())).toBe('svg');
  expect(await page.locator('#realm-map-preview').evaluate((node) => node.children.length)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('realm-preview-de-1440.png'), fullPage: true });
  const created = await start(page);
  expect(created.id).not.toBe(LEGACY);
  const actual = await currentRealm(page);
  expect(actual.worldId).not.toBe('hochland');
  expect(actual.worldName).toBe(EDITED.world.name);
  expect(actual.creation.world).toEqual(EDITED.world);
  expect(actual.creation.people).toEqual(EDITED.people);
  expect(actual.creation.council[0]).toEqual(EDITED.council[0]);
  expect(actual.creation.neighbour).toEqual(EDITED.neighbour);
  expect(actual.creation.goal).toBe(EDITED.goal);
  expect(actual.people.name).toBe(EDITED.people.name);
  expect(actual.people.identity.appearance).toBe(EDITED.people.description);
  expect(actual.people.identity.wesensart.plus.tag).toBe(EDITED.people.strength);
  expect(actual.people.identity.wesensart.minus.tag).toBe(EDITED.people.weakness);
  expect(actual.people.lebensweise).toBe('sesshaft@1');
  expect(actual.people.council[0].name).toBe(EDITED.council[0].name);
  expect(actual.settings).toMatchObject({ difficulty: EDITED.difficulty, language: 'de' });
  expect([actual.phase, actual.status, actual.turn, actual.seed]).toEqual(['planning', 'playing', 0, EDITED.seed]);
  expect(await campaigns(page)).toEqual([...before, created.id].sort());
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  expect(await currentRealm(page)).toEqual(actual);
  await expect(page.locator('#volk-name')).toHaveText(EDITED.people.name);
});

test('back, mode changes and leaving the draft preserve authored text and create no campaign', async ({ page }) => {
  await enter(page);
  const before = await campaigns(page);
  await page.locator('#realm-world-brief').fill(WORLD_BRIEF);
  await page.locator('#realm-people-brief').fill(PEOPLE_BRIEF);
  await page.locator('[data-new-mode="template"]').click();
  await expect(page.locator('#ng-seed')).toBeVisible();
  await page.locator('[data-new-mode="realm"]').click();
  await expect(page.locator('#realm-world-brief')).toHaveValue(WORLD_BRIEF);
  await expect(page.locator('#realm-people-brief')).toHaveValue(PEOPLE_BRIEF);
  await draft(page);
  await edit(page);
  const first = await preview(page);
  await page.locator('#realm-back').click();
  await expect(page.locator('#realm-world-name')).toHaveValue(EDITED.world.name);
  await expect(page.locator('#realm-people-description')).toHaveValue(EDITED.people.description);
  await page.locator('#realm-world-name').fill('Orin nach der Überarbeitung');
  const second = await preview(page);
  expect(second.fingerprint).not.toBe(first.fingerprint);
  await expect(page.locator('#realm-review')).toContainText('Orin nach der Überarbeitung');
  await page.locator('#realm-back').click();
  await page.locator('#realm-back-brief').click();
  await expect(page.locator('#realm-world-brief')).toHaveValue(EDITED.world.description);
  await expect(page.locator('#realm-people-brief')).toHaveValue(EDITED.people.description);
  await page.locator('#start-continue').click();
  expect(await campaigns(page)).toEqual(before);
  await page.locator('#start-new').click();
  await expect(page.locator('#realm-world-brief')).toHaveValue(EDITED.world.description);
  await page.locator('#realm-draft').click();
  await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'edit');
  await expect(page.locator('#realm-world-name')).toHaveValue('Orin nach der Überarbeitung');
  await expect(page.locator('#realm-people-name')).toHaveValue(EDITED.people.name);
  await expect(page.locator('#realm-landscape')).toHaveValue(EDITED.world.landscape);
  await expect(page.locator('#realm-seed')).toHaveValue(String(EDITED.seed));
  await expect(page.locator('#realm-council-0-name')).toHaveValue(EDITED.council[0].name);
  await page.locator('#realm-back-brief').click();
  const revisedWorld = EDITED.world.description + ' Die Pegelhüter teilen ihre Messwerte öffentlich.';
  await page.locator('#realm-world-brief').fill(revisedWorld);
  await page.locator('#realm-draft').click();
  await expect(page.locator('#realm-world-description')).toHaveValue(revisedWorld);
  await expect(page.locator('#realm-people-name')).toHaveValue(EDITED.people.name);
  const revised = await preview(page);
  expect(revised.fingerprint).not.toBe(second.fingerprint);
  await expect(page.locator('#realm-review')).toContainText(revisedWorld);
  expect(await campaigns(page)).toEqual(before);
});

test('creation actions stay reachable and native validation reveals a closed required council field', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await enter(page);
  const before = await campaigns(page);
  await expect(page.locator('#realm-draft')).toBeInViewport();
  expect(await page.locator('#realm-draft').evaluate((button) => button.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
  await draft(page);
  expect(await page.locator('.start-kopf').evaluate((header) => header.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  await expect(page.locator('#realm-preview')).toBeInViewport();
  const details = page.locator('[data-realm-council]');
  await details.locator('summary').click();
  const role = page.locator('#realm-council-0-role');
  const original = await role.inputValue();
  await role.fill('');
  await details.locator('summary').click();
  await expect(role).not.toBeVisible();
  let previews = 0;
  page.on('request', (request) => { if (isPost(request, 'preview')) previews++; });
  await page.locator('#realm-preview').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(role).toBeFocused();
  expect(await role.evaluate((input) => input.getBoundingClientRect().bottom <= document.querySelector('.realm-actions').getBoundingClientRect().top)).toBe(true);
  expect(await role.evaluate((input) => input.validity.valueMissing)).toBe(true);
  expect(previews).toBe(0);
  await role.fill(original);
  await preview(page);
  expect(await campaigns(page)).toEqual(before);
});

test('invalid required fields and out-of-range seeds cannot produce a startable preview', async ({ page }) => {
  await enter(page);
  const before = await campaigns(page);
  await draft(page);
  await page.locator('[data-realm-council] summary').click();
  let starts = 0;
  page.on('request', (request) => { if (isPost(request, 'start')) starts++; });
  const button = page.locator('#realm-preview');
  for (const invalid of [
    { selector: '#realm-world-name', value: '', restore: 'Geprüfte Welt' },
    { selector: '#realm-seed', value: '-1', restore: '7' },
    { selector: '#realm-seed', value: '4294967296', restore: '7' },
  ]) {
    await page.locator(invalid.selector).fill(invalid.value);
    if (!await button.isDisabled()) await button.click();
    await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'edit');
    await expect(page.locator('#realm-start')).toHaveCount(0);
    expect(starts).toBe(0);
    if (invalid.selector === '#realm-world-name') {
      expect(await page.locator(invalid.selector).evaluate((input) => input.validity.valid)).toBe(false);
    } else await expect(page.locator('#realm-flow [role="alert"]')).toBeVisible();
    await page.locator(invalid.selector).fill(invalid.restore);
  }
  await page.locator('#realm-strength').selectOption('erkundung');
  await page.locator('#realm-weakness').selectOption('erkundung');
  await button.click();
  await expect(page.locator('#realm-flow [role="alert"]')).toBeVisible();
  await expect(page.locator('#realm-weakness')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#realm-start')).toHaveCount(0);
  expect(starts).toBe(0);
  expect(await campaigns(page)).toEqual(before);
});

for (const endpoint of ['draft', 'preview']) {
  test(`a failed ${endpoint} request keeps authored fields and can be retried`, async ({ page }) => {
    await enter(page);
    const before = await campaigns(page);
    if (endpoint === 'preview') { await draft(page); await edit(page); }
    else {
      await page.locator('#realm-world-brief').fill(WORLD_BRIEF);
      await page.locator('#realm-people-brief').fill(PEOPLE_BRIEF);
    }
    await page.route(`**/api/realms/${endpoint}`, (route) => route.abort('failed'));
    const submit = page.locator(endpoint === 'draft' ? '#realm-draft' : '#realm-preview');
    await submit.click();
    await expect(page.locator('#realm-flow [role="alert"]')).toBeVisible();
    const fields = endpoint === 'draft'
      ? [['#realm-world-brief', WORLD_BRIEF], ['#realm-people-brief', PEOPLE_BRIEF]]
      : [['#realm-world-name', EDITED.world.name], ['#realm-world-description', EDITED.world.description], ['#realm-people-name', EDITED.people.name]];
    for (const [selector, value] of fields) await expect(page.locator(selector)).toHaveValue(value);
    expect(await campaigns(page)).toEqual(before);
    await page.unroute(`**/api/realms/${endpoint}`);
    const response = page.waitForResponse((r) => isPost(r.request(), endpoint));
    await submit.click();
    expect((await response).status()).toBe(200);
    await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', endpoint === 'draft' ? 'edit' : 'preview');
    expect(await campaigns(page)).toEqual(before);
  });
}

test('retrying a lost start response reuses its key and opens the campaign already created', async ({ page }) => {
  await enter(page);
  const before = await campaigns(page);
  await draft(page);
  await edit(page);
  const reviewed = await preview(page);
  const bodies = [];
  let committed;
  await page.route('**/api/realms/start', async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      committed = await response.json();
      await route.abort('failed');
    } else await route.continue();
  });
  await page.locator('#realm-start').click();
  await expect(page.locator('#realm-flow [role="alert"]')).toBeVisible();
  await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'preview');
  expect(committed.id).toBeTruthy();
  expect(await campaigns(page)).toEqual([...before, committed.id].sort());
  expect(bodies[0].fingerprint).toBe(reviewed.fingerprint);
  expect(bodies[0].startKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  await page.locator('#realm-back').click();
  await page.locator('#realm-back-brief').click();
  await page.locator('#realm-draft').click();
  await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'edit');
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('realmcraft.creation.v1')))).toMatchObject({
    attempted: true, startKey: bodies[0].startKey, fingerprint: bodies[0].fingerprint,
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.locator('#start-new').click();
  await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'edit');
  await expect(page.locator('#realm-world-name')).toHaveValue(EDITED.world.name);
  const changedFingerprint = reviewed.fingerprint === '0000000000000000' ? '1111111111111111' : '0000000000000000';
  await page.route('**/api/realms/preview', async (route) => {
    const response = await route.fetch();
    const result = await response.json();
    await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify({ ...result, fingerprint: changedFingerprint }) });
  });
  const recovered = await preview(page);
  expect(recovered.fingerprint).toBe(changedFingerprint);
  expect(recovered.fingerprint).not.toBe(reviewed.fingerprint);
  const retried = await start(page);
  expect(retried.id).toBe(committed.id);
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toEqual(bodies[0]);
  expect(await campaigns(page)).toEqual([...before, committed.id].sort());
  expect((await currentRealm(page)).creation.world).toEqual(EDITED.world);
});

test('English creation works by keyboard on a narrow screen and starts in the chosen language', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await enter(page, 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#realm-world-brief').focus();
  await page.keyboard.insertText(WORLD_BRIEF);
  await page.keyboard.press('Tab');
  await expect(page.locator('#realm-people-brief')).toBeFocused();
  await page.keyboard.insertText(PEOPLE_BRIEF);
  await page.locator('#realm-draft').focus();
  const generated = page.waitForResponse((r) => isPost(r.request(), 'draft'));
  await page.keyboard.press('Enter');
  expect((await generated).status()).toBe(200);
  await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'edit');
  const longWorldName = 'TheUnbrokenArchive'.repeat(5).slice(0, 80);
  await page.locator('#realm-world-name').fill(longWorldName);
  await page.locator('#realm-people-name').fill('The River Keepers');
  await page.locator('#realm-preview').focus();
  const reviewed = page.waitForResponse((r) => isPost(r.request(), 'preview'));
  await page.keyboard.press('Enter');
  expect((await reviewed).status()).toBe(200);
  await expect(page.locator('#realm-flow')).toHaveAttribute('data-step', 'preview');
  await expect(page.locator('#realm-review')).toContainText(longWorldName);
  expect(await page.locator('#start').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.locator('.realm-preview-copy').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await expect(page.locator('#realm-review')).toContainText('The River Keepers');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('realm-preview-en-390.png'), fullPage: true });
  await page.locator('#realm-start').focus();
  const response = page.waitForResponse((r) => isPost(r.request(), 'start'));
  await page.keyboard.press('Space');
  const created = await response;
  expect(created.status()).toBe(201);
  const result = await created.json();
  await page.waitForURL(`**/spielbrett/?campaign=${result.id}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  const actual = await currentRealm(page);
  expect(await page.evaluate(() => sessionStorage.getItem('realmcraft.creation.v1'))).toBeNull();
  expect(actual.settings.language).toBe('en');
  expect(actual.people.name).toBe('The River Keepers');
});

test('both uint32 seed boundaries can be previewed without creating a campaign', async ({ page }) => {
  await enter(page);
  const before = await campaigns(page);
  await draft(page);
  await page.locator('[data-realm-council] summary').click();
  for (const seed of [0, 4294967295]) {
    if (!await page.locator('#realm-seed').isVisible()) await page.locator('[data-realm-council] summary').click();
    await page.locator('#realm-seed').fill(String(seed));
    const reviewed = await preview(page);
    expect(reviewed.draft.seed).toBe(seed);
    expect(reviewed.view.map.seed).toBe(seed);
    expect(await campaigns(page)).toEqual(before);
    await page.locator('#realm-back').click();
  }
});

test('an activation failure keeps the created realm recoverable and retry activates it before opening', async ({ page }) => {
  await enter(page);
  const before = await campaigns(page);
  await draft(page);
  await edit(page);
  await preview(page);
  let activations = 0;
  await page.route('**/api/campaigns/*/activate', async (route) => {
    activations++;
    if (activations === 1) await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ active: false }) });
    else await route.continue();
  });
  const response = page.waitForResponse((r) => isPost(r.request(), 'start'));
  await page.locator('#realm-start').click();
  const created = await response;
  expect(created.status()).toBe(201);
  const result = await created.json();
  await expect(page.locator('#realm-flow [role="alert"]')).toBeVisible();
  await expect(page).toHaveURL(`${base}/spielbrett/`);
  expect(activations).toBe(1);
  expect(await campaigns(page)).toEqual([...before, result.id].sort());
  expect(await page.evaluate(() => sessionStorage.getItem('realmcraft.creation.v1'))).not.toBeNull();
  const retry = page.locator('#realm-open-created');
  await expect(retry).toBeVisible();
  const activated = page.waitForResponse((r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/campaigns/${result.id}/activate`);
  await retry.click();
  expect((await activated).status()).toBe(200);
  await page.waitForURL(`**/spielbrett/?campaign=${result.id}`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  expect(activations).toBe(2);
  expect((await currentRealm(page)).creation.world).toEqual(EDITED.world);
  expect(await campaigns(page)).toEqual([...before, result.id].sort());
  expect(await page.evaluate(() => sessionStorage.getItem('realmcraft.creation.v1'))).toBeNull();
});

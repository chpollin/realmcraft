import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CREATION_VERSION, creationDraft, normalizeCreation, creationFingerprint, compileRealm } from '../../engine/creation/realm.js';
import { validateWorldPackage, kernelLabelKeys } from '../../engine/content/validate.js';
import { makeEnv } from '../../engine/core/env.js';
import { createCampaign, open } from '../../engine/core/turn.js';
import { tileAt } from '../../engine/world/index.js';

const files = { welt: 'welt.json', regeln: 'regeln.json', labels: 'labels.json', labelsEn: 'labels.en.json', style: 'style.json', entwicklungen: 'content/entwicklungen.json', ereignisse: 'content/ereignisse.json', bestimmungen: 'content/bestimmungen.json' };
const base = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, JSON.parse(readFileSync(new URL(`../../welten/hochland/${file}`, import.meta.url), 'utf8'))]));
const clone = (value) => JSON.parse(JSON.stringify(value));
const draft = (language = 'de') => creationDraft({ world: 'Ein Flussgebiet mit gemeinsam genutzten Wegen.\n  Offene Fragen bleiben offen.', people: 'Eine Gemeinschaft, die Wissen sammelt und Versorgung gemeinsam entscheidet.\n', language, seed: 7 });
const environment = (pack) => makeEnv({ welt: pack.welt, regeln: pack.regeln, labels: pack.labels, content: pack });

test('creation suggestions preserve prose without keyword inference', () => {
  const a = draft();
  assert.equal(a.version, CREATION_VERSION);
  assert.equal(a.world.description, 'Ein Flussgebiet mit gemeinsam genutzten Wegen.\n  Offene Fragen bleiben offen.');
  assert.equal(a.people.description, 'Eine Gemeinschaft, die Wissen sammelt und Versorgung gemeinsam entscheidet.\n');
  assert.equal(a.world.landscape, 'highlands', 'free prose does not silently select mechanics');
  assert.equal(a.council.length, 3);
  assert.equal(draft('en').world.name, 'New world');
  assert.equal(draft('en').council[0].role, 'Coordination');
  assert.deepEqual(normalizeCreation(a), { draft: a, issues: [] });
});

test('the complete normalized contract rejects unknown fields, unsupported mechanics and unsafe values', () => {
  const cases = [
    [(d) => { d.extra = true; }, '/extra'],
    [(d) => { d.world.powers = []; }, '/world/powers'],
    [(d) => { d.people.magic = true; }, '/people/magic'],
    [(d) => { d.council[0].resources = {}; }, '/council/0/resources'],
    [(d) => { d.neighbour.id = '../campaigns'; }, '/neighbour/id'],
    [(d) => { d.world.landscape = 'space'; }, '/world/landscape'],
    [(d) => { d.people.way = 'flight'; }, '/people/way'],
    [(d) => { d.people.strength = 'unlimited'; }, '/people/strength'],
    [(d) => { d.people.weakness = d.people.strength; }, '/people/weakness'],
    [(d) => { d.goal = 'godhood'; }, '/goal'],
    [(d) => { d.seed = Number.MAX_SAFE_INTEGER + 1; }, '/seed'],
    [(d) => { d.seed = -1; }, '/seed'],
    [(d) => { d.seed = '7'; }, '/seed'],
    [(d) => { d.world.name = 'x'.repeat(81); }, '/world/name'],
    [(d) => { d.people.name = ' A '; }, '/people/name'],
    [(d) => { d.neighbour.name = 'N'; }, '/neighbour/name'],
    [(d) => { d.council[0].name = 'C'; }, '/council/0/name'],
    [(d) => { d.world.description = 'x'.repeat(3001); }, '/world/description'],
    [(d) => { d.people.description = 'a\u0000b'; }, '/people/description'],
    [(d) => { d.people.name = 'a\u202eb'; }, '/people/name'],
    [(d) => { d.council[0].role = 'a\nb'; }, '/council/0/role'],
    [(d) => { d.council.pop(); }, '/council'],
    [(d) => { delete d.difficulty; }, '/difficulty'],
  ];
  for (const [change, path] of cases) {
    const d = draft();
    change(d);
    const result = normalizeCreation(d);
    assert.equal(result.draft, null, path);
    assert.ok(result.issues.some((i) => i.path === path), `${path}: ${JSON.stringify(result.issues)}`);
    assert.throws(() => compileRealm(d, base), (err) => err instanceof TypeError && err.issues.length > 0);
  }
  assert.equal(normalizeCreation(null).draft, null);
  assert.equal(normalizeCreation(Object.assign(Object.create({ unexpected: true }), draft())).draft, null);
  assert.throws(() => creationDraft({ world: 'World', people: 'People', model: 'anything' }), TypeError);
});

test('compilation is deterministic, leaves the trusted source unchanged and versions package identity', () => {
  const source = clone(base);
  const before = JSON.stringify(source);
  const d = draft();
  const first = compileRealm(d, source);
  assert.deepEqual(compileRealm(clone(d), source), first);
  assert.equal(JSON.stringify(source), before);
  assert.match(first.welt.id, /^realm-[0-9a-f]{16}$/);
  assert.equal(creationFingerprint(d), creationFingerprint(clone(d)));
  const revised = clone(d);
  revised.world.description += ' Ein weiterer Gedanke.';
  assert.notEqual(compileRealm(revised, source).welt.id, first.welt.id);
  source.regeln.tuning.lossAfter += 1;
  assert.notEqual(compileRealm(d, source).welt.id, first.welt.id, 'a changed trusted base never overwrites an old authored package');
  assert.deepEqual(first.welt.creation, d);
});

test('the own world carries the edited identities, council roles and chosen mechanical identity', () => {
  const d = draft();
  d.world.name = 'Wasserverbund';
  d.people.name = 'Die Aufzeichnenden';
  d.neighbour.name = 'Freie Ufergemeinschaft';
  d.council[0] = { name: 'Gemeinsame Stimme', role: 'Moderation der Versammlung' };
  d.people.way = 'nomadic';
  d.people.strength = 'bau';
  d.people.weakness = 'verhandlung';
  d.goal = 'accord';
  const pack = compileRealm(d, base);
  const [own, neighbour] = pack.regeln.peopleTemplates;
  assert.deepEqual([own.id, own.name, neighbour.id, neighbour.name], ['community', d.people.name, 'neighbours', d.neighbour.name]);
  assert.equal(own.lebensweise, 'nomadisch@1');
  assert.ok(!own.developments.includes('sesshaft@1'));
  assert.equal(own.identity.wesensart.plus.tag, 'bau');
  assert.equal(own.identity.wesensart.minus.tag, 'verhandlung');
  assert.equal(own.bestimmung, 'goal-accord@1');
  const member = pack.regeln.councilTemplates[0].members[0];
  assert.equal(member.name, d.council[0].name);
  assert.equal(pack.labels.labels[`role.${member.role}`], d.council[0].role);
  assert.equal(pack.labels.labels['people.community'], d.people.name);
  const oldMembers = new Set(base.regeln.councilTemplates.flatMap((c) => c.members.map((m) => m.id)));
  assert.ok(pack.regeln.councilTemplates.flatMap((c) => c.members).every((m) => !oldMembers.has(m.id)));
  assert.equal(pack.welt.creation.world.description, d.world.description);
  assert.equal(pack.welt.creation.people.description, d.people.description);
  assert.equal(pack.welt.creation.neighbour.description, d.neighbour.description);
});

test('bounded identity excerpts do not split Unicode while authored prose remains complete', () => {
  const d = draft();
  d.people.description = 'x'.repeat(299) + '😀' + ' weiterer Text';
  const pack = compileRealm(d, base);
  assert.equal(pack.welt.creation.people.description, d.people.description);
  assert.equal(pack.regeln.peopleTemplates[0].identity.appearance, 'x'.repeat(299));
  assert.deepEqual(validateWorldPackage(pack, { labelKeys: kernelLabelKeys() }), []);
});

test('own content has neutral fiction, valid references and concrete goal recipes', () => {
  const pack = compileRealm(draft(), base);
  const fiction = [pack.welt.name, pack.welt.names, pack.regeln.peopleTemplates, pack.regeln.councilTemplates, pack.regeln.aiProfiles, pack.labels.labels, pack.style,
    ...pack.entwicklungen.items.map((d) => ({ name: d.name, summary: d.summary, appearance: d.appearance })), pack.ereignisse.items, pack.bestimmungen.items];
  assert.doesNotMatch(JSON.stringify(fiction), /Hochland|Graue Kämme|Schädelklan|Talbund|Wiesenfurt|Asgra|Filzjurten|Almkäserei/u);
  assert.ok(pack.entwicklungen.items.every((d) => d.kind !== 'disziplin'));
  assert.ok(!pack.regeln.pfade.paths.some((p) => p.id === 'magie'));
  assert.ok(!pack.regeln.resources.some((r) => ['psil', 'opfer'].includes(r.id)));
  assert.deepEqual(pack.bestimmungen.items.map((g) => g.id), ['goal-survival', 'goal-discovery', 'goal-accord']);
  assert.equal(pack.bestimmungen.items[2].milestones[1].predicate.predicate.people, '$any');
  assert.deepEqual(validateWorldPackage(pack, { labelKeys: kernelLabelKeys() }), []);
});

test('landscape choices change the generated geography and retain working starts', () => {
  const packs = ['highlands', 'riverlands', 'drylands'].map((profile) => {
    const d = draft();
    d.world.landscape = profile;
    return compileRealm(d, base);
  });
  const samples = packs.map((pack) => {
    const world = environment(pack).world(7);
    return [[0, 0], [1, -1], [8, 4], [-6, 3]].map(([q, r]) => {
      const t = tileAt(world, q, r);
      return [t.terrain, t.elevation, t.moisture, t.river];
    });
  });
  assert.notDeepEqual(samples[0], samples[1]);
  assert.notDeepEqual(samples[0], samples[2]);
  assert.notDeepEqual(samples[1], samples[2]);
  for (const pack of packs) assert.ok(pack.welt.start.adjacentTerrains.length > 0);
});

for (const language of ['de', 'en']) for (const profile of ['highlands', 'riverlands', 'drylands']) for (const way of ['nomadic', 'settled']) for (const goal of ['survival', 'discovery', 'accord']) {
  test(`valid ${language} ${profile} ${way} ${goal} package starts and opens at the real fixture seed`, () => {
    const d = draft(language);
    d.world.landscape = profile;
    d.people.way = way;
    d.goal = goal;
    const pack = compileRealm(d, base);
    assert.deepEqual(validateWorldPackage(pack, { labelKeys: kernelLabelKeys() }), []);
    const env = environment(pack);
    const created = createCampaign(env, { id: 'authored-test', seed: d.seed, player: 'community', language: d.language, difficulty: d.difficulty });
    assert.equal(created.state.peoples.community.name, d.people.name);
    assert.equal(created.state.peoples.community.bestimmung.ref, `goal-${goal}@1`);
    assert.equal(created.state.map.settlements.length, 2);
    assert.equal(created.state.map.settlements[0].kind, way === 'nomadic' ? 'lager' : 'dorf');
    const opened = open(created.state, env);
    assert.deepEqual(opened.issues, []);
    assert.equal(opened.state.phase, 'planning');
  });
}

test('all landscape and way combinations also start with the second existing API fixture seed', () => {
  for (const profile of ['highlands', 'riverlands', 'drylands']) for (const way of ['nomadic', 'settled']) {
    const d = draft();
    d.world.landscape = profile;
    d.people.way = way;
    d.seed = 8;
    const pack = compileRealm(d, base);
    const result = createCampaign(environment(pack), { id: 'second-seed', seed: d.seed, player: 'community' });
    assert.equal(result.state.map.settlements.length, 2);
  }
});

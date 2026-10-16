import { hashValue } from '../core/hash.js';
import { DEVELOPMENT_TEXT, TERRAIN_NAMES, DEPOSIT_NAMES } from './realm-content.js';

export const CREATION_VERSION = 1;
const LANGUAGES = ['de', 'en'];
const LANDSCAPES = ['highlands', 'riverlands', 'drylands'];
const TRAITS = ['erkundung', 'bau', 'verhandlung', 'angriff'];
const GOALS = ['survival', 'discovery', 'accord'];
const UNSAFE_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069\p{Surrogate}]/u;
const clone = (value) => JSON.parse(JSON.stringify(value));
const boundedText = (value, max) => value.slice(0, max).replace(/[\ud800-\udbff]$/u, '');
const issue = (path, reason) => ({ code: 'format', severity: 'error', path, message: `invalid creation field: ${reason}`, params: { reason } });
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));

/** Validates the bounded authoring contract without interpreting free prose. */
export function normalizeCreation(value) {
  const issues = [];
  function object(v, keys, path) {
    if (!isObject(v)) { issues.push(issue(path, 'object')); return {}; }
    for (const key of Object.keys(v)) if (!keys.includes(key)) issues.push(issue(`${path}/${key}`, 'unknown-field'));
    for (const key of keys) if (!Object.hasOwn(v, key)) issues.push(issue(`${path}/${key}`, 'required'));
    return v;
  }
  function text(v, max, path, prose = false, min = 1) {
    const result = typeof v === 'string' ? prose ? v : v.trim() : null;
    if (result === null || !result.trim() || result.length < min || result.length > max || UNSAFE_TEXT.test(result) || (!prose && /[\r\n\t]/u.test(result))) {
      issues.push(issue(path, 'text')); return '';
    }
    return result;
  }
  function choice(v, choices, path) {
    if (!choices.includes(v)) { issues.push(issue(path, 'choice')); return null; }
    return v;
  }
  const v = object(value, ['format', 'version', 'language', 'seed', 'difficulty', 'world', 'people', 'council', 'neighbour', 'goal'], '');
  if (v.format !== 'realmcraft-creation') issues.push(issue('/format', 'format'));
  if (v.version !== CREATION_VERSION) issues.push(issue('/version', 'version'));
  const world = object(v.world, ['name', 'description', 'landscape'], '/world');
  const people = object(v.people, ['name', 'description', 'way', 'strength', 'weakness'], '/people');
  const neighbour = object(v.neighbour, ['name', 'description'], '/neighbour');
  if (!Number.isSafeInteger(v.seed) || v.seed < 0 || v.seed > 0xffffffff) issues.push(issue('/seed', 'seed'));
  if (!Array.isArray(v.council) || v.council.length !== 3) issues.push(issue('/council', 'council-size'));
  const council = (Array.isArray(v.council) ? v.council.slice(0, 3) : []).map((entry, i) => {
    const member = object(entry, ['name', 'role'], `/council/${i}`);
    return { name: text(member.name, 60, `/council/${i}/name`, false, 2), role: text(member.role, 60, `/council/${i}/role`) };
  });
  const draft = {
    format: 'realmcraft-creation', version: CREATION_VERSION,
    language: choice(v.language, LANGUAGES, '/language'), seed: v.seed,
    difficulty: choice(v.difficulty, ['easy', 'normal', 'hard'], '/difficulty'),
    world: { name: text(world.name, 80, '/world/name'), description: text(world.description, 3000, '/world/description', true), landscape: choice(world.landscape, LANDSCAPES, '/world/landscape') },
    people: { name: text(people.name, 80, '/people/name', false, 2), description: text(people.description, 3000, '/people/description', true), way: choice(people.way, ['nomadic', 'settled'], '/people/way'), strength: choice(people.strength, TRAITS, '/people/strength'), weakness: choice(people.weakness, TRAITS, '/people/weakness') },
    council,
    neighbour: { name: text(neighbour.name, 80, '/neighbour/name', false, 2), description: text(neighbour.description, 1000, '/neighbour/description', true) },
    goal: choice(v.goal, GOALS, '/goal'),
  };
  if (draft.people.strength === draft.people.weakness) issues.push(issue('/people/weakness', 'distinct-traits'));
  return { draft: issues.length ? null : draft, issues };
}

function requiredDraft(value) {
  const result = normalizeCreation(value);
  if (result.issues.length) {
    const error = new TypeError('invalid Realm creation draft');
    error.issues = result.issues;
    throw error;
  }
  return result.draft;
}

/** Editable suggestions; descriptions are retained verbatim and never classified by keywords. */
export function creationDraft(brief) {
  if (!isObject(brief) || Object.keys(brief).some((k) => !['world', 'people', 'language', 'seed'].includes(k))) {
    const error = new TypeError('invalid Realm creation brief');
    error.issues = [issue('', 'brief')];
    throw error;
  }
  const en = brief.language === 'en';
  return requiredDraft({
    format: 'realmcraft-creation', version: CREATION_VERSION, language: brief.language ?? 'de', seed: brief.seed ?? 7, difficulty: 'normal',
    world: { name: en ? 'New world' : 'Neue Welt', description: brief.world, landscape: 'highlands' },
    people: { name: en ? 'Our community' : 'Eigene Gemeinschaft', description: brief.people, way: 'settled', strength: 'erkundung', weakness: 'angriff' },
    council: en
      ? [{ name: 'Council speaker', role: 'Coordination' }, { name: 'Storekeeper', role: 'Provision' }, { name: 'Survey delegate', role: 'Exploration' }]
      : [{ name: 'Ratsstimme', role: 'Abstimmung' }, { name: 'Vorratshüter', role: 'Versorgung' }, { name: 'Erkundungsstimme', role: 'Erkundung' }],
    neighbour: { name: en ? 'Neighbouring community' : 'Nachbargemeinschaft', description: en ? 'An independent community with its own council and supplies.' : 'Eine eigenständige Gemeinschaft mit eigenem Rat und eigenen Vorräten.' },
    goal: 'discovery',
  });
}

export const creationFingerprint = (draft) => hashValue({ version: CREATION_VERSION, draft: requiredDraft(draft) });

function landscape(welt, profile, language) {
  const gen = welt.generation;
  if (profile === 'riverlands') {
    Object.assign(gen.elevation, { base: -0.05, amplitude: 0.8, ridgeWeight: 0.15 });
    Object.assign(gen, { seaLevel: -0.35, mountainThreshold: 0.7, peakThreshold: 0.9 });
    gen.moisture.valleyBias = 0.45;
    Object.assign(gen.rivers, { width: 0.05, moistureWidth: 0.025 });
  } else if (profile === 'drylands') {
    Object.assign(gen.elevation, { base: 0.02, amplitude: 1.1, ridgeWeight: 0.25 });
    gen.seaLevel = -0.4;
    gen.moisture.valleyBias = 0.8;
    Object.assign(gen.rivers, { width: 0.012, moistureWidth: 0.005 });
    gen.classification.find((r) => r.terrain === 'wald').moisture = [0.4, null];
    gen.classification.find((r) => r.terrain === 'heide').moisture = [null, 0.25];
    gen.classification.find((r) => r.terrain === 'moor').moisture = [0.6, null];
  }
  const land = ['wiese', 'heide', 'wald', 'alm', 'bergwald'];
  welt.start = { ...welt.start, terrains: profile === 'highlands' ? ['alm', 'wiese'] : ['wiese', 'heide', 'alm'], adjacentTerrains: land, waterTerrains: ['see'], waterRadius: profile === 'drylands' ? 4 : 3, minResources: 1, peopleTerrains: land };
  const terrainIds = ['see', 'moor', 'wiese', 'heide', 'wald', 'alm', 'bergwald', 'gebirge', 'gipfel'];
  welt.terrains.forEach((t) => { t.name = TERRAIN_NAMES[language][terrainIds.indexOf(t.id)] ?? t.id; });
  const depositIds = ['eisenerz', 'kupfererz', 'salz', 'edelsteine', 'flussgold', 'wild', 'gemsen', 'fisch', 'heilkraeuter', 'torf', 'feuerstein', 'lehm'];
  welt.resources.forEach((r) => { r.name = DEPOSIT_NAMES[language][depositIds.indexOf(r.key)] ?? r.key; });
  welt.names = language === 'en'
    ? { prefixes: ['North', 'South', 'Clear', 'Reed', 'Stone', 'Willow', 'East', 'West'], suffixes: ['bank', 'field', 'wood', 'water', 'haven', 'reach'] }
    : { prefixes: ['Nord', 'Süd', 'Klar', 'Schilf', 'Stein', 'Weiden', 'Ost', 'West'], suffixes: ['ufer', 'feld', 'hain', 'wasser', 'grund', 'land'] };
}

function developments(base, en) {
  return Object.entries(DEVELOPMENT_TEXT).map(([id, text]) => {
    const original = base.entwicklungen.items.find((d) => d.id === id);
    if (!original) throw new TypeError(`source mechanics missing: ${id}`);
    const d = clone(original);
    d.name = text[en ? 2 : 0];
    d.summary = text[en ? 3 : 1];
    d.appearance = en ? `${d.name} in everyday use by the community.` : `${d.name} im alltäglichen Gebrauch der Gemeinschaft.`;
    if (d.kind === 'bauwerk') d.spec.terrains = ['wiese', 'heide', 'wald', 'alm', 'bergwald'];
    if (d.id === 'sagenhalle') d.spec.seat = { role: 'learning-delegate', favor: ['bestimmung', 'erkundung'], oppose: ['beute'] };
    return d;
  });
}

function councils(draft, en) {
  const roles = [['rat', 'ordnung'], ['nahrung', 'weide'], ['erkundung', 'verhandlung']];
  const neighbour = en
    ? [{ name: 'Neighbour speaker', role: 'Coordination' }, { name: 'Neighbour provider', role: 'Provision' }, { name: 'Neighbour envoy', role: 'Relations' }]
    : [{ name: 'Nachbarstimme', role: 'Abstimmung' }, { name: 'Nachbarversorgung', role: 'Versorgung' }, { name: 'Nachbargesandte', role: 'Beziehungen' }];
  return [draft.council, neighbour].map((entries, ci) => ({
    id: ci ? 'council-neighbours' : 'council-community',
    members: entries.map((entry, i) => ({
      id: `rc-${ci ? 'neighbours' : 'community'}-${i + 1}`, name: entry.name, role: `rc-role-${ci}-${i}`,
      goal: { text: en ? 'Represent this area of work in the shared decisions.' : 'Diesen Arbeitsbereich in gemeinsamen Entscheidungen vertreten.', favor: roles[i], oppose: i === 1 ? ['beute'] : ['unfreiheit'] },
      loyalty: i === 0 ? 3 : 1, hollow: false, age: [45, 34, 39][i], lifeStage: 'ruestig', leader: i === 0,
      appearance: en ? 'A member of the community council.' : 'Ein Mitglied des gemeinsamen Rates.',
    })),
  }));
}

function destinies(en) {
  const milestone = (id, de, english, predicate) => ({ id, text: en ? english : de, predicate });
  const known = (count, tags) => ({ pred: 'development.known', count, tags });
  return [
    { id: 'goal-survival', rev: 1, name: en ? 'Secure continuity' : 'Bestand sichern', summary: en ? 'Secure land, community and supplies.' : 'Land, Gemeinschaft und Vorräte sichern.', tags: ['nahrung', 'siedlung'], milestones: [
      milestone('land', 'Drei Regionen halten', 'Control three regions', { pred: 'controls', count: 3 }),
      milestone('people', 'Vier Jahreszeiten mit mindestens vier Sippen', 'Maintain at least four clans for four seasons', { pred: 'holds', seasons: 4, predicate: { pred: 'population.atLeast', value: 4 } }),
      milestone('supplies', 'Zwölf Nahrung im Vorrat', 'Store twelve food', { pred: 'resource.atLeast', key: 'nahrung', value: 12 }),
    ] },
    { id: 'goal-discovery', rev: 1, name: en ? 'Learn and explore' : 'Entdecken und verstehen', summary: en ? 'Develop exploration, extend the known land and retain knowledge.' : 'Erkundung entwickeln, Land erschließen und Wissen bewahren.', tags: ['erkundung', 'wandel'], milestones: [
      milestone('exploration', 'Zwei Errungenschaften der Erkundung kennen', 'Know two exploration achievements', known(2, ['erkundung'])),
      milestone('land', 'Drei Regionen halten', 'Control three regions', { pred: 'controls', count: 3 }),
      milestone('knowledge', 'Vier Jahreszeiten mindestens acht Wissen halten', 'Maintain at least eight knowledge for four seasons', { pred: 'holds', seasons: 4, predicate: { pred: 'resource.atLeast', key: 'wissen', value: 8 } }),
    ] },
    { id: 'goal-accord', rev: 1, name: en ? 'Build lasting accord' : 'Zusammenleben gestalten', summary: en ? 'Build mutual aid and a durable relationship with another community.' : 'Beistand und eine dauerhafte Beziehung zu einer anderen Gemeinschaft aufbauen.', tags: ['bund', 'verhandlung'], milestones: [
      milestone('institutions', 'Zwei Errungenschaften des Beistands kennen', 'Know two mutual-aid achievements', known(2, ['bund'])),
      milestone('relations', 'Vier Jahreszeiten eine Beziehung von mindestens zwei halten', 'Maintain a relationship of at least two for four seasons', { pred: 'holds', seasons: 4, predicate: { pred: 'relation', people: '$any', cmp: 'gte', value: 2 } }),
      milestone('people', 'Mindestens fünf Sippen versorgen', 'Support at least five clans', { pred: 'population.atLeast', value: 5 }),
    ] },
  ];
}

function events(en) {
  const event = (id, band, de, english, textDe, textEn, effects, options = null) => ({ id, rev: 1, name: en ? english : de, text: en ? textEn : textDe, band, tags: ['siedlung'], if: null, effects, options });
  const delta = (res, amount) => ({ op: 'resource.delta', res, amount });
  return [
    event('supply-damage', 1, 'Beschädigte Vorräte', 'Damaged supplies', 'Ein Teil der Vorräte wird beschädigt. Nahrung und Material gehen verloren.', 'Part of the stores is damaged. Food and material are lost.', [delta('nahrung', -2), delta('material', -1)]),
    event('extra-needs', 2, 'Zusätzlicher Bedarf', 'Additional needs', 'Unvorhergesehener Bedarf zehrt am gemeinsamen Nahrungsvorrat.', 'Unexpected needs consume part of the shared food supply.', [delta('nahrung', -1)]),
    event('shared-work', 3, 'Gemeinsame Arbeit', 'Shared work', 'Eine Arbeitsgruppe bietet Hilfe an. Soll sie Material aufbereiten oder Aufzeichnungen sichern?', 'A work group offers help. Should it prepare material or preserve records?', [], [
      { id: 'material', label: en ? 'Prepare material' : 'Material aufbereiten', effects: [delta('material', 1), delta('nahrung', -1)] },
      { id: 'records', label: en ? 'Preserve records' : 'Aufzeichnungen sichern', effects: [delta('wissen', 1), delta('material', -1)] },
    ]),
    event('surplus-food', 4, 'Zusätzliche Nahrung', 'Additional food', 'Die Versorgung bringt mehr Nahrung ein als erwartet.', 'Provision brings in more food than expected.', [delta('nahrung', 2)]),
    event('useful-find', 5, 'Nützlicher Fund', 'Useful find', 'Die Gemeinschaft findet brauchbares Material und hält ihre Beobachtung fest.', 'The community finds useful material and records its observations.', [delta('material', 2), delta('wissen', 1)]),
  ];
}

/** Compiles trusted kernel mechanics and explicit authored choices into an independent package. */
export function compileRealm(value, basePack) {
  const draft = requiredDraft(value);
  const en = draft.language === 'en';
  const sourceLabels = en ? basePack.labelsEn : basePack.labels;
  if (!sourceLabels?.labels) throw new TypeError('source labels missing for the creation language');
  const id = `realm-${hashValue({ version: CREATION_VERSION, draft, base: basePack })}`;
  const welt = clone(basePack.welt);
  Object.assign(welt, { id, name: draft.world.name, version: '1.0.0', creation: clone(draft) });
  landscape(welt, draft.world.landscape, draft.language);
  const regeln = clone(basePack.regeln);
  regeln.world = id;
  regeln.resources = regeln.resources.filter((r) => !['psil', 'opfer'].includes(r.id));
  regeln.moduleBindings = { handel: { currency: 'salz' } };
  regeln.pfade.paths = regeln.pfade.paths.filter((p) => p.id !== 'magie');
  regeln.tuning.maxTier = 2;
  regeln.councilTemplates = councils(draft, en);
  const template = (way) => {
    const found = basePack.regeln.peopleTemplates.find((p) => p.lebensweise === (way === 'nomadic' ? 'nomadisch@1' : 'sesshaft@1'));
    if (!found) throw new TypeError('source way-of-life template missing');
    return clone(found);
  };
  regeln.peopleTemplates = ['community', 'neighbours'].map((pid, index) => {
    const way = index ? 'settled' : draft.people.way;
    const p = template(way);
    const plus = index ? 'verhandlung' : draft.people.strength;
    const minus = index ? 'angriff' : draft.people.weakness;
    const label = sourceLabels.labels;
    return {
      ...p, id: pid, name: index ? draft.neighbour.name : draft.people.name, agentProfile: index ? 'neighbour-policy' : null,
      identity: { wesensart: { plus: { tag: plus, text: `${en ? 'Strength' : 'Stärke'}: ${label[`tag.${plus}`] ?? plus}.` }, minus: { tag: minus, text: `${en ? 'Weakness' : 'Schwäche'}: ${label[`tag.${minus}`] ?? minus}.` } }, ausrichtung: plus, appearance: boundedText(index ? draft.neighbour.description : draft.people.description, 300) },
      lebensweise: way === 'nomadic' ? 'nomadisch@1' : 'sesshaft@1',
      developments: [way === 'nomadic' ? 'nomadisch@1' : 'sesshaft@1', 'sippenrat@1', way === 'nomadic' ? 'filzjurten@1' : 'erdkeller@1'],
      council: index ? 'council-neighbours' : 'council-community', bestimmung: `goal-${index ? 'survival' : draft.goal}@1`,
    };
  });
  const profile = clone(basePack.regeln.aiProfiles.find((p) => p.id === 'handel'));
  if (!profile) throw new TypeError('source neighbour policy missing');
  regeln.aiProfiles = [{ ...profile, id: 'neighbour-policy', name: en ? 'Neighbour policy' : 'Nachbarpolitik', stance: en ? 'Maintain supplies, develop the community and negotiate with neighbours.' : 'Vorräte erhalten, die Gemeinschaft entwickeln und mit Nachbarn verhandeln.' }];
  const content = developments(basePack, en);
  const goals = destinies(en);
  const cards = events(en);
  const labels = clone(sourceLabels);
  Object.assign(labels, { world: id, locale: draft.language });
  for (const key of Object.keys(labels.labels)) if (key.startsWith('people.') || key.startsWith('role.')) delete labels.labels[key];
  Object.assign(labels.labels, { 'people.community': draft.people.name, 'people.neighbours': draft.neighbour.name, 'role.learning-delegate': en ? 'Learning delegate' : 'Lernbeauftragte' });
  for (const [ci, entries] of [draft.council, en ? [{ role: 'Coordination' }, { role: 'Provision' }, { role: 'Relations' }] : [{ role: 'Abstimmung' }, { role: 'Versorgung' }, { role: 'Beziehungen' }]].entries()) entries.forEach((entry, i) => { labels.labels[`role.rc-role-${ci}-${i}`] = entry.role; });
  for (const d of content) labels.labels[`entwicklung.${d.id}`] = d.name;
  for (const g of goals) labels.labels[`bestimmung.${g.id}`] = g.name;
  for (const e of cards) labels.labels[`ereignis.${e.id}`] = e.name;
  const style = clone(basePack.style);
  Object.assign(style, { world: id, image: { base: boundedText(`${en ? 'A code-drawn community scene. Authored world' : 'Eine mit Code gezeichnete Gemeinschaftsszene. Beschriebene Welt'}: ${draft.world.description}`, 1000), negative: '' } });
  for (const type of Object.values(style.imageTypes)) type.prompt = en ? 'A view consistent with the authored world and community.' : 'Eine Ansicht passend zur beschriebenen Welt und Gemeinschaft.';
  const bundle = (format, items) => ({ format: `realmcraft-${format}`, version: 1, world: id, items });
  return { welt, regeln, labels, style, entwicklungen: bundle('entwicklungen', content), ereignisse: bundle('ereignisse', cards), bestimmungen: bundle('bestimmungen', goals) };
}

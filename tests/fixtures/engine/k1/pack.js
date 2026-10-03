// Test world package for the kernel tests (lane K1): the real Hochland
// welt.json plus a small regeln.json and content set, schema-valid, so the
// kernel tests do not depend on the content lane. Kept as a JS module because
// tests/unit/engine/schema-fixtures.test.js requires every *.json fixture to be
// listed in its manifest.

import { readFileSync } from 'node:fs';
import { makeEnv } from '../../../../engine/core/env.js';

export const WELT = JSON.parse(readFileSync(new URL('../../../../welten/hochland/welt.json', import.meta.url), 'utf8'));

const member = (id, name, role, favor, oppose, loyalty, age, lifeStage, leader = false) => ({
  id, name, role, goal: { text: `${name} verfolgt ihr Ziel.`, favor, oppose }, loyalty, hollow: false, age, lifeStage, leader, appearance: '',
});

export const REGELN = {
  format: 'realmcraft-regeln',
  version: 1,
  world: 'hochland',
  calendar: {
    seasons: [{ id: 'fruehling', winter: false }, { id: 'sommer', winter: false }, { id: 'herbst', winter: false }, { id: 'winter', winter: true }],
    startYear: 1,
    startSeason: 'fruehling',
  },
  resources: [
    { id: 'nahrung', value: 1, cap: 30, module: null },
    { id: 'material', value: 1, cap: 30, module: null },
    { id: 'wissen', value: 2, cap: 12, module: null },
    { id: 'erz', value: 2, cap: 20, module: null },
    { id: 'herden', value: 2, cap: 30, module: 'lebensweise' },
    { id: 'salz', value: 2, cap: 20, module: 'handel' },
    { id: 'rauchkraut', value: 3, cap: 10, module: 'magie' },
  ],
  stats: [{ id: 'verteidigung', base: 0 }, { id: 'mobilitaet', base: 0 }, { id: 'wohlstand', base: 0 }],
  vocabulary: {
    herde: 1, weide: 1, zug: 1, winter: 1, wege: 1, weg: 1, erkundung: 1, bau: 2, siedlung: 1, mauern: 1,
    handel: 2, salz: 1, markt: 1, krieg: 2, reiter: 1, fuss: 1, angriff: 2, verteidigung: 2, magie: 2, geist: 1,
    fernschau: 1, feuer: 1, ordnung: 2, wandel: 1, felder: 1, reiten: 1, geduld: 1, befohlen: 3, macht: 2,
    ereignis: 1, absetzung: 1, rat: 1, bestimmung: 1, vertragsbruch: 1, vertrag: 1, beute: 1, nachfolge: 1,
  },
  peopleTemplates: [
    {
      id: 'hochweide', name: 'Die Hochweide-Sippen', agentProfile: null,
      identity: {
        wesensart: { plus: { tag: 'wege', text: 'Sie kennen jeden Pfad.' }, minus: { tag: 'mauern', text: 'Bleiben fällt schwer.' } },
        ausrichtung: 'geist', appearance: 'Hirten in Filz und Fell',
      },
      lebensweise: 'wanderhirten@1', population: { core: 3, growth: 0 },
      resources: { nahrung: 6, material: 3, wissen: 2, erz: 0, herden: 4 }, standing: 0,
      developments: ['sippenrat@1'], council: 'rat-hochweide', bestimmung: 'ueberdauern@1',
    },
    {
      id: 'esk', name: 'Die Talbauern von Esk', agentProfile: 'handel',
      identity: {
        wesensart: { plus: { tag: 'felder', text: 'Ihre Felder tragen.' }, minus: { tag: 'krieg', text: 'Sie kämpfen ungern.' } },
        ausrichtung: 'wohlstand', appearance: 'Bauern in Leinen',
      },
      lebensweise: 'talbauern@1', population: { core: 4, growth: 0 },
      resources: { nahrung: 8, material: 4, wissen: 2, erz: 0, herden: 1 }, standing: 0,
      developments: [], council: 'rat-esk', bestimmung: null,
    },
    {
      id: 'glutreiter', name: 'Die Glutreiter vom Aschenhang', agentProfile: 'raub',
      identity: {
        wesensart: { plus: { tag: 'reiten', text: 'Schnell auf den Pässen.' }, minus: { tag: 'geduld', text: 'Ungeduldig.' } },
        ausrichtung: 'macht', appearance: 'Reiter mit rußigen Umhängen',
      },
      lebensweise: 'wanderhirten@1', population: { core: 3, growth: 0 },
      resources: { nahrung: 5, material: 2, wissen: 1, erz: 1, herden: 3 }, standing: 0,
      developments: ['reiterschar@1'], council: 'rat-glut', bestimmung: null,
    },
  ],
  councilTemplates: [
    {
      id: 'rat-hochweide',
      members: [
        member('ulrun', 'Ulrun vom Weidenhang', 'herdenaelteste', ['herde', 'weide'], ['krieg'], 3, 58, 'lebensabend', true),
        member('torhild', 'Torhild Aschenhand', 'feuerhueterin', ['geist', 'feuer'], ['handel'], 1, 41, 'ruestig'),
        member('garmund', 'Garmund Steinläufer', 'pfadmeister', ['wege', 'erkundung'], ['mauern'], -2, 63, 'lebensabend'),
      ],
    },
    { id: 'rat-esk', members: [member('vesna', 'Vesna Talgrund', 'dorfvorsteherin', ['felder', 'handel'], ['krieg'], 2, 47, 'ruestig', true)] },
    { id: 'rat-glut', members: [member('brakk', 'Brakk Aschenhand', 'heerfuehrer', ['krieg', 'reiten'], ['handel'], 1, 36, 'ruestig', true)] },
  ],
  tuning: {
    maxTier: 5, lossAfter: 4, newMemberLoyalty: 1,
    slots: { main: 1, minor: 2 },
    limits: { candidatesPerTurn: 3, aboveTier: 1, openCandidates: 6, moduleActivations: 1 },
    expected: { population: 4, units: 2, regions: 3, settlements: 1 },
  },
  aiProfiles: [
    { id: 'handel', name: 'Händler', stance: 'Sucht Handel und Frieden.', weights: { handel: 3, bau: 2, felder: 2, krieg: -2 } },
    { id: 'raub', name: 'Räuber', stance: 'Nimmt, was sich nehmen lässt.', weights: { krieg: 3, reiter: 2, angriff: 2, handel: -2 } },
  ],
  moduleBindings: { handel: { currency: 'salz' }, magie: { source: 'rauchkraut' }, lebensweise: { herd: 'herden' } },
};

const base = (o) => ({
  format: 'realmcraft-entwicklung', version: 1, rev: 1, appearance: '',
  prerequisites: { all: [], any: [], if: null }, onAcquire: [], replaces: [],
  origin: { source: 'world', practiceTags: [], token: null, request: null, proposal: null },
  ...o,
});

export const ENTWICKLUNGEN = [
  base({
    id: 'wanderhirten', kind: 'lebensweise', tier: 0, name: 'Wanderhirten', summary: 'Herden ziehen mit den Jahreszeiten.',
    tags: ['herde', 'zug'], cost: { research: 2, resources: {} },
    effects: [{ op: 'stat.mod', stat: 'mobilitaet', amount: 1 }], price: [],
    spec: { settlement: 'camp', migrates: true, consumption: { fruehling: 1, sommer: 1, herbst: 1, winter: 2 }, herdRules: { pastureTerrains: ['alm', 'wiese'], growth: 1, winterLoss: 1 } },
  }),
  base({
    id: 'talbauern', kind: 'lebensweise', tier: 0, name: 'Talbauern', summary: 'Felder im Talgrund.',
    tags: ['felder', 'siedlung'], cost: { research: 2, resources: {} },
    effects: [{ op: 'yield.mod', res: 'nahrung', terrain: 'wiese', amount: 1 }],
    price: [{ op: 'stat.mod', stat: 'mobilitaet', amount: -1 }],
    spec: { settlement: 'village', migrates: false, consumption: { fruehling: 1, sommer: 1, herbst: 1, winter: 1 }, herdRules: null },
  }),
  base({
    id: 'sippenrat', kind: 'institution', tier: 0, name: 'Sippenrat', summary: 'Die Ältesten beraten gemeinsam.',
    tags: ['ordnung', 'rat'], cost: { research: 2, resources: {} },
    effects: [{ op: 'governance.rule', rule: 'council', scopeTags: ['ordnung', 'angriff', 'wandel', 'bestimmung', 'vertragsbruch'] }],
    price: [{ op: 'resource.flow', res: 'nahrung', amount: -1, when: ['winter'] }],
    spec: { seat: null },
  }),
  base({
    id: 'filzjurten', kind: 'technik', tier: 1, name: 'Filzjurten', summary: 'Filz macht den Zug leichter.',
    tags: ['zug', 'herde', 'winter'], cost: { research: 2, resources: {} },
    effects: [{ op: 'probe.mod', tags: ['zug'], amount: 1, label: 'Filzjurten' }, { op: 'resource.flow', res: 'nahrung', amount: 1, when: ['winter'] }],
    price: [{ op: 'resource.flow', res: 'material', amount: -1, when: ['herbst'] }],
    spec: null, origin: { source: 'world', practiceTags: ['zug', 'herde'], token: null, request: null, proposal: null },
  }),
  base({
    id: 'hirtenhunde', kind: 'technik', tier: 1, name: 'Hirtenhunde', summary: 'Hunde halten die Herde zusammen.',
    tags: ['herde', 'weide'], cost: { research: 4, resources: {} },
    effects: [{ op: 'probe.mod', tags: ['herde'], amount: 1 }, { op: 'resource.flow', res: 'herden', amount: 1, when: ['sommer'] }],
    price: [{ op: 'resource.flow', res: 'nahrung', amount: -1, when: ['winter'] }],
    spec: null, origin: { source: 'world', practiceTags: ['herde', 'weide'], token: null, request: null, proposal: null },
  }),
  base({
    id: 'saumpfade', kind: 'technik', tier: 1, name: 'Saumpfade', summary: 'Pfade über den Kamm, mit Steinmännchen markiert.',
    tags: ['wege', 'weg', 'erkundung'], cost: { research: 4, resources: {} },
    effects: [{ op: 'order.unlock', order: 'road' }, { op: 'probe.mod', tags: ['erkundung'], amount: 1 }],
    price: [{ op: 'resource.flow', res: 'material', amount: -1, when: ['sommer'] }],
    spec: null, origin: { source: 'world', practiceTags: ['erkundung', 'wege'], token: null, request: null, proposal: null },
  }),
  base({
    id: 'salzpfad', kind: 'technik', tier: 1, name: 'Salzpfad', summary: 'Wege zum Salzsee und Tausch mit den Talbauern.',
    tags: ['handel', 'salz'], cost: { research: 4, resources: {} },
    effects: [{ op: 'module.activate', module: 'handel', bind: { currency: 'salz' } }, { op: 'resource.flow', res: 'salz', amount: 1 }],
    price: [{ op: 'resource.flow', res: 'material', amount: -1, when: ['herbst'] }],
    spec: null, origin: { source: 'world', practiceTags: ['handel', 'wege'], token: null, request: null, proposal: null },
  }),
  base({
    id: 'reiterschar', kind: 'einheit', tier: 1, name: 'Reiterschar', summary: 'Schnelle Reiter auf Bergpferden.',
    tags: ['krieg', 'reiter'], cost: { research: 4, resources: {} }, effects: [], price: [],
    spec: { strength: 2, mobility: 3, recruitCost: { nahrung: 2, herden: 1 }, upkeep: { nahrung: 1 }, tags: ['reiter'] },
    origin: { source: 'world', practiceTags: ['krieg', 'reiten'], token: null, request: null, proposal: null },
  }),
  base({
    id: 'speerwall', kind: 'einheit', tier: 1, name: 'Speerwall', summary: 'Fußvolk mit langen Speeren.',
    tags: ['krieg', 'fuss'], cost: { research: 4, resources: {} }, effects: [], price: [],
    spec: { strength: 3, mobility: 1, recruitCost: { material: 2, nahrung: 1 }, upkeep: { nahrung: 1 }, tags: ['fuss'] },
    origin: { source: 'world', practiceTags: ['krieg', 'verteidigung'], token: null, request: null, proposal: null },
  }),
  base({
    id: 'wachfeuer', kind: 'bauwerk', tier: 1, name: 'Wachfeuer', summary: 'Ein Feuer auf der Höhe warnt vor Feinden.',
    tags: ['bau', 'verteidigung'], cost: { research: 4, resources: {} },
    effects: [{ op: 'probe.mod', tags: ['verteidigung'], amount: 1 }, { op: 'sight.mod', amount: 1 }], price: [],
    spec: { terrains: ['alm', 'wiese', 'heide', 'wald', 'bergwald'], buildCost: { material: 2 }, perRegion: 1, upkeep: { material: 1 } },
    origin: { source: 'world', practiceTags: ['bau', 'verteidigung'], token: null, request: null, proposal: null },
  }),
  base({
    id: 'ahnensprache', kind: 'disziplin', tier: 1, name: 'Ahnensprache', summary: 'Im Rauch sprechen die Ahnen.',
    tags: ['magie', 'geist'], cost: { research: 4, resources: {} },
    effects: [{ op: 'module.activate', module: 'magie', bind: { source: 'rauchkraut' } }],
    price: [{ op: 'dependency', res: 'rauchkraut', amount: 1, penalty: [{ op: 'loyalty.delta', target: 'all', amount: -1 }] }],
    spec: {
      source: 'rauchkraut',
      applications: [{
        id: 'fernschau', name: 'Fernschau', slot: 'minor', target: 4, cost: { rauchkraut: 1 }, tags: ['magie', 'fernschau'], targetKind: 'tile',
        outcomes: {
          crit_success: [{ op: 'reveal', scope: 'tiles', at: '$target', radius: 3 }],
          success: [{ op: 'reveal', scope: 'tiles', at: '$target', radius: 2 }],
          narrow: [{ op: 'reveal', scope: 'tiles', at: '$target', radius: 1 }],
          failure: [],
          setback: [{ op: 'resource.delta', res: 'rauchkraut', amount: -1 }],
          crit_fail: [{ op: 'loyalty.delta', target: 'oppose:geist', amount: -1 }],
        },
      }],
    },
    origin: { source: 'world', practiceTags: ['geist', 'magie'], token: null, request: null, proposal: null },
  }),
  base({
    id: 'marktrecht', kind: 'institution', tier: 2, name: 'Marktrecht', summary: 'Ein Markttag mit festen Preisen.',
    tags: ['handel', 'markt', 'ordnung'], cost: { research: 8, resources: {} },
    prerequisites: { all: ['salzpfad'], any: [], if: null },
    effects: [{ op: 'order.unlock', order: 'trade.market' }, { op: 'stat.mod', stat: 'wohlstand', amount: 1 }],
    price: [{ op: 'resource.flow', res: 'salz', amount: -1 }],
    spec: { seat: { role: 'haendlerin', favor: ['handel'], oppose: ['krieg'] } },
    origin: { source: 'world', practiceTags: ['handel', 'markt'], token: null, request: null, proposal: null },
  }),
];

export const EREIGNISSE = [
  { id: 'lawine', rev: 1, name: 'Lawine', text: 'Ein Hang geht ab.', band: 1, tags: ['winter'], if: null, effects: [{ op: 'resource.delta', res: 'herden', amount: -2 }], options: null },
  { id: 'kaelteeinbruch', rev: 1, name: 'Kälteeinbruch', text: 'Frost über Nacht.', band: 2, tags: ['winter'], if: null, effects: [{ op: 'resource.delta', res: 'nahrung', amount: -1 }], options: null },
  { id: 'stille-saison', rev: 1, name: 'Stille Saison', text: 'Nichts geschieht.', band: 3, tags: ['ereignis'], if: null, effects: [], options: null },
  {
    id: 'fremder-hirte', rev: 1, name: 'Fremder Hirte', text: 'Ein Hirte bittet um Aufnahme.', band: 3, tags: ['herde'], if: null, effects: [],
    options: [
      { id: 'aufnehmen', label: 'Aufnehmen', effects: [{ op: 'resource.delta', res: 'nahrung', amount: -1 }, { op: 'resource.delta', res: 'herden', amount: 1 }] },
      { id: 'abweisen', label: 'Abweisen', effects: [] },
    ],
  },
  { id: 'wanderhaendler', rev: 1, name: 'Wanderhändler', text: 'Ein Händler bringt Salz.', band: 4, tags: ['handel'], if: null, effects: [{ op: 'resource.delta', res: 'material', amount: 1 }], options: null },
  { id: 'gute-weide', rev: 1, name: 'Gute Weide', text: 'Das Gras steht hoch.', band: 5, tags: ['weide'], if: null, effects: [{ op: 'resource.delta', res: 'nahrung', amount: 3 }], options: null },
];

export const BESTIMMUNGEN = [
  {
    id: 'ueberdauern', rev: 1, name: 'Überdauern in den Kämmen', summary: 'Weiden halten, Winter überstehen, Pfade finden.',
    tags: ['weide', 'winter', 'wege'],
    milestones: [
      { id: 'weiden', text: 'Drei Regionen mit Hochweide halten', predicate: { pred: 'controls', count: 3, terrain: 'alm' } },
      { id: 'winter', text: 'Acht Jahreszeiten lang mindestens vier Sippen', predicate: { pred: 'holds', predicate: { pred: 'population.atLeast', value: 4 }, seasons: 8 } },
      { id: 'pfade', text: 'Drei Entwicklungen der Wege kennen', predicate: { pred: 'development.known', count: 3, tags: ['wege'] } },
    ],
  },
];

export const CONTENT = { entwicklungen: ENTWICKLUNGEN, ereignisse: EREIGNISSE, bestimmungen: BESTIMMUNGEN };

/** Fresh environment over the test package; regeln may be patched per test. */
export function testEnv(patch = {}) {
  return makeEnv({ welt: WELT, regeln: structuredClone({ ...REGELN, ...(patch.regeln ?? {}) }), content: structuredClone(patch.content ?? CONTENT) });
}

/** Package files as they would lie on disk under welten/<id>/. */
export function packageFiles() {
  const head = (format) => ({ format, version: 1, world: 'hochland' });
  return {
    'welt.json': WELT,
    'regeln.json': REGELN,
    'labels.json': { ...head('realmcraft-labels'), locale: 'de', labels: { 'view.karte': 'Karte' } },
    'style.json': { ...head('realmcraft-style'), image: { base: 'Aquarell', negative: '' }, imageTypes: {}, accents: {} },
    'content/entwicklungen.json': { ...head('realmcraft-entwicklungen'), items: ENTWICKLUNGEN },
    'content/ereignisse.json': { ...head('realmcraft-ereignisse'), items: EREIGNISSE },
    'content/bestimmungen.json': { ...head('realmcraft-bestimmungen'), items: BESTIMMUNGEN },
  };
}

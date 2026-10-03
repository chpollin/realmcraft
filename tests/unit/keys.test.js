// Golden test for image cache keys and prompts. Keys hash the full prompt
// text, so any byte change in a prompt builder or in the key composition
// orphans images users already generated and paid for.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { MODELS } from '../../js/images/gemini.js';
import * as P from '../../js/images/prompts.js';
import { BILDTYPEN } from '../../js/images/registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

// Edge cases the two fixtures do not exercise: reference photo, legacy single
// state.siedlung without prompt and with a quote in its name, explicit
// bildCacheKey on a map stand and on an event image, a unit without id.
function synthetic() {
  const s = load('examples/die-karren-kapitel-4.json');
  s.meta.spielname = 'Synthetische Partie';
  s.berater[0].referenz = { dataUrl: 'data:image/jpeg;base64,' + 'QUJD'.repeat(40) };
  s.siedlung = { name: 'Alte "Stadt"', typ: 'Lager', lage: 'am Fluss' };
  s.karte.chronik = [
    { id: 's1', zeit: 'Frühling 1', prompt: 'erste Karte' },
    { id: 's2', zeit: 'Sommer 1', prompt: 'zweite Karte', basiertAuf: 's1', bildCacheKey: 'fixedkey1' },
  ];
  s.karte.aktuellerStand = 's2';
  s.historie = [
    { jahre: 'Frühling 1', bild: { prompt: 'ein Fest' } },
    { jahre: 'Sommer 1', bild: { prompt: 'ein Sturm', bildCacheKey: 'fixedkey2' } },
    { jahre: 'Herbst 1' },
  ];
  s.armee = { moral: 'fest', verbaende: [{ id: 'v1', name: 'Speere', typ: 'Fussvolk', fuehrungId: s.berater[1].id }, { name: 'ohne id' }] };
  return s;
}

const STATES = {
  'die-karren-kapitel-4': () => load('examples/die-karren-kapitel-4.json'),
  'die-gestrandeten': () => load('examples/demo/die-gestrandeten/state.json'),
  synthetic,
};

// Default models, as the dashboard uses them without a settings override.
function golden(state) {
  const pm = MODELS.portrait;
  const mm = MODELS.map;
  const items = [];
  const push = (typ, id, prompt, key) => {
    const fPrompt = P.fortschreibenPrompt(prompt, state);
    items.push({ typ, id: id ?? null, prompt, key, fortschreibenKey: P.versionKey(P.identityOf(typ, id), 1, fPrompt, pm) });
  };
  for (const b of state.berater || []) push('berater', b.id, P.buildPortraitPrompt(b, state), P.portraitKey(b, state, pm));
  if (state.armee) push('armee', null, P.buildHeerschauPrompt(state), P.armeeBildKey(state, pm));
  for (const v of state.armee?.verbaende || []) push('verband', v.id, P.buildVerbandPrompt(v, state), P.verbandKey(v, state, pm));
  for (const m of state.maechte || []) push('macht', m.id, P.buildMachtPrompt(m, state), P.machtKey(m, state, pm));
  for (const g of state.gruppen || []) push('gruppe', g.id, P.buildGruppePrompt(g, state), P.gruppeKey(g, state, pm));
  for (const s of P.siedlungenAus(state)) push('siedlung', P.siedlungId(s), P.buildSiedlungPrompt(s, state), P.siedlungKey(s, state, pm));
  if (state.karte) items.push({ typ: 'karte', id: null, prompt: state.karte.prompt || '', key: P.mapKey(state, mm) });
  for (const e of P.karteChronik(state)) items.push({ typ: 'karte-stand', id: e.id, prompt: P.karteStandPrompt(state, e), key: P.karteStandKey(state, e, mm) });
  for (const h of state.historie || []) {
    if (!h.bild) continue;
    items.push({ typ: 'ereignis', id: h.jahre || '', prompt: P.buildEreignisPrompt(h, state), key: P.ereignisKey(h, state, pm) });
  }
  const partie = state?.meta?.spielname || state?.volk?.name || null;
  return { partie: partie ? P.partieTag(partie) : null, items };
}

// Snapshot of the image keys and prompts as produced by js/app.js before the
// prompt builders were extracted (commit 6d27ec3). Never regenerate this from
// the current code to make the test pass: a difference means users' cached and
// paid images would be orphaned.
const GOLDEN = {
  "die-karren-kapitel-4": {
    "partie": "c56ca54b",
    "items": [
      {
        "typ": "berater",
        "id": "borka",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Borka, Sicherheit und Speicher. Verwittertes, wachsames Gesicht, kräftige Statur, schlichte dunkle Wolle, ein Bund schwerer Schlüssel am Gürtel.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "57ef2e85",
        "fortschreibenKey": "8cc00254"
      },
      {
        "typ": "berater",
        "id": "idr",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Idr, Nahrung und Diplomatie. Schlanke Frau mittleren Alters mit ruhigem, klugem Blick, einfacher Reisekleidung und einem diplomatischen Abzeichen.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "b911c932",
        "fortschreibenKey": "cf60325b"
      },
      {
        "typ": "berater",
        "id": "mell",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Mell, Bau. Kräftige Baumeisterhände, lederne Schürze, Zirkel und Senklot, ruhige Beständigkeit.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "04c90e3d",
        "fortschreibenKey": "50d839ff"
      },
      {
        "typ": "berater",
        "id": "yann",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Yann, Späher und Netz. Sehnige Spähergestalt in erdfarbenem Umhang, scharfer Blick, leichte Ausrüstung für lange Wege.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "a83c72f7",
        "fortschreibenKey": "f7054346"
      },
      {
        "typ": "berater",
        "id": "harn",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Harn, Metall und Wissen, Haupt des Wissenshauses. Älterer Meister mit rußigen Händen und feinem Werkzeug, Schriftrollen und ein Stück gehärteten Stahls, Haupt des Wissenshauses.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "665d2481",
        "fortschreibenKey": "f299ef6e"
      },
      {
        "typ": "berater",
        "id": "renja",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Renja, Talvolk. Aufrechte Gestalt aus dem Talvolk in gewebter Tracht, würdevoll, von harter Arbeit gezeichnet.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "ee066aa7",
        "fortschreibenKey": "4cdf0cf8"
      },
      {
        "typ": "berater",
        "id": "soren",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Soren, Stimme der Bundesvölker. Besonnener Sprecher der Bundesvölker, gemischte Tracht mehrerer Völker, offener, verbindender Ausdruck.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "122be021",
        "fortschreibenKey": "d121bd2c"
      },
      {
        "typ": "macht",
        "id": "bund-der-freien",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. Bund der Freien, Gemeinschaft eigenständiger freier Völker. Banner vieler verschiedener freier Völker, lose vereint, ohne ein beherrschendes Wappen.. Haltung: Ohne gemeinsamen Feind sich lockernd, die Gründungsfrage neu gestellt. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "12104192",
        "fortschreibenKey": "c22659c9"
      },
      {
        "typ": "macht",
        "id": "lir",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. Die Lir, Befreundetes freies Volk im Westen. Freundliches Volk des Westens in heller, gewebter Tracht, Händler und Verbündete.. Haltung: Befreundet, über die Trasse verbunden. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "d11cf019",
        "fortschreibenKey": "a2bb6ef7"
      },
      {
        "typ": "macht",
        "id": "drenn",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. Die Drenn, Bergvolk im Norden, Bundesgenosse. Raues Bergvolk des hohen Nordlands, Bergleute und Erzhändler.. Haltung: Treuer Bundesgenosse und Erzquelle über den Erzweg. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "40506443",
        "fortschreibenKey": "27aeec0b"
      },
      {
        "typ": "macht",
        "id": "aurelan",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. Aurelan, Großmacht der weiten Welt im Osten. Mächtiges, reiches Reich mit disziplinierten Heeren und feiner Amtskultur, fremdländische Pracht.. Haltung: Erkannte die Karren als Freie an, die Bedrohung gelöst, aber als Macht weiter vorhanden. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "ba4492bf",
        "fortschreibenKey": "c0b613e2"
      },
      {
        "typ": "macht",
        "id": "kontinent",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. Der weite Kontinent, Dünn bekanntes Land vieler Völker. Weites, kaum kartiertes Land mit vielen unbekannten Völkern an den Rändern.. Haltung: Weithin unerforscht. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "ec9ecabb",
        "fortschreibenKey": "7952a5bc"
      },
      {
        "typ": "gruppe",
        "id": "hirten",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Hirten. Wirken: Weidewirtschaft. Sprecher: Idr. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "355b9245",
        "fortschreibenKey": "8dc6ef02"
      },
      {
        "typ": "gruppe",
        "id": "bauern",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Bauern und Talbauern. Wirken: Talackerbau, verbesserter Anbau, die Schule. Sprecher: Renja. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "9b7c23a0",
        "fortschreibenKey": "52078b45"
      },
      {
        "typ": "gruppe",
        "id": "spaeher",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Späher. Wirken: Äußerer Späh- und Absicherungsdienst. Sprecher: Yann. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "fdb62284",
        "fortschreibenKey": "3cbb1bd1"
      },
      {
        "typ": "gruppe",
        "id": "handwerk",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Handwerk und Bau. Wirken: Werke und Bauvorhaben. Sprecher: Mell. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "56d0e4cc",
        "fortschreibenKey": "65049157"
      },
      {
        "typ": "gruppe",
        "id": "schmiede",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Schmiede und Erz. Wirken: Schmieden, Stollen, Wissen, der Vorsprung. Sprecher: Harn. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "3038ea0d",
        "fortschreibenKey": "c4fd2888"
      },
      {
        "typ": "gruppe",
        "id": "heer",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Erprobtes Heer. Wirken: Wache, Vorräte, Festung. Sprecher: Borka. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "7eec96fc",
        "fortschreibenKey": "f8d3ad3e"
      },
      {
        "typ": "gruppe",
        "id": "verwaltung",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Stadtverwaltung und Wissensgilde. Wirken: Schreib- und Verwaltungswesen, der Zensus. Sprecher: Tova. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "45ea6a77",
        "fortschreibenKey": "57052fbb"
      },
      {
        "typ": "gruppe",
        "id": "bundesvoelker",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Freie Völker des Bundes. Wirken: Gemeinschaft eigenständiger Völker. Sprecher: Soren. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "b3d5e6b7",
        "fortschreibenKey": "3ce9ab11"
      },
      {
        "typ": "karte",
        "id": null,
        "prompt": "Saubere, moderne, professionelle Landkarte im flachen kartografischen Stil, kein Pergament. Mittelpunkt ist die zur Festung ausgebaute Bergstadt Die Karren im Hochgebirge mit Wissenshaus, Versammlung und Stadtverwaltung. Südlich darunter das Korntal mit seinen Hofweilern, die Kornkammer. Am tiefen Stollen die junge Bergmannssiedlung Erzgrund. Vor der Festung nach Süden, am alten Außenposten Richtung Tal, ein neu geplantes Stadtviertel. Im Norden, über einen Gebirgspass, das hohe Land der Drenn, verbunden durch den Erzweg. Ringsum die Föderation mit den zehn Bundesorten Steinbach, Nordfels, Hohenstein, Grünwald, Eichenfurt, Sonnenried, Blütenau, Südtor, Brunnenried und Westmark, verbunden durch Bundeswege, dazu im Frieden gewachsene Weiler. Eichenfurt im Osten ist das Tor zur weiten Welt, dort wurde Aurelan abgewehrt. Im Westen das befreundete freie Volk der Lir, über eine Trasse verbunden. Weit im Osten, jenseits des eigenen Landes, die Großmacht Aurelan im wachsamen Frieden. An den Rändern bleibt unerforschtes Land offen. Deutsche Beschriftungen, ein Kompass und eine Legende, gedämpfte natürliche Farben.",
        "key": "c0869998"
      }
    ]
  },
  "die-gestrandeten": {
    "partie": "7e848658",
    "items": [
      {
        "typ": "berater",
        "id": "grask",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Grask Eisenzahn, Krieg und Wehr (die Orkschar). hochgewachsener Ork, graugruene Haut voller alter Narben, ein eiserner Zahn, zerbeulter Plattenharnisch, gekerbte Axt. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "0c097ee2",
        "fortschreibenKey": "5a533806"
      },
      {
        "typ": "berater",
        "id": "yssa",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Yssa Daemmerlied, Zauber und das Alte (der Zirkel). schlanke Elfe, aschblondes Haar, blasse silbrige Augen, verblichener Sternenmantel, Finger voll Zauberzeichen; seit dem Scheiterhaufen gezeichnet - uebernaechtigt, ein dunkler Schatten um die Augen, eine feine Spur des Schleiers, den sie traegt, das 'offene Auge' des Finsteren auf ihr. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "85d331f7",
        "fortschreibenKey": "efc16221"
      },
      {
        "typ": "berater",
        "id": "borin",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Borin Zunfthand, Werk und Eisen (die Zunftleute). gedrungener Humanoid, russiger Lederschurz, brandnarbige Haende, Guertel voll Werkzeug, ein messingnes Augenglas. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "9e7e089b",
        "fortschreibenKey": "3b344bde"
      },
      {
        "typ": "berater",
        "id": "mara",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Mara Tiden, Nahrung und Versorgung (die Versorger). hagere Frau, salzweisses Haar im Zopf, Netz und Sichel am Guertel, ruhige muede Augen. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "39714dbf",
        "fortschreibenKey": "47030c25"
      },
      {
        "typ": "berater",
        "id": "vesk",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Vesk, Kundschaft und Pfade (die Spaeher). drahtiger Humanoid, fleckiger Tarnmantel, Kurzbogen, Augen die nie ruhen, eine Kette aus Tierzaehnen. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "80b3770f",
        "fortschreibenKey": "960ac26b"
      },
      {
        "typ": "berater",
        "id": "alde",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Alde Graumahl, Gedaechtnis, Heilkunde und die Toten (die Zivilen). alte Frau, gebeugt, grauer Umhang voll Amulette, ein Stab, milchiges linkes Auge, an der Huefte ein Buch aus Khar. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "b24a3c83",
        "fortschreibenKey": "60212fe8"
      },
      {
        "typ": "armee",
        "id": null,
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. weite Heerschau, eine aufgestellte Streitmacht in der Landschaft, mehrere Gruppen, dokumentarische Totale, kein einzelner Held. die Verbaende: die Orkschar (Sturmtruppe), die Spaeher (Kundschafter), die Miliz (Aufgebot). Stimmung: hoch; der grosse Klan zweimal am Wall gebrochen, der Stille verbrannt, und nun das vierte Boot als Zeichen, dass das Glueck nicht ganz fort ist - geeint, gehaertet, ein wenig getroestet. ein zerschlagener Treck aus Orks, Elfen, Humanoiden und Menschen; geflickte Ruestungen, gerettete Werkzeuge, abgekaempfte Gesichter unter grauem Himmel. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "5a265ab2",
        "fortschreibenKey": "e887318b"
      },
      {
        "typ": "verband",
        "id": "orkschar",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. eine kleine Gruppe Krieger desselben Verbandes, Dreiviertelansicht, dokumentarisch, leicht aus der Mitte, schlichter Hintergrund, natuerliche Asymmetrie. die Orkschar, Sturmtruppe. Ausruestung: geflickte Ruestung, gerettete Waffen aus Khar. Verfassung: kampferprobt, hielt den Wall; weitere Verluste. gefuehrt von Grask Eisenzahn. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "b271ea7c",
        "fortschreibenKey": "c638c4a8"
      },
      {
        "typ": "verband",
        "id": "spaeher",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. eine kleine Gruppe Krieger desselben Verbandes, Dreiviertelansicht, dokumentarisch, leicht aus der Mitte, schlichter Hintergrund, natuerliche Asymmetrie. die Spaeher, Kundschafter. Ausruestung: Kurzboegen, Messer, Tarnmaentel. Verfassung: erschuettert; an den Erzklippen gestellt, zwei verloren. gefuehrt von Vesk. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "a3e599b7",
        "fortschreibenKey": "fc4c0ab6"
      },
      {
        "typ": "verband",
        "id": "miliz",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. eine kleine Gruppe Krieger desselben Verbandes, Dreiviertelansicht, dokumentarisch, leicht aus der Mitte, schlichter Hintergrund, natuerliche Asymmetrie. die Miliz, Aufgebot. Ausruestung: Speere und Aexte aus der Schmiede. Verfassung: siegreich am Wall, durch sechs Krieger des vierten Boots verstaerkt; stolz und gehaertet. gefuehrt von Borin Zunfthand. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "221f2d0b",
        "fortschreibenKey": "e2a9c11b"
      },
      {
        "typ": "macht",
        "id": "das-finstere",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. das Finstere, Schattenmacht ueber See. kein Gesicht, nur Zeichen: erloeschende Feuer, schwarze Fahrten am Horizont, Menschen die mit leeren Augen wiederkommen. Haltung: frisst Khar, greift langsam ueber die See; sucht, was entkommen ist. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "ddafe77c",
        "fortschreibenKey": "c24aab64"
      },
      {
        "typ": "macht",
        "id": "eisenkonkordat",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. das Eisenkonkordat, Festland-Techmacht. rauchende Hafenfestungen, Maenner in genieteten Harnischen, Dampf und Zahnrad, Banner mit dem schwarzen Amboss. Haltung: expandiert ueber See, sucht Erz und Brueckenkoepfe; verachtet Zauber. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "3a05a0c3",
        "fortschreibenKey": "27f243cf"
      },
      {
        "typ": "macht",
        "id": "die-stillen",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. die Stillen, altes Elfenvolk der Region. selten gesehen, Lichter im Nebelwald, Steinkreise, lautlose Boote aus Rinde. Haltung: die Holzfaeller der Gestrandeten kreuzten das Grenzmal; die Stillen toeteten sie lautlos als Warnung und dulden nun keinen Fuss mehr in ihrem Gebiet. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "86899b4e",
        "fortschreibenKey": "f17579fe"
      },
      {
        "typ": "macht",
        "id": "schaedelklans",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. die Schaedelklans, wilde Inselorks. bemalte Wilde mit Knochenschmuck, Trommeln im Nebel, Pfahlschaedel an den Pfaden. Haltung: der groessere Klan stuermte Graulandung und wurde am Steinwall zurueckgeworfen; geschlagen, nicht gebrochen, und nun gewarnt. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "829012b1",
        "fortschreibenKey": "54d570f0"
      },
      {
        "typ": "gruppe",
        "id": "orkschar",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. die Orkschar. Wirken: Krieg, rohe Kraft, Sturm und Wehr. Sprecher: Grask Eisenzahn. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "a01d5a89",
        "fortschreibenKey": "7f2f9098"
      },
      {
        "typ": "gruppe",
        "id": "zirkel",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. der Zirkel. Wirken: schwache Magie, das Alte lesen, Wahrnehmung. Sprecher: Yssa Daemmerlied. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "c893863d",
        "fortschreibenKey": "fd0df689"
      },
      {
        "typ": "gruppe",
        "id": "zunftleute",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. die Zunftleute. Wirken: Schmiede, Bau, Werkzeug, Technik. Sprecher: Borin Zunfthand. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "7a2bd6f8",
        "fortschreibenKey": "4b1fac7a"
      },
      {
        "typ": "gruppe",
        "id": "versorger",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. die Versorger. Wirken: Fischfang, Ackerbau, Vorraete, Heilung des Leibes. Sprecher: Mara Tiden. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "2fb3e0a6",
        "fortschreibenKey": "eb4094a5"
      },
      {
        "typ": "gruppe",
        "id": "spaeher",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. die Spaeher. Wirken: Kundschaft, Pfade, Jagd, Fruehwarnung. Sprecher: Vesk. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "85f1e859",
        "fortschreibenKey": "88106f3f"
      },
      {
        "typ": "gruppe",
        "id": "zivilen",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. die Zivilen. Wirken: Gedaechtnis, Heilkunde, Sitte, Zusammenhalt der Schwachen. Sprecher: Alde Graumahl. aus die unbekannte Insel (Lager: Graulandung). kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "b3aa9c96",
        "fortschreibenKey": "8d7d1563"
      },
      {
        "typ": "siedlung",
        "id": "Graulandung",
        "prompt": "Eine Feldskizze in Tusche und Kohle, Stand Herbst im zweiten Jahr: die Festungssiedlung Graulandung in einer grauen Kieselbucht, herbstlicher Nebel statt Schnee. Ein Steinwall mit Wallgraben und schwerem Torhaus, an den Ecken hoelzerne Spaehtuerme; dahinter eng gedraengte, halb eingegrabene Huetten aus Torf, Stein und Bootsplanken, dazu frische, rohe Notunterkuenfte am Wallrand fuer die Neuankoemmlinge, Rauch aus den Daechern. Am Kiesstrand drei ausgeschlachtete Langboote und ein viertes, frisch gestrandetes, sturmzerschlagenes Boot. Im Norden die nun freien schwarzen Erzklippen, im Westen die Wand des Nebelwaldes, im Osten die dunkle See. Ueber dem Lager ein kaum sichtbarer Schleier (die Verhuellung) und eine gedrueckte, wachsame Stimmung. Gedaempftes Asche- und Eisengrau, ein warmer Erdton im Feuerschein.",
        "key": "93d82dd3",
        "fortschreibenKey": "fdb383f5"
      },
      {
        "typ": "karte",
        "id": null,
        "prompt": "Entwickle die vorige Seekarte weiter (die Karte 'fruehling-j2' als Bild-Vorlage nehmen): gleicher Stil - vergilbtes Pergament, Tusche und Kohle, Nebelraender, Kompassrose, Seeungeheuer am Rand -, gleiche Kueste und Orte, doch der Stand des Herbstes im zweiten Jahr, kein Schnee. Veraendert: an den Erzklippen im Norden ist das Klan-Vorlager zerschlagen und verlassen (zerbrochene Knochenbanner), die Klippen nun frei; im Nebelwald nur noch verstreute kleine Banden-Marken statt eines Heeres; in der Bucht von Graulandung liegt nun ein viertes, sturmzerschlagenes Langboot bei den drei alten; ueber dem Lager weiter der zarte Schleier (die Verhuellung); das Grenzmal der Stillen im Westen blutig markiert; und am oestlichen Rand greift der Schatten des Finsteren ueber der Schwarzen See erstmals mit einem duennen, kalten Auslaeufer an die Kueste der Insel selbst (der erste Beruehrte). Herbstliche, gedaempfte Asche- und Eisentoene.",
        "key": "87d2596d"
      },
      {
        "typ": "karte-stand",
        "id": "gruendung-j1",
        "prompt": "alte handgezeichnete Seekarte, vergilbtes Pergament, Nebelraender, unerforschte Insel mit weissen Flecken, Kompassrose, Seeungeheuer am Kartenrand. Alte, vergilbte Seekarte einer unerforschten Insel im grimdunklen Stil, Tusche und Kohle auf Pergament, Nebelraender und weisse unerforschte Flecken. Im Zentrum der Kuestenstreifen Graulandung mit drei gestrandeten Langbooten. Landeinwaerts der dichte, daemmrige Nebelwald (Reich der Stillen und der Schaedelklans). Im Norden schroffe Erzklippen. Im Sueden, im Hoehenland, die Stummen Ringe, alte Steinkreise einer toten Macht. Im Osten, ueber der Schwarzen See, der Horizont gen Khar, aus dem das Finstere kommt: erloeschende Feuer und schwarze Segel. Kompassrose, Seeungeheuer am Kartenrand, gedaempfte Asche- und Eisentoene.",
        "key": "a80a9d87"
      },
      {
        "typ": "karte-stand",
        "id": "fruehling-j2",
        "prompt": "alte handgezeichnete Seekarte, vergilbtes Pergament, Nebelraender, unerforschte Insel mit weissen Flecken, Kompassrose, Seeungeheuer am Kartenrand. Entwickle die vorige Seekarte weiter (die fruehere Karte als Bild-Vorlage nehmen): gleicher Stil, gleiche Kueste und Orte, doch der Stand des zweiten Fruehlings. Veraendert: Graulandung deutlicher als Festung; an den Erzklippen ein Klan-Vorlager mit Knochenbannern, umkaempft; Bewegungslinien des Klans aus dem Nebelwald gegen Graulandung; ein zarter Schleier ueber dem Lager (die Verhuellung); das Grenzmal der Stillen blutig markiert; ueber der Schwarzen See der Schatten des Finsteren naeher. Vergilbtes Pergament, Tusche und Kohle, Nebelraender, Kompassrose, Seeungeheuer, Asche- und Eisentoene.",
        "key": "1e1f5f68"
      },
      {
        "typ": "karte-stand",
        "id": "herbst-j2",
        "prompt": "alte handgezeichnete Seekarte, vergilbtes Pergament, Nebelraender, unerforschte Insel mit weissen Flecken, Kompassrose, Seeungeheuer am Kartenrand. Entwickle die vorige Seekarte weiter (die Karte 'fruehling-j2' als Bild-Vorlage nehmen): gleicher Stil - vergilbtes Pergament, Tusche und Kohle, Nebelraender, Kompassrose, Seeungeheuer -, gleiche Kueste und Orte, doch der Stand des Herbstes im zweiten Jahr, kein Schnee. Veraendert: an den Erzklippen im Norden ist das Klan-Vorlager zerschlagen und verlassen (zerbrochene Knochenbanner), die Klippen frei; im Nebelwald nur noch verstreute kleine Banden-Marken statt eines Heeres; in der Bucht von Graulandung ein viertes, sturmzerschlagenes Langboot bei den drei alten; ueber dem Lager der zarte Schleier (die Verhuellung); das Grenzmal der Stillen im Westen blutig markiert; am oestlichen Rand greift der Schatten des Finsteren ueber der Schwarzen See erstmals mit einem duennen, kalten Auslaeufer an die Kueste der Insel selbst (der erste Beruehrte). Herbstliche Asche- und Eisentoene.",
        "key": "b706c20b"
      },
      {
        "typ": "ereignis",
        "id": "vor Jahr 1",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Feldskizze in Tusche und Kohle auf getoentem Papier: ueberladene Langboote auf schwerer Nachtsee, Gischt und Nebel. Am fernen Horizont die erloeschenden Feuer der Kueste Khars unter einem gestaltlosen, alles verschluckenden Schatten. In den Booten erschoepfte Gesichter dreier Voelker - Orks, Elfen, Menschen - dicht gedraengt. Monochromes Asche- und Eisengrau, ein einziger warmer Erdton im fernen Feuerschein.",
        "key": "4a93d0b6"
      },
      {
        "typ": "ereignis",
        "id": "Jahr 1, Fruehling",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Feldskizze in Tusche und Kohle: drei zerschlagene Langboote auf grauem Kies in nebliger Bucht. Ein zerlumpter Treck dreier Voelker errichtet einen ersten niedrigen Wall aus Wrackholz, Rauch der ersten Feuer; im Ruecken die dunkle Wand des Nebelwaldes. Asche- und Eisengrau, ein warmer Erdton im Feuerrauch.",
        "key": "048ac46b"
      },
      {
        "typ": "ereignis",
        "id": "Jahr 1, Sommer",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Feldskizze in Tusche und Kohle, naechtliche Szene: bemalte wilde Inselorks mit Knochenschmuck branden gegen das junge Wrackholz-Lager, Flammen schlagen aus den Speichern, Verteidiger dreier Voelker halten den niedrigen Wall mit Speeren. Am Rand eine reglose, schmale Gestalt (der Stille), die nicht kaempft, halb im Schatten. Asche- und Eisengrau, greller Erdton im Brand.",
        "key": "1a637fcc"
      },
      {
        "typ": "ereignis",
        "id": "Jahr 1, Herbst",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Feldskizze in Tusche und Kohle: der grosse Schaedelklan in voller Zahl brandet gegen einen fertigen Steinwall mit Graben, schwerem Torhaus und Spaehtuermen. Auf der Mauer halten Orks der Wehr (ein hochgewachsener Ork mit eisernem Zahn) die Stellung; Gefallene haeufen sich vor dem Wall. Erster Frost, kahle Aeste. Asche- und Eisengrau, ein Erdton in Blut und Rost.",
        "key": "95dd31c1"
      },
      {
        "typ": "ereignis",
        "id": "Jahr 1, Winter",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Feldskizze in Tusche und Kohle: ein grosses Feuer im verschneiten, eingegrabenen Lager bei Nacht, Funken steigen in den Schnee ('Funke im Schnee'). Eine hochgewachsene Gestalt (die oder der Erste) spricht zur versammelten Menge dreier Voelker, die Gesichter im Feuerschein. Etwas abseits, einander zugewandt, ein gedrungener Schmied mit Eisenwerkzeug und eine schlanke Elfe mit leuchtenden Zauberzeichen - die zwei Lichter nebeneinander. Asche- und Eisengrau, warmer Erdton im Feuer.",
        "key": "37029ebf"
      },
      {
        "typ": "ereignis",
        "id": "Jahr 2, Fruehling",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Feldskizze in Tusche und Kohle auf getoentem Papier, dramatischer Feuerschein bei Nacht in der Festung Graulandung: ein hoher Scheiterhaufen brennt mitten auf dem dicht gefuellten Versammlungsplatz, ein hagerer gefesselter Mann (der Stille) in den Flammen, ohne Schrei. Auf einer Buehne eine kapuzentragende Gestalt (die oder der Erste), von unten vom Feuer beleuchtet, ein Arm erhoben, mitten in der Rede, das Gesicht hart - 'das reinigende Feuer'. Eine zerlumpte Menge aus Orks, Elfen und Menschen, Gesichter halb Ehrfurcht, halb Furcht. Seitlich eine blasse Elfe (Yssa) reglos im Zentrum des Feuerscheins, die Augen zu hell, ein feiner schimmernder Schleier ueber dem Platz, gezeichnet. Am Rand ein alter Mann (Alde), der sich ins Dunkel abwendet. Funken steigen in den Nebelhimmel, die See schwarz hinter dem Wall. Reinigung und Grauen zugleich. Asche- und Eisengrau, greller Erdton im Brand.",
        "key": "94f40a65"
      },
      {
        "typ": "ereignis",
        "id": "Jahr 2, Sommer",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Feldskizze in Tusche und Kohle: ein sturmzerschlagenes viertes Langboot strandet im grauen Kies der Bucht von Graulandung, ausgemergelte Ueberlebende kriechen ans Ufer. Das Lager laeuft zusammen, Haende greifen nach Haenden. Im Vordergrund erkennt eine gebeugte alte Frau (Alde) einen alten, hageren Mann (Eskil), der eine schwere ledergebundene Truhe an die Brust presst - ein Wiedersehen. Dahinter der Steinwall der Festung im Sommernebel. Asche- und Eisengrau, ein warmer Erdton der Wiederbegegnung.",
        "key": "c6daaa82"
      },
      {
        "typ": "ereignis",
        "id": "Jahr 2, Herbst",
        "prompt": "Tuschelavierung und Kohle auf getoentem, geborgenem Papier; eine Feldskizze aus dem Tagebuch eines ueberlebenden Chronisten; sichtbare Papiernarbe, Wasser- und Stockflecken, abgegriffene Raender; sparsame, sichere Linienfuehrung; monochromes Asche- und Eisengrau mit einem einzigen gedaempften Erdton als Akzent; ruhig, dokumentarisch, von Hand festgehalten. Feldskizze in Tusche und Kohle, gedrueckte Herbstnacht im Lager: ein schmaler junger Mann (Henk) sitzt am Rand des grossen Feuers, doch das Feuer waermt ihn nicht - die Augen einen Hauch zu dunkel, der Blick leer, er friert nicht. Die Umstehenden weichen unmerklich zurueck. Ein alter Bewahrer (Eskil) erkennt mit Entsetzen das Zeichen, eine Hand an der Truhe. Nebel kriecht durchs Torhaus herein. Kaelte trotz Feuer. Asche- und Eisengrau, ein matter, fast erloschener Erdton.",
        "key": "18a224fa"
      }
    ]
  },
  "synthetic": {
    "partie": "bd7c2127",
    "items": [
      {
        "typ": "berater",
        "id": "borka",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Borka, Sicherheit und Speicher. Verwittertes, wachsames Gesicht, kräftige Statur, schlichte dunkle Wolle, ein Bund schwerer Schlüssel am Gürtel.. Gesicht, Kopfform, Bart und Statur nach dem beigefuegten Referenzfoto uebernehmen, dieselbe Person, in Kleidung, Welt und Stil dieser Partie uebersetzt, Aehnlichkeit wahren. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "33448907",
        "fortschreibenKey": "d33775a4"
      },
      {
        "typ": "berater",
        "id": "idr",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Idr, Nahrung und Diplomatie. Schlanke Frau mittleren Alters mit ruhigem, klugem Blick, einfacher Reisekleidung und einem diplomatischen Abzeichen.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "b911c932",
        "fortschreibenKey": "cf60325b"
      },
      {
        "typ": "berater",
        "id": "mell",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Mell, Bau. Kräftige Baumeisterhände, lederne Schürze, Zirkel und Senklot, ruhige Beständigkeit.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "04c90e3d",
        "fortschreibenKey": "50d839ff"
      },
      {
        "typ": "berater",
        "id": "yann",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Yann, Späher und Netz. Sehnige Spähergestalt in erdfarbenem Umhang, scharfer Blick, leichte Ausrüstung für lange Wege.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "a83c72f7",
        "fortschreibenKey": "f7054346"
      },
      {
        "typ": "berater",
        "id": "harn",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Harn, Metall und Wissen, Haupt des Wissenshauses. Älterer Meister mit rußigen Händen und feinem Werkzeug, Schriftrollen und ein Stück gehärteten Stahls, Haupt des Wissenshauses.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "665d2481",
        "fortschreibenKey": "f299ef6e"
      },
      {
        "typ": "berater",
        "id": "renja",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Renja, Talvolk. Aufrechte Gestalt aus dem Talvolk in gewebter Tracht, würdevoll, von harter Arbeit gezeichnet.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "ee066aa7",
        "fortschreibenKey": "4cdf0cf8"
      },
      {
        "typ": "berater",
        "id": "soren",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. Brustbild im Dreiviertelprofil, eine einzelne Figur, leicht aus der Mitte, auf Augenhoehe, schlichter zurueckhaltender Hintergrund, natuerliche Asymmetrie. Soren, Stimme der Bundesvölker. Besonnener Sprecher der Bundesvölker, gemischte Tracht mehrerer Völker, offener, verbindender Ausdruck.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, keine moderne Kleidung, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "122be021",
        "fortschreibenKey": "d121bd2c"
      },
      {
        "typ": "armee",
        "id": null,
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. weite Heerschau, eine aufgestellte Streitmacht in der Landschaft, mehrere Gruppen, dokumentarische Totale, kein einzelner Held. die Verbaende: Speere (Fussvolk), ohne id. Stimmung: fest. Hartes Bergvolk in funktionaler Wolle und Leder mit feiner Metallarbeit, Werkzeug und Wissensschriften.. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "e663ede9",
        "fortschreibenKey": "b4cec1fb"
      },
      {
        "typ": "verband",
        "id": "v1",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Krieger desselben Verbandes, Dreiviertelansicht, dokumentarisch, leicht aus der Mitte, schlichter Hintergrund, natuerliche Asymmetrie. Speere, Fussvolk. gefuehrt von Idr. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "64c9ccc7",
        "fortschreibenKey": "da4b9bf0"
      },
      {
        "typ": "verband",
        "id": null,
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Krieger desselben Verbandes, Dreiviertelansicht, dokumentarisch, leicht aus der Mitte, schlichter Hintergrund, natuerliche Asymmetrie. ohne id. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "e41011df",
        "fortschreibenKey": "cfd3f26b"
      },
      {
        "typ": "macht",
        "id": "bund-der-freien",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. Bund der Freien, Gemeinschaft eigenständiger freier Völker. Banner vieler verschiedener freier Völker, lose vereint, ohne ein beherrschendes Wappen.. Haltung: Ohne gemeinsamen Feind sich lockernd, die Gründungsfrage neu gestellt. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "12104192",
        "fortschreibenKey": "c22659c9"
      },
      {
        "typ": "macht",
        "id": "lir",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. Die Lir, Befreundetes freies Volk im Westen. Freundliches Volk des Westens in heller, gewebter Tracht, Händler und Verbündete.. Haltung: Befreundet, über die Trasse verbunden. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "d11cf019",
        "fortschreibenKey": "a2bb6ef7"
      },
      {
        "typ": "macht",
        "id": "drenn",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. Die Drenn, Bergvolk im Norden, Bundesgenosse. Raues Bergvolk des hohen Nordlands, Bergleute und Erzhändler.. Haltung: Treuer Bundesgenosse und Erzquelle über den Erzweg. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "40506443",
        "fortschreibenKey": "27aeec0b"
      },
      {
        "typ": "macht",
        "id": "aurelan",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. Aurelan, Großmacht der weiten Welt im Osten. Mächtiges, reiches Reich mit disziplinierten Heeren und feiner Amtskultur, fremdländische Pracht.. Haltung: Erkannte die Karren als Freie an, die Bedrohung gelöst, aber als Macht weiter vorhanden. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "ba4492bf",
        "fortschreibenKey": "c0b613e2"
      },
      {
        "typ": "macht",
        "id": "kontinent",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein eindringliches Bild dieser fremden Macht, Szene oder Wesen wie beschrieben, atmosphaerisch, dokumentarisch, kein heroisches Posing. Der weite Kontinent, Dünn bekanntes Land vieler Völker. Weites, kaum kartiertes Land mit vielen unbekannten Völkern an den Rändern.. Haltung: Weithin unerforscht. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "ec9ecabb",
        "fortschreibenKey": "7952a5bc"
      },
      {
        "typ": "gruppe",
        "id": "hirten",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Hirten. Wirken: Weidewirtschaft. Sprecher: Idr. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "355b9245",
        "fortschreibenKey": "8dc6ef02"
      },
      {
        "typ": "gruppe",
        "id": "bauern",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Bauern und Talbauern. Wirken: Talackerbau, verbesserter Anbau, die Schule. Sprecher: Renja. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "9b7c23a0",
        "fortschreibenKey": "52078b45"
      },
      {
        "typ": "gruppe",
        "id": "spaeher",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Späher. Wirken: Äußerer Späh- und Absicherungsdienst. Sprecher: Yann. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "fdb62284",
        "fortschreibenKey": "3cbb1bd1"
      },
      {
        "typ": "gruppe",
        "id": "handwerk",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Handwerk und Bau. Wirken: Werke und Bauvorhaben. Sprecher: Mell. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "56d0e4cc",
        "fortschreibenKey": "65049157"
      },
      {
        "typ": "gruppe",
        "id": "schmiede",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Schmiede und Erz. Wirken: Schmieden, Stollen, Wissen, der Vorsprung. Sprecher: Harn. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "3038ea0d",
        "fortschreibenKey": "c4fd2888"
      },
      {
        "typ": "gruppe",
        "id": "heer",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Erprobtes Heer. Wirken: Wache, Vorräte, Festung. Sprecher: Borka. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "7eec96fc",
        "fortschreibenKey": "f8d3ad3e"
      },
      {
        "typ": "gruppe",
        "id": "verwaltung",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Stadtverwaltung und Wissensgilde. Wirken: Schreib- und Verwaltungswesen, der Zensus. Sprecher: Tova. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "45ea6a77",
        "fortschreibenKey": "57052fbb"
      },
      {
        "typ": "gruppe",
        "id": "bundesvoelker",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. eine kleine Gruppe Menschen bei ihrem Handwerk, dokumentarisch, Dreiviertelansicht, schlichter Hintergrund, natuerliche Asymmetrie, kein Held im Zentrum. Freie Völker des Bundes. Wirken: Gemeinschaft eigenständiger Völker. Sprecher: Soren. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, keine symmetrische Heldenpose, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "b3d5e6b7",
        "fortschreibenKey": "3ce9ab11"
      },
      {
        "typ": "siedlung",
        "id": "Alte \"Stadt\"",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein weiter Blick auf die Siedlung eines Volkes, dokumentarische Totale, Behausungen und Menschen im Alltag, kein einzelner Held, kein heroisches Posing. Alte \"Stadt\", Lager. am Fluss. aus Hochgebirge mit dem Korntal als zweitem Standbein. kein glaenzendes 3D-Rendering, keine Airbrush-Glaette, kein Videospiel-Splashart, kein Text, kein Wasserzeichen, kein Rahmen",
        "key": "869da20e",
        "fortschreibenKey": "2c3ffea1"
      },
      {
        "typ": "karte",
        "id": null,
        "prompt": "Saubere, moderne, professionelle Landkarte im flachen kartografischen Stil, kein Pergament. Mittelpunkt ist die zur Festung ausgebaute Bergstadt Die Karren im Hochgebirge mit Wissenshaus, Versammlung und Stadtverwaltung. Südlich darunter das Korntal mit seinen Hofweilern, die Kornkammer. Am tiefen Stollen die junge Bergmannssiedlung Erzgrund. Vor der Festung nach Süden, am alten Außenposten Richtung Tal, ein neu geplantes Stadtviertel. Im Norden, über einen Gebirgspass, das hohe Land der Drenn, verbunden durch den Erzweg. Ringsum die Föderation mit den zehn Bundesorten Steinbach, Nordfels, Hohenstein, Grünwald, Eichenfurt, Sonnenried, Blütenau, Südtor, Brunnenried und Westmark, verbunden durch Bundeswege, dazu im Frieden gewachsene Weiler. Eichenfurt im Osten ist das Tor zur weiten Welt, dort wurde Aurelan abgewehrt. Im Westen das befreundete freie Volk der Lir, über eine Trasse verbunden. Weit im Osten, jenseits des eigenen Landes, die Großmacht Aurelan im wachsamen Frieden. An den Rändern bleibt unerforschtes Land offen. Deutsche Beschriftungen, ein Kompass und eine Legende, gedämpfte natürliche Farben.",
        "key": "c0869998"
      },
      {
        "typ": "karte-stand",
        "id": "s1",
        "prompt": "Sauberer, moderner, professioneller Kartenstil, kein Pergament, deutsche Beschriftungen, Kompass und Legende, gedämpfte natürliche Farben.. erste Karte",
        "key": "b6815864"
      },
      {
        "typ": "karte-stand",
        "id": "s2",
        "prompt": "Sauberer, moderner, professioneller Kartenstil, kein Pergament, deutsche Beschriftungen, Kompass und Legende, gedämpfte natürliche Farben.. zweite Karte",
        "key": "fixedkey1"
      },
      {
        "typ": "ereignis",
        "id": "Frühling 1",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein Fest",
        "key": "7226dac7"
      },
      {
        "typ": "ereignis",
        "id": "Sommer 1",
        "prompt": "Klare, moderne Fantasy-Illustration, gedämpfte Erdtöne, ruhiges Licht, halbnahe Charakterportraits, kein Text im Bild.. ein Sturm",
        "key": "fixedkey2"
      }
    ]
  }
};

for (const [name, expected] of Object.entries(GOLDEN)) {
  test(`image prompts and keys are byte-identical for ${name}`, () => {
    assert.deepStrictEqual(golden(STATES[name]()), expected);
  });

  // The registry feeds generation, hydration and export; each of its entities
  // must resolve to the pinned prompt and key.
  test(`registry resolves the pinned prompts and keys for ${name}`, () => {
    const state = STATES[name]();
    let checked = 0;
    for (const [typ, def] of Object.entries(BILDTYPEN)) {
      const model = MODELS[def.role];
      for (const e of def.list(state)) {
        const id = def.id(e) ?? null;
        const pinned = expected.items.find((it) => it.typ === typ && it.id === id);
        assert.ok(pinned, `no pinned item for ${typ}:${id}`);
        assert.equal(def.prompt(e, state), pinned.prompt, `prompt ${typ}:${id}`);
        assert.equal(def.key(e, state, model), pinned.key, `key ${typ}:${id}`);
        checked++;
      }
    }
    assert.ok(checked > 0);
  });
}

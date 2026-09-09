export const PLACES = {
  lys: { name: 'Lys', subtitle: 'Hauptstadt · 2.840 Bewohner', label: 'Dein Bündnis', code: '01', x: 48, y: 43, art: '49% 33%', icon: 'beacon', type: 'Die Hafenstadt', description: 'Seit drei Nächten brennt das Feuer von Lys allein. An den Kais warten Menschen aus den versunkenen Niederungen auf deine Entscheidung.', terrain: 'Geschützter Hafen', allegiance: 'Dein Bündnis', state: 'Leuchtfeuer aktiv', quote: 'Solange Lys leuchtet, finden die Schiffe einen Weg.', speaker: 'Rhea Voss · Hafenmeisterin', actions: ['provisions', 'repair'] },
  werft: { name: 'Salzwerft', subtitle: 'Gildenhafen · 640 Bewohner', label: 'Dein Bündnis', code: '02', x: 22.5, y: 54, art: '9% 58%', icon: 'ship', type: 'Die freien Werften', description: 'Zwischen alten Kränen liegen die letzten seetüchtigen Schiffe. Die Gilden liefern Baumaterial, solange der Hafen unter ihrem Schutz bleibt.', terrain: 'Werften & Docks', allegiance: 'Gildenvertrag', state: 'Produktion verfügbar', quote: 'Ein Schiff kann man ersetzen. Eine erfahrene Mannschaft kaum.', speaker: 'Jorek Senn · Sprecher der Gilden', actions: ['salvage', 'provisions'] },
  gaerten: { name: 'Glasgärten', subtitle: 'Klosterinsel · 310 Bewohner', label: 'Freie Insel', code: '03', x: 40, y: 68, art: '35% 100%', icon: 'beacon', type: 'Die überwucherten Ruinen', description: 'Unter den Wurzeln liegen die Spiegel einer älteren Küste. Ihr Feuer könnte den südlichen Seeweg öffnen. Das Kloster verlangt freien Zugang zu den Gärten.', terrain: 'Ruinen & Terrassen', allegiance: 'Freies Kloster', state: 'Leuchtfeuer erloschen', quote: 'Das Licht gehörte der Küste, lange bevor es Könige gab.', speaker: 'Ilyra Sen · Hüterin der Spiegel', actions: ['beacon', 'aether'] },
  aster: { name: 'Sternwarte', subtitle: 'Insel Aster · 180 Bewohner', label: 'Freie Insel', code: '04', x: 79, y: 27, art: '91% 8%', icon: 'beacon', type: 'Das nördliche Leuchtfeuer', description: 'Hoch über der Brandung wartet die alte Linse auf neues Feuer. Ihr Licht würde die nördliche Passage sichern und Aster wieder mit Lys verbinden.', terrain: 'Felsinsel & Observatorium', allegiance: 'Bund der Seherinnen', state: 'Leuchtfeuer erloschen', quote: 'Die See steigt schneller, als unsere Karten es vorhersagen.', speaker: 'Ilyra Sen · Hüterin der Spiegel', actions: ['beacon', 'study'] },
  riff: { name: 'Schwarzes Riff', subtitle: 'Verlassene Insel', label: 'Unbewohnt', code: '05', x: 81, y: 68, art: '100% 76%', icon: 'aether', type: 'Das zerbrochene Heiligtum', description: 'Ein schwaches Glimmen steigt aus den Spalten des Riffs. Eine Bergungsmannschaft könnte dort Äther finden, den die alten Linsen benötigen.', terrain: 'Vulkanisches Gestein', allegiance: 'Ohne Herrschaft', state: 'Bergung möglich', quote: 'Wir wissen, was dort leuchtet. Noch wissen wir nicht, warum.', speaker: 'Ilyra Sen · Hüterin der Spiegel', actions: ['aether', 'salvage'] },
};

export const SCENARIO = 'nachtmeer-die-erloschenen-feuer';
export const VERSION = 1;
export const RULES = { turns: 6, orders: 2, starting: { food: 18, material: 12, aether: 4, hope: 64 }, finalFood: 4, finalHope: 20, hungerLimit: 12, hungerHope: 3, decreeHope: 4, guildReserve: 3 };
export const RESOURCES = { food: { name: 'Vorräte', icon: 'food' }, material: { name: 'Baustoffe', icon: 'material' }, aether: { name: 'Äther', icon: 'aether' }, hope: { name: 'Zuversicht', icon: 'hope' } };
export const TIDES = [
  { name: 'Das letzte Hafenlicht', consumption: 4, storm: 0, text: 'Die See steht an den unteren Treppen. Lys sendet das einzige Licht der Küste.' },
  { name: 'Wasser in den Straßen', consumption: 4, storm: 0, text: 'Die Schiffe fahren zwischen den ehemaligen Marktständen hindurch.' },
  { name: 'Die verlorenen Wege', consumption: 5, storm: 2, text: 'Nebel verschluckt die nördliche Passage. Die alten Linsen müssen wieder arbeiten.' },
  { name: 'Stimmen aus der Tiefe', consumption: 5, storm: 3, text: 'Am Riff werden Mauern sichtbar, die auf keiner Karte verzeichnet sind.' },
  { name: 'Vor der Sturmfront', consumption: 6, storm: 5, text: 'Die Gischt erreicht die oberen Kais. Die letzte große Versorgung muss vorbereitet werden.' },
  { name: 'Die sechste Flut', consumption: 7, storm: 8, text: 'Die Küste braucht ein verbundenes Lichtnetz und genügend Vorräte für den Morgen.' },
];
export const ACTIONS = {
  explore: { name: 'Seeweg erschließen', icon: 'ship', places: ['aster','gaerten','riff'], cost: { food: 2 }, description: 'Die Insel wird ab der nächsten Gezeit zugänglich.' },
  beacon: { name: 'Leuchtfeuer entzünden', icon: 'beacon', places: ['aster','gaerten'], cost: { material: 6, aether: 3 }, gain: { hope: 8 }, description: 'Verbindet die Insel mit Lys. Ab der nächsten Gezeit +1 Vorrat und Schutz vor dem Sturm.' },
  provisions: { name: 'Vorräte einholen', icon: 'food', places: ['lys','werft','gaerten'], gain: { food: 7 }, description: 'Bringt Nahrung in den Hafen. Aufgenommene Schutzsuchende erhöhen den Ertrag auf neun.' },
  salvage: { name: 'Baustoffe bergen', icon: 'material', places: ['werft','riff'], gain: { material: 5 }, description: 'Mit geltendem Gildenvertrag steigt der Ertrag auf sieben.' },
  aether: { name: 'Äther bergen', icon: 'aether', places: ['riff','gaerten'], gain: { aether: 2 }, description: 'Die Gärten liefern zwei Äther, das erschlossene Riff vier.' },
  study: { name: 'Die Linse untersuchen', icon: 'book', places: ['aster'], gain: { aether: 2 }, description: 'Gewinnt zwei Äther aus dem Wissen der Sternwarte.' },
  repair: { name: 'Kaimauer sichern', icon: 'material', places: ['lys'], cost: { material: 4 }, gain: { hope: 6 }, description: 'Ab der nächsten Gezeit weniger Sturmschaden; in den letzten beiden Gezeiten zwei Vorräte weniger Verbrauch.' },
};
export const ADVISORS = [
  { id: 'rhea', name: 'Rhea Voss', seal: 'RV', role: 'Hafenmeisterin', interest: 'Schutz für die Menschen und mindestens drei Vorräte nach Verbrauch.' },
  { id: 'jorek', name: 'Jorek Senn', seal: 'JS', role: 'Sprecher der Gilden', interest: 'Handlungsfähige Werften und die Einhaltung zugesicherter Gildenrechte.' },
  { id: 'ilyra', name: 'Ilyra Sen', seal: 'IS', role: 'Hüterin der Spiegel', interest: 'Ein verbundenes Lichtnetz und Schutz für das Wissen der alten Inseln.' },
];
export const EVENTS = [
  { title: 'Die Schiffe ohne Flagge', question: 'Wer darf in deinem Hafen bleiben?', text: 'Zwölf Schiffe liegen vor Lys. Ihre Heimat ist überflutet. Rhea will allen Menschen Schutz geben. Die Gilden drängen auf eine begrenzte Aufnahme. Wer bleibt, muss versorgt werden und kann beim Wiederaufbau helfen.', options: [
    { id: 'open', title: 'Den Hafen für alle öffnen', text: 'Vier Vorräte für die Aufnahme. Der Verbrauch steigt sofort dauerhaft um eins. Ab der nächsten Gezeit bringen Versorgungsaufträge zwei zusätzliche Vorräte.', cost: { food: 4 }, gain: { hope: 8 }, flags: { refugees: true }, loyalty: { rhea: 2, jorek: -1 } },
    { id: 'staged', title: 'Die Aufnahme begrenzen', text: 'Ein Vorrat für die erste Gruppe. Die übrigen Schiffe müssen weiterfahren.', cost: { food: 1 }, gain: { hope: -2 }, loyalty: { rhea: -1, jorek: 1 } },
  ] },
  { title: 'Die Werften stellen Bedingungen', question: 'Welche Rechte erhalten die Gilden?', text: 'Jorek bietet die Vorräte der Gilden und erfahrene Bergungsmannschaften an. Dafür verlangt er eine verbindliche Materialreserve bei jedem neuen Leuchtfeuer. Rhea möchte die Werften dem Hafenrat unterstellen.', options: [
    { id: 'charter', title: 'Den Gildenvertrag schließen', text: 'Drei Baustoffe am Rundenende. Ab der nächsten Gezeit bringen Bergungen zwei zusätzliche Baustoffe. Bei Leuchtfeuern müssen ab sofort nach allen Kosten drei alte Baustoffe übrig bleiben.', gain: { material: 3 }, flags: { charter: true }, loyalty: { jorek: 2, rhea: -1 } },
    { id: 'public', title: 'Die Werften gemeinsam führen', text: 'Zwei Baustoffe für die Übernahme. Die Bergung behält ihren bisherigen Ertrag und es entsteht keine Materialreserve.', cost: { material: 2 }, gain: { hope: 2 }, loyalty: { jorek: -2, rhea: 1 } },
  ] },
  { title: 'Der Preis des Lichts', question: 'Wem gehört das Wissen der Inseln?', text: 'Die Hüterinnen bieten an, die Linsen mit weniger Äther zu entzünden. Sie verlangen, die Entnahme auf einen Auftrag pro Gezeit zu begrenzen. In den alten Speichern liegt zugleich Äther, den du sofort beschlagnahmen könntest.', options: [
    { id: 'commons', title: 'Das Inselwissen als Gemeingut schützen', text: 'Ab der nächsten Gezeit kostet ein Leuchtfeuer einen Äther weniger. Ab sofort gilt höchstens ein Auftrag für Äthergewinnung oder Linsenforschung pro Gezeit.', gain: { hope: 4 }, flags: { commons: true }, loyalty: { ilyra: 2, jorek: -1 } },
    { id: 'seize', title: 'Die Äthervorräte beschlagnahmen', text: 'Drei Äther am Rundenende. Die Hüterinnen entziehen dir ihre Unterstützung.', gain: { aether: 3, hope: -8 }, flags: { seized: true }, loyalty: { ilyra: -3, rhea: -1 } },
  ] },
  { title: 'Die Namen unter Wasser', question: 'Was soll die neue Küste erinnern?', text: 'Eine Taucherglocke bringt beschriftete Tafeln aus dem Riff. Sie nennen die Familien der versunkenen Siedlungen. Die Bergung kann ihre Geschichte sichern oder die verbliebenen Laderäume mit Werkzeug füllen.', options: [
    { id: 'memory', title: 'Die Namen und Geschichten sichern', text: 'Zwei Vorräte für die Bergung des Archivs. Die Menschen erhalten einen Ort für ihre Erinnerung.', cost: { food: 2 }, gain: { hope: 6 }, flags: { archive: true }, loyalty: { rhea: 1, ilyra: 1 } },
    { id: 'cache', title: 'Die Werkzeuge an Bord nehmen', text: 'Vier Baustoffe am Rundenende. Viele Familien verlieren die letzte Spur ihrer Heimat.', gain: { material: 4, hope: -5 }, loyalty: { jorek: 1, rhea: -1 } },
  ] },
  { title: 'Die Sturmfront', question: 'Wie schützt du die Menschen am Kai?', text: 'Die Wellen schlagen über die äußeren Hafenmauern. Rhea fordert zusätzliche Schutzräume. Jorek bietet eine letzte Versorgungsfahrt an, deren Mannschaft im Sturm bleiben müsste.', options: [
    { id: 'shelter', title: 'Schutzräume errichten', text: 'Drei Baustoffe und vier zusätzliche Zuversicht. Der Verbrauch sinkt in dieser Gezeit um zwei Vorräte.', cost: { material: 3 }, gain: { hope: 4 }, loyalty: { rhea: 1 } },
    { id: 'sail', title: 'Die letzte Versorgungsfahrt anordnen', text: 'Vier Vorräte am Rundenende. Die Sorge um die Mannschaft senkt die Zuversicht um sechs.', gain: { food: 4, hope: -6 }, loyalty: { rhea: -1, jorek: 1 } },
  ] },
  { title: 'Wer trägt das Feuer?', question: 'Welche Ordnung soll die Flut überstehen?', text: 'Die Inseln verlangen eine Antwort auf die Zeit nach dem Sturm. Rhea schlägt einen Bund eigener Hafenräte vor. Jorek möchte die Versorgung unter einer gemeinsamen Admiralität halten.', options: [
    { id: 'federation', title: 'Einen Bund der Inseln gründen', text: 'Drei Vorräte für die gemeinsame Versorgung und fünf zusätzliche Zuversicht. Die Inseln behalten ihre eigenen Räte.', cost: { food: 3 }, gain: { hope: 5 }, flags: { federation: true }, loyalty: { rhea: 1, ilyra: 1 } },
    { id: 'crown', title: 'Die Admiralität dauerhaft einsetzen', text: 'Zwei Baustoffe am Rundenende. Die Übertragung der Hafenrechte kostet drei Zuversicht.', gain: { material: 2, hope: -3 }, loyalty: { jorek: 1, rhea: -1 } },
  ] },
];

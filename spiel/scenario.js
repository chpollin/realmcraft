export const SCENARIO_ID = 'graulandung-erster-winter';
export const SAVE_VERSION = 1;
export const RULES = Object.freeze({
  startingFood: 20, startingMaterial: 12, workers: 6,
  consumption: 18, winterConsumption: 22, winterRelief: 6,
  woodYield: 2, mineYield: 5, reserve: 18, majority: 3,
  vetoLoss: 2, hungerLoss: 1, collapseGap: 12,
});
export const SEASONS = [
  { name: 'Frühling', yield: 4, text: 'Der Boden taut. Die Gemeinschaft braucht Vorräte und einen Ort, an dem sie bleiben kann.' },
  { name: 'Sommer', yield: 5, text: 'Die langen Tage bringen Ertrag. Arbeitskräfte können Vorräte schaffen oder den Ausbau voranbringen.' },
  { name: 'Herbst', yield: 5, text: 'Die letzte große Ernte steht an. Im Winter sinkt die Nahrungsproduktion auf zwei Einheiten je Gruppe.' },
  { name: 'Winter', yield: 2, text: 'Die Küste friert. Ein fertiges Winterlager senkt den Verbrauch von 22 auf 16 Nahrung.' },
];
export const PROJECTS = {
  mine: { name: 'Erzaußenposten', place: 'erz', cost: 6, workers: 2,
    description: 'Ein fester Zugang zu den Erzklippen. Ab der nächsten Saison gewinnt jede zugewiesene Gruppe fünf Material.',
    result: 'Der Erzaußenposten ist fertig. Die Erzgewinnung steht ab der nächsten Saison zur Verfügung.' },
  granary: { name: 'Winterlager', place: 'grau', cost: 8, workers: 2,
    description: 'Geschützte Vorräte und ein gemeinsames Winterquartier. Ein vor Winterbeginn fertiges Lager spart im Winter sechs Nahrung.',
    result: 'Das Winterlager ist fertig. Ab der nächsten Saison schützt es die Vorräte und senkt den Winterverbrauch.' },
};
export const ADVISORS = [
  { id: 'borin', name: 'Borin Zunfthand', role: 'Handwerk', image: '0570304942453d21', interest: 'Eigenes Werkzeug und dauerhafte Anlagen', mine: true, granary: true, pact: true },
  { id: 'grask', name: 'Grask Eisenzahn', role: 'Wehr', image: '427fb7bf7b0d82df', interest: 'Ausrüstung und Handlungsfreiheit', mine: true, granary: false, pact: false },
  { id: 'mara', name: 'Mara Tiden', role: 'Versorgung', image: 'c3804c5cf76ee44d', interest: 'Vorräte und verbindliche Vorsorge', mine: false, granary: true, pact: true },
  { id: 'yssa', name: 'Yssa Dämmerlied', role: 'Erkenntnis', image: '166913185defa378', interest: 'Kapazität für die Zukunft bewahren', mine: false, granary: true, pact: true },
  { id: 'alde', name: 'Alde Graumahl', role: 'Gemeinwohl', image: '6e76c5bb6dd6739e', interest: 'Die Gemeinschaft sicher durch den Winter führen', mine: false, granary: true, pact: true },
];
export const JOBS = { food: 'Versorgung', wood: 'Material sammeln', mine: 'Erz gewinnen' };

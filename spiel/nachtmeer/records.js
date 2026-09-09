import { EVENTS, ACTIONS } from './scenario.js';

const TITLES = {
  open: 'Offener Hafen', staged: 'Begrenzte Aufnahme', charter: 'Gildenvertrag', public: 'Öffentliche Werften',
  commons: 'Gemeingutordnung', seize: 'Beschlagnahmte Linsen', memory: 'Archiv der Küste', cache: 'Bergung der Werkzeuge',
  shelter: 'Schutzräume', sail: 'Letzte Versorgungsfahrt', federation: 'Bund der Inseln', crown: 'Admiralität von Lys',
};

export function records(game) {
  return game.history.map(entry => {
    const choice = EVENTS[entry.turn].options.find(option => option.id === entry.command.choice);
    return { id: choice.id, title: TITLES[choice.id], turn: entry.turn + 1, text: choice.text, cost: choice.cost, gain: choice.gain };
  });
}

export function siteHistory(game, id) {
  return game.history.flatMap(entry => entry.command.orders.filter(order => order.place === id).map(order => ({
    turn: entry.turn + 1,
    action: order.action,
    title: ACTIONS[order.action].name,
    procedure: order.action === 'beacon' ? entry.command.mandate === 'decree' ? 'Erlass' : 'Ratsbeschluss' : 'Auftrag',
  })));
}

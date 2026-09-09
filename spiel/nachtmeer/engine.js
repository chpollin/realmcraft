import { ACTIONS, ADVISORS, EVENTS, PLACES, RESOURCES, RULES, TIDES } from './scenario.js';

/** @typedef {{turn:number, orders:Array<{action:string,place:string}>, choice:string|null, mandate:'council'|'decree'}} Draft */
export function createGame() {
  return { turn: 0, resources: { ...RULES.starting }, open: ['lys','werft'], lit: ['lys'], flags: { refugees: false, charter: false, commons: false, seized: false, archive: false, breakwater: false, federation: false }, loyalty: { rhea: 1, jorek: 1, ilyra: 1 }, shortfall: 0, status: 'playing', history: [] };
}
export const createDraft = game => ({ turn: game.turn, orders: [], choice: null, mandate: 'council' });
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
const exact = (value,keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k=>Object.hasOwn(value,k));

export function assertDraft(draft) {
  if (!exact(draft,['turn','orders','choice','mandate']) || !Number.isInteger(draft.turn) || draft.turn < 0 || draft.turn > RULES.turns
    || !Array.isArray(draft.orders) || draft.orders.length > RULES.orders
    || draft.orders.some(o => !exact(o,['action','place']) || !Object.hasOwn(ACTIONS,o.action) || !Object.hasOwn(PLACES,o.place))
    || ![null,...EVENTS.flatMap(e=>e.options.map(o=>o.id))].includes(draft.choice) || !['council','decree'].includes(draft.mandate)) throw new Error('Der Befehlsentwurf hat ein ungültiges Format.');
}

export function actionTerms(game,action,place) {
  const source = ACTIONS[action];
  const cost = { ...source.cost };
  const gain = { ...source.gain };
  if (action === 'beacon' && game.flags.commons) cost.aether -= 1;
  if (action === 'provisions' && game.flags.refugees) gain.food += 2;
  if (action === 'salvage' && game.flags.charter) gain.material += 2;
  if (action === 'aether' && place === 'riff') gain.aether = 4;
  return { ...source, cost, gain };
}

export function availableActions(game,place) {
  if (game.status !== 'playing') return [];
  if (!game.open.includes(place)) return ['explore'];
  return Object.keys(ACTIONS).filter(id => id !== 'explore' && ACTIONS[id].places.includes(place)
    && !(id === 'beacon' && game.lit.includes(place)) && !(id === 'repair' && game.flags.breakwater));
}

/** Computes effects without changing the game or draft. Costs use opening stocks. */
export function preview(game,draft) {
  assertDraft(draft);
  const issues = [];
  const issue = (code,message) => issues.push({code,message});
  if (game.status !== 'playing' || game.turn >= RULES.turns) issue('finished','Diese Partie ist abgeschlossen.');
  if (draft.turn !== game.turn) issue('stale','Diese Befehle gehören zu einer anderen Gezeit.');
  const event = EVENTS[game.turn];
  const choice = event?.options.find(o=>o.id === draft.choice);
  if (!choice) issue('decision','Im Hafenrat ist noch eine Entscheidung offen.');
  const flags = { ...game.flags, ...choice?.flags };
  const loyalty = { ...game.loyalty };
  for (const [id,value] of Object.entries(choice?.loyalty ?? {})) loyalty[id] = clamp(loyalty[id]+value,-3,3);
  const costs = Object.fromEntries(Object.keys(RESOURCES).map(k=>[k,0]));
  const gains = { ...costs };
  const add = (target,source) => { for (const [key,value] of Object.entries(source ?? {})) target[key] += value; };
  add(costs,choice?.cost); add(gains,choice?.gain);
  const seen = new Set();
  let beacons = 0;
  for (const order of draft.orders) {
    if (!availableActions(game,order.place).includes(order.action)) issue('action',`${ACTIONS[order.action].name} ist in ${PLACES[order.place].name} derzeit nicht möglich.`);
    const key = `${order.action}:${order.place}`;
    if (['explore','beacon','repair'].includes(order.action) && seen.has(key)) issue('duplicate','Dieser einmalige Auftrag wurde doppelt vergeben.');
    seen.add(key);
    const terms = actionTerms(game,order.action,order.place);
    add(costs,terms.cost); add(gains,terms.gain);
    if (order.action === 'beacon') beacons++;
  }
  for (const key of Object.keys(RESOURCES)) if (game.resources[key] < costs[key]) issue('cost',`${RESOURCES[key].name}: ${costs[key]} benötigt, ${game.resources[key]} zu Beginn vorhanden. Laufende Erträge stehen erst am Rundenende bereit.`);
  if (flags.charter && beacons && game.resources.material-costs.material < RULES.guildReserve) issue('charter',`Der Gildenvertrag bindet den Bau: Nach allen Kosten müssen ${RULES.guildReserve} Baustoffe aus dem bisherigen Vorrat übrig bleiben. Ein Erlass hebt den Vertrag nicht auf.`);
  if (flags.commons && draft.orders.filter(o=>['aether','study'].includes(o.action)).length > 1) issue('commons','Die Gemeingutordnung erlaubt höchstens einen Auftrag für Äthergewinnung oder Linsenforschung pro Gezeit.');
  if (!beacons && draft.mandate === 'decree') issue('mandate','Ein Erlass benötigt einen Auftrag für ein Leuchtfeuer.');
  const tide = TIDES[game.turn] ?? TIDES.at(-1);
  const consumption = Math.max(0,tide.consumption + Number(flags.refugees) - (game.flags.breakwater && game.turn >= 4 ? 2 : 0) - (choice?.id === 'shelter' ? 2 : 0));
  const networkFood = game.lit.length-1;
  gains.food += networkFood;
  const foodRaw = game.resources.food-costs.food+gains.food-consumption;
  const gap = Math.max(0,-foodRaw);
  const votes = ADVISORS.map(a => {
    let yes = a.id !== 'rhea' || foodRaw >= 3;
    let reason = a.id === 'rhea' ? (yes ? 'Die Versorgung lässt mindestens drei Vorräte übrig.' : 'Nach Verbrauch blieben weniger als drei Vorräte.') : a.id === 'jorek' ? 'Die Werften können den Auftrag tragen.' : 'Das Feuer verbindet die Küste.';
    if (loyalty[a.id] <= -2) { yes = false; reason = 'Das Vertrauen in deine Führung ist beschädigt.'; }
    return { ...a, yes, reason, loyalty: loyalty[a.id] };
  });
  if (beacons && draft.mandate === 'council' && votes.filter(v=>v.yes).length < 2) issue('council','Das Leuchtfeuer hat keine Mehrheit im Hafenrat. Ändere den Entwurf oder erlasse den Bauauftrag.');
  const decreeLoss = beacons && draft.mandate === 'decree' ? RULES.decreeHope : 0;
  const stormLoss = Math.max(0,tide.storm-game.lit.length*2-(game.flags.breakwater ? 3 : 0));
  const resources = Object.fromEntries(Object.keys(RESOURCES).map(key=>[key,game.resources[key]-costs[key]+gains[key]]));
  resources.food = Math.max(0,foodRaw);
  resources.hope = clamp(resources.hope-decreeLoss-stormLoss-gap*RULES.hungerHope,0,100);
  const warnings = [];
  if (draft.orders.length < RULES.orders) warnings.push(`${RULES.orders-draft.orders.length} Befehlsplätze bleiben ungenutzt.`);
  if (gap) warnings.push(`${gap} Vorräte fehlen. Die Zuversicht sinkt durch Hunger um ${gap*RULES.hungerHope}.`);
  if (resources.hope <= 0 || game.shortfall+gap >= RULES.hungerLimit) warnings.push('Diese Gezeit würde die Gemeinschaft zum Zusammenbruch führen.');
  if (game.turn === 5 && (game.lit.length+beacons < 3 || resources.food < RULES.finalFood || resources.hope < RULES.finalHope)) warnings.push('Dieser Entwurf erfüllt die Bedingungen für das Überstehen der sechsten Flut noch nicht.');
  return { issues, errors: issues.map(i=>i.message), warnings, choice, flags, loyalty, costs, gains, resources, consumption, networkFood, gap, stormLoss, decreeLoss, votes };
}

export function canAdd(game,draft,action,place) {
  if (draft.orders.length >= RULES.orders || !availableActions(game,place).includes(action)) return false;
  const p = preview(game,{...draft,orders:[...draft.orders,{action,place}]});
  return !p.issues.some(i=>!['decision','council'].includes(i.code));
}

export function result(game) {
  const checks = [
    { label: 'Drei Feuer verbunden', met: game.lit.length === 3, value: `${game.lit.length} / 3` },
    { label: 'Vier Vorräte verbleiben', met: game.resources.food >= RULES.finalFood, value: `${game.resources.food} / ${RULES.finalFood}` },
    { label: 'Mindestens 20 Zuversicht', met: game.resources.hope >= RULES.finalHope, value: `${game.resources.hope} / ${RULES.finalHope}` },
  ];
  const collapsed = game.resources.hope <= 0 || game.shortfall >= RULES.hungerLimit;
  const won = !collapsed && checks.every(c=>c.met);
  return { checks, won, collapsed, title: collapsed ? 'Der Hafen verstummt' : won ? 'Die Küste antwortet' : 'Eine Küste im Dunkeln', text: collapsed ? 'Die Gemeinschaft kann die Versorgung nicht mehr tragen. Die verbliebenen Schiffe verlassen Lys.' : won ? game.flags.federation ? 'Die Feuer führen die Schiffe durch die Flut. Ein Bund eigenständiger Inselräte übernimmt die Küste.' : 'Die Feuer führen die Schiffe durch die Flut. Von Lys aus organisiert die Admiralität den Wiederaufbau.' : 'Die sechste Flut ist vorüber. Das Lichtnetz oder die Vorräte reichen für eine sichere Zukunft der Küste noch nicht aus.' };
}

export function resolveTurn(game,draft) {
  const p = preview(game,draft);
  if (p.errors.length) throw new Error(p.errors.join(' '));
  const next = structuredClone(game);
  next.resources = p.resources;
  next.flags = p.flags;
  next.loyalty = p.loyalty;
  const events = [`Der Hafenrat entscheidet: ${p.choice.title}.`];
  for (const order of draft.orders) {
    if (order.action === 'explore') { next.open.push(order.place); events.push(`Der Seeweg nach ${PLACES[order.place].name} ist erschlossen. Ab der nächsten Gezeit sind dort Aufträge möglich.`); }
    else if (order.action === 'beacon') { next.lit.push(order.place); events.push(`Das Leuchtfeuer von ${PLACES[order.place].name} brennt. Ab der nächsten Gezeit bringt der Seeweg einen Vorrat und schützt vor dem Sturm.`); }
    else if (order.action === 'repair') { next.flags.breakwater = true; events.push('Die Kaimauer ist gesichert. Ihr Schutz wirkt ab der nächsten Gezeit.'); }
    else events.push(`${ACTIONS[order.action].name} in ${PLACES[order.place].name} ist abgeschlossen.`);
  }
  if (p.decreeLoss) {
    for (const voter of p.votes.filter(v=>!v.yes)) next.loyalty[voter.id] = clamp(next.loyalty[voter.id]-1,-3,3);
    events.push(`Der Erlass kostet ${p.decreeLoss} Zuversicht. Widersprechende Ratsmitglieder verlieren einen weiteren Vertrauenspunkt.`);
  }
  if (p.gap) events.push(`${p.gap} Vorräte fehlen. Hunger kostet ${p.gap*RULES.hungerHope} Zuversicht.`);
  if (p.stormLoss) events.push(`Der Sturm kostet trotz Schutz ${p.stormLoss} Zuversicht.`);
  next.shortfall += p.gap;
  next.turn++;
  const outcome = result(next);
  next.status = outcome.collapsed ? 'lost' : next.turn === RULES.turns ? outcome.won ? 'won' : 'lost' : 'playing';
  next.history.push({ turn: game.turn, title: TIDES[game.turn].name, command: structuredClone(draft), before: { ...game.resources }, after: { ...next.resources }, costs: p.costs, gains: p.gains, consumption: p.consumption, stormLoss: p.stormLoss, decreeLoss: p.decreeLoss, gap: p.gap, events });
  return next;
}

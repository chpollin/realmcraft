import { ADVISORS, PROJECTS, RULES, SEASONS } from './scenario.js';

/** @typedef {{turn:number, allocation:{food:number,wood:number,mine:number}, project:null|'mine'|'granary', policy:null|'majority'|'pact'|'veto'}} Draft */

export function createGame() {
  return {
    turn: 0, food: RULES.startingFood, material: RULES.startingMaterial,
    workers: RULES.workers, buildings: { mine: false, granary: false },
    pact: false, loyalty: Object.fromEntries(ADVISORS.map(a => [a.id, 2])),
    shortfall: 0, status: 'playing', history: [],
  };
}

export function createDraft(game, previous = null) {
  const allocation = previous ? { ...previous.allocation } : { food: 4, wood: 2, mine: 0 };
  let excess = Math.max(0, Object.values(allocation).reduce((a, b) => a + b, 0) - game.workers);
  for (const job of ['mine', 'wood', 'food']) {
    const remove = Math.min(allocation[job], excess);
    allocation[job] -= remove;
    excess -= remove;
  }
  return { turn: game.turn, allocation, project: null, policy: null };
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

export function assertDraft(draft) {
  if (!exactKeys(draft, ['turn', 'allocation', 'project', 'policy'])
    || !Number.isInteger(draft.turn) || draft.turn < 0 || draft.turn > SEASONS.length
    || !exactKeys(draft.allocation, ['food', 'wood', 'mine'])
    || Object.values(draft.allocation).some(n => !Number.isInteger(n) || n < 0 || n > RULES.workers)
    || ![null, ...Object.keys(PROJECTS)].includes(draft.project)
    || ![null, 'majority', 'pact', 'veto'].includes(draft.policy)) {
    throw new Error('Der Befehlsentwurf hat ein ungültiges Format.');
  }
}

export function assigned(draft) {
  return Object.values(draft.allocation).reduce((a, b) => a + b, 0)
    + (draft.project ? PROJECTS[draft.project].workers : 0);
}

export function council(game, draft) {
  const withPact = game.pact || draft.policy === 'pact';
  return ADVISORS.map(advisor => {
    let yes = Boolean(draft.project && advisor[withPact ? 'pact' : draft.project]);
    let reason = withPact
      ? advisor.pact ? `Zustimmung bei mindestens ${RULES.reserve} Nahrung nach Verbrauch.` : 'Die Vorratsregel begrenzt künftige Vorhaben.'
      : draft.project === 'granary'
        ? advisor.granary ? 'Das Winterlager schützt die Gemeinschaft.' : 'Die Arbeitskräfte fehlen für die Ausrüstung.'
        : advisor.mine ? 'Der Zugang zum Erz stärkt unsere Fähigkeiten.' : 'Der Ausbau braucht eine verbindliche Vorratsgrenze.';
    if (game.loyalty[advisor.id] <= -3) {
      yes = false;
      reason = 'Das Vertrauen ist beschädigt. Dieser Regierung wird kein neuer Bauauftrag anvertraut.';
    }
    return { ...advisor, yes, reason, loyalty: game.loyalty[advisor.id] };
  });
}

/** @param {ReturnType<typeof createGame>} game @param {Draft} draft */
export function preview(game, draft) {
  assertDraft(draft);
  const errors = [];
  const season = SEASONS[game.turn];
  if (game.status !== 'playing' || !season) errors.push('Diese Partie ist abgeschlossen.');
  if (draft.turn !== game.turn) errors.push('Der Entwurf gehört zu einer anderen Saison. Bitte die aktuelle Lage laden.');
  const project = draft.project ? PROJECTS[draft.project] : null;
  if (assigned(draft) > game.workers) errors.push(`Es sind ${assigned(draft)} Gruppen zugewiesen; verfügbar sind ${game.workers}.`);
  if (draft.allocation.mine && !game.buildings.mine) errors.push('Die Erzgewinnung benötigt einen bereits fertiggestellten Außenposten.');
  if (project && game.buildings[draft.project]) errors.push('Diese Anlage ist bereits fertiggestellt.');
  if (project && game.material < project.cost) errors.push(`${project.name} benötigt ${project.cost} Material aus dem bestehenden Vorrat.`);
  if (!project && draft.policy) errors.push('Die politische Entscheidung benötigt einen Bauantrag.');
  if (project && !draft.policy) errors.push('Für den Bauantrag fehlt die politische Entscheidung.');
  if (game.pact && draft.policy === 'pact') errors.push('Der Versorgungspakt gilt bereits. Ein Mehrheitsbeschluss genügt.');

  const foodGain = draft.allocation.food * (season?.yield ?? 0);
  const materialGain = draft.allocation.wood * RULES.woodYield
    + (game.buildings.mine ? draft.allocation.mine * RULES.mineYield : 0);
  const consumption = game.turn === 3
    ? RULES.winterConsumption - (game.buildings.granary ? RULES.winterRelief : 0)
    : RULES.consumption;
  const rawFood = game.food + foodGain - consumption;
  const gap = Math.max(0, -rawFood);
  const endFood = Math.max(0, rawFood);
  const cost = project?.cost ?? 0;
  const endMaterial = game.material + materialGain - cost;
  const votes = council(game, draft);
  if (project && ['majority', 'pact'].includes(draft.policy)
    && votes.filter(v => v.yes).length < RULES.majority) errors.push('Der Antrag hat keine Mehrheit im Rat.');
  if (project && (game.pact || draft.policy === 'pact') && rawFood < RULES.reserve) {
    errors.push(`Der Versorgungspakt verlangt ${RULES.reserve} Nahrung nach Verbrauch. Die Vorschau ergibt ${endFood}. Auch ein Veto hebt das geltende Recht nicht auf.`);
  }
  const warnings = [];
  if (gap) warnings.push(`${gap} Nahrung fehlen. Eine Arbeitsgruppe fällt aus; alle Ratsmitglieder verlieren einen Loyalitätspunkt.`);
  if (game.shortfall + gap >= RULES.collapseGap) warnings.push('Die Versorgung würde zusammenbrechen. Diese Saison beendet die Partie als Niederlage.');
  if (assigned(draft) < game.workers) warnings.push(`${game.workers - assigned(draft)} Arbeitsgruppen bleiben frei.`);
  if (draft.project === 'granary' && game.turn === 3) warnings.push('Ein erst am Winterende fertiges Lager senkt den Verbrauch dieses Winters noch nicht.');
  return { errors, warnings, foodGain, materialGain, consumption, gap, endFood, endMaterial, cost, votes, free: game.workers - assigned(draft) };
}

/** Applies a whole season without modifying either argument. */
export function resolveTurn(game, draft) {
  const p = preview(game, draft);
  if (p.errors.length) throw new Error(p.errors.join(' '));
  const next = structuredClone(game);
  const events = [];
  if (draft.project) {
    next.buildings[draft.project] = true;
    events.push(PROJECTS[draft.project].result);
  }
  if (draft.policy === 'pact') {
    next.pact = true;
    events.push(`Der Rat beschließt den Versorgungspakt. Neue Bauvorhaben verlangen mindestens ${RULES.reserve} Nahrung nach Saisonverbrauch.`);
  }
  if (draft.policy === 'veto') {
    const affected = p.votes.filter(v => !v.yes);
    for (const advisor of affected) next.loyalty[advisor.id] = Math.max(-5, next.loyalty[advisor.id] - RULES.vetoLoss);
    events.push(affected.length
      ? `Das Veto übergeht ${affected.map(a => a.name.split(' ')[0]).join(', ')}. Ihre Loyalität sinkt jeweils um ${RULES.vetoLoss}.`
      : 'Das Vorhaben wurde per Veto ausgeführt. Kein Ratsmitglied hatte widersprochen.');
  }
  if (p.gap) {
    next.workers = Math.max(0, next.workers - 1);
    for (const advisor of ADVISORS) next.loyalty[advisor.id] = Math.max(-5, next.loyalty[advisor.id] - RULES.hungerLoss);
    events.push(`Eine Versorgungslücke von ${p.gap} Nahrung schwächt die Gemeinschaft. Eine Arbeitsgruppe fällt für den Rest des Szenarios aus.`);
  }
  next.food = p.endFood;
  next.material = p.endMaterial;
  next.shortfall += p.gap;
  next.turn += 1;
  next.status = next.shortfall >= RULES.collapseGap ? 'lost' : next.turn === SEASONS.length ? 'won' : 'playing';
  if (!events.length) events.push('Die Gemeinschaft führt ihre Versorgung und Materialgewinnung fort.');
  next.history.push({
    turn: game.turn, season: SEASONS[game.turn].name, command: structuredClone(draft),
    before: { food: game.food, material: game.material },
    after: { food: next.food, material: next.material },
    foodGain: p.foodGain, materialGain: p.materialGain, consumption: p.consumption,
    cost: p.cost, gap: p.gap, events,
  });
  return next;
}

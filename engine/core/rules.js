// Kernel constants of rulesVersion 1. regeln.json carries only the tuning keys
// its frozen schema allows (engine/schemas/world.js); every other number the
// rules need lives here, bound to RULES_VERSION. Changing a value changes the
// outcome of stored campaigns, so it moves RULES_VERSION.
//
// TUNING: all values are starting points until the balance simulation
// calibrates them; once regeln.json grows matching keys they move there.

export const RULES_VERSION = 1;

export const RULES = Object.freeze({
  // Core resources every world carries (owner decision 2026-10-03): the kernel
  // may rely on them. Every other resource (herden, erz, salz, psil ...) is
  // world or module data and handled generically.
  food: 'nahrung',
  material: 'material',
  knowledge: 'wissen',
  // Terrain yield keys of welt.json that fold into a core resource when the
  // world has no resource of that name (holz and stein merge into material).
  yieldAlias: Object.freeze({ holz: 'material', stein: 'material' }),
  // Deposits of welt.json (tile resources) map onto world resources; a deposit
  // whose key and alias are both unknown to the world yields nothing. Each
  // deposit within depositRadius of an own settlement yields depositYield a
  // season; the amount is the deposit's size and is never mined out.
  depositAlias: Object.freeze({
    eisenerz: 'erz', kupfererz: 'erz', salz: 'salz', wild: 'nahrung', gemsen: 'nahrung', fisch: 'nahrung',
    torf: 'material', feuerstein: 'material', lehm: 'material',
  }),
  depositRadius: 2,
  depositYield: 1,
  // Approval of the people, a kernel meter in people.meters (-5..5).
  approval: 'zustimmung',

  // Economy. Each controlled region offers work slots; one clan works one slot
  // and harvests the base yields of the region's dominant terrain once.
  slotsPerRegion: 3,
  // A feature on a tile in a controlled region yields this much of each of its
  // resource keys that is a world resource, per season.
  featureYield: 1,
  // Food lost per famine clan: one clan per this many missing food, rounded up.
  famineDivisor: 2,
  growthPerClan: 4,
  baseGrowth: 1,
  // Clans per settlement before population.cap; keyed by lebensweise spec.settlement.
  popCapPerSettlement: Object.freeze({ camp: 6, village: 8 }),
  // Settlement kind ids written for a lebensweise spec.settlement value.
  settlementKind: Object.freeze({ camp: 'lager', village: 'dorf' }),

  // Probes.
  singleModCap: 2,
  developmentModCap: 3,
  totalModCap: 4,
  // Probe tags every main order carries (Autoritaet acts on them).
  mainTag: 'befohlen',

  // Research. Each season up to knowledgeSpend wissen from stock is burned
  // into research points on top of the base rate.
  researchBase: 2,
  knowledgeSpend: 2,
  knowledgePerSettlement: 1,
  complexityDivisor: 16,
  candidateLife: 4,
  maxProgress: 99,
  tokenLife: 8,

  // Practice ledger weights per executed order and for a successful probe.
  practice: Object.freeze({ main: 2, minor: 1, free: 0, success: 1, turns: 8 }),

  // Map.
  settlementSight: 2,
  unitSight: 2,
  exploreRange: 4,
  exploreRadius: 2,
  foundRange: 3,
  foundCost: Object.freeze({ material: 2, nahrung: 2 }),
  // A nomad camp keeps its region as grazing right for this many turns after moving on.
  campHold: 2,
  minStartDistance: 8,
  neighbourRadius: 16,

  // Lebensweise.
  migrateRange: 6,
  migrateTarget: 3,
  migrateWinterTarget: 5,
  adoptTarget: 6,
  herdFoodDivisor: 3,

  // Paths. Step costs are integers in half steps: terrain moveCost x 2, a road
  // tile (feature kind "weg") subtracts 2 per road level, never below 1.
  roadKind: 'weg',
  roadLength: 4,
  roadCostPerTile: Object.freeze({ material: 1 }),
  maxRoadLevel: 3,
  dangerTag: 'gefahr',

  // Military. A unit moves mobility x movePointsPerMobility full steps a season.
  movePointsPerMobility: 2,
  recruitPerCore: 3,
  strengthPerClan: 3,
  garrison: Object.freeze({ lager: 1, dorf: 2 }),
  // Defender bonus to the attack target by the terrain of the defended tile.
  terrainDefense: Object.freeze({ gebirge: 2, bergwald: 1, wald: 1, moor: 1 }),

  // Approval (zustimmung) shifts on famine, decrees and good seasons; it
  // modifies the Machtprobe at the thresholds.
  approvalHigh: 2,
  approvalLow: -2,

  // Council.
  loyaltyPerTurnCap: 2,
  ageLebensabend: 55,
  ageHinfaellig: 68,
  lifeTarget: Object.freeze({ lebensabend: 4, hinfaellig: 5 }),
  successionLoyalty: 2,
  machtprobeTarget: 5,
  hollowTarget: 5,

  // Events: raw d10 to band 1..5 (regeln.tuning.eventBands overrides).
  eventBands: Object.freeze([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]),
  // Turns an event decision stays open before its first option applies.
  choiceDeadline: 1,

  // Labour. Each clan of draft.assign works one slot: a resource key harvests
  // that resource, "research" yields researchPerGroup points, module activities
  // ("hueten", "adepten") are read by their module. Without a new assignment
  // the previous one stays.
  researchPerGroup: 1,
  activities: Object.freeze(['research', 'hueten', 'adepten']),

  // Venture (Wagnis): an order without probe gets ventureTarget, one with a
  // probe its target + 1. Lead: +1 at loyalty leadLoyalty or more, -1 in the
  // Lebensabend, -2 when hinfaellig.
  ventureTarget: 6,
  leadLoyalty: 4,

  // regeln.tuning keys a world may set; RULES holds the default (see tune()).
  spoilage: 2,
  loyaltyDecay: 0,
  machtprobeCap: 2,
  knowledgeSpendDefault: 2,
  approvalBounds: Object.freeze({ min: -5, max: 5, start: 0 }),

  // Handel.
  tradeRadius: 24,
  marketStartPrice: 3,

  // Chronicle in state.json: entries of the last turns, the full record is in log/.
  chronicleTurns: 8,
  chronicleMax: 2000,
});

/**
 * Optional regeln.tuning value with the kernel default. Keys: spoilage,
 * loyaltyDecay, machtprobeCap, knowledgeSpend, approval, eventBands (as
 * [[min, max], ...] by band), terrainDefense(terrain), yieldFactor(terrain,
 * season, res), featureYield(key) -> { res, amount } | null.
 */
export function tune(env, key, ...args) {
  const t = env.regeln.tuning ?? {};
  switch (key) {
    case 'spoilage': return t.spoilage ?? RULES.spoilage;
    case 'loyaltyDecay': return t.loyaltyDecay ?? RULES.loyaltyDecay;
    case 'machtprobeCap': return t.machtprobeCap ?? RULES.machtprobeCap;
    case 'knowledgeSpend': return t.knowledgeSpend ?? RULES.knowledgeSpendDefault;
    case 'approval': return t.approval ?? RULES.approvalBounds;
    case 'eventBands':
      return t.eventBands ? [...t.eventBands].sort((a, b) => a.band - b.band).map((b) => [b.roll.min, b.roll.max]) : RULES.eventBands;
    case 'terrainDefense': {
      const [terrain] = args;
      return t.terrainRules?.[terrain]?.defense ?? RULES.terrainDefense[terrain] ?? 0;
    }
    case 'yieldFactor': {
      const [terrain, season, res] = args;
      return t.terrainRules?.[terrain]?.yieldFactor?.[season]?.[res] ?? 1;
    }
    case 'featureYield': {
      const [k] = args;
      if (t.featureYield?.[k]) return t.featureYield[k];
      if (env.regeln.resources.some((r) => r.id === k)) return { res: k, amount: RULES.depositYield };
      const alias = RULES.depositAlias[k];
      return alias && env.regeln.resources.some((r) => r.id === alias) ? { res: alias, amount: RULES.depositYield } : null;
    }
    default: throw new Error(`tune: unknown key ${key}`);
  }
}

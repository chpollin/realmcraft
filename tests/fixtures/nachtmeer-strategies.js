const turn=(choice,orders,mandate='council')=>({choice,orders:orders.map(([action,place])=>({action,place})),mandate});
export const federation = [
  turn('open',[['explore','aster'],['explore','gaerten']]),
  turn('charter',[['beacon','aster'],['provisions','lys']]),
  turn('commons',[['study','aster'],['provisions','lys']]),
  turn('memory',[['beacon','gaerten'],['provisions','lys']]),
  turn('shelter',[['salvage','werft'],['provisions','lys']]),
  turn('federation',[['salvage','werft'],['provisions','lys']]),
];
export const admiralty = [
  turn('staged',[['explore','aster'],['explore','gaerten']]),
  turn('public',[['beacon','aster'],['provisions','lys']]),
  turn('seize',[['salvage','werft'],['provisions','lys']]),
  turn('cache',[['beacon','gaerten'],['provisions','lys']]),
  turn('sail',[['repair','lys'],['salvage','werft']]),
  turn('crown',[]),
];

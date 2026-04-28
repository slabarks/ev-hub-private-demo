export const GRID_SUBSTATION = {
  gridThresholdKva: 200,
  lvConnectionCost: 17000,
  higherCapacityMvConnectionCostBenchmark: 34500,
  duosStandingChargeDg6: 1320.36,
  duosCapacityChargePerKvaDg6: 49.28,
  substation1MvaCost: 235000,
  earthStudy: 8000,
  foundationBase: 20000,
  earthingSystem: 7000,
  multiplier500Kva: 0.85,
  multiplier1Mva: 1,
  multiplier1_6Mva: 1.2,
  multiplier2Mva: 1.35,
  kempowerCivilsInstallBenchmark: 102117,
  siteCivilsBase: 40000,
  standaloneChargerInstallAllowance: 12000,
  distributedCabinetInstallAllowance: 15000,
  distributedDispenserInstallAllowance: 7000,
  esbSocLvTable: [
    [15, 2490],
    [30, 3900],
    [50, 5390],
    [75, 7150],
    [100, 8690],
    [150, 10990],
    [200, 12150],
    [250, 12600],
    [300, 13180],
    [350, 14150],
    [400, 15090],
    [450, 16810],
    [500, 17780]
  ]
};

export function approximateLvConnectionCost(micKva) {
  let selected = GRID_SUBSTATION.esbSocLvTable[0][1];
  for (const [mic, cost] of GRID_SUBSTATION.esbSocLvTable) {
    if (mic <= micKva) selected = cost;
    else break;
  }
  return selected;
}

export function substationMultiplier(micKva) {
  if (micKva <= GRID_SUBSTATION.gridThresholdKva) return 0;
  if (micKva <= 500) return GRID_SUBSTATION.multiplier500Kva;
  if (micKva <= 1000) return GRID_SUBSTATION.multiplier1Mva;
  if (micKva <= 1600) return GRID_SUBSTATION.multiplier1_6Mva;
  return GRID_SUBSTATION.multiplier2Mva;
}

export const BATTERY_LIBRARY = [
  { item: "No battery", compatiblePlatform: "All", powerKw: 0, energyKwh: 0, hardwareCost: 0, installComm: 0, warrantyYrs: 0, notes: "No BESS selected — grid-only configuration", logisticsCost: 0, installCommissioning: 0 },
  { item: "Autel 1x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 125, energyKwh: 261, hardwareCost: 44955, installComm: 900, warrantyYrs: 5, notes: "Battery module €36,260/unit; one controller €8,695/site; commissioning €900/site; unit install/cabling €10,000/unit. Replacement module only = €36,260/unit.", logisticsCost: 0, installCommissioning: 0, moduleCost: 36260, controllerCost: 8695, siteCommissioningCost: 900, unitInstallCost: 10000 },
  { item: "Autel 2x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 250, energyKwh: 522, hardwareCost: 81215, installComm: 900, warrantyYrs: 5, notes: "Battery module €36,260/unit; one controller €8,695/site; commissioning €900/site; unit install/cabling €10,000/unit. Replacement module only = €36,260/unit.", logisticsCost: 0, installCommissioning: 0, moduleCost: 36260, controllerCost: 8695, siteCommissioningCost: 900, unitInstallCost: 10000 },
  { item: "Autel 3x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 375, energyKwh: 783, hardwareCost: 117475, installComm: 900, warrantyYrs: 5, notes: "Battery module €36,260/unit; one controller €8,695/site; commissioning €900/site; unit install/cabling €10,000/unit. Replacement module only = €36,260/unit.", logisticsCost: 0, installCommissioning: 0, moduleCost: 36260, controllerCost: 8695, siteCommissioningCost: 900, unitInstallCost: 10000 },
  { item: "Autel 4x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 500, energyKwh: 1044, hardwareCost: 153735, installComm: 900, warrantyYrs: 5, notes: "Battery module €36,260/unit; one controller €8,695/site; commissioning €900/site; unit install/cabling €10,000/unit. Replacement module only = €36,260/unit.", logisticsCost: 0, installCommissioning: 0, moduleCost: 36260, controllerCost: 8695, siteCommissioningCost: 900, unitInstallCost: 10000 },
  { item: "Autel 5x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 625, energyKwh: 1305, hardwareCost: 189995, installComm: 900, warrantyYrs: 5, notes: "Battery module €36,260/unit; one controller €8,695/site; commissioning €900/site; unit install/cabling €10,000/unit. Replacement module only = €36,260/unit.", logisticsCost: 0, installCommissioning: 0, moduleCost: 36260, controllerCost: 8695, siteCommissioningCost: 900, unitInstallCost: 10000 },
  { item: "Autel 6x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 750, energyKwh: 1566, hardwareCost: 226255, installComm: 900, warrantyYrs: 5, notes: "Battery module €36,260/unit; one controller €8,695/site; commissioning €900/site; unit install/cabling €10,000/unit. Replacement module only = €36,260/unit.", logisticsCost: 0, installCommissioning: 0, moduleCost: 36260, controllerCost: 8695, siteCommissioningCost: 900, unitInstallCost: 10000 },
  { item: "Autel 7x125kW/261kWh", compatiblePlatform: "Autel", powerKw: 875, energyKwh: 1827, hardwareCost: 262515, installComm: 900, warrantyYrs: 5, notes: "Battery module €36,260/unit; one controller €8,695/site; commissioning €900/site; unit install/cabling €10,000/unit. Replacement module only = €36,260/unit.", logisticsCost: 0, installCommissioning: 0, moduleCost: 36260, controllerCost: 8695, siteCommissioningCost: 900, unitInstallCost: 10000 },
  { item: "Polarium S-150kVA/280kWh", compatiblePlatform: "Kempower", powerKw: 150, energyKwh: 280, hardwareCost: 63730, installComm: 9980, warrantyYrs: 5, notes: "Replacement hw only = €63,730; initial install one-off = €9,980", logisticsCost: 1140, installCommissioning: 6754 },
  { item: "Polarium M-300kVA/560kWh", compatiblePlatform: "Kempower", powerKw: 300, energyKwh: 560, hardwareCost: 102730, installComm: 9980, warrantyYrs: 5, notes: "Replacement hw only = €102,730; initial install one-off = €9,980", logisticsCost: 1837, installCommissioning: 10887 },
  { item: "Polarium L-600kVA/1120kWh (No skid)", compatiblePlatform: "Kempower", powerKw: 600, energyKwh: 1120, hardwareCost: 191820, installComm: 9980, warrantyYrs: 5, notes: "Replacement hw only = €191,820; initial install one-off = €9,980", logisticsCost: 3431, installCommissioning: 20328 },
  { item: "Polarium L-600kVA/1120kWh (With skid)", compatiblePlatform: "Kempower", powerKw: 600, energyKwh: 1120, hardwareCost: 223640, installComm: 9980, warrantyYrs: 5, notes: "Replacement hw only = €223,640; initial install one-off = €9,980", logisticsCost: 4000, installCommissioning: 23700 }
];

export function batteryItem(name) {
  return BATTERY_LIBRARY.find(x => x.item === name) || BATTERY_LIBRARY[0];
}

export function batteryOptionsFor(platform, batteryStrategy = "Grid + battery") {
  if (batteryStrategy === "Grid only") return [BATTERY_LIBRARY[0]];
  if (!platform) return BATTERY_LIBRARY;
  if (platform.includes("Kempower")) return BATTERY_LIBRARY.filter(x => x.compatiblePlatform === "Kempower");
  if (platform.includes("Autel")) return BATTERY_LIBRARY.filter(x => x.compatiblePlatform === "Autel");
  return BATTERY_LIBRARY;
}

export function batteryUnitCount(battery = {}) {
  const item = String(battery.item || "");
  const selectedPowerKw = Number(battery.powerKw || 0);
  if (!selectedPowerKw || item.includes("No battery")) return 0;
  const unitPowerKw = item.includes("Polarium") ? 150 : 125;
  return Math.max(1, Math.round(selectedPowerKw / unitPowerKw));
}

export function batteryDeploymentCostProfile(battery = {}) {
  const unitsMax = batteryUnitCount(battery);
  if (!unitsMax) {
    return {
      unitsMax: 0,
      firstUnitDeploymentCapex: 0,
      additionalUnitDeploymentCapex: 0,
      unitReplacementCapex: 0,
      totalDeploymentCapexExcludingCivils: 0,
      unitInstallCost: 0,
      moduleCost: 0,
      controllerCost: 0,
      siteCommissioningCost: 0
    };
  }

  if (String(battery.item || "").includes("Autel")) {
    const moduleCost = Number(battery.moduleCost ?? 36260);
    const controllerCost = Number(battery.controllerCost ?? 8695);
    const siteCommissioningCost = Number(battery.siteCommissioningCost ?? battery.installComm ?? 900);
    const unitInstallCost = Number(battery.unitInstallCost ?? 10000);
    const firstUnitDeploymentCapex = moduleCost + controllerCost + siteCommissioningCost + unitInstallCost;
    const additionalUnitDeploymentCapex = moduleCost + unitInstallCost;
    return {
      unitsMax,
      firstUnitDeploymentCapex,
      additionalUnitDeploymentCapex,
      unitReplacementCapex: moduleCost,
      totalDeploymentCapexExcludingCivils: firstUnitDeploymentCapex + Math.max(0, unitsMax - 1) * additionalUnitDeploymentCapex,
      unitInstallCost,
      moduleCost,
      controllerCost,
      siteCommissioningCost
    };
  }

  const totalDeploymentCapexExcludingCivils = Number(battery.hardwareCost || 0)
    + Number(battery.installComm || 0)
    + Number(battery.logisticsCost || 0)
    + Number(battery.installCommissioning || 0);
  const unitDeploymentCapex = totalDeploymentCapexExcludingCivils / unitsMax;
  return {
    unitsMax,
    firstUnitDeploymentCapex: unitDeploymentCapex,
    additionalUnitDeploymentCapex: unitDeploymentCapex,
    unitReplacementCapex: Number(battery.hardwareCost || 0) / unitsMax,
    totalDeploymentCapexExcludingCivils,
    unitInstallCost: 0,
    moduleCost: Number(battery.hardwareCost || 0) / unitsMax,
    controllerCost: 0,
    siteCommissioningCost: Number(battery.installComm || 0) / unitsMax
  };
}

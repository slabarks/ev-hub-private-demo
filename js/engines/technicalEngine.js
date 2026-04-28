import { platformItem, dispenserNameForPlatform } from "../data/platformLibrary.js";
import { batteryItem } from "../data/batteryLibrary.js";
import { GRID_SUBSTATION, approximateLvConnectionCost, substationMultiplier } from "../data/gridSubstation.js";
import { asNum } from "../utils.js";

export function validateConfiguration(config) {
  const reasons = [];
  if (!["Autel Standalone", "Autel Distributed", "Kempower Distributed"].includes(config.platform)) {
    reasons.push("Invalid platform");
  }
  if (config.batteryStrategy === "Grid only" && config.batterySize !== "No battery") {
    reasons.push("Grid-only scenario must use No battery");
  }
  if (config.batteryStrategy !== "Grid only" && config.batterySize === "No battery") {
    reasons.push("Battery scenario must select a battery");
  }
  if (config.platform === "Autel Standalone") {
    if (config.cabinetType !== "N/A" && config.cabinetType) reasons.push("Standalone platform cannot use a distributed cabinet");
    if (config.dispenserCount !== "N/A" && asNum(config.dispenserCount, 0) > 0) reasons.push("Standalone platform cannot use dispenser count");
    if (!platformItem(config.chargerModel)) reasons.push("Standalone platform requires a valid charger model");
  }
  if (config.platform.includes("Distributed")) {
    if (config.chargerModel !== "N/A" && config.chargerModel) reasons.push("Distributed platform does not use standalone charger model");
    if (config.chargerCount !== "N/A" && asNum(config.chargerCount, 0) > 0) reasons.push("Distributed platform does not use standalone charger count");
    const cab = platformItem(config.cabinetType);
    if (!cab || cab.type !== "Cabinet") reasons.push("Distributed platform requires a cabinet");
    if (cab && cab.platform !== config.platform) reasons.push("Cabinet is not compatible with selected platform");
    if (cab && asNum(config.dispenserCount, 0) > cab.maxDualDisp) reasons.push("Cabinet max satellites/dispensers exceeded");
  }
  const batt = batteryItem(config.batterySize);
  if (batt.item !== "No battery") {
    if (config.platform.includes("Kempower") && batt.compatiblePlatform !== "Kempower") reasons.push("Battery is not compatible with Kempower");
    if (config.platform.includes("Autel") && batt.compatiblePlatform !== "Autel") reasons.push("Battery is not compatible with Autel");
  }
  return { valid: reasons.length === 0, reasons };
}

export function deriveConfiguration(config, inputs) {
  const charger = platformItem(config.chargerModel);
  const cabinet = platformItem(config.cabinetType);
  const battery = batteryItem(config.batterySize);
  const dispenser = platformItem(dispenserNameForPlatform(config.platform));
  const chargerCount = asNum(config.chargerCount, 1);
  const dispenserCount = asNum(config.dispenserCount, 0);

  const installedChargerPowerKw = config.platform === "Autel Standalone"
    ? (charger ? charger.powerKw : 0) * chargerCount
    : Math.min(cabinet ? cabinet.powerKw : 0, dispenserCount * 400);

  const installedOutputs = config.platform === "Autel Standalone"
    ? (charger ? charger.outputs : 0) * chargerCount
    : dispenserCount * 2;

  const batteryPowerKw = battery.powerKw || 0;
  const batteryEnergyKwh = battery.energyKwh || 0;
  const totalAvailableSitePowerKw = config.selectedMicKva * inputs.powerFactor + batteryPowerKw;

  const chargerSlaPpmCost = config.platform === "Kempower Distributed"
    ? dispenserCount * 360
    : config.platform === "Autel Standalone"
      ? chargerCount * ((config.chargerModel || "").includes("DC Compact")
          ? (config.serviceLevel === "Basic" ? 540 : config.serviceLevel === "Advance" ? 663 : 751)
          : (config.serviceLevel === "Basic" ? 1536 : config.serviceLevel === "Advance" ? 920 : 1706))
      : (config.serviceLevel === "Basic"
          ? 1152 + dispenserCount * 508
          : config.serviceLevel === "Advance"
            ? 691 + dispenserCount * 0
            : 1281 + dispenserCount * 628);

  const managedService = (config.platform === "Autel Standalone" ? chargerCount : dispenserCount) * inputs.managedServiceFeePerChargerAsset;
  const batteryAnnualService = config.batteryStrategy === "Grid only"
    ? 0
    : battery.item.includes("Autel")
      ? 2987 + installedOutputs * 72
      : battery.item.includes("Polarium")
        ? 1706
        : 0;

  const groundRent = Math.round(installedOutputs / 2) * inputs.groundRentPerEvSpace;

  const chargerHardwareCostForWarranty = config.platform === "Autel Standalone"
    ? (charger ? charger.unitCost : 0) * chargerCount
    : (cabinet ? cabinet.unitCost : 0) + dispenserCount * (dispenser ? dispenser.unitCost : 0);
  const chargerWarrantyRate = config.platform.includes("Kempower") ? inputs.kempowerChargerWarrantyAnnualRate : inputs.autelChargerWarrantyAnnualRate;
  const annualChargerWarrantyCost = config.chargerWarrantyYears === 0 ? 0 : chargerHardwareCostForWarranty * chargerWarrantyRate;

  const annualBatteryWarrantyCost = (config.batteryWarrantyYears === 0 || config.batteryStrategy === "Grid only")
    ? 0
    : battery.hardwareCost * (battery.item.includes("Autel") ? inputs.autelBatteryWarrantyAnnualRate : battery.item.includes("Polarium") ? inputs.polariumBatteryWarrantyAnnualRate : 0);

  const initialInvestmentCapex = initialCapex(config, inputs);

  return {
    charger,
    cabinet,
    battery,
    dispenser,
    chargerCount,
    dispenserCount,
    installedChargerPowerKw,
    installedOutputs,
    batteryPowerKw,
    batteryEnergyKwh,
    totalAvailableSitePowerKw,
    chargerSlaPpmCost,
    managedService,
    batteryAnnualService,
    groundRent,
    annualChargerWarrantyCost,
    annualBatteryWarrantyCost,
    initialInvestmentCapex,
    substationRequired: config.selectedMicKva > inputs.gridThresholdModeling,
    batteryReplacementUnitCapex: battery.hardwareCost || 0,
    chargerReplacementCapex: chargerReplacementCapex(config)
  };
}

export function initialCapex(config, inputs) {
  const charger = platformItem(config.chargerModel);
  const cabinet = platformItem(config.cabinetType);
  const battery = batteryItem(config.batterySize);
  const dispenser = platformItem(dispenserNameForPlatform(config.platform));
  const chargerCount = asNum(config.chargerCount, 1);
  const dispenserCount = asNum(config.dispenserCount, 0);

  const cabinetHw = cabinet ? cabinet.unitCost : 0;
  const dispenserHw = dispenserCount * (dispenser ? dispenser.unitCost : 0);
  const standaloneHw = config.platform === "Autel Standalone" ? (charger ? charger.unitCost : 0) * chargerCount : 0;
  const batteryHw = battery.hardwareCost || 0;
  const batteryInstall = battery.installComm || 0;

  const install = config.platform === "Kempower Distributed"
    ? GRID_SUBSTATION.kempowerCivilsInstallBenchmark
    : config.platform === "Autel Standalone"
      ? GRID_SUBSTATION.siteCivilsBase + chargerCount * GRID_SUBSTATION.standaloneChargerInstallAllowance
      : GRID_SUBSTATION.siteCivilsBase + GRID_SUBSTATION.distributedCabinetInstallAllowance + dispenserCount * GRID_SUBSTATION.distributedDispenserInstallAllowance;

  const gridConnection = config.selectedMicKva <= GRID_SUBSTATION.gridThresholdKva
    ? approximateLvConnectionCost(config.selectedMicKva)
    : GRID_SUBSTATION.higherCapacityMvConnectionCostBenchmark;

  const mult = substationMultiplier(config.selectedMicKva);
  const substation = config.selectedMicKva > GRID_SUBSTATION.gridThresholdKva
    ? mult * GRID_SUBSTATION.substation1MvaCost + GRID_SUBSTATION.earthStudy + GRID_SUBSTATION.foundationBase + GRID_SUBSTATION.earthingSystem
    : 0;

  const batteryLogistics = battery.logisticsCost || 0;
  const batteryInstallCommissioning = battery.installCommissioning || 0;
  const commissioning = config.platform === "Autel Standalone"
    ? (charger ? charger.commissioning || 0 : 0) * chargerCount
    : (cabinet ? cabinet.commissioning || 0 : 0);

  return cabinetHw + dispenserHw + standaloneHw + batteryHw + batteryInstall + install + gridConnection + substation + inputs.esbConnectionApplicationFee + batteryLogistics + batteryInstallCommissioning + commissioning;
}

export function chargerReplacementCapex(config) {
  const charger = platformItem(config.chargerModel);
  const cabinet = platformItem(config.cabinetType);
  const dispenser = platformItem(dispenserNameForPlatform(config.platform));
  const chargerCount = asNum(config.chargerCount, 1);
  const dispenserCount = asNum(config.dispenserCount, 0);
  const cabinetHw = cabinet ? cabinet.unitCost : 0;
  const dispenserHw = dispenserCount * (dispenser ? dispenser.unitCost : 0);
  const standaloneHw = config.platform === "Autel Standalone" ? (charger ? charger.unitCost : 0) * chargerCount : 0;
  return cabinetHw + dispenserHw + standaloneHw;
}

export function technicalChecks(config, inputs, demand) {
  const validity = validateConfiguration(config);
  const derived = deriveConfiguration(config, inputs);
  const peakWindowHours = Number(inputs.peakWindowEndHour ?? inputs.peakWindowHours ?? 5) || 5;
  const rows = demand.years.map((y, idx) => {
    const powerCoverageRatio = Math.min(1, Math.min(derived.installedChargerPowerKw, derived.totalAvailableSitePowerKw) / Math.max(1, y.peakDemandRequiredKw));
    const batteryPowerRequiredKw = Math.max(0, y.peakDemandRequiredKw - config.selectedMicKva * inputs.powerFactor);
    const batteryEnergyRequiredKwh = Math.max(0, y.peakWindowKwh - config.selectedMicKva * inputs.powerFactor * peakWindowHours);
    const micHeadroomKva = config.selectedMicKva - y.requiredMicNoBatteryKva;
    return {
      year: y.year,
      powerCoverageRatio,
      batteryPowerRequiredKw,
      batteryEnergyRequiredKwh,
      micHeadroomKva,
      plugHeadroom: derived.installedOutputs - y.peakConcurrentSessions
    };
  });
  const failures = [];
  if (!validity.valid) failures.push(...validity.reasons);
  if (derived.installedChargerPowerKw < demand.maxPeakDemandKw) failures.push("Charger output constrained");
  if (derived.installedOutputs < demand.maxConcurrentSessions) failures.push("Plug constrained");
  const maxResidualPower = Math.max(...demand.years.map(y => Math.max(0, y.peakDemandRequiredKw - config.selectedMicKva * inputs.powerFactor)));
  const maxResidualEnergy = Math.max(...demand.years.map(y => Math.max(0, y.peakWindowKwh - config.selectedMicKva * inputs.powerFactor * peakWindowHours)));
  if (config.batteryStrategy === "Grid only") {
    if (config.selectedMicKva < demand.maxRequiredMicNoBatteryKva) failures.push("MIC constrained");
  } else {
    if (derived.totalAvailableSitePowerKw < demand.maxPeakDemandKw) failures.push("Power constrained");
    if (derived.batteryPowerKw < maxResidualPower) failures.push("Battery power constrained");
    if (derived.batteryEnergyKwh < maxResidualEnergy) failures.push("Battery energy constrained");
    const overnightRechargeAvailable = config.selectedMicKva * inputs.powerFactor * inputs.overnightRechargeWindowDuration;
    if (overnightRechargeAvailable < Math.min(maxResidualEnergy, derived.batteryEnergyKwh || maxResidualEnergy)) failures.push("Overnight recharge constrained");
  }

  return {
    valid: validity.valid,
    feasible: failures.length === 0,
    failures,
    derived,
    rows
  };
}

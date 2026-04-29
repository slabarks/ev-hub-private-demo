// Hidden civils & electrical costing engine.
// Reference anchor provided by user quote:
// Kempower distributed, single power cabinet, 2 dual dispensers, no battery = €43,420.20.
// Large battery/skid uplift is derived from the existing larger reference benchmark.

const SMALL_KEMPOWER_REFERENCE_TOTAL = 43420.20;
const LARGE_KEMPOWER_REFERENCE_TOTAL = 102117;

const KEMPOWER_BASE = {
  prelimsFixed: 3125,
  civilFixedBase: 4950,
  civilPerDualDispenser: 1500,
  electricalFixedPerSite: 12200,
  electricalPerPowerCabinet: 10260,
  electricalPerDualDispenserBase: 1250,
  electricalPerDualDispenserPerMetre: 184.63,
  defaultDispenserCableRunM: 20
};

function cabinetPowerUnitCount(cabinetName = "") {
  const name = String(cabinetName).toLowerCase();
  if (name.includes("triple")) return 3;
  if (name.includes("double")) return 2;
  if (name.includes("single")) return 1;
  return 1;
}

function kempowerNoBatteryCivilsElectrical(powerCabinetCount, dispenserCount, runMetres = KEMPOWER_BASE.defaultDispenserCableRunM) {
  const perDispenserElectrical = KEMPOWER_BASE.electricalPerDualDispenserBase + KEMPOWER_BASE.electricalPerDualDispenserPerMetre * runMetres;
  return KEMPOWER_BASE.prelimsFixed
    + KEMPOWER_BASE.civilFixedBase
    + KEMPOWER_BASE.civilPerDualDispenser * dispenserCount
    + KEMPOWER_BASE.electricalFixedPerSite
    + KEMPOWER_BASE.electricalPerPowerCabinet * powerCabinetCount
    + perDispenserElectrical * dispenserCount;
}

const largeNoBatteryReference = kempowerNoBatteryCivilsElectrical(2, 4);
const derivedLargeBatterySkidAllowance = Math.max(0, LARGE_KEMPOWER_REFERENCE_TOTAL - largeNoBatteryReference);

function batteryIntegrationAllowance(platform, batteryName = "", powerKw = 0, energyKwh = 0) {
  const name = String(batteryName || "").toLowerCase();
  if (!batteryName || name.includes("no battery") || powerKw <= 0) return 0;

  if (platform.includes("Kempower")) {
    if (name.includes("with skid")) return derivedLargeBatterySkidAllowance;
    if (name.includes("600") || energyKwh >= 1000) return Math.round(derivedLargeBatterySkidAllowance * 0.75);
    if (name.includes("300") || energyKwh >= 500) return 22000;
    return 12000;
  }

  if (platform.includes("Autel")) {
    const modules = Math.max(1, Math.ceil(powerKw / 125));
    return Math.min(48900, 9000 + modules * 5200);
  }

  return 0;
}

function micGridElectricalUplift(micKva = 0) {
  // This is hidden model scaling only. ESB connection/substation costs remain separate.
  if (micKva <= 200) return 0;
  if (micKva <= 400) return 5000;
  if (micKva <= 800) return 9000;
  if (micKva <= 1000) return 12000;
  return 16000;
}

export function deriveCivilElectricalCost(config, inputs, derived = {}) {
  const platform = config.platform || "";
  const mic = Number(config.selectedMicKva || 0);
  const dispenserCount = Number(derived.dispenserCount ?? config.dispenserCount ?? 0) || 0;
  const chargerCount = Number(derived.chargerCount ?? config.chargerCount ?? 0) || 0;
  const battery = derived.battery || {};
  const batteryName = config.batterySize || battery.item || "No battery";
  const gridUplift = micGridElectricalUplift(mic);

  if (platform === "Kempower Distributed") {
    const powerCabinetCount = cabinetPowerUnitCount(config.cabinetType);
    const noBattery = kempowerNoBatteryCivilsElectrical(powerCabinetCount, dispenserCount);
    const batteryIntegration = batteryIntegrationAllowance(platform, batteryName, battery.powerKw || 0, battery.energyKwh || 0);
    return Math.round(noBattery + batteryIntegration + gridUplift);
  }

  if (platform === "Autel Distributed") {
    const powerCabinetCount = cabinetPowerUnitCount(config.cabinetType);
    const kempowerEquivalent = kempowerNoBatteryCivilsElectrical(powerCabinetCount, dispenserCount);
    const architectureFactor = 0.94;
    const batteryIntegration = batteryIntegrationAllowance(platform, batteryName, battery.powerKw || 0, battery.energyKwh || 0);
    return Math.round(kempowerEquivalent * architectureFactor + batteryIntegration + gridUplift);
  }

  if (platform === "Autel Standalone") {
    const plugs = Math.max(0, chargerCount * 2);
    const prelims = KEMPOWER_BASE.prelimsFixed;
    const fixedSiteElectrical = KEMPOWER_BASE.electricalFixedPerSite;
    const civilPerStandaloneCharger = 2200;
    const electricalPerStandaloneCharger = 5600;
    const wheelStops = plugs * 125;
    const batteryIntegration = batteryIntegrationAllowance(platform, batteryName, battery.powerKw || 0, battery.energyKwh || 0);
    return Math.round(prelims + fixedSiteElectrical + chargerCount * (civilPerStandaloneCharger + electricalPerStandaloneCharger) + wheelStops + batteryIntegration + gridUplift);
  }

  return SMALL_KEMPOWER_REFERENCE_TOTAL;
}

export const CIVILS_ELECTRICAL_REFERENCE = {
  smallKempowerReferenceTotal: SMALL_KEMPOWER_REFERENCE_TOTAL,
  largeKempowerReferenceTotal: LARGE_KEMPOWER_REFERENCE_TOTAL,
  largeBatterySkidAllowance: Math.round(derivedLargeBatterySkidAllowance),
  notes: "Hidden model allocation derived from user-provided contractor reference and existing large Kempower/Polarium reference. Not shown as a detailed UI breakdown."
};

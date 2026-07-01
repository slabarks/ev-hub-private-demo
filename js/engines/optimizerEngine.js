import { EXCEL_SIX_SCENARIOS } from "../data/scenarioLibrary.js";
import { MIC_VALUES } from "../data/defaultAssumptions.js";
import { calculateYearByYear, summariseFinancials } from "./financialEngine.js";
import { technicalChecks, validateConfiguration } from "./technicalEngine.js";
import { batteryItem, batteryOptionsFor } from "../data/batteryLibrary.js";
import { cabinetOptions, standaloneChargerOptions, effectiveCabinetMaxDualDisp } from "../data/platformLibrary.js";

const SAFE_NEGATIVE_METRIC = -999999999;
const SAFE_POSITIVE_METRIC = 999999999;

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeMetric(value, fallback = 0) {
  return finiteNumber(value, fallback);
}

function safeScenarioMetrics(s) {
  return {
    ...s,
    totalCapex: safeMetric(s.totalCapex, 0),
    totalOpex: safeMetric(s.totalOpex, 0),
    totalCostToServeDemand: safeMetric(s.totalCostToServeDemand, SAFE_POSITIVE_METRIC),
    cumulativeCashFlow: safeMetric(s.cumulativeCashFlow, SAFE_NEGATIVE_METRIC),
    roi: Number.isFinite(Number(s.roi)) ? Number(s.roi) : null,
    npv: safeMetric(s.npv, SAFE_NEGATIVE_METRIC),
    irr: Number.isFinite(Number(s.irr)) ? Number(s.irr) : null,
    servedDemandPercentage: safeMetric(s.servedDemandPercentage, 0),
    lostDemand: safeMetric(s.lostDemand, 0),
    lostRevenue: safeMetric(s.lostRevenue, 0)
  };
}

function statusFromTechnical(technical) {
  if (!technical.valid) return "invalid combination";
  if (technical.feasible) return "feasible";
  const first = technical.failures[0] || "technically infeasible";
  if (first.includes("Plug")) return "plug constrained";
  if (first.includes("Charger output")) return "charger output constrained";
  if (first.includes("MIC")) return "MIC constrained";
  if (first.includes("Battery power")) return "battery power constrained";
  if (first.includes("Battery energy")) return "battery energy constrained";
  if (first.includes("Overnight")) return "overnight recharge constrained";
  if (first.includes("Power")) return "power constrained";
  return first;
}

function withBase(config, overrides = {}) {
  return { ...config, ...overrides, chargerWarrantyYears: 0, batteryWarrantyYears: 0 };
}

function batteryEnvelopeUnitCount(config = {}) {
  const name = String(config.batterySize || "");
  if (!name || name === "No battery") return 0;
  const explicit = name.match(/(\d+)x/);
  if (explicit) return Number(explicit[1]) || 0;
  if (name.includes("Polarium S-")) return 1;
  if (name.includes("Polarium M-")) return 2;
  if (name.includes("Polarium L-")) return 4;
  return 0;
}

function maxResidualBatteryDuty(inputs, demand, micKva) {
  const peakWindowHours = Number(inputs.peakWindowEndHour ?? inputs.peakWindowHours ?? 5) || 5;
  const usableGridKw = Number(micKva || 0) * Number(inputs.powerFactor || 1);
  const rows = Array.isArray(demand?.years) ? demand.years : [];
  const residualPowerKw = Math.max(0, ...rows.map(y => Math.max(0, Number(y.peakDemandRequiredKw || 0) - usableGridKw)));
  const residualEnergyKwh = Math.max(0, ...rows.map(y => Math.max(0, Number(y.peakWindowKwh || 0) - usableGridKw * peakWindowHours)));
  const overnightRechargeAvailableKwh = usableGridKw * Number(inputs.overnightRechargeWindowDuration || 0);
  return { residualPowerKw, residualEnergyKwh, overnightRechargeAvailableKwh };
}

function minimumBatteryForDuty(platform, batteryStrategy, batteryList, inputs, demand, micKva) {
  if (batteryStrategy === "Grid only") return "No battery";
  const options = batteryList
    .map(name => batteryItem(name))
    .filter(b => b && b.item && b.item !== "No battery")
    .sort((a, b) => {
      const unitDiff = batteryEnvelopeUnitCount({ batterySize: a.item }) - batteryEnvelopeUnitCount({ batterySize: b.item });
      if (unitDiff !== 0) return unitDiff;
      const powerDiff = Number(a.powerKw || 0) - Number(b.powerKw || 0);
      if (Math.abs(powerDiff) > 1e-9) return powerDiff;
      return Number(a.energyKwh || 0) - Number(b.energyKwh || 0);
    });
  if (!options.length) return "No battery";
  const duty = maxResidualBatteryDuty(inputs, demand, micKva);
  const requiredPower = Math.max(0, duty.residualPowerKw);
  const requiredEnergy = Math.max(0, duty.residualEnergyKwh);
  const rightSized = options.find(b => {
    const powerOk = Number(b.powerKw || 0) + 1e-9 >= requiredPower;
    const energyOk = Number(b.energyKwh || 0) + 1e-9 >= requiredEnergy;
    const rechargeOk = duty.overnightRechargeAvailableKwh + 1e-9 >= Math.min(requiredEnergy, Number(b.energyKwh || 0) || requiredEnergy);
    return powerOk && energyOk && rechargeOk;
  });
  return (rightSized || options[options.length - 1]).item;
}

function rightSizeKey(config = {}) {
  return [
    config.platform,
    config.batteryStrategy,
    config.selectedMicKva,
    config.chargerModel,
    config.chargerCount,
    config.cabinetType,
    config.kempowerTripleCabinetCount,
    config.dispenserCount,
    config.serviceLevel
  ].map(v => String(v ?? "")).join("|");
}

function rightSizeFeasibleCandidates(feasible = []) {
  // Scenario Ranking must not recommend a larger selected battery envelope when a smaller
  // battery envelope is technically feasible for the same MIC and charger/plug layout.
  // This is intentionally stricter than ROI sorting: for the same hardware/MIC layout,
  // the selected battery must be the minimum technically feasible envelope. Otherwise,
  // staged-envelope lifecycle logic can allow an oversized future battery envelope to
  // look better than the right-sized option.
  const bestByHardware = new Map();
  for (const candidate of feasible) {
    const key = rightSizeKey(candidate.config);
    const existing = bestByHardware.get(key);
    if (!existing) {
      bestByHardware.set(key, candidate);
      continue;
    }
    const candidateUnits = batteryEnvelopeUnitCount(candidate.config);
    const existingUnits = batteryEnvelopeUnitCount(existing.config);
    if (candidateUnits < existingUnits) {
      bestByHardware.set(key, {
        ...candidate,
        rightSizingNote: `Battery envelope right-sized from ${existing.config.batterySize} to ${candidate.config.batterySize} for the same MIC and charger layout.`
      });
      continue;
    }
    if (candidateUnits > existingUnits) continue;
    const candidateServed = finiteNumber(candidate.servedDemandPercentage, 0);
    const existingServed = finiteNumber(existing.servedDemandPercentage, 0);
    if (candidateServed > existingServed + 0.001) {
      bestByHardware.set(key, candidate);
      continue;
    }
    if (Math.abs(candidateServed - existingServed) <= 0.001) {
      const roiDiff = finiteNumber(candidate.roi, SAFE_NEGATIVE_METRIC) - finiteNumber(existing.roi, SAFE_NEGATIVE_METRIC);
      if (roiDiff > 1e-9) bestByHardware.set(key, candidate);
    }
  }
  return [...bestByHardware.values()];
}

function hardwareVariants(base, demand) {
  const requiredOutputs = Math.max(1, Math.ceil(Number(demand.maxConcurrentSessions) || 1));
  if (base.platform === "Autel Standalone") {
    const variants = [];
    const chargers = standaloneChargerOptions().sort((a, b) => a.powerKw - b.powerKw);
    chargers.forEach(charger => {
      const outputsPerCharger = charger.outputs || 2;
      const minCount = Math.max(1, Math.ceil(requiredOutputs / outputsPerCharger));
      for (let count = minCount; count <= 10; count += 1) {
        variants.push(withBase(base, {
          chargerModel: charger.item,
          chargerCount: count,
          cabinetType: "N/A",
          dispenserCount: "N/A",
          kempowerTripleCabinetCount: "N/A",
          autoSizedOutputs: requiredOutputs,
          autoSized: count !== Number(base.chargerCount) || charger.item !== base.chargerModel
        }));
      }
    });
    return variants;
  }
  if (base.platform && base.platform.includes("Distributed")) {
    const variants = [];
    cabinetOptions(base.platform).sort((a, b) => (a.powerKw || 0) - (b.powerKw || 0)).forEach(cab => {
      const minDisp = Math.max(1, Math.ceil(requiredOutputs / 2));
      const cabinetCounts = base.platform === "Kempower Distributed" && cab.item === "Kempower Triple Cabinet" ? [1, 2] : ["N/A"];
      cabinetCounts.forEach(count => {
        const configForLimit = { ...base, cabinetType: cab.item, kempowerTripleCabinetCount: count };
        const maxDual = effectiveCabinetMaxDualDisp(configForLimit, cab) || minDisp;
        for (let disp = minDisp; disp <= maxDual; disp += 1) {
          variants.push(withBase(base, {
            chargerModel: "N/A",
            chargerCount: "N/A",
            cabinetType: cab.item,
            kempowerTripleCabinetCount: count,
            dispenserCount: disp,
            autoSizedOutputs: requiredOutputs,
            autoSized: disp !== Number(base.dispenserCount) || cab.item !== base.cabinetType || String(count) !== String(base.kempowerTripleCabinetCount || "N/A")
          }));
        }
      });
    });
    return variants;
  }
  return [withBase(base)];
}

function candidateConfigs(family, inputs, demand) {
  const hardware = hardwareVariants(family, demand);
  const batteryList = family.batteryStrategy === "Grid only"
    ? ["No battery"]
    : batteryOptionsFor(family.platform, family.batteryStrategy).map(b => b.item);
  const configs = [];
  for (const hw of hardware) {
    for (const mic of MIC_VALUES) {
      const batterySize = minimumBatteryForDuty(family.platform, family.batteryStrategy, batteryList, inputs, demand, mic);
      configs.push(withBase(hw, {
        selectedMicKva: mic,
        batterySize,
        batteryRightSized: family.batteryStrategy !== "Grid only",
        batteryRightSizeBasis: family.batteryStrategy !== "Grid only"
          ? "Minimum battery envelope required for peak residual kW, peak-window kWh and overnight recharge at this MIC."
          : "Grid-only case"
      }));
    }
  }
  return configs;
}

function evaluateConfig(id, family, config, inputs, demand, horizon) {
  const yearByYear = calculateYearByYear(inputs, config, demand);
  const financial = summariseFinancials(inputs, config, demand, yearByYear, horizon);
  const technical = technicalChecks(config, inputs, demand);
  return safeScenarioMetrics({
    id,
    familyName: family.name,
    name: family.name,
    rank: null,
    roiRank: null,
    config,
    derived: yearByYear.derived,
    technical,
    financial,
    validityStatus: validateConfiguration(config).valid ? "valid" : "invalid",
    feasibilityStatus: technical.feasible ? "feasible" : "infeasible",
    scenarioStatus: statusFromTechnical(technical),
    totalCapex: financial.totalCapex,
    totalOpex: financial.totalOpex,
    totalCostToServeDemand: financial.totalCostToServeDemand,
    cumulativeCashFlow: financial.cumulativeCashFlow,
    roi: financial.roi,
    breakEvenYear: financial.breakEvenYear,
    npv: financial.npv,
    irr: financial.irr,
    servedDemandPercentage: financial.servedDemandPercentage,
    lostDemand: financial.lostDemandKwh,
    lostRevenue: financial.lostRevenue,
    firstBatteryReplacementYear: financial.firstBatteryReplacementYear,
    batteryReplacementCount: financial.batteryReplacementCount,
    chargerReplacementCount: financial.chargerReplacementCount,
    batteryUnitsSelected: batteryEnvelopeUnitCount(config),
    micHeadroomDeficit: config.selectedMicKva - demand.maxRequiredMicNoBatteryKva,
    batteryPowerHeadroomDeficit: yearByYear.derived.batteryPowerKw - Math.max(...demand.years.map(y => Math.max(0, y.peakDemandRequiredKw - config.selectedMicKva * inputs.powerFactor))),
    batteryEnergyHeadroomDeficit: yearByYear.derived.batteryEnergyKwh - Math.max(...demand.years.map(y => Math.max(0, y.peakWindowKwh - config.selectedMicKva * inputs.powerFactor * 5))),
    overnightRechargeFeasibility: (config.batterySize === "No battery") ? "N/A — no battery" : (config.selectedMicKva * inputs.powerFactor * inputs.overnightRechargeWindowDuration >= yearByYear.derived.batteryEnergyKwh * inputs.batteryDispatchFractionUsable ? "PASS" : "CHECK"),
    failureReason: technical.failures.join("; ")
  });
}

function infeasibleScore(s) {
  const failures = s.technical.failures.length;
  const powerDeficit = Math.max(0, Math.max(0, s.financial?.demandPeakKw || 0) - (s.derived?.totalAvailableSitePowerKw || 0));
  const outputDeficit = Math.max(0, (s.financial?.demandPeakKw || 0) - (s.derived?.installedChargerPowerKw || 0));
  return failures * 1000000 + outputDeficit * 1000 + powerDeficit * 100 + finiteNumber(s.totalCostToServeDemand, SAFE_POSITIVE_METRIC) / 1000000;
}

function noCandidateScenario(family, idx, inputs, demand, horizon) {
  const maxMic = MIC_VALUES[MIC_VALUES.length - 1];
  const maxBattery = family.batteryStrategy === "Grid only"
    ? "No battery"
    : (batteryOptionsFor(family.platform, family.batteryStrategy).at(-1)?.item || "No battery");
  const config = withBase(family, {
    selectedMicKva: maxMic,
    batterySize: maxBattery,
    chargerModel: family.platform === "Autel Standalone" ? "No available charger count in library" : "N/A",
    chargerCount: family.platform === "Autel Standalone" ? 0 : "N/A",
    cabinetType: family.platform && family.platform.includes("Distributed") ? "No available cabinet/dispenser count in library" : "N/A",
    dispenserCount: family.platform && family.platform.includes("Distributed") ? 0 : "N/A",
    kempowerTripleCabinetCount: "N/A"
  });
  const requiredPlugs = Math.ceil(Number(demand.maxConcurrentSessions) || 0);
  const failure = `No equipment-library hardware candidate can cover the required ${requiredPlugs} simultaneous plug(s).`;
  const technical = {
    valid: false,
    feasible: false,
    failures: [failure],
    derived: {
      installedOutputs: 0,
      installedChargerPowerKw: 0,
      totalAvailableSitePowerKw: maxMic * (inputs.powerFactor || 1),
      batteryPowerKw: 0,
      batteryEnergyKwh: 0
    }
  };
  return {
    id: `${idx + 1}.0`,
    familyName: family.name,
    name: family.name,
    rank: null,
    roiRank: null,
    config,
    derived: technical.derived,
    technical,
    financial: {},
    validityStatus: "invalid",
    feasibilityStatus: "infeasible",
    scenarioStatus: "equipment library exceeded",
    totalCapex: 0,
    totalOpex: 0,
    totalCostToServeDemand: SAFE_POSITIVE_METRIC,
    cumulativeCashFlow: SAFE_NEGATIVE_METRIC,
    roi: null,
    breakEvenYear: null,
    npv: SAFE_NEGATIVE_METRIC,
    irr: null,
    servedDemandPercentage: 0,
    lostDemand: 0,
    lostRevenue: 0,
    firstBatteryReplacementYear: null,
    batteryReplacementCount: 0,
    chargerReplacementCount: 0,
    micHeadroomDeficit: maxMic - (demand.maxRequiredMicNoBatteryKva || 0),
    batteryPowerHeadroomDeficit: 0,
    batteryEnergyHeadroomDeficit: 0,
    overnightRechargeFeasibility: "N/A — no candidate hardware",
    failureReason: failure,
    candidatesTested: 0,
    suggestedFix: "Demand exceeds the current equipment library. Add a larger charger/cabinet option, allow more dispensers/chargers, increase site count, or reduce demand assumptions."
  };
}

function pickBestForFamily(family, idx, inputs, demand, horizon) {
  const rawCandidates = candidateConfigs(family, inputs, demand);
  if (!rawCandidates.length) return noCandidateScenario(family, idx, inputs, demand, horizon);
  const candidates = rawCandidates.map((config, i) => evaluateConfig(`${idx + 1}.${i + 1}`, family, config, inputs, demand, horizon));
  const feasible = candidates.filter(c => c.technical.feasible);
  if (feasible.length) {
    const rightSizedFeasible = rightSizeFeasibleCandidates(feasible);
    rightSizedFeasible.sort((a, b) => {
      const roiDiff = finiteNumber(b.roi, SAFE_NEGATIVE_METRIC) - finiteNumber(a.roi, SAFE_NEGATIVE_METRIC);
      if (Math.abs(roiDiff) > 1e-9) return roiDiff;
      const costDiff = finiteNumber(a.totalCostToServeDemand, SAFE_POSITIVE_METRIC) - finiteNumber(b.totalCostToServeDemand, SAFE_POSITIVE_METRIC);
      if (Math.abs(costDiff) > 1e-6) return costDiff;
      const batteryDiff = batteryEnvelopeUnitCount(a.config) - batteryEnvelopeUnitCount(b.config);
      if (batteryDiff !== 0) return batteryDiff;
      return a.config.selectedMicKva - b.config.selectedMicKva;
    });
    return { ...rightSizedFeasible[0], candidatesTested: candidates.length, rightSizedCandidatesConsidered: rightSizedFeasible.length };
  }
  candidates.sort((a, b) => infeasibleScore(a) - infeasibleScore(b));
  return { ...candidates[0], candidatesTested: candidates.length };
}

function commonIssue(scenarios) {
  const counts = new Map();
  scenarios.forEach(s => (s.technical.failures || []).forEach(f => counts.set(f, (counts.get(f) || 0) + 1)));
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || "Technical feasibility";
}

export function suggestedFixForScenario(s, demand, inputs) {
  const failures = s.technical?.failures || [];
  if (s.scenarioStatus === "equipment library exceeded" || failures.some(f => String(f).includes("No equipment-library"))) {
    return s.suggestedFix || "Demand exceeds the current equipment library. Add a larger charger/cabinet option, allow more dispensers/chargers, increase site count, or reduce demand assumptions.";
  }
  const d = s.derived || s.technical?.derived || {};
  const requiredPlugs = Math.ceil(demand.maxConcurrentSessions || 0);
  const plugDeficit = Math.max(0, requiredPlugs - (d.installedOutputs || 0));
  const peakKw = demand.maxPeakDemandKw || 0;
  const outputDeficit = Math.max(0, peakKw - (d.installedChargerPowerKw || 0));
  const powerDeficit = Math.max(0, peakKw - (d.totalAvailableSitePowerKw || 0));
  const micNeeded = MIC_VALUES.find(v => v >= demand.maxRequiredMicNoBatteryKva) || MIC_VALUES[MIC_VALUES.length - 1];
  if (failures.some(f => f.includes("Plug"))) return `Add ${Math.ceil(plugDeficit / 2)} dual charger/dispenser(s) to reach ${requiredPlugs} plugs`;
  if (failures.some(f => f.includes("Charger output"))) return `Add at least ${Math.ceil(outputDeficit)} kW charger output or select a higher-power platform`;
  if (failures.some(f => f.includes("MIC"))) return `Increase MIC to ${micNeeded} kVA or add battery support`;
  if (failures.some(f => f.includes("Battery power") || f.includes("Power"))) return `Add at least ${Math.ceil(powerDeficit)} kW battery inverter support or increase MIC`;
  if (failures.some(f => f.includes("Battery energy"))) return `Select a larger battery or reduce peak-window energy duty`;
  if (failures.some(f => f.includes("Overnight"))) return `Increase MIC or reduce residual battery duty for overnight recharge`;
  return "Review product configuration and demand assumptions";
}

export function compareExcelScenarios(inputs, demand, horizon) {
  const familyResults = EXCEL_SIX_SCENARIOS.map((family, idx) => pickBestForFamily(family, idx, inputs, demand, horizon));
  const feasible = familyResults.filter(s => s.technical.feasible);
  const infeasible = familyResults.filter(s => !s.technical.feasible);
  feasible.sort((a, b) => (b.roi ?? -999) - (a.roi ?? -999));
  infeasible.sort((a, b) => infeasibleScore(a) - infeasibleScore(b));
  feasible.forEach((s, i) => { s.rank = i + 1; s.roiRank = i + 1; });
  infeasible.forEach((s, i) => { s.rank = feasible.length + i + 1; s.roiRank = feasible.length + i + 1; });
  const scenarios = [...feasible, ...infeasible].map((s, i) => ({ ...s, id: `S${i + 1}`, suggestedFix: suggestedFixForScenario(s, demand, inputs) }));
  const recommended = feasible[0] || null;
  return {
    totalCombinationsGenerated: familyResults.length,
    totalCandidateConfigurationsGenerated: familyResults.reduce((a, s) => a + (s.candidatesTested || 1), 0),
    invalidCombinationsRemoved: 0,
    technicallyInfeasibleCombinations: infeasible.length,
    technicallyFeasibleCombinations: feasible.length,
    scenarios,
    recommended,
    commonIssue: commonIssue(infeasible),
    explanation: recommended ? recommendationExplanation(recommended, scenarios, horizon) : "No technically feasible configuration was found within the current equipment library."
  };
}

function recommendationExplanation(rec, scenarios, horizon) {
  const infeasibleCount = scenarios.filter(s => !s.technical.feasible).length;
  const note = infeasibleCount ? ` ${infeasibleCount} scenario family/families are shown below as infeasible and are not eligible for recommendation.` : "";
  return `${rec.name} is the highest-ROI technically feasible option over the selected ${horizon}-year horizon. Feasible scenarios are ranked before infeasible scenarios; ROI is used only within the feasible group. It uses ${rec.config.selectedMicKva} kVA MIC and serves ${(rec.servedDemandPercentage * 100).toFixed(1)}% of the modelled demand.${note}`;
}

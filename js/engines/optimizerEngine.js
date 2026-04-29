import { EXCEL_SIX_SCENARIOS } from "../data/scenarioLibrary.js";
import { MIC_VALUES } from "../data/defaultAssumptions.js";
import { calculateYearByYear, summariseFinancials } from "./financialEngine.js";
import { technicalChecks, validateConfiguration } from "./technicalEngine.js";
import { batteryOptionsFor } from "../data/batteryLibrary.js";
import { cabinetOptions, standaloneChargerOptions } from "../data/platformLibrary.js";

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
      for (let disp = minDisp; disp <= (cab.maxDualDisp || minDisp); disp += 1) {
        variants.push(withBase(base, {
          chargerModel: "N/A",
          chargerCount: "N/A",
          cabinetType: cab.item,
          dispenserCount: disp,
          autoSizedOutputs: requiredOutputs,
          autoSized: disp !== Number(base.dispenserCount) || cab.item !== base.cabinetType
        }));
      }
    });
    return variants;
  }
  return [withBase(base)];
}

function candidateConfigs(family, demand) {
  const hardware = hardwareVariants(family, demand);
  const batteryList = family.batteryStrategy === "Grid only"
    ? ["No battery"]
    : batteryOptionsFor(family.platform, family.batteryStrategy).map(b => b.item);
  const configs = [];
  for (const hw of hardware) {
    for (const mic of MIC_VALUES) {
      for (const batterySize of batteryList) {
        configs.push(withBase(hw, { selectedMicKva: mic, batterySize }));
      }
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
    dispenserCount: family.platform && family.platform.includes("Distributed") ? 0 : "N/A"
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
  const rawCandidates = candidateConfigs(family, demand);
  if (!rawCandidates.length) return noCandidateScenario(family, idx, inputs, demand, horizon);
  const candidates = rawCandidates.map((config, i) => evaluateConfig(`${idx + 1}.${i + 1}`, family, config, inputs, demand, horizon));
  const feasible = candidates.filter(c => c.technical.feasible);
  if (feasible.length) {
    feasible.sort((a, b) => {
      const roiDiff = finiteNumber(b.roi, SAFE_NEGATIVE_METRIC) - finiteNumber(a.roi, SAFE_NEGATIVE_METRIC);
      if (Math.abs(roiDiff) > 1e-9) return roiDiff;
      const costDiff = finiteNumber(a.totalCostToServeDemand, SAFE_POSITIVE_METRIC) - finiteNumber(b.totalCostToServeDemand, SAFE_POSITIVE_METRIC);
      if (Math.abs(costDiff) > 1e-6) return costDiff;
      return a.config.selectedMicKva - b.config.selectedMicKva;
    });
    return { ...feasible[0], candidatesTested: candidates.length };
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

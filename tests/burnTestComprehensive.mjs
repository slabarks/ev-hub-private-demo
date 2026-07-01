// Comprehensive burn test: exhaustively exercises the demand, technical, financial
// and export engines across every valid configuration combination, plus edge-case
// inputs, and reports any crash, NaN/Infinity, or sanity-check violation found.

import { calculateDemand } from "../js/engines/demandEngine.js";
import { calculateYearByYear } from "../js/engines/financialEngine.js";
import { deriveConfiguration, validateConfiguration, technicalChecks, initialCapexDetail } from "../js/engines/technicalEngine.js";
import { suggestedFixForScenario, compareExcelScenarios } from "../js/engines/optimizerEngine.js";
import { DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, MIC_VALUES } from "../js/data/defaultAssumptions.js";
import { PLATFORM_LIBRARY, cabinetOptions, standaloneChargerOptions, dispenserNameForPlatform } from "../js/data/platformLibrary.js";
import { BATTERY_LIBRARY, batteryOptionsFor } from "../js/data/batteryLibrary.js";

let totalRuns = 0;
let failures = [];
let warnings = [];

function checkFinite(obj, path, ctx) {
  for (const [k, v] of Object.entries(obj)) {
    const p = `${path}.${k}`;
    if (typeof v === "number") {
      if (Number.isNaN(v)) failures.push(`${ctx}: NaN at ${p}`);
      else if (!Number.isFinite(v)) failures.push(`${ctx}: Infinity at ${p}`);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      checkFinite(v, p, ctx);
    }
  }
}

function buildConfigs() {
  const configs = [];

  // Standalone configs: every charger model x every MIC value x every battery (n/a, since standalone has no battery in this lib? check compatibility) x grid-only
  for (const charger of standaloneChargerOptions()) {
    for (const mic of MIC_VALUES) {
      configs.push({
        platform: "Autel Standalone",
        batteryStrategy: "Grid only",
        chargerModel: charger.item,
        chargerCount: 1,
        cabinetType: "N/A",
        dispenserCount: "N/A",
        batterySize: "No battery",
        serviceLevel: "Premium",
        selectedMicKva: mic,
        chargerWarrantyYears: 0,
        batteryWarrantyYears: 0
      });
      // also test multiple chargerCount values
      configs.push({
        platform: "Autel Standalone",
        batteryStrategy: "Grid only",
        chargerModel: charger.item,
        chargerCount: 4,
        cabinetType: "N/A",
        dispenserCount: "N/A",
        batterySize: "No battery",
        serviceLevel: "Premium",
        selectedMicKva: mic,
        chargerWarrantyYears: 0,
        batteryWarrantyYears: 0
      });
    }
  }

  // Distributed configs (Autel + Kempower): every cabinet x every compatible battery (incl No battery) x every MIC x both strategies
  for (const platform of ["Autel Distributed", "Kempower Distributed"]) {
    for (const cabinet of cabinetOptions(platform)) {
      const batteries = batteryOptionsFor(platform, "Grid + battery");
      for (const battery of batteries) {
        for (const mic of MIC_VALUES) {
          const strategy = battery.item === "No battery" ? "Grid only" : "Grid + battery";
          configs.push({
            platform,
            batteryStrategy: strategy,
            chargerModel: "N/A",
            chargerCount: "N/A",
            cabinetType: cabinet.item,
            dispenserCount: 6,
            batterySize: battery.item,
            serviceLevel: "Premium",
            selectedMicKva: mic,
            chargerWarrantyYears: 0,
            batteryWarrantyYears: 5
          });
        }
      }
      // also test dispenserCount edge cases: 0, 1, max
      for (const dCount of [0, 1, cabinet.maxDualDisp || 1]) {
        configs.push({
          platform,
          batteryStrategy: "Grid only",
          chargerModel: "N/A",
          chargerCount: "N/A",
          cabinetType: cabinet.item,
          dispenserCount: dCount,
          batterySize: "No battery",
          serviceLevel: "Premium",
          selectedMicKva: 200,
          chargerWarrantyYears: 0,
          batteryWarrantyYears: 0
        });
      }
    }
  }

  return configs;
}

function buildInputVariants() {
  const base = DEFAULT_INPUTS;
  const variants = [
    { label: "default", inputs: base },
    { label: "zero AADT", inputs: { ...base, rawCorridorTrafficAadt: 0 } },
    { label: "huge AADT", inputs: { ...base, rawCorridorTrafficAadt: 250000 } },
    { label: "zero traffic growth", inputs: { ...base, annualTrafficGrowthRate: 0 } },
    { label: "negative-ish low site relevance", inputs: { ...base, siteRelevanceFactor: 0.0001 } },
    { label: "siteRelevanceFactor = 1 (max)", inputs: { ...base, siteRelevanceFactor: 1 } },
    { label: "bevShareCap very low", inputs: { ...base, bevShareCap: 0.001 } },
    { label: "bevShareCap = 1", inputs: { ...base, bevShareCap: 1 } },
    { label: "zero grant + electricity cost 0", inputs: { ...base, grantSupport: 0, electricityCost: 0 } },
    { label: "huge grant (exceeds capex)", inputs: { ...base, grantSupport: 5000000 } },
    { label: "modelHorizon edge (still 20y in engine)", inputs: { ...base, modelHorizon: 1 } },
    { label: "designPeakFloorSessions 0", inputs: { ...base, designPeakFloorSessions: 0 } },
    { label: "effectiveAadtCap set below raw AADT", inputs: { ...base, effectiveAadtCap: 5000 } },
    { label: "discountRate high (10%)", inputs: { ...base, discountRate: 0.10 } },
    { label: "annualBevShareGrowthRate 0", inputs: { ...base, annualBevShareGrowthRate: 0 } },
    { label: "fastChargePropensity 0", inputs: { ...base, fastChargePropensity: 0 } },
    { label: "siteCaptureRate 1 (max)", inputs: { ...base, siteCaptureRate: 1 } },
    { label: "trafficSourceYear far future (negative growth period)", inputs: { ...base, trafficSourceYear: 2040 } },
  { label: "town_hub_forecourt category factors", inputs: { ...base, benchmarkProfile: "town_hub_forecourt", siteCaptureRate: 0.18, siteRelevanceFactor: 0.28 } },
    { label: "peakWindowShare 0", inputs: { ...base, peakWindowShare: 0 } },
    { label: "averageSessionEnergy tiny", inputs: { ...base, averageSessionEnergy: 0.001 } }
  ];
  return variants;
}

const configs = buildConfigs();
const inputVariants = buildInputVariants();

console.log(`Generated ${configs.length} configs x ${inputVariants.length} input variants = up to ${configs.length * inputVariants.length} combinations.`);
console.log(`Running default-input sweep across all ${configs.length} configs, plus full input-variant sweep on default config...\n`);

// Pass 1: every config, with default inputs
for (const config of configs) {
  totalRuns += 1;
  const ctx = `Config#${totalRuns} [${config.platform}/${config.batteryStrategy}/${config.cabinetType || config.chargerModel}/${config.batterySize}/MIC${config.selectedMicKva}/disp${config.dispenserCount}/cc${config.chargerCount}]`;
  try {
    const validity = validateConfiguration(config);
    const demand = calculateDemand(DEFAULT_INPUTS);
    checkFinite(demand, "demand", ctx);
    const derived = deriveConfiguration(config, DEFAULT_INPUTS);
    checkFinite(derived, "derived", ctx);
    const checks = technicalChecks(config, DEFAULT_INPUTS, demand);
    const capexDetail = initialCapexDetail(config, DEFAULT_INPUTS);
    checkFinite(capexDetail, "capexDetail", ctx);
    const fin = calculateYearByYear(DEFAULT_INPUTS, config, demand);
    fin.rows.forEach((r, i) => checkFinite(r, `row${i}`, ctx));
    checkFinite({ irr: fin.summary?.irr ?? 0 }, "summary", ctx);

    // Sanity checks
    if (fin.rows.some(r => r.totalRevenue < 0)) warnings.push(`${ctx}: negative totalRevenue in some year`);
    if (fin.rows.some(r => r.sessionsServed < 0)) failures.push(`${ctx}: negative sessionsServed`);
    if (fin.rows.some(r => r.servedDemandCoverageRatio > 1.0001)) failures.push(`${ctx}: servedDemandCoverageRatio > 1`);
    if (fin.rows.some(r => r.servedDemandCoverageRatio < -0.0001)) failures.push(`${ctx}: servedDemandCoverageRatio < 0`);
    if (capexDetail.total < 0) failures.push(`${ctx}: negative total capex`);
    if (!validity.valid && validity.reasons.length === 0) failures.push(`${ctx}: invalid configuration with no reasons given`);
  } catch (e) {
    failures.push(`${ctx}: THREW ${e.constructor.name}: ${e.message}`);
  }
}

console.log(`Pass 1 complete: ${totalRuns} configuration combinations run against default inputs.\n`);

// Pass 2: default config across every input edge-case variant
let pass2Runs = 0;
for (const variant of inputVariants) {
  pass2Runs += 1;
  totalRuns += 1;
  const ctx = `InputVariant#${pass2Runs} [${variant.label}]`;
  try {
    const demand = calculateDemand(variant.inputs);
    checkFinite(demand, "demand", ctx);
    const fin = calculateYearByYear(variant.inputs, DEFAULT_SELECTED_CONFIG, demand);
    fin.rows.forEach((r, i) => checkFinite(r, `row${i}`, ctx));
    if (fin.rows.some(r => r.sessionsServed < 0)) failures.push(`${ctx}: negative sessionsServed`);
    if (fin.rows.some(r => r.servedDemandCoverageRatio > 1.0001)) failures.push(`${ctx}: servedDemandCoverageRatio > 1`);
    if (fin.rows.some(r => r.totalOperatingCosts < 0)) warnings.push(`${ctx}: negative totalOperatingCosts`);
  } catch (e) {
    failures.push(`${ctx}: THREW ${e.constructor.name}: ${e.message}`);
  }
}

console.log(`Pass 2 complete: ${pass2Runs} input-edge-case variants run against default config.\n`);

// Pass 3: real Scenario Ranking engine (compareExcelScenarios), across every input variant and a range of horizons
let pass3Runs = 0;
for (const variant of inputVariants) {
  for (const horizon of [5, 10, 20]) {
    pass3Runs += 1;
    totalRuns += 1;
    const ctx = `ScenarioRanking#${pass3Runs} [${variant.label}, horizon=${horizon}]`;
    try {
      const demand = calculateDemand(variant.inputs);
      const result = compareExcelScenarios(variant.inputs, demand, horizon);
      checkFinite({ totalCombinationsGenerated: result.totalCombinationsGenerated, technicallyFeasibleCombinations: result.technicallyFeasibleCombinations }, "summary", ctx);
      result.scenarios.forEach((s, i) => {
        if (typeof s.roi === "number") checkFinite({ roi: s.roi }, `scenario[${i}]`, ctx);
        if (typeof s.servedDemandPercentage === "number") {
          if (s.servedDemandPercentage > 1.0001 || s.servedDemandPercentage < -0.0001) {
            failures.push(`${ctx}: scenario[${i}] servedDemandPercentage out of [0,1] range: ${s.servedDemandPercentage}`);
          }
        }
        if (!s.id) failures.push(`${ctx}: scenario[${i}] missing id`);
      });
      if (result.recommended && !result.scenarios.find(s => s === result.recommended || s.id === result.recommended.id)) {
        warnings.push(`${ctx}: recommended scenario not present in scenarios list (reference check, may be by-design clone)`);
      }
      if (result.technicallyFeasibleCombinations === 0 && !result.explanation) {
        failures.push(`${ctx}: zero feasible combinations but no explanation given`);
      }
    } catch (e) {
      failures.push(`${ctx}: THREW ${e.constructor.name}: ${e.message}`);
    }
  }
}
console.log(`Pass 3 complete: ${pass3Runs} Scenario Ranking runs across input variants x horizons.\n`);

console.log("=".repeat(70));
console.log(`BURN TEST SUMMARY`);
console.log("=".repeat(70));
console.log(`Total scenario runs: ${totalRuns}`);
console.log(`Failures: ${failures.length}`);
console.log(`Warnings: ${warnings.length}`);
console.log("");

if (failures.length) {
  console.log("--- FAILURES ---");
  failures.forEach(f => console.log("  FAIL: " + f));
} else {
  console.log("No failures found.");
}

console.log("");
if (warnings.length) {
  console.log("--- WARNINGS (non-fatal, worth reviewing) ---");
  warnings.slice(0, 30).forEach(w => console.log("  WARN: " + w));
  if (warnings.length > 30) console.log(`  ... and ${warnings.length - 30} more warnings`);
} else {
  console.log("No warnings.");
}

// Pass 4: Static checks on new category definitions
const pass4_checks = [
  // town_hub_forecourt must exist in DEMAND_PROFILE_ORDER — checked via compareExcelScenarios accepting town_hub_forecourt profile key
  { label: "town_hub_forecourt input variant runs without NaN", fn: () => {
    const d = calculateDemand({ ...DEFAULT_INPUTS, benchmarkProfile: "town_hub_forecourt", siteCaptureRate: 0.18, siteRelevanceFactor: 0.28 });
    const bad = d.years.some(y => !Number.isFinite(y.annualEnergyDemandedKwh));
    if (bad) failures.push("town_hub_forecourt demand has NaN");
    const fin = calculateYearByYear({ ...DEFAULT_INPUTS, benchmarkProfile: "town_hub_forecourt", siteCaptureRate: 0.18, siteRelevanceFactor: 0.28 }, DEFAULT_SELECTED_CONFIG, d);
    const badFin = fin.rows.some(r => !Number.isFinite(r.totalRevenue));
    if (badFin) failures.push("town_hub_forecourt financial has NaN");
  }},
  { label: "recommended === scenarios[0] after compareExcelScenarios", fn: () => {
    const d = calculateDemand(DEFAULT_INPUTS);
    const result = compareExcelScenarios(DEFAULT_INPUTS, d, 20);
    if (result.recommended !== result.scenarios[0]) failures.push("recommended !== scenarios[0] — regression reintroduced");
    if (!result.recommended.id) failures.push("recommended.id missing");
    if (!result.recommended.suggestedFix) failures.push("recommended.suggestedFix missing");
  }},
];
let pass4Runs = 0;
for (const check of pass4_checks) {
  pass4Runs += 1;
  totalRuns += 1;
  try { check.fn(); } catch(e) { failures.push(`Pass4 ${check.label}: THREW ${e.constructor.name}: ${e.message}`); }
}
console.log(`Pass 4 complete: ${pass4Runs} static category and regression checks.\n`);

process.exitCode = failures.length ? 1 : 0;

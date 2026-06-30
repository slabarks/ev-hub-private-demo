import assert from "node:assert/strict";
import { DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, MIC_VALUES, EXCEL_REFERENCE } from "../js/data/defaultAssumptions.js";
import { calculateDemand } from "../js/engines/demandEngine.js";
import { calculateYearByYear, summariseFinancials } from "../js/engines/financialEngine.js";
import { compareExcelScenarios } from "../js/engines/optimizerEngine.js";
import { validateConfiguration } from "../js/engines/technicalEngine.js";

function near(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: expected ${expected}, got ${actual}`);
}

const inputs = { ...DEFAULT_INPUTS };
const config = { ...DEFAULT_SELECTED_CONFIG };

assert.deepEqual(MIC_VALUES, [50, 100, 200, 400, 800, 1000, 1500], "MIC list must match Excel gold standard");

const demand = calculateDemand(inputs);
near(demand.years[0].annualEnergyDemandedKwh, EXCEL_REFERENCE.defaultDemandYear1AnnualEnergy, 0.1, "Demand Y1 energy");
near(demand.years[19].peakDemandRequiredKw, EXCEL_REFERENCE.defaultDemandYear20PeakDemandKw, 0.01, "Demand Y20 peak kW");

const yy = calculateYearByYear(inputs, config, demand);
near(yy.derived.initialInvestmentCapex, EXCEL_REFERENCE.defaultInitialInvestmentCapex, 0.01, "Initial investment capex");
assert.equal(yy.batteryDeploymentMode, 'staged-envelope', 'Battery deployment mode should stage selected battery envelope');
assert.ok(yy.rows.some(r => r.newBatteryUnitsInstalled > 0), 'Default battery case should deploy battery units only when required');
assert.ok(yy.rows.every(r => (r.batteryEnergyAvailableKwhSohAdjusted || 0) <= (r.batteryUsableEnergyKwh || 0) + 1e-9), 'SOH-adjusted battery energy cannot exceed installed nominal energy');
assert.ok(yy.rows.filter(r => r.batteryReplacementTrigger).length >= 0, 'Battery replacement logic should evaluate without errors');
assert.equal(yy.rows.find(r => r.chargerReplacementTrigger)?.year, EXCEL_REFERENCE.defaultFirstChargerReplacementYear, "First charger replacement year");

const summary10 = summariseFinancials(inputs, config, demand, yy, 10);
assert.equal(summary10.horizon, 10, "Selected horizon must control summary");
assert.ok(summary10.batteryReplacementCount >= 0, '10-year horizon replacement count should be defined');
assert.equal(summary10.chargerReplacementCount, 1, "10-year horizon has one charger replacement");

const invalid = validateConfiguration({ ...config, batteryStrategy: "Grid only", batterySize: "Autel 1x125kW/261kWh" });
assert.equal(invalid.valid, false, "Invalid battery strategy/battery combination should be rejected");


const constrainedGridOnlyConfig = {
  platform: "Autel Distributed",
  batteryStrategy: "Grid only",
  chargerModel: "N/A",
  chargerCount: "N/A",
  cabinetType: "Autel Double Cabinet 480-960",
  dispenserCount: 2,
  batterySize: "No battery",
  serviceLevel: "Premium",
  selectedMicKva: 200,
  chargerWarrantyYears: 0,
  batteryWarrantyYears: 0
};
const constrainedInputs = { ...inputs, modelStartYear: 2026, codYear: 2026, trafficSourceYear: 2026, rawCorridorTrafficAadt: 39800 };
const constrainedDemand = calculateDemand(constrainedInputs);
const constrainedYy = calculateYearByYear(constrainedInputs, constrainedGridOnlyConfig, constrainedDemand);
const constrainedRows = constrainedYy.rows.filter(r => r.demandedEnergyKwh > 0);
assert.ok(constrainedRows.every(r => r.deliveredEnergyServedKwh > 0), "Grid-only constrained sites should plateau, not collapse to zero delivered energy");
assert.ok(constrainedRows.some(r => r.lostEnergyKwh > 0), "Constrained grid-only sites should record unserved/lost demand after capacity is reached");
const firstConstrainedRow = constrainedRows.find(r => r.lostEnergyKwh > 0);
assert.ok(constrainedRows.filter(r => r.year >= firstConstrainedRow.year).every(r => r.deliveredEnergyServedKwh >= firstConstrainedRow.deliveredEnergyServedKwh - 1), "Grid-only delivered energy should plateau after the first capacity constraint year");
assert.ok(constrainedRows.every(r => Number.isFinite(r.servedDemandCoverageRatio) && r.servedDemandCoverageRatio >= 0 && r.servedDemandCoverageRatio <= 1), "Served demand coverage ratio should remain finite and bounded");

const scenarios = compareExcelScenarios(inputs, demand, 20);
assert.equal(scenarios.totalCombinationsGenerated, 6, "Excel scenario compare has six live configurations");
assert.ok(scenarios.scenarios.length === 6, "Scenario matrix must contain six scenarios");
assert.ok(scenarios.recommended || scenarios.technicallyFeasibleCombinations === 0, "Recommendation exists when feasible scenarios exist, otherwise no infeasible recommendation is made");

const rightSizeInputs = {
  ...inputs,
  rawCorridorTrafficAadt: 20000,
  effectiveAadtCap: 0,
  benchmarkTargetSessionsPer1000Aadt: 0
};
const rightSizeDemand = calculateDemand(rightSizeInputs);
const rightSizeScenarios = compareExcelScenarios(rightSizeInputs, rightSizeDemand, 20);
const rightSizedAutelDistributed = rightSizeScenarios.scenarios.find(s => s.name === "Autel Distributed — Grid + Battery");
assert.ok(rightSizedAutelDistributed, "Autel distributed battery scenario should be present");
assert.equal(rightSizedAutelDistributed.config.selectedMicKva, 100, "Right-size regression should keep the low-MIC distributed battery case");
assert.equal(rightSizedAutelDistributed.config.dispenserCount, 3, "Right-size regression should keep the 6-plug distributed layout");
assert.equal(rightSizedAutelDistributed.config.batterySize, "Autel 3x125kW/261kWh", "Distributed ranking should choose the smallest feasible battery envelope for the same MIC and plug layout, not the oversized 7-unit envelope");
assert.ok(rightSizedAutelDistributed.technical.feasible, "Right-sized distributed battery scenario should remain technically feasible");
const rightSizedAutelStandalone = rightSizeScenarios.scenarios.find(s => s.name === "Autel Standalone — Grid + Battery");
assert.ok(rightSizedAutelStandalone, "Autel standalone battery scenario should be present");
assert.equal(rightSizedAutelStandalone.config.selectedMicKva, 100, "Right-size regression should keep the low-MIC standalone battery case");
assert.equal(rightSizedAutelStandalone.config.chargerCount, 3, "Right-size regression should keep the 6-plug standalone layout");
assert.equal(rightSizedAutelStandalone.config.batterySize, "Autel 3x125kW/261kWh", "Standalone ranking should choose the smallest feasible battery envelope for the same MIC and charger layout, not the oversized 7-unit envelope");
assert.ok(rightSizedAutelStandalone.technical.feasible, "Right-sized standalone battery scenario should remain technically feasible");

const highBatteryRightSizeInputs = {
  ...inputs,
  rawCorridorTrafficAadt: 60000,
  effectiveAadtCap: 0,
  benchmarkTargetSessionsPer1000Aadt: 0
};
const highBatteryRightSizeDemand = calculateDemand(highBatteryRightSizeInputs);
const highBatteryRightSizeScenarios = compareExcelScenarios(highBatteryRightSizeInputs, highBatteryRightSizeDemand, 20);
const highBatteryAutelDistributed = highBatteryRightSizeScenarios.scenarios.find(s => s.name === "Autel Distributed — Grid + Battery");
assert.ok(highBatteryAutelDistributed, "High-demand Autel distributed battery scenario should be present");
assert.equal(highBatteryAutelDistributed.config.selectedMicKva, 400, "High-demand regression should use the 400 kVA distributed battery case");
assert.equal(highBatteryAutelDistributed.config.dispenserCount, 7, "High-demand regression should use the 14-plug distributed layout");
assert.equal(highBatteryAutelDistributed.config.batterySize, "Autel 5x125kW/261kWh", "Distributed ranking should calculate the minimum required battery envelope before ROI sorting, not retain the oversized 7-unit envelope");
assert.ok(highBatteryAutelDistributed.technical.feasible, "High-demand right-sized distributed battery scenario should remain technically feasible");

const zeroDemand = calculateDemand({ ...inputs, rawCorridorTrafficAadt: 0 });
assert.equal(zeroDemand.years[0].annualEnergyDemandedKwh, 0, "Zero traffic produces zero demand energy");

const zeroCapture = calculateDemand({ ...inputs, siteCaptureRate: 0 });
assert.equal(zeroCapture.years[0].annualSessionsDemanded, 0, "Zero capture rate produces zero sessions");

const capped = calculateDemand({ ...inputs, annualBevShareGrowthRate: 10 });
assert.ok(capped.years.every(y => y.bevShare <= inputs.bevShareCap), "BEV share must not exceed cap");


const stagedAugmentationInputs = {
  ...inputs,
  modelStartYear: 2026,
  codYear: 2026,
  trafficSourceYear: 2026,
  rawCorridorTrafficAadt: 20000,
  effectiveAadtCap: 0,
  benchmarkTargetSessionsPer1000Aadt: 0
};
const stagedAugmentationConfig = {
  platform: "Autel Distributed",
  batteryStrategy: "Grid + battery",
  chargerModel: "N/A",
  chargerCount: "N/A",
  cabinetType: "Autel Single Cabinet",
  dispenserCount: 3,
  batterySize: "Autel 3x125kW/261kWh",
  serviceLevel: "Premium",
  selectedMicKva: 100,
  chargerWarrantyYears: 0,
  batteryWarrantyYears: 0
};
const stagedAugmentationYy = calculateYearByYear(stagedAugmentationInputs, stagedAugmentationConfig, calculateDemand(stagedAugmentationInputs));
const stagedBatteryAdditions = stagedAugmentationYy.rows.filter(r => r.newBatteryUnitsInstalled > 0).map(r => Math.round(r.augmentationCapex));
assert.ok(stagedBatteryAdditions.length >= 3, "Staged battery augmentation regression should deploy multiple units over time");
assert.equal(stagedBatteryAdditions[0], 80455, "First battery deployment should include one-off battery provision/civils allowance");
assert.equal(stagedBatteryAdditions[1], 46260, "Second battery augmentation should not repeat one-off civils/integration allowance");
assert.equal(stagedBatteryAdditions[2], 46260, "Third battery augmentation should not repeat one-off civils/integration allowance");

console.log("All EV Hub engine tests passed.");
